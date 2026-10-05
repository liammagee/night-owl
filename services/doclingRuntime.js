'use strict';

const { execFile: defaultExecFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROBE_ARGS = ['-c', 'import docling; print(getattr(docling, "__version__", "installed"))'];

function firstLine(value) {
  return String(value || '').split(/\r?\n/, 1)[0].trim().slice(0, 160);
}

function runtimePaths(userDataPath, platform = process.platform) {
  if (!userDataPath) throw new Error('A user data path is required for the Docling runtime.');
  const runtimeDir = path.join(userDataPath, 'runtimes', 'docling');
  const venvDir = path.join(runtimeDir, 'venv');
  return {
    runtimeDir,
    venvDir,
    pythonPath: platform === 'win32'
      ? path.join(venvDir, 'Scripts', 'python.exe')
      : path.join(venvDir, 'bin', 'python'),
    cacheDir: path.join(runtimeDir, 'cache')
  };
}

function systemPythonCandidates(options = {}) {
  const candidates = [];
  if (options.env?.NIGHTOWL_DOCLING_PYTHON) candidates.push(options.env.NIGHTOWL_DOCLING_PYTHON);
  if (options.platform === 'win32') {
    candidates.push('py', 'python');
  } else {
    candidates.push('/opt/homebrew/bin/python3', '/usr/local/bin/python3', 'python3', 'python');
  }
  return [...new Set(candidates.filter(Boolean))];
}

function run(command, args, options = {}) {
  const execFile = options.execFile || defaultExecFile;
  return new Promise(resolve => {
    execFile(command, args, {
      timeout: options.timeout || 10000,
      maxBuffer: options.maxBuffer || 512 * 1024,
      windowsHide: true,
      env: options.env || process.env
    }, (error, stdout, stderr) => resolve({ error, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
}

async function probePython(command, options = {}) {
  const result = await run(command, PROBE_ARGS, options);
  if (result.error) {
    return { available: false, reason: result.error.code === 'ENOENT' ? 'not-found' : 'probe-failed' };
  }
  return { available: true, version: firstLine(result.stdout || result.stderr) || 'installed' };
}

async function findDoclingRuntime(options = {}) {
  const env = options.env || process.env;
  const paths = runtimePaths(options.userDataPath, options.platform || process.platform);
  const candidates = [
    { command: paths.pythonPath, source: 'managed' },
    ...systemPythonCandidates({ env, platform: options.platform || process.platform })
      .map(command => ({ command, source: command === env.NIGHTOWL_DOCLING_PYTHON ? 'configured' : 'system' }))
  ];

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate.command) && !fs.existsSync(candidate.command)) continue;
    const result = await probePython(candidate.command, { ...options, env });
    if (result.available) return { ...result, ...candidate, paths };
  }
  return { available: false, reason: 'not-found', paths };
}

async function findBasePython(options = {}) {
  const env = options.env || process.env;
  const candidates = systemPythonCandidates({ env, platform: options.platform || process.platform });
  for (const command of candidates) {
    if (path.isAbsolute(command) && !fs.existsSync(command)) continue;
    const result = await run(command, ['-c', 'import sys; print(sys.version.split()[0])'], options);
    if (!result.error) return command;
  }
  return null;
}

async function installDoclingRuntime(options = {}) {
  const paths = runtimePaths(options.userDataPath, options.platform || process.platform);
  const basePython = await findBasePython(options);
  if (!basePython) {
    throw new Error('Python 3 is required before NightOwl can install Docling.');
  }
  await fs.promises.mkdir(paths.runtimeDir, { recursive: true });
  const create = await run(basePython, ['-m', 'venv', paths.venvDir], {
    ...options,
    timeout: options.installTimeout || 5 * 60 * 1000,
    maxBuffer: 4 * 1024 * 1024
  });
  if (create.error) throw new Error(`Could not create the managed Docling environment: ${firstLine(create.stderr || create.error.message)}`);

  const install = await run(paths.pythonPath, [
    '-m', 'pip', 'install', '--disable-pip-version-check', '--upgrade', 'docling'
  ], {
    ...options,
    timeout: options.installTimeout || 20 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024
  });
  if (install.error) throw new Error(`Docling installation failed: ${firstLine(install.stderr || install.error.message)}`);

  const result = await probePython(paths.pythonPath, options);
  if (!result.available) throw new Error('Docling was installed but could not be loaded.');
  return { success: true, available: true, version: result.version, source: 'managed' };
}

function resolveConverterScript(options = {}) {
  const candidates = [
    options.scriptPath,
    options.resourcesPath && path.join(options.resourcesPath, 'scripts', 'docling-convert.py'),
    path.join(__dirname, '..', 'scripts', 'docling-convert.py'),
    path.join(__dirname.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`), '..', 'scripts', 'docling-convert.py')
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

async function convertWithDocling(inputPath, options = {}) {
  const runtime = await findDoclingRuntime(options);
  if (!runtime.available) {
    return {
      success: false,
      code: 'DOCLING_NOT_AVAILABLE',
      error: 'Docling is not installed. Open Capability health to install it.'
    };
  }
  const scriptPath = resolveConverterScript(options);
  if (!scriptPath) {
    return { success: false, code: 'DOCLING_BRIDGE_MISSING', error: 'NightOwl could not locate its Docling converter.' };
  }
  await fs.promises.mkdir(runtime.paths.cacheDir, { recursive: true });
  const result = await run(runtime.command, [scriptPath, inputPath, '--json'], {
    ...options,
    timeout: options.conversionTimeout || 10 * 60 * 1000,
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...(options.env || process.env),
      HF_HOME: runtime.paths.cacheDir,
      XDG_CACHE_HOME: runtime.paths.cacheDir
    }
  });
  if (result.error) {
    try {
      const reported = JSON.parse(result.stdout);
      if (reported && reported.success === false) return reported;
    } catch (_error) { /* fall through to the bounded diagnostic */ }
    return {
      success: false,
      code: 'DOCLING_CONVERSION_FAILED',
      error: firstLine(result.stderr || result.error.message || 'Docling conversion failed.')
    };
  }
  try {
    return JSON.parse(result.stdout);
  } catch (_error) {
    return { success: true, markdown: result.stdout, metadata: { source_file: inputPath } };
  }
}

module.exports = {
  PROBE_ARGS,
  convertWithDocling,
  findBasePython,
  findDoclingRuntime,
  installDoclingRuntime,
  probePython,
  resolveConverterScript,
  runtimePaths,
  systemPythonCandidates
};

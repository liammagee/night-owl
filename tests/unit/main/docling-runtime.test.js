const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  convertWithDocling,
  findDoclingRuntime,
  installDoclingRuntime,
  resolveConverterScript,
  runtimePaths
} = require('../../../services/doclingRuntime');

describe('managed Docling runtime', () => {
  let userDataPath;

  beforeEach(() => {
    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-docling-'));
  });

  afterEach(() => {
    fs.rmSync(userDataPath, { recursive: true, force: true });
  });

  test('ships the converter as a Python-readable external resource', () => {
    const packageJson = require('../../../package.json');
    expect(packageJson.build.extraResources).toContainEqual({
      from: 'scripts/docling-convert.py',
      to: 'scripts/docling-convert.py'
    });
  });

  test('prefers an installed managed runtime without exposing its path', async () => {
    const paths = runtimePaths(userDataPath, 'darwin');
    fs.mkdirSync(path.dirname(paths.pythonPath), { recursive: true });
    fs.writeFileSync(paths.pythonPath, 'python');
    const execFile = jest.fn((_command, _args, _options, callback) => callback(null, '2.48.0\n', ''));

    const result = await findDoclingRuntime({ userDataPath, platform: 'darwin', execFile, env: {} });

    expect(result).toMatchObject({ available: true, source: 'managed', version: '2.48.0' });
    expect(execFile).toHaveBeenCalledWith(paths.pythonPath, expect.any(Array), expect.any(Object), expect.any(Function));
  });

  test('installs into user data with direct argument vectors', async () => {
    const calls = [];
    const configuredPython = path.join(userDataPath, 'python3');
    fs.writeFileSync(configuredPython, 'python');
    const execFile = jest.fn((command, args, _options, callback) => {
      calls.push([command, args]);
      if (args.includes('import sys')) callback(null, '3.12.0\n', '');
      else if (args.includes('import docling; print(getattr(docling, "__version__", "installed"))')) callback(null, '2.48.0\n', '');
      else callback(null, 'ok\n', '');
    });

    const result = await installDoclingRuntime({
      userDataPath, platform: 'darwin', execFile, env: { NIGHTOWL_DOCLING_PYTHON: configuredPython }
    });
    const paths = runtimePaths(userDataPath, 'darwin');

    expect(result).toMatchObject({ success: true, source: 'managed' });
    expect(calls).toContainEqual([configuredPython, ['-m', 'venv', paths.venvDir]]);
    expect(calls).toContainEqual([paths.pythonPath, ['-m', 'pip', 'install', '--disable-pip-version-check', '--upgrade', 'docling']]);
    expect(paths.venvDir.startsWith(userDataPath)).toBe(true);
  });

  test('uses the packaged bridge resource and parses converter JSON', async () => {
    const resourcesPath = path.join(userDataPath, 'resources');
    const scriptPath = path.join(resourcesPath, 'scripts', 'docling-convert.py');
    const paths = runtimePaths(userDataPath, 'darwin');
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.mkdirSync(path.dirname(paths.pythonPath), { recursive: true });
    fs.writeFileSync(scriptPath, '# bridge');
    fs.writeFileSync(paths.pythonPath, 'python');
    const execFile = jest.fn((_command, args, _options, callback) => {
      if (args[0] === '-c') callback(null, '2.48.0\n', '');
      else callback(null, JSON.stringify({ success: true, markdown: '# Imported' }), '');
    });

    expect(resolveConverterScript({ resourcesPath })).toBe(scriptPath);
    await expect(convertWithDocling('/tmp/input.pdf', {
      userDataPath, resourcesPath, platform: 'darwin', execFile, env: {}
    })).resolves.toMatchObject({ success: true, markdown: '# Imported' });
  });
});

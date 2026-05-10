const path = require('path');

const VALUE_FLAGS = new Set([
  '--app',
  '--crash-dumps-dir',
  '--inspect',
  '--inspect-brk',
  '--js-flags',
  '--remote-debugging-port',
  '--user-data-dir'
]);

function isValueFlag(arg) {
  if (!arg || typeof arg !== 'string') return false;
  if (arg.includes('=')) return false;
  return VALUE_FLAGS.has(arg);
}

function normalizePathForCompare(filePath, cwd = process.cwd()) {
  if (!filePath || typeof filePath !== 'string') return '';
  return path.resolve(cwd, filePath);
}

function shouldIgnoreAppPath(arg, appRoot, cwd) {
  if (!appRoot || !arg || arg.startsWith('-')) return false;
  return normalizePathForCompare(arg, cwd) === normalizePathForCompare(appRoot, cwd);
}

function parseNightOwlLaunchArgs(argv = [], options = {}) {
  const cwd = options.cwd || process.cwd();
  const appRoot = options.appRoot || '';
  const paths = [];
  let help = false;
  let version = false;
  let passThrough = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg || typeof arg !== 'string') continue;

    if (!passThrough && arg === '--') {
      passThrough = true;
      continue;
    }

    if (!passThrough && (arg === '--help' || arg === '-h')) {
      help = true;
      continue;
    }

    if (!passThrough && (arg === '--version' || arg === '-v')) {
      version = true;
      continue;
    }

    if (!passThrough && (arg === '--dev' || arg === '--foreground')) {
      continue;
    }

    if (!passThrough && isValueFlag(arg)) {
      i += 1;
      continue;
    }

    if (!passThrough && arg.startsWith('-')) {
      continue;
    }

    if (shouldIgnoreAppPath(arg, appRoot, cwd)) {
      continue;
    }

    paths.push(arg);
  }

  return { paths, help, version };
}

function resolveLaunchTarget(rawPath, options = {}) {
  const fs = options.fs || require('fs');
  const cwd = options.cwd || process.cwd();
  const absolutePath = path.resolve(cwd, String(rawPath || ''));

  try {
    const stat = fs.statSync(absolutePath);
    if (stat.isDirectory()) {
      return { type: 'directory', path: absolutePath, rawPath };
    }
    if (stat.isFile()) {
      return { type: 'file', path: absolutePath, rawPath, workspacePath: path.dirname(absolutePath) };
    }
    return { type: 'unsupported', path: absolutePath, rawPath, error: 'Path is not a file or directory' };
  } catch (error) {
    return { type: 'missing', path: absolutePath, rawPath, error: error.message };
  }
}

function resolveLaunchTargets(rawPaths = [], options = {}) {
  return rawPaths.map((rawPath) => resolveLaunchTarget(rawPath, options));
}

function absolutizeCliPathArgs(argv = [], options = {}) {
  const cwd = options.cwd || process.cwd();
  const result = [];
  let passThrough = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg || typeof arg !== 'string') continue;

    if (!passThrough && arg === '--') {
      passThrough = true;
      result.push(arg);
      continue;
    }

    if (!passThrough && isValueFlag(arg)) {
      result.push(arg);
      if (i + 1 < argv.length) {
        result.push(argv[i + 1]);
        i += 1;
      }
      continue;
    }

    if (!passThrough && arg.startsWith('-')) {
      result.push(arg);
      continue;
    }

    result.push(path.resolve(cwd, arg));
  }

  return result;
}

module.exports = {
  VALUE_FLAGS,
  parseNightOwlLaunchArgs,
  resolveLaunchTarget,
  resolveLaunchTargets,
  absolutizeCliPathArgs
};

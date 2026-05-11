const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WORKSPACE_PROFILE_FLAG = '--nightowl-user-data-dir';
const WORKSPACE_PROFILE_ENV = 'NIGHTOWL_WORKSPACE_USER_DATA_DIR';

function getDefaultUserDataPath(appName = 'NightOwl', platform = process.platform, env = process.env) {
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName);
  }

  if (platform === 'win32') {
    const base = env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(base, appName);
  }

  const base = env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, appName);
}

function hasUserDataArg(argv = []) {
  return argv.some((arg) => (
    arg === WORKSPACE_PROFILE_FLAG ||
    arg.startsWith(`${WORKSPACE_PROFILE_FLAG}=`) ||
    arg === '--user-data-dir' ||
    arg.startsWith('--user-data-dir=')
  ));
}

function getWorkspacePathForProfile(cliPaths = [], options = {}) {
  const fsImpl = options.fs || fs;
  const firstPath = cliPaths.find(candidate => typeof candidate === 'string' && candidate.trim());
  if (!firstPath) return '';

  const absolutePath = path.resolve(options.cwd || process.cwd(), firstPath);
  try {
    const stat = fsImpl.statSync(absolutePath);
    if (stat.isDirectory()) return absolutePath;
    if (stat.isFile()) return path.dirname(absolutePath);
  } catch (_) {
    return path.extname(absolutePath) ? path.dirname(absolutePath) : absolutePath;
  }

  return absolutePath;
}

function slugWorkspacePath(workspacePath) {
  const baseName = path.basename(workspacePath) || 'workspace';
  return baseName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'workspace';
}

function getWorkspaceUserDataPath(workspacePath, options = {}) {
  if (!workspacePath) return '';

  const normalizedPath = path.resolve(workspacePath);
  const baseUserDataPath = options.baseUserDataPath || getDefaultUserDataPath();
  const hash = crypto.createHash('sha1').update(normalizedPath).digest('hex').slice(0, 12);
  return path.join(baseUserDataPath, 'workspace-profiles', `${slugWorkspacePath(normalizedPath)}-${hash}`);
}

function appendWorkspaceProfileArgs(argv = [], options = {}) {
  if (hasUserDataArg(argv)) return argv.slice();

  const workspacePath = getWorkspacePathForProfile(options.cliPaths || [], options);
  const userDataPath = getWorkspaceUserDataPath(workspacePath, options);
  if (!userDataPath) return argv.slice();

  return [
    `--user-data-dir=${userDataPath}`,
    `${WORKSPACE_PROFILE_FLAG}=${userDataPath}`,
    ...argv
  ];
}

function resolveWorkspaceUserDataPath(cliPaths = [], options = {}) {
  if (hasUserDataArg(options.argv || [])) return '';

  const workspacePath = getWorkspacePathForProfile(cliPaths, options);
  return getWorkspaceUserDataPath(workspacePath, options);
}

function extractWorkspaceUserDataDir(argv = []) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg || typeof arg !== 'string') continue;

    if (arg === WORKSPACE_PROFILE_FLAG && typeof argv[i + 1] === 'string') {
      return argv[i + 1];
    }

    if (arg.startsWith(`${WORKSPACE_PROFILE_FLAG}=`)) {
      return arg.slice(WORKSPACE_PROFILE_FLAG.length + 1);
    }
  }

  return '';
}

module.exports = {
  WORKSPACE_PROFILE_ENV,
  WORKSPACE_PROFILE_FLAG,
  appendWorkspaceProfileArgs,
  extractWorkspaceUserDataDir,
  getDefaultUserDataPath,
  getWorkspacePathForProfile,
  getWorkspaceUserDataPath,
  hasUserDataArg,
  resolveWorkspaceUserDataPath
};

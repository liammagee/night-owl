const fs = require('fs');
const os = require('os');
const path = require('path');

const REQUEST_FILE_NAME = 'cli-launch-requests.jsonl';

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

function getCliLaunchRequestFile(userDataPath) {
  return path.join(userDataPath, REQUEST_FILE_NAME);
}

function normalizeRequest(request) {
  if (!request || typeof request !== 'object') return null;
  const args = Array.isArray(request.args)
    ? request.args.filter(arg => typeof arg === 'string')
    : [];
  const cwd = typeof request.cwd === 'string' && request.cwd.trim()
    ? request.cwd
    : process.cwd();

  if (!args.length) return null;

  return {
    id: typeof request.id === 'string' ? request.id : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: typeof request.createdAt === 'string' ? request.createdAt : new Date().toISOString(),
    cwd,
    args
  };
}

function appendCliLaunchRequest({ userDataPath, args, cwd }) {
  if (!userDataPath) {
    throw new Error('userDataPath is required');
  }

  const normalized = normalizeRequest({ args, cwd });
  if (!normalized) return null;

  fs.mkdirSync(userDataPath, { recursive: true });
  const requestFile = getCliLaunchRequestFile(userDataPath);
  fs.appendFileSync(requestFile, `${JSON.stringify(normalized)}\n`, 'utf8');
  return { ...normalized, requestFile };
}

function consumeCliLaunchRequests(userDataPath) {
  if (!userDataPath) return [];

  const requestFile = getCliLaunchRequestFile(userDataPath);
  if (!fs.existsSync(requestFile)) return [];

  const processingFile = `${requestFile}.${process.pid}.processing`;
  try {
    fs.renameSync(requestFile, processingFile);
  } catch (_) {
    return [];
  }

  try {
    const raw = fs.readFileSync(processingFile, 'utf8');
    return raw.split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return normalizeRequest(JSON.parse(line));
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);
  } finally {
    try {
      fs.unlinkSync(processingFile);
    } catch (_) {
      // Best-effort cleanup; a stale processing file is harmless.
    }
  }
}

module.exports = {
  REQUEST_FILE_NAME,
  appendCliLaunchRequest,
  consumeCliLaunchRequests,
  getCliLaunchRequestFile,
  getDefaultUserDataPath
};

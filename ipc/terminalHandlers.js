// === Terminal IPC Handlers ===
// Integrated terminal backed by node-pty when available, with a pipe fallback.

const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const os = require('os');
const { createRuntimeWorkspaceResolver, pathExists } = require('./runtimeWorkspace');
const { createDebugLogger } = require('./logging');

const debug = createDebugLogger('TerminalHandlers');

const DEFAULT_SESSION_ID = 'default';
let cachedPtyModule;
let ptyLoadAttempted = false;

function normalizeSessionId(sessionId) {
  return typeof sessionId === 'string' && sessionId.trim()
    ? sessionId.trim()
    : DEFAULT_SESSION_ID;
}

function buildTerminalEnv() {
  const commonPath = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ].join(':');
  const currentPath = process.env.PATH || '';

  return {
    ...process.env,
    PATH: currentPath.includes('/opt/homebrew/bin')
      ? currentPath
      : `${commonPath}:${currentPath}`,
    TERM: process.env.TERM || 'xterm-256color',
    NIGHTOWL_TERMINAL: '1'
  };
}

function quoteShellArg(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function quoteWindowsArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function buildCommandLine(command, args = [], { windows = false } = {}) {
  const quote = windows ? quoteWindowsArg : quoteShellArg;
  return [command, ...args].map(quote).join(' ');
}

function getShellSpawnConfig(command, args = []) {
  if (process.platform === 'win32') {
    if (command) {
      return {
        shell: 'cmd.exe',
        args: ['/d', '/s', '/c', buildCommandLine(command, args, { windows: true })]
      };
    }
    return { shell: 'cmd.exe', args: [] };
  }

  const shell = process.env.SHELL || '/bin/zsh';
  if (command) {
    return {
      shell,
      args: ['-ilc', buildCommandLine(command, args)]
    };
  }
  return { shell, args: ['-i'] };
}

function getPtyModule() {
  if (ptyLoadAttempted) return cachedPtyModule;
  ptyLoadAttempted = true;
  try {
    cachedPtyModule = require('node-pty');
  } catch (error) {
    cachedPtyModule = null;
    debug('node-pty unavailable; falling back to pipe terminal backend:', error.message);
  }
  return cachedPtyModule;
}

function sendTerminalOutput(sender, sessionId, data, stream) {
  try {
    sender.send('terminal-output', { sessionId, data, stream });
  } catch (error) {
    // Window may be closed.
  }
}

function createPtySession({ spawnConfig, cwd, env, sender, sessionId, onExit }) {
  const pty = getPtyModule();
  if (!pty?.spawn) return null;

  const term = pty.spawn(spawnConfig.shell, spawnConfig.args, {
    name: env.TERM || 'xterm-256color',
    cwd,
    env,
    cols: 120,
    rows: 30
  });

  term.onData((data) => {
    sendTerminalOutput(sender, sessionId, data, 'stdout');
  });

  term.onExit(({ exitCode }) => {
    sendTerminalOutput(sender, sessionId, `\n[Process exited with code ${exitCode}]\n`, 'exit');
    onExit();
  });

  return {
    backend: 'pty',
    pid: term.pid,
    write: (data) => term.write(data),
    kill: () => term.kill()
  };
}

function createPipeSession({ spawnConfig, cwd, env, sender, sessionId, onExit }) {
  const child = spawn(spawnConfig.shell, spawnConfig.args, {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  child.stdout.on('data', (data) => {
    sendTerminalOutput(sender, sessionId, data.toString(), 'stdout');
  });

  child.stderr.on('data', (data) => {
    sendTerminalOutput(sender, sessionId, data.toString(), 'stderr');
  });

  child.on('exit', (code) => {
    sendTerminalOutput(sender, sessionId, `\n[Process exited with code ${code}]\n`, 'exit');
    onExit();
  });

  child.on('error', (err) => {
    sendTerminalOutput(sender, sessionId, `\n[Error: ${err.message}]\n`, 'error');
    onExit();
  });

  return {
    backend: 'pipe',
    pid: child.pid,
    write: (data) => {
      if (!child.stdin?.writable) {
        throw new Error('No active terminal');
      }
      child.stdin.write(data);
    },
    kill: () => child.kill()
  };
}

function register(deps) {
  debug('Registering terminal handlers...');
  const getWorkingDirectory = createRuntimeWorkspaceResolver(deps || {}, { fallback: os.homedir() });

  const activeProcesses = new Map();
  let mainWindow = null;

  // Store window reference
  if (deps && deps.mainWindow) {
    mainWindow = deps.mainWindow;
  }

  /**
   * Spawn a shell process
   */
  ipcMain.handle('terminal-spawn', async (event, { cwd, command, args = [], sessionId } = {}) => {
    const normalizedSessionId = normalizeSessionId(sessionId);
    try {
      const existingProcess = activeProcesses.get(normalizedSessionId);
      if (existingProcess) {
        try { existingProcess.kill(); } catch (e) { /* ignore */ }
        activeProcesses.delete(normalizedSessionId);
      }

      const spawnConfig = getShellSpawnConfig(command, Array.isArray(args) ? args : []);
      const sender = event.sender;
      const resolvedCwd = pathExists(cwd) ? cwd : getWorkingDirectory();
      const env = buildTerminalEnv();
      const onExit = () => activeProcesses.delete(normalizedSessionId);

      const activeProcess = createPtySession({
        spawnConfig,
        cwd: resolvedCwd,
        env,
        sender,
        sessionId: normalizedSessionId,
        onExit
      }) || createPipeSession({
        spawnConfig,
        cwd: resolvedCwd,
        env,
        sender,
        sessionId: normalizedSessionId,
        onExit
      });

      activeProcesses.set(normalizedSessionId, activeProcess);

      return {
        success: true,
        pid: activeProcess.pid,
        sessionId: normalizedSessionId,
        backend: activeProcess.backend
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Write input to the shell
   */
  ipcMain.handle('terminal-write', async (event, { data, sessionId } = {}) => {
    try {
      const activeProcess = activeProcesses.get(normalizeSessionId(sessionId));
      if (!activeProcess) {
        return { success: false, error: 'No active terminal' };
      }
      activeProcess.write(data);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Kill the shell process
   */
  ipcMain.handle('terminal-kill', async (event, { sessionId } = {}) => {
    try {
      const normalizedSessionId = normalizeSessionId(sessionId);
      const activeProcess = activeProcesses.get(normalizedSessionId);
      if (activeProcess) {
        activeProcess.kill();
        activeProcesses.delete(normalizedSessionId);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Run a single command and return output (non-interactive)
   */
  ipcMain.handle('terminal-exec', async (event, { command, cwd }) => {
    try {
      const { execSync } = require('child_process');
      const output = execSync(command, {
        cwd: pathExists(cwd) ? cwd : getWorkingDirectory(),
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 1024 * 1024
      });
      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        output: error.stdout || '',
        error: error.stderr || error.message
      };
    }
  });

  debug('Registered terminal handlers');
}

module.exports = { register };

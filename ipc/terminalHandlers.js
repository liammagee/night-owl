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
const activeProcesses = new Map();

function cleanup() {
  for (const activeProcess of activeProcesses.values()) {
    activeProcess.suppressExit = true;
    try {
      activeProcess.kill();
    } catch (error) {
      debug('terminal cleanup failed:', error.message);
    }
  }
  activeProcesses.clear();
}

function getDiagnostics() {
  const byBackend = {};
  for (const activeProcess of activeProcesses.values()) {
    const backend = activeProcess.backend || 'unknown';
    byBackend[backend] = (byBackend[backend] || 0) + 1;
  }
  return { activeProcesses: activeProcesses.size, byBackend };
}

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
    COLORTERM: process.env.COLORTERM || 'truecolor',
    // Child tools should identify their direct terminal host, not whichever
    // terminal happened to launch NightOwl during development.
    TERM_PROGRAM: 'NightOwl',
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

function getShellName(shell) {
  return String(shell || '').split(/[\\/]/).pop().toLowerCase();
}

function getInteractiveShellArgs(shell) {
  const shellName = getShellName(shell);
  if (shellName.includes('zsh') || shellName.includes('bash')) {
    return ['-il'];
  }
  if (shellName.includes('fish')) {
    return ['-l', '-i'];
  }
  return ['-i'];
}

function getCommandShellArgs(shell, commandLine) {
  const shellName = getShellName(shell);
  if (shellName.includes('fish')) {
    return ['-lc', commandLine];
  }
  return ['-ilc', commandLine];
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
      args: getCommandShellArgs(shell, buildCommandLine(command, args))
    };
  }
  return { shell, args: getInteractiveShellArgs(shell) };
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

function sendTerminalOutput(sender, sessionId, data, stream, metadata = {}) {
  try {
    sender.send('terminal-output', { sessionId, data, stream, ...metadata });
  } catch (error) {
    // Window may be closed.
  }
}

function normalizeTerminalDimension(value, fallback, { min = 1, max = 500 } = {}) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function createPtySession({ spawnConfig, cwd, env, sender, sessionId, onExit, cols, rows }) {
  const pty = getPtyModule();
  if (!pty?.spawn) return null;

  const term = pty.spawn(spawnConfig.shell, spawnConfig.args, {
    name: env.TERM || 'xterm-256color',
    cwd,
    env,
    cols: normalizeTerminalDimension(cols, 120, { min: 20 }),
    rows: normalizeTerminalDimension(rows, 30, { min: 5 })
  });
  let session;

  term.onData((data) => {
    sendTerminalOutput(sender, sessionId, data, 'stdout', { pid: term.pid });
  });

  term.onExit(({ exitCode }) => {
    if (!session?.suppressExit) {
      sendTerminalOutput(sender, sessionId, `\n[Process exited with code ${exitCode}]\n`, 'exit', { pid: term.pid });
    }
    onExit(session);
  });

  session = {
    backend: 'pty',
    pid: term.pid,
    suppressExit: false,
    write: (data) => term.write(data),
    resize: (nextCols, nextRows) => {
      if (typeof term.resize === 'function') {
        term.resize(
          normalizeTerminalDimension(nextCols, 120, { min: 20 }),
          normalizeTerminalDimension(nextRows, 30, { min: 5 })
        );
      }
    },
    kill: () => term.kill()
  };
  return session;
}

function createPipeSession({ spawnConfig, cwd, env, sender, sessionId, onExit }) {
  const child = spawn(spawnConfig.shell, spawnConfig.args, {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  let session;

  child.stdout.on('data', (data) => {
    sendTerminalOutput(sender, sessionId, data.toString(), 'stdout', { pid: child.pid });
  });

  child.stderr.on('data', (data) => {
    sendTerminalOutput(sender, sessionId, data.toString(), 'stderr', { pid: child.pid });
  });

  child.on('exit', (code) => {
    if (!session?.suppressExit) {
      sendTerminalOutput(sender, sessionId, `\n[Process exited with code ${code}]\n`, 'exit', { pid: child.pid });
    }
    onExit(session);
  });

  child.on('error', (err) => {
    if (!session?.suppressExit) {
      sendTerminalOutput(sender, sessionId, `\n[Error: ${err.message}]\n`, 'error', { pid: child.pid });
    }
    onExit(session);
  });

  session = {
    backend: 'pipe',
    pid: child.pid,
    suppressExit: false,
    write: (data) => {
      if (!child.stdin?.writable) {
        throw new Error('No active terminal');
      }
      child.stdin.write(data);
    },
    resize: () => {},
    kill: () => child.kill()
  };
  return session;
}

function register(deps) {
  debug('Registering terminal handlers...');
  cleanup();
  const getWorkingDirectory = createRuntimeWorkspaceResolver(deps || {}, { fallback: os.homedir() });

  /**
   * Spawn a shell process
   */
  ipcMain.handle('terminal-spawn', async (event, { cwd, command, args = [], sessionId, cols, rows } = {}) => {
    const normalizedSessionId = normalizeSessionId(sessionId);
    try {
      const existingProcess = activeProcesses.get(normalizedSessionId);
      if (existingProcess) {
        existingProcess.suppressExit = true;
        try { existingProcess.kill(); } catch (e) { /* ignore */ }
        activeProcesses.delete(normalizedSessionId);
      }

      const spawnConfig = getShellSpawnConfig(command, Array.isArray(args) ? args : []);
      const sender = event.sender;
      const resolvedCwd = pathExists(cwd) ? cwd : getWorkingDirectory();
      const env = buildTerminalEnv();
      const onExit = (exitedProcess) => {
        if (activeProcesses.get(normalizedSessionId) === exitedProcess) {
          activeProcesses.delete(normalizedSessionId);
        }
      };

      const activeProcess = createPtySession({
        spawnConfig,
        cwd: resolvedCwd,
        env,
        sender,
        sessionId: normalizedSessionId,
        onExit,
        cols,
        rows
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
   * Resize a live pseudo-terminal to match the renderer viewport.
   */
  ipcMain.handle('terminal-resize', async (event, { sessionId, cols, rows } = {}) => {
    try {
      const activeProcess = activeProcesses.get(normalizeSessionId(sessionId));
      if (!activeProcess) {
        return { success: false, error: 'No active terminal' };
      }
      activeProcess.resize(cols, rows);
      return { success: true };
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
        activeProcess.suppressExit = true;
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

module.exports = { register, cleanup, getDiagnostics };

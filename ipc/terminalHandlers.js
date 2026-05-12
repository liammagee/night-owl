// === Terminal IPC Handlers ===
// Lightweight integrated terminal using child_process

const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const os = require('os');
const { createRuntimeWorkspaceResolver, pathExists } = require('./runtimeWorkspace');
const { createDebugLogger } = require('./logging');

const debug = createDebugLogger('TerminalHandlers');

const DEFAULT_SESSION_ID = 'default';

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

      const activeProcess = spawn(spawnConfig.shell, spawnConfig.args, {
        cwd: pathExists(cwd) ? cwd : getWorkingDirectory(),
        env: buildTerminalEnv(),
        stdio: ['pipe', 'pipe', 'pipe']
      });
      activeProcesses.set(normalizedSessionId, activeProcess);

      // Send output to renderer via events
      const sender = event.sender;

      activeProcess.stdout.on('data', (data) => {
        try {
          sender.send('terminal-output', { sessionId: normalizedSessionId, data: data.toString(), stream: 'stdout' });
        } catch (e) { /* window may be closed */ }
      });

      activeProcess.stderr.on('data', (data) => {
        try {
          sender.send('terminal-output', { sessionId: normalizedSessionId, data: data.toString(), stream: 'stderr' });
        } catch (e) { /* window may be closed */ }
      });

      activeProcess.on('exit', (code) => {
        try {
          sender.send('terminal-output', { sessionId: normalizedSessionId, data: `\n[Process exited with code ${code}]\n`, stream: 'exit' });
        } catch (e) { /* window may be closed */ }
        activeProcesses.delete(normalizedSessionId);
      });

      activeProcess.on('error', (err) => {
        try {
          sender.send('terminal-output', { sessionId: normalizedSessionId, data: `\n[Error: ${err.message}]\n`, stream: 'error' });
        } catch (e) { /* window may be closed */ }
        activeProcesses.delete(normalizedSessionId);
      });

      return { success: true, pid: activeProcess.pid, sessionId: normalizedSessionId };
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
      if (!activeProcess || !activeProcess.stdin.writable) {
        return { success: false, error: 'No active terminal' };
      }
      activeProcess.stdin.write(data);
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

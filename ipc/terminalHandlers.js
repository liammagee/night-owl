// === Terminal IPC Handlers ===
// Lightweight integrated terminal using child_process

const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const os = require('os');
const { createRuntimeWorkspaceResolver, pathExists } = require('./runtimeWorkspace');
const { createDebugLogger } = require('./logging');

const debug = createDebugLogger('TerminalHandlers');

function register(deps) {
  debug('Registering terminal handlers...');
  const getWorkingDirectory = createRuntimeWorkspaceResolver(deps || {}, { fallback: os.homedir() });

  let activeProcess = null;
  let mainWindow = null;

  // Store window reference
  if (deps && deps.mainWindow) {
    mainWindow = deps.mainWindow;
  }

  /**
   * Spawn a shell process
   */
  ipcMain.handle('terminal-spawn', async (event, { cwd }) => {
    try {
      // Kill existing process
      if (activeProcess) {
        try { activeProcess.kill(); } catch (e) { /* ignore */ }
        activeProcess = null;
      }

      const shell = process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || '/bin/zsh');
      const args = process.platform === 'win32' ? [] : ['-i'];

      activeProcess = spawn(shell, args, {
        cwd: pathExists(cwd) ? cwd : getWorkingDirectory(),
        env: { ...process.env, TERM: 'dumb' },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Send output to renderer via events
      const sender = event.sender;

      activeProcess.stdout.on('data', (data) => {
        try {
          sender.send('terminal-output', { data: data.toString(), stream: 'stdout' });
        } catch (e) { /* window may be closed */ }
      });

      activeProcess.stderr.on('data', (data) => {
        try {
          sender.send('terminal-output', { data: data.toString(), stream: 'stderr' });
        } catch (e) { /* window may be closed */ }
      });

      activeProcess.on('exit', (code) => {
        try {
          sender.send('terminal-output', { data: `\n[Process exited with code ${code}]\n`, stream: 'exit' });
        } catch (e) { /* window may be closed */ }
        activeProcess = null;
      });

      activeProcess.on('error', (err) => {
        try {
          sender.send('terminal-output', { data: `\n[Error: ${err.message}]\n`, stream: 'error' });
        } catch (e) { /* window may be closed */ }
        activeProcess = null;
      });

      return { success: true, pid: activeProcess.pid };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Write input to the shell
   */
  ipcMain.handle('terminal-write', async (event, { data }) => {
    try {
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
  ipcMain.handle('terminal-kill', async (event) => {
    try {
      if (activeProcess) {
        activeProcess.kill();
        activeProcess = null;
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

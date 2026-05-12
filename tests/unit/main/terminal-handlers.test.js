const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

describe('terminalHandlers', () => {
  let ipcMain;
  let spawnMock;
  let execSyncMock;
  let tempRoot;
  let runtimeDir;

  function getRegisteredHandler(channel) {
    const entry = ipcMain.handle.mock.calls.find(([name]) => name === channel);
    if (!entry) {
      throw new Error(`Handler not registered for ${channel}`);
    }
    return entry[1];
  }

  beforeEach(() => {
    jest.resetModules();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-terminal-'));
    runtimeDir = path.join(tempRoot, 'runtime');
    fs.mkdirSync(runtimeDir);

    spawnMock = jest.fn(() => {
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.stdin = { writable: true, write: jest.fn() };
      proc.kill = jest.fn();
      proc.pid = 1234;
      return proc;
    });
    execSyncMock = jest.fn(() => 'ok');

    jest.doMock('child_process', () => ({
      spawn: spawnMock,
      execSync: execSyncMock
    }));

    ({ ipcMain } = require('electron'));
    ipcMain.handle.mockClear();
  });

  afterEach(() => {
    jest.dontMock('child_process');
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('terminal-spawn falls back to live workspace when requested cwd is stale', async () => {
    const terminalHandlers = require('../../../ipc/terminalHandlers');
    terminalHandlers.register({
      appSettings: { workingDirectory: path.join(tempRoot, 'missing') },
      getCurrentWorkingDirectory: () => runtimeDir,
      currentWorkingDirectory: runtimeDir
    });

    const handler = getRegisteredHandler('terminal-spawn');
    await expect(handler({ sender: { send: jest.fn() } }, {
      cwd: path.join(tempRoot, 'stale')
    })).resolves.toEqual({ success: true, pid: 1234, sessionId: 'default' });

    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: runtimeDir })
    );
  });

  test('terminal-spawn can launch an assistant CLI in an isolated session', async () => {
    const terminalHandlers = require('../../../ipc/terminalHandlers');
    const sender = { send: jest.fn() };
    terminalHandlers.register({
      appSettings: { workingDirectory: runtimeDir },
      getCurrentWorkingDirectory: () => runtimeDir,
      currentWorkingDirectory: runtimeDir
    });

    const handler = getRegisteredHandler('terminal-spawn');
    await expect(handler({ sender }, {
      cwd: runtimeDir,
      sessionId: 'assistant',
      command: 'codex'
    })).resolves.toEqual({ success: true, pid: 1234, sessionId: 'assistant' });

    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([expect.stringContaining('codex')]),
      expect.objectContaining({
        cwd: runtimeDir,
        env: expect.objectContaining({ NIGHTOWL_TERMINAL: '1' })
      })
    );

    const proc = spawnMock.mock.results[0].value;
    proc.stdout.emit('data', Buffer.from('ready'));
    expect(sender.send).toHaveBeenCalledWith('terminal-output', {
      sessionId: 'assistant',
      data: 'ready',
      stream: 'stdout'
    });
  });

  test('terminal-exec falls back to live workspace when requested cwd is stale', async () => {
    const terminalHandlers = require('../../../ipc/terminalHandlers');
    terminalHandlers.register({
      appSettings: { workingDirectory: path.join(tempRoot, 'missing') },
      getCurrentWorkingDirectory: () => runtimeDir,
      currentWorkingDirectory: runtimeDir
    });

    const handler = getRegisteredHandler('terminal-exec');
    await expect(handler({}, {
      command: 'pwd',
      cwd: path.join(tempRoot, 'stale')
    })).resolves.toEqual({ success: true, output: 'ok' });

    expect(execSyncMock).toHaveBeenCalledWith(
      'pwd',
      expect.objectContaining({ cwd: runtimeDir })
    );
  });
});

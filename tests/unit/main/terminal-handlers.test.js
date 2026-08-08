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
    jest.doMock('node-pty', () => {
      throw new Error('node-pty unavailable in fallback tests');
    }, { virtual: true });

    ({ ipcMain } = require('electron'));
    ipcMain.handle.mockClear();
  });

  afterEach(() => {
    jest.dontMock('child_process');
    jest.dontMock('node-pty');
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
    })).resolves.toEqual({ success: true, pid: 1234, sessionId: 'default', backend: 'pipe' });

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
    })).resolves.toEqual({ success: true, pid: 1234, sessionId: 'assistant', backend: 'pipe' });

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
      stream: 'stdout',
      pid: 1234
    });
  });

  test('terminal-spawn uses node-pty when available', async () => {
    const ptyProc = new EventEmitter();
    ptyProc.pid = 5678;
    ptyProc.write = jest.fn();
    ptyProc.resize = jest.fn();
    ptyProc.kill = jest.fn();
    ptyProc.onData = jest.fn((handler) => {
      ptyProc.emitData = handler;
      return { dispose: jest.fn() };
    });
    ptyProc.onExit = jest.fn((handler) => {
      ptyProc.emitExit = handler;
      return { dispose: jest.fn() };
    });

    const ptySpawnMock = jest.fn(() => ptyProc);
    jest.dontMock('node-pty');
    jest.doMock('node-pty', () => ({ spawn: ptySpawnMock }), { virtual: true });

    const terminalHandlers = require('../../../ipc/terminalHandlers');
    const sender = { send: jest.fn() };
    terminalHandlers.register({
      appSettings: { workingDirectory: runtimeDir },
      getCurrentWorkingDirectory: () => runtimeDir,
      currentWorkingDirectory: runtimeDir
    });

    const spawnHandler = getRegisteredHandler('terminal-spawn');
    await expect(spawnHandler({ sender }, {
      cwd: runtimeDir,
      sessionId: 'assistant',
      command: 'claude',
      cols: 88,
      rows: 22
    })).resolves.toEqual({ success: true, pid: 5678, sessionId: 'assistant', backend: 'pty' });

    expect(ptySpawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([expect.stringContaining('claude')]),
      expect.objectContaining({
        cwd: runtimeDir,
        env: expect.objectContaining({
          COLORTERM: 'truecolor',
          NIGHTOWL_TERMINAL: '1',
          TERM_PROGRAM: 'NightOwl'
        }),
        cols: 88,
        rows: 22
      })
    );
    expect(spawnMock).not.toHaveBeenCalled();

    ptyProc.emitData('pty ready');
    expect(sender.send).toHaveBeenCalledWith('terminal-output', {
      sessionId: 'assistant',
      data: 'pty ready',
      stream: 'stdout',
      pid: 5678
    });

    const writeHandler = getRegisteredHandler('terminal-write');
    await expect(writeHandler({}, {
      sessionId: 'assistant',
      data: 'hello\n'
    })).resolves.toEqual({ success: true });
    expect(ptyProc.write).toHaveBeenCalledWith('hello\n');

    const resizeHandler = getRegisteredHandler('terminal-resize');
    await expect(resizeHandler({}, {
      sessionId: 'assistant',
      cols: 100,
      rows: 28
    })).resolves.toEqual({ success: true });
    expect(ptyProc.resize).toHaveBeenCalledWith(100, 28);
  });

  test('replacing a terminal suppresses stale exit events and keeps the new PTY active', async () => {
    const firstPty = new EventEmitter();
    firstPty.pid = 1111;
    firstPty.write = jest.fn();
    firstPty.resize = jest.fn();
    firstPty.kill = jest.fn();
    firstPty.onData = jest.fn((handler) => {
      firstPty.emitData = handler;
      return { dispose: jest.fn() };
    });
    firstPty.onExit = jest.fn((handler) => {
      firstPty.emitExit = handler;
      return { dispose: jest.fn() };
    });

    const secondPty = new EventEmitter();
    secondPty.pid = 2222;
    secondPty.write = jest.fn();
    secondPty.resize = jest.fn();
    secondPty.kill = jest.fn();
    secondPty.onData = jest.fn((handler) => {
      secondPty.emitData = handler;
      return { dispose: jest.fn() };
    });
    secondPty.onExit = jest.fn((handler) => {
      secondPty.emitExit = handler;
      return { dispose: jest.fn() };
    });

    const ptySpawnMock = jest.fn()
      .mockReturnValueOnce(firstPty)
      .mockReturnValueOnce(secondPty);
    jest.dontMock('node-pty');
    jest.doMock('node-pty', () => ({ spawn: ptySpawnMock }), { virtual: true });

    const terminalHandlers = require('../../../ipc/terminalHandlers');
    const sender = { send: jest.fn() };
    terminalHandlers.register({
      appSettings: { workingDirectory: runtimeDir },
      getCurrentWorkingDirectory: () => runtimeDir,
      currentWorkingDirectory: runtimeDir
    });

    const spawnHandler = getRegisteredHandler('terminal-spawn');
    await spawnHandler({ sender }, { cwd: runtimeDir, sessionId: 'assistant' });
    await spawnHandler({ sender }, { cwd: runtimeDir, sessionId: 'assistant' });

    expect(firstPty.kill).toHaveBeenCalled();
    firstPty.emitExit({ exitCode: 0 });
    expect(sender.send).not.toHaveBeenCalledWith('terminal-output', expect.objectContaining({
      stream: 'exit',
      pid: 1111
    }));

    const writeHandler = getRegisteredHandler('terminal-write');
    await expect(writeHandler({}, {
      sessionId: 'assistant',
      data: 'echo still-active\n'
    })).resolves.toEqual({ success: true });
    expect(secondPty.write).toHaveBeenCalledWith('echo still-active\n');
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

  test('cleanup kills every active session and is idempotent', async () => {
    const terminalHandlers = require('../../../ipc/terminalHandlers');
    terminalHandlers.register({
      appSettings: { workingDirectory: runtimeDir },
      getCurrentWorkingDirectory: () => runtimeDir,
      currentWorkingDirectory: runtimeDir
    });

    const spawnHandler = getRegisteredHandler('terminal-spawn');
    await spawnHandler({ sender: { send: jest.fn() } }, { sessionId: 'default' });
    await spawnHandler({ sender: { send: jest.fn() } }, { sessionId: 'assistant' });

    expect(terminalHandlers.getDiagnostics()).toEqual({
      activeProcesses: 2,
      byBackend: { pipe: 2 }
    });

    terminalHandlers.cleanup();
    terminalHandlers.cleanup();

    expect(terminalHandlers.getDiagnostics()).toEqual({ activeProcesses: 0, byBackend: {} });
    for (const result of spawnMock.mock.results) {
      expect(result.value.kill).toHaveBeenCalledTimes(1);
    }
  });
});

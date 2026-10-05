const {
  createTrustedSenderValidator,
  installIpcMainGuard
} = require('../../../services/ipcSecurity');

function createIpcMain() {
  const handlers = new Map();
  const listeners = new Map();
  return {
    handlers,
    listeners,
    handle: jest.fn((channel, handler) => handlers.set(channel, handler)),
    on: jest.fn((channel, listener) => listeners.set(channel, listener)),
    removeListener: jest.fn()
  };
}

describe('main-process IPC security', () => {
  function createWindow(url) {
    const mainFrame = { url };
    const webContents = { mainFrame, getURL: () => url };
    return { webContents };
  }

  test('accepts the app main frame and rejects foreign windows and subframes', () => {
    const appEntryUrl = 'file:///Applications/NightOwl/index.html';
    const mainWindow = createWindow(appEntryUrl);
    const foreignWindow = createWindow('https://attacker.invalid/');
    const validate = createTrustedSenderValidator({
      appEntryUrl,
      getMainWindow: () => mainWindow,
      getSpeakerNotesWindow: () => null
    });

    expect(validate({ sender: mainWindow.webContents, senderFrame: mainWindow.webContents.mainFrame })).toBe(true);
    expect(validate({ sender: foreignWindow.webContents, senderFrame: foreignWindow.webContents.mainFrame })).toBe(false);
    expect(validate({ sender: mainWindow.webContents, senderFrame: { url: appEntryUrl } })).toBe(false);
  });

  test('wraps invoke handlers with sender and payload validation', async () => {
    const ipcMain = createIpcMain();
    const isTrustedSender = jest.fn(event => event?.trusted === true);
    installIpcMainGuard(ipcMain, { isTrustedSender });
    const handler = jest.fn(async (_event, request) => ({ output: request.command }));
    ipcMain.handle('terminal-exec', handler);
    const guarded = ipcMain.handlers.get('terminal-exec');

    await expect(guarded({ trusted: false }, { command: 'pwd' })).rejects.toThrow(/unexpected sender/);
    await expect(guarded({ trusted: true }, { cwd: '/tmp' })).rejects.toThrow(/Invalid payload/);
    await expect(guarded({ trusted: true }, { command: 'pwd' })).resolves.toEqual({ output: 'pwd' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('drops untrusted one-way signals and rejects undeclared registrations', () => {
    const ipcMain = createIpcMain();
    installIpcMainGuard(ipcMain, { isTrustedSender: event => event?.trusted === true });
    const listener = jest.fn();
    ipcMain.on('save-layout', listener);
    const guarded = ipcMain.listeners.get('save-layout');

    guarded({ trusted: false }, { width: 100 });
    guarded({ trusted: true }, { width: 200 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ trusted: true }, { width: 200 });
    expect(() => ipcMain.handle('shell-run', jest.fn())).toThrow(/not declared/);
    expect(() => ipcMain.on('arbitrary-signal', jest.fn())).toThrow(/not declared/);
  });
});

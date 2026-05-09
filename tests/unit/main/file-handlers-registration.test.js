describe('fileHandlers registration', () => {
  const fsSync = require('fs');
  const os = require('os');
  const path = require('path');

  let fileHandlers;
  let ipcMain;
  let dialog;

  function getRegisteredHandler(channel) {
    const entry = ipcMain.handle.mock.calls.find(([name]) => name === channel);
    if (!entry) {
      throw new Error(`Handler not registered for ${channel}`);
    }
    return entry[1];
  }

  beforeEach(() => {
    jest.resetModules();
    ({ ipcMain, dialog } = require('electron'));
    ipcMain.handle.mockClear();
    dialog.showOpenDialog.mockReset();
    fileHandlers = require('../../../ipc/fileHandlers');
  });

  test('get-working-directory reads the live getter instead of a stale captured value', () => {
    let currentWorkingDirectory = '/workspace/initial';

    fileHandlers.register({
      appSettings: {},
      saveSettings: jest.fn(),
      getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
      getCurrentFilePath: jest.fn(),
      setCurrentFilePath: jest.fn(),
      getCurrentWorkingDirectory: jest.fn(() => currentWorkingDirectory),
      setCurrentWorkingDirectory: jest.fn((nextDirectory) => {
        currentWorkingDirectory = nextDirectory;
      }),
      currentWorkingDirectory: '/workspace/stale',
      userDataPath: '/mock/user-data'
    });

    const handler = getRegisteredHandler('get-working-directory');

    expect(handler()).toBe('/workspace/initial');
    currentWorkingDirectory = '/workspace/updated';
    expect(handler()).toBe('/workspace/updated');
  });

  test('change-working-directory updates state through the provided setter', async () => {
    let currentWorkingDirectory = '/workspace/initial';
    const send = jest.fn();
    const saveSettings = jest.fn();
    const setCurrentWorkingDirectory = jest.fn((nextDirectory) => {
      currentWorkingDirectory = nextDirectory;
    });

    dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/workspace/next']
    });

    fileHandlers.register({
      appSettings: { workingDirectory: '/workspace/initial' },
      saveSettings,
      getMainWindow: jest.fn(() => ({ webContents: { send } })),
      getCurrentFilePath: jest.fn(),
      setCurrentFilePath: jest.fn(),
      getCurrentWorkingDirectory: jest.fn(() => currentWorkingDirectory),
      setCurrentWorkingDirectory,
      currentWorkingDirectory: '/workspace/stale',
      userDataPath: '/mock/user-data'
    });

    const handler = getRegisteredHandler('change-working-directory');
    const result = await handler();

    expect(result).toEqual({ success: true, directory: '/workspace/next' });
    expect(setCurrentWorkingDirectory).toHaveBeenCalledWith('/workspace/next');
    expect(currentWorkingDirectory).toBe('/workspace/next');
    expect(saveSettings).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('settings-changed', {
      workingDirectory: '/workspace/next',
      workspaceFolders: []
    });
  });

  test('show-confirm-dialog renders exact paths and cancel-default buttons', async () => {
    dialog.showMessageBox.mockResolvedValue({ response: 0 });

    fileHandlers.register({
      appSettings: {},
      saveSettings: jest.fn(),
      getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
      getCurrentFilePath: jest.fn(),
      setCurrentFilePath: jest.fn(),
      getCurrentWorkingDirectory: jest.fn(() => '/workspace/current'),
      setCurrentWorkingDirectory: jest.fn(),
      currentWorkingDirectory: '/workspace/current',
      userDataPath: '/mock/user-data'
    });

    const handler = getRegisteredHandler('show-confirm-dialog');
    const result = await handler({}, {
      title: 'Delete Files',
      message: 'Delete selected files?',
      detail: 'This cannot be undone.',
      paths: ['/workspace/a.md', '/workspace/b.md'],
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger'
    });

    expect(result).toEqual({ success: true, confirmed: true, cancelled: false });
    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        type: 'warning',
        title: 'Delete Files',
        message: 'Delete selected files?',
        detail: expect.stringContaining('/workspace/a.md'),
        buttons: ['Delete', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      })
    );
  });

  test('set-current-file watches the file and notifies renderer when it changes on disk', async () => {
    const tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'nightowl-watch-'));
    const filePath = path.join(tempDir, 'watched.md');
    fsSync.writeFileSync(filePath, 'initial\n', 'utf8');

    const send = jest.fn();
    fileHandlers.register({
      appSettings: {},
      saveSettings: jest.fn(),
      getMainWindow: jest.fn(() => ({ webContents: { send } })),
      getCurrentFilePath: jest.fn(),
      setCurrentFilePath: jest.fn(),
      getCurrentWorkingDirectory: jest.fn(() => tempDir),
      setCurrentWorkingDirectory: jest.fn(),
      currentWorkingDirectory: tempDir,
      userDataPath: '/mock/user-data'
    });

    const setCurrentFile = getRegisteredHandler('set-current-file');
    setCurrentFile(null, filePath);

    await new Promise(resolve => setTimeout(resolve, 50));
    fsSync.writeFileSync(filePath, 'changed on disk\n', 'utf8');

    await new Promise(resolve => setTimeout(resolve, 500));

    expect(send).toHaveBeenCalledWith(
      'current-file-changed-on-disk',
      expect.objectContaining({
        filePath,
        size: Buffer.byteLength('changed on disk\n')
      })
    );

    setCurrentFile(null, null);
    fsSync.rmSync(tempDir, { recursive: true, force: true });
  });
});

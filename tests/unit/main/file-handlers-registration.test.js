describe('fileHandlers registration', () => {
  const fsSync = require('fs');
  const os = require('os');
  const path = require('path');

  let fileHandlers;
  let ipcMain;
  let dialog;
  let shell;
  let BrowserWindow;

  function getRegisteredHandler(channel) {
    const entry = ipcMain.handle.mock.calls.find(([name]) => name === channel);
    if (!entry) {
      throw new Error(`Handler not registered for ${channel}`);
    }
    return entry[1];
  }

  beforeEach(() => {
    jest.resetModules();
    ({ ipcMain, dialog, shell, BrowserWindow } = require('electron'));
    ipcMain.handle.mockClear();
    BrowserWindow.getAllWindows = jest.fn(() => []);
    BrowserWindow.fromWebContents = jest.fn(() => null);
    dialog.showOpenDialog.mockReset();
    shell.openPath.mockClear();
    shell.openExternal.mockClear();
    shell.openPath.mockResolvedValue('');
    shell.openExternal.mockResolvedValue();
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

  test('refresh-file-tree broadcasts to every live renderer window', async () => {
    const sendA = jest.fn();
    const sendB = jest.fn();
    BrowserWindow.getAllWindows.mockReturnValue([
      {
        isDestroyed: () => false,
        webContents: { isDestroyed: () => false, send: sendA }
      },
      {
        isDestroyed: () => false,
        webContents: { isDestroyed: () => false, send: sendB }
      }
    ]);

    fileHandlers.register({
      appSettings: {},
      saveSettings: jest.fn(),
      getMainWindow: jest.fn(() => null),
      getCurrentFilePath: jest.fn(),
      setCurrentFilePath: jest.fn(),
      getCurrentWorkingDirectory: jest.fn(() => '/workspace/current'),
      setCurrentWorkingDirectory: jest.fn(),
      currentWorkingDirectory: '/workspace/current',
      userDataPath: '/mock/user-data'
    });

    const handler = getRegisteredHandler('refresh-file-tree');
    await expect(handler({})).resolves.toEqual({ success: true });

    expect(sendA).toHaveBeenCalledWith('refresh-file-tree');
    expect(sendB).toHaveBeenCalledWith('refresh-file-tree');
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
    let watchCallback;
    const watcher = {
      close: jest.fn(),
      on: jest.fn()
    };
    watcher.on.mockReturnValue(watcher);
    const watchSpy = jest.spyOn(fsSync, 'watch').mockImplementation((_directory, _options, callback) => {
      watchCallback = callback;
      return watcher;
    });
    const send = jest.fn();
    let setCurrentFile;

    jest.useFakeTimers();
    try {
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

      setCurrentFile = getRegisteredHandler('set-current-file');
      setCurrentFile(null, filePath);
      expect(watchSpy).toHaveBeenCalledWith(tempDir, { persistent: false }, expect.any(Function));

      fsSync.writeFileSync(filePath, 'changed on disk\n', 'utf8');
      watchCallback('change', Buffer.from(path.basename(filePath)));
      jest.advanceTimersByTime(151);

      expect(send).toHaveBeenCalledWith(
        'current-file-changed-on-disk',
        expect.objectContaining({
          filePath,
          size: Buffer.byteLength('changed on disk\n')
        })
      );
    } finally {
      if (setCurrentFile) setCurrentFile(null, null);
      expect(watcher.close).toHaveBeenCalled();
      watchSpy.mockRestore();
      jest.useRealTimers();
      fsSync.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('open-external opens web URLs in the browser instead of treating them as file paths', async () => {
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

    const handler = getRegisteredHandler('open-external');
    const result = await handler(null, 'https://machinespirits.org/#/ai-tutor-machinagogy-v2');

    expect(result).toEqual({
      success: true,
      url: 'https://machinespirits.org/#/ai-tutor-machinagogy-v2'
    });
    expect(shell.openExternal).toHaveBeenCalledWith('https://machinespirits.org/#/ai-tutor-machinagogy-v2');
    expect(shell.openPath).not.toHaveBeenCalled();
  });

  test('open-external still opens local file paths with the system handler', async () => {
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

    const handler = getRegisteredHandler('open-external');
    const result = await handler(null, '/workspace/current/a.pdf');

    expect(result).toEqual({
      success: true,
      filePath: '/workspace/current/a.pdf'
    });
    expect(shell.openPath).toHaveBeenCalledWith('/workspace/current/a.pdf');
    expect(shell.openExternal).not.toHaveBeenCalled();
  });

  test('get-markdown-files caches workspace scans and refresh invalidates them', async () => {
    const tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'nightowl-markdown-cache-'));
    const send = jest.fn();
    fsSync.writeFileSync(path.join(tempDir, 'a.md'), '# A\n', 'utf8');

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

    const getMarkdownFiles = getRegisteredHandler('get-markdown-files');
    const refreshFileTree = getRegisteredHandler('refresh-file-tree');

    const firstResult = await getMarkdownFiles();
    expect(firstResult.files).toEqual([path.join(tempDir, 'a.md')]);

    fsSync.writeFileSync(path.join(tempDir, 'b.md'), '# B\n', 'utf8');

    const cachedResult = await getMarkdownFiles();
    expect(cachedResult.files).toEqual([path.join(tempDir, 'a.md')]);

    await refreshFileTree();
    const refreshedResult = await getMarkdownFiles();
    expect(refreshedResult.files).toEqual([
      path.join(tempDir, 'a.md'),
      path.join(tempDir, 'b.md')
    ]);

    fsSync.rmSync(tempDir, { recursive: true, force: true });
  });

  test('get-file-tree-signature changes for disk additions and removals', async () => {
    const tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'nightowl-tree-signature-'));
    const firstFile = path.join(tempDir, 'a.md');
    const secondFile = path.join(tempDir, 'b.md');
    fsSync.writeFileSync(firstFile, '# A\n', 'utf8');

    fileHandlers.register({
      appSettings: {},
      saveSettings: jest.fn(),
      getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
      getCurrentFilePath: jest.fn(),
      setCurrentFilePath: jest.fn(),
      getCurrentWorkingDirectory: jest.fn(() => tempDir),
      setCurrentWorkingDirectory: jest.fn(),
      currentWorkingDirectory: tempDir,
      userDataPath: '/mock/user-data'
    });

    const getSignature = getRegisteredHandler('get-file-tree-signature');
    const requestFileTree = getRegisteredHandler('request-file-tree');
    const tree = await requestFileTree();
    const initial = await getSignature();
    expect(initial.success).toBe(true);
    expect(tree.signature).toBe(initial.signature);

    fsSync.writeFileSync(secondFile, '# B\n', 'utf8');
    const afterAdd = await getSignature();
    expect(afterAdd.signature).not.toBe(initial.signature);

    fsSync.unlinkSync(secondFile);
    const afterRemove = await getSignature();
    expect(afterRemove.signature).toBe(initial.signature);

    fsSync.rmSync(tempDir, { recursive: true, force: true });
  });
});

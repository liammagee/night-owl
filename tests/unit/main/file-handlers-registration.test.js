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

  test('opens PPTX files without decoding binary ZIP data as editor text', async () => {
    const workspace = fsSync.mkdtempSync(path.join(os.tmpdir(), 'nightowl-pptx-open-'));
    const deckPath = path.join(workspace, 'deck.pptx');
    fsSync.writeFileSync(deckPath, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]));

    try {
      fileHandlers.register({
        appSettings: { workingDirectory: workspace, workspaceFolders: [] },
        saveSettings: jest.fn(),
        getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
        getCurrentFilePath: jest.fn(),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => workspace),
        setCurrentWorkingDirectory: jest.fn(),
        currentWorkingDirectory: workspace,
        userDataPath: '/mock/user-data'
      });

      await expect(getRegisteredHandler('open-file-path')({}, deckPath)).resolves.toMatchObject({
        success: true,
        filePath: deckPath,
        content: ''
      });
    } finally {
      fsSync.rmSync(workspace, { recursive: true, force: true });
    }
  });

  test('extract-text-with-replacement writes the new file and updates the source inside the workspace', async () => {
    const workspace = fsSync.mkdtempSync(path.join(os.tmpdir(), 'nightowl-extract-text-'));
    const originalFilePath = path.join(workspace, 'source.md');
    const newFilePath = path.join(workspace, 'extracted.md');
    fsSync.writeFileSync(originalFilePath, '# Source\n\nSelected passage.\n');

    try {
      fileHandlers.register({
        appSettings: { workingDirectory: workspace, workspaceFolders: [] },
        saveSettings: jest.fn(),
        getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
        getCurrentFilePath: jest.fn(() => originalFilePath),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => workspace),
        setCurrentWorkingDirectory: jest.fn(),
        currentWorkingDirectory: workspace,
        userDataPath: '/mock/user-data'
      });

      const handler = getRegisteredHandler('extract-text-with-replacement');
      const result = await handler({}, {
        originalFilePath,
        textToReplace: 'Selected passage.',
        replacementText: '[[extracted]]',
        newFilePath,
        newFileContent: '# Extracted\n\nSelected passage.'
      });

      expect(result).toMatchObject({ success: true, originalFilePath, newFilePath });
      expect(fsSync.readFileSync(originalFilePath, 'utf8')).toContain('[[extracted]]');
      expect(fsSync.readFileSync(newFilePath, 'utf8')).toContain('Selected passage.');
    } finally {
      fsSync.rmSync(workspace, { recursive: true, force: true });
    }
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

      for (let cycle = 0; cycle < 10; cycle += 1) {
        setCurrentFile(null, filePath);
      }
      expect(fileHandlers.getDiagnostics()).toEqual(expect.objectContaining({
        watcher: 1,
        timers: 0
      }));
      expect(watchSpy).toHaveBeenCalledTimes(11);

      fileHandlers.cleanup();
      fileHandlers.cleanup();
      expect(fileHandlers.getDiagnostics()).toEqual({
        watcher: 0,
        timers: 0,
        trackedFileStates: 0,
        cachedScans: 0
      });
      expect(watcher.close).toHaveBeenCalledTimes(11);
    } finally {
      fileHandlers.cleanup();
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

  test('open-external rejects non-allowlisted URI schemes without invoking the OS', async () => {
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

    await expect(handler(null, 'javascript:alert(1)')).resolves.toEqual({
      success: false,
      error: 'Unsupported URL protocol: javascript:'
    });
    await expect(handler(null, 'data:text/html,unsafe')).resolves.toEqual({
      success: false,
      error: 'Unsupported URL protocol: data:'
    });
    expect(shell.openExternal).not.toHaveBeenCalled();
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

  test('duplicate-folder recursively copies a subfolder using a conflict-safe sibling name', async () => {
    const workspace = fsSync.mkdtempSync(path.join(os.tmpdir(), 'nightowl-duplicate-folder-'));
    const sourcePath = path.join(workspace, 'Drafts');
    fsSync.mkdirSync(path.join(sourcePath, 'nested'), { recursive: true });
    fsSync.writeFileSync(path.join(sourcePath, 'outline.md'), '# Outline\n', 'utf8');
    fsSync.writeFileSync(path.join(sourcePath, 'nested', 'notes.txt'), 'Notes\n', 'utf8');
    fsSync.mkdirSync(path.join(workspace, 'Drafts copy'));

    try {
      fileHandlers.register({
        appSettings: { workingDirectory: workspace, workspaceFolders: [] },
        saveSettings: jest.fn(),
        getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
        getCurrentFilePath: jest.fn(),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => workspace),
        setCurrentWorkingDirectory: jest.fn(),
        currentWorkingDirectory: workspace,
        userDataPath: '/mock/user-data'
      });

      const duplicateFolder = getRegisteredHandler('duplicate-folder');
      const result = await duplicateFolder({}, sourcePath);
      const destinationPath = path.join(workspace, 'Drafts copy 2');

      expect(result).toEqual(expect.objectContaining({
        success: true,
        sourcePath,
        destinationPath,
        folderName: 'Drafts copy 2'
      }));
      expect(fsSync.readFileSync(path.join(destinationPath, 'outline.md'), 'utf8')).toBe('# Outline\n');
      expect(fsSync.readFileSync(path.join(destinationPath, 'nested', 'notes.txt'), 'utf8')).toBe('Notes\n');
    } finally {
      fileHandlers.cleanup();
      fsSync.rmSync(workspace, { recursive: true, force: true });
    }
  });

  test('duplicate-folder rejects workspace roots and paths outside the workspace', async () => {
    const workspace = fsSync.mkdtempSync(path.join(os.tmpdir(), 'nightowl-duplicate-root-'));
    const outsideFolder = fsSync.mkdtempSync(path.join(os.tmpdir(), 'nightowl-duplicate-outside-'));

    try {
      fileHandlers.register({
        appSettings: { workingDirectory: workspace, workspaceFolders: [] },
        saveSettings: jest.fn(),
        getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
        getCurrentFilePath: jest.fn(),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => workspace),
        setCurrentWorkingDirectory: jest.fn(),
        currentWorkingDirectory: workspace,
        userDataPath: '/mock/user-data'
      });

      const duplicateFolder = getRegisteredHandler('duplicate-folder');

      await expect(duplicateFolder({}, workspace)).resolves.toEqual(expect.objectContaining({
        success: false,
        error: expect.stringContaining('workspace root')
      }));
      await expect(duplicateFolder({}, outsideFolder)).resolves.toEqual(expect.objectContaining({
        success: false,
        error: expect.stringContaining('inside a workspace folder')
      }));
    } finally {
      fileHandlers.cleanup();
      fsSync.rmSync(workspace, { recursive: true, force: true });
      fsSync.rmSync(outsideFolder, { recursive: true, force: true });
    }
  });

  test('duplicate-folder does not follow a workspace symlink to an outside directory', async () => {
    const workspace = fsSync.mkdtempSync(path.join(os.tmpdir(), 'nightowl-duplicate-link-root-'));
    const outsideFolder = fsSync.mkdtempSync(path.join(os.tmpdir(), 'nightowl-duplicate-link-target-'));
    const outsideChild = path.join(outsideFolder, 'private');
    const linkedFolder = path.join(workspace, 'linked');
    fsSync.mkdirSync(outsideChild);
    fsSync.writeFileSync(path.join(outsideChild, 'secret.txt'), 'outside\n', 'utf8');
    fsSync.symlinkSync(outsideFolder, linkedFolder, 'dir');

    try {
      fileHandlers.register({
        appSettings: { workingDirectory: workspace, workspaceFolders: [] },
        saveSettings: jest.fn(),
        getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
        getCurrentFilePath: jest.fn(),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => workspace),
        setCurrentWorkingDirectory: jest.fn(),
        currentWorkingDirectory: workspace,
        userDataPath: '/mock/user-data'
      });

      const result = await getRegisteredHandler('duplicate-folder')({}, path.join(linkedFolder, 'private'));

      expect(result).toEqual(expect.objectContaining({
        success: false,
        error: expect.stringContaining('inside a workspace folder')
      }));
      expect(fsSync.existsSync(path.join(outsideFolder, 'private copy'))).toBe(false);
    } finally {
      fileHandlers.cleanup();
      fsSync.rmSync(workspace, { recursive: true, force: true });
      fsSync.rmSync(outsideFolder, { recursive: true, force: true });
    }
  });
});

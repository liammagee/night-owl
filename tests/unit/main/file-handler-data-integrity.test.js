const fs = require('fs');
const os = require('os');
const path = require('path');
const { ipcMain, dialog, BrowserWindow } = require('electron');
const fileHandlers = require('../../../ipc/fileHandlers');

describe('file handler data integrity', () => {
  let workspace;
  let handlers;
  let currentFilePath;
  let watchSpy;
  let externalDirectory;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-integrity-'));
    externalDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-external-'));
    handlers = new Map();
    currentFilePath = null;
    watchSpy = jest.spyOn(fs, 'watch').mockReturnValue({ close: jest.fn(), on: jest.fn() });
    ipcMain.handle.mockImplementation((channel, handler) => handlers.set(channel, handler));
    fileHandlers.register({
      appSettings: { workingDirectory: workspace },
      saveSettings: jest.fn(),
      getMainWindow: () => ({ webContents: { send: jest.fn() } }),
      getCurrentFilePath: () => currentFilePath,
      setCurrentFilePath: (filePath) => { currentFilePath = filePath; },
      getCurrentWorkingDirectory: () => workspace,
      userDataPath: workspace
    });
  });

  afterEach(() => {
    handlers.get('set-current-file')(null, null);
    watchSpy.mockRestore();
    ipcMain.handle.mockReset();
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(externalDirectory, { recursive: true, force: true });
  });

  test('tab activation preserves the save conflict baseline for unsaved editor content', async () => {
    const filePath = path.join(workspace, 'draft.md');
    fs.writeFileSync(filePath, 'original content');
    const opened = await handlers.get('open-file')(null, filePath);
    expect(opened.success).toBe(true);
    handlers.get('set-current-file')(null, null);

    fs.writeFileSync(filePath, 'external changes that must survive');
    const later = new Date(opened.mtimeMs + 5000);
    fs.utimesSync(filePath, later, later);
    handlers.get('set-current-file')(null, filePath);

    const result = await handlers.get('perform-save')(null, 'unsaved editor changes');
    expect(result).toMatchObject({ success: false, code: 'FILE_MODIFIED_EXTERNALLY' });
    expect(fs.readFileSync(filePath, 'utf8')).toBe('external changes that must survive');
  });

  test.each(['cut', 'copy'])('%s into a folder cannot overwrite an existing document', async (operation) => {
    const source = path.join(workspace, 'draft.md');
    const targetFolder = path.join(workspace, 'notes');
    const destination = path.join(targetFolder, 'draft.md');
    fs.mkdirSync(targetFolder);
    fs.writeFileSync(source, 'source document');
    fs.writeFileSync(destination, 'destination document');

    const result = await handlers.get('move-item')(null, {
      sourcePath: source,
      targetPath: targetFolder,
      operation,
      type: 'file'
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already exists/);
    expect(fs.readFileSync(source, 'utf8')).toBe('source document');
    expect(fs.readFileSync(destination, 'utf8')).toBe('destination document');
  });

  test('saving an inactive tab does not change the current document', async () => {
    const backgroundFile = path.join(workspace, 'background.md');
    const activeFile = path.join(workspace, 'active.md');
    fs.writeFileSync(backgroundFile, 'background content');
    fs.writeFileSync(activeFile, 'active content');
    handlers.get('set-current-file')(null, activeFile);

    const result = await handlers.get('perform-save-with-path')(null, 'saved background content', backgroundFile);

    expect(result.success).toBe(true);
    expect(currentFilePath).toBe(activeFile);
    expect(fs.readFileSync(backgroundFile, 'utf8')).toBe('saved background content');
    expect(fs.readFileSync(activeFile, 'utf8')).toBe('active content');
  });

  test('an opened document outside the workspace can be saved without permitting unrelated paths', async () => {
    const openedPath = path.join(externalDirectory, 'opened.md');
    const unrelatedPath = path.join(externalDirectory, 'unrelated.md');
    fs.writeFileSync(openedPath, 'opened content');
    fs.writeFileSync(unrelatedPath, 'unrelated content');
    expect(await handlers.get('read-file')(null, openedPath)).toMatchObject({ success: true });

    const saved = await handlers.get('perform-save-with-path')(null, 'saved opened content', openedPath);
    const rejected = await handlers.get('perform-save-with-path')(null, 'unexpected overwrite', unrelatedPath);

    expect(saved.success).toBe(true);
    expect(rejected.success).toBe(false);
    expect(fs.readFileSync(openedPath, 'utf8')).toBe('saved opened content');
    expect(fs.readFileSync(unrelatedPath, 'utf8')).toBe('unrelated content');
  });

  test('Save As honors the requested directory and belongs to the requesting window', async () => {
    const sender = {};
    const requestingWindow = { webContents: { send: jest.fn() } };
    BrowserWindow.fromWebContents = jest.fn(() => requestingWindow);
    const savedPath = path.join(externalDirectory, 'chosen.md');
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: savedPath });

    const result = await handlers.get('perform-save-as')({ sender }, {
      content: 'new document', defaultDirectory: externalDirectory, suggestedName: 'chosen.md'
    });

    expect(result.success).toBe(true);
    expect(dialog.showSaveDialog).toHaveBeenCalledWith(requestingWindow, expect.objectContaining({
      defaultPath: savedPath
    }));
    expect(await handlers.get('perform-save-with-path')(null, 'edited after Save As', savedPath))
      .toMatchObject({ success: true });
    expect(fs.readFileSync(savedPath, 'utf8')).toBe('edited after Save As');
  });

  test('moving a document into an empty folder still succeeds', async () => {
    const source = path.join(workspace, 'draft.md');
    const targetFolder = path.join(workspace, 'notes');
    fs.mkdirSync(targetFolder);
    fs.writeFileSync(source, 'source document');

    const result = await handlers.get('move-item')(null, {
      sourcePath: source,
      targetPath: targetFolder,
      operation: 'cut',
      type: 'file'
    });

    expect(result).toMatchObject({ success: true, targetPath: path.join(targetFolder, 'draft.md') });
    expect(fs.existsSync(source)).toBe(false);
    expect(fs.readFileSync(result.targetPath, 'utf8')).toBe('source document');
  });

  test('overlapping recovery saves keep the latest complete snapshot', async () => {
    const snapshots = Array.from({ length: 12 }, (_, index) => ({
      'untitled:1': { content: `draft revision ${index}`, isDirty: true }
    }));
    const results = await Promise.all(snapshots.map((snapshot) =>
      handlers.get('recovery-persist')(null, snapshot)
    ));

    expect(results.every((result) => result.success)).toBe(true);
    expect(await handlers.get('recovery-load')()).toEqual({
      success: true,
      data: snapshots[snapshots.length - 1]
    });
  });

  test('clearing recovery waits for pending snapshots and leaves no stale draft', async () => {
    const saves = Array.from({ length: 3 }, (_, index) =>
      handlers.get('recovery-persist')(null, { draft: { content: `draft revision ${index}` } })
    );
    const clear = handlers.get('recovery-clear')();
    const loaded = handlers.get('recovery-load')();

    expect((await Promise.all([...saves, clear])).every((result) => result.success)).toBe(true);
    expect(await loaded).toEqual({ success: true, data: null });
  });

  test('overlapping new-file requests never overwrite an already-created document', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      handlers.get('create-file')(null, 'new.md', workspace, `new draft ${index}`)
    ));
    const successfulIndexes = results.flatMap((result, index) => result.success ? [index] : []);

    expect(successfulIndexes).toHaveLength(1);
    expect(fs.readFileSync(path.join(workspace, 'new.md'), 'utf8')).toBe(`new draft ${successfulIndexes[0]}`);
    expect(results.filter(result => !result.success).every(result => /already exists/.test(result.error))).toBe(true);
  });
});

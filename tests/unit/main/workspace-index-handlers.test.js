const fs = require('fs');
const os = require('os');
const path = require('path');

describe('workspace index IPC handlers', () => {
  let ipcMain;
  let moduleUnderTest;
  let root;
  let registered;
  let mainWindow;

  function handler(channel) {
    const match = ipcMain.handle.mock.calls.find(([name]) => name === channel);
    if (!match) throw new Error(`Missing handler: ${channel}`);
    return match[1];
  }

  beforeEach(() => {
    jest.resetModules();
    ({ ipcMain } = require('electron'));
    ipcMain.handle.mockClear();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-index-ipc-'));
    fs.writeFileSync(path.join(root, 'note.md'), '# Note\nLinks [[data]] and [@Key].\n');
    fs.writeFileSync(path.join(root, 'data.jsonl'), '{"id":"a","text":"searchable"}\n');
    mainWindow = { isDestroyed: () => false, webContents: { send: jest.fn() } };
    moduleUnderTest = require('../../../ipc/workspaceIndexHandlers');
    registered = moduleUnderTest.register({
      appSettings: { workingDirectory: root, workspaceFolders: [] },
      currentWorkingDirectory: root,
      getCurrentWorkingDirectory: () => root,
      getMainWindow: () => mainWindow
    });
  });

  afterEach(() => {
    moduleUnderTest.cleanup();
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('registers fixed list, search, link, graph, rename-plan, status, refresh, and cancellation capabilities', () => {
    expect(ipcMain.handle.mock.calls.map(([channel]) => channel)).toEqual(expect.arrayContaining([
      'workspace-index-list',
      'workspace-index-search',
      'workspace-index-links',
      'workspace-index-resolve-link',
      'workspace-index-graph',
      'workspace-index-plan-rename',
      'workspace-index-status',
      'workspace-index-refresh',
      'workspace-index-cancel'
    ]));
  });

  test('indexes structured records, publishes progress, and serves shared graph identities', async () => {
    const listed = await handler('workspace-index-list')({}, { limit: 100 });
    expect(listed.success).toBe(true);
    expect(listed.files.map(file => file.name)).toEqual(['data.jsonl', 'note.md']);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'workspace-index-progress',
      expect.objectContaining({ phase: 'complete', state: 'ready' })
    );

    const searched = await handler('workspace-index-search')({}, {
      query: 'searchable',
      options: { maxResults: 10 }
    });
    expect(searched.results[0]).toMatchObject({ fileName: 'data.jsonl', line: 1 });

    const graph = await handler('workspace-index-graph')({}, {});
    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `file:${path.join(root, 'note.md')}` }),
      expect.objectContaining({ id: 'citation:Key' })
    ]));
  });

  test('uses live workspace roots and rejects renderer paths outside them', async () => {
    const outside = path.join(os.tmpdir(), 'outside.md');
    const plan = await handler('workspace-index-plan-rename')({}, {
      filePath: outside,
      newPath: path.join(root, 'renamed.md')
    });
    expect(plan).toEqual({ success: false, error: 'File path is outside the active workspace' });

    fs.writeFileSync(path.join(root, 'new.csv'), 'id,label\na,yes\n');
    moduleUnderTest.invalidate('test-write');
    const refreshed = await handler('workspace-index-refresh')({}, { force: true });
    expect(refreshed.success).toBe(true);
    expect((await handler('workspace-index-list')({}, {})).files.map(file => file.name)).toContain('new.csv');
  });

  test('verifies external changes when recursive watchers are unavailable', async () => {
    await moduleUnderTest.list();
    registered.watchers.clear();
    fs.writeFileSync(path.join(root, 'external.html'), '<h1>External change</h1>');

    const listed = await moduleUnderTest.list();
    expect(listed.files.map(file => file.name)).toContain('external.html');
    expect(moduleUnderTest.getDiagnostics()).toMatchObject({ state: 'ready', dirty: false });
  });

  test('owns and releases recursive watchers with diagnostics', () => {
    expect(moduleUnderTest.getDiagnostics()).toMatchObject({ active: true, indexed: 0, dirty: true });
    expect(registered.watchers.size).toBeGreaterThanOrEqual(0);
    expect(moduleUnderTest.cleanup()).toBe(true);
    expect(moduleUnderTest.getDiagnostics()).toEqual({
      active: false,
      watchers: 0,
      indexed: 0,
      state: 'idle',
      dirty: true
    });
  });
});

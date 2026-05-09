const { ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('Search IPC Handlers Integration', () => {
  let handlers;
  let tempRoot;
  let searchHandlers;

  beforeEach(() => {
    handlers = {};
    ipcMain.handle.mockClear();
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-search-'));
    searchHandlers = require('../../ipc/searchHandlers');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  function registerSearchHandlers(settings = {}, runtimeDirectory = tempRoot) {
    searchHandlers.register({
      appSettings: {
        workingDirectory: tempRoot,
        workspaceFolders: [],
        ...settings
      },
      currentWorkingDirectory: runtimeDirectory,
      getCurrentWorkingDirectory: () => runtimeDirectory
    });
  }

  test('wildcard file search finds HTML files', async () => {
    fs.writeFileSync(path.join(tempRoot, 'index.html'), '<h1>Home</h1>');
    fs.writeFileSync(path.join(tempRoot, 'notes.md'), '# Notes');
    fs.mkdirSync(path.join(tempRoot, 'pages'));
    fs.writeFileSync(path.join(tempRoot, 'pages', 'about.HTML'), '<h1>About</h1>');
    fs.mkdirSync(path.join(tempRoot, 'node_modules'));
    fs.writeFileSync(path.join(tempRoot, 'node_modules', 'ignored.html'), '<h1>Ignored</h1>');
    registerSearchHandlers();

    const result = await handlers['global-search']({}, { query: '*.html' });

    expect(result.success).toBe(true);
    expect(result.isFilePatternSearch).toBe(true);
    expect(result.fileMatches.map(file => file.relativePath).sort()).toEqual([
      'index.html',
      path.join('pages', 'about.HTML')
    ]);
  });

  test('wildcard file search uses runtime directory when saved directory is stale', async () => {
    fs.writeFileSync(path.join(tempRoot, 'index.html'), '<h1>Home</h1>');
    registerSearchHandlers({
      workingDirectory: path.join(tempRoot, 'missing')
    }, tempRoot);

    const result = await handlers['global-search']({}, { query: '*.html' });

    expect(result.success).toBe(true);
    expect(result.fileMatches).toHaveLength(1);
    expect(result.fileMatches[0].relativePath).toBe('index.html');
  });

  test('wildcard file search trims whitespace and optional surrounding quotes', async () => {
    fs.writeFileSync(path.join(tempRoot, 'index.html'), '<h1>Home</h1>');
    registerSearchHandlers();

    const result = await handlers['global-search']({}, { query: ' "*.html" ' });

    expect(result.success).toBe(true);
    expect(result.isFilePatternSearch).toBe(true);
    expect(result.fileMatches).toHaveLength(1);
    expect(result.fileMatches[0].relativePath).toBe('index.html');
  });
});

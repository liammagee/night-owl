const { ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('Search IPC Handlers Integration', () => {
  let handlers;
  let tempRoot;
  let searchHandlers;
  let workspaceIndexHandlers;

  beforeEach(() => {
    handlers = {};
    ipcMain.handle.mockClear();
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-search-'));
    searchHandlers = require('../../ipc/searchHandlers');
    workspaceIndexHandlers = require('../../ipc/workspaceIndexHandlers');
  });

  afterEach(() => {
    workspaceIndexHandlers.cleanup();
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

  test('global search consumes the shared index across CSV, JSONL, HTML, and Markdown', async () => {
    fs.writeFileSync(path.join(tempRoot, 'labels.csv'), 'id,label\na,indexed-csv-value\n');
    fs.writeFileSync(path.join(tempRoot, 'items.jsonl'), '{"id":"a","text":"indexed-jsonl-value"}\n');
    fs.writeFileSync(path.join(tempRoot, 'page.html'), '<p>indexed-html-value</p>');
    fs.writeFileSync(path.join(tempRoot, 'note.md'), 'indexed-markdown-value');
    const deps = {
      appSettings: { workingDirectory: tempRoot, workspaceFolders: [] },
      currentWorkingDirectory: tempRoot,
      getCurrentWorkingDirectory: () => tempRoot
    };
    workspaceIndexHandlers.register(deps);
    searchHandlers.register(deps);

    for (const [query, expectedFile] of [
      ['indexed-csv-value', 'labels.csv'],
      ['indexed-jsonl-value', 'items.jsonl'],
      ['indexed-html-value', 'page.html'],
      ['indexed-markdown-value', 'note.md']
    ]) {
      const result = await handlers['global-search']({}, { query, options: {} });
      expect(result).toMatchObject({ success: true, indexed: true });
      expect(result.results[0].fileName).toBe(expectedFile);
    }
  });
  test('replace processes each selected occurrence once, preserves CRLF, and backs up originals', async () => {
    const file = path.join(tempRoot, 'repeat.md');
    fs.writeFileSync(file, 'cat cat\r\nkeep\r\n');
    registerSearchHandlers();
    const found = await handlers['global-search']({}, { query: 'cat' });
    const request = { searchQuery: 'cat', replaceText: 'catcat', searchResults: found.results };
    const preview = await handlers['global-replace']({}, { ...request, options: { previewOnly: true } });
    expect(preview).toMatchObject({ success: true, replacedCount: 2, modifiedFiles: 0 });
    expect(preview.results[0]).toMatchObject({ before: 'cat cat\r', after: 'catcat catcat\r' });
    expect(fs.readFileSync(file, 'utf8')).toBe('cat cat\r\nkeep\r\n');
    const result = await handlers['global-replace']({}, request);
    expect(result).toMatchObject({ success: true, replacedCount: 2, modifiedFiles: 1 });
    expect(fs.readFileSync(file, 'utf8')).toBe('catcat catcat\r\nkeep\r\n');
    expect(fs.readdirSync(path.join(tempRoot, '.nightowl-backups')).some(name => name.endsWith('.bak'))).toBe(true);
  });

  test('replace refuses stale search results without altering the file', async () => {
    const file = path.join(tempRoot, 'stale.md');
    fs.writeFileSync(file, 'cat original');
    registerSearchHandlers();
    const found = await handlers['global-search']({}, { query: 'cat' });
    fs.writeFileSync(file, 'cat externally edited');
    const result = await handlers['global-replace']({}, { searchQuery: 'cat', replaceText: 'dog', searchResults: found.results });
    expect(result.success).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe('cat externally edited');
  });

  test('replace rejects a symlink outside the workspace', async () => {
    const workspace = path.join(tempRoot, 'workspace');
    fs.mkdirSync(workspace);
    const outside = path.join(tempRoot, 'outside.md');
    fs.writeFileSync(outside, 'cat');
    const link = path.join(workspace, 'link.md');
    fs.symlinkSync(outside, link);
    registerSearchHandlers({ workingDirectory: workspace }, workspace);
    const result = await handlers['global-replace']({}, { searchQuery: 'cat', replaceText: 'dog', searchResults: [{ file: link, line: 1, column: 1, match: 'cat', text: 'cat' }] });
    expect(result.success).toBe(false);
    expect(fs.readFileSync(outside, 'utf8')).toBe('cat');
  });

  test('regex queries ending in a star remain content searches and obey the file filter', async () => {
    fs.writeFileSync(path.join(tempRoot, 'one.md'), 'cats');
    fs.writeFileSync(path.join(tempRoot, 'two.txt'), 'cats');
    registerSearchHandlers();
    const result = await handlers['global-search']({}, { query: 'cats*', options: { useRegex: true, filePattern: '*.md' } });
    expect(result.success).toBe(true);
    expect(result.isFilePatternSearch).not.toBe(true);
    expect(result.results.map(item => item.fileName)).toEqual(['one.md']);
  });

});

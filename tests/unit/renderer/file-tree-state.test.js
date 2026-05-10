describe('file-tree-state', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    delete window.NightOwlFileTreeState;
    delete window.setActiveTreeFolder;
    delete window.selectedFolderPath;
    require('../../../orchestrator/modules/file-tree-state.js');
  });

  test('tracks active folder and updates tree highlight', () => {
    document.body.innerHTML = `
      <div class="file-tree-item folder" data-path="/workspace/a"></div>
      <div class="file-tree-item folder folder-active" data-path="/workspace/b"></div>
    `;

    window.NightOwlFileTreeState.setActiveTreeFolder('/workspace/a');

    expect(window.selectedFolderPath).toBe('/workspace/a');
    expect(document.querySelector('[data-path="/workspace/a"]').classList.contains('folder-active')).toBe(true);
    expect(document.querySelector('[data-path="/workspace/b"]').classList.contains('folder-active')).toBe(false);
  });

  test('normalizes cut and copy clipboard state', () => {
    window.NightOwlFileTreeState.setClipboard({
      filePath: '/workspace/a.md',
      filePaths: ['/workspace/a.md', '/workspace/b.md'],
      operation: 'cut'
    });

    expect(window.NightOwlFileTreeState.hasClipboardItems()).toBe(true);
    expect(window.NightOwlFileTreeState.getClipboardPaths()).toEqual([
      '/workspace/a.md',
      '/workspace/b.md'
    ]);
    expect(window.NightOwlFileTreeState.describeClipboard()).toBe('2 files');
    expect(window.NightOwlFileTreeState.getClipboard().operation).toBe('cut');

    window.NightOwlFileTreeState.clearClipboard();

    expect(window.NightOwlFileTreeState.hasClipboardItems()).toBe(false);
    expect(window.NightOwlFileTreeState.getClipboardPaths()).toEqual([]);
  });
});

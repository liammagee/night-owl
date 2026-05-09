const modulePath = '../../../orchestrator/modules/dragdrop.js';

describe('file tree drag and drop', () => {
  let dragdrop;

  beforeEach(() => {
    jest.resetModules();
    window.__NIGHTOWL_DISABLE_AUTO_DRAGDROP = true;
    delete window.NightOwlDragDrop;
    dragdrop = require(modulePath);
  });

  afterEach(() => {
    delete window.__NIGHTOWL_DISABLE_AUTO_DRAGDROP;
  });

  function createFileElement(filePath) {
    const element = document.createElement('div');
    element.className = 'file-tree-item file';
    element.dataset.path = filePath;
    return element;
  }

  test('dragging a selected file carries all selected files', () => {
    window.getSelectedFiles = jest.fn(() => [
      '/workspace/src/a.md',
      '/workspace/src/b.md'
    ]);

    const item = dragdrop.createDraggedItemFromElement(createFileElement('/workspace/src/a.md'));

    expect(item.isMulti).toBe(true);
    expect(item.paths).toEqual(['/workspace/src/a.md', '/workspace/src/b.md']);
    expect(item.items).toEqual([
      { path: '/workspace/src/a.md', type: 'file', name: 'a.md' },
      { path: '/workspace/src/b.md', type: 'file', name: 'b.md' }
    ]);
  });

  test('moving selected files invokes one move per file and rekeys open state', async () => {
    const deps = {
      currentFilePath: '/workspace/src/a.md',
      electronAPI: {
        invoke: jest.fn(async (channel, payload) => ({
          success: true,
          targetPath: `/workspace/dest/${payload.sourcePath.split('/').pop()}`
        }))
      },
      syncMovedPathWithOpenTabs: jest.fn(),
      updateBreadcrumb: jest.fn()
    };

    const item = {
      isMulti: true,
      items: [
        { path: '/workspace/src/a.md', type: 'file', name: 'a.md' },
        { path: '/workspace/src/b.md', type: 'file', name: 'b.md' }
      ]
    };

    const summary = await dragdrop.moveDraggedItemsToFolder(item, '/workspace/dest', deps);

    expect(summary).toEqual(expect.objectContaining({ moved: 2, failed: 0, skipped: 0 }));
    expect(deps.electronAPI.invoke).toHaveBeenCalledTimes(2);
    expect(deps.electronAPI.invoke).toHaveBeenNthCalledWith(1, 'move-item', {
      sourcePath: '/workspace/src/a.md',
      targetPath: '/workspace/dest',
      operation: 'cut',
      type: 'file'
    });
    expect(deps.electronAPI.invoke).toHaveBeenNthCalledWith(2, 'move-item', {
      sourcePath: '/workspace/src/b.md',
      targetPath: '/workspace/dest',
      operation: 'cut',
      type: 'file'
    });
    expect(deps.currentFilePath).toBe('/workspace/dest/a.md');
    expect(deps.updateBreadcrumb).toHaveBeenCalledWith('/workspace/dest/a.md');
    expect(deps.syncMovedPathWithOpenTabs).toHaveBeenCalledWith('/workspace/src/a.md', '/workspace/dest/a.md', false);
    expect(deps.syncMovedPathWithOpenTabs).toHaveBeenCalledWith('/workspace/src/b.md', '/workspace/dest/b.md', false);
  });

  test('moving selected files to their current folder is a no-op', async () => {
    const deps = {
      electronAPI: { invoke: jest.fn() }
    };
    const item = {
      isMulti: true,
      items: [
        { path: '/workspace/src/a.md', type: 'file', name: 'a.md' },
        { path: '/workspace/src/b.md', type: 'file', name: 'b.md' }
      ]
    };

    const summary = await dragdrop.moveDraggedItemsToFolder(item, '/workspace/src', deps);

    expect(summary).toEqual(expect.objectContaining({ moved: 0, failed: 0, skipped: 2 }));
    expect(deps.electronAPI.invoke).not.toHaveBeenCalled();
  });
});

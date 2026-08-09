describe('workspace index renderer consumers', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    delete window.TagManager;
    delete window.tagManager;
  });

  test('hydrates the synchronous tag consumer from indexed identities', () => {
    require('../../../orchestrator/modules/tagManager.js');
    const count = window.tagManager.hydrateIndexedFiles([
      {
        path: '/workspace/a.md',
        title: 'A',
        tags: ['research', 'review'],
        metadata: { category: 'notes' }
      },
      {
        path: '/workspace/b.md',
        title: 'B',
        tags: ['research'],
        metadata: {}
      }
    ]);

    expect(count).toBe(2);
    expect(window.tagManager.getFileTags('/workspace/a.md')).toEqual(['research', 'review']);
    expect(window.tagManager.getFileMetadata('/workspace/a.md')).toMatchObject({ title: 'A', category: 'notes' });
    expect(window.tagManager.getAllTags()[0]).toMatchObject({ tag: 'research', count: 2 });
  });

  test('loads visualization files from the shared index before applying existing filters', async () => {
    window.electronAPI = {
      search: {
        workspaceIndexList: jest.fn(async () => ({
          success: true,
          files: [
            { path: '/workspace/notes/a.md', relativePath: 'notes/a.md' },
            { path: '/workspace/tests/ignored.md', relativePath: 'tests/ignored.md' }
          ]
        }))
      },
      workspace: { getAvailableFiles: jest.fn(async () => []) },
      settings: {
        getSettings: jest.fn(async () => ({
          visualization: { includePatterns: ['**/*.md'], excludePatterns: ['**/tests/**'] }
        }))
      }
    };
    require('../../../orchestrator/modules/fileFilters.js');

    const result = await window.getFilteredVisualizationFiles();
    expect(window.electronAPI.search.workspaceIndexList).toHaveBeenCalledWith({
      extensions: ['.md', '.markdown'],
      limit: 50000
    });
    expect(window.electronAPI.workspace.getAvailableFiles).not.toHaveBeenCalled();
    expect(result.files.map(file => file.relativePath)).toEqual(['notes/a.md']);
  });

  test('adapts shared graph nodes and edges without rereading every file', () => {
    global.d3 = { zoomIdentity: {} };
    window.d3 = global.d3;
    require('../../../orchestrator/modules/graph.js');
    const graph = new window.GraphView();
    graph.loadIndexedGraph({
      nodes: [
        { id: 'file:/workspace/a.md', name: 'A', type: 'file', filePath: '/workspace/a.md' },
        { id: 'tag:research', name: '#research', type: 'tag' }
      ],
      edges: [{ source: 'file:/workspace/a.md', target: 'tag:research', type: 'tag' }],
      unresolved: [{ target: 'missing' }]
    });

    expect(graph.nodes).toHaveLength(2);
    expect(graph.links[0]).toMatchObject({ type: 'tagged', strength: 0.4 });
    expect(graph.nodeMap.has('file:/workspace/a.md')).toBe(true);
    expect(graph.unresolvedLinks).toEqual([{ target: 'missing' }]);
  });
});

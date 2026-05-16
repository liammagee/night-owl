const fileTreeFilter = require('../../../orchestrator/modules/file-tree-filter.js');

describe('file-tree-filter', () => {
  const tree = {
    name: 'workspace',
    type: 'directory',
    path: '/workspace',
    children: [
      {
        name: 'docs',
        type: 'directory',
        path: '/workspace/docs',
        children: [
          { name: 'essay.md', type: 'file', path: '/workspace/docs/essay.md' },
          { name: 'notes.md', type: 'file', path: '/workspace/docs/notes.md' }
        ]
      },
      {
        name: 'src',
        type: 'directory',
        path: '/workspace/src',
        children: [
          { name: 'app.js', type: 'file', path: '/workspace/src/app.js' }
        ]
      }
    ]
  };

  test('keeps ancestors for files matching a search query', () => {
    const result = fileTreeFilter.filterTree(tree, { query: 'essay' });

    expect(result.hasFilter).toBe(true);
    expect(result.matchCount).toBe(1);
    expect(result.tree.children).toHaveLength(1);
    expect(result.tree.children[0].name).toBe('docs');
    expect(result.tree.children[0].children).toEqual([
      { name: 'essay.md', type: 'file', path: '/workspace/docs/essay.md' }
    ]);
  });

  test('querying a folder name keeps its descendants visible', () => {
    const result = fileTreeFilter.filterTree(tree, { query: 'docs' });

    expect(result.matchCount).toBe(2);
    expect(result.tree.children).toHaveLength(1);
    expect(result.tree.children[0].children.map(child => child.name)).toEqual([
      'essay.md',
      'notes.md'
    ]);
  });

  test('matches active tags case-insensitively', () => {
    const tagManager = {
      getFileTags: jest.fn((filePath) => {
        if (filePath.endsWith('notes.md')) return ['Pedagogy'];
        return [];
      })
    };

    const result = fileTreeFilter.filterTree(tree, {
      activeTags: ['pedagogy'],
      tagManager
    });

    expect(result.matchCount).toBe(1);
    expect(result.tree.children[0].children[0].name).toBe('notes.md');
  });

  test('combines text search with active tag filters', () => {
    const tagManager = {
      getFileTags: jest.fn((filePath) => {
        if (filePath.endsWith('essay.md')) return ['Draft'];
        if (filePath.endsWith('notes.md')) return ['Pedagogy'];
        return [];
      })
    };

    const result = fileTreeFilter.filterTree(tree, {
      query: 'docs',
      activeTags: ['draft'],
      tagManager
    });

    expect(result.matchCount).toBe(1);
    expect(result.tree.children[0].children[0].name).toBe('essay.md');
  });
});

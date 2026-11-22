const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);
describe('global replacement UI contract', () => {
  beforeEach(() => {
    jest.resetModules();
    document.getElementById = nativeGetElementById;
    document.body.innerHTML = '<input id="global-search-input" value="cat"><input id="global-replace-input" value="dog"><div id="search-results"></div><div id="search-results-count"></div>';
    const results = [{ file: '/notes.md', line: 1, column: 1, match: 'cat', text: 'cat' }];
    window.electronAPI = { search: {
      globalSearch: jest.fn(async () => ({ success: true, results })),
      globalReplace: jest.fn(async () => ({ success: true, replacedCount: 1, modifiedFiles: 1, modifiedFilePaths: ['/notes.md'], results: [{ file: '/notes.md', fileName: '<img src=x onerror=alert(1)>.md', line: 1, before: 'cat', after: 'dog' }] }))
    } };
    window.currentFilePath = '/notes.md';
    window.showAppConfirm = jest.fn(async () => true);
    window.openFilePathInEditor = jest.fn();
    require('../../../orchestrator/modules/search');
  });
  test('sends fresh search results, uses count/path contracts, and escapes filenames', async () => {
    await window.performGlobalReplace(false);
    expect(window.electronAPI.search.globalReplace).toHaveBeenCalledWith(expect.objectContaining({ searchResults: [expect.objectContaining({ column: 1 })] }));
    expect(document.getElementById('search-results-count').textContent).toBe('Replaced 1 occurrences');
    expect(window.openFilePathInEditor).toHaveBeenCalledWith('/notes.md', expect.objectContaining({ refreshExistingTabContent: true }));
    expect(document.querySelector('#search-results img')).toBeNull();
  });
  test('shows actual preview before and after content', async () => {
    await window.performGlobalReplace(true);
    expect(document.getElementById('search-results').textContent).toContain('Before: cat');
    expect(document.getElementById('search-results').textContent).toContain('After: dog');
    expect(window.openFilePathInEditor).not.toHaveBeenCalled();
  });
});

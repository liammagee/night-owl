describe('current-file-state', () => {
  beforeEach(() => {
    jest.resetModules();
    window.currentFilePath = null;
    window.editorFileName = null;
    window.currentFileDirectory = '';
    window.electronAPI = {
      invoke: jest.fn().mockResolvedValue({ success: true })
    };
    require('../../../orchestrator/modules/current-file-state.js');
  });

  test('sets legacy current-file globals from one helper', async () => {
    await window.NightOwlCurrentFile.set('/workspace/articles/a.md', { syncMain: true });

    expect(window.currentFilePath).toBe('/workspace/articles/a.md');
    expect(window.editorFileName).toBe('/workspace/articles/a.md');
    expect(window.currentFileDirectory).toBe('/workspace/articles');
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('set-current-file', '/workspace/articles/a.md');
  });

  test('clears current-file globals and syncs null to main', async () => {
    window.currentFilePath = '/workspace/a.md';
    window.editorFileName = '/workspace/a.md';
    window.currentFileDirectory = '/workspace';

    await window.NightOwlCurrentFile.clear({ syncMain: true });

    expect(window.currentFilePath).toBeNull();
    expect(window.editorFileName).toBeNull();
    expect(window.currentFileDirectory).toBe('');
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('set-current-file', null);
  });
});

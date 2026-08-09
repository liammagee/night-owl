describe('internalLinks module', () => {
  const modulePath = '../../../orchestrator/modules/internalLinks.js';
  let readFileContent;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.appSettings = {
      workingDirectory: '/workspace',
      linkPreview: { mode: 'hover' }
    };
    readFileContent = jest.fn();
    window.electronAPI = { files: { readFileContent } };
    window.currentFilePath = '/workspace/notes/source.md';
    window.openFileInEditor = jest.fn();
    window.showNotification = jest.fn();
    window.marked = {
      parse: jest.fn((value) => `<p>${value}</p>`)
    };
    global.alert = jest.fn();
  });

  test('stores normalized relative targets in rendered internal links', async () => {
    require(modulePath);

    const rendered = await window.processInternalLinks('Open [[notes/today]]');

    expect(rendered).toContain('data-link="notes%2Ftoday.md"');
    expect(rendered).not.toContain('%2Fworkspace%2F');
  });

  test('opens relative links against the working directory', async () => {
    require(modulePath);
    readFileContent.mockResolvedValueOnce({
      success: true,
      filePath: '/workspace/notes/today.md',
      content: '# Today'
    });

    await window.openInternalLink('notes/today.md', 'notes/today');

    expect(readFileContent).toHaveBeenCalledWith('/workspace/notes/today.md');
    expect(window.openFileInEditor).toHaveBeenCalledWith(
      '/workspace/notes/today.md',
      '# Today',
      { isInternalLinkPreview: true }
    );
  });

  test('uses notifications instead of blocking alerts when a link is missing', async () => {
    require(modulePath);
    readFileContent.mockResolvedValueOnce({
      success: false
    });

    await window.openInternalLink('missing.md', 'missing');

    expect(window.showNotification).toHaveBeenCalledWith('File not found: missing.md', 'warning');
    expect(global.alert).not.toHaveBeenCalled();
  });

  test('resolves links through the shared multi-root workspace index', async () => {
    const workspaceIndexResolveLink = jest.fn(async () => ({
      success: true,
      resolvedPath: '/second-root/reference.md'
    }));
    window.electronAPI.search = { workspaceIndexResolveLink };
    require(modulePath);
    readFileContent.mockResolvedValueOnce({
      success: true,
      filePath: '/second-root/reference.md',
      content: '# Shared reference'
    });

    await window.openInternalLink('reference.md', 'reference');

    expect(workspaceIndexResolveLink).toHaveBeenCalledWith({
      sourcePath: '/workspace/notes/source.md',
      target: 'reference.md'
    });
    expect(readFileContent).toHaveBeenCalledWith('/second-root/reference.md');
    expect(window.openFileInEditor).toHaveBeenCalledWith(
      '/second-root/reference.md',
      '# Shared reference',
      { isInternalLinkPreview: true }
    );
  });
});

const path = require('path');

const modulePath = path.resolve(__dirname, '../../../orchestrator/modules/static-site.js');

describe('validated static publishing renderer', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    delete window.NightOwlStaticSite;
    delete window.staticSite;
    window.TechneMarkdownRenderer = {
      renderTrustedHtml: jest.fn(async ({ markdownContent, filePath, processInternalLinksHTML }) => ({
        contract: 'nightowl-trusted-markdown-v1',
        html: await processInternalLinksHTML(`<h1>${markdownContent}</h1><p>[[Guide]]</p><code>${filePath}</code>`)
      }))
    };
  });

  test('prepares every page through the trusted renderer and preserves profile handoff metadata', async () => {
    const api = require(modulePath);
    const profile = { id: 'machinespirits-public-site', title: 'Machine Spirits public site' };
    const request = await api.preparePublication([
      { sourcePath: '/workspace/index.md', title: 'Home', content: 'Home' },
      { sourcePath: '/workspace/guide.md', title: 'Guide', content: 'Guide' }
    ], { title: 'Machine Spirits', profile });

    expect(window.TechneMarkdownRenderer.renderTrustedHtml).toHaveBeenCalledTimes(2);
    expect(request.options).toEqual({ title: 'Machine Spirits', profile });
    expect(request.files).toHaveLength(2);
    expect(request.files[0]).toMatchObject({
      sourcePath: '/workspace/index.md',
      contract: 'nightowl-trusted-markdown-v1'
    });
    expect(request.files[0].html).toContain('data-link="Guide.md"');
  });

  test('collects the unsaved editor buffer once and reads remaining Markdown files from disk', async () => {
    window.currentFilePath = '/workspace/current.md';
    window.editor = { getModel: () => ({}), getValue: () => 'Unsaved editor text' };
    window.fileTreeData = [{
      type: 'folder',
      children: [
        { type: 'file', name: 'current.md', path: '/workspace/current.md' },
        { type: 'file', name: 'other.md', path: '/workspace/other.md' },
        { type: 'file', name: 'image.png', path: '/workspace/image.png' }
      ]
    }];
    window.electronAPI = {
      files: { readFile: jest.fn(async filePath => ({ success: true, content: `Disk: ${filePath}` })) }
    };
    const api = require(modulePath);

    const files = await api.collectMarkdownFiles();
    expect(files).toEqual([
      expect.objectContaining({ sourcePath: '/workspace/current.md', content: 'Unsaved editor text', sourceState: 'editor' }),
      expect.objectContaining({ sourcePath: '/workspace/other.md', content: 'Disk: /workspace/other.md', sourceState: 'disk' })
    ]);
    expect(window.electronAPI.files.readFile).toHaveBeenCalledTimes(1);
  });

  test('turns wiki links into inert publication targets for main-process resolution', () => {
    const api = require(modulePath);
    expect(api.linkifyWikiLinks('See [[guide|the guide]] and [[notes.md#Part]].')).toBe(
      'See <a href="#" class="internal-link" data-link="guide.md">the guide</a> and <a href="#" class="internal-link" data-link="notes.md%23Part">notes.md#Part</a>.'
    );
  });
});

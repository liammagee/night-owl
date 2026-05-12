const path = require('path');

const pluginEntryPath = path.resolve(__dirname, '../../../../plugins/techne-markdown-renderer/plugin.js');
const bibtexParserPath = path.resolve(__dirname, '../../../../plugins/techne-markdown-renderer/bibtexParser.js');
const pluginCorePath = path.resolve(
  __dirname,
  '../../../../plugins/techne-markdown-renderer/techne-markdown-renderer.js'
);
const previewMarkdownPath = path.resolve(__dirname, '../../../../orchestrator/modules/preview-markdown.js');
const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);

describe('techne-markdown-renderer plugin', () => {
  let registered = null;

  beforeEach(() => {
    jest.resetModules();
    document.getElementById = nativeGetElementById;

    registered = null;
    delete window.TechneMarkdownRenderer;
    delete window.TechneBibtexParser;
    delete window.TechneCitationRenderer;
    delete window.NightOwlPreviewMarkdown;
    delete window.previewZoom;
    delete window.currentSpeakerNotes;
    delete window.bibEntries;

    document.head.innerHTML = '';
    document.body.innerHTML = `
      <div id="preview-pane"><div id="preview-content"></div></div>
    `;

    class Renderer {
      heading(text, level) {
        return `<h${level}>${text}</h${level}>`;
      }
      image(href, title, text) {
        const titleAttr = title ? ` title="${title}"` : '';
        return `<img src="${href}" alt="${text || ''}"${titleAttr} />`;
      }
      list(body, ordered, start) {
        const type = ordered ? 'ol' : 'ul';
        const startAttr = ordered && start !== 1 ? ` start="${start}"` : '';
        return `<${type}${startAttr}>${body}</${type}>`;
      }
      listitem(text) {
        return `<li>${text}</li>`;
      }
    }

    // Mock marked v13+ API with use() support
    let rendererExtensions = {};

    window.marked = {
      Renderer,
      use: (opts = {}) => {
        if (opts.renderer) {
          Object.assign(rendererExtensions, opts.renderer);
        }
      },
      parse: (markdown, opts = {}) => {
        const lines = String(markdown || '').split('\n');
        const out = [];
        for (const line of lines) {
          if (!line.trim()) continue;
          const m = line.match(/^(#{1,6})\s+(.+)$/);
          if (m) {
            // Use v13+ renderer extension if registered via use()
            if (rendererExtensions.heading) {
              out.push(rendererExtensions.heading({ text: m[2], depth: m[1].length, raw: m[2] }));
            } else {
              out.push(`<h${m[1].length}>${m[2]}</h${m[1].length}>`);
            }
            continue;
          }
          if (line.trim().startsWith('<')) {
            out.push(line.trim());
            continue;
          }
          out.push(`<p>${line}</p>`);
        }
        return out.join('\n');
      }
    };

    window.NightOwlFeatures = {
      register: (plugin) => {
        registered = plugin;
      }
    };
  });

  test('registers with NightOwlFeatures', () => {
    require(pluginEntryPath);
    expect(registered).toBeTruthy();
    expect(registered.id).toBe('techne-markdown-renderer');
    expect(typeof registered.init).toBe('function');
  });

  test('core renderer adds heading ids and extracts speaker notes', async () => {
    require(pluginCorePath);

    const html = await window.TechneMarkdownRenderer.renderToHtml(
      `# Title\n\nHello [[world]]\n\n\`\`\`notes\nsecret\n\`\`\``,
      {
        filePath: 'test.md',
        baseDir: '/tmp',
        previewZoom: null,
        processInternalLinksHTML: async (value) =>
          String(value).replace('[[world]]', '<a class="internal-link">world</a>')
      }
    );

    expect(html).toContain('id="heading-title"');
    expect(html).toContain('<a class="internal-link">world</a>');
    expect(html).toContain('speaker-notes-placeholder');

    expect(Array.isArray(window.currentSpeakerNotes)).toBe(true);
    expect(window.currentSpeakerNotes.length).toBe(1);
    expect(window.currentSpeakerNotes[0].content).toBe('secret');
  });

  test('renderPreview writes to the preview element', async () => {
    require(previewMarkdownPath);
    require(pluginCorePath);

    const previewElement = document.getElementById('preview-content');
    const renderMathInContent = jest.fn(async () => {});
    const renderMermaidDiagrams = jest.fn(async () => {});
    const updateSpeakerNotesDisplay = jest.fn();

    await window.TechneMarkdownRenderer.renderPreview({
      markdownContent: '# Hello',
      previewElement,
      filePath: 'test.md',
      baseDir: '/tmp',
      previewZoom: null,
      renderMathInContent,
      renderMermaidDiagrams,
      updateSpeakerNotesDisplay
    });

    expect(previewElement.innerHTML).toContain('heading-hello');
    expect(renderMathInContent).toHaveBeenCalledTimes(1);
    expect(renderMermaidDiagrams).toHaveBeenCalledTimes(1);
    expect(updateSpeakerNotesDisplay).toHaveBeenCalledTimes(1);
  });

  test('renderPreview sanitizes dangerous raw HTML before writing preview', async () => {
    require(previewMarkdownPath);
    require(pluginCorePath);

    const previewElement = document.getElementById('preview-content');
    await window.TechneMarkdownRenderer.renderPreview({
      markdownContent: '<script>alert(1)</script>\n<a href="javascript:alert(1)" onclick="alert(1)">bad</a>',
      previewElement,
      filePath: 'test.md',
      baseDir: '/tmp',
      previewZoom: null
    });

    expect(previewElement.querySelector('script')).toBeNull();
    expect(previewElement.innerHTML).not.toContain('javascript:');
    expect(previewElement.innerHTML).not.toContain('onclick');
    expect(previewElement.textContent).toContain('bad');
  });

  test('BibTeX parser reads local files through Electron IPC instead of fetch', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    window.electronAPI = {
      invoke: jest.fn(async (channel, payload) => {
        if (channel === 'get-working-directory') return '/workspace';
        if (channel === 'read-file') {
          return {
            success: true,
            filePath: payload,
            content: '@book{hegel1807,title={Phenomenology of Spirit},author={Hegel, G. W. F.},year={1807}}'
          };
        }
        return null;
      })
    };

    require(bibtexParserPath);

    const entries = await window.TechneBibtexParser.loadFromFile('/workspace/references.bib');

    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe('hegel1807');
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('read-file', '/workspace/references.bib');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('optional missing BibTeX files do not log startup errors', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    console.error = jest.fn();
    window.electronAPI = {
      invoke: jest.fn(async (channel) => {
        if (channel === 'get-working-directory') return '/workspace';
        if (channel === 'read-file') {
          return { success: false, error: 'File not found' };
        }
        return null;
      })
    };

    require(bibtexParserPath);

    await expect(
      window.TechneBibtexParser.loadFromFile('references.bib', { optional: true })
    ).resolves.toEqual([]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  test('plugin passes absolute optional bibliography paths from directory listings', async () => {
    window.TechneBibtexParser = {
      loadAndSetGlobal: jest.fn(async () => {
        window.bibEntries = [{ key: 'hegel1807' }];
        return window.bibEntries;
      }),
      loadFromFile: jest.fn(async () => []),
      addEntries: jest.fn()
    };
    window.previewZoom = {};
    window.TechneMarkdownRenderer = {};
    window.TechneCitationRenderer = {
      getCSS: jest.fn(() => '.citation {}')
    };
    window.bibEntries = [];
    window.appSettings = { workingDirectory: '/workspace' };
    window.electronAPI = {
      invoke: jest.fn(async (channel, dir) => {
        if (channel === 'list-directory-files' && dir === '') {
          return [{ isFile: true, name: 'references.bib', path: '/workspace/references.bib' }];
        }
        return [];
      })
    };

    require(pluginEntryPath);

    const host = {
      loadCSS: jest.fn(async () => {}),
      loadScriptsSequential: jest.fn(async () => {}),
      emit: jest.fn()
    };
    await registered.init(host);

    expect(window.TechneBibtexParser.loadAndSetGlobal).toHaveBeenCalledWith(
      '/workspace/references.bib',
      { optional: true }
    );
    expect(host.loadScriptsSequential).not.toHaveBeenCalled();
    expect(host.emit).toHaveBeenCalledWith('bibliography:loaded', { count: 1 });
  });
});

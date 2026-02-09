const path = require('path');

const pluginEntryPath = path.resolve(__dirname, '../../../../plugins/techne-markdown-renderer/plugin.js');
const pluginCorePath = path.resolve(
  __dirname,
  '../../../../plugins/techne-markdown-renderer/techne-markdown-renderer.js'
);

describe('techne-markdown-renderer plugin', () => {
  let registered = null;

  beforeEach(() => {
    jest.resetModules();

    registered = null;
    delete window.TechneMarkdownRenderer;
    delete window.previewZoom;
    delete window.currentSpeakerNotes;

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

    window.TechnePlugins = {
      register: (plugin) => {
        registered = plugin;
      }
    };
  });

  test('registers with TechnePlugins', () => {
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
});


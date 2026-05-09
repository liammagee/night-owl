const path = require('path');

const modulePath = path.resolve(__dirname, '../../../orchestrator/modules/preview-markdown.js');

describe('preview markdown helpers', () => {
  let helpers;

  beforeEach(() => {
    jest.resetModules();
    delete window.NightOwlPreviewMarkdown;
    delete window._fallbackRendererConfigured;
    delete window.marked;
    delete window.currentFileDirectory;
    delete window.appSettings;

    helpers = require(modulePath);
  });

  test('fixHeaderlessTables inserts a blank header row before separator-only tables', () => {
    expect(helpers.fixHeaderlessTables('|---|---|\n| a | b |')).toBe('|   |   |\n|---|---|\n| a | b |');
  });

  test('renderFrontmatterHeaderFallback renders escaped title and metadata', () => {
    const html = helpers.renderFrontmatterHeaderFallback('title: <Paper>\nauthor: Ada & Bert\ndate: 2026');

    expect(html).toContain('&lt;Paper&gt;');
    expect(html).toContain('Ada &amp; Bert &mdash; 2026');
    expect(html).toContain('<hr>');
  });

  test('processMarkdownContent applies injected processors before table normalization', () => {
    const processed = helpers.processMarkdownContent('|---|---|\n| body | other |', {
      processAnnotations: (value) => value.replace('body', 'annotated'),
      processSpeakerNotes: (value) => `${value}\nnotes`
    });

    expect(processed).toContain('|   |');
    expect(processed).toContain('| annotated | other |');
    expect(processed).toContain('notes');
  });

  test('setupFallbackMarkdownRenderer configures marked heading and relative image rendering', () => {
    const renderer = {};
    window.currentFileDirectory = '/workspace/articles';
    window.marked = {
      use: jest.fn((config) => Object.assign(renderer, config.renderer))
    };

    helpers.setupFallbackMarkdownRenderer();

    expect(window.marked.use).toHaveBeenCalledTimes(1);
    expect(renderer.heading({ text: 'My Heading', depth: 2, raw: 'My Heading' }))
      .toBe('<h2 id="heading-my-heading">My Heading</h2>\n');
    expect(renderer.image({ href: './figure.png', title: 'Figure', text: 'diagram' }))
      .toBe('<img src="file:///workspace/articles/figure.png" alt="diagram" title="Figure" />');
  });
});

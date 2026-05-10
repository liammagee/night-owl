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

  test('sanitizePreviewHTML removes dangerous preview markup', () => {
    const html = helpers.sanitizePreviewHTML(`
      <h1 onclick="alert(1)">Title</h1>
      <script>alert(1)</script>
      <a href="javascript:alert(1)" target="_blank">bad</a>
      <img src="data:text/html;base64,PHNjcmlwdD4=" onerror="alert(1)">
      <iframe srcdoc="<script>alert(1)</script>"></iframe>
      <iframe src="https://www.youtube.com/embed/abc123"></iframe>
    `);

    expect(html).toContain('<h1>Title</h1>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('data:text/html');
    expect(html).not.toContain('srcdoc');
    expect(html).not.toContain('<iframe></iframe>');
    expect(html).toContain('https://www.youtube.com/embed/abc123');
    expect(html).toContain('sandbox=');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test('setSanitizedHTML replaces children with sanitized nodes', () => {
    const container = document.createElement('div');

    const sanitized = helpers.setSanitizedHTML(container, '<p>ok</p><script>bad()</script>');

    expect(sanitized).toContain('<p>ok</p>');
    expect(sanitized).not.toContain('<script');
    expect(container.querySelector('p').textContent).toBe('ok');
    expect(container.querySelector('script')).toBeNull();
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

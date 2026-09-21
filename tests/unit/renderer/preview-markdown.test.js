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

describe('preview image resolution', () => {
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

  test('relative paths resolve against the open file directory as file URLs', () => {
    const resolve = helpers.resolvePreviewImageSource;
    expect(resolve('images/dot.png', { baseDir: '/ws/docs' })).toBe('file:///ws/docs/images/dot.png');
    expect(resolve('./images/dot.png', { baseDir: '/ws/docs/' })).toBe('file:///ws/docs/images/dot.png');
    expect(resolve('../shared/dot.png', { baseDir: '/ws/docs' })).toBe('file:///ws/docs/../shared/dot.png');
  });

  test('spaces, hashes and percent signs in folders or names are percent-encoded once', () => {
    const resolve = helpers.resolvePreviewImageSource;
    expect(resolve('Screen Shot 2026.png', { baseDir: '/ws/Week 3 #notes' }))
      .toBe('file:///ws/Week%203%20%23notes/Screen%20Shot%202026.png');
    expect(resolve('pic%20%231.png', { baseDir: '/ws' })).toBe('file:///ws/pic%20%231.png');
    expect(resolve('100%.png', { baseDir: '/ws' })).toBe('file:///ws/100%25.png');
  });

  test('absolute URLs, data URIs, fragments and absolute paths are left alone or made file URLs', () => {
    const resolve = helpers.resolvePreviewImageSource;
    expect(resolve('https://example.com/a b.png', { baseDir: '/ws' })).toBe('https://example.com/a b.png');
    expect(resolve('data:image/png;base64,AAAA', { baseDir: '/ws' })).toBe('data:image/png;base64,AAAA');
    expect(resolve('file:///already/there.png', { baseDir: '/ws' })).toBe('file:///already/there.png');
    expect(resolve('#anchor', { baseDir: '/ws' })).toBe('#anchor');
    expect(resolve('/abs/my pic.png', { baseDir: '/ws' })).toBe('file:///abs/my%20pic.png');
    expect(resolve('C:\\Users\\me\\pic.png', {})).toBe('file:///C:/Users/me/pic.png');
  });

  test('without a base directory relative paths are returned unchanged', () => {
    expect(helpers.resolvePreviewImageSource('./x.png', {})).toBe('x.png');
    expect(helpers.resolvePreviewImageSource('', { baseDir: '/ws' })).toBe('');
  });

  test('raw HTML <img> tags in markdown resolve against the current file directory', () => {
    window.currentFileDirectory = '/ws/sub';
    const target = document.createElement('div');
    helpers.setSanitizedHTML(target, '<p><img src="img/inner.png" alt="a"> <img src="https://x/y.png"></p>');
    const sources = Array.from(target.querySelectorAll('img')).map((img) => img.getAttribute('src'));
    expect(sources).toEqual(['file:///ws/sub/img/inner.png', 'https://x/y.png']);
  });

  test('setSanitizedHTML honours an explicit base directory over the global one', () => {
    window.currentFileDirectory = '/wrong';
    const target = document.createElement('div');
    helpers.setSanitizedHTML(target, '<img src="pic.png">', { baseDir: '/right dir' });
    expect(target.querySelector('img').getAttribute('src')).toBe('file:///right%20dir/pic.png');
  });

  test('fallback marked image renderer encodes paths and escapes attributes', () => {
    const renderer = {};
    window.currentFileDirectory = '/ws/my docs';
    window.marked = { use: jest.fn((config) => Object.assign(renderer, config.renderer)) };
    helpers.setupFallbackMarkdownRenderer();
    expect(renderer.image({ href: 'a b.png', title: 'Say "hi"', text: '<x>' }))
      .toBe('<img src="file:///ws/my%20docs/a%20b.png" alt="&lt;x&gt;" title="Say &quot;hi&quot;" />');
  });
});

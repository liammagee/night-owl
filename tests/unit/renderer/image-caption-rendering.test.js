/**
 * Unit tests for image caption rendering and Pandoc-style image attributes.
 * Tests that images with title text are wrapped in <figure> + <figcaption>,
 * and that {width=...} attributes are applied as inline styles.
 */

const path = require('path');

// Load the UMD build of marked (ESM build doesn't work in Jest/jsdom)
beforeAll(() => {
    window.marked = require(path.resolve(__dirname, '../../../lib/marked.min.js'));
    // Simulate Electron environment for file:// path resolution
    window.electronAPI = { isElectron: true };
    delete window.TechneMarkdownRenderer;
    require(path.resolve(__dirname, '../../../plugins/techne-markdown-renderer/techne-markdown-renderer.js'));
});

describe('image caption rendering', () => {
    test('image without title renders plain img tag', async () => {
        const html = await window.TechneMarkdownRenderer.renderToHtml(
            '![alt text](image.png)',
            { baseDir: '/tmp' }
        );
        expect(html).toContain('<img');
        expect(html).toContain('alt="alt text"');
        expect(html).not.toContain('<figure');
        expect(html).not.toContain('<figcaption');
    });

    test('image with title renders figure and figcaption', async () => {
        const html = await window.TechneMarkdownRenderer.renderToHtml(
            '![alt text](image.png "A descriptive caption")',
            { baseDir: '/tmp' }
        );
        expect(html).toContain('<figure class="md-figure">');
        expect(html).toContain('<figcaption class="md-figcaption">A descriptive caption</figcaption>');
        expect(html).toContain('</figure>');
        expect(html).toContain('alt="alt text"');
    });

    test('caption text is HTML-escaped', async () => {
        const html = await window.TechneMarkdownRenderer.renderToHtml(
            '![photo](img.jpg "Caption with <em>tags</em>")',
            { baseDir: '/tmp' }
        );
        expect(html).toContain('<figcaption');
        expect(html).not.toContain('<em>');
        expect(html).toContain('&lt;em&gt;');
    });

    test('image src is resolved against baseDir', async () => {
        const html = await window.TechneMarkdownRenderer.renderToHtml(
            '![](photo.jpg "Photo caption")',
            { baseDir: '/home/user/docs' }
        );
        expect(html).toContain('src="file:///home/user/docs/photo.jpg"');
        expect(html).toContain('<figcaption');
    });

    test('absolute URL images are not modified', async () => {
        const html = await window.TechneMarkdownRenderer.renderToHtml(
            '![logo](https://example.com/logo.png "Company Logo")',
            { baseDir: '/tmp' }
        );
        expect(html).toContain('src="https://example.com/logo.png"');
        expect(html).toContain('<figcaption class="md-figcaption">Company Logo</figcaption>');
    });
});

describe('processImageAttributes pre-processor', () => {
    test('encodes width attribute into title', () => {
        const result = window.TechneMarkdownRenderer._processImageAttributes(
            '![alt](img.png){width=50%}'
        );
        expect(result).toBe('![alt](img.png "|||width=50%")');
    });

    test('appends attributes to existing title', () => {
        const result = window.TechneMarkdownRenderer._processImageAttributes(
            '![alt](img.png "My caption"){width=60%}'
        );
        expect(result).toBe('![alt](img.png "My caption|||width=60%")');
    });

    test('handles multiple attributes', () => {
        const result = window.TechneMarkdownRenderer._processImageAttributes(
            '![alt](img.png){width=50% height=300px}'
        );
        expect(result).toContain('width=50%');
        expect(result).toContain('height=300px');
    });

    test('leaves images without attributes unchanged', () => {
        const input = '![alt](img.png "caption")';
        const result = window.TechneMarkdownRenderer._processImageAttributes(input);
        expect(result).toBe(input);
    });
});

describe('image attribute rendering (end-to-end)', () => {
    test('width attribute becomes inline style', async () => {
        const html = await window.TechneMarkdownRenderer.renderToHtml(
            '![chart](chart.png){width=50%}',
            { baseDir: '/tmp' }
        );
        expect(html).toContain('style="width: 50%"');
        expect(html).not.toContain('<figure');
        expect(html).not.toContain('|||');
    });

    test('width and height attributes both applied', async () => {
        const html = await window.TechneMarkdownRenderer.renderToHtml(
            '![diagram](dia.png){width=400px height=300px}',
            { baseDir: '/tmp' }
        );
        expect(html).toContain('width: 400px');
        expect(html).toContain('height: 300px');
    });

    test('attributes with caption: figure rendered, title clean', async () => {
        const html = await window.TechneMarkdownRenderer.renderToHtml(
            '![photo](photo.jpg "Figure 1: Results"){width=80%}',
            { baseDir: '/tmp' }
        );
        expect(html).toContain('style="width: 80%"');
        expect(html).toContain('<figcaption class="md-figcaption">Figure 1: Results</figcaption>');
        expect(html).toContain('<figure class="md-figure">');
        expect(html).not.toContain('|||');
    });

    test('attributes-only (no caption) does not produce figure', async () => {
        const html = await window.TechneMarkdownRenderer.renderToHtml(
            '![alt](img.png){width=200px}',
            { baseDir: '/tmp' }
        );
        expect(html).toContain('style="width: 200px"');
        expect(html).not.toContain('<figure');
        expect(html).not.toContain('<figcaption');
    });
});

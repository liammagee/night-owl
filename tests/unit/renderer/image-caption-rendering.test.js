/**
 * Unit tests for image caption rendering.
 * Tests that images with title text are wrapped in <figure> + <figcaption>.
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

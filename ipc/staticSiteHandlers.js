// === Static Site Generation Handlers ===
// Export project files as a static HTML website

const { ipcMain, dialog } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const { createDebugLogger } = require('./logging');

const debug = createDebugLogger('StaticSiteHandlers');

function register(deps) {
  debug('Registering static site handlers...');

  ipcMain.handle('static-site-generate', async (event, { files, options }) => {
    try {
      const opts = options || {};
      const { filePath } = await dialog.showSaveDialog({
        title: 'Export Static Site',
        defaultPath: 'site',
        properties: ['createDirectory']
      });

      if (!filePath) return { success: false, cancelled: true };

      // Create output directory
      await fs.mkdir(filePath, { recursive: true });

      const siteTitle = opts.title || 'NightOwl Export';
      const theme = opts.theme || 'default';
      const nav = [];

      // Generate HTML for each file
      for (const file of files) {
        const slug = slugify(file.name.replace(/\.(md|markdown)$/i, ''));
        const htmlFile = slug + '.html';
        nav.push({ name: file.name.replace(/\.(md|markdown)$/i, ''), slug, htmlFile });

        const htmlContent = markdownToHtml(file.content);
        const page = buildPage(file.name, htmlContent, siteTitle, theme, nav, slug);
        await fs.writeFile(path.join(filePath, htmlFile), page, 'utf8');
      }

      // Generate index page
      const indexHtml = buildIndexPage(siteTitle, nav, theme);
      await fs.writeFile(path.join(filePath, 'index.html'), indexHtml, 'utf8');

      // Write CSS
      const css = getThemeCss(theme);
      await fs.writeFile(path.join(filePath, 'style.css'), css, 'utf8');

      return { success: true, filePath, pageCount: files.length + 1 };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('static-site-preview', async (event, { content, title }) => {
    try {
      const htmlContent = markdownToHtml(content);
      const page = buildPage(title || 'Preview', htmlContent, 'Preview', 'default', [], '');
      return { success: true, html: page };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  debug('Registered static site handlers');
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
}

function markdownToHtml(md) {
  let html = md;

  // Strip YAML front matter
  html = html.replace(/^---\n[\s\S]*?\n---\n*/, '');

  // Headings
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Bold/italic
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang || 'text'}">${escapeHtml(code.trim())}</code></pre>`;
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Images and links
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<figure><img src="$2" alt="$1"><figcaption>$1</figcaption></figure>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Block quotes
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // Lists
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.+<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr>');

  // Math
  html = html.replace(/\$\$([^$]+)\$\$/g, '<div class="math">$$$$1$$</div>');

  // Paragraphs
  html = html.split('\n').map(line => {
    if (line.trim() === '' || line.startsWith('<')) return line;
    return `<p>${line}</p>`;
  }).join('\n');

  return html;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildPage(title, content, siteTitle, theme, nav, currentSlug) {
  const navHtml = nav.map(n =>
    `<a href="${n.htmlFile}" class="${n.slug === currentSlug ? 'active' : ''}">${escapeHtml(n.name)}</a>`
  ).join('\n        ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ${escapeHtml(siteTitle)}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <nav>
    <div class="site-title"><a href="index.html">${escapeHtml(siteTitle)}</a></div>
    <div class="nav-links">
        ${navHtml}
    </div>
  </nav>
  <main>
    <article>
      ${content}
    </article>
  </main>
  <footer>
    <p>Generated by NightOwl</p>
  </footer>
</body>
</html>`;
}

function buildIndexPage(siteTitle, nav, theme) {
  const listHtml = nav.map(n =>
    `<li><a href="${n.htmlFile}">${escapeHtml(n.name)}</a></li>`
  ).join('\n      ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(siteTitle)}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <nav>
    <div class="site-title"><a href="index.html">${escapeHtml(siteTitle)}</a></div>
  </nav>
  <main>
    <h1>${escapeHtml(siteTitle)}</h1>
    <ul class="page-list">
      ${listHtml}
    </ul>
  </main>
  <footer>
    <p>Generated by NightOwl</p>
  </footer>
</body>
</html>`;
}

function getThemeCss(theme) {
  const base = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #333; background: #fafafa; }
nav { background: #2d2d2d; color: #fff; padding: 12px 24px; display: flex; align-items: center; gap: 24px; position: sticky; top: 0; z-index: 10; }
nav .site-title a { color: #fff; text-decoration: none; font-weight: bold; font-size: 16px; }
nav .nav-links { display: flex; gap: 16px; flex-wrap: wrap; }
nav .nav-links a { color: #ccc; text-decoration: none; font-size: 14px; padding: 4px 8px; border-radius: 4px; }
nav .nav-links a:hover, nav .nav-links a.active { color: #fff; background: rgba(255,255,255,0.1); }
main { max-width: 800px; margin: 40px auto; padding: 0 24px; }
article { background: #fff; padding: 32px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
h1, h2, h3, h4, h5, h6 { margin: 1.2em 0 0.6em; line-height: 1.3; }
h1 { font-size: 2em; border-bottom: 1px solid #eee; padding-bottom: 8px; }
h2 { font-size: 1.5em; }
h3 { font-size: 1.25em; }
p { margin: 0.8em 0; }
a { color: #2563eb; }
pre { background: #f5f5f5; padding: 16px; border-radius: 6px; overflow-x: auto; font-size: 14px; }
code { font-family: 'SF Mono', Menlo, monospace; font-size: 0.9em; }
p code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
blockquote { border-left: 4px solid #ddd; padding: 8px 16px; margin: 16px 0; color: #666; background: #f9f9f9; }
figure { margin: 16px 0; text-align: center; }
figure img { max-width: 100%; border-radius: 6px; }
figcaption { font-size: 0.85em; color: #888; margin-top: 4px; }
ul, ol { padding-left: 24px; margin: 8px 0; }
li { margin: 4px 0; }
hr { border: none; border-top: 1px solid #eee; margin: 24px 0; }
.page-list { list-style: none; padding: 0; }
.page-list li { padding: 8px 0; border-bottom: 1px solid #eee; }
.page-list a { font-size: 1.1em; }
footer { text-align: center; padding: 24px; color: #888; font-size: 13px; }
.math { overflow-x: auto; padding: 8px 0; }
`;
  return base;
}

module.exports = { register };

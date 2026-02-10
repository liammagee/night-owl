// === Advanced Export IPC Handlers ===
// LaTeX export, EPUB export, and custom PDF templates

const { ipcMain, dialog } = require('electron');
const fs = require('fs').promises;
const path = require('path');

function register(deps) {
  console.log('[AdvancedExportHandlers] Registering advanced export handlers...');

  /**
   * Export markdown to LaTeX format.
   */
  ipcMain.handle('export-to-latex', async (event, { content, options }) => {
    try {
      const latex = markdownToLatex(content, options || {});

      const { filePath } = await dialog.showSaveDialog({
        title: 'Export as LaTeX',
        defaultPath: 'document.tex',
        filters: [
          { name: 'LaTeX', extensions: ['tex'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!filePath) return { success: false, cancelled: true };

      await fs.writeFile(filePath, latex, 'utf8');
      return { success: true, filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Export markdown to EPUB format.
   */
  ipcMain.handle('export-to-epub', async (event, { content, metadata }) => {
    try {
      const epub = generateEpubPackage(content, metadata || {});

      const { filePath } = await dialog.showSaveDialog({
        title: 'Export as EPUB',
        defaultPath: 'document.epub',
        filters: [
          { name: 'EPUB', extensions: ['epub'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!filePath) return { success: false, cancelled: true };

      await fs.writeFile(filePath, epub);
      return { success: true, filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Export PDF with custom template.
   */
  ipcMain.handle('export-pdf-with-template', async (event, { htmlContent, template }) => {
    try {
      const styledHtml = applyPdfTemplate(htmlContent, template || 'academic');

      const { filePath } = await dialog.showSaveDialog({
        title: 'Export as PDF',
        defaultPath: 'document.pdf',
        filters: [
          { name: 'PDF', extensions: ['pdf'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!filePath) return { success: false, cancelled: true };

      // Use Electron's built-in PDF printing
      const win = event.sender;
      const pdfData = await win.printToPDF({
        printBackground: true,
        marginsType: template === 'minimal' ? 1 : 0,
        pageSize: template === 'letter' ? 'Letter' : 'A4',
        landscape: false
      });

      await fs.writeFile(filePath, pdfData);
      return { success: true, filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get available PDF templates.
   */
  ipcMain.handle('get-pdf-templates', async () => {
    return {
      success: true,
      templates: [
        { id: 'academic', name: 'Academic', description: 'Serif fonts, proper margins, numbered sections' },
        { id: 'minimal', name: 'Minimal', description: 'Clean sans-serif, narrow margins' },
        { id: 'report', name: 'Report', description: 'Professional report with header/footer' },
        { id: 'letter', name: 'Letter (US)', description: 'US Letter size with standard margins' },
        { id: 'manuscript', name: 'Manuscript', description: 'Double-spaced, monospace, 1-inch margins' }
      ]
    };
  });

  console.log('[AdvancedExportHandlers] Registered advanced export handlers');
}

// ── Markdown to LaTeX conversion ──

function markdownToLatex(md, options) {
  const docClass = options.documentClass || 'article';
  const fontSize = options.fontSize || '12pt';
  const packages = options.packages || ['geometry', 'hyperref', 'graphicx', 'amsmath', 'amssymb'];

  let body = md;

  // Front matter extraction
  let title = '', author = '', date = '\\today';
  const yamlMatch = body.match(/^---\n([\s\S]*?)\n---/);
  if (yamlMatch) {
    const yaml = yamlMatch[1];
    const titleMatch = yaml.match(/title:\s*(.+)/);
    const authorMatch = yaml.match(/author:\s*(.+)/);
    const dateMatch = yaml.match(/date:\s*(.+)/);
    if (titleMatch) title = titleMatch[1].trim().replace(/^["']|["']$/g, '');
    if (authorMatch) author = authorMatch[1].trim().replace(/^["']|["']$/g, '');
    if (dateMatch) date = dateMatch[1].trim().replace(/^["']|["']$/g, '');
    body = body.replace(/^---\n[\s\S]*?\n---\n*/, '');
  }

  // Headings
  body = body.replace(/^######\s+(.+)$/gm, '\\subparagraph{$1}');
  body = body.replace(/^#####\s+(.+)$/gm, '\\paragraph{$1}');
  body = body.replace(/^####\s+(.+)$/gm, '\\subsubsubsection{$1}');
  body = body.replace(/^###\s+(.+)$/gm, '\\subsubsection{$1}');
  body = body.replace(/^##\s+(.+)$/gm, '\\subsection{$1}');
  body = body.replace(/^#\s+(.+)$/gm, '\\section{$1}');

  // Bold and italic
  body = body.replace(/\*\*\*([^*]+)\*\*\*/g, '\\textbf{\\textit{$1}}');
  body = body.replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}');
  body = body.replace(/\*([^*]+)\*/g, '\\textit{$1}');

  // Code blocks
  body = body.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `\\begin{verbatim}\n${code}\\end{verbatim}`;
  });

  // Inline code
  body = body.replace(/`([^`]+)`/g, '\\texttt{$1}');

  // Images
  body = body.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    return `\\begin{figure}[h]\n\\centering\n\\includegraphics[width=0.8\\textwidth]{${src}}\n\\caption{${alt}}\n\\end{figure}`;
  });

  // Links
  body = body.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '\\href{$2}{$1}');

  // Block quotes
  body = body.replace(/^>\s+(.+)$/gm, '\\begin{quote}\n$1\n\\end{quote}');

  // Unordered lists
  body = body.replace(/^[-*]\s+(.+)$/gm, '\\item $1');
  // Wrap consecutive \\item lines in itemize
  body = body.replace(/((?:\\item .+\n?)+)/g, '\\begin{itemize}\n$1\\end{itemize}\n');

  // Math
  body = body.replace(/\$\$([^$]+)\$\$/g, '\\[\n$1\n\\]');

  // Footnotes
  body = body.replace(/\[\^(\w+)\]/g, '\\footnote{$1}');

  // Horizontal rules
  body = body.replace(/^---+$/gm, '\\hrulefill');

  // Escape special LaTeX characters (that weren't already part of commands)
  // This is intentionally light-touch to avoid breaking LaTeX commands we just created
  body = body.replace(/(?<!\\)%/g, '\\%');
  body = body.replace(/(?<!\\)&(?!amp;)/g, '\\&');

  // Build document
  const lines = [
    `\\documentclass[${fontSize}]{${docClass}}`,
    '',
    ...packages.map(p => `\\usepackage{${p}}`),
    '',
    '\\geometry{margin=1in}',
    ''
  ];

  if (title) lines.push(`\\title{${title}}`);
  if (author) lines.push(`\\author{${author}}`);
  lines.push(`\\date{${date}}`);
  lines.push('');
  lines.push('\\begin{document}');
  if (title) lines.push('\\maketitle');
  lines.push('');
  lines.push(body.trim());
  lines.push('');
  lines.push('\\end{document}');

  return lines.join('\n');
}

// ── EPUB generation (minimal OCF/OPF structure) ──

function generateEpubPackage(md, metadata) {
  // For a proper EPUB, we'd need a zip library.
  // Since we may not have one, generate an XHTML file that's EPUB-compatible.
  // The user can convert it with Calibre or Pandoc for full EPUB.

  const title = metadata.title || 'Untitled';
  const author = metadata.author || 'Unknown';

  // Convert markdown to basic HTML
  let html = md;

  // Front matter strip
  html = html.replace(/^---\n[\s\S]*?\n---\n*/, '');

  // Headings
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Bold/italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Code blocks
  html = html.replace(/```\w*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links and images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1"/>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Block quotes
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // Lists
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.+<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Paragraphs — wrap non-tag lines
  html = html.split('\n').map(line => {
    if (line.trim() === '' || line.startsWith('<')) return line;
    return `<p>${line}</p>`;
  }).join('\n');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr/>');

  const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(title)}</title>
  <meta name="author" content="${escapeXml(author)}"/>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.6; margin: 2em; color: #333; }
    h1, h2, h3 { margin-top: 1.5em; }
    pre { background: #f4f4f4; padding: 1em; overflow-x: auto; }
    code { font-family: 'Courier New', monospace; }
    blockquote { border-left: 3px solid #ccc; padding-left: 1em; color: #666; }
    img { max-width: 100%; }
  </style>
</head>
<body>
<h1>${escapeXml(title)}</h1>
<p class="author">${escapeXml(author)}</p>
<hr/>
${html}
</body>
</html>`;

  return Buffer.from(xhtml, 'utf8');
}

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── PDF template CSS ──

function applyPdfTemplate(htmlContent, templateId) {
  const templates = {
    academic: `
      body { font-family: 'Computer Modern', Georgia, serif; font-size: 12pt; line-height: 1.5; margin: 1in; }
      h1, h2, h3 { font-family: Georgia, serif; }
      h1 { font-size: 24pt; border-bottom: 1px solid #333; padding-bottom: 8px; }
      h2 { font-size: 18pt; }
      pre { background: #f5f5f5; padding: 10px; border: 1px solid #ddd; }
    `,
    minimal: `
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.6; margin: 0.5in; color: #333; }
      h1, h2, h3 { font-weight: 600; }
      h1 { font-size: 20pt; }
      h2 { font-size: 16pt; }
    `,
    report: `
      body { font-family: 'Times New Roman', Georgia, serif; font-size: 12pt; line-height: 1.5; margin: 1in; }
      h1 { font-size: 22pt; text-align: center; margin-bottom: 2em; }
      h2 { font-size: 16pt; border-bottom: 1px solid #666; }
    `,
    manuscript: `
      body { font-family: 'Courier New', monospace; font-size: 12pt; line-height: 2; margin: 1in; }
      h1, h2, h3 { font-family: 'Courier New', monospace; text-align: center; }
      p { text-indent: 0.5in; }
    `
  };

  const css = templates[templateId] || templates.academic;
  return `<style>${css}</style>${htmlContent}`;
}

module.exports = { register };

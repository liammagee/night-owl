// === Advanced Export IPC Handlers ===
// LaTeX export, EPUB export, and custom PDF templates

const { ipcMain, dialog, BrowserWindow } = require('electron');
const { convertMarkdown } = require('../services/documentConversion');
const { atomicWriteFile } = require('../services/fileWrites');
const { createDebugLogger } = require('./logging');

const debug = createDebugLogger('AdvancedExportHandlers');

function register(deps) {
  debug('Registering advanced export handlers...');

  /**
   * Export markdown to LaTeX format.
   */
  ipcMain.handle('export-to-latex', async (event, { content, options }) => {
    try {

      const { filePath } = await dialog.showSaveDialog({
        title: 'Export as LaTeX',
        defaultPath: 'document.tex',
        filters: [
          { name: 'LaTeX', extensions: ['tex'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!filePath) return { success: false, cancelled: true };

      const latex = await convertMarkdown(content, { format: 'latex', options: options || {}, resourcePath: deps.appSettings?.workingDirectory });
      await atomicWriteFile(filePath, latex);
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

      const { filePath } = await dialog.showSaveDialog({
        title: 'Export as EPUB',
        defaultPath: 'document.epub',
        filters: [
          { name: 'EPUB', extensions: ['epub'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!filePath) return { success: false, cancelled: true };

      const epub = await convertMarkdown(content, { format: 'epub', metadata: metadata || {}, resourcePath: deps.appSettings?.workingDirectory });
      await atomicWriteFile(filePath, epub);
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
      const printWindow = new BrowserWindow({
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false }
      });
      try {
        printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${styledHtml}</body></html>`)}`);
        const pdfData = await printWindow.webContents.printToPDF({
          printBackground: true,
          pageSize: template === 'letter' ? 'Letter' : 'A4',
          landscape: false
        });
        await atomicWriteFile(filePath, pdfData);
      } finally {
        printWindow.destroy();
      }
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

  debug('Registered advanced export handlers');
}

// ── Markdown to LaTeX conversion ──

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

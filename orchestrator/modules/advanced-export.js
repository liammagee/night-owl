/**
 * Advanced Export
 * Frontend commands for LaTeX, EPUB, and custom PDF template exports.
 *
 * @module advanced-export
 */

(function () {
  'use strict';

  function getEditorContent() {
    if (!window.editor) return '';
    const model = window.editor.getModel();
    return model ? model.getValue() : '';
  }

  function getMetadata() {
    const content = getEditorContent();
    const meta = { title: 'Untitled', author: '' };
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (yamlMatch) {
      const yaml = yamlMatch[1];
      const titleMatch = yaml.match(/title:\s*(.+)/);
      const authorMatch = yaml.match(/author:\s*(.+)/);
      if (titleMatch) meta.title = titleMatch[1].trim().replace(/^["']|["']$/g, '');
      if (authorMatch) meta.author = authorMatch[1].trim().replace(/^["']|["']$/g, '');
    }
    return meta;
  }

  async function exportToLatex() {
    if (!window.electronAPI) return;
    const content = getEditorContent();
    if (!content.trim()) {
      if (window.showNotification) window.showNotification('No content to export', 'info');
      return;
    }
    try {
      const result = await window.electronAPI.documents.exportToLatex({ content, options: {} });
      if (result.success) {
        if (window.showNotification) window.showNotification('Exported to LaTeX: ' + result.filePath.split('/').pop(), 'success');
      } else if (!result.cancelled) {
        if (window.showNotification) window.showNotification('LaTeX export failed: ' + result.error, 'error');
      }
    } catch (e) {
      if (window.showNotification) window.showNotification('LaTeX export error: ' + e.message, 'error');
    }
  }

  async function exportToEpub() {
    if (!window.electronAPI) return;
    const content = getEditorContent();
    if (!content.trim()) {
      if (window.showNotification) window.showNotification('No content to export', 'info');
      return;
    }
    const metadata = getMetadata();
    try {
      const result = await window.electronAPI.documents.exportToEpub({ content, metadata });
      if (result.success) {
        if (window.showNotification) window.showNotification('Exported to EPUB: ' + result.filePath.split('/').pop(), 'success');
      } else if (!result.cancelled) {
        if (window.showNotification) window.showNotification('EPUB export failed: ' + result.error, 'error');
      }
    } catch (e) {
      if (window.showNotification) window.showNotification('EPUB export error: ' + e.message, 'error');
    }
  }

  async function exportPdfWithTemplate() {
    if (!window.electronAPI) return;

    let templates = [];
    try {
      const res = await window.electronAPI.documents.getPdfTemplates();
      if (res.success) templates = res.templates;
    } catch (_) { /* use defaults */ }

    if (templates.length === 0) {
      templates = [
        { id: 'academic', name: 'Academic' },
        { id: 'minimal', name: 'Minimal' },
        { id: 'report', name: 'Report' },
        { id: 'letter', name: 'Letter (US)' },
        { id: 'manuscript', name: 'Manuscript' }
      ];
    }

    // Show template picker dialog
    const existing = document.getElementById('pdf-template-dialog');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pdf-template-dialog';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:10000;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--bg-color,#1e1e1e);color:var(--text-color,#d4d4d4);border-radius:8px;padding:16px;width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:system-ui,sans-serif;';

    let html = '<h3 style="margin:0 0 12px;font-size:14px;">Export PDF with Template</h3>';
    html += '<div style="display:flex;flex-direction:column;gap:6px;">';
    templates.forEach(t => {
      html += `<button class="pdf-tpl-btn" data-id="${t.id}" style="background:var(--bg-secondary,#252526);border:1px solid #555;color:var(--text-color,#d4d4d4);border-radius:4px;padding:10px;cursor:pointer;text-align:left;font-size:13px;">
        <strong>${t.name}</strong>${t.description ? '<br><span style="color:#888;font-size:11px;">' + t.description + '</span>' : ''}
      </button>`;
    });
    html += '</div>';
    html += '<div style="text-align:right;margin-top:12px;"><button id="pdf-tpl-cancel" style="background:transparent;border:1px solid #555;color:#888;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;">Cancel</button></div>';

    dialog.innerHTML = html;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    document.getElementById('pdf-tpl-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    dialog.querySelectorAll('.pdf-tpl-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        overlay.remove();
        const templateId = btn.dataset.id;
        const content = getEditorContent();
        if (!content.trim()) {
          if (window.showNotification) window.showNotification('No content to export', 'info');
          return;
        }
        // Convert markdown to HTML for PDF template
        let htmlContent = content;
        if (window.marked) {
          try { htmlContent = window.marked.parse(content); } catch (_) { /* use raw */ }
        }
        try {
          const result = await window.electronAPI.documents.exportPdfWithTemplate({ htmlContent, template: templateId });
          if (result.success) {
            if (window.showNotification) window.showNotification('Exported PDF: ' + result.filePath.split('/').pop(), 'success');
          } else if (!result.cancelled) {
            if (window.showNotification) window.showNotification('PDF export failed: ' + result.error, 'error');
          }
        } catch (e) {
          if (window.showNotification) window.showNotification('PDF export error: ' + e.message, 'error');
        }
      });
    });

    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
    });
  }

  function init() {
    if (typeof window.registerCommand === 'function') {
      window.registerCommand('export.latex', 'Export: LaTeX (.tex)', exportToLatex);
      window.registerCommand('export.epub', 'Export: EPUB (.epub)', exportToEpub);
      window.registerCommand('export.pdf-template', 'Export: PDF with Template', exportPdfWithTemplate);
    }
  }

  window.advancedExport = {
    exportToLatex,
    exportToEpub,
    exportPdfWithTemplate
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }
})();

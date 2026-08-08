/**
 * Static Site Generator
 * Export project markdown files as a navigable static HTML website.
 *
 * @module static-site
 */

(function () {
  'use strict';

  async function generateSite() {
    if (!window.electronAPI) return;

    // Gather all open project markdown files from the file tree
    const files = [];

    // Current editor content
    if (window.editor) {
      const model = window.editor.getModel();
      if (model) {
        const name = (window.currentFilePath || 'document').split('/').pop();
        files.push({ name, content: model.getValue() });
      }
    }

    // If fileTree data is available, include sibling markdown files
    if (window.fileTreeData && Array.isArray(window.fileTreeData)) {
      const mdFiles = flattenTree(window.fileTreeData).filter(f =>
        /\.(md|markdown)$/i.test(f.name) && f.path !== window.currentFilePath
      );

      for (const f of mdFiles) {
        try {
          const result = await window.electronAPI.files.readFile(f.path);
          if (result && result.content) {
            files.push({ name: f.name, content: result.content });
          }
        } catch (_) { /* skip unreadable */ }
      }
    }

    if (files.length === 0) {
      if (window.showNotification) window.showNotification('No content to export', 'info');
      return;
    }

    // Show options dialog
    showSiteOptionsDialog(files);
  }

  function flattenTree(nodes) {
    const result = [];
    for (const node of nodes) {
      if (node.type === 'file') result.push(node);
      if (node.children) result.push(...flattenTree(node.children));
    }
    return result;
  }

  function showSiteOptionsDialog(files) {
    const existing = document.getElementById('static-site-dialog');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'static-site-dialog';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:10000;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--bg-color,#1e1e1e);color:var(--text-color,#d4d4d4);border-radius:8px;padding:16px;width:420px;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:system-ui,sans-serif;';

    dialog.innerHTML = `
      <h3 style="margin:0 0 12px;font-size:14px;">Export as Static Site</h3>
      <div style="font-size:12px;color:#888;margin-bottom:8px;">${files.length} page${files.length !== 1 ? 's' : ''} will be exported.</div>
      <label style="font-size:12px;display:block;margin-bottom:4px;">Site Title:</label>
      <input id="ss-title" type="text" value="My Writing" style="width:100%;background:var(--bg-secondary,#252526);border:1px solid #555;color:var(--text-color,#d4d4d4);border-radius:4px;padding:6px 8px;font-size:13px;box-sizing:border-box;margin-bottom:12px;">
      <div style="font-size:12px;color:#888;margin-bottom:4px;">Files to include:</div>
      <div style="max-height:150px;overflow-y:auto;border:1px solid #333;border-radius:4px;padding:4px;margin-bottom:12px;">
        ${files.map((f, i) => `<label style="display:block;font-size:12px;padding:2px 4px;"><input type="checkbox" class="ss-file-check" data-idx="${i}" checked> ${esc(f.name)}</label>`).join('')}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button id="ss-cancel" style="background:transparent;border:1px solid #555;color:#888;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;">Cancel</button>
        <button id="ss-export" style="background:#569cd6;color:#fff;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;">Export</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    document.getElementById('ss-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    document.getElementById('ss-export').addEventListener('click', async () => {
      const title = document.getElementById('ss-title').value.trim() || 'My Writing';
      const checks = dialog.querySelectorAll('.ss-file-check');
      const selectedFiles = [];
      checks.forEach(chk => {
        if (chk.checked) selectedFiles.push(files[parseInt(chk.dataset.idx)]);
      });

      overlay.remove();

      if (selectedFiles.length === 0) {
        if (window.showNotification) window.showNotification('No files selected', 'info');
        return;
      }

      try {
        const result = await window.electronAPI.publishing.generate({
          files: selectedFiles,
          options: { title }
        });
        if (result.success) {
          if (window.showNotification) window.showNotification(`Site exported: ${result.pageCount} pages`, 'success');
        } else if (!result.cancelled) {
          if (window.showNotification) window.showNotification('Export failed: ' + result.error, 'error');
        }
      } catch (e) {
        if (window.showNotification) window.showNotification('Export error: ' + e.message, 'error');
      }
    });

    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
    });
  }

  function esc(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function init() {
    if (window.commandPaletteCommands) {
      window.commandPaletteCommands.push({ name: 'Export: Static Site (HTML)', action: generateSite });
    }
  }

  window.staticSite = { generate: generateSite };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }
})();

/**
 * Image Manager
 * Sidebar panel showing all images referenced in the current document.
 * Provides a gallery view, click to navigate, paste-from-clipboard, and insert.
 *
 * @module image-manager
 */

(function () {
  'use strict';

  let paneEl = null;
  const IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

  function getOrCreatePane() {
    if (paneEl) return paneEl;

    paneEl = document.getElementById('image-manager-pane');
    if (paneEl) return paneEl;

    paneEl = document.createElement('div');
    paneEl.id = 'image-manager-pane';
    paneEl.className = 'content-pane';
    paneEl.style.cssText = 'display:none;height:100%;flex-direction:column;overflow-y:auto;padding:8px;';

    // Insert after version-history-pane or git-pane
    const after = document.getElementById('version-history-pane') || document.getElementById('git-pane');
    if (after && after.parentNode) {
      after.parentNode.insertBefore(paneEl, after.nextSibling);
    }

    return paneEl;
  }

  /**
   * Extract all image references from the editor content.
   */
  function extractImages(text) {
    const images = [];
    let match;
    const re = new RegExp(IMAGE_RE.source, 'g');
    while ((match = re.exec(text)) !== null) {
      images.push({
        alt: match[1],
        src: match[2],
        offset: match.index,
        fullMatch: match[0]
      });
    }
    return images;
  }

  /**
   * Resolve image path relative to current file.
   */
  function resolveSrc(src) {
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      return src;
    }
    // Resolve relative to current file's directory
    const filePath = window.currentFilePath || '';
    if (!filePath) return src;
    const dir = filePath.replace(/[/\\][^/\\]*$/, '');
    return dir + '/' + src;
  }

  /**
   * Find the line number where an image reference occurs.
   */
  function findLineForOffset(model, offset) {
    const text = model.getValue();
    const before = text.substring(0, offset);
    return (before.match(/\n/g) || []).length + 1;
  }

  function renderGallery() {
    const pane = getOrCreatePane();
    if (!window.editor) {
      pane.innerHTML = '<div style="color:#888;padding:12px;font-size:13px;">No editor available</div>';
      return;
    }

    const model = window.editor.getModel();
    if (!model) return;

    const text = model.getValue();
    const images = extractImages(text);

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:12px;color:#888;">${images.length} image${images.length !== 1 ? 's' : ''}</span>
        <div style="display:flex;gap:4px;">
          <button id="img-paste-btn" title="Paste image from clipboard" style="background:transparent;border:1px solid #555;color:var(--text-color,#d4d4d4);border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px;">Paste</button>
          <button id="img-insert-btn" title="Insert image markdown" style="background:#569cd6;color:#fff;border:none;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px;">+ Insert</button>
        </div>
      </div>
    `;

    if (images.length === 0) {
      html += '<div style="color:#888;padding:20px;font-size:13px;text-align:center;">No images in document.<br>Use <code>![alt](path)</code> to add images.</div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;">';
      images.forEach((img, idx) => {
        const resolved = resolveSrc(img.src);
        const isRemote = img.src.startsWith('http');
        html += `
          <div class="img-gallery-item" data-idx="${idx}" style="cursor:pointer;border:1px solid var(--border-color,#333);border-radius:4px;overflow:hidden;background:var(--bg-secondary,#252526);" title="${escapeAttr(img.alt || img.src)}">
            <div style="width:100%;height:80px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#111;">
              <img src="${isRemote ? img.src : 'file://' + resolved}" style="max-width:100%;max-height:80px;object-fit:contain;" onerror="this.style.display='none';this.parentNode.innerHTML='<span style=color:#666;font-size:20px>?</span>';">
            </div>
            <div style="padding:4px;font-size:10px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(img.alt || img.src.split('/').pop())}</div>
          </div>
        `;
      });
      html += '</div>';
    }

    pane.innerHTML = html;

    // Wire events
    pane.querySelectorAll('.img-gallery-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.idx);
        const img = images[idx];
        if (img && model) {
          const line = findLineForOffset(model, img.offset);
          window.editor.revealLineInCenter(line);
          window.editor.setPosition({ lineNumber: line, column: 1 });
          window.editor.focus();
        }
      });
    });

    const insertBtn = document.getElementById('img-insert-btn');
    if (insertBtn) {
      insertBtn.addEventListener('click', () => {
        if (!window.editor) return;
        const pos = window.editor.getPosition();
        const snippet = '![${1:alt text}](${2:image.png})';
        const contribution = window.editor.getContribution('snippetController2');
        if (contribution) {
          window.editor.focus();
          contribution.insert(snippet);
        } else {
          window.editor.executeEdits('image-manager', [{
            range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
            text: '![alt text](image.png)'
          }]);
        }
      });
    }

    const pasteBtn = document.getElementById('img-paste-btn');
    if (pasteBtn) {
      pasteBtn.addEventListener('click', async () => {
        try {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            const imageType = item.types.find(t => t.startsWith('image/'));
            if (imageType) {
              const blob = await item.getType(imageType);
              const reader = new FileReader();
              reader.onload = async () => {
                const base64 = reader.result;
                // Save to file via IPC
                if (window.electronAPI) {
                  const ext = imageType.split('/')[1] || 'png';
                  const filename = `pasted-${Date.now()}.${ext}`;
                  const result = await window.electronAPI.images.saveImageToCurrentDir(filename, base64.split(',')[1]);
                  if (result && result.savedPath) {
                    const relativePath = result.savedPath.split('/').pop();
                    insertImageMarkdown(relativePath, 'Pasted image');
                  }
                } else {
                  // Fallback: insert as data URI
                  insertImageMarkdown(base64, 'Pasted image');
                }
                if (window.showNotification) window.showNotification('Image pasted', 'success');
                setTimeout(renderGallery, 500);
              };
              reader.readAsDataURL(blob);
              return;
            }
          }
          if (window.showNotification) window.showNotification('No image in clipboard', 'info');
        } catch (e) {
          if (window.showNotification) window.showNotification('Could not paste: ' + e.message, 'error');
        }
      });
    }
  }

  function insertImageMarkdown(src, alt) {
    if (!window.editor) return;
    const pos = window.editor.getPosition();
    if (!pos) return;
    window.editor.executeEdits('image-manager', [{
      range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
      text: `![${alt}](${src})\n`
    }]);
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // ── Sidebar integration ──

  function registerSidebarPane() {
    const histBtn = document.getElementById('show-history-btn') || document.getElementById('show-git-btn');
    if (histBtn && !document.getElementById('show-images-btn')) {
      const btn = document.createElement('button');
      btn.id = 'show-images-btn';
      btn.className = 'btn pane-toggle-button';
      btn.title = 'Images';
      btn.style.cssText = 'padding: 2px 5px; font-size: 12px; min-width: 26px;';
      btn.textContent = '\u{1F5BC}'; // framed picture emoji
      btn.addEventListener('click', () => {
        if (window.switchStructureView) window.switchStructureView('images');
      });
      histBtn.parentNode.insertBefore(btn, histBtn.nextSibling);
    }

    const origSwitch = window.switchStructureView;
    if (origSwitch) {
      window.switchStructureView = function (view) {
        const imgPane = getOrCreatePane();
        if (imgPane) imgPane.style.display = 'none';
        const imgBtn = document.getElementById('show-images-btn');
        if (imgBtn) imgBtn.classList.remove('active');

        if (view === 'images') {
          origSwitch.call(this, 'structure');
          const structureList = document.getElementById('structure-list');
          if (structureList) structureList.style.display = 'none';
          const showStructureBtn = document.getElementById('show-structure-btn');
          if (showStructureBtn) showStructureBtn.classList.remove('active');
          const title = document.getElementById('structure-pane-title');
          if (title) title.textContent = 'Images';
          if (imgBtn) imgBtn.classList.add('active');
          if (imgPane) imgPane.style.display = 'flex';
          renderGallery();
        } else {
          origSwitch.call(this, view);
        }
      };
    }
  }

  function init() {
    registerSidebarPane();

    if (window.commandPaletteCommands) {
      window.commandPaletteCommands.push({
        name: 'Images: Show Image Gallery',
        action: () => { if (window.switchStructureView) window.switchStructureView('images'); }
      });
      window.commandPaletteCommands.push({
        name: 'Images: Insert Image',
        action: () => insertImageMarkdown('image.png', 'alt text')
      });
    }
  }

  window.imageManager = {
    renderGallery,
    extractImages,
    insertImage: insertImageMarkdown
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }
})();

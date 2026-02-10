/**
 * Inline Comments / Annotations
 * Adds threaded comments to document ranges, stored per-file in localStorage.
 * Comments are shown as gutter markers and hover popups in Monaco.
 *
 * @module inline-comments
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'nightowl-comments';
  let decorationIds = [];
  let comments = {}; // { filePath: [{ id, lineStart, lineEnd, text, author, timestamp, resolved, replies }] }

  function loadComments() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) comments = JSON.parse(stored);
    } catch (e) { comments = {}; }
  }

  function saveComments() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(comments));
    } catch (e) { /* ignore */ }
  }

  function getFileComments() {
    const fp = window.currentFilePath;
    if (!fp) return [];
    if (!comments[fp]) comments[fp] = [];
    return comments[fp];
  }

  function generateId() {
    return 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  }

  /**
   * Add a comment at the current selection or cursor position.
   */
  function addComment(text, author) {
    if (!window.editor || !text) return;

    const sel = window.editor.getSelection();
    const lineStart = sel ? sel.startLineNumber : window.editor.getPosition().lineNumber;
    const lineEnd = sel ? sel.endLineNumber : lineStart;

    const comment = {
      id: generateId(),
      lineStart,
      lineEnd,
      text,
      author: author || 'You',
      timestamp: Date.now(),
      resolved: false,
      replies: []
    };

    const fc = getFileComments();
    fc.push(comment);
    saveComments();
    updateDecorations();
    return comment;
  }

  function replyToComment(commentId, text, author) {
    const fc = getFileComments();
    const comment = fc.find(c => c.id === commentId);
    if (!comment) return;

    comment.replies.push({
      id: generateId(),
      text,
      author: author || 'You',
      timestamp: Date.now()
    });
    saveComments();
    updateDecorations();
  }

  function resolveComment(commentId) {
    const fc = getFileComments();
    const comment = fc.find(c => c.id === commentId);
    if (comment) {
      comment.resolved = !comment.resolved;
      saveComments();
      updateDecorations();
    }
  }

  function deleteComment(commentId) {
    const fp = window.currentFilePath;
    if (!fp || !comments[fp]) return;
    comments[fp] = comments[fp].filter(c => c.id !== commentId);
    saveComments();
    updateDecorations();
  }

  /**
   * Update Monaco decorations for comments.
   */
  function updateDecorations() {
    if (!window.editor) return;

    const fc = getFileComments();
    const newDecorations = [];

    fc.forEach(comment => {
      if (comment.resolved) return;

      const hoverContent = [
        `**${comment.author}** — ${relativeTime(comment.timestamp)}`,
        comment.text,
        ...comment.replies.map(r => `> **${r.author}**: ${r.text}`)
      ].join('\n\n');

      newDecorations.push({
        range: new monaco.Range(comment.lineStart, 1, comment.lineEnd, 1),
        options: {
          isWholeLine: true,
          linesDecorationsClassName: 'comment-gutter-marker',
          className: 'comment-highlight',
          hoverMessage: { value: hoverContent }
        }
      });
    });

    decorationIds = window.editor.deltaDecorations(decorationIds, newDecorations);
  }

  /**
   * Show comment creation dialog.
   */
  function showAddCommentDialog() {
    if (!window.editor) return;

    const existing = document.getElementById('comment-dialog');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'comment-dialog';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:10000;display:flex;align-items:center;justify-content:center;';

    const sel = window.editor.getSelection();
    const lineInfo = sel ? `Lines ${sel.startLineNumber}-${sel.endLineNumber}` : `Line ${window.editor.getPosition().lineNumber}`;

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--bg-color,#1e1e1e);color:var(--text-color,#d4d4d4);border-radius:8px;padding:16px;width:400px;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:system-ui,sans-serif;';
    dialog.innerHTML = `
      <h3 style="margin:0 0 8px;font-size:14px;">Add Comment <span style="color:#888;font-size:12px;">(${lineInfo})</span></h3>
      <textarea id="comment-text" rows="3" style="width:100%;background:var(--bg-secondary,#252526);border:1px solid #555;color:var(--text-color,#d4d4d4);border-radius:4px;padding:8px;font-size:13px;resize:vertical;box-sizing:border-box;" placeholder="Enter your comment..." autofocus></textarea>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
        <button id="comment-cancel" style="background:transparent;border:1px solid #555;color:#888;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;">Cancel</button>
        <button id="comment-save" style="background:#569cd6;color:#fff;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;">Add Comment</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const textarea = document.getElementById('comment-text');
    textarea.focus();

    document.getElementById('comment-cancel').addEventListener('click', () => overlay.remove());
    document.getElementById('comment-save').addEventListener('click', () => {
      const text = textarea.value.trim();
      if (text) {
        addComment(text);
        if (window.showNotification) window.showNotification('Comment added', 'success');
      }
      overlay.remove();
    });
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        const text = textarea.value.trim();
        if (text) addComment(text);
        overlay.remove();
      }
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
    });
  }

  /**
   * Show all comments for the current file in a panel.
   */
  function showCommentsList() {
    const existing = document.getElementById('comments-list-dialog');
    if (existing) existing.remove();

    const fc = getFileComments();

    const overlay = document.createElement('div');
    overlay.id = 'comments-list-dialog';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:10000;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--bg-color,#1e1e1e);color:var(--text-color,#d4d4d4);border-radius:8px;padding:16px;width:500px;max-height:70vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:system-ui,sans-serif;';

    const activeCount = fc.filter(c => !c.resolved).length;

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="margin:0;font-size:15px;">Comments (${activeCount} active, ${fc.length} total)</h3>
        <button id="cl-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:18px;">✕</button>
      </div>
    `;

    if (fc.length === 0) {
      html += '<div style="color:#888;padding:20px;text-align:center;font-size:13px;">No comments yet.</div>';
    } else {
      fc.sort((a, b) => a.lineStart - b.lineStart).forEach(c => {
        const timeStr = relativeTime(c.timestamp);
        html += `
          <div style="border:1px solid ${c.resolved ? '#333' : '#569cd6'};border-radius:6px;padding:10px;margin-bottom:8px;opacity:${c.resolved ? 0.5 : 1};">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="font-size:12px;"><strong>${esc(c.author)}</strong> <span style="color:#888;">L${c.lineStart}${c.lineEnd !== c.lineStart ? '-' + c.lineEnd : ''} · ${timeStr}</span></span>
              <div style="display:flex;gap:4px;">
                <button class="cl-goto" data-line="${c.lineStart}" style="background:none;border:none;color:#569cd6;cursor:pointer;font-size:11px;">Go to</button>
                <button class="cl-resolve" data-id="${c.id}" style="background:none;border:none;color:${c.resolved ? '#4ade80' : '#888'};cursor:pointer;font-size:11px;">${c.resolved ? 'Reopen' : 'Resolve'}</button>
                <button class="cl-delete" data-id="${c.id}" style="background:none;border:none;color:#f48771;cursor:pointer;font-size:11px;">Delete</button>
              </div>
            </div>
            <div style="font-size:13px;margin-bottom:4px;">${esc(c.text)}</div>
            ${c.replies.map(r => `<div style="font-size:12px;color:#888;padding-left:12px;border-left:2px solid #444;margin-top:4px;"><strong>${esc(r.author)}</strong>: ${esc(r.text)}</div>`).join('')}
          </div>
        `;
      });
    }

    dialog.innerHTML = html;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    document.getElementById('cl-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    dialog.querySelectorAll('.cl-goto').forEach(btn => {
      btn.addEventListener('click', () => {
        const line = parseInt(btn.dataset.line);
        if (window.editor) { window.editor.revealLineInCenter(line); window.editor.setPosition({ lineNumber: line, column: 1 }); }
        overlay.remove();
      });
    });
    dialog.querySelectorAll('.cl-resolve').forEach(btn => {
      btn.addEventListener('click', () => { resolveComment(btn.dataset.id); overlay.remove(); showCommentsList(); });
    });
    dialog.querySelectorAll('.cl-delete').forEach(btn => {
      btn.addEventListener('click', () => { deleteComment(btn.dataset.id); overlay.remove(); showCommentsList(); });
    });

    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
    });
  }

  function esc(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function relativeTime(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function init() {
    loadComments();

    // Update decorations when file changes
    if (window.editor) {
      updateDecorations();
      window.editor.onDidChangeModel(() => { loadComments(); updateDecorations(); });
    }

    if (window.commandPaletteCommands) {
      window.commandPaletteCommands.push({ name: 'Comments: Add Comment', action: showAddCommentDialog });
      window.commandPaletteCommands.push({ name: 'Comments: Show All Comments', action: showCommentsList });
    }
  }

  window.inlineComments = {
    addComment,
    replyToComment,
    resolveComment,
    deleteComment,
    showAddDialog: showAddCommentDialog,
    showList: showCommentsList,
    updateDecorations
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }
})();

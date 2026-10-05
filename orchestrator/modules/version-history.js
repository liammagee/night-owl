/**
 * Local Version History
 * Auto-saves periodic snapshots of file content to IndexedDB.
 * Shows a timeline panel to browse, diff, and restore checkpoints.
 *
 * Independent of git — works even on unsaved scratch files.
 *
 * @module version-history
 */

(function () {
  'use strict';

  const DB_NAME = 'nightowl-version-history';
  const DB_VERSION = 1;
  const STORE_NAME = 'snapshots';
  const MAX_SNAPSHOTS_PER_FILE = 50;
  const CHECKPOINT_INTERVAL = 60000; // 1 minute
  const MIN_CHANGE_THRESHOLD = 20;   // minimum character diff to create checkpoint

  let db = null;
  let checkpointTimer = null;
  let lastCheckpointContent = '';
  let paneEl = null;

  // ── IndexedDB ──

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('filePath', 'filePath', { unique: false });
          store.createIndex('filePath_timestamp', ['filePath', 'timestamp'], { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getDB() {
    if (!db) db = await openDB();
    return db;
  }

  async function saveSnapshot(filePath, content, label) {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.add({
        filePath,
        content,
        timestamp: Date.now(),
        label: label || 'Auto-checkpoint',
        size: content.length
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getSnapshots(filePath) {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('filePath');
      const req = index.getAll(filePath);
      req.onsuccess = () => {
        // Sort by timestamp descending (newest first)
        const results = req.result.sort((a, b) => b.timestamp - a.timestamp);
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function getSnapshot(id) {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteSnapshot(id) {
    const database = await getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function pruneSnapshots(filePath) {
    const snapshots = await getSnapshots(filePath);
    if (snapshots.length > MAX_SNAPSHOTS_PER_FILE) {
      const toDelete = snapshots.slice(MAX_SNAPSHOTS_PER_FILE);
      for (const snap of toDelete) {
        await deleteSnapshot(snap.id);
      }
    }
  }

  // ── Checkpoint Logic ──

  async function createCheckpoint(label) {
    if (!window.editor || !window.currentFilePath) return;

    const content = window.editor.getValue();
    const filePath = window.currentFilePath;

    // Skip if content hasn't changed enough
    if (Math.abs(content.length - lastCheckpointContent.length) < MIN_CHANGE_THRESHOLD &&
        content === lastCheckpointContent) {
      return;
    }

    try {
      await saveSnapshot(filePath, content, label || 'Auto-checkpoint');
      lastCheckpointContent = content;
      await pruneSnapshots(filePath);
    } catch (e) {
      console.error('[VersionHistory] Error saving checkpoint:', e);
    }
  }

  function startAutoCheckpoints() {
    stopAutoCheckpoints();

    if (window.editor) {
      lastCheckpointContent = window.editor.getValue();
    }

    checkpointTimer = setInterval(() => {
      if (window.currentFilePath && window.editor) {
        createCheckpoint();
      }
    }, CHECKPOINT_INTERVAL);
  }

  function stopAutoCheckpoints() {
    if (checkpointTimer) {
      clearInterval(checkpointTimer);
      checkpointTimer = null;
    }
  }

  // ── Simple Diff ──

  function computeLineDiff(oldText, newText) {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const result = [];

    // Simple LCS-based diff
    const m = oldLines.length;
    const n = newLines.length;

    // For performance, use a simplified approach for large files
    if (m + n > 5000) {
      return [{ type: 'info', text: `[Diff too large: ${m} → ${n} lines]` }];
    }

    // Build LCS table
    const dp = [];
    for (let i = 0; i <= m; i++) {
      dp[i] = new Uint16Array(n + 1);
    }
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to get diff
    const diffOps = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        diffOps.unshift({ type: 'same', text: oldLines[i - 1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        diffOps.unshift({ type: 'add', text: newLines[j - 1] });
        j--;
      } else {
        diffOps.unshift({ type: 'del', text: oldLines[i - 1] });
        i--;
      }
    }

    // Collapse unchanged context (show 3 lines around changes)
    const contextLines = 3;
    let lastShown = -1;

    for (let k = 0; k < diffOps.length; k++) {
      if (diffOps[k].type !== 'same') {
        // Show context before
        const contextStart = Math.max(lastShown + 1, k - contextLines);
        if (contextStart > lastShown + 1 && lastShown >= 0) {
          result.push({ type: 'sep', text: '···' });
        }
        for (let c = contextStart; c < k; c++) {
          if (c > lastShown) result.push(diffOps[c]);
        }
        result.push(diffOps[k]);
        lastShown = k;
      } else if (k - lastShown <= contextLines && lastShown >= 0) {
        // Within context after a change
        result.push(diffOps[k]);
        lastShown = k;
      }
    }

    return result;
  }

  // ── UI ──

  function getOrCreatePane() {
    if (paneEl) return paneEl;

    paneEl = document.getElementById('version-history-pane');
    if (paneEl) return paneEl;

    // Create the pane
    paneEl = document.createElement('div');
    paneEl.id = 'version-history-pane';
    paneEl.className = 'content-pane';
    paneEl.style.cssText = 'display:none;height:100%;flex-direction:column;overflow-y:auto;padding:8px;';

    // Insert after git-pane
    const gitPane = document.getElementById('git-pane');
    if (gitPane && gitPane.parentNode) {
      gitPane.parentNode.insertBefore(paneEl, gitPane.nextSibling);
    }

    return paneEl;
  }

  async function renderTimeline() {
    const pane = getOrCreatePane();
    const filePath = window.currentFilePath;

    if (!filePath) {
      pane.innerHTML = '<div style="color:#888;padding:12px;font-size:13px;">No file open</div>';
      return;
    }

    const snapshots = await getSnapshots(filePath);
    const filename = filePath.split('/').pop();

    let html = `
      <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:12px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeAttr(filePath)}">${escapeHtml(filename)}</span>
        <button id="vh-create-checkpoint" style="background:#569cd6;color:#fff;border:none;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px;">Save Checkpoint</button>
      </div>
    `;

    if (snapshots.length === 0) {
      html += '<div style="color:#888;padding:12px;font-size:13px;text-align:center;">No checkpoints yet.<br>Checkpoints are saved automatically every minute.</div>';
    } else {
      html += '<div id="vh-timeline" style="display:flex;flex-direction:column;gap:4px;">';

      // Add "Current" entry
      html += `
        <div class="vh-entry" style="padding:6px 8px;border-radius:4px;background:var(--bg-hover,rgba(255,255,255,0.05));border-left:3px solid #569cd6;">
          <div style="font-size:12px;font-weight:600;color:#569cd6;">Current</div>
          <div style="font-size:11px;color:#888;">Unsaved editor state</div>
        </div>
      `;

      snapshots.forEach((snap, idx) => {
        const time = formatTime(snap.timestamp);
        const relTime = relativeTime(snap.timestamp);
        const sizeKB = (snap.size / 1024).toFixed(1);

        html += `
          <div class="vh-entry" style="padding:6px 8px;border-radius:4px;border:1px solid var(--border-color,#333);cursor:pointer;" data-snap-id="${snap.id}" data-snap-idx="${idx}">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:12px;color:var(--text-primary,#d4d4d4);">${escapeHtml(snap.label)}</span>
              <span style="font-size:10px;color:#888;">${sizeKB} KB</span>
            </div>
            <div style="font-size:11px;color:#888;" title="${time}">${relTime}</div>
            <div style="display:flex;gap:4px;margin-top:4px;">
              <button class="vh-diff-btn" data-id="${snap.id}" style="background:none;border:1px solid #555;color:#888;border-radius:3px;padding:1px 6px;cursor:pointer;font-size:10px;">Diff</button>
              <button class="vh-restore-btn" data-id="${snap.id}" style="background:none;border:1px solid #555;color:#888;border-radius:3px;padding:1px 6px;cursor:pointer;font-size:10px;">Restore</button>
              <button class="vh-delete-btn" data-id="${snap.id}" style="background:none;border:1px solid #555;color:#f48771;border-radius:3px;padding:1px 6px;cursor:pointer;font-size:10px;">Delete</button>
            </div>
          </div>
        `;
      });

      html += '</div>';
    }

    pane.innerHTML = html;

    // Wire events
    const createBtn = document.getElementById('vh-create-checkpoint');
    if (createBtn) {
      createBtn.addEventListener('click', async () => {
        await createCheckpoint('Manual checkpoint');
        renderTimeline();
        if (window.showNotification) window.showNotification('Checkpoint saved', 'success');
      });
    }

    pane.querySelectorAll('.vh-diff-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        await showDiff(id);
      });
    });

    pane.querySelectorAll('.vh-restore-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        await restoreSnapshot(id);
      });
    });

    pane.querySelectorAll('.vh-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        await deleteSnapshot(id);
        renderTimeline();
      });
    });
  }

  async function showDiff(snapshotId) {
    const snap = await getSnapshot(snapshotId);
    if (!snap || !window.editor) return;

    const currentContent = window.editor.getValue();
    const diff = computeLineDiff(snap.content, currentContent);

    // Show diff in a modal overlay
    const existing = document.getElementById('vh-diff-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'vh-diff-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--bg-primary,#1e1e1e);color:var(--text-primary,#d4d4d4);border-radius:8px;padding:16px;width:700px;max-height:80vh;overflow-y:auto;font-family:"SF Mono","Fira Code","Consolas",monospace;font-size:12px;box-shadow:0 8px 32px rgba(0,0,0,0.5);';

    const time = formatTime(snap.timestamp);
    let diffHtml = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div>
          <span style="font-weight:600;">Diff:</span>
          <span style="color:#888;">${escapeHtml(snap.label)} (${time}) → Current</span>
        </div>
        <button id="vh-diff-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:18px;">✕</button>
      </div>
      <div style="border:1px solid #333;border-radius:4px;overflow:hidden;">
    `;

    if (diff.length === 0) {
      diffHtml += '<div style="padding:12px;color:#888;text-align:center;">No differences</div>';
    } else {
      diff.forEach(line => {
        let bg = 'transparent';
        let color = '#d4d4d4';
        let prefix = ' ';

        if (line.type === 'add') {
          bg = 'rgba(34, 197, 94, 0.15)';
          color = '#4ade80';
          prefix = '+';
        } else if (line.type === 'del') {
          bg = 'rgba(239, 68, 68, 0.15)';
          color = '#f87171';
          prefix = '-';
        } else if (line.type === 'sep') {
          bg = 'rgba(100, 100, 100, 0.1)';
          color = '#888';
          prefix = ' ';
        } else if (line.type === 'info') {
          bg = 'rgba(59, 130, 246, 0.1)';
          color = '#60a5fa';
          prefix = ' ';
        }

        diffHtml += `<div style="background:${bg};color:${color};padding:1px 8px;white-space:pre-wrap;word-break:break-all;border-bottom:1px solid rgba(100,100,100,0.1);"><span style="color:#888;user-select:none;">${prefix} </span>${escapeHtml(line.text)}</div>`;
      });
    }

    diffHtml += '</div>';
    dialog.innerHTML = diffHtml;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    document.getElementById('vh-diff-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
    });
  }

  async function restoreSnapshot(snapshotId) {
    const snap = await getSnapshot(snapshotId);
    if (!snap || !window.editor) return;

    // Save current state as a checkpoint before restoring
    await createCheckpoint('Before restore');

    window.editor.setValue(snap.content);
    if (window.showNotification) {
      window.showNotification(`Restored to: ${snap.label}`, 'info');
    }
    renderTimeline();
  }

  // ── Helpers ──

  function formatTime(ts) {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function relativeTime(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return formatTime(ts);
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // ── Integration with switchStructureView ──

  function registerSidebarPane() {
    // Add button to sidebar header
    const gitBtn = document.getElementById('show-git-btn');
    if (gitBtn && !document.getElementById('show-history-btn')) {
      const btn = document.createElement('button');
      btn.id = 'show-history-btn';
      btn.className = 'btn pane-toggle-button';
      btn.title = 'Version History';
      btn.style.cssText = 'padding: 2px 5px; font-size: 12px; min-width: 26px;';
      btn.textContent = '\u{1F553}'; // clock emoji
      btn.addEventListener('click', () => {
        if (window.switchStructureView) {
          window.switchStructureView('history');
        }
      });
      gitBtn.parentNode.insertBefore(btn, gitBtn.nextSibling);
    }

    // Patch switchStructureView to handle 'history'
    const origSwitch = window.switchStructureView;
    if (origSwitch) {
      window.switchStructureView = function (view) {
        // Hide our pane by default
        const histPane = getOrCreatePane();
        if (histPane) histPane.style.display = 'none';

        const histBtn = document.getElementById('show-history-btn');
        if (histBtn) histBtn.classList.remove('active');

        if (view === 'history') {
          // Call original to reset all panes
          origSwitch.call(this, 'structure');
          // Then hide structure and show ours
          const structureList = document.getElementById('structure-list');
          if (structureList) structureList.style.display = 'none';
          const showStructureBtn = document.getElementById('show-structure-btn');
          if (showStructureBtn) showStructureBtn.classList.remove('active');

          const structurePaneTitle = document.getElementById('structure-pane-title');
          if (structurePaneTitle) structurePaneTitle.textContent = 'Version History';
          if (histBtn) histBtn.classList.add('active');
          if (histPane) histPane.style.display = 'flex';

          renderTimeline();
        } else {
          origSwitch.call(this, view);
        }
      };
    }
  }

  // ── Init ──

  async function diffWithLatestCheckpoint() {
    if (!window.currentFilePath) return;
    const snapshots = await getSnapshots(window.currentFilePath);
    if (!snapshots || snapshots.length === 0) {
      if (window.showNotification) window.showNotification('No checkpoints to compare', 'warning');
      return;
    }
    await showDiff(snapshots[0].id);
  }

  async function restoreLatestCheckpoint() {
    if (!window.currentFilePath) return;
    const snapshots = await getSnapshots(window.currentFilePath);
    if (!snapshots || snapshots.length === 0) {
      if (window.showNotification) window.showNotification('No checkpoints to restore', 'warning');
      return;
    }
    await restoreSnapshot(snapshots[0].id);
  }

  function registerCommandPaletteCommands() {
    if (typeof window.registerCommand === 'function') {
      window.registerCommand(
        'versionHistory.showTimeline',
        'Version History: Show Timeline',
        () => {
          if (window.switchStructureView) window.switchStructureView('history');
        }
      );
      window.registerCommand(
        'versionHistory.saveCheckpoint',
        'Version History: Save Checkpoint',
        async () => {
          await createCheckpoint('Manual checkpoint');
          if (window.showNotification) window.showNotification('Checkpoint saved', 'success');
        }
      );
      window.registerCommand(
        'versionHistory.diffLatest',
        'Version History: Diff Current vs Latest Checkpoint',
        async () => {
          await diffWithLatestCheckpoint();
        }
      );
      window.registerCommand(
        'versionHistory.restoreLatest',
        'Version History: Restore Latest Checkpoint',
        async () => {
          await restoreLatestCheckpoint();
        }
      );
      return true;
    }

    return false;
  }

  function init() {
    registerSidebarPane();
    startAutoCheckpoints();

    // Create initial checkpoint when file is opened
    if (window.currentFilePath && window.editor) {
      lastCheckpointContent = window.editor.getValue();
      createCheckpoint('File opened');
    }

    if (!registerCommandPaletteCommands()) {
      // Some modules initialize later; retry once after initial boot.
      setTimeout(registerCommandPaletteCommands, 800);
    }
  }

  // Public API
  window.versionHistory = {
    createCheckpoint,
    getSnapshots,
    showDiff,
    restoreSnapshot,
    renderTimeline,
    startAutoCheckpoints,
    stopAutoCheckpoints
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }
})();

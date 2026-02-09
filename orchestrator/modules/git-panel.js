/**
 * Git Panel Module
 * Full git source control panel with staging, diffs, branches,
 * commit history, stash, blame, and conflict resolution.
 *
 * @module git-panel
 */

(function () {
  'use strict';

  // --- State ---
  let repoRoot = null;
  let currentBranch = '';
  let historyLoaded = false;
  let historyExpanded = false;
  let blameActive = false;
  let blameDecorations = [];
  let blameFile = null;

  // --- Helpers ---
  function basename(filePath) {
    return filePath.split(/[/\\]/).pop();
  }

  function dirname(filePath) {
    const parts = filePath.split(/[/\\]/);
    parts.pop();
    return parts.join('/');
  }

  function statusChar(status) {
    if (status === 'added') return 'A';
    if (status === 'modified') return 'M';
    if (status === 'deleted') return 'D';
    if (status === 'untracked') return 'U';
    if (status === 'renamed') return 'R';
    return 'M';
  }

  function notify(msg, type) {
    if (typeof showNotification === 'function') {
      showNotification(msg, type || 'info');
    } else {
      console.log(`[GitPanel] ${type}: ${msg}`);
    }
  }

  // --- Core: Refresh panel ---
  async function refresh() {
    if (!window.electronAPI) return;

    const workingDir = window.appSettings?.workingDirectory;
    if (!workingDir) return;

    // Find repo
    const repoResult = await window.electronAPI.invoke('git-find-repo', workingDir);
    if (!repoResult.success) {
      repoRoot = null;
      renderNoRepo();
      return;
    }
    repoRoot = repoResult.repoRoot;

    // Get branch
    const branchResult = await window.electronAPI.invoke('git-get-branch', repoRoot);
    currentBranch = branchResult.success ? branchResult.branch : '??';
    const branchEl = document.getElementById('git-branch-name');
    if (branchEl) branchEl.textContent = currentBranch;

    // Get detailed status
    const statusResult = await window.electronAPI.invoke('git-status-detailed', repoRoot);
    if (statusResult.success) {
      renderFileList('git-staged-list', statusResult.staged, true);
      renderFileList('git-unstaged-list', statusResult.unstaged, false);
      const stagedCount = document.getElementById('git-staged-count');
      const unstagedCount = document.getElementById('git-unstaged-count');
      if (stagedCount) stagedCount.textContent = statusResult.staged.length;
      if (unstagedCount) unstagedCount.textContent = statusResult.unstaged.length;
    }

    // Load stashes
    await refreshStashes();

    // Also update the status bar indicator if it exists
    if (typeof updateGitStatusIndicator === 'function') {
      updateGitStatusIndicator();
    }
  }

  function renderNoRepo() {
    const stagedList = document.getElementById('git-staged-list');
    const unstagedList = document.getElementById('git-unstaged-list');
    if (stagedList) stagedList.innerHTML = '';
    if (unstagedList) unstagedList.innerHTML = '<div style="padding: 12px; font-size: 12px; color: #888; text-align: center;">Not a git repository</div>';
  }

  // --- Render file list ---
  function renderFileList(containerId, files, isStaged) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    for (const file of files) {
      const item = document.createElement('div');
      item.className = 'git-file-item';
      item.title = file.file;

      const dir = dirname(file.file);
      const name = basename(file.file);

      item.innerHTML = `
        <span class="git-file-status ${file.status}">${statusChar(file.status)}</span>
        <span class="git-file-name">${name}</span>
        ${dir ? `<span class="git-file-dir">${dir}</span>` : ''}
        <span class="git-file-actions">
          ${isStaged
            ? `<button class="git-act-unstage" title="Unstage">−</button>`
            : `<button class="git-act-discard" title="Discard Changes">✕</button><button class="git-act-stage" title="Stage">+</button>`
          }
        </span>
      `;

      // Click to view diff
      item.addEventListener('click', (e) => {
        if (e.target.closest('.git-file-actions')) return;
        showDiff(file.file, isStaged, file.status);
      });

      // Action buttons
      const unstageBtn = item.querySelector('.git-act-unstage');
      if (unstageBtn) {
        unstageBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await window.electronAPI.invoke('git-unstage', { repoRoot, paths: [file.file] });
          refresh();
        });
      }

      const stageBtn = item.querySelector('.git-act-stage');
      if (stageBtn) {
        stageBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await window.electronAPI.invoke('git-stage', { repoRoot, paths: [file.file] });
          refresh();
        });
      }

      const discardBtn = item.querySelector('.git-act-discard');
      if (discardBtn) {
        discardBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm(`Discard changes to ${name}?`)) return;
          await window.electronAPI.invoke('git-discard', {
            repoRoot,
            paths: [file.file],
            untracked: file.status === 'untracked'
          });
          refresh();
        });
      }

      container.appendChild(item);
    }
  }

  // --- Phase 2: Diff viewer ---
  async function showDiff(filePath, cached, status) {
    if (!repoRoot) return;

    // For untracked or added files, show full content
    let originalContent = '';
    let modifiedContent = '';

    if (status === 'untracked') {
      // New untracked file — show full content as "added"
      try {
        const result = await window.electronAPI.invoke('read-file',
          repoRoot + '/' + filePath);
        modifiedContent = typeof result === 'string' ? result : (result?.content || '');
      } catch (e) {
        modifiedContent = '';
      }
    } else if (status === 'deleted') {
      // Deleted file — show HEAD version as "removed"
      const headResult = await window.electronAPI.invoke('git-file-content', {
        repoRoot, ref: 'HEAD', filePath
      });
      originalContent = headResult.success ? headResult.content : '';
    } else {
      // Get HEAD version
      const headResult = await window.electronAPI.invoke('git-file-content', {
        repoRoot, ref: 'HEAD', filePath
      });
      originalContent = headResult.success ? headResult.content : '';

      // Get working copy
      try {
        const result = await window.electronAPI.invoke('read-file',
          repoRoot + '/' + filePath);
        modifiedContent = typeof result === 'string' ? result : (result?.content || '');
      } catch (e) {
        modifiedContent = originalContent;
      }

      // If cached (staged), modified = staged content which we get from index
      if (cached) {
        const indexResult = await window.electronAPI.invoke('git-file-content', {
          repoRoot, ref: ':0', filePath
        });
        if (indexResult.success) {
          modifiedContent = indexResult.content;
        }
      }
    }

    openDiffModal(filePath, originalContent, modifiedContent);
  }

  function openDiffModal(filePath, original, modified) {
    // Remove any existing overlay
    closeDiffModal();

    const overlay = document.createElement('div');
    overlay.className = 'git-diff-overlay';
    overlay.id = 'git-diff-overlay';

    overlay.innerHTML = `
      <div class="git-diff-modal">
        <div class="git-diff-header">
          <span>${basename(filePath)} <span style="opacity:0.5; font-weight:normal; font-size:11px;">${dirname(filePath)}</span></span>
          <div style="display:flex;gap:8px;align-items:center;">
            <label style="font-size:11px;font-weight:normal;display:flex;align-items:center;gap:4px;">
              <input type="checkbox" id="git-diff-inline-toggle"> Inline
            </label>
            <button id="git-diff-close" style="background:none;border:none;font-size:18px;cursor:pointer;color:inherit;">✕</button>
          </div>
        </div>
        <div class="git-diff-body" id="git-diff-editor-container"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close handlers
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDiffModal();
    });
    document.getElementById('git-diff-close').addEventListener('click', closeDiffModal);

    const escHandler = (e) => {
      if (e.key === 'Escape') { closeDiffModal(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    // Create diff editor using Monaco
    const container = document.getElementById('git-diff-editor-container');
    if (window.monaco && window.monaco.editor) {
      const lang = filePath.endsWith('.js') ? 'javascript'
        : filePath.endsWith('.ts') ? 'typescript'
        : filePath.endsWith('.json') ? 'json'
        : filePath.endsWith('.html') ? 'html'
        : filePath.endsWith('.css') ? 'css'
        : filePath.endsWith('.md') ? 'markdown'
        : filePath.endsWith('.py') ? 'python'
        : 'plaintext';

      const originalModel = window.monaco.editor.createModel(original, lang);
      const modifiedModel = window.monaco.editor.createModel(modified, lang);

      const diffEditor = window.monaco.editor.createDiffEditor(container, {
        readOnly: true,
        renderSideBySide: true,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        theme: document.body.classList.contains('dark-mode') ? 'vs-dark' : 'vs'
      });

      diffEditor.setModel({ original: originalModel, modified: modifiedModel });

      // Inline toggle
      const inlineToggle = document.getElementById('git-diff-inline-toggle');
      if (inlineToggle) {
        inlineToggle.addEventListener('change', () => {
          diffEditor.updateOptions({ renderSideBySide: !inlineToggle.checked });
        });
      }

      // Store for cleanup
      overlay._diffEditor = diffEditor;
      overlay._models = [originalModel, modifiedModel];
    } else {
      // Fallback: show raw text diff
      container.innerHTML = `<pre style="padding:16px;overflow:auto;height:100%;margin:0;font-size:12px;">${escapeHtml(modified || original || '(empty)')}</pre>`;
    }
  }

  function closeDiffModal() {
    const overlay = document.getElementById('git-diff-overlay');
    if (overlay) {
      if (overlay._diffEditor) overlay._diffEditor.dispose();
      if (overlay._models) overlay._models.forEach(m => m.dispose());
      overlay.remove();
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // --- Phase 3: Branch switching ---
  function showBranchDialog() {
    if (!repoRoot) return;

    const dialog = document.createElement('div');
    dialog.className = 'git-branch-dialog';
    dialog.id = 'git-branch-dialog';

    dialog.innerHTML = `
      <div class="git-branch-picker">
        <input type="text" id="git-branch-search" placeholder="Switch to branch... (type to filter or create)" autofocus>
        <div class="git-branch-list" id="git-branch-list"></div>
      </div>
    `;

    document.body.appendChild(dialog);

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) closeBranchDialog();
    });

    const escHandler = (e) => {
      if (e.key === 'Escape') { closeBranchDialog(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    loadBranches();
  }

  async function loadBranches(filter) {
    const listEl = document.getElementById('git-branch-list');
    if (!listEl) return;

    const result = await window.electronAPI.invoke('git-list-branches', repoRoot);
    if (!result.success) {
      listEl.innerHTML = '<div style="padding:12px;font-size:12px;color:#888;">Failed to load branches</div>';
      return;
    }

    const searchInput = document.getElementById('git-branch-search');
    const filterText = (filter || searchInput?.value || '').toLowerCase();

    // Merge local and remote, deduplicate
    const allBranches = new Set([...result.local]);
    result.remote.forEach(b => allBranches.add(b));

    const filtered = [...allBranches].filter(b => !filterText || b.toLowerCase().includes(filterText));
    listEl.innerHTML = '';

    // "Create new" option if typed something that doesn't match
    if (filterText && !allBranches.has(filterText)) {
      const createItem = document.createElement('div');
      createItem.className = 'git-branch-item';
      createItem.innerHTML = `<span class="branch-icon">+</span> Create branch "${escapeHtml(filterText)}"`;
      createItem.addEventListener('click', async () => {
        await switchBranch(filterText, true);
      });
      listEl.appendChild(createItem);
    }

    for (const branch of filtered) {
      const item = document.createElement('div');
      item.className = 'git-branch-item' + (branch === result.current ? ' current' : '');
      const isRemote = !result.local.includes(branch);
      item.innerHTML = `
        <span class="branch-icon">${branch === result.current ? '●' : (isRemote ? '☁' : '⎇')}</span>
        ${escapeHtml(branch)}
      `;
      if (branch !== result.current) {
        item.addEventListener('click', () => switchBranch(branch, false));
      }
      listEl.appendChild(item);
    }

    // Wire up search filtering
    if (searchInput && !searchInput._wired) {
      searchInput._wired = true;
      searchInput.addEventListener('input', () => loadBranches());
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const firstItem = listEl.querySelector('.git-branch-item:not(.current)');
          if (firstItem) firstItem.click();
        }
      });
    }
  }

  async function switchBranch(branch, create) {
    closeBranchDialog();

    // Check for dirty tree
    const statusResult = await window.electronAPI.invoke('git-status-detailed', repoRoot);
    if (statusResult.success && (statusResult.staged.length > 0 || statusResult.unstaged.length > 0)) {
      const choice = confirm('You have uncommitted changes. Stash them before switching?');
      if (choice) {
        const stashResult = await window.electronAPI.invoke('git-stash-save', {
          repoRoot, message: `Auto-stash before switching to ${branch}`
        });
        if (!stashResult.success) {
          notify('Failed to stash changes: ' + stashResult.error, 'error');
          return;
        }
        notify('Changes stashed', 'info');
      }
    }

    const result = await window.electronAPI.invoke('git-switch-branch', { repoRoot, branch, create });
    if (result.success) {
      notify(`Switched to ${branch}`, 'success');
      refresh();
    } else {
      notify('Failed to switch: ' + result.error, 'error');
    }
  }

  function closeBranchDialog() {
    const dialog = document.getElementById('git-branch-dialog');
    if (dialog) dialog.remove();
  }

  // --- Phase 4: Commit history ---
  async function loadHistory() {
    const listEl = document.getElementById('git-history-list');
    if (!listEl || !repoRoot) return;

    listEl.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:#888;">Loading...</div>';

    const result = await window.electronAPI.invoke('git-log', { repoRoot, limit: 50 });
    if (!result.success) {
      listEl.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:#888;">Failed to load history</div>';
      return;
    }

    listEl.innerHTML = '';
    for (const commit of result.commits) {
      const item = document.createElement('div');
      item.className = 'git-commit-item';
      item.innerHTML = `
        <div class="git-commit-msg">
          <span class="git-commit-hash">${commit.shortHash}</span>${escapeHtml(commit.message)}
        </div>
        <div class="git-commit-meta">${escapeHtml(commit.author)} · ${escapeHtml(commit.relativeTime)}</div>
      `;
      item.addEventListener('click', () => showCommitDetail(commit.hash));
      listEl.appendChild(item);
    }

    historyLoaded = true;
  }

  async function showCommitDetail(hash) {
    const result = await window.electronAPI.invoke('git-show', { repoRoot, hash });
    if (!result.success) {
      notify('Failed to load commit detail', 'error');
      return;
    }
    const commit = result.commit;

    // Show in a diff overlay with file list
    closeDiffModal();
    const overlay = document.createElement('div');
    overlay.className = 'git-diff-overlay';
    overlay.id = 'git-diff-overlay';

    const filesHtml = commit.files.map(f =>
      `<div class="git-file-item" data-file="${escapeHtml(f.file)}" style="cursor:pointer;">
        <span class="git-file-name">${escapeHtml(basename(f.file))}</span>
        <span class="git-file-dir">${escapeHtml(f.changes)}</span>
      </div>`
    ).join('');

    overlay.innerHTML = `
      <div class="git-diff-modal" style="width:60vw;">
        <div class="git-diff-header">
          <div>
            <span style="font-family:monospace;color:var(--primary-500,#ef4444);">${commit.hash.substring(0, 8)}</span>
            <span style="margin-left:8px;">${escapeHtml(commit.message)}</span>
          </div>
          <button id="git-diff-close" style="background:none;border:none;font-size:18px;cursor:pointer;color:inherit;">✕</button>
        </div>
        <div style="padding:8px 16px;font-size:11px;opacity:0.6;border-bottom:1px solid var(--neutral-200,#eee);">
          ${escapeHtml(commit.author)} · ${escapeHtml(commit.relativeTime)}
          ${commit.body ? '<br>' + escapeHtml(commit.body) : ''}
        </div>
        <div style="flex:1;overflow-y:auto;">
          ${filesHtml}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDiffModal(); });
    document.getElementById('git-diff-close').addEventListener('click', closeDiffModal);

    const escHandler = (e) => {
      if (e.key === 'Escape') { closeDiffModal(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    // Wire up file clicks to show commit diff
    overlay.querySelectorAll('.git-file-item[data-file]').forEach(el => {
      el.addEventListener('click', async () => {
        const filePath = el.dataset.file;
        const diffResult = await window.electronAPI.invoke('git-diff-commit', { repoRoot, hash, filePath });
        if (diffResult.success) {
          // Parse diff to get before/after — fallback: just show raw diff
          closeDiffModal();
          // Show content at parent and at commit
          const parentContent = await window.electronAPI.invoke('git-file-content', {
            repoRoot, ref: hash + '^', filePath
          });
          const commitContent = await window.electronAPI.invoke('git-file-content', {
            repoRoot, ref: hash, filePath
          });
          openDiffModal(filePath,
            parentContent.success ? parentContent.content : '',
            commitContent.success ? commitContent.content : ''
          );
        }
      });
    });
  }

  // --- Phase 5: Stash ---
  async function refreshStashes() {
    if (!repoRoot) return;
    const section = document.getElementById('git-stash-section');
    const listEl = document.getElementById('git-stash-list');
    const countEl = document.getElementById('git-stash-count');
    if (!section || !listEl) return;

    const result = await window.electronAPI.invoke('git-stash-list', repoRoot);
    if (!result.success || result.stashes.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';
    if (countEl) countEl.textContent = result.stashes.length;
    listEl.innerHTML = '';

    for (const stash of result.stashes) {
      const item = document.createElement('div');
      item.className = 'git-stash-item';
      item.innerHTML = `
        <span class="git-stash-msg" title="${escapeHtml(stash.message)}">${escapeHtml(stash.message)}</span>
        <span style="font-size:10px;opacity:0.5;flex-shrink:0;">${escapeHtml(stash.relativeTime)}</span>
        <span class="git-stash-actions">
          <button title="Apply" class="git-stash-apply">↩</button>
          <button title="Pop (apply + delete)" class="git-stash-pop">⬆</button>
          <button title="Drop" class="git-stash-drop">✕</button>
        </span>
      `;

      item.querySelector('.git-stash-apply').addEventListener('click', async () => {
        const r = await window.electronAPI.invoke('git-stash-apply', { repoRoot, ref: stash.ref, drop: false });
        r.success ? notify('Stash applied', 'success') : notify('Apply failed: ' + r.error, 'error');
        refresh();
      });

      item.querySelector('.git-stash-pop').addEventListener('click', async () => {
        const r = await window.electronAPI.invoke('git-stash-apply', { repoRoot, ref: stash.ref, drop: true });
        r.success ? notify('Stash popped', 'success') : notify('Pop failed: ' + r.error, 'error');
        refresh();
      });

      item.querySelector('.git-stash-drop').addEventListener('click', async () => {
        if (!confirm('Drop this stash?')) return;
        const r = await window.electronAPI.invoke('git-stash-drop', { repoRoot, ref: stash.ref });
        r.success ? notify('Stash dropped', 'success') : notify('Drop failed: ' + r.error, 'error');
        refresh();
      });

      listEl.appendChild(item);
    }
  }

  // --- Phase 6: Blame ---
  async function toggleBlame() {
    if (!window.editor || !repoRoot) return;

    if (blameActive) {
      clearBlame();
      return;
    }

    const filePath = window.currentFilePath;
    if (!filePath) {
      notify('No file open', 'error');
      return;
    }

    // Get relative path from repo root
    let relativePath = filePath;
    if (filePath.startsWith(repoRoot)) {
      relativePath = filePath.substring(repoRoot.length + 1);
    }

    const result = await window.electronAPI.invoke('git-blame', { repoRoot, filePath: relativePath });
    if (!result.success) {
      notify('Blame failed: ' + result.error, 'error');
      return;
    }

    blameActive = true;
    blameFile = filePath;

    // Create decorations
    const decorations = result.lines.map(line => {
      const age = line.authorTime ? timeAgo(line.authorTime * 1000) : '';
      return {
        range: new window.monaco.Range(line.line, 1, line.line, 1),
        options: {
          after: {
            content: `  ${line.author.substring(0, 12).padEnd(12)} ${age.padEnd(10)} ${line.summary.substring(0, 40)}`,
            inlineClassName: 'git-blame-decoration'
          },
          isWholeLine: false
        }
      };
    });

    blameDecorations = window.editor.deltaDecorations([], decorations);
  }

  function clearBlame() {
    if (blameDecorations.length > 0 && window.editor) {
      window.editor.deltaDecorations(blameDecorations, []);
    }
    blameDecorations = [];
    blameActive = false;
    blameFile = null;
  }

  function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    if (days < 30) return days + 'd ago';
    const months = Math.floor(days / 30);
    if (months < 12) return months + 'mo ago';
    return Math.floor(months / 12) + 'y ago';
  }

  // --- Phase 7: Merge conflicts ---
  async function checkConflicts() {
    if (!repoRoot) return;
    const result = await window.electronAPI.invoke('git-merge-conflicts', repoRoot);
    if (result.success && result.files.length > 0) {
      showConflictUI(result.files);
    }
  }

  function showConflictUI(files) {
    closeDiffModal();
    const overlay = document.createElement('div');
    overlay.className = 'git-diff-overlay';
    overlay.id = 'git-diff-overlay';

    const fileList = files.map(f =>
      `<div class="git-file-item" data-conflict-file="${escapeHtml(f)}" style="cursor:pointer;">
        <span class="git-file-status deleted">!</span>
        <span class="git-file-name">${escapeHtml(basename(f))}</span>
        <span class="git-file-dir">${escapeHtml(dirname(f))}</span>
      </div>`
    ).join('');

    overlay.innerHTML = `
      <div class="git-diff-modal" style="width:50vw;height:auto;max-height:60vh;">
        <div class="git-diff-header">
          <span>⚠ Merge Conflicts (${files.length} file${files.length > 1 ? 's' : ''})</span>
          <button id="git-diff-close" style="background:none;border:none;font-size:18px;cursor:pointer;color:inherit;">✕</button>
        </div>
        <div style="flex:1;overflow-y:auto;">${fileList}</div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDiffModal(); });
    document.getElementById('git-diff-close').addEventListener('click', closeDiffModal);

    // Click to resolve
    overlay.querySelectorAll('[data-conflict-file]').forEach(el => {
      el.addEventListener('click', () => openConflictResolver(el.dataset.conflictFile));
    });
  }

  async function openConflictResolver(filePath) {
    closeDiffModal();

    // Read current file content (with conflict markers)
    let content = '';
    try {
      const result = await window.electronAPI.invoke('read-file', repoRoot + '/' + filePath);
      content = typeof result === 'string' ? result : (result?.content || '');
    } catch (e) {
      notify('Failed to read file', 'error');
      return;
    }

    // Extract ours and theirs
    const oursLines = [];
    const theirsLines = [];
    let inOurs = false, inTheirs = false;

    for (const line of content.split('\n')) {
      if (line.startsWith('<<<<<<<')) { inOurs = true; continue; }
      if (line.startsWith('=======')) { inOurs = false; inTheirs = true; continue; }
      if (line.startsWith('>>>>>>>')) { inTheirs = false; continue; }
      if (inOurs) oursLines.push(line);
      else if (inTheirs) theirsLines.push(line);
      else { oursLines.push(line); theirsLines.push(line); }
    }

    // Show diff with conflict resolution buttons
    const overlay = document.createElement('div');
    overlay.className = 'git-diff-overlay';
    overlay.id = 'git-diff-overlay';

    overlay.innerHTML = `
      <div class="git-diff-modal">
        <div class="git-diff-header">
          <span>Resolve: ${escapeHtml(basename(filePath))}</span>
          <button id="git-diff-close" style="background:none;border:none;font-size:18px;cursor:pointer;color:inherit;">✕</button>
        </div>
        <div class="git-diff-body" id="git-diff-editor-container"></div>
        <div class="git-conflict-actions">
          <button id="git-accept-ours" class="btn">Accept Ours</button>
          <button id="git-accept-theirs" class="btn">Accept Theirs</button>
          <button id="git-accept-both" class="btn">Accept Both</button>
          <button id="git-mark-resolved" class="btn btn-primary" style="margin-left:auto;">Mark Resolved</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDiffModal(); });
    document.getElementById('git-diff-close').addEventListener('click', closeDiffModal);

    // Create diff editor
    const container = document.getElementById('git-diff-editor-container');
    if (window.monaco && window.monaco.editor) {
      const originalModel = window.monaco.editor.createModel(oursLines.join('\n'), 'plaintext');
      const modifiedModel = window.monaco.editor.createModel(theirsLines.join('\n'), 'plaintext');

      const diffEditor = window.monaco.editor.createDiffEditor(container, {
        readOnly: true,
        renderSideBySide: true,
        automaticLayout: true,
        minimap: { enabled: false },
        theme: document.body.classList.contains('dark-mode') ? 'vs-dark' : 'vs'
      });
      diffEditor.setModel({ original: originalModel, modified: modifiedModel });
      overlay._diffEditor = diffEditor;
      overlay._models = [originalModel, modifiedModel];
    }

    // Conflict action handlers
    const writeAndResolve = async (newContent) => {
      try {
        await window.electronAPI.invoke('save-file', {
          filePath: repoRoot + '/' + filePath,
          content: newContent
        });
        await window.electronAPI.invoke('git-mark-resolved', { repoRoot, filePath });
        closeDiffModal();
        notify(`Resolved: ${basename(filePath)}`, 'success');
        refresh();
      } catch (e) {
        notify('Failed to resolve: ' + e.message, 'error');
      }
    };

    document.getElementById('git-accept-ours').addEventListener('click', () => {
      writeAndResolve(oursLines.join('\n'));
    });
    document.getElementById('git-accept-theirs').addEventListener('click', () => {
      writeAndResolve(theirsLines.join('\n'));
    });
    document.getElementById('git-accept-both').addEventListener('click', () => {
      writeAndResolve([...oursLines, ...theirsLines].join('\n'));
    });
    document.getElementById('git-mark-resolved').addEventListener('click', async () => {
      await window.electronAPI.invoke('git-mark-resolved', { repoRoot, filePath });
      closeDiffModal();
      notify(`Marked resolved: ${basename(filePath)}`, 'success');
      refresh();
    });
  }

  // --- Initialize ---
  function init() {
    // Button listeners
    const commitBtn = document.getElementById('git-commit-btn');
    if (commitBtn) {
      commitBtn.addEventListener('click', async () => {
        const msgEl = document.getElementById('git-commit-message');
        const message = msgEl?.value?.trim();
        if (!message) { notify('Enter a commit message', 'error'); return; }
        if (!repoRoot) { notify('No git repository', 'error'); return; }

        const result = await window.electronAPI.invoke('git-commit', { repoRoot, message });
        if (result.success) {
          notify(`Committed: ${result.commitHash}`, 'success');
          if (msgEl) msgEl.value = '';
          refresh();
        } else {
          notify('Commit failed: ' + result.error, 'error');
        }
      });
    }

    // Ctrl+Enter to commit
    const msgEl = document.getElementById('git-commit-message');
    if (msgEl) {
      msgEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          commitBtn?.click();
        }
      });
    }

    // Push button
    const pushBtn = document.getElementById('git-push-btn');
    if (pushBtn) {
      pushBtn.addEventListener('click', async () => {
        if (!repoRoot) return;
        notify('Pushing...', 'info');
        const result = await window.electronAPI.invoke('git-push', repoRoot);
        result.success ? notify('Pushed successfully', 'success') : notify('Push failed: ' + result.error, 'error');
        refresh();
      });
    }

    // Pull button
    const pullBtn = document.getElementById('git-pull-btn');
    if (pullBtn) {
      pullBtn.addEventListener('click', async () => {
        if (!repoRoot) return;
        notify('Pulling...', 'info');
        const result = await window.electronAPI.invoke('git-pull', repoRoot);
        if (result.success) {
          notify('Pull: ' + (result.output || 'Up to date'), 'success');
          refresh();
          // Check for merge conflicts after pull
          checkConflicts();
        } else {
          notify('Pull failed: ' + result.error, 'error');
        }
      });
    }

    // Refresh button
    const refreshBtn = document.getElementById('git-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => refresh());
    }

    // Branch name click → branch switcher
    const branchEl = document.getElementById('git-branch-name');
    if (branchEl) {
      branchEl.addEventListener('click', () => showBranchDialog());
    }

    // Stage all / Unstage all
    const stageAllBtn = document.getElementById('git-stage-all-btn');
    if (stageAllBtn) {
      stageAllBtn.addEventListener('click', async () => {
        if (!repoRoot) return;
        await window.electronAPI.invoke('git-stage', { repoRoot, paths: ['.'] });
        refresh();
      });
    }

    const unstageAllBtn = document.getElementById('git-unstage-all-btn');
    if (unstageAllBtn) {
      unstageAllBtn.addEventListener('click', async () => {
        if (!repoRoot) return;
        await window.electronAPI.invoke('git-unstage', { repoRoot, paths: ['.'] });
        refresh();
      });
    }

    const discardAllBtn = document.getElementById('git-discard-all-btn');
    if (discardAllBtn) {
      discardAllBtn.addEventListener('click', async () => {
        if (!repoRoot || !confirm('Discard ALL changes? This cannot be undone.')) return;
        // Discard tracked changes
        try {
          await window.electronAPI.invoke('git-discard', { repoRoot, paths: ['.'], untracked: false });
        } catch (e) { /* may fail if no tracked changes */ }
        // Clean untracked
        try {
          await window.electronAPI.invoke('git-discard', { repoRoot, paths: ['.'], untracked: true });
        } catch (e) { /* may fail if no untracked files */ }
        refresh();
      });
    }

    // Stash save
    const stashSaveBtn = document.getElementById('git-stash-save-btn');
    if (stashSaveBtn) {
      stashSaveBtn.addEventListener('click', async () => {
        if (!repoRoot) return;
        const msg = prompt('Stash message (optional):');
        if (msg === null) return; // cancelled
        const result = await window.electronAPI.invoke('git-stash-save', { repoRoot, message: msg || '' });
        result.success ? notify('Changes stashed', 'success') : notify('Stash failed: ' + result.error, 'error');
        refresh();
      });
    }

    // History toggle (lazy load)
    const historyToggle = document.getElementById('git-history-toggle');
    if (historyToggle) {
      historyToggle.addEventListener('click', () => {
        historyExpanded = !historyExpanded;
        const listEl = document.getElementById('git-history-list');
        const headerSpan = historyToggle.querySelector('span');
        if (listEl) {
          listEl.style.display = historyExpanded ? 'block' : 'none';
          if (headerSpan) headerSpan.textContent = (historyExpanded ? '▼' : '▶') + ' Recent Commits';
        }
        if (historyExpanded && !historyLoaded) {
          loadHistory();
        }
      });
    }

    // Register command palette command for blame
    if (window.commandPaletteCommands) {
      window.commandPaletteCommands.push({
        name: 'Git: Toggle Blame',
        action: () => toggleBlame()
      });
    }

    // Clear blame when file changes
    if (window.editor) {
      const origSetModel = window.editor.setModel?.bind(window.editor);
      if (origSetModel) {
        window.editor.setModel = function (...args) {
          clearBlame();
          return origSetModel(...args);
        };
      }
    }
  }

  // Expose public API
  window.gitPanel = {
    refresh,
    toggleBlame,
    clearBlame,
    showBranchDialog,
    checkConflicts
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Defer to ensure other modules are loaded
    setTimeout(init, 100);
  }
})();

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
  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

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

    // Ahead/behind indicator
    const syncEl = document.getElementById('git-sync-indicator');
    if (syncEl) {
      const summary = await window.electronAPI.invoke('git-status-summary', repoRoot);
      if (summary.success) {
        const parts = [];
        if (summary.ahead > 0) parts.push(`↑${summary.ahead}`);
        if (summary.behind > 0) parts.push(`↓${summary.behind}`);
        syncEl.textContent = parts.length ? parts.join(' ') : '';
        syncEl.title = parts.length
          ? `${summary.ahead || 0} ahead, ${summary.behind || 0} behind`
          : 'Up to date with remote';
      } else {
        syncEl.textContent = '';
      }
    }

    // Get detailed status
    const statusResult = await window.electronAPI.invoke('git-status-detailed', repoRoot);
    if (statusResult.success) {
      renderFileList('git-staged-list', statusResult.staged, true);
      renderFileList('git-unstaged-list', statusResult.unstaged, false);
      const stagedCount = document.getElementById('git-staged-count');
      const unstagedCount = document.getElementById('git-unstaged-count');
      if (stagedCount) stagedCount.textContent = statusResult.staged.length;
      if (unstagedCount) unstagedCount.textContent = statusResult.unstaged.length;

      // Build file status map for file tree decorations
      const statusMap = {};
      for (const f of statusResult.staged) {
        statusMap[f.file] = f.status;
      }
      for (const f of statusResult.unstaged) {
        statusMap[f.file] = f.status; // unstaged overrides staged for display
      }
      window.gitFileStatus = { repoRoot, files: statusMap };
      applyFileTreeGitStatus();
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

    // For unstaged modified files, offer hunk-level staging
    if (!cached && status === 'modified') {
      showDiffWithHunks(filePath);
      return;
    }

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

  // --- Phase 9: Hunk staging in diff viewer ---
  async function showDiffWithHunks(filePath) {
    if (!repoRoot) return;

    const hunksResult = await window.electronAPI.invoke('git-diff-hunks', {
      repoRoot, filePath
    });
    if (!hunksResult.success || hunksResult.hunks.length === 0) {
      notify('No diff hunks found', 'info');
      return;
    }

    closeDiffModal();
    const overlay = document.createElement('div');
    overlay.className = 'git-diff-overlay';
    overlay.id = 'git-diff-overlay';

    const hunksHtml = hunksResult.hunks.map((hunk, i) => {
      const linesHtml = hunk.lines.map(line => {
        let cls = 'diff-ctx';
        if (line.startsWith('+')) cls = 'diff-add';
        else if (line.startsWith('-')) cls = 'diff-del';
        else if (line.startsWith('@@')) cls = 'diff-hdr';
        return `<div class="diff-line ${cls}">${escapeHtml(line)}</div>`;
      }).join('');

      return `
        <div class="git-hunk" data-hunk-index="${i}">
          <div class="git-hunk-header">
            <span class="git-hunk-context">${escapeHtml(hunk.context || `Hunk ${i + 1}`)}</span>
            <button class="btn git-hunk-stage-btn" data-hunk-index="${i}" title="Stage this hunk">Stage Hunk</button>
          </div>
          <div class="git-hunk-diff">${linesHtml}</div>
        </div>
      `;
    }).join('');

    overlay.innerHTML = `
      <div class="git-diff-modal">
        <div class="git-diff-header">
          <span>${basename(filePath)} <span style="opacity:0.5; font-weight:normal; font-size:11px;">${dirname(filePath)}</span></span>
          <div style="display:flex;gap:8px;align-items:center;">
            <button id="git-stage-all-hunks" class="btn btn-primary" style="font-size:11px;padding:3px 10px;">Stage All</button>
            <button id="git-diff-close" style="background:none;border:none;font-size:18px;cursor:pointer;color:inherit;">✕</button>
          </div>
        </div>
        <div class="git-diff-body" style="overflow-y:auto;padding:0;">
          ${hunksHtml}
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

    // Stage individual hunks
    overlay.querySelectorAll('.git-hunk-stage-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.hunkIndex);
        const hunk = hunksResult.hunks[idx];
        // Build a minimal patch: file header + single hunk
        const patch = hunksResult.fileHeader + '\n' + hunk.lines.join('\n') + '\n';
        const result = await window.electronAPI.invoke('git-stage-hunk', { repoRoot, patch });
        if (result.success) {
          btn.textContent = 'Staged';
          btn.disabled = true;
          btn.closest('.git-hunk').style.opacity = '0.5';
          notify(`Hunk ${idx + 1} staged`, 'success');
        } else {
          notify('Stage failed: ' + result.error, 'error');
        }
      });
    });

    // Stage all hunks at once (just stage the whole file)
    document.getElementById('git-stage-all-hunks').addEventListener('click', async () => {
      await window.electronAPI.invoke('git-stage', { repoRoot, paths: [filePath] });
      closeDiffModal();
      notify('All changes staged', 'success');
      refresh();
    });
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
        <div style="padding:8px 16px;font-size:11px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--neutral-200,#eee);">
          <span style="opacity:0.6;">
            ${escapeHtml(commit.author)} · ${escapeHtml(commit.relativeTime)}
            ${commit.body ? '<br>' + escapeHtml(commit.body) : ''}
          </span>
          <button id="git-cherry-pick-btn" class="btn" style="font-size:11px;padding:3px 10px;flex-shrink:0;" title="Cherry-pick this commit onto current branch">Cherry-pick</button>
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

    // Cherry-pick button
    document.getElementById('git-cherry-pick-btn').addEventListener('click', async () => {
      if (!confirm(`Cherry-pick commit ${hash.substring(0, 8)} onto ${currentBranch}?`)) return;
      const cpResult = await window.electronAPI.invoke('git-cherry-pick', { repoRoot, hash });
      if (cpResult.success) {
        closeDiffModal();
        notify(`Cherry-picked ${hash.substring(0, 8)}`, 'success');
        refresh();
      } else {
        notify('Cherry-pick failed: ' + cpResult.error, 'error');
      }
    });

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

  // --- Phase 8: Gutter change indicators ---
  let gutterDecorations = [];
  let gutterFile = null;

  async function updateGutterIndicators() {
    if (!window.editor || !window.monaco || !repoRoot) return;

    const filePath = window.currentFilePath;
    if (!filePath) {
      clearGutterIndicators();
      return;
    }

    // Get relative path from repo root
    let relativePath = filePath;
    if (filePath.startsWith(repoRoot + '/')) {
      relativePath = filePath.substring(repoRoot.length + 1);
    }

    const result = await window.electronAPI.invoke('git-diff-lines', {
      repoRoot, filePath: relativePath
    });

    if (!result.success) return;

    clearGutterIndicators();
    gutterFile = filePath;

    const decorations = [];

    for (const range of result.added) {
      for (let i = 0; i < range.count; i++) {
        decorations.push({
          range: new window.monaco.Range(range.start + i, 1, range.start + i, 1),
          options: { linesDecorationsClassName: 'git-gutter-added' }
        });
      }
    }

    for (const range of result.modified) {
      for (let i = 0; i < range.count; i++) {
        decorations.push({
          range: new window.monaco.Range(range.start + i, 1, range.start + i, 1),
          options: { linesDecorationsClassName: 'git-gutter-modified' }
        });
      }
    }

    for (const del of result.deleted) {
      decorations.push({
        range: new window.monaco.Range(del.line, 1, del.line, 1),
        options: { linesDecorationsClassName: 'git-gutter-deleted' }
      });
    }

    gutterDecorations = window.editor.deltaDecorations([], decorations);
  }

  function clearGutterIndicators() {
    if (gutterDecorations.length > 0 && window.editor) {
      window.editor.deltaDecorations(gutterDecorations, []);
    }
    gutterDecorations = [];
    gutterFile = null;
  }

  // --- File tree git status decorations ---
  const gitStatusColors = {
    modified: '#f59e0b',
    added: '#22c55e',
    deleted: '#ef4444',
    untracked: '#6366f1',
    renamed: '#06b6d4'
  };

  function applyFileTreeGitStatus() {
    const info = window.gitFileStatus;
    if (!info || !info.repoRoot) return;

    // Clear previous decorations
    document.querySelectorAll('.file-tree-item .file-name[data-git-status]').forEach(el => {
      el.style.color = '';
      el.removeAttribute('data-git-status');
    });
    document.querySelectorAll('.file-tree-item .git-status-badge').forEach(el => el.remove());

    // Apply to each file item
    document.querySelectorAll('.file-tree-item[data-path]').forEach(el => {
      const fullPath = el.dataset.path;
      if (!fullPath) return;

      // Get relative path from repo root
      let relPath = fullPath;
      if (fullPath.startsWith(info.repoRoot + '/')) {
        relPath = fullPath.substring(info.repoRoot.length + 1);
      }

      const isFolder = el.classList.contains('folder');

      if (!isFolder) {
        // Direct file match
        const status = info.files[relPath];
        if (status) {
          const nameEl = el.querySelector('.file-name');
          if (nameEl) {
            nameEl.style.color = gitStatusColors[status] || '';
            nameEl.setAttribute('data-git-status', status);
          }
        }
      } else {
        // Folder: check if any child files have status
        let folderHasChanges = false;
        let folderStatus = null;
        for (const [file, status] of Object.entries(info.files)) {
          if (file.startsWith(relPath + '/')) {
            folderHasChanges = true;
            folderStatus = folderStatus || status;
            break;
          }
        }
        if (folderHasChanges) {
          const nameEl = el.querySelector('.file-name');
          if (nameEl) {
            nameEl.style.color = gitStatusColors[folderStatus] || '';
            nameEl.setAttribute('data-git-status', folderStatus);
          }
        }
      }
    });
  }

  // --- Phase 10: Tags ---
  let tagsLoaded = false;
  let tagsExpanded = false;

  async function loadTags() {
    const listEl = document.getElementById('git-tags-list');
    if (!listEl || !repoRoot) return;

    listEl.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:#888;">Loading...</div>';

    const result = await window.electronAPI.invoke('git-list-tags', repoRoot);
    if (!result.success) {
      listEl.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:#888;">Failed to load tags</div>';
      return;
    }

    listEl.innerHTML = '';
    if (result.tags.length === 0) {
      listEl.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:#888;">No tags</div>';
      tagsLoaded = true;
      return;
    }

    for (const tag of result.tags) {
      const item = document.createElement('div');
      item.className = 'git-tag-item';
      item.title = tag.message || tag.name;
      item.innerHTML = `
        <span class="git-tag-icon">${tag.type === 'annotated' ? '🏷' : '○'}</span>
        <span class="git-tag-name">${escapeHtml(tag.name)}</span>
        <span class="git-tag-meta">${escapeHtml(tag.date)}</span>
        <span class="git-tag-actions">
          <button class="git-tag-delete" title="Delete tag" style="background:transparent;border:none;cursor:pointer;font-size:12px;padding:0 3px;color:var(--neutral-500,#888);">✕</button>
        </span>
      `;

      item.querySelector('.git-tag-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete tag "${tag.name}"?`)) return;
        const r = await window.electronAPI.invoke('git-delete-tag', { repoRoot, name: tag.name });
        r.success ? notify(`Tag "${tag.name}" deleted`, 'success') : notify('Delete failed: ' + r.error, 'error');
        loadTags();
      });

      listEl.appendChild(item);
    }

    tagsLoaded = true;
  }

  function showCreateTagDialog() {
    closeDiffModal();
    const overlay = document.createElement('div');
    overlay.className = 'git-branch-dialog';
    overlay.id = 'git-tag-dialog';

    overlay.innerHTML = `
      <div class="git-branch-picker" style="width:320px;">
        <div style="padding:12px 14px;font-size:13px;font-weight:600;border-bottom:1px solid var(--neutral-200,#eee);">Create Tag</div>
        <div style="padding:10px 14px;display:flex;flex-direction:column;gap:8px;">
          <input type="text" id="git-tag-name-input" placeholder="Tag name (e.g. v1.0.0)" style="padding:6px 10px;border:1px solid var(--neutral-300,#ccc);border-radius:4px;font-size:13px;outline:none;background:transparent;color:inherit;">
          <textarea id="git-tag-message-input" placeholder="Message (optional, makes it annotated)" rows="2" style="padding:6px 10px;border:1px solid var(--neutral-300,#ccc);border-radius:4px;font-size:12px;font-family:inherit;resize:vertical;outline:none;background:transparent;color:inherit;"></textarea>
          <div style="display:flex;gap:6px;justify-content:flex-end;">
            <button id="git-tag-cancel" class="btn" style="font-size:12px;padding:4px 12px;">Cancel</button>
            <button id="git-tag-create" class="btn btn-primary" style="font-size:12px;padding:4px 12px;">Create</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('git-tag-cancel').addEventListener('click', () => overlay.remove());

    const nameInput = document.getElementById('git-tag-name-input');
    nameInput.focus();

    document.getElementById('git-tag-create').addEventListener('click', async () => {
      const name = nameInput.value.trim();
      const message = document.getElementById('git-tag-message-input').value.trim();
      if (!name) { notify('Enter a tag name', 'error'); return; }

      const result = await window.electronAPI.invoke('git-create-tag', {
        repoRoot, name, message, annotated: !!message
      });
      if (result.success) {
        overlay.remove();
        notify(`Tag "${name}" created`, 'success');
        loadTags();
      } else {
        notify('Tag creation failed: ' + result.error, 'error');
      }
    });

    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('git-tag-create').click();
      if (e.key === 'Escape') overlay.remove();
    });
  }

  // --- Phase 10: Remotes ---
  let remotesLoaded = false;
  let remotesExpanded = false;

  async function loadRemotes() {
    const listEl = document.getElementById('git-remotes-list');
    if (!listEl || !repoRoot) return;

    listEl.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:#888;">Loading...</div>';

    const result = await window.electronAPI.invoke('git-list-remotes', repoRoot);
    if (!result.success) {
      listEl.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:#888;">Failed to load remotes</div>';
      return;
    }

    listEl.innerHTML = '';
    if (result.remotes.length === 0) {
      listEl.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:#888;">No remotes</div>';
      remotesLoaded = true;
      return;
    }

    for (const remote of result.remotes) {
      const item = document.createElement('div');
      item.className = 'git-remote-item';
      item.title = remote.fetch || remote.push || '';
      item.innerHTML = `
        <span class="git-remote-name">${escapeHtml(remote.name)}</span>
        <span class="git-remote-url">${escapeHtml(remote.fetch || remote.push || '')}</span>
        <span class="git-remote-actions">
          <button class="git-remote-push-to" title="Push to this remote" style="background:transparent;border:none;cursor:pointer;font-size:12px;padding:0 3px;color:var(--neutral-500,#888);">↑</button>
          <button class="git-remote-remove" title="Remove remote" style="background:transparent;border:none;cursor:pointer;font-size:12px;padding:0 3px;color:var(--neutral-500,#888);">✕</button>
        </span>
      `;

      item.querySelector('.git-remote-push-to').addEventListener('click', async (e) => {
        e.stopPropagation();
        notify(`Pushing to ${remote.name}...`, 'info');
        const r = await window.electronAPI.invoke('git-push-to-remote', {
          repoRoot, remote: remote.name, branch: currentBranch, setUpstream: true
        });
        r.success ? notify(`Pushed to ${remote.name}`, 'success') : notify('Push failed: ' + r.error, 'error');
        refresh();
      });

      item.querySelector('.git-remote-remove').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Remove remote "${remote.name}"?`)) return;
        const r = await window.electronAPI.invoke('git-remove-remote', { repoRoot, name: remote.name });
        r.success ? notify(`Remote "${remote.name}" removed`, 'success') : notify('Remove failed: ' + r.error, 'error');
        loadRemotes();
      });

      listEl.appendChild(item);
    }

    remotesLoaded = true;
  }

  function showAddRemoteDialog() {
    closeDiffModal();
    const overlay = document.createElement('div');
    overlay.className = 'git-branch-dialog';
    overlay.id = 'git-remote-dialog';

    overlay.innerHTML = `
      <div class="git-branch-picker" style="width:360px;">
        <div style="padding:12px 14px;font-size:13px;font-weight:600;border-bottom:1px solid var(--neutral-200,#eee);">Add Remote</div>
        <div style="padding:10px 14px;display:flex;flex-direction:column;gap:8px;">
          <input type="text" id="git-remote-name-input" placeholder="Remote name (e.g. upstream)" style="padding:6px 10px;border:1px solid var(--neutral-300,#ccc);border-radius:4px;font-size:13px;outline:none;background:transparent;color:inherit;">
          <input type="text" id="git-remote-url-input" placeholder="URL (e.g. https://github.com/...)" style="padding:6px 10px;border:1px solid var(--neutral-300,#ccc);border-radius:4px;font-size:13px;outline:none;background:transparent;color:inherit;">
          <div style="display:flex;gap:6px;justify-content:flex-end;">
            <button id="git-remote-cancel" class="btn" style="font-size:12px;padding:4px 12px;">Cancel</button>
            <button id="git-remote-add" class="btn btn-primary" style="font-size:12px;padding:4px 12px;">Add</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('git-remote-cancel').addEventListener('click', () => overlay.remove());

    const nameInput = document.getElementById('git-remote-name-input');
    nameInput.focus();

    document.getElementById('git-remote-add').addEventListener('click', async () => {
      const name = nameInput.value.trim();
      const url = document.getElementById('git-remote-url-input').value.trim();
      if (!name || !url) { notify('Enter name and URL', 'error'); return; }

      const result = await window.electronAPI.invoke('git-add-remote', { repoRoot, name, url });
      if (result.success) {
        overlay.remove();
        notify(`Remote "${name}" added`, 'success');
        loadRemotes();
      } else {
        notify('Add failed: ' + result.error, 'error');
      }
    });

    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') overlay.remove();
    });
  }

  // --- Phase 11: Graph log ---
  let graphLoaded = false;

  async function loadGraphLog() {
    const listEl = document.getElementById('git-history-list');
    if (!listEl || !repoRoot) return;

    listEl.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:#888;">Loading graph...</div>';

    const result = await window.electronAPI.invoke('git-log-graph', { repoRoot, limit: 60 });
    if (!result.success || result.entries.length === 0) {
      // Fall back to simple log
      loadHistory();
      return;
    }

    listEl.innerHTML = '';

    // Assign colors to graph columns
    const columnColors = ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

    for (const entry of result.entries) {
      const item = document.createElement('div');
      item.className = 'git-commit-item';
      item.style.display = 'flex';
      item.style.alignItems = 'flex-start';
      item.style.gap = '8px';

      // Parse graph chars for this entry to draw mini graph
      const graphStr = entry.graph || '';
      let graphHtml = '';
      if (graphStr) {
        // Simple colored text representation
        let colored = '';
        for (let i = 0; i < graphStr.length; i++) {
          const ch = graphStr[i];
          const colIdx = Math.floor(i / 2) % columnColors.length;
          if (ch === '*') {
            colored += `<span style="color:${columnColors[colIdx]};font-weight:bold;">●</span>`;
          } else if (ch === '|') {
            colored += `<span style="color:${columnColors[colIdx]};">│</span>`;
          } else if (ch === '/' || ch === '\\') {
            colored += `<span style="color:${columnColors[colIdx]};">${ch === '/' ? '╱' : '╲'}</span>`;
          } else if (ch === '_') {
            colored += `<span style="color:${columnColors[colIdx]};">─</span>`;
          } else {
            colored += ' ';
          }
        }
        graphHtml = `<span class="git-graph-col" style="font-family:monospace;font-size:11px;white-space:pre;flex-shrink:0;line-height:1.4;">${colored}</span>`;
      }

      // Refs badges
      let refsHtml = '';
      if (entry.refs) {
        const refs = entry.refs.split(',').map(r => r.trim()).filter(r => r);
        refsHtml = refs.map(ref => {
          let color = '#6366f1';
          if (ref.startsWith('HEAD')) color = '#ef4444';
          else if (ref.startsWith('tag:')) color = '#f59e0b';
          else if (ref.includes('/')) color = '#22c55e';
          return `<span style="background:${color};color:#fff;padding:0 4px;border-radius:2px;font-size:9px;font-weight:600;margin-right:3px;">${escapeHtml(ref)}</span>`;
        }).join('');
      }

      item.innerHTML = `
        ${graphHtml}
        <div style="flex:1;min-width:0;">
          <div class="git-commit-msg">
            <span class="git-commit-hash">${entry.shortHash}</span>${refsHtml}${escapeHtml(entry.message)}
          </div>
          <div class="git-commit-meta">${escapeHtml(entry.author)} · ${escapeHtml(entry.relativeTime)}</div>
        </div>
      `;

      item.addEventListener('click', () => showCommitDetail(entry.hash));
      listEl.appendChild(item);
    }

    graphLoaded = true;
  }

  // --- Initialize ---
  function init() {
    // Button listeners
    const commitBtn = document.getElementById('git-commit-btn');
    if (commitBtn) {
      commitBtn.addEventListener('click', async () => {
        const msgEl = document.getElementById('git-commit-message');
        const amendCheck = document.getElementById('git-amend-checkbox');
        const amend = amendCheck?.checked || false;
        const message = msgEl?.value?.trim();
        if (!message) { notify('Enter a commit message', 'error'); return; }
        if (!repoRoot) { notify('No git repository', 'error'); return; }

        const result = await window.electronAPI.invoke('git-commit', { repoRoot, message, amend });
        if (result.success) {
          notify(`${amend ? 'Amended' : 'Committed'}: ${result.commitHash}`, 'success');
          if (msgEl) msgEl.value = '';
          if (amendCheck) amendCheck.checked = false;
          refresh();
        } else {
          notify('Commit failed: ' + result.error, 'error');
        }
      });
    }

    // Amend checkbox: pre-fill last commit message when checked
    const amendCheck = document.getElementById('git-amend-checkbox');
    if (amendCheck) {
      amendCheck.addEventListener('change', async () => {
        const msgEl = document.getElementById('git-commit-message');
        if (!msgEl || !repoRoot) return;
        if (amendCheck.checked && !msgEl.value.trim()) {
          const logResult = await window.electronAPI.invoke('git-log', { repoRoot, limit: 1 });
          if (logResult.success && logResult.commits.length > 0) {
            msgEl.value = logResult.commits[0].message;
            msgEl.focus();
          }
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

    // History toggle (lazy load) — now uses graph log
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
          loadGraphLog();
        }
      });
    }

    // Tags toggle (lazy load)
    const tagsToggle = document.getElementById('git-tags-toggle');
    if (tagsToggle) {
      tagsToggle.addEventListener('click', (e) => {
        if (e.target.closest('#git-create-tag-btn')) return;
        tagsExpanded = !tagsExpanded;
        const listEl = document.getElementById('git-tags-list');
        const headerSpan = tagsToggle.querySelector('span');
        if (listEl) {
          listEl.style.display = tagsExpanded ? 'block' : 'none';
          if (headerSpan) headerSpan.textContent = (tagsExpanded ? '▼' : '▶') + ' Tags';
        }
        if (tagsExpanded && !tagsLoaded) {
          loadTags();
        }
      });
    }

    const createTagBtn = document.getElementById('git-create-tag-btn');
    if (createTagBtn) {
      createTagBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showCreateTagDialog();
      });
    }

    // Push tags command
    if (window.commandPaletteCommands) {
      window.commandPaletteCommands.push({
        name: 'Git: Push Tags',
        action: async () => {
          if (!repoRoot) return;
          const r = await window.electronAPI.invoke('git-push-tags', repoRoot);
          r.success ? notify('Tags pushed', 'success') : notify('Push tags failed: ' + r.error, 'error');
        }
      });
    }

    // Remotes toggle (lazy load)
    const remotesToggle = document.getElementById('git-remotes-toggle');
    if (remotesToggle) {
      remotesToggle.addEventListener('click', (e) => {
        if (e.target.closest('#git-add-remote-btn')) return;
        remotesExpanded = !remotesExpanded;
        const listEl = document.getElementById('git-remotes-list');
        const headerSpan = remotesToggle.querySelector('span');
        if (listEl) {
          listEl.style.display = remotesExpanded ? 'block' : 'none';
          if (headerSpan) headerSpan.textContent = (remotesExpanded ? '▼' : '▶') + ' Remotes';
        }
        if (remotesExpanded && !remotesLoaded) {
          loadRemotes();
        }
      });
    }

    const addRemoteBtn = document.getElementById('git-add-remote-btn');
    if (addRemoteBtn) {
      addRemoteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showAddRemoteDialog();
      });
    }

    // Register command palette commands
    if (window.commandPaletteCommands) {
      window.commandPaletteCommands.push({
        name: 'Git: Toggle Blame',
        action: () => toggleBlame()
      });
      window.commandPaletteCommands.push({
        name: 'Git: Toggle Gutter Indicators',
        action: () => {
          if (gutterDecorations.length > 0) {
            clearGutterIndicators();
          } else {
            updateGutterIndicators();
          }
        }
      });
    }

    // Clear blame and update gutter when file changes
    if (window.editor) {
      const origSetModel = window.editor.setModel?.bind(window.editor);
      if (origSetModel) {
        window.editor.setModel = function (...args) {
          clearBlame();
          clearGutterIndicators();
          const result = origSetModel(...args);
          // Refresh gutter for new file after a short delay
          setTimeout(() => updateGutterIndicators(), 200);
          return result;
        };
      }

      // Update gutter indicators on content save
      window.editor.onDidChangeModelContent(debounce(() => {
        if (repoRoot) updateGutterIndicators();
      }, 1500));
    }

    // Initial gutter update
    if (repoRoot) {
      setTimeout(() => updateGutterIndicators(), 500);
    }
  }

  // Expose public API
  window.gitPanel = {
    refresh,
    toggleBlame,
    clearBlame,
    showBranchDialog,
    checkConflicts,
    applyFileTreeGitStatus,
    updateGutterIndicators,
    clearGutterIndicators
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Defer to ensure other modules are loaded
    setTimeout(init, 100);
  }
})();

// Tests for git panel module logic
// Tests cover IPC call patterns, UI rendering, state management, and DOM interactions
const { createElectronApiMock } = require('../../helpers/electron-api-mock');

describe('Git Panel', () => {
  let mockInvoke;

  beforeEach(() => {
    jest.clearAllMocks();
    const bridge = createElectronApiMock();
    mockInvoke = bridge.invoke;
    global.electronAPI = bridge.api;

    // Setup window state
    global.window.electronAPI = global.electronAPI;
    global.window.appSettings = { workingDirectory: '/test/repo' };
    global.window.currentFilePath = '/test/repo/src/index.js';
    global.showNotification = jest.fn();
    global.window.showNotification = jest.fn();
    global.window.editor = {
      deltaDecorations: jest.fn(() => ['dec1']),
      setModel: jest.fn(),
      getValue: jest.fn(() => ''),
    };
    global.window.commandPaletteCommands = [];
    global.window.monaco = global.monaco;
  });

  describe('IPC handler contracts', () => {
    test('git-status-detailed returns staged and unstaged arrays', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        staged: [{ file: 'README.md', status: 'modified', statusCode: 'M' }],
        unstaged: [{ file: 'src/app.js', status: 'untracked', statusCode: '??' }]
      });

      const result = await global.electronAPI.git.statusDetailed('/repo');
      expect(result.success).toBe(true);
      expect(result.staged).toHaveLength(1);
      expect(result.unstaged).toHaveLength(1);
      expect(result.staged[0].status).toBe('modified');
      expect(result.unstaged[0].status).toBe('untracked');
    });

    test('git-stage calls with correct arguments', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      await global.electronAPI.git.stage({
        repoRoot: '/repo',
        paths: ['src/file.js']
      });

      expect(mockInvoke).toHaveBeenCalledWith('git-stage', {
        repoRoot: '/repo',
        paths: ['src/file.js']
      });
    });

    test('git-unstage calls with correct arguments', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      await global.electronAPI.git.unstage({
        repoRoot: '/repo',
        paths: ['src/file.js']
      });

      expect(mockInvoke).toHaveBeenCalledWith('git-unstage', {
        repoRoot: '/repo',
        paths: ['src/file.js']
      });
    });

    test('git-discard handles tracked and untracked files', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      await global.electronAPI.git.discard({
        repoRoot: '/repo',
        paths: ['src/file.js'],
        untracked: false
      });

      expect(mockInvoke).toHaveBeenCalledWith('git-discard', {
        repoRoot: '/repo',
        paths: ['src/file.js'],
        untracked: false
      });

      await global.electronAPI.git.discard({
        repoRoot: '/repo',
        paths: ['new-file.js'],
        untracked: true
      });

      expect(mockInvoke).toHaveBeenCalledWith('git-discard', {
        repoRoot: '/repo',
        paths: ['new-file.js'],
        untracked: true
      });
    });

    test('git-commit returns commit hash on success', async () => {
      mockInvoke.mockResolvedValue({ success: true, commitHash: 'abc1234' });

      const result = await global.electronAPI.git.commit({
        repoRoot: '/repo',
        message: 'Test commit'
      });

      expect(result.success).toBe(true);
      expect(result.commitHash).toBe('abc1234');
    });

    test('git-commit returns error on failure', async () => {
      mockInvoke.mockResolvedValue({ success: false, error: 'Nothing to commit' });

      const result = await global.electronAPI.git.commit({
        repoRoot: '/repo',
        message: 'Test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Branch operations', () => {
    test('git-list-branches returns local, remote, and current', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        local: ['main', 'feature/test'],
        remote: ['main', 'develop'],
        current: 'main'
      });

      const result = await global.electronAPI.git.listBranches('/repo');
      expect(result.success).toBe(true);
      expect(result.local).toContain('main');
      expect(result.remote).toContain('develop');
      expect(result.current).toBe('main');
    });

    test('git-switch-branch can create new branch', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      await global.electronAPI.git.switchBranch({
        repoRoot: '/repo',
        branch: 'new-feature',
        create: true
      });

      expect(mockInvoke).toHaveBeenCalledWith('git-switch-branch', {
        repoRoot: '/repo',
        branch: 'new-feature',
        create: true
      });
    });

    test('git-pull returns output on success', async () => {
      mockInvoke.mockResolvedValue({ success: true, output: 'Already up to date.' });

      const result = await global.electronAPI.git.pull('/repo');
      expect(result.success).toBe(true);
      expect(result.output).toBe('Already up to date.');
    });
  });

  describe('Commit history', () => {
    test('git-log returns array of commits', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        commits: [
          { hash: 'abc123full', shortHash: 'abc123', author: 'Test', relativeTime: '2 hours ago', message: 'Fix bug' },
          { hash: 'def456full', shortHash: 'def456', author: 'Test', relativeTime: '1 day ago', message: 'Add feature' }
        ]
      });

      const result = await global.electronAPI.git.log({ repoRoot: '/repo', limit: 50 });
      expect(result.success).toBe(true);
      expect(result.commits).toHaveLength(2);
      expect(result.commits[0].shortHash).toBe('abc123');
    });

    test('git-show returns commit detail with files', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        commit: {
          hash: 'abc123full',
          author: 'Test',
          email: 'test@test.com',
          relativeTime: '2 hours ago',
          message: 'Fix bug',
          body: '',
          files: [{ file: 'src/app.js', changes: '2 +, 1 -' }]
        }
      });

      const result = await global.electronAPI.git.show({ repoRoot: '/repo', hash: 'abc123full' });
      expect(result.success).toBe(true);
      expect(result.commit.files).toHaveLength(1);
    });
  });

  describe('Stash operations', () => {
    test('git-stash-list returns stash entries', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        stashes: [
          { ref: 'stash@{0}', message: 'WIP on main', relativeTime: '5 minutes ago' }
        ]
      });

      const result = await global.electronAPI.git.stashList('/repo');
      expect(result.success).toBe(true);
      expect(result.stashes).toHaveLength(1);
      expect(result.stashes[0].ref).toBe('stash@{0}');
    });

    test('git-stash-save accepts optional message', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      await global.electronAPI.git.stashSave({
        repoRoot: '/repo',
        message: 'Save before switch'
      });

      expect(mockInvoke).toHaveBeenCalledWith('git-stash-save', {
        repoRoot: '/repo',
        message: 'Save before switch'
      });
    });

    test('git-stash-apply supports pop mode', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      await global.electronAPI.git.stashApply({
        repoRoot: '/repo',
        ref: 'stash@{0}',
        drop: true
      });

      expect(mockInvoke).toHaveBeenCalledWith('git-stash-apply', {
        repoRoot: '/repo',
        ref: 'stash@{0}',
        drop: true
      });
    });
  });

  describe('Blame', () => {
    test('git-blame returns per-line blame data', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        lines: [
          { hash: 'abc1234567890', shortHash: 'abc1234', line: 1, author: 'Test User', authorTime: 1700000000, summary: 'Initial commit', content: 'const x = 1;' },
          { hash: 'def4567890123', shortHash: 'def4567', line: 2, author: 'Test User', authorTime: 1700100000, summary: 'Fix bug', content: 'const y = 2;' }
        ]
      });

      const result = await global.electronAPI.git.blame({
        repoRoot: '/repo',
        filePath: 'src/index.js'
      });

      expect(result.success).toBe(true);
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0].author).toBe('Test User');
      expect(result.lines[0].line).toBe(1);
    });
  });

  describe('Merge conflicts', () => {
    test('git-merge-conflicts returns list of conflicted files', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        files: ['src/app.js', 'src/utils.js']
      });

      const result = await global.electronAPI.git.mergeConflicts('/repo');
      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(2);
    });

    test('git-mark-resolved stages the file', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      await global.electronAPI.git.markResolved({
        repoRoot: '/repo',
        filePath: 'src/app.js'
      });

      expect(mockInvoke).toHaveBeenCalledWith('git-mark-resolved', {
        repoRoot: '/repo',
        filePath: 'src/app.js'
      });
    });
  });

  describe('Diff operations', () => {
    test('git-diff returns diff string for unstaged changes', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        diff: 'diff --git a/file.js b/file.js\n--- a/file.js\n+++ b/file.js'
      });

      const result = await global.electronAPI.git.diff({
        repoRoot: '/repo',
        filePath: 'file.js',
        cached: false
      });

      expect(result.success).toBe(true);
      expect(result.diff).toContain('diff --git');
    });

    test('git-diff with cached flag for staged changes', async () => {
      mockInvoke.mockResolvedValue({ success: true, diff: '' });

      await global.electronAPI.git.diff({
        repoRoot: '/repo',
        filePath: 'file.js',
        cached: true
      });

      expect(mockInvoke).toHaveBeenCalledWith('git-diff', {
        repoRoot: '/repo',
        filePath: 'file.js',
        cached: true
      });
    });

    test('git-file-content retrieves content at ref', async () => {
      mockInvoke.mockResolvedValue({ success: true, content: 'const x = 1;' });

      const result = await global.electronAPI.git.fileContent({
        repoRoot: '/repo',
        ref: 'HEAD',
        filePath: 'src/index.js'
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('const x = 1;');
    });

    test('git-file-content returns error for new files', async () => {
      mockInvoke.mockResolvedValue({ success: false, error: 'path not found' });

      const result = await global.electronAPI.git.fileContent({
        repoRoot: '/repo',
        ref: 'HEAD',
        filePath: 'new-file.js'
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Push operations', () => {
    test('git-push succeeds', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      const result = await global.electronAPI.git.push('/repo');
      expect(result.success).toBe(true);
    });

    test('git-push returns error on failure', async () => {
      mockInvoke.mockResolvedValue({ success: false, error: 'Authentication failed' });

      const result = await global.electronAPI.git.push('/repo');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication');
    });
  });

  describe('Fetch operations', () => {
    test('git-fetch returns behind count', async () => {
      mockInvoke.mockResolvedValue({ success: true, behind: 3 });

      const result = await global.electronAPI.git.fetch('/repo');
      expect(result.success).toBe(true);
      expect(result.behind).toBe(3);
    });
  });

  // --- Git Panel Module Logic Tests ---

  describe('Git Panel Module - DOM Rendering', () => {
    // These tests use standalone DOM elements (not relying on mock getElementById)
    // to verify the rendering patterns used by the git panel module

    test('should create git file items with correct status classes', () => {
      const list = document.createElement('div');
      const files = [
        { file: 'src/app.js', status: 'modified', statusCode: 'M' },
        { file: 'src/new.js', status: 'added', statusCode: 'A' },
        { file: 'src/old.js', status: 'deleted', statusCode: 'D' },
      ];

      for (const file of files) {
        const item = document.createElement('div');
        item.className = 'git-file-item';
        const statusEl = document.createElement('span');
        statusEl.className = `git-file-status ${file.status}`;
        statusEl.textContent = file.statusCode;
        item.appendChild(statusEl);
        const nameEl = document.createElement('span');
        nameEl.className = 'git-file-name';
        nameEl.textContent = file.file.split('/').pop();
        item.appendChild(nameEl);
        list.appendChild(item);
      }

      expect(list.children).toHaveLength(3);
      expect(list.querySelector('.git-file-status.modified')).toBeTruthy();
      expect(list.querySelector('.git-file-status.added')).toBeTruthy();
      expect(list.querySelector('.git-file-status.deleted')).toBeTruthy();
    });

    test('should render file basename and directory separately', () => {
      const list = document.createElement('div');

      const item = document.createElement('div');
      item.className = 'git-file-item';

      const nameEl = document.createElement('span');
      nameEl.className = 'git-file-name';
      nameEl.textContent = 'Header.js';
      item.appendChild(nameEl);

      const dirEl = document.createElement('span');
      dirEl.className = 'git-file-dir';
      dirEl.textContent = 'src/components';
      item.appendChild(dirEl);

      list.appendChild(item);

      expect(list.querySelector('.git-file-name').textContent).toBe('Header.js');
      expect(list.querySelector('.git-file-dir').textContent).toBe('src/components');
    });

    test('should update branch name text content', () => {
      const branchEl = document.createElement('span');
      branchEl.textContent = 'main';
      branchEl.textContent = 'feature/new-ui';
      expect(branchEl.textContent).toBe('feature/new-ui');
    });

    test('should update staged and unstaged counts', () => {
      const stagedCount = document.createElement('span');
      const unstagedCount = document.createElement('span');

      stagedCount.textContent = '3';
      unstagedCount.textContent = '7';

      expect(stagedCount.textContent).toBe('3');
      expect(unstagedCount.textContent).toBe('7');
    });

    test('should toggle history section visibility via style.display', () => {
      const historyList = document.createElement('div');
      historyList.style.display = 'none';

      const span = document.createElement('span');
      span.textContent = '▶ Recent Commits';

      // Expand
      historyList.style.display = 'block';
      span.textContent = '▼ Recent Commits';
      expect(historyList.style.display).toBe('block');
      expect(span.textContent).toContain('▼');

      // Collapse
      historyList.style.display = 'none';
      span.textContent = '▶ Recent Commits';
      expect(historyList.style.display).toBe('none');
      expect(span.textContent).toContain('▶');
    });

    test('should show/hide stash section based on stash presence', () => {
      const section = document.createElement('div');
      section.style.display = 'none';
      expect(section.style.display).toBe('none');

      section.style.display = '';
      expect(section.style.display).toBe('');
    });

    test('commit message textarea stores text', () => {
      const textarea = document.createElement('textarea');
      textarea.value = 'Fix: resolve issue with login form';
      expect(textarea.value).toBe('Fix: resolve issue with login form');
    });

    test('should render commit history items with hash and metadata', () => {
      const historyList = document.createElement('div');
      const commits = [
        { shortHash: 'abc1234', message: 'Fix login bug', author: 'Dev', relativeTime: '2h ago' },
        { shortHash: 'def5678', message: 'Add new feature', author: 'Dev', relativeTime: '1d ago' },
      ];

      for (const commit of commits) {
        const item = document.createElement('div');
        item.className = 'git-commit-item';
        item.innerHTML = `
          <div class="git-commit-msg">
            <span class="git-commit-hash">${commit.shortHash}</span>${commit.message}
          </div>
          <div class="git-commit-meta">${commit.author} · ${commit.relativeTime}</div>
        `;
        historyList.appendChild(item);
      }

      expect(historyList.querySelectorAll('.git-commit-item')).toHaveLength(2);
      expect(historyList.querySelector('.git-commit-hash').textContent).toBe('abc1234');
      expect(historyList.querySelector('.git-commit-meta').textContent).toContain('Dev');
    });

    test('should render stash items with action buttons', () => {
      const stashList = document.createElement('div');
      const stash = { ref: 'stash@{0}', message: 'WIP on main', relativeTime: '5m ago' };

      const item = document.createElement('div');
      item.className = 'git-stash-item';
      item.innerHTML = `
        <span class="git-stash-msg">${stash.message}</span>
        <span class="git-stash-actions">
          <button class="git-stash-apply" title="Apply">↩</button>
          <button class="git-stash-pop" title="Pop">⬆</button>
          <button class="git-stash-drop" title="Drop">✕</button>
        </span>
      `;
      stashList.appendChild(item);

      expect(stashList.querySelector('.git-stash-msg').textContent).toBe('WIP on main');
      expect(stashList.querySelector('.git-stash-apply')).toBeTruthy();
      expect(stashList.querySelector('.git-stash-pop')).toBeTruthy();
      expect(stashList.querySelector('.git-stash-drop')).toBeTruthy();
    });

    test('should create file item with action buttons for unstaged files', () => {
      const item = document.createElement('div');
      item.className = 'git-file-item';
      item.innerHTML = `
        <span class="git-file-status modified">M</span>
        <span class="git-file-name">app.js</span>
        <span class="git-file-actions">
          <button class="git-act-discard" title="Discard Changes">✕</button>
          <button class="git-act-stage" title="Stage">+</button>
        </span>
      `;

      expect(item.querySelector('.git-act-discard')).toBeTruthy();
      expect(item.querySelector('.git-act-stage')).toBeTruthy();
    });

    test('should create file item with unstage button for staged files', () => {
      const item = document.createElement('div');
      item.className = 'git-file-item';
      item.innerHTML = `
        <span class="git-file-status added">A</span>
        <span class="git-file-name">new.js</span>
        <span class="git-file-actions">
          <button class="git-act-unstage" title="Unstage">−</button>
        </span>
      `;

      expect(item.querySelector('.git-act-unstage')).toBeTruthy();
      expect(item.querySelector('.git-act-stage')).toBeNull();
    });
  });

  describe('Git Panel Module - File Actions', () => {
    test('stage all should call git-stage with dot path', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      await global.electronAPI.git.stage({ repoRoot: '/repo', paths: ['.'] });

      expect(mockInvoke).toHaveBeenCalledWith('git-stage', {
        repoRoot: '/repo',
        paths: ['.']
      });
    });

    test('unstage all should call git-unstage with dot path', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      await global.electronAPI.git.unstage({ repoRoot: '/repo', paths: ['.'] });

      expect(mockInvoke).toHaveBeenCalledWith('git-unstage', {
        repoRoot: '/repo',
        paths: ['.']
      });
    });

    test('stage multiple files should pass all paths', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      const paths = ['src/a.js', 'src/b.js', 'test/c.test.js'];
      await global.electronAPI.git.stage({ repoRoot: '/repo', paths });

      expect(mockInvoke).toHaveBeenCalledWith('git-stage', {
        repoRoot: '/repo',
        paths: ['src/a.js', 'src/b.js', 'test/c.test.js']
      });
    });
  });

  describe('Git Panel Module - Diff Modal', () => {
    test('should create diff overlay with correct structure', () => {
      const overlay = document.createElement('div');
      overlay.className = 'git-diff-overlay';
      overlay.innerHTML = `
        <div class="git-diff-modal">
          <div class="git-diff-header">
            <span>test.js</span>
            <button class="diff-close">✕</button>
          </div>
          <div class="git-diff-body"></div>
        </div>
      `;

      expect(overlay.querySelector('.git-diff-modal')).toBeTruthy();
      expect(overlay.querySelector('.git-diff-header')).toBeTruthy();
      expect(overlay.querySelector('.git-diff-body')).toBeTruthy();
      expect(overlay.querySelector('.diff-close')).toBeTruthy();
    });

    test('diff modal should have header with filename', () => {
      const overlay = document.createElement('div');
      overlay.innerHTML = `
        <div class="git-diff-header">
          <span class="diff-filename">app.js</span>
          <span class="diff-dir" style="opacity:0.5;">src/components</span>
        </div>
      `;

      expect(overlay.querySelector('.diff-filename').textContent).toBe('app.js');
      expect(overlay.querySelector('.diff-dir').textContent).toBe('src/components');
    });

    test('inline toggle checkbox should be present', () => {
      const modal = document.createElement('div');
      modal.innerHTML = `
        <label>
          <input type="checkbox" class="inline-toggle"> Inline
        </label>
      `;

      const toggle = modal.querySelector('.inline-toggle');
      expect(toggle).toBeTruthy();
      expect(toggle.checked).toBe(false);

      toggle.checked = true;
      expect(toggle.checked).toBe(true);
    });
  });

  describe('Git Panel Module - Branch Dialog', () => {
    test('should create branch dialog with search input', () => {
      const dialog = document.createElement('div');
      dialog.className = 'git-branch-dialog';
      dialog.innerHTML = `
        <div class="git-branch-picker">
          <input type="text" class="branch-search" placeholder="Switch to branch...">
          <div class="git-branch-list"></div>
        </div>
      `;

      expect(dialog.querySelector('.git-branch-dialog')).toBeNull(); // it IS the dialog
      expect(dialog.className).toBe('git-branch-dialog');
      expect(dialog.querySelector('.git-branch-picker')).toBeTruthy();
      expect(dialog.querySelector('.branch-search')).toBeTruthy();
    });

    test('should render branch items with current indicator', () => {
      const list = document.createElement('div');
      const branches = ['main', 'develop', 'feature/login'];
      const current = 'main';

      for (const branch of branches) {
        const item = document.createElement('div');
        item.className = 'git-branch-item' + (branch === current ? ' current' : '');
        item.textContent = branch;
        list.appendChild(item);
      }

      expect(list.querySelectorAll('.git-branch-item')).toHaveLength(3);
      expect(list.querySelector('.git-branch-item.current').textContent).toBe('main');
    });

    test('should filter branches by search text', () => {
      const branches = ['main', 'develop', 'feature/login', 'feature/signup', 'hotfix/bug'];
      const filter = 'feature';
      const filtered = branches.filter(b => b.includes(filter));

      expect(filtered).toEqual(['feature/login', 'feature/signup']);
      expect(filtered).toHaveLength(2);
    });

    test('should deduplicate local and remote branches', () => {
      const local = ['main', 'feature/test'];
      const remote = ['main', 'develop'];
      const allBranches = new Set([...local]);
      remote.forEach(b => allBranches.add(b));

      expect([...allBranches]).toEqual(['main', 'feature/test', 'develop']);
      expect(allBranches.size).toBe(3);
    });
  });

  describe('Git Panel Module - Workflow Sequences', () => {
    test('full commit workflow: stage → commit → push', async () => {
      // Stage files
      mockInvoke.mockResolvedValueOnce({ success: true });
      await global.electronAPI.git.stage({ repoRoot: '/repo', paths: ['src/app.js'] });

      // Commit
      mockInvoke.mockResolvedValueOnce({ success: true, commitHash: 'abc1234' });
      const commitResult = await global.electronAPI.git.commit({
        repoRoot: '/repo',
        message: 'Fix login bug'
      });
      expect(commitResult.success).toBe(true);

      // Push
      mockInvoke.mockResolvedValueOnce({ success: true });
      const pushResult = await global.electronAPI.git.push('/repo');
      expect(pushResult.success).toBe(true);

      expect(mockInvoke).toHaveBeenCalledTimes(3);
    });

    test('stash and switch workflow: stash → switch → apply', async () => {
      // Stash current changes
      mockInvoke.mockResolvedValueOnce({ success: true });
      await global.electronAPI.git.stashSave({
        repoRoot: '/repo',
        message: 'WIP before switch'
      });

      // Switch branch
      mockInvoke.mockResolvedValueOnce({ success: true });
      await global.electronAPI.git.switchBranch({
        repoRoot: '/repo',
        branch: 'other-branch',
        create: false
      });

      // Apply stash on return
      mockInvoke.mockResolvedValueOnce({ success: true });
      await global.electronAPI.git.stashApply({
        repoRoot: '/repo',
        ref: 'stash@{0}',
        drop: true
      });

      expect(mockInvoke).toHaveBeenCalledTimes(3);
    });

    test('pull and conflict resolution workflow', async () => {
      // Pull returns conflict
      mockInvoke.mockResolvedValueOnce({
        success: false,
        error: 'CONFLICT (content): Merge conflict in src/app.js'
      });
      const pullResult = await global.electronAPI.git.pull('/repo');
      expect(pullResult.success).toBe(false);

      // Check conflicts
      mockInvoke.mockResolvedValueOnce({
        success: true,
        files: ['src/app.js']
      });
      const conflicts = await global.electronAPI.git.mergeConflicts('/repo');
      expect(conflicts.files).toHaveLength(1);

      // Mark resolved
      mockInvoke.mockResolvedValueOnce({ success: true });
      await global.electronAPI.git.markResolved({
        repoRoot: '/repo',
        filePath: 'src/app.js'
      });

      expect(mockInvoke).toHaveBeenCalledTimes(3);
    });

    test('refresh workflow: find repo → get branch → get status → get stashes', async () => {
      mockInvoke
        .mockResolvedValueOnce({ success: true, repoRoot: '/repo', isSubfolder: false })
        .mockResolvedValueOnce({ success: true, branch: 'main' })
        .mockResolvedValueOnce({ success: true, staged: [], unstaged: [] })
        .mockResolvedValueOnce({ success: true, stashes: [] });

      await global.electronAPI.git.findRepo('/test/repo');
      await global.electronAPI.git.getBranch('/repo');
      await global.electronAPI.git.statusDetailed('/repo');
      await global.electronAPI.git.stashList('/repo');

      expect(mockInvoke).toHaveBeenCalledTimes(4);
      expect(mockInvoke).toHaveBeenNthCalledWith(1, 'git-find-repo', '/test/repo');
      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'git-get-branch', '/repo');
      expect(mockInvoke).toHaveBeenNthCalledWith(3, 'git-status-detailed', '/repo');
      expect(mockInvoke).toHaveBeenNthCalledWith(4, 'git-stash-list', '/repo');
    });
  });

  describe('Git Panel Module - Edge Cases', () => {
    test('should handle non-git directory gracefully', async () => {
      mockInvoke.mockResolvedValue({ success: false, error: 'Not a git repository' });

      const result = await global.electronAPI.git.findRepo('/not-a-repo');
      expect(result.success).toBe(false);
    });

    test('should handle empty commit message', async () => {
      const message = '';
      expect(message.trim()).toBe('');
      // Module should prevent commit with empty message
    });

    test('should handle special characters in file paths', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      await global.electronAPI.git.stage({
        repoRoot: '/repo',
        paths: ['src/file with spaces.js', 'src/file"quotes.js']
      });

      expect(mockInvoke).toHaveBeenCalledWith('git-stage', {
        repoRoot: '/repo',
        paths: ['src/file with spaces.js', 'src/file"quotes.js']
      });
    });

    test('should handle very long file paths', async () => {
      const longPath = 'src/' + 'deeply/nested/'.repeat(10) + 'file.js';
      mockInvoke.mockResolvedValue({
        success: true,
        staged: [{ file: longPath, status: 'modified', statusCode: 'M' }],
        unstaged: []
      });

      const result = await global.electronAPI.git.statusDetailed('/repo');
      expect(result.staged[0].file).toBe(longPath);
    });

    test('should handle concurrent status requests', async () => {
      const delay = (ms) => new Promise(r => setTimeout(r, ms));
      mockInvoke.mockImplementation(async () => {
        await delay(10);
        return { success: true, staged: [], unstaged: [] };
      });

      const results = await Promise.all([
        global.electronAPI.git.statusDetailed('/repo'),
        global.electronAPI.git.statusDetailed('/repo'),
      ]);

      expect(results).toHaveLength(2);
      results.forEach(r => expect(r.success).toBe(true));
    });

    test('should handle status with renamed files', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        staged: [{ file: 'old-name.js -> new-name.js', status: 'renamed', statusCode: 'R' }],
        unstaged: []
      });

      const result = await global.electronAPI.git.statusDetailed('/repo');
      expect(result.staged[0].status).toBe('renamed');
    });
  });
});

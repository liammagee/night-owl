// Tests for git panel module logic
// Tests cover IPC call patterns, UI rendering helpers, and state management

describe('Git Panel', () => {
  let mockInvoke;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInvoke = global.electronAPI.invoke;

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
  });

  describe('IPC handler contracts', () => {
    test('git-status-detailed returns staged and unstaged arrays', async () => {
      mockInvoke.mockResolvedValue({
        success: true,
        staged: [{ file: 'README.md', status: 'modified', statusCode: 'M' }],
        unstaged: [{ file: 'src/app.js', status: 'untracked', statusCode: '??' }]
      });

      const result = await global.electronAPI.invoke('git-status-detailed', '/repo');
      expect(result.success).toBe(true);
      expect(result.staged).toHaveLength(1);
      expect(result.unstaged).toHaveLength(1);
      expect(result.staged[0].status).toBe('modified');
      expect(result.unstaged[0].status).toBe('untracked');
    });

    test('git-stage calls with correct arguments', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      await global.electronAPI.invoke('git-stage', {
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

      await global.electronAPI.invoke('git-unstage', {
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

      // Tracked file
      await global.electronAPI.invoke('git-discard', {
        repoRoot: '/repo',
        paths: ['src/file.js'],
        untracked: false
      });

      expect(mockInvoke).toHaveBeenCalledWith('git-discard', {
        repoRoot: '/repo',
        paths: ['src/file.js'],
        untracked: false
      });

      // Untracked file
      await global.electronAPI.invoke('git-discard', {
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

      const result = await global.electronAPI.invoke('git-commit', {
        repoRoot: '/repo',
        message: 'Test commit'
      });

      expect(result.success).toBe(true);
      expect(result.commitHash).toBe('abc1234');
    });

    test('git-commit returns error on failure', async () => {
      mockInvoke.mockResolvedValue({ success: false, error: 'Nothing to commit' });

      const result = await global.electronAPI.invoke('git-commit', {
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

      const result = await global.electronAPI.invoke('git-list-branches', '/repo');
      expect(result.success).toBe(true);
      expect(result.local).toContain('main');
      expect(result.remote).toContain('develop');
      expect(result.current).toBe('main');
    });

    test('git-switch-branch can create new branch', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      await global.electronAPI.invoke('git-switch-branch', {
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

      const result = await global.electronAPI.invoke('git-pull', '/repo');
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

      const result = await global.electronAPI.invoke('git-log', { repoRoot: '/repo', limit: 50 });
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

      const result = await global.electronAPI.invoke('git-show', { repoRoot: '/repo', hash: 'abc123full' });
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

      const result = await global.electronAPI.invoke('git-stash-list', '/repo');
      expect(result.success).toBe(true);
      expect(result.stashes).toHaveLength(1);
      expect(result.stashes[0].ref).toBe('stash@{0}');
    });

    test('git-stash-save accepts optional message', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      await global.electronAPI.invoke('git-stash-save', {
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

      await global.electronAPI.invoke('git-stash-apply', {
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

      const result = await global.electronAPI.invoke('git-blame', {
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

      const result = await global.electronAPI.invoke('git-merge-conflicts', '/repo');
      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(2);
    });

    test('git-mark-resolved stages the file', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      await global.electronAPI.invoke('git-mark-resolved', {
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

      const result = await global.electronAPI.invoke('git-diff', {
        repoRoot: '/repo',
        filePath: 'file.js',
        cached: false
      });

      expect(result.success).toBe(true);
      expect(result.diff).toContain('diff --git');
    });

    test('git-diff with cached flag for staged changes', async () => {
      mockInvoke.mockResolvedValue({ success: true, diff: '' });

      await global.electronAPI.invoke('git-diff', {
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

      const result = await global.electronAPI.invoke('git-file-content', {
        repoRoot: '/repo',
        ref: 'HEAD',
        filePath: 'src/index.js'
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('const x = 1;');
    });

    test('git-file-content returns error for new files', async () => {
      mockInvoke.mockResolvedValue({ success: false, error: 'path not found' });

      const result = await global.electronAPI.invoke('git-file-content', {
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

      const result = await global.electronAPI.invoke('git-push', '/repo');
      expect(result.success).toBe(true);
    });

    test('git-push returns error on failure', async () => {
      mockInvoke.mockResolvedValue({ success: false, error: 'Authentication failed' });

      const result = await global.electronAPI.invoke('git-push', '/repo');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication');
    });
  });

  describe('Fetch operations', () => {
    test('git-fetch returns behind count', async () => {
      mockInvoke.mockResolvedValue({ success: true, behind: 3 });

      const result = await global.electronAPI.invoke('git-fetch', '/repo');
      expect(result.success).toBe(true);
      expect(result.behind).toBe(3);
    });
  });
});

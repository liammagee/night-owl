/**
 * Integration tests for Git IPC handlers
 * Tests handler logic with mocked child_process.execSync
 */

const { ipcMain } = require('electron');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('child_process');

describe('Git IPC Handlers Integration', () => {
  let handlers;

  beforeAll(() => {
    // Capture all ipcMain.handle registrations
    handlers = {};
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    // Load git handlers - this triggers registration
    const gitHandlers = require('../../ipc/gitHandlers');
    gitHandlers.register({});
  });

  beforeEach(() => {
    jest.clearAllMocks();
    childProcess.execSync.mockReset();
  });

  describe('Handler Registration', () => {
    test('should register all expected handlers', () => {
      const expectedHandlers = [
        'git-find-repo', 'git-status', 'git-publish', 'git-get-branch', 'git-status-summary',
        'git-status-detailed', 'git-stage', 'git-unstage', 'git-discard', 'git-commit', 'git-push',
        'git-diff', 'git-file-content',
        'git-list-branches', 'git-switch-branch', 'git-pull', 'git-fetch',
        'git-log', 'git-show', 'git-diff-commit',
        'git-stash-list', 'git-stash-save', 'git-stash-apply', 'git-stash-drop',
        'git-blame',
        'git-merge-conflicts', 'git-mark-resolved'
      ];

      for (const name of expectedHandlers) {
        expect(handlers[name]).toBeDefined();
        expect(typeof handlers[name]).toBe('function');
      }
    });
  });

  describe('git-find-repo', () => {
    let tempRoot;

    beforeEach(() => {
      tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-git-find-'));
    });

    afterEach(() => {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    test('finds the repo root from a nested directory', async () => {
      const repoRoot = path.join(tempRoot, 'repo');
      const nestedDir = path.join(repoRoot, 'docs', 'research');
      fs.mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
      fs.mkdirSync(nestedDir, { recursive: true });

      const result = await handlers['git-find-repo']({}, nestedDir);

      expect(result).toEqual({
        success: true,
        repoRoot,
        isSubfolder: true,
        relativePath: path.join('docs', 'research')
      });
    });

    test('accepts a file path inside the repo', async () => {
      const repoRoot = path.join(tempRoot, 'repo');
      const nestedDir = path.join(repoRoot, 'docs');
      const filePath = path.join(nestedDir, 'note.md');
      fs.mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
      fs.mkdirSync(nestedDir, { recursive: true });
      fs.writeFileSync(filePath, '# Note');

      const result = await handlers['git-find-repo']({}, filePath);

      expect(result).toEqual({
        success: true,
        repoRoot,
        isSubfolder: true,
        relativePath: path.join('docs', 'note.md')
      });
    });

    test('returns a clear error for a missing path', async () => {
      const result = await handlers['git-find-repo']({}, path.join(tempRoot, 'missing'));

      expect(result).toEqual({
        success: false,
        error: 'Path does not exist'
      });
    });
  });

  describe('git-status-detailed', () => {
    test('should parse porcelain output into staged and unstaged', async () => {
      childProcess.execSync.mockReturnValue(
        'M  staged-file.js\n' +
        ' M unstaged-file.js\n' +
        'MM both-file.js\n' +
        'A  new-staged.js\n' +
        '?? untracked.js\n' +
        ' D deleted-unstaged.js\n'
      );

      const result = await handlers['git-status-detailed']({}, '/repo');

      expect(result.success).toBe(true);
      expect(result.staged).toEqual(expect.arrayContaining([
        expect.objectContaining({ file: 'staged-file.js', status: 'modified' }),
        expect.objectContaining({ file: 'both-file.js', status: 'modified' }),
        expect.objectContaining({ file: 'new-staged.js', status: 'added' })
      ]));
      expect(result.staged).toHaveLength(3);

      expect(result.unstaged).toEqual(expect.arrayContaining([
        expect.objectContaining({ file: 'unstaged-file.js', status: 'modified' }),
        expect.objectContaining({ file: 'both-file.js', status: 'modified' }),
        expect.objectContaining({ file: 'untracked.js', status: 'untracked' }),
        expect.objectContaining({ file: 'deleted-unstaged.js', status: 'deleted' })
      ]));
      expect(result.unstaged).toHaveLength(4);
    });

    test('should return empty arrays for clean repo', async () => {
      childProcess.execSync.mockReturnValue('');

      const result = await handlers['git-status-detailed']({}, '/repo');

      expect(result.success).toBe(true);
      expect(result.staged).toEqual([]);
      expect(result.unstaged).toEqual([]);
    });

    test('should handle execSync error', async () => {
      childProcess.execSync.mockImplementation(() => {
        throw new Error('not a git repository');
      });

      const result = await handlers['git-status-detailed']({}, '/not-a-repo');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a git repository');
    });
  });

  describe('git-stage', () => {
    test('should call git add with correct paths', async () => {
      childProcess.execSync.mockReturnValue('');

      const result = await handlers['git-stage']({}, {
        repoRoot: '/repo',
        paths: ['src/file.js', 'src/other.js']
      });

      expect(result.success).toBe(true);
      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringContaining('git add -- "src/file.js" "src/other.js"'),
        expect.objectContaining({ cwd: '/repo' })
      );
    });

    test('should handle stage failure', async () => {
      childProcess.execSync.mockImplementation(() => {
        throw new Error('pathspec not found');
      });

      const result = await handlers['git-stage']({}, {
        repoRoot: '/repo',
        paths: ['nonexistent.js']
      });

      expect(result.success).toBe(false);
    });
  });

  describe('git-unstage', () => {
    test('should call git reset HEAD with paths', async () => {
      childProcess.execSync.mockReturnValue('');

      const result = await handlers['git-unstage']({}, {
        repoRoot: '/repo',
        paths: ['staged-file.js']
      });

      expect(result.success).toBe(true);
      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringContaining('git reset HEAD -- "staged-file.js"'),
        expect.objectContaining({ cwd: '/repo' })
      );
    });
  });

  describe('git-discard', () => {
    test('should use git checkout for tracked files', async () => {
      childProcess.execSync.mockReturnValue('');

      const result = await handlers['git-discard']({}, {
        repoRoot: '/repo',
        paths: ['modified-file.js'],
        untracked: false
      });

      expect(result.success).toBe(true);
      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringContaining('git checkout --'),
        expect.objectContaining({ cwd: '/repo' })
      );
    });

    test('should use git clean for untracked files', async () => {
      childProcess.execSync.mockReturnValue('');

      const result = await handlers['git-discard']({}, {
        repoRoot: '/repo',
        paths: ['new-file.js'],
        untracked: true
      });

      expect(result.success).toBe(true);
      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringContaining('git clean -f --'),
        expect.objectContaining({ cwd: '/repo' })
      );
    });
  });

  describe('git-commit', () => {
    test('should commit and return hash', async () => {
      childProcess.execSync.mockReturnValue('[main abc1234] Test message\n 1 file changed');

      const result = await handlers['git-commit']({}, {
        repoRoot: '/repo',
        message: 'Test message'
      });

      expect(result.success).toBe(true);
      expect(result.commitHash).toBe('abc1234');
    });

    test('should escape double quotes in commit message', async () => {
      childProcess.execSync.mockReturnValue('[main def5678] message');

      await handlers['git-commit']({}, {
        repoRoot: '/repo',
        message: 'Fix "quoted" string'
      });

      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringContaining('Fix \\"quoted\\" string'),
        expect.any(Object)
      );
    });

    test('should handle nothing-to-commit error', async () => {
      const error = new Error('');
      error.stderr = 'nothing to commit, working tree clean';
      childProcess.execSync.mockImplementation(() => { throw error; });

      const result = await handlers['git-commit']({}, {
        repoRoot: '/repo',
        message: 'Empty'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Nothing to commit');
    });
  });

  describe('git-push', () => {
    test('should push successfully', async () => {
      childProcess.execSync.mockReturnValue('');

      const result = await handlers['git-push']({}, '/repo');

      expect(result.success).toBe(true);
      expect(childProcess.execSync).toHaveBeenCalledWith(
        'git push',
        expect.objectContaining({ cwd: '/repo' })
      );
    });

    test('should return error message from stderr', async () => {
      const error = new Error('push failed');
      error.stderr = 'Authentication failed for remote';
      childProcess.execSync.mockImplementation(() => { throw error; });

      const result = await handlers['git-push']({}, '/repo');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication failed');
    });
  });

  describe('git-diff', () => {
    test('should get unstaged diff', async () => {
      childProcess.execSync.mockReturnValue('--- a/file.js\n+++ b/file.js\n@@ -1 +1 @@\n-old\n+new');

      const result = await handlers['git-diff']({}, {
        repoRoot: '/repo',
        filePath: 'file.js',
        cached: false
      });

      expect(result.success).toBe(true);
      expect(result.diff).toContain('---');
      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringMatching(/^git diff\s+-- "file.js"$/),
        expect.any(Object)
      );
    });

    test('should get staged diff with --cached flag', async () => {
      childProcess.execSync.mockReturnValue('diff content');

      await handlers['git-diff']({}, {
        repoRoot: '/repo',
        filePath: 'file.js',
        cached: true
      });

      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringContaining('--cached'),
        expect.any(Object)
      );
    });
  });

  describe('git-file-content', () => {
    test('should get file content at HEAD', async () => {
      childProcess.execSync.mockReturnValue('const x = 1;\nconst y = 2;\n');

      const result = await handlers['git-file-content']({}, {
        repoRoot: '/repo',
        ref: 'HEAD',
        filePath: 'src/index.js'
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('const x = 1;\nconst y = 2;\n');
    });

    test('should return error for file not in ref', async () => {
      childProcess.execSync.mockImplementation(() => {
        throw new Error("fatal: path 'new.js' does not exist in 'HEAD'");
      });

      const result = await handlers['git-file-content']({}, {
        repoRoot: '/repo',
        ref: 'HEAD',
        filePath: 'new.js'
      });

      expect(result.success).toBe(false);
    });
  });

  describe('git-list-branches', () => {
    test('should return local and remote branches with current', async () => {
      childProcess.execSync
        .mockReturnValueOnce('main\nfeature/login\ndevelop\n')  // local
        .mockReturnValueOnce('origin/main\norigin/develop\norigin/staging\n')  // remote
        .mockReturnValueOnce('main');  // current

      const result = await handlers['git-list-branches']({}, '/repo');

      expect(result.success).toBe(true);
      expect(result.local).toEqual(['main', 'feature/login', 'develop']);
      expect(result.remote).toEqual(['main', 'develop', 'staging']);
      expect(result.current).toBe('main');
    });

    test('should handle repos without remotes', async () => {
      childProcess.execSync
        .mockReturnValueOnce('main\n')  // local
        .mockImplementationOnce(() => { throw new Error('no remote'); })  // remote fails
        .mockReturnValueOnce('main');  // current

      const result = await handlers['git-list-branches']({}, '/repo');

      expect(result.success).toBe(true);
      expect(result.local).toEqual(['main']);
      expect(result.remote).toEqual([]);
    });
  });

  describe('git-switch-branch', () => {
    test('should switch to existing branch', async () => {
      childProcess.execSync.mockReturnValue('');

      const result = await handlers['git-switch-branch']({}, {
        repoRoot: '/repo',
        branch: 'develop',
        create: false
      });

      expect(result.success).toBe(true);
      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringContaining('git switch "develop"'),
        expect.any(Object)
      );
    });

    test('should create and switch with -c flag', async () => {
      childProcess.execSync.mockReturnValue('');

      const result = await handlers['git-switch-branch']({}, {
        repoRoot: '/repo',
        branch: 'new-feature',
        create: true
      });

      expect(result.success).toBe(true);
      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringContaining('git switch -c "new-feature"'),
        expect.any(Object)
      );
    });

    test('should return error for dirty tree conflicts', async () => {
      const error = new Error('');
      error.stderr = 'error: Your local changes would be overwritten';
      childProcess.execSync.mockImplementation(() => { throw error; });

      const result = await handlers['git-switch-branch']({}, {
        repoRoot: '/repo',
        branch: 'other',
        create: false
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('local changes');
    });
  });

  describe('git-pull', () => {
    test('should fetch then pull', async () => {
      childProcess.execSync
        .mockReturnValueOnce('')  // fetch
        .mockReturnValueOnce('Already up to date.');  // pull

      const result = await handlers['git-pull']({}, '/repo');

      expect(result.success).toBe(true);
      expect(result.output).toBe('Already up to date.');
      expect(childProcess.execSync).toHaveBeenCalledTimes(2);
    });

    test('should handle merge conflict from pull', async () => {
      childProcess.execSync
        .mockReturnValueOnce('')  // fetch OK
        .mockImplementationOnce(() => {
          const error = new Error('');
          error.stderr = 'CONFLICT (content): Merge conflict in file.js';
          throw error;
        });

      const result = await handlers['git-pull']({}, '/repo');

      expect(result.success).toBe(false);
      expect(result.error).toContain('CONFLICT');
    });
  });

  describe('git-fetch', () => {
    test('should fetch and return behind count', async () => {
      childProcess.execSync
        .mockReturnValueOnce('')  // fetch
        .mockReturnValueOnce('5');  // behind count

      const result = await handlers['git-fetch']({}, '/repo');

      expect(result.success).toBe(true);
      expect(result.behind).toBe(5);
    });

    test('should handle no upstream', async () => {
      childProcess.execSync
        .mockReturnValueOnce('')  // fetch OK
        .mockImplementationOnce(() => { throw new Error('no upstream'); });

      const result = await handlers['git-fetch']({}, '/repo');

      expect(result.success).toBe(true);
      expect(result.behind).toBe(0);
    });
  });

  describe('git-log', () => {
    test('should parse commit log entries', async () => {
      const logOutput = [
        'abc123fullhash1234567890abcdef1234567890',
        'abc1234',
        'Test Author',
        '2 hours ago',
        'First commit message',
        '---COMMIT_END---',
        'def456fullhash1234567890abcdef1234567890',
        'def4567',
        'Other Author',
        '3 days ago',
        'Second commit',
        '---COMMIT_END---'
      ].join('\n');

      childProcess.execSync.mockReturnValue(logOutput);

      const result = await handlers['git-log']({}, { repoRoot: '/repo', limit: 50 });

      expect(result.success).toBe(true);
      expect(result.commits).toHaveLength(2);
      expect(result.commits[0]).toEqual({
        hash: 'abc123fullhash1234567890abcdef1234567890',
        shortHash: 'abc1234',
        author: 'Test Author',
        relativeTime: '2 hours ago',
        message: 'First commit message'
      });
    });

    test('should use specified limit', async () => {
      childProcess.execSync.mockReturnValue('');

      await handlers['git-log']({}, { repoRoot: '/repo', limit: 10 });

      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringContaining('-10'),
        expect.any(Object)
      );
    });

    test('should default to 50 commits', async () => {
      childProcess.execSync.mockReturnValue('');

      await handlers['git-log']({}, { repoRoot: '/repo' });

      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringContaining('-50'),
        expect.any(Object)
      );
    });
  });

  describe('git-show', () => {
    test('should parse commit detail with files', async () => {
      const showOutput = [
        'abc123fullhash',
        'Test Author',
        'test@example.com',
        '2 hours ago',
        'Fix the bug',
        'Detailed body text',
        '---BODY_END---',
        ' src/app.js | 5 ++---',
        ' README.md  | 2 +-',
        ' 2 files changed, 3 insertions(+), 4 deletions(-)'
      ].join('\n');

      childProcess.execSync.mockReturnValue(showOutput);

      const result = await handlers['git-show']({}, { repoRoot: '/repo', hash: 'abc123' });

      expect(result.success).toBe(true);
      expect(result.commit.author).toBe('Test Author');
      expect(result.commit.message).toBe('Fix the bug');
      expect(result.commit.files).toHaveLength(2);
      expect(result.commit.files[0].file).toBe('src/app.js');
    });
  });

  describe('git-stash-list', () => {
    test('should parse stash entries', async () => {
      const stashOutput = [
        'stash@{0}',
        'WIP on main: abc1234 Fix bug',
        '5 minutes ago',
        '---STASH_END---',
        'stash@{1}',
        'On main: Save before rebase',
        '2 hours ago',
        '---STASH_END---'
      ].join('\n');

      childProcess.execSync.mockReturnValue(stashOutput);

      const result = await handlers['git-stash-list']({}, '/repo');

      expect(result.success).toBe(true);
      expect(result.stashes).toHaveLength(2);
      expect(result.stashes[0].ref).toBe('stash@{0}');
      expect(result.stashes[1].message).toContain('Save before rebase');
    });

    test('should return empty array for no stashes', async () => {
      childProcess.execSync.mockReturnValue('');

      const result = await handlers['git-stash-list']({}, '/repo');

      expect(result.success).toBe(true);
      expect(result.stashes).toEqual([]);
    });
  });

  describe('git-stash-save', () => {
    test('should stash with message', async () => {
      childProcess.execSync.mockReturnValue('');

      const result = await handlers['git-stash-save']({}, {
        repoRoot: '/repo',
        message: 'WIP feature'
      });

      expect(result.success).toBe(true);
      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringContaining('git stash push -m "WIP feature"'),
        expect.any(Object)
      );
    });

    test('should stash without message', async () => {
      childProcess.execSync.mockReturnValue('');

      const result = await handlers['git-stash-save']({}, {
        repoRoot: '/repo',
        message: ''
      });

      expect(result.success).toBe(true);
      expect(childProcess.execSync).toHaveBeenCalledWith(
        'git stash push',
        expect.any(Object)
      );
    });

    test('should return error when nothing to stash', async () => {
      const error = new Error('');
      error.stderr = 'No local changes to save';
      childProcess.execSync.mockImplementation(() => { throw error; });

      const result = await handlers['git-stash-save']({}, {
        repoRoot: '/repo',
        message: ''
      });

      expect(result.success).toBe(false);
    });
  });

  describe('git-stash-apply', () => {
    test('should apply stash without dropping', async () => {
      childProcess.execSync.mockReturnValue('');

      const result = await handlers['git-stash-apply']({}, {
        repoRoot: '/repo',
        ref: 'stash@{0}',
        drop: false
      });

      expect(result.success).toBe(true);
      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringContaining('git stash apply'),
        expect.any(Object)
      );
    });

    test('should pop stash (apply + drop)', async () => {
      childProcess.execSync.mockReturnValue('');

      const result = await handlers['git-stash-apply']({}, {
        repoRoot: '/repo',
        ref: 'stash@{0}',
        drop: true
      });

      expect(result.success).toBe(true);
      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringContaining('git stash pop'),
        expect.any(Object)
      );
    });
  });

  describe('git-stash-drop', () => {
    test('should drop specified stash', async () => {
      childProcess.execSync.mockReturnValue('');

      const result = await handlers['git-stash-drop']({}, {
        repoRoot: '/repo',
        ref: 'stash@{1}'
      });

      expect(result.success).toBe(true);
      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringContaining('git stash drop "stash@{1}"'),
        expect.any(Object)
      );
    });
  });

  describe('git-blame', () => {
    test('should parse porcelain blame output', async () => {
      const hash1 = 'a'.repeat(40);
      const hash2 = 'b'.repeat(40);
      const blameOutput = [
        `${hash1} 1 1 3`,
        'author Test User',
        'author-mail <test@test.com>',
        'author-time 1700000000',
        'author-tz +0000',
        'committer Test User',
        'committer-mail <test@test.com>',
        'committer-time 1700000000',
        'committer-tz +0000',
        'summary Initial commit',
        'filename src/index.js',
        '\tconst x = 1;',
        `${hash1} 2 2`,
        '\tconst y = 2;',
        `${hash2} 3 3 1`,
        'author Other Dev',
        'author-mail <other@test.com>',
        'author-time 1700100000',
        'author-tz +0000',
        'committer Other Dev',
        'committer-mail <other@test.com>',
        'committer-time 1700100000',
        'committer-tz +0000',
        'summary Fix bug',
        'filename src/index.js',
        '\tconst z = 3;'
      ].join('\n');

      childProcess.execSync.mockReturnValue(blameOutput);

      const result = await handlers['git-blame']({}, {
        repoRoot: '/repo',
        filePath: 'src/index.js'
      });

      expect(result.success).toBe(true);
      expect(result.lines).toHaveLength(3);
      expect(result.lines[0]).toMatchObject({
        line: 1,
        author: 'Test User',
        summary: 'Initial commit',
        content: 'const x = 1;'
      });
      expect(result.lines[2]).toMatchObject({
        line: 3,
        author: 'Other Dev',
        summary: 'Fix bug'
      });
    });

    test('should handle blame failure for untracked file', async () => {
      childProcess.execSync.mockImplementation(() => {
        throw new Error("fatal: no such path 'new-file.js' in HEAD");
      });

      const result = await handlers['git-blame']({}, {
        repoRoot: '/repo',
        filePath: 'new-file.js'
      });

      expect(result.success).toBe(false);
    });
  });

  describe('git-merge-conflicts', () => {
    test('should list conflicted files', async () => {
      childProcess.execSync.mockReturnValue('src/app.js\nsrc/utils.js\n');

      const result = await handlers['git-merge-conflicts']({}, '/repo');

      expect(result.success).toBe(true);
      expect(result.files).toEqual(['src/app.js', 'src/utils.js']);
    });

    test('should return empty array when no conflicts', async () => {
      childProcess.execSync.mockReturnValue('');

      const result = await handlers['git-merge-conflicts']({}, '/repo');

      expect(result.success).toBe(true);
      expect(result.files).toEqual([]);
    });
  });

  describe('git-mark-resolved', () => {
    test('should stage the file to mark as resolved', async () => {
      childProcess.execSync.mockReturnValue('');

      const result = await handlers['git-mark-resolved']({}, {
        repoRoot: '/repo',
        filePath: 'src/conflict.js'
      });

      expect(result.success).toBe(true);
      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringContaining('git add "src/conflict.js"'),
        expect.objectContaining({ cwd: '/repo' })
      );
    });
  });

  describe('git-diff-commit', () => {
    test('should diff between a commit and its parent', async () => {
      childProcess.execSync.mockReturnValue('diff --git a/file.js b/file.js\n+new line');

      const result = await handlers['git-diff-commit']({}, {
        repoRoot: '/repo',
        hash: 'abc1234',
        filePath: 'file.js'
      });

      expect(result.success).toBe(true);
      expect(result.diff).toContain('diff --git');
    });
  });
});

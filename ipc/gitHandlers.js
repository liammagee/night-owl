// === Git IPC Handlers ===
// Handles git operations for publishing folders to repositories

const { ipcMain } = require('electron');
const { runGit, readStatus, invalidateStatus, validatePaths, validateRef, pushBranch } = require('../services/gitService');
const path = require('path');
const fs = require('fs');
const { createDebugLogger } = require('./logging');
const { createRuntimeWorkspaceResolver } = require('./runtimeWorkspace');

function register(deps) {
  const debug = createDebugLogger('GitHandlers');
  debug('Registering git handlers...');
  const getWorkingDirectory = createRuntimeWorkspaceResolver(deps || {});
  const busy = new Set();
  const reads = new Set(['git-find-repo', 'git-status', 'git-get-branch', 'git-status-summary',
    'git-status-detailed', 'git-diff', 'git-file-content', 'git-list-branches', 'git-log',
    'git-show', 'git-diff-commit', 'git-stash-list', 'git-blame', 'git-merge-conflicts',
    'git-diff-lines', 'git-diff-hunks', 'git-list-tags', 'git-list-remotes', 'git-log-graph']);
  function registerGitHandler(channel, handler) {
    ipcMain.handle(channel, async (event, payload) => {
      const repo = typeof payload === 'string' ? payload : payload?.repoRoot;
      const mutation = !reads.has(channel);
      if (channel !== 'git-find-repo' && (typeof repo !== 'string' || !path.isAbsolute(repo))) {
        return { success: false, error: 'An absolute repository path is required.' };
      }
      let key;
      try { key = repo ? fs.realpathSync(repo) : ''; }
      catch (error) { return { success: false, error: 'Repository path does not exist.' }; }
      if (mutation && busy.has(key)) return { success: false, error: 'Another Git operation is still running.' };
      if (mutation) { busy.add(key); invalidateStatus(repo); }
      try { return await handler(event, payload); }
      catch (error) { return { success: false, error: error.message }; }
      finally { if (mutation) { busy.delete(key); invalidateStatus(repo); } }
    });
  }

  /**
   * Find git repository root from any subfolder
   * Traverses up directory tree to find .git directory
   */
  registerGitHandler('git-find-repo', async (event, folderPath) => {
    try {
      const lookupPath = folderPath || getWorkingDirectory();
      debug(`Finding git repo for: ${lookupPath}`);

      if (!lookupPath || !fs.existsSync(lookupPath)) {
        debug(`Git repo lookup skipped; path does not exist: ${lookupPath}`);
        return { success: false, error: 'Path does not exist' };
      }

      let currentPath = fs.statSync(lookupPath).isDirectory()
        ? lookupPath
        : path.dirname(lookupPath);
      const originalPath = lookupPath;

      // Traverse up to find .git directory
      while (currentPath !== path.dirname(currentPath)) {
        const gitPath = path.join(currentPath, '.git');
        if (fs.existsSync(gitPath)) {
          const isSubfolder = currentPath !== originalPath;
          const relativePath = isSubfolder ? path.relative(currentPath, originalPath) : '.';

          debug(`Found git repo at: ${currentPath}, subfolder: ${relativePath}`);
          return {
            success: true,
            repoRoot: currentPath,
            isSubfolder,
            relativePath
          };
        }
        currentPath = path.dirname(currentPath);
      }

      debug(`No git repo found for: ${lookupPath}`);
      return { success: false, error: 'Not a git repository' };
    } catch (error) {
      console.error('[GitHandlers] Error finding git repo:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get git status for a folder
   * Returns list of changed files with their status
   */
  registerGitHandler('git-status', async (event, { repoRoot, subfolder }) => {
    const state = await readStatus(repoRoot);
    const scope = validatePaths([subfolder || '.'])[0].replace(/\/$/, '');
    const changes = state.changes.filter(change => scope === '.' || change.file === scope ||
      change.file.startsWith(scope + '/') || change.originalFile === scope || change.originalFile?.startsWith(scope + '/'));
    return { success: true, changes };
  });

  /**
   * Publish changes: stage, commit, and push
   */
  registerGitHandler('git-publish', async (event, { repoRoot, subfolder, message, stagedOnly = false }) => {
    let commitHash = null;
    try {
      if (typeof message !== 'string' || !message.trim()) throw new Error('Enter a commit message.');
      const state = await readStatus(repoRoot);
      if (state.detached) throw new Error('Switch to a branch before publishing.');
      if (state.conflicts.length) throw new Error('Resolve conflicts before publishing.');
      // Verify the destination before touching the index or creating a commit.
      await pushBranch(repoRoot, { dryRun: true });
      const scope = validatePaths([subfolder || '.'])[0];
      if (stagedOnly) {
        if (!state.staged.length) throw new Error('Stage the changes you want to commit first.');
        await runGit(['commit', '-m', message], { cwd: repoRoot, timeout: 30000 });
      } else {
        // A scoped commit must not sweep in already staged work elsewhere.
        // Reject cross-boundary renames because committing only one end is misleading.
        const inside = file => scope === '.' || file === scope || file.startsWith(scope.replace(/\/$/, '') + '/');
        if (state.changes.some(change => change.originalFile && inside(change.file) !== inside(change.originalFile))) {
          throw new Error('A rename crosses this folder. Publish from the repository root or stage and commit it explicitly.');
        }
        if (!state.changes.some(change => inside(change.file))) throw new Error('No changes to commit.');
        await runGit(['add', '--', scope], { cwd: repoRoot, timeout: 30000 });
        await runGit(['commit', '--only', '-m', message, '--', scope], { cwd: repoRoot, timeout: 30000 });
      }
      commitHash = (await runGit(['rev-parse', '--short', 'HEAD'], { cwd: repoRoot })).trim();
      await pushBranch(repoRoot);
      return { success: true, committed: true, pushed: true, commitHash };
    } catch (error) {
      return { success: false, committed: !!commitHash, pushed: false, commitHash,
        error: commitHash ? `Committed locally (${commitHash}). Push failed: ${error.message} Retry with Push.` : error.message };
    }
  });

  /**
   * Get current branch name
   */
  registerGitHandler('git-get-branch', async (event, repoRoot) => {
    const state = await readStatus(repoRoot);
    return { success: true, branch: state.branch };
  });

  /**
   * Get quick status summary (counts of changes)
   */
  registerGitHandler('git-status-summary', async (event, repoRoot) => {
    const state = await readStatus(repoRoot);
    return { success: true, ...state.summary };
  });

  // === Phase 1: Detailed status, stage, unstage, discard, commit-only ===

  /**
   * Get detailed status split into staged vs unstaged
   */
  registerGitHandler('git-status-detailed', async (event, repoRoot) => {
    const state = await readStatus(repoRoot);
    return { success: true, ...state.summary, staged: state.staged, unstaged: state.unstaged };
  });

  /**
   * Stage files
   */
  registerGitHandler('git-stage', async (event, { repoRoot, paths }) => {
    try {
      (await runGit(['add', '--', ...validatePaths(paths)], {
        cwd: repoRoot, encoding: 'utf8', timeout: 15000
      }));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Unstage files
   */
  registerGitHandler('git-unstage', async (event, { repoRoot, paths }) => {
    const state = await readStatus(repoRoot);
    await runGit(state.unborn
      ? ['rm', '--cached', '-r', '--', ...validatePaths(paths)]
      : ['reset', 'HEAD', '--', ...validatePaths(paths)], { cwd: repoRoot, timeout: 15000 });
    return { success: true };
  });

  /**
   * Discard changes in working tree
   */
  registerGitHandler('git-discard', async (event, { repoRoot, paths, untracked }) => {
    try {
      if (untracked) {
        (await runGit(['clean', '-fd', '--', ...validatePaths(paths)], {
          cwd: repoRoot, encoding: 'utf8', timeout: 15000
        }));
      } else {
        (await runGit(['checkout', '--', ...validatePaths(paths)], {
          cwd: repoRoot, encoding: 'utf8', timeout: 15000
        }));
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Commit only (no push) — separate from git-publish
   */
  registerGitHandler('git-commit', async (event, { repoRoot, message, amend }) => {
    if (typeof message !== 'string' || !message.trim()) throw new Error('Enter a commit message.');
    await runGit(['commit', ...(amend ? ['--amend'] : []), '-m', message], { cwd: repoRoot, timeout: 30000 });
    const commitHash = (await runGit(['rev-parse', '--short', 'HEAD'], { cwd: repoRoot })).trim();
    return { success: true, commitHash };
  });

  /**
   * Push to remote
   */
  registerGitHandler('git-push', async (event, repoRoot) => {
    await pushBranch(repoRoot);
    return { success: true };
  });

  // === Phase 2: Diff viewer ===

  /**
   * Get diff for a file (staged or unstaged)
   */
  registerGitHandler('git-diff', async (event, { repoRoot, filePath, cached }) => {
    try {
      const diff = (await runGit(['diff', ...(cached ? ['--cached'] : []), '--', ...validatePaths([filePath])], {
        cwd: repoRoot, encoding: 'utf8', timeout: 15000
      }));
      return { success: true, diff };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get file content at a specific ref (e.g. HEAD)
   */
  registerGitHandler('git-file-content', async (event, { repoRoot, ref, filePath }) => {
    try {
      const content = (await runGit(['show', `${validateRef(ref)}:${validatePaths([filePath])[0]}`], {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      }));
      return { success: true, content };
    } catch (error) {
      // File may not exist at that ref (new file)
      return { success: false, error: error.message };
    }
  });

  // === Phase 3: Branch switching + pull ===

  /**
   * List local and remote branches
   */
  registerGitHandler('git-list-branches', async (event, repoRoot) => {
    try {
      const localOut = (await runGit(["branch", "--format=%(refname:short)"], {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      }));
      const local = localOut.split('\n').filter(b => b.trim());

      let remote = [];
      try {
        const remoteOut = (await runGit(["branch", "-r", "--format=%(refname:short)"], {
          cwd: repoRoot, encoding: 'utf8', timeout: 10000
        }));
        remote = remoteOut.split('\n')
          .filter(b => b.trim() && !b.includes('HEAD'))
          .map(b => b.replace(/^origin\//, ''));
      } catch (e) { /* no remote */ }

      const current = (await runGit(["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: repoRoot, encoding: 'utf8', timeout: 5000
      })).trim();

      return { success: true, local, remote, current };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Switch branch (or create with -c)
   */
  registerGitHandler('git-switch-branch', async (event, { repoRoot, branch, create }) => {
    try {
      (await runGit(['switch', ...(create ? ['-c'] : []), validateRef(branch)], {
        cwd: repoRoot, encoding: 'utf8', timeout: 15000
      }));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  /**
   * Fetch and pull
   */
  registerGitHandler('git-pull', async (event, repoRoot) => {
    const state = await readStatus(repoRoot);
    if (state.changes.length) throw new Error('Commit or stash your changes before pulling.');
    const output = await runGit(['pull', '--ff-only'], { cwd: repoRoot, timeout: 60000 });
    return { success: true, output: output.trim() };
  });

  /**
   * Fetch only (for behind count)
   */
  registerGitHandler('git-fetch', async (event, repoRoot) => {
    try {
      (await runGit(["fetch", "--prune"], {
        cwd: repoRoot, encoding: 'utf8', timeout: 30000
      }));
      // Get behind count
      let behind = 0;
      try {
        const behindOut = (await runGit(["rev-list", "--count", "HEAD..@{u}"], {
          cwd: repoRoot, encoding: 'utf8', timeout: 5000
        })).trim();
        behind = parseInt(behindOut, 10) || 0;
      } catch (e) { /* no upstream */ }
      return { success: true, behind };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // === Phase 4: Commit history ===

  /**
   * Get commit log
   */
  registerGitHandler('git-log', async (event, { repoRoot, limit }) => {
    try {
      const n = Math.min(200, Math.max(1, Number(limit) || 50));
      const fmt = '--pretty=format:%H%n%h%n%an%n%ar%n%s%n---COMMIT_END---';
      const output = (await runGit(['log', `-${n}`, fmt], {
        cwd: repoRoot, encoding: 'utf8', timeout: 15000
      }));
      const commits = [];
      const chunks = output.split('---COMMIT_END---').filter(c => c.trim());
      for (const chunk of chunks) {
        const parts = chunk.trim().split('\n');
        if (parts.length >= 5) {
          commits.push({
            hash: parts[0],
            shortHash: parts[1],
            author: parts[2],
            relativeTime: parts[3],
            message: parts.slice(4).join('\n')
          });
        }
      }
      return { success: true, commits };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get commit detail with file stats
   */
  registerGitHandler('git-show', async (event, { repoRoot, hash }) => {
    try {
      const output = (await runGit(['show', '--stat', '--format=%H%n%an%n%ae%n%ar%n%s%n%b%n---BODY_END---', validateRef(hash), '--'], {
        cwd: repoRoot, encoding: 'utf8', timeout: 15000
      }));
      const bodyEnd = output.indexOf('---BODY_END---');
      const header = output.substring(0, bodyEnd).trim().split('\n');
      const statsSection = output.substring(bodyEnd + '---BODY_END---'.length).trim();
      const files = statsSection.split('\n')
        .filter(l => l.includes('|'))
        .map(l => {
          const parts = l.trim().split('|');
          return { file: parts[0].trim(), changes: parts[1] ? parts[1].trim() : '' };
        });
      return {
        success: true,
        commit: {
          hash: header[0] || hash,
          author: header[1] || '',
          email: header[2] || '',
          relativeTime: header[3] || '',
          message: header[4] || '',
          body: header.slice(5).join('\n').trim(),
          files
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get diff for a file at a specific commit
   */
  registerGitHandler('git-diff-commit', async (event, { repoRoot, hash, filePath }) => {
    try {
      const diff = (await runGit(['diff-tree', '--root', '-p', validateRef(hash), '--', ...validatePaths([filePath])], {
        cwd: repoRoot, encoding: 'utf8', timeout: 15000
      }));
      return { success: true, diff };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // === Phase 5: Stash ===

  registerGitHandler('git-stash-list', async (event, repoRoot) => {
    try {
      const output = (await runGit(["stash", "list", "--format=%gd%n%s%n%ar%n---STASH_END---"], {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      }));
      const stashes = [];
      const chunks = output.split('---STASH_END---').filter(c => c.trim());
      for (const chunk of chunks) {
        const parts = chunk.trim().split('\n');
        if (parts.length >= 3) {
          stashes.push({ ref: parts[0], message: parts[1], relativeTime: parts[2] });
        }
      }
      return { success: true, stashes };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  registerGitHandler('git-stash-save', async (event, { repoRoot, message }) => {
    try {
      const cmd = ['stash', 'push', ...(message ? ['-m', message] : [])];
      (await runGit(cmd, { cwd: repoRoot, encoding: 'utf8', timeout: 15000 }));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  registerGitHandler('git-stash-apply', async (event, { repoRoot, ref, drop }) => {
    try {
      const cmd = ['stash', drop ? 'pop' : 'apply', validateRef(ref)];
      (await runGit(cmd, { cwd: repoRoot, encoding: 'utf8', timeout: 15000 }));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  registerGitHandler('git-stash-drop', async (event, { repoRoot, ref }) => {
    try {
      (await runGit(['stash', 'drop', validateRef(ref)], {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      }));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  // === Phase 6: Blame ===

  registerGitHandler('git-blame', async (event, { repoRoot, filePath }) => {
    try {
      const output = (await runGit(['blame', '--porcelain', '--', ...validatePaths([filePath])], {
        cwd: repoRoot, encoding: 'utf8', timeout: 30000
      }));
      const lines = [];
      let current = null;
      const commitCache = {};

      for (const line of output.split('\n')) {
        // New blame entry: hash origLine finalLine [numLines]
        const headerMatch = line.match(/^([0-9a-f]{40}) (\d+) (\d+)/);
        if (headerMatch) {
          current = {
            hash: headerMatch[1],
            origLine: parseInt(headerMatch[2]),
            finalLine: parseInt(headerMatch[3])
          };
          if (commitCache[current.hash]) {
            Object.assign(current, commitCache[current.hash]);
          }
          continue;
        }
        if (!current) continue;

        if (line.startsWith('author ')) {
          current.author = line.substring(7);
          if (!commitCache[current.hash]) commitCache[current.hash] = {};
          commitCache[current.hash].author = current.author;
        } else if (line.startsWith('author-time ')) {
          current.authorTime = parseInt(line.substring(12));
          if (!commitCache[current.hash]) commitCache[current.hash] = {};
          commitCache[current.hash].authorTime = current.authorTime;
        } else if (line.startsWith('summary ')) {
          current.summary = line.substring(8);
          if (!commitCache[current.hash]) commitCache[current.hash] = {};
          commitCache[current.hash].summary = current.summary;
        } else if (line.startsWith('\t')) {
          // Content line — finalize this blame entry
          lines.push({
            hash: current.hash,
            shortHash: current.hash.substring(0, 7),
            line: current.finalLine,
            author: current.author || 'Unknown',
            authorTime: current.authorTime || 0,
            summary: current.summary || '',
            content: line.substring(1)
          });
          current = null;
        }
      }

      return { success: true, lines };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // === Phase 7: Merge conflict resolution ===

  registerGitHandler('git-merge-conflicts', async (event, repoRoot) => {
    try {
      const output = (await runGit(["diff", "--name-only", "--diff-filter=U", "-z"], {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      }));
      const files = output.split('\0').filter(Boolean);
      return { success: true, files };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  registerGitHandler('git-mark-resolved', async (event, { repoRoot, filePath }) => {
    try {
      (await runGit(['add', '--', ...validatePaths([filePath])], {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      }));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // === Phase 8: Gutter change indicators ===

  /**
   * Get line-level diff for a file (for gutter indicators)
   * Returns arrays of added, modified, and deleted line ranges
   */
  registerGitHandler('git-diff-lines', async (event, { repoRoot, filePath }) => {
    try {
      let diff;
      try {
        diff = (await runGit(['diff', '-U0', '--', ...validatePaths([filePath])], {
          cwd: repoRoot, encoding: 'utf8', timeout: 15000
        }));
      } catch (e) {
        // File might be untracked
        return { success: true, added: [], modified: [], deleted: [] };
      }

      if (!diff.trim()) {
        return { success: true, added: [], modified: [], deleted: [] };
      }

      const added = [];
      const modified = [];
      const deleted = [];

      // Parse unified diff hunk headers: @@ -oldStart[,oldCount] +newStart[,newCount] @@
      const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
      let match;
      while ((match = hunkRegex.exec(diff)) !== null) {
        const oldCount = parseInt(match[2] || '1', 10);
        const newStart = parseInt(match[3], 10);
        const newCount = parseInt(match[4] || '1', 10);

        if (oldCount === 0 && newCount > 0) {
          // Pure addition
          added.push({ start: newStart, count: newCount });
        } else if (newCount === 0 && oldCount > 0) {
          // Pure deletion (show marker at the line after)
          deleted.push({ line: newStart });
        } else {
          // Modification
          modified.push({ start: newStart, count: newCount });
        }
      }

      return { success: true, added, modified, deleted };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // === Phase 9: Hunk staging ===

  /**
   * Get raw diff split into hunks for a file
   */
  registerGitHandler('git-diff-hunks', async (event, { repoRoot, filePath }) => {
    try {
      const diff = (await runGit(['diff', '--', ...validatePaths([filePath])], {
        cwd: repoRoot, encoding: 'utf8', timeout: 15000
      }));

      if (!diff.trim()) {
        return { success: true, hunks: [] };
      }

      // Split into hunks
      const lines = diff.split('\n');
      const hunks = [];
      let headerLines = [];
      let currentHunk = null;

      for (const line of lines) {
        if (line.startsWith('diff ') || line.startsWith('index ') ||
            line.startsWith('--- ') || line.startsWith('+++ ')) {
          headerLines.push(line);
          continue;
        }
        if (line.startsWith('@@')) {
          if (currentHunk) hunks.push(currentHunk);
          const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
          currentHunk = {
            header: line,
            oldStart: hunkMatch ? parseInt(hunkMatch[1]) : 0,
            newStart: hunkMatch ? parseInt(hunkMatch[3]) : 0,
            context: hunkMatch ? hunkMatch[5]?.trim() || '' : '',
            lines: [line]
          };
        } else if (currentHunk) {
          currentHunk.lines.push(line);
        }
      }
      if (currentHunk) hunks.push(currentHunk);

      return { success: true, hunks, fileHeader: headerLines.join('\n') };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Stage a single hunk by applying a partial patch
   */
  registerGitHandler('git-stage-hunk', async (event, { repoRoot, patch }) => {
    if (typeof patch !== 'string' || !patch.trim()) throw new Error('A patch is required.');
    await runGit(['apply', '--cached', '-'], { cwd: repoRoot, timeout: 15000, input: patch });
    return { success: true };
  });

  // === Phase 10: Cherry-pick, tags, remotes ===

  registerGitHandler('git-cherry-pick', async (event, { repoRoot, hash }) => {
    try {
      const output = (await runGit(['cherry-pick', validateRef(hash)], {
        cwd: repoRoot, encoding: 'utf8', timeout: 30000
      }));
      return { success: true, output: output.trim() };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  // --- Tags ---

  registerGitHandler('git-list-tags', async (event, repoRoot) => {
    try {
      const output = (await runGit(["tag", "-l", "--sort=-version:refname", "--format=%(refname:short)%09%(objecttype)%09%(creatordate:relative)%09%(subject)"], {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      }));
      const tags = output.split('\n').filter(l => l.trim()).map(line => {
        const parts = line.split('\t');
        return {
          name: parts[0] || '',
          type: parts[1] === 'tag' ? 'annotated' : 'lightweight',
          date: parts[2] || '',
          message: parts[3] || ''
        };
      });
      return { success: true, tags };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  registerGitHandler('git-create-tag', async (event, { repoRoot, name, message, annotated }) => {
    try {
      const cmd = ['tag', ...(annotated && message ? ['-a', '-m', message] : []), validateRef(name)];
      (await runGit(cmd, { cwd: repoRoot, encoding: 'utf8', timeout: 10000 }));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  registerGitHandler('git-delete-tag', async (event, { repoRoot, name }) => {
    try {
      (await runGit(['tag', '-d', validateRef(name)], {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      }));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  registerGitHandler('git-push-tags', async (event, repoRoot) => {
    try {
      (await runGit(["push", "--tags"], {
        cwd: repoRoot, encoding: 'utf8', timeout: 30000
      }));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  // --- Remotes ---

  registerGitHandler('git-list-remotes', async (event, repoRoot) => {
    try {
      const output = (await runGit(["remote", "-v"], {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      }));
      const remotes = {};
      for (const line of output.split('\n').filter(l => l.trim())) {
        const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)/);
        if (match) {
          if (!remotes[match[1]]) remotes[match[1]] = {};
          remotes[match[1]][match[3]] = match[2];
          remotes[match[1]].name = match[1];
        }
      }
      return { success: true, remotes: Object.values(remotes) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  registerGitHandler('git-add-remote', async (event, { repoRoot, name, url }) => {
    try {
      (await runGit(['remote', 'add', validateRef(name), validateRef(url)], {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      }));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  registerGitHandler('git-remove-remote', async (event, { repoRoot, name }) => {
    try {
      (await runGit(['remote', 'remove', validateRef(name)], {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      }));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  registerGitHandler('git-push-to-remote', async (event, { repoRoot, remote, branch, setUpstream }) => {
    try {
      (await runGit(['push', ...(setUpstream ? ['-u'] : []), '--', validateRef(remote), validateRef(branch)], {
        cwd: repoRoot, encoding: 'utf8', timeout: 60000
      }));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  // --- Graph log ---

  registerGitHandler('git-log-graph', async (event, { repoRoot, limit }) => {
    const n = Math.min(200, Math.max(1, Number(limit) || 50));
    const output = await runGit(['log', '--all', '--graph', '--format=%x1e%H%x1f%h%x1f%an%x1f%ar%x1f%s%x1f%D', `-${n}`], { cwd: repoRoot });
    const entries = output.split('\n').filter(line => line.includes('\x1e')).map(line => {
      const marker = line.indexOf('\x1e');
      const [hash, shortHash, author, relativeTime, message, refs] = line.slice(marker + 1).split('\x1f');
      return { graph: line.slice(0, marker), hash, shortHash, author, relativeTime, message, refs };
    });
    return { success: true, entries };
  });

  debug('Registered git handlers');
}

module.exports = { register };

// === Git IPC Handlers ===
// Handles git operations for publishing folders to repositories

const { ipcMain } = require('electron');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createDebugLogger } = require('./logging');
const { createRuntimeWorkspaceResolver } = require('./runtimeWorkspace');

function register(deps) {
  const debug = createDebugLogger('GitHandlers');
  debug('Registering git handlers...');
  const getWorkingDirectory = createRuntimeWorkspaceResolver(deps || {});

  /**
   * Find git repository root from any subfolder
   * Traverses up directory tree to find .git directory
   */
  ipcMain.handle('git-find-repo', async (event, folderPath) => {
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
  ipcMain.handle('git-status', async (event, { repoRoot, subfolder }) => {
    try {
      debug(`[GitHandlers] Getting git status for repo: ${repoRoot}, subfolder: ${subfolder || '.'}`);

      // Get status in porcelain format for easy parsing
      const statusOutput = execSync('git status --porcelain', {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 10000
      });

      // Parse status output
      const changes = [];
      const lines = statusOutput.split('\n').filter(line => line.trim());

      for (const line of lines) {
        const status = line.substring(0, 2);
        const file = line.substring(3);

        // Filter to subfolder if specified
        if (subfolder && subfolder !== '.') {
          if (!file.startsWith(subfolder + '/') && !file.startsWith(subfolder + path.sep)) {
            continue;
          }
        }

        // Map status codes to human-readable labels
        let statusLabel = 'modified';
        if (status.includes('?')) statusLabel = 'untracked';
        else if (status.includes('A')) statusLabel = 'added';
        else if (status.includes('D')) statusLabel = 'deleted';
        else if (status.includes('R')) statusLabel = 'renamed';
        else if (status.includes('M')) statusLabel = 'modified';

        changes.push({ file, status: statusLabel, statusCode: status.trim() });
      }

      debug(`[GitHandlers] Found ${changes.length} changes`);
      return { success: true, changes };
    } catch (error) {
      console.error('[GitHandlers] Error getting git status:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Publish changes: stage, commit, and push
   */
  ipcMain.handle('git-publish', async (event, { repoRoot, subfolder, message }) => {
    try {
      debug(`[GitHandlers] Publishing to git: ${repoRoot}, subfolder: ${subfolder || '.'}`);

      // Sanitize commit message - escape double quotes
      const safeMessage = message.replace(/"/g, '\\"');

      // Determine what to add - subfolder or all
      const addPath = subfolder && subfolder !== '.' ? `"${subfolder}"` : '.';

      // Stage changes
      debug(`[GitHandlers] Staging: git add ${addPath}`);
      execSync(`git add ${addPath}`, {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 30000
      });

      // Commit
      debug(`[GitHandlers] Committing with message: ${message.substring(0, 50)}...`);
      const commitOutput = execSync(`git commit -m "${safeMessage}"`, {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 30000
      });

      // Extract commit hash from output
      const hashMatch = commitOutput.match(/\[[\w-]+ ([a-f0-9]+)\]/);
      const commitHash = hashMatch ? hashMatch[1] : 'unknown';

      // Push
      debug('[GitHandlers] Pushing to remote...');
      execSync('git push', {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 60000
      });

      debug(`[GitHandlers] Published successfully, commit: ${commitHash}`);
      return { success: true, commitHash };
    } catch (error) {
      console.error('[GitHandlers] Error publishing:', error);

      // Provide more helpful error messages
      let errorMessage = error.message;
      if (error.stderr) {
        errorMessage = error.stderr;
      }
      if (errorMessage.includes('nothing to commit')) {
        errorMessage = 'No changes to commit';
      } else if (errorMessage.includes('failed to push')) {
        errorMessage = 'Failed to push. Check your network connection and authentication.';
      }

      return { success: false, error: errorMessage };
    }
  });

  /**
   * Get current branch name
   */
  ipcMain.handle('git-get-branch', async (event, repoRoot) => {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 5000
      }).trim();

      return { success: true, branch };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get quick status summary (counts of changes)
   */
  ipcMain.handle('git-status-summary', async (event, repoRoot) => {
    try {
      // Get status in porcelain format
      const statusOutput = execSync('git status --porcelain', {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 10000
      });

      const lines = statusOutput.split('\n').filter(line => line.trim());

      let staged = 0;
      let modified = 0;
      let untracked = 0;

      for (const line of lines) {
        const index = line[0];
        const worktree = line[1];

        if (index === '?' && worktree === '?') {
          untracked++;
        } else {
          if (index !== ' ' && index !== '?') {
            staged++;
          }
          if (worktree !== ' ' && worktree !== '?') {
            modified++;
          }
        }
      }

      // Check ahead/behind counts
      let ahead = 0;
      let behind = 0;
      try {
        const aheadOutput = execSync('git rev-list --count @{u}..HEAD', {
          cwd: repoRoot,
          encoding: 'utf8',
          timeout: 5000
        }).trim();
        ahead = parseInt(aheadOutput, 10) || 0;
        const behindOutput = execSync('git rev-list --count HEAD..@{u}', {
          cwd: repoRoot,
          encoding: 'utf8',
          timeout: 5000
        }).trim();
        behind = parseInt(behindOutput, 10) || 0;
      } catch (e) {
        // No upstream configured or other error - ignore
      }

      return {
        success: true,
        staged,
        modified,
        untracked,
        total: lines.length,
        ahead,
        behind,
        clean: lines.length === 0 && ahead === 0
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // === Phase 1: Detailed status, stage, unstage, discard, commit-only ===

  /**
   * Get detailed status split into staged vs unstaged
   */
  ipcMain.handle('git-status-detailed', async (event, repoRoot) => {
    try {
      const statusOutput = execSync('git status --porcelain', {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      });
      const lines = statusOutput.split('\n').filter(l => l.length >= 3);
      const staged = [];
      const unstaged = [];

      for (const line of lines) {
        const idx = line[0];   // index column
        const wt = line[1];    // worktree column
        const filePath = line.substring(3);

        // Determine status label from a status char
        const label = (ch) => {
          if (ch === 'M') return 'modified';
          if (ch === 'A') return 'added';
          if (ch === 'D') return 'deleted';
          if (ch === 'R') return 'renamed';
          if (ch === 'C') return 'copied';
          if (ch === '?') return 'untracked';
          return 'modified';
        };

        // Staged changes (index column has a non-space, non-? char)
        if (idx !== ' ' && idx !== '?') {
          staged.push({ file: filePath, status: label(idx), statusCode: idx });
        }
        // Unstaged changes (worktree column has a non-space char, or untracked)
        if (wt !== ' ' || (idx === '?' && wt === '?')) {
          const st = (idx === '?' && wt === '?') ? 'untracked' : label(wt);
          unstaged.push({ file: filePath, status: st, statusCode: (idx === '?' ? '??' : wt) });
        }
      }

      return { success: true, staged, unstaged };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Stage files
   */
  ipcMain.handle('git-stage', async (event, { repoRoot, paths }) => {
    try {
      const safePaths = paths.map(p => `"${p.replace(/"/g, '\\"')}"`).join(' ');
      execSync(`git add -- ${safePaths}`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 15000
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Unstage files
   */
  ipcMain.handle('git-unstage', async (event, { repoRoot, paths }) => {
    try {
      const safePaths = paths.map(p => `"${p.replace(/"/g, '\\"')}"`).join(' ');
      execSync(`git reset HEAD -- ${safePaths}`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 15000
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Discard changes in working tree
   */
  ipcMain.handle('git-discard', async (event, { repoRoot, paths, untracked }) => {
    try {
      const safePaths = paths.map(p => `"${p.replace(/"/g, '\\"')}"`).join(' ');
      if (untracked) {
        execSync(`git clean -f -- ${safePaths}`, {
          cwd: repoRoot, encoding: 'utf8', timeout: 15000
        });
      } else {
        execSync(`git checkout -- ${safePaths}`, {
          cwd: repoRoot, encoding: 'utf8', timeout: 15000
        });
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Commit only (no push) — separate from git-publish
   */
  ipcMain.handle('git-commit', async (event, { repoRoot, message, amend }) => {
    try {
      const safeMessage = message.replace(/"/g, '\\"');
      const amendFlag = amend ? '--amend ' : '';
      const output = execSync(`git commit ${amendFlag}-m "${safeMessage}"`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 30000
      });
      const hashMatch = output.match(/\[[\w-]+ ([a-f0-9]+)\]/);
      return { success: true, commitHash: hashMatch ? hashMatch[1] : 'unknown' };
    } catch (error) {
      let msg = error.stderr || error.message;
      if (msg.includes('nothing to commit')) msg = 'Nothing to commit';
      return { success: false, error: msg };
    }
  });

  /**
   * Push to remote
   */
  ipcMain.handle('git-push', async (event, repoRoot) => {
    try {
      execSync('git push', {
        cwd: repoRoot, encoding: 'utf8', timeout: 60000
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  // === Phase 2: Diff viewer ===

  /**
   * Get diff for a file (staged or unstaged)
   */
  ipcMain.handle('git-diff', async (event, { repoRoot, filePath, cached }) => {
    try {
      const cacheFlag = cached ? '--cached ' : '';
      const safePath = `"${filePath.replace(/"/g, '\\"')}"`;
      const diff = execSync(`git diff ${cacheFlag}-- ${safePath}`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 15000
      });
      return { success: true, diff };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get file content at a specific ref (e.g. HEAD)
   */
  ipcMain.handle('git-file-content', async (event, { repoRoot, ref, filePath }) => {
    try {
      const content = execSync(`git show ${ref}:"${filePath.replace(/"/g, '\\"')}"`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      });
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
  ipcMain.handle('git-list-branches', async (event, repoRoot) => {
    try {
      const localOut = execSync('git branch --format="%(refname:short)"', {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      });
      const local = localOut.split('\n').filter(b => b.trim());

      let remote = [];
      try {
        const remoteOut = execSync('git branch -r --format="%(refname:short)"', {
          cwd: repoRoot, encoding: 'utf8', timeout: 10000
        });
        remote = remoteOut.split('\n')
          .filter(b => b.trim() && !b.includes('HEAD'))
          .map(b => b.replace(/^origin\//, ''));
      } catch (e) { /* no remote */ }

      const current = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: repoRoot, encoding: 'utf8', timeout: 5000
      }).trim();

      return { success: true, local, remote, current };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Switch branch (or create with -c)
   */
  ipcMain.handle('git-switch-branch', async (event, { repoRoot, branch, create }) => {
    try {
      const flag = create ? '-c ' : '';
      execSync(`git switch ${flag}"${branch.replace(/"/g, '\\"')}"`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 15000
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  /**
   * Fetch and pull
   */
  ipcMain.handle('git-pull', async (event, repoRoot) => {
    try {
      execSync('git fetch --prune', {
        cwd: repoRoot, encoding: 'utf8', timeout: 30000
      });
      const output = execSync('git pull', {
        cwd: repoRoot, encoding: 'utf8', timeout: 30000
      });
      return { success: true, output: output.trim() };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  /**
   * Fetch only (for behind count)
   */
  ipcMain.handle('git-fetch', async (event, repoRoot) => {
    try {
      execSync('git fetch --prune', {
        cwd: repoRoot, encoding: 'utf8', timeout: 30000
      });
      // Get behind count
      let behind = 0;
      try {
        const behindOut = execSync('git rev-list --count HEAD..@{u}', {
          cwd: repoRoot, encoding: 'utf8', timeout: 5000
        }).trim();
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
  ipcMain.handle('git-log', async (event, { repoRoot, limit }) => {
    try {
      const n = limit || 50;
      const fmt = '--pretty=format:%H%n%h%n%an%n%ar%n%s%n---COMMIT_END---';
      const output = execSync(`git log -${n} ${fmt}`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 15000
      });
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
  ipcMain.handle('git-show', async (event, { repoRoot, hash }) => {
    try {
      const output = execSync(`git show --stat --format="%H%n%an%n%ae%n%ar%n%s%n%b%n---BODY_END---" "${hash}"`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 15000
      });
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
  ipcMain.handle('git-diff-commit', async (event, { repoRoot, hash, filePath }) => {
    try {
      const diff = execSync(`git diff "${hash}^".."${hash}" -- "${filePath.replace(/"/g, '\\"')}"`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 15000
      });
      return { success: true, diff };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // === Phase 5: Stash ===

  ipcMain.handle('git-stash-list', async (event, repoRoot) => {
    try {
      const output = execSync('git stash list --format="%gd%n%s%n%ar%n---STASH_END---"', {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      });
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

  ipcMain.handle('git-stash-save', async (event, { repoRoot, message }) => {
    try {
      const safeMsg = message ? `"${message.replace(/"/g, '\\"')}"` : '';
      const cmd = message ? `git stash push -m ${safeMsg}` : 'git stash push';
      execSync(cmd, { cwd: repoRoot, encoding: 'utf8', timeout: 15000 });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  ipcMain.handle('git-stash-apply', async (event, { repoRoot, ref, drop }) => {
    try {
      const cmd = drop ? `git stash pop "${ref}"` : `git stash apply "${ref}"`;
      execSync(cmd, { cwd: repoRoot, encoding: 'utf8', timeout: 15000 });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  ipcMain.handle('git-stash-drop', async (event, { repoRoot, ref }) => {
    try {
      execSync(`git stash drop "${ref}"`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  // === Phase 6: Blame ===

  ipcMain.handle('git-blame', async (event, { repoRoot, filePath }) => {
    try {
      const output = execSync(`git blame --porcelain "${filePath.replace(/"/g, '\\"')}"`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 30000
      });
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

  ipcMain.handle('git-merge-conflicts', async (event, repoRoot) => {
    try {
      const output = execSync('git diff --name-only --diff-filter=U', {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      });
      const files = output.split('\n').filter(f => f.trim());
      return { success: true, files };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('git-mark-resolved', async (event, { repoRoot, filePath }) => {
    try {
      execSync(`git add "${filePath.replace(/"/g, '\\"')}"`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      });
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
  ipcMain.handle('git-diff-lines', async (event, { repoRoot, filePath }) => {
    try {
      const safePath = `"${filePath.replace(/"/g, '\\"')}"`;
      let diff;
      try {
        diff = execSync(`git diff -U0 -- ${safePath}`, {
          cwd: repoRoot, encoding: 'utf8', timeout: 15000
        });
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
  ipcMain.handle('git-diff-hunks', async (event, { repoRoot, filePath }) => {
    try {
      const safePath = `"${filePath.replace(/"/g, '\\"')}"`;
      const diff = execSync(`git diff -- ${safePath}`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 15000
      });

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
  ipcMain.handle('git-stage-hunk', async (event, { repoRoot, patch }) => {
    try {
      // Write patch to temp file and apply
      const tmpPath = path.join(repoRoot, '.git', 'tmp-hunk-patch');
      fs.writeFileSync(tmpPath, patch, 'utf8');
      try {
        execSync(`git apply --cached "${tmpPath}"`, {
          cwd: repoRoot, encoding: 'utf8', timeout: 15000
        });
      } finally {
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  // === Phase 10: Cherry-pick, tags, remotes ===

  ipcMain.handle('git-cherry-pick', async (event, { repoRoot, hash }) => {
    try {
      const output = execSync(`git cherry-pick "${hash}"`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 30000
      });
      return { success: true, output: output.trim() };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  // --- Tags ---

  ipcMain.handle('git-list-tags', async (event, repoRoot) => {
    try {
      const output = execSync('git tag -l --sort=-version:refname --format="%(refname:short)%09%(objecttype)%09%(creatordate:relative)%09%(subject)"', {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      });
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

  ipcMain.handle('git-create-tag', async (event, { repoRoot, name, message, annotated }) => {
    try {
      const safeName = name.replace(/"/g, '\\"');
      let cmd;
      if (annotated && message) {
        const safeMsg = message.replace(/"/g, '\\"');
        cmd = `git tag -a "${safeName}" -m "${safeMsg}"`;
      } else {
        cmd = `git tag "${safeName}"`;
      }
      execSync(cmd, { cwd: repoRoot, encoding: 'utf8', timeout: 10000 });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  ipcMain.handle('git-delete-tag', async (event, { repoRoot, name }) => {
    try {
      execSync(`git tag -d "${name.replace(/"/g, '\\"')}"`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  ipcMain.handle('git-push-tags', async (event, repoRoot) => {
    try {
      execSync('git push --tags', {
        cwd: repoRoot, encoding: 'utf8', timeout: 30000
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  // --- Remotes ---

  ipcMain.handle('git-list-remotes', async (event, repoRoot) => {
    try {
      const output = execSync('git remote -v', {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      });
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

  ipcMain.handle('git-add-remote', async (event, { repoRoot, name, url }) => {
    try {
      const safeName = name.replace(/"/g, '\\"');
      const safeUrl = url.replace(/"/g, '\\"');
      execSync(`git remote add "${safeName}" "${safeUrl}"`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  ipcMain.handle('git-remove-remote', async (event, { repoRoot, name }) => {
    try {
      execSync(`git remote remove "${name.replace(/"/g, '\\"')}"`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 10000
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  ipcMain.handle('git-push-to-remote', async (event, { repoRoot, remote, branch, setUpstream }) => {
    try {
      const upstreamFlag = setUpstream ? '-u ' : '';
      const safeBranch = branch.replace(/"/g, '\\"');
      const safeRemote = remote.replace(/"/g, '\\"');
      execSync(`git push ${upstreamFlag}"${safeRemote}" "${safeBranch}"`, {
        cwd: repoRoot, encoding: 'utf8', timeout: 60000
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.stderr || error.message };
    }
  });

  // --- Graph log ---

  ipcMain.handle('git-log-graph', async (event, { repoRoot, limit }) => {
    try {
      const n = limit || 50;
      const output = execSync(
        `git log --all --graph --format="%H%n%h%n%an%n%ar%n%s%n%D%n---ENTRY_END---" -${n}`,
        { cwd: repoRoot, encoding: 'utf8', timeout: 15000 }
      );

      const lines = output.split('\n');
      const entries = [];
      let graphLines = [];
      let dataLines = [];
      let collectingData = false;

      for (const line of lines) {
        if (line.includes('---ENTRY_END---')) {
          // Parse the accumulated data
          if (dataLines.length >= 5) {
            entries.push({
              graph: graphLines.join('\n'),
              hash: dataLines[0],
              shortHash: dataLines[1],
              author: dataLines[2],
              relativeTime: dataLines[3],
              message: dataLines[4],
              refs: dataLines[5] || ''
            });
          }
          graphLines = [];
          dataLines = [];
          collectingData = false;
          continue;
        }

        // Split graph decoration from data
        // Graph chars: | / \ * _ space
        const graphMatch = line.match(/^([|/\\_* ]+?)([0-9a-f]{40}|[0-9a-f]{7,}|.*)$/);
        if (!collectingData && graphMatch && /^[0-9a-f]{40}$/.test(graphMatch[2])) {
          graphLines.push(graphMatch[1]);
          dataLines.push(graphMatch[2]);
          collectingData = true;
        } else if (collectingData) {
          // Remaining lines of format block: strip graph prefix
          const prefix = line.match(/^([|/\\_* ]+)/);
          const content = prefix ? line.substring(prefix[1].length) : line;
          dataLines.push(content);
          if (prefix) graphLines.push(prefix[1]);
        } else {
          graphLines.push(line);
        }
      }

      return { success: true, entries };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  debug('Registered git handlers');
}

module.exports = { register };

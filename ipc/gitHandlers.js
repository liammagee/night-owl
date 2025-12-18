// === Git IPC Handlers ===
// Handles git operations for publishing folders to repositories

const { ipcMain } = require('electron');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function register(deps) {
  console.log('[GitHandlers] Registering git handlers...');

  /**
   * Find git repository root from any subfolder
   * Traverses up directory tree to find .git directory
   */
  ipcMain.handle('git-find-repo', async (event, folderPath) => {
    try {
      console.log(`[GitHandlers] Finding git repo for: ${folderPath}`);

      let currentPath = folderPath;
      const originalPath = folderPath;

      // Traverse up to find .git directory
      while (currentPath !== path.dirname(currentPath)) {
        const gitPath = path.join(currentPath, '.git');
        if (fs.existsSync(gitPath)) {
          const isSubfolder = currentPath !== originalPath;
          const relativePath = isSubfolder ? path.relative(currentPath, originalPath) : '.';

          console.log(`[GitHandlers] Found git repo at: ${currentPath}, subfolder: ${relativePath}`);
          return {
            success: true,
            repoRoot: currentPath,
            isSubfolder,
            relativePath
          };
        }
        currentPath = path.dirname(currentPath);
      }

      console.log(`[GitHandlers] No git repo found for: ${folderPath}`);
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
      console.log(`[GitHandlers] Getting git status for repo: ${repoRoot}, subfolder: ${subfolder || '.'}`);

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

      console.log(`[GitHandlers] Found ${changes.length} changes`);
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
      console.log(`[GitHandlers] Publishing to git: ${repoRoot}, subfolder: ${subfolder || '.'}`);

      // Sanitize commit message - escape double quotes
      const safeMessage = message.replace(/"/g, '\\"');

      // Determine what to add - subfolder or all
      const addPath = subfolder && subfolder !== '.' ? `"${subfolder}"` : '.';

      // Stage changes
      console.log(`[GitHandlers] Staging: git add ${addPath}`);
      execSync(`git add ${addPath}`, {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 30000
      });

      // Commit
      console.log(`[GitHandlers] Committing with message: ${message.substring(0, 50)}...`);
      const commitOutput = execSync(`git commit -m "${safeMessage}"`, {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 30000
      });

      // Extract commit hash from output
      const hashMatch = commitOutput.match(/\[[\w-]+ ([a-f0-9]+)\]/);
      const commitHash = hashMatch ? hashMatch[1] : 'unknown';

      // Push
      console.log('[GitHandlers] Pushing to remote...');
      execSync('git push', {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 60000
      });

      console.log(`[GitHandlers] Published successfully, commit: ${commitHash}`);
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

  console.log('[GitHandlers] Registered 3 git handlers');
}

module.exports = { register };

// === Search IPC Handlers ===
// Handles all search and replace related IPC communication

const { ipcMain } = require('electron');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const {
  createRuntimeWorkspaceResolver,
  pathExists
} = require('./runtimeWorkspace');
const { createDebugLogger } = require('./logging');
const workspaceIndexHandlers = require('./workspaceIndexHandlers');
const { resolvePathWithinRoots, isPathInsideRoot } = require('./pathGuards');
const { guardedWriteFile } = require('../services/fileWrites');
const { planReplacements } = require('../services/searchReplace');

/**
 * Register all search IPC handlers
 * @param {Object} deps - Dependencies from main.js
 */
function register(deps) {
  const {
    appSettings,
    currentWorkingDirectory,
    getCurrentWorkingDirectory
  } = deps;

  // Utility functions
  function getLinePreview(lines, lineIndex, contextLines) {
    const start = Math.max(0, lineIndex - contextLines);
    const end = Math.min(lines.length, lineIndex + contextLines + 1);
    return lines.slice(start, end).map((line, idx) => ({
      line: start + idx + 1,
      text: line,
      isMatch: start + idx === lineIndex
    }));
  }

  /**
   * Convert a glob pattern to a regex for filename matching
   * Supports: *.ext, file*, *pattern*, file.ext
   */
  function globToRegex(pattern) {
    // Escape regex special chars except * and ?
    let regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regexStr}$`, 'i');
  }

  /**
   * Check if a query looks like a file pattern search
   */
  function isFilePatternQuery(query) {
    // Patterns that indicate file search: *.ext, file.*, *name*
    return /^\*\.[a-zA-Z0-9]+$/.test(query) ||  // *.bib, *.md
           /^[^*]+\.\*$/.test(query) ||          // file.*
           /^\*[^*]+\*$/.test(query) ||          // *pattern*
           /^\*[^*]+$/.test(query) ||            // *suffix
           /^[^*]+\*$/.test(query);              // prefix*
  }

  const getWorkingDirectory = createRuntimeWorkspaceResolver({
    appSettings,
    currentWorkingDirectory,
    getCurrentWorkingDirectory
  });
  const debug = createDebugLogger('SearchHandlers');

  function normalizeFilePatternQuery(query) {
    let normalized = String(query || '').trim();
    const quoteMatch = normalized.match(/^(['"])(.*)\1$/);
    if (quoteMatch) {
      normalized = quoteMatch[2].trim();
    }
    return normalized;
  }

  /**
   * Search for files by name pattern (glob-style)
   */
  async function searchFilesByPattern(dir, pattern, maxResults = 100) {
    const files = [];
    const regex = globToRegex(pattern);

    async function scanDirectory(currentDir) {
      if (files.length >= maxResults) return;

      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          if (files.length >= maxResults) break;

          const fullPath = path.join(currentDir, entry.name);

          if (entry.isDirectory()) {
            // Skip hidden directories, node_modules, .git
            if (!entry.name.startsWith('.') &&
                entry.name !== 'node_modules' &&
                entry.name !== '__pycache__') {
              await scanDirectory(fullPath);
            }
          } else if (entry.isFile()) {
            // Check if filename matches the pattern
            if (regex.test(entry.name)) {
              files.push({
                path: fullPath,
                name: entry.name,
                relativePath: path.relative(dir, fullPath)
              });
            }
          }
        }
      } catch (error) {
        console.warn(`[SearchHandlers] Could not scan directory ${currentDir}:`, error.message);
      }
    }

    await scanDirectory(dir);
    return files;
  }

  async function getSearchableFiles(dir) {
    const files = [];
    const searchableExtensions = ['.md', '.markdown', '.txt', '.text'];

    async function scanDirectory(currentDir) {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);

          if (entry.isDirectory()) {
            // Skip hidden directories, node_modules, .git
            if (!entry.name.startsWith('.') &&
                entry.name !== 'node_modules' &&
                entry.name !== '__pycache__') {
              await scanDirectory(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (searchableExtensions.includes(ext)) {
              files.push({ path: fullPath, name: entry.name });
            }
          }
        }
      } catch (error) {
        console.warn(`[SearchHandlers] Could not scan directory ${currentDir}:`, error.message);
      }
    }

    await scanDirectory(dir);
    return files;
  }

  async function performGlobalSearch(query, workingDir, options = {}) {
    const {
      caseSensitive = false,
      wholeWord = false,
      useRegex = false,
      filePattern = '*.{md,markdown,txt}',
      maxResults = 500
    } = options;

    const results = [];
    
    try {
      // Create search pattern
      let searchPattern;
      if (useRegex) {
        try {
          searchPattern = new RegExp(query, caseSensitive ? 'gm' : 'gim');
        } catch (error) {
          throw new Error(`Invalid regex pattern: ${error.message}`);
        }
      } else {
        // Escape special regex characters for literal search
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wordBoundary = wholeWord ? '\\b' : '';
        const flags = caseSensitive ? 'gm' : 'gim';
        searchPattern = new RegExp(`${wordBoundary}${escapedQuery}${wordBoundary}`, flags);
      }

      // Get all markdown and text files recursively
      const filter = filePattern && filePattern !== '*.{md,markdown,txt}' ? globToRegex(filePattern) : null;
      const files = (await getSearchableFiles(workingDir)).filter(file =>
        !filter || filter.test(file.name) || filter.test(path.relative(workingDir, file.path)));
      
      for (const file of files) {
        if (results.length >= maxResults) break;
        
        try {
          const content = await fs.readFile(file.path, 'utf8');
          const lines = content.split('\n');
          
          lines.forEach((line, lineIndex) => {
            if (results.length >= maxResults) return;
            
            const matches = [...line.matchAll(searchPattern)];
            matches.forEach(match => {
              if (results.length >= maxResults) return;
              
              results.push({
                file: file.path,
                fileName: path.basename(file.path),
                line: lineIndex + 1,
                column: match.index + 1,
                text: line.trim(),
                match: match[0],
                preview: getLinePreview(lines, lineIndex, 2)
              });
            });
          });
        } catch (error) {
          console.warn(`[SearchHandlers] Could not search file ${file.path}:`, error.message);
        }
      }
      
      debug(`Global search found ${results.length} matches in ${files.length} files`);
      return results;
      
    } catch (error) {
      console.error('[SearchHandlers] Error in performGlobalSearch:', error);
      throw error;
    }
  }

  async function performGlobalReplace(searchQuery, replaceText, searchResults, options = {}) {
    const { previewOnly = false } = options;

    debug(`[SearchHandlers] Performing global replace ${previewOnly ? '(preview)' : '(execute)'}`);
    
    const roots = [getWorkingDirectory(), ...(appSettings.workspaceFolders || [])];
    const canonicalRoots = (await Promise.all(roots.map(root => fs.realpath(root).catch(() => null)))).filter(Boolean);
    const fileGroups = new Map();
    for (const result of searchResults) {
      const resolved = resolvePathWithinRoots(result.file, roots);
      if (!resolved.success) throw new Error(resolved.error);
      const canonical = await fs.realpath(resolved.path);
      if (!canonicalRoots.some(root => isPathInsideRoot(canonical, root))) {
        throw new Error('Replacement target must stay inside a workspace folder');
      }
      if (!fileGroups.has(canonical)) fileGroups.set(canonical, []);
      fileGroups.get(canonical).push(result);
    }

    const results = [];
    const errors = [];
    const modifiedFilePaths = [];
    let totalReplacements = 0;
    for (const [filePath, fileResults] of fileGroups) {
      try {
        const originalContent = await fs.readFile(filePath, 'utf8');
        const plan = planReplacements(originalContent, searchQuery, replaceText, fileResults, options);
        if (!previewOnly && plan.content !== originalContent) {
          const saved = await guardedWriteFile(filePath, plan.content, { expectedContent: originalContent });
          if (!saved.success) throw new Error(saved.error);
          modifiedFilePaths.push(...new Set(fileResults.map(result => path.resolve(result.file))));
        }
        totalReplacements += plan.count;
        results.push(...plan.results.map(result => ({ ...result, file: fileResults[0].file, fileName: path.basename(fileResults[0].file) })));
      } catch (error) {
        errors.push({ file: filePath, error: error.message });
      }
    }
    return {
      success: errors.length === 0,
      error: errors.length ? errors.map(item => `${item.file}: ${item.error}`).join('\n') : undefined,
      errors,
      matchCount: totalReplacements,
      modifiedFiles: modifiedFilePaths.length,
      results,
      preview: previewOnly,
      replacedCount: totalReplacements,
      modifiedFilePaths
    };
  }

  // Search handlers
  ipcMain.handle('global-search', async (event, { query, options = {} }) => {
    try {
      const workingDir = getWorkingDirectory();
      const workspaceFolders = appSettings.workspaceFolders || [];
      const searchQuery = String(query || '').trim();
      const filePatternQuery = normalizeFilePatternQuery(query);

      debug(`Global search for "${searchQuery}" in ${workingDir} and ${workspaceFolders.length} workspace folders`);

      if (searchQuery.length === 0) {
        return { success: false, error: 'Search query is required' };
      }

      if (!pathExists(workingDir)) {
        return { success: false, error: 'Working directory does not exist' };
      }

      // Check if this is a file pattern search (e.g., *.bib, *.md)
      const isPatternSearch = !options.useRegex && isFilePatternQuery(filePatternQuery);

      if (isPatternSearch) {
        debug(`Detected file pattern search: "${filePatternQuery}"`);

        const indexedFiles = await workspaceIndexHandlers.list({ limit: 50000 });
        if (indexedFiles?.success) {
          const pattern = globToRegex(filePatternQuery);
          const fileMatches = indexedFiles.files
            .filter(file => pattern.test(file.name))
            .slice(0, 500)
            .map(file => ({
              path: file.path,
              name: file.name,
              relativePath: file.relativePath,
              sourceFolder: file.root,
              isPrimaryFolder: file.root === workingDir,
              isWorkspaceFolder: file.root !== workingDir,
              format: file.format
            }));
          return {
            success: true,
            results: [],
            fileMatches,
            isFilePatternSearch: true,
            indexed: true,
            indexStatus: indexedFiles.status
          };
        }

        // Search for files by pattern
        let fileMatches = await searchFilesByPattern(workingDir, filePatternQuery, 100);
        fileMatches.forEach(file => {
          file.sourceFolder = workingDir;
          file.isPrimaryFolder = true;
        });

        // Search workspace folders too
        for (const folderPath of workspaceFolders) {
          try {
            if (fsSync.existsSync(folderPath)) {
              const folderMatches = await searchFilesByPattern(folderPath, filePatternQuery, 100);
              folderMatches.forEach(file => {
                file.sourceFolder = folderPath;
                file.isWorkspaceFolder = true;
              });
              fileMatches = fileMatches.concat(folderMatches);
            }
          } catch (folderError) {
            console.error(`[SearchHandlers] Error searching workspace folder ${folderPath}:`, folderError);
          }
        }

        debug(`File pattern search found ${fileMatches.length} matching files`);
        return {
          success: true,
          results: [],  // No content results for file pattern search
          fileMatches: fileMatches,
          isFilePatternSearch: true
        };
      }

      // Regular content search
      const indexedSearch = await workspaceIndexHandlers.search(searchQuery, options);
      if (indexedSearch?.success) {
        indexedSearch.results.forEach(result => {
          result.isPrimaryFolder = result.sourceFolder === workingDir;
          result.isWorkspaceFolder = result.sourceFolder !== workingDir;
        });
        return {
          success: true,
          results: indexedSearch.results,
          indexed: true,
          indexStatus: indexedSearch.status
        };
      }

      let allResults = await performGlobalSearch(searchQuery, workingDir, options);

      // Add source folder info to primary results
      allResults.forEach(result => {
        result.sourceFolder = workingDir;
        result.isPrimaryFolder = true;
      });

      // Search additional workspace folders
      for (const folderPath of workspaceFolders) {
        try {
          if (fsSync.existsSync(folderPath)) {
            const folderResults = await performGlobalSearch(searchQuery, folderPath, options);
            folderResults.forEach(result => {
              result.sourceFolder = folderPath;
              result.isWorkspaceFolder = true;
            });
            allResults = allResults.concat(folderResults);
          }
        } catch (folderError) {
          console.error(`[SearchHandlers] Error searching workspace folder ${folderPath}:`, folderError);
        }
      }

      debug(`Global search found ${allResults.length} total matches across all folders`);
      return { success: true, results: allResults };
    } catch (error) {
      console.error('[SearchHandlers] Error in global search:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('global-replace', async (event, { searchQuery, replaceText, searchResults, options = {} }) => {
    try {
      debug(`[SearchHandlers] Global replace "${searchQuery}" with "${replaceText}"`);
      
      if (typeof searchQuery !== 'string' || !searchQuery || typeof replaceText !== 'string' || !Array.isArray(searchResults)) {
        return { success: false, error: 'Invalid search parameters' };
      }
      
      const result = await performGlobalReplace(searchQuery, replaceText, searchResults, options);
      if (!options.previewOnly && result.modifiedFilePaths?.length) {
        workspaceIndexHandlers.invalidate('global-replace');
      }
      return { success: true, ...result };
    } catch (error) {
      console.error('[SearchHandlers] Error in global replace:', error);
      return { success: false, error: error.message };
    }
  });

  debug('Registered search and replace handlers');
}

module.exports = {
  register
};

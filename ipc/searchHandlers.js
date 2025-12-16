// === Search IPC Handlers ===
// Handles all search and replace related IPC communication

const { ipcMain } = require('electron');
const fs = require('fs').promises;
const path = require('path');

/**
 * Register all search IPC handlers
 * @param {Object} deps - Dependencies from main.js
 */
function register(deps) {
  const {
    appSettings,
    currentWorkingDirectory
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
      const files = await getSearchableFiles(workingDir);
      
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
      
      console.log(`[SearchHandlers] Global search found ${results.length} matches in ${files.length} files`);
      return results;
      
    } catch (error) {
      console.error('[SearchHandlers] Error in performGlobalSearch:', error);
      throw error;
    }
  }

  async function performGlobalReplace(searchQuery, replaceText, searchResults, options = {}) {
    const {
      caseSensitive = false,
      wholeWord = false,
      useRegex = false,
      previewOnly = false
    } = options;

    console.log(`[SearchHandlers] Performing global replace ${previewOnly ? '(preview)' : '(execute)'}`);
    
    // Group search results by file
    const fileGroups = {};
    searchResults.forEach(result => {
      if (!fileGroups[result.file]) {
        fileGroups[result.file] = [];
      }
      fileGroups[result.file].push(result);
    });

    const results = [];
    const modifiedFilePaths = [];
    let totalReplacements = 0;

    for (const [filePath, fileResults] of Object.entries(fileGroups)) {
      try {
        const originalContent = await fs.readFile(filePath, 'utf8');
        const lines = originalContent.split('\n');
        let modifiedLines = [...lines];
        let fileReplacements = 0;
        const fileResults_sorted = fileResults.sort((a, b) => b.line - a.line); // Sort in reverse order

        // Create search pattern
        let searchPattern;
        if (useRegex) {
          try {
            searchPattern = new RegExp(searchQuery, caseSensitive ? 'g' : 'gi');
          } catch (error) {
            throw new Error(`Invalid regex pattern: ${error.message}`);
          }
        } else {
          const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const wordBoundary = wholeWord ? '\\b' : '';
          const flags = caseSensitive ? 'g' : 'gi';
          searchPattern = new RegExp(`${wordBoundary}${escapedQuery}${wordBoundary}`, flags);
        }

        // Process replacements
        for (const result of fileResults_sorted) {
          const lineIndex = result.line - 1;
          if (lineIndex >= 0 && lineIndex < modifiedLines.length) {
            const originalLine = modifiedLines[lineIndex];
            const newLine = originalLine.replace(searchPattern, replaceText);
            
            if (newLine !== originalLine) {
              if (previewOnly) {
                results.push({
                  file: filePath,
                  fileName: path.basename(filePath),
                  line: result.line,
                  originalLine: originalLine,
                  replacedLine: newLine
                });
              } else {
                modifiedLines[lineIndex] = newLine;
              }
              
              fileReplacements++;
              totalReplacements++;
            }
          }
        }

        if (!previewOnly && fileReplacements > 0) {
          const newContent = modifiedLines.join('\n');
          await fs.writeFile(filePath, newContent, 'utf8');
          modifiedFilePaths.push(filePath);
          console.log(`[SearchHandlers] Modified ${filePath} with ${fileReplacements} replacements`);
        }

      } catch (error) {
        console.error(`[SearchHandlers] Error processing file ${filePath}:`, error.message);
        results.push({
          file: filePath,
          error: error.message
        });
      }
    }

    return {
      success: true,
      matchCount: totalReplacements,
      modifiedFiles: modifiedFilePaths.length,
      results: results,
      preview: previewOnly,
      replacedCount: totalReplacements,
      modifiedFilePaths: modifiedFilePaths
    };
  }

  // Search handlers
  ipcMain.handle('global-search', async (event, { query, options = {} }) => {
    try {
      const workingDir = appSettings.workingDirectory || currentWorkingDirectory;
      const workspaceFolders = appSettings.workspaceFolders || [];

      console.log(`[SearchHandlers] Global search for "${query}" in ${workingDir} and ${workspaceFolders.length} workspace folders`);

      if (!query || query.trim().length === 0) {
        return { success: false, error: 'Search query is required' };
      }

      // Search primary working directory
      let allResults = await performGlobalSearch(query, workingDir, options);

      // Add source folder info to primary results
      allResults.forEach(result => {
        result.sourceFolder = workingDir;
        result.isPrimaryFolder = true;
      });

      // Search additional workspace folders
      for (const folderPath of workspaceFolders) {
        try {
          const fsSync = require('fs');
          if (fsSync.existsSync(folderPath)) {
            const folderResults = await performGlobalSearch(query, folderPath, options);
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

      console.log(`[SearchHandlers] Global search found ${allResults.length} total matches across all folders`);
      return { success: true, results: allResults };
    } catch (error) {
      console.error('[SearchHandlers] Error in global search:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('global-replace', async (event, { searchQuery, replaceText, searchResults, options = {} }) => {
    try {
      console.log(`[SearchHandlers] Global replace "${searchQuery}" with "${replaceText}"`);
      
      if (!searchQuery || !searchResults || searchResults.length === 0) {
        return { success: false, error: 'Invalid search parameters' };
      }
      
      const result = await performGlobalReplace(searchQuery, replaceText, searchResults, options);
      return { success: true, ...result };
    } catch (error) {
      console.error('[SearchHandlers] Error in global replace:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[SearchHandlers] Registered search and replace handlers');
}

module.exports = {
  register
};
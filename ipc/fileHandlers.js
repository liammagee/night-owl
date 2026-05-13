// === File System IPC Handlers ===
// Handles all file system operations, directory management, and file I/O

const { ipcMain, dialog, BrowserWindow } = require('electron');
const crypto = require('crypto');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const {
  normalizeWorkspacePath,
  pathsEqual,
  findWorkspaceOverlap,
  describeWorkspaceOverlap,
  sanitizeWorkspaceFolders
} = require('./workspacePaths');
const { createRuntimeWorkspaceResolver } = require('./runtimeWorkspace');
const { createDebugLogger } = require('./logging');
const {
  resolvePathWithinRoots,
  validatePathSegment
} = require('./pathGuards');

const debug = createDebugLogger('FileHandlers');

const SAVE_BACKUP_DIR_NAME = '.nightowl-backups';
const SAVE_CONFLICT_CODE = 'FILE_MODIFIED_EXTERNALLY';

async function statOrNull(filePath, fsApi = fs) {
  try {
    return await fsApi.stat(filePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function hasExternalModification(currentStat, baselineMtimeMs) {
  if (!currentStat || !Number.isFinite(baselineMtimeMs)) return false;
  // Small epsilon handles fs precision differences.
  return Math.abs(currentStat.mtimeMs - baselineMtimeMs) > 1;
}

function buildBackupFilePath(filePath, timestamp = Date.now()) {
  const directory = path.dirname(filePath);
  const backupDir = path.join(directory, SAVE_BACKUP_DIR_NAME);
  const parsed = path.parse(filePath);
  const backupName = `${parsed.name}.${timestamp}${parsed.ext || '.md'}.bak`;
  return path.join(backupDir, backupName);
}

async function createFileBackup(filePath, fsApi = fs) {
  const existingStat = await statOrNull(filePath, fsApi);
  if (!existingStat) return null;

  const backupPath = buildBackupFilePath(filePath);
  await fsApi.mkdir(path.dirname(backupPath), { recursive: true });
  await fsApi.copyFile(filePath, backupPath);
  return backupPath;
}

async function guardedWriteFile(filePath, content, options = {}, context = {}) {
  const fsApi = context.fsApi || fs;
  const fileStateMap = context.fileStateMap || new Map();
  const expectedMtimeMs = Number.isFinite(options.expectedMtimeMs) ? options.expectedMtimeMs : null;
  const force = Boolean(options.force);
  const knownState = fileStateMap.get(filePath);
  const baselineMtimeMs = expectedMtimeMs ?? (knownState ? knownState.mtimeMs : null);
  const currentStat = await statOrNull(filePath, fsApi);

  if (!force && hasExternalModification(currentStat, baselineMtimeMs)) {
    return {
      success: false,
      code: SAVE_CONFLICT_CODE,
      error: 'File has changed on disk since it was opened. Review changes before overwriting.',
      filePath,
      currentMtimeMs: currentStat ? currentStat.mtimeMs : null,
      expectedMtimeMs: baselineMtimeMs
    };
  }

  const backupPath = await createFileBackup(filePath, fsApi);
  await fsApi.writeFile(filePath, content, 'utf8');
  const updatedStat = await statOrNull(filePath, fsApi);
  if (updatedStat) {
    fileStateMap.set(filePath, { mtimeMs: updatedStat.mtimeMs, size: updatedStat.size });
  }

  return {
    success: true,
    filePath,
    backupPath,
    mtimeMs: updatedStat ? updatedStat.mtimeMs : null
  };
}

/**
 * Register all file system IPC handlers
 * @param {Object} deps - Dependencies from main.js
 */
function register(deps) {
  const {
    appSettings,
    saveSettings,
    mainWindow,
    getMainWindow,
    getCurrentFilePath,
    setCurrentFilePath,
    getCurrentWorkingDirectory,
    setCurrentWorkingDirectory,
    currentWorkingDirectory,
    userDataPath
  } = deps;
  const fileStateMap = new Map();
  let currentFileWatcher = null;
  let currentFileWatchPath = null;
  let currentFileWatchTimer = null;
  let lastNotifiedFileStateKey = null;
  const FILE_SCAN_CACHE_TTL_MS = 10000;
  const availableFilesCache = new Map();
  const markdownFilesCache = new Map();

  function cloneFileList(files) {
    return (Array.isArray(files) ? files : []).map(file => {
      if (!file || typeof file !== 'object') return file;
      return {
        ...file,
        modified: file.modified instanceof Date ? new Date(file.modified) : file.modified
      };
    });
  }

  function getCachedFileList(cache, cacheKey) {
    const entry = cache.get(cacheKey);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > FILE_SCAN_CACHE_TTL_MS) {
      cache.delete(cacheKey);
      return null;
    }
    return cloneFileList(entry.files);
  }

  function setCachedFileList(cache, cacheKey, files) {
    cache.set(cacheKey, {
      createdAt: Date.now(),
      files: cloneFileList(files)
    });
  }

  function clearFileScanCaches() {
    availableFilesCache.clear();
    markdownFilesCache.clear();
  }

  function rememberFileState(filePath, stat) {
    if (!filePath || !stat) return;
    fileStateMap.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size });
  }

  function getFileStateKey(stat) {
    if (!stat) return null;
    return `${stat.mtimeMs}:${stat.size}`;
  }

  function stopWatchingCurrentFile() {
    if (currentFileWatchTimer) {
      clearTimeout(currentFileWatchTimer);
      currentFileWatchTimer = null;
    }
    if (currentFileWatcher) {
      try {
        currentFileWatcher.close();
      } catch (error) {
        console.warn('[FileHandlers] Error closing current file watcher:', error.message);
      }
    }
    currentFileWatcher = null;
    currentFileWatchPath = null;
    lastNotifiedFileStateKey = null;
  }

  function sendCurrentFileDiskEvent(channel, payload) {
    const targetWindow = resolveMainWindow();
    if (targetWindow && targetWindow.webContents && typeof targetWindow.webContents.send === 'function') {
      targetWindow.webContents.send(channel, payload);
    }
  }

  function shouldNotifyCurrentFileChange(filePath, stat) {
    const stateKey = getFileStateKey(stat);
    const knownStateKey = getFileStateKey(fileStateMap.get(filePath));

    if (!stateKey || stateKey === knownStateKey || stateKey === lastNotifiedFileStateKey) {
      return false;
    }

    lastNotifiedFileStateKey = stateKey;
    return true;
  }

  function handleWatchedCurrentFileEvent(eventType) {
    const filePath = currentFileWatchPath;
    if (!filePath) return;

    if (currentFileWatchTimer) {
      clearTimeout(currentFileWatchTimer);
    }

    currentFileWatchTimer = setTimeout(() => {
      currentFileWatchTimer = null;

      let stat = null;
      try {
        stat = fsSync.statSync(filePath);
      } catch (error) {
        if (error && error.code === 'ENOENT') {
          if (lastNotifiedFileStateKey !== 'missing') {
            lastNotifiedFileStateKey = 'missing';
            sendCurrentFileDiskEvent('current-file-deleted-on-disk', {
              filePath,
              eventType,
              deleted: true
            });
          }
          return;
        }
        console.warn(`[FileHandlers] Failed to stat watched file ${filePath}:`, error.message);
        return;
      }

      if (!shouldNotifyCurrentFileChange(filePath, stat)) {
        return;
      }

      sendCurrentFileDiskEvent('current-file-changed-on-disk', {
        filePath,
        eventType,
        mtimeMs: stat.mtimeMs,
        size: stat.size
      });
    }, 150);
  }

  function watchCurrentFile(filePath) {
    stopWatchingCurrentFile();

    if (!filePath || typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
      return;
    }

    let stat = null;
    try {
      stat = fsSync.statSync(filePath);
      if (!stat.isFile()) return;
    } catch (error) {
      return;
    }

    rememberFileState(filePath, stat);
    currentFileWatchPath = filePath;

    const directory = path.dirname(filePath);
    const fileName = path.basename(filePath);

    try {
      currentFileWatcher = fsSync.watch(directory, { persistent: false }, (eventType, changedName) => {
        if (changedName && changedName.toString() !== fileName) {
          return;
        }
        handleWatchedCurrentFileEvent(eventType);
      });
      currentFileWatcher.on('error', (error) => {
        console.warn(`[FileHandlers] Current file watcher failed for ${filePath}:`, error.message);
        stopWatchingCurrentFile();
      });
    } catch (error) {
      console.warn(`[FileHandlers] Could not watch current file ${filePath}:`, error.message);
      stopWatchingCurrentFile();
    }
  }

  function resolveMainWindow() {
    const allWindows = typeof BrowserWindow.getAllWindows === 'function'
      ? BrowserWindow.getAllWindows()
      : [];
    return (
      (typeof getMainWindow === 'function' ? getMainWindow() : null) ||
      mainWindow ||
      (typeof BrowserWindow.getFocusedWindow === 'function' ? BrowserWindow.getFocusedWindow() : null) ||
      allWindows[0]
    );
  }

  function updateCurrentWorkingDirectory(nextDirectory) {
    if (typeof setCurrentWorkingDirectory === 'function') {
      setCurrentWorkingDirectory(nextDirectory);
    }
  }

  const getWorkingDirectory = createRuntimeWorkspaceResolver({
    appSettings,
    currentWorkingDirectory,
    getCurrentWorkingDirectory
  });

  function syncWorkspaceFolders(primaryFolder = getWorkingDirectory(), options = {}) {
    if (!Array.isArray(appSettings.workspaceFolders)) {
      appSettings.workspaceFolders = [];
    }

    const result = sanitizeWorkspaceFolders(primaryFolder, appSettings.workspaceFolders);
    if (result.changed) {
      appSettings.workspaceFolders = result.workspaceFolders;
      if (options.save !== false) {
        saveSettings();
      }
      console.warn(
        `[FileHandlers] Removed ${result.removed.length} duplicate/overlapping workspace folder(s)`
      );
    }

    return appSettings.workspaceFolders;
  }

  function buildWorkspaceRoots(primaryFolder = getWorkingDirectory()) {
    const roots = [];
    const normalizedPrimary = normalizeWorkspacePath(primaryFolder);
    if (normalizedPrimary) {
      roots.push({
        path: normalizedPrimary,
        label: 'the primary working directory',
        kind: 'primary'
      });
    }

    const workspaceFolders = syncWorkspaceFolders(normalizedPrimary || primaryFolder);
    for (const folderPath of workspaceFolders) {
      roots.push({
        path: folderPath,
        label: folderPath,
        kind: 'workspace'
      });
    }

    return roots;
  }

  function getWorkspaceWriteRoots() {
    return buildWorkspaceRoots().map((root) => root.path);
  }

  function resolveWorkspaceWritePath(filePath, label = 'Path', options = {}) {
    return resolvePathWithinRoots(filePath, getWorkspaceWriteRoots(), {
      label,
      baseDirectory: options.baseDirectory || getWorkingDirectory()
    });
  }

  function pathGuardFailure(result, extra = {}) {
    return {
      success: false,
      error: result.error,
      ...extra
    };
  }

  function normalizeWriteFilePayload(filePathOrPayload, content) {
    if (filePathOrPayload && typeof filePathOrPayload === 'object') {
      return {
        filePath: filePathOrPayload.filePath,
        content: filePathOrPayload.content
      };
    }
    return { filePath: filePathOrPayload, content };
  }

  // Helper function to update internal links after a file rename
  async function updateInternalLinksAfterRename(oldPath, newPath) {
    const workingDir = getWorkingDirectory();
    const oldBasename = path.basename(oldPath, '.md');
    const newBasename = path.basename(newPath, '.md');

    debug(`[updateInternalLinks] Starting link update process:`);
    debug(`  Working directory: ${workingDir}`);
    debug(`  Old file: ${oldPath} (basename: ${oldBasename})`);
    debug(`  New file: ${newPath} (basename: ${newBasename})`);

    let filesUpdated = 0;

    // Function to recursively find all .md files
    async function findMarkdownFiles(dir) {
      const files = [];
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            // Skip node_modules and hidden directories
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
              files.push(...await findMarkdownFiles(fullPath));
            }
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        console.error(`[updateInternalLinks] Error reading directory ${dir}:`, error);
      }

      return files;
    }

    try {
      // Find all markdown files in the working directory
      const allMarkdownFiles = await findMarkdownFiles(workingDir);
      debug(`[updateInternalLinks] Found ${allMarkdownFiles.length} markdown files to scan`);

      // Regex patterns to match internal links
      // Matches [[old-name]], [[old-name.md]], [[old-name|Display Text]], or [[old-name.md|Display Text]]
      const escapedBasename = escapeRegex(oldBasename);
      const linkPattern = new RegExp(`\\[\\[${escapedBasename}(\\.md)?(\\|[^\\]]+)?\\]\\]`, 'g');
      debug(`[updateInternalLinks] Using regex pattern: ${linkPattern}`);

      for (const filePath of allMarkdownFiles) {
        // Skip the renamed file itself
        if (filePath === newPath) {
          debug(`[updateInternalLinks] Skipping renamed file: ${filePath}`);
          continue;
        }

        try {
          const content = await fs.readFile(filePath, 'utf-8');

          // Check if file contains the old link before replacing
          const matches = content.match(linkPattern);
          if (matches) {
            debug(`[updateInternalLinks] Found ${matches.length} link(s) in ${filePath}:`, matches);
          }

          const updatedContent = content.replace(linkPattern, (match, mdExtension, displayPart) => {
            // Preserve .md extension if it was in the original link
            // Preserve the display text if it exists
            const extension = mdExtension || '';
            const display = displayPart || '';
            const newLink = `[[${newBasename}${extension}${display}]]`;
            debug(`[updateInternalLinks] Replacing "${match}" with "${newLink}"`);
            return newLink;
          });

          // Only write if content changed
          if (updatedContent !== content) {
            await fs.writeFile(filePath, updatedContent, 'utf-8');
            filesUpdated++;
            debug(`[updateInternalLinks] ✓ Updated links in: ${filePath}`);
          }
        } catch (fileError) {
          console.error(`[updateInternalLinks] Error processing ${filePath}:`, fileError);
        }
      }

      debug(`[updateInternalLinks] Completed. Updated ${filesUpdated} file(s)`);
    } catch (error) {
      console.error('[updateInternalLinks] Error finding markdown files:', error);
      throw error;
    }

    return filesUpdated;
  }

  // Helper function to escape special regex characters
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Directory and Folder Operations
  ipcMain.handle('create-folder', async (event, folderName, parentPath = '') => {
    try {
      const workingDir = getWorkingDirectory();
      const nameResult = validatePathSegment(folderName, 'Folder name');
      if (!nameResult.success) return pathGuardFailure(nameResult);

      const baseResult = resolveWorkspaceWritePath(parentPath || workingDir, 'Parent folder');
      if (!baseResult.success) return pathGuardFailure(baseResult);

      const folderPath = path.join(baseResult.path, nameResult.value);
      
      debug(`[FileHandlers] Creating folder: ${folderPath}`);
      
      // Check if folder already exists
      try {
        await fs.access(folderPath);
        return {
          success: false,
          error: 'A folder with that name already exists'
        };
      } catch (err) {
        // Folder doesn't exist, which is what we want
      }
      
      // Create the folder
      await fs.mkdir(folderPath, { recursive: true });
      clearFileScanCaches();
      
      debug(`[FileHandlers] Folder created successfully: ${folderPath}`);
      return {
        success: true,
        folderPath: folderPath,
        message: `Folder "${folderName}" created successfully`
      };
    } catch (error) {
      console.error('[FileHandlers] Error creating folder:', error);
      return {
        success: false,
        error: `Failed to create folder: ${error.message}`
      };
    }
  });

  ipcMain.handle('create-file', async (event, fileName, parentPath = '', content = '') => {
    try {
      const workingDir = getWorkingDirectory();
      const nameResult = validatePathSegment(fileName, 'File name');
      if (!nameResult.success) return pathGuardFailure(nameResult);

      const baseResult = resolveWorkspaceWritePath(parentPath || workingDir, 'Parent folder');
      if (!baseResult.success) return pathGuardFailure(baseResult);

      const filePath = path.join(baseResult.path, nameResult.value);

      debug(`[FileHandlers] Creating file: ${filePath}`);

      // Check if file already exists
      try {
        await fs.access(filePath);
        return {
          success: false,
          error: 'A file with that name already exists'
        };
      } catch (err) {
        // File doesn't exist, which is what we want
      }

      // Create the file with optional content
      await fs.writeFile(filePath, content, 'utf8');
      clearFileScanCaches();

      debug(`[FileHandlers] File created successfully: ${filePath}`);
      return {
        success: true,
        filePath: filePath,
        message: `File "${fileName}" created successfully`
      };
    } catch (error) {
      console.error('[FileHandlers] Error creating file:', error);
      return {
        success: false,
        error: `Failed to create file: ${error.message}`
      };
    }
  });

  ipcMain.handle('request-file-tree', async (event) => {
    try {
      const workingDir = getWorkingDirectory();
      const workspaceFolders = syncWorkspaceFolders(workingDir);

      debug(`[FileHandlers] Building file tree for: ${workingDir}`);
      debug(`[FileHandlers] Additional workspace folders: ${workspaceFolders.length}`);

      // Build trees for all folders
      const trees = [];

      // Primary working directory
      const primaryTree = await buildFileTree(workingDir);
      primaryTree.isPrimary = true; // Mark as primary folder
      trees.push(primaryTree);

      // Additional workspace folders
      for (const folderPath of workspaceFolders) {
        try {
          // Verify folder exists
          const fsSync = require('fs');
          if (fsSync.existsSync(folderPath)) {
            const folderTree = await buildFileTree(folderPath);
            folderTree.isWorkspaceFolder = true; // Mark as workspace folder
            trees.push(folderTree);
          } else {
            debug(`[FileHandlers] Workspace folder not found: ${folderPath}`);
          }
        } catch (folderError) {
          console.error(`[FileHandlers] Error building tree for workspace folder ${folderPath}:`, folderError);
        }
      }

      // If only one folder, return it directly for backward compatibility
      if (trees.length === 1) {
        const tree = trees[0];
        tree.signature = getWorkspaceTreeSignatureFromTrees(trees);
        return tree;
      }

      // Multiple folders - return a virtual root
      const tree = {
        name: 'Workspace',
        type: 'workspace-root',
        path: null,
        children: trees,
        isMultiFolder: true
      };
      tree.signature = getWorkspaceTreeSignatureFromTrees(trees);
      return tree;
    } catch (error) {
      console.error('[FileHandlers] Error building file tree:', error);
      return {
        name: 'Error',
        type: 'error',
        error: error.message
      };
    }
  });

  ipcMain.handle('get-file-tree-signature', async () => {
    try {
      return {
        success: true,
        signature: await getWorkspaceTreeSignature()
      };
    } catch (error) {
      console.error('[FileHandlers] Error getting file tree signature:', error);
      return { success: false, error: error.message };
    }
  });

  // Get contents of a specific folder for lazy loading/refresh
  ipcMain.handle('get-folder-contents', async (event, folderPath) => {
    try {
      if (!folderPath || !path.isAbsolute(folderPath)) {
        console.warn(`[FileHandlers] Invalid folder path: ${folderPath}`);
        return { success: false, error: 'Invalid folder path' };
      }

      debug(`[FileHandlers] Getting folder contents: ${folderPath}`);

      const folderTree = await buildFileTree(folderPath);
      return {
        success: true,
        children: folderTree.children || []
      };
    } catch (error) {
      console.error('[FileHandlers] Error getting folder contents:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-available-files', async (event) => {
    try {
      const workingDir = getWorkingDirectory();
      const workspaceFolders = syncWorkspaceFolders(workingDir);

      debug(`[FileHandlers] Getting available files from: ${workingDir}`);
      debug(`[FileHandlers] Additional workspace folders: ${workspaceFolders.length}`);

      // Get files from primary working directory
      const primaryFiles = await getCachedAvailableFiles(workingDir);
      // Mark files with their source folder for UI differentiation
      primaryFiles.forEach(file => {
        file.sourceFolder = workingDir;
        file.isPrimaryFolder = true;
      });

      // Aggregate files from all workspace folders
      let allFiles = [...primaryFiles];

      for (const folderPath of workspaceFolders) {
        try {
          if (fsSync.existsSync(folderPath)) {
            const folderFiles = await getCachedAvailableFiles(folderPath);
            // Mark files with their source folder
            folderFiles.forEach(file => {
              file.sourceFolder = folderPath;
              file.isWorkspaceFolder = true;
            });
            allFiles = allFiles.concat(folderFiles);
          } else {
            debug(`[FileHandlers] Workspace folder not found: ${folderPath}`);
          }
        } catch (folderError) {
          console.error(`[FileHandlers] Error getting files from workspace folder ${folderPath}:`, folderError);
        }
      }

      debug(`[FileHandlers] Total available files across all folders: ${allFiles.length}`);
      return allFiles;
    } catch (error) {
      console.error('[FileHandlers] Error getting available files:', error);
      return [];
    }
  });

  ipcMain.handle('get-working-directory', () => {
    return getWorkingDirectory();
  });

  ipcMain.handle('list-directory-files', async (event, relativePath) => {
    try {
      const workingDir = getWorkingDirectory();
      // If relativePath is already absolute, use it directly; otherwise join with workingDir
      const targetDir = relativePath
        ? (path.isAbsolute(relativePath) ? relativePath : path.join(workingDir, relativePath))
        : workingDir;
      
      debug(`[FileHandlers] Listing files in directory: ${targetDir}`);
      
      // Check if directory exists
      if (!fsSync.existsSync(targetDir)) {
        debug(`[FileHandlers] Directory not found: ${targetDir}`);
        return [];
      }
      
      // Get all files in the directory
      const items = await fs.readdir(targetDir, { withFileTypes: true });
      
      // Filter and map files (excluding directories)
      const files = items
        .filter(item => item.isFile() && (item.name.endsWith('.md') || item.name.endsWith('.markdown') || item.name.endsWith('.bib')))
        .map(item => ({
          name: item.name,
          path: path.join(targetDir, item.name),
          relativePath: path.relative(workingDir, path.join(targetDir, item.name)),
          isFile: true  // Add isFile property for BibTeX loading compatibility
        }));
      
      debug(`[FileHandlers] Found ${files.length} files (markdown and bib)`);
      return files;
    } catch (error) {
      console.error('[FileHandlers] Error listing directory files:', error);
      return [];
    }
  });

  ipcMain.handle('change-working-directory', async () => {
    const currentMainWindow = resolveMainWindow();

    if (!currentMainWindow) {
      console.error('[FileHandlers] No main window available for directory dialog');
      return { success: false, error: 'No main window available' };
    }

    try {
      const result = await dialog.showOpenDialog(currentMainWindow, {
        properties: ['openDirectory'],
        title: 'Select Working Directory',
        defaultPath: appSettings.workingDirectory
      });

      if (!result.canceled && result.filePaths.length > 0) {
        appSettings.workingDirectory = normalizeWorkspacePath(result.filePaths[0]) || result.filePaths[0];
        updateCurrentWorkingDirectory(appSettings.workingDirectory);
        syncWorkspaceFolders(appSettings.workingDirectory, { save: false });
        saveSettings();
        clearFileScanCaches();

        debug(`[FileHandlers] Working directory changed to: ${appSettings.workingDirectory}`);

        // Notify renderer about the settings change
        const win = resolveMainWindow();
        if (win) {
          win.webContents.send('settings-changed', {
            workingDirectory: appSettings.workingDirectory,
            workspaceFolders: appSettings.workspaceFolders
          });
        }

        return {
          success: true,
          directory: appSettings.workingDirectory
        };
      }

      return { success: false, cancelled: true };
    } catch (error) {
      console.error('[FileHandlers] Error changing working directory:', error);
      return { success: false, error: error.message };
    }
  });

  // Add a folder to workspace (multi-folder support)
  ipcMain.handle('add-workspace-folder', async () => {
    const currentMainWindow = resolveMainWindow();

    if (!currentMainWindow) {
      console.error('[FileHandlers] No main window available for directory dialog');
      return { success: false, error: 'No main window available' };
    }

    try {
      const result = await dialog.showOpenDialog(currentMainWindow, {
        properties: ['openDirectory'],
        title: 'Add Folder to Workspace',
        defaultPath: appSettings.workingDirectory
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const folderPath = normalizeWorkspacePath(result.filePaths[0]) || result.filePaths[0];

        if (!Array.isArray(appSettings.workspaceFolders)) {
          appSettings.workspaceFolders = [];
        }

        const overlap = findWorkspaceOverlap(folderPath, buildWorkspaceRoots());
        if (overlap) {
          return { success: false, error: describeWorkspaceOverlap(overlap) };
        }

        // Add to workspace folders
        appSettings.workspaceFolders.push(folderPath);
        saveSettings();
        clearFileScanCaches();

        debug(`[FileHandlers] Added workspace folder: ${folderPath}`);
        debug(`[FileHandlers] Total workspace folders: ${appSettings.workspaceFolders.length}`);

        // Notify renderer about the settings change
        const win = resolveMainWindow();
        if (win) {
          win.webContents.send('settings-changed', {
            workspaceFolders: appSettings.workspaceFolders
          });
          win.webContents.send('refresh-file-tree');
        }

        return {
          success: true,
          folderPath: folderPath,
          workspaceFolders: appSettings.workspaceFolders
        };
      }

      return { success: false, cancelled: true };
    } catch (error) {
      console.error('[FileHandlers] Error adding workspace folder:', error);
      return { success: false, error: error.message };
    }
  });

  // Remove a folder from workspace
  ipcMain.handle('remove-workspace-folder', async (event, folderPath) => {
    try {
      if (!Array.isArray(appSettings.workspaceFolders)) {
        return { success: false, error: 'No workspace folders configured' };
      }

      const normalizedFolderPath = normalizeWorkspacePath(folderPath) || folderPath;
      syncWorkspaceFolders();
      const index = appSettings.workspaceFolders.findIndex((candidate) =>
        pathsEqual(candidate, normalizedFolderPath)
      );
      if (index === -1) {
        return { success: false, error: 'Folder not found in workspace' };
      }

      // Remove from workspace folders
      appSettings.workspaceFolders.splice(index, 1);
      saveSettings();
      clearFileScanCaches();

      debug(`[FileHandlers] Removed workspace folder: ${folderPath}`);
      debug(`[FileHandlers] Remaining workspace folders: ${appSettings.workspaceFolders.length}`);

      // Notify renderer about the settings change
      const win = resolveMainWindow();
      if (win) {
        win.webContents.send('settings-changed', {
          workspaceFolders: appSettings.workspaceFolders
        });
        win.webContents.send('refresh-file-tree');
      }

      return {
        success: true,
        folderPath: folderPath,
        workspaceFolders: appSettings.workspaceFolders
      };
    } catch (error) {
      console.error('[FileHandlers] Error removing workspace folder:', error);
      return { success: false, error: error.message };
    }
  });

  // Reorder workspace folders
  ipcMain.handle('reorder-workspace-folders', async (event, newOrder) => {
    try {
      if (!Array.isArray(newOrder)) {
        return { success: false, error: 'Invalid folder order' };
      }
      appSettings.workspaceFolders = newOrder
        .map((folderPath) => normalizeWorkspacePath(folderPath))
        .filter(Boolean);
      syncWorkspaceFolders(getWorkingDirectory(), { save: false });
      saveSettings();
      clearFileScanCaches();
      debug(`[FileHandlers] Reordered workspace folders: ${appSettings.workspaceFolders.length} folders`);

      const win = resolveMainWindow();
      if (win) {
        win.webContents.send('settings-changed', { workspaceFolders: appSettings.workspaceFolders });
      }
      return { success: true, workspaceFolders: appSettings.workspaceFolders };
    } catch (error) {
      console.error('[FileHandlers] Error reordering workspace folders:', error);
      return { success: false, error: error.message };
    }
  });

  // Get workspace folders
  ipcMain.handle('get-workspace-folders', () => {
    const primaryFolder = getWorkingDirectory();
    const workspaceFolders = syncWorkspaceFolders(primaryFolder);
    return {
      primaryFolder,
      workspaceFolders
    };
  });

  // File Reading Operations
  ipcMain.handle('read-file-content', async (event, filePath) => {
    try {
      debug(`[FileHandlers] Reading file content: ${filePath}`);
      const content = await fs.readFile(filePath, 'utf8');
      
      return {
        success: true,
        content: content,
        filePath: filePath
      };
    } catch (error) {
      console.error(`[FileHandlers] Error reading file ${filePath}:`, error);
      return {
        success: false,
        error: `Failed to read file: ${error.message}`,
        filePath: filePath
      };
    }
  });

  ipcMain.handle('library.append-internal-link', async (event, payload = {}) => {
    try {
      const { sourcePath, targetId, targetLabel } = payload;
      if (!sourcePath || !targetId) {
        return {
          success: false,
          error: 'Missing source or target information.'
        };
      }

      const workingDir = getWorkingDirectory();
      let absoluteSource = sourcePath;
      if (!path.isAbsolute(absoluteSource)) {
        absoluteSource = path.join(workingDir, sourcePath);
      }
      const sourceResult = resolveWorkspaceWritePath(absoluteSource, 'Source path');
      if (!sourceResult.success) return pathGuardFailure(sourceResult);
      absoluteSource = sourceResult.path;

      const content = await fs.readFile(absoluteSource, 'utf8');
      const baseTarget = targetId.replace(/\.md$/i, '');
      const sanitizedLabel = (targetLabel || '').replace(/[\r\n]+/g, ' ').trim();
      const escapedTarget = escapeRegex(baseTarget);
      const existingPattern = new RegExp(`\\[\\[${escapedTarget}(?:\\.md)?(?:\\|[^\\]]+)?\\]\\]`, 'i');

      if (existingPattern.test(content)) {
        return {
          success: true,
          alreadyExists: true,
          link: baseTarget
        };
      }

      const labelSegment = sanitizedLabel && sanitizedLabel.toLowerCase() !== baseTarget.toLowerCase()
        ? `|${sanitizedLabel}`
        : '';
      const linkToken = `[[${baseTarget}${labelSegment}]]`;
      let prefix = '';
      if (content.length > 0 && !content.endsWith('\n')) {
        prefix = '\n';
      }
      const commentToken = '<!-- AUTOMATICALLY INSERTED LINK -->';
      const appendText = `${prefix}${commentToken}\n${linkToken}\n`;

      await fs.appendFile(absoluteSource, appendText, 'utf8');

      return {
        success: true,
        appended: linkToken,
        sourcePath: absoluteSource,
        link: baseTarget
      };
    } catch (error) {
      console.error('[FileHandlers] Error appending internal link:', error);
      return {
        success: false,
        error: error.message || 'Failed to append link.'
      };
    }
  });

  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      debug(`[FileHandlers] Reading file: ${filePath}`);
      const content = await fs.readFile(filePath, 'utf8');
      const stat = await statOrNull(filePath);
      rememberFileState(filePath, stat);
      
      return {
        success: true,
        content: content,
        filePath: filePath,
        fileName: path.basename(filePath),
        mtimeMs: stat ? stat.mtimeMs : null
      };
    } catch (error) {
      console.error(`[FileHandlers] Error reading file ${filePath}:`, error);
      return {
        success: false,
        error: `Failed to read file: ${error.message}`,
        filePath: filePath
      };
    }
  });

  // File Writing Operations
  ipcMain.handle('write-file', async (event, filePath, content) => {
    try {
      const payload = normalizeWriteFilePayload(filePath, content);
      const targetResult = resolveWorkspaceWritePath(payload.filePath, 'File path');
      if (!targetResult.success) {
        return pathGuardFailure(targetResult, { filePath: payload.filePath });
      }
      filePath = targetResult.path;
      content = payload.content;
      if (typeof content !== 'string') {
        content = content == null ? '' : String(content);
      }

      debug(`[FileHandlers] Writing file: ${filePath} (${content.length} characters)`);
      
      // Ensure directory exists
      const dirPath = path.dirname(filePath);
      await fs.mkdir(dirPath, { recursive: true });
      
      // Write the file
      await fs.writeFile(filePath, content, 'utf8');
      clearFileScanCaches();
      
      debug(`[FileHandlers] File written successfully: ${filePath}`);
      return {
        success: true,
        filePath: filePath,
        size: content.length
      };
    } catch (error) {
      console.error(`[FileHandlers] Error writing file ${filePath}:`, error);
      return {
        success: false,
        error: `Failed to write file: ${error.message}`,
        filePath: filePath
      };
    }
  });

  // File Opening Operations  
  ipcMain.handle('open-file', async (event, filePath) => {
    try {
      debug(`[FileHandlers] Opening file: ${filePath}`);
      
      // Read the file content
      const content = await fs.readFile(filePath, 'utf8');
      const stat = await statOrNull(filePath);
      rememberFileState(filePath, stat);
      
      // Update current file path
      setCurrentFilePath(filePath);
      watchCurrentFile(filePath);
      
      return {
        success: true,
        content: content,
        filePath: filePath,
        fileName: path.basename(filePath),
        mtimeMs: stat ? stat.mtimeMs : null
      };
    } catch (error) {
      console.error(`[FileHandlers] Error opening file ${filePath}:`, error);
      return {
        success: false,
        error: `Failed to open file: ${error.message}`,
        filePath: filePath
      };
    }
  });

  ipcMain.handle('open-file-path', async (event, filePath) => {
    try {
      debug(`[FileHandlers] Opening file by path: ${filePath}`);
      
      // Check if file exists
      await fs.access(filePath);
      
      // Read the file content
      const content = await fs.readFile(filePath, 'utf8');
      const stat = await statOrNull(filePath);
      rememberFileState(filePath, stat);
      
      // Update current file path  
      setCurrentFilePath(filePath);
      watchCurrentFile(filePath);
      
      return {
        success: true,
        content: content,
        filePath: filePath,
        fileName: path.basename(filePath),
        mtimeMs: stat ? stat.mtimeMs : null
      };
    } catch (error) {
      console.error(`[FileHandlers] Error opening file path ${filePath}:`, error);
      return {
        success: false,
        error: `Failed to open file: ${error.message}`,
        filePath: filePath
      };
    }
  });

  // Read file content without updating current file (for file tree processing, etc.)
  ipcMain.handle('read-file-content-only', async (event, filePath) => {
    try {
      debug(`[FileHandlers] Reading file content only: ${filePath}`);
      
      // Check if file exists
      await fs.access(filePath);
      
      // Read the file content
      const content = await fs.readFile(filePath, 'utf8');
      
      // DO NOT update current file path - this is just for reading
      
      return {
        success: true,
        content: content,
        filePath: filePath,
        fileName: path.basename(filePath)
      };
    } catch (error) {
      console.error(`[FileHandlers] Error reading file content ${filePath}:`, error);
      return {
        success: false,
        error: `Failed to read file: ${error.message}`,
        filePath: filePath
      };
    }
  });

  // Open a file dialog and return the selected file path
  ipcMain.handle('dialog-open-file', async (event, options = {}) => {
    const { BrowserWindow } = require('electron');
    const currentMainWindow = resolveMainWindow();

    if (!currentMainWindow) {
      return { success: false, error: 'No main window available' };
    }

    try {
      const result = await dialog.showOpenDialog(currentMainWindow, {
        title: options.title || 'Open File',
        defaultPath: options.defaultPath || getWorkingDirectory(),
        filters: options.filters || [
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, canceled: true };
      }

      return { success: true, filePath: result.filePaths[0] };
    } catch (error) {
      console.error('[FileHandlers] Error opening file dialog:', error);
      return { success: false, error: error.message };
    }
  });

  // Read only frontmatter from a markdown file (much faster for tag processing)
  ipcMain.handle('read-frontmatter-only', async (event, filePath) => {
    try {
      const fsSync = require('fs');
      const readline = require('readline');

      return new Promise((resolve) => {
        const lines = [];
        let inFrontmatter = false;
        let foundEnd = false;

        const readStream = fsSync.createReadStream(filePath, { encoding: 'utf8' });
        const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity });

        rl.on('line', (line) => {
          if (!inFrontmatter && line.trim() === '---') {
            inFrontmatter = true;
            lines.push(line);
          } else if (inFrontmatter && line.trim() === '---') {
            lines.push(line);
            foundEnd = true;
            rl.close();
            readStream.destroy();
          } else if (inFrontmatter) {
            lines.push(line);
            // Safety limit - frontmatter shouldn't be more than 50 lines
            if (lines.length > 50) {
              rl.close();
              readStream.destroy();
            }
          } else if (!inFrontmatter && lines.length === 0) {
            // No frontmatter at start
            rl.close();
            readStream.destroy();
          }
        });

        rl.on('close', () => {
          resolve({
            success: true,
            content: foundEnd ? lines.join('\n') + '\n' : '',
            filePath: filePath,
            hasFrontmatter: foundEnd
          });
        });

        rl.on('error', (error) => {
          resolve({
            success: false,
            error: error.message,
            filePath: filePath
          });
        });
      });
    } catch (error) {
      return {
        success: false,
        error: error.message,
        filePath: filePath
      };
    }
  });

  // Batch read frontmatter for multiple files (much faster than individual reads)
  ipcMain.handle('batch-read-frontmatter', async (event, filePaths) => {
    const results = await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          const fsSync = require('fs');
          const readline = require('readline');

          return new Promise((resolve) => {
            const lines = [];
            let inFrontmatter = false;
            let foundEnd = false;

            const readStream = fsSync.createReadStream(filePath, { encoding: 'utf8' });
            const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity });

            rl.on('line', (line) => {
              if (!inFrontmatter && line.trim() === '---') {
                inFrontmatter = true;
                lines.push(line);
              } else if (inFrontmatter && line.trim() === '---') {
                lines.push(line);
                foundEnd = true;
                rl.close();
                readStream.destroy();
              } else if (inFrontmatter) {
                lines.push(line);
                if (lines.length > 50) {
                  rl.close();
                  readStream.destroy();
                }
              } else if (!inFrontmatter && lines.length === 0) {
                rl.close();
                readStream.destroy();
              }
            });

            rl.on('close', () => {
              resolve({
                success: true,
                content: foundEnd ? lines.join('\n') + '\n' : '',
                filePath: filePath,
                hasFrontmatter: foundEnd
              });
            });

            rl.on('error', () => {
              resolve({ success: false, filePath: filePath });
            });
          });
        } catch {
          return { success: false, filePath: filePath };
        }
      })
    );
    return results;
  });

  ipcMain.handle('perform-open-file', async (event, filename) => {
    try {
      const workingDir = getWorkingDirectory();
      const filePath = path.join(workingDir, filename);

      debug(`[FileHandlers] Performing open file: ${filePath}`);
      
      // Check if file exists
      await fs.access(filePath);
      
      // Read the file content
      const content = await fs.readFile(filePath, 'utf8');
      const stat = await statOrNull(filePath);
      rememberFileState(filePath, stat);
      
      // Update current file path
      setCurrentFilePath(filePath);
      
      return {
        success: true,
        content: content,
        filePath: filePath,
        fileName: filename,
        mtimeMs: stat ? stat.mtimeMs : null
      };
    } catch (error) {
      console.error(`[FileHandlers] Error performing open file ${filename}:`, error);
      return {
        success: false,
        error: `Failed to open file: ${error.message}`,
        fileName: filename
      };
    }
  });

  // File Save Operations
  ipcMain.handle('perform-save', async (event, content, options = {}) => {
    try {
      const currentFilePath = getCurrentFilePath();
      if (!currentFilePath) {
        return { success: false, error: 'No file currently open' };
      }

      debug(`[FileHandlers] 💾 PERFORM-SAVE called for: ${currentFilePath} (${content.length} characters)`);
      
      const saveResult = await guardedWriteFile(currentFilePath, content, options, { fileStateMap });
      if (!saveResult.success) {
        return saveResult;
      }
      clearFileScanCaches();
      
      debug(`[FileHandlers] File saved successfully: ${currentFilePath}`);
      return {
        success: true,
        filePath: currentFilePath,
        fileName: path.basename(currentFilePath),
        backupPath: saveResult.backupPath || null,
        mtimeMs: saveResult.mtimeMs || null
      };
    } catch (error) {
      console.error(`[FileHandlers] Error saving file:`, error);
      return {
        success: false,
        error: `Failed to save file: ${error.message}`
      };
    }
  });

  ipcMain.handle('perform-save-with-path', async (event, content, filePath, options = {}) => {
    try {
      const targetResult = resolveWorkspaceWritePath(filePath, 'Save path');
      if (!targetResult.success) {
        return pathGuardFailure(targetResult, { filePath });
      }
      filePath = targetResult.path;

      debug(`[FileHandlers] Saving file with path: ${filePath} (${content.length} characters)`);
      
      // Ensure directory exists
      const dirPath = path.dirname(filePath);
      await fs.mkdir(dirPath, { recursive: true });
      
      const saveResult = await guardedWriteFile(filePath, content, options, { fileStateMap });
      if (!saveResult.success) {
        return saveResult;
      }
      clearFileScanCaches();
      
      // Update current file path
      setCurrentFilePath(filePath);
      
      debug(`[FileHandlers] File saved with path: ${filePath}`);
      return {
        success: true,
        filePath: filePath,
        fileName: path.basename(filePath),
        backupPath: saveResult.backupPath || null,
        mtimeMs: saveResult.mtimeMs || null
      };
    } catch (error) {
      console.error(`[FileHandlers] Error saving file with path:`, error);
      return {
        success: false,
        error: `Failed to save file: ${error.message}`,
        filePath: filePath
      };
    }
  });

  ipcMain.handle('perform-save-as', async (event, options) => {
    const { BrowserWindow } = require('electron');
    const currentMainWindow = resolveMainWindow();
    
    if (!currentMainWindow) {
      console.error('[FileHandlers] No main window available for save dialog');
      return { success: false, error: 'No main window available' };
    }

    try {
      const { content, suggestedName } = options;
      const workingDir = getWorkingDirectory();
      
      const result = await dialog.showSaveDialog(currentMainWindow, {
        title: 'Save File As',
        defaultPath: path.join(workingDir, suggestedName || 'untitled.md'),
        filters: [
          { name: 'Markdown Files', extensions: ['md'] },
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled || !result.filePath) {
        return { success: false, cancelled: true };
      }

      const saveResult = await guardedWriteFile(result.filePath, content, {}, { fileStateMap });
      if (!saveResult.success) {
        return saveResult;
      }
      clearFileScanCaches();
      
      // Update current file path
      setCurrentFilePath(result.filePath);
      
      debug(`[FileHandlers] File saved as: ${result.filePath}`);
      return {
        success: true,
        filePath: result.filePath,
        fileName: path.basename(result.filePath),
        backupPath: saveResult.backupPath || null,
        mtimeMs: saveResult.mtimeMs || null
      };
    } catch (error) {
      console.error('[FileHandlers] Error in save as:', error);
      return {
        success: false,
        error: `Failed to save file: ${error.message}`
      };
    }
  });

  ipcMain.handle('trigger-new-file', async (event) => {
    try {
      // Clear current file path for new file
      setCurrentFilePath(null);
      
      debug('[FileHandlers] New file triggered');
      return { success: true, message: 'New file created' };
    } catch (error) {
      console.error('[FileHandlers] Error creating new file:', error);
      return { success: false, error: error.message };
    }
  });

  // File Utility Operations
  ipcMain.handle('check-file-exists', async (event, filePath) => {
    try {
      await fs.access(filePath);
      return { exists: true, filePath };
    } catch (error) {
      return { exists: false, filePath };
    }
  });

  ipcMain.handle('set-current-file', (event, filePath) => {
    try {
      debug(`[FileHandlers] Current file set to: ${filePath}`);
      setCurrentFilePath(filePath);
      if (filePath && fsSync.existsSync(filePath)) {
        const stat = fsSync.statSync(filePath);
        rememberFileState(filePath, stat);
        watchCurrentFile(filePath);
      } else {
        stopWatchingCurrentFile();
      }
      return { success: true, filePath };
    } catch (error) {
      console.error('[FileHandlers] Error setting current file:', error);
      return { success: false, error: error.message };
    }
  });

  // File Deletion Operations
  ipcMain.handle('delete-file', async (event, filePath) => {
    try {
      const targetResult = resolveWorkspaceWritePath(filePath, 'File path');
      if (!targetResult.success) return pathGuardFailure(targetResult, { filePath });
      filePath = targetResult.path;

      debug(`[FileHandlers] Deleting file: ${filePath}`);
      
      // Check if file exists
      await fs.access(filePath);
      
      // Delete the file
      await fs.unlink(filePath);
      clearFileScanCaches();
      
      debug(`[FileHandlers] File deleted successfully: ${filePath}`);
      return {
        success: true,
        filePath: filePath,
        message: 'File deleted successfully'
      };
    } catch (error) {
      console.error(`[FileHandlers] Error deleting file ${filePath}:`, error);
      return {
        success: false,
        error: `Failed to delete file: ${error.message}`,
        filePath: filePath
      };
    }
  });

  ipcMain.handle('delete-item', async (event, { path: itemPath, type, name }) => {
    try {
      const targetResult = resolveWorkspaceWritePath(itemPath, 'Item path');
      if (!targetResult.success) return pathGuardFailure(targetResult, { path: itemPath, type });
      itemPath = targetResult.path;

      debug(`[FileHandlers] Deleting ${type}: ${itemPath}`);
      
      if (type === 'file') {
        await fs.unlink(itemPath);
      } else if (type === 'directory') {
        await fs.rm(itemPath, { recursive: true, force: true });
      } else {
        throw new Error(`Unknown item type: ${type}`);
      }
      clearFileScanCaches();
      
      debug(`[FileHandlers] ${type} deleted successfully: ${itemPath}`);
      return {
        success: true,
        path: itemPath,
        type: type,
        name: name,
        message: `${type} deleted successfully`
      };
    } catch (error) {
      console.error(`[FileHandlers] Error deleting ${type} ${itemPath}:`, error);
      return {
        success: false,
        error: `Failed to delete ${type}: ${error.message}`,
        path: itemPath,
        type: type
      };
    }
  });

  // File Move Operations
  ipcMain.handle('move-item', async (event, { sourcePath, targetPath, operation, type }) => {
    try {
      const sourceResult = resolveWorkspaceWritePath(sourcePath, 'Source path');
      if (!sourceResult.success) return pathGuardFailure(sourceResult, { sourcePath, targetPath });

      const targetResult = resolveWorkspaceWritePath(targetPath, 'Target path');
      if (!targetResult.success) return pathGuardFailure(targetResult, { sourcePath, targetPath });

      sourcePath = sourceResult.path;
      targetPath = targetResult.path;

      debug(`[FileHandlers] Moving ${type} from ${sourcePath} to ${targetPath} (${operation})`);
      
      // Handle case where target is a directory - construct the full target path
      let finalTargetPath = targetPath;
      try {
        const targetStats = await fs.stat(targetPath);
        if (targetStats.isDirectory()) {
          const sourceFilename = path.basename(sourcePath);
          finalTargetPath = path.join(targetPath, sourceFilename);
          const finalTargetResult = resolveWorkspaceWritePath(finalTargetPath, 'Target path');
          if (!finalTargetResult.success) return pathGuardFailure(finalTargetResult, { sourcePath, targetPath });
          finalTargetPath = finalTargetResult.path;
          debug(`[FileHandlers] Target is directory, moving to: ${finalTargetPath}`);
        }
      } catch (error) {
        // Target doesn't exist or can't be accessed, use targetPath as-is
      }
      
      if (operation === 'move' || operation === 'cut') {
        await fs.rename(sourcePath, finalTargetPath);
      } else if (operation === 'copy') {
        if (type === 'file') {
          await fs.copyFile(sourcePath, finalTargetPath);
        } else {
          // For directories, we'd need a recursive copy operation
          throw new Error('Directory copying not implemented yet');
        }
      } else {
        throw new Error(`Unknown operation: ${operation}`);
      }
      clearFileScanCaches();
      
      debug(`[FileHandlers] ${type} ${operation}d successfully: ${sourcePath} -> ${finalTargetPath}`);
      return {
        success: true,
        sourcePath: sourcePath,
        targetPath: finalTargetPath,
        operation: operation,
        type: type,
        message: `${type} ${operation}d successfully`
      };
    } catch (error) {
      console.error(`[FileHandlers] Error ${operation}ing ${type}:`, error);
      return {
        success: false,
        error: `Failed to ${operation} ${type}: ${error.message}`,
        sourcePath: sourcePath,
        targetPath: targetPath
      };
    }
  });

  // File Rename Operation
  ipcMain.handle('rename-item', async (event, { filePath, newName }) => {
    try {
      debug(`[FileHandlers] Renaming item: ${filePath} to ${newName}`);
      
      // Validate inputs
      if (!filePath || !newName) {
        return {
          success: false,
          error: 'File path and new name are required'
        };
      }
      
      const sourceResult = resolveWorkspaceWritePath(filePath, 'Item path');
      if (!sourceResult.success) return pathGuardFailure(sourceResult, { filePath });
      filePath = sourceResult.path;

      const nameResult = validatePathSegment(newName, 'File name');
      if (!nameResult.success) return pathGuardFailure(nameResult, { filePath });
      
      // Construct new path
      const directory = path.dirname(filePath);
      const newPath = path.join(directory, nameResult.value);
      
      // Check if target already exists
      try {
        await fs.access(newPath);
        return {
          success: false,
          error: `A file or folder named "${newName}" already exists`
        };
      } catch (error) {
        // Good - target doesn't exist, we can proceed
      }
      
      // Perform the rename
      await fs.rename(filePath, newPath);
      clearFileScanCaches();

      debug(`[FileHandlers] Item renamed successfully: ${filePath} -> ${newPath}`);

      // Check if this is a markdown file and update internal links
      const isMarkdownFile = newName.endsWith('.md');
      let linksUpdated = 0;

      if (isMarkdownFile) {
        try {
          linksUpdated = await updateInternalLinksAfterRename(filePath, newPath);
          debug(`[FileHandlers] Updated ${linksUpdated} internal links referencing the renamed file`);
        } catch (linkUpdateError) {
          console.error('[FileHandlers] Error updating internal links:', linkUpdateError);
          // Don't fail the rename if link updating fails
        }
      }

      return {
        success: true,
        oldPath: filePath,
        newPath: newPath,
        oldName: path.basename(filePath),
        newName: newName,
        message: `Item renamed to "${newName}" successfully`,
        linksUpdated: linksUpdated
      };
    } catch (error) {
      console.error(`[FileHandlers] Error renaming item ${filePath}:`, error);
      return {
        success: false,
        error: `Failed to rename item: ${error.message}`,
        oldPath: filePath
      };
    }
  });

  // Theme Handler (moved from main)
  ipcMain.handle('get-initial-theme', (event) => {
    try {
      const { nativeTheme } = require('electron');
      return nativeTheme.shouldUseDarkColors;
    } catch (error) {
      console.error('[FileHandlers] Error getting initial theme:', error);
      return false;
    }
  });

  // External File/URL Opening
  ipcMain.handle('open-external', async (event, target) => {
    try {
      const { shell } = require('electron');
      const targetPath = String(target || '').trim();

      if (!targetPath) {
        return { success: false, error: 'No file or URL provided' };
      }

      try {
        const parsedUrl = new URL(targetPath);
        if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'mailto:') {
          await shell.openExternal(targetPath);
          debug(`[FileHandlers] Opened external URL: ${targetPath}`);
          return { success: true, url: targetPath };
        }

        if (parsedUrl.protocol === 'file:') {
          const { fileURLToPath } = require('url');
          const localPath = fileURLToPath(parsedUrl);
          const openError = await shell.openPath(localPath);
          if (openError) {
            return { success: false, error: openError, filePath: localPath };
          }
          debug(`[FileHandlers] Opened external file URL: ${targetPath}`);
          return { success: true, filePath: localPath };
        }
      } catch {
        // Not a URL; treat it as a local filesystem path.
      }

      const openError = await shell.openPath(targetPath);
      if (openError) {
        return { success: false, error: openError, filePath: targetPath };
      }

      debug(`[FileHandlers] Opened external file: ${targetPath}`);
      return { success: true, filePath: targetPath };
    } catch (error) {
      console.error(`[FileHandlers] Error opening external target ${target}:`, error);
      return {
        success: false,
        error: `Failed to open file or URL: ${error.message}`,
        filePath: target
      };
    }
  });

  // Open Folder in System File Manager (Finder/Explorer)
  ipcMain.handle('open-folder-in-finder', async (event, folderPath) => {
    try {
      const { shell } = require('electron');
      debug(`[FileHandlers] Opening folder in system file manager: ${folderPath}`);

      // Check if folder exists
      await fs.access(folderPath);

      // Open the folder in the system file manager
      await shell.openPath(folderPath);

      debug(`[FileHandlers] Successfully opened folder in system file manager: ${folderPath}`);
      return { success: true, folderPath };
    } catch (error) {
      console.error(`[FileHandlers] Error opening folder in system file manager ${folderPath}:`, error);
      return {
        success: false,
        error: `Failed to open folder: ${error.message}`,
        folderPath: folderPath
      };
    }
  });

  // Confirmation Dialog
  ipcMain.handle('show-delete-confirm', async (event, { fileName, filePath }) => {
    const { BrowserWindow } = require('electron');
    const currentMainWindow = resolveMainWindow();
    
    if (!currentMainWindow) {
      console.error('[FileHandlers] No main window available for delete dialog');
      return { success: false, error: 'No main window available' };
    }

    try {
      const result = await dialog.showMessageBox(currentMainWindow, {
        type: 'warning',
        title: 'Delete File',
        message: `Are you sure you want to delete "${fileName}"?`,
        detail: `This action cannot be undone.\n\nPath: ${filePath}`,
        buttons: ['Delete', 'Cancel'],
        defaultId: 1, // Cancel is default
        cancelId: 1
      });

      return {
        success: true,
        confirmed: result.response === 0, // Delete button
        cancelled: result.response === 1   // Cancel button
      };
    } catch (error) {
      console.error('[FileHandlers] Error showing delete confirmation:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('show-confirm-dialog', async (event, options = {}) => {
    const currentMainWindow = resolveMainWindow();

    if (!currentMainWindow) {
      console.error('[FileHandlers] No main window available for confirmation dialog');
      return { success: false, error: 'No main window available' };
    }

    try {
      const paths = Array.isArray(options.paths) ? options.paths.filter(Boolean) : [];
      const pathDetail = paths.length > 0
        ? `\n\nPaths:\n${paths.slice(0, 12).join('\n')}${paths.length > 12 ? `\n...and ${paths.length - 12} more` : ''}`
        : '';
      const result = await dialog.showMessageBox(currentMainWindow, {
        type: options.variant === 'danger' ? 'warning' : 'question',
        title: options.title || 'Confirm Action',
        message: options.message || 'Continue?',
        detail: `${options.detail || ''}${pathDetail}`.trim(),
        buttons: [options.confirmText || 'Confirm', options.cancelText || 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      });

      return {
        success: true,
        confirmed: result.response === 0,
        cancelled: result.response !== 0
      };
    } catch (error) {
      console.error('[FileHandlers] Error showing confirmation dialog:', error);
      return { success: false, error: error.message };
    }
  });

  debug('[FileHandlers] Registered file system handlers');

  // Helper functions
  // Directories that should never appear in the file tree.  Matches the skip
  // list used by getAvailableFiles plus common heavy/generated directories.
  const IGNORED_DIR_NAMES = new Set([
    'node_modules',
    'dist',
    'build',
    'coverage',
    'playwright-report',
    'test-results',
    'test-reports',
    'out',
    '.next',
    '.cache',
    '__pycache__',
    '.nightowl-backups'
  ]);

  const GENERATED_ARTIFACT_EXTENSIONS = new Set([
    '.docx',
    '.html',
    '.htm',
    '.pdf',
    '.pptx'
  ]);

  function shouldDeclutterGeneratedArtifacts() {
    return appSettings.navigation?.hideGeneratedArtifacts === true;
  }

  function isGeneratedFileTreeArtifact(entryName) {
    return GENERATED_ARTIFACT_EXTENSIONS.has(path.extname(entryName).toLowerCase());
  }

  function shouldHideFileTreeEntry(entryName) {
    if (!entryName) return true;
    if (entryName.startsWith('.')) return true;
    if (entryName.startsWith('~$')) return true;
    if (IGNORED_DIR_NAMES.has(entryName)) return true;
    if (shouldDeclutterGeneratedArtifacts() && isGeneratedFileTreeArtifact(entryName)) return true;
    return false;
  }

  function isDirectoryTreeNode(node) {
    return node?.type === 'directory' || node?.type === 'folder';
  }

  function updateTreeSignatureFromTreeNode(hash, node, relativePath = '') {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'file') {
      hash.update(`f:${relativePath || node.name || ''}\n`);
      return;
    }

    hash.update(`dir:${relativePath || '.'}\n`);
    for (const child of Array.isArray(node.children) ? node.children : []) {
      const childRelativePath = relativePath ? `${relativePath}/${child.name}` : child.name;
      if (isDirectoryTreeNode(child)) {
        hash.update(`d:${childRelativePath}\n`);
        updateTreeSignatureFromTreeNode(hash, child, childRelativePath);
      } else {
        hash.update(`f:${childRelativePath}\n`);
      }
    }
  }

  function getWorkspaceTreeSignatureFromTrees(trees) {
    const hash = crypto.createHash('sha1');
    hash.update(`declutter:${shouldDeclutterGeneratedArtifacts() ? '1' : '0'}\n`);
    for (const tree of Array.isArray(trees) ? trees : []) {
      hash.update(`root:${tree?.path || ''}\n`);
      updateTreeSignatureFromTreeNode(hash, tree);
    }
    return hash.digest('hex');
  }

  async function updateDirectorySignatureFromDisk(hash, dirPath, relativePath = '') {
    hash.update(`dir:${relativePath || '.'}\n`);

    let entries = [];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      hash.update(`unreadable:${relativePath}:${error.code || error.message}\n`);
      return;
    }

    entries = entries
      .filter((entry) => !shouldHideFileTreeEntry(entry.name))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (b.isDirectory() && !a.isDirectory()) return 1;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });

    for (const entry of entries) {
      const childRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        hash.update(`d:${childRelativePath}\n`);
        await updateDirectorySignatureFromDisk(hash, path.join(dirPath, entry.name), childRelativePath);
      } else {
        hash.update(`f:${childRelativePath}\n`);
      }
    }
  }

  async function updateTreeSignatureFromDisk(hash, rootPath) {
    const rootStat = await fs.stat(rootPath);
    if (rootStat.isFile()) {
      hash.update(`f:${path.basename(rootPath)}\n`);
      return;
    }
    if (rootStat.isDirectory()) {
      await updateDirectorySignatureFromDisk(hash, rootPath);
    }
  }

  async function getWorkspaceTreeSignature() {
    const workingDir = getWorkingDirectory();
    const workspaceFolders = syncWorkspaceFolders(workingDir);
    const roots = [workingDir, ...workspaceFolders];
    const hash = crypto.createHash('sha1');
    hash.update(`declutter:${shouldDeclutterGeneratedArtifacts() ? '1' : '0'}\n`);

    for (const rootPath of roots) {
      hash.update(`root:${rootPath}\n`);
      try {
        await updateTreeSignatureFromDisk(hash, rootPath);
      } catch (error) {
        hash.update(`missing:${rootPath}:${error.code || error.message}\n`);
      }
    }

    return hash.digest('hex');
  }

  async function buildFileTree(dirPath) {
    try {
      const stats = await fs.stat(dirPath);
      const name = path.basename(dirPath);

      if (stats.isFile()) {
        return {
          name: name,
          type: 'file',
          path: dirPath
        };
      }

      if (stats.isDirectory()) {
        const children = [];
        const entries = await fs.readdir(dirPath);

        for (const entry of entries) {
          if (shouldHideFileTreeEntry(entry)) continue;

          const entryPath = path.join(dirPath, entry);
          try {
            const childTree = await buildFileTree(entryPath);
            children.push(childTree);
          } catch (error) {
            // Skip files/directories we can't access
            console.warn(`[FileHandlers] Skipping inaccessible path: ${entryPath}`);
          }
        }
        
        // Sort children: directories first, then files, both alphabetically
        children.sort((a, b) => {
          // First sort by type (directories before files)
          if (a.type === 'directory' && b.type !== 'directory') return -1;
          if (b.type === 'directory' && a.type !== 'directory') return 1;
          
          // Then sort alphabetically by name (case-insensitive)
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });
        
        return {
          name: name || 'Root',
          type: 'directory',
          path: dirPath,
          children: children
        };
      }
    } catch (error) {
      console.error(`[FileHandlers] Error building file tree for ${dirPath}:`, error);
      return {
        name: path.basename(dirPath),
        type: 'error',
        path: dirPath,
        error: error.message
      };
    }
  }

  async function getAvailableFiles(dirPath) {
    try {
      const files = [];
      const ignoredDirNames = new Set([
        '.git',
        'node_modules',
        'dist',
        'build',
        'coverage',
        'playwright-report',
        'test-results',
        'test-reports',
        'out',
        '.next',
        '.cache'
      ]);

      const normalizeRelativePath = (relativePath) => relativePath.split(path.sep).join('/');

      const walk = async (currentDir) => {
        let entries;
        try {
          entries = await fs.readdir(currentDir, { withFileTypes: true });
        } catch (error) {
          console.warn(`[FileHandlers] Skipping unreadable directory: ${currentDir}`);
          return;
        }

        for (const entry of entries) {
          if (!entry || !entry.name) continue;
          if (entry.name.startsWith('.')) continue; // Skip hidden files/dirs

          const entryPath = path.join(currentDir, entry.name);

          if (entry.isSymbolicLink()) {
            continue; // Avoid symlink loops
          }

          if (entry.isDirectory()) {
            if (ignoredDirNames.has(entry.name)) continue;
            await walk(entryPath);
            continue;
          }

          if (!entry.isFile()) continue;

          const lower = entry.name.toLowerCase();
          const isMarkdown = lower.endsWith('.md') || lower.endsWith('.markdown');
          if (!isMarkdown) continue;

          try {
            const stats = await fs.stat(entryPath);
            const relativePath = normalizeRelativePath(path.relative(dirPath, entryPath));
            files.push({
              name: entry.name,
              path: entryPath,
              relativePath,
              size: stats.size,
              modified: stats.mtime
            });
          } catch (error) {
            console.warn(`[FileHandlers] Skipping inaccessible file: ${entryPath}`);
          }
        }
      };

      await walk(dirPath);
      return files;
    } catch (error) {
      console.error(`[FileHandlers] Error getting available files from ${dirPath}:`, error);
      return [];
    }
  }

  async function getCachedAvailableFiles(dirPath) {
    const cacheKey = normalizeWorkspacePath(dirPath);
    const cachedFiles = getCachedFileList(availableFilesCache, cacheKey);
    if (cachedFiles) return cachedFiles;

    const files = await getAvailableFiles(dirPath);
    setCachedFileList(availableFilesCache, cacheKey, files);
    return cloneFileList(files);
  }

  async function findMarkdownFilesInRoot(dirPath) {
    const markdownFiles = [];
    const ignoredDirNames = new Set([
      'node_modules',
      '.git',
      '.vscode',
      'dist',
      'build',
      '.next',
      'coverage',
      'playwright-report',
      'test-results',
      'test-reports',
      'out',
      '.cache'
    ]);

    async function walk(currentDir) {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);

          if (entry.isSymbolicLink()) continue;
          if (entry.isDirectory()) {
            if (!ignoredDirNames.has(entry.name)) {
              await walk(fullPath);
            }
          } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
            markdownFiles.push(fullPath);
          }
        }
      } catch (dirError) {
        console.warn(`[FileHandlers] Error reading directory ${currentDir}:`, dirError);
      }
    }

    await walk(dirPath);
    return markdownFiles.sort();
  }

  async function getCachedMarkdownFiles(dirPath) {
    const cacheKey = normalizeWorkspacePath(dirPath);
    const cachedFiles = getCachedFileList(markdownFilesCache, cacheKey);
    if (cachedFiles) return cachedFiles;

    const files = await findMarkdownFilesInRoot(dirPath);
    setCachedFileList(markdownFilesCache, cacheKey, files);
    return cloneFileList(files);
  }

  // Image File Browser Handler
  ipcMain.handle('browse-for-image', async (event) => {
    debug('[FileHandlers] Browse for image dialog requested');
    debug('[FileHandlers] main window available:', !!resolveMainWindow());
    
    // Get current main window - try multiple approaches
    const { BrowserWindow } = require('electron');
    const currentMainWindow = resolveMainWindow();
    
    if (!currentMainWindow) {
      console.error('[FileHandlers] No main window available - focused:', !!BrowserWindow.getFocusedWindow(), 'total windows:', BrowserWindow.getAllWindows().length);
      return { success: false, error: 'No main window available' };
    }
    
    try {
      // Default to generated-images directory
      const generatedImagesDir = path.join(__dirname, '..', 'generated-images');
      let defaultPath = getWorkingDirectory();
      
      // Check if generated-images directory exists and use it as default
      try {
        await fs.access(generatedImagesDir);
        defaultPath = generatedImagesDir;
        debug('[FileHandlers] Using generated-images directory as default:', defaultPath);
      } catch (error) {
        debug('[FileHandlers] Generated-images directory not found, using working directory');
      }
      
      const result = await dialog.showOpenDialog(currentMainWindow, {
        title: 'Select Image File',
        defaultPath: defaultPath,
        filters: [
          { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, canceled: true };
      }

      const selectedPath = result.filePaths[0];
      const fileName = path.basename(selectedPath);
      
      debug('[FileHandlers] Image selected:', selectedPath);
      
      return {
        success: true,
        filePath: selectedPath,
        fileName: fileName,
        relativePath: path.relative(getWorkingDirectory(), selectedPath)
      };
      
    } catch (error) {
      console.error('[FileHandlers] Error in browse-for-image:', error);
      return { success: false, error: error.message };
    }
  });

  // Embed annotations into PDF file
  ipcMain.handle('embed-pdf-annotations', async (event, { highlights, annotations, filePath }) => {
    try {
      debug(`[FileHandlers] Embedding annotations into PDF: ${filePath}`);
      
      const PDFLib = require('pdf-lib');
      const { PDFDocument, rgb } = PDFLib;
      
      // Read the original PDF
      const pdfBuffer = await fs.readFile(filePath);
      
      // Load the PDF document
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const pages = pdfDoc.getPages();
      
      // Add highlights as annotations
      debug(`[FileHandlers] Processing ${highlights.length} highlights`);
      for (const highlight of highlights) {
        debug(`[FileHandlers] Adding highlight:`, highlight);
        
        // Handle different highlight data structures
        const pageNum = highlight.pageNumber || highlight.pageNum;
        const bounds = highlight.bounds;
        
        if (!bounds || !pageNum) {
          debug(`[FileHandlers] Skipping highlight - missing bounds or pageNum:`, highlight);
          continue;
        }
        
        const pageIndex = pageNum - 1;
        if (pageIndex >= 0 && pageIndex < pages.length) {
          const page = pages[pageIndex];
          const { width, height } = page.getSize();
          
          debug(`[FileHandlers] Page ${pageNum} size: ${width}x${height}`);
          debug(`[FileHandlers] Bounds:`, bounds);
          
          // Convert canvas coordinates to PDF coordinates
          // Canvas coordinates are relative to the canvas, PDF coordinates are absolute page coordinates
          const x = bounds.x || bounds.left || 0;
          const y = bounds.y || bounds.top || 0;
          const w = bounds.width || (bounds.right - bounds.left) || 50;
          const h = bounds.height || (bounds.bottom - bounds.top) || 20;
          
          // PDF coordinates are bottom-up, canvas coordinates are top-down
          // Add offset adjustment - highlights are appearing ~3 lines too high
          const lineOffset = 60; // Approximate offset for 3 lines
          const pdfY = height - y - h - lineOffset;
          
          debug(`[FileHandlers] Canvas coords: x=${x}, y=${y}, w=${w}, h=${h}`);
          debug(`[FileHandlers] PDF coords: x=${x}, y=${pdfY}, w=${w}, h=${h}`);
          
          // Draw a highlight rectangle
          page.drawRectangle({
            x: Math.max(0, x),
            y: Math.max(0, pdfY),
            width: Math.max(1, w),
            height: Math.max(1, h),
            color: rgb(1, 1, 0), // Yellow highlight
            opacity: 0.3,
          });
          
          // Also add a more visible red border for testing
          page.drawRectangle({
            x: Math.max(0, x),
            y: Math.max(0, pdfY),
            width: Math.max(1, w),
            height: Math.max(1, h),
            borderColor: rgb(1, 0, 0),
            borderWidth: 2,
          });
        }
      }
      
      // Add text annotations in right margin
      debug(`[FileHandlers] Processing ${annotations.length} text annotations`);
      for (const annotation of annotations) {
        debug(`[FileHandlers] Adding annotation:`, annotation);
        
        const pageNum = annotation.pageNumber || annotation.pageNum;
        if (!pageNum) {
          debug(`[FileHandlers] Skipping annotation - missing pageNumber:`, annotation);
          continue;
        }
        
        const pageIndex = pageNum - 1;
        if (pageIndex >= 0 && pageIndex < pages.length) {
          const page = pages[pageIndex];
          const { width, height } = page.getSize();
          
          const annotationText = annotation.annotation || annotation.text || 'Annotation';
          const originalY = annotation.y || 50;
          
          // Position annotation in right margin
          const marginWidth = 150; // Width of right margin for annotations
          const marginX = width - marginWidth + 10; // Start 10px into the margin
          const maxTextWidth = marginWidth - 20; // Leave some padding
          
          // Apply the same offset adjustment as highlights for Y position
          const lineOffset = 60;
          const pdfY = height - originalY - lineOffset;
          
          debug(`[FileHandlers] Adding annotation "${annotationText}" in right margin at: x=${marginX}, y=${pdfY}`);
          
          // Split long annotation text to fit in margin
          const words = annotationText.split(' ');
          const fontSize = 10;
          const lineHeight = 12;
          let lines = [];
          let currentLine = '';
          
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            // Rough calculation: 6px per character
            if (testLine.length * 6 > maxTextWidth) {
              if (currentLine) {
                lines.push(currentLine);
                currentLine = word;
              } else {
                lines.push(word); // Very long single word
              }
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) lines.push(currentLine);
          
          // Add background rectangle for the annotation
          const totalHeight = lines.length * lineHeight + 8;
          page.drawRectangle({
            x: marginX - 5,
            y: Math.max(0, pdfY - 4),
            width: marginWidth - 10,
            height: totalHeight,
            color: rgb(1, 1, 0.9), // Very light yellow background
            opacity: 0.8,
            borderColor: rgb(0.8, 0.8, 0.8),
            borderWidth: 1,
          });
          
          // Add each line of annotation text
          lines.forEach((line, index) => {
            page.drawText(line, {
              x: marginX,
              y: Math.max(0, pdfY - (index * lineHeight)),
              size: fontSize,
              color: rgb(0.6, 0, 0), // Dark red text
            });
          });
          
          // Add a small connecting line from highlight to annotation
          const highlightX = annotation.x || 0;
          page.drawLine({
            start: { x: highlightX + (annotation.width || 100), y: pdfY + 6 },
            end: { x: marginX - 5, y: pdfY + 6 },
            color: rgb(0.8, 0.8, 0.8),
            thickness: 1,
            dashArray: [3, 2], // Dashed line
          });
        }
      }
      
      // Add a test annotation to verify the process is working
      if (pages.length > 0) {
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();
        
        // Add a test rectangle
        firstPage.drawRectangle({
          x: 50,
          y: height - 100,
          width: 100,
          height: 50,
          color: rgb(0, 0, 1), // Blue rectangle
          opacity: 0.5,
        });
        
        // Add test text
        firstPage.drawText('PDF MODIFIED BY NIGHTOWL', {
          x: 60,
          y: height - 80,
          size: 12,
          color: rgb(1, 1, 1), // White text
        });
        
        debug(`[FileHandlers] Added test annotation at top of first page`);
      }
      
      // Save the modified PDF
      const pdfBytes = await pdfDoc.save();
      
      // Create a backup of the original file
      const backupPath = filePath.replace('.pdf', '.backup.pdf');
      await fs.copyFile(filePath, backupPath);
      
      // Save the modified PDF
      await fs.writeFile(filePath, pdfBytes);
      
      debug(`[FileHandlers] PDF annotations embedded successfully, backup created at: ${backupPath}`);
      return { success: true, backupPath };
      
    } catch (error) {
      console.error('[FileHandlers] Error embedding PDF annotations:', error);
      return { success: false, error: error.message };
    }
  });

  // Copy file handler for backups
  ipcMain.handle('copy-file', async (event, { source, destination }) => {
    try {
      const sourceResult = resolveWorkspaceWritePath(source, 'Source path');
      if (!sourceResult.success) return pathGuardFailure(sourceResult, { source, destination });
      const destinationResult = resolveWorkspaceWritePath(destination, 'Destination path');
      if (!destinationResult.success) return pathGuardFailure(destinationResult, { source, destination });
      source = sourceResult.path;
      destination = destinationResult.path;

      debug(`[FileHandlers] Copying file from ${source} to ${destination}`);
      await fs.copyFile(source, destination);
      clearFileScanCaches();
      return { success: true };
    } catch (error) {
      console.error('[FileHandlers] Error copying file:', error);
      return { success: false, error: error.message };
    }
  });

  // Move file to a new location
  ipcMain.handle('move-file', async (event, { source, destination }) => {
    try {
      const sourceResult = resolveWorkspaceWritePath(source, 'Source path');
      if (!sourceResult.success) return pathGuardFailure(sourceResult, { source, destination });
      const destinationResult = resolveWorkspaceWritePath(destination, 'Destination path');
      if (!destinationResult.success) return pathGuardFailure(destinationResult, { source, destination });
      source = sourceResult.path;
      destination = destinationResult.path;

      debug(`[FileHandlers] Moving file from ${source} to ${destination}`);

      // Check if source exists
      try {
        await fs.access(source);
      } catch {
        return { success: false, error: 'Source file does not exist' };
      }

      // Check if destination already exists
      try {
        await fs.access(destination);
        return { success: false, error: 'A file with that name already exists at the destination' };
      } catch {
        // File doesn't exist, which is what we want
      }

      // Ensure destination directory exists
      const destDir = path.dirname(destination);
      await fs.mkdir(destDir, { recursive: true });

      // Move the file (rename works across same filesystem, copy+delete for different)
      try {
        await fs.rename(source, destination);
      } catch (renameError) {
        // If rename fails (different filesystems), copy then delete
        await fs.copyFile(source, destination);
        await fs.unlink(source);
      }

      debug(`[FileHandlers] Successfully moved file to ${destination}`);
      clearFileScanCaches();
      return { success: true, newPath: destination };
    } catch (error) {
      console.error('[FileHandlers] Error moving file:', error);
      return { success: false, error: error.message };
    }
  });

  // Copy file to a new location (with new name support)
  ipcMain.handle('copy-file-to', async (event, { source, destination }) => {
    try {
      const sourceResult = resolveWorkspaceWritePath(source, 'Source path');
      if (!sourceResult.success) return pathGuardFailure(sourceResult, { source, destination });
      const destinationResult = resolveWorkspaceWritePath(destination, 'Destination path');
      if (!destinationResult.success) return pathGuardFailure(destinationResult, { source, destination });
      source = sourceResult.path;
      destination = destinationResult.path;

      debug(`[FileHandlers] Copying file from ${source} to ${destination}`);

      // Check if source exists
      try {
        await fs.access(source);
      } catch {
        return { success: false, error: 'Source file does not exist' };
      }

      // Check if destination already exists
      try {
        await fs.access(destination);
        return { success: false, error: 'A file with that name already exists at the destination' };
      } catch {
        // File doesn't exist, which is what we want
      }

      // Ensure destination directory exists
      const destDir = path.dirname(destination);
      await fs.mkdir(destDir, { recursive: true });

      // Copy the file
      await fs.copyFile(source, destination);

      debug(`[FileHandlers] Successfully copied file to ${destination}`);
      clearFileScanCaches();
      return { success: true, newPath: destination };
    } catch (error) {
      console.error('[FileHandlers] Error copying file:', error);
      return { success: false, error: error.message };
    }
  });

  // Browse for destination folder
  ipcMain.handle('browse-destination-folder', async (event, { title, defaultPath }) => {
    const currentMainWindow = resolveMainWindow();

    if (!currentMainWindow) {
      return { success: false, error: 'No window available for dialog' };
    }

    try {
      const result = await dialog.showOpenDialog(currentMainWindow, {
        title: title || 'Select Destination Folder',
        defaultPath: defaultPath || getWorkingDirectory(),
        properties: ['openDirectory', 'createDirectory']
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      return { success: true, folderPath: result.filePaths[0] };
    } catch (error) {
      console.error('[FileHandlers] Error browsing for folder:', error);
      return { success: false, error: error.message };
    }
  });

  // Get all markdown files in the project (including all workspace folders)
  ipcMain.handle('get-markdown-files', async (event) => {
    try {
      const workingDir = getWorkingDirectory();
      const workspaceFolders = syncWorkspaceFolders(workingDir);

      debug(`[FileHandlers] Getting markdown files from: ${workingDir}`);
      debug(`[FileHandlers] Additional workspace folders: ${workspaceFolders.length}`);

      const markdownFileSet = new Set(await getCachedMarkdownFiles(workingDir));

      // Search all workspace folders
      for (const folderPath of workspaceFolders) {
        try {
          if (fsSync.existsSync(folderPath)) {
            const folderFiles = await getCachedMarkdownFiles(folderPath);
            folderFiles.forEach(filePath => markdownFileSet.add(filePath));
          } else {
            debug(`[FileHandlers] Workspace folder not found: ${folderPath}`);
          }
        } catch (folderError) {
          console.error(`[FileHandlers] Error searching workspace folder ${folderPath}:`, folderError);
        }
      }

      const markdownFiles = Array.from(markdownFileSet).sort();
      debug(`[FileHandlers] Found ${markdownFiles.length} markdown files across all folders`);
      return {
        success: true,
        files: markdownFiles
      };
    } catch (error) {
      console.error('[FileHandlers] Error getting markdown files:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Refresh file tree handler
  ipcMain.handle('refresh-file-tree', async (event) => {
    try {
      clearFileScanCaches();
      
      const win = resolveMainWindow();
      if (win) {
        win.webContents.send('refresh-file-tree');
        return { success: true };
      } else {
        console.error('[FileHandlers] No main window available for file tree refresh');
        return { success: false, error: 'No main window available' };
      }
    } catch (error) {
      console.error('[FileHandlers] Error refreshing file tree:', error);
      return { success: false, error: error.message };
    }
  });

  // Debug IPC handler to see renderer logs in main process
  ipcMain.handle('debug-log', async (event, level, message, data) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[RENDERER-${level.toUpperCase()}] ${timestamp} ${message}`;

    if (data) {
      debug(logMessage, data);
    } else {
      debug(logMessage);
    }

    return true;
  });

  // --- Docling PDF to Markdown Conversion ---
  // Convert PDF to Markdown using IBM's Docling library (requires Python)
  ipcMain.handle('convert-pdf-to-markdown', async (event, pdfPath) => {
    const { spawn } = require('child_process');

    debug(`[FileHandlers] Converting PDF to Markdown: ${pdfPath}`);

    return new Promise((resolve) => {
      // Path to the docling conversion script
      const scriptPath = path.join(__dirname, '..', 'scripts', 'docling-convert.py');

      // Try to find Python executable
      const pythonCommands = ['python3', 'python'];

      const tryPython = (pythonIdx) => {
        if (pythonIdx >= pythonCommands.length) {
          resolve({
            success: false,
            error: 'Python not found. Please install Python 3 and the docling package (pip install docling)',
            install_instructions: {
              python: 'https://www.python.org/downloads/',
              docling: 'pip install docling'
            }
          });
          return;
        }

        const pythonCmd = pythonCommands[pythonIdx];
        const args = [scriptPath, pdfPath, '--json'];

        debug(`[FileHandlers] Trying: ${pythonCmd} ${args.join(' ')}`);

        const proc = spawn(pythonCmd, args, {
          timeout: 300000, // 5 minute timeout for large PDFs
          env: { ...process.env }
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
          stderr += data.toString();
          debug(`[FileHandlers] Docling: ${data.toString().trim()}`);
        });

        proc.on('error', (err) => {
          if (err.code === 'ENOENT') {
            // Python command not found, try next
            tryPython(pythonIdx + 1);
          } else {
            resolve({
              success: false,
              error: `Failed to run docling converter: ${err.message}`
            });
          }
        });

        proc.on('close', (code) => {
          if (code === 0) {
            try {
              const result = JSON.parse(stdout);
              resolve(result);
            } catch (parseErr) {
              // If not JSON, treat stdout as raw markdown
              resolve({
                success: true,
                markdown: stdout,
                metadata: { source_file: pdfPath }
              });
            }
          } else {
            // Check if it's a "command not found" type error
            if (stderr.includes('No such file') || stderr.includes('not found')) {
              tryPython(pythonIdx + 1);
            } else {
              try {
                const result = JSON.parse(stdout);
                resolve(result);
              } catch {
                resolve({
                  success: false,
                  error: stderr || `Conversion failed with exit code ${code}`,
                  stdout: stdout
                });
              }
            }
          }
        });
      };

      tryPython(0);
    });
  });

  // Open dialog to select PDF for conversion
  ipcMain.handle('import-pdf-as-markdown', async (event) => {
    const { BrowserWindow } = require('electron');
    const currentMainWindow = resolveMainWindow();

    if (!currentMainWindow) {
      return { success: false, error: 'No main window available' };
    }

    try {
      const result = await dialog.showOpenDialog(currentMainWindow, {
        properties: ['openFile'],
        title: 'Select PDF to Convert to Markdown',
        filters: [
          { name: 'PDF Files', extensions: ['pdf'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, cancelled: true };
      }

      const pdfPath = result.filePaths[0];
      debug(`[FileHandlers] User selected PDF for import: ${pdfPath}`);

      // Convert the PDF
      const conversionResult = await new Promise((resolve) => {
        // Emit the conversion event internally
        const handler = ipcMain._events['convert-pdf-to-markdown'];
        if (handler) {
          // Call our handler directly
          const { spawn } = require('child_process');
          const scriptPath = path.join(__dirname, '..', 'scripts', 'docling-convert.py');

          const proc = spawn('python3', [scriptPath, pdfPath, '--json'], {
            timeout: 300000,
            env: { ...process.env }
          });

          let stdout = '';
          let stderr = '';

          proc.stdout.on('data', (data) => { stdout += data.toString(); });
          proc.stderr.on('data', (data) => {
            stderr += data.toString();
            debug(`[FileHandlers] Docling: ${data.toString().trim()}`);
          });

          proc.on('error', (err) => {
            resolve({
              success: false,
              error: `Failed to run docling: ${err.message}`,
              install_instructions: {
                docling: 'pip install docling'
              }
            });
          });

          proc.on('close', (code) => {
            if (code === 0) {
              try {
                resolve(JSON.parse(stdout));
              } catch {
                resolve({ success: true, markdown: stdout });
              }
            } else {
              try {
                resolve(JSON.parse(stdout));
              } catch {
                resolve({
                  success: false,
                  error: stderr || `Exit code ${code}`,
                  install_instructions: stderr.includes('docling') ? { docling: 'pip install docling' } : null
                });
              }
            }
          });
        } else {
          resolve({ success: false, error: 'Handler not available' });
        }
      });

      return {
        ...conversionResult,
        sourcePath: pdfPath,
        suggestedFilename: path.basename(pdfPath, '.pdf') + '.md'
      };
    } catch (error) {
      console.error('[FileHandlers] Error importing PDF:', error);
      return { success: false, error: error.message };
    }
  });

  // Check if docling is available
  ipcMain.handle('check-docling-available', async () => {
    const { spawn } = require('child_process');

    return new Promise((resolve) => {
      const proc = spawn('python3', ['-c', 'import docling; print(docling.__version__ if hasattr(docling, "__version__") else "installed")'], {
        timeout: 10000
      });

      let stdout = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });

      proc.on('error', () => {
        resolve({ available: false, reason: 'Python not found' });
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ available: true, version: stdout.trim() });
        } else {
          resolve({
            available: false,
            reason: 'Docling not installed',
            install_command: 'pip install docling'
          });
        }
      });
    });
  });

  // --- Pandoc Word to Markdown Conversion ---
  // Convert DOCX to Markdown using Pandoc (requires pandoc to be installed)
  ipcMain.handle('convert-word-to-markdown', async (event, docxPath, options = {}) => {
    const { spawn } = require('child_process');

    debug(`[FileHandlers] Converting Word document to Markdown: ${docxPath}`);

    // Default options
    const {
      extractMedia = true,        // Extract embedded images
      markdownFlavor = 'gfm',     // Use GitHub-Flavored Markdown
      wrapText = 'none'           // Don't wrap text
    } = options;

    return new Promise((resolve) => {
      // Build pandoc arguments
      const args = [
        '-f', 'docx',
        '-t', markdownFlavor,
        '--wrap=' + wrapText
      ];

      // Extract media to a folder next to the output file
      if (extractMedia) {
        const mediaDir = path.join(path.dirname(docxPath), 'media');
        args.push('--extract-media=' + mediaDir);
      }

      // Input file
      args.push(docxPath);

      debug(`[FileHandlers] Running: pandoc ${args.join(' ')}`);

      const proc = spawn('pandoc', args, {
        timeout: 120000, // 2 minute timeout
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        debug(`[FileHandlers] Pandoc: ${data.toString().trim()}`);
      });

      proc.on('error', (err) => {
        if (err.code === 'ENOENT') {
          resolve({
            success: false,
            error: 'Pandoc not found. Please install Pandoc to convert Word documents.',
            install_instructions: {
              macos: 'brew install pandoc',
              windows: 'https://pandoc.org/installing.html',
              linux: 'sudo apt-get install pandoc'
            }
          });
        } else {
          resolve({
            success: false,
            error: `Failed to run pandoc: ${err.message}`
          });
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          // Get metadata from the document
          const metadata = {
            source_file: docxPath,
            converted_at: new Date().toISOString(),
            converter: 'pandoc',
            markdown_flavor: markdownFlavor
          };

          resolve({
            success: true,
            markdown: stdout,
            metadata
          });
        } else {
          resolve({
            success: false,
            error: stderr || `Pandoc conversion failed with exit code ${code}`,
            stdout: stdout
          });
        }
      });
    });
  });

  // Open dialog to select Word document for conversion
  ipcMain.handle('import-word-as-markdown', async (event) => {
    const { BrowserWindow } = require('electron');
    const currentMainWindow = resolveMainWindow();

    if (!currentMainWindow) {
      return { success: false, error: 'No main window available' };
    }

    try {
      const result = await dialog.showOpenDialog(currentMainWindow, {
        properties: ['openFile'],
        title: 'Select Word Document to Convert to Markdown',
        filters: [
          { name: 'Word Documents', extensions: ['docx', 'doc'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, cancelled: true };
      }

      const docxPath = result.filePaths[0];
      debug(`[FileHandlers] User selected Word document for import: ${docxPath}`);

      // Check if it's an old .doc format
      if (docxPath.toLowerCase().endsWith('.doc') && !docxPath.toLowerCase().endsWith('.docx')) {
        return {
          success: false,
          error: 'Legacy .doc format is not fully supported. Please save as .docx in Word first.',
          sourcePath: docxPath
        };
      }

      // Convert the Word document
      const conversionResult = await new Promise((resolve) => {
        const { spawn } = require('child_process');

        const mediaDir = path.join(path.dirname(docxPath), 'media');
        const args = [
          '-f', 'docx',
          '-t', 'gfm',
          '--wrap=none',
          '--extract-media=' + mediaDir,
          docxPath
        ];

        debug(`[FileHandlers] Running: pandoc ${args.join(' ')}`);

        const proc = spawn('pandoc', args, {
          timeout: 120000,
          env: { ...process.env }
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
          debug(`[FileHandlers] Pandoc: ${data.toString().trim()}`);
        });

        proc.on('error', (err) => {
          if (err.code === 'ENOENT') {
            resolve({
              success: false,
              error: 'Pandoc not found. Please install Pandoc.',
              install_instructions: {
                macos: 'brew install pandoc',
                windows: 'https://pandoc.org/installing.html',
                linux: 'sudo apt-get install pandoc'
              }
            });
          } else {
            resolve({
              success: false,
              error: `Failed to run pandoc: ${err.message}`
            });
          }
        });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve({
              success: true,
              markdown: stdout,
              metadata: {
                source_file: docxPath,
                converted_at: new Date().toISOString()
              }
            });
          } else {
            resolve({
              success: false,
              error: stderr || `Exit code ${code}`
            });
          }
        });
      });

      return {
        ...conversionResult,
        sourcePath: docxPath,
        suggestedFilename: path.basename(docxPath).replace(/\.docx?$/i, '') + '.md'
      };
    } catch (error) {
      console.error('[FileHandlers] Error importing Word document:', error);
      return { success: false, error: error.message };
    }
  });

  // Check if pandoc is available
  ipcMain.handle('check-pandoc-available', async () => {
    const { spawn } = require('child_process');

    return new Promise((resolve) => {
      const proc = spawn('pandoc', ['--version'], {
        timeout: 10000
      });

      let stdout = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });

      proc.on('error', () => {
        resolve({
          available: false,
          reason: 'Pandoc not found',
          install_instructions: {
            macos: 'brew install pandoc',
            windows: 'https://pandoc.org/installing.html',
            linux: 'sudo apt-get install pandoc'
          }
        });
      });

      proc.on('close', (code) => {
        if (code === 0) {
          // Extract version from first line
          const versionMatch = stdout.match(/pandoc\s+([\d.]+)/i);
          resolve({
            available: true,
            version: versionMatch ? versionMatch[1] : 'unknown'
          });
        } else {
          resolve({
            available: false,
            reason: 'Pandoc check failed'
          });
        }
      });
    });
  });

  // ─── Unsaved-change recovery ───────────────────────────────────────
  // Persists editor content for dirty/untitled tabs so it survives restarts.

  const recoveryDir = userDataPath ? path.join(userDataPath, 'recovery') : null;
  const recoveryFile = recoveryDir ? path.join(recoveryDir, 'unsaved-tabs.json') : null;

  async function ensureRecoveryDir() {
    if (!recoveryDir) return;
    try {
      await fs.mkdir(recoveryDir, { recursive: true });
    } catch (_) { /* ignore if exists */ }
  }

  ipcMain.handle('recovery-persist', async (_event, recoveryData) => {
    if (!recoveryFile) return { success: false, error: 'No userData path' };
    try {
      await ensureRecoveryDir();
      const json = JSON.stringify(recoveryData, null, 2);
      // Atomic write: temp file → rename
      const tmp = recoveryFile + '.tmp';
      await fs.writeFile(tmp, json, 'utf-8');
      await fs.rename(tmp, recoveryFile);
      return { success: true };
    } catch (error) {
      console.error('[Recovery] Failed to persist:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('recovery-load', async () => {
    if (!recoveryFile) return { success: true, data: null };
    try {
      const raw = await fs.readFile(recoveryFile, 'utf-8');
      const data = JSON.parse(raw);
      return { success: true, data };
    } catch (error) {
      if (error.code === 'ENOENT') return { success: true, data: null };
      console.error('[Recovery] Failed to load:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('recovery-clear', async () => {
    if (!recoveryFile) return { success: true };
    try {
      await fs.unlink(recoveryFile);
      return { success: true };
    } catch (error) {
      if (error.code === 'ENOENT') return { success: true };
      console.error('[Recovery] Failed to clear:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  register,
  __testHooks: {
    SAVE_CONFLICT_CODE,
    statOrNull,
    hasExternalModification,
    buildBackupFilePath,
    createFileBackup,
    guardedWriteFile,
    resolvePathWithinRoots,
    validatePathSegment
  }
};

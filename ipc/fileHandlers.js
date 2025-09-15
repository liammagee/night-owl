// === File System IPC Handlers ===
// Handles all file system operations, directory management, and file I/O

const { ipcMain, dialog } = require('electron');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

/**
 * Register all file system IPC handlers
 * @param {Object} deps - Dependencies from main.js
 */
function register(deps) {
  const {
    appSettings,
    saveSettings,
    mainWindow,
    getCurrentFilePath,
    setCurrentFilePath,
    currentWorkingDirectory
  } = deps;

  // Helper function to get working directory
  function getWorkingDirectory() {
    return appSettings.workingDirectory || currentWorkingDirectory;
  }

  // Directory and Folder Operations
  ipcMain.handle('create-folder', async (event, folderName) => {
    try {
      const workingDir = getWorkingDirectory();
      const folderPath = path.join(workingDir, folderName);
      
      console.log(`[FileHandlers] Creating folder: ${folderPath}`);
      
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
      
      console.log(`[FileHandlers] Folder created successfully: ${folderPath}`);
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

  ipcMain.handle('request-file-tree', async (event) => {
    try {
      const workingDir = getWorkingDirectory();
      console.log(`[FileHandlers] Building file tree for: ${workingDir}`);
      
      const fileTree = await buildFileTree(workingDir);
      return fileTree;
    } catch (error) {
      console.error('[FileHandlers] Error building file tree:', error);
      return {
        name: 'Error',
        type: 'error',
        error: error.message
      };
    }
  });

  ipcMain.handle('get-available-files', async (event) => {
    try {
      const workingDir = getWorkingDirectory();
      console.log(`[FileHandlers] Getting available files from: ${workingDir}`);
      
      const files = await getAvailableFiles(workingDir);
      return files;
    } catch (error) {
      console.error('[FileHandlers] Error getting available files:', error);
      return [];
    }
  });

  ipcMain.handle('get-working-directory', () => {
    return currentWorkingDirectory || appSettings.workingDirectory;
  });

  ipcMain.handle('list-directory-files', async (event, relativePath) => {
    try {
      const workingDir = getWorkingDirectory();
      const targetDir = relativePath ? path.join(workingDir, relativePath) : workingDir;
      
      console.log(`[FileHandlers] Listing files in directory: ${targetDir}`);
      
      // Check if directory exists
      if (!fsSync.existsSync(targetDir)) {
        console.warn(`[FileHandlers] Directory not found: ${targetDir}`);
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
      
      console.log(`[FileHandlers] Found ${files.length} files (markdown and bib)`);
      return files;
    } catch (error) {
      console.error('[FileHandlers] Error listing directory files:', error);
      return [];
    }
  });

  ipcMain.handle('change-working-directory', async () => {
    const { BrowserWindow } = require('electron');
    const currentMainWindow = mainWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    
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
        appSettings.workingDirectory = result.filePaths[0];
        currentWorkingDirectory = appSettings.workingDirectory;
        saveSettings();
        
        console.log(`[FileHandlers] Working directory changed to: ${appSettings.workingDirectory}`);
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

  // File Reading Operations
  ipcMain.handle('read-file-content', async (event, filePath) => {
    try {
      console.log(`[FileHandlers] Reading file content: ${filePath}`);
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

  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      console.log(`[FileHandlers] Reading file: ${filePath}`);
      const content = await fs.readFile(filePath, 'utf8');
      
      return {
        success: true,
        content: content,
        filePath: filePath,
        fileName: path.basename(filePath)
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
      console.log(`[FileHandlers] Writing file: ${filePath} (${content.length} characters)`);
      
      // Ensure directory exists
      const dirPath = path.dirname(filePath);
      await fs.mkdir(dirPath, { recursive: true });
      
      // Write the file
      await fs.writeFile(filePath, content, 'utf8');
      
      console.log(`[FileHandlers] File written successfully: ${filePath}`);
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
      console.log(`[FileHandlers] Opening file: ${filePath}`);
      
      // Read the file content
      const content = await fs.readFile(filePath, 'utf8');
      
      // Update current file path
      setCurrentFilePath(filePath);
      
      return {
        success: true,
        content: content,
        filePath: filePath,
        fileName: path.basename(filePath)
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
      console.log(`[FileHandlers] Opening file by path: ${filePath}`);
      
      // Check if file exists
      await fs.access(filePath);
      
      // Read the file content
      const content = await fs.readFile(filePath, 'utf8');
      
      // Update current file path  
      setCurrentFilePath(filePath);
      
      return {
        success: true,
        content: content,
        filePath: filePath,
        fileName: path.basename(filePath)
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
      console.log(`[FileHandlers] Reading file content only: ${filePath}`);
      
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

  ipcMain.handle('perform-open-file', async (event, filename) => {
    try {
      const workingDir = getWorkingDirectory();
      const filePath = path.join(workingDir, filename);
      
      console.log(`[FileHandlers] Performing open file: ${filePath}`);
      
      // Check if file exists
      await fs.access(filePath);
      
      // Read the file content
      const content = await fs.readFile(filePath, 'utf8');
      
      // Update current file path
      setCurrentFilePath(filePath);
      
      return {
        success: true,
        content: content,
        filePath: filePath,
        fileName: filename
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
  ipcMain.handle('perform-save', async (event, content) => {
    try {
      const currentFilePath = getCurrentFilePath();
      if (!currentFilePath) {
        return { success: false, error: 'No file currently open' };
      }
      
      console.log(`[FileHandlers] Saving file: ${currentFilePath} (${content.length} characters)`);
      
      await fs.writeFile(currentFilePath, content, 'utf8');
      
      console.log(`[FileHandlers] File saved successfully: ${currentFilePath}`);
      return {
        success: true,
        filePath: currentFilePath,
        fileName: path.basename(currentFilePath)
      };
    } catch (error) {
      console.error(`[FileHandlers] Error saving file:`, error);
      return {
        success: false,
        error: `Failed to save file: ${error.message}`
      };
    }
  });

  ipcMain.handle('perform-save-with-path', async (event, content, filePath) => {
    try {
      console.log(`[FileHandlers] Saving file with path: ${filePath} (${content.length} characters)`);
      
      // Ensure directory exists
      const dirPath = path.dirname(filePath);
      await fs.mkdir(dirPath, { recursive: true });
      
      // Write the file
      await fs.writeFile(filePath, content, 'utf8');
      
      // Update current file path
      setCurrentFilePath(filePath);
      
      console.log(`[FileHandlers] File saved with path: ${filePath}`);
      return {
        success: true,
        filePath: filePath,
        fileName: path.basename(filePath)
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
    const currentMainWindow = mainWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    
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

      // Write the file
      await fs.writeFile(result.filePath, content, 'utf8');
      
      // Update current file path
      setCurrentFilePath(result.filePath);
      
      console.log(`[FileHandlers] File saved as: ${result.filePath}`);
      return {
        success: true,
        filePath: result.filePath,
        fileName: path.basename(result.filePath)
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
      
      console.log('[FileHandlers] New file triggered');
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
      console.log(`[FileHandlers] Current file set to: ${filePath}`);
      setCurrentFilePath(filePath);
      return { success: true, filePath };
    } catch (error) {
      console.error('[FileHandlers] Error setting current file:', error);
      return { success: false, error: error.message };
    }
  });

  // File Deletion Operations
  ipcMain.handle('delete-file', async (event, filePath) => {
    try {
      console.log(`[FileHandlers] Deleting file: ${filePath}`);
      
      // Check if file exists
      await fs.access(filePath);
      
      // Delete the file
      await fs.unlink(filePath);
      
      console.log(`[FileHandlers] File deleted successfully: ${filePath}`);
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
      console.log(`[FileHandlers] Deleting ${type}: ${itemPath}`);
      
      if (type === 'file') {
        await fs.unlink(itemPath);
      } else if (type === 'directory') {
        await fs.rmdir(itemPath, { recursive: true });
      } else {
        throw new Error(`Unknown item type: ${type}`);
      }
      
      console.log(`[FileHandlers] ${type} deleted successfully: ${itemPath}`);
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
      console.log(`[FileHandlers] Moving ${type} from ${sourcePath} to ${targetPath} (${operation})`);
      
      // Handle case where target is a directory - construct the full target path
      let finalTargetPath = targetPath;
      try {
        const targetStats = await fs.stat(targetPath);
        if (targetStats.isDirectory()) {
          const sourceFilename = path.basename(sourcePath);
          finalTargetPath = path.join(targetPath, sourceFilename);
          console.log(`[FileHandlers] Target is directory, moving to: ${finalTargetPath}`);
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
      
      console.log(`[FileHandlers] ${type} ${operation}d successfully: ${sourcePath} -> ${finalTargetPath}`);
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
      console.log(`[FileHandlers] Renaming item: ${filePath} to ${newName}`);
      
      // Validate inputs
      if (!filePath || !newName) {
        return {
          success: false,
          error: 'File path and new name are required'
        };
      }
      
      // Validate new name (basic validation)
      if (newName.includes('/') || newName.includes('\\')) {
        return {
          success: false,
          error: 'File name cannot contain path separators'
        };
      }
      
      if (newName.trim() === '') {
        return {
          success: false,
          error: 'File name cannot be empty'
        };
      }
      
      // Construct new path
      const directory = path.dirname(filePath);
      const newPath = path.join(directory, newName);
      
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
      
      console.log(`[FileHandlers] Item renamed successfully: ${filePath} -> ${newPath}`);
      return {
        success: true,
        oldPath: filePath,
        newPath: newPath,
        oldName: path.basename(filePath),
        newName: newName,
        message: `Item renamed to "${newName}" successfully`
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

  // External File Opening
  ipcMain.handle('open-external', async (event, filePath) => {
    try {
      const { shell } = require('electron');
      await shell.openPath(filePath);

      console.log(`[FileHandlers] Opened external file: ${filePath}`);
      return { success: true, filePath };
    } catch (error) {
      console.error(`[FileHandlers] Error opening external file ${filePath}:`, error);
      return {
        success: false,
        error: `Failed to open file: ${error.message}`,
        filePath: filePath
      };
    }
  });

  // Open Folder in System File Manager (Finder/Explorer)
  ipcMain.handle('open-folder-in-finder', async (event, folderPath) => {
    try {
      const { shell } = require('electron');
      console.log(`[FileHandlers] Opening folder in system file manager: ${folderPath}`);

      // Check if folder exists
      await fs.access(folderPath);

      // Open the folder in the system file manager
      await shell.openPath(folderPath);

      console.log(`[FileHandlers] Successfully opened folder in system file manager: ${folderPath}`);
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
    const currentMainWindow = mainWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    
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

  console.log('[FileHandlers] Registered 23 file system handlers');

  // Helper functions
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
          // Skip hidden files and directories
          if (entry.startsWith('.')) continue;
          
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
      const entries = await fs.readdir(dirPath);
      
      for (const entry of entries) {
        if (entry.startsWith('.')) continue; // Skip hidden files
        
        const entryPath = path.join(dirPath, entry);
        try {
          const stats = await fs.stat(entryPath);
          if (stats.isFile()) {
            files.push({
              name: entry,
              path: entryPath,
              size: stats.size,
              modified: stats.mtime
            });
          }
        } catch (error) {
          // Skip files we can't access
          console.warn(`[FileHandlers] Skipping inaccessible file: ${entryPath}`);
        }
      }
      
      return files;
    } catch (error) {
      console.error(`[FileHandlers] Error getting available files from ${dirPath}:`, error);
      return [];
    }
  }

  // Image File Browser Handler
  ipcMain.handle('browse-for-image', async (event) => {
    console.log('[FileHandlers] Browse for image dialog requested');
    console.log('[FileHandlers] mainWindow available:', !!mainWindow);
    
    // Get current main window - try multiple approaches
    const { BrowserWindow } = require('electron');
    const currentMainWindow = mainWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    
    if (!currentMainWindow) {
      console.error('[FileHandlers] No main window available - mainWindow:', !!mainWindow, 'focused:', !!BrowserWindow.getFocusedWindow(), 'total windows:', BrowserWindow.getAllWindows().length);
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
        console.log('[FileHandlers] Using generated-images directory as default:', defaultPath);
      } catch (error) {
        console.log('[FileHandlers] Generated-images directory not found, using working directory');
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
      
      console.log('[FileHandlers] Image selected:', selectedPath);
      
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
      console.log(`[FileHandlers] Embedding annotations into PDF: ${filePath}`);
      
      const PDFLib = require('pdf-lib');
      const { PDFDocument, rgb } = PDFLib;
      
      // Read the original PDF
      const pdfBuffer = await fs.readFile(filePath);
      
      // Load the PDF document
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const pages = pdfDoc.getPages();
      
      // Add highlights as annotations
      console.log(`[FileHandlers] Processing ${highlights.length} highlights`);
      for (const highlight of highlights) {
        console.log(`[FileHandlers] Adding highlight:`, highlight);
        
        // Handle different highlight data structures
        const pageNum = highlight.pageNumber || highlight.pageNum;
        const bounds = highlight.bounds;
        
        if (!bounds || !pageNum) {
          console.log(`[FileHandlers] Skipping highlight - missing bounds or pageNum:`, highlight);
          continue;
        }
        
        const pageIndex = pageNum - 1;
        if (pageIndex >= 0 && pageIndex < pages.length) {
          const page = pages[pageIndex];
          const { width, height } = page.getSize();
          
          console.log(`[FileHandlers] Page ${pageNum} size: ${width}x${height}`);
          console.log(`[FileHandlers] Bounds:`, bounds);
          
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
          
          console.log(`[FileHandlers] Canvas coords: x=${x}, y=${y}, w=${w}, h=${h}`);
          console.log(`[FileHandlers] PDF coords: x=${x}, y=${pdfY}, w=${w}, h=${h}`);
          
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
      console.log(`[FileHandlers] Processing ${annotations.length} text annotations`);
      for (const annotation of annotations) {
        console.log(`[FileHandlers] Adding annotation:`, annotation);
        
        const pageNum = annotation.pageNumber || annotation.pageNum;
        if (!pageNum) {
          console.log(`[FileHandlers] Skipping annotation - missing pageNumber:`, annotation);
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
          
          console.log(`[FileHandlers] Adding annotation "${annotationText}" in right margin at: x=${marginX}, y=${pdfY}`);
          
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
        
        console.log(`[FileHandlers] Added test annotation at top of first page`);
      }
      
      // Save the modified PDF
      const pdfBytes = await pdfDoc.save();
      
      // Create a backup of the original file
      const backupPath = filePath.replace('.pdf', '.backup.pdf');
      await fs.copyFile(filePath, backupPath);
      
      // Save the modified PDF
      await fs.writeFile(filePath, pdfBytes);
      
      console.log(`[FileHandlers] PDF annotations embedded successfully, backup created at: ${backupPath}`);
      return { success: true, backupPath };
      
    } catch (error) {
      console.error('[FileHandlers] Error embedding PDF annotations:', error);
      return { success: false, error: error.message };
    }
  });

  // Copy file handler for backups
  ipcMain.handle('copy-file', async (event, { source, destination }) => {
    try {
      console.log(`[FileHandlers] Copying file from ${source} to ${destination}`);
      await fs.copyFile(source, destination);
      return { success: true };
    } catch (error) {
      console.error('[FileHandlers] Error copying file:', error);
      return { success: false, error: error.message };
    }
  });

  // Get all markdown files in the project
  ipcMain.handle('get-markdown-files', async (event) => {
    try {
      const workingDir = getWorkingDirectory();
      console.log(`[FileHandlers] Getting markdown files from: ${workingDir}`);
      
      const markdownFiles = [];
      
      // Recursive function to find markdown files
      async function findMarkdownFiles(dir) {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
              // Skip common non-content directories
              if (!['node_modules', '.git', '.vscode', 'dist', 'build', '.next', 'coverage'].includes(entry.name)) {
                await findMarkdownFiles(fullPath);
              }
            } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
              markdownFiles.push(fullPath);
            }
          }
        } catch (dirError) {
          console.warn(`[FileHandlers] Error reading directory ${dir}:`, dirError);
        }
      }
      
      await findMarkdownFiles(workingDir);
      
      console.log(`[FileHandlers] Found ${markdownFiles.length} markdown files`);
      return { 
        success: true, 
        files: markdownFiles.sort() // Sort alphabetically
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
      
      if (mainWindow) {
        mainWindow.webContents.send('refresh-file-tree');
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
}

module.exports = {
  register
};
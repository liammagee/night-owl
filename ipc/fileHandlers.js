// === File System IPC Handlers ===
// Handles all file system operations, directory management, and file I/O

const { ipcMain, dialog } = require('electron');
const fs = require('fs').promises;
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
    currentFilePath,
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

  ipcMain.handle('change-working-directory', async () => {
    if (!mainWindow) return { success: false, error: 'No main window available' };
    
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
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
    if (!mainWindow) {
      return { success: false, error: 'No main window available' };
    }

    try {
      const { content, suggestedName } = options;
      const workingDir = getWorkingDirectory();
      
      const result = await dialog.showSaveDialog(mainWindow, {
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
      setCurrentFilePath(filePath);
      console.log(`[FileHandlers] Current file set to: ${filePath}`);
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

  // Confirmation Dialog
  ipcMain.handle('show-delete-confirm', async (event, { fileName, filePath }) => {
    if (!mainWindow) {
      return { success: false, error: 'No main window available' };
    }

    try {
      const result = await dialog.showMessageBox(mainWindow, {
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

  console.log('[FileHandlers] Registered 21 file system handlers');

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
}

module.exports = {
  register
};
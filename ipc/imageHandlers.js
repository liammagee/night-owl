// === Image IPC Handlers ===
// Handles image operations including paste, save, and markdown insertion

const { ipcMain, clipboard, nativeImage } = require('electron');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Register all image-related IPC handlers
 * @param {Object} deps - Dependencies from main.js
 */
function register(deps) {
  const {
    appSettings,
    mainWindow
  } = deps;

  console.log('[ImageHandlers] Starting registration of image handlers...');

  // Helper function to get working directory
  function getWorkingDirectory() {
    return appSettings.workingDirectory || process.cwd();
  }

  // Helper function to ensure images directory exists
  async function ensureImagesDirectory() {
    const workingDir = getWorkingDirectory();
    const imagesDir = path.join(workingDir, 'images');
    
    try {
      await fs.access(imagesDir);
    } catch (err) {
      // Directory doesn't exist, create it
      console.log(`[ImageHandlers] Creating images directory: ${imagesDir}`);
      await fs.mkdir(imagesDir, { recursive: true });
    }
    
    return imagesDir;
  }

  // Generate a unique filename for the image
  function generateImageFilename(extension = 'png') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomId = crypto.randomBytes(4).toString('hex');
    return `pasted-image-${timestamp}-${randomId}.${extension}`;
  }

  // Handle pasting images from clipboard
  ipcMain.handle('paste-image-from-clipboard', async (event) => {
    try {
      
      // Get image from clipboard
      const image = clipboard.readImage();
      
      if (image.isEmpty()) {
        return {
          success: false,
          error: 'No image found in clipboard'
        };
      }

      // Ensure images directory exists
      const imagesDir = await ensureImagesDirectory();
      
      // Generate filename and full path
      const filename = generateImageFilename('png');
      const filePath = path.join(imagesDir, filename);
      
      // Get image buffer
      const buffer = image.toPNG();
      
      // Save the image
      await fs.writeFile(filePath, buffer);
      
      
      // Return the relative path for markdown
      const relativePath = `images/${filename}`;
      
      return {
        success: true,
        filePath: filePath,
        relativePath: relativePath,
        filename: filename,
        markdownLink: `![Image](${relativePath})`
      };
      
    } catch (error) {
      console.error('[ImageHandlers] Error pasting image from clipboard:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Handle saving image data (for drag/drop or other sources)
  ipcMain.handle('save-image-data', async (event, imageData, originalFilename) => {
    try {
      
      // Ensure images directory exists
      const imagesDir = await ensureImagesDirectory();
      
      // Generate filename
      const extension = path.extname(originalFilename) || '.png';
      const filename = originalFilename || generateImageFilename(extension.slice(1));
      const filePath = path.join(imagesDir, filename);
      
      // Convert imageData to buffer if needed
      let buffer;
      if (Buffer.isBuffer(imageData)) {
        buffer = imageData;
      } else if (typeof imageData === 'string') {
        // Assume base64 data URL
        const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
        buffer = Buffer.from(base64Data, 'base64');
      } else {
        throw new Error('Invalid image data format');
      }
      
      // Save the image
      await fs.writeFile(filePath, buffer);
      
      
      // Return the relative path for markdown
      const relativePath = `images/${filename}`;
      
      return {
        success: true,
        filePath: filePath,
        relativePath: relativePath,
        filename: filename,
        markdownLink: `![Image](${relativePath})`
      };
      
    } catch (error) {
      console.error('[ImageHandlers] Error saving image data:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Handle copying local image files to project
  try {
    ipcMain.handle('copy-local-image-file', async (event, sourceFilePath) => {
      try {
        console.log(`[ImageHandlers] Copying local image file: ${sourceFilePath}`);

        // Check if source file exists
        await fs.access(sourceFilePath);

        // Get file stats to check if it's actually a file
        const stats = await fs.stat(sourceFilePath);
        if (!stats.isFile()) {
          return {
            success: false,
            error: 'Source path is not a file'
          };
        }

        // Validate it's an image file by extension
        const ext = path.extname(sourceFilePath).toLowerCase();
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif'];
        if (!imageExtensions.includes(ext)) {
          return {
            success: false,
            error: `Unsupported image format: ${ext}`
          };
        }

        // Ensure images directory exists
        const imagesDir = await ensureImagesDirectory();

        // Generate new filename to avoid conflicts
        const originalName = path.basename(sourceFilePath, ext);
        const safeOriginalName = originalName.replace(/[^a-zA-Z0-9\-_]/g, '-');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${safeOriginalName}-${timestamp}${ext}`;
        const targetFilePath = path.join(imagesDir, filename);

        // Copy the file
        await fs.copyFile(sourceFilePath, targetFilePath);

        console.log(`[ImageHandlers] Image copied successfully: ${sourceFilePath} -> ${targetFilePath}`);

        // Return the relative path for markdown
        const relativePath = `images/${filename}`;

        return {
          success: true,
          sourceFilePath: sourceFilePath,
          targetFilePath: targetFilePath,
          relativePath: relativePath,
          filename: filename,
          markdownLink: `![Image](${relativePath})`
        };

      } catch (error) {
        console.error('[ImageHandlers] Error copying local image file:', error);
        return {
          success: false,
          error: error.message
        };
      }
    });
    console.log('[ImageHandlers] Registered copy-local-image-file handler successfully');
  } catch (error) {
    console.error('[ImageHandlers] Error registering copy-local-image-file handler:', error);
  }

  // Register handler for fetching URL titles
  try {
    ipcMain.handle('fetch-url-title', async (event, url) => {
      console.log('[ImageHandlers] Fetching title for URL:', url);

      try {
        // Use node-fetch or the built-in fetch (Node 18+) to get the page
        const response = await fetch(url, {
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; NightOwl/1.0)'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();

        // Extract title from HTML using a simple regex
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

        if (titleMatch && titleMatch[1]) {
          // Clean up the title
          let title = titleMatch[1]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();

          // Limit title length
          if (title.length > 100) {
            title = title.substring(0, 97) + '...';
          }

          console.log('[ImageHandlers] Found title:', title);

          return {
            success: true,
            title: title
          };
        }

        // No title found, return domain as fallback
        const urlObj = new URL(url);
        return {
          success: true,
          title: urlObj.hostname.replace('www.', '')
        };

      } catch (error) {
        console.error('[ImageHandlers] Error fetching URL title:', error);

        // Return domain name as fallback
        try {
          const urlObj = new URL(url);
          return {
            success: true,
            title: urlObj.hostname.replace('www.', '')
          };
        } catch {
          return {
            success: true,
            title: 'Link'
          };
        }
      }
    });
    console.log('[ImageHandlers] Registered fetch-url-title handler successfully');
  } catch (error) {
    console.error('[ImageHandlers] Error registering fetch-url-title handler:', error);
  }

  // Register handler for selecting an image file via dialog
  try {
    const { dialog, BrowserWindow } = require('electron');

    ipcMain.handle('select-image-file', async (event) => {
      console.log('[ImageHandlers] Opening image file selection dialog');

      try {
        const currentWindow = mainWindow || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

        const result = await dialog.showOpenDialog(currentWindow, {
          title: 'Select Reference Image',
          properties: ['openFile'],
          filters: [
            { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return { success: false, cancelled: true };
        }

        const filePath = result.filePaths[0];
        console.log('[ImageHandlers] Image file selected:', filePath);

        return {
          success: true,
          filePath: filePath
        };
      } catch (error) {
        console.error('[ImageHandlers] Error selecting image file:', error);
        return {
          success: false,
          error: error.message
        };
      }
    });
    console.log('[ImageHandlers] Registered select-image-file handler successfully');
  } catch (error) {
    console.error('[ImageHandlers] Error registering select-image-file handler:', error);
  }

  console.log('[ImageHandlers] Successfully registered 5 image handlers: paste-image-from-clipboard, save-image-data, copy-local-image-file, fetch-url-title, select-image-file');
}

module.exports = { register };
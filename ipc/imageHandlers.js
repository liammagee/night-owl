// === Image IPC Handlers ===
// Handles image operations including paste, save, and markdown insertion

const { ipcMain, clipboard, nativeImage } = require('electron');
const fs = require('fs').promises;
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

}

module.exports = { register };
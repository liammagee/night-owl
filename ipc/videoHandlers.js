// === Video Recording IPC Handlers ===
// Handles video recording operations in Electron

const { ipcMain, desktopCapturer, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

/**
 * Register all video recording IPC handlers
 * @param {Object} deps - Dependencies from main.js
 */
function register(deps) {
  console.log('[VIDEO] Video handlers register function called');
  const { mainWindow, appSettings } = deps;

  // Get available screen sources for recording
  ipcMain.handle('video-get-sources', async (event) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 320, height: 180 }
      });

      // Convert thumbnails to data URLs
      const sourcesWithThumbnails = sources.map(source => ({
        id: source.id,
        name: source.name,
        displayId: source.display_id,
        thumbnail: source.thumbnail.toDataURL()
      }));

      console.log('[VIDEO] Found', sources.length, 'recording sources');
      
      return {
        success: true,
        sources: sourcesWithThumbnails
      };
    } catch (error) {
      console.error('[VIDEO] Error getting sources:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Get screen sources (simplified for automatic recording)
  ipcMain.handle('get-screen-sources', async (event) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen']
      });

      // Find the main window or primary screen
      let source = sources.find(s => s.name === 'NightOwl' || s.name.includes('NightOwl'));
      if (!source) {
        source = sources.find(s => s.name === 'Entire Screen' || s.name === 'Screen 1');
      }
      if (!source) {
        source = sources[0]; // Fallback to first available
      }

      console.log('[VIDEO] Using source:', source.name);
      
      return [{
        id: source.id,
        name: source.name
      }];
    } catch (error) {
      console.error('[VIDEO] Error getting screen sources:', error);
      throw error;
    }
  });

  // Save video recording to file
  ipcMain.handle('save-video-recording', async (event, { buffer, filename, metadata }) => {
    try {
      // Get default videos directory
      const videosDir = path.join(
        require('os').homedir(),
        'Documents',
        'NightOwl',
        'Recordings'
      );

      // Create directory if it doesn't exist
      if (!fs.existsSync(videosDir)) {
        fs.mkdirSync(videosDir, { recursive: true });
      }

      const videoPath = path.join(videosDir, filename);
      const metadataPath = videoPath.replace(/\.[^.]+$/, '-metadata.json');

      // Save video file
      fs.writeFileSync(videoPath, Buffer.from(buffer));
      console.log('[VIDEO] Video saved to:', videoPath);

      // Save metadata file
      if (metadata) {
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        console.log('[VIDEO] Metadata saved to:', metadataPath);
      }

      // Show in finder/explorer
      if (process.platform === 'darwin') {
        require('child_process').exec(`open -R "${videoPath}"`);
      } else if (process.platform === 'win32') {
        require('child_process').exec(`explorer /select,"${videoPath}"`);
      }

      return {
        success: true,
        path: videoPath,
        metadataPath: metadataPath,
        size: fs.statSync(videoPath).size
      };
    } catch (error) {
      console.error('[VIDEO] Error saving recording:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Choose save location for recording
  ipcMain.handle('choose-recording-location', async (event) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Recording',
        defaultPath: path.join(
          require('os').homedir(),
          'Documents',
          `presentation-${new Date().toISOString().split('T')[0]}.webm`
        ),
        filters: [
          { name: 'WebM Video', extensions: ['webm'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled) {
        return {
          success: false,
          canceled: true
        };
      }

      return {
        success: true,
        path: result.filePath
      };
    } catch (error) {
      console.error('[VIDEO] Error choosing location:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Get recording settings
  ipcMain.handle('video-get-settings', async (event) => {
    try {
      const settings = appSettings?.video || {
        quality: 'high',
        frameRate: 30,
        audioSource: 'system',
        includeMouseCursor: true,
        autoSave: true,
        saveLocation: path.join(require('os').homedir(), 'Documents', 'NightOwl', 'Recordings')
      };

      return {
        success: true,
        settings: settings
      };
    } catch (error) {
      console.error('[VIDEO] Error getting settings:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Update recording settings
  ipcMain.handle('video-update-settings', async (event, newSettings) => {
    try {
      // Update settings in appSettings
      if (!appSettings.video) {
        appSettings.video = {};
      }
      Object.assign(appSettings.video, newSettings);

      // Save to file if we have settings persistence
      if (deps.saveSettings) {
        await deps.saveSettings();
      }

      console.log('[VIDEO] Settings updated:', newSettings);
      
      return {
        success: true,
        settings: appSettings.video
      };
    } catch (error) {
      console.error('[VIDEO] Error updating settings:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  console.log('[VIDEO] All video handlers registered successfully:');
  console.log('  - video-get-sources');
  console.log('  - get-screen-sources');
  console.log('  - save-video-recording');
  console.log('  - choose-recording-location');
  console.log('  - video-get-settings');
  console.log('  - video-update-settings');
}

module.exports = {
  register
};
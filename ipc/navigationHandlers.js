// === Navigation IPC Handlers ===
// Handles all navigation and history related IPC communication

const { ipcMain } = require('electron');

/**
 * Register all navigation IPC handlers
 * @param {Object} deps - Dependencies from main.js
 */
function register(deps) {
  const {
    appSettings,
    saveSettings
  } = deps;

  // Navigation history functions
  function saveNavigationHistory(history) {
    if (!appSettings.navigation) {
      appSettings.navigation = {};
    }
    if (!Array.isArray(history)) {
      console.warn('[NavigationHandlers] Invalid history format, expected array');
      return;
    }
    
    // Limit history size
    const maxHistoryEntries = appSettings.navigation.maxHistoryEntries || 50;
    appSettings.navigation.history = history.slice(-maxHistoryEntries);
    saveSettings();
  }

  // Add file to recent files list
  function addToRecentFiles(filePath) {
    if (!filePath) return;
    
    // Ensure recents structure exists
    if (!appSettings.recents) appSettings.recents = {};
    if (!Array.isArray(appSettings.recents.files)) appSettings.recents.files = [];
    
    // Remove if already exists
    appSettings.recents.files = appSettings.recents.files.filter(f => f.path !== filePath);
    
    // Add to beginning
    appSettings.recents.files.unshift({
      path: filePath,
      name: require('path').basename(filePath),
      lastOpened: new Date().toISOString(),
      directory: require('path').dirname(filePath)
    });
    
    // Limit size
    const maxFiles = appSettings.recents.maxFiles || 10;
    if (appSettings.recents.files.length > maxFiles) {
      appSettings.recents.files = appSettings.recents.files.slice(0, maxFiles);
    }
    
    saveSettings();
  }

  // IPC Handlers
  ipcMain.handle('save-navigation-history', (event, history) => {
    try {
      saveNavigationHistory(history);
      return { success: true };
    } catch (error) {
      console.error('[NavigationHandlers] Error saving navigation history:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('get-navigation-history', () => {
    try {
      return appSettings.navigation?.history || [];
    } catch (error) {
      console.error('[NavigationHandlers] Error getting navigation history:', error);
      return [];
    }
  });

  ipcMain.handle('add-recent-file', (event, filePath) => {
    try {
      addToRecentFiles(filePath);
      // Return files in new format (appSettings.recents.files) but maintain backward compatibility
      return appSettings.recents?.files || appSettings.recentFiles || [];
    } catch (error) {
      console.error('[NavigationHandlers] Error adding recent file:', error);
      return appSettings.recents?.files || appSettings.recentFiles || [];
    }
  });

  ipcMain.handle('get-recent-files', () => {
    try {
      // Support both new and old format for backward compatibility
      return appSettings.recents?.files || appSettings.recentFiles || [];
    } catch (error) {
      console.error('[NavigationHandlers] Error getting recent files:', error);
      return [];
    }
  });

  console.log('[NavigationHandlers] Registered 4 navigation handlers');
}

module.exports = {
  register
};
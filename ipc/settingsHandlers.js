// === Settings IPC Handlers ===
// Handles all settings-related IPC communication

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;

/**
 * Register all settings IPC handlers
 * @param {Object} deps - Dependencies from main.js
 */
function register(deps) {
  const {
    appSettings,
    defaultSettings,
    saveSettings
  } = deps;
  const aiRuntime = deps.tutorBridge || deps.aiService || null;

  const isPlainObject = (value) =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  const deepMergeSettings = (target, source) => {
    if (!isPlainObject(target) || !isPlainObject(source)) return source;
    const result = { ...target };
    for (const [key, value] of Object.entries(source)) {
      if (isPlainObject(value) && isPlainObject(target[key])) {
        result[key] = deepMergeSettings(target[key], value);
      } else {
        result[key] = value;
      }
    }
    return result;
  };

  // Keys that only the main process should change (via change-working-directory,
  // switch-workspace, etc.).  The renderer's cached copy can become stale, so
  // a full-object 'set-settings' call from the renderer must not overwrite them.
  const MAIN_PROCESS_AUTHORITATIVE_KEYS = ['workingDirectory', 'workspaceFolders'];

  const replaceSettingsInPlace = (nextSettings) => {
    // Preserve main-process-authoritative values before merging
    const preserved = {};
    for (const key of MAIN_PROCESS_AUTHORITATIVE_KEYS) {
      if (key in appSettings) {
        preserved[key] = appSettings[key];
      }
    }

    const merged = deepMergeSettings(appSettings, nextSettings);

    // Mutate in place so any other references remain valid
    Object.keys(appSettings).forEach((key) => {
      delete appSettings[key];
    });
    Object.assign(appSettings, merged);

    // Restore authoritative values the renderer should not override
    Object.assign(appSettings, preserved);
  };

  const applyAISettingsUpdates = (updates) => {
    if (!updates || !aiRuntime) return;

    if (typeof updates.localAIUrl === 'string' && typeof aiRuntime.updateLocalAIUrl === 'function') {
      try {
        aiRuntime.updateLocalAIUrl(updates.localAIUrl);
        console.log(`[SettingsHandlers] Updated Local AI URL: ${updates.localAIUrl}`);
      } catch (error) {
        console.warn('[SettingsHandlers] Could not update Local AI URL:', error);
      }
    }

    if (typeof updates.preferredProvider === 'string' && typeof aiRuntime.setDefaultProvider === 'function') {
      try {
        if (updates.preferredProvider === 'auto') {
          aiRuntime.setDefaultProvider('auto');
          console.log('[SettingsHandlers] Reset AI provider preference to auto');
          return;
        }

        if (typeof aiRuntime.getAvailableProviders === 'function') {
          const availableProviders = aiRuntime.getAvailableProviders();
          if (!availableProviders.includes(updates.preferredProvider)) {
            console.warn(`[SettingsHandlers] Ignoring unavailable AI provider: ${updates.preferredProvider}`);
            return;
          }
        }

        aiRuntime.setDefaultProvider(updates.preferredProvider);
        console.log(`[SettingsHandlers] Applied AI provider preference: ${updates.preferredProvider}`);
      } catch (error) {
        console.warn('[SettingsHandlers] Could not update AI provider:', error);
      }
    }
  };

  // Settings utility functions
  function getSettingsCategory(category) {
    return appSettings[category] || defaultSettings[category] || {};
  }

  function updateSettingsCategory(category, updates) {
    // Allow setting primitives at the top-level (e.g., theme: 'dark')
    if (!isPlainObject(updates)) {
      appSettings[category] = updates;
      saveSettings();
      return appSettings[category];
    }

    if (!isPlainObject(appSettings[category])) {
      appSettings[category] = {};
    }

    appSettings[category] = deepMergeSettings(appSettings[category], updates);
    
    saveSettings();
    
    if (category === 'ai' && updates) {
      applyAISettingsUpdates(updates);
    }
    
    return appSettings[category];
  }

  function resetSettingsCategory(category) {
    if (defaultSettings[category]) {
      appSettings[category] = JSON.parse(JSON.stringify(defaultSettings[category]));
      saveSettings();
      return appSettings[category];
    }
    return null;
  }

  function exportSettings() {
    // Return a clean copy of settings without sensitive information
    const exportData = JSON.parse(JSON.stringify(appSettings));
    
    // Remove or mask sensitive data if needed
    if (exportData.advanced && exportData.advanced.enableDebugMode !== undefined) {
      // Keep debug settings in export
    }
    
    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      settings: exportData
    };
  }

  function importSettings(importData) {
    try {
      if (!importData || !importData.settings) {
        throw new Error('Invalid settings import data');
      }
      
      const importedSettings = importData.settings;
      
      // Validate basic structure
      if (typeof importedSettings !== 'object') {
        throw new Error('Settings must be an object');
      }
      
      // Merge with current settings, preserving structure
      Object.keys(importedSettings).forEach(category => {
        if (typeof importedSettings[category] === 'object' && !Array.isArray(importedSettings[category])) {
          updateSettingsCategory(category, importedSettings[category]);
        }
      });
      
      console.log('[SettingsHandlers] Settings imported successfully');
      return { success: true, message: 'Settings imported successfully' };
    } catch (error) {
      console.error('[SettingsHandlers] Import settings error:', error);
      return { success: false, error: error.message };
    }
  }

  function getSettings(category = null) {
    if (category) {
      return appSettings[category] || {};
    }
    return appSettings;
  }

  function updateSettings(category, newSettings) {
    if (typeof category === 'string') {
      updateSettingsCategory(category, newSettings);
      return;
    }

    if (isPlainObject(category)) {
      replaceSettingsInPlace(category);
      saveSettings();
    }
    saveSettings();
    
    if (category === 'ai' && newSettings) {
      applyAISettingsUpdates(newSettings);
    }
  }

  // Main settings handlers
  ipcMain.handle('get-settings', (event, category = null) => {
    try {
      return getSettings(category);
    } catch (error) {
      console.error('[SettingsHandlers] Error in get-settings:', error);
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('set-settings', (event, category, newSettings) => {
    try {
      if (typeof category === 'string') {
        updateSettingsCategory(category, newSettings);
        return { success: true };
      }

      if (isPlainObject(category)) {
        // Legacy call: category is the full settings object
        replaceSettingsInPlace(category);
        saveSettings();
        if (isPlainObject(category.ai)) {
          applyAISettingsUpdates(category.ai);
        }
        return { success: true };
      }

      return { success: true };
    } catch (error) {
      console.error('[SettingsHandlers] Error in set-settings:', error);
      return { success: false, error: error.message };
    }
  });

  // Category-specific settings handlers
  ipcMain.handle('get-settings-category', (event, category) => {
    try {
      return getSettingsCategory(category);
    } catch (error) {
      console.error('[SettingsHandlers] Error in get-settings-category:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('update-settings-category', (event, category, updates) => {
    try {
      return updateSettingsCategory(category, updates);
    } catch (error) {
      console.error('[SettingsHandlers] Error in update-settings-category:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('reset-settings-category', (event, category) => {
    try {
      const result = resetSettingsCategory(category);
      return result !== null ? result : { success: false, error: 'Category not found' };
    } catch (error) {
      console.error('[SettingsHandlers] Error in reset-settings-category:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('export-settings', () => {
    try {
      return exportSettings();
    } catch (error) {
      console.error('[SettingsHandlers] Error in export-settings:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('import-settings', (event, importData) => {
    try {
      return importSettings(importData);
    } catch (error) {
      console.error('[SettingsHandlers] Error in import-settings:', error);
      return { success: false, error: error.message };
    }
  });

  // Style management handlers
  ipcMain.handle('load-style-file', async (event, filePath) => {
    try {
      const fullPath = path.join(__dirname, '..', filePath);
      const content = await fs.readFile(fullPath, 'utf8');
      return { success: true, content };
    } catch (error) {
      console.error('[SettingsHandlers] Error loading style file:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('save-user-styles', async (event, styles) => {
    try {
      appSettings.userStyles = styles;
      saveSettings();
      return { success: true };
    } catch (error) {
      console.error('[SettingsHandlers] Error saving user styles:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('load-user-styles', () => {
    try {
      return { success: true, styles: appSettings.userStyles || {} };
    } catch (error) {
      console.error('[SettingsHandlers] Error loading user styles:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('save-style-preferences', async (event, preferences) => {
    try {
      appSettings.stylePreferences = preferences;
      saveSettings();
      return { success: true };
    } catch (error) {
      console.error('[SettingsHandlers] Error saving style preferences:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('load-style-preferences', () => {
    try {
      return { success: true, preferences: appSettings.stylePreferences || {} };
    } catch (error) {
      console.error('[SettingsHandlers] Error loading style preferences:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[SettingsHandlers] Registered 10 settings handlers');
}

module.exports = {
  register
};

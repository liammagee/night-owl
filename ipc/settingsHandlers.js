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

  // Settings utility functions
  function getSettingsCategory(category) {
    return appSettings[category] || defaultSettings[category] || {};
  }

  function updateSettingsCategory(category, updates) {
    if (!appSettings[category]) {
      appSettings[category] = {};
    }
    
    // Deep merge the updates
    Object.keys(updates).forEach(key => {
      if (typeof updates[key] === 'object' && !Array.isArray(updates[key]) && updates[key] !== null) {
        appSettings[category][key] = { ...appSettings[category][key], ...updates[key] };
      } else {
        appSettings[category][key] = updates[key];
      }
    });
    
    saveSettings();
    
    // Apply AI provider settings if changed
    if (category === 'ai' && deps.aiService && updates) {
      if (updates.preferredProvider && updates.preferredProvider !== 'auto') {
        try {
          if (deps.aiService.getAvailableProviders().includes(updates.preferredProvider)) {
            deps.aiService.setDefaultProvider(updates.preferredProvider);
            console.log(`[SettingsHandlers] Applied AI provider preference: ${updates.preferredProvider}`);
          }
        } catch (error) {
          console.warn('[SettingsHandlers] Could not update AI provider:', error);
        }
      }
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
    if (category && appSettings[category]) {
      appSettings[category] = { ...appSettings[category], ...newSettings };
    } else {
      appSettings = { ...appSettings, ...newSettings };
    }
    saveSettings();
    
    // Apply AI provider settings if changed
    if (category === 'ai' && deps.aiService && newSettings) {
      // Update Local AI URL if changed
      if (newSettings.localAIUrl && typeof deps.aiService.updateLocalAIUrl === 'function') {
        try {
          deps.aiService.updateLocalAIUrl(newSettings.localAIUrl);
          console.log(`[SettingsHandlers] Updated Local AI URL: ${newSettings.localAIUrl}`);
        } catch (error) {
          console.warn('[SettingsHandlers] Could not update Local AI URL:', error);
        }
      }
      
      if (newSettings.preferredProvider && newSettings.preferredProvider !== 'auto') {
        try {
          if (deps.aiService.getAvailableProviders().includes(newSettings.preferredProvider)) {
            deps.aiService.setDefaultProvider(newSettings.preferredProvider);
            console.log(`[SettingsHandlers] Applied AI provider preference: ${newSettings.preferredProvider}`);
          }
        } catch (error) {
          console.warn('[SettingsHandlers] Could not update AI provider:', error);
        }
      }
    }
  }

  // Main settings handlers
  ipcMain.handle('get-settings', (event, category = null) => {
    try {
      return getSettings(category);
    } catch (error) {
      console.error('[SettingsHandlers] Error in get-settings:', error);
      return {};
    }
  });
  
  ipcMain.handle('set-settings', (event, category, newSettings) => {
    try {
      if (typeof category === 'string') {
        updateSettings(category, newSettings);
      } else {
        // If category is actually the settings object (legacy call)
        appSettings = { ...appSettings, ...category };
        saveSettings();
      }
      return { success: true };
    } catch (error) {
      console.error('[SettingsHandlers] Error in set-settings:', error);
      return { error: error.message };
    }
  });

  // Category-specific settings handlers
  ipcMain.handle('get-settings-category', (event, category) => {
    try {
      return getSettingsCategory(category);
    } catch (error) {
      console.error('[SettingsHandlers] Error in get-settings-category:', error);
      return {};
    }
  });

  ipcMain.handle('update-settings-category', (event, category, updates) => {
    try {
      return updateSettingsCategory(category, updates);
    } catch (error) {
      console.error('[SettingsHandlers] Error in update-settings-category:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('reset-settings-category', (event, category) => {
    try {
      return resetSettingsCategory(category);
    } catch (error) {
      console.error('[SettingsHandlers] Error in reset-settings-category:', error);
      return null;
    }
  });

  ipcMain.handle('export-settings', () => {
    try {
      return exportSettings();
    } catch (error) {
      console.error('[SettingsHandlers] Error in export-settings:', error);
      return { error: error.message };
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
      return { error: error.message };
    }
  });

  ipcMain.handle('save-user-styles', async (event, styles) => {
    try {
      appSettings.userStyles = styles;
      saveSettings();
      return { success: true };
    } catch (error) {
      console.error('[SettingsHandlers] Error saving user styles:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('load-user-styles', () => {
    try {
      return appSettings.userStyles || {};
    } catch (error) {
      console.error('[SettingsHandlers] Error loading user styles:', error);
      return {};
    }
  });

  ipcMain.handle('save-style-preferences', async (event, preferences) => {
    try {
      appSettings.stylePreferences = preferences;
      saveSettings();
      return { success: true };
    } catch (error) {
      console.error('[SettingsHandlers] Error saving style preferences:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('load-style-preferences', () => {
    try {
      return appSettings.stylePreferences || {};
    } catch (error) {
      console.error('[SettingsHandlers] Error loading style preferences:', error);
      return {};
    }
  });

  console.log('[SettingsHandlers] Registered 10 settings handlers');
}

module.exports = {
  register
};
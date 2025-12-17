// === [CATEGORY] IPC Handlers ===
// Description of what this module handles

const { ipcMain } = require('electron');

/**
 * Register all [category] IPC handlers
 * @param {Object} deps - Dependencies from main.js
 * @param {Object} deps.appSettings - Application settings
 * @param {Function} deps.saveSettings - Function to save settings
 * @param {BrowserWindow} deps.mainWindow - Main application window
 * @param {Object} deps.aiService - AI service instance
 * @param {String} deps.currentFilePath - Current file path
 * @param {Function} deps.setCurrentFilePath - Function to set current file
 * @param {Function} deps.buildSystemMessage - Function to build AI system message
 * @param {Function} deps.cleanAIResponse - Function to clean AI responses
 */
function register(deps) {
  const {
    appSettings,
    saveSettings,
    mainWindow,
    aiService,
    currentFilePath,
    setCurrentFilePath,
    buildSystemMessage,
    cleanAIResponse
  } = deps;

  // Example handler
  ipcMain.handle('example-handler', async (event, data) => {
    console.log('[ExampleHandlers] example-handler called with:', data);

    try {
      // Handler implementation here
      return { success: true, data: 'example response' };
    } catch (error) {
      console.error('[ExampleHandlers] Error in example-handler:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[ExampleHandlers] Registered [X] handlers');
}

module.exports = {
  register
};
// === IPC Handlers Registry ===
// Central registry for all IPC handlers organized by category

const { ipcMain } = require('electron');

// Import handler modules
const aiHandlers = require('./aiHandlers');
const fileHandlers = require('./fileHandlers');
const settingsHandlers = require('./settingsHandlers');
const exportHandlers = require('./exportHandlers');
const navigationHandlers = require('./navigationHandlers');
const searchHandlers = require('./searchHandlers');
const contextMenuHandlers = require('./contextMenuHandlers');
const ttsHandlers = require('./ttsHandlers');

/**
 * Register all IPC handlers
 * @param {Object} dependencies - Shared dependencies passed from main.js
 */
function registerAllHandlers(dependencies) {
  console.log('[IPC] Registering all IPC handlers...');
  
  try {
    // Register each category of handlers
    aiHandlers.register(dependencies);
    console.log('[IPC] AI handlers registered');
    
    fileHandlers.register(dependencies);
    console.log('[IPC] File handlers registered');
    
    settingsHandlers.register(dependencies);
    console.log('[IPC] Settings handlers registered');
    
    exportHandlers.register(dependencies);
    console.log('[IPC] Export handlers registered');
    
    navigationHandlers.register(dependencies);
    console.log('[IPC] Navigation handlers registered');
    
    searchHandlers.register(dependencies);
    console.log('[IPC] Search handlers registered');
    
    contextMenuHandlers.register(dependencies);
    console.log('[IPC] Context menu handlers registered');
    
    try {
      ttsHandlers.register(dependencies);
      console.log('[IPC] TTS handlers registered');
    } catch (error) {
      console.error('[IPC] Error registering TTS handlers:', error);
    }
    
    console.log('[IPC] All IPC handlers registered successfully');
  } catch (error) {
    console.error('[IPC] Error registering handlers:', error);
    throw error;
  }
}

/**
 * Get count of registered handlers for verification
 */
function getHandlerCount() {
  // Count all ipcMain listeners
  const eventNames = ipcMain.eventNames();
  return eventNames.length;
}

module.exports = {
  registerAllHandlers,
  getHandlerCount
};
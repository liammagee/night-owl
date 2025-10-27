// === IPC Handlers Registry ===
// Central registry for all IPC handlers organized by category

const { ipcMain } = require('electron');

// Clear module cache to ensure fresh load
delete require.cache[require.resolve('./exportHandlers')];

// Import handler modules
const aiHandlers = require('./aiHandlers');
const fileHandlers = require('./fileHandlers');
const settingsHandlers = require('./settingsHandlers');
const exportHandlers = require('./exportHandlers');
const navigationHandlers = require('./navigationHandlers');
const searchHandlers = require('./searchHandlers');
const contextMenuHandlers = require('./contextMenuHandlers');
const ttsHandlers = require('./ttsHandlers');
const videoHandlers = require('./videoHandlers');
const citationHandlers = require('./citationHandlers');
const imageHandlers = require('./imageHandlers');

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
    
    try {
      videoHandlers.register(dependencies);
      console.log('[IPC] Video recording handlers registered');
    } catch (error) {
      console.error('[IPC] Error registering video handlers:', error);
    }
    
    try {
      citationHandlers.registerCitationHandlers(dependencies.userDataPath);
      console.log('[IPC] Citation handlers registered');
    } catch (error) {
      console.error('[IPC] Error registering citation handlers:', error);
    }
    
    try {
      imageHandlers.register(dependencies);
      console.log('[IPC] Image handlers registered');
    } catch (error) {
      console.error('[IPC] Error registering image handlers:', error);
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

/**
 * Cleanup handlers on app quit
 */
function cleanupHandlers() {
  try {
    citationHandlers.cleanupCitationService();
    console.log('[IPC] Handlers cleaned up successfully');
  } catch (error) {
    console.error('[IPC] Error cleaning up handlers:', error);
  }
}

module.exports = {
  registerAllHandlers,
  getHandlerCount,
  cleanupHandlers
};
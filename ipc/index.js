// === IPC Handlers Registry ===
// Central registry for all IPC handlers organized by category

const { ipcMain } = require('electron');
const resourceLifecycle = require('../services/resourceLifecycle');
const { createDebugLogger } = require('./logging');

const debug = createDebugLogger('IPC');

// Clear module cache to ensure fresh load
delete require.cache[require.resolve('./exportHandlers')];

// Import handler modules
const aiHandlers = require('./aiHandlers');
const fileHandlers = require('./fileHandlers');
const settingsHandlers = require('./settingsHandlers');
const exportHandlers = require('./exportHandlers');
const navigationHandlers = require('./navigationHandlers');
const searchHandlers = require('./searchHandlers');
const workspaceIndexHandlers = require('./workspaceIndexHandlers');
const contextMenuHandlers = require('./contextMenuHandlers');
const ttsHandlers = require('./ttsHandlers');
const videoHandlers = require('./videoHandlers');
const citationHandlers = require('./citationHandlers');
const imageHandlers = require('./imageHandlers');
const gitHandlers = require('./gitHandlers');
const terminalHandlers = require('./terminalHandlers');
const spellcheckHandlers = require('./spellcheckHandlers');
const advancedExportHandlers = require('./advancedExportHandlers');
const staticSiteHandlers = require('./staticSiteHandlers');
const publishingProfileHandlers = require('./publishingProfileHandlers');
const performanceHandlers = require('./performanceHandlers');
const feedHandlers = require('./feedHandlers');
const pdfResearchHandlers = require('./pdfResearchHandlers');
const capabilityHealthHandlers = require('./capabilityHealthHandlers');

/**
 * Register all IPC handlers
 * @param {Object} dependencies - Shared dependencies passed from main.js
 */
function registerAllHandlers(dependencies) {
  debug('Registering all IPC handlers...');
  
  try {
    // Register each category of handlers
    workspaceIndexHandlers.register(dependencies);
    debug('Workspace index handlers registered');

    capabilityHealthHandlers.register(dependencies);
    debug('Capability health handlers registered');

    aiHandlers.register(dependencies);
    debug('AI handlers registered');
    
    fileHandlers.register(dependencies);
    debug('File handlers registered');
    
    settingsHandlers.register(dependencies);
    debug('Settings handlers registered');
    
    exportHandlers.register(dependencies);
    debug('Export handlers registered');
    
    navigationHandlers.register(dependencies);
    debug('Navigation handlers registered');
    
    searchHandlers.register(dependencies);
    debug('Search handlers registered');
    
    contextMenuHandlers.register(dependencies);
    debug('Context menu handlers registered');
    
    try {
      ttsHandlers.register(dependencies);
      debug('TTS handlers registered');
    } catch (error) {
      console.error('[IPC] Error registering TTS handlers:', error);
    }
    
    try {
      videoHandlers.register(dependencies);
      debug('Video recording handlers registered');
    } catch (error) {
      console.error('[IPC] Error registering video handlers:', error);
    }
    
    try {
      citationHandlers.registerCitationHandlers(dependencies.userDataPath);
      debug('Citation handlers registered');
    } catch (error) {
      console.error('[IPC] Error registering citation handlers:', error);
    }

    try {
      pdfResearchHandlers.register(dependencies);
      debug('PDF research handlers registered');
    } catch (error) {
      console.error('[IPC] Error registering PDF research handlers:', error);
    }
    
    try {
      imageHandlers.register(dependencies);
      debug('Image handlers registered');
    } catch (error) {
      console.error('[IPC] Error registering image handlers:', error);
    }

    try {
      gitHandlers.register(dependencies);
      debug('Git handlers registered');
    } catch (error) {
      console.error('[IPC] Error registering git handlers:', error);
    }

    try {
      terminalHandlers.register(dependencies);
      debug('Terminal handlers registered');
    } catch (error) {
      console.error('[IPC] Error registering terminal handlers:', error);
    }

    try {
      spellcheckHandlers.register(dependencies);
      debug('Spellcheck handlers registered');
    } catch (error) {
      console.error('[IPC] Error registering spellcheck handlers:', error);
    }

    try {
      advancedExportHandlers.register(dependencies);
      debug('Advanced export handlers registered');
    } catch (error) {
      console.error('[IPC] Error registering advanced export handlers:', error);
    }

    try {
      staticSiteHandlers.register(dependencies);
      debug('Static site handlers registered');
    } catch (error) {
      console.error('[IPC] Error registering static site handlers:', error);
    }

    try {
      publishingProfileHandlers.register(dependencies);
      debug('Publishing profile handlers registered');
    } catch (error) {
      console.error('[IPC] Error registering publishing profile handlers:', error);
    }

    try {
      performanceHandlers.register({
        ...dependencies,
        getResourceDiagnostics: () => ({
          lifecycle: resourceLifecycle.getDiagnostics(),
          handlers: {
            feed: feedHandlers.getDiagnostics(),
            file: fileHandlers.getDiagnostics(),
            workspaceIndex: workspaceIndexHandlers.getDiagnostics(),
            terminal: terminalHandlers.getDiagnostics()
          }
        })
      });
      debug('Performance handlers registered');
    } catch (error) {
      console.error('[IPC] Error registering performance handlers:', error);
    }

    try {
      feedHandlers.register(dependencies);
      debug('Research-feed handlers registered');
    } catch (error) {
      console.error('[IPC] Error registering research-feed handlers:', error);
    }

    debug('All IPC handlers registered successfully');
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
    workspaceIndexHandlers.cleanup();
  } catch (error) {
    console.error('[IPC] Error cleaning up workspace index handlers:', error);
  }
  try {
    fileHandlers.cleanup();
  } catch (error) {
    console.error('[IPC] Error cleaning up file handlers:', error);
  }
  try {
    terminalHandlers.cleanup();
  } catch (error) {
    console.error('[IPC] Error cleaning up terminal handlers:', error);
  }
  try {
    citationHandlers.cleanupCitationService();
    debug('Handlers cleaned up successfully');
  } catch (error) {
    console.error('[IPC] Error cleaning up handlers:', error);
  }
  try {
    feedHandlers.cleanup();
  } catch (error) {
    console.error('[IPC] Error cleaning up research-feed handlers:', error);
  }
}

module.exports = {
  registerAllHandlers,
  getHandlerCount,
  cleanupHandlers
};

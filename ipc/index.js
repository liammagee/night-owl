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
const presentationFileHandlers = require('./presentationFileHandlers');

/**
 * Register handler groups independently so an optional subsystem cannot leave
 * the renderer without unrelated settings, file, or diagnostics channels.
 */
function registerHandlerGroups(groups) {
  const failures = [];
  for (const group of groups) {
    try {
      group.register();
      debug(`${group.label} handlers registered`);
    } catch (error) {
      failures.push({ label: group.label, error });
      console.error(`[IPC] Error registering ${group.label} handlers:`, error);
    }
  }
  return {
    success: failures.length === 0,
    registered: groups.length - failures.length,
    failures
  };
}

/**
 * Register all IPC handlers
 * @param {Object} dependencies - Shared dependencies passed from main.js
 */
function registerAllHandlers(dependencies) {
  debug('Registering all IPC handlers...');
  const result = registerHandlerGroups([
    { label: 'Workspace index', register: () => workspaceIndexHandlers.register(dependencies) },
    { label: 'Capability health', register: () => capabilityHealthHandlers.register(dependencies) },
    { label: 'AI', register: () => aiHandlers.register(dependencies) },
    { label: 'File', register: () => fileHandlers.register(dependencies) },
    { label: 'Settings', register: () => settingsHandlers.register(dependencies) },
    { label: 'Export', register: () => exportHandlers.register(dependencies) },
    { label: 'Navigation', register: () => navigationHandlers.register(dependencies) },
    { label: 'Search', register: () => searchHandlers.register(dependencies) },
    { label: 'Context menu', register: () => contextMenuHandlers.register(dependencies) },
    { label: 'TTS', register: () => ttsHandlers.register(dependencies) },
    { label: 'Video recording', register: () => videoHandlers.register(dependencies) },
    { label: 'Citation', register: () => citationHandlers.registerCitationHandlers(dependencies.userDataPath) },
    { label: 'PDF research', register: () => pdfResearchHandlers.register(dependencies) },
    { label: 'PowerPoint files', register: () => presentationFileHandlers.register(dependencies) },
    { label: 'Image', register: () => imageHandlers.register(dependencies) },
    { label: 'Git', register: () => gitHandlers.register(dependencies) },
    { label: 'Terminal', register: () => terminalHandlers.register(dependencies) },
    { label: 'Spellcheck', register: () => spellcheckHandlers.register(dependencies) },
    { label: 'Advanced export', register: () => advancedExportHandlers.register(dependencies) },
    { label: 'Static site', register: () => staticSiteHandlers.register(dependencies) },
    { label: 'Publishing profile', register: () => publishingProfileHandlers.register(dependencies) },
    {
      label: 'Performance',
      register: () => performanceHandlers.register({
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
      })
    },
    { label: 'Research-feed', register: () => feedHandlers.register(dependencies) }
  ]);

  if (result.success) {
    debug('All IPC handlers registered successfully');
  } else {
    console.error(`[IPC] ${result.failures.length} handler group(s) failed; ${result.registered} remain available.`);
  }
  return result;
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
  registerHandlerGroups,
  getHandlerCount,
  cleanupHandlers
};

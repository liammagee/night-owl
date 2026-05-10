const { contextBridge, ipcRenderer } = require('electron');
const {
  createGuardedIpcBridge,
  removeAllAllowedListeners
} = require('./preload-ipc-guard');

const guardedIpc = createGuardedIpcBridge(ipcRenderer);

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Two-way communication (Renderer -> Main -> Renderer)
  invoke: guardedIpc.invoke,
  
  // One-way communication (Main -> Renderer)
  on: guardedIpc.on,
  
  // Renderer -> Main (one-way)
  send: guardedIpc.send,

  // Save image to current directory
  saveImageToCurrentDir: async (filename, base64data) => {
    try {
      return await ipcRenderer.invoke('save-image-to-current-dir', filename, base64data);
    } catch (error) {
      console.error('Error saving image:', error);
      return { success: false, error: error.message };
    }
  },

  // Presentation-specific file operations
  loadPresentationFile: (callback) => {
    return guardedIpc.on('load-presentation-file', (content, filePath, error) => {
      callback(content, filePath, error);
    });
  },

  // Navigation controls from menu
  onNextSlide: (callback) => {
    return guardedIpc.on('next-slide', callback);
  },

  onPreviousSlide: (callback) => {
    return guardedIpc.on('previous-slide', callback);
  },

  onFirstSlide: (callback) => {
    return guardedIpc.on('first-slide', callback);
  },

  // Presentation controls
  onStartPresentation: (callback) => {
    return guardedIpc.on('start-presentation', callback);
  },

  onExitPresentation: (callback) => {
    return guardedIpc.on('exit-presentation', callback);
  },

  onTogglePresentationMode: (callback) => {
    return guardedIpc.on('toggle-presentation-mode', callback);
  },

  onShowPresentationStatistics: (callback) => {
    return guardedIpc.on('show-presentation-statistics', callback);
  },

  onLoadPresentationContent: (callback) => {
    return guardedIpc.on('load-presentation-content', (content) => {
      callback(content);
    });
  },

  onSwitchToPresentation: (callback) => {
    return guardedIpc.on('switch-to-presentation', callback);
  },

  onSwitchToEditor: (callback) => {
    return guardedIpc.on('switch-to-editor', callback);
  },

  onSwitchToNetwork: (callback) => {
    return guardedIpc.on('switch-to-network', callback);
  },

  onFormatText: (callback) => {
    return guardedIpc.on('format-text', (data) => {
      callback(data);
    });
  },

  // Zoom controls
  onZoomIn: (callback) => {
    return guardedIpc.on('zoom-in', callback);
  },

  onZoomOut: (callback) => {
    return guardedIpc.on('zoom-out', callback);
  },

  onResetZoom: (callback) => {
    return guardedIpc.on('reset-zoom', callback);
  },

  // Layout changes
  onChangeLayout: (callback) => {
    return guardedIpc.on('change-layout', (layout) => {
      callback(layout);
    });
  },
  
  // Gamification panel toggle
  onToggleGamificationPanel: (callback) => {
    return guardedIpc.on('toggle-gamification-panel', callback);
  },

  // Visual Markdown toggle
  onToggleVisualMarkdown: (callback) => {
    return guardedIpc.on('toggle-visual-markdown', (enabled) => {
      callback(enabled);
    });
  },

  onTogglePreviewPane: (callback) => {
    return guardedIpc.on('toggle-preview-pane', (visible) => {
      callback(visible);
    });
  },

  // PDF Import trigger
  onTriggerImportPdf: (callback) => {
    return guardedIpc.on('trigger-import-pdf', callback);
  },

  // Word Import trigger
  onTriggerImportWord: (callback) => {
    return guardedIpc.on('trigger-import-word', callback);
  },

  // Thumbnail generation trigger
  onTriggerGenerateThumbnail: (callback) => {
    return guardedIpc.on('trigger-generate-thumbnail', callback);
  },

  // Utility functions
  isElectron: true,
  platform: process.platform,
  
  // Remove all listeners (cleanup)
  removeAllListeners: () => {
    removeAllAllowedListeners(ipcRenderer);
  }
});

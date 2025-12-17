console.log('[preload.js] Script executing...');

const { contextBridge, ipcRenderer } = require('electron');

console.log('[preload.js] electronAPI exposed via contextBridge (attempted).');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Two-way communication (Renderer -> Main -> Renderer)
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  
  // One-way communication (Main -> Renderer)
  on: (channel, listener) => {
    const subscription = (event, ...args) => listener(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
        ipcRenderer.removeListener(channel, subscription);
    };
  },
  
  // Renderer -> Main (one-way)
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),

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
    ipcRenderer.on('load-presentation-file', (_, content, filePath, error) => {
      callback(content, filePath, error);
    });
  },

  // Navigation controls from menu
  onNextSlide: (callback) => {
    ipcRenderer.on('next-slide', callback);
  },

  onPreviousSlide: (callback) => {
    ipcRenderer.on('previous-slide', callback);
  },

  onFirstSlide: (callback) => {
    ipcRenderer.on('first-slide', callback);
  },

  // Presentation controls
  onStartPresentation: (callback) => {
    ipcRenderer.on('start-presentation', callback);
  },

  onExitPresentation: (callback) => {
    ipcRenderer.on('exit-presentation', callback);
  },

  onTogglePresentationMode: (callback) => {
    ipcRenderer.on('toggle-presentation-mode', callback);
  },

  onShowPresentationStatistics: (callback) => {
    ipcRenderer.on('show-presentation-statistics', callback);
  },

  onLoadPresentationContent: (callback) => {
    ipcRenderer.on('load-presentation-content', (_, content) => {
      callback(content);
    });
  },

  onSwitchToPresentation: (callback) => {
    ipcRenderer.on('switch-to-presentation', callback);
  },

  onSwitchToEditor: (callback) => {
    ipcRenderer.on('switch-to-editor', callback);
  },

  onSwitchToNetwork: (callback) => {
    ipcRenderer.on('switch-to-network', callback);
  },

  onFormatText: (callback) => {
    ipcRenderer.on('format-text', (event, data) => {
      callback(data);
    });
  },

  // Zoom controls
  onZoomIn: (callback) => {
    ipcRenderer.on('zoom-in', callback);
  },

  onZoomOut: (callback) => {
    ipcRenderer.on('zoom-out', callback);
  },

  onResetZoom: (callback) => {
    ipcRenderer.on('reset-zoom', callback);
  },

  // Layout changes
  onChangeLayout: (callback) => {
    ipcRenderer.on('change-layout', (_, layout) => {
      callback(layout);
    });
  },
  
  // Gamification panel toggle
  onToggleGamificationPanel: (callback) => {
    ipcRenderer.on('toggle-gamification-panel', callback);
  },

  // Visual Markdown toggle
  onToggleVisualMarkdown: (callback) => {
    ipcRenderer.on('toggle-visual-markdown', (_, enabled) => {
      callback(enabled);
    });
  },

  // Utility functions
  isElectron: true,
  platform: process.platform,
  
  // Remove all listeners (cleanup)
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('load-presentation-file');
    ipcRenderer.removeAllListeners('next-slide');
    ipcRenderer.removeAllListeners('previous-slide');
    ipcRenderer.removeAllListeners('first-slide');
    ipcRenderer.removeAllListeners('start-presentation');
    ipcRenderer.removeAllListeners('exit-presentation');
    ipcRenderer.removeAllListeners('toggle-presentation-mode');
    ipcRenderer.removeAllListeners('load-presentation-content');
    ipcRenderer.removeAllListeners('switch-to-presentation');
    ipcRenderer.removeAllListeners('switch-to-editor');
    ipcRenderer.removeAllListeners('switch-to-network');
    ipcRenderer.removeAllListeners('format-text');
    ipcRenderer.removeAllListeners('zoom-in');
    ipcRenderer.removeAllListeners('zoom-out');
    ipcRenderer.removeAllListeners('reset-zoom');
    ipcRenderer.removeAllListeners('change-layout');
    ipcRenderer.removeAllListeners('toggle-gamification-panel');
    ipcRenderer.removeAllListeners('toggle-visual-markdown');
  }
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('[preload.js] DOM fully loaded and parsed');
});

console.log('[preload.js] Attempting to replace text for version info...');
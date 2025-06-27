const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  loadMarkdownFile: (callback) => {
    ipcRenderer.on('load-markdown-file', (_, content, filePath, error) => {
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

  // Utility functions
  isElectron: true,
  platform: process.platform,
  
  // Remove all listeners (cleanup)
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('load-markdown-file');
    ipcRenderer.removeAllListeners('next-slide');
    ipcRenderer.removeAllListeners('previous-slide');
    ipcRenderer.removeAllListeners('first-slide');
    ipcRenderer.removeAllListeners('start-presentation');
    ipcRenderer.removeAllListeners('exit-presentation');
    ipcRenderer.removeAllListeners('zoom-in');
    ipcRenderer.removeAllListeners('zoom-out');
    ipcRenderer.removeAllListeners('reset-zoom');
    ipcRenderer.removeAllListeners('change-layout');
  }
});
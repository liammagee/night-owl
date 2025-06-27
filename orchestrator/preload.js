console.log('[preload.js] Script executing...');

// preload.js

// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.

const { contextBridge, ipcRenderer } = require('electron');

console.log('[preload.js] electronAPI exposed via contextBridge (attempted).');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Two-way communication (Renderer -> Main -> Renderer)
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  // One-way communication (Main -> Renderer)
  on: (channel, listener) => {
    // Deliberately strip event as it includes `sender` 
    const subscription = (event, ...args) => listener(...args);
    ipcRenderer.on(channel, subscription);
    // Return an unsubscribe function to prevent memory leaks
    return () => {
        ipcRenderer.removeListener(channel, subscription);
    };
  },
  // Renderer -> Main (one-way)
  send: (channel, ...args) => ipcRenderer.send(channel, ...args)
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('[preload.js] DOM fully loaded and parsed');
}); 

console.log('[preload.js] Attempting to replace text for version info...');
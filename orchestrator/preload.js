
// preload.js

// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.

const { contextBridge, ipcRenderer } = require('electron');
const { createGuardedIpcBridge } = require('../preload-ipc-guard');

const guardedIpc = createGuardedIpcBridge(ipcRenderer);


// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Two-way communication (Renderer -> Main -> Renderer)
  invoke: guardedIpc.invoke,
  // One-way communication (Main -> Renderer)
  on: guardedIpc.on,
  // Renderer -> Main (one-way)
  send: guardedIpc.send
});

window.addEventListener('DOMContentLoaded', () => {
}); 

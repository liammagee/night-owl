
// preload.js

// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.

const { contextBridge, ipcRenderer } = require('electron');
const { createCapabilityApi } = require('../preload-ipc-guard');

contextBridge.exposeInMainWorld('electronAPI', createCapabilityApi(ipcRenderer));

window.addEventListener('DOMContentLoaded', () => {
}); 

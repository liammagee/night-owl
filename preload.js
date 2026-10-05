const { contextBridge, ipcRenderer } = require('electron');
const { createCapabilityApi } = require('./preload-ipc-guard');

// Only fixed capability methods cross the isolated-world boundary. The renderer
// never receives ipcRenderer or a string-based invoke/on/send escape hatch.
contextBridge.exposeInMainWorld('electronAPI', createCapabilityApi(ipcRenderer));

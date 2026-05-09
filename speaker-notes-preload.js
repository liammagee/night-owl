const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('speakerNotesAPI', {
  onUpdateSpeakerNotes: (listener) => {
    const subscription = (_event, data) => listener(data);
    ipcRenderer.on('update-speaker-notes', subscription);
    return () => {
      ipcRenderer.removeListener('update-speaker-notes', subscription);
    };
  }
});

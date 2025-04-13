const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  loadSessions: () => ipcRenderer.invoke('load-sessions'),
  updateSession: (id, field, value) => ipcRenderer.invoke('update-session', id, field, value),
});
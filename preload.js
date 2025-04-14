const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  loadSessions: () => ipcRenderer.invoke('load-sessions'),
  updateSession: (id, field, value) => ipcRenderer.invoke('update-session', id, field, value),
  // Project-related methods
  loadProjects: () => ipcRenderer.invoke('load-projects'),
  addProject: (name) => ipcRenderer.invoke('add-project', name),
  deleteProject: (id) => ipcRenderer.invoke('delete-project', id),
});
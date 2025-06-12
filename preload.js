const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  loadSessions: () => ipcRenderer.invoke('load-sessions'),
  updateSession: (id, field, value) => ipcRenderer.invoke('update-session', id, field, value),
  deleteSession: (id) => ipcRenderer.invoke('delete-session', id), // Add this line
  // Project-related methods
  loadProjects: () => ipcRenderer.invoke('load-projects'),
  addProject: (projectData) => ipcRenderer.invoke('add-project', projectData),
  deleteProject: (id) => ipcRenderer.invoke('delete-project', id),
  updateProjectColor: (id, color) => ipcRenderer.invoke('update-project-color', id, color),
  // Add the new handler
  getComparisonStats: () => ipcRenderer.invoke('get-comparison-stats'),
  // Add the new method here
  getProjectNames: () => ipcRenderer.invoke('get-project-names'),
});

// Window ID storage
let myWindowId = null;
const onReadyCallbacks = [];

// Listen for the window ID to be sent from the main process
ipcRenderer.on('set-window-id', (event, id) => {
  myWindowId = id;
  console.log('Preload received window ID:', id);
  // Execute any callbacks waiting for the window ID
  onReadyCallbacks.forEach(fn => fn());
});

// Expose the electronNotesApi to the renderer
contextBridge.exposeInMainWorld('electronNotesApi', {
  submitNotes: (notes) => {
    if (myWindowId) {
      const responseChannel = `notes-response-${myWindowId}`;
      ipcRenderer.send(responseChannel, notes);
    } else {
      console.error("Window ID not set in preload, cannot submit notes.");
    }
  },
  onReady: (callback) => {
    if (myWindowId) {
      callback();
    } else {
      onReadyCallbacks.push(callback);
    }
  }
});

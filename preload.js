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
  // Function to submit notes
  submitNotes: (notes) => {
    if (myWindowId) {
      const responseChannel = `notes-response-${myWindowId}`;
      ipcRenderer.send(responseChannel, notes);
    } else {
      console.error("Window ID not set in preload, cannot submit notes.");
    }
  },
  // Callback for when the window ID is ready
  onReady: (callback) => {
    if (myWindowId) {
      callback(); // If ready, call immediately
    } else {
      onReadyCallbacks.push(callback); // Otherwise, queue the callback
    }
  }
});
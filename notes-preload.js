const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronNotesApi', {
    // Function called by the notes dialog renderer to send notes back to main
    submitNotes: (notes) => {
        // Send notes back on a channel unique to this window
        const responseChannel = `notes-response-${ipcRenderer.sendSync('get-webcontents-id')}`; // Hacky way to get ID sync
        ipcRenderer.send(responseChannel, notes);
    }
});

// Need to get the webContents ID to construct the channel.
// A slightly hacky synchronous way:
ipcRenderer.sendSync = (channel) => {
    if (channel === 'get-webcontents-id') {
        return require('electron').remote.getCurrentWebContents().id; // Requires enableRemoteModule - less ideal
        // Alternative: Pass ID via query param in loadURL or initial IPC message
    }
};
// IMPORTANT: Using require('electron').remote requires enableRemoteModule: true in the BrowserWindow webPreferences.
// This is generally discouraged. A better way is to have main process TELL the window its ID
// via webContents.send after creation, or pass it as a query parameter in the data URL.

// Let's try passing via an initial IPC message ( cleaner approach ):
// Modify the 'submitNotes' function and remove the sync hack.
let myWindowId = null;
ipcRenderer.on('set-window-id', (event, id) => {
    myWindowId = id;
    console.log('Preload received window ID:', id);
});
contextBridge.exposeInMainWorld('electronNotesApi', {
    submitNotes: (notes) => {
        if (myWindowId) {
             const responseChannel = `notes-response-${myWindowId}`;
             ipcRenderer.send(responseChannel, notes);
        } else {
             console.error("Window ID not set in preload, cannot submit notes.");
        }
    }
});
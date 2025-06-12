// Main application entry point.
// This file is kept minimal, initializing the application lifecycle from the dedicated module.

const { initializeAppLifecycle } = require('./src/main/app-lifecycle');
const { app, ipcMain } = require('electron');
const { deleteSession } = require('./src/main/data-manager');

// Add certificate error handler
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});

// Add IPC handlers
ipcMain.handle('delete-session', async (event, id) => {
    try {
        const result = await deleteSession(id);
        return { success: true };
    } catch (error) {
        console.error('[Main] Error in delete-session handler:', error);
        throw error;
    }
});

// Initialize the application
initializeAppLifecycle();

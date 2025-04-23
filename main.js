// Main application entry point.
// This file is kept minimal, initializing the application lifecycle from the dedicated module.

const { initializeAppLifecycle } = require('./src/main/app-lifecycle');
const { app } = require('electron');

// Add certificate error handler
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});

// Initialize the application
initializeAppLifecycle();

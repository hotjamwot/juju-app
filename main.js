// Main application entry point.
// This file is kept minimal, initializing the application lifecycle from the dedicated module.

const { initializeAppLifecycle } = require('./src/main/app-lifecycle');

// Initialize the application
initializeAppLifecycle();

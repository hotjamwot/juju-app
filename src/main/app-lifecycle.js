const { app, BrowserWindow } = require('electron');
const dataManager = require('./data-manager');
const windowManager = require('./window-manager');
const { registerIpcHandlers } = require('./ipc-handlers');
const shortcuts = require('./shortcuts');
const { createTray } = require('../../tray'); // Adjust path relative to this file

let trayInstance = null; // Keep tray instance internal to this module

function initializeAppLifecycle() {
  // --- Platform Specific Setup ---
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  app.whenReady().then(async () => {
    // Step 1: Ensure data files exist using the Data Manager
    await dataManager.ensureDataFilesExist();
    console.log('Data file path:', dataManager.DATA_FILE_PATH);
    console.log('Projects file path:', dataManager.PROJECTS_FILE_PATH);

    // Step 2: Register IPC Handlers
    registerIpcHandlers();

    // Step 3: Define the API object that tray.js will use
    const mainApiForTray = {
      loadProjects: dataManager.loadAndMigrateProjects,
      saveSession: dataManager.saveSession,
      showNotesDialog: windowManager.showNotesDialog,
      createDashboardWindow: windowManager.createDashboardWindow,
      createProjectManagerWindow: windowManager.createProjectManagerWindow
    };

    // Step 4: Call createTray, passing the API object, and AWAIT the result
    console.log("[App Lifecycle] Creating tray instance...");
    trayInstance = await createTray(mainApiForTray);

    if (!trayInstance) {
        console.error("[App Lifecycle] Failed to create tray instance! Check tray.js logs. Exiting.");
        app.quit();
        return;
    }
    console.log("[App Lifecycle] Tray instance created.");

    // Step 5: Register global shortcut using the shortcuts module
    shortcuts.registerGlobalShortcut(trayInstance);
  });

  app.on('will-quit', () => {
    // Unregister shortcuts using the shortcuts module
    shortcuts.unregisterGlobalShortcuts();
  });

  // Quit the app when all windows are closed (except on macOS)
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  // On macOS, re-create a window when the dock icon is clicked and no windows are open
  app.on('activate', () => {
    // Use BrowserWindow.getAllWindows().length to check if any windows are open.
    if (BrowserWindow.getAllWindows().length === 0) {
      // Re-create the dashboard window if no other windows are open
      windowManager.createDashboardWindow();
    }
  });

  console.log("[App Lifecycle] Initialized.");
}

module.exports = {
  initializeAppLifecycle,
};

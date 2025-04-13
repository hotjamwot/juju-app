const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createTray } = require('./tray');

// Keep a global reference of windows
let dashboardWindow = null;

// Hide dock icon on Mac
if (process.platform === 'darwin') {
  app.dock.hide();
}

// Create the dashboard window
function createDashboardWindow() {
  if (dashboardWindow) {
    dashboardWindow.focus();
    return dashboardWindow;
  }
  
  dashboardWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // Protection from prototype pollution
      nodeIntegration: false  // Enhanced security
    }
  });
  
  dashboardWindow.loadFile('dashboard.html');
  
  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });
  
  return dashboardWindow;
}

// Create tray when Electron is ready
app.whenReady().then(() => {
  createTray(createDashboardWindow);
});

// Quit the app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// On macOS, create a new window when the icon is clicked and no windows are open
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createDashboardWindow();
  }
});
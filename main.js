const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { createTray} = require('./tray');
const fs = require('fs');


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
// Start global shortcut  
const trayInstance = createTray(createDashboardWindow); // Make sure you're capturing the return value

  // Register the global shortcut
  const ret = globalShortcut.register('Shift+Option+Command+J', () => {
    if (trayInstance) {
      trayInstance.popUpContextMenu(); // This will open the context menu
    }
  });

  if (!ret) {
    console.log('Global shortcut registration failed.');
  }
  createTray(createDashboardWindow);
});

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
});

// Load sessions from CSV

ipcMain.handle('load-sessions', async () => {
  try {
    const CSV_PATH = path.join(__dirname, 'data.csv');
    const data = fs.readFileSync(CSV_PATH, 'utf8');
    return data;
  } catch (error) {
    console.error('Error loading sessions:', error);
    return '';
  }

try {
    const csvData = fs.readFileSync(CSV_PATH, 'utf8');
    const rows = csvData.trim().split('\n');
    
    // Skip header row
    if (rows.length <= 1) {
      return [];
    }
    
    const headers = rows[0].split(',');
    const sessions = [];
    
    // Parse CSV rows
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      
      // Handle quoted fields that might contain commas
      const values = [];
      let inQuotes = false;
      let currentValue = '';
      
      for (let j = 0; j < row.length; j++) {
        const char = row[j];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(currentValue);
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      
      // Add the last value
      values.push(currentValue);
      
      // Create session object
      const session = {};
      headers.forEach((header, index) => {
        // Handle the case where there might be extra commas in quoted fields
        if (index < values.length) {
          // Strip quotes from quoted fields
          let value = values[index];
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
          }
          session[header] = value;
        }
      });
      
      // Convert duration to number
      if (session.duration_minutes) {
        session.duration_minutes = parseInt(session.duration_minutes);
      }
      
      sessions.push(session);
    }
    
    return sessions;
  } catch (error) {
    console.error('Error loading sessions:', error);
    throw new Error('Failed to load sessions data');
  }
});

// Update session in CSV
ipcMain.handle('update-session', async (event, id, field, value) => {
  try {
    // Load all sessions
    const sessions = await ipcMain.handlers['load-sessions']();
    
    // Update the specified session
    if (id >= 0 && id < sessions.length) {
      sessions[id][field] = value;
      
      // Rewrite CSV file
      const headers = Object.keys(sessions[0]);
      const csvContent = [
        headers.join(','),
        ...sessions.map(session => {
          return headers.map(header => {
            // Wrap values with commas in quotes
            const value = session[header] || '';
            return value.toString().includes(',') ? `"${value}"` : value;
          }).join(',');
        })
      ].join('\n');
      
      fs.writeFileSync(CSV_PATH, csvContent);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error updating session:', error);
    throw new Error('Failed to update session');
  }
});

// Create dashboard window function
function createDashboard() {
  if (dashboardWindow) {
    dashboardWindow.focus();
    return;
  }
  
  dashboardWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  
  dashboardWindow.loadFile('dashboard.html');
  
  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });
}

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
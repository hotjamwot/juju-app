const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { createTray} = require('./tray');
const fs = require('fs');
const fsPromises = fs.promises;

// Keep a global reference of windows
let dashboardWindow = null;

// Hide dock icon on Mac
if (process.platform === 'darwin') {
  app.dock.hide();
}

// Get the user data directory path
const userDataPath = path.join(app.getPath('userData'), 'juju');
const dataFilePath = path.join(userDataPath, 'data.csv');

// Create the directory if it doesn't exist
function ensureDirectoryExists() {
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  
  // If data.csv doesn't exist in the user data directory, create it or copy from the app
  if (!fs.existsSync(dataFilePath)) {
    // Default empty data.csv or copy from your app resources
    const defaultDataPath = path.join(__dirname, 'data.csv');
    if (fs.existsSync(defaultDataPath)) {
      fs.copyFileSync(defaultDataPath, dataFilePath);
    } else {
      fs.writeFileSync(dataFilePath, ''); // Create empty file
    }
  }
}

// Create the dashboard window
function createDashboardWindow() {
  if (dashboardWindow) {
    dashboardWindow.focus();
    return dashboardWindow;
  }
  
  dashboardWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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
  ensureDirectoryExists();
  console.log('Data file path (should be in user data):', dataFilePath);
  console.log('Directory exists:', fs.existsSync(path.dirname(dataFilePath)));
  console.log('File exists:', fs.existsSync(dataFilePath));
  
  // Start global shortcut  
  const trayInstance = createTray(createDashboardWindow);

  // Register the global shortcut
  const ret = globalShortcut.register('Shift+Option+Command+J', () => {
    if (trayInstance) {
      trayInstance.popUpContextMenu();
    }
  });

  if (!ret) {
    console.log('Global shortcut registration failed.');
  }
});

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
});

// Load sessions from CSV function
async function loadSessionsFromCSV() {
  const CSV_PATH = dataFilePath; 
  try {
    const csvData = await fsPromises.readFile(CSV_PATH, 'utf8');
    const rows = csvData.trim().split('\n');

    if (rows.length <= 1) {
      return [];
    }

    const headers = rows[0].split(',');
    const sessions = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
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
      values.push(currentValue);

      const session = {};
      headers.forEach((header, index) => {
        if (index < values.length) {
          let value = values[index];
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
          }
          session[header] = value;
        }
      });

      // Add row index as id for reference
      session.id = i - 1;
      
      // Convert duration_minutes to number for calculations
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
}

// Load sessions call
ipcMain.handle('load-sessions', async () => {
  return await loadSessionsFromCSV();
});

// Update session in CSV
ipcMain.handle('update-session', async (event, id, field, value) => {
  const CSV_PATH = dataFilePath;
  try {
    // Convert id to number to ensure proper comparison
    id = parseInt(id, 10);
    console.log(`Updating session ${id}, field: ${field}, value: ${value}`);
    
    // Load all sessions
    const sessions = await loadSessionsFromCSV();
    console.log('Loaded sessions count:', sessions.length);
    
    // Find session by id
    const sessionIndex = sessions.findIndex(s => s.id === id);
    
    if (sessionIndex === -1) {
      console.error('Session not found with ID:', id);
      return false;
    }
    
    // Update the field in the session object
    sessions[sessionIndex][field] = value;
    console.log('Updated session object:', sessions[sessionIndex]);
    
    // Create CSV content
    const headers = Object.keys(sessions[0]).filter(key => key !== 'id'); // Exclude the id field we added
    const csvContent = [
      headers.join(','),
      ...sessions.map(session => {
        return headers.map(header => {
          const value = session[header] || '';
          // Properly quote values with commas
          return value.toString().includes(',') ? `"${value}"` : value;
        }).join(',');
      })
    ].join('\n');

    // Write to file with promise to ensure completion
    console.log('Writing to file:', CSV_PATH);
    await fsPromises.writeFile(CSV_PATH, csvContent, 'utf8');
    
    console.log(`Successfully updated session ${id}, field: ${field}`);
    return true;
  } catch (error) {
    console.error('Error updating session:', error.message, error.stack);
    throw new Error('Failed to update session: ' + error.message);
  }
});

// Create dashboard window function
function createDashboard() {
  if (dashboardWindow) {
    dashboardWindow.focus();
    return;
  }
  
  dashboardWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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
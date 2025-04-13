const { Tray, Menu, app, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// File paths
const CSV_PATH = path.join(__dirname, 'data.csv');
const PROJECTS_PATH = path.join(__dirname, 'projects.json');
const ICON_IDLE_PATH = path.join(__dirname, 'assets', 'icon-idle.png');
const ICON_ACTIVE_PATH = path.join(__dirname, 'assets', 'icon-active.png');

// Global variables
let tray = null;
let isSessionActive = false;
let currentProject = null;
let sessionStartTime = null;
let createDashboardFn = null;

// Format duration nicely:
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
}

// Make sure our data files exist
function ensureFiles() {
  // Create CSV file if it doesn't exist
  if (!fs.existsSync(CSV_PATH)) {
    fs.writeFileSync(CSV_PATH, 'date,start_time,end_time,duration_minutes,project,notes\n');
  }
  
  // Create projects file if it doesn't exist
  if (!fs.existsSync(PROJECTS_PATH)) {
    const defaultProjects = [
      { name: "Writing" },
      { name: "Research" },
      { name: "Editing" }
    ];
    fs.writeFileSync(PROJECTS_PATH, JSON.stringify(defaultProjects, null, 2));
  }
}

// Get the list of projects
function getProjects() {
  try {
    const data = fs.readFileSync(PROJECTS_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading projects:', error);
    return [];
  }
}

// Create the tray icon and menu
function createTray(dashboardCreator) {
  ensureFiles();
  createDashboardFn = dashboardCreator;
  
  if (!tray) {
  // Use the idle icon initially
  tray = new Tray(ICON_IDLE_PATH);
  // Show menu on click
  tray.on('click', () => {
    tray.popUpContextMenu();
  });
  
  tray.on('right-click', () => {
    tray.popUpContextMenu()
  });
  
  updateTrayMenu();
  } else {
    updateTrayMenu(); // Still update menut if tray already exists
  }  
  
  return tray;
}

function startSession(project) {
  if (isSessionActive) {
    return;
  }

  currentProject = project;
  isSessionActive = true;
  sessionStartTime = new Date(); // Change this line
  
  // Change the icon to active
  if (tray) {
    tray.setImage(ICON_ACTIVE_PATH);
  }

  updateTrayMenu();
  console.log('Session started:', { project: currentProject, time: sessionStartTime });
}

// End the current session and log it
function endSession(notes = "") {
  if (!isSessionActive) return;

  console.log('Ending session, currentProject:', currentProject); // Add this line

  const endTime = new Date();
  const durationMinutes = Math.round((endTime - sessionStartTime) / 60000);

  // Format for CSV
  const date = sessionStartTime.toISOString().split('T')[0];
  const startTimeStr = sessionStartTime.toTimeString().split(' ')[0];
  const endTimeStr = endTime.toTimeString().split(' ')[0];

  // Sanitize notes for CSV (replace any double quotes with two double quotes)
  const sanitizedNotes = notes.replace(/"/g, '""');

  // Create CSV line with the notes field
  const csvLine = `${date},${startTimeStr},${endTimeStr},${durationMinutes},"${currentProject}","${sanitizedNotes}"\n`; // Error likely here

  console.log('Saving session:', csvLine);

  // Append to CSV file
  fs.appendFileSync(CSV_PATH, csvLine);

  // Reset session
  isSessionActive = false;
  currentProject = null;
  sessionStartTime = null;

  // Change the icon back to idle
  if (tray) {
    tray.setImage(ICON_IDLE_PATH);
  }

  updateTrayMenu();
  console.log('Session ended and saved');
}

// Helper function to calculate current session duration
function getSessionDuration() {
  if (!isSessionActive || !sessionStartTime) return 0;
  
  const now = new Date();
  return Math.round((now - sessionStartTime) / 60000); // Convert ms to minutes
}

// Show a simple notes input dialog
function showNotesDialog() {
  return new Promise((resolve) => {
    const notesWin = new BrowserWindow({
      width: 400,
      height: 300,
      title: 'Session Notes',
      minimizable: false,
      maximizable: false,
      resizable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    
    // Create HTML content for the notes dialog
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Session Notes</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', sans-serif;
            padding: 20px;
            margin: 0;
            color: #333;
          }
          h2 {
            margin-top: 0;
            margin-bottom: 5px;
          }
          p {
            margin-bottom: 15px;
            color: #666;
          }
          textarea {
            width: 100%;
            height: 120px;
            margin-bottom: 20px;
            padding: 10px;
            box-sizing: border-box;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-family: inherit;
            font-size: 14px;
          }
          .buttons {
            text-align: right;
          }
          button {
            background-color: #f5f5f5;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 8px 15px;
            font-size: 14px;
            cursor: pointer;
            margin-left: 10px;
          }
          button.primary {
            background-color: #0078d7;
            color: white;
            border-color: #0078d7;
          }
        </style>
      </head>
      <body>
        <h2>Session Complete</h2>
        <p>Project: ${currentProject}<br>Duration: ${getSessionDuration()} minutes</p>
        <textarea id="notesInput" placeholder="What did you accomplish? (optional)"></textarea>
        <div class="buttons">
          <button id="cancelBtn">Cancel</button>
          <button id="saveBtn" class="primary">Save Session</button>
        </div>
        <script>
          const { ipcRenderer } = require('electron');
          
          document.getElementById('saveBtn').addEventListener('click', () => {
            const notes = document.getElementById('notesInput').value;
            ipcRenderer.send('save-notes', notes);
          });
          
          document.getElementById('cancelBtn').addEventListener('click', () => {
            ipcRenderer.send('cancel-notes');
          });
        </script>
      </body>
      </html>
    `;
    
    // Load the HTML content
    notesWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    
    // Handle IPC events
    const { ipcMain } = require('electron');
    
    ipcMain.once('save-notes', (event, notes) => {
      notesWin.close();
      resolve(notes);
    });
    
    ipcMain.once('cancel-notes', () => {
      notesWin.close();
      resolve(null);
    });
    
    // Clean up when window is closed
    notesWin.on('closed', () => {
      ipcMain.removeAllListeners('save-notes');
      ipcMain.removeAllListeners('cancel-notes');
      resolve(null);
    });
  });
}


// Update the tray menu based on current state
function updateTrayMenu() {
  const projects = JSON.parse(fs.readFileSync(PROJECTS_PATH, 'utf8'));
  const projectItems = projects.map(project => {
    return {
      label: project.name,
      type: 'radio',
      checked: currentProject === project.name,
      click: () => {
        if (!isSessionActive) {
          currentProject = project.name;
          updateTrayMenu();
        }
      }
    };
  });

  // Create submenu items for each project
  const projectMenuItems = projects.map(project => {
    return {
      label: project.name,
      click: () => startSession(project.name)
    };
  });

  // Create the menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isSessionActive ? `Stop Session (${currentProject} ${formatDuration(Date.now() - sessionStartTime)})` : 'Start Session',
      submenu: isSessionActive ? null : projectMenuItems,
      click: () => { // Add this click handler for stopping the session
        if (isSessionActive) {
          showNotesDialog().then(notes => {
            endSession(notes);
          });
        }
      }
    },
    { type: 'separator' },
    {
      label: 'View Dashboard',
      click: () => {
        if (createDashboardFn) {
          createDashboardFn();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(isSessionActive ? `Tracking: ${currentProject}` : 'Juju');
}

module.exports = { createTray };

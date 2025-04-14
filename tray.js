const { Tray, Menu, app, dialog, BrowserWindow, ipcMain } = require('electron');
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
let timerIntervalId = null;

// Format duration nicely:
  function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
  
    return `${hours}h ${minutes % 60}m`;
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
  sessionStartTime = new Date();
  timerIntervalId = setInterval(() => {
    updateTrayMenu();
  }, 1000); // Update every 1 second (1000 milliseconds) 
  
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
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  console.log('Ending session, currentProject:', currentProject); // Add this line

  const endTime = new Date();
  const durationMinutes = Math.round((endTime - sessionStartTime) / 60000);

  // Format for CSV
  const date = sessionStartTime.toISOString().split('T')[0];
  const startTimeStr = sessionStartTime.toTimeString().split(' ')[0];
  const endTimeStr = endTime.toTimeString().split(' ')[0];

  // Sanitize notes for CSV (replace any double quotes with two double quotes)
  const sanitizedNotes = notes ? notes.replace(/"/g, '""') : '';  // Handle null or undefined

  // Create CSV line with the notes field
  const csvLine = `${date},${startTimeStr},${endTimeStr},${durationMinutes},"${currentProject}","${sanitizedNotes}"\n`;

  console.log('Saving session:', csvLine);

  // Append to CSV file
  let csvContent = csvLine;

  // Ensure the file ends with a newline
  const lastChar = fs.readFileSync(CSV_PATH).slice(-1).toString();
  if (lastChar !== '\n') {
    csvContent = '\n' + csvLine;
  }
  
  fs.appendFileSync(CSV_PATH, csvContent);
  
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
      width: 800,
      height: 600,
      title: 'Session Notes',
      minimizable: false,
      maximizable: false,
      resizable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    const stylesPath = path.join(__dirname, 'style.css');
let stylesheetContent = '';
try {
  stylesheetContent = fs.readFileSync(stylesPath, 'utf8');
} catch (error) {
  console.error('Error reading stylesheet:', error);
}
    
// Create HTML content for the notes dialog
const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Session Notes</title>
    <style>
      /* Custom styles to match your existing theme */
      body {
        font-family: 'Poppins', sans-serif;
        font-weight: 200;
        background-color: #1E1E1E; /* Dark charcoal background */
        color: #c4adad; /* Near-white font */
        margin: 0;
        padding: 20px;
        text-align: center; /* Center content */
      }

      h2 {
        font-size: 1.5em;
        color: #c4adad; /* Near-white font */
      }

      p {
        font-size: 1.2em;
        color: #c4adad; /* Near-white font */
      }

      textarea {
        width: 80%; /* Slightly narrower for a cleaner look */
        height: 150px;
        padding: 10px;
        font-size: 1em;
        border: 1px solid #444; /* Dark border for subtle contrast */
        border-radius: 4px;
        background-color: #2e2e2e; /* Slightly darker background for textarea */
        color: #c4adad; /* Near-white font */
        box-sizing: border-box;
        resize: vertical;
      }

      .buttons {
        margin-top: 20px;
        text-align: center;
      }

      button {
        padding: 10px 20px;
        font-size: 1em;
        cursor: pointer;
        border-radius: 4px;
        border: 1px solid #444; /* Dark border */
        margin: 5px;
        background-color: #333; /* Charcoal button color */
        color: #c4adad; /* Near-white text */
        transition: background-color 0.3s;
      }

      button.primary {
        background-color: #444; /* Slightly lighter charcoal for primary button */
      }

      button:hover {
        background-color: #555; /* Darken on hover */
      }

      button.primary:hover {
        background-color: #666; /* Darken primary button on hover */
      }
    </style>
  </head>
  <body>
    <h2>Juju Complete</h2>
    <p>Project: ${currentProject}<br>Duration: ${getSessionDuration()} minutes</p>
    <textarea id="notesInput" placeholder="What did you do?"></textarea>
    <div class="buttons">
      <button id="cancelBtn">Cancel</button>
      <button id="saveBtn" class="primary">Save Juju</button>
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

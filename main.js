const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fsPromises = require('fs').promises; // Use promises version consistently
const { createTray } = require('./tray');
const Papa = require('papaparse');

// --- Global Variables ---
let dashboardWindow = null;
let projectManagerWindow = null;
let trayInstance = null; // Keep tray instance accessible if needed later

// --- Constants ---
const USER_DATA_PATH = path.join(app.getPath('userData'), 'juju');
const DATA_FILE_PATH = path.join(USER_DATA_PATH, 'data.csv');
const PROJECTS_FILE_PATH = path.join(USER_DATA_PATH, 'projects.json');

// --- Platform Specific Setup ---
if (process.platform === 'darwin') {
  app.dock.hide();
}

// --- Utility Functions ---

/**
 * Ensures the user data directory and necessary files (data.csv, projects.json) exist.
 * Creates them with defaults if they don't.
 */
async function ensureDataFilesExist() {
  try {
    // Ensure directory exists
    await fsPromises.mkdir(USER_DATA_PATH, { recursive: true });
    console.log(`User data directory ensured: ${USER_DATA_PATH}`);

    // Ensure data.csv exists
    try {
      await fsPromises.access(DATA_FILE_PATH);
      console.log(`data.csv found at: ${DATA_FILE_PATH}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('data.csv not found, creating default.');
        const defaultDataPath = path.join(__dirname, 'data.csv'); // Check for bundled default
        try {
          await fsPromises.access(defaultDataPath);
          await fsPromises.copyFile(defaultDataPath, DATA_FILE_PATH);
          console.log('Copied default data.csv.');
        } catch (copyError) {
          await fsPromises.writeFile(DATA_FILE_PATH, '', 'utf8'); // Create empty if no default
          console.log('Created empty data.csv.');
        }
      } else {
        throw error; // Re-throw other access errors
      }
    }

    // Ensure projects.json exists
    try {
      await fsPromises.access(PROJECTS_FILE_PATH);
      console.log(`projects.json found at: ${PROJECTS_FILE_PATH}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('projects.json not found, creating default empty array.');
        await fsPromises.writeFile(PROJECTS_FILE_PATH, JSON.stringify([], null, 2), 'utf8');
      } else {
        throw error; // Re-throw other access errors
      }
    }
  } catch (err) {
    console.error('Error ensuring data files exist:', err);
    // Consider more robust error handling? Maybe quit the app?
    app.quit(); // Example: Quit if essential setup fails
  }
}

// --- Window Creation Functions ---

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
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  dashboardWindow.loadFile('dashboard.html');

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });

  return dashboardWindow;
}

function createProjectManagerWindow() {
  if (projectManagerWindow) {
    projectManagerWindow.focus();
    return;
  }

  projectManagerWindow = new BrowserWindow({
    width: 500,
    height: 600,
    title: 'Manage Projects',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  projectManagerWindow.loadFile('projects-manager.html');
  // Optional: Open DevTools automatically for this window during development
  // projectManagerWindow.webContents.openDevTools();

  projectManagerWindow.on('closed', () => {
    projectManagerWindow = null;
    // If/when you implement updateTrayMenu, call it here
    // updateTrayMenu();
  });
}

// --- CSV Handling ---

/**
 * Reads and parses the data.csv file.
 * @returns {Promise<Array<Object>>} A promise resolving to an array of session objects.
 */
async function loadSessionsFromCSV() {
  console.log(`[CSV] Loading sessions from: ${DATA_FILE_PATH}`);
  try {
      const csvData = await fsPromises.readFile(DATA_FILE_PATH, 'utf8');
      // Use Papaparse to parse the CSV data
      const parseResult = Papa.parse(csvData, {
          header: true,        // First row contains headers
          skipEmptyLines: true, // Ignore empty lines
          dynamicTyping: false, // Keep original types as strings for consistency initially
          transformHeader: header => header.trim(), // Trim whitespace from headers
      });

      if (parseResult.errors.length > 0) {
          console.error('[CSV] Errors encountered during CSV parsing:', parseResult.errors);
          // You might want to handle specific errors differently
      }

      // Add our internal numeric ID based on row index (0-based for data rows)
      const sessions = parseResult.data.map((session, index) => ({
          ...session, // Spread the parsed session data
          id: index,  // Assign index as internal ID
          // Convert duration string to number, default to 0 if invalid/missing
          duration_minutes: session.duration_minutes ? parseInt(session.duration_minutes, 10) || 0 : 0,
      }));

      // console.log("[CSV] Parsed sessions count:", sessions.length); // Less verbose log
      return sessions;

  } catch (error) {
      if (error.code === 'ENOENT') {
          console.warn('[CSV] data.csv not found during load. Returning empty array.');
          return []; // If the file doesn't exist, return empty data
      }
      // Log other file reading errors
      console.error('[CSV] Error reading sessions file:', error);
      // Rethrow the error to be caught by the IPC handler
      throw new Error(`Failed to load sessions data: ${error.message}`);
  }
}

/**
* Updates a session and overwrites data.csv using papaparse.
* @param {string|number} id - The internal ID (row index) of the session to update.
* @param {string} field - The header/key of the field to update.
* @param {string} value - The new value for the field.
* @returns {Promise<boolean>} True on success, throws error on failure.
*/
async function updateSessionInCSV(id, field, value) {
  const targetId = parseInt(id, 10);
  if (isNaN(targetId)) {
      throw new Error(`[CSV Update] Invalid session ID provided: ${id}`);
  }

  console.log(`[CSV Update] Updating session ID ${targetId}, Field: ${field}, New Value: ${value}`);

  // Load the current sessions using our Papaparse loader
  let sessions = await loadSessionsFromCSV();

  // Find the index of the session to update
  const sessionIndex = sessions.findIndex(s => s.id === targetId);

  if (sessionIndex === -1) {
      console.error(`[CSV Update] Session with internal ID ${targetId} not found.`);
      throw new Error(`Session with ID ${targetId} not found`);
  }

  // Update the field in the target session object in the array
  sessions[sessionIndex][field] = value;

   // Prepare data for writing: Remove our internal 'id' field
   const dataToWrite = sessions.map(({ id, ...rest }) => rest);

   // Determine headers dynamically from the first object (if any) to maintain order
   // Or define a fixed header order if preferred
   const headers = dataToWrite.length > 0 ? Object.keys(dataToWrite[0]) : ['date', 'start_time', 'end_time', 'duration_minutes', 'project', 'notes']; // Default headers if empty

   // Convert array of objects back to CSV string using Papaparse
   const csvString = Papa.unparse(dataToWrite, {
       columns: headers, // Ensure consistent header order
       header: true,     // Include header row in output
       quotes: true,     // Add quotes where necessary (e.g., if data contains commas)
       newline: "\n",    // Use LF line endings (generally better for Mac/Linux)
   });

   console.log('[CSV Update] Writing updated data back to file...');
   // Overwrite the file with the new CSV string
   await fsPromises.writeFile(DATA_FILE_PATH, csvString, 'utf8');
   console.log('[CSV Update] File successfully updated.');
   return true; // Indicate success
}


// --- Project JSON Handling ---

/**
 * Reads, optionally migrates, and returns projects from projects.json.
 * Ensures all projects have an 'id'.
 * @returns {Promise<Array<Object>>} Array of project objects.
 */
async function loadAndMigrateProjects() {
  let needsRewrite = false;
  try {
    let fileContent;
    try {
      fileContent = await fsPromises.readFile(PROJECTS_FILE_PATH, 'utf8');
    } catch (readError) {
      if (readError.code === 'ENOENT') {
        // File doesn't exist, handled by ensureDataFilesExist, but double-check
        console.log('[loadProjects] projects.json confirmed not found, returning empty array.');
        return [];
      }
      throw readError; // Re-throw other read errors
    }

    let projects = JSON.parse(fileContent);
    if (!Array.isArray(projects)) {
        console.error('[loadProjects] projects.json does not contain a valid JSON array. Resetting.');
        projects = []; // Reset if content is not an array
        needsRewrite = true;
    }

    // --- Migration Logic ---
    projects = projects.map(project => {
      if (typeof project === 'object' && project !== null && (!project.hasOwnProperty('id') || project.id == null)) {
        console.log(`[loadProjects] Found project missing ID: ${project.name || 'Unnamed Project'}. Adding ID.`);
        needsRewrite = true;
        return {
          ...project,
          id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
        };
      }
      // Add check for non-object entries if needed, though current JSON has objects
      if (typeof project !== 'object' || project === null) {
          console.warn('[loadProjects] Found non-object entry in projects.json, removing:', project);
          needsRewrite = true;
          return null; // Mark for removal
      }
      return project;
    }).filter(project => project !== null); // Remove null entries marked for removal
    // --- End Migration Logic ---

    if (needsRewrite) {
      console.log('[loadProjects] Rewriting projects.json due to migration or cleanup...');
      await fsPromises.writeFile(PROJECTS_FILE_PATH, JSON.stringify(projects, null, 2), 'utf8');
      console.log('[loadProjects] projects.json rewrite complete.');
    }

    // console.log('[loadProjects] Returning projects:', projects); // Verbose log
    return projects;

  } catch (error) {
    console.error('[loadProjects] Error loading, parsing, or migrating projects:', error);
    // Attempt to return empty array on failure, maybe notify user?
    return [];
  }
}

/**
 * Adds a new project to projects.json.
 * @returns {Promise<Object>} Object indicating success and the new project, or throws error.
 */
async function addProject(name) {
  // Log when this specific function starts
  console.log(`[Main Func - addProject] --- Starting execution for name: "${name}"`); // Log 10

  // Validate the name
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    console.error('[Main Func - addProject] XXXX Validation failed: Invalid name received.'); // Log 11
    throw new Error('Invalid project name provided.'); // Throw error on validation failure
  }
  const trimmedName = name.trim();
  console.log(`[Main Func - addProject] --- Name validated: "${trimmedName}". Attempting to load projects...`); // Log 12

  // Load projects (assuming loadAndMigrateProjects has its own internal logs)
  const projects = await loadAndMigrateProjects();
  console.log(`[Main Func - addProject] --- Projects loaded/migrated. Current count: ${projects.length}`); // Log 13

  // Create the new project object
  const newProject = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
      name: trimmedName
  };
  console.log('[Main Func - addProject] --- New project object created:', newProject); // Log 14

  // Add to the array
  projects.push(newProject);

  console.log('[Main Func - addProject] --- Attempting to write updated projects array to file:', PROJECTS_FILE_PATH); // Log 15

  // Write the updated array back to the file
  try {
    await fsPromises.writeFile(PROJECTS_FILE_PATH, JSON.stringify(projects, null, 2), 'utf8');
    // Log success AFTER the file write completes
    console.log(`[Main Func - addProject] --- File written successfully. Project "${trimmedName}" (ID: ${newProject.id}) added.`); // Log 16
    // updateTrayMenu(); // This should be called here if/when implemented

    // Return success object
    return { success: true, project: newProject };
  } catch (writeError) {
      // Log specifically if the file write fails
      console.error('[Main Func - addProject] XXXX Error writing projects file:', writeError.message, writeError.stack ? writeError.stack : ''); // Log 17
      throw writeError; // Re-throw the file writing error
  }
}

/**
 * Deletes a project from projects.json by its ID.
 * @returns {Promise<Object>} Object indicating success and the deleted ID, or throws error.
 */
async function deleteProject(id) {
    if (!id) {
        throw new Error('No project ID provided for deletion.');
    }
    let projects = await loadAndMigrateProjects(); // Load current
    const initialLength = projects.length;
    projects = projects.filter(p => p.id !== id);

    if (projects.length === initialLength) {
        console.warn(`[deleteProject] Project with ID ${id} not found for deletion.`);
        // Decide: throw error or return specific status? Throwing is clearer for invoke.
        throw new Error(`Project with ID ${id} not found`);
    }

    await fsPromises.writeFile(PROJECTS_FILE_PATH, JSON.stringify(projects, null, 2), 'utf8');
    console.log(`[deleteProject] Deleted project with ID: ${id}`);
    // updateTrayMenu(); // Call when implemented
    return { success: true, id: id };
}


// --- IPC Handlers ---

ipcMain.handle('load-sessions', async () => {
  try {
      return await loadSessionsFromCSV();
  } catch (error) {
      console.error("Error in 'load-sessions' handler:", error);
      // Return empty or signal error to renderer?
      // Rethrowing allows renderer's try/catch to handle it
      throw error;
  }
});

ipcMain.handle('update-session', async (event, id, field, value) => {
  try {
    return await updateSessionInCSV(id, field, value);
  } catch (error) {
    console.error(`Error in 'update-session' handler for ID ${id}:`, error);
    throw error; // Let renderer handle the error
  }
});

ipcMain.handle('load-projects', async () => {
  try {
    return await loadAndMigrateProjects();
  } catch (error) {
      console.error("Error in 'load-projects' handler:", error);
      throw error; // Allow renderer to catch
  }
});

ipcMain.handle('add-project', async (event, name) => {
  // Log when the IPC handler is invoked
  console.log(`[Main IPC] ===> Received 'add-project' request for name: "${name}"`); // Log 7
  try {
    // Call the actual logic function
    const result = await addProject(name);
    // Log the successful result before returning
    console.log(`[Main IPC] <=== Success from addProject function. Returning:`, result); // Log 8
    return result;
  } catch (error) {
    // Log if any error occurs within the addProject function or here
    console.error(`[Main IPC] XXXX Error in 'add-project' handler for name "${name}":`, error.message, error.stack ? error.stack : ''); // Log 9
    // Re-throw the error so the renderer's catch block is triggered
    throw error;
  }
});

// Note: No 'update-project' handler as requested to be removed

ipcMain.handle('delete-project', async (event, id) => {
  try {
    return await deleteProject(id);
  } catch (error) {
    console.error(`Error in 'delete-project' handler for ID ${id}:`, error);
    throw error; // Let renderer handle the error
  }
});


// --- Application Lifecycle ---

app.whenReady().then(async () => {
  // Step 1: Ensure data files exist (already in your cleaned code)
  await ensureDataFilesExist();
  console.log('Data file path:', DATA_FILE_PATH);
  console.log('Projects file path:', PROJECTS_FILE_PATH);

  // Step 2: Define the API object that tray.js will use
  const mainApiForTray = {
    loadProjects: loadAndMigrateProjects, // Pass the existing function directly
    saveSession: async (sessionData) => {
      console.log("[Main Save Session] Received session to save:", sessionData);
      try {
          // Define the data for the new row using expected headers
          const dataToAppend = [{
              date: sessionData.startTime.split('T')[0],
              start_time: new Date(sessionData.startTime).toTimeString().split(' ')[0],
              end_time: new Date(sessionData.endTime).toTimeString().split(' ')[0],
              duration_minutes: sessionData.durationMinutes,
              project: sessionData.projectName, // Let Papaparse handle quoting/escaping
              notes: sessionData.notes       // Let Papaparse handle quoting/escaping
          }];
          // Define the expected header order explicitly
          const headers = ['date', 'start_time', 'end_time', 'duration_minutes', 'project', 'notes'];

          // Use Papaparse to convert *only the new row* to a CSV string fragment
          // Important: header: false because we only want the data line(s)
          const csvFragment = Papa.unparse(dataToAppend, {
              columns: headers, // Ensure order matches expectations
              header: false,
              quotes: true,     // Ensure necessary quoting
              newline: "\n"     // Use LF line ending
          });

          let fileNeedsHeader = false;
          let fileNeedsNewlinePrefix = false;

          // Check file status to see if we need headers or a preceding newline
          try {
              const fileStat = await fsPromises.stat(DATA_FILE_PATH);
              if (fileStat.size === 0) {
                  fileNeedsHeader = true; // File exists but is empty
              } else {
                  // File exists and has content, check last byte for newline
                  const buffer = Buffer.alloc(1);
                  const fd = await fsPromises.open(DATA_FILE_PATH, 'r');
                  await fd.read(buffer, 0, 1, fileStat.size - 1);
                  await fd.close();
                  if (buffer.toString() !== '\n') {
                      fileNeedsNewlinePrefix = true; // Add newline if missing
                      console.log('[Main Save Session] File does not end with newline, adding one.');
                  }
              }
          } catch (statError) {
              if (statError.code === 'ENOENT') {
                  fileNeedsHeader = true; // File doesn't exist yet
                  console.log('[Main Save Session] File does not exist, will add header.');
              } else {
                  throw statError; // Re-throw other stat errors
              }
          }

          // Construct the final string to append/write
          let stringToWrite = "";
          if (fileNeedsHeader) {
              // Create header string using Papaparse
              const headerString = Papa.unparse([{}], { columns: headers, header: true, newline: "\n" }).split('\n')[0];
              stringToWrite = headerString + "\n" + csvFragment;
               // Use writeFile because we're potentially creating the file or overwriting an empty one with headers
               console.log("[Main Save Session] Writing header and first line to:", DATA_FILE_PATH);
               await fsPromises.writeFile(DATA_FILE_PATH, stringToWrite, 'utf8');
          } else {
              // File exists, just append the data (with preceding newline if needed)
              stringToWrite = (fileNeedsNewlinePrefix ? "\n" : "") + csvFragment;
              console.log("[Main Save Session] Appending line:", stringToWrite.trim());
              await fsPromises.appendFile(DATA_FILE_PATH, stringToWrite, 'utf8');
          }

          console.log("[Main Save Session] Session successfully saved to CSV.");

      } catch (error) {
          console.error("[Main Save Session] Error formatting or saving session to CSV:", error);
          // Potentially throw error back to tray? Or just log here.
      }
  },
    showNotesDialog: async (dialogData) => {
      console.log("[Main] Request to show notes dialog received:", dialogData);
      return new Promise((resolve) => {
          let isResolved = false; // Prevent resolving multiple times
          let notesWin = new BrowserWindow({ /* ... same options as before ... */
              webPreferences: {
                  preload: path.join(__dirname, 'notes-preload.js'), // Correct preload
                  contextIsolation: true,
                  nodeIntegration: false,
                  devTools: false // Keep DevTools off
                  // enableRemoteModule: false // Ensure remote module is OFF
              }
          });
          notesWin.removeMenu();
  
          const htmlContent = `
            <!DOCTYPE html><html><head><title>Session Notes</title>
            <style>
                body { font-family: 'Poppins', sans-serif; background-color: #1e1e1e; color: #e0e0e0; padding: 20px; display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; margin: 0; }
                h4 { margin: 0 0 5px 0; font-weight: 500; }
                p { margin: 0 0 15px 0; font-size: 0.9em; color: #aaa; }
                textarea { flex-grow: 1; background-color: #2e2e2e; color: #e0e0e0; border: 1px solid #444; border-radius: 4px; padding: 8px; margin-bottom: 15px; resize: none; font-family: inherit; font-size: 1em; }
                textarea:focus { outline: none; border-color: #666; }
                .buttons { display: flex; justify-content: flex-end; gap: 10px; }
                button { padding: 8px 15px; font-size: 0.9em; border-radius: 4px; border: 1px solid #555; cursor: pointer; }
                button.primary { background-color: #4E79A7; color: white; border-color: #4E79A7; }
                button.secondary { background-color: #444; color: #e0e0e0; }
            </style>
            </head><body>
                <h4>Session Complete</h4>
                <p>Project: ${dialogData?.projectName || 'N/A'}<br>Duration: ${formatDuration(dialogData?.durationMs || 0)}</p>
                <textarea id="notesInput" placeholder="What did you work on?"></textarea>
                <div class="buttons">
                    <button id="cancelBtn" class="secondary">Cancel</button>
                    <button id="saveBtn" class="primary">Save</button>
                </div>
                <script>
                    const notesInput = document.getElementById('notesInput');
                    const saveBtn = document.getElementById('saveBtn');
                    const cancelBtn = document.getElementById('cancelBtn');
                    notesInput.focus(); // Focus textarea on load

                    saveBtn.addEventListener('click', () => {
                        window.electronNotesApi.submitNotes(notesInput.value);
                    });
                    cancelBtn.addEventListener('click', () => {
                        window.electronNotesApi.submitNotes(null); // Send null for cancel
                    });
                    notesInput.addEventListener('keydown', (e) => {
                        // Use Ctrl+Enter or Cmd+Enter to save (allow Shift+Enter for newlines)
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            saveBtn.click();
                        } else if (e.key === 'Escape') {
                            cancelBtn.click();
                        }
                    });
                </script>
            </body></html>`;
          notesWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
  
          // Send the window its ID once the content is ready
          notesWin.webContents.once('did-finish-load', () => {
               notesWin.webContents.send('set-window-id', notesWin.webContents.id);
          });
  
          notesWin.once('ready-to-show', () => { notesWin.show(); });
  
          const responseChannel = `notes-response-${notesWin.webContents.id}`;
          ipcMain.once(responseChannel, (event, notes) => {
              if (isResolved) return;
              isResolved = true;
              console.log(`[Main Notes Dialog] Received notes: ${notes === null ? 'Cancelled' : '"' + notes + '"'}`);
              if (!notesWin.isDestroyed()) notesWin.close();
              resolve(notes);
          });
  
          notesWin.once('closed', () => {
              if (isResolved) return;
              isResolved = true;
              console.log("[Main Notes Dialog] Window closed by user/system.");
              ipcMain.removeAllListeners(responseChannel);
              resolve(null); // Resolve with null if closed without submitting
              notesWin = null;
          });
      });
  },
    createDashboardWindow: createDashboardWindow, // Pass existing function
    createProjectManagerWindow: createProjectManagerWindow // Pass existing function
  };

  // Step 3: Call createTray, passing the API object, and AWAIT the result
  console.log("[Main] Creating tray instance...");
  trayInstance = await createTray(mainApiForTray); // <-- Updated call

  if (!trayInstance) {
      console.error("[Main] Failed to create tray instance! Check tray.js logs. Exiting.");
      // Handle error - maybe quit app if tray is essential
      app.quit();
      return; // Stop further execution in this block
  }
  console.log("[Main] Tray instance created.");


  // Step 4: Register global shortcut (already in your cleaned code)
  const ret = globalShortcut.register('Shift+Option+Command+J', () => {
    if (trayInstance) {
        console.log("[Main] Global shortcut triggered!");
        trayInstance.popUpContextMenu(); // Assuming tray instance has this method
    } else {
        console.error("[Main] Shortcut triggered but tray instance is missing!");
    }
  });

  if (!ret) {
    console.log('[Main] Global shortcut registration failed. Is it already registered?');
  } else {
      console.log('[Main] Global shortcut registered successfully.');
  }
});

// --- Ensure the rest of your main.js remains the same ---
// (Imports, constants, utility functions, window creation functions,
// CSV/Project handlers, other IPC handlers, other app lifecycle events)

app.on('will-quit', () => {
  // Unregister all shortcuts when the application is about to quit
  globalShortcut.unregisterAll();
  console.log('Global shortcuts unregistered.');
});

// Quit the app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// On macOS, re-create a window when the dock icon is clicked and no windows are open
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    // Decide which window to open on activate, dashboard seems reasonable
    createDashboardWindow();
  }
});
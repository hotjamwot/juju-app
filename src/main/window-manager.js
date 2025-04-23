const { BrowserWindow, ipcMain, app } = require('electron');
const path = require('path');
const { formatDuration } = require('./utils'); 

// Keep track of windows to prevent duplicates
let dashboardWindow = null;

function createDashboardWindow() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.focus();
    return dashboardWindow;
  }

  dashboardWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    },
  });

  dashboardWindow.loadFile(path.join(app.getAppPath(), 'dashboard.html'));

  dashboardWindow.webContents.on('did-finish-load', () => {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        dashboardWindow.webContents.send('set-window-id', dashboardWindow.id);
    }
  });

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });

  return dashboardWindow;
}

/**
 * Shows a modal dialog window for entering session notes.
 * @param {Object} dialogData - Data to display in the dialog { projectName, durationMs }
 * @returns {Promise<string | null>} Resolves with the notes string, or null if cancelled/closed.
 */
async function showNotesDialog(dialogData) {
  console.log("[Window Manager] Request to show notes dialog received:", dialogData);
  return new Promise((resolve) => {
      let isResolved = false; // Prevent resolving multiple times

      // Create a new window instance each time
      let notesWin = new BrowserWindow({
          width: 400, // Adjust size as needed
          height: 300,
          title: 'Session Notes',
          modal: true, // Make it modal to the parent if possible (depends on context, might need parent window passed in)
          // parent: ??? // Optional: Pass parent window if needed for modality
          show: false, // Don't show until ready
          webPreferences: {
              preload: path.join(app.getAppPath(), 'notes-preload.js'), // Correct preload
              contextIsolation: true,
              nodeIntegration: false,
              devTools: process.env.NODE_ENV !== 'production' // Only enable dev tools if not in production
          }
      });
      notesWin.removeMenu(); // No default menu

      // Generate HTML content dynamically
      const htmlContent = `
        <!DOCTYPE html><html><head><title>Session Notes</title>
        <style>
            :root {
                --background-dark: #1E1E1E;
                --background-light: rgba(255, 255, 255, 0.03);
                --border-color: #444;
                --text-light: #E0E0E0;
                --text-muted: #888;
                --primary-blue: #4E79A7;
                --border-radius: 8px;
            }
            
            body { 
                font-family: 'Poppins', sans-serif;
                background-color: var(--background-dark);
                color: var(--text-light);
                padding: 20px;
                display: flex;
                flex-direction: column;
                height: 100vh;
                box-sizing: border-box;
                margin: 0;
                overflow: hidden;
            }
            
            h4 { 
                font-family: 'Jost', sans-serif;
                margin: 0 0 5px 0;
                font-weight: 400;
                color: var(--text-light);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            p { 
                margin: 0 0 15px 0;
                font-size: 0.9em;
                color: var(--text-muted);
            }
            
            textarea { 
                flex-grow: 1;
                background: var(--background-light);
                color: var(--text-light);
                border: 1px solid var(--border-color);
                border-radius: var(--border-radius);
                padding: 8px;
                margin-bottom: 15px;
                resize: none;
                font-family: inherit;
                font-size: 0.9em;
                line-height: 1.4;
            }
            
            textarea:focus { 
                outline: none;
                border-color: var(--primary-blue);
            }
            
            .buttons { 
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                flex-shrink: 0;
            }
            
            button { 
                padding: 0.5rem 1rem;
                font-size: 0.9em;
                border-radius: 4px;
                border: none;
                cursor: pointer;
                font-weight: 400;
                font-family: inherit;
            }
            
            button.primary { 
                background: var(--primary-blue);
                color: white;
            }
            
            button.primary:hover {
                background: #5989b7;
            }
            
            button.secondary { 
                background: rgba(255, 255, 255, 0.1);
                color: var(--text-light);
                border: 1px solid var(--border-color);
            }
            
            button.secondary:hover {
                background: rgba(255, 255, 255, 0.15);
            }
        </style>
        </head><body>
            <h4>Session Complete</h4>
            <p>Project: ${dialogData?.projectName || 'N/A'}<br>Duration: ${formatDuration(dialogData?.durationMs || 0)}</p>
            <textarea id="notesInput" placeholder="What did you work on? (Ctrl+Enter or Cmd+Enter to save)"></textarea>
            <div class="buttons">
                <button id="cancelBtn" class="secondary">Cancel (Esc)</button>
                <button id="saveBtn" class="primary">Save</button>
            </div>
            <script>
              const notesInput = document.getElementById('notesInput');
              const saveBtn = document.getElementById('saveBtn');
              const cancelBtn = document.getElementById('cancelBtn');
              notesInput.focus(); // Focus textarea on load

              // Wait for preload to signal readiness (window ID received)
              window.electronNotesApi.onReady(() => {
                  console.log('Notes window renderer is ready.');

                  saveBtn.addEventListener('click', () => {
                      console.log('Save button clicked');
                      window.electronNotesApi.submitNotes(notesInput.value);
                  });

                  cancelBtn.addEventListener('click', () => {
                      console.log('Cancel button clicked');
                      window.electronNotesApi.submitNotes(null); // Send null on cancel
                  });

                  // Keyboard shortcuts
                  notesInput.addEventListener('keydown', (e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault(); // Prevent newline
                          saveBtn.click();
                      } else if (e.key === 'Escape') {
                          cancelBtn.click();
                      }
                  });
              });
            </script>
        </body></html>`;
      notesWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

      // Send the window its ID once the content is ready
      notesWin.webContents.once('did-finish-load', () => {
           if (notesWin && !notesWin.isDestroyed()) {
               notesWin.webContents.send('set-window-id', notesWin.webContents.id);
           }
      });

      // Show the window gracefully when it's ready
      notesWin.once('ready-to-show', () => {
          if (notesWin && !notesWin.isDestroyed()) {
              notesWin.show();
          }
       });

      // Listen for the response from the notes window via preload
      const responseChannel = `notes-response-${notesWin.webContents.id}`;
      ipcMain.once(responseChannel, (event, notes) => {
          console.log('[Window Manager] Received notes response:', notes === null ? 'Cancelled' : 'Submitted');
          if (isResolved) return;
          isResolved = true;
          if (notesWin && !notesWin.isDestroyed()) notesWin.close(); // Close window on response
          resolve(notes); // Resolve the promise with the notes or null
      });

      // Handle the case where the window is closed directly (e.g., by user clicking 'X')
      notesWin.once('closed', () => {
          console.log("[Window Manager] Notes dialog closed directly.");
          if (isResolved) return;
          isResolved = true;
          ipcMain.removeAllListeners(responseChannel); // Clean up listener
          resolve(null); // Resolve with null if closed without submitting
          notesWin = null; // Dereference window
      });
  });
}

module.exports = {
  createDashboardWindow,
  showNotesDialog,
};

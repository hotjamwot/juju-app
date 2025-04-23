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
            /* Basic styles - consider moving to a separate CSS file if complex */
            body { font-family: system-ui, sans-serif; background-color: #282c34; color: #abb2bf; padding: 20px; display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; margin: 0; overflow: hidden; }
            h4 { margin: 0 0 5px 0; font-weight: 600; color: #61afef; }
            p { margin: 0 0 15px 0; font-size: 0.9em; color: #98c379; }
            textarea { flex-grow: 1; background-color: #21252b; color: #abb2bf; border: 1px solid #3b4048; border-radius: 4px; padding: 8px; margin-bottom: 15px; resize: none; font-family: inherit; font-size: 1em; }
            textarea:focus { outline: none; border-color: #61afef; }
            .buttons { display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0; }
            button { padding: 8px 15px; font-size: 0.9em; border-radius: 4px; border: none; cursor: pointer; font-weight: 500; }
            button.primary { background-color: #61afef; color: #282c34; }
            button.secondary { background-color: #4b5263; color: #abb2bf; }
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

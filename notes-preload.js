const { contextBridge, ipcRenderer } = require('electron');

let myWindowId = null;
const onReadyCallbacks = [];
let isReady = false;

// Listen for the main process to send this window's ID
ipcRenderer.on('set-window-id', (event, id) => {
    console.log('[Preload] Received window ID:', id);
    myWindowId = id;
    isReady = true;
    // Execute any callbacks that were registered before the ID arrived
    onReadyCallbacks.forEach(fn => fn());
    onReadyCallbacks.length = 0; // Clear the array
});

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronNotesApi', {
    /**
     * Sends the notes (or null for cancel) back to the main process.
     * @param {string | null} notes - The notes text or null if cancelled.
     */
    submitNotes: (notes) => {
        if (myWindowId) {
            const responseChannel = `notes-response-${myWindowId}`;
            console.log(`[Preload] Sending notes on channel: ${responseChannel}`);
            ipcRenderer.send(responseChannel, notes);
        } else {
            // This should ideally not happen if onReady is used correctly
            console.error("[Preload] Window ID not set! Cannot submit notes.");
        }
    },
    /**
     * Registers a callback function to run once the preload script is ready
     * (i.e., has received its window ID from the main process).
     * @param {Function} callback - The function to execute when ready.
     */
    onReady: (callback) => {
        if (typeof callback !== 'function') return;

        if (isReady) {
            console.log('[Preload] API is ready, executing callback immediately.');
            callback(); // Already ready, execute immediately
        } else {
            console.log('[Preload] API not ready, queuing callback.');
            onReadyCallbacks.push(callback); // Queue callback for later
        }
    }
});

console.log('[Preload] electronNotesApi exposed.');
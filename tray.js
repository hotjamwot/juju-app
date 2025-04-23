const { Tray, Menu, app } = require('electron');
const path = require('path');
const fsPromises = require('fs').promises; // For checking icon paths maybe

// --- Constants ---
// It's good practice to check if icon files exist at startup
const ICON_IDLE_PATH = path.join(__dirname, 'assets', 'icon-idle.png');
const ICON_ACTIVE_PATH = path.join(__dirname, 'assets', 'icon-active.png');

// --- Module State ---
let tray = null;
let isSessionActive = false;
let currentProjectName = null; // Store only the name for the active session
let sessionStartTime = null;
let timerIntervalId = null;

// Store functions passed from main.js
let mainProcessApi = {
    loadProjects: async () => { console.warn('loadProjects API not provided to tray.js'); return []; },
    saveSession: async (sessionData) => { console.warn('saveSession API not provided to tray.js', sessionData); },
    showNotesDialog: async (dialogData) => { console.warn('showNotesDialog API not provided to tray.js'); return null; },
    createDashboardWindow: () => { console.warn('createDashboardWindow fn not provided to tray.js'); },
    createProjectManagerWindow: () => { console.warn('createProjectManagerWindow fn not provided to tray.js'); },
};

// --- Helper Functions ---

/**
 * Formats milliseconds into a more readable "Xh Ym" string.
 * @param {number} ms - Duration in milliseconds.
 * @returns {string} Formatted duration string.
 */
function formatDuration(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    // Optional: Add seconds if needed: const seconds = totalSeconds % 60;
    return `${hours}h ${minutes}m`;
}

/**
 * Updates the tray icon and tooltip based on session state.
 */
async function updateTrayIconAndTooltip() {
    if (!tray) return;
    try {
        const iconPath = isSessionActive ? ICON_ACTIVE_PATH : ICON_IDLE_PATH;
        // Optional: Check if file exists before setting
        await fsPromises.access(iconPath);
        tray.setImage(iconPath);
        tray.setToolTip(isSessionActive ? `Tracking: ${currentProjectName}` : 'Juju Time Tracker');
    } catch (error) {
        console.error(`Error setting tray icon (${isSessionActive ? 'active' : 'idle'}):`, error);
        // Fallback? Or just log the error.
    }
}

/**
 * Builds and sets the tray's context menu based on current state and projects.
 */
async function updateTrayMenu() {
    if (!tray) return;

    let projects = [];
    try {
        projects = await mainProcessApi.loadProjects(); // Get projects via main process API
        // Ensure projects are in the expected format {id: string, name: string}
        if (!Array.isArray(projects)) {
            console.error("Received non-array projects data from main process.");
            projects = [];
        }
    } catch (error) {
        console.error("Failed to load projects for tray menu:", error);
    }

    // Create submenu items for starting a session
    const projectMenuItems = projects.map(project => ({
        label: project.name, // Expecting objects with name property
        click: () => {
            startSession(project.name); // Start session using the project name
        },
    }));

    // Define menu template
    const menuTemplate = [
        isSessionActive
            ? { // Session is Active: Show Stop Button
                label: `Stop Session (${currentProjectName} - ${formatDuration(Date.now() - sessionStartTime)})`,
                click: async () => {
                    try {
                        // Ask main process to show notes dialog
                        const notes = await mainProcessApi.showNotesDialog({
                            projectName: currentProjectName,
                            durationMs: Date.now() - sessionStartTime
                        });
                        // If notes dialog wasn't cancelled (returned null)
                        if (notes !== null) {
                            endSession(notes);
                        } else {
                            console.log("Notes dialog cancelled, session not stopped.");
                        }
                    } catch (error) {
                        console.error("Error during notes dialog process:", error);
                        // Decide if session should end anyway without notes?
                        // Maybe show a simple error to the user?
                        endSession(""); // End without notes on error? Needs consideration.
                    }
                },
            }
            : { // Session is Inactive: Show Start Menu
                label: 'Start Session',
                submenu: projectMenuItems.length > 0 ? projectMenuItems : [{ label: 'No projects found', enabled: false }],
            },
        { type: 'separator' },
        {
            label: 'View Dashboard',
            click: () => mainProcessApi.createDashboardWindow(), // Use stored function
        },
        { type: 'separator' },
        {
            label: 'Quit Juju',
            click: () => app.quit(),
        },
    ];

    const contextMenu = Menu.buildFromTemplate(menuTemplate);
    tray.setContextMenu(contextMenu);
}

// --- Session Management Functions ---

/**
 * Starts a tracking session for the given project name.
 * @param {string} projectName - The name of the project to track.
 */
function startSession(projectName) {
    if (isSessionActive || !projectName) {
        return; // Don't start if already active or no project name
    }

    console.log(`Starting session for project: ${projectName}`);
    currentProjectName = projectName;
    isSessionActive = true;
    sessionStartTime = new Date(); // Record start time

    // Clear any existing interval just in case
    if (timerIntervalId) clearInterval(timerIntervalId);

    // Update menu immediately and then every minute for duration update
    updateTrayMenu();
    updateTrayIconAndTooltip();
    timerIntervalId = setInterval(() => {
        updateTrayMenu(); // Update duration in menu
    }, 60 * 1000); // Update every minute (60000 ms) is sufficient

}

/**
 * Ends the current session and requests main process to save the data.
 * @param {string} notes - Notes for the session.
 */
async function endSession(notes) {
    if (!isSessionActive) return;

    console.log(`Attempting to end session for: ${currentProjectName}`);

    // Clear the update interval
    if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }

    const endTime = new Date();
    const durationMs = endTime - sessionStartTime;

    // Prepare session data object
    const sessionData = {
        startTime: sessionStartTime.toISOString(),
        endTime: endTime.toISOString(),
        durationMinutes: Math.round(durationMs / 60000),
        projectName: currentProjectName, // Send the name
        notes: notes || "", // Ensure notes is always a string
    };

    // Reset state *before* async save call (more responsive UI)
    const previouslyActiveProject = currentProjectName;
    isSessionActive = false;
    currentProjectName = null;
    sessionStartTime = null;

    // Update UI immediately
    updateTrayMenu(); // Show 'Start Session' options
    updateTrayIconAndTooltip(); // Set idle icon

    // Send data to main process to save
    try {
        await mainProcessApi.saveSession(sessionData);
        console.log(`Session for ${previouslyActiveProject} ended and save request sent.`);
    } catch (error) {
        console.error("Failed to send session data to main process for saving:", error);
        // Maybe queue for later saving? Or notify user?
    }
}

// --- Main Exported Function ---

/**
 * Creates the system tray icon and menu.
 * @param {Object} api - Functions provided by main.js { loadProjects, saveSession, showNotesDialog, createDashboardWindow, createProjectManagerWindow }
 * @returns {Tray | null} The created Tray instance or null if failed.
 */
async function createTray(api) {
    if (tray) {
        console.log("Tray already exists.");
        return tray; // Return existing tray instance
    }

    // Store the provided API functions
    if (!api || typeof api.loadProjects !== 'function' || typeof api.saveSession !== 'function' ||
        typeof api.showNotesDialog !== 'function' || typeof api.createDashboardWindow !== 'function' ||
        typeof api.createProjectManagerWindow !== 'function') {
            console.error("createTray requires an API object with necessary functions from main.js");
            return null; // Cannot create tray without API
        }
    mainProcessApi = api;


    try {
        // Ensure icons exist before creating Tray
        await fsPromises.access(ICON_IDLE_PATH);
        tray = new Tray(ICON_IDLE_PATH);

        tray.setToolTip('Juju Time Tracker');

        // Setup event listeners
        tray.on('click', () => {
            tray.popUpContextMenu(); // Show menu on left-click
        });
        tray.on('right-click', () => {
            tray.popUpContextMenu(); // Show menu on right-click
        });

        // Build and set the initial menu
        await updateTrayMenu();
        await updateTrayIconAndTooltip(); // Set initial icon state

        console.log("Tray created successfully.");
        return tray; // Return the Tray instance to main.js

    } catch (error) {
        console.error('Failed to create tray:', error);
        if (error.code === 'ENOENT') {
            console.error(`Could not find tray icon at: ${ICON_IDLE_PATH}. Please ensure asset exists.`);
        }
        tray = null; // Ensure tray is null if creation failed
        return null;
    }
}

// --- Export ---
module.exports = { createTray }; // Correctly exporting the function
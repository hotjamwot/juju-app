const { app } = require('electron');
const path = require('path');
const fsPromises = require('fs').promises;
const Papa = require('papaparse');

// --- Constants ---
const USER_DATA_PATH = path.join(app.getPath('userData'), 'juju');
const DATA_FILE_PATH = path.join(USER_DATA_PATH, 'data.csv');
const PROJECTS_FILE_PATH = path.join(USER_DATA_PATH, 'projects.json');

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
        const defaultDataPath = path.join(app.getAppPath(), 'data.csv'); // Check for bundled default relative to app root
        try {
          await fsPromises.access(defaultDataPath);
          await fsPromises.copyFile(defaultDataPath, DATA_FILE_PATH);
          console.log('Copied default data.csv.');
        } catch (copyError) {
          // Check if the error is ENOENT for the default file as well
          if (copyError.code === 'ENOENT') {
             console.log('Default data.csv not found in app path, creating empty.');
          } else {
             console.error('Error accessing/copying default data.csv:', copyError);
          }
          await fsPromises.writeFile(DATA_FILE_PATH, '', 'utf8'); // Create empty if no default or copy failed
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

  // Recalculate duration if time fields are updated
  if (field === 'start_time' || field === 'end_time') {
    const session = sessions[sessionIndex];
    if (session.start_time && session.end_time) {
      try {
        // Parse times - assuming format HH:MM or HH:MM:SS
        const startParts = session.start_time.split(':').map(Number);
        const endParts = session.end_time.split(':').map(Number);

        // Create Date objects for calculation (using today's date)
        const startDate = new Date();
        startDate.setHours(startParts[0], startParts[1], startParts[2] || 0, 0);

        const endDate = new Date();
        endDate.setHours(endParts[0], endParts[1], endParts[2] || 0, 0);

        // Handle overnight sessions (if end time is earlier than start time)
        if (endDate < startDate) {
          endDate.setDate(endDate.getDate() + 1);
        }

        // Calculate duration in minutes
        const durationMs = endDate - startDate;
        const durationMinutes = Math.round(durationMs / (1000 * 60));

        // Update the duration field
        sessions[sessionIndex].duration_minutes = durationMinutes.toString();
        console.log(`[CSV Update] Recalculated duration: ${durationMinutes} minutes`);
      } catch (e) {
        console.error(`[CSV Update] Error calculating duration: ${e.message}`);
        // Optionally reset duration if calculation fails?
        // sessions[sessionIndex].duration_minutes = '0';
      }
    } else {
       // If one time is missing, maybe clear duration?
       // sessions[sessionIndex].duration_minutes = '0';
    }
  }

  // Prepare data for writing: Remove our internal 'id' field
  const dataToWrite = sessions.map(({ id, ...rest }) => rest);

  // Determine headers dynamically from the first object (if any) to maintain order
  const headers = dataToWrite.length > 0 ? Object.keys(dataToWrite[0]) : ['date', 'start_time', 'end_time', 'duration_minutes', 'project', 'notes'];

  // Convert array of objects back to CSV string using Papaparse
  const csvString = Papa.unparse(dataToWrite, {
    columns: headers,
    header: true,
    quotes: true, // Ensure fields are quoted if they contain commas, quotes, or newlines
    newline: "\n",
  });

  console.log('[CSV Update] Writing updated data back to file...');
  // Overwrite the file with the new CSV string
  await fsPromises.writeFile(DATA_FILE_PATH, csvString, 'utf8');
  console.log('[CSV Update] File successfully updated.');
  return true;
}

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
      // Ensure it's an object and has a non-null 'id'
      if (typeof project === 'object' && project !== null && (!project.hasOwnProperty('id') || project.id == null)) {
        console.log(`[loadProjects] Found project missing ID: ${project.name || 'Unnamed Project'}. Adding ID.`);
        needsRewrite = true;
        return {
          ...project,
          id: Date.now().toString() + Math.random().toString(36).substring(2, 5), // Generate unique ID
        };
      }
      // Remove entries that are not objects
      if (typeof project !== 'object' || project === null) {
          console.warn('[loadProjects] Found non-object entry in projects.json, removing:', project);
          needsRewrite = true;
          return null; // Mark for removal
      }
      // Ensure 'name' exists and is a string, provide default if not
      if (typeof project.name !== 'string') {
          console.warn(`[loadProjects] Project with ID ${project.id} missing or has invalid name. Setting to 'Unnamed'.`);
          project.name = 'Unnamed';
          needsRewrite = true;
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
 * Updates a project's color in projects.json.
 * @param {string} id - The ID of the project to update.
 * @param {string} color - The new color value (hex format).
 * @returns {Promise<Object>} Object indicating success and the updated project.
 */
async function updateProjectColor(id, color) {
    if (!id || !color) {
        throw new Error('Project ID and color are required');
    }

    // Validate color format (basic hex color validation)
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
        throw new Error('Invalid color format. Must be a hex color (e.g., #FF0000)');
    }

    let projects = await loadAndMigrateProjects();
    const projectIndex = projects.findIndex(p => p.id === id);

    if (projectIndex === -1) {
        throw new Error(`Project with ID ${id} not found`);
    }

    // Update the color
    projects[projectIndex].color = color;

    // Write back to file
    await fsPromises.writeFile(PROJECTS_FILE_PATH, JSON.stringify(projects, null, 2), 'utf8');
    return { success: true, project: projects[projectIndex] };
}

/**
 * Adds a new project to projects.json.
 * @param {Object} projectData - The project data { name: string, color?: string }.
 * @returns {Promise<Object>} Object indicating success and the new project.
 */
async function addProject(projectData) {
    console.log(`[Data Manager - addProject] Received project data:`, projectData);

    // Validate the project data
    if (!projectData || !projectData.name || typeof projectData.name !== 'string' || projectData.name.trim().length === 0) {
        console.error('[Data Manager - addProject] Validation failed: Invalid project data');
        throw new Error('Invalid project data provided');
    }

    const trimmedName = projectData.name.trim();
    console.log(`[Data Manager - addProject] Name validated: "${trimmedName}". Loading projects...`);

    const projects = await loadAndMigrateProjects();

    // Check for duplicate names (case-insensitive)
    if (projects.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
        console.warn(`[Data Manager - addProject] Project with name "${trimmedName}" already exists.`);
        throw new Error(`Project named "${trimmedName}" already exists`);
    }

    // Create the new project object with optional color
    const newProject = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
        name: trimmedName,
        color: projectData.color || '#4E79A7' // Use provided color or default
    };
    console.log('[Data Manager - addProject] New project object created:', newProject);

    projects.push(newProject);

    console.log('[Data Manager - addProject] Writing updated projects array to file:', PROJECTS_FILE_PATH);
    try {
        await fsPromises.writeFile(PROJECTS_FILE_PATH, JSON.stringify(projects, null, 2), 'utf8');
        console.log(`[Data Manager - addProject] File written. Project "${trimmedName}" added.`);
        return { success: true, project: newProject };
    } catch (writeError) {
        console.error('[Data Manager - addProject] Error writing projects file:', writeError);
        throw writeError;
    }
}

/**
 * Deletes a project from projects.json by its ID.
 * @param {string} id - The ID of the project to delete.
 * @returns {Promise<Object>} Object indicating success and the deleted ID, or throws error.
 */
async function deleteProject(id) {
    if (!id) {
        throw new Error('No project ID provided for deletion.');
    }
    console.log(`[Data Manager - deleteProject] Request to delete ID: ${id}`);
    let projects = await loadAndMigrateProjects(); // Load current
    const initialLength = projects.length;
    projects = projects.filter(p => p.id !== id);

    if (projects.length === initialLength) {
        console.warn(`[Data Manager - deleteProject] Project with ID ${id} not found.`);
        throw new Error(`Project with ID ${id} not found`);
    }

    console.log(`[Data Manager - deleteProject] Writing updated projects array after deletion.`);
    await fsPromises.writeFile(PROJECTS_FILE_PATH, JSON.stringify(projects, null, 2), 'utf8');
    console.log(`[Data Manager - deleteProject] Deleted project with ID: ${id}`);
    return { success: true, id: id };
}

/**
 * Saves a completed session to the data.csv file.
 * @param {Object} sessionData - The session details { startTime, endTime, durationMinutes, projectName, notes }
 * @returns {Promise<void>}
 */
async function saveSession(sessionData) {
  console.log("[Data Manager - Save Session] Received session to save:", sessionData);
  try {
      // Define the data for the new row using expected headers
      const dataToAppend = [{
          date: sessionData.startTime.split('T')[0], // YYYY-MM-DD
          start_time: new Date(sessionData.startTime).toTimeString().split(' ')[0], // HH:MM:SS
          end_time: new Date(sessionData.endTime).toTimeString().split(' ')[0], // HH:MM:SS
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
              // Read the last byte
              await fd.read(buffer, 0, 1, fileStat.size > 0 ? fileStat.size - 1 : 0);
              await fd.close();
              if (fileStat.size > 0 && buffer.toString() !== '\n') {
                  fileNeedsNewlinePrefix = true; // Add newline if missing and file not empty
                  console.log('[Data Manager - Save Session] File does not end with newline, adding one.');
              }
          }
      } catch (statError) {
          if (statError.code === 'ENOENT') {
              fileNeedsHeader = true; // File doesn't exist yet
              console.log('[Data Manager - Save Session] File does not exist, will add header.');
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
           console.log("[Data Manager - Save Session] Writing header and first line to:", DATA_FILE_PATH);
           await fsPromises.writeFile(DATA_FILE_PATH, stringToWrite, 'utf8');
      } else {
          // File exists, just append the data (with preceding newline if needed)
          stringToWrite = (fileNeedsNewlinePrefix ? "\n" : "") + csvFragment;
          console.log("[Data Manager - Save Session] Appending line:", stringToWrite.trim());
          await fsPromises.appendFile(DATA_FILE_PATH, stringToWrite, 'utf8');
      }

      console.log("[Data Manager - Save Session] Session successfully saved to CSV.");

  } catch (error) {
      console.error("[Data Manager - Save Session] Error formatting or saving session to CSV:", error);
      // Potentially throw error back to caller? Or just log here.
      throw error; // Rethrowing allows caller (e.g., tray) to know about the failure
  }
}

/**
 * Deletes a session from CSV file by ID
 * @param {string|number} id - The ID of the session to delete
 * @returns {Promise<boolean>} True if successful
 */
async function deleteSession(id) {
    try {
        // Load current sessions
        let sessions = await loadSessionsFromCSV();
        
        // Convert id to number for comparison
        const targetId = parseInt(id, 10);
        
        // Find session index
        const sessionIndex = sessions.findIndex(s => s.id === targetId);
        if (sessionIndex === -1) {
            throw new Error(`Session with ID ${targetId} not found`);
        }
        
        // Remove the session
        sessions.splice(sessionIndex, 1);
        
        // Convert sessions back to CSV format
        const csv = Papa.unparse(sessions.map(({ id, ...rest }) => rest), {
            header: true,
            quotes: true
        });
        
        // Write back to file
        await fsPromises.writeFile(DATA_FILE_PATH, csv, 'utf8');
        console.log(`[Data Manager] Successfully deleted session ${targetId}`);
        return true;
    } catch (error) {
        console.error('[Data Manager] Error deleting session:', error);
        throw new Error('Failed to delete session');
    }
}

/**
 * Gets all project names for dropdown selection
 * @returns {Promise<Array<string>>} Array of project names
 */
async function getProjectNames() {
    try {
        const projects = await loadAndMigrateProjects();
        return projects.map(project => project.name);
    } catch (error) {
        console.error('[Data Manager] Error getting project names:', error);
        return [];
    }
}

// Update the exports to remove deleteSessionFromCSV and keep deleteSession
module.exports = {
    USER_DATA_PATH,
    DATA_FILE_PATH,
    PROJECTS_FILE_PATH,
    ensureDataFilesExist,
    loadSessionsFromCSV,
    updateSessionInCSV,
    loadAndMigrateProjects,
    updateProjectColor,
    addProject,
    deleteProject,
    saveSession,
    deleteSession, // Keep only this one, remove deleteSessionFromCSV
    getProjectNames,
};

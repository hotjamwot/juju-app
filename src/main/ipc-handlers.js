const { ipcMain } = require('electron');
const dataManager = require('./data-manager'); // Handles data operations

function registerIpcHandlers() {
  console.log('[IPC Handler] Registering IPC handlers...');

  ipcMain.handle('load-sessions', async () => {
    try {
        return await dataManager.loadSessionsFromCSV();
    } catch (error) {
        console.error("Error in 'load-sessions' handler:", error);
        throw error; // Rethrow to let renderer handle it
    }
  });

  ipcMain.handle('update-session', async (event, id, field, value) => {
    try {
      return await dataManager.updateSessionInCSV(id, field, value);
    } catch (error) {
      console.error(`Error in 'update-session' handler for ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('load-projects', async () => {
    try {
      return await dataManager.loadAndMigrateProjects();
    } catch (error) {
        console.error("Error in 'load-projects' handler:", error);
        throw error;
    }
  });

  ipcMain.handle('add-project', async (event, projectData) => {
    console.log(`[IPC Handler] Received 'add-project' request:`, projectData);
    try {
      const result = await dataManager.addProject(projectData);
      console.log(`[IPC Handler] Success from addProject. Returning:`, result);
      return result;
    } catch (error) {
      console.error(`[IPC Handler] Error in 'add-project' handler:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-project', async (event, id) => {
    try {
      return await dataManager.deleteProject(id);
    } catch (error) {
      console.error(`Error in 'delete-project' handler for ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('update-project-color', async (event, id, color) => {
    try {
      return await dataManager.updateProjectColor(id, color);
    } catch (error) {
      console.error(`Error in 'update-project-color' handler for ID ${id}:`, error);
      throw error;
    }
  });

  console.log('[IPC Handler] IPC handlers registered.');
}

module.exports = {
  registerIpcHandlers,
};

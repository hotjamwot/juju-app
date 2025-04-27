const { ipcMain } = require('electron');
const dataManager = require('./data-manager'); // Handles data operations
const { getStartOfWeek, getStartOfMonth, formatDateYYYYMMDD, formatShortDate, getDayName } = require('./utils'); // Import date utils

// Helper function to calculate total hours for a given date range (inclusive)
function calculateTotalHours(sessions, startDateStr, endDateStr) {
    let totalMinutes = 0;
    const start = new Date(startDateStr + 'T00:00:00');
    const end = new Date(endDateStr + 'T23:59:59'); // Include the whole end day

    sessions.forEach(session => {
        try {
            const sessionDate = new Date(session.date + 'T00:00:00');
            if (!isNaN(sessionDate) && sessionDate >= start && sessionDate <= end) {
                totalMinutes += parseInt(session.duration_minutes, 10) || 0;
            }
        } catch (e) { /* ignore invalid dates */ }
    });
    return totalMinutes / 60; // Convert to hours
}

// --- Removed calculateAverageHoursForDay, getWeekNumber, calculateHistoricalAverage ---

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

  ipcMain.handle('get-comparison-stats', async () => {
    try {
        const sessions = await dataManager.loadSessionsFromCSV();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = formatDateYYYYMMDD(today);
        const todayDayOfWeek = today.getDay(); // 0=Sun, 6=Sat
        const todayDateOfMonth = today.getDate();
        const dayName = getDayName(todayDayOfWeek);

        // --- Day Comparison ---
        const pastDayStats = [];
        for (let i = 3; i >= 1; i--) {
            const pastDate = new Date(today);
            pastDate.setDate(today.getDate() - (i * 7));
            const pastDateStr = formatDateYYYYMMDD(pastDate);
            const value = calculateTotalHours(sessions, pastDateStr, pastDateStr);
            let label;
            if (i === 3) label = `3 ${dayName}s Ago`;
            else if (i === 2) label = `2 ${dayName}s Ago`;
            else label = `Last ${dayName}`;
            pastDayStats.push({ value, label, range: formatShortDate(pastDate) });
        }
        const todayHours = calculateTotalHours(sessions, todayStr, todayStr);
        const dayComparison = {
            current: { value: todayHours, label: "Today", range: formatShortDate(today) },
            past: pastDayStats // Oldest to newest
        };

        // --- Week Comparison ---
        const pastWeekStats = [];
        const startOfThisWeek = getStartOfWeek(today);
        const thisWeekHours = calculateTotalHours(sessions, formatDateYYYYMMDD(startOfThisWeek), todayStr);
        for (let i = 3; i >= 1; i--) {
            const pastWeekEndDate = new Date(today);
            pastWeekEndDate.setDate(today.getDate() - (i * 7));
            const pastWeekStartDate = getStartOfWeek(pastWeekEndDate);
            const value = calculateTotalHours(sessions, formatDateYYYYMMDD(pastWeekStartDate), formatDateYYYYMMDD(pastWeekEndDate));
            let label;
            if (i === 3) label = "3 Weeks Ago";
            else if (i === 2) label = "2 Weeks Ago";
            else label = "Last Week";
            const range = `${formatShortDate(pastWeekStartDate)} - ${formatShortDate(pastWeekEndDate)}`;
            pastWeekStats.push({ value, label, range });
        }
        const weekComparison = {
            current: { value: thisWeekHours, label: "This Week", range: `${formatShortDate(startOfThisWeek)} - ${formatShortDate(today)}` },
            past: pastWeekStats
        };

        // --- Month Comparison ---
        const pastMonthStats = [];
        const startOfThisMonth = getStartOfMonth(today);
        const thisMonthHours = calculateTotalHours(sessions, formatDateYYYYMMDD(startOfThisMonth), todayStr);
        for (let i = 3; i >= 1; i--) {
            const pastMonthEndDate = new Date(today);
            pastMonthEndDate.setMonth(today.getMonth() - i, todayDateOfMonth);
            if (pastMonthEndDate.getDate() !== todayDateOfMonth) {
                pastMonthEndDate.setDate(0);
            }
            
            const pastMonthStartDate = new Date(pastMonthEndDate);
            pastMonthStartDate.setDate(1);

            const value = calculateTotalHours(sessions, formatDateYYYYMMDD(pastMonthStartDate), formatDateYYYYMMDD(pastMonthEndDate));
            let label;
            if (i === 3) label = "3 Months Ago";
            else if (i === 2) label = "2 Months Ago";
            else label = "Last Month";
            const range = `${formatShortDate(pastMonthStartDate)} - ${formatShortDate(pastMonthEndDate)}`;
            pastMonthStats.push({ value, label, range });
        }
        const monthComparison = {
            current: { value: thisMonthHours, label: "This Month", range: `${formatShortDate(startOfThisMonth)} - ${formatShortDate(today)}` },
            past: pastMonthStats
        };

        return {
            day: dayComparison,
            week: weekComparison,
            month: monthComparison
        };

    } catch (error) {
        console.error("Error in 'get-comparison-stats' handler:", error);
        throw error;
    }
  });

  console.log('[IPC Handler] IPC handlers registered.');
}

module.exports = {
  registerIpcHandlers,
};

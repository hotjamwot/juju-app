const { ipcMain } = require('electron');
const dataManager = require('./data-manager'); // Handles data operations
const { getStartOfWeek, getStartOfMonth, formatDateYYYYMMDD, formatShortDate } = require('./utils'); // Import date utils

// Helper function to calculate total hours for a given date range
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

// Helper function to calculate average hours for a specific day of the week
function calculateAverageHoursForDay(sessions, targetDayOfWeek) {
    const dailyTotals = {}; // Key: YYYY-MM-DD, Value: total minutes
    let dayCount = 0;

    sessions.forEach(session => {
        try {
            const sessionDate = new Date(session.date + 'T00:00:00');
            if (!isNaN(sessionDate) && sessionDate.getDay() === targetDayOfWeek) {
                const dateStr = session.date;
                if (!dailyTotals[dateStr]) {
                    dailyTotals[dateStr] = 0;
                    dayCount++; // Count each unique day that matches the targetDayOfWeek
                }
                dailyTotals[dateStr] += parseInt(session.duration_minutes, 10) || 0;
            }
        } catch (e) { /* ignore invalid dates */ }
    });

    if (dayCount === 0) return 0;

    const totalMinutesAcrossDays = Object.values(dailyTotals).reduce((sum, minutes) => sum + minutes, 0);
    return (totalMinutesAcrossDays / dayCount) / 60; // Average hours
}


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

  // --- NEW HANDLER ---
  ipcMain.handle('get-comparison-stats', async () => {
    console.log('[IPC Handler] Received get-comparison-stats request');
    try {
        const sessions = await dataManager.loadSessionsFromCSV();
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today
        const todayStr = formatDateYYYYMMDD(today);
        const todayDayOfWeek = today.getDay(); // 0=Sun, 1=Mon,...

        // --- Day Comparison ---
        const todayHours = calculateTotalHours(sessions, todayStr, todayStr);
        const avgDayHours = calculateAverageHoursForDay(sessions, todayDayOfWeek);
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const avgDayLabel = `Avg ${dayNames[todayDayOfWeek]}`;

        // --- Week Comparison ---
        const startOfThisWeek = getStartOfWeek(today);
        const startOfThisWeekStr = formatDateYYYYMMDD(startOfThisWeek);

        const startOfLastWeek = new Date(startOfThisWeek);
        startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
        const startOfLastWeekStr = formatDateYYYYMMDD(startOfLastWeek);

        const endOfLastWeekComparable = new Date(startOfLastWeek);
        // Add the same number of days into last week as we are into this week
        const daysIntoThisWeek = (today.getTime() - startOfThisWeek.getTime()) / (1000 * 60 * 60 * 24);
        endOfLastWeekComparable.setDate(endOfLastWeekComparable.getDate() + daysIntoThisWeek);
        const endOfLastWeekComparableStr = formatDateYYYYMMDD(endOfLastWeekComparable);

        const thisWeekHours = calculateTotalHours(sessions, startOfThisWeekStr, todayStr);
        const lastWeekHours = calculateTotalHours(sessions, startOfLastWeekStr, endOfLastWeekComparableStr);

        const thisWeekRangeStr = `${formatShortDate(startOfThisWeek)} - ${formatShortDate(today)}`;
        const lastWeekRangeStr = `${formatShortDate(startOfLastWeek)} - ${formatShortDate(endOfLastWeekComparable)}`;

        // --- Month Comparison ---
        const startOfThisMonth = getStartOfMonth(today);
        const startOfThisMonthStr = formatDateYYYYMMDD(startOfThisMonth);

        const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const startOfLastMonthStr = formatDateYYYYMMDD(startOfLastMonth);

        const endOfLastMonthComparable = new Date(startOfLastMonth);
        endOfLastMonthComparable.setDate(today.getDate()); // Same day number in the previous month
        // Adjust if last month was shorter and the day doesn't exist (e.g., Feb 31 -> Feb 28/29)
        if (endOfLastMonthComparable.getMonth() !== startOfLastMonth.getMonth()) {
             // If setting the day rolled over the month, set to the actual last day of last month
             endOfLastMonthComparable.setDate(0); // Sets to the last day of the previous month
        }
        const endOfLastMonthComparableStr = formatDateYYYYMMDD(endOfLastMonthComparable);


        const thisMonthHours = calculateTotalHours(sessions, startOfThisMonthStr, todayStr);
        const lastMonthHours = calculateTotalHours(sessions, startOfLastMonthStr, endOfLastMonthComparableStr);

        const thisMonthRangeStr = `${formatShortDate(startOfThisMonth)} - ${formatShortDate(today)}`;
        const lastMonthRangeStr = `${formatShortDate(startOfLastMonth)} - ${formatShortDate(endOfLastMonthComparable)}`;

        return {
            day: {
                current: { value: todayHours, label: "Today", range: formatShortDate(today) },
                previous: { value: avgDayHours, label: avgDayLabel, range: "Historical Avg" }
            },
            week: {
                current: { value: thisWeekHours, label: "This Week", range: thisWeekRangeStr },
                previous: { value: lastWeekHours, label: "Last Week", range: lastWeekRangeStr }
            },
            month: {
                current: { value: thisMonthHours, label: "This Month", range: thisMonthRangeStr },
                previous: { value: lastMonthHours, label: "Last Month", range: lastMonthRangeStr }
            }
        };

    } catch (error) {
        console.error("Error in 'get-comparison-stats' handler:", error);
        throw error; // Rethrow to let renderer handle it
    }
  });
  // --- END NEW HANDLER ---


  console.log('[IPC Handler] IPC handlers registered.');
}

module.exports = {
  registerIpcHandlers,
};

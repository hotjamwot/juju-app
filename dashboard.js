import { initCharts, destroyCharts } from './src/renderer/dashboard/charts.js';
import { setupTabs, updateSessionsTable } from './src/renderer/dashboard/ui.js';

// --- Global Variables ---
let yearlyChart = null; // These will hold the chart instances returned by initCharts
let weeklyChart = null;
let pieChart = null;
let allSessions = []; // Cache for session data

// --- DOM Elements (Optional: Cache elements for minor performance boost) ---
// const graphsTab = document.querySelector('.tab[data-tab="graphs"]');
// const sessionsTab = document.querySelector('.tab[data-tab="sessions-projects"]');
// const graphsContent = document.getElementById('graphs');
// const sessionsContent = document.getElementById('sessions-projects');
const recentSessionsBody = document.getElementById('recent-sessions-body');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    setupTabs(); // Call imported function
    refreshDashboardData(); // Initial data load
});

// --- Data Refresh ---
async function refreshDashboardData() {
    console.log('[Dashboard] Refreshing dashboard data...');
    try {
        // Reload sessions data from main process via preload script
        allSessions = await window.api.loadSessions();
        console.log('[Dashboard] Refreshed sessions data count:', allSessions.length);

        // Update the visual components using imported functions
        // Pass refreshDashboardData as the callback to updateSessionsTable
        updateSessionsTable(allSessions, refreshDashboardData);
        destroyCharts();
        const chartInstances = initCharts(allSessions);
        // Store the returned chart instances
        yearlyChart = chartInstances.yearlyChart;
        weeklyChart = chartInstances.weeklyChart;
        pieChart = chartInstances.pieChart;

    } catch (error) {
        console.error('[Dashboard] Error refreshing dashboard data:', error);
        if (recentSessionsBody) { // Display error in table if possible
            recentSessionsBody.innerHTML = `<tr><td colspan="6" class="error">Error loading sessions: ${error.message}</td></tr>`;
        }
    }
}

// Note: Chart.js library needs to be loaded in dashboard.html for the charts module to work.
// Example: <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

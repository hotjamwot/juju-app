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
    initProjectManagement();
});

// --- Project Management ---
async function initProjectManagement() {
    const projectsList = document.getElementById('projects-list');
    const addProjectForm = document.getElementById('add-project-form');

    // Load and display projects
    await refreshProjectsList();

    // Add project form handler
    addProjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('new-project-name');
        const colorInput = document.getElementById('new-project-color');
        
        try {
            const result = await window.api.addProject({
                name: nameInput.value.trim(),
                color: colorInput.value
            });

            if (result && result.success) {
                nameInput.value = '';
                colorInput.value = '#4E79A7';
                await refreshProjectsList();
                // Refresh charts to show new project color
                refreshDashboardData();
            }
        } catch (error) {
            console.error('Error adding project:', error);
            alert('Failed to add project: ' + error.message);
        }
    });
}

async function refreshProjectsList() {
    const projectsList = document.getElementById('projects-list');
    const projects = await window.api.loadProjects();

    projectsList.innerHTML = '';
    
    projects.forEach(project => {
        const projectElement = document.createElement('div');
        projectElement.className = 'project-item';
        projectElement.innerHTML = `
            <div class="project-info">
                <span class="project-name">${project.name}</span>
                <div class="project-color">
                    <input type="color" value="${project.color || '#4E79A7'}" 
                           data-project-id="${project.id}">
                </div>
            </div>
            <div class="project-actions">
                <button class="delete-project" data-project-id="${project.id}">Delete</button>
            </div>
        `;

        // Add color change handler
        const colorInput = projectElement.querySelector('input[type="color"]');
        colorInput.addEventListener('change', async (e) => {
            try {
                await window.api.updateProjectColor(project.id, e.target.value);
                refreshDashboardData();
            } catch (error) {
                console.error('Error updating project color:', error);
                alert('Failed to update color: ' + error.message);
            }
        });

        // Add delete handler
        const deleteButton = projectElement.querySelector('.delete-project');
        deleteButton.addEventListener('click', async () => {
            if (confirm(`Are you sure you want to delete ${project.name}?`)) {
                try {
                    await window.api.deleteProject(project.id);
                    await refreshProjectsList();
                    refreshDashboardData();
                } catch (error) {
                    console.error('Error deleting project:', error);
                    alert('Failed to delete project: ' + error.message);
                }
            }
        });

        projectsList.appendChild(projectElement);
    });
}

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

// Initialize dashboard
(async () => {
    try {
        // Import modules
        const { initCharts, destroyCharts } = await import('./src/renderer/dashboard/charts.js');
        const { setupTabs, updateSessionsTable } = await import('./src/renderer/dashboard/ui.js');

        // --- Global Variables ---
        let yearlyChart = null;
        let weeklyChart = null;
        let pieChart = null;
        let allSessions = [];

        // --- Data Refresh ---
        async function refreshDashboardData() {
            console.log('[Dashboard] Refreshing dashboard data...');
            try {
                allSessions = await window.api.loadSessions();
                console.log('[Dashboard] Refreshed sessions data count:', allSessions.length);

                // Update sessions table
                updateSessionsTable(allSessions, refreshDashboardData);

                // Initialize charts
                destroyCharts(); // Clean up existing charts first
                const chartInstances = await initCharts(allSessions);
                
                // Store chart instances
                yearlyChart = chartInstances.yearlyChart;
                weeklyChart = chartInstances.weeklyChart;
                pieChart = chartInstances.pieChart;

            } catch (error) {
                console.error('[Dashboard] Error refreshing dashboard data:', error);
            }
        }

        // --- Project Management ---
        async function initProjectManagement() {
            const projectsList = document.getElementById('projects-list');
            const addProjectForm = document.getElementById('add-project-form');

            if (!projectsList || !addProjectForm) {
                console.error('Project management elements not found');
                return;
            }

            // Load and display projects
            await refreshProjectsList();

            // Add project form handler
            addProjectForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const nameInput = document.getElementById('new-project-name');
                const colorInput = document.getElementById('new-project-color');
                
                if (!nameInput || !colorInput) return;
                
                try {
                    const result = await window.api.addProject({
                        name: nameInput.value.trim(),
                        color: colorInput.value
                    });

                    if (result && result.success) {
                        nameInput.value = '';
                        colorInput.value = '#4E79A7';
                        await refreshProjectsList();
                        await refreshDashboardData();
                    }
                } catch (error) {
                    console.error('Error adding project:', error);
                    alert('Failed to add project: ' + error.message);
                }
            });
        }

        async function refreshProjectsList() {
            const projectsList = document.getElementById('projects-list');
            if (!projectsList) {
                console.error('Projects list element not found');
                return;
            }

            try {
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
                    if (colorInput) {
                        colorInput.addEventListener('change', async (e) => {
                            try {
                                await window.api.updateProjectColor(project.id, e.target.value);
                                await refreshDashboardData();
                            } catch (error) {
                                console.error('Error updating project color:', error);
                                alert('Failed to update color: ' + error.message);
                            }
                        });
                    }

                    // Add delete handler
                    const deleteButton = projectElement.querySelector('.delete-project');
                    if (deleteButton) {
                        deleteButton.addEventListener('click', async () => {
                            if (confirm(`Are you sure you want to delete ${project.name}?`)) {
                                try {
                                    await window.api.deleteProject(project.id);
                                    await refreshProjectsList();
                                    await refreshDashboardData();
                                } catch (error) {
                                    console.error('Error deleting project:', error);
                                    alert('Failed to delete project: ' + error.message);
                                }
                            }
                        });
                    }

                    projectsList.appendChild(projectElement);
                });
            } catch (error) {
                console.error('Error loading projects:', error);
                projectsList.innerHTML = '<div class="error">Failed to load projects</div>';
            }
        }

        // --- Initialization ---
        setupTabs(); // Set up tab functionality
        await initProjectManagement();
        await refreshDashboardData();

    } catch (error) {
        console.error('[Dashboard] Error initializing dashboard:', error);
    }
})();

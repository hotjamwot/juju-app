// Initialize dashboard
(async () => {
    try {
        // Import modules
        const { updateCharts, destroyCharts } = await import('./src/renderer/dashboard/charts.js'); // <-- Import updateCharts
        const { setupTabs, updateSessionsTable } = await import('./src/renderer/dashboard/ui.js');

        // --- Global Variables ---
        let allSessions = []; // Store all loaded sessions
        let currentFilter = '1y'; // Default filter
        let currentRangeTitle = 'This Year'; // Default title

        // --- DOM Elements for Filters ---
        const dateFilterButtons = document.querySelectorAll('.date-filter-btn');
        const dateFromInput = document.getElementById('date-from');
        const dateToInput = document.getElementById('date-to');
        const applyCustomDateButton = document.getElementById('apply-custom-date');

        // --- Date Filtering Logic ---

        /**
         * Calculates the start and end dates for a given range identifier.
         * @param {string} range - '7d', '1m', '3m', '1y', 'all', 'custom'
         * @param {string} [customStart] - YYYY-MM-DD format for custom range
         * @param {string} [customEnd] - YYYY-MM-DD format for custom range
         * @returns {{startDate: Date | null, endDate: Date | null, rangeTitle: string}}
         */
        function getDatesForRange(range, customStart = null, customEnd = null) {
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Normalize to start of day
            let startDate = new Date(today);
            let endDate = new Date(today);
            endDate.setHours(23, 59, 59, 999); // Normalize to end of day
            let rangeTitle = '';

            switch (range) {
                case '7d':
                    startDate.setDate(today.getDate() - 6); // Today + 6 previous days
                    rangeTitle = 'Last 7 Days';
                    break;
                case '1m':
                    startDate = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
                    rangeTitle = 'Last Month';
                    break;
                case '3m':
                    startDate = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
                    rangeTitle = 'Last Quarter';
                    break;
                case '1y':
                    startDate = new Date(today.getFullYear(), 0, 1); // Start of current year
                    rangeTitle = 'This Year';
                    break;
                case 'all':
                    startDate = null; // Indicate no start date limit
                    endDate = null;   // Indicate no end date limit
                    rangeTitle = 'All Time';
                    break;
                case 'custom':
                    try {
                        startDate = customStart ? new Date(customStart + 'T00:00:00') : null;
                        endDate = customEnd ? new Date(customEnd + 'T23:59:59.999') : null;
                        if (startDate && endDate && startDate > endDate) {
                             alert("Start date cannot be after end date.");
                             return { startDate: null, endDate: null, rangeTitle: 'Invalid Range' }; // Indicate error
                        }
                        rangeTitle = `Custom (${customStart || '...'} - ${customEnd || '...'})`;
                    } catch (e) {
                        console.error("Error parsing custom dates:", e);
                        alert("Invalid custom date format.");
                        return { startDate: null, endDate: null, rangeTitle: 'Invalid Range' }; // Indicate error
                    }
                    break;
                default: // Default to 'This Year' if range is unknown
                    startDate = new Date(today.getFullYear(), 0, 1);
                    rangeTitle = 'This Year';
            }
             // Ensure startDate is Date object or null
             if (startDate && !(startDate instanceof Date && !isNaN(startDate))) startDate = null;
             // Ensure endDate is Date object or null
             if (endDate && !(endDate instanceof Date && !isNaN(endDate))) endDate = null;

            return { startDate, endDate, rangeTitle };
        }

        /**
         * Filters the global allSessions array based on start and end dates.
         * @param {Date | null} startDate - Start date (inclusive), null for no limit.
         * @param {Date | null} endDate - End date (inclusive), null for no limit.
         * @returns {Array<Object>} Filtered sessions.
         */
        function filterSessionsByDate(startDate, endDate) {
            if (!allSessions) return [];
            if (startDate === null && endDate === null) {
                return [...allSessions]; // Return all if range is 'all'
            }

            return allSessions.filter(session => {
                try {
                    const sessionDate = new Date(session.date + 'T00:00:00'); // Use session date only
                    if (isNaN(sessionDate.getTime())) return false; // Skip invalid session dates

                    const afterStart = startDate === null || sessionDate >= startDate;
                    const beforeEnd = endDate === null || sessionDate <= endDate;
                    return afterStart && beforeEnd;
                } catch (e) {
                    console.warn("Error parsing session date during filter:", session.date, e);
                    return false;
                }
            });
        }

        /**
         * Handles clicks on date filter buttons or custom apply.
         * Updates charts based on the selected range.
         * @param {string} range - '7d', '1m', '3m', '1y', 'all', 'custom'
         */
        async function handleDateFilterChange(range) {
            console.log(`[Dashboard] Date filter changed to: ${range}`);
            let customStart = null;
            let customEnd = null;

            if (range === 'custom') {
                customStart = dateFromInput.value;
                customEnd = dateToInput.value;
                if (!customStart || !customEnd) {
                    alert("Please select both 'From' and 'To' dates for custom range.");
                    return; // Don't proceed if custom dates are missing
                }
            }

            const { startDate, endDate, rangeTitle } = getDatesForRange(range, customStart, customEnd);

            if (rangeTitle === 'Invalid Range') return; // Stop if date calculation failed

            const filteredSessions = filterSessionsByDate(startDate, endDate);
            console.log(`[Dashboard] Filtered sessions count for "${rangeTitle}": ${filteredSessions.length}`);

            currentFilter = range; // Store the current filter type
            currentRangeTitle = rangeTitle; // Store the title

            // Update button active states
            dateFilterButtons.forEach(btn => {
                if (btn.dataset.range === range) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            // If custom range applied, remove active state from predefined buttons
            if (range === 'custom') {
                 dateFilterButtons.forEach(btn => btn.classList.remove('active'));
            }


            // Update charts with the filtered data
            try {
                await updateCharts(filteredSessions, allSessions, rangeTitle); // Pass filtered and all sessions
            } catch (error) {
                console.error(`[Dashboard] Error updating charts for range ${range}:`, error);
            }
        }

        // --- Data Refresh ---
        async function refreshDashboardData() {
            console.log('[Dashboard] Refreshing dashboard data...');
            try {
                // 1. Load all session data
                allSessions = await window.api.loadSessions();
                console.log('[Dashboard] Refreshed sessions data count:', allSessions.length);

                // 2. Update sessions table (always shows recent, unfiltered)
                updateSessionsTable(allSessions, refreshDashboardData);

                // 3. Apply the *current* filter and update charts
                // Use currentFilter and currentRangeTitle stored globally
                let initialStartDate, initialEndDate;
                if (currentFilter === 'custom') {
                    ({ startDate: initialStartDate, endDate: initialEndDate } = getDatesForRange(currentFilter, dateFromInput.value, dateToInput.value));
                } else {
                    ({ startDate: initialStartDate, endDate: initialEndDate } = getDatesForRange(currentFilter));
                }
                const initialFilteredSessions = filterSessionsByDate(initialStartDate, initialEndDate);
                await updateCharts(initialFilteredSessions, allSessions, currentRangeTitle);

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

        // --- Event Listeners for Filters ---
        dateFilterButtons.forEach(button => {
            button.addEventListener('click', () => handleDateFilterChange(button.dataset.range));
        });

        applyCustomDateButton.addEventListener('click', () => handleDateFilterChange('custom'));


        // --- Initialization ---
        setupTabs(); // Set up tab functionality
        await initProjectManagement(); // Setup project add/delete/color
        await refreshDashboardData(); // Load initial data first
        // No need to call handleDateFilterChange here as refreshDashboardData already does it

    } catch (error) {
        console.error('[Dashboard] Error initializing dashboard:', error);
        // Display a user-friendly error message?
        const chartsDiv = document.getElementById('charts');
        if (chartsDiv) {
            chartsDiv.innerHTML = `<div class="error-message">Failed to initialize dashboard. Please check console for details. Error: ${error.message}</div>`;
        }
    }
})();

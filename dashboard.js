// Initialize dashboard
(async () => {
    try {
        // Import modules
        const { updateCharts, destroyCharts } = await import('./src/renderer/dashboard/charts.js'); // <-- Import updateCharts
        const { setupTabs, updateSessionsTable } = await import('./src/renderer/dashboard/ui.js');

        // --- Global Variables ---
        let allSessions = []; // Store all loaded sessions
        let currentChartFilter = '1y'; // Default CHART filter
        let currentChartRangeTitle = 'This Year'; // Default CHART title

        // Session Table State
        const pageSize = 20;
        let currentPage = 1;
        let currentProjectFilter = 'All'; // Default project filter

        // --- DOM Elements ---
        // Chart Filters
        const dateFilterButtons = document.querySelectorAll('.btn-filter'); // Use updated class
        const dateFromInput = document.getElementById('date-from');
        const dateToInput = document.getElementById('date-to');
        const applyCustomDateButton = document.getElementById('apply-custom-date');
        // Session Table Controls
        const projectFilterSelect = document.getElementById('project-filter-select');
        const prevPageBtn = document.getElementById('prev-page-btn');
        const nextPageBtn = document.getElementById('next-page-btn');
        const pageInfoSpan = document.getElementById('page-info');


        // --- Chart Date Filtering Logic ---

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

            const filteredSessionsForChart = filterSessionsByDate(startDate, endDate);
            console.log(`[Dashboard] Filtered sessions count for chart "${rangeTitle}": ${filteredSessionsForChart.length}`);

            currentChartFilter = range; // Store the current CHART filter type
            currentChartRangeTitle = rangeTitle; // Store the CHART title

            // Update CHART filter button active states
            dateFilterButtons.forEach(btn => {
                if (btn.dataset.range === range) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            // If custom CHART range applied, remove active state from predefined buttons
            if (range === 'custom') {
                 dateFilterButtons.forEach(btn => {
                     // Only remove active if it's not a session control button
                     if (btn.closest('.date-filter-buttons')) {
                         btn.classList.remove('active');
                     }
                 });
            }


            // Update charts with the filtered data
            try {
                await updateCharts(filteredSessionsForChart, allSessions, rangeTitle); // Pass filtered and all sessions
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

                // 2. Populate Project Filter Dropdown (only needs to happen once or when projects change significantly)
                // We'll call this after the first load, and potentially after project edits if needed.
                // For now, just call after first load.
                if (projectFilterSelect.options.length <= 1) { // Avoid repopulating unnecessarily
                    populateProjectFilter();
                }

                // 3. Update the session display (filtering, pagination, table update)
                refreshSessionDisplay(); // This now handles table updates

                // 4. Apply the *current* CHART filter and update charts
                // Use currentChartFilter and currentChartRangeTitle stored globally
                let initialStartDate, initialEndDate;
                if (currentChartFilter === 'custom') {
                    ({ startDate: initialStartDate, endDate: initialEndDate } = getDatesForRange(currentChartFilter, dateFromInput.value, dateToInput.value));
                } else {
                    ({ startDate: initialStartDate, endDate: initialEndDate } = getDatesForRange(currentChartFilter));
                }
                const initialFilteredSessionsForChart = filterSessionsByDate(initialStartDate, initialEndDate);
                await updateCharts(initialFilteredSessionsForChart, allSessions, currentChartRangeTitle);

            } catch (error) {
                console.error('[Dashboard] Error refreshing dashboard data:', error);
            }
        }


        // --- Session Table Filtering & Pagination Logic ---

        /**
         * Populates the project filter dropdown with unique project names from allSessions.
         */
        function populateProjectFilter() {
            if (!projectFilterSelect) return;

            const projects = [...new Set(allSessions.map(s => s.project || 'N/A'))].sort();
            // Clear existing options except the "All" default
            projectFilterSelect.innerHTML = '<option value="All">All Projects</option>';

            projects.forEach(project => {
                if (project) { // Ensure project name is not empty/null
                    const option = document.createElement('option');
                    option.value = project;
                    option.textContent = project;
                    projectFilterSelect.appendChild(option);
                }
            });
            projectFilterSelect.value = currentProjectFilter; // Set dropdown to current filter
            console.log('[Dashboard] Project filter populated.');
        }

        /**
         * Calculates the sessions to display based on current filters and pagination.
         * @returns {{ visibleSessions: Array<Object>, currentPage: number, totalPages: number }}
         */
        function calculateVisibleSessions() {
            // 1. Filter by Project
            let filtered = allSessions;
            if (currentProjectFilter !== 'All') {
                filtered = allSessions.filter(session => (session.project || 'N/A') === currentProjectFilter);
            }

            // 2. Sort by Date (most recent first - already done in ui.js, but good to ensure here too)
            // Let's keep the sorting logic primarily in ui.js for consistency when editing,
            // but we need the *full* sorted list here for pagination.
             filtered.sort((a, b) => {
                 const dateA = new Date(`${a.date || ''}T${a.start_time || ''}`).getTime();
                 const dateB = new Date(`${b.date || ''}T${b.start_time || ''}`).getTime();
                 // Handle potential NaN values robustly
                 const valA = isNaN(dateA) ? -Infinity : dateA;
                 const valB = isNaN(dateB) ? -Infinity : dateB;
                 return valB - valA; // Descending order
             });


            // 3. Paginate
            const totalItems = filtered.length;
            const totalPages = Math.max(1, Math.ceil(totalItems / pageSize)); // Ensure at least 1 page

            // Adjust currentPage if it's out of bounds (e.g., after filtering)
            // Default to last page if current page is invalid
            if (currentPage > totalPages) {
                currentPage = totalPages;
            }
            if (currentPage < 1) {
                currentPage = 1;
            }

            const startIndex = (currentPage - 1) * pageSize;
            const endIndex = startIndex + pageSize;
            const visibleSessions = filtered.slice(startIndex, endIndex);

            return { visibleSessions, currentPage, totalPages };
        }

        /**
         * Updates the session table display, pagination controls, and info text.
         */
        function refreshSessionDisplay() {
            const { visibleSessions, currentPage: adjustedCurrentPage, totalPages } = calculateVisibleSessions();

            // Update state (currentPage might have been adjusted)
            currentPage = adjustedCurrentPage;

            // Update the table in the UI
            updateSessionsTable(visibleSessions, refreshDashboardData); // Pass only the visible sessions

            // Update pagination controls
            if (pageInfoSpan) {
                pageInfoSpan.textContent = `Page ${currentPage} of ${totalPages}`;
            }
            if (prevPageBtn) {
                prevPageBtn.disabled = currentPage <= 1;
            }
            if (nextPageBtn) {
                nextPageBtn.disabled = currentPage >= totalPages;
            }
            console.log(`[Dashboard] Session display refreshed. Page: ${currentPage}/${totalPages}, Filter: ${currentProjectFilter}`);
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

        // --- Event Listeners ---
        // Chart Date Filters
        dateFilterButtons.forEach(button => {
             // Only add listener if it's part of the date filter group
             if (button.closest('.date-filter-buttons')) {
                button.addEventListener('click', () => handleDateFilterChange(button.dataset.range));
             }
        });
        applyCustomDateButton.addEventListener('click', () => handleDateFilterChange('custom'));

        // Session Table Filters & Pagination
        projectFilterSelect?.addEventListener('change', (e) => {
            currentProjectFilter = e.target.value;
            currentPage = 1; // Reset to page 1 (most recent) when filter changes
            refreshSessionDisplay();
        });

        prevPageBtn?.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                refreshSessionDisplay();
            }
        });

        nextPageBtn?.addEventListener('click', () => {
            // Calculate total pages dynamically in case it changed
            const { totalPages } = calculateVisibleSessions();
            if (currentPage < totalPages) {
                currentPage++;
                refreshSessionDisplay();
            }
        });


        // --- Initialization ---
        setupTabs(); // Set up tab functionality
        await initProjectManagement(); // Setup project add/delete/color
        await refreshDashboardData(); // Load initial data, populate filter, and display sessions/charts (will default to page 1)

        // Initial display is handled by refreshDashboardData calling refreshSessionDisplay,
        // which uses the default currentPage = 1. No extra setting needed here.


    } catch (error) {
        console.error('[Dashboard] Error initializing dashboard:', error);
        // Display a user-friendly error message?
        const chartsDiv = document.getElementById('charts');
        if (chartsDiv) {
            chartsDiv.innerHTML = `<div class="error-message">Failed to initialize dashboard. Please check console for details. Error: ${error.message}</div>`;
        }
    }
})();

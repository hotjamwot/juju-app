// --- Global Variables ---
let yearlyChart = null;
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
    setupTabs();
    refreshDashboardData(); // Initial data load
});

// --- Tab Functionality ---
function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all tabs and content
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            // Activate clicked tab and corresponding content
            tab.classList.add('active');
            const contentId = tab.dataset.tab;
            const contentElement = document.getElementById(contentId);
            if (contentElement) {
                contentElement.classList.add('active');
            } else {
                console.error(`Tab content not found for ID: ${contentId}`);
            }
        });
    });
}

// --- Data Refresh ---
async function refreshDashboardData() {
    console.log('[Dashboard] Refreshing dashboard data...');
    try {
        // Reload sessions data from main process via preload script
        allSessions = await window.api.loadSessions();
        console.log('[Dashboard] Refreshed sessions data count:', allSessions.length);

        // Update the visual components
        updateSessionsTable(allSessions);
        destroyCharts(); // Destroy old charts before creating new ones
        initCharts(allSessions); // Initialize charts with potentially new data

    } catch (error) {
        console.error('[Dashboard] Error refreshing dashboard data:', error);
        if (recentSessionsBody) { // Display error in table if possible
            recentSessionsBody.innerHTML = `<tr><td colspan="6" class="error">Error loading sessions: ${error.message}</td></tr>`;
        }
    }
}

// --- Sessions Table ---
function updateSessionsTable(sessions) {
    if (!recentSessionsBody) return; // Exit if table body not found

    // Sort sessions by date & start time (most recent first)
    sessions.sort((a, b) => {
        // Combine date and time for accurate sorting, handle potentially invalid formats gracefully
        const dateA = new Date(`${a.date || ''}T${a.start_time || ''}`).getTime();
        const dateB = new Date(`${b.date || ''}T${b.start_time || ''}`).getTime();
        return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA); // Put invalid dates last? Or first? Adjust as needed.
    });

    // Display maybe more sessions? Or keep it at 10? Let's make it 20 for now.
    recentSessionsBody.innerHTML = ''; // Clear previous content
    const displaySessions = sessions.slice(0, 20);
    if (displaySessions.length === 0) {
        recentSessionsBody.innerHTML = `
            <tr><td colspan="6" class="no-data">No sessions recorded yet. Use the tray menu to start tracking.</td></tr>`;
        return;
    }

    // Add each session row to the table
    displaySessions.forEach(session => {
        const row = document.createElement('tr');
        row.setAttribute('data-session-id', session.id); // Add ID to row for easier selection

        // Formatting (handle potential invalid dates/times gracefully)
        let formattedDate = "Invalid Date";
        try {
            const dateObj = new Date(session.date + 'T00:00:00'); // Treat date as local
             if (!isNaN(dateObj.getTime())) {
                 formattedDate = dateObj.toISOString().slice(0, 10); // YYYY-MM-DD
             }
        } catch (e) { /* Keep "Invalid Date" */ }

        const startTime = typeof session.start_time === 'string' ? session.start_time.slice(0, 5) : '??:??'; // HH:MM
        const endTime = typeof session.end_time === 'string' ? session.end_time.slice(0, 5) : '??:??'; // HH:MM
        const duration = session.duration_minutes ?? '?'; // Use nullish coalescing
        const projectName = session.project || 'N/A';
        const notes = session.notes || ''; // Default to empty string

        row.innerHTML = `
            <td class="editable" data-field="date" data-id="${session.id}">${formattedDate}</td>
            <td class="editable" data-field="project" data-id="${session.id}">${projectName}</td>
            <td data-field="duration_minutes" data-id="${session.id}">${formatMinutesToHoursMinutes(session.duration_minutes)}</td>
            <td class="editable" data-field="start_time" data-id="${session.id}">${startTime}</td>
            <td class="editable" data-field="end_time" data-id="${session.id}">${endTime}</td>
            <td class="editable" data-field="notes" data-id="${session.id}">${notes}</td>
        `;
        recentSessionsBody.appendChild(row);
    });

    // Add event listeners AFTER rows are added
    addEditListeners();
}

// Add click listeners to editable table cells to enable editing
function addEditListeners() {
    document.querySelectorAll('#recent-sessions-body td.editable').forEach(cell => {
        // Remove any old listeners first to prevent duplicates if called multiple times
        cell.removeEventListener('click', handleCellClick);
        // Add the actual click listener
        cell.addEventListener('click', handleCellClick);
    });
}

// Handles the click on an editable cell
function handleCellClick() {
    // Prevent making multiple inputs if already clicked
    if (this.querySelector('input, textarea')) { // Allow textarea for notes maybe?
        return;
    }

    const currentValue = this.textContent;
    const field = this.dataset.field;

    // Store the original value in case we need to revert
    this.setAttribute('data-original-value', currentValue);

    // Create the input field based on the data type
    let inputElement;
    if (field === 'start_time' || field === 'end_time') {
        inputElement = document.createElement('input');
        inputElement.type = 'time';
        // Use current value if valid HH:MM, otherwise maybe default
        inputElement.value = /^\d{2}:\d{2}$/.test(currentValue) ? currentValue : '00:00';
    } else if (field === 'date') {
        inputElement = document.createElement('input');
        inputElement.type = 'date';
         // Use current value if valid YYYY-MM-DD
        inputElement.value = /^\d{4}-\d{2}-\d{2}$/.test(currentValue) ? currentValue : new Date().toISOString().slice(0,10);
    } else if (field === 'notes') { // Use textarea for notes
        inputElement = document.createElement('textarea');
        inputElement.value = currentValue;
        inputElement.rows = 2; // Make it slightly taller
    }
     else { // Default to text input (for project)
        inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.value = currentValue;
    }
    inputElement.classList.add('inline-edit-input'); // Add class for styling/selection

    // Clear the cell and append the input
    this.innerHTML = '';
    this.appendChild(inputElement);
    inputElement.focus();

    // Select text content if it's a text input
    if (inputElement.type === 'text') {
        inputElement.select();
    }

    // Add listeners to the input field
    inputElement.addEventListener('blur', handleCellUpdate); // Save on losing focus
    inputElement.addEventListener('keydown', handleInputKeydown); // Save on Enter, Cancel on Escape
}

// Handles keydown events on the inline editor input/textarea
async function handleInputKeydown(event) {
    if (event.key === 'Enter') {
        // For textareas, allow Shift+Enter for newlines, only save on plain Enter
        if (this.tagName === 'TEXTAREA' && event.shiftKey) {
            return; // Allow shift+enter default behavior in textarea
        }

        event.preventDefault(); // Stop Enter from doing anything else
        console.log('[Dashboard] Enter key pressed, saving...');
        await handleCellUpdate.call(this); // Use .call to set 'this' correctly
    } else if (event.key === 'Escape') {
        console.log('[Dashboard] Escape key pressed, cancelling edit.');
        const cellElement = this.parentElement; // Get the parent <td>
        const originalValue = cellElement.getAttribute('data-original-value');
        cellElement.textContent = originalValue; // Revert to original text
        cellElement.removeAttribute('data-original-value'); // Clean up attribute
    }
}


// Handles the update logic when an input field blurs or Enter is pressed
async function handleCellUpdate() {
    const cell = this.parentElement; // The <td> element
    if (!cell || !cell.dataset) { // Safety check
         console.warn("handleCellUpdate called on detached or invalid element.");
         // Attempt to remove the input if possible
         this.removeEventListener('blur', handleCellUpdate);
         this.removeEventListener('keydown', handleInputKeydown);
         this.remove(); // Remove the input element itself
         return;
    }

    const newValue = this.value.trim();
    const originalValue = cell.getAttribute('data-original-value');
    const id = cell.dataset.id;
    const field = cell.dataset.field;

    // --- Important: Remove listeners before potential async call or UI change ---
    this.removeEventListener('blur', handleCellUpdate);
    this.removeEventListener('keydown', handleInputKeydown);

    // Check if the value actually changed
    if (newValue === originalValue) {
        cell.textContent = originalValue; // Revert display without API call
        console.log("[Dashboard] Value unchanged, edit cancelled.");
        cell.removeAttribute('data-original-value'); // Clean up attribute
        return;
    }

    console.log(`[Dashboard] Attempting update: ID=${id}, Field=${field}, NewValue=${newValue}`);
    cell.textContent = newValue; // Optimistic UI update (or show a 'saving...' state)

    try {
        // Call the backend ONCE. Main process handles duration recalc.
        await window.api.updateSession(id, field, newValue);
        console.log(`[Dashboard] Update successful for ID=${id}, Field=${field}. Refreshing data.`);
        // Refresh the whole dashboard for consistency after successful update
        refreshDashboardData();

    } catch (error) {
        console.error(`[Dashboard] Error updating session (ID=${id}, Field=${field}):`, error);
        alert(`Failed to update session: ${error.message || 'Unknown error'}`);
        // Revert the cell display to original value on error
        cell.textContent = originalValue;
         // Maybe refresh data even on error?
         // refreshDashboardData();
    } finally {
         // Clean up the attribute
         cell.removeAttribute('data-original-value');
    }
}


// --- Charting Functions ---

// Function to properly destroy charts before recreating them
function destroyCharts() {
    if (yearlyChart) yearlyChart.destroy();
    if (weeklyChart) weeklyChart.destroy();
    if (pieChart) pieChart.destroy();
    yearlyChart = weeklyChart = pieChart = null;
}

// Initialize all charts
function initCharts(sessions) {
    if (!sessions || sessions.length === 0) {
        console.log('[Dashboard] No session data to initialize charts.');
        // Optional: Display messages on canvas like "No data"
        return;
    }

    console.log('[Dashboard] Initializing charts with session count:', sessions.length);
    const currentYear = new Date().getFullYear();
    const yearlySessions = sessions.filter(session => {
        try {
            // More robust date checking
            return session.date && new Date(session.date + 'T00:00:00').getFullYear() === currentYear;
        } catch (e) { return false; }
    });

    if (yearlySessions.length === 0) {
         console.log('[Dashboard] No session data for the current year.');
         // Optional: Display "No data for current year" messages
         return;
    }

    // Prepare and create charts
    try {
        const yearlyDailyProjectData = prepareYearlyDailyProjectData(yearlySessions);
        yearlyChart = createStackedBarChart('yearly-chart', yearlyDailyProjectData.labels, yearlyDailyProjectData.datasets, 'Hours', yearlyDailyProjectData.monthLabels);

        const weeklyProjectData = prepareWeeklyProjectData(yearlySessions);
        weeklyChart = createStackedBarChart('weekly-chart', weeklyProjectData.labels, weeklyProjectData.datasets, 'Hours');

        const yearlyPieData = preparePieData(yearlySessions);
        pieChart = createPieChart('pie-chart', yearlyPieData.labels, yearlyPieData.data);
    } catch(chartError) {
        console.error("[Dashboard] Error creating charts:", chartError);
        // Optional: Display error message to user
    }
}

// Create a stacked bar chart instance
function createStackedBarChart(canvasId, labels, datasets, yAxisLabel, monthLabels = null) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas element with ID ${canvasId} not found.`);
        return null;
    }
    const ctx = canvas.getContext('2d');

    // Filter out datasets with all zero values to avoid clutter
    const visibleDatasets = datasets.filter(ds => ds.data.some(val => val > 0));

    return new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: visibleDatasets }, // Use filtered datasets
        options: {
            responsive: true,
            maintainAspectRatio: false, // Allow chart to fill container height
            scales: {
                x: {
                    stacked: true,
                    ticks: {
                        color: '#E0E0E0', // Light color for ticks
                         maxTicksLimit: monthLabels ? 12 : 30, // Limit ticks for readability
                         autoSkip: true, // Allow chart.js to skip labels if too crowded
                         callback: function(value, index) { // 'value' is the index here
                            const labelValue = labels[index]; // Get the actual label (date string or week string)
                             // Show month abbreviation for the first day of the month on yearly chart
                            if (monthLabels && monthLabels[labelValue]) {
                                return monthLabels[labelValue];
                            }
                            // For yearly chart, show MM/DD if not first of month
                             if (monthLabels && labelValue && labelValue.includes('-')) {
                                 try {
                                     const date = new Date(labelValue + 'T00:00:00');
                                     if (!isNaN(date.getTime()) && date.getDate() !== 1) {
                                         return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
                                     } else if (isNaN(date.getTime())) {
                                         return labelValue; // Fallback for invalid dates
                                     }
                                     // If it is the 1st but not in monthLabels (shouldn't happen), fallback
                                     return '';

                                 } catch (e) { return labelValue; } // Fallback if date parsing fails
                             }
                             // For weekly chart or other cases, return label as is
                            return labelValue;
                        }
                    },
                    grid: { color: 'rgba(224, 224, 224, 0.1)' } // Subtle grid lines
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    title: { display: true, text: yAxisLabel, color: '#E0E0E0' },
                    ticks: {
                        color: '#E0E0E0',
                        callback: value => value.toFixed(1) // Format y-axis ticks to 1 decimal place
                    },
                    grid: { color: 'rgba(224, 224, 224, 0.1)' }
                }
            },
            plugins: {
                legend: { labels: { color: '#E0E0E0' } }, // Light legend text
                tooltip: {
                    callbacks: {
                        // Customize tooltip title (e.g., full date or week)
                        title: function(context) {
                            const label = context[0]?.label || '';
                            if (label.startsWith('Week ')) return label; // Keep week label
                            try { // Format date labels nicely
                                const date = new Date(label + 'T00:00:00');
                                if (!isNaN(date.getTime())) {
                                    return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
                                }
                            } catch (e) { /* Use label as is */ }
                            return label;
                        },
                        // Customize tooltip body (show project and hours)
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toFixed(1) + ' hours'; // Hours with 1 decimal
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// Create a pie chart instance
function createPieChart(canvasId, labels, data) {
     const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas element with ID ${canvasId} not found.`);
        return null;
    }
    const ctx = canvas.getContext('2d');

    // Filter out labels/data where data is zero or negligible
    const threshold = 0.01; // Ignore slices less than 0.01 hours (e.g., ~30 seconds)
    const filteredLabels = [];
    const filteredData = [];
    labels.forEach((label, index) => {
        if (data[index] >= threshold) {
            filteredLabels.push(label);
            filteredData.push(data[index]);
        }
    });

    // Only proceed if there's data left after filtering
    if (filteredLabels.length === 0) {
        console.log(`[Dashboard] No significant data for pie chart ${canvasId}.`);
        // Optional: display a message on the canvas
        return null;
    }


    return new Chart(ctx, {
        type: 'pie',
        data: {
            labels: filteredLabels, // Use filtered labels
            datasets: [{
                data: filteredData, // Use filtered data
                backgroundColor: generateColors(filteredLabels.length),
                borderColor: '#1E1E1E', // Match background for separation
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top', // Or 'bottom', 'left', 'right'
                    labels: { color: '#E0E0E0' } // Light legend text
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0; // Use parsed value
                             // Calculate percentage
                             const total = context.chart.data.datasets[0].data.reduce((sum, val) => sum + val, 0);
                             const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value.toFixed(1)} hours (${percentage}%)`; // Show hours and percentage
                        }
                    }
                }
            }
        }
    });
}


// --- Data Preparation Logic ---

// Prepare data for yearly chart (daily breakdown)
function prepareYearlyDailyProjectData(sessions) {
    const projectDataByDay = {}; // Key: YYYY-MM-DD, Value: { project1: hours, project2: hours }
    const projects = new Set(); // Keep track of all unique projects

    // Aggregate hours per project per day
    sessions.forEach(session => {
        const date = session.date;
        if (!date || isNaN(new Date(date + 'T00:00:00'))) return; // Skip invalid dates

        const project = session.project || 'Unassigned';
        projects.add(project);
        const durationHours = (session.duration_minutes || 0) / 60;

        if (!projectDataByDay[date]) projectDataByDay[date] = {};
        projectDataByDay[date][project] = (projectDataByDay[date][project] || 0) + durationHours;
    });

    // Create labels for all days in the current year
    const currentYear = new Date().getFullYear();
    const daysInYear = getDaysInYear(currentYear); // Get YYYY-MM-DD strings

    // Create month labels map for nice X-axis ticks
    const monthLabels = {};
    daysInYear.forEach(dateStr => {
        if (dateStr.endsWith('-01')) { // If it's the 1st of the month
             try {
                monthLabels[dateStr] = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short' });
             } catch(e) { /* ignore invalid date */ }
        }
    });

    // Create datasets for Chart.js
    const projectList = Array.from(projects).sort(); // Sort projects alphabetically
    const datasets = projectList.map((project, index) => ({
        label: project,
        data: daysInYear.map(day => projectDataByDay[day]?.[project] || 0), // Get hours for this project on this day
        backgroundColor: getColor(index),
    }));

    return { labels: daysInYear, monthLabels, datasets };
}

function formatMinutesToHoursMinutes(totalMinutes) {
  if (totalMinutes == null || isNaN(totalMinutes) || totalMinutes < 0) {
      return "?"; // Handle invalid input
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

// Prepare data for weekly chart
function prepareWeeklyProjectData(sessions) {
    const projectDataByWeek = {}; // Key: WeekNumber, Value: { project1: hours, ... }
    const projects = new Set();
    const currentYear = new Date().getFullYear();

    sessions.forEach(session => {
        try {
             const sessionDate = new Date(session.date + 'T00:00:00');
             if (isNaN(sessionDate.getTime()) || sessionDate.getFullYear() !== currentYear) return; // Skip invalid or other years

             const weekNumber = getWeekNumber(sessionDate);
             const project = session.project || 'Unassigned';
             projects.add(project);
             const durationHours = (session.duration_minutes || 0) / 60;

             if (!projectDataByWeek[weekNumber]) projectDataByWeek[weekNumber] = {};
             projectDataByWeek[weekNumber][project] = (projectDataByWeek[weekNumber][project] || 0) + durationHours;
        } catch(e) { /* Skip if date is invalid */ }
    });

    const weeksInYear = getWeeksInYear(currentYear);
    const weekLabels = Array.from({ length: weeksInYear }, (_, i) => `Week ${i + 1}`);

    const projectList = Array.from(projects).sort();
    const datasets = projectList.map((project, index) => ({
        label: project,
        data: weekLabels.map((_, weekIndex) => projectDataByWeek[weekIndex + 1]?.[project] || 0),
        backgroundColor: getColor(index),
    }));

    return { labels: weekLabels, datasets };
}


// Prepare data for pie chart
function preparePieData(sessions) {
    const projectTotals = {}; // Key: project name, Value: total hours
    sessions.forEach(session => {
        const project = session.project || 'Unassigned';
        projectTotals[project] = (projectTotals[project] || 0) + (session.duration_minutes || 0);
    });

    const labels = Object.keys(projectTotals).sort(); // Sort labels alphabetically
    const data = labels.map(label => projectTotals[label] / 60); // Convert total minutes to hours

    return { labels, data };
}


// --- Utility Functions ---

// Get YYYY-MM-DD strings for all days in a year
function getDaysInYear(year) {
    const days = [];
    const date = new Date(year, 0, 1); // Start at Jan 1st
    while (date.getFullYear() === year) {
        days.push(date.toISOString().slice(0, 10));
        date.setDate(date.getDate() + 1);
    }
    return days;
}


// Get ISO week number for a date
function getWeekNumber(d) {
    // Copy date so don't modify original
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    // Get first day of year
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    // Calculate full weeks to nearest Thursday
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    // Return week number
    return weekNo;
}

// Get number of weeks in a year based on ISO standard
function getWeeksInYear(year) {
    // Check week number of Dec 31st. If it's 1, it belongs to the next year,
    // so the last week number of the current year is the week number of Dec 24th.
    // Otherwise, it's the week number of Dec 31st.
     const dec31 = new Date(year, 11, 31);
     const week = getWeekNumber(dec31);
     if (week === 1) {
         return getWeekNumber(new Date(year, 11, 24));
     }
     return week;
}

// Get a consistent color based on index
function getColor(index) {
    const colors = [
        '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
        '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC',
        '#E494A6', '#F1A861', '#86BCB6', '#A8A07D', '#B881A3' // Added more colors
    ];
    return colors[index % colors.length];
}

// Generate an array of colors for charts like Pie
function generateColors(count) {
    const colors = [];
    for (let i = 0; i < count; i++) {
        colors.push(getColor(i));
    }
    return colors;
}
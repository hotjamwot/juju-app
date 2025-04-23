import { getDaysInYear, getWeekNumber, getWeeksInYear } from './utils.js';

// Keep track of chart instances internally within this module
let yearlyChartInstance = null;
let weeklyChartInstance = null;
let pieChartInstance = null;

// --- Chart Utility Functions ---

// Get color for a project, falling back to a default color scheme if no custom color is set
async function getProjectColor(projectName, index) {
    try {
        const projects = await window.api.loadProjects();
        const project = projects.find(p => p.name === projectName);
        if (project && project.color) {
            return project.color;
        }
    } catch (error) {
        console.warn('Error loading project colors:', error);
    }
    
    // Fallback colors if no custom color is found
    const defaultColors = [
        '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
        '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC',
        '#E494A6', '#F1A861', '#86BCB6', '#A8A07D', '#B881A3'
    ];
    return defaultColors[index % defaultColors.length];
}

// Generate colors for multiple projects
async function generateColors(projectNames) {
    const colors = [];
    for (let i = 0; i < projectNames.length; i++) {
        colors.push(await getProjectColor(projectNames[i], i));
    }
    return colors;
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
    const daysInYear = getDaysInYear(currentYear); // Use imported utility

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
        backgroundColor: '#000000', // Placeholder, will be updated later
    }));

    return { labels: daysInYear, monthLabels, datasets };
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

             const weekNumber = getWeekNumber(sessionDate); // Use imported utility
             const project = session.project || 'Unassigned';
             projects.add(project);
             const durationHours = (session.duration_minutes || 0) / 60;

             if (!projectDataByWeek[weekNumber]) projectDataByWeek[weekNumber] = {};
             projectDataByWeek[weekNumber][project] = (projectDataByWeek[weekNumber][project] || 0) + durationHours;
        } catch(e) { /* Skip if date is invalid */ }
    });

    const weeksInYear = getWeeksInYear(currentYear); // Use imported utility
    const weekLabels = Array.from({ length: weeksInYear }, (_, i) => `Week ${i + 1}`);

    const projectList = Array.from(projects).sort();
    const datasets = projectList.map((project, index) => ({
        label: project,
        data: weekLabels.map((_, weekIndex) => projectDataByWeek[weekIndex + 1]?.[project] || 0),
        backgroundColor: '#000000', // Placeholder, will be updated later
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

// --- Chart Creation Functions ---

// Create a stacked bar chart instance
async function createStackedBarChart(canvasId, labels, datasets, yAxisLabel, monthLabels = null) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas element with ID ${canvasId} not found.`);
        return null;
    }
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded. Cannot create chart.');
        return null;
    }
    const ctx = canvas.getContext('2d');

    // Filter out datasets with all zero values to avoid clutter
    const visibleDatasets = datasets.filter(ds => ds.data.some(val => val > 0));

    // Get colors for each dataset
    const projectNames = visibleDatasets.map(ds => ds.label);
    const colors = await generateColors(projectNames);
    
    // Assign colors to datasets
    visibleDatasets.forEach((dataset, index) => {
        dataset.backgroundColor = colors[index];
    });

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
                            // Ensure labels exist and index is valid
                            if (!labels || index >= labels.length) return '';
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
async function createPieChart(canvasId, labels, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas element with ID ${canvasId} not found.`);
        return null;
    }
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded. Cannot create chart.');
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
        console.log(`[Charts] No significant data for pie chart ${canvasId}.`);
        // Optional: display a message on the canvas
        return null;
    }

    // Get colors for the filtered labels
    const colors = await generateColors(filteredLabels);

    return new Chart(ctx, {
        type: 'pie',
        data: {
            labels: filteredLabels, // Use filtered labels
            datasets: [{
                data: filteredData, // Use filtered data
                backgroundColor: colors,
                borderColor: '#1E1E1E', // Match background for separation
                borderWidth: 0
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

// --- Chart Management ---

// Function to properly destroy charts before recreating them
export function destroyCharts() {
    if (yearlyChartInstance) yearlyChartInstance.destroy();
    if (weeklyChartInstance) weeklyChartInstance.destroy();
    if (pieChartInstance) pieChartInstance.destroy();
    yearlyChartInstance = weeklyChartInstance = pieChartInstance = null;
    console.log('[Charts] Destroyed existing chart instances.');
}

// Initialize all charts
export async function initCharts(sessions) {
    if (!sessions || sessions.length === 0) {
        console.log('[Charts] No session data to initialize charts.');
        // Optional: Display messages on canvas like "No data"
        return { yearlyChart: null, weeklyChart: null, pieChart: null }; // Return nulls
    }

    console.log('[Charts] Initializing charts with session count:', sessions.length);
    const currentYear = new Date().getFullYear();
    const yearlySessions = sessions.filter(session => {
        try {
            // More robust date checking
            return session.date && new Date(session.date + 'T00:00:00').getFullYear() === currentYear;
        } catch (e) { return false; }
    });

    if (yearlySessions.length === 0) {
         console.log('[Charts] No session data for the current year.');
         // Optional: Display "No data for current year" messages
         return { yearlyChart: null, weeklyChart: null, pieChart: null }; // Return nulls
    }

    // Prepare and create charts
    try {
        // Destroy existing charts first
        destroyCharts();

        const yearlyDailyProjectData = prepareYearlyDailyProjectData(yearlySessions);
        yearlyChartInstance = await createStackedBarChart('yearly-chart', yearlyDailyProjectData.labels, yearlyDailyProjectData.datasets, 'Hours', yearlyDailyProjectData.monthLabels);

        const weeklyProjectData = prepareWeeklyProjectData(yearlySessions);
        weeklyChartInstance = await createStackedBarChart('weekly-chart', weeklyProjectData.labels, weeklyProjectData.datasets, 'Hours');

        const yearlyPieData = preparePieData(yearlySessions);
        pieChartInstance = await createPieChart('pie-chart', yearlyPieData.labels, yearlyPieData.data);

        console.log('[Charts] Finished initializing charts.');
        // Return the created instances so dashboard.js can store them if needed
        return {
            yearlyChart: yearlyChartInstance,
            weeklyChart: weeklyChartInstance,
            pieChart: pieChartInstance
        };

    } catch(chartError) {
        console.error("[Charts] Error creating charts:", chartError);
        // Optional: Display error message to user
        return { yearlyChart: null, weeklyChart: null, pieChart: null }; // Return nulls on error
    }
}

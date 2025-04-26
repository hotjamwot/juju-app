import { getDaysInYear, getWeekNumber, getWeeksInYear } from './utils.js';

// Keep track of chart instances internally within this module
let yearlyChartInstance = null;
let weeklyChartInstance = null;
let pieChartInstance = null;
// Remove old day comparison chart instance
// let dayComparisonChartInstance = null;
// Add new comparison chart instances
let dayComparisonBarChartInstance = null;
let weekComparisonBarChartInstance = null;
let monthComparisonBarChartInstance = null;

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

// Prepare data for daily breakdown chart based on filtered sessions
function prepareYearlyDailyProjectData(filteredSessions) {
    if (!filteredSessions || filteredSessions.length === 0) {
        console.log('[Charts] No sessions for daily breakdown chart.');
        return { labels: [], monthLabels: {}, datasets: [] };
    }

    const projectDataByDay = {}; // Key: YYYY-MM-DD, Value: { project1: hours, project2: hours }
    const projects = new Set(); // Keep track of all unique projects
    let minDate = null;
    let maxDate = null;

    // Aggregate hours per project per day and find date range
    filteredSessions.forEach(session => {
        const dateStr = session.date;
        try {
            const sessionDate = new Date(dateStr + 'T00:00:00');
            if (!dateStr || isNaN(sessionDate.getTime())) return; // Skip invalid dates

            // Update min/max dates
            if (minDate === null || sessionDate < minDate) minDate = sessionDate;
            if (maxDate === null || sessionDate > maxDate) maxDate = sessionDate;

            const project = session.project || 'Unassigned';
            projects.add(project);
            const durationHours = (session.duration_minutes || 0) / 60;

            if (!projectDataByDay[dateStr]) projectDataByDay[dateStr] = {};
            projectDataByDay[dateStr][project] = (projectDataByDay[dateStr][project] || 0) + durationHours;
        } catch (e) { /* ignore invalid dates */ }
    });

    if (minDate === null || maxDate === null) {
        console.log('[Charts] Could not determine date range for daily breakdown.');
        return { labels: [], monthLabels: {}, datasets: [] };
    }

    // Create labels for all days within the determined range
    const allDaysInRange = [];
    const monthLabels = {};
    let currentDate = new Date(minDate);
    const today = new Date(); // To potentially limit future data if needed, though maybe not for historical views
    today.setHours(0, 0, 0, 0); // Normalize today's date

    while (currentDate <= maxDate) {
        // Format date locally instead of using UTC-based toISOString()
        const year = currentDate.getFullYear();
        const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
        const day = currentDate.getDate().toString().padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        allDaysInRange.push(dateStr);
        // Create month labels for the 1st of each month in the range
        if (currentDate.getDate() === 1) {
            monthLabels[dateStr] = currentDate.toLocaleDateString('en-GB', { month: 'short' });
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Create datasets for Chart.js
    const projectList = Array.from(projects).sort(); // Sort projects alphabetically
    const datasets = projectList.map((project) => ({
        label: project,
        // Map data for each day in the generated range
        data: allDaysInRange.map(day => projectDataByDay[day]?.[project] || 0),
        backgroundColor: '#000000', // Placeholder, will be updated later
    }));

    return { labels: allDaysInRange, monthLabels, datasets };
}

// Prepare data for weekly chart based on filtered sessions
function prepareWeeklyProjectData(filteredSessions) {
    if (!filteredSessions || filteredSessions.length === 0) {
        console.log('[Charts] No sessions for weekly chart.');
        return { labels: [], datasets: [] };
    }

    const projectDataByWeekYear = {}; // Key: YYYY-WW, Value: { project1: hours, project2: hours }
    const projects = new Set();
    const weekYearLabelsSet = new Set(); // To store unique YYYY-WW labels in order

    // Aggregate hours per project per week/year
    filteredSessions.forEach(session => {
        try {
            const sessionDate = new Date(session.date + 'T00:00:00');
            if (isNaN(sessionDate.getTime())) return;

            const year = sessionDate.getFullYear();
            const weekNumber = getWeekNumber(sessionDate); // Assumes getWeekNumber handles year boundaries correctly
            const weekYearKey = `${year}-W${weekNumber.toString().padStart(2, '0')}`; // e.g., 2023-W05

            weekYearLabelsSet.add(weekYearKey); // Add to ordered set

            const project = session.project || 'Unassigned';
            projects.add(project);
            const durationHours = (session.duration_minutes || 0) / 60;

            if (!projectDataByWeekYear[weekYearKey]) projectDataByWeekYear[weekYearKey] = {};
            projectDataByWeekYear[weekYearKey][project] = (projectDataByWeekYear[weekYearKey][project] || 0) + durationHours;
        } catch (e) { /* Skip if date is invalid */ }
    });

    // Convert the set of week-year labels to a sorted array
    const weekYearLabels = Array.from(weekYearLabelsSet).sort();

    if (weekYearLabels.length === 0) {
        console.log('[Charts] No valid weeks found for weekly chart.');
        return { labels: [], datasets: [] };
    }

    // Sort projects to ensure consistent stacking order
    const projectList = Array.from(projects).sort();

    // Create datasets with cumulative data based on the sorted week labels
    const datasets = projectList.map((project) => {
        let cumulative = 0;
        const data = weekYearLabels.map(weekYearKey => {
            // Add the hours for the current week/year to the cumulative total
            cumulative += projectDataByWeekYear[weekYearKey]?.[project] || 0;
            return cumulative; // Return the cumulative value for this point in time
        });
        return {
            label: project,
            data: data,
            backgroundColor: '#000000', // Placeholder, will be updated later
            borderWidth: 2,
            fill: true
        };
    });

    // Reverse the datasets array so earlier items appear on top in the stack
    return { labels: weekYearLabels, datasets: datasets.reverse() };
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

// REMOVED prepareTimeDistributionData function (not used)
// REMOVED prepareDayComparisonData function

// --- Chart Creation Functions ---

// Create a stacked bar chart instance (for yearly chart)
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

    // If there's no data, draw an empty state message
    if (!labels.length || !datasets.length || datasets.every(d => !d.data.length)) {
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#888888';
        ctx.font = '14px Poppins';
        ctx.fillText('No data available for this period', canvas.width / 2, canvas.height / 2);
        ctx.restore();
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
        // Remove day comparison specific styling
        // if (isDayComparison) { ... }
    });

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: visibleDatasets
        },
        options: {
            // Remove indexAxis: 'y' logic related to day comparison
            indexAxis: 'x', // Default to x-axis
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                // Remove padding logic related to day comparison
                padding: { top: 0, bottom: 0, left: 0, right: 0 }
            },
            scales: {
                x: {
                    stacked: true, // Keep stacked for yearly
                    // Remove position logic related to day comparison
                    position: 'bottom',
                    grid: {
                        display: true, // Keep grid for yearly
                        color: 'rgba(224, 224, 224, 0.1)'
                    },
                    ticks: {
                        color: '#E0E0E0',
                        // Remove font size logic related to day comparison
                        font: { size: 11 },
                        // Keep original date formatting callback
                        callback: function(value, index) {
                            if (!labels || index >= labels.length) return '';
                            const labelValue = labels[index];
                            if (monthLabels && monthLabels[labelValue]) {
                                return monthLabels[labelValue];
                            }
                            if (monthLabels && labelValue && labelValue.includes('-')) {
                                try {
                                    const date = new Date(labelValue + 'T00:00:00');
                                    if (!isNaN(date.getTime()) && date.getDate() !== 1) {
                                        return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
                                    } else if (isNaN(date.getTime())) {
                                        return labelValue;
                                    }
                                    return '';
                                } catch (e) { return labelValue; }
                            }
                            return labelValue;
                        }
                    }
                },
                y: {
                    stacked: true, // Keep stacked for yearly
                    grid: {
                        display: true, // Keep grid for yearly
                        color: 'rgba(224, 224, 224, 0.1)'
                    },
                    // Remove position logic related to day comparison
                    position: 'right',
                    // Keep title for yearly
                    title: {
                        display: true,
                        text: yAxisLabel,
                        color: '#E0E0E0'
                    },
                    ticks: {
                        color: '#E0E0E0',
                        // Remove font size/padding logic related to day comparison
                        font: { size: 11 },
                        padding: 5
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    // Remove position logic related to day comparison
                    position: 'top',
                    labels: {
                        color: '#E0E0E0',
                        font: { size: 12 },
                        padding: 15
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const dataset = context.dataset;
                            const value = context.raw;
                            return `${dataset.label}: ${value.toFixed(1)} hours`;
                        }
                    }
                }
            }
        }
    });
}

// --- NEW Simple Comparison Chart Function ---
/**
 * Creates a simple horizontal bar chart for comparing two values.
 * @param {string} canvasId - The ID of the canvas element.
 * @param {string} label1 - Label for the first bar.
 * @param {number} value1 - Value for the first bar.
 * @param {string} label2 - Label for the second bar.
 * @param {number} value2 - Value for the second bar.
 * @returns {Chart|null} Chart.js instance or null on error.
 */
function createSimpleComparisonChart(canvasId, label1, value1, label2, value2) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`[Charts] Canvas element with ID ${canvasId} not found.`);
        return null;
    }
    if (typeof Chart === 'undefined') {
        console.error('[Charts] Chart.js is not loaded.');
        return null;
    }
    const ctx = canvas.getContext('2d');

    // Define colors (adjust as needed)
    const color1 = '#888888'; // Color for the 'previous' or 'average' bar
    const color2 = '#F28E2B'; // Color for the 'current' or 'today' bar

    // Ensure values are numbers
    const val1 = Number(value1) || 0;
    const val2 = Number(value2) || 0;

    return new Chart(ctx, {
        type: 'bar',
        data: {
            // Use a single category label on the y-axis (or none)
            labels: ['Hours'],
            datasets: [
                {
                    label: label1,
                    data: [val1],
                    backgroundColor: color1,
                    borderColor: color1,
                    borderWidth: 1,
                    barPercentage: 0.6, // Adjust thickness
                    categoryPercentage: 0.8 // Adjust spacing between bars if multiple categories existed
                },
                {
                    label: label2,
                    data: [val2],
                    backgroundColor: color2,
                    borderColor: color2,
                    borderWidth: 1,
                    barPercentage: 0.6,
                    categoryPercentage: 0.8
                }
            ]
        },
        options: {
            indexAxis: 'y', // Horizontal bars
            responsive: true,
            maintainAspectRatio: false, // Allow resizing within wrapper
            layout: {
                padding: { top: 5, bottom: 5, left: 5, right: 20 } // Add padding for labels
            },
            scales: {
                x: { // Value axis (hours)
                    beginAtZero: true,
                    position: 'top', // Show hours scale at the top
                    grid: {
                        display: false, // Hide grid lines for simplicity
                        drawBorder: false,
                    },
                    ticks: {
                        color: '#AAAAAA',
                        font: { size: 10 },
                        maxTicksLimit: 5, // Limit number of ticks
                        callback: value => value.toFixed(1) + 'h' // Format as hours
                    }
                },
                y: { // Category axis
                    grid: {
                        display: false, // Hide grid lines
                        drawBorder: false,
                    },
                    ticks: {
                        display: false // Hide the 'Hours' label on the y-axis
                    }
                }
            },
            plugins: {
                legend: {
                    display: false // Hide the legend, labels are clear enough
                },
                tooltip: {
                    enabled: true, // Keep tooltips
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.x.toFixed(1)} hours`;
                        }
                    }
                },
                // Optional: Add datalabels plugin if you want values directly on bars
                // datalabels: {
                //     anchor: 'end',
                //     align: 'right',
                //     formatter: (value) => value.toFixed(1) + 'h',
                //     color: '#E0E0E0',
                //     font: { size: 10 }
                // }
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

// Create a radial time chart instance
async function createRadialTimeChart(canvasId, timeData) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    return new Chart(ctx, {
        type: 'radar',
        data: {
            labels: timeData.labels,
            datasets: [{
                label: 'Hours Worked',
                data: timeData.data,
                backgroundColor: 'rgba(78, 121, 167, 0.2)',
                borderColor: 'rgba(78, 121, 167, 0.8)',
                pointBackgroundColor: 'rgba(78, 121, 167, 1)',
                pointBorderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    grid: { color: 'rgba(224, 224, 224, 0.1)' },
                    ticks: { 
                        color: '#E0E0E0',
                        callback: value => value.toFixed(1)
                    }
                }
            },
            plugins: {
                legend: { labels: { color: '#E0E0E0' } }
            }
        }
    });
}

// Create a weekly stream chart instance
async function createWeeklyStreamChart(canvasId, data) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const colors = await generateColors(data.datasets.map(d => d.label));

    const datasets = data.datasets.map((dataset, index) => ({
        ...dataset,
        backgroundColor: colors[index],
        borderColor: colors[index],
        fill: true,
        tension: 0.4,
        borderWidth: 1,
        pointRadius: 0,
        pointHoverRadius: 0
    }));

    return new Chart(ctx, {
        type: 'line',
        data: { 
            labels: data.labels, 
            datasets 
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                y: {
                    stacked: true,
                    grid: { color: 'rgba(224, 224, 224, 0.1)' },
                    ticks: { 
                        color: '#E0E0E0',
                        callback: value => value.toFixed(1)
                    },
                    title: {
                        display: true,
                        text: 'Cumulative Hours',
                        color: '#E0E0E0'
                    }
                },
                x: {
                    grid: { color: 'rgba(224, 224, 224, 0.1)' },
                    ticks: { color: '#E0E0E0' }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Cumulative Hours by Project',
                    color: '#E0E0E0',
                    padding: {
                        bottom: 15
                    }
                },
                legend: { 
                    labels: { color: '#E0E0E0' },
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toFixed(1) + ' total hours';
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// --- Chart Management ---

// Ensure Chart.js is available
function checkChartJs() {
    if (typeof Chart === 'undefined') {
        throw new Error('Chart.js is not loaded. Cannot create charts.');
    }
}

// Function to properly destroy charts before recreating them
function destroyCharts() {
    if (yearlyChartInstance) yearlyChartInstance.destroy();
    if (weeklyChartInstance) weeklyChartInstance.destroy();
    if (pieChartInstance) pieChartInstance.destroy();
    // Remove old day comparison chart instance
    // if (dayComparisonChartInstance) dayComparisonChartInstance.destroy();
    // Destroy new comparison charts
    if (dayComparisonBarChartInstance) dayComparisonBarChartInstance.destroy();
    if (weekComparisonBarChartInstance) weekComparisonBarChartInstance.destroy();
    if (monthComparisonBarChartInstance) monthComparisonBarChartInstance.destroy();

    yearlyChartInstance = weeklyChartInstance = pieChartInstance = null;
    dayComparisonBarChartInstance = weekComparisonBarChartInstance = monthComparisonBarChartInstance = null;
    console.log('[Charts] Destroyed existing chart instances.');
}

// Helper function to calculate percentage change and format string
function formatComparisonText(current, previous) {
    const currentVal = current.value || 0;
    const previousVal = previous.value || 0;
    let percentageChange = 0;
    let sign = '';
    let percentageStr = ' (---%)'; // Default if previous is zero

    if (previousVal > 0) {
        percentageChange = ((currentVal - previousVal) / previousVal) * 100;
        sign = percentageChange >= 0 ? '+' : '';
        percentageStr = ` (${sign}${percentageChange.toFixed(1)}%)`;
    } else if (currentVal > 0) {
        // If previous was 0 and current is > 0, it's a positive change but percentage is infinite
        percentageStr = ' (+Inf%)'; // Or some other indicator
    }
    // If both are 0, default ' (---%)' is fine

    return `${currentVal.toFixed(1)}h vs ${previousVal.toFixed(1)}h${percentageStr}`;
}


// Update all charts based on filtered data and range title
async function updateCharts(filteredSessions, allSessions, rangeTitle) {
    try {
        checkChartJs();

        // Update the title display
        const titleElement = document.getElementById('chart-range-title');
        if (titleElement) {
            titleElement.textContent = `Showing data for: ${rangeTitle}`;
        } else {
            console.warn('[Charts] chart-range-title element not found.');
        }

        // Destroy existing charts first (now includes comparison charts)
        destroyCharts();

        // --- Update Comparison Stats (Charts & Text) ---
        let comparisonStats = null;
        try {
            console.log('[Charts] Fetching comparison stats...');
            comparisonStats = await window.api.getComparisonStats();
            console.log('[Charts] Received comparison stats:', comparisonStats);

            if (comparisonStats) {
                // Day Comparison
                const dayData = comparisonStats.day;
                dayComparisonBarChartInstance = createSimpleComparisonChart(
                    'day-comparison-bar-chart',
                    dayData.previous.label, dayData.previous.value, // Avg first
                    dayData.current.label, dayData.current.value    // Today second
                );
                const dayDetailsEl = document.getElementById('day-comparison-details');
                if (dayDetailsEl) {
                    dayDetailsEl.textContent = formatComparisonText(dayData.current, dayData.previous) + ` [${dayData.current.range} vs ${dayData.previous.label}]`;
                }
                const dayTitleEl = document.getElementById('day-comparison-title');
                if (dayTitleEl) dayTitleEl.textContent = `Compared to usual '${dayData.previous.label.split(' ')[1]}'`;


                // Week Comparison
                const weekData = comparisonStats.week;
                weekComparisonBarChartInstance = createSimpleComparisonChart(
                    'week-comparison-bar-chart',
                    weekData.previous.label, weekData.previous.value, // Last week first
                    weekData.current.label, weekData.current.value    // This week second
                );
                 const weekDetailsEl = document.getElementById('week-comparison-details');
                 if (weekDetailsEl) {
                     weekDetailsEl.textContent = formatComparisonText(weekData.current, weekData.previous) + ` [${weekData.current.range} vs ${weekData.previous.range}]`;
                 }

                // Month Comparison
                const monthData = comparisonStats.month;
                monthComparisonBarChartInstance = createSimpleComparisonChart(
                    'month-comparison-bar-chart',
                    monthData.previous.label, monthData.previous.value, // Last month first
                    monthData.current.label, monthData.current.value    // This month second
                );
                 const monthDetailsEl = document.getElementById('month-comparison-details');
                 if (monthDetailsEl) {
                     monthDetailsEl.textContent = formatComparisonText(monthData.current, monthData.previous) + ` [${monthData.current.range} vs ${monthData.previous.range}]`;
                 }
            } else {
                 console.warn('[Charts] No comparison stats received from backend.');
                 // Optionally clear comparison chart areas or show 'Error'
                 document.getElementById('day-comparison-details').textContent = 'No stats data';
                 document.getElementById('week-comparison-details').textContent = 'No stats data';
                 document.getElementById('month-comparison-details').textContent = 'No stats data';
            }

        } catch (statsError) {
            console.error('[Charts] Error fetching or processing comparison stats:', statsError);
            // Optionally clear comparison chart areas or show 'Error'
            document.getElementById('day-comparison-details').textContent = 'Error loading stats';
            document.getElementById('week-comparison-details').textContent = 'Error loading stats';
            document.getElementById('month-comparison-details').textContent = 'Error loading stats';
        }


        // --- Recreate main charts with filtered data ---
        // Only proceed if filteredSessions exist (otherwise comparison stats might still load)
        if (!filteredSessions || filteredSessions.length === 0) {
            console.log('[Charts] No filtered session data provided for main charts.');
            // Clear main chart canvases explicitly if needed
            ['yearly-chart', 'weekly-chart', 'pie-chart'].forEach(id => {
                const canvas = document.getElementById(id);
                if (canvas) {
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    // Optionally draw 'No data' message
                }
            });
            return { yearlyChart: null, weeklyChart: null, pieChart: null }; // Return nulls for main charts
        }


        console.log(`[Charts] Updating main charts for range "${rangeTitle}" with ${filteredSessions.length} sessions.`);

        try {
            // Yearly/Daily Chart

            // Yearly/Daily Chart
            const dailyProjectData = prepareYearlyDailyProjectData(filteredSessions);
            yearlyChartInstance = await createStackedBarChart(
                'yearly-chart',
                dailyProjectData.labels,
                dailyProjectData.datasets,
                'Hours',
                dailyProjectData.monthLabels
            );

            // Weekly Chart
            const weeklyProjectData = prepareWeeklyProjectData(filteredSessions);
            weeklyChartInstance = await createWeeklyStreamChart('weekly-chart', weeklyProjectData);

            // Pie Chart
            const pieData = preparePieData(filteredSessions);
            pieChartInstance = await createPieChart('pie-chart', pieData.labels, pieData.data);

            // --- Update Comparison Stats (Charts & Text) ---
            // This part will be added in the next step:
            // 1. Call window.api.invoke('get-comparison-stats')
            // 2. Call createSimpleComparisonChart three times
            // 3. Update text details elements

            console.log('[Charts] Finished updating main chart instances (comparison stats pending).');
            // Return references to the main charts (comparison charts managed internally for now)
            return {
                yearlyChart: yearlyChartInstance,
                weeklyChart: weeklyChartInstance,
                pieChart: pieChartInstance,
                // Remove old day comparison chart reference
            };

        } catch (chartError) {
            console.error("[Charts] Error creating charts during update:", chartError);
            // Return nulls on error
            return { yearlyChart: null, weeklyChart: null, pieChart: null };
        }
    } catch (error) {
        console.error("[Charts] Error updating charts:", error);
         // Return nulls on error
        return { yearlyChart: null, weeklyChart: null, pieChart: null };
    }
}

export {
    destroyCharts,
    updateCharts // Export the new function name
};

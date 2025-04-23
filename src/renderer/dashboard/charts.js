import { getDaysInYear, getWeekNumber, getWeeksInYear } from './utils.js';

// Keep track of chart instances internally within this module
let yearlyChartInstance = null;
let weeklyChartInstance = null;
let pieChartInstance = null;
let dayComparisonChartInstance = null;

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
        data: daysInYear.map(day => {
            const today = new Date().toISOString().slice(0, 10);
            return day <= today ? (projectDataByDay[day]?.[project] || 0) : null; // Stop data after today
        }),
        backgroundColor: '#000000', // Placeholder, will be updated later
    }));

    return { labels: daysInYear, monthLabels, datasets };
}

// Prepare data for weekly chart
function prepareWeeklyProjectData(sessions) {
    const projectDataByWeek = {};
    const projects = new Set();
    const currentYear = new Date().getFullYear();

    sessions.forEach(session => {
        try {
             const sessionDate = new Date(session.date + 'T00:00:00');
             if (isNaN(sessionDate.getTime()) || sessionDate.getFullYear() !== currentYear) return;

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

    // Sort projects to ensure consistent stacking order
    const projectList = Array.from(projects).sort();
    const datasets = projectList.map((project) => {
        let cumulative = 0;
        const data = weekLabels.map((_, weekIndex) => {
            cumulative += projectDataByWeek[weekIndex + 1]?.[project] || 0;
            return cumulative;
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
    return { labels: weekLabels, datasets: datasets.reverse() };
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

function prepareTimeDistributionData(sessions) {
    const hourlyData = new Array(24).fill(0);
    
    sessions.forEach(session => {
        if (session.start_time) {
            const startTime = new Date(session.date + 'T' + session.start_time);
            if (!isNaN(startTime)) {
                const hour = startTime.getHours();
                hourlyData[hour] += (session.duration_minutes || 0) / 60;
            }
        }
    });

    return {
        labels: Array.from({length: 24}, (_, i) => `${i.toString().padStart(2, '0')}:00`),
        data: hourlyData
    };
}

function prepareDayComparisonData(sessions) {
    console.log('[Charts] Preparing day comparison data...');
    const today = new Date();
    const dayOfWeek = today.getDay();
    const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });

    // Get today's total duration
    const todayString = today.toISOString().slice(0, 10);
    const todayTotal = sessions
        .filter(s => s.date === todayString)
        .reduce((total, s) => total + (parseInt(s.duration_minutes) || 0), 0) / 60;

    // Get all previous sessions for this day of week (excluding today)
    const previousDaySessions = sessions.filter(session => {
        try {
            const sessionDate = new Date(session.date + 'T00:00:00');
            return !isNaN(sessionDate) && 
                   sessionDate.getDay() === dayOfWeek && 
                   session.date !== todayString;
        } catch (e) {
            return false;
        }
    });

    // Group previous sessions by date to get daily totals
    const dailyTotals = {};
    previousDaySessions.forEach(session => {
        if (!dailyTotals[session.date]) {
            dailyTotals[session.date] = 0;
        }
        dailyTotals[session.date] += (parseInt(session.duration_minutes) || 0) / 60;
    });

    // Calculate average of previous days
    const previousDaysCount = Object.keys(dailyTotals).length;
    const averageHours = previousDaysCount > 0 
        ? Object.values(dailyTotals).reduce((sum, hours) => sum + hours, 0) / previousDaysCount
        : 0;

    // Create datasets for the chart
    const datasets = [
        {
            label: `Average ${dayName}`,
            data: [averageHours],
            backgroundColor: '#888888',
        },
        {
            label: 'Today',
            data: [todayTotal],
            backgroundColor: '#F28E2B',
        }
    ];

    return {
        labels: ['Hours Worked'],
        datasets
    };
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
    
    // Determine if this is the day comparison chart
    const isDayComparison = canvasId === 'day-comparison-chart';

    // Filter out datasets with all zero values to avoid clutter
    const visibleDatasets = datasets.filter(ds => ds.data.some(val => val > 0));

    // Get colors for each dataset
    const projectNames = visibleDatasets.map(ds => ds.label);
    const colors = await generateColors(projectNames);
    
    // Assign colors to datasets
    visibleDatasets.forEach((dataset, index) => {
        dataset.backgroundColor = colors[index];
        if (isDayComparison) {
            dataset.barThickness = 25; // Increased bar thickness for day comparison
            dataset.minBarLength = 5; // Minimum bar length for better visibility
        }
    });

    return new Chart(ctx, {
        type: 'bar',
        data: { 
            labels: labels, 
            datasets: visibleDatasets 
        },
        options: {
            indexAxis: isDayComparison ? 'y' : 'x',
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: isDayComparison ? 20 : 0,
                    bottom: isDayComparison ? 20 : 0,
                    left: isDayComparison ? 10 : 0,
                    right: isDayComparison ? 10 : 0
                }
            },
            scales: {
                x: {
                    stacked: !isDayComparison,
                    position: isDayComparison ? 'top' : 'bottom',
                    grid: { 
                        display: !isDayComparison,
                        color: 'rgba(224, 224, 224, 0.1)'
                    },
                    ticks: {
                        color: '#E0E0E0',
                        font: {
                            size: isDayComparison ? 12 : 11
                        },
                        callback: isDayComparison ? 
                            value => value.toFixed(1) : // Show decimal hours for day comparison
                            function(value, index) { // Original date formatting for other charts
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
                    stacked: !isDayComparison,
                    grid: { 
                        display: !isDayComparison,
                        color: 'rgba(224, 224, 224, 0.1)'
                    },
                    position: isDayComparison ? 'left' : 'right',
                    title: isDayComparison ? undefined : { 
                        display: true, 
                        text: yAxisLabel, 
                        color: '#E0E0E0' 
                    },
                    ticks: {
                        color: '#E0E0E0',
                        font: {
                            size: isDayComparison ? 13 : 11
                        },
                        padding: isDayComparison ? 15 : 5
                    }
                }
            },
            plugins: {
                legend: { 
                    display: true,
                    position: isDayComparison ? 'bottom' : 'top',
                    labels: { 
                        color: '#E0E0E0',
                        font: {
                            size: 12
                        },
                        padding: 15
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            // Ensure the tooltip shows only the hovered project category
                            const dataset = context.dataset;
                            const value = context.raw; // Use raw value for the hovered data point
                            return `${dataset.label}: ${value.toFixed(1)} hours`;
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
    if (pieChartInstance) pieChartInstance.destroy(); // Fixed: was using yearlyChartInstance instead of pieChartInstance
    if (dayComparisonChartInstance) dayComparisonChartInstance.destroy();
    yearlyChartInstance = weeklyChartInstance = pieChartInstance = dayComparisonChartInstance = null;
    console.log('[Charts] Destroyed existing chart instances.');
}

// Initialize all charts
async function initCharts(sessions) {
    try {
        checkChartJs();
        
        if (!sessions || sessions.length === 0) {
            console.log('[Charts] No session data to initialize charts.');
            return { yearlyChart: null, weeklyChart: null, pieChart: null, dayComparisonChart: null };
        }

        console.log('[Charts] Initializing charts with session count:', sessions.length);
        const currentYear = new Date().getFullYear();
        const yearlySessions = sessions.filter(session => {
            try {
                return session.date && new Date(session.date + 'T00:00:00').getFullYear() === currentYear;
            } catch (e) { return false; }
        });

        if (yearlySessions.length === 0) {
             console.log('[Charts] No session data for the current year.');
             return { yearlyChart: null, weeklyChart: null, pieChart: null, dayComparisonChart: null };
        }

        try {
            // Destroy existing charts first
            destroyCharts();

            // Initialize yearly chart
            const yearlyDailyProjectData = prepareYearlyDailyProjectData(yearlySessions);
            yearlyChartInstance = await createStackedBarChart(
                'yearly-chart', 
                yearlyDailyProjectData.labels, 
                yearlyDailyProjectData.datasets, 
                'Hours', 
                yearlyDailyProjectData.monthLabels
            );

            // Initialize weekly chart
            const weeklyProjectData = prepareWeeklyProjectData(yearlySessions);
            weeklyChartInstance = await createWeeklyStreamChart('weekly-chart', weeklyProjectData);

            // Initialize pie chart
            const yearlyPieData = preparePieData(yearlySessions);
            pieChartInstance = await createPieChart('pie-chart', yearlyPieData.labels, yearlyPieData.data);

            // Initialize day comparison chart - add extra validation
            const dayComparisonData = prepareDayComparisonData(yearlySessions);
            if (dayComparisonData.labels.length > 0 && dayComparisonData.datasets.length > 0) {
                console.log('[Charts] Creating day comparison chart with data:', dayComparisonData);
                try {
                    dayComparisonChartInstance = await createStackedBarChart(
                        'day-comparison-chart',
                        dayComparisonData.labels,
                        dayComparisonData.datasets,
                        'Hours'
                    );
                    console.log('[Charts] Day comparison chart created:', dayComparisonChartInstance ? 'success' : 'failed');
                } catch (err) {
                    console.error('[Charts] Failed to create day comparison chart:', err);
                }
            } else {
                console.log('[Charts] No data available for day comparison chart');
            }

            return {
                yearlyChart: yearlyChartInstance,
                weeklyChart: weeklyChartInstance,
                pieChart: pieChartInstance,
                dayComparisonChart: dayComparisonChartInstance
            };

        } catch(chartError) {
            console.error("[Charts] Error creating charts:", chartError);
            return { yearlyChart: null, weeklyChart: null, pieChart: null, dayComparisonChart: null };
        }
    } catch (error) {
        console.error("[Charts] Error initializing charts:", error);
        return { yearlyChart: null, weeklyChart: null, pieChart: null, dayComparisonChart: null };
    }
}

export {
    destroyCharts,
    initCharts
};

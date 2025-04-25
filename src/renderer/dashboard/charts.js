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

// Takes filtered sessions for the average calculation, and all sessions for today's calculation
function prepareDayComparisonData(filteredSessions, allSessions) {
    console.log('[Charts] Preparing day comparison data...');
    const today = new Date();
    const todayDayOfWeek = today.getDay(); // Day of the week for today (0=Sun, 6=Sat)
    const todayString = today.toISOString().slice(0, 10);

    // --- Calculate Today's Total (using allSessions) ---
    const todayTotal = allSessions // Use allSessions here
        .filter(s => s.date === todayString)
        .reduce((total, s) => total + (parseInt(s.duration_minutes) || 0), 0) / 60;
    console.log(`[Charts] Today's total hours: ${todayTotal.toFixed(2)}`);

    // --- Calculate Average for the Relevant Day(s) within the filteredSessions ---
    if (!filteredSessions || filteredSessions.length === 0) {
        console.log('[Charts] No filtered sessions for average calculation.');
        // Return only Today's data if no filtered data exists for average
        return {
            labels: ['Hours Worked'],
            datasets: [{ label: 'Today', data: [todayTotal], backgroundColor: '#F28E2B' }]
        };
    }

    // Group filtered sessions by date to get daily totals within the range
    const dailyTotalsInRange = {};
    filteredSessions.forEach(session => {
        try {
            const sessionDate = new Date(session.date + 'T00:00:00');
            if (!isNaN(sessionDate)) {
                 const dateStr = session.date;
                 if (!dailyTotalsInRange[dateStr]) {
                     dailyTotalsInRange[dateStr] = { hours: 0, dayIndex: sessionDate.getDay(), dayName: sessionDate.toLocaleDateString('en-US', { weekday: 'long' }) };
                 }
                 dailyTotalsInRange[dateStr].hours += (parseInt(session.duration_minutes) || 0) / 60;
            }
        } catch(e) { /* ignore */ }
    });

    // Calculate average hours for the same day of the week as *today* within the filtered range
    let averageHoursForTodayDayOfWeek = 0;
    let countForAverage = 0;
    let totalHoursForAverage = 0;
    const todayDayName = today.toLocaleDateString('en-US', { weekday: 'long' });

    Object.values(dailyTotalsInRange).forEach(dailyData => {
        // Only count days with >0 hours towards the average
        if (dailyData.dayIndex === todayDayOfWeek && dailyData.hours > 0) {
            totalHoursForAverage += dailyData.hours;
            countForAverage++;
        }
    });

    if (countForAverage > 0) {
        averageHoursForTodayDayOfWeek = totalHoursForAverage / countForAverage;
    }
    console.log(`[Charts] Average hours for ${todayDayName} in range: ${averageHoursForTodayDayOfWeek.toFixed(2)} (based on ${countForAverage} days)`);


    // Create datasets for the chart
    const datasets = [
        {
            label: `Avg ${todayDayName} (Range)`, // Updated label
            data: [averageHoursForTodayDayOfWeek], // Use calculated average
            backgroundColor: '#888888',
        },
        {
            label: 'Today',
            data: [todayTotal], // Use today's total calculated earlier
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

        if (!filteredSessions) {
            console.log('[Charts] No filtered session data provided to update charts.');
            // Optionally clear charts or display 'no data' message
             destroyCharts(); // Destroy existing charts if no data
             // You might want to draw 'No data' messages on each canvas here
            return { yearlyChart: null, weeklyChart: null, pieChart: null, dayComparisonChart: null };
        }
        if (!allSessions) {
             console.warn('[Charts] All session data not provided, Day Comparison chart might be inaccurate.');
             allSessions = []; // Prevent errors later if it's null/undefined
        }

        console.log(`[Charts] Updating charts for range "${rangeTitle}" with ${filteredSessions.length} sessions.`);

        try {
            // Destroy existing charts first
            destroyCharts();

            // --- Recreate charts with filtered data ---

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

            // Day Comparison Chart (using filtered and all sessions)
            const dayComparisonData = prepareDayComparisonData(filteredSessions, allSessions);
            if (dayComparisonData.labels.length > 0 && dayComparisonData.datasets.length > 0) {
                console.log('[Charts] Creating day comparison chart with data:', dayComparisonData);
                try {
                    dayComparisonChartInstance = await createStackedBarChart(
                        'day-comparison-chart',
                        dayComparisonData.labels,
                        dayComparisonData.datasets,
                        'Hours' // Y-axis label isn't really used here due to indexAxis: 'y'
                    );
                    console.log('[Charts] Day comparison chart created:', dayComparisonChartInstance ? 'success' : 'failed');
                } catch (err) {
                    console.error('[Charts] Failed to create day comparison chart:', err);
                }
            } else {
                console.log('[Charts] No data available for day comparison chart');
                // Optionally clear the canvas or display a message
                const canvas = document.getElementById('day-comparison-chart');
                if (canvas) {
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas
                    // Optionally draw 'No data' message
                }
            }

            console.log('[Charts] Finished updating chart instances.');
            return {
                yearlyChart: yearlyChartInstance,
                weeklyChart: weeklyChartInstance,
                pieChart: pieChartInstance,
                dayComparisonChart: dayComparisonChartInstance
            };

        } catch (chartError) {
            console.error("[Charts] Error creating charts during update:", chartError);
            return { yearlyChart: null, weeklyChart: null, pieChart: null, dayComparisonChart: null };
        }
    } catch (error) {
        console.error("[Charts] Error updating charts:", error);
        return { yearlyChart: null, weeklyChart: null, pieChart: null, dayComparisonChart: null };
    }
}

export {
    destroyCharts,
    updateCharts // Export the new function name
};

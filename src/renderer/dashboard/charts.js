import {
    createStackedBarChart,
    createMultiBarComparisonChart, // Updated import
    createPieChart,
    createWeeklyStreamChart
} from './chart-creators.js';
import {
    prepareYearlyDailyProjectData,
    prepareWeeklyProjectData,
    preparePieData
} from './chart-data-preparers.js';

// Chart instances
let yearlyChartInstance = null;
let weeklyChartInstance = null;
let pieChartInstance = null;
let dayComparisonBarChartInstance = null;
let weekComparisonBarChartInstance = null;
let monthComparisonBarChartInstance = null;

// --- Removed formatComparisonText helper function ---

// Chart management functions
function checkChartJs() {
    if (typeof Chart === 'undefined') {
        throw new Error('Chart.js is not loaded. Cannot create charts.');
    }
}

export function destroyCharts() {
    if (yearlyChartInstance) yearlyChartInstance.destroy();
    if (weeklyChartInstance) weeklyChartInstance.destroy();
    if (pieChartInstance) pieChartInstance.destroy();
    if (dayComparisonBarChartInstance) dayComparisonBarChartInstance.destroy();
    if (weekComparisonBarChartInstance) weekComparisonBarChartInstance.destroy();
    if (monthComparisonBarChartInstance) monthComparisonBarChartInstance.destroy();

    yearlyChartInstance = weeklyChartInstance = pieChartInstance = null;
    dayComparisonBarChartInstance = weekComparisonBarChartInstance = monthComparisonBarChartInstance = null;
    console.log('[Charts] Destroyed existing chart instances.');
}

export async function updateCharts(filteredSessions, allSessions, rangeTitle) {
    try {
        checkChartJs();

        // Update the title display
        const titleElement = document.getElementById('chart-range-title');
        if (titleElement) {
            titleElement.textContent = `Showing data for: ${rangeTitle}`;
        }

        // Destroy existing charts
        destroyCharts();

        // Update comparison stats first
        try {
            console.log('[Charts] Fetching comparison stats...');
            const comparisonStats = await window.api.getComparisonStats();
            
            if (comparisonStats) {
                // --- Day Comparison ---
                const dayData = comparisonStats.day;
                if (dayData && dayData.past && dayData.current) {
                    const dayLabels = [...dayData.past.map(p => p.label), dayData.current.label];
                    const dayValues = [...dayData.past.map(p => p.value), dayData.current.value];
                    dayComparisonBarChartInstance = createMultiBarComparisonChart(
                        'day-comparison-bar-chart', dayLabels, dayValues, 3 // Highlight index 3 (Today)
                    );
                    const dayDetailsEl = document.getElementById('day-comparison-details');
                    if (dayDetailsEl) {
                        // Display current value and range
                        dayDetailsEl.textContent = `Today: ${dayData.current.value.toFixed(1)}h (${dayData.current.range})`;
                    }
                    const dayTitleEl = document.getElementById('day-comparison-title');
                     if (dayTitleEl) {
                        // Use the label of the last past entry (e.g., "Last Thursday")
                        const lastPastLabel = dayData.past.length > 0 ? dayData.past[dayData.past.length - 1].label : 'Previous Day';
                        dayTitleEl.textContent = `Compared to Previous ${lastPastLabel.split(' ')[1]}s`;
                    }
                } else { console.warn("Day comparison data missing or invalid:", dayData); }

                // --- Week Comparison ---
                const weekData = comparisonStats.week;
                 if (weekData && weekData.past && weekData.current) {
                    const weekLabels = [...weekData.past.map(p => p.label), weekData.current.label];
                    const weekValues = [...weekData.past.map(p => p.value), weekData.current.value];
                    weekComparisonBarChartInstance = createMultiBarComparisonChart(
                        'week-comparison-bar-chart', weekLabels, weekValues, 3 // Highlight index 3 (This Week)
                    );
                    const weekDetailsEl = document.getElementById('week-comparison-details');
                    if (weekDetailsEl) {
                        weekDetailsEl.textContent = `This Week: ${weekData.current.value.toFixed(1)}h (${weekData.current.range})`;
                    }
                    // Keep default title "Week Comparison" or update if needed
                } else { console.warn("Week comparison data missing or invalid:", weekData); }


                // --- Month Comparison ---
                const monthData = comparisonStats.month;
                if (monthData && monthData.past && monthData.current) {
                    const monthLabels = [...monthData.past.map(p => p.label), monthData.current.label];
                    const monthValues = [...monthData.past.map(p => p.value), monthData.current.value];
                    monthComparisonBarChartInstance = createMultiBarComparisonChart(
                        'month-comparison-bar-chart', monthLabels, monthValues, 3 // Highlight index 3 (This Month)
                    );
                    const monthDetailsEl = document.getElementById('month-comparison-details');
                    if (monthDetailsEl) {
                         monthDetailsEl.textContent = `This Month: ${monthData.current.value.toFixed(1)}h (${monthData.current.range})`;
                    }
                     // Keep default title "Month Comparison" or update if needed
                } else { console.warn("Month comparison data missing or invalid:", monthData); }

            } else {
                 console.warn("Comparison stats data is missing.");
            }
        } catch (statsError) {
            console.error('[Charts] Error with comparison stats:', statsError);
            ['day', 'week', 'month'].forEach(period => {
                const el = document.getElementById(`${period}-comparison-details`);
                if (el) el.textContent = 'Error loading stats';
            });
        }

        // Only proceed with main charts if we have session data
        if (!filteredSessions || filteredSessions.length === 0) {
            console.log('[Charts] No filtered session data for main charts.');
            return { yearlyChart: null, weeklyChart: null, pieChart: null };
        }

        // Create main charts
        console.log(`[Charts] Updating main charts for "${rangeTitle}" with ${filteredSessions.length} sessions.`);

        try {
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

            return {
                yearlyChart: yearlyChartInstance,
                weeklyChart: weeklyChartInstance,
                pieChart: pieChartInstance
            };
        } catch (chartError) {
            console.error("[Charts] Error creating charts:", chartError);
            return { yearlyChart: null, weeklyChart: null, pieChart: null };
        }
    } catch (error) {
        console.error("[Charts] Error updating charts:", error);
        return { yearlyChart: null, weeklyChart: null, pieChart: null };
    }
}

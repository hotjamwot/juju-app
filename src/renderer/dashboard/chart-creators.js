import { defaultColors, sharedAxisConfig, sharedLegendConfig, sharedTooltipConfig } from './chart-config.js';

let cachedProjects = null;
let lastProjectLoad = 0;
const CACHE_TIMEOUT = 5000; // 5 seconds

async function loadProjects() {
    const now = Date.now();
    if (!cachedProjects || (now - lastProjectLoad) > CACHE_TIMEOUT) {
        try {
            cachedProjects = await window.api.loadProjects();
            lastProjectLoad = now;
        } catch (error) {
            console.warn('Error loading projects:', error);
            cachedProjects = [];
        }
    }
    return cachedProjects;
}

async function getProjectColor(projectName, index) {
    const projects = await loadProjects();
    const project = projects.find(p => p.name === projectName);
    if (project && project.color) {
        return project.color;
    }
    return defaultColors[index % defaultColors.length];
}

async function generateColors(projectNames) {
    const colors = [];
    for (let i = 0; i < projectNames.length; i++) {
        colors.push(await getProjectColor(projectNames[i], i));
    }
    return colors;
}

export async function createStackedBarChart(canvasId, labels, datasets, yAxisLabel, monthLabels = null) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas element with ID ${canvasId} not found.`);
        return null;
    }
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded. Cannot create chart.');
        return null;
    }

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
    const visibleDatasets = datasets.filter(ds => ds.data.some(val => val > 0));
    const projectNames = visibleDatasets.map(ds => ds.label);
    const colors = await generateColors(projectNames);
    
    visibleDatasets.forEach((dataset, index) => {
        dataset.backgroundColor = colors[index];
    });

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: visibleDatasets
        },
        options: {
            indexAxis: 'x',
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 0, bottom: 0, left: 0, right: 0 }
            },
            scales: {
                x: {
                    stacked: true,
                    ...sharedAxisConfig,
                    ticks: {
                        ...sharedAxisConfig.ticks,
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
                                    }
                                    return '';
                                } catch (e) { return labelValue; }
                            }
                            return labelValue;
                        }
                    }
                },
                y: {
                    stacked: true,
                    ...sharedAxisConfig,
                    title: {
                        display: true,
                        text: yAxisLabel,
                        color: '#E0E0E0'
                    }
                }
            },
            plugins: {
                legend: sharedLegendConfig,
                tooltip: sharedTooltipConfig
            }
        }
    });
}

export function createMultiBarComparisonChart(canvasId, labels, values, highlightIndex = 3) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas element with ID ${canvasId} not found.`);
        return null;
    }
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded.');
        return null;
    }
    const ctx = canvas.getContext('2d');

    // Ensure we have the expected number of labels and values
    if (!labels || !values || labels.length !== 4 || values.length !== 4) {
        console.warn(`[Charts] Invalid data for multi-bar comparison chart ${canvasId}. Expected 4 labels and 4 values.`);
        // Optionally display a message on the canvas
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#888888';
        ctx.font = '12px Poppins';
        ctx.fillText('Invalid data', canvas.width / 2, canvas.height / 2);
        ctx.restore();
        return null;
    }

    const pastColor = 'rgba(78, 121, 167, 0.4)'; 
    const currentColor = '#F28E2B'; 

    const backgroundColors = values.map((_, index) => index === highlightIndex ? currentColor : pastColor);
    const borderColors = values.map((_, index) => index === highlightIndex ? currentColor : '#4E79A7');

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Hours',
                data: values,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 1,
                barPercentage: 1, // Full height bars
                categoryPercentage: 0.9 // Almost full category width
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 2, bottom: 2, left: 20, right: 15 }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    position: 'top',
                    grid: {
                        display: false,
                        drawBorder: false,
                    },
                    ticks: {
                        color: '#888888',
                        font: { size: 10 },
                        maxTicksLimit: 4,
                        padding: 2,
                        callback: value => value.toFixed(1) + 'h'
                    }
                },
                y: {
                    grid: {
                        display: false,
                        drawBorder: false,
                    },
                    ticks: {
                        color: '#CCCCCC',
                        font: { size: 11 },
                        padding: 4,
                        maxRotation: 0,
                        minRotation: 0,
                        autoSkip: false, // Ensure all labels are shown
                        callback: function(value, index) {
                            const label = this.getLabelForValue(value);
                            // First abbreviate days to 3 letters if they contain a day name
                            const abbreviated = label.replace(/(Sun|Mon|Tue|Wed|Thu|Fri|Sat)day/, '$1');
                            // Then shorten the label pattern
                            return abbreviated
                                .replace(' Weeks Ago', 'w ago')
                                .replace(' Months Ago', 'm ago');
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: true,
                    callbacks: {
                        title: function(tooltipItems) {
                            return tooltipItems[0].label;
                        },
                        label: function(context) {
                            return `Hours: ${context.parsed.x.toFixed(1)}`;
                        }
                    }
                }
            }
        }
    });
}

export async function createPieChart(canvasId, labels, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas element with ID ${canvasId} not found.`);
        return null;
    }
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded.');
        return null;
    }

    const ctx = canvas.getContext('2d');
    const threshold = 0.01;
    const filteredLabels = [];
    const filteredData = [];
    labels.forEach((label, index) => {
        if (data[index] >= threshold) {
            filteredLabels.push(label);
            filteredData.push(data[index]);
        }
    });

    if (filteredLabels.length === 0) {
        console.log(`[Charts] No significant data for pie chart ${canvasId}.`);
        return null;
    }

    const colors = await generateColors(filteredLabels);

    return new Chart(ctx, {
        type: 'pie',
        data: {
            labels: filteredLabels,
            datasets: [{
                data: filteredData,
                backgroundColor: colors,
                borderColor: '#1E1E1E',
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    ...sharedLegendConfig,
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.chart.data.datasets[0].data.reduce((sum, val) => sum + val, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value.toFixed(1)} hours (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

export async function createWeeklyStreamChart(canvasId, data) {
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
                    ...sharedAxisConfig,
                    title: {
                        display: true,
                        text: 'Cumulative Hours',
                        color: '#E0E0E0'
                    }
                },
                x: sharedAxisConfig
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
                    ...sharedLegendConfig,
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

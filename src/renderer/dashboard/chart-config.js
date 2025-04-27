export const defaultColors = [
    '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
    '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC',
    '#E494A6', '#F1A861', '#86BCB6', '#A8A07D', '#B881A3'
];

export const sharedAxisConfig = {
    grid: {
        display: true,
        color: 'rgba(224, 224, 224, 0.1)'
    },
    ticks: {
        color: '#E0E0E0',
        font: { size: 11 },
        padding: 5
    }
};

export const sharedLegendConfig = {
    display: true,
    position: 'top',
    labels: {
        color: '#E0E0E0',
        font: { size: 12 },
        padding: 15
    }
};

export const sharedTooltipConfig = {
    callbacks: {
        label: function(context) {
            const dataset = context.dataset;
            const value = context.raw;
            return `${dataset.label}: ${value.toFixed(1)} hours`;
        }
    }
};
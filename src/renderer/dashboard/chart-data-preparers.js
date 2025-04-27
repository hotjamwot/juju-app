import { getWeekNumber } from './utils.js';

export function prepareYearlyDailyProjectData(filteredSessions) {
    if (!filteredSessions || filteredSessions.length === 0) {
        console.log('[Charts] No sessions for daily breakdown chart.');
        return { labels: [], monthLabels: {}, datasets: [] };
    }

    const projectDataByDay = {};
    const projects = new Set();
    let minDate = null;
    let maxDate = null;

    // Aggregate hours per project per day and find date range
    filteredSessions.forEach(session => {
        const dateStr = session.date;
        try {
            const sessionDate = new Date(dateStr + 'T00:00:00');
            if (!dateStr || isNaN(sessionDate.getTime())) return;

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
        return { labels: [], monthLabels: {}, datasets: [] };
    }

    // Create labels for all days within the range
    const allDaysInRange = [];
    const monthLabels = {};
    let currentDate = new Date(minDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    while (currentDate <= maxDate) {
        const year = currentDate.getFullYear();
        const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
        const day = currentDate.getDate().toString().padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        allDaysInRange.push(dateStr);
        if (currentDate.getDate() === 1) {
            monthLabels[dateStr] = currentDate.toLocaleDateString('en-GB', { month: 'short' });
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Create datasets for Chart.js
    const projectList = Array.from(projects).sort();
    const datasets = projectList.map((project) => ({
        label: project,
        data: allDaysInRange.map(day => projectDataByDay[day]?.[project] || 0),
        backgroundColor: '#000000', // Placeholder, will be updated later
    }));

    return { labels: allDaysInRange, monthLabels, datasets };
}

export function prepareWeeklyProjectData(filteredSessions) {
    if (!filteredSessions || filteredSessions.length === 0) {
        console.log('[Charts] No sessions for weekly chart.');
        return { labels: [], datasets: [] };
    }

    const projectDataByWeekYear = {};
    const projects = new Set();
    const weekYearLabelsSet = new Set();

    filteredSessions.forEach(session => {
        try {
            const sessionDate = new Date(session.date + 'T00:00:00');
            if (isNaN(sessionDate.getTime())) return;

            const year = sessionDate.getFullYear();
            const weekNumber = getWeekNumber(sessionDate);
            const weekYearKey = `${year}-W${weekNumber.toString().padStart(2, '0')}`;

            weekYearLabelsSet.add(weekYearKey);

            const project = session.project || 'Unassigned';
            projects.add(project);
            const durationHours = (session.duration_minutes || 0) / 60;

            if (!projectDataByWeekYear[weekYearKey]) projectDataByWeekYear[weekYearKey] = {};
            projectDataByWeekYear[weekYearKey][project] = (projectDataByWeekYear[weekYearKey][project] || 0) + durationHours;
        } catch (e) { /* Skip if date is invalid */ }
    });

    const weekYearLabels = Array.from(weekYearLabelsSet).sort();
    const projectList = Array.from(projects).sort();

    const datasets = projectList.map((project) => {
        let cumulative = 0;
        const data = weekYearLabels.map(weekYearKey => {
            cumulative += projectDataByWeekYear[weekYearKey]?.[project] || 0;
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

    return { labels: weekYearLabels, datasets: datasets.reverse() };
}

export function preparePieData(sessions) {
    const projectTotals = {};
    sessions.forEach(session => {
        const project = session.project || 'Unassigned';
        projectTotals[project] = (projectTotals[project] || 0) + (session.duration_minutes || 0);
    });

    const labels = Object.keys(projectTotals).sort();
    const data = labels.map(label => projectTotals[label] / 60);

    return { labels, data };
}
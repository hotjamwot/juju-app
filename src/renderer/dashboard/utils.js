/**
 * Formats total minutes into a "Xh Ym" string.
 * @param {number | string | null | undefined} totalMinutes - Total minutes.
 * @returns {string} Formatted string or "?" if input is invalid.
 */
export function formatMinutesToHoursMinutes(totalMinutes) {
  const minutesNum = parseInt(String(totalMinutes), 10);
  if (totalMinutes == null || isNaN(minutesNum) || minutesNum < 0) {
      return "?"; // Handle invalid input
  }
  const hours = Math.floor(minutesNum / 60);
  const minutes = minutesNum % 60;
  return `${hours}h ${minutes}m`;
}

/**
 * Get YYYY-MM-DD strings for all days in a given year.
 * @param {number} year - The full year (e.g., 2024).
 * @returns {string[]} Array of date strings.
 */
export function getDaysInYear(year) {
    const days = [];
    const date = new Date(year, 0, 1); // Start at Jan 1st
    while (date.getFullYear() === year) {
        days.push(date.toISOString().slice(0, 10));
        date.setDate(date.getDate() + 1);
    }
    return days;
}

/**
 * Get the ISO 8601 week number for a given Date object.
 * @param {Date} d - The date object.
 * @returns {number} The ISO week number.
 */
export function getWeekNumber(d) {
    // Copy date so don't modify original
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    // Get first day of year
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    // Calculate full weeks to nearest Thursday
    var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    // Return week number
    return weekNo;
}

/**
 * Get the total number of ISO 8601 weeks in a given year.
 * @param {number} year - The full year (e.g., 2024).
 * @returns {number} The number of weeks in the year.
 */
export function getWeeksInYear(year) {
    // Check week number of Dec 31st. If it's 1, it belongs to the next year,
    // so the last week number of the current year is the week number of Dec 24th.
    // Otherwise, it's the week number of Dec 31st.
     const dec31 = new Date(year, 11, 31);
     const week = getWeekNumber(dec31);
     if (week === 1) {
         // If Dec 31st is week 1 of next year, check Dec 24th
         return getWeekNumber(new Date(year, 11, 24));
     }
     return week; // Otherwise, the week of Dec 31st is the last week
}

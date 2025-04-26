/**
 * Formats milliseconds into a more readable "Xh Ym" string.
 * @param {number} ms - Duration in milliseconds.
 * @returns {string} Formatted duration string.
 */
function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  // Optional: Add seconds if needed: const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m`;
}

// --- Date Helper Functions ---

/**
 * Gets the date for the start of the week (Monday) for a given date.
 * @param {Date} date - The reference date.
 * @returns {Date} The date of the Monday of that week.
 */
function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
}

/**
 * Gets the date for the start of the month for a given date.
 * @param {Date} date - The reference date.
 * @returns {Date} The date of the first day of that month.
 */
function getStartOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Formats a date object into YYYY-MM-DD string.
 * @param {Date} date - The date to format.
 * @returns {string} The formatted date string.
 */
function formatDateYYYYMMDD(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date object into a short format (e.g., "Apr 25").
 * @param {Date} date - The date to format.
 * @returns {string} The formatted date string.
 */
function formatShortDate(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

module.exports = {
  formatDuration,
  getStartOfWeek,
  getStartOfMonth,
  formatDateYYYYMMDD,
  formatShortDate,
};

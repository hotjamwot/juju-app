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

module.exports = {
  formatDuration,
};

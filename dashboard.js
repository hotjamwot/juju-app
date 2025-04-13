// In your dashboard JavaScript
document.addEventListener('DOMContentLoaded', async () => {
    try {
      const sessionData = await window.electronAPI.loadSessions();
      // Process and display the data
      displaySessions(sessionData);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  });
  
  function displaySessions(csvData) {
    // Your code to parse CSV and display data
  }
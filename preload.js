const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

contextBridge.exposeInMainWorld(
  'api', {
    loadCSV: () => {
      const csvPath = path.join(__dirname, 'data.csv');
      
      if (!fs.existsSync(csvPath)) {
        return { error: 'No data file found' };
      }
      
      const csvData = fs.readFileSync(csvPath, 'utf8');
      return { data: csvData };
    },
    
    saveCSV: (csvData) => {
      const csvPath = path.join(__dirname, 'data.csv');
      
      try {
        fs.writeFileSync(csvPath, csvData, 'utf8');
        return { success: true };
      } catch (error) {
        return { error: error.message };
      }
    }
  }
);
// Function to load and display projects
async function loadProjects() {
    console.log('Loading projects...');
    try {
      const projects = await window.api.loadProjects() || [];
      console.log('Projects loaded:', projects);
      
      const projectsBody = document.getElementById('projects-list-body');
      projectsBody.innerHTML = '';
      
      if (projects.length === 0) {
        projectsBody.innerHTML = `
          <tr>
            <td colspan="2" class="no-data">No projects created yet.</td>
          </tr>
        `;
        return;
      }
      
      projects.forEach(project => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td class="project-name" data-id="${project.id}">${project.name}</td>
          <td class="project-actions">
            <button class="delete-project" data-id="${project.id}">Delete</button>
          </td>
        `;
        projectsBody.appendChild(row);
      });
      
      // Add event listeners to buttons
      addProjectButtonListeners();
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  }
  
  // Function to add event listeners to project buttons
  function addProjectButtonListeners() {

    // Delete project buttons
    document.querySelectorAll('.delete-project').forEach(button => {
        button.addEventListener('click', async function() {
          const id = this.dataset.id;
          const name = this.closest('tr').querySelector('.project-name').textContent;
      
          if (confirm(`Are you sure you want to delete project "${name}"?`)) {
            let success = false; // Flag to track success
            try {
              // ASSUMING main.js handler returns { success: true, ... } on success
              // or throws an error / returns { success: false, ... } on failure
              const result = await window.api.deleteProject(id);
      
              // Check the actual result from the main process
              if (result && result.success) {
                  console.log(`Project <span class="math-inline">\{id\} \(</span>{name}) deleted successfully.`);
                  success = true;
              } else {
                   console.error('Main process reported delete failure:', result);
                   alert(`Failed to delete project "${name}". Check logs.`); // Inform user
              }
            } catch (error) {
              console.error('Error during delete project API call:', error);
              alert(`Error deleting project "${name}": ${error.message || 'Unknown error'}`); // Show specific error
            }
      
            // Reload the list ONLY if the operation was successful
            if (success) {
              loadProjects();
            }
          }
        });
      });
    }
  
  // Add project button
  document.addEventListener('DOMContentLoaded', function() {
    const addButton = document.getElementById('add-project-button');
    const nameInput = document.getElementById('new-project-name');
    
    if (addButton && nameInput) {
        addButton.addEventListener('click', async function() {
            const name = nameInput.value.trim();
            console.log('[Renderer - Add Project] Add button clicked. Name entered:', name); // Log 1
        
            if (name) {
                console.log('[Renderer - Add Project] Name is valid. Calling window.api.addProject...'); // Log 2
                try {
                    const result = await window.api.addProject(name);
                    console.log('[Renderer - Add Project] window.api.addProject returned:', result); // Log 3
        
                    // Check if main process reported success explicitly
                    if (result && result.success) {
                        console.log('[Renderer - Add Project] Success reported by main process. Clearing input and reloading list.'); // Log 4a
                        nameInput.value = ''; // Clear the input
                        loadProjects(); // Reload the projects list
                    } else {
                        console.error('[Renderer - Add Project] Failure reported by main process or unexpected result:', result); // Log 4b
                        alert('Failed to add project. Main process did not confirm success. Check console.');
                    }
                } catch (error) {
                    console.error('[Renderer - Add Project] Error occurred during window.api.addProject call:', error); // Log 5 (Catch block)
                    alert(`An error occurred while adding the project: ${error.message || 'Unknown error'}`);
                }
            } else {
                console.log('[Renderer - Add Project] Name input was empty. Not calling API.'); // Log 6 (Empty name check)
                alert('Please enter a project name.');
            }
        });
    }
    
    // Load projects when page loads
    loadProjects();
  });
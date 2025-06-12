import { formatMinutesToHoursMinutes } from './utils.js'; // Import necessary utils

// Store reference to table body - assume it exists in the DOM when functions are called
const recentSessionsBody = document.getElementById('recent-sessions-body');

// --- Tab Functionality ---
function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all tabs and content
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            // Activate clicked tab and corresponding content
            tab.classList.add('active');
            const contentId = tab.dataset.tab;
            const contentElement = document.getElementById(contentId);
            if (contentElement) {
                contentElement.classList.add('active');
            } else {
                console.error(`Tab content not found for ID: ${contentId}`);
            }
        });
    });
    console.log('[UI] Tabs setup complete.');
}

// --- Sessions Table ---
/**
 * Updates the sessions table body with the provided session data.
 * Assumes the provided sessions are already filtered, sorted, and paginated.
 * @param {Array<Object>} visibleSessions - The array of session objects to display.
 * @param {Function} refreshDashboardDataCallback - Callback function to refresh all dashboard data on edit.
 */
function updateSessionsTable(visibleSessions, refreshDashboardDataCallback) {
    if (!recentSessionsBody) {
        console.error('[UI] Cannot update sessions table: recentSessionsBody element not found.');
        return;
    }

    // Clear previous content
    recentSessionsBody.innerHTML = '';

    // Check if there are sessions to display for the current page/filter
    if (!visibleSessions || visibleSessions.length === 0) {
        recentSessionsBody.innerHTML = `
            <tr><td colspan="6" class="no-data">No sessions match the current filter or page.</td></tr>`;
        // Do not add edit listeners if there's no data
        console.log('[UI] Sessions table updated with no data message.');
        return;
    }

    // Add each session row to the table
    visibleSessions.forEach(session => {
        const row = document.createElement('tr');
        row.setAttribute('data-session-key', `${session.id}-${session.date}-${session.start_time}`);

        let formattedDate = "Invalid Date";
        try {
            const dateObj = new Date(session.date + 'T00:00:00');
             if (!isNaN(dateObj.getTime())) {
                 // Format date locally instead of using UTC-based toISOString()
                 const year = dateObj.getFullYear();
                 const month = (dateObj.getMonth() + 1).toString().padStart(2, '0'); // +1 because months are 0-indexed
                 const day = dateObj.getDate().toString().padStart(2, '0');
                 formattedDate = `${year}-${month}-${day}`;
             }
        } catch (e) { /* Keep "Invalid Date" */ }

        const startTime = typeof session.start_time === 'string' ? session.start_time.slice(0, 5) : '??:??';
        const endTime = typeof session.end_time === 'string' ? session.end_time.slice(0, 5) : '??:??';
        const projectName = session.project || 'N/A';
        const notes = session.notes || '';

        row.innerHTML = `
            <td class="editable" data-field="date" data-id="${session.id}">${formattedDate}</td>
            <td class="editable" data-field="project" data-id="${session.id}">${projectName}</td>
            <td data-field="duration_minutes" data-id="${session.id}">${formatMinutesToHoursMinutes(session.duration_minutes)}</td>
            <td class="editable" data-field="start_time" data-id="${session.id}">${startTime}</td>
            <td class="editable" data-field="end_time" data-id="${session.id}">${endTime}</td>
            <td class="editable" data-field="notes" data-id="${session.id}">${notes}</td>
            <td class="actions">
                <button class="btn btn-delete" data-id="${session.id}" title="Delete Session">×</button>
            </td>
        `;
        recentSessionsBody.appendChild(row);
    });

    // Add both edit and delete listeners
    addEditListeners(refreshDashboardDataCallback);
    addDeleteListeners(refreshDashboardDataCallback);
    console.log('[UI] Sessions table updated.');
}

// Add click listeners to editable table cells
function addEditListeners(refreshDashboardDataCallback) {
    document.querySelectorAll('#recent-sessions-body td.editable').forEach(cell => {
        // Bind the callback function to the event handler
        const boundHandleCellClick = handleCellClick.bind(cell, refreshDashboardDataCallback);
        // Remove any old listeners first
        cell.removeEventListener('click', cell._boundHandleCellClick); // Use stored reference if exists
        // Add the new listener
        cell.addEventListener('click', boundHandleCellClick);
        // Store the bound function reference on the element for later removal
        cell._boundHandleCellClick = boundHandleCellClick;
    });
}


// Handles the click on an editable cell
function handleCellClick(refreshDashboardDataCallback) { // Receive callback as argument
    // 'this' refers to the clicked cell (td) because of .bind() or addEventListener context
    if (this.querySelector('input, textarea')) return;

    const currentValue = this.textContent;
    const field = this.dataset.field;
    this.setAttribute('data-original-value', currentValue);

    let inputElement;
    if (field === 'start_time' || field === 'end_time') {
        inputElement = document.createElement('input');
        inputElement.type = 'time';
        inputElement.value = /^\d{2}:\d{2}$/.test(currentValue) ? currentValue : '00:00';
    } else if (field === 'date') {
        inputElement = document.createElement('input');
        inputElement.type = 'date';
        inputElement.value = /^\d{4}-\d{2}-\d{2}$/.test(currentValue) ? currentValue : new Date().toISOString().slice(0,10);
    } else if (field === 'notes') {
        inputElement = document.createElement('textarea');
        inputElement.value = currentValue;
        inputElement.rows = 2;
    } else {
        inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.value = currentValue;
    }
    inputElement.classList.add('inline-edit-input');

    this.innerHTML = '';
    this.appendChild(inputElement);
    inputElement.focus();
    if (inputElement.type === 'text') inputElement.select();

    // Bind the callback to the event handlers for the input element
    const boundHandleCellUpdate = handleCellUpdate.bind(inputElement, refreshDashboardDataCallback);
    const boundHandleInputKeydown = handleInputKeydown.bind(inputElement, refreshDashboardDataCallback);

    inputElement.addEventListener('blur', boundHandleCellUpdate);
    inputElement.addEventListener('keydown', boundHandleInputKeydown);

    // Store bound functions for potential removal on Escape
    inputElement._boundBlurHandler = boundHandleCellUpdate;
    inputElement._boundKeydownHandler = boundHandleInputKeydown;
}

// Handles keydown events on the inline editor
async function handleInputKeydown(refreshDashboardDataCallback, event) { // Receive callback
    // 'this' refers to the input/textarea element
    if (event.key === 'Enter') {
        if (this.tagName === 'TEXTAREA' && event.shiftKey) return;
        event.preventDefault();
        console.log('[UI] Enter key pressed, saving...');
        // Use .call to ensure 'this' is the input element inside handleCellUpdate
        await handleCellUpdate.call(this, refreshDashboardDataCallback);
    } else if (event.key === 'Escape') {
        console.log('[UI] Escape key pressed, cancelling edit.');
        const cellElement = this.parentElement;
        const originalValue = cellElement.getAttribute('data-original-value');
        // Remove listeners before changing content
        this.removeEventListener('blur', this._boundBlurHandler);
        this.removeEventListener('keydown', this._boundKeydownHandler);
        cellElement.textContent = originalValue;
        cellElement.removeAttribute('data-original-value');
    }
}

// Handles the update logic when an input field blurs or Enter is pressed
async function handleCellUpdate(refreshDashboardDataCallback) { // Receive callback
    // 'this' refers to the input/textarea element
    const cell = this.parentElement;
    if (!cell || !cell.dataset) {
         console.warn("[UI] handleCellUpdate called on detached or invalid element.");
         this.removeEventListener('blur', this._boundBlurHandler);
         this.removeEventListener('keydown', this._boundKeydownHandler);
         try { this.remove(); } catch(e) {} // Try removing input
         return;
    }

    const newValue = this.value.trim();
    const originalValue = cell.getAttribute('data-original-value');
    const id = cell.dataset.id;
    const field = cell.dataset.field;

    // --- Important: Remove listeners before potential async call or UI change ---
    this.removeEventListener('blur', this._boundBlurHandler);
    this.removeEventListener('keydown', this._boundKeydownHandler);

    if (newValue === originalValue) {
        cell.textContent = originalValue;
        console.log("[UI] Value unchanged, edit cancelled.");
        cell.removeAttribute('data-original-value');
        return;
    }

    console.log(`[UI] Attempting update: ID=${id}, Field=${field}, NewValue=${newValue}`);
    cell.textContent = 'Saving...'; // Indicate saving state

    try {
        // Use window.api exposed by preload script
        await window.api.updateSession(id, field, newValue);
        console.log(`[UI] Update successful for ID=${id}, Field=${field}. Refreshing data.`);
        // Call the refresh callback provided by dashboard.js
        if (typeof refreshDashboardDataCallback === 'function') {
            refreshDashboardDataCallback();
        } else {
            console.warn('[UI] refreshDashboardDataCallback is not a function!');
        }

    } catch (error) {
        console.error(`[UI] Error updating session (ID=${id}, Field=${field}):`, error);
        alert(`Failed to update session: ${error.message || 'Unknown error'}`);
        // Revert the cell display to original value on error
        cell.textContent = originalValue;
    } finally {
         cell.removeAttribute('data-original-value');
    }
}

// Add this new function for delete functionality
function addDeleteListeners(refreshDashboardDataCallback) {
    document.querySelectorAll('#recent-sessions-body .btn-delete').forEach(button => {
        button.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            if (!id) return;

            if (confirm('Are you sure you want to delete this session? This cannot be undone.')) {
                try {
                    await window.api.deleteSession(id);
                    console.log(`[UI] Session deleted successfully: ${id}`);
                    if (typeof refreshDashboardDataCallback === 'function') {
                        refreshDashboardDataCallback();
                    }
                } catch (error) {
                    console.error('[UI] Error deleting session:', error);
                    alert('Failed to delete session. Please try again.');
                }
            }
        });
    });
}

export {
    setupTabs,
    updateSessionsTable
};

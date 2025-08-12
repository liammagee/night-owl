// --- Auto-save functionality ---

// Initialize auto-save functionality
function initializeAutoSave() {
    if (!window.appSettings || !window.appSettings.ui || !window.appSettings.ui.autoSave) {
        return;
    }
    
    const interval = window.appSettings.ui.autoSaveInterval || 2000; // Default 2 seconds
    
    // Set initial saved content
    if (editor) {
        lastSavedContent = editor.getValue();
    }
}

// Mark that there are unsaved changes and schedule auto-save
function scheduleAutoSave() {
    if (!window.appSettings?.ui?.autoSave) return;
    
    const currentContent = editor ? editor.getValue() : '';
    
    // Check if content has actually changed
    if (currentContent === lastSavedContent) {
        hasUnsavedChanges = false;
        return;
    }
    
    hasUnsavedChanges = true;
    
    // Clear existing timer
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
    }
    
    // Schedule auto-save
    const interval = window.appSettings.ui.autoSaveInterval || 2000;
    autoSaveTimer = setTimeout(() => {
        performAutoSave();
    }, interval);
    
    // Update status indicator
    updateUnsavedIndicator(true);
}

// Perform the actual auto-save
async function performAutoSave() {
    if (!hasUnsavedChanges || !editor) {
        return;
    }
    
    try {
        const content = editor.getValue();
        
        // Only save if we have a current file path
        if (window.currentFilePath && window.electronAPI) {
            const result = await window.electronAPI.invoke('perform-save', content);
            
            if (result.success) {
                lastSavedContent = content;
                hasUnsavedChanges = false;
                updateUnsavedIndicator(false);
                showNotification('Auto-saved', 'success', 1000); // Brief notification
                
                // Update current file path if this was a save-as operation
                if (result.filePath && result.filePath !== window.currentFilePath) {
                    window.currentFilePath = result.filePath;
                    if (window.electronAPI) {
                        window.electronAPI.invoke('set-current-file', result.filePath);
                    }
                }
            } else {
            }
        } else {
        }
    } catch (error) {
    }
}

// Update the unsaved changes indicator
function updateUnsavedIndicator(hasUnsaved) {
    const currentFileName = document.getElementById('current-file-name');
    if (currentFileName) {
        const text = currentFileName.textContent;
        if (hasUnsaved && !text.includes('●')) {
            currentFileName.textContent = '● ' + text;
        } else if (!hasUnsaved && text.includes('●')) {
            currentFileName.textContent = text.replace('● ', '');
        }
    }
}

// Mark content as saved (called when user manually saves)
function markContentAsSaved() {
    if (editor) {
        lastSavedContent = editor.getValue();
        hasUnsavedChanges = false;
        updateUnsavedIndicator(false);
        
        // Clear auto-save timer
        if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = null;
        }
    }
}


// --- Export for Global Access ---
window.initializeAutoSave = initializeAutoSave;
window.scheduleAutoSave = scheduleAutoSave;
window.performAutoSave = performAutoSave;
window.updateUnsavedIndicator = updateUnsavedIndicator;
window.markContentAsSaved = markContentAsSaved;
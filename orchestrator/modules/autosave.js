// --- Auto-save functionality ---

// Initialize auto-save functionality
function initializeAutoSave() {
    console.log('[autosave.js] initializeAutoSave called');
    if (!window.appSettings || !window.appSettings.autoSave || !window.appSettings.autoSave.enabled) {
        console.log('[autosave.js] Auto-save disabled in settings');
        return;
    }

    const interval = window.appSettings.autoSave.interval || 2000; // Default 2 seconds
    console.log(`[autosave.js] Auto-save initialized with ${interval}ms interval`);

    // Set initial saved content
    if (editor) {
        lastSavedContent = editor.getValue();
        console.log('[autosave.js] Initial content saved for comparison');
    }
}

// Mark that there are unsaved changes and schedule auto-save
function scheduleAutoSave() {
    console.log('[autosave.js] 🚀 scheduleAutoSave called:', {
        hasAutoSaveEnabled: !!window.appSettings?.ui?.autoSave,
        hasEditor: !!editor,
        currentFilePath: window.currentFilePath
    });

    if (!window.appSettings?.autoSave?.enabled) {
        console.log('[autosave.js] ❌ Auto-save disabled in settings');
        return;
    }

    const currentContent = editor ? editor.getValue() : '';

    console.log('[autosave.js] 📋 Content comparison:', {
        currentContentLength: currentContent.length,
        lastSavedContentLength: lastSavedContent ? lastSavedContent.length : 0,
        contentsMatch: currentContent === lastSavedContent,
        currentHasUnsavedChanges: window.hasUnsavedChanges
    });

    // Check if content has actually changed
    if (currentContent === lastSavedContent) {
        console.log('[autosave.js] ℹ️ No content changes detected, setting hasUnsavedChanges to false');
        window.hasUnsavedChanges = false;
        return;
    }

    console.log('[autosave.js] ✅ Content changed, setting hasUnsavedChanges to true');
    window.hasUnsavedChanges = true;
    
    // Clear existing timer
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
    }
    
    // Schedule auto-save
    const interval = window.appSettings.autoSave.interval || 2000;
    autoSaveTimer = setTimeout(() => {
        performAutoSave();
    }, interval);
    
    // Update status indicator
    updateUnsavedIndicator(true);
}

// Perform the actual auto-save
async function performAutoSave() {
    console.log('[performAutoSave] Called with:', {
        hasUnsavedChanges: window.hasUnsavedChanges,
        hasEditor: !!editor,
        currentFilePath: window.currentFilePath
    });

    if (!window.hasUnsavedChanges || !editor) {
        console.log('[performAutoSave] Skipping - no unsaved changes or no editor');
        return;
    }
    
    try {
        const content = editor.getValue();
        
        // Only save if we have a current file path
        if (window.currentFilePath && window.electronAPI) {
            const result = await window.electronAPI.invoke('perform-save', content);
            
            if (result.success) {
                lastSavedContent = content;
                window.hasUnsavedChanges = false;
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
                console.log('[performAutoSave] ❌ Save operation failed:', result);
            }
        } else {
            console.log('[performAutoSave] ℹ️ Skipping - no current file path or electron API unavailable');
        }
    } catch (error) {
        console.error('[performAutoSave] ❌ Error during auto-save:', error);
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
        window.hasUnsavedChanges = false;
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
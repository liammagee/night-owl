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
    // Clear any pending scheduled save — a stale timer firing after this run could
    // re-enter with a path/buffer that drifted across a tab switch and corrupt a file.
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
    }

    console.log('[performAutoSave] Called with:', {
        hasUnsavedChanges: window.hasUnsavedChanges,
        hasEditor: !!editor,
        currentFilePath: window.currentFilePath
    });

    if (!window.hasUnsavedChanges || !editor) {
        console.log('[performAutoSave] Skipping - no unsaved changes or no editor');
        return;
    }

    // Data-integrity invariant: the tab manager owns the truth about
    // {active path, active model}. We must only save if the visible Monaco
    // model belongs to the active tab AND window.currentFilePath agrees.
    // If any mismatch, abort rather than risk writing the active buffer to a
    // different file on disk. See TODO.md → Audit 2026-04-16 → Critical.
    const tm = window.tabManager;
    const activePath = tm && tm.activeTabPath;
    const activeTab = activePath && tm.tabs ? tm.tabs.get(activePath) : null;
    const editorModel = editor.getModel();

    if (!activeTab || !editorModel) {
        console.warn('[performAutoSave] Abort: no active tab or editor model', { activePath });
        return;
    }
    if (activeTab.model !== editorModel) {
        console.error('[performAutoSave] ABORT: tab model does not match editor model — would corrupt file', {
            activePath,
            tabFilePath: activeTab.filePath,
            windowCurrentFilePath: window.currentFilePath
        });
        return;
    }
    if (activeTab.filePath !== window.currentFilePath) {
        console.error('[performAutoSave] ABORT: tab path and window.currentFilePath disagree', {
            tabFilePath: activeTab.filePath,
            windowCurrentFilePath: window.currentFilePath
        });
        return;
    }

    try {
        const content = editor.getValue();
        const savePath = activeTab.filePath;

        // Untitled tabs need an explicit save-as flow, not auto-save.
        if (!savePath || savePath.startsWith('untitled:')) {
            console.log('[performAutoSave] Skipping - untitled tab (needs save-as)');
            return;
        }

        if (!window.electronAPI) {
            console.log('[performAutoSave] Skipping - electronAPI unavailable');
            return;
        }

        // Pass the tab's path explicitly rather than relying on main-process
        // currentFilePath state, which has its own drift paths.
        const result = await window.electronAPI.invoke('perform-save-with-path', content, savePath);

        if (result.success) {
            lastSavedContent = content;
            activeTab.lastSavedContent = content;
            activeTab.isDirty = false;
            window.hasUnsavedChanges = false;
            updateUnsavedIndicator(false);
            showNotification('Auto-saved', 'success', 1000);
        } else {
            console.log('[performAutoSave] Save failed:', result);
        }
    } catch (error) {
        console.error('[performAutoSave] Error during auto-save:', error);
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
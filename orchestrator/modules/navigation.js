// === Navigation Module ===
// Handles navigation history management including:
// - Back and forward navigation through opened files
// - Navigation history persistence
// - Navigation button state management
// - File history tracking

// --- Navigation Variables ---
let navigationHistory = [];
let currentHistoryIndex = -1;
let isNavigatingHistory = false;

// --- Navigation Functions ---
function addToNavigationHistory(filePath, fileName) {
    if (isNavigatingHistory || !filePath) return;

    // Ensure navigationHistory is always an array
    if (!Array.isArray(navigationHistory)) {
        console.warn('[Navigation] navigationHistory was not an array, reinitializing');
        navigationHistory = [];
        currentHistoryIndex = -1;
    }
    
    // Don't add duplicate consecutive entries
    if (navigationHistory.length > 0 && 
        navigationHistory[currentHistoryIndex]?.filePath === filePath) {
        return;
    }
    
    // Remove any forward history if we're not at the end
    if (currentHistoryIndex < navigationHistory.length - 1) {
        navigationHistory = navigationHistory.slice(0, currentHistoryIndex + 1);
    }
    
    // Add new entry
    navigationHistory.push({
        filePath: filePath,
        fileName: fileName || filePath.split('/').pop(),
        timestamp: Date.now()
    });
    
    currentHistoryIndex = navigationHistory.length - 1;
    
    // Limit history size
    if (navigationHistory.length > 50) {
        navigationHistory = navigationHistory.slice(-50);
        currentHistoryIndex = navigationHistory.length - 1;
    }
    
    updateNavigationButtons();
    updateCurrentFileName(fileName);
    
    // Save navigation history to persistent settings
    saveNavigationHistoryToSettings();
    
    console.log('[Navigation] Added to history:', fileName, 'Index:', currentHistoryIndex);
}

function navigateBack() {
    if (currentHistoryIndex > 0) {
        currentHistoryIndex--;
        const historyItem = navigationHistory[currentHistoryIndex];
        
        console.log('[Navigation] Going back to:', historyItem.fileName);
        
        isNavigatingHistory = true;
        openFileFromHistory(historyItem);
    }
}

function navigateForward() {
    if (currentHistoryIndex < navigationHistory.length - 1) {
        currentHistoryIndex++;
        const historyItem = navigationHistory[currentHistoryIndex];
        
        console.log('[Navigation] Going forward to:', historyItem.fileName);
        
        isNavigatingHistory = true;
        openFileFromHistory(historyItem);
    }
}

async function openFileFromHistory(historyItem) {
    try {
        const result = await window.electronAPI.invoke('open-file-path', historyItem.filePath);
        if (result.success) {
            await window.openFileInEditor(result.filePath, result.content);
            updateNavigationButtons();
            updateCurrentFileName(historyItem.fileName);
        } else {
            console.error('[Navigation] Error opening file from history:', result.error);
            if (window.showNotification) {
                window.showNotification(`Error opening ${historyItem.fileName}: ${result.error}`, 'error');
            }
            // Remove invalid entry from history
            navigationHistory.splice(currentHistoryIndex, 1);
            if (currentHistoryIndex >= navigationHistory.length) {
                currentHistoryIndex = navigationHistory.length - 1;
            }
            updateNavigationButtons();
        }
    } catch (error) {
        console.error('[Navigation] Error opening file from history:', error);
        if (window.showNotification) {
            window.showNotification('Error navigating to file', 'error');
        }
    } finally {
        isNavigatingHistory = false;
    }
}

function updateNavigationButtons() {
    const backBtn = document.getElementById('nav-back-btn');
    const forwardBtn = document.getElementById('nav-forward-btn');
    
    if (backBtn) {
        backBtn.disabled = currentHistoryIndex <= 0;
        backBtn.title = currentHistoryIndex > 0 
            ? `Go Back to: ${navigationHistory[currentHistoryIndex - 1].fileName} (Alt+Left)`
            : 'Go Back (Alt+Left)';
    }
    
    if (forwardBtn) {
        forwardBtn.disabled = currentHistoryIndex >= navigationHistory.length - 1;
        forwardBtn.title = currentHistoryIndex < navigationHistory.length - 1
            ? `Go Forward to: ${navigationHistory[currentHistoryIndex + 1].fileName} (Alt+Right)`
            : 'Go Forward (Alt+Right)';
    }
}

function updateCurrentFileName(fileName) {
    const currentFileNameEl = document.getElementById('current-file-name');
    if (currentFileNameEl) {
        currentFileNameEl.textContent = fileName || 'No file selected';
        currentFileNameEl.title = fileName || '';
    }
}

// --- Settings Integration ---
async function saveNavigationHistoryToSettings() {
    try {
        if (!window.electronAPI) return;
        
        const historyToSave = navigationHistory.map(item => ({
            filePath: item.filePath,
            fileName: item.fileName,
            timestamp: item.timestamp
        }));
        
        const updatedSettings = { 
            ...window.appSettings, 
            navigationHistory: historyToSave,
            currentHistoryIndex: currentHistoryIndex
        };
        
        await window.electronAPI.invoke('set-settings', updatedSettings);
    } catch (error) {
        console.error('[Navigation] Failed to save navigation history to settings:', error);
    }
}

async function loadNavigationHistoryFromSettings() {
    try {
        if (!window.appSettings?.navigationHistory) return;
        
        navigationHistory = window.appSettings.navigationHistory || [];
        currentHistoryIndex = window.appSettings.currentHistoryIndex ?? -1;
        
        // Validate history index
        if (currentHistoryIndex >= navigationHistory.length) {
            currentHistoryIndex = navigationHistory.length - 1;
        }
        
        updateNavigationButtons();
        
        console.log('[Navigation] Loaded navigation history:', navigationHistory.length, 'items');
    } catch (error) {
        console.error('[Navigation] Failed to load navigation history from settings:', error);
    }
}

// --- Initialize Navigation ---
function initializeNavigation() {
    const backBtn = document.getElementById('nav-back-btn');
    const forwardBtn = document.getElementById('nav-forward-btn');
    
    if (backBtn) {
        backBtn.addEventListener('click', navigateBack);
    }
    
    if (forwardBtn) {
        forwardBtn.addEventListener('click', navigateForward);
    }
    
    // Load navigation history from settings
    loadNavigationHistoryFromSettings();
    
    // Keyboard shortcuts for navigation
    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateBack();
        } else if (e.altKey && e.key === 'ArrowRight') {
            e.preventDefault();
            navigateForward();
        }
    });
}

// --- Export Functions for Global Access ---
window.addToNavigationHistory = addToNavigationHistory;
window.navigateBack = navigateBack;
window.navigateForward = navigateForward;
window.initializeNavigation = initializeNavigation;
window.saveNavigationHistoryToSettings = saveNavigationHistoryToSettings;
window.loadNavigationHistoryFromSettings = loadNavigationHistoryFromSettings;
window.updateCurrentFileName = updateCurrentFileName;
// === API Helper Utilities ===
// Common patterns for electronAPI calls and error handling

// Global utilities available in window scope
window.ApiHelpers = window.ApiHelpers || {};

/**
 * Wrapper for a fixed preload capability with standardized error handling
 * @param {Function} operation - A capability method exposed by preload
 * @param {any} data - Data to pass to the method
 * @param {Object} options - Options for error handling
 * @param {string} options.errorMessage - Custom error message for notifications
 * @param {boolean} options.showNotification - Whether to show error notifications (default: true)
 * @param {boolean} options.logError - Whether to log errors to console (default: true)
 * @returns {Promise<any>} The result of the API call
 */
window.ApiHelpers.callElectronAPI = async function(operation, args = [], options = {}) {
    const {
        errorMessage = 'Electron operation failed',
        showNotification: shouldShowNotification = true,
        logError = true
    } = options;

    try {
        if (typeof operation !== 'function') {
            throw new Error('Electron capability not available');
        }
        const result = await operation(...args);

        // Handle API responses that include error messages
        if (result && result.error) {
            throw new Error(result.error);
        }

        return result;
    } catch (error) {
        if (logError) {
            console.error(`[API Helper] ${errorMessage}:`, error);
        }
        
        if (shouldShowNotification && typeof window.showNotification === 'function') {
            window.showNotification(errorMessage, 'error');
        }
        
        throw error;
    }
}

/**
 * Helper for file operations with standardized error handling
 * @param {string} method - The file operation method
 * @param {string} filePath - Path to the file
 * @param {any} data - Additional data for the operation
 * @returns {Promise<any>} The result of the file operation
 */
window.ApiHelpers.saveSettings = async function(settings) {
    return window.ApiHelpers.callElectronAPI(window.electronAPI?.settings?.setSettings, [settings], {
        errorMessage: 'Failed to save settings'
    });
}

/**
 * Helper for getting settings
 * @returns {Promise<Object>} The current settings
 */
window.ApiHelpers.getSettings = async function() {
    return window.ApiHelpers.callElectronAPI(window.electronAPI?.settings?.getSettings, [], {
        errorMessage: 'Failed to load settings'
    });
}

/**
 * Standardized error handler for async functions
 * @param {Function} fn - The async function to wrap
 * @param {string} context - Context description for error logging
 * @returns {Function} Wrapped function with error handling
 */
window.ApiHelpers.withErrorHandling = function(fn, context) {
    return async function(...args) {
        try {
            return await fn.apply(this, args);
        } catch (error) {
            console.error(`[${context}] Error:`, error);
            if (typeof window.showNotification === 'function') {
                window.showNotification(`Error in ${context}`, 'error');
            }
            throw error;
        }
    };
}

/**
 * Helper for operations that need both console logging and notifications
 * @param {string} message - The error message
 * @param {Error} error - The error object
 * @param {string} context - Context for logging
 */
window.ApiHelpers.handleError = function(message, error, context = 'Unknown') {
    console.error(`[${context}] ${message}:`, error);
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, 'error');
    }
}

// All functions are now available as window.ApiHelpers.*

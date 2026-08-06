/**
 * Centralized current-file mirror for legacy renderer globals.
 *
 * Newer editor state lives in TabManager. This module keeps the older
 * `window.currentFilePath` readers working while avoiding scattered writes.
 */
(function () {
    'use strict';

    function normalizeFilePath(filePath) {
        if (typeof filePath !== 'string') return null;
        const trimmed = filePath.trim();
        return trimmed ? trimmed : null;
    }

    function getDirectoryName(filePath) {
        const lastSlash = filePath.lastIndexOf('/');
        return lastSlash >= 0 ? filePath.substring(0, lastSlash) : '';
    }

    async function syncMainProcess(filePath) {
        if (!window.electronAPI || typeof window.electronAPI.invoke !== 'function') {
            return { success: false, skipped: true };
        }

        try {
            return await window.electronAPI.invoke('set-current-file', filePath);
        } catch (error) {
            console.error('[CurrentFileState] Failed to sync current file:', error);
            return { success: false, error: error.message };
        }
    }

    function setCurrentFilePath(filePath, options = {}) {
        const nextPath = normalizeFilePath(filePath);
        const previousPath = normalizeFilePath(window.currentFilePath);
        window.currentFilePath = nextPath;
        window.editorFileName = nextPath;

        if (nextPath) {
            window.currentFileDirectory = getDirectoryName(nextPath);
        } else if (options.clearDirectory) {
            window.currentFileDirectory = '';
        }

        if (previousPath !== nextPath && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('nightowl-current-file-changed', {
                detail: { filePath: nextPath, previousFilePath: previousPath }
            }));
        }

        if (options.syncMain) {
            return syncMainProcess(nextPath);
        }

        return Promise.resolve({ success: true, filePath: nextPath });
    }

    function clearCurrentFilePath(options = {}) {
        return setCurrentFilePath(null, { ...options, clearDirectory: options.clearDirectory !== false });
    }

    window.NightOwlCurrentFile = {
        normalize: normalizeFilePath,
        set: setCurrentFilePath,
        clear: clearCurrentFilePath,
        syncMain: syncMainProcess
    };
})();

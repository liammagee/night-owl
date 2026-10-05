/**
 * File-tree state helpers for legacy renderer globals.
 *
 * Rendering still lives in renderer.js, but active-folder and cut/copy
 * clipboard state are kept here so file-tree UI state has one owner.
 */
(function () {
    'use strict';

    function createEmptyClipboard() {
        return {
            filePath: null,
            filePaths: null,
            operation: null
        };
    }

    let clipboard = createEmptyClipboard();

    function normalizeClipboard(input = {}) {
        const operation = input.operation === 'cut' || input.operation === 'copy'
            ? input.operation
            : null;
        const filePaths = Array.isArray(input.filePaths)
            ? input.filePaths.filter(Boolean)
            : null;
        const filePath = input.filePath || filePaths?.[0] || null;

        if (!operation || (!filePath && !filePaths?.length)) {
            return createEmptyClipboard();
        }

        return {
            filePath,
            filePaths,
            operation
        };
    }

    function getClipboard() {
        return {
            filePath: clipboard.filePath,
            filePaths: Array.isArray(clipboard.filePaths) ? [...clipboard.filePaths] : null,
            operation: clipboard.operation
        };
    }

    function setClipboard(input) {
        clipboard = normalizeClipboard(input);
        return getClipboard();
    }

    function clearClipboard() {
        clipboard = createEmptyClipboard();
        return getClipboard();
    }

    function getClipboardPaths() {
        if (Array.isArray(clipboard.filePaths) && clipboard.filePaths.length > 0) {
            return clipboard.filePaths.filter(Boolean);
        }
        return clipboard.filePath ? [clipboard.filePath] : [];
    }

    function hasClipboardItems() {
        return Boolean(clipboard.operation && getClipboardPaths().length > 0);
    }

    function describeClipboard() {
        const paths = getClipboardPaths();
        if (paths.length === 1) {
            return `"${paths[0].split('/').pop()}"`;
        }
        return `${paths.length} files`;
    }

    function escapePathForSelector(path) {
        if (window.CSS && typeof window.CSS.escape === 'function') {
            return window.CSS.escape(path);
        }
        return path.replace(/(["\\])/g, '\\$1');
    }

    window.selectedFolderPath = window.selectedFolderPath || null;

    function setActiveTreeFolder(folderPath) {
        if (window.selectedFolderPath === folderPath) return;
        document.querySelectorAll('.file-tree-item.folder-active').forEach((el) => {
            el.classList.remove('folder-active');
        });
        window.selectedFolderPath = folderPath || null;
        if (folderPath) {
            const escaped = escapePathForSelector(folderPath);
            const el = document.querySelector(`.file-tree-item.folder[data-path="${escaped}"]`);
            if (el) el.classList.add('folder-active');
        }
        window.dispatchEvent(new CustomEvent('nightowl:active-folder-changed', {
            detail: { folderPath: window.selectedFolderPath }
        }));
    }

    window.NightOwlFileTreeState = {
        getClipboard,
        setClipboard,
        clearClipboard,
        getClipboardPaths,
        hasClipboardItems,
        describeClipboard,
        setActiveTreeFolder
    };
    window.setActiveTreeFolder = setActiveTreeFolder;
})();

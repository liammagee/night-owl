(function (root) {
    function restoreEditorAfterImageViewer(options = {}) {
        const documentRef = options.documentRef || root?.document;
        if (!documentRef) {
            return;
        }

        const switchToMode = options.switchToMode || root?.switchToMode;
        const exitPreviewOnlyMode = options.exitPreviewOnlyMode;
        const refreshEditorLayout = options.refreshEditorLayout || root?.refreshEditorLayout;
        const editorRef = options.editorRef || root?.editor;
        const schedule = typeof options.schedule === 'function'
            ? options.schedule
            : (callback, delay) => setTimeout(callback, delay);

        const viewer = documentRef.getElementById('image-viewer-container');
        if (viewer) {
            if (typeof viewer.remove === 'function') {
                viewer.remove();
            } else if (viewer.parentNode) {
                viewer.parentNode.removeChild(viewer);
            }
        }

        if (typeof switchToMode === 'function') {
            switchToMode('editor');
        }

        if (typeof exitPreviewOnlyMode === 'function') {
            exitPreviewOnlyMode();
        }

        const elementIdsToShow = [
            'panes-container',
            'mode-switcher',
            'editor-pane',
            'editor-container',
            'resizer',
            'preview-zoom-controls'
        ];

        elementIdsToShow.forEach((id) => {
            const element = documentRef.getElementById(id);
            if (element) {
                element.style.display = '';
            }
        });

        if (typeof refreshEditorLayout === 'function') {
            schedule(() => refreshEditorLayout(), 0);
        }

        if (editorRef && typeof editorRef.layout === 'function') {
            schedule(() => editorRef.layout(), 50);
        }

        if (editorRef && typeof editorRef.focus === 'function') {
            schedule(() => editorRef.focus(), 60);
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { restoreEditorAfterImageViewer };
    }

    if (root) {
        root.restoreEditorAfterImageViewer = restoreEditorAfterImageViewer;
    }
})(typeof window !== 'undefined' ? window : globalThis);

// Editor layout helpers: word-wrap aware scrollbars and source-view wrapping.
// Loaded before renderer.js; exposes window.NightOwlEditorLayout.
(function () {
    const SOURCE_NOWRAP_CLASS = 'preview-source-nowrap';

    function normalizeWordWrap(value) {
        if (value === false || value === 'off') return 'off';
        if (value === true || value === 'on' || value == null) return 'on';
        // Monaco also accepts 'wordWrapColumn' and 'bounded'; treat both as wrapping.
        return String(value);
    }

    /**
     * Monaco options that make horizontal overflow visible when wrapping is off.
     * With Monaco's default auto-hiding scrollbar a narrow pane looks unscrollable,
     * so the horizontal bar is kept visible whenever lines can overflow.
     */
    function editorOptionsForWordWrap(wordWrap, extraScrollbar = {}) {
        const mode = normalizeWordWrap(wordWrap);
        const wrapping = mode !== 'off';
        return {
            wordWrap: mode,
            scrollBeyondLastColumn: wrapping ? 0 : 5,
            scrollbar: {
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
                horizontal: wrapping ? 'auto' : 'visible',
                useShadows: false,
                ...extraScrollbar
            }
        };
    }

    /**
     * Keep the read-only source view (<pre id="preview-source">) in step with the
     * editor: wrapped when word wrap is on, horizontally scrollable when it is off.
     */
    function syncSourceViewWrap(wordWrap, sourceElement) {
        const element = sourceElement || (typeof document !== 'undefined' ? document.getElementById('preview-source') : null);
        if (!element) return null;
        const nowrap = normalizeWordWrap(wordWrap) === 'off';
        element.classList.toggle(SOURCE_NOWRAP_CLASS, nowrap);
        return nowrap;
    }

    function applyWordWrap(editor, wordWrap, sourceElement) {
        const options = editorOptionsForWordWrap(wordWrap);
        if (editor && typeof editor.updateOptions === 'function') {
            editor.updateOptions(options);
        }
        syncSourceViewWrap(options.wordWrap, sourceElement);
        return options;
    }

    const api = {
        SOURCE_NOWRAP_CLASS,
        normalizeWordWrap,
        editorOptionsForWordWrap,
        syncSourceViewWrap,
        applyWordWrap
    };

    if (typeof window !== 'undefined') {
        window.NightOwlEditorLayout = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();

/* Keep control nodes and their event listeners; replace decorative glyphs only. */
(() => {
    const paths = {
        folder: 'M3 7V5h6l2 2h10v13H3Z',
        structure: 'M5 3v18M5 6h14M5 12h10M5 18h14',
        search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
        chart: 'M4 20V10h3v10m4 0V4h3v16m4 0v-7h3v7',
        book: 'M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1v15',
        note: 'M14 3H4v18h16V9M14 3v6h6M8 13h8M8 17h5',
        git: 'M6 7v10M18 7v3c0 4-12 0-12 7M8 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0M8 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0M20 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
        clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2',
        image: 'M3 3h18v18H3ZM3 17l6-6 4 4 3-3 5 5M8 7h.01',
        eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
        edit: 'M4 20l1-5L17 3l4 4L9 19ZM14 6l4 4',
        grid: 'M3 3h18v18H3ZM3 9h18M3 15h18M9 3v18M15 3v18',
        link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
        left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7',
        up: 'M5 15l7-7 7 7', down: 'M5 9l7 7 7-7',
        plus: 'M12 5v14M5 12h14', copy: 'M8 8h13v13H8ZM16 8V3H3v13h5',
        home: 'M3 11l9-8 9 8M5 10v11h14V10M9 21v-8h6v8',
        command: 'M9 9V5a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V9',
        keyboard: 'M2 5h20v14H2ZM6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 16h8',
        comment: 'M3 3h18v14H8l-5 4ZM7 7h10M7 11h7',
        list: 'M9 5h12M9 12h12M9 19h12M3 5h.01M3 12h.01M3 19h.01',
        expand: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',
        sync: 'M7 3v18M3 7l4-4 4 4M17 21V3M13 17l4 4 4-4',
        sparkle: 'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',
        slides: 'M3 3h18v14H3ZM12 17v4M8 21h8',
        remove: 'M5 12h14',
        highlight: 'M4 17l10-14 6 4-10 14ZM3 21h18',
        code: 'M8 5l-6 7 6 7M16 5l6 7-6 7',
    };
    const mapping = {
        'show-files-btn':'folder', 'show-structure-btn':'structure', 'show-find-btn':'search', 'show-search-btn':'search',
        'show-stats-btn':'chart', 'show-citations-btn':'book', 'show-footnotes-btn':'note', 'show-git-btn':'git',
        'show-history-btn':'clock', 'show-version-history-btn':'clock', 'show-images-btn':'image', 'show-slides-btn':'slides',
        'nav-back-btn':'left', 'nav-forward-btn':'right', 'toggle-sidebar-btn':'folder', 'toggle-editor-btn':'edit',
        'toggle-preview-btn':'eye', 'toggle-gamification-btn':'chart', 'toggle-recognition-btn':'sparkle',
        'add-workspace-folder-btn':'copy', 'change-directory-btn':'home', 'new-folder-btn':'plus', 'duplicate-folder-btn':'copy',
        'renumber-lists-btn':'list', 'format-link-btn':'link', 'format-image-btn':'image', 'format-table-btn':'grid', 'format-list-btn':'list',
        'auto-slide-markers-btn':'slides', 'remove-slide-markers-btn':'remove', 'insert-speaker-notes-btn':'note',
        'insert-toc-btn':'structure', 'remove-toc-btn':'remove', 'command-palette-btn':'command', 'keyboard-shortcuts-btn':'keyboard',
        'insert-comment-annotation-btn':'comment', 'insert-highlight-annotation-btn':'highlight', 'insert-block-annotation-btn':'note',
        'fold-all-btn':'folder', 'unfold-all-btn':'book', 'fold-current-btn':'down', 'unfold-current-btn':'up',
        'global-search-btn':'search', 'ai-todo-suggestions-btn':'sparkle', 'invoke-ash-btn':'sparkle',
        'preview-scroll-sync-btn':'sync', 'preview-microfiche-btn':'grid', 'preview-source-btn':'code', 'preview-fullscreen-btn':'expand',
    };
    function decorate(root) {
        for (const [id, name] of Object.entries(mapping)) {
            const button = root.id === id ? root : root.querySelector?.(`#${id}`);
            if (!button || button.dataset.workspaceIcon) continue;
            if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', button.title || button.textContent.trim());
            button.innerHTML = `<svg class="workspace-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
            button.dataset.workspaceIcon = name;
        }
    }
    function initialize() {
        document.body.classList.add('workspace-polished');
        decorate(document);
        for (const id of ['left-sidebar-activity', 'mode-switcher', 'editor-toolbar']) {
            const container = document.getElementById(id);
            if (!container) continue;
            new MutationObserver(records => {
                for (const record of records) for (const node of record.addedNodes) {
                    if (node.nodeType === 1 && !node.closest('svg')) decorate(node);
                }
            }).observe(container, { childList: true, subtree: true });
        }
        // These tabs retain their text labels for quick scanning.
        const labels = { 'show-speaker-notes-btn':'Notes', 'show-wholepart-btn':'Relations' };
        for (const [id, label] of Object.entries(labels)) {
            const button = document.getElementById(id);
            if (button) button.textContent = label;
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once:true });
    else initialize();
})();

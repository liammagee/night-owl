/**
 * editor-tabs.js — VS Code-style editor tabs with Monaco model swapping
 *
 * Manages multiple open files as tabs, each backed by its own ITextModel.
 * Preserves cursor position, scroll state, and undo history per tab.
 */

(function () {
    'use strict';

    // Signal to renderer.js that tabs will handle file restoration
    window._tabManagerWillRestore = true;

    const MAX_TABS = 20;

    // Language map: file extension → Monaco language ID
    const LANG_MAP = {
        '.md': 'markdown', '.markdown': 'markdown',
        '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
        '.ts': 'typescript', '.tsx': 'typescriptreact', '.jsx': 'javascriptreact',
        '.json': 'json', '.jsonc': 'json',
        '.html': 'html', '.htm': 'html',
        '.css': 'css', '.scss': 'scss', '.less': 'less',
        '.py': 'python',
        '.rb': 'ruby',
        '.java': 'java',
        '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.hpp': 'cpp',
        '.go': 'go',
        '.rs': 'rust',
        '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
        '.yaml': 'yaml', '.yml': 'yaml',
        '.xml': 'xml', '.svg': 'xml',
        '.sql': 'sql',
        '.bib': 'bibtex',
        '.tex': 'latex',
        '.lua': 'lua',
        '.r': 'r',
        '.toml': 'ini',
        '.ini': 'ini',
        '.env': 'ini',
        '.dockerfile': 'dockerfile',
        '.txt': 'plaintext',
        '.csv': 'plaintext',
        '.log': 'plaintext'
    };

    function detectLanguage(filePath) {
        if (!filePath) return 'markdown';
        const lower = filePath.toLowerCase();
        // Special filenames
        if (lower.endsWith('dockerfile')) return 'dockerfile';
        if (lower.endsWith('makefile')) return 'shell';
        const dotIdx = lower.lastIndexOf('.');
        if (dotIdx < 0) return 'plaintext';
        return LANG_MAP[lower.slice(dotIdx)] || 'plaintext';
    }

    /**
     * TabManager — singleton managing open editor tabs
     */
    /** Untitled tab paths use a special prefix so they're never confused with real files. */
    const UNTITLED_PREFIX = 'untitled:';
    let _untitledCounter = 0;

    function isUntitledPath(filePath) {
        return typeof filePath === 'string' && filePath.startsWith(UNTITLED_PREFIX);
    }

    class TabManager {
        constructor() {
            this.tabs = new Map();       // filePath → TabState
            this.tabOrder = [];          // filePaths in visual order
            this.activeTabPath = null;
            this.maxTabs = MAX_TABS;
            this._initialized = false;
        }

        /**
         * Initialize after Monaco editor is ready.
         * Called from renderer.js after editor creation.
         */
        async init() {
            if (this._initialized) return;
            this._initialized = true;
            this._renderTabBar();
            await this._restoreTabs();
        }

        // --- Tab CRUD ---

        createTab(filePath, content, language) {
            if (this.tabs.has(filePath)) return this.tabs.get(filePath);

            const lang = language || detectLanguage(filePath);
            const model = monaco.editor.createModel(content || '', lang);
            const fileName = filePath.split('/').pop();

            const tab = {
                filePath,
                fileName,
                model,
                viewState: null,
                lastSavedContent: content || '',
                isDirty: false,
                language: lang,
                openedAt: Date.now()
            };

            this.tabs.set(filePath, tab);
            this.tabOrder.push(filePath);
            this._renderTabBar();
            this._persistTabs();
            return tab;
        }

        hasTab(filePath) {
            return this.tabs.has(filePath);
        }

        /**
         * Create a new untitled tab with a unique synthetic path.
         * Returns the generated path (e.g. "untitled:1") so callers can activate it.
         */
        createUntitledTab() {
            _untitledCounter++;
            const syntheticPath = `${UNTITLED_PREFIX}${_untitledCounter}`;
            const model = monaco.editor.createModel('', 'markdown');

            const tab = {
                filePath: syntheticPath,
                fileName: _untitledCounter === 1 ? 'Untitled' : `Untitled-${_untitledCounter}`,
                model,
                viewState: null,
                lastSavedContent: '',
                isDirty: false,
                language: 'markdown',
                openedAt: Date.now()
            };

            this.tabs.set(syntheticPath, tab);
            this.tabOrder.push(syntheticPath);
            this._renderTabBar();
            this._persistTabs();
            return syntheticPath;
        }

        /**
         * Re-key a tab (e.g. when an untitled file is saved to disk).
         * Moves the tab from oldPath to newPath, preserving model, state, and order.
         */
        rekeyTab(oldPath, newPath) {
            const tab = this.tabs.get(oldPath);
            if (!tab) return;

            // Update the tab's own data
            tab.filePath = newPath;
            tab.fileName = newPath.split('/').pop();
            tab.language = detectLanguage(newPath);

            // Move in the Map
            this.tabs.delete(oldPath);
            this.tabs.set(newPath, tab);

            // Update order array
            const idx = this.tabOrder.indexOf(oldPath);
            if (idx >= 0) this.tabOrder[idx] = newPath;

            // Update active pointer
            if (this.activeTabPath === oldPath) {
                this.activeTabPath = newPath;
            }

            this._renderTabBar();
            this._persistTabs();
        }

        /**
         * Switch to a tab. Saves outgoing view state, swaps model, restores incoming state.
         * Syncs global variables so auto-save, preview, etc. continue to work.
         */
        activateTab(filePath) {
            const tab = this.tabs.get(filePath);
            if (!tab) return;

            const editor = window.editor;
            if (!editor) return;

            // Save outgoing tab state
            if (this.activeTabPath && this.tabs.has(this.activeTabPath)) {
                const outgoing = this.tabs.get(this.activeTabPath);
                outgoing.viewState = editor.saveViewState();
            }

            // Swap model with auto-save suppressed
            window.suppressAutoSave = true;
            try {
                editor.setModel(tab.model);
            } finally {
                window.suppressAutoSave = false;
            }

            // Restore incoming view state (cursor, scroll, selections)
            if (tab.viewState) {
                editor.restoreViewState(tab.viewState);
            }

            // Set Monaco theme for this language
            if (typeof window.getMonacoTheme === 'function') {
                const t = window.getMonacoTheme(tab.language);
                if (t) monaco.editor.setTheme(t);
            }

            this.activeTabPath = filePath;

            // Sync globals that auto-save and other systems depend on.
            // Untitled tabs must keep currentFilePath null so saveFile triggers save-as.
            const isUntitled = isUntitledPath(filePath);
            window.currentFilePath = isUntitled ? null : filePath;
            window.editorFileName = isUntitled ? null : filePath;
            window.lastSavedContent = tab.lastSavedContent;
            window.hasUnsavedChanges = tab.isDirty;

            // Update the module-local lastSavedContent via exposed setter
            if (typeof window._setLastSavedContent === 'function') {
                window._setLastSavedContent(tab.lastSavedContent);
            }

            // Update unsaved indicator in breadcrumb
            if (typeof window.updateUnsavedIndicator === 'function') {
                window.updateUnsavedIndicator(tab.isDirty);
            }

            // Update file directory for image path resolution
            if (!isUntitled) {
                const lastSlash = filePath.lastIndexOf('/');
                window.currentFileDirectory = lastSlash >= 0 ? filePath.substring(0, lastSlash) : '';
            }

            // UI updates
            if (!isUntitled && typeof window.highlightCurrentFileInTree === 'function') {
                window.highlightCurrentFileInTree(filePath);
            }
            if (typeof window.updateBreadcrumb === 'function') {
                window.updateBreadcrumb(isUntitled ? null : filePath);
            }

            // Update preview with the activated tab's content
            const content = editor.getValue();
            if (typeof window.updatePreviewAndStructure === 'function') {
                window.updatePreviewAndStructure(content);
            }
            if (typeof window.syncContentToPresentation === 'function') {
                window.syncContentToPresentation(content);
            }

            // Notify backend of current file
            if (window.electronAPI) {
                window.electronAPI.invoke('set-current-file', filePath);
            }

            // Force layout recalculation
            editor.layout();
            editor.focus();

            this._renderTabBar();
            this._persistTabs();
        }

        /**
         * Close a tab. Prompts if dirty. Activates adjacent tab.
         */
        async closeTab(filePath) {
            const tab = this.tabs.get(filePath);
            if (!tab) return;

            // Confirm close if dirty
            if (tab.isDirty) {
                const confirmed = confirm(`"${tab.fileName}" has unsaved changes. Close anyway?`);
                if (!confirmed) return;
            }

            // Determine next tab to activate
            const idx = this.tabOrder.indexOf(filePath);
            const wasActive = this.activeTabPath === filePath;

            // Dispose the Monaco model
            if (tab.model && !tab.model.isDisposed()) {
                tab.model.dispose();
            }

            this.tabs.delete(filePath);
            this.tabOrder.splice(idx, 1);

            if (wasActive) {
                if (this.tabOrder.length > 0) {
                    // Activate the next tab, or previous if we closed the last one
                    const nextIdx = Math.min(idx, this.tabOrder.length - 1);
                    this.activeTabPath = null; // Clear so activateTab does full activation
                    this.activateTab(this.tabOrder[nextIdx]);
                } else {
                    this.activeTabPath = null;
                    // No tabs left — clear editor
                    const editor = window.editor;
                    if (editor) {
                        const emptyModel = monaco.editor.createModel('', 'markdown');
                        editor.setModel(emptyModel);
                    }
                    window.currentFilePath = '';
                    window.hasUnsavedChanges = false;
                    this._renderTabBar();
                }
            } else {
                this._renderTabBar();
            }

            this._persistTabs();
            // Update recovery data (closed tab no longer needs recovery)
            this._scheduleRecoveryPersist();
        }

        /**
         * Close all tabs except the specified one
         */
        async closeOtherTabs(keepPath) {
            const toClose = this.tabOrder.filter(p => p !== keepPath);
            for (const path of toClose) {
                const tab = this.tabs.get(path);
                if (tab && tab.isDirty) {
                    const confirmed = confirm(`"${tab.fileName}" has unsaved changes. Close anyway?`);
                    if (!confirmed) continue;
                }
                if (tab && tab.model && !tab.model.isDisposed()) {
                    tab.model.dispose();
                }
                this.tabs.delete(path);
            }
            this.tabOrder = this.tabOrder.filter(p => this.tabs.has(p));
            if (keepPath && this.tabs.has(keepPath)) {
                this.activateTab(keepPath);
            } else if (this.tabOrder.length === 0) {
                this.activeTabPath = null;
                const editor = window.editor;
                if (editor) {
                    const emptyModel = monaco.editor.createModel('', 'markdown');
                    editor.setModel(emptyModel);
                }
                window.currentFilePath = '';
                window.hasUnsavedChanges = false;
            }
            this._renderTabBar();
            this._persistTabs();
        }

        /**
         * Update the active tab's dirty state (called from auto-save hooks)
         */
        syncActiveTabDirty(isDirty, savedContent) {
            if (!this.activeTabPath) return;
            const tab = this.tabs.get(this.activeTabPath);
            if (!tab) return;
            tab.isDirty = isDirty;
            if (savedContent !== undefined) {
                tab.lastSavedContent = savedContent;
            }
            this._renderTabBar();
            // Persist recovery data whenever dirty state changes
            this._scheduleRecoveryPersist();
        }

        // --- Unsaved-change recovery ───────────────────────────────────

        /**
         * Debounced persistence of unsaved content for crash/restart recovery.
         * Only stores tabs that are dirty or untitled (clean saved files can
         * be re-read from disk and don't need recovery data).
         */
        _scheduleRecoveryPersist() {
            if (this._recoveryTimer) clearTimeout(this._recoveryTimer);
            this._recoveryTimer = setTimeout(() => this._persistRecovery(), 1500);
        }

        async _persistRecovery() {
            if (!window.electronAPI) return;
            try {
                const recoveryData = {};
                let hasRecoverableTabs = false;

                for (const [filePath, tab] of this.tabs) {
                    const untitled = isUntitledPath(filePath);
                    // Only persist tabs that need recovery: dirty or untitled
                    if (tab.isDirty || untitled) {
                        const content = tab.model && !tab.model.isDisposed?.()
                            ? tab.model.getValue()
                            : '';
                        recoveryData[filePath] = {
                            content,
                            isDirty: tab.isDirty,
                            language: tab.language,
                            fileName: tab.fileName,
                            savedAt: Date.now()
                        };
                        hasRecoverableTabs = true;
                    }
                }

                if (hasRecoverableTabs) {
                    await window.electronAPI.invoke('recovery-persist', recoveryData);
                } else {
                    // No unsaved content — clear the recovery file
                    await window.electronAPI.invoke('recovery-clear');
                }
            } catch (err) {
                console.warn('[TabManager] Recovery persist failed:', err);
            }
        }

        async _loadRecovery() {
            if (!window.electronAPI) return null;
            try {
                const result = await window.electronAPI.invoke('recovery-load');
                if (result.success && result.data) {
                    return result.data;
                }
            } catch (err) {
                console.warn('[TabManager] Recovery load failed:', err);
            }
            return null;
        }

        // --- Tab Bar Rendering ---

        _renderTabBar() {
            const bar = document.getElementById('editor-tabs-bar');
            if (!bar) return;

            if (this.tabOrder.length === 0) {
                bar.style.display = 'none';
                return;
            }

            bar.style.display = 'flex';
            bar.innerHTML = '';

            for (const filePath of this.tabOrder) {
                const tab = this.tabs.get(filePath);
                if (!tab) continue;

                const el = document.createElement('div');
                el.className = 'editor-tab' + (filePath === this.activeTabPath ? ' active' : '');
                el.dataset.filePath = filePath;
                el.title = filePath;

                const nameSpan = document.createElement('span');
                nameSpan.className = 'editor-tab-name';
                nameSpan.textContent = tab.fileName;
                el.appendChild(nameSpan);

                if (tab.isDirty) {
                    const dot = document.createElement('span');
                    dot.className = 'editor-tab-dirty';
                    dot.textContent = '●';
                    el.appendChild(dot);
                }

                const closeBtn = document.createElement('span');
                closeBtn.className = 'editor-tab-close';
                closeBtn.textContent = '×';
                closeBtn.title = 'Close';
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.closeTab(filePath);
                });
                el.appendChild(closeBtn);

                // Left click to activate
                el.addEventListener('click', () => {
                    this.activateTab(filePath);
                });

                // Middle click to close
                el.addEventListener('mousedown', (e) => {
                    if (e.button === 1) {
                        e.preventDefault();
                        this.closeTab(filePath);
                    }
                });

                // Right click context menu
                el.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this._showContextMenu(e, filePath);
                });

                bar.appendChild(el);
            }

            // Scroll active tab into view
            const activeEl = bar.querySelector('.editor-tab.active');
            if (activeEl) {
                activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
        }

        _showContextMenu(event, filePath) {
            // Remove existing context menu
            const existing = document.getElementById('tab-context-menu');
            if (existing) existing.remove();

            const menu = document.createElement('div');
            menu.id = 'tab-context-menu';
            menu.className = 'editor-tab-context-menu';
            menu.style.left = event.clientX + 'px';
            menu.style.top = event.clientY + 'px';

            const items = [
                { label: 'Close', action: () => this.closeTab(filePath) },
                { label: 'Close Others', action: () => this.closeOtherTabs(filePath) },
                { label: 'Close All', action: () => this.closeOtherTabs(null) }
            ];

            for (const item of items) {
                const el = document.createElement('div');
                el.className = 'editor-tab-context-item';
                el.textContent = item.label;
                el.addEventListener('click', () => {
                    menu.remove();
                    item.action();
                });
                menu.appendChild(el);
            }

            document.body.appendChild(menu);

            // Close on outside click
            const close = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', close);
                }
            };
            setTimeout(() => document.addEventListener('click', close), 0);
        }

        // --- Persistence ---

        async _persistTabs() {
            if (!window.electronAPI) return;
            try {
                const openTabs = this.tabOrder.map(fp => ({
                    filePath: fp,
                    fileName: this.tabs.get(fp)?.fileName || fp.split('/').pop()
                }));
                const activeTabIndex = this.activeTabPath
                    ? this.tabOrder.indexOf(this.activeTabPath)
                    : 0;
                await window.electronAPI.invoke('set-settings', {
                    editorTabs: { openTabs, activeTabIndex }
                });
            } catch (err) {
                console.warn('[TabManager] Failed to persist tabs:', err);
            }
        }

        async _restoreTabs() {
            if (!window.electronAPI) return;
            try {
                const settings = await window.electronAPI.invoke('get-settings');
                const tabSettings = settings?.editorTabs;
                if (!tabSettings?.openTabs?.length) return;

                const tabsToOpen = tabSettings.openTabs;
                const activeIdx = tabSettings.activeTabIndex || 0;

                // Load recovery data (unsaved content from prior session)
                const recovery = await this._loadRecovery();
                let recoveredCount = 0;

                for (const { filePath } of tabsToOpen) {
                    const recoveryEntry = recovery?.[filePath];

                    if (isUntitledPath(filePath)) {
                        // Untitled tab — can only be restored from recovery
                        if (recoveryEntry) {
                            _untitledCounter++;
                            const syntheticPath = `${UNTITLED_PREFIX}${_untitledCounter}`;
                            const model = monaco.editor.createModel(
                                recoveryEntry.content || '', recoveryEntry.language || 'markdown'
                            );
                            const tab = {
                                filePath: syntheticPath,
                                fileName: recoveryEntry.fileName || 'Untitled',
                                model,
                                viewState: null,
                                lastSavedContent: '',
                                isDirty: true, // untitled restored content is always dirty
                                language: recoveryEntry.language || 'markdown',
                                openedAt: Date.now()
                            };
                            this.tabs.set(syntheticPath, tab);
                            this.tabOrder.push(syntheticPath);
                            recoveredCount++;
                        }
                        continue;
                    }

                    // Real file — read from disk first
                    try {
                        const response = await window.electronAPI.invoke('read-file', filePath);
                        if (response && response.success && response.content !== undefined) {
                            this.createTab(filePath, response.content, detectLanguage(filePath));

                            // Overlay recovery content if this tab had unsaved changes
                            if (recoveryEntry && recoveryEntry.isDirty) {
                                const tab = this.tabs.get(filePath);
                                if (tab && tab.model) {
                                    tab.model.setValue(recoveryEntry.content);
                                    tab.isDirty = true;
                                    tab.lastSavedContent = response.content;
                                    recoveredCount++;
                                }
                            }
                        }
                    } catch (err) {
                        console.warn(`[TabManager] Skipping missing file: ${filePath}`, err);
                    }
                }

                if (recoveredCount > 0) {
                    console.log(`[TabManager] Recovered unsaved changes for ${recoveredCount} tab(s)`);
                    this._renderTabBar();
                }

                // Activate the previously active tab
                if (this.tabOrder.length > 0) {
                    const targetIdx = Math.min(activeIdx, this.tabOrder.length - 1);
                    this.activateTab(this.tabOrder[targetIdx]);
                }

                // Clear recovery file now that data has been applied
                // (it will be re-created if tabs are still dirty)
                if (recovery) {
                    await window.electronAPI.invoke('recovery-clear');
                }
            } catch (err) {
                console.warn('[TabManager] Failed to restore tabs:', err);
            }
        }
    }

    // Create singleton and expose globally
    const tabManager = new TabManager();
    window.tabManager = tabManager;
    window.isUntitledPath = isUntitledPath;

    // Flush recovery data synchronously-ish before the window closes
    window.addEventListener('beforeunload', () => {
        // Cancel any pending debounce and persist immediately
        if (tabManager._recoveryTimer) clearTimeout(tabManager._recoveryTimer);
        tabManager._persistRecovery();
    });

})();

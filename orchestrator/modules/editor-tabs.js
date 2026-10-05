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

    const MAX_TABS = 30;
    const MAX_TOTAL_MODEL_CHARS = 2_000_000;

    // Language map: file extension → Monaco language ID
    const LANG_MAP = {
        '.md': 'markdown', '.markdown': 'markdown',
        '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
        '.ts': 'typescript', '.tsx': 'typescriptreact', '.jsx': 'javascriptreact',
        '.json': 'json', '.jsonc': 'json', '.jsonl': 'json',
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

    function isSameOrChildPath(candidatePath, rootPath) {
        if (!candidatePath || !rootPath) return false;
        return candidatePath === rootPath || candidatePath.startsWith(`${rootPath.replace(/\/+$/, '')}/`);
    }

    function getConfiguredModelCharBudget() {
        const configured = Number(window.appSettings?.editor?.maxOpenModelChars);
        if (!Number.isFinite(configured)) return MAX_TOTAL_MODEL_CHARS;
        return Math.max(250_000, Math.min(10_000_000, Math.floor(configured)));
    }

    function setCurrentFileMirror(filePath, options = {}) {
        if (window.NightOwlCurrentFile && typeof window.NightOwlCurrentFile.set === 'function') {
            return window.NightOwlCurrentFile.set(filePath, options);
        }
        console.warn('[TabManager] Current file state helper is unavailable');
        return Promise.resolve({ success: false, skipped: true });
    }

    class TabManager {
        constructor() {
            this.tabs = new Map();       // filePath → TabState
            this.tabOrder = [];          // filePaths in visual order
            this.activeTabPath = null;
            this.maxTabs = MAX_TABS;
            this.maxModelChars = getConfiguredModelCharBudget();
            this.emptyModel = null;
            this._initialized = false;
        }

        /**
         * Initialize after Monaco editor is ready.
         * Called from renderer.js after editor creation.
         */
        async init() {
            if (this._initialized) return;
            this._initialized = true;
            this.maxModelChars = getConfiguredModelCharBudget();
            this._installMonacoCancelGuard();
            this._renderTabBar();
            await this._restoreTabs();
        }

        /**
         * Monaco's restoreViewState/setModel internals occasionally reject pending
         * measurement work with a "Canceled" error when models are swapped quickly
         * (e.g. clicking another tab while view-state restoration is still in
         * flight). The error is harmless — it just means "the operation you
         * scheduled is no longer needed" — but it surfaces in DevTools as
         * "Uncaught (in promise) Canceled: Canceled" noise that drowns out real
         * errors. Filter just those rejections at the boundary.
         *
         * VS Code itself uses an equivalent guard for the same reason.
         */
        _installMonacoCancelGuard() {
            if (window._monacoCancelGuardInstalled) return;
            window._monacoCancelGuardInstalled = true;
            window.addEventListener('unhandledrejection', (event) => {
                const reason = event.reason;
                if (!reason) return;
                const looksLikeMonacoCancel =
                    reason.name === 'Canceled' ||
                    (typeof reason.message === 'string' && reason.message === 'Canceled');
                if (looksLikeMonacoCancel) {
                    event.preventDefault();
                }
            });
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
                openedAt: Date.now(),
                lastActivatedAt: Date.now()
            };

            this.tabs.set(filePath, tab);
            this.tabOrder.push(filePath);
            if (!this._restoringTabs) this._enforceModelMemoryBudget(filePath);
            this._renderTabBar();
            this._persistTabs();
            return tab;
        }

        hasTab(filePath) {
            return this.tabs.has(filePath);
        }

        /**
         * Close the least-recently-activated non-dirty, non-active tab.
         * Used as the overflow valve when a new file is opened at MAX_TABS.
         * Returns true if a tab was evicted, false if no clean candidate exists
         * (e.g. every non-active tab has unsaved changes).
         *
         * Dirty tabs are NEVER evicted — that would drop the user's work.
         * The active tab is never evicted — the user is looking at it.
         */
        evictLRUCleanTab() {
            const oldestPath = this._findCleanEvictionCandidate();
            if (!oldestPath) return false;
            this._dropCleanTab(oldestPath);
            this._renderTabBar();
            this._persistTabs();
            return true;
        }

        /**
         * Create a new untitled tab with a unique synthetic path.
         * Returns the generated path (e.g. "untitled:1") so callers can activate it.
         */
        createUntitledTab() {
            do { _untitledCounter++; } while (this.tabs.has(`${UNTITLED_PREFIX}${_untitledCounter}`));
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
                openedAt: Date.now(),
                lastActivatedAt: Date.now()
            };

            this.tabs.set(syntheticPath, tab);
            this.tabOrder.push(syntheticPath);
            if (!this._restoringTabs) this._enforceModelMemoryBudget(syntheticPath);
            this._renderTabBar();
            this._persistTabs();
            return syntheticPath;
        }

        _estimateTabModelChars(tab) {
            if (!tab) return 0;
            if (tab.model && typeof tab.model.getValueLength === 'function') {
                return tab.model.getValueLength();
            }
            if (typeof tab.lastSavedContent === 'string') {
                return tab.lastSavedContent.length;
            }
            if (tab.model && typeof tab.model.getValue === 'function' && !tab.model.isDisposed?.()) {
                try {
                    return tab.model.getValue().length;
                } catch (_) {
                    return 0;
                }
            }
            return 0;
        }

        _getTotalModelChars() {
            let total = 0;
            for (const tab of this.tabs.values()) {
                total += this._estimateTabModelChars(tab);
            }
            return total;
        }

        _findCleanEvictionCandidate(protectedPath = null) {
            let oldestPath = null;
            let oldestTime = Infinity;
            for (const [filePath, tab] of this.tabs) {
                if (filePath === protectedPath) continue;
                if (filePath === this.activeTabPath) continue;
                if (tab.isDirty || isUntitledPath(filePath)) continue;
                const t = tab.lastActivatedAt || tab.openedAt || 0;
                if (t < oldestTime) {
                    oldestTime = t;
                    oldestPath = filePath;
                }
            }
            return oldestPath;
        }

        _dropCleanTab(filePath) {
            const tab = this.tabs.get(filePath);
            if (!tab || tab.isDirty || isUntitledPath(filePath)) return false;
            if (tab.model && (typeof tab.model.isDisposed !== 'function' || !tab.model.isDisposed())) {
                tab.model.dispose();
            }
            this.tabs.delete(filePath);
            const idx = this.tabOrder.indexOf(filePath);
            if (idx >= 0) this.tabOrder.splice(idx, 1);
            return true;
        }

        _enforceModelMemoryBudget(protectedPath = null) {
            const budget = Number.isFinite(this.maxModelChars) ? this.maxModelChars : MAX_TOTAL_MODEL_CHARS;
            const evicted = [];

            while (this._getTotalModelChars() > budget) {
                const candidate = this._findCleanEvictionCandidate(protectedPath);
                if (!candidate) break;
                if (!this._dropCleanTab(candidate)) break;
                evicted.push(candidate);
            }

            return evicted;
        }

        /**
         * Re-key a tab (e.g. when an untitled file is saved to disk).
         * Moves the tab from oldPath to newPath, preserving model, state, and order.
         */
        rekeyTab(oldPath, newPath) {
            const tab = this.tabs.get(oldPath);
            if (!tab) return;
            if (newPath === oldPath) return;
            if (this.tabs.has(newPath)) {
                throw new Error(`A tab is already open for ${newPath}`);
            }

            // Update the tab's own data
            tab.filePath = newPath;
            tab.fileName = newPath.split('/').pop();
            tab.language = detectLanguage(newPath);
            monaco.editor.setModelLanguage?.(tab.model, tab.language);

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
         * Re-key every open tab affected by a file or folder move/rename.
         * Folder operations preserve the child path suffix under the new root.
         */
        rekeyTabsForPath(oldPath, newPath, options = {}) {
            const includeChildren = Boolean(options.includeChildren);
            const affectedPaths = this.tabOrder.filter(path => (
                includeChildren ? isSameOrChildPath(path, oldPath) : path === oldPath
            ));
            const changed = [];
            let activeNewPath = null;

            for (const affectedPath of affectedPaths) {
                const suffix = affectedPath === oldPath ? '' : affectedPath.slice(oldPath.replace(/\/+$/, '').length);
                const targetPath = `${newPath.replace(/\/+$/, '')}${suffix}`;
                const wasActive = this.activeTabPath === affectedPath;

                if (targetPath !== affectedPath) {
                    this.rekeyTab(affectedPath, targetPath);
                    changed.push({ oldPath: affectedPath, newPath: targetPath });
                }

                if (wasActive) {
                    activeNewPath = targetPath;
                }
            }

            if (activeNewPath && this.tabs.has(activeNewPath)) {
                this.activateTab(activeNewPath);
            }

            return changed;
        }

        /**
         * Switch to a tab. Saves outgoing view state, swaps model, restores incoming state.
         * Syncs global variables so auto-save, preview, etc. continue to work.
         */
        activateTab(filePath, options = {}) {
            const tab = this.tabs.get(filePath);
            if (!tab) return;

            const editor = window.editor;
            if (!editor) return;

            // Record recency so LRU eviction picks truly stale tabs, not the one
            // the user just looked at. Updated here — not in createTab — because
            // activateTab is the only path the user actually "used" a tab.
            tab.lastActivatedAt = Date.now();

            // Save outgoing tab state
            if (this.activeTabPath && this.tabs.has(this.activeTabPath)) {
                const outgoing = this.tabs.get(this.activeTabPath);
                outgoing.viewState = editor.saveViewState();
            }

            // Swap model with auto-save suppressed
            window.suppressAutoSave = true;
            try {
                editor.setModel(tab.model);
                if (this.emptyModel && this.emptyModel !== tab.model) {
                    const modelToDispose = this.emptyModel;
                    this.emptyModel = null;
                    if (typeof modelToDispose.isDisposed !== 'function' || !modelToDispose.isDisposed()) {
                        modelToDispose.dispose();
                    }
                }
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
            if (options.syncCurrentFile !== false) {
                setCurrentFileMirror(isUntitled ? null : filePath, {
                    syncMain: true,
                    clearDirectory: isUntitled
                });
            }
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

            // UI updates
            if (!isUntitled && typeof window.highlightCurrentFileInTree === 'function') {
                window.highlightCurrentFileInTree(filePath);
            }
            if (typeof window.updateBreadcrumb === 'function') {
                window.updateBreadcrumb(isUntitled ? null : filePath);
            }

            // Update preview with the activated tab's content. The open-file
            // pipeline can suppress this because it performs the file-type
            // specific render after the rest of the open state is synchronized.
            const content = editor.getValue();
            if (!options.suppressPreviewUpdate && !window.__suppressTabPreviewUpdate) {
                if (!isUntitled && tab.language === 'html' && typeof window.renderHTMLSourcePreview === 'function') {
                    window.renderHTMLSourcePreview(filePath, content);
                } else if (typeof window.updatePreviewAndStructure === 'function') {
                    window.updatePreviewAndStructure(content);
                }
                if (tab.language !== 'html' && typeof window.syncContentToPresentation === 'function') {
                    window.syncContentToPresentation(content);
                }
            }

            // Force layout recalculation
            window.exitPDFOnlyMode?.();
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
                const confirmed = await window.showAppConfirm({
                    title: 'Close Unsaved Tab',
                    message: `"${tab.fileName}" has unsaved changes. Close anyway?`,
                    detail: 'Unsaved editor changes in this tab will be discarded.',
                    paths: [filePath],
                    confirmText: 'Close Without Saving',
                    variant: 'danger'
                });
                if (!confirmed) return;
            }

            // Another close/delete may have completed while confirmation was
            // open. Do not remove a replacement tab or splice the last tab at -1.
            if (this.tabs.get(filePath) !== tab) return;

            // Determine next tab to activate
            const idx = this.tabOrder.indexOf(filePath);
            const wasActive = this.activeTabPath === filePath;

            // Dispose the Monaco model
            if (tab.model && (typeof tab.model.isDisposed !== 'function' || !tab.model.isDisposed())) {
                tab.model.dispose();
            }

            this.tabs.delete(filePath);
            if (idx >= 0) this.tabOrder.splice(idx, 1);

            if (wasActive) {
                if (this.tabOrder.length > 0) {
                    // Activate the next tab, or previous if we closed the last one
                    const nextIdx = Math.min(idx, this.tabOrder.length - 1);
                    this.activeTabPath = null; // Clear so activateTab does full activation
                    this.activateTab(this.tabOrder[nextIdx]);
                } else {
                    this._clearEditorForNoTabs();
                }
            } else {
                this._renderTabBar();
            }

            this._persistTabs();
            // Update recovery data (closed tab no longer needs recovery)
            this._scheduleRecoveryPersist();
        }

        /**
         * Drop a tab because its backing file was deleted. This intentionally
         * skips the dirty prompt because the caller already confirmed the disk
         * mutation and can show the exact affected paths before deleting.
         */
        discardTab(filePath) {
            const tab = this.tabs.get(filePath);
            if (!tab) return false;

            const idx = this.tabOrder.indexOf(filePath);
            const wasActive = this.activeTabPath === filePath;

            if (tab.model && (typeof tab.model.isDisposed !== 'function' || !tab.model.isDisposed())) {
                tab.model.dispose();
            }

            this.tabs.delete(filePath);
            if (idx >= 0) this.tabOrder.splice(idx, 1);

            if (wasActive) {
                if (this.tabOrder.length > 0) {
                    const nextIdx = Math.min(Math.max(idx, 0), this.tabOrder.length - 1);
                    this.activeTabPath = null;
                    this.activateTab(this.tabOrder[nextIdx]);
                } else {
                    this._clearEditorForNoTabs();
                }
            } else {
                this._renderTabBar();
            }

            this._persistTabs();
            this._scheduleRecoveryPersist();
            return true;
        }

        discardTabsForPath(targetPath, options = {}) {
            const includeChildren = Boolean(options.includeChildren);
            const affectedPaths = this.tabOrder.filter(path => (
                includeChildren ? isSameOrChildPath(path, targetPath) : path === targetPath
            ));

            for (const affectedPath of affectedPaths) {
                this.discardTab(affectedPath);
            }

            return affectedPaths;
        }

        getTabsForPath(targetPath, options = {}) {
            const includeChildren = Boolean(options.includeChildren);
            return this.tabOrder.filter(path => (
                includeChildren ? isSameOrChildPath(path, targetPath) : path === targetPath
            ));
        }

        _clearEditorForNoTabs() {
            this.activeTabPath = null;
            const editor = window.editor;
            if (editor) {
                if (this.emptyModel && (typeof this.emptyModel.isDisposed !== 'function' || !this.emptyModel.isDisposed())) {
                    this.emptyModel.dispose();
                }
                const emptyModel = monaco.editor.createModel('', 'markdown');
                this.emptyModel = emptyModel;
                editor.setModel(emptyModel);
            }
            setCurrentFileMirror(null, { syncMain: true, clearDirectory: true });
            window.lastSavedContent = '';
            window.hasUnsavedChanges = false;
            if (typeof window._setLastSavedContent === 'function') {
                window._setLastSavedContent('');
            }
            if (typeof window.updateUnsavedIndicator === 'function') {
                window.updateUnsavedIndicator(false);
            }
            if (typeof window.updateBreadcrumb === 'function') {
                window.updateBreadcrumb(null);
            }
            if (typeof window.updatePreviewAndStructure === 'function') {
                window.updatePreviewAndStructure('');
            }
            if (typeof window.syncContentToPresentation === 'function') {
                window.syncContentToPresentation('');
            }
            this._renderTabBar();
        }

        /**
         * Close all tabs except the specified one
         */
        async closeOtherTabs(keepPath) {
            const toClose = this.tabOrder.filter(p => p !== keepPath);
            if (keepPath && this.tabs.has(keepPath)) this.activateTab(keepPath);
            for (const path of toClose) {
                await this.closeTab(path);
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
            // A failed read is not an empty recovery file. Preserve the previous
            // snapshot until a successful load rather than silently erasing it.
            if (!window.electronAPI || this._restoringTabs || this._recoveryReadFailed) return;
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
                            lastSavedContent: tab.lastSavedContent,
                            language: tab.language,
                            fileName: tab.fileName,
                            savedAt: Date.now()
                        };
                        hasRecoverableTabs = true;
                    }
                }

                if (hasRecoverableTabs) {
                    await window.electronAPI.recovery.recoveryPersist(recoveryData);
                } else {
                    // No unsaved content — clear the recovery file
                    await window.electronAPI.recovery.recoveryClear();
                }
            } catch (err) {
                console.warn('[TabManager] Recovery persist failed:', err);
            }
        }

        async _loadRecovery() {
            if (!window.electronAPI) return null;
            try {
                const result = await window.electronAPI.recovery.recoveryLoad();
                if (!result?.success) throw new Error(result?.error || 'Recovery read was not confirmed');
                if (result.data && (typeof result.data !== 'object' || Array.isArray(result.data))) {
                    throw new Error('Recovery data has an invalid format');
                }
                this._recoveryReadFailed = false;
                return result.data || null;
            } catch (err) {
                this._recoveryReadFailed = true;
                console.warn('[TabManager] Recovery load failed:', err);
                window.showNotification?.('Previous drafts could not be read. The recovery file has been preserved; new recovery snapshots are paused until restart.', 'warning');
            }
            return null;
        }

        // --- Tab Bar Rendering ---

        /**
         * Compute disambiguation suffixes for tabs whose filenames collide.
         *
         * Returns Map<filePath, string> — only contains entries for tabs that
         * actually need disambiguation. The string is the shortest unique
         * trailing path *directory* segment(s), without the filename itself.
         *
         * Mirrors VS Code's editor-tab disambiguation. If two `lecture-7.md`
         * files live at `/work/lectures/lecture-7.md` and
         * `/work/notes/lecture-7.md`, both tabs get a `lectures` /
         * `notes` suffix. If their parents also collide, the suffix grows.
         *
         * Untitled tabs are skipped — their synthetic paths can't collide
         * with real files, and even if two `Untitled` tabs exist, the
         * counter in their fileName already disambiguates them.
         */
        _computeDisambiguators() {
            const result = new Map();
            const byName = new Map();
            for (const [filePath, tab] of this.tabs) {
                if (isUntitledPath(filePath)) continue;
                if (!byName.has(tab.fileName)) byName.set(tab.fileName, []);
                byName.get(tab.fileName).push(filePath);
            }

            for (const [, paths] of byName) {
                if (paths.length < 2) continue;

                // Split each path into segments, strip empties from leading "/".
                const segs = paths.map(p => p.split('/').filter(Boolean));

                for (let i = 0; i < paths.length; i++) {
                    const mySegs = segs[i];
                    // Try increasing depth until this path's trailing suffix
                    // is unique among the colliding set. depth=2 means
                    // "parent dir + filename", which is the minimum useful suffix.
                    for (let depth = 2; depth <= mySegs.length; depth++) {
                        const mySuffix = mySegs.slice(-depth).join('/');
                        let unique = true;
                        for (let j = 0; j < paths.length; j++) {
                            if (j === i) continue;
                            const otherSuffix = segs[j].slice(-depth).join('/');
                            if (otherSuffix === mySuffix) { unique = false; break; }
                        }
                        if (unique) {
                            // Strip the filename from the suffix — we only
                            // want the directory portion to render as the badge.
                            const dirParts = mySegs.slice(-depth, -1);
                            result.set(paths[i], dirParts.join('/'));
                            break;
                        }
                    }
                }
            }
            return result;
        }

        _renderTabBar() {
            const bar = document.getElementById('editor-tabs-bar');
            if (!bar) return;

            bar.setAttribute('role', 'toolbar');
            bar.setAttribute('aria-label', 'Open editor files');
            bar.setAttribute('aria-orientation', 'horizontal');
            bar.tabIndex = 0;

            if (this.tabOrder.length === 0) {
                bar.style.display = 'none';
                return;
            }

            bar.style.display = 'flex';
            bar.innerHTML = '';

            const disambig = this._computeDisambiguators();

            for (const filePath of this.tabOrder) {
                const tab = this.tabs.get(filePath);
                if (!tab) continue;

                const el = document.createElement('div');
                const folderHint = disambig.get(filePath);
                el.className = 'editor-tab'
                    + (filePath === this.activeTabPath ? ' active' : '')
                    + (folderHint ? ' has-folder-hint' : '');
                el.setAttribute('role', 'presentation');
                el.dataset.filePath = filePath;

                const selectBtn = document.createElement('button');
                selectBtn.type = 'button';
                selectBtn.className = 'editor-tab-select';
                selectBtn.setAttribute('aria-label', `Open ${tab.fileName}`);
                selectBtn.setAttribute('aria-pressed', filePath === this.activeTabPath ? 'true' : 'false');
                selectBtn.tabIndex = filePath === this.activeTabPath ? 0 : -1;
                selectBtn.dataset.filePath = filePath;
                selectBtn.title = filePath;

                const nameSpan = document.createElement('span');
                nameSpan.className = 'editor-tab-name';
                nameSpan.textContent = tab.fileName;
                selectBtn.appendChild(nameSpan);

                if (folderHint) {
                    const folderSpan = document.createElement('span');
                    folderSpan.className = 'editor-tab-folder';
                    folderSpan.textContent = folderHint;
                    folderSpan.title = filePath;
                    selectBtn.appendChild(folderSpan);
                }

                if (tab.isDirty) {
                    const dot = document.createElement('span');
                    dot.className = 'editor-tab-dirty';
                    dot.textContent = '●';
                    dot.setAttribute('aria-hidden', 'true');
                    selectBtn.appendChild(dot);
                }

                const closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.className = 'editor-tab-close';
                closeBtn.textContent = '×';
                closeBtn.setAttribute('aria-label', `Close ${tab.fileName}`);
                closeBtn.dataset.tooltip = `Close ${tab.fileName}`;
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.closeTab(filePath);
                });

                const activate = () => {
                    const tab = this.tabs.get(filePath);
                    if (tab && typeof window.openFileInEditor === 'function') {
                        void window.openFileInEditor(filePath, tab.model.getValue(), {
                            source: 'editor-tab'
                        });
                        return;
                    }
                    this.activateTab(filePath);
                };

                // Left click and keyboard activation use the native button.
                selectBtn.addEventListener('click', activate);
                selectBtn.addEventListener('keydown', (event) => {
                    let targetIndex = null;
                    const index = this.tabOrder.indexOf(filePath);
                    if (event.key === 'ArrowLeft') targetIndex = Math.max(0, index - 1);
                    else if (event.key === 'ArrowRight') targetIndex = Math.min(this.tabOrder.length - 1, index + 1);
                    else if (event.key === 'Home') targetIndex = 0;
                    else if (event.key === 'End') targetIndex = this.tabOrder.length - 1;
                    if (targetIndex === null || targetIndex === index) return;

                    event.preventDefault();
                    const targetPath = this.tabOrder[targetIndex];
                    const target = Array.from(bar.querySelectorAll('.editor-tab-select'))
                        .find(button => button.dataset.filePath === targetPath);
                    target?.focus();
                });

                // Preserve delegated/programmatic wrapper clicks used by older callers.
                el.addEventListener('click', (event) => {
                    if (event.target === el) activate();
                });

                el.appendChild(selectBtn);
                el.appendChild(closeBtn);

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
            if (!window.electronAPI || this._restoringTabs) return;
            try {
                const openTabs = this.tabOrder.map(fp => ({
                    filePath: fp,
                    fileName: this.tabs.get(fp)?.fileName || fp.split('/').pop()
                }));
                const activeTabIndex = this.activeTabPath
                    ? this.tabOrder.indexOf(this.activeTabPath)
                    : 0;
                await window.electronAPI.settings.setSettings('editorTabs', {
                    openTabs, activeTabIndex, activeTabPath: this.activeTabPath
                });
            } catch (err) {
                console.warn('[TabManager] Failed to persist tabs:', err);
            }
        }

        async _restoreTabs() {
            if (!window.electronAPI || this._restoringTabs) return;
            this._restoringTabs = true;
            let restored = false;
            try {
                const settings = await window.electronAPI.settings.getSettings();
                const tabSettings = settings?.editorTabs;
                const savedTabs = Array.isArray(tabSettings?.openTabs) ? tabSettings.openTabs : [];
                const activeIdx = Number.isInteger(tabSettings?.activeTabIndex) ? tabSettings.activeTabIndex : 0;
                const preferredPath = tabSettings?.activeTabPath || savedTabs[activeIdx]?.filePath || settings?.currentFile;
                // Older sessions may only have currentFile, without a tab list.
                const editablePreferredPath = typeof preferredPath === 'string'
                    && !/\.(pdf|png|jpe?g|gif|bmp|svg|webp|ico)$/i.test(preferredPath)
                    ? preferredPath : null;
                const recovery = await this._loadRecovery();
                const paths = [...new Set([
                    ...savedTabs.map(tab => tab?.filePath),
                    editablePreferredPath,
                    // Recovery may be newer than the last saved tab list.
                    ...Object.keys(recovery || {})
                ].filter(path => typeof path === 'string' && path.length > 0))];
                const restoredPaths = new Map();
                let recoveredCount = 0;
                for (const path of paths) {
                    if (!isUntitledPath(path)) continue;
                    const id = Number(path.slice(UNTITLED_PREFIX.length));
                    if (Number.isSafeInteger(id) && id > _untitledCounter) _untitledCounter = id;
                }
                const preserveRecoveryBesideExisting = (filePath, recoveryEntry) => {
                    const existing = this.tabs.get(filePath);
                    if (typeof recoveryEntry?.content !== 'string'
                        || (!recoveryEntry.isDirty && !isUntitledPath(filePath))
                        || existing.model.getValue() === recoveryEntry.content) return filePath;
                    // A user may open/type in this tab while session I/O is in
                    // flight. Keep both drafts rather than overwriting either.
                    const draftPath = this.createUntitledTab();
                    const draft = this.tabs.get(draftPath);
                    draft.fileName = `${recoveryEntry.fileName || existing.fileName} (recovered)`;
                    draft.language = recoveryEntry.language || existing.language;
                    monaco.editor.setModelLanguage?.(draft.model, draft.language);
                    draft.model.setValue(recoveryEntry.content);
                    draft.isDirty = true;
                    recoveredCount++;
                    return draftPath;
                };

                for (const filePath of paths) {
                    const recoveryEntry = recovery?.[filePath];
                    const hasRecovery = typeof recoveryEntry?.content === 'string';
                    if (this.tabs.has(filePath)) {
                        restoredPaths.set(filePath, preserveRecoveryBesideExisting(filePath, recoveryEntry));
                        continue;
                    }

                    if (isUntitledPath(filePath)) {
                        if (hasRecovery) {
                            // Preserve saved identities: remapping 2 -> 1 can
                            // otherwise hide a later recovery entry for 1.
                            const syntheticPath = filePath;
                            const tab = this.createTab(syntheticPath, '', recoveryEntry.language || 'markdown');
                            tab.fileName = recoveryEntry.fileName || 'Untitled';
                            tab.language = recoveryEntry.language || 'markdown';
                            monaco.editor.setModelLanguage?.(tab.model, tab.language);
                            tab.model.setValue(recoveryEntry.content);
                            tab.isDirty = recoveryEntry.content !== '' || Boolean(recoveryEntry.isDirty);
                            restoredPaths.set(filePath, syntheticPath);
                            recoveredCount++;
                        }
                        continue;
                    }

                    let response;
                    try {
                        response = await window.electronAPI.files.readFile(filePath);
                    } catch (err) {
                        console.warn(`[TabManager] Could not read file: ${filePath}`, err);
                    }
                    // Do not overwrite a tab the user opened during the read.
                    if (this.tabs.has(filePath)) {
                        restoredPaths.set(filePath, preserveRecoveryBesideExisting(filePath, recoveryEntry));
                        continue;
                    }
                    const readable = response?.success && typeof response.content === 'string';
                    const dirtyRecovery = hasRecovery && recoveryEntry.isDirty;
                    if (!readable && !dirtyRecovery) continue;

                    // Keep recoverable edits even if the backing file moved or
                    // was deleted while the application was closed.
                    const alreadySaved = dirtyRecovery && readable && recoveryEntry.content === response.content;
                    const hasSavedBaseline = typeof recoveryEntry?.lastSavedContent === 'string';
                    const baseline = dirtyRecovery && !alreadySaved && hasSavedBaseline
                        ? recoveryEntry.lastSavedContent : (readable ? response.content : '');
                    const tab = this.createTab(filePath, baseline, detectLanguage(filePath));
                    if (dirtyRecovery) {
                        tab.model.setValue(recoveryEntry.content);
                        tab.isDirty = !alreadySaved;
                        recoveredCount++;
                    }
                    restoredPaths.set(filePath, filePath);
                }

                if (recoveredCount > 0) {
                    console.log(`[TabManager] Recovered unsaved changes for ${recoveredCount} tab(s)`);
                }
                // Select by path: skipped/missing tabs change the restored indexes.
                const targetPath = restoredPaths.get(preferredPath) || this.tabOrder[0];
                if (targetPath && !this.activeTabPath) this.activateTab(targetPath);
                this._enforceModelMemoryBudget(this.activeTabPath);
                this._renderTabBar();
                restored = true;
            } catch (err) {
                console.warn('[TabManager] Failed to restore tabs:', err);
            } finally {
                this._restoringTabs = false;
            }
            if (restored) {
                await this._persistTabs();
                // Keep recovered drafts durable immediately. Clearing recovery
                // here used to lose them on a second crash before the next edit.
                await this._persistRecovery();
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

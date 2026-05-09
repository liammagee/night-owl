/**
 * Tests for editor-tabs.js — tab management, untitled file creation, and tab re-keying.
 *
 * Verifies that:
 * - Creating a new file (Cmd+N) produces a distinct untitled tab
 * - The previous tab is preserved (no overwrite risk)
 * - Untitled tabs keep currentFilePath null so save triggers save-as
 * - Saving an untitled file re-keys the tab to the real path
 * - Multiple untitled tabs get unique names
 */

// Restore native DOM getElementById (renderer.setup.js overrides it with a mock)
const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || jest.fn();

// Load the editor-tabs module once — the IIFE sets window.tabManager
let moduleLoaded = false;

function ensureModuleLoaded() {
    if (!moduleLoaded) {
        require('../../../orchestrator/modules/editor-tabs.js');
        moduleLoaded = true;
    }
}

/**
 * Reset the tab manager to a clean state without reloading the module.
 */
function resetTabManager() {
    const tm = window.tabManager;
    if (!tm) return;

    // Dispose all models
    for (const tab of tm.tabs.values()) {
        if (tab.model && typeof tab.model.dispose === 'function') {
            try { tab.model.dispose(); } catch (_) { /* ignore */ }
        }
    }

    // Clear internal state
    tm.tabs.clear();
    tm.tabOrder.length = 0;
    tm.activeTabPath = null;
}

beforeEach(() => {
    document.getElementById = nativeGetElementById;

    // Reset window globals
    window.currentFilePath = null;
    window.editorFileName = null;
    window.lastSavedContent = '';
    window.hasUnsavedChanges = false;
    window.suppressAutoSave = false;
    window.__suppressTabPreviewUpdate = false;
    window.currentFileDirectory = '';
    window._setLastSavedContent = jest.fn();
    window.updateUnsavedIndicator = jest.fn();
    window.highlightCurrentFileInTree = jest.fn();
    window.updateBreadcrumb = jest.fn();
    window.updatePreviewAndStructure = jest.fn();
    window.renderHTMLSourcePreview = jest.fn();
    window.syncContentToPresentation = jest.fn();
    window.getMonacoTheme = jest.fn();
    window.electronAPI = { invoke: jest.fn().mockResolvedValue({}), on: jest.fn() };

    // Mock editor
    window.editor = {
        setModel: jest.fn(),
        saveViewState: jest.fn(() => null),
        restoreViewState: jest.fn(),
        getValue: jest.fn(() => ''),
        layout: jest.fn(),
        focus: jest.fn(),
    };

    // Create tab bar element in DOM
    const existing = document.getElementById('editor-tabs-bar');
    if (existing) existing.remove();
    const bar = document.createElement('div');
    bar.id = 'editor-tabs-bar';
    document.body.appendChild(bar);

    // Load the module (first time only) then reset state
    ensureModuleLoaded();
    resetTabManager();
});

afterEach(() => {
    const bar = document.getElementById('editor-tabs-bar');
    if (bar) bar.remove();
});

// ─── Core tab operations ───

describe('TabManager', () => {
    test('createTab adds a tab and tracks it', () => {
        const tm = window.tabManager;
        tm.createTab('/home/user/doc.md', '# Hello', 'markdown');
        expect(tm.tabs.size).toBe(1);
        expect(tm.hasTab('/home/user/doc.md')).toBe(true);
        expect(tm.tabOrder).toEqual(['/home/user/doc.md']);
    });

    test('activateTab sets the tab as active and syncs globals', () => {
        const tm = window.tabManager;
        tm.createTab('/home/user/doc.md', '# Hello');
        tm.activateTab('/home/user/doc.md');
        expect(tm.activeTabPath).toBe('/home/user/doc.md');
        expect(window.currentFilePath).toBe('/home/user/doc.md');
        expect(window.editorFileName).toBe('/home/user/doc.md');
    });

    test('createTab does not duplicate if path already exists', () => {
        const tm = window.tabManager;
        tm.createTab('/home/user/doc.md', 'v1');
        tm.createTab('/home/user/doc.md', 'v2');
        expect(tm.tabs.size).toBe(1);
    });

    test('activateTab routes HTML tabs to the HTML source preview renderer', () => {
        const tm = window.tabManager;
        const html = '<h1>Hello</h1>';
        window.editor.getValue = jest.fn(() => html);

        tm.createTab('/home/user/page.html', html);
        tm.activateTab('/home/user/page.html');

        expect(tm.tabs.get('/home/user/page.html').language).toBe('html');
        expect(window.renderHTMLSourcePreview).toHaveBeenCalledWith('/home/user/page.html', html);
        expect(window.updatePreviewAndStructure).not.toHaveBeenCalled();
        expect(window.syncContentToPresentation).not.toHaveBeenCalled();
    });

    test('activateTab can suppress preview rendering during file-open routing', () => {
        const tm = window.tabManager;
        const html = '<script>while(true){}</script><h1>Hello</h1>';
        window.editor.getValue = jest.fn(() => html);
        window.__suppressTabPreviewUpdate = true;

        tm.createTab('/home/user/page.html', html);
        tm.activateTab('/home/user/page.html');

        expect(window.renderHTMLSourcePreview).not.toHaveBeenCalled();
        expect(window.updatePreviewAndStructure).not.toHaveBeenCalled();
        expect(window.syncContentToPresentation).not.toHaveBeenCalled();
    });
});

// ─── Untitled tab creation (the core bug fix) ───

describe('Untitled tab creation', () => {
    test('createUntitledTab creates a tab with untitled: prefix path', () => {
        const tm = window.tabManager;
        const path = tm.createUntitledTab();
        expect(path).toMatch(/^untitled:\d+$/);
        expect(tm.hasTab(path)).toBe(true);
        expect(tm.tabs.size).toBe(1);
    });

    test('multiple createUntitledTab calls produce unique paths', () => {
        const tm = window.tabManager;
        const p1 = tm.createUntitledTab();
        const p2 = tm.createUntitledTab();
        expect(p1).not.toBe(p2);
        expect(tm.tabs.size).toBe(2);
    });

    test('untitled tab has "Untitled" as fileName', () => {
        const tm = window.tabManager;
        const path = tm.createUntitledTab();
        const tab = tm.tabs.get(path);
        expect(tab.fileName).toMatch(/^Untitled/);
    });

    test('untitled tab starts with empty content and markdown language', () => {
        const tm = window.tabManager;
        const path = tm.createUntitledTab();
        const tab = tm.tabs.get(path);
        expect(tab.language).toBe('markdown');
        expect(tab.lastSavedContent).toBe('');
        expect(tab.isDirty).toBe(false);
    });

    test('activating an untitled tab sets currentFilePath to null (triggers save-as)', () => {
        const tm = window.tabManager;
        const path = tm.createUntitledTab();
        tm.activateTab(path);
        expect(tm.activeTabPath).toBe(path);
        expect(window.currentFilePath).toBeNull();
        expect(window.editorFileName).toBeNull();
    });

    test('existing tab is preserved when creating a new untitled tab', () => {
        const tm = window.tabManager;
        // Simulate: user has doc.md open, then presses Cmd+N
        tm.createTab('/home/user/doc.md', '# Important document');
        tm.activateTab('/home/user/doc.md');

        const untitledPath = tm.createUntitledTab();
        tm.activateTab(untitledPath);

        // The original tab must still exist — not overwritten
        expect(tm.hasTab('/home/user/doc.md')).toBe(true);
        const originalTab = tm.tabs.get('/home/user/doc.md');
        expect(originalTab.lastSavedContent).toBe('# Important document');
        expect(tm.tabs.size).toBe(2);
        expect(tm.tabOrder).toContain('/home/user/doc.md');
        expect(tm.tabOrder).toContain(untitledPath);
    });
});

// ─── isUntitledPath ───

describe('isUntitledPath', () => {
    test('returns true for untitled: paths', () => {
        expect(window.isUntitledPath('untitled:1')).toBe(true);
        expect(window.isUntitledPath('untitled:42')).toBe(true);
    });

    test('returns false for real file paths', () => {
        expect(window.isUntitledPath('/home/user/doc.md')).toBe(false);
        expect(window.isUntitledPath('file.txt')).toBe(false);
    });

    test('returns false for non-string values', () => {
        expect(window.isUntitledPath(null)).toBe(false);
        expect(window.isUntitledPath(undefined)).toBe(false);
        expect(window.isUntitledPath(42)).toBe(false);
    });
});

// ─── Tab re-keying (untitled → saved file) ───

describe('rekeyTab', () => {
    test('moves tab from old path to new path', () => {
        const tm = window.tabManager;
        const untitledPath = tm.createUntitledTab();
        tm.activateTab(untitledPath);

        tm.rekeyTab(untitledPath, '/home/user/new-doc.md');

        expect(tm.hasTab(untitledPath)).toBe(false);
        expect(tm.hasTab('/home/user/new-doc.md')).toBe(true);
        expect(tm.tabs.size).toBe(1);
    });

    test('updates activeTabPath when re-keying the active tab', () => {
        const tm = window.tabManager;
        const untitledPath = tm.createUntitledTab();
        tm.activateTab(untitledPath);

        tm.rekeyTab(untitledPath, '/home/user/saved.md');

        expect(tm.activeTabPath).toBe('/home/user/saved.md');
    });

    test('preserves tab order position after re-key', () => {
        const tm = window.tabManager;
        tm.createTab('/first.md', 'first');
        const untitledPath = tm.createUntitledTab();
        tm.createTab('/third.md', 'third');

        tm.rekeyTab(untitledPath, '/second.md');

        expect(tm.tabOrder).toEqual(['/first.md', '/second.md', '/third.md']);
    });

    test('updates fileName to match the new file path', () => {
        const tm = window.tabManager;
        const untitledPath = tm.createUntitledTab();
        tm.rekeyTab(untitledPath, '/home/user/my-essay.md');

        const tab = tm.tabs.get('/home/user/my-essay.md');
        expect(tab.fileName).toBe('my-essay.md');
    });

    test('after re-key and activate, currentFilePath is the real path (not null)', () => {
        const tm = window.tabManager;
        const untitledPath = tm.createUntitledTab();
        tm.activateTab(untitledPath);
        expect(window.currentFilePath).toBeNull(); // untitled → null

        tm.rekeyTab(untitledPath, '/home/user/saved.md');
        tm.activateTab('/home/user/saved.md');

        expect(window.currentFilePath).toBe('/home/user/saved.md');
        expect(window.editorFileName).toBe('/home/user/saved.md');
    });

    test('does not affect other tabs when re-keying', () => {
        const tm = window.tabManager;
        tm.createTab('/existing.md', '# Existing');
        const untitledPath = tm.createUntitledTab();

        tm.rekeyTab(untitledPath, '/new-file.md');

        expect(tm.hasTab('/existing.md')).toBe(true);
        const existingTab = tm.tabs.get('/existing.md');
        expect(existingTab.lastSavedContent).toBe('# Existing');
    });
});

// ─── Full Cmd+N workflow integration ───

describe('New file workflow (Cmd+N → edit → save-as)', () => {
    test('full workflow: open file → Cmd+N → save untitled → both tabs correct', () => {
        const tm = window.tabManager;

        // Step 1: Open an existing file
        tm.createTab('/project/readme.md', '# README');
        tm.activateTab('/project/readme.md');
        expect(window.currentFilePath).toBe('/project/readme.md');

        // Step 2: Cmd+N — create untitled tab
        const untitledPath = tm.createUntitledTab();
        tm.activateTab(untitledPath);
        expect(window.currentFilePath).toBeNull(); // save-as will fire
        expect(tm.tabs.size).toBe(2);

        // Step 3: User saves → save-as dialog returns a real path
        tm.rekeyTab(untitledPath, '/project/new-doc.md');
        tm.activateTab('/project/new-doc.md');
        expect(window.currentFilePath).toBe('/project/new-doc.md');

        // Step 4: Verify original file is untouched
        expect(tm.hasTab('/project/readme.md')).toBe(true);
        const readmeTab = tm.tabs.get('/project/readme.md');
        expect(readmeTab.lastSavedContent).toBe('# README');

        // Step 5: Can switch back to original tab
        tm.activateTab('/project/readme.md');
        expect(window.currentFilePath).toBe('/project/readme.md');
        expect(tm.activeTabPath).toBe('/project/readme.md');
    });
});

// ─── Unsaved-change recovery ───

describe('Recovery persistence', () => {
    beforeEach(() => {
        // Use fake timers to control debounced recovery writes
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('syncActiveTabDirty(true) schedules recovery persistence', () => {
        const tm = window.tabManager;
        tm.createTab('/doc.md', 'original');
        tm.activateTab('/doc.md');

        tm.syncActiveTabDirty(true);

        // Recovery should be scheduled (debounced)
        expect(tm._recoveryTimer).toBeTruthy();
    });

    test('_persistRecovery sends dirty tab content to recovery-persist IPC', async () => {
        const tm = window.tabManager;
        tm.createTab('/doc.md', 'original');
        tm.activateTab('/doc.md');

        // Simulate edit
        const tab = tm.tabs.get('/doc.md');
        tab.model.getValue = jest.fn(() => '# Edited content');
        tab.isDirty = true;

        await tm._persistRecovery();

        expect(window.electronAPI.invoke).toHaveBeenCalledWith(
            'recovery-persist',
            expect.objectContaining({
                '/doc.md': expect.objectContaining({
                    content: '# Edited content',
                    isDirty: true
                })
            })
        );
    });

    test('_persistRecovery skips clean (non-dirty) tabs', async () => {
        const tm = window.tabManager;
        tm.createTab('/clean.md', 'saved');
        tm.activateTab('/clean.md');

        // Tab is clean (isDirty = false by default)
        await tm._persistRecovery();

        // Should call recovery-clear since no tabs need recovery
        expect(window.electronAPI.invoke).toHaveBeenCalledWith('recovery-clear');
    });

    test('_persistRecovery always includes untitled tabs (even if not dirty)', async () => {
        const tm = window.tabManager;
        const path = tm.createUntitledTab();
        tm.activateTab(path);

        // Untitled tab is not dirty yet, but should still be persisted
        await tm._persistRecovery();

        expect(window.electronAPI.invoke).toHaveBeenCalledWith(
            'recovery-persist',
            expect.objectContaining({
                [path]: expect.objectContaining({
                    language: 'markdown'
                })
            })
        );
    });

    test('syncActiveTabDirty(false) after save schedules recovery update', () => {
        const tm = window.tabManager;
        tm.createTab('/doc.md', 'content');
        tm.activateTab('/doc.md');

        tm.syncActiveTabDirty(false, 'content');

        // Recovery should still be scheduled (to clear recovery for this now-clean tab)
        expect(tm._recoveryTimer).toBeTruthy();
    });

    test('closeTab triggers recovery update', () => {
        const tm = window.tabManager;
        tm.createTab('/a.md', 'a');
        tm.createTab('/b.md', 'b');
        tm.activateTab('/a.md');

        // Mark /a.md as dirty, then close it (confirm will be called)
        global.confirm = jest.fn(() => true);
        const tab = tm.tabs.get('/a.md');
        tab.isDirty = true;
        tab.model.isDisposed = jest.fn(() => false);

        tm.closeTab('/a.md');

        // Recovery should be scheduled after close
        expect(tm._recoveryTimer).toBeTruthy();
    });
});

describe('Recovery restoration', () => {
    test('_restoreTabs applies recovery content to dirty file tabs', async () => {
        const tm = window.tabManager;

        // Mock settings: one tab was open
        window.electronAPI.invoke = jest.fn((channel, ...args) => {
            if (channel === 'get-settings') {
                return Promise.resolve({
                    editorTabs: {
                        openTabs: [{ filePath: '/project/doc.md', fileName: 'doc.md' }],
                        activeTabIndex: 0
                    }
                });
            }
            if (channel === 'read-file') {
                return Promise.resolve({ success: true, content: '# Saved on disk' });
            }
            if (channel === 'recovery-load') {
                return Promise.resolve({
                    success: true,
                    data: {
                        '/project/doc.md': {
                            content: '# Unsaved edits from last session',
                            isDirty: true,
                            language: 'markdown'
                        }
                    }
                });
            }
            if (channel === 'recovery-clear') return Promise.resolve({ success: true });
            if (channel === 'set-current-file') return Promise.resolve({});
            if (channel === 'set-settings') return Promise.resolve({});
            return Promise.resolve({});
        });

        await tm._restoreTabs();

        // Tab should exist with recovery content overlaid
        expect(tm.hasTab('/project/doc.md')).toBe(true);
        const tab = tm.tabs.get('/project/doc.md');
        expect(tab.isDirty).toBe(true);
        expect(tab.lastSavedContent).toBe('# Saved on disk');
        // The model should have been set to the recovery content
        expect(tab.model.setValue).toHaveBeenCalledWith('# Unsaved edits from last session');
    });

    test('_restoreTabs recreates untitled tabs from recovery', async () => {
        const tm = window.tabManager;

        window.electronAPI.invoke = jest.fn((channel) => {
            if (channel === 'get-settings') {
                return Promise.resolve({
                    editorTabs: {
                        openTabs: [
                            { filePath: 'untitled:99', fileName: 'Untitled' }
                        ],
                        activeTabIndex: 0
                    }
                });
            }
            if (channel === 'recovery-load') {
                return Promise.resolve({
                    success: true,
                    data: {
                        'untitled:99': {
                            content: 'My unsaved draft',
                            isDirty: true,
                            language: 'markdown',
                            fileName: 'Untitled'
                        }
                    }
                });
            }
            if (channel === 'recovery-clear') return Promise.resolve({ success: true });
            if (channel === 'set-current-file') return Promise.resolve({});
            if (channel === 'set-settings') return Promise.resolve({});
            return Promise.resolve({});
        });

        await tm._restoreTabs();

        // Should have one tab (with a new untitled path, not the old one)
        expect(tm.tabs.size).toBe(1);
        const restoredPath = tm.tabOrder[0];
        expect(window.isUntitledPath(restoredPath)).toBe(true);
        const tab = tm.tabs.get(restoredPath);
        expect(tab.fileName).toBe('Untitled');
        expect(tab.isDirty).toBe(true);
    });

    test('_restoreTabs skips untitled tabs with no recovery data', async () => {
        const tm = window.tabManager;

        window.electronAPI.invoke = jest.fn((channel) => {
            if (channel === 'get-settings') {
                return Promise.resolve({
                    editorTabs: {
                        openTabs: [
                            { filePath: 'untitled:5', fileName: 'Untitled' }
                        ],
                        activeTabIndex: 0
                    }
                });
            }
            if (channel === 'recovery-load') {
                return Promise.resolve({ success: true, data: null });
            }
            return Promise.resolve({});
        });

        await tm._restoreTabs();

        // No recovery data → untitled tab should not be recreated
        expect(tm.tabs.size).toBe(0);
    });

    test('_restoreTabs clears recovery file after applying', async () => {
        const tm = window.tabManager;

        window.electronAPI.invoke = jest.fn((channel) => {
            if (channel === 'get-settings') {
                return Promise.resolve({
                    editorTabs: {
                        openTabs: [{ filePath: '/doc.md', fileName: 'doc.md' }],
                        activeTabIndex: 0
                    }
                });
            }
            if (channel === 'read-file') {
                return Promise.resolve({ success: true, content: 'disk content' });
            }
            if (channel === 'recovery-load') {
                return Promise.resolve({
                    success: true,
                    data: {
                        '/doc.md': { content: 'unsaved', isDirty: true, language: 'markdown' }
                    }
                });
            }
            if (channel === 'recovery-clear') return Promise.resolve({ success: true });
            if (channel === 'set-current-file') return Promise.resolve({});
            if (channel === 'set-settings') return Promise.resolve({});
            return Promise.resolve({});
        });

        await tm._restoreTabs();

        // Should have called recovery-clear after applying
        expect(window.electronAPI.invoke).toHaveBeenCalledWith('recovery-clear');
    });
});

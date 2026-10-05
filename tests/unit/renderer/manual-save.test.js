const fs = require('fs');
const path = require('path');
const vm = require('vm');

const renderer = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');
const manualSource = renderer.slice(renderer.indexOf('// --- Manual Save Function ---'), renderer.indexOf('// --- Git Publish Dialog ---'));

function model(value) {
    let content = value;
    return { getValue: jest.fn(() => content), setValue: jest.fn(next => { content = next; }), isDisposed: jest.fn(() => false) };
}
function setup(filePath = '/a.md') {
    const a = { filePath, model: model('submitted text'), lastSavedContent: 'saved', isDirty: true };
    const b = { filePath: '/b.md', model: model('other edits'), lastSavedContent: 'other saved', isDirty: true };
    const tm = {
        tabs: new Map([[filePath, a], [b.filePath, b]]), activeTabPath: filePath,
        _renderTabBar: jest.fn(), _scheduleRecoveryPersist: jest.fn(),
        rekeyTab: jest.fn((oldPath, newPath) => {
            const tab = tm.tabs.get(oldPath);
            tm.tabs.delete(oldPath);
            tm.tabs.set(newPath, tab);
            tab.filePath = newPath;
            if (tm.activeTabPath === oldPath) tm.activeTabPath = newPath;
        })
    };
    const context = {
        console: { error: jest.fn(), warn: jest.fn() },
        editor: { getModel: jest.fn(() => a.model), getValue: jest.fn(() => a.model.getValue()) },
        lastSavedContent: 'saved', updateUnsavedIndicator: jest.fn(), showNotification: jest.fn(),
        updateGitStatusIndicator: jest.fn(), renderFileTree: jest.fn(), updateBreadcrumb: jest.fn(),
        highlightCurrentFileInTree: jest.fn(),
        window: {
            tabManager: tm, currentFilePath: filePath.startsWith('untitled:') ? null : filePath,
            hasUnsavedChanges: true, appSettings: { workingDirectory: '/project' },
            electronAPI: { invoke: jest.fn(async () => ({ success: true })) },
            showAppConfirm: jest.fn().mockResolvedValue(true)
        }
    };
    const bridge = context.window.electronAPI;
    bridge.files = {
        performSaveWithPath: (...args) => bridge.invoke('perform-save-with-path', ...args),
        performSaveAs: (...args) => bridge.invoke('perform-save-as', ...args),
        refreshFileTree: () => bridge.invoke('refresh-file-tree')
    };
    bridge.settings = { getSettings: () => bridge.invoke('get-settings') };
    context.setCurrentFilePathState = jest.fn(async filePath => { context.window.currentFilePath = filePath; });
    vm.runInNewContext(manualSource, context);
    const switchToB = () => {
        tm.activeTabPath = b.filePath;
        context.window.currentFilePath = b.filePath;
        context.editor.getModel.mockReturnValue(b.model);
        context.lastSavedContent = b.lastSavedContent;
    };
    return { context, a, b, tm, switchToB };
}
const flushQueue = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('manual save captured-model safety', () => {
    test('saves explicit captured path and leaves edits typed during write dirty', async () => {
        const { context, a } = setup();
        let finish;
        context.window.electronAPI.invoke.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        const pending = context.saveFile();
        await flushQueue();
        expect(context.window.electronAPI.invoke).toHaveBeenCalledWith('perform-save-with-path', 'submitted text', '/a.md', { expectedContent: 'saved' });
        a.model.setValue('new edits');
        finish({ success: true });
        await pending;
        expect(a.lastSavedContent).toBe('submitted text');
        expect(a.isDirty).toBe(true);
        expect(context.window.hasUnsavedChanges).toBe(true);
    });

    test('finishing an outgoing save leaves incoming tab globals untouched', async () => {
        const { context, a, b, switchToB } = setup();
        let finish;
        context.window.electronAPI.invoke.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        const pending = context.saveFile();
        await flushQueue();
        switchToB();
        finish({ success: true });
        await pending;
        expect(a.isDirty).toBe(false);
        expect(b.isDirty).toBe(true);
        expect(context.window.hasUnsavedChanges).toBe(true);
        expect(context.lastSavedContent).toBe('other saved');
    });

    test('forced overwrite uses original path after switching during confirmation', async () => {
        const { context, switchToB } = setup();
        context.window.electronAPI.invoke.mockResolvedValueOnce({ success: false, code: 'FILE_MODIFIED_EXTERNALLY', currentMtimeMs: 123 });
        context.window.showAppConfirm.mockImplementation(async () => { switchToB(); return true; });
        await context.saveFile();
        expect(context.window.electronAPI.invoke).toHaveBeenNthCalledWith(2, 'perform-save-with-path', 'submitted text', '/a.md', { force: true, expectedMtimeMs: 123 });
    });

    test('Save As rekeys the captured untitled tab and preserves edits made during dialog', async () => {
        const { context, a, tm } = setup('untitled:1');
        let finish;
        context.window.electronAPI.invoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const pending = context.saveFile();
        await flushQueue();
        a.model.setValue('newer draft');
        finish({ success: true, filePath: '/saved.md' });
        await pending;
        expect(tm.rekeyTab).toHaveBeenCalledWith('untitled:1', '/saved.md');
        expect(a.model.getValue()).toBe('newer draft');
        expect(a.lastSavedContent).toBe('submitted text');
        expect(a.isDirty).toBe(true);
        expect(context.window.currentFilePath).toBe('/saved.md');
        expect(context.window.hasUnsavedChanges).toBe(true);
        expect(context.window.electronAPI.invoke.mock.calls.filter(([channel]) => channel.startsWith('perform-save'))).toHaveLength(1);
    });

    test('Save As after switching rekeys only outgoing tab and preserves incoming state', async () => {
        const { context, a, b, tm, switchToB } = setup('untitled:1');
        let finish;
        context.window.electronAPI.invoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const pending = context.saveAsFile();
        await flushQueue();
        switchToB();
        finish({ success: true, filePath: '/saved.md' });
        await pending;
        expect(a.filePath).toBe('/saved.md');
        expect(a.isDirty).toBe(false);
        expect(b.isDirty).toBe(true);
        expect(tm.activeTabPath).toBe('/b.md');
        expect(context.window.currentFilePath).toBe('/b.md');
        expect(context.lastSavedContent).toBe('other saved');
        expect(context.updateBreadcrumb).not.toHaveBeenCalled();
    });

    test('canceling Save As returns cancelled without an error notification', async () => {
        const { context, tm } = setup('untitled:1');
        context.window.electronAPI.invoke.mockResolvedValue({ success: false, cancelled: true });
        await expect(context.saveFile()).resolves.toEqual({ success: false, cancelled: true });
        expect(context.showNotification).not.toHaveBeenCalled();
        expect(tm.rekeyTab).not.toHaveBeenCalled();
    });
});

describe('manual save queued target identity', () => {
    test.each(['saveFile', 'saveAsFile'])('%s cancels if its tab was renamed while queued', async method => {
        const { context, tm } = setup();
        let release;
        context.window._editorSaveQueue = new Promise(resolve => { release = resolve; });
        const pending = context[method]();
        tm.rekeyTab('/a.md', '/renamed.md');
        release();
        await expect(pending).resolves.toEqual({ success: false, cancelled: true });
        expect(context.window.electronAPI.invoke).not.toHaveBeenCalled();
    });
});

test('forced overwrite cancels if the source tab was renamed during confirmation', async () => {
    const { context, tm } = setup();
    context.window.electronAPI.invoke.mockResolvedValueOnce({ success: false, code: 'FILE_MODIFIED_EXTERNALLY', currentMtimeMs: 123 });
    context.window.showAppConfirm.mockImplementation(async () => { tm.rekeyTab('/a.md', '/renamed.md'); return true; });
    await expect(context.saveFile()).resolves.toEqual({ success: false, cancelled: true });
    expect(context.window.electronAPI.invoke).toHaveBeenCalledTimes(1);
});

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createElectronApiMock } = require('../../helpers/electron-api-mock');
const { createCoordinator } = require('../../../orchestrator/modules/file-transition-coordinator');
const fileOpenModule = require('../../../orchestrator/modules/file-open-controller');
const { classifyFilePath } = require('../../../orchestrator/modules/preview-router');
const source = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');

function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}

test('renderer file-open wrappers keep the latest request and recover after a failed read', async () => {
    const pending = deferred();
    const bridge = createElectronApiMock(async (_channel, filePath) => {
        if (filePath === '/slow.md') return pending.promise;
        return { success: false, error: 'unavailable' };
    });
    const impl = jest.fn();
    const context = {
        _openFileInEditorImpl: impl,
        window: { NightOwlFileOpenController: fileOpenModule, electronAPI: bridge.api },
        fileTransitionCoordinator: createCoordinator(), performanceReadiness: null,
        scheduleFileTransitionStatus: jest.fn(), clearFileTransitionStatus: jest.fn(), showFileTransitionFailure: jest.fn(),
        previewRouter: {}, fileTreeController: {}, paneController: {}
    };
    vm.runInNewContext(source.slice(source.indexOf('let activeFileSwitchReadiness'), source.indexOf('async function _openFileInEditorImpl')), context);
    const first = context.openFilePathInEditor('/slow.md', { ipcChannel: 'read-file' });
    const failed = await context.openFilePathInEditor('/missing.md');
    expect(failed).toMatchObject({ status: 'failed', error: 'unavailable' });
    const latest = await context.openFileInEditor('/latest.md', 'newest content');
    expect(latest).toMatchObject({ status: 'committed', filePath: '/latest.md' });
    pending.resolve({ success: true, content: 'stale content' });
    await expect(first).resolves.toMatchObject({ status: 'superseded' });
    expect(impl).toHaveBeenCalledTimes(1);
    expect(impl).toHaveBeenCalledWith('/latest.md', 'newest content', expect.objectContaining({ transition: expect.any(Object) }));
    expect(impl.mock.calls[0][2].refreshExistingTabContent).toBeUndefined();
    expect(context.showFileTransitionFailure).toHaveBeenCalledTimes(1);
});

test('opening an image through history or recents never routes binary content into the text model', async () => {
    const context = {
        window: {}, document: { getElementById: () => null },
        isTransitionCurrent: transition => !transition || transition.isCurrent(),
        previewRouter: { classifyFilePath }, LARGE_MARKDOWN_CHAR_THRESHOLD: 250000,
        exitPDFOnlyMode: jest.fn(), setCurrentFilePathState: jest.fn(),
        highlightCurrentFileInTree: jest.fn(), updateBreadcrumb: jest.fn(),
        addToNavigationHistory: jest.fn(), addFileToRecents: jest.fn(),
        showImageViewer: jest.fn(), handleEditableFile: jest.fn(), updateAIChatContext: jest.fn()
    };
    vm.runInNewContext(source.slice(source.indexOf('async function _openFileInEditorImpl'), source.indexOf('// Layout management for PDF-only mode')), context);
    await context._openFileInEditorImpl('/images/photo.png', 'binary bytes');
    expect(context.showImageViewer).toHaveBeenCalledWith('/images/photo.png');
    expect(context.handleEditableFile).not.toHaveBeenCalled();
});

describe('PDF document transitions', () => {
    let context;
    let bridge;
    let coordinator;
    let transition;
    beforeEach(() => {
        document.getElementById = Document.prototype.getElementById;
        document.body.innerHTML = '<div id="editor-pane" style="display:none"></div><div id="resizer"></div><div id="preview-zoom-controls"></div><div id="right-pane" style="width:40%;flex:2"></div>';
        bridge = createElectronApiMock(async () => ({ exists: false }));
        coordinator = createCoordinator();
        transition = coordinator.begin('file', '/paper.pdf');
        context = {
            document, console,
            isTransitionCurrent: token => !token || token.isCurrent(),
            window: {
                currentFilePath: '/paper.pdf',
                previewZoom: { isEnabled: true },
                electronAPI: bridge.api
            },
            editor: { setValue: jest.fn() },
            clearAllHighlights: jest.fn(), clearEditor: jest.fn(),
            displayPDFInPreview: jest.fn(),
            handleEditableFile: jest.fn()
        };
        vm.runInNewContext(source.slice(source.indexOf('let pdfOnlyLayout'), source.indexOf('function getHTMLPreviewText')), context);
    });

    test('normal text opens cannot unhide an editor the user has hidden', () => {
        context.exitPDFOnlyMode();
        expect(document.getElementById('editor-pane').style.display).toBe('none');
    });

    test('PDF mode restores original pane sizes, visibility and zoom after repeated entry', () => {
        context.enterPDFOnlyMode();
        context.enterPDFOnlyMode();
        expect(context.window.previewZoom.isEnabled).toBe(false);
        context.exitPDFOnlyMode();
        expect(document.getElementById('editor-pane').style.display).toBe('none');
        expect(document.getElementById('right-pane').style.width).toBe('40%');
        expect(document.getElementById('right-pane').style.flex).toBe('2');
        expect(context.window.previewZoom.isEnabled).toBe(true);
    });

    test('opening a PDF without a companion leaves the existing document model untouched', async () => {
        await context.handlePDFFile('/paper.pdf', transition);
        expect(context.editor.setValue).not.toHaveBeenCalled();
        expect(context.clearEditor).not.toHaveBeenCalled();
        expect(context.handleEditableFile).not.toHaveBeenCalled();
        expect(context.displayPDFInPreview).toHaveBeenCalledWith('/paper.pdf', transition);
    });

    test('a failed companion lookup cannot clear the existing document model', async () => {
        bridge.invoke.mockRejectedValueOnce(new Error('Read denied'));
        await context.handlePDFFile('/paper.pdf', transition);
        expect(context.clearEditor).not.toHaveBeenCalled();
        expect(context.editor.setValue).not.toHaveBeenCalled();
        expect(context.displayPDFInPreview).toHaveBeenCalledWith('/paper.pdf', transition);
    });

    test('a slow PDF lookup cannot reopen its pane after a newer document transition', async () => {
        const pending = deferred();
        bridge.invoke.mockReturnValueOnce(pending.promise);
        const open = context.handlePDFFile('/paper.pdf', transition);
        coordinator.begin('file', '/new.md');
        context.window.currentFilePath = '/new.md';
        context.exitPDFOnlyMode();
        pending.resolve({ exists: true });
        await open;
        expect(context.displayPDFInPreview).not.toHaveBeenCalled();
        expect(bridge.invoke).toHaveBeenCalledTimes(1);
    });

    test('a companion markdown document activates its existing unsaved tab without replacing its model', async () => {
        bridge.invoke.mockResolvedValueOnce({ exists: true });
        context.window.tabManager = { hasTab: jest.fn(() => true), createTab: jest.fn(), activateTab: jest.fn() };
        await context.handlePDFFile('/paper.pdf', transition);
        expect(context.window.tabManager.activateTab).toHaveBeenCalledWith('/paper.md', { suppressPreviewUpdate: true });
        expect(context.window.tabManager.createTab).not.toHaveBeenCalled();
        expect(context.handleEditableFile).not.toHaveBeenCalled();
        expect(context.editor.setValue).not.toHaveBeenCalled();
        expect(bridge.invoke).toHaveBeenCalledTimes(1);
    });

    test('a new companion uses its own tab rather than overwriting the current model', async () => {
        bridge.invoke.mockResolvedValueOnce({ exists: true }).mockResolvedValueOnce({ success: true, content: 'companion text' });
        context.window.tabManager = { hasTab: jest.fn(() => false), createTab: jest.fn(), activateTab: jest.fn() };
        await context.handlePDFFile('/paper.pdf', transition);
        expect(context.window.tabManager.createTab).toHaveBeenCalledWith('/paper.md', 'companion text');
        expect(context.window.tabManager.activateTab).toHaveBeenCalledWith('/paper.md', { suppressPreviewUpdate: true });
        expect(context.handleEditableFile).not.toHaveBeenCalled();
        expect(context.editor.setValue).not.toHaveBeenCalled();
    });
});

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../../../orchestrator/renderer.js'), 'utf8');

function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}

test('file opens finish model/path transitions in request order and survive a rejected open', async () => {
    const pending = deferred();
    const impl = jest.fn().mockImplementationOnce(() => pending.promise)
        .mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce('third');
    const context = { _openFileInEditorImpl: impl };
    vm.runInNewContext(source.slice(source.indexOf('let _fileOpenQueue'), source.indexOf('async function _openFileInEditorImpl')), context);
    const first = context.openFileInEditor('/one.md', 'one');
    const second = context.openFileInEditor('/two.md', 'two').catch(error => error.message);
    const third = context.openFileInEditor('/one.md', 'stale disk content');
    await Promise.resolve();
    expect(impl).toHaveBeenCalledTimes(1);
    pending.resolve('first');
    expect(await first).toBe('first');
    expect(await second).toBe('unavailable');
    expect(await third).toBe('third');
    expect(impl.mock.calls.map(call => call[0])).toEqual(['/one.md', '/two.md', '/one.md']);
    expect(impl.mock.calls[2][2]).toEqual({}); // Reopening never forces away unsaved edits.
});

test('opening an image through history or recents never routes binary content into the text model', async () => {
    const context = {
        window: {}, document: { getElementById: () => null },
        isHTMLFilePath: () => false,
        exitPDFOnlyMode: jest.fn(), setCurrentFilePathState: jest.fn(),
        highlightCurrentFileInTree: jest.fn(), updateBreadcrumb: jest.fn(),
        addToNavigationHistory: jest.fn(), addFileToRecents: jest.fn(),
        showImageViewer: jest.fn(), handleEditableFile: jest.fn()
    };
    vm.runInNewContext(source.slice(source.indexOf('async function _openFileInEditorImpl'), source.indexOf('// Layout management for PDF-only mode')), context);
    await context._openFileInEditorImpl('/images/photo.png', 'binary bytes');
    expect(context.showImageViewer).toHaveBeenCalledWith('/images/photo.png');
    expect(context.handleEditableFile).not.toHaveBeenCalled();
});

describe('PDF document transitions', () => {
    let context;
    beforeEach(() => {
        document.getElementById = Document.prototype.getElementById;
        document.body.innerHTML = '<div id="editor-pane" style="display:none"></div><div id="resizer"></div><div id="preview-zoom-controls"></div><div id="right-pane" style="width:40%;flex:2"></div>';
        context = {
            document, console,
            window: {
                currentFilePath: '/paper.pdf',
                previewZoom: { isEnabled: true },
                electronAPI: { invoke: jest.fn().mockResolvedValue({ exists: false }) }
            },
            editor: { setValue: jest.fn() },
            clearAllHighlights: jest.fn(),
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
        await context.handlePDFFile('/paper.pdf');
        expect(context.editor.setValue).not.toHaveBeenCalled();
        expect(context.handleEditableFile).not.toHaveBeenCalled();
        expect(context.displayPDFInPreview).toHaveBeenCalledWith('/paper.pdf');
    });

    test('a slow PDF lookup cannot reopen its pane after the user changes tabs', async () => {
        const pending = deferred();
        context.window.electronAPI.invoke.mockReturnValueOnce(pending.promise);
        const open = context.handlePDFFile('/paper.pdf');
        context.window.currentFilePath = '/new.md';
        context.exitPDFOnlyMode();
        pending.resolve({ exists: true });
        await open;
        expect(context.displayPDFInPreview).not.toHaveBeenCalled();
        expect(context.window.electronAPI.invoke).toHaveBeenCalledTimes(1);
    });

    test('a companion markdown document activates its existing unsaved tab without replacing its model', async () => {
        context.window.electronAPI.invoke.mockResolvedValueOnce({ exists: true })
            .mockResolvedValueOnce({ success: true, content: 'old disk content' });
        context.window.tabManager = { hasTab: jest.fn(() => true), createTab: jest.fn(), activateTab: jest.fn() };
        await context.handlePDFFile('/paper.pdf');
        expect(context.window.tabManager.activateTab).toHaveBeenCalledWith('/paper.md');
        expect(context.window.tabManager.createTab).not.toHaveBeenCalled();
        expect(context.handleEditableFile).not.toHaveBeenCalled();
        expect(context.editor.setValue).not.toHaveBeenCalled();
    });
});

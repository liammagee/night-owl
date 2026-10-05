const fs = require('fs');
const path = require('path');
const vm = require('vm');
const renderer = fs.readFileSync(path.resolve(__dirname, '../../../orchestrator/renderer.js'), 'utf8');
const source = renderer.slice(renderer.indexOf('async function copyOrMoveSlidesToFile('), renderer.indexOf('// --- Footnote Management Panel ---'));

function setup() {
    document.body.innerHTML = '';
    let content = '# Source';
    let model = { getValue: () => content };
    const invoke = jest.fn(async channel => {
        if (channel === 'get-markdown-files') return { success: true, files: ['/target.md'] };
        if (channel === 'read-file-content-only') return { success: true, content: '# Target' };
        return { success: true };
    });
    const context = { document, console, showNotification: jest.fn(), deleteSlides: jest.fn(),
        window: { editor: { getModel: () => model }, currentFilePath: '/source.md',
            tabManager: { tabs: new Map() }, electronAPI: { invoke } } };
    context.window.electronAPI.files = {
        getMarkdownFiles: (...args) => invoke('get-markdown-files', ...args),
        readFileContentOnly: (...args) => invoke('read-file-content-only', ...args),
        performSaveWithPath: (...args) => invoke('perform-save-with-path', ...args)
    };
    vm.runInNewContext(source, context);
    return { context, invoke, edit: value => { content = value; }, switchFile: () => { model = { getValue: () => '# Other' }; } };
}
async function selectDestination(context) {
    await context.copyOrMoveSlidesToFile(new Set([0]), ['# Source'], true);
    document.querySelector('.slide-file-picker span').parentElement.click();
    for (let i = 0; i < 12; i++) await Promise.resolve();
}

test.each(['read-file-content-only', 'perform-save-with-path'])('failed %s preserves source slides and reports no success', async failure => {
    const { context, invoke } = setup();
    const normal = invoke.getMockImplementation();
    invoke.mockImplementation(channel => channel === failure ? Promise.resolve({ success: false, error: 'disk unavailable' }) : normal(channel));
    await selectDestination(context);
    expect(context.deleteSlides).not.toHaveBeenCalled();
    expect(context.showNotification.mock.calls.some(([message]) => message.startsWith('Moved'))).toBe(false);
});

test('a successful destination write precedes source deletion and carries the disk baseline', async () => {
    const { context, invoke } = setup();
    await selectDestination(context);
    expect(invoke).toHaveBeenCalledWith('perform-save-with-path', '# Target\n\n---\n\n# Source', '/target.md', { expectedContent: '# Target' });
    expect([...context.deleteSlides.mock.calls[0][0]]).toEqual([0]);
});

test.each(['switch', 'edit'])('%s while the picker is open keeps the source intact', async action => {
    const { context, switchFile, edit } = setup();
    await context.copyOrMoveSlidesToFile(new Set([0]), ['# Source'], true);
    if (action === 'switch') switchFile(); else edit('# New source');
    document.querySelector('.slide-file-picker span').parentElement.click();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(context.deleteSlides).not.toHaveBeenCalled();
    expect(context.showNotification).toHaveBeenCalledWith(expect.stringContaining('source changed'), 'warning');
});

test('unsaved destination buffers are never overwritten by slide transfers', async () => {
    const { context, invoke } = setup();
    context.window.tabManager.tabs.set('/target.md', { isDirty: true });
    expect(await context.appendSlidesToFile('/target.md', ['# Source'])).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
});

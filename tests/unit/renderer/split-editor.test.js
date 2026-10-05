const path = require('path');
const { createElectronApiMock } = require('../../helpers/electron-api-mock');

const modulePath = path.resolve(__dirname, '../../../orchestrator/modules/split-editor.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function createModel(initialContent) {
  let content = initialContent;
  let onChange;
  const subscription = { dispose: jest.fn(() => { onChange = null; }) };
  return {
    getValue: jest.fn(() => content),
    setValue: jest.fn(value => { content = value; onChange?.(); }),
    edit(value) { content = value; onChange?.(); },
    dispose: jest.fn(),
    onDidChangeContent: jest.fn((callback) => { onChange = callback; return subscription; }),
    subscription
  };
}

describe('split editor file and pane lifecycle', () => {
  let split;
  let secondEditor;
  let invoke;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    document.getElementById = Document.prototype.getElementById;
    document.body.innerHTML = '<div id="panes-container"><div id="editor-pane" style="flex:2; width:40%"></div><div id="resizer"></div><div id="right-pane"></div></div>';
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    secondEditor = { setModel: jest.fn(), updateOptions: jest.fn(), dispose: jest.fn(), layout: jest.fn() };
    window.tabManager = { tabs: new Map() };
    window.currentFilePath = null;
    window.registerCommand = jest.fn();
    window.monaco = { editor: { create: jest.fn(() => secondEditor), createModel: jest.fn(createModel) } };
    const electronBridge = createElectronApiMock((channel, value) => Promise.resolve(channel === 'read-file'
      ? { success: true, content: `content:${value}` }
      : { success: true }));
    invoke = electronBridge.invoke;
    window.electronAPI = electronBridge.api;
    window.editor = { layout: jest.fn() };
    window.showNotification = jest.fn();
    require(modulePath);
    split = window.splitEditor;
  });

  afterEach(async () => {
    invoke.mockImplementation(() => Promise.resolve({ success: true }));
    window.tabManager.tabs.clear();
    await split.deactivate();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function model() {
    return window.monaco.editor.createModel.mock.results.at(-1).value;
  }

  function command(id) {
    return window.registerCommand.mock.calls.find(([commandId]) => commandId === id)[2];
  }

  test('registers both split commands through the real command API', () => {
    expect(window.registerCommand).toHaveBeenCalledWith('view.splitEditor', 'View: Toggle Split Editor', expect.any(Function));
    expect(window.registerCommand).toHaveBeenCalledWith('view.openCurrentInSplit', 'View: Open Current File in Split', expect.any(Function));
    expect(window.registerCommand).toHaveBeenCalledTimes(2);
  });

  test('toggle command mirrors the current untitled draft instead of creating an empty pane', async () => {
    const draft = createModel('unsaved untitled draft');
    window.tabManager.tabs.set('untitled:1', { model: draft });
    window.tabManager.activeTabPath = 'untitled:1';
    expect(await command('view.splitEditor')()).toBe(true);
    expect(model().getValue()).toBe('unsaved untitled draft');
    expect(secondEditor.updateOptions).toHaveBeenLastCalledWith({ readOnly: true, domReadOnly: true });
    expect(invoke).not.toHaveBeenCalled();
    expect(await command('view.splitEditor')()).toBe(true);
    expect(split.isActive()).toBe(false);
    expect(draft.dispose).not.toHaveBeenCalled();
  });

  test('split commands notify without opening a pane when there is no current buffer', async () => {
    expect(await command('view.splitEditor')()).toBe(false);
    expect(await command('view.openCurrentInSplit')()).toBe(false);
    expect(split.isActive()).toBe(false);
    expect(document.getElementById('editor-pane-2')).toBeNull();
    expect(window.showNotification).toHaveBeenCalledWith(expect.stringContaining('Open a file or draft'), 'info');
  });

  test('open current command loads the current path when no tab manager buffer owns it', async () => {
    window.currentFilePath = '/current.md';
    expect(await command('view.openCurrentInSplit')()).toBe(true);
    expect(invoke).toHaveBeenCalledWith('read-file', '/current.md');
    expect(model().getValue()).toBe('content:/current.md');
  });

  test('does not create a blank pane when reading a file fails', async () => {
    invoke.mockResolvedValue({ success: false, error: 'File not found' });
    expect(await split.openInSplit('/missing.md')).toBe(false);
    expect(split.isActive()).toBe(false);
    expect(document.getElementById('editor-pane-2')).toBeNull();
    expect(window.monaco.editor.create).not.toHaveBeenCalled();
    expect(window.showNotification).toHaveBeenCalledWith(expect.stringContaining('File not found'), 'error');
  });

  test('keeps the existing file and pane when the next file cannot be read', async () => {
    await split.openInSplit('/existing.md');
    const existing = model();
    invoke.mockResolvedValue({ success: false, error: 'Access denied' });
    expect(await split.openInSplit('/missing.md')).toBe(false);
    expect(existing.dispose).not.toHaveBeenCalled();
    expect(secondEditor.setModel).toHaveBeenLastCalledWith(existing);
    expect(document.getElementById('split-editor-filename').textContent).toBe('existing.md');
  });

  test('does not create a pane until its first read has completed', async () => {
    const read = deferred();
    invoke.mockReturnValue(read.promise);
    const opening = split.openInSplit('/file.md');
    expect(split.isActive()).toBe(false);
    expect(document.getElementById('editor-pane-2')).toBeNull();
    read.resolve({ success: true, content: '' });
    expect(await opening).toBe(true);
    expect(split.isActive()).toBe(true);
    expect(model().getValue()).toBe('');
    expect(window.monaco.editor.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ model: null }));
  });

  test('last requested file wins when reads complete out of order', async () => {
    const firstRead = deferred();
    const secondRead = deferred();
    invoke.mockImplementation((channel, filePath) => filePath === '/first.md' ? firstRead.promise : secondRead.promise);
    const first = split.openInSplit('/first.md');
    const second = split.openInSplit('/second.md');
    secondRead.resolve({ success: true, content: 'second' });
    expect(await second).toBe(true);
    firstRead.resolve({ success: true, content: 'first' });
    expect(await first).toBe(false);
    expect(model().getValue()).toBe('second');
    expect(window.monaco.editor.createModel).toHaveBeenCalledTimes(1);
  });

  test('closing cancels a read that would otherwise reopen the split', async () => {
    const read = deferred();
    invoke.mockReturnValue(read.promise);
    const opening = split.openInSplit('/file.md');
    await split.deactivate();
    read.resolve({ success: true, content: 'file' });
    expect(await opening).toBe(false);
    expect(split.isActive()).toBe(false);
  });

  test('reopening the same file preserves its pending edits instead of rereading stale disk content', async () => {
    await split.openInSplit('/first.md');
    const first = model();
    first.edit('pending changes');
    expect(await split.openInSplit('/first.md')).toBe(true);
    expect(window.monaco.editor.createModel).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls.filter(([channel]) => channel === 'read-file')).toHaveLength(1);
    expect(first.getValue()).toBe('pending changes');
    expect(first.dispose).not.toHaveBeenCalled();
    expect(split.hasUnsavedChanges()).toBe(true);
  });

  test('flushes an edited file to its own path before changing split files', async () => {
    await split.openInSplit('/first.md');
    const first = model();
    first.edit('edited first');
    expect(split.hasUnsavedChanges()).toBe(true);
    await split.openInSplit('/second.md');
    expect(invoke).toHaveBeenCalledWith('perform-save-with-path', 'edited first', '/first.md', { expectedContent: 'content:/first.md' });
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(first.subscription.dispose).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2500);
    expect(invoke.mock.calls.filter(([channel]) => channel === 'perform-save-with-path')).toHaveLength(1);
    expect(split.hasUnsavedChanges()).toBe(false);
  });

  test('flushes edits before closing and leaves no stale model timer', async () => {
    await split.openInSplit('/first.md');
    const first = model();
    first.edit('final edit');
    expect(await split.deactivate()).toBe(true);
    expect(invoke).toHaveBeenCalledWith('perform-save-with-path', 'final edit', '/first.md', { expectedContent: 'content:/first.md' });
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(secondEditor.dispose).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(2500);
    expect(invoke.mock.calls.filter(([channel]) => channel === 'perform-save-with-path')).toHaveLength(1);
    expect(split.isActive()).toBe(false);
  });

  test('keeps unsaved edits open if a save fails, and allows a later retry', async () => {
    await split.openInSplit('/first.md');
    const first = model();
    first.edit('unsaved');
    invoke.mockResolvedValue({ success: false, error: 'Disk full' });
    expect(await split.deactivate()).toBe(false);
    expect(first.dispose).not.toHaveBeenCalled();
    expect(split.isActive()).toBe(true);
    expect(split.hasUnsavedChanges()).toBe(true);
    expect(await split.flushPendingSave()).toBe(false);
    invoke.mockResolvedValue({ success: true });
    expect(await split.flushPendingSave()).toBe(true);
    expect(split.hasUnsavedChanges()).toBe(false);
  });

  test('serializes autosaves and includes edits made while an earlier save is pending', async () => {
    await split.openInSplit('/first.md');
    const firstSave = deferred();
    invoke.mockImplementation((channel) => channel === 'perform-save-with-path' ? firstSave.promise : Promise.resolve({ success: true, content: '' }));
    model().edit('first edit');
    await jest.advanceTimersByTimeAsync(2000);
    model().edit('second edit');
    await jest.advanceTimersByTimeAsync(2000);
    expect(invoke.mock.calls.filter(([channel]) => channel === 'perform-save-with-path')).toHaveLength(1);
    invoke.mockResolvedValue({ success: true });
    firstSave.resolve({ success: true });
    await split.flushPendingSave();
    expect(invoke.mock.calls.filter(([channel]) => channel === 'perform-save-with-path')).toEqual([
      ['perform-save-with-path', 'first edit', '/first.md', { expectedContent: 'content:/first.md' }],
      ['perform-save-with-path', 'second edit', '/first.md', { expectedContent: 'first edit' }]
    ]);
    expect(split.hasUnsavedChanges()).toBe(false);
  });

  test('restores original sizing and ends an active resize when closing', async () => {
    split.activate();
    const left = document.getElementById('editor-pane');
    const right = document.getElementById('editor-pane-2');
    left.getBoundingClientRect = () => ({ width: 300 });
    right.getBoundingClientRect = () => ({ width: 300 });
    document.body.style.cursor = 'text';
    document.getElementById('split-editor-resizer').dispatchEvent(new MouseEvent('mousedown', { clientX: 300, button: 0 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 350 }));
    expect(left.style.width).toBe('350px');
    await split.deactivate();
    expect(left.style.flex).toBe('2');
    expect(left.style.width).toBe('40%');
    expect(document.body.style.cursor).toBe('text');
    expect(document.body.style.userSelect).toBe('');
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 400 }));
    expect(left.style.width).toBe('40%');
  });

  test('rolls back inserted panes and styles if Monaco cannot create an editor', async () => {
    window.monaco.editor.create.mockImplementation(() => { throw new Error('Editor initialization failed'); });
    expect(await split.openInSplit('/first.md')).toBe(false);
    expect(model().dispose).toHaveBeenCalledTimes(1);
    expect(document.getElementById('editor-pane-2')).toBeNull();
    expect(document.getElementById('split-editor-resizer')).toBeNull();
    expect(document.getElementById('editor-pane').style.width).toBe('40%');
    expect(split.isActive()).toBe(false);
  });

  test('mirrors an already open primary draft read-only without reading or saving stale disk text', async () => {
    const primaryModel = createModel('unsaved primary draft');
    const tab = { filePath: '/primary.md', model: primaryModel, isDirty: true };
    window.tabManager.tabs.set('/primary.md', tab);
    expect(await split.openInSplit('/primary.md')).toBe(true);
    const clone = model();
    expect(clone).not.toBe(primaryModel);
    expect(clone.getValue()).toBe('unsaved primary draft');
    expect(secondEditor.updateOptions).toHaveBeenLastCalledWith({ readOnly: true, domReadOnly: true });
    expect(document.getElementById('split-editor-filename').textContent).toBe('primary.md (read-only)');
    expect(invoke).not.toHaveBeenCalled();
    primaryModel.edit('new primary draft');
    expect(clone.getValue()).toBe('new primary draft');
    expect(split.hasUnsavedChanges()).toBe(false);
    expect(await split.flushPendingSave()).toBe(true);
    await jest.advanceTimersByTimeAsync(2500);
    expect(invoke).not.toHaveBeenCalled();
    expect(tab.isDirty).toBe(true);
    await split.deactivate();
    expect(primaryModel.dispose).not.toHaveBeenCalled();
    expect(primaryModel.subscription.dispose).toHaveBeenCalledTimes(1);
    expect(clone.dispose).toHaveBeenCalledTimes(1);
  });

  test('retains independent split edits when a primary tab subsequently acquires the same path', async () => {
    await split.openInSplit('/shared.md');
    const draft = model();
    draft.edit('split edits');
    const primaryModel = createModel('primary edits');
    window.tabManager.tabs.set('/shared.md', { model: primaryModel, isDirty: true });
    expect(await split.flushPendingSave()).toBe(false);
    expect(invoke.mock.calls.filter(([channel]) => channel === 'perform-save-with-path')).toHaveLength(0);
    expect(draft.getValue()).toBe('split edits');
    expect(primaryModel.getValue()).toBe('primary edits');
    expect(split.hasUnsavedChanges()).toBe(true);
    expect(await split.deactivate()).toBe(false);
    expect(draft.dispose).not.toHaveBeenCalled();
    expect(window.showNotification).toHaveBeenCalledWith(expect.stringContaining('split edits are preserved'), 'error');
    window.tabManager.tabs.delete('/shared.md');
    expect(await split.flushPendingSave()).toBe(true);
    expect(invoke).toHaveBeenCalledWith('perform-save-with-path', 'split edits', '/shared.md', { expectedContent: 'content:/shared.md' });
  });

  test('primary ownership acquired during a read wins over the stale disk result', async () => {
    const read = deferred();
    invoke.mockReturnValue(read.promise);
    const opening = split.openInSplit('/shared.md');
    window.tabManager.tabs.set('/shared.md', { model: createModel('new primary draft'), isDirty: true });
    read.resolve({ success: true, content: 'old disk text' });
    expect(await opening).toBe(true);
    expect(model().getValue()).toBe('new primary draft');
    expect(secondEditor.updateOptions).toHaveBeenLastCalledWith({ readOnly: true, domReadOnly: true });
  });

  test('switching from a mirrored primary file to an independent file restores editing', async () => {
    const primary = createModel('primary');
    window.tabManager.tabs.set('/primary.md', { model: primary });
    await split.openInSplit('/primary.md');
    await split.openInSplit('/independent.md');
    expect(primary.subscription.dispose).toHaveBeenCalledTimes(1);
    expect(secondEditor.updateOptions).toHaveBeenLastCalledWith({ readOnly: false, domReadOnly: false });
    expect(document.getElementById('split-editor-filename').textContent).toBe('independent.md');
    model().edit('independent edits');
    expect(await split.flushPendingSave()).toBe(true);
    expect(invoke).toHaveBeenCalledWith('perform-save-with-path', 'independent edits', '/independent.md', { expectedContent: 'content:/independent.md' });
  });

});

const { unsavedNames, saveBeforeClose } = require('../../../orchestrator/modules/window-close');

function createTab(filePath, content, isDirty = true) {
  return {
    filePath,
    fileName: filePath.split('/').pop(),
    isDirty,
    lastSavedContent: 'previously saved',
    model: {
      getValue: () => content,
      setValue: (nextContent) => { content = nextContent; }
    }
  };
}

function createHost(tabs = [], activeTabPath = tabs[0]?.filePath) {
  const manager = {
    tabs: new Map(tabs.map(tab => [tab.filePath, tab])),
    activeTabPath,
    _renderTabBar: jest.fn(),
    _persistRecovery: jest.fn().mockResolvedValue(),
    activateTab: jest.fn(),
    rekeyTab: jest.fn((oldPath, newPath) => {
      const tab = manager.tabs.get(oldPath);
      tab.filePath = newPath;
      tab.fileName = newPath.split('/').pop();
      manager.tabs.delete(oldPath);
      manager.tabs.set(newPath, tab);
      if (manager.activeTabPath === oldPath) manager.activeTabPath = newPath;
    }),
    syncActiveTabDirty: jest.fn((isDirty, savedContent) => {
      const tab = manager.tabs.get(manager.activeTabPath);
      tab.isDirty = isDirty;
      tab.lastSavedContent = savedContent;
    })
  };
  return {
    tabManager: manager,
    electronAPI: { invoke: jest.fn().mockResolvedValue({ success: true }) },
    hasUnsavedChanges: Boolean(manager.tabs.get(activeTabPath)?.isDirty),
    _setLastSavedContent: jest.fn(),
    updateUnsavedIndicator: jest.fn()
  };
}

function pendingSave(host) {
  let complete;
  host.electronAPI.invoke.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const saving = saveBeforeClose(host);
  return { saving, complete: (result = { success: true }) => complete(result) };
}

describe('window close save workflow', () => {
  test('a dirty startup scratch buffer is saved before acquiring the tab save queue', async () => {
    const host = createHost();
    host.hasUnsavedChanges = true;
    let queued = false;
    host.enqueueEditorSave = jest.fn(async operation => {
      expect(queued).toBe(false);
      queued = true;
      try { return await operation(); } finally { queued = false; }
    });
    host.saveFile = jest.fn(() => host.enqueueEditorSave(async () => {
      host.hasUnsavedChanges = false;
      return { success: true };
    }));
    expect(unsavedNames(host)).toEqual(['current file']);
    expect(await saveBeforeClose(host)).toBe(true);
    expect(host.saveFile).toHaveBeenCalledTimes(1);
  });

  test('canceling scratch Save As keeps the window open', async () => {
    const host = createHost();
    host.hasUnsavedChanges = true;
    host.saveFile = jest.fn().mockResolvedValue({ success: false, cancelled: true });
    expect(await saveBeforeClose(host)).toBe(false);
    expect(host.hasUnsavedChanges).toBe(true);
  });

  test('includes inactive, untitled, deleted-on-disk, and split dirty buffers in the close prompt', () => {
    const tabs = [
      createTab('/notes/active.md', 'clean', false),
      createTab('/notes/deleted.md', 'unsaved deleted document'),
      createTab('untitled:1', 'new document')
    ];
    const host = createHost(tabs);
    host.splitEditor = { hasUnsavedChanges: () => true };

    expect(unsavedNames(host)).toEqual(['deleted.md', 'untitled:1', 'split editor']);
  });

  test('saves the inactive dirty tab buffer without changing or saving the active clean tab', async () => {
    const active = createTab('/notes/active.md', 'active content', false);
    const inactive = createTab('/notes/inactive.md', 'inactive content');
    const host = createHost([active, inactive]);

    expect(await saveBeforeClose(host)).toBe(true);
    expect(host.electronAPI.invoke).toHaveBeenCalledTimes(1);
    expect(host.electronAPI.invoke).toHaveBeenCalledWith('perform-save-with-path', 'inactive content', '/notes/inactive.md', { expectedContent: 'previously saved' });
    expect(inactive.isDirty).toBe(false);
    expect(inactive.lastSavedContent).toBe('inactive content');
    expect(host.tabManager.activeTabPath).toBe('/notes/active.md');
    expect(host.tabManager.activateTab).not.toHaveBeenCalled();
    expect(host.tabManager.syncActiveTabDirty).not.toHaveBeenCalled();
    expect(host.tabManager._persistRecovery).toHaveBeenCalledTimes(1);
  });

  test('successful active-tab save synchronizes its dirty indicator and baseline', async () => {
    const active = createTab('/notes/active.md', 'active content');
    const host = createHost([active]);

    expect(await saveBeforeClose(host)).toBe(true);
    expect(host.tabManager.syncActiveTabDirty).toHaveBeenCalledWith(false, 'active content');
    expect(host._setLastSavedContent).toHaveBeenCalledWith('active content');
    expect(host.updateUnsavedIndicator).toHaveBeenCalledWith(false);
    expect(host.hasUnsavedChanges).toBe(false);
  });

  test('cancelling untitled Save As keeps its buffer and the window open', async () => {
    const untitled = createTab('untitled:1', 'new content');
    const host = createHost([untitled]);
    host.electronAPI.invoke.mockResolvedValue({ success: false, cancelled: true });

    expect(await saveBeforeClose(host)).toBe(false);
    expect(host.electronAPI.invoke).toHaveBeenCalledWith('perform-save-as', expect.objectContaining({ content: 'new content' }));
    expect(host.tabManager.tabs.get('untitled:1')).toBe(untitled);
    expect(untitled.isDirty).toBe(true);
    expect(host.tabManager.rekeyTab).not.toHaveBeenCalled();
  });

  test('successful untitled Save As retains the model under its selected path', async () => {
    const untitled = createTab('untitled:1', 'new content');
    const originalModel = untitled.model;
    const host = createHost([untitled]);
    host.electronAPI.invoke.mockResolvedValue({ success: true, filePath: '/notes/saved.md' });

    expect(await saveBeforeClose(host)).toBe(true);
    expect(host.tabManager.tabs.has('untitled:1')).toBe(false);
    expect(host.tabManager.tabs.get('/notes/saved.md')).toBe(untitled);
    expect(untitled.model).toBe(originalModel);
    expect(untitled.isDirty).toBe(false);
    expect(host.tabManager.activateTab).toHaveBeenCalledWith('/notes/saved.md');
  });

  test('save conflict keeps the failing and later buffers dirty and stops closing', async () => {
    const first = createTab('/notes/first.md', 'first edits');
    const second = createTab('/notes/second.md', 'second edits');
    const host = createHost([first, second]);
    host.electronAPI.invoke.mockResolvedValue({ success: false, code: 'FILE_MODIFIED_EXTERNALLY' });

    expect(await saveBeforeClose(host)).toBe(false);
    expect(host.electronAPI.invoke).toHaveBeenCalledTimes(1);
    expect(first.isDirty).toBe(true);
    expect(second.isDirty).toBe(true);
    expect(first.lastSavedContent).toBe('previously saved');
  });

  test('edits made during a save remain dirty and prevent closing', async () => {
    const tab = createTab('/notes/draft.md', 'content sent to disk');
    const host = createHost([tab]);
    const { saving, complete } = pendingSave(host);
    tab.model.setValue('new edits made during the save');
    complete();

    expect(await saving).toBe(false);
    expect(tab.lastSavedContent).toBe('content sent to disk');
    expect(tab.model.getValue()).toBe('new edits made during the save');
    expect(tab.isDirty).toBe(true);
    expect(host.hasUnsavedChanges).toBe(true);
  });

  test('a dirty tab opened during saving prevents closing without losing its content', async () => {
    const tab = createTab('/notes/draft.md', 'content sent to disk');
    const host = createHost([tab]);
    const { saving, complete } = pendingSave(host);
    const newTab = createTab('untitled:2', 'new unsaved work');
    host.tabManager.tabs.set(newTab.filePath, newTab);
    complete();

    expect(await saving).toBe(false);
    expect(newTab.isDirty).toBe(true);
    expect(newTab.model.getValue()).toBe('new unsaved work');
  });

  test('a replaced tab cannot be marked saved by an older request', async () => {
    const tab = createTab('/notes/draft.md', 'content sent to disk');
    const host = createHost([tab]);
    const { saving, complete } = pendingSave(host);
    const replacement = createTab(tab.filePath, 'replacement work');
    host.tabManager.tabs.set(tab.filePath, replacement);
    complete();

    expect(await saving).toBe(false);
    expect(replacement.isDirty).toBe(true);
    expect(replacement.lastSavedContent).toBe('previously saved');
  });

  test('a failed split-buffer flush prevents closing', async () => {
    const host = createHost();
    host.splitEditor = {
      hasUnsavedChanges: () => true,
      flushPendingSave: jest.fn().mockResolvedValue(false)
    };

    expect(await saveBeforeClose(host)).toBe(false);
    expect(host.splitEditor.flushPendingSave).toHaveBeenCalledTimes(1);
  });

  test('a rejected write leaves dirty state intact for the caller error handler', async () => {
    const tab = createTab('/notes/draft.md', 'unsaved work');
    const host = createHost([tab]);
    host.electronAPI.invoke.mockRejectedValue(new Error('disk unavailable'));

    await expect(saveBeforeClose(host)).rejects.toThrow('disk unavailable');
    expect(tab.isDirty).toBe(true);
    expect(tab.lastSavedContent).toBe('previously saved');
  });

  test('fallback without a tab manager checks whether saveFile actually cleared dirty state', async () => {
    const host = { hasUnsavedChanges: true, saveFile: jest.fn().mockResolvedValue() };
    expect(await saveBeforeClose(host)).toBe(false);
    host.saveFile.mockImplementation(async () => { host.hasUnsavedChanges = false; });
    expect(await saveBeforeClose(host)).toBe(true);
  });

  test('fallback without a tab manager does not nest the save queue inside itself', async () => {
    let runningSave = false;
    const host = {
      hasUnsavedChanges: true,
      enqueueEditorSave: jest.fn(async (save) => {
        if (runningSave) throw new Error('Save queue reentry would deadlock');
        runningSave = true;
        try {
          return await save();
        } finally {
          runningSave = false;
        }
      })
    };
    host.saveFile = () => host.enqueueEditorSave(async () => { host.hasUnsavedChanges = false; });

    expect(await saveBeforeClose(host)).toBe(true);
    expect(host.enqueueEditorSave).toHaveBeenCalledTimes(1);
  });
});

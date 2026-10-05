const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAutosaveModule(overrides = {}) {
  const model = overrides.model || { id: 'active-model', getValue: jest.fn(() => 'changed') };
  const activeTab = overrides.activeTab || {
    filePath: '/project/doc.md',
    model,
    lastSavedContent: 'saved',
    isDirty: true
  };

  const context = {
    console: {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    },
    setTimeout: jest.fn(() => 1),
    clearTimeout: jest.fn(),
    autoSaveTimer: null,
    lastSavedContent: 'saved',
    editor: {
      getValue: jest.fn(() => 'changed'),
      getModel: jest.fn(() => model)
    },
    updateUnsavedIndicator: jest.fn(),
    showNotification: jest.fn(),
    window: {
      appSettings: {
        autoSave: {
          enabled: true,
          interval: 1000
        }
      },
      currentFilePath: activeTab.filePath,
      hasUnsavedChanges: true,
      tabManager: {
        activeTabPath: activeTab.filePath,
        tabs: new Map([[activeTab.filePath, activeTab]])
      },
      electronAPI: {
        files: {
          performSaveWithPath: jest.fn(async () => ({ success: true }))
        }
      }
    },
    ...overrides.context
  };
  context.window.window = context.window;

  const source = fs.readFileSync(
    path.join(__dirname, '../../../orchestrator/modules/autosave.js'),
    'utf8'
  );
  vm.runInNewContext(source, context);

  return { context, activeTab, model };
}

describe('autosave module', () => {
  test('saves the active tab model to the active tab path', async () => {
    const { context, activeTab } = loadAutosaveModule();

    await context.window.performAutoSave();

    expect(context.window.electronAPI.files.performSaveWithPath).toHaveBeenCalledWith(
      'changed',
      '/project/doc.md',
      { expectedContent: 'saved' }
    );
    expect(activeTab.lastSavedContent).toBe('changed');
    expect(activeTab.isDirty).toBe(false);
    expect(context.window.hasUnsavedChanges).toBe(false);
    expect(context.console.log).toHaveBeenCalledWith(
      '[performAutoSave] Save attempt',
      expect.objectContaining({
        path: '/project/doc.md',
        byteLength: 'changed'.length,
        modelMatchedPath: true,
        status: 'saved'
      })
    );
  });

  test('logs structured save attempts even when autosave skips', async () => {
    const { context } = loadAutosaveModule({
      context: {
        window: {
          appSettings: {
            autoSave: {
              enabled: true,
              interval: 1000
            }
          },
          currentFilePath: '/project/doc.md',
          hasUnsavedChanges: false,
          tabManager: {
            activeTabPath: '/project/doc.md',
            tabs: new Map()
          },
          electronAPI: {
            files: {
              performSaveWithPath: jest.fn(async () => ({ success: true }))
            }
          }
        }
      }
    });

    await context.window.performAutoSave();

    expect(context.window.electronAPI.files.performSaveWithPath).not.toHaveBeenCalled();
    expect(context.console.log).toHaveBeenCalledWith(
      '[performAutoSave] Save attempt',
      expect.objectContaining({
        path: '/project/doc.md',
        byteLength: 0,
        modelMatchedPath: false,
        status: 'skipped'
      })
    );
  });

  test('aborts instead of saving when editor model and active tab model drift', async () => {
    const activeTabModel = { id: 'active-model' };
    const editorModel = { id: 'other-model' };
    const activeTab = {
      filePath: '/project/doc.md',
      model: activeTabModel,
      lastSavedContent: 'saved',
      isDirty: true
    };
    const { context } = loadAutosaveModule({
      model: editorModel,
      activeTab
    });

    await context.window.performAutoSave();

    expect(context.window.electronAPI.files.performSaveWithPath).not.toHaveBeenCalled();
    expect(activeTab.isDirty).toBe(true);
    expect(context.window.hasUnsavedChanges).toBe(true);
    expect(context.console.log).toHaveBeenCalledWith(
      '[performAutoSave] Save attempt',
      expect.objectContaining({
        path: '/project/doc.md',
        modelMatchedPath: false,
        status: 'aborted'
      })
    );
  });

  test('aborts instead of saving when active tab path and current file path drift', async () => {
    const activeTab = {
      filePath: '/project/doc.md',
      model: { id: 'active-model' },
      lastSavedContent: 'saved',
      isDirty: true
    };
    const { context } = loadAutosaveModule({
      activeTab,
      context: {
        window: {
          appSettings: {
            autoSave: {
              enabled: true,
              interval: 1000
            }
          },
          currentFilePath: '/project/other.md',
          hasUnsavedChanges: true,
          tabManager: {
            activeTabPath: activeTab.filePath,
            tabs: new Map([[activeTab.filePath, activeTab]])
          },
          electronAPI: {
            files: {
              performSaveWithPath: jest.fn(async () => ({ success: true }))
            }
          }
        }
      }
    });

    await context.window.performAutoSave();

    expect(context.window.electronAPI.files.performSaveWithPath).not.toHaveBeenCalled();
    expect(activeTab.isDirty).toBe(true);
    expect(context.window.hasUnsavedChanges).toBe(true);
  });
});

describe('autosave pending-write safety', () => {
  const flushQueue = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

  test('keeps edits typed during a save dirty against the saved version', async () => {
    const { context, activeTab, model } = loadAutosaveModule();
    let finish;
    context.window.electronAPI.files.performSaveWithPath.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = context.window.performAutoSave();
    await flushQueue();
    model.getValue.mockReturnValue('newer edits');
    context.editor.getValue.mockReturnValue('newer edits');
    finish({ success: true });
    await pending;
    expect(activeTab.lastSavedContent).toBe('changed');
    expect(activeTab.isDirty).toBe(true);
    expect(context.window.hasUnsavedChanges).toBe(true);
    expect(context.showNotification).not.toHaveBeenCalled();
  });

  test('saving an outgoing tab cannot clear the incoming tab dirty state', async () => {
    const { context, activeTab } = loadAutosaveModule();
    let finish;
    context.window.electronAPI.files.performSaveWithPath.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = context.window.performAutoSave();
    await flushQueue();
    const other = { filePath: '/project/other.md', model: {}, lastSavedContent: 'other saved', isDirty: true };
    context.window.tabManager.tabs.set(other.filePath, other);
    context.window.tabManager.activeTabPath = other.filePath;
    context.window.currentFilePath = other.filePath;
    context.editor.getModel.mockReturnValue(other.model);
    context.lastSavedContent = 'other saved';
    finish({ success: true });
    await pending;
    expect(activeTab.isDirty).toBe(false);
    expect(other.isDirty).toBe(true);
    expect(context.window.hasUnsavedChanges).toBe(true);
    expect(context.lastSavedContent).toBe('other saved');
  });

  test('serializes overlapping writes and saves newer edits last', async () => {
    const { context, model, activeTab } = loadAutosaveModule();
    let finish;
    context.window.electronAPI.files.performSaveWithPath.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = context.window.performAutoSave();
    await flushQueue();
    context.editor.getValue.mockReturnValue('newer');
    model.getValue.mockReturnValue('newer');
    const second = context.window.performAutoSave();
    await flushQueue();
    expect(context.window.electronAPI.files.performSaveWithPath).toHaveBeenCalledTimes(1);
    finish({ success: true });
    await Promise.all([first, second]);
    expect(context.window.electronAPI.files.performSaveWithPath).toHaveBeenNthCalledWith(2, 'newer', '/project/doc.md', { expectedContent: 'changed' });
    expect(activeTab.lastSavedContent).toBe('newer');
    expect(activeTab.isDirty).toBe(false);
  });

  test('tracks dirty state and recovery while automatic disk saving is disabled', () => {
    const { context } = loadAutosaveModule();
    context.window.appSettings.autoSave.enabled = false;
    context.window.hasUnsavedChanges = false;
    context.window.tabManager.syncActiveTabDirty = jest.fn();
    context.window.scheduleAutoSave();
    expect(context.window.hasUnsavedChanges).toBe(true);
    expect(context.window.tabManager.syncActiveTabDirty).toHaveBeenCalledWith(true);
    expect(context.setTimeout).not.toHaveBeenCalled();
  });

  test('undoing to saved text clears the dirty state and pending timer', () => {
    const { context } = loadAutosaveModule();
    context.autoSaveTimer = 17;
    context.editor.getValue.mockReturnValue('saved');
    context.window.tabManager.syncActiveTabDirty = jest.fn();
    context.window.scheduleAutoSave();
    expect(context.window.hasUnsavedChanges).toBe(false);
    expect(context.window.tabManager.syncActiveTabDirty).toHaveBeenCalledWith(false);
    expect(context.clearTimeout).toHaveBeenCalledWith(17);
    expect(context.autoSaveTimer).toBeNull();
  });
});

describe('autosave target capture across queued work and tab changes', () => {
  function switchTab(context, content = 'other edits') {
    const other = {
      filePath: '/project/other.md', model: { getValue: jest.fn(() => content) },
      lastSavedContent: 'other saved', isDirty: true
    };
    context.window.tabManager.tabs.set(other.filePath, other);
    context.window.tabManager.activeTabPath = other.filePath;
    context.window.currentFilePath = other.filePath;
    context.editor.getModel.mockReturnValue(other.model);
    context.editor.getValue.mockReturnValue(content);
    context.lastSavedContent = 'other saved';
    return other;
  }

  test('queued autosave writes the originally requested tab after focus changes', async () => {
    const { context, activeTab } = loadAutosaveModule();
    let release;
    context.window._editorSaveQueue = new Promise(resolve => { release = resolve; });
    const pending = context.window.performAutoSave();
    const other = switchTab(context);
    release();
    await pending;
    expect(context.window.electronAPI.files.performSaveWithPath).toHaveBeenCalledWith('changed', activeTab.filePath, { expectedContent: 'saved' });
    expect(activeTab.isDirty).toBe(false);
    expect(other.isDirty).toBe(true);
    expect(context.lastSavedContent).toBe('other saved');
  });

  test('debounced autosave still saves the outgoing tab after switching to a clean tab', async () => {
    const { context, activeTab } = loadAutosaveModule();
    context.window.scheduleAutoSave();
    const timer = context.setTimeout.mock.calls[0][0];
    const other = switchTab(context, 'other saved');
    other.isDirty = false;
    context.window.hasUnsavedChanges = false;
    timer();
    await context.window._editorSaveQueue;
    expect(context.window.electronAPI.files.performSaveWithPath).toHaveBeenCalledWith('changed', activeTab.filePath, { expectedContent: 'saved' });
    expect(activeTab.isDirty).toBe(false);
    expect(context.window.hasUnsavedChanges).toBe(false);
  });

  test('typing in a second tab flushes the first pending draft without canceling the second timer', async () => {
    const { context } = loadAutosaveModule();
    context.window.scheduleAutoSave();
    switchTab(context);
    context.window.scheduleAutoSave();
    await context.window._editorSaveQueue;
    expect(context.window.electronAPI.files.performSaveWithPath).toHaveBeenNthCalledWith(1, 'changed', '/project/doc.md', { expectedContent: 'saved' });
    expect(context.autoSaveTimer).not.toBeNull();
    context.setTimeout.mock.calls[1][0]();
    await context.window._editorSaveQueue;
    expect(context.window.electronAPI.files.performSaveWithPath).toHaveBeenNthCalledWith(2, 'other edits', '/project/other.md', { expectedContent: 'other saved' });
  });

  test('queued autosave does not recreate a renamed file', async () => {
    const { context, activeTab } = loadAutosaveModule();
    let release;
    context.window._editorSaveQueue = new Promise(resolve => { release = resolve; });
    const pending = context.window.performAutoSave();
    context.window.tabManager.tabs.delete(activeTab.filePath);
    activeTab.filePath = '/project/renamed.md';
    context.window.tabManager.tabs.set(activeTab.filePath, activeTab);
    release();
    await pending;
    expect(context.window.electronAPI.files.performSaveWithPath).not.toHaveBeenCalled();
    expect(activeTab.isDirty).toBe(true);
  });

  test('external-content conflicts preserve the recovered baseline and draft', async () => {
    const { context, activeTab } = loadAutosaveModule();
    context.window.electronAPI.files.performSaveWithPath.mockResolvedValue({ success: false, code: 'FILE_MODIFIED_EXTERNALLY' });
    await context.window.performAutoSave();
    expect(activeTab.lastSavedContent).toBe('saved');
    expect(activeTab.isDirty).toBe(true);
    expect(context.window.hasUnsavedChanges).toBe(true);
  });

  test('enabling autosave cannot mark an existing unsaved buffer as saved', () => {
    const { context } = loadAutosaveModule();
    context.window.initializeAutoSave();
    expect(context.lastSavedContent).toBe('saved');
    expect(context.window.hasUnsavedChanges).toBe(true);
  });
});

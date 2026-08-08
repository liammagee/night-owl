const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAutosaveModule(overrides = {}) {
  const model = overrides.model || { id: 'active-model' };
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
      '/project/doc.md'
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

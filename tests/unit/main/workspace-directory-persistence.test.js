/**
 * Tests for workspace directory persistence.
 *
 * Verifies that the working directory is correctly saved, restored on startup,
 * and not accidentally overwritten by unrelated settings changes.
 *
 * Root-cause context:
 *   - The default workingDirectory is app.getPath('documents') which is huge.
 *   - Multiple code paths change the directory on the main side but some forget
 *     to notify the renderer via 'settings-changed', leaving the renderer with
 *     a stale workingDirectory.
 *   - Renderer-side settings saves (theme, plugin toggles, etc.) send the full
 *     window.appSettings back via 'set-settings', which can overwrite the
 *     correct workingDirectory with the stale one.
 *   - buildFileTree lacks the directory-skip list that getAvailableFiles has,
 *     making Documents extremely slow to scan.
 */

const path = require('path');

// fileHandlers.js uses require('fs').promises and require('fs') (sync).
// We must mock the base 'fs' module so that both .promises and sync APIs
// are jest mock functions accessible from the test.
const mockFsPromises = {
  readFile: jest.fn(),
  writeFile: jest.fn(),
  readdir: jest.fn(),
  mkdir: jest.fn(),
  access: jest.fn(),
  stat: jest.fn(),
  copyFile: jest.fn(),
  rename: jest.fn(),
  unlink: jest.fn(),
  rm: jest.fn()
};

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: mockFsPromises,
    existsSync: jest.fn(() => true),
    readFileSync: jest.fn(() => '{}'),
    writeFileSync: jest.fn(),
    renameSync: jest.fn(),
    copyFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    statSync: jest.fn(() => ({ isDirectory: () => true, isFile: () => false }))
  };
});

describe('workspace directory persistence', () => {
  let fileHandlers;
  let settingsHandlers;
  let ipcMain;
  let dialog;

  function getRegisteredHandler(channel) {
    const entry = ipcMain.handle.mock.calls.find(([name]) => name === channel);
    if (!entry) {
      throw new Error(`Handler not registered for channel: ${channel}`);
    }
    return entry[1];
  }

  beforeEach(() => {
    jest.resetModules();
    // Re-require electron to get fresh mocks from the setup file
    ({ ipcMain, dialog } = require('electron'));
    ipcMain.handle.mockClear();
    dialog.showOpenDialog.mockReset();
    // Clear all fs mock call history
    Object.values(mockFsPromises).forEach(fn => fn.mockReset());
    fileHandlers = require('../../../ipc/fileHandlers');
    settingsHandlers = require('../../../ipc/settingsHandlers');
  });

  // ---------------------------------------------------------------------------
  // 1. getWorkingDirectory returns the saved workspace, not the default
  // ---------------------------------------------------------------------------
  describe('getWorkingDirectory uses saved workspace', () => {
    test('request-file-tree uses appSettings.workingDirectory, not the Documents default', async () => {
      const savedWorkspace = '/Users/test/my-project';

      // Mock fs.stat and fs.readdir for the workspace path
      mockFsPromises.stat.mockResolvedValue({ isFile: () => false, isDirectory: () => true });
      mockFsPromises.readdir.mockResolvedValue([]);

      fileHandlers.register({
        appSettings: { workingDirectory: savedWorkspace, workspaceFolders: [] },
        saveSettings: jest.fn(),
        getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
        getCurrentFilePath: jest.fn(),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => savedWorkspace),
        setCurrentWorkingDirectory: jest.fn(),
        currentWorkingDirectory: savedWorkspace,
        userDataPath: '/mock/user-data'
      });

      const handler = getRegisteredHandler('request-file-tree');
      const result = await handler({});

      // The tree root should be for the saved workspace, not Documents
      expect(result.path).toBe(savedWorkspace);
      expect(result.path).not.toBe('/mock/documents');
    });

    test('get-working-directory returns saved workspace over fallback', () => {
      const savedWorkspace = '/Users/test/lectures';

      fileHandlers.register({
        appSettings: { workingDirectory: savedWorkspace },
        saveSettings: jest.fn(),
        getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
        getCurrentFilePath: jest.fn(),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => '/some/other/path'),
        setCurrentWorkingDirectory: jest.fn(),
        currentWorkingDirectory: '/some/other/path',
        userDataPath: '/mock/user-data'
      });

      const handler = getRegisteredHandler('get-working-directory');
      expect(handler()).toBe(savedWorkspace);
    });

    test('get-working-directory falls back to getCurrentWorkingDirectory when appSettings is empty', () => {
      const fallbackDir = '/Users/test/fallback';

      fileHandlers.register({
        appSettings: {},
        saveSettings: jest.fn(),
        getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
        getCurrentFilePath: jest.fn(),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => fallbackDir),
        setCurrentWorkingDirectory: jest.fn(),
        currentWorkingDirectory: fallbackDir,
        userDataPath: '/mock/user-data'
      });

      const handler = getRegisteredHandler('get-working-directory');
      expect(handler()).toBe(fallbackDir);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. change-working-directory persists the new directory
  // ---------------------------------------------------------------------------
  describe('change-working-directory persistence', () => {
    test('change-working-directory saves to appSettings and calls saveSettings', async () => {
      const appSettings = { workingDirectory: '/old/workspace' };
      const saveSettings = jest.fn();
      const send = jest.fn();

      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/new/workspace']
      });

      fileHandlers.register({
        appSettings,
        saveSettings,
        getMainWindow: jest.fn(() => ({ webContents: { send } })),
        getCurrentFilePath: jest.fn(),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => '/old/workspace'),
        setCurrentWorkingDirectory: jest.fn(),
        currentWorkingDirectory: '/old/workspace',
        userDataPath: '/mock/user-data'
      });

      const handler = getRegisteredHandler('change-working-directory');
      await handler({});

      expect(appSettings.workingDirectory).toBe('/new/workspace');
      expect(saveSettings).toHaveBeenCalled();
    });

    test('change-working-directory sends settings-changed to renderer', async () => {
      const send = jest.fn();

      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/new/workspace']
      });

      fileHandlers.register({
        appSettings: { workingDirectory: '/old/workspace' },
        saveSettings: jest.fn(),
        getMainWindow: jest.fn(() => ({ webContents: { send } })),
        getCurrentFilePath: jest.fn(),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => '/old/workspace'),
        setCurrentWorkingDirectory: jest.fn(),
        currentWorkingDirectory: '/old/workspace',
        userDataPath: '/mock/user-data'
      });

      const handler = getRegisteredHandler('change-working-directory');
      await handler({});

      expect(send).toHaveBeenCalledWith('settings-changed', {
        workingDirectory: '/new/workspace',
        workspaceFolders: []
      });
    });

    test('change-working-directory removes the new primary folder from workspaceFolders', async () => {
      const appSettings = {
        workingDirectory: '/old/workspace',
        workspaceFolders: ['/new/workspace', '/other/workspace']
      };
      const saveSettings = jest.fn();

      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/new/workspace/']
      });

      fileHandlers.register({
        appSettings,
        saveSettings,
        getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
        getCurrentFilePath: jest.fn(),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => '/old/workspace'),
        setCurrentWorkingDirectory: jest.fn(),
        currentWorkingDirectory: '/old/workspace',
        userDataPath: '/mock/user-data'
      });

      const handler = getRegisteredHandler('change-working-directory');
      const result = await handler({});

      expect(result.success).toBe(true);
      expect(appSettings.workingDirectory).toBe('/new/workspace');
      expect(appSettings.workspaceFolders).toEqual(['/other/workspace']);
      expect(saveSettings).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Multi-folder workspace roots should not overlap
  // ---------------------------------------------------------------------------
  describe('workspace folder duplicate protection', () => {
    test('add-workspace-folder rejects the primary folder after path normalization', async () => {
      const appSettings = {
        workingDirectory: '/Users/test/project',
        workspaceFolders: []
      };

      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/Users/test/project/']
      });

      fileHandlers.register({
        appSettings,
        saveSettings: jest.fn(),
        getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
        getCurrentFilePath: jest.fn(),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => '/Users/test/project'),
        setCurrentWorkingDirectory: jest.fn(),
        currentWorkingDirectory: '/Users/test/project',
        userDataPath: '/mock/user-data'
      });

      const handler = getRegisteredHandler('add-workspace-folder');
      const result = await handler({});

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/primary working directory/);
      expect(appSettings.workspaceFolders).toEqual([]);
    });

    test('add-workspace-folder rejects folders already covered by the primary folder', async () => {
      const appSettings = {
        workingDirectory: '/Users/test/project',
        workspaceFolders: []
      };

      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/Users/test/project/src']
      });

      fileHandlers.register({
        appSettings,
        saveSettings: jest.fn(),
        getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
        getCurrentFilePath: jest.fn(),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => '/Users/test/project'),
        setCurrentWorkingDirectory: jest.fn(),
        currentWorkingDirectory: '/Users/test/project',
        userDataPath: '/mock/user-data'
      });

      const handler = getRegisteredHandler('add-workspace-folder');
      const result = await handler({});

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/already covered/);
      expect(appSettings.workspaceFolders).toEqual([]);
    });

    test('request-file-tree cleans persisted duplicate workspace folders before rendering', async () => {
      const workspace = '/Users/test/project';
      const appSettings = {
        workingDirectory: workspace,
        workspaceFolders: [
          '/Users/test/project/',
          '/Users/test/project/src',
          '/Users/test/other'
        ]
      };
      const saveSettings = jest.fn();

      mockFsPromises.stat.mockImplementation(async (p) => ({
        isFile: () => p.endsWith('.md'),
        isDirectory: () => !p.endsWith('.md')
      }));
      mockFsPromises.readdir.mockImplementation(async (p) => {
        if (p === workspace) return ['notes.md'];
        if (p === '/Users/test/other') return ['other.md'];
        return [];
      });

      fileHandlers.register({
        appSettings,
        saveSettings,
        getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
        getCurrentFilePath: jest.fn(),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => workspace),
        setCurrentWorkingDirectory: jest.fn(),
        currentWorkingDirectory: workspace,
        userDataPath: '/mock/user-data'
      });

      const handler = getRegisteredHandler('request-file-tree');
      const tree = await handler({});

      expect(appSettings.workspaceFolders).toEqual(['/Users/test/other']);
      expect(saveSettings).toHaveBeenCalled();
      expect(tree.isMultiFolder).toBe(true);
      expect(tree.children.map(child => child.path)).toEqual([
        '/Users/test/project',
        '/Users/test/other'
      ]);
    });

    test('reorder-workspace-folders drops duplicate and nested roots', async () => {
      const appSettings = {
        workingDirectory: '/Users/test/project',
        workspaceFolders: ['/Users/test/other']
      };
      const saveSettings = jest.fn();

      fileHandlers.register({
        appSettings,
        saveSettings,
        getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
        getCurrentFilePath: jest.fn(),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => '/Users/test/project'),
        setCurrentWorkingDirectory: jest.fn(),
        currentWorkingDirectory: '/Users/test/project',
        userDataPath: '/mock/user-data'
      });

      const handler = getRegisteredHandler('reorder-workspace-folders');
      const result = await handler({}, [
        '/Users/test/other',
        '/Users/test/other/',
        '/Users/test/project/src'
      ]);

      expect(result.success).toBe(true);
      expect(result.workspaceFolders).toEqual(['/Users/test/other']);
      expect(appSettings.workspaceFolders).toEqual(['/Users/test/other']);
      expect(saveSettings).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Inline settings changes must NOT overwrite workingDirectory
  // ---------------------------------------------------------------------------
  describe('settings overwrite protection', () => {
    test('set-settings with full object does not lose workingDirectory', () => {
      const appSettings = {
        workingDirectory: '/correct/workspace',
        theme: 'dark',
        ai: {}
      };

      settingsHandlers.register({
        appSettings,
        defaultSettings: { workingDirectory: '/mock/documents', theme: 'light' },
        saveSettings: jest.fn(),
        tutorBridge: null
      });

      const handler = getRegisteredHandler('set-settings');

      // Simulate renderer sending full appSettings with STALE workingDirectory
      // (as happens when theme/accent/plugin changes send window.appSettings)
      handler({}, {
        workingDirectory: '/mock/documents', // stale!
        theme: 'nightowl'
      });

      // The workingDirectory should NOT be overwritten by the stale value
      // (This test documents the CURRENT bug — it may fail until the fix is applied)
      // After fix: the set-settings handler should preserve workingDirectory
      // from the main process side when doing a full-object replacement
      expect(appSettings.workingDirectory).toBe('/correct/workspace');
    });

    test('update-settings-category for theme does not touch workingDirectory', () => {
      const appSettings = {
        workingDirectory: '/correct/workspace',
        theme: 'dark'
      };

      settingsHandlers.register({
        appSettings,
        defaultSettings: { theme: 'light' },
        saveSettings: jest.fn(),
        tutorBridge: null
      });

      const handler = getRegisteredHandler('update-settings-category');
      handler({}, 'theme', 'nightowl');

      // Category update should not affect workingDirectory
      expect(appSettings.workingDirectory).toBe('/correct/workspace');
    });

    test('reset-settings-category does not reset workingDirectory', () => {
      const appSettings = {
        workingDirectory: '/correct/workspace',
        editor: { fontSize: 20 }
      };

      settingsHandlers.register({
        appSettings,
        defaultSettings: {
          workingDirectory: '/mock/documents',
          editor: { fontSize: 14 }
        },
        saveSettings: jest.fn(),
        tutorBridge: null
      });

      const handler = getRegisteredHandler('reset-settings-category');
      handler({}, 'editor');

      // Resetting editor should not change workingDirectory
      expect(appSettings.workingDirectory).toBe('/correct/workspace');
      expect(appSettings.editor.fontSize).toBe(14); // editor was reset
    });
  });

  // ---------------------------------------------------------------------------
  // 5. buildFileTree should skip heavy directories
  // ---------------------------------------------------------------------------
  describe('buildFileTree directory filtering', () => {
    test('request-file-tree does not recurse into node_modules', async () => {
      const workspace = '/Users/test/project';
      const statCalls = [];

      mockFsPromises.stat.mockImplementation(async (p) => {
        statCalls.push(p);
        return {
          isFile: () => !p.endsWith('project') && !p.endsWith('src') && !p.endsWith('node_modules'),
          isDirectory: () => p.endsWith('project') || p.endsWith('src') || p.endsWith('node_modules')
        };
      });

      mockFsPromises.readdir.mockImplementation(async (p) => {
        if (p === workspace) return ['src', 'node_modules', 'readme.md'];
        if (p === path.join(workspace, 'src')) return ['index.js'];
        if (p === path.join(workspace, 'node_modules')) return ['express', 'lodash'];
        return [];
      });

      fileHandlers.register({
        appSettings: { workingDirectory: workspace, workspaceFolders: [] },
        saveSettings: jest.fn(),
        getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
        getCurrentFilePath: jest.fn(),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => workspace),
        setCurrentWorkingDirectory: jest.fn(),
        currentWorkingDirectory: workspace,
        userDataPath: '/mock/user-data'
      });

      const handler = getRegisteredHandler('request-file-tree');
      const tree = await handler({});

      // node_modules should be excluded from the tree
      const childNames = (tree.children || []).map(c => c.name);
      expect(childNames).not.toContain('node_modules');
      expect(childNames).toContain('src');
      expect(childNames).toContain('readme.md');
    });

    test('request-file-tree does not recurse into .git', async () => {
      const workspace = '/Users/test/project';

      mockFsPromises.stat.mockImplementation(async (p) => ({
        isFile: () => p.endsWith('.md'),
        isDirectory: () => !p.endsWith('.md')
      }));

      mockFsPromises.readdir.mockImplementation(async (p) => {
        if (p === workspace) return ['.git', 'docs', 'notes.md'];
        if (p.endsWith('docs')) return ['guide.md'];
        if (p.endsWith('.git')) return ['HEAD', 'config'];
        return [];
      });

      fileHandlers.register({
        appSettings: { workingDirectory: workspace, workspaceFolders: [] },
        saveSettings: jest.fn(),
        getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
        getCurrentFilePath: jest.fn(),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => workspace),
        setCurrentWorkingDirectory: jest.fn(),
        currentWorkingDirectory: workspace,
        userDataPath: '/mock/user-data'
      });

      const handler = getRegisteredHandler('request-file-tree');
      const tree = await handler({});

      // .git is already skipped (starts with '.'), but verify
      const childNames = (tree.children || []).map(c => c.name);
      expect(childNames).not.toContain('.git');
      expect(childNames).toContain('docs');
    });

    const heavyDirs = ['node_modules', 'dist', 'build', 'coverage', '.next', '__pycache__'];
    test.each(heavyDirs)('buildFileTree skips %s directory', async (dirName) => {
      const workspace = '/Users/test/project';

      mockFsPromises.stat.mockImplementation(async (p) => ({
        isFile: () => p.endsWith('.md'),
        isDirectory: () => !p.endsWith('.md')
      }));

      mockFsPromises.readdir.mockImplementation(async (p) => {
        if (p === workspace) return [dirName, 'notes.md'];
        // If buildFileTree enters the heavy dir, it would call readdir on it
        if (p === path.join(workspace, dirName)) return ['should-not-appear'];
        return [];
      });

      fileHandlers.register({
        appSettings: { workingDirectory: workspace, workspaceFolders: [] },
        saveSettings: jest.fn(),
        getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
        getCurrentFilePath: jest.fn(),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => workspace),
        setCurrentWorkingDirectory: jest.fn(),
        currentWorkingDirectory: workspace,
        userDataPath: '/mock/user-data'
      });

      const handler = getRegisteredHandler('request-file-tree');
      const tree = await handler({});

      const childNames = (tree.children || []).map(c => c.name);
      expect(childNames).not.toContain(dirName);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Settings round-trip: save → load preserves workingDirectory
  // ---------------------------------------------------------------------------
  describe('settings load/save round-trip (deepMerge)', () => {
    // These test the deepMerge function directly via the main.js module
    // Since main.js has side effects, we test the logic in isolation

    function deepMerge(target, source) {
      const result = { ...target };
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = deepMerge(target[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
      return result;
    }

    test('deepMerge preserves saved workingDirectory over default', () => {
      const defaults = {
        workingDirectory: '/mock/documents',
        theme: 'light',
        editor: { fontSize: 14 }
      };

      const saved = {
        workingDirectory: '/Users/test/my-workspace',
        theme: 'dark',
        editor: { fontSize: 18 }
      };

      const result = deepMerge(defaults, saved);
      expect(result.workingDirectory).toBe('/Users/test/my-workspace');
    });

    test('deepMerge uses default when saved settings omit workingDirectory', () => {
      const defaults = {
        workingDirectory: '/mock/documents',
        theme: 'light'
      };

      const saved = {
        theme: 'dark'
      };

      const result = deepMerge(defaults, saved);
      expect(result.workingDirectory).toBe('/mock/documents');
    });

    test('deepMerge handles empty saved settings', () => {
      const defaults = {
        workingDirectory: '/mock/documents',
        theme: 'light'
      };

      const result = deepMerge(defaults, {});
      expect(result.workingDirectory).toBe('/mock/documents');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Concurrent operations don't cause stale reads
  // ---------------------------------------------------------------------------
  describe('concurrent operation safety', () => {
    test('get-working-directory reflects directory change immediately after change-working-directory', async () => {
      let currentWorkingDirectory = '/initial';
      const appSettings = { workingDirectory: '/initial' };

      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/updated']
      });

      fileHandlers.register({
        appSettings,
        saveSettings: jest.fn(),
        getMainWindow: jest.fn(() => ({ webContents: { send: jest.fn() } })),
        getCurrentFilePath: jest.fn(),
        setCurrentFilePath: jest.fn(),
        getCurrentWorkingDirectory: jest.fn(() => currentWorkingDirectory),
        setCurrentWorkingDirectory: jest.fn((dir) => { currentWorkingDirectory = dir; }),
        currentWorkingDirectory,
        userDataPath: '/mock/user-data'
      });

      const changeHandler = getRegisteredHandler('change-working-directory');
      const getHandler = getRegisteredHandler('get-working-directory');

      // Before change
      expect(getHandler()).toBe('/initial');

      // After change
      await changeHandler({});
      expect(getHandler()).toBe('/updated');
      expect(appSettings.workingDirectory).toBe('/updated');
    });
  });
});

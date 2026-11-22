describe('settingsHandlers runtime AI updates', () => {
  let settingsHandlers;
  let ipcMain;

  function getRegisteredHandler(channel) {
    const entry = ipcMain.handle.mock.calls.find(([name]) => name === channel);
    if (!entry) {
      throw new Error(`Handler not registered for ${channel}`);
    }
    return entry[1];
  }

  beforeEach(() => {
    jest.resetModules();
    ({ ipcMain } = require('electron'));
    ipcMain.handle.mockClear();
    settingsHandlers = require('../../../ipc/settingsHandlers');
  });

  test('update-settings-category applies tutor bridge provider and URL changes immediately', async () => {
    const tutorBridge = {
      getAvailableProviders: jest.fn(() => ['openai', 'local']),
      setDefaultProvider: jest.fn(),
      updateLocalAIUrl: jest.fn()
    };

    settingsHandlers.register({
      appSettings: { ai: { preferredProvider: 'auto' } },
      defaultSettings: { ai: {} },
      saveSettings: jest.fn(),
      tutorBridge
    });

    const handler = getRegisteredHandler('update-settings-category');
    const result = await handler({}, 'ai', {
      preferredProvider: 'openai',
      localAIUrl: 'http://localhost:1234'
    });

    expect(result.preferredProvider).toBe('openai');
    expect(result.localAIUrl).toBe('http://localhost:1234');
    expect(tutorBridge.updateLocalAIUrl).toHaveBeenCalledWith('http://localhost:1234');
    expect(tutorBridge.setDefaultProvider).toHaveBeenCalledWith('openai');
  });

  test('legacy set-settings applies auto provider resets through the live AI runtime', async () => {
    const tutorBridge = {
      getAvailableProviders: jest.fn(() => ['openai']),
      setDefaultProvider: jest.fn(),
      updateLocalAIUrl: jest.fn()
    };

    settingsHandlers.register({
      appSettings: { ai: { preferredProvider: 'openai' } },
      defaultSettings: { ai: {} },
      saveSettings: jest.fn(),
      tutorBridge
    });

    const handler = getRegisteredHandler('set-settings');
    const result = await handler({}, {
      ai: {
        preferredProvider: 'auto'
      }
    });

    expect(result).toEqual({ success: true });
    expect(tutorBridge.setDefaultProvider).toHaveBeenCalledWith('auto');
  });

  test('stale preferences cannot replace the current document or session, but explicit tab updates can', () => {
    const session = { openTabs: [{ filePath: '/last.md' }], activeTabPath: '/last.md', activeTabIndex: 0 };
    const appSettings = { currentFile: '/last.md', editorTabs: session, theme: 'light' };
    settingsHandlers.register({ appSettings, defaultSettings: {}, saveSettings: jest.fn() });
    const setSettings = getRegisteredHandler('set-settings');
    setSettings({}, { theme: 'dark', currentFile: '/old.md', editorTabs: { openTabs: [], activeTabIndex: 0 } });
    expect(appSettings.theme).toBe('dark');
    expect(appSettings.currentFile).toBe('/last.md');
    expect(appSettings.editorTabs).toEqual(session);
    setSettings({}, 'editorTabs', { openTabs: [{ filePath: '/new.md' }], activeTabPath: '/new.md', activeTabIndex: 0 });
    expect(appSettings.editorTabs.activeTabPath).toBe('/new.md');
    expect(appSettings.editorTabs.openTabs).toEqual([{ filePath: '/new.md' }]);
  });
  test('failed disk persistence is reported and restores the previous settings', () => {
    const appSettings = { theme: 'light', ai: { preferredProvider: 'auto' } };
    const tutorBridge = { configureAIRouting: jest.fn() };
    settingsHandlers.register({appSettings, defaultSettings: {}, saveSettings: () => false, tutorBridge});
    const result = getRegisteredHandler('set-settings')({}, {theme:'dark', ai:{preferredProvider:'openai'}});
    expect(result.success).toBe(false);
    expect(appSettings).toEqual({theme:'light', ai:{preferredProvider:'auto'}});
    expect(tutorBridge.configureAIRouting).not.toHaveBeenCalled();
  });

  test('export and import round-trip scalar and array preferences without restoring stale session paths', () => {
    const appSettings = { theme: 'dark', customList: ['one'], workingDirectory: '/live', ai: { temperature: 0.2 } };
    settingsHandlers.register({ appSettings, defaultSettings: {}, saveSettings: jest.fn() });
    const exported = getRegisteredHandler('export-settings')({});
    appSettings.theme = 'light';
    appSettings.customList = [];
    appSettings.workingDirectory = '/new';
    expect(getRegisteredHandler('import-settings')({}, exported).success).toBe(true);
    expect(appSettings.theme).toBe('dark');
    expect(appSettings.customList).toEqual(['one']);
    expect(appSettings.workingDirectory).toBe('/new');
  });

  test('rejects prototype keys before mutating settings', () => {
    const appSettings = { theme: 'light', ai: { temperature: 0.5 } };
    settingsHandlers.register({ appSettings, defaultSettings: {}, saveSettings: jest.fn() });
    const payload = JSON.parse('{"theme":"dark","__proto__":{"polluted":true}}');
    const result = getRegisteredHandler('set-settings')({}, payload);
    expect(result.success).toBe(false);
    expect(appSettings.theme).toBe('light');
    expect(Object.getPrototypeOf(appSettings)).toBe(Object.prototype);
    expect(getRegisteredHandler('update-settings-category')({}, '__proto__', { unsafe: true }).success).toBe(false);
    expect(appSettings.unsafe).toBeUndefined();
  });

  test('full preference imports cannot introduce missing main-process-owned paths', () => {
    const appSettings = { theme: 'light' };
    settingsHandlers.register({ appSettings, defaultSettings: {}, saveSettings: jest.fn() });
    getRegisteredHandler('set-settings')({}, { theme: 'dark', workingDirectory: '/injected', currentFile: '/injected.md' });
    expect(appSettings.theme).toBe('dark');
    expect(appSettings).not.toHaveProperty('workingDirectory');
    expect(appSettings).not.toHaveProperty('currentFile');
  });

});

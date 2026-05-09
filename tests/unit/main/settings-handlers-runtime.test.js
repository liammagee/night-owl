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
});

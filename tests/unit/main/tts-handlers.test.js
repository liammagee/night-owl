describe('Lemonfox TTS IPC handlers', () => {
  let ipcMain;
  let credentialStore;

  beforeEach(() => {
    jest.resetModules();
    ({ ipcMain } = require('electron'));
    ipcMain.handle.mockClear();
    credentialStore = {
      initialize: jest.fn(async () => {}),
      get: jest.fn(async () => null),
      set: jest.fn(async () => {}),
      delete: jest.fn(async () => {}),
      backendInfo: jest.fn(() => ({ available: true, protected: true, backend: 'keychain' }))
    };
    delete process.env.LEMONFOX_API_KEY;
  });

  function handler(channel) {
    return ipcMain.handle.mock.calls.find(([name]) => name === channel)?.[1];
  }

  test('stores a key without returning it and reports secure availability', async () => {
    require('../../../ipc/ttsHandlers').register({ userDataPath: '/mock/user-data', credentialStore });
    credentialStore.get.mockResolvedValue('stored-secret');

    const result = await handler('tts-set-api-key')({}, { apiKey: ' stored-secret ' });

    expect(credentialStore.set).toHaveBeenCalledWith('lemonfox', 'api-key', 'stored-secret');
    expect(result).toMatchObject({ success: true, configured: true, source: 'secure-storage' });
    expect(JSON.stringify(result)).not.toContain('stored-secret');
  });

  test('generates audio using the secure key and requested format', async () => {
    credentialStore.get.mockResolvedValue('stored-secret');
    const fetchImpl = jest.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('audio') }));
    require('../../../ipc/ttsHandlers').register({
      userDataPath: '/mock/user-data', credentialStore, fetchImpl,
      appSettings: { tts: { lemonfox: { voice: 'heart' } } }, defaultSettings: {}
    });

    const result = await handler('tts-generate-speech')({}, { text: 'Hello', response_format: 'ogg' });

    expect(result).toMatchObject({ success: true, format: 'ogg' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('aiHandlers context helpers', () => {
  let aiHandlers;
  let ipcMain;
  let readFileMock;
  let readdirMock;

  function getRegisteredHandler(channel) {
    const entry = ipcMain.handle.mock.calls.find(([name]) => name === channel);
    if (!entry) {
      throw new Error(`Handler not registered for ${channel}`);
    }
    return entry[1];
  }

  beforeEach(() => {
    jest.resetModules();

    readFileMock = jest.fn();
    readdirMock = jest.fn();

    jest.doMock('fs', () => ({
      promises: {
        readFile: readFileMock,
        readdir: readdirMock
      }
    }));

    ({ ipcMain } = require('electron'));
    ipcMain.handle.mockClear();
    aiHandlers = require('../../../ipc/aiHandlers');
  });

  afterEach(() => {
    jest.dontMock('fs');
  });

  test('get-current-file-content reads the live current file getter', async () => {
    let currentFilePath = '/workspace/notes/first.md';

    readFileMock.mockImplementation(async (filePath) => `contents:${filePath}`);

    aiHandlers.register({
      appSettings: { ai: {}, currentFile: '' },
      tutorBridge: {
        getAvailableProviders: jest.fn(() => ['openai']),
        sendMessage: jest.fn()
      },
      getCurrentFilePath: jest.fn(() => currentFilePath),
      getCurrentWorkingDirectory: jest.fn(() => '/workspace/notes'),
      buildSystemMessage: jest.fn(async () => 'system'),
      cleanAIResponse: jest.fn((value) => value)
    });

    const handler = getRegisteredHandler('get-current-file-content');

    expect(await handler()).toEqual({
      success: true,
      filePath: '/workspace/notes/first.md',
      content: 'contents:/workspace/notes/first.md'
    });

    currentFilePath = '/workspace/notes/second.md';

    expect(await handler()).toEqual({
      success: true,
      filePath: '/workspace/notes/second.md',
      content: 'contents:/workspace/notes/second.md'
    });
  });

  test('get-tutor-core-status separates local core readiness from optional providers', async () => {
    const probeLocalRuntime = jest.fn(async () => ({
      ok: true,
      coreAvailable: true,
      providerConfigured: false,
      storageReady: true,
      providers: [],
      learnerId: 'local-writer',
      runtimePaths: { dbPath: '/profile/tutor-core/tutor-core.db' },
      error: null
    }));

    aiHandlers.register({
      appSettings: { ai: {}, currentFile: '' },
      tutorBridge: {
        getAvailableProviders: jest.fn(() => []),
        probeLocalRuntime,
        isAvailable: jest.fn(() => true)
      },
      getCurrentFilePath: jest.fn(() => null),
      getCurrentWorkingDirectory: jest.fn(() => '/workspace'),
      buildSystemMessage: jest.fn(async () => 'system'),
      cleanAIResponse: jest.fn(value => value)
    });

    const result = await getRegisteredHandler('get-tutor-core-status')();

    expect(result).toMatchObject({
      success: true,
      coreAvailable: true,
      providerConfigured: false,
      storageReady: true,
      providers: []
    });
    expect(probeLocalRuntime).toHaveBeenCalledTimes(1);
  });

  test('get-file-context returns the current file plus sibling text files', async () => {
    readFileMock.mockImplementation(async (filePath) => `body:${filePath}`);
    readdirMock.mockResolvedValue([
      { name: 'current.md', isFile: () => true },
      { name: 'outline.md', isFile: () => true },
      { name: 'notes.txt', isFile: () => true },
      { name: 'image.png', isFile: () => true },
      { name: 'subdir', isFile: () => false }
    ]);

    aiHandlers.register({
      appSettings: { ai: {}, currentFile: '' },
      tutorBridge: {
        getAvailableProviders: jest.fn(() => ['openai']),
        sendMessage: jest.fn()
      },
      getCurrentFilePath: jest.fn(() => '/workspace/notes/current.md'),
      getCurrentWorkingDirectory: jest.fn(() => '/workspace/notes'),
      buildSystemMessage: jest.fn(async () => 'system'),
      cleanAIResponse: jest.fn((value) => value)
    });

    const handler = getRegisteredHandler('get-file-context');
    const result = await handler();

    expect(result.currentFilePath).toBe('/workspace/notes/current.md');
    expect(result.baseDirectory).toBe('/workspace/notes');
    expect(result.files.map((file) => file.name)).toEqual([
      'current.md',
      'outline.md',
      'notes.txt'
    ]);
    expect(result.files[0].isCurrentFile).toBe(true);
  });

  test('get-file-context uses live runtime workspace when saved workspace is stale', async () => {
    readFileMock.mockImplementation(async (filePath) => `body:${filePath}`);
    readdirMock.mockResolvedValue([
      { name: 'outline.md', isFile: () => true }
    ]);

    aiHandlers.register({
      appSettings: {
        ai: {},
        currentFile: '',
        workingDirectory: '/missing/saved-workspace'
      },
      tutorBridge: {
        getAvailableProviders: jest.fn(() => ['openai']),
        sendMessage: jest.fn()
      },
      getCurrentFilePath: jest.fn(() => null),
      getCurrentWorkingDirectory: jest.fn(() => '/runtime/workspace'),
      buildSystemMessage: jest.fn(async () => 'system'),
      cleanAIResponse: jest.fn((value) => value)
    });

    const handler = getRegisteredHandler('get-file-context');
    const result = await handler();

    expect(result.baseDirectory).toBe('/runtime/workspace');
    expect(readdirMock).toHaveBeenCalledWith('/runtime/workspace', { withFileTypes: true });
    expect(result.files.map((file) => file.name)).toEqual(['outline.md']);
  });

  test('send-chat-message-with-context accepts structured file arrays', async () => {
    const sendMessage = jest.fn(async (message) => ({
      response: message,
      provider: 'openai',
      model: 'gpt-test',
      usage: {}
    }));

    aiHandlers.register({
      appSettings: { ai: {} },
      tutorBridge: {
        getAvailableProviders: jest.fn(() => ['openai']),
        sendMessage
      },
      buildSystemMessage: jest.fn(async () => 'system'),
      cleanAIResponse: jest.fn((value) => value)
    });

    const handler = getRegisteredHandler('send-chat-message-with-context');
    const result = await handler({}, {
      message: 'Summarize these notes',
      fileContext: {
        files: [
          { name: 'alpha.md', content: 'A'.repeat(180) },
          { name: 'beta.md', content: 'B'.repeat(180) }
        ]
      },
      assistantConfig: {}
    });

    expect(result.provider).toBe('openai');
    expect(sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('### alpha.md'),
      expect.any(Object)
    );
    expect(sendMessage).toHaveBeenCalledWith(
      expect.stringContaining('### beta.md'),
      expect.any(Object)
    );
  });

  test('ai-chat applies the selected assistant prompt and preserves zero temperature', async () => {
    const sendMessage = jest.fn(async () => ({
      response: 'ok',
      provider: 'codex-cli',
      model: 'cli-default',
      usage: null
    }));

    aiHandlers.register({
      appSettings: {
        ai: {
          assistants: {
            ash: {
              systemPrompt: 'Ash-specific instructions',
              aiSettings: { provider: 'auto', model: 'auto', temperature: 0, maxTokens: 200 }
            }
          }
        }
      },
      tutorBridge: {
        getAvailableProviders: jest.fn(() => ['codex-cli']),
        sendMessage
      },
      buildSystemMessage: jest.fn(async () => 'generic system'),
      cleanAIResponse: jest.fn(value => value)
    });

    const result = await getRegisteredHandler('ai-chat')({}, {
      message: 'Review this',
      options: { assistant: 'ash' }
    });

    expect(result.provider).toBe('codex-cli');
    expect(sendMessage).toHaveBeenCalledWith('Review this', expect.objectContaining({
      provider: 'auto',
      model: 'auto',
      temperature: 0,
      maxTokens: 200,
      systemMessage: 'Ash-specific instructions'
    }));
  });
});

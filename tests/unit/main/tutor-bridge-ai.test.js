// Unit tests for tutor-bridge AI chat interface
// Tests sendMessage(), streamMessage(), generateText(), provider management,
// and conversation history — the new AI service layer added in v0.5.0.
//
// Uses the same VM sandbox pattern as tutor-bridge.test.js to inject a mock
// tutor-core module that bypasses the `await import()` dynamic import.

const mockUnifiedAIProvider = {
  call: jest.fn(),
  callStream: jest.fn(),
  getProviderStatus: jest.fn(() => ({
    gemini:     { configured: true,  model: 'gemini-test' },
    openai:     { configured: false, model: 'gpt-test' },
    claude:     { configured: true,  model: 'claude-test' },
    openrouter: { configured: true,  model: 'or-test' },
    local:      { configured: true,  model: 'local-model' },
  })),
  getAvailableProvider: jest.fn(() => 'openrouter'),
};

const mockTutorCore = {
  writingPadService: {
    initializeWritingPad: jest.fn(),
    getWritingPad: jest.fn(() => ({ id: 'pad-local-writer' }))
  },
  learnerIntegrationService: { detectResistance: jest.fn(), detectBreakthrough: jest.fn() },
  tutorDialogueEngine: { runDialogue: jest.fn() },
  recognitionGamificationService: { getLearnerRecognitionProfile: jest.fn() },
  recognitionOrchestrator: {
    processDialogueResult: jest.fn(),
    processWritingEvent: jest.fn(),
    getFullRecognitionState: jest.fn(),
    getDialecticalHistory: jest.fn(),
    getMemoryState: jest.fn(),
    getLearnerPatterns: jest.fn(),
    runMaintenance: jest.fn(() => ({ learnerId: 'local-writer', tasks: {} })),
  },
  tutorConfigLoader: { loadConfig: jest.fn(), listProfiles: jest.fn() },
  monitoringService: { getMetrics: jest.fn() },
  initDb: jest.fn(),
  // The new AI provider surface
  unifiedAIProvider: mockUnifiedAIProvider,
};

/**
 * Create a bridge module with tutor-core pre-loaded via VM sandbox.
 * Mirrors the pattern from tutor-bridge.test.js.
 */
function createBridgeWithMock(tutorCoreModule) {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');

  const bridgePath = path.resolve(__dirname, '../../../orchestrator/modules/tutor-bridge.js');
  const source = fs.readFileSync(bridgePath, 'utf8');

  const mockModule = { exports: {} };
  const sandbox = {
    module: mockModule,
    exports: mockModule.exports,
    require: require,
    process: process,
    console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    window: undefined,
    setTimeout: setTimeout,
    setInterval: jest.fn(() => 123),
    clearInterval: jest.fn(),
    __importDynamic: tutorCoreModule
      ? () => Promise.resolve(tutorCoreModule)
      : () => Promise.reject(new Error('Module not found')),
  };

  // Replace dynamic import with our mock
  let patchedSource = source.replace(
    /await import\(['"]@machinespirits\/tutor-core['"]\)/g,
    'await __importDynamic()'
  );

  // Remove the window block at the end to avoid ReferenceError
  patchedSource = patchedSource.replace(
    /if \(typeof window !== 'undefined'\)[\s\S]*$/,
    ''
  );

  const script = new vm.Script(patchedSource, { filename: 'tutor-bridge.js' });
  const context = vm.createContext(sandbox);
  script.runInContext(context);

  return mockModule.exports;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('tutor-bridge AI chat interface', () => {
  let bridge;

  beforeEach(() => {
    jest.clearAllMocks();
    bridge = createBridgeWithMock(mockTutorCore);
  });

  // =========================================================================
  // sendMessage()
  // =========================================================================

  describe('sendMessage()', () => {
    it('calls unifiedAIProvider.call() with correct params', async () => {
      mockUnifiedAIProvider.call.mockResolvedValueOnce({
        content: 'Hello!',
        provider: 'openrouter',
        model: 'or-test',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        latencyMs: 100,
      });

      const result = await bridge.sendMessage('Hi there', {
        provider: 'openrouter',
        model: 'or-test',
        systemMessage: 'Be brief',
        temperature: 0.3,
        maxTokens: 200,
        preset: 'chat',
      });

      expect(mockUnifiedAIProvider.call).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openrouter',
          model: 'or-test',
          systemPrompt: 'Be brief',
          preset: 'chat',
          config: expect.objectContaining({
            temperature: 0.3,
            maxTokens: 200,
          }),
        })
      );

      // Messages should include the user message
      const callArgs = mockUnifiedAIProvider.call.mock.calls[0][0];
      expect(callArgs.messages).toEqual(
        expect.arrayContaining([{ role: 'user', content: 'Hi there' }])
      );
    });

    it('returns the expected response shape', async () => {
      mockUnifiedAIProvider.call.mockResolvedValueOnce({
        content: 'Response text',
        provider: 'anthropic',
        model: 'claude-test',
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
        latencyMs: 250,
      });

      const result = await bridge.sendMessage('Test');

      expect(result).toEqual(
        expect.objectContaining({
          response: 'Response text',
          content: 'Response text',
          provider: 'anthropic',
          model: 'claude-test',
          usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
          latencyMs: 250,
        })
      );
    });

    it('adds user and assistant messages to conversation history', async () => {
      mockUnifiedAIProvider.call.mockResolvedValueOnce({
        content: 'First reply',
        provider: 'openrouter',
        model: 'or-test',
        usage: {},
        latencyMs: 50,
      });

      await bridge.sendMessage('First question');

      const history = bridge.getConversationHistory();
      expect(history).toEqual([
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First reply' },
      ]);
    });

    it('accumulates history across multiple calls', async () => {
      mockUnifiedAIProvider.call
        .mockResolvedValueOnce({ content: 'Reply 1', provider: 'x', model: 'x', usage: {}, latencyMs: 0 })
        .mockResolvedValueOnce({ content: 'Reply 2', provider: 'x', model: 'x', usage: {}, latencyMs: 0 });

      await bridge.sendMessage('Q1');
      await bridge.sendMessage('Q2');

      const history = bridge.getConversationHistory();
      expect(history).toHaveLength(4);
      expect(history[0]).toEqual({ role: 'user', content: 'Q1' });
      expect(history[1]).toEqual({ role: 'assistant', content: 'Reply 1' });
      expect(history[2]).toEqual({ role: 'user', content: 'Q2' });
      expect(history[3]).toEqual({ role: 'assistant', content: 'Reply 2' });
    });

    it('resets history on newConversation: true', async () => {
      mockUnifiedAIProvider.call
        .mockResolvedValueOnce({ content: 'Old', provider: 'x', model: 'x', usage: {}, latencyMs: 0 })
        .mockResolvedValueOnce({ content: 'New', provider: 'x', model: 'x', usage: {}, latencyMs: 0 });

      await bridge.sendMessage('Old question');
      expect(bridge.getConversationHistory()).toHaveLength(2);

      await bridge.sendMessage('Fresh start', { newConversation: true });

      const history = bridge.getConversationHistory();
      // Should only contain the new exchange
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({ role: 'user', content: 'Fresh start' });
      expect(history[1]).toEqual({ role: 'assistant', content: 'New' });
    });

    it('resets history when systemMessage changes', async () => {
      mockUnifiedAIProvider.call
        .mockResolvedValueOnce({ content: 'R1', provider: 'x', model: 'x', usage: {}, latencyMs: 0 })
        .mockResolvedValueOnce({ content: 'R2', provider: 'x', model: 'x', usage: {}, latencyMs: 0 });

      await bridge.sendMessage('Q1', { systemMessage: 'System A' });
      await bridge.sendMessage('Q2', { systemMessage: 'System B' });

      const history = bridge.getConversationHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({ role: 'user', content: 'Q2' });
    });

    it('removes user message from history on API error', async () => {
      mockUnifiedAIProvider.call.mockRejectedValueOnce(new Error('API timeout'));

      await expect(bridge.sendMessage('Fails')).rejects.toThrow('API timeout');

      const history = bridge.getConversationHistory();
      expect(history).toHaveLength(0);
    });

    it('trims history at MAX_HISTORY (40)', async () => {
      // Fill 21 exchanges = 42 messages, should be trimmed to 40
      for (let i = 0; i < 21; i++) {
        mockUnifiedAIProvider.call.mockResolvedValueOnce({
          content: `Reply ${i}`,
          provider: 'x',
          model: 'x',
          usage: {},
          latencyMs: 0,
        });
        await bridge.sendMessage(`Q${i}`);
      }

      const history = bridge.getConversationHistory();
      expect(history.length).toBeLessThanOrEqual(40);
    });

    it('uses default system message when none provided', async () => {
      mockUnifiedAIProvider.call.mockResolvedValueOnce({
        content: 'ok', provider: 'x', model: 'x', usage: {}, latencyMs: 0,
      });

      await bridge.sendMessage('Hello');

      const callArgs = mockUnifiedAIProvider.call.mock.calls[0][0];
      expect(callArgs.systemPrompt).toContain('helpful assistant');
    });
  });

  // =========================================================================
  // streamMessage()
  // =========================================================================

  describe('streamMessage()', () => {
    /** Helper: create a mock async generator from an array of chunks. */
    function mockAsyncGenerator(chunks) {
      return async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
      };
    }

    it('yields chunks from callStream()', async () => {
      const streamChunks = [
        { type: 'text_delta', content: 'Hello' },
        { type: 'text_delta', content: ' world' },
        { type: 'done', content: 'Hello world', usage: {}, provider: 'openrouter', model: 'or-test' },
      ];

      mockUnifiedAIProvider.callStream.mockReturnValueOnce(
        (mockAsyncGenerator(streamChunks))()
      );

      const collected = [];
      for await (const chunk of bridge.streamMessage('Hi')) {
        collected.push(chunk);
      }

      expect(collected).toHaveLength(3);
      expect(collected[0]).toEqual({ type: 'text_delta', content: 'Hello' });
      expect(collected[2].type).toBe('done');
      expect(collected[2].content).toBe('Hello world');
    });

    it('adds assistant message to history on done chunk', async () => {
      const streamChunks = [
        { type: 'text_delta', content: 'Streamed' },
        { type: 'done', content: 'Streamed reply', usage: {}, provider: 'x', model: 'x' },
      ];

      mockUnifiedAIProvider.callStream.mockReturnValueOnce(
        (mockAsyncGenerator(streamChunks))()
      );

      // Must consume the generator
      for await (const _ of bridge.streamMessage('Q')) {}

      const history = bridge.getConversationHistory();
      expect(history).toEqual([
        { role: 'user', content: 'Q' },
        { role: 'assistant', content: 'Streamed reply' },
      ]);
    });

    it('resets history on newConversation: true', async () => {
      // First: fill some history via sendMessage
      mockUnifiedAIProvider.call.mockResolvedValueOnce({
        content: 'Old', provider: 'x', model: 'x', usage: {}, latencyMs: 0,
      });
      await bridge.sendMessage('Old');

      // Then stream with newConversation
      const streamChunks = [
        { type: 'done', content: 'New streamed', usage: {}, provider: 'x', model: 'x' },
      ];
      mockUnifiedAIProvider.callStream.mockReturnValueOnce(
        (mockAsyncGenerator(streamChunks))()
      );

      for await (const _ of bridge.streamMessage('Fresh', { newConversation: true })) {}

      const history = bridge.getConversationHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({ role: 'user', content: 'Fresh' });
    });

    it('removes user message from history on stream error', async () => {
      mockUnifiedAIProvider.callStream.mockReturnValueOnce(
        (async function* () {
          throw new Error('Stream failed');
        })()
      );

      await expect(async () => {
        for await (const _ of bridge.streamMessage('Fails')) {}
      }).rejects.toThrow('Stream failed');

      expect(bridge.getConversationHistory()).toHaveLength(0);
    });
  });

  // =========================================================================
  // generateText()
  // =========================================================================

  describe('generateText()', () => {
    it('calls call() with a single user message', async () => {
      mockUnifiedAIProvider.call.mockResolvedValueOnce({
        content: 'Generated text',
        provider: 'openrouter',
        model: 'or-test',
        usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
        latencyMs: 80,
      });

      const result = await bridge.generateText('Summarize this', {
        provider: 'anthropic',
        model: 'claude-test',
      });

      expect(result.response).toBe('Generated text');
      expect(result.content).toBe('Generated text');

      const callArgs = mockUnifiedAIProvider.call.mock.calls[0][0];
      expect(callArgs.messages).toEqual([{ role: 'user', content: 'Summarize this' }]);
    });

    it('does not affect conversation history', async () => {
      // First set up some history
      mockUnifiedAIProvider.call
        .mockResolvedValueOnce({ content: 'Chat reply', provider: 'x', model: 'x', usage: {}, latencyMs: 0 })
        .mockResolvedValueOnce({ content: 'Generated', provider: 'x', model: 'x', usage: {}, latencyMs: 0 });

      await bridge.sendMessage('Chat message');
      const historyBefore = bridge.getConversationHistory();

      await bridge.generateText('Generate something');
      const historyAfter = bridge.getConversationHistory();

      // History should be unchanged
      expect(historyAfter).toEqual(historyBefore);
    });
  });

  // =========================================================================
  // resolveProvider() — tested indirectly via sendMessage
  // =========================================================================

  describe('provider resolution (via sendMessage)', () => {
    beforeEach(() => {
      mockUnifiedAIProvider.call.mockResolvedValue({
        content: 'ok', provider: 'x', model: 'x', usage: {}, latencyMs: 0,
      });
    });

    it('maps "auto" to undefined (lets tutor-core auto-detect)', async () => {
      await bridge.sendMessage('test', { provider: 'auto' });
      const callArgs = mockUnifiedAIProvider.call.mock.calls[0][0];
      expect(callArgs.provider).toBeUndefined();
    });

    it('maps "lmstudio" to "local"', async () => {
      await bridge.sendMessage('test', { provider: 'lmstudio' });
      const callArgs = mockUnifiedAIProvider.call.mock.calls[0][0];
      expect(callArgs.provider).toBe('local');
    });

    it('maps "claude" to "anthropic"', async () => {
      await bridge.sendMessage('test', { provider: 'claude' });
      const callArgs = mockUnifiedAIProvider.call.mock.calls[0][0];
      expect(callArgs.provider).toBe('anthropic');
    });

    it('maps "google" to "gemini"', async () => {
      await bridge.sendMessage('test', { provider: 'google' });
      const callArgs = mockUnifiedAIProvider.call.mock.calls[0][0];
      expect(callArgs.provider).toBe('gemini');
    });

    it('passes through unknown provider names', async () => {
      await bridge.sendMessage('test', { provider: 'openrouter' });
      const callArgs = mockUnifiedAIProvider.call.mock.calls[0][0];
      expect(callArgs.provider).toBe('openrouter');
    });

    it('maps "auto" model to undefined', async () => {
      await bridge.sendMessage('test', { model: 'auto' });
      const callArgs = mockUnifiedAIProvider.call.mock.calls[0][0];
      expect(callArgs.model).toBeUndefined();
    });

    it('maps "default" model to undefined', async () => {
      await bridge.sendMessage('test', { model: 'default' });
      const callArgs = mockUnifiedAIProvider.call.mock.calls[0][0];
      expect(callArgs.model).toBeUndefined();
    });

    it('passes through specific model names', async () => {
      await bridge.sendMessage('test', { model: 'claude-sonnet-4-5' });
      const callArgs = mockUnifiedAIProvider.call.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-sonnet-4-5');
    });
  });

  // =========================================================================
  // Provider management
  // =========================================================================

  describe('provider management', () => {
    // getAvailableProviders() and getDefaultProvider() check the cached
    // tutorCore variable directly (not via loadTutorCore()). We need to
    // trigger loading first by calling initTutorBridge().
    beforeEach(async () => {
      await bridge.initTutorBridge();
    });

    it('getAvailableProviders() returns configured providers', () => {
      const providers = bridge.getAvailableProviders();
      expect(providers).toContain('gemini');
      expect(providers).toContain('claude');
      expect(providers).toContain('openrouter');
      expect(providers).toContain('local');
      // openai is not configured in our mock
      expect(providers).not.toContain('openai');
    });

    it('setDefaultProvider("auto") clears the override', () => {
      bridge.setDefaultProvider('anthropic');
      expect(bridge.getDefaultProvider()).toBe('anthropic');

      bridge.setDefaultProvider('auto');
      // Should fall back to tutor-core's getAvailableProvider
      expect(bridge.getDefaultProvider()).toBe('openrouter');
    });

    it('setDefaultProvider("anthropic") persists as override', () => {
      bridge.setDefaultProvider('anthropic');
      expect(bridge.getDefaultProvider()).toBe('anthropic');
    });

    it('getDefaultProvider() returns override when set, otherwise auto-detected', () => {
      // No override set
      const defaultProv = bridge.getDefaultProvider();
      expect(defaultProv).toBe('openrouter'); // from mock getAvailableProvider

      // Set override
      bridge.setDefaultProvider('gemini');
      expect(bridge.getDefaultProvider()).toBe('gemini');
    });

    it('getProviderModels() returns model lists for known providers', () => {
      expect(bridge.getProviderModels('anthropic').length).toBeGreaterThan(0);
      expect(bridge.getProviderModels('openai').length).toBeGreaterThan(0);
      expect(bridge.getProviderModels('local')).toEqual(['local-model']);
    });

    it('getProviderModels() returns empty array for unknown provider', () => {
      expect(bridge.getProviderModels('unknown')).toEqual([]);
    });
  });

  // =========================================================================
  // Conversation management
  // =========================================================================

  describe('conversation management', () => {
    it('clearConversation() empties history', async () => {
      mockUnifiedAIProvider.call.mockResolvedValueOnce({
        content: 'ok', provider: 'x', model: 'x', usage: {}, latencyMs: 0,
      });
      await bridge.sendMessage('Q');

      expect(bridge.getConversationHistory()).toHaveLength(2);

      bridge.clearConversation();
      expect(bridge.getConversationHistory()).toHaveLength(0);
    });

    it('getConversationHistory() returns a copy (not a reference)', async () => {
      mockUnifiedAIProvider.call.mockResolvedValueOnce({
        content: 'ok', provider: 'x', model: 'x', usage: {}, latencyMs: 0,
      });
      await bridge.sendMessage('Q');

      const history1 = bridge.getConversationHistory();
      const history2 = bridge.getConversationHistory();
      expect(history1).toEqual(history2);
      expect(history1).not.toBe(history2); // different references
    });
  });

  // =========================================================================
  // updateLocalAIUrl
  // =========================================================================

  describe('updateLocalAIUrl()', () => {
    const originalUrl = process.env.LOCAL_AI_URL;

    afterEach(() => {
      if (originalUrl !== undefined) {
        process.env.LOCAL_AI_URL = originalUrl;
      } else {
        delete process.env.LOCAL_AI_URL;
      }
    });

    it('sets process.env.LOCAL_AI_URL', () => {
      bridge.updateLocalAIUrl('http://custom:5555');
      expect(process.env.LOCAL_AI_URL).toBe('http://custom:5555');
    });

    it('does not set env var when url is falsy', () => {
      const before = process.env.LOCAL_AI_URL;
      bridge.updateLocalAIUrl('');
      expect(process.env.LOCAL_AI_URL).toBe(before);
    });
  });

  // =========================================================================
  // getCurrentConfiguration
  // =========================================================================

  describe('getCurrentConfiguration()', () => {
    it('returns { provider, model, availableProviders }', () => {
      const config = bridge.getCurrentConfiguration();
      expect(config).toHaveProperty('provider');
      expect(config).toHaveProperty('model');
      expect(config).toHaveProperty('availableProviders');
      expect(Array.isArray(config.availableProviders)).toBe(true);
    });
  });

  // =========================================================================
  // sendMessage uses default provider override
  // =========================================================================

  describe('sendMessage respects default provider override', () => {
    it('uses the override provider when set', async () => {
      bridge.setDefaultProvider('gemini');

      mockUnifiedAIProvider.call.mockResolvedValueOnce({
        content: 'ok', provider: 'gemini', model: 'gemini-test', usage: {}, latencyMs: 0,
      });

      // Send with 'auto' — should resolve to the override
      await bridge.sendMessage('test', { provider: 'auto' });

      const callArgs = mockUnifiedAIProvider.call.mock.calls[0][0];
      expect(callArgs.provider).toBe('gemini');
    });
  });
});

// ===========================================================================
// tutor-core unavailable
// ===========================================================================

describe('tutor-bridge AI chat (tutor-core unavailable)', () => {
  let bridge;

  beforeEach(() => {
    jest.clearAllMocks();
    bridge = createBridgeWithMock(null);
  });

  it('sendMessage() throws', async () => {
    await expect(bridge.sendMessage('test')).rejects.toThrow(/not available/);
  });

  it('streamMessage() throws', async () => {
    await expect(async () => {
      for await (const _ of bridge.streamMessage('test')) {}
    }).rejects.toThrow(/not available/);
  });

  it('generateText() throws', async () => {
    await expect(bridge.generateText('test')).rejects.toThrow(/not available/);
  });

  it('getAvailableProviders() returns empty array', () => {
    expect(bridge.getAvailableProviders()).toEqual([]);
  });

  it('getDefaultProvider() returns null', () => {
    expect(bridge.getDefaultProvider()).toBeNull();
  });

  it('getCurrentConfiguration() returns empty availableProviders', () => {
    const config = bridge.getCurrentConfiguration();
    expect(config.availableProviders).toEqual([]);
  });
});

/**
 * Tests for Techne AI Tutor Plugin
 *
 * Covers:
 * - Plugin registration
 * - TechneAITutor global API
 * - Tour lifecycle (start, stop, pause, resume)
 * - Event system
 * - AI adapter interface (Electron and Web)
 * - Progress persistence
 */

const path = require('path');

const pluginPath = path.resolve(__dirname, '../../../../plugins/techne-ai-tutor/plugin.js');

describe('Techne AI Tutor - Plugin Registration', () => {
  beforeEach(() => {
    jest.resetModules();

    // Setup localStorage mock
    const localStorageData = {};
    Storage.prototype.getItem = jest.fn((key) => localStorageData[key] || null);
    Storage.prototype.setItem = jest.fn((key, value) => { localStorageData[key] = value; });
    Storage.prototype.removeItem = jest.fn((key) => { delete localStorageData[key]; });

    // Reset globals
    delete window.TechnePlugins;
    delete window.TechneAITutor;
    delete window.electronAPI;

    // Minimal TechnePlugins mock
    window.TechnePlugins = {
      register: jest.fn()
    };

    // Reset DOM
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  afterEach(() => {
    // Cleanup - use parentNode.removeChild for jsdom compatibility
    const container = document.getElementById('techne-ai-tutor-container');
    if (container && container.parentNode) container.parentNode.removeChild(container);

    const trigger = document.getElementById('tutor-trigger-btn');
    if (trigger && trigger.parentNode) trigger.parentNode.removeChild(trigger);
  });

  test('registers plugin with correct id', () => {
    require(pluginPath);

    expect(window.TechnePlugins.register).toHaveBeenCalled();

    const plugin = window.TechnePlugins.register.mock.calls[0][0];
    expect(plugin.id).toBe('techne-ai-tutor');
  });

  test('plugin has required methods', () => {
    require(pluginPath);

    const plugin = window.TechnePlugins.register.mock.calls[0][0];

    expect(typeof plugin.init).toBe('function');
    expect(typeof plugin.destroy).toBe('function');
  });

  test('exposes TechneAITutor API after init', () => {
    require(pluginPath);

    const plugin = window.TechnePlugins.register.mock.calls[0][0];
    const host = { log: jest.fn(), emit: jest.fn() };

    plugin.init(host);

    expect(window.TechneAITutor).toBeDefined();
  });

  test('TechneAITutor has complete API', () => {
    require(pluginPath);

    const plugin = window.TechnePlugins.register.mock.calls[0][0];
    plugin.init({ log: jest.fn(), emit: jest.fn() });

    const api = window.TechneAITutor;

    // Check all API methods exist
    expect(typeof api.start).toBe('function');
    expect(typeof api.stop).toBe('function');
    expect(typeof api.pause).toBe('function');
    expect(typeof api.resume).toBe('function');
    expect(typeof api.next).toBe('function');
    expect(typeof api.prev).toBe('function');
    expect(typeof api.ask).toBe('function');
    expect(typeof api.setMode).toBe('function');
    expect(typeof api.hasProgress).toBe('function');
    expect(typeof api.clearProgress).toBe('function');
    expect(typeof api.isActive).toBe('function');
    expect(typeof api.isPaused).toBe('function');
    expect(typeof api.on).toBe('function');
    expect(typeof api.off).toBe('function');
  });
});

describe('Techne AI Tutor - Tour State', () => {
  let plugin;
  let host;

  beforeEach(() => {
    jest.resetModules();

    const localStorageData = {};
    Storage.prototype.getItem = jest.fn((key) => localStorageData[key] || null);
    Storage.prototype.setItem = jest.fn((key, value) => { localStorageData[key] = value; });
    Storage.prototype.removeItem = jest.fn((key) => { delete localStorageData[key]; });

    delete window.TechnePlugins;
    delete window.TechneAITutor;
    delete window.electronAPI;

    window.TechnePlugins = { register: jest.fn() };
    document.body.innerHTML = '<div class="editor-container"></div>';
    document.head.innerHTML = '';

    require(pluginPath);

    plugin = window.TechnePlugins.register.mock.calls[0][0];
    host = { log: jest.fn(), emit: jest.fn() };
    plugin.init(host);
  });

  afterEach(() => {
    window.TechneAITutor.stop();
  });

  test('isActive returns false initially', () => {
    expect(window.TechneAITutor.isActive()).toBe(false);
  });

  test('isPaused returns false initially', () => {
    expect(window.TechneAITutor.isPaused()).toBe(false);
  });

  test('isActive returns true after start', async () => {
    await window.TechneAITutor.start();
    expect(window.TechneAITutor.isActive()).toBe(true);
  });

  test('isActive returns false after stop', async () => {
    await window.TechneAITutor.start();
    window.TechneAITutor.stop();
    expect(window.TechneAITutor.isActive()).toBe(false);
  });

  test('isPaused returns true after pause', async () => {
    await window.TechneAITutor.start();
    window.TechneAITutor.pause();
    expect(window.TechneAITutor.isPaused()).toBe(true);
  });

  test('isPaused returns false after resume', async () => {
    await window.TechneAITutor.start();
    window.TechneAITutor.pause();
    window.TechneAITutor.resume();
    expect(window.TechneAITutor.isPaused()).toBe(false);
  });
});

describe('Techne AI Tutor - Event System', () => {
  let plugin;

  beforeEach(() => {
    jest.resetModules();

    const localStorageData = {};
    Storage.prototype.getItem = jest.fn((key) => localStorageData[key] || null);
    Storage.prototype.setItem = jest.fn((key, value) => { localStorageData[key] = value; });
    Storage.prototype.removeItem = jest.fn((key) => { delete localStorageData[key]; });

    delete window.TechnePlugins;
    delete window.TechneAITutor;
    delete window.electronAPI;

    window.TechnePlugins = { register: jest.fn() };
    document.body.innerHTML = '<div class="editor-container"></div>';
    document.head.innerHTML = '';

    require(pluginPath);

    plugin = window.TechnePlugins.register.mock.calls[0][0];
    plugin.init({ log: jest.fn(), emit: jest.fn() });
  });

  afterEach(() => {
    window.TechneAITutor.stop();
  });

  test('emits tour:started on start', async () => {
    const handler = jest.fn();
    window.TechneAITutor.on('tour:started', handler);

    await window.TechneAITutor.start();

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ step: 0 })
    );
  });

  test('emits tour:stopped on stop', async () => {
    const handler = jest.fn();
    window.TechneAITutor.on('tour:stopped', handler);

    await window.TechneAITutor.start();
    window.TechneAITutor.stop();

    expect(handler).toHaveBeenCalled();
  });

  test('emits tour:paused on pause', async () => {
    const handler = jest.fn();
    window.TechneAITutor.on('tour:paused', handler);

    await window.TechneAITutor.start();
    window.TechneAITutor.pause();

    expect(handler).toHaveBeenCalled();
  });

  test('emits tour:resumed on resume', async () => {
    const handler = jest.fn();
    window.TechneAITutor.on('tour:resumed', handler);

    await window.TechneAITutor.start();
    window.TechneAITutor.pause();
    window.TechneAITutor.resume();

    expect(handler).toHaveBeenCalled();
  });

  test('off removes event handler', async () => {
    const handler = jest.fn();
    window.TechneAITutor.on('tour:started', handler);
    window.TechneAITutor.off('tour:started', handler);

    await window.TechneAITutor.start();

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('Techne AI Tutor - Progress Persistence', () => {
  let localStorageData;

  beforeEach(() => {
    jest.resetModules();

    localStorageData = {};
    Storage.prototype.getItem = jest.fn((key) => localStorageData[key] || null);
    Storage.prototype.setItem = jest.fn((key, value) => { localStorageData[key] = value; });
    Storage.prototype.removeItem = jest.fn((key) => { delete localStorageData[key]; });

    delete window.TechnePlugins;
    delete window.TechneAITutor;
    delete window.electronAPI;

    window.TechnePlugins = { register: jest.fn() };
    document.body.innerHTML = '<div class="editor-container"></div>';
    document.head.innerHTML = '';

    require(pluginPath);

    const plugin = window.TechnePlugins.register.mock.calls[0][0];
    plugin.init({ log: jest.fn(), emit: jest.fn() });
  });

  afterEach(() => {
    window.TechneAITutor.stop();
  });

  test('hasProgress returns false with no saved progress', () => {
    // hasProgress returns null (falsy) or the progress object
    expect(window.TechneAITutor.hasProgress()).toBeFalsy();
  });

  test('clearProgress removes saved data', () => {
    localStorageData['techne-ai-tutor-progress'] = JSON.stringify({
      currentStepIndex: 2,
      timestamp: Date.now()
    });

    window.TechneAITutor.clearProgress();

    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('techne-ai-tutor-progress');
  });

  test('saves progress on pause', async () => {
    await window.TechneAITutor.start();
    window.TechneAITutor.pause();

    expect(Storage.prototype.setItem).toHaveBeenCalled();

    const savedData = JSON.parse(localStorageData['techne-ai-tutor-progress']);
    expect(savedData).toHaveProperty('currentStepIndex');
    expect(savedData).toHaveProperty('timestamp');
  });
});

describe('Techne AI Tutor - AI Adapter (Web Mode)', () => {
  let fetchMock;

  beforeEach(() => {
    jest.resetModules();

    const localStorageData = {};
    Storage.prototype.getItem = jest.fn((key) => localStorageData[key] || null);
    Storage.prototype.setItem = jest.fn((key, value) => { localStorageData[key] = value; });
    Storage.prototype.removeItem = jest.fn((key) => { delete localStorageData[key]; });

    delete window.TechnePlugins;
    delete window.TechneAITutor;
    delete window.electronAPI; // Ensure not in Electron mode

    // Mock fetch
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ reply: 'Test AI response' })
    });
    global.fetch = fetchMock;

    window.TechnePlugins = { register: jest.fn() };
    document.body.innerHTML = '<div class="editor-container"></div>';
    document.head.innerHTML = '';

    require(pluginPath);

    const plugin = window.TechnePlugins.register.mock.calls[0][0];
    plugin.init({ log: jest.fn(), emit: jest.fn() });
  });

  afterEach(() => {
    window.TechneAITutor.stop();
    delete global.fetch;
  });

  test('uses fetch API for AI requests in web mode', async () => {
    await window.TechneAITutor.start();

    const response = await window.TechneAITutor.ask('Test question');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({
        method: 'POST'
      })
    );
  });

  test('returns response from web API', async () => {
    await window.TechneAITutor.start();

    const response = await window.TechneAITutor.ask('Test question');

    expect(response).toBe('Test AI response');
  });

  test('handles API errors gracefully', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'));

    await window.TechneAITutor.start();

    const response = await window.TechneAITutor.ask('Test question');

    // Should return error message, not throw
    expect(response).toContain('error');
  });
});

describe('Techne AI Tutor - AI Adapter (Electron Mode)', () => {
  let mockInvoke;

  beforeEach(() => {
    jest.resetModules();

    const localStorageData = {};
    Storage.prototype.getItem = jest.fn((key) => localStorageData[key] || null);
    Storage.prototype.setItem = jest.fn((key, value) => { localStorageData[key] = value; });
    Storage.prototype.removeItem = jest.fn((key) => { delete localStorageData[key]; });

    delete window.TechnePlugins;
    delete window.TechneAITutor;

    // Setup Electron mock
    mockInvoke = jest.fn().mockResolvedValue({ content: 'Electron AI response' });
    window.electronAPI = {
      isElectron: true,
      invoke: mockInvoke
    };

    window.TechnePlugins = { register: jest.fn() };
    document.body.innerHTML = '<div class="editor-container"></div>';
    document.head.innerHTML = '';

    require(pluginPath);

    const plugin = window.TechnePlugins.register.mock.calls[0][0];
    plugin.init({ log: jest.fn(), emit: jest.fn() });
  });

  afterEach(() => {
    window.TechneAITutor.stop();
    delete window.electronAPI;
  });

  test('uses IPC for AI requests in Electron mode', async () => {
    await window.TechneAITutor.start();

    await window.TechneAITutor.ask('Test question');

    expect(mockInvoke).toHaveBeenCalledWith(
      'send-chat-message-with-options',
      expect.objectContaining({
        message: 'Test question'
      })
    );
  });

  test('returns response from Electron IPC', async () => {
    await window.TechneAITutor.start();

    const response = await window.TechneAITutor.ask('Test question');

    expect(response).toBe('Electron AI response');
  });

  test('includes system prompt with context', async () => {
    await window.TechneAITutor.start();

    await window.TechneAITutor.ask('How do I format text?');

    const callArgs = mockInvoke.mock.calls[0][1];
    expect(callArgs.systemMessage).toContain('NightOwl');
    expect(callArgs.systemMessage).toContain('Step');
  });

  test('handles IPC errors gracefully', async () => {
    mockInvoke.mockRejectedValue(new Error('IPC error'));

    await window.TechneAITutor.start();

    const response = await window.TechneAITutor.ask('Test question');

    expect(response).toContain('error');
  });
});

describe('Techne AI Tutor - Tour Mode', () => {
  beforeEach(() => {
    jest.resetModules();

    const localStorageData = {};
    Storage.prototype.getItem = jest.fn((key) => localStorageData[key] || null);
    Storage.prototype.setItem = jest.fn((key, value) => { localStorageData[key] = value; });
    Storage.prototype.removeItem = jest.fn((key) => { delete localStorageData[key]; });

    delete window.TechnePlugins;
    delete window.TechneAITutor;
    delete window.electronAPI;

    window.TechnePlugins = { register: jest.fn() };
    document.body.innerHTML = '<div class="editor-container"></div>';
    document.head.innerHTML = '';

    require(pluginPath);

    const plugin = window.TechnePlugins.register.mock.calls[0][0];
    plugin.init({ log: jest.fn(), emit: jest.fn() });
  });

  afterEach(() => {
    window.TechneAITutor.stop();
  });

  test('starts in quick mode by default', async () => {
    const handler = jest.fn();
    window.TechneAITutor.on('tour:started', handler);

    await window.TechneAITutor.start();

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'quick' })
    );
  });

  test('can start in detailed mode', async () => {
    const handler = jest.fn();
    window.TechneAITutor.on('tour:started', handler);

    await window.TechneAITutor.start({ mode: 'detailed' });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'detailed' })
    );
  });

  test('emits mode:changed when switching modes', async () => {
    const handler = jest.fn();
    window.TechneAITutor.on('mode:changed', handler);

    await window.TechneAITutor.start({ mode: 'quick' });
    window.TechneAITutor.setMode('detailed');

    expect(handler).toHaveBeenCalledWith({ mode: 'detailed' });
  });
});

describe('Techne AI Tutor - Host Integration', () => {
  test('emits ai-tutor:ready on init (web mode)', () => {
    jest.resetModules();

    const localStorageData = {};
    Storage.prototype.getItem = jest.fn((key) => localStorageData[key] || null);
    Storage.prototype.setItem = jest.fn((key, value) => { localStorageData[key] = value; });
    Storage.prototype.removeItem = jest.fn((key) => { delete localStorageData[key]; });

    delete window.TechnePlugins;
    delete window.TechneAITutor;
    delete window.electronAPI;

    window.TechnePlugins = { register: jest.fn() };
    document.body.innerHTML = '';
    document.head.innerHTML = '';

    require(pluginPath);

    const plugin = window.TechnePlugins.register.mock.calls[0][0];
    const host = { log: jest.fn(), emit: jest.fn() };

    plugin.init(host);

    expect(host.emit).toHaveBeenCalledWith('ai-tutor:ready', { isElectron: false });
  });

  test('emits ai-tutor:ready on init (Electron mode)', () => {
    jest.resetModules();

    const localStorageData = {};
    Storage.prototype.getItem = jest.fn((key) => localStorageData[key] || null);
    Storage.prototype.setItem = jest.fn((key, value) => { localStorageData[key] = value; });
    Storage.prototype.removeItem = jest.fn((key) => { delete localStorageData[key]; });

    delete window.TechnePlugins;
    delete window.TechneAITutor;

    window.electronAPI = {
      isElectron: true,
      invoke: jest.fn()
    };

    window.TechnePlugins = { register: jest.fn() };
    document.body.innerHTML = '';
    document.head.innerHTML = '';

    require(pluginPath);

    const plugin = window.TechnePlugins.register.mock.calls[0][0];
    const host = { log: jest.fn(), emit: jest.fn() };

    plugin.init(host);

    expect(host.emit).toHaveBeenCalledWith('ai-tutor:ready', { isElectron: true });

    delete window.electronAPI;
  });

  test('logs initialization message', () => {
    jest.resetModules();

    const localStorageData = {};
    Storage.prototype.getItem = jest.fn((key) => localStorageData[key] || null);
    Storage.prototype.setItem = jest.fn((key, value) => { localStorageData[key] = value; });
    Storage.prototype.removeItem = jest.fn((key) => { delete localStorageData[key]; });

    delete window.TechnePlugins;
    delete window.TechneAITutor;
    delete window.electronAPI;

    window.TechnePlugins = { register: jest.fn() };
    document.body.innerHTML = '';
    document.head.innerHTML = '';

    require(pluginPath);

    const plugin = window.TechnePlugins.register.mock.calls[0][0];
    const host = { log: jest.fn(), emit: jest.fn() };

    plugin.init(host);

    expect(host.log).toHaveBeenCalledWith('AI Tutor plugin initialized');
  });
});

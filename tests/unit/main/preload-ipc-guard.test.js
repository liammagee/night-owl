const {
  ALLOWED_INVOKE_CHANNELS,
  ALLOWED_ON_CHANNELS,
  ALLOWED_SEND_CHANNELS,
  createCapabilityApi,
  getInvokeContract,
  validateInvokeArgs
} = require('../../../preload-ipc-guard');

describe('preload IPC guard', () => {
  function createIpcRendererMock() {
    return {
      invoke: jest.fn(async () => ({ success: true })),
      on: jest.fn(),
      removeListener: jest.fn(),
      removeAllListeners: jest.fn(),
      send: jest.fn()
    };
  }

  test('exposes fixed capability methods and strips event objects from listeners', async () => {
    const ipcRenderer = createIpcRendererMock();
    const bridge = createCapabilityApi(ipcRenderer, { platform: 'test' });
    const listener = jest.fn();

    await expect(bridge.settings.getSettings()).resolves.toEqual({ success: true });
    await expect(bridge.search.workspaceIndexSearch({
      query: 'accept',
      options: { maxResults: 10 }
    })).resolves.toEqual({ success: true });
    const unsubscribe = bridge.events.settingsChanged(listener);
    bridge.signals.saveLayout({ width: 300 });

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-settings');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('workspace-index-search', {
      query: 'accept',
      options: { maxResults: 10 }
    });
    expect(ipcRenderer.on).toHaveBeenCalledWith('settings-changed', expect.any(Function));
    expect(ipcRenderer.send).toHaveBeenCalledWith('save-layout', { width: 300 });

    const subscription = ipcRenderer.on.mock.calls[0][1];
    subscription({ sender: 'main' }, { theme: 'dark' });
    expect(listener).toHaveBeenCalledWith({ theme: 'dark' });

    unsubscribe();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('settings-changed', subscription);
  });

  test('does not expose a string-based invoke, on, or send escape hatch', () => {
    const bridge = createCapabilityApi(createIpcRendererMock());

    expect(bridge.invoke).toBeUndefined();
    expect(bridge.on).toBeUndefined();
    expect(bridge.send).toBeUndefined();
    expect(bridge.git.status).toEqual(expect.any(Function));
    expect(bridge.terminal.exec).toEqual(expect.any(Function));
    expect(bridge.feed.setCredential).toEqual(expect.any(Function));
    expect(Object.isFrozen(bridge)).toBe(true);
  });

  test('rejects malformed privileged payloads before they reach ipcRenderer', () => {
    const ipcRenderer = createIpcRendererMock();
    const bridge = createCapabilityApi(ipcRenderer);

    expect(() => bridge.terminal.exec({ cwd: '/tmp' })).toThrow(/Invalid payload for terminal-exec/);
    expect(() => bridge.git.stage({ repoRoot: '/repo', paths: 'all' })).toThrow(/request.paths/);
    expect(() => bridge.files.saveFile({ filePath: '/tmp/a.md' })).toThrow(/file.content/);
    expect(() => bridge.collaboration.startServer({ port: 70000 })).toThrow(/options.port/);
    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
  });

  test('keeps the expected channel sets explicit', () => {
    expect(ALLOWED_INVOKE_CHANNELS.has('perform-save-with-path')).toBe(true);
    expect(ALLOWED_INVOKE_CHANNELS.has('feed:list-sources')).toBe(true);
    expect(ALLOWED_INVOKE_CHANNELS.has('get-file-tree-signature')).toBe(true);
    expect(ALLOWED_INVOKE_CHANNELS.has('get-tutor-core-status')).toBe(true);
    expect(ALLOWED_INVOKE_CHANNELS.has('terminal-resize')).toBe(true);
    expect(ALLOWED_INVOKE_CHANNELS.has('performance:get-resource-diagnostics')).toBe(true);
    expect(ALLOWED_INVOKE_CHANNELS.has('shell-run')).toBe(false);
    expect(ALLOWED_ON_CHANNELS.has('settings-changed')).toBe(true);
    expect(ALLOWED_ON_CHANNELS.has('feed:items')).toBe(true);
    expect(ALLOWED_ON_CHANNELS.has('feed:scored')).toBe(true);
    expect(ALLOWED_ON_CHANNELS.has('feed:source-error')).toBe(true);
    expect(ALLOWED_ON_CHANNELS.has('toggle-assistant-terminal')).toBe(true);
    expect(ALLOWED_ON_CHANNELS.has('open-diagnostics')).toBe(true);
    expect(ALLOWED_SEND_CHANNELS.has('save-layout')).toBe(true);
    expect(getInvokeContract('git-stage')).toEqual({
      channel: 'git-stage',
      capability: 'git',
      method: 'stage'
    });
    expect(getInvokeContract('read-file')).toEqual({
      channel: 'read-file',
      capability: 'files',
      method: 'readFile'
    });
  });

  test('validates privileged payloads for the main-process boundary too', () => {
    expect(() => validateInvokeArgs('terminal-write', [{ data: 'ls\n' }])).not.toThrow();
    expect(() => validateInvokeArgs('terminal-write', [{ data: () => {} }])).toThrow(/unsupported function data/);
    expect(() => validateInvokeArgs('shell-run', [])).toThrow(/Unknown invoke channel/);
  });

  test('accepts repeated serializable references but rejects actual cycles', () => {
    const shared = { value: 'same object' };
    expect(() => validateInvokeArgs('debug-log', [{ first: shared, second: shared }])).not.toThrow();

    const circular = {};
    circular.self = circular;
    expect(() => validateInvokeArgs('debug-log', [circular])).toThrow(/circular reference/);
  });
});

const {
  ALLOWED_INVOKE_CHANNELS,
  ALLOWED_ON_CHANNELS,
  ALLOWED_SEND_CHANNELS,
  createGuardedIpcBridge,
  removeAllAllowedListeners
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

  test('allows known app channels and strips the event object from listeners', async () => {
    const ipcRenderer = createIpcRendererMock();
    const bridge = createGuardedIpcBridge(ipcRenderer);
    const listener = jest.fn();

    await expect(bridge.invoke('get-settings')).resolves.toEqual({ success: true });
    const unsubscribe = bridge.on('settings-changed', listener);
    bridge.send('save-layout', { width: 300 });

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-settings');
    expect(ipcRenderer.on).toHaveBeenCalledWith('settings-changed', expect.any(Function));
    expect(ipcRenderer.send).toHaveBeenCalledWith('save-layout', { width: 300 });

    const subscription = ipcRenderer.on.mock.calls[0][1];
    subscription({ sender: 'main' }, { theme: 'dark' });
    expect(listener).toHaveBeenCalledWith({ theme: 'dark' });

    unsubscribe();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('settings-changed', subscription);
  });

  test('blocks arbitrary invoke, on, and send channels', () => {
    const bridge = createGuardedIpcBridge(createIpcRendererMock());

    expect(() => bridge.invoke('shell-run', 'rm -rf /')).toThrow(/Blocked invoke IPC channel/);
    expect(() => bridge.on('untrusted-event', () => {})).toThrow(/Blocked on IPC channel/);
    expect(() => bridge.send('untrusted-send')).toThrow(/Blocked send IPC channel/);
  });

  test('keeps the expected channel sets explicit', () => {
    expect(ALLOWED_INVOKE_CHANNELS.has('perform-save-with-path')).toBe(true);
    expect(ALLOWED_INVOKE_CHANNELS.has('feed:list-sources')).toBe(true);
    expect(ALLOWED_INVOKE_CHANNELS.has('shell-run')).toBe(false);
    expect(ALLOWED_ON_CHANNELS.has('settings-changed')).toBe(true);
    expect(ALLOWED_ON_CHANNELS.has('feed:items')).toBe(true);
    expect(ALLOWED_ON_CHANNELS.has('feed:scored')).toBe(true);
    expect(ALLOWED_ON_CHANNELS.has('feed:source-error')).toBe(true);
    expect(ALLOWED_ON_CHANNELS.has('toggle-assistant-terminal')).toBe(true);
    expect(ALLOWED_SEND_CHANNELS.has('save-layout')).toBe(true);
  });

  test('cleanup only removes allowlisted listener channels', () => {
    const ipcRenderer = createIpcRendererMock();
    removeAllAllowedListeners(ipcRenderer);

    expect(ipcRenderer.removeAllListeners).toHaveBeenCalledWith('settings-changed');
    expect(ipcRenderer.removeAllListeners).not.toHaveBeenCalledWith('shell-run');
  });
});

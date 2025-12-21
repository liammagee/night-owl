const path = require('path');

const pluginSystemPath = path.resolve(__dirname, '../../../../plugins/techne-plugin-system.js');

describe('Techne plugin system', () => {
  beforeEach(() => {
    jest.resetModules();

    window.TECHNE_PLUGIN_AUTOSTART = false;
    delete window.TECHNE_PLUGIN_MANIFEST;
    delete window.TechnePlugins;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  test('exposes expected API', () => {
    require(pluginSystemPath);

    expect(window.TechnePlugins).toBeTruthy();
    expect(typeof window.TechnePlugins.register).toBe('function');
    expect(typeof window.TechnePlugins.start).toBe('function');
    expect(typeof window.TechnePlugins.on).toBe('function');
    expect(typeof window.TechnePlugins.off).toBe('function');
    expect(typeof window.TechnePlugins.emit).toBe('function');
  });

  test('supports on/off/emit event bus', () => {
    require(pluginSystemPath);

    const handler = jest.fn();
    const unsubscribe = window.TechnePlugins.on('test:event', handler);
    window.TechnePlugins.emit('test:event', { ok: true });
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    window.TechnePlugins.emit('test:event', { ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('starts and inits an already-registered enabled plugin', async () => {
    require(pluginSystemPath);

    const init = jest.fn();
    window.TechnePlugins.register({
      id: 'dummy',
      init: async () => init()
    });

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: ['dummy'],
      manifest: [{ id: 'dummy', entry: 'noop.js', enabledByDefault: true }]
    });

    expect(init).toHaveBeenCalledTimes(1);
  });

  test('does not init a registered plugin when disabled', async () => {
    require(pluginSystemPath);

    const init = jest.fn();
    window.TechnePlugins.register({
      id: 'dummy-disabled',
      init: async () => init()
    });

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: [],
      manifest: [{ id: 'dummy-disabled', entry: 'noop.js', enabledByDefault: false }]
    });

    expect(init).not.toHaveBeenCalled();
  });

  test('can enable and load plugins on subsequent start() calls', async () => {
    require(pluginSystemPath);

    const init = jest.fn();

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: [],
      manifest: [{ id: 'dummy-late', entry: 'dummy-late.js', enabledByDefault: false }]
    });

    const activation = window.TechnePlugins.start({ enabled: ['dummy-late'] });

    // Allow the loader to inject the script tag.
    // Note: normalizePath adds '/' prefix in http:// protocol (Jest/jsdom)
    for (let i = 0; i < 5; i += 1) {
      const script = document.head.querySelector('script[src="/dummy-late.js"]');
      if (script) break;
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }

    const script = document.head.querySelector('script[src="/dummy-late.js"]');
    expect(script).toBeTruthy();

    window.TechnePlugins.register({
      id: 'dummy-late',
      init: async () => init()
    });

    script.onload();

    await activation;
    expect(init).toHaveBeenCalledTimes(1);
  });

  test('loadScript resolves when onload is triggered', async () => {
    require(pluginSystemPath);

    // Note: normalizePath adds '/' prefix in http:// protocol (Jest/jsdom)
    const promise = window.TechnePlugins.loadScript('foo.js');
    const script = document.head.querySelector('script[src="/foo.js"]');
    expect(script).toBeTruthy();
    script.onload();

    await expect(promise).resolves.toBe(true);

    const again = await window.TechnePlugins.loadScript('foo.js');
    expect(again).toBe(true);
    expect(document.head.querySelectorAll('script[src="/foo.js"]').length).toBe(1);
  });

  test('loadCSS resolves when onload is triggered', async () => {
    require(pluginSystemPath);

    // Note: normalizePath adds '/' prefix in http:// protocol (Jest/jsdom)
    const promise = window.TechnePlugins.loadCSS('foo.css');
    const link = document.head.querySelector('link[href="/foo.css"]');
    expect(link).toBeTruthy();
    link.onload();

    await expect(promise).resolves.toBe(true);

    const again = await window.TechnePlugins.loadCSS('foo.css');
    expect(again).toBe(true);
    expect(document.head.querySelectorAll('link[href="/foo.css"]').length).toBe(1);
  });
});

describe('Techne plugin system - Dependency Resolution', () => {
  beforeEach(() => {
    jest.resetModules();
    window.TECHNE_PLUGIN_AUTOSTART = false;
    delete window.TECHNE_PLUGIN_MANIFEST;
    delete window.TechnePlugins;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  test('resolves simple dependencies in correct order', async () => {
    require(pluginSystemPath);

    const initOrder = [];

    window.TechnePlugins.register({
      id: 'plugin-a',
      init: async () => initOrder.push('a')
    });

    window.TechnePlugins.register({
      id: 'plugin-b',
      init: async () => initOrder.push('b')
    });

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: ['plugin-a', 'plugin-b'],
      manifest: [
        { id: 'plugin-a', entry: 'a.js', enabledByDefault: true },
        { id: 'plugin-b', entry: 'b.js', enabledByDefault: true, dependencies: ['plugin-a'] }
      ]
    });

    // A should initialize before B
    expect(initOrder).toEqual(['a', 'b']);
  });

  test('resolves nested dependencies (A -> B -> C)', async () => {
    require(pluginSystemPath);

    const initOrder = [];

    window.TechnePlugins.register({
      id: 'dep-a',
      init: async () => initOrder.push('a')
    });

    window.TechnePlugins.register({
      id: 'dep-b',
      init: async () => initOrder.push('b')
    });

    window.TechnePlugins.register({
      id: 'dep-c',
      init: async () => initOrder.push('c')
    });

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: ['dep-a', 'dep-b', 'dep-c'],
      manifest: [
        { id: 'dep-a', entry: 'a.js', enabledByDefault: true },
        { id: 'dep-b', entry: 'b.js', enabledByDefault: true, dependencies: ['dep-a'] },
        { id: 'dep-c', entry: 'c.js', enabledByDefault: true, dependencies: ['dep-b'] }
      ]
    });

    // A -> B -> C order
    expect(initOrder).toEqual(['a', 'b', 'c']);
  });

  test('detects circular dependencies and warns', async () => {
    require(pluginSystemPath);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Just set up manifest without starting (which would try to load scripts)
    await window.TechnePlugins.start({
      appId: 'test',
      enabled: [],
      manifest: [
        { id: 'circ-a', entry: 'a.js', dependencies: ['circ-b'] },
        { id: 'circ-b', entry: 'b.js', dependencies: ['circ-a'] }
      ]
    });

    // getDependencies should warn about circular dependency
    const deps = window.TechnePlugins.getDependencies('circ-a');

    // The warn is called with prefix '[TechnePlugins]' and message
    expect(warnSpy).toHaveBeenCalledWith(
      '[TechnePlugins]',
      expect.stringContaining('Circular dependency')
    );

    warnSpy.mockRestore();
  });

  test('auto-enables dependencies when enabling a plugin', async () => {
    require(pluginSystemPath);

    window.TechnePlugins.register({
      id: 'base-plugin',
      init: jest.fn()
    });

    window.TechnePlugins.register({
      id: 'dependent-plugin',
      init: jest.fn()
    });

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: ['dependent-plugin'],
      manifest: [
        { id: 'base-plugin', entry: 'base.js', enabledByDefault: false },
        { id: 'dependent-plugin', entry: 'dependent.js', enabledByDefault: true, dependencies: ['base-plugin'] }
      ]
    });

    // base-plugin should be auto-enabled as a dependency
    expect(window.TechnePlugins.isEnabled('base-plugin')).toBe(true);
  });

  test('prevents disabling plugin with active dependents', async () => {
    require(pluginSystemPath);

    window.TechnePlugins.register({
      id: 'required-plugin',
      init: jest.fn()
    });

    window.TechnePlugins.register({
      id: 'requiring-plugin',
      init: jest.fn()
    });

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: ['required-plugin', 'requiring-plugin'],
      manifest: [
        { id: 'required-plugin', entry: 'required.js', enabledByDefault: true },
        { id: 'requiring-plugin', entry: 'requiring.js', enabledByDefault: true, dependencies: ['required-plugin'] }
      ]
    });

    // Should fail because requiring-plugin depends on required-plugin
    const result = window.TechnePlugins.disablePlugin('required-plugin');

    expect(result).toBe(false);
    expect(window.TechnePlugins.isEnabled('required-plugin')).toBe(true);
  });

  test('getDependents returns correct dependents list', async () => {
    require(pluginSystemPath);

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: [],
      manifest: [
        { id: 'core', entry: 'core.js' },
        { id: 'feature-a', entry: 'a.js', dependencies: ['core'] },
        { id: 'feature-b', entry: 'b.js', dependencies: ['core'] },
        { id: 'standalone', entry: 'standalone.js' }
      ]
    });

    const dependents = window.TechnePlugins.getDependents('core');

    expect(dependents).toContain('feature-a');
    expect(dependents).toContain('feature-b');
    expect(dependents).not.toContain('standalone');
    expect(dependents).not.toContain('core');
  });
});

describe('Techne plugin system - Settings Persistence', () => {
  let localStorageData = {};

  beforeEach(() => {
    jest.resetModules();
    window.TECHNE_PLUGIN_AUTOSTART = false;
    delete window.TECHNE_PLUGIN_MANIFEST;
    delete window.TechnePlugins;
    document.head.innerHTML = '';
    document.body.innerHTML = '';

    // Reset localStorage mock
    localStorageData = {};
    Storage.prototype.getItem = jest.fn((key) => localStorageData[key] || null);
    Storage.prototype.setItem = jest.fn((key, value) => { localStorageData[key] = value; });
    Storage.prototype.removeItem = jest.fn((key) => { delete localStorageData[key]; });
  });

  test('setPluginSettings stores and retrieves settings', () => {
    require(pluginSystemPath);

    const settings = { theme: 'dark', fontSize: 14 };
    window.TechnePlugins.setPluginSettings('test-plugin', settings);

    const retrieved = window.TechnePlugins.getPluginSettings('test-plugin');

    expect(retrieved).toEqual(settings);
  });

  test('settings persist to localStorage', () => {
    require(pluginSystemPath);

    window.TechnePlugins.setPluginSettings('persist-test', { key: 'value' });

    expect(Storage.prototype.setItem).toHaveBeenCalled();

    const storedData = JSON.parse(localStorageData['techne-plugin-settings'] || '{}');
    expect(storedData['persist-test']).toEqual({ key: 'value' });
  });

  test('updatePluginSettings merges with existing settings', () => {
    require(pluginSystemPath);

    window.TechnePlugins.setPluginSettings('merge-test', { a: 1, b: 2 });
    window.TechnePlugins.updatePluginSettings('merge-test', { b: 3, c: 4 });

    const settings = window.TechnePlugins.getPluginSettings('merge-test');

    expect(settings).toEqual({ a: 1, b: 3, c: 4 });
  });

  test('clearPluginSettings removes settings', () => {
    require(pluginSystemPath);

    window.TechnePlugins.setPluginSettings('clear-test', { data: 'test' });
    window.TechnePlugins.clearPluginSettings('clear-test');

    expect(window.TechnePlugins.getPluginSettings('clear-test')).toBeNull();
  });

  test('emits plugin:settings-changed event', () => {
    require(pluginSystemPath);

    const handler = jest.fn();
    window.TechnePlugins.on('plugin:settings-changed', handler);

    window.TechnePlugins.setPluginSettings('event-test', { value: 42 });

    expect(handler).toHaveBeenCalledWith({
      id: 'event-test',
      settings: { value: 42 },
      oldSettings: undefined
    });
  });

  test('host provides bound settings methods to plugins', async () => {
    require(pluginSystemPath);

    let capturedHost = null;

    window.TechnePlugins.register({
      id: 'host-settings-test',
      init: async (host) => {
        capturedHost = host;
        host.setSettings({ initialized: true });
      }
    });

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: ['host-settings-test'],
      manifest: [{ id: 'host-settings-test', entry: 'host.js', enabledByDefault: true }]
    });

    // Verify host has bound settings methods
    expect(typeof capturedHost.getSettings).toBe('function');
    expect(typeof capturedHost.setSettings).toBe('function');
    expect(typeof capturedHost.updateSettings).toBe('function');

    // Verify settings were stored
    expect(capturedHost.getSettings()).toEqual({ initialized: true });
  });

  test('returns null for unknown plugin settings', () => {
    require(pluginSystemPath);

    expect(window.TechnePlugins.getPluginSettings('nonexistent')).toBeNull();
  });
});

describe('Techne plugin system - Plugin Lifecycle', () => {
  beforeEach(() => {
    jest.resetModules();
    window.TECHNE_PLUGIN_AUTOSTART = false;
    delete window.TECHNE_PLUGIN_MANIFEST;
    delete window.TechnePlugins;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  test('calls destroy when disabling a plugin', async () => {
    require(pluginSystemPath);

    const destroyFn = jest.fn();

    window.TechnePlugins.register({
      id: 'destroy-test',
      init: jest.fn(),
      destroy: destroyFn
    });

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: ['destroy-test'],
      manifest: [{ id: 'destroy-test', entry: 'destroy.js', enabledByDefault: true }]
    });

    window.TechnePlugins.disablePlugin('destroy-test');

    expect(destroyFn).toHaveBeenCalled();
  });

  test('handles init errors gracefully', async () => {
    require(pluginSystemPath);

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    window.TechnePlugins.register({
      id: 'error-plugin',
      init: async () => { throw new Error('Init failed'); }
    });

    // Should not throw
    await expect(window.TechnePlugins.start({
      appId: 'test',
      enabled: ['error-plugin'],
      manifest: [{ id: 'error-plugin', entry: 'error.js', enabledByDefault: true }]
    })).resolves.toBeDefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('emits plugin:enabled and plugin:disabled events', async () => {
    require(pluginSystemPath);

    const enableHandler = jest.fn();
    const disableHandler = jest.fn();

    window.TechnePlugins.on('plugin:enabled', enableHandler);
    window.TechnePlugins.on('plugin:disabled', disableHandler);

    window.TechnePlugins.register({
      id: 'lifecycle-events',
      init: jest.fn()
    });

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: [],
      manifest: [{ id: 'lifecycle-events', entry: 'events.js', enabledByDefault: false }]
    });

    await window.TechnePlugins.enablePlugin('lifecycle-events');
    expect(enableHandler).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'lifecycle-events' })
    );

    window.TechnePlugins.disablePlugin('lifecycle-events');
    expect(disableHandler).toHaveBeenCalledWith({ id: 'lifecycle-events' });
  });

  test('does not re-initialize already initialized plugin', async () => {
    require(pluginSystemPath);

    const initFn = jest.fn();

    window.TechnePlugins.register({
      id: 'single-init',
      init: initFn
    });

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: ['single-init'],
      manifest: [{ id: 'single-init', entry: 'single.js', enabledByDefault: true }]
    });

    // Try to start again
    await window.TechnePlugins.start({
      appId: 'test',
      enabled: ['single-init'],
      manifest: [{ id: 'single-init', entry: 'single.js', enabledByDefault: true }]
    });

    expect(initFn).toHaveBeenCalledTimes(1);
  });
});

describe('Techne plugin system - Lazy Loading', () => {
  beforeEach(() => {
    jest.resetModules();
    window.TECHNE_PLUGIN_AUTOSTART = false;
    delete window.TECHNE_PLUGIN_MANIFEST;
    delete window.TechnePlugins;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  test('defers loading of lazy plugins', async () => {
    require(pluginSystemPath);

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: ['lazy-plugin'],
      manifest: [
        { id: 'lazy-plugin', entry: 'lazy.js', lazy: true, enabledByDefault: true }
      ]
    });

    expect(window.TechnePlugins.isLazy('lazy-plugin')).toBe(true);
    expect(window.TechnePlugins.getLazyPlugins()).toContain('lazy-plugin');
  });

  test('loads lazy plugin on demand', async () => {
    require(pluginSystemPath);

    const initFn = jest.fn();

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: ['demand-plugin'],
      manifest: [
        { id: 'demand-plugin', entry: 'demand.js', lazy: true, enabledByDefault: true }
      ]
    });

    // Pre-register the plugin (simulating script load completion)
    window.TechnePlugins.register({
      id: 'demand-plugin',
      init: initFn
    });

    const result = await window.TechnePlugins.loadPlugin('demand-plugin');

    expect(result.success).toBe(true);
    expect(initFn).toHaveBeenCalled();
    expect(window.TechnePlugins.isLazy('demand-plugin')).toBe(false);
  });

  test('fails to load non-enabled lazy plugin', async () => {
    require(pluginSystemPath);

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: [],
      manifest: [
        { id: 'disabled-lazy', entry: 'disabled.js', lazy: true, enabledByDefault: false }
      ]
    });

    const result = await window.TechnePlugins.loadPlugin('disabled-lazy');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not enabled');
  });
});

describe('Techne plugin system - Hot Reload', () => {
  beforeEach(() => {
    jest.resetModules();
    window.TECHNE_PLUGIN_AUTOSTART = false;
    delete window.TECHNE_PLUGIN_MANIFEST;
    delete window.TechnePlugins;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  test('rejects hot reload without dev mode', async () => {
    require(pluginSystemPath);

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: [],
      manifest: []
    });

    const result = await window.TechnePlugins.reloadPlugin('any-plugin');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Dev mode not enabled');
  });

  test('setDevMode and isDevMode work correctly', () => {
    require(pluginSystemPath);

    expect(window.TechnePlugins.isDevMode()).toBe(false);

    window.TechnePlugins.setDevMode(true);
    expect(window.TechnePlugins.isDevMode()).toBe(true);

    window.TechnePlugins.setDevMode(false);
    expect(window.TechnePlugins.isDevMode()).toBe(false);
  });

  test('enables dev mode via start options', async () => {
    require(pluginSystemPath);

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: [],
      manifest: [],
      devMode: true
    });

    expect(window.TechnePlugins.isDevMode()).toBe(true);
  });
});

describe('Techne plugin system - Host Capabilities', () => {
  beforeEach(() => {
    jest.resetModules();
    window.TECHNE_PLUGIN_AUTOSTART = false;
    delete window.TECHNE_PLUGIN_MANIFEST;
    delete window.TechnePlugins;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  test('extendHost adds custom methods to host', async () => {
    require(pluginSystemPath);

    window.TechnePlugins.extendHost({
      customMethod: () => 'custom-result',
      anotherMethod: (x) => x * 2
    });

    let hostResult = null;
    let hostResult2 = null;

    window.TechnePlugins.register({
      id: 'extend-test',
      init: async (host) => {
        hostResult = host.customMethod();
        hostResult2 = host.anotherMethod(21);
      }
    });

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: ['extend-test'],
      manifest: [{ id: 'extend-test', entry: 'extend.js', enabledByDefault: true }]
    });

    expect(hostResult).toBe('custom-result');
    expect(hostResult2).toBe(42);
  });

  test('host provides standard API methods', async () => {
    require(pluginSystemPath);

    let capturedHost = null;

    window.TechnePlugins.register({
      id: 'host-api-test',
      init: async (host) => { capturedHost = host; }
    });

    await window.TechnePlugins.start({
      appId: 'test-app',
      enabled: ['host-api-test'],
      manifest: [{ id: 'host-api-test', entry: 'api.js', enabledByDefault: true }]
    });

    expect(capturedHost.appId).toBe('test-app');
    expect(typeof capturedHost.on).toBe('function');
    expect(typeof capturedHost.off).toBe('function');
    expect(typeof capturedHost.emit).toBe('function');
    expect(typeof capturedHost.loadCSS).toBe('function');
    expect(typeof capturedHost.loadScript).toBe('function');
    expect(typeof capturedHost.log).toBe('function');
    expect(typeof capturedHost.warn).toBe('function');
    expect(typeof capturedHost.error).toBe('function');
  });
});

describe('Techne plugin system - Manifest Management', () => {
  beforeEach(() => {
    jest.resetModules();
    window.TECHNE_PLUGIN_AUTOSTART = false;
    delete window.TECHNE_PLUGIN_MANIFEST;
    delete window.TechnePlugins;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  test('getManifest returns copy of manifest', async () => {
    require(pluginSystemPath);

    const originalManifest = [
      { id: 'plugin-a', entry: 'a.js', enabledByDefault: true },
      { id: 'plugin-b', entry: 'b.js', enabledByDefault: false }
    ];

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: [],
      manifest: originalManifest
    });

    const retrieved = window.TechnePlugins.getManifest();

    expect(retrieved).toEqual(originalManifest);
    // Should be a copy, not the same reference
    expect(retrieved).not.toBe(originalManifest);
  });

  test('getEnabled returns list of enabled plugins', async () => {
    require(pluginSystemPath);

    // Register plugins first to avoid script loading
    window.TechnePlugins.register({ id: 'enabled-a', init: jest.fn() });
    window.TechnePlugins.register({ id: 'enabled-c', init: jest.fn() });

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: ['enabled-a', 'enabled-c'],
      manifest: [
        { id: 'enabled-a', entry: 'a.js' },
        { id: 'enabled-b', entry: 'b.js' },
        { id: 'enabled-c', entry: 'c.js' }
      ]
    });

    const enabled = window.TechnePlugins.getEnabled();

    expect(enabled).toContain('enabled-a');
    expect(enabled).toContain('enabled-c');
    expect(enabled).not.toContain('enabled-b');
  });

  test('isEnabled checks plugin status correctly', async () => {
    require(pluginSystemPath);

    // Register enabled plugin first to avoid script loading
    window.TechnePlugins.register({ id: 'check-enabled', init: jest.fn() });

    await window.TechnePlugins.start({
      appId: 'test',
      enabled: ['check-enabled'],
      manifest: [
        { id: 'check-enabled', entry: 'enabled.js' },
        { id: 'check-disabled', entry: 'disabled.js' }
      ]
    });

    expect(window.TechnePlugins.isEnabled('check-enabled')).toBe(true);
    expect(window.TechnePlugins.isEnabled('check-disabled')).toBe(false);
    expect(window.TechnePlugins.isEnabled('nonexistent')).toBe(false);
  });

  test('listPlugins returns sorted list of registered plugins', async () => {
    require(pluginSystemPath);

    window.TechnePlugins.register({ id: 'zeta-plugin', init: jest.fn() });
    window.TechnePlugins.register({ id: 'alpha-plugin', init: jest.fn() });
    window.TechnePlugins.register({ id: 'gamma-plugin', init: jest.fn() });

    const plugins = window.TechnePlugins.listPlugins();

    expect(plugins).toEqual(['alpha-plugin', 'gamma-plugin', 'zeta-plugin']);
  });
});

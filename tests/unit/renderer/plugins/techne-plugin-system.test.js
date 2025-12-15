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
    for (let i = 0; i < 5; i += 1) {
      const script = document.head.querySelector('script[src="dummy-late.js"]');
      if (script) break;
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }

    const script = document.head.querySelector('script[src="dummy-late.js"]');
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

    const promise = window.TechnePlugins.loadScript('foo.js');
    const script = document.head.querySelector('script[src="foo.js"]');
    expect(script).toBeTruthy();
    script.onload();

    await expect(promise).resolves.toBe(true);

    const again = await window.TechnePlugins.loadScript('foo.js');
    expect(again).toBe(true);
    expect(document.head.querySelectorAll('script[src="foo.js"]').length).toBe(1);
  });

  test('loadCSS resolves when onload is triggered', async () => {
    require(pluginSystemPath);

    const promise = window.TechnePlugins.loadCSS('foo.css');
    const link = document.head.querySelector('link[href="foo.css"]');
    expect(link).toBeTruthy();
    link.onload();

    await expect(promise).resolves.toBe(true);

    const again = await window.TechnePlugins.loadCSS('foo.css');
    expect(again).toBe(true);
    expect(document.head.querySelectorAll('link[href="foo.css"]').length).toBe(1);
  });
});

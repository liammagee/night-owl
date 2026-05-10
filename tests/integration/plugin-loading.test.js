const path = require('path');
const { JSDOM } = require('jsdom');

const pluginSystemPath = path.resolve(__dirname, '../../plugins/techne-plugin-system.js');

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function waitForElement(selector) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const element = document.head.querySelector(selector);
    if (element) return element;
    // eslint-disable-next-line no-await-in-loop
    await flushMicrotasks();
  }
  throw new Error(`Timed out waiting for ${selector}`);
}

function loadPluginSystem() {
  require(pluginSystemPath);
  return window.TechnePlugins;
}

describe('Plugin Loading Integration', () => {
  let dom;
  let consoleSpies;

  beforeEach(() => {
    jest.resetModules();
    dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
      url: 'http://nightowl.test/'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.localStorage = dom.window.localStorage;
    window.TECHNE_PLUGIN_AUTOSTART = false;
    delete window.TECHNE_PLUGIN_MANIFEST;

    consoleSpies = ['log', 'warn', 'error'].map((method) =>
      jest.spyOn(console, method).mockImplementation(() => {})
    );
  });

  afterEach(() => {
    for (const spy of consoleSpies) {
      spy.mockRestore();
    }
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.localStorage;
  });

  test('loads a manifest entry through real script injection and delayed registration', async () => {
    const plugins = loadPluginSystem();
    const init = jest.fn();

    const startPromise = plugins.start({
      appId: 'nightowl-integration',
      manifest: [
        { id: 'integration-plugin', entry: 'plugins/integration-plugin.js', enabledByDefault: true }
      ]
    });

    const script = await waitForElement('script[src="/plugins/integration-plugin.js"]');
    expect(script.async).toBe(false);
    expect(plugins.listPlugins()).toEqual([]);

    script.onload();
    await flushMicrotasks();
    expect(init).not.toHaveBeenCalled();

    plugins.register({
      id: 'integration-plugin',
      init
    });

    const result = await startPromise;

    expect(result.enabled).toEqual(['integration-plugin']);
    expect(plugins.listPlugins()).toEqual(['integration-plugin']);
    expect(init).toHaveBeenCalledTimes(1);
    expect(init.mock.calls[0][0].appId).toBe('nightowl-integration');
  });

  test('loads dependency scripts before dependent plugins', async () => {
    const plugins = loadPluginSystem();
    const initOrder = [];

    const startPromise = plugins.start({
      appId: 'nightowl-integration',
      enabled: ['dependent-plugin'],
      manifest: [
        { id: 'base-plugin', entry: 'plugins/base-plugin.js' },
        { id: 'dependent-plugin', entry: 'plugins/dependent-plugin.js', dependencies: ['base-plugin'] }
      ]
    });

    const baseScript = await waitForElement('script[src="/plugins/base-plugin.js"]');
    expect(document.head.querySelector('script[src="/plugins/dependent-plugin.js"]')).toBeNull();

    plugins.register({
      id: 'base-plugin',
      init: () => initOrder.push('base-plugin')
    });
    baseScript.onload();

    const dependentScript = await waitForElement('script[src="/plugins/dependent-plugin.js"]');
    plugins.register({
      id: 'dependent-plugin',
      init: () => initOrder.push('dependent-plugin')
    });
    dependentScript.onload();

    const result = await startPromise;

    expect(result.enabled).toEqual(['dependent-plugin', 'base-plugin']);
    expect(initOrder).toEqual(['base-plugin', 'dependent-plugin']);
  });

  test('defers lazy plugins until explicit loadPlugin call', async () => {
    const plugins = loadPluginSystem();
    const init = jest.fn();

    await plugins.start({
      appId: 'nightowl-integration',
      manifest: [
        { id: 'lazy-plugin', entry: 'plugins/lazy-plugin.js', enabledByDefault: true, lazy: true }
      ]
    });

    expect(plugins.isLazy('lazy-plugin')).toBe(true);
    expect(plugins.getLazyPlugins()).toEqual(['lazy-plugin']);
    expect(document.head.querySelector('script[src="/plugins/lazy-plugin.js"]')).toBeNull();

    const loadPromise = plugins.loadPlugin('lazy-plugin');
    const lazyScript = await waitForElement('script[src="/plugins/lazy-plugin.js"]');

    plugins.register({
      id: 'lazy-plugin',
      init
    });
    lazyScript.onload();

    const result = await loadPromise;

    expect(result.success).toBe(true);
    expect(plugins.isLazy('lazy-plugin')).toBe(false);
    expect(plugins.getLazyPlugins()).toEqual([]);
    expect(init).toHaveBeenCalledTimes(1);
  });

  test('uses the real stylesheet loader and does not duplicate loaded links', async () => {
    const plugins = loadPluginSystem();

    const firstLoad = plugins.loadCSS('plugins/integration-plugin.css', { id: 'integration-plugin-css' });
    const link = await waitForElement('link[href="/plugins/integration-plugin.css"]');
    expect(link.id).toBe('integration-plugin-css');
    expect(link.rel).toBe('stylesheet');

    link.onload();
    await expect(firstLoad).resolves.toBe(true);

    await expect(plugins.loadCSS('plugins/integration-plugin.css')).resolves.toBe(true);
    expect(document.head.querySelectorAll('link[href="/plugins/integration-plugin.css"]')).toHaveLength(1);
  });
});

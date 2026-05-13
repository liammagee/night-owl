const path = require('path');

const loaderPath = path.resolve(__dirname, '../../../orchestrator/modules/feature-loader.js');
const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);

describe('NightOwl feature loader', () => {
  beforeEach(() => {
    jest.resetModules();
    document.getElementById = nativeGetElementById;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    delete window.NightOwlFeatures;
    delete window.NIGHTOWL_DEBUG_FEATURES;
    window.appSettings = { advanced: { enableDebugMode: false } };
  });

  afterEach(() => {
    delete window.NightOwlFeatures;
    delete window.appSettings;
  });

  test('exposes the app-native feature registry without the old plugin global', () => {
    require(loaderPath);

    expect(window.NightOwlFeatures).toBeTruthy();
    expect(typeof window.NightOwlFeatures.register).toBe('function');
    expect(typeof window.NightOwlFeatures.start).toBe('function');
    expect(typeof window.NightOwlFeatures.enableFeature).toBe('function');
    expect(typeof window.NightOwlFeatures.disableFeature).toBe('function');
    expect(window.TechnePlugins).toBeUndefined();
  });

  test('initializes registered enabled features with bound settings helpers', async () => {
    require(loaderPath);

    const init = jest.fn(async (host) => {
      expect(host.getAppId()).toBe('nightowl-test');
      expect(host.getSettings()).toEqual({ active: true });
      host.setSetting('seen', true);
      host.emit('feature:test-ready', { ok: true });
    });
    const eventHandler = jest.fn();

    window.NightOwlFeatures.on('feature:test-ready', eventHandler);
    window.NightOwlFeatures.register({ id: 'techne-backdrop', init });

    await window.NightOwlFeatures.start({
      appId: 'nightowl-test',
      enabled: ['nightowl-backdrop'],
      settings: { 'techne-backdrop': { active: true } }
    });

    expect(init).toHaveBeenCalledTimes(1);
    expect(eventHandler).toHaveBeenCalledWith({ ok: true });
    expect(window.NightOwlFeatures.getFeature('nightowl-backdrop')?.id).toBe('nightowl-backdrop');
    expect(window.NightOwlFeatures.getFeatureSettings('techne-backdrop')).toEqual({
      active: true,
      seen: true
    });
  });

  test('object enablement can disable defaults and enable optional features', async () => {
    require(loaderPath);

    await window.NightOwlFeatures.start({
      manifest: [
        { id: 'nightowl-backdrop', enabledByDefault: true },
        { id: 'nightowl-circle', enabledByDefault: false }
      ],
      enabled: {
        'techne-backdrop': { enabled: false },
        'techne-circle': { enabled: true }
      }
    });

    expect(window.NightOwlFeatures.isEnabled('techne-backdrop')).toBe(false);
    expect(window.NightOwlFeatures.isEnabled('techne-circle')).toBe(true);
    expect(window.NightOwlFeatures.getEnabled()).toEqual(['nightowl-circle']);
  });

  test('deduplicates dynamically loaded CSS and scripts', async () => {
    require(loaderPath);

    const cssPromise = window.NightOwlFeatures.loadCSS('feature.css', { id: 'feature-css' });
    document.getElementById('feature-css').dispatchEvent(new Event('load'));
    await expect(cssPromise).resolves.toBe(true);
    await expect(window.NightOwlFeatures.loadCSS('feature.css', { id: 'feature-css' })).resolves.toBe(true);
    expect(document.querySelectorAll('link#feature-css')).toHaveLength(1);

    const scriptPromise = window.NightOwlFeatures.loadScript('feature.js', { id: 'feature-js' });
    document.getElementById('feature-js').dispatchEvent(new Event('load'));
    await expect(scriptPromise).resolves.toBe(true);
    await expect(window.NightOwlFeatures.loadScript('feature.js', { id: 'feature-js' })).resolves.toBe(true);
    expect(document.querySelectorAll('script#feature-js')).toHaveLength(1);
  });
});

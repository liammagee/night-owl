const path = require('path');

const loaderPath = path.resolve(__dirname, '../../../orchestrator/modules/feature-loader.js');
const lifecyclePath = path.resolve(__dirname, '../../../services/resourceLifecycle.js');
const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);

describe('NightOwl feature loader', () => {
  beforeEach(() => {
    jest.resetModules();
    document.getElementById = nativeGetElementById;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    delete window.NightOwlFeatures;
    delete window.NightOwlResourceLifecycle;
    delete window.NIGHTOWL_DEBUG_FEATURES;
    window.appSettings = { advanced: { enableDebugMode: false } };
    require(lifecyclePath);
  });

  afterEach(() => {
    window.NightOwlFeatures?.disposeAllFeatures?.();
    window.NightOwlResourceLifecycle?.disposeAll?.();
    delete window.NightOwlFeatures;
    delete window.NightOwlResourceLifecycle;
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

  test('returns owned resources to baseline across repeated feature mount cycles', async () => {
    jest.useFakeTimers();
    try {
      require(loaderPath);
      const destroy = jest.fn();
      const disposables = [];
      const observers = [];

      window.NightOwlFeatures.register({
        id: 'nightowl-lifecycle-stress',
        init(host) {
          const disposable = { close: jest.fn() };
          const observer = { observe: jest.fn(), disconnect: jest.fn() };
          disposables.push(disposable);
          observers.push(observer);
          host.interval(jest.fn(), 1000);
          host.timeout(jest.fn(), 5000);
          host.listen(window, 'nightowl-stress', jest.fn());
          host.on('nightowl:stress', jest.fn());
          host.observe(observer, document.body);
          host.track(disposable, { type: 'watcher' });
        },
        destroy
      });

      await window.NightOwlFeatures.start({ enabled: ['nightowl-lifecycle-stress'] });

      for (let cycle = 0; cycle < 20; cycle += 1) {
        expect(window.NightOwlFeatures.getLifecycleDiagnostics()).toEqual(expect.objectContaining({
          activeRegistries: 1,
          activeResources: 6,
          byType: { timer: 2, listener: 2, observer: 1, watcher: 1 }
        }));
        expect(window.NightOwlFeatures.disableFeature('nightowl-lifecycle-stress')).toBe(true);
        expect(window.NightOwlFeatures.getLifecycleDiagnostics()).toEqual({
          activeRegistries: 0,
          activeResources: 0,
          byType: {},
          registries: []
        });
        if (cycle < 19) {
          await window.NightOwlFeatures.enableFeature('nightowl-lifecycle-stress');
        }
      }

      expect(destroy).toHaveBeenCalledTimes(20);
      for (const disposable of disposables) expect(disposable.close).toHaveBeenCalledTimes(1);
      for (const observer of observers) expect(observer.disconnect).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

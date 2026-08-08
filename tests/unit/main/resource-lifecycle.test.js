const resourceLifecycle = require('../../../services/resourceLifecycle');

describe('resourceLifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    resourceLifecycle.disposeAll();
    jest.useRealTimers();
  });

  test('disposes every owned resource once and returns to baseline across repeated cycles', () => {
    const listenerTarget = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    const disposables = [];
    const observers = [];

    for (let cycle = 0; cycle < 25; cycle += 1) {
      const registry = resourceLifecycle.createRegistry({
        name: `stress-cycle-${cycle}`,
        scope: 'test'
      });
      const disposable = { close: jest.fn() };
      const observer = { observe: jest.fn(), disconnect: jest.fn() };
      disposables.push(disposable);
      observers.push(observer);

      registry.interval(jest.fn(), 1000);
      registry.timeout(jest.fn(), 5000);
      registry.listen(listenerTarget, 'change', jest.fn());
      registry.observe(observer, {});
      registry.track(disposable, { type: 'watcher', label: 'current-file' });

      expect(registry.getSnapshot()).toEqual(expect.objectContaining({
        disposed: false,
        active: 5,
        byType: { timer: 2, listener: 1, observer: 1, watcher: 1 }
      }));

      expect(registry.dispose()).toEqual({ disposed: true, errors: [] });
      expect(registry.dispose()).toEqual({ disposed: false, errors: [] });
      expect(resourceLifecycle.getDiagnostics()).toEqual({
        activeRegistries: 0,
        activeResources: 0,
        byType: {},
        registries: []
      });
    }

    expect(listenerTarget.addEventListener).toHaveBeenCalledTimes(25);
    expect(listenerTarget.removeEventListener).toHaveBeenCalledTimes(25);
    for (const disposable of disposables) expect(disposable.close).toHaveBeenCalledTimes(1);
    for (const observer of observers) expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('releases completed one-shot timers from diagnostics', () => {
    const callback = jest.fn();
    const registry = resourceLifecycle.createRegistry({ name: 'one-shot', scope: 'test' });

    registry.timeout(callback, 20);
    expect(registry.getSnapshot().active).toBe(1);
    jest.advanceTimersByTime(20);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(registry.getSnapshot().active).toBe(0);
  });
});

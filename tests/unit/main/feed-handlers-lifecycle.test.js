describe('feedHandlers lifecycle', () => {
  let feedHandlers;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    feedHandlers = require('../../../ipc/feedHandlers');
  });

  afterEach(() => {
    feedHandlers.cleanup();
    jest.useRealTimers();
  });

  test('start and stop own the polling, startup, and prune timers', () => {
    const store = {
      close: jest.fn(),
      pruneOlderThan: jest.fn(async () => 0)
    };
    feedHandlers.__testHooks.setStore(store);

    feedHandlers.__testHooks.startPollLoop();
    feedHandlers.__testHooks.startPollLoop();

    expect(feedHandlers.getDiagnostics()).toEqual(expect.objectContaining({
      name: 'main:research-feed',
      scope: 'app',
      disposed: false,
      active: 3,
      byType: { timer: 3 }
    }));

    feedHandlers.__testHooks.stopPollLoop();
    feedHandlers.__testHooks.stopPollLoop();

    expect(feedHandlers.getDiagnostics()).toEqual(expect.objectContaining({
      disposed: true,
      active: 0,
      byType: {}
    }));
    expect(jest.getTimerCount()).toBe(0);
  });
});

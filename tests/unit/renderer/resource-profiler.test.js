const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);
describe('resource profiler lifecycle', () => {
  let api;
  const tick = () => jest.advanceTimersByTimeAsync(2000);
  beforeEach(() => {
    jest.resetModules(); jest.useFakeTimers();
    document.getElementById = nativeGetElementById;
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.body.innerHTML = '<div><div id="editor-status-bar"><button id="resource-profiler-toggle">Resources</button></div></div>';
    window.NightOwlPerformance = {
      getResourceDiagnostics: jest.fn(async () => ({ success: true, app: { version: 'test' }, resources: {
        available: true, sampledAt: new Date().toISOString(), intervalMs: 2000,
        processes: [{ pid: 1, name: 'Browser', cpuPercent: 12, workingSetBytes: 1048576 }],
        main: { eventLoopUtilization: 0.1, memory: {}, heap: {} }, trace: { active: false }
      }, renderer: { activeResources: 3, path: '/private/document' } })),
      getReadinessRecords: () => [{ name: 'preview', status: 'ready', durationMs: 20, metadata: { path: '/secret' } }]
    };
    api = require('../../../orchestrator/modules/resource-profiler');
  });
  afterEach(() => { api.close(); jest.useRealTimers(); });
  test('warms CPU, samples, pauses and stops completely on close', async () => {
    api.open(); await jest.advanceTimersByTimeAsync(0);
    expect(api.getReport().samples[0].cpuPercent).toBeNull();
    await tick(); expect(api.getReport().samples[1].cpuPercent).toBe(12);
    document.getElementById('resource-pause').click();
    const count = window.NightOwlPerformance.getResourceDiagnostics.mock.calls.length;
    await tick(); expect(window.NightOwlPerformance.getResourceDiagnostics).toHaveBeenCalledTimes(count);
    api.close(); await tick(); expect(window.NightOwlPerformance.getResourceDiagnostics).toHaveBeenCalledTimes(count);
  });
  test('history is bounded and excludes document metadata', async () => {
    api.open(); await jest.advanceTimersByTimeAsync(250000);
    const report = api.getReport();
    expect(report.samples).toHaveLength(120);
    expect(JSON.stringify(report)).not.toContain('/secret');
    expect(JSON.stringify(report)).not.toContain('/private/document');
  });
  test('late response after closing cannot update history or schedule polling', async () => {
    let resolve;
    window.NightOwlPerformance.getResourceDiagnostics.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    api.open(); api.close(); resolve({ success: false });
    await tick(); expect(api.getReport().samples).toHaveLength(0);
    expect(window.NightOwlPerformance.getResourceDiagnostics).toHaveBeenCalledTimes(1);
  });
  test('hiding suspends sampling and resuming warms up again', async () => {
    api.initialize(); api.open(); await tick();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    const count = window.NightOwlPerformance.getResourceDiagnostics.mock.calls.length;
    await tick(); expect(window.NightOwlPerformance.getResourceDiagnostics).toHaveBeenCalledTimes(count);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    await jest.advanceTimersByTimeAsync(0);
    expect(api.getReport().samples.at(-1).cpuPercent).toBeNull();
  });
  test('unavailable metrics report an error instead of invented zero usage', async () => {
    window.NightOwlPerformance.getResourceDiagnostics.mockResolvedValue({ success: true, resources: { available: false } });
    api.open(); await jest.advanceTimersByTimeAsync(0);
    expect(document.querySelector('[role="status"]').textContent).toContain('unavailable');
    expect(api.getReport().samples).toHaveLength(0);
  });
});

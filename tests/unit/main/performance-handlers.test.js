describe('performanceHandlers', () => {
  let ipcMain;
  let app;
  let contentTracing;
  let performanceHandlers;

  function getRegisteredHandler(channel) {
    const entry = ipcMain.handle.mock.calls.find(([name]) => name === channel);
    if (!entry) {
      throw new Error(`Handler not registered for ${channel}`);
    }
    return entry[1];
  }

  beforeEach(() => {
    jest.resetModules();
    ({ app, contentTracing, ipcMain } = require('electron'));
    ipcMain.handle.mockClear();
    contentTracing.startRecording.mockClear();
    contentTracing.stopRecording.mockClear();
    app.getGPUFeatureStatus.mockReturnValue({ gpu_compositing: 'enabled', webgl: 'enabled' });
    app.getGPUInfo.mockResolvedValue({ gpuDevice: [{ vendorId: 1234 }] });
    app.commandLine.hasSwitch.mockReturnValue(false);
    performanceHandlers = require('../../../ipc/performanceHandlers');
  });

  test('registers GPU diagnostics and trace handlers', () => {
    performanceHandlers.register({ app });

    const channels = ipcMain.handle.mock.calls.map(([channel]) => channel);
    expect(channels).toEqual(expect.arrayContaining([
      'performance:get-gpu-diagnostics',
      'performance:get-resource-diagnostics',
      'performance:start-trace',
      'performance:stop-trace'
    ]));
  });

  test('reports GPU feature status without disabling Electron acceleration', async () => {
    performanceHandlers.register({ app });
    const handler = getRegisteredHandler('performance:get-gpu-diagnostics');

    await expect(handler()).resolves.toEqual({
      success: true,
      featureStatus: { gpu_compositing: 'enabled', webgl: 'enabled' },
      gpuInfo: { gpuDevice: [{ vendorId: 1234 }] },
      hardwareAccelerationDisabled: false
    });
  });

  test('reports owned main-process resources through one diagnostics handler', async () => {
    const getResourceDiagnostics = jest.fn(() => ({
      lifecycle: { activeRegistries: 1, activeResources: 3 },
      handlers: { terminal: { activeProcesses: 2 } }
    }));
    performanceHandlers.register({ app, getResourceDiagnostics });
    const handler = getRegisteredHandler('performance:get-resource-diagnostics');

    await expect(handler()).resolves.toEqual({
      success: true,
      lifecycle: { activeRegistries: 1, activeResources: 3 },
      handlers: { terminal: { activeProcesses: 2 } },
      resources: expect.objectContaining({ processes: [], available: false }),
      app: {
        version: '1.0.0',
        isPackaged: false,
        packageMode: 'source',
        platform: process.platform,
        arch: process.arch,
        electronVersion: process.versions.electron || 'unknown',
        chromeVersion: process.versions.chrome || 'unknown',
        nodeVersion: process.versions.node || 'unknown'
      }
    });
    expect(getResourceDiagnostics).toHaveBeenCalledTimes(1);
  });

  test('converts KiB to bytes, warms up CPU, and detects reused PIDs', () => {
    const metric = { pid: 10, creationTime: 1, type: 'Tab', cpu: { percentCPUUsage: 12, idleWakeupsPerSecond: 4 }, memory: { workingSetSize: 1024, peakWorkingSetSize: 2048 } };
    const fakeApp = { getAppMetrics: () => [metric] };
    const sample = performanceHandlers.createResourceSampler(fakeApp);
    expect(sample().processes[0]).toMatchObject({ cpuPercent: null, workingSetBytes: 1048576 });
    expect(sample().processes[0].cpuPercent).toBe(12);
    metric.creationTime = 2;
    delete metric.memory;
    expect(sample().processes[0]).toMatchObject({ cpuPercent: null, workingSetBytes: null });
  });

  test('automatically stops a trace after thirty seconds and rejects overlapping starts', async () => {
    jest.useFakeTimers();
    try {
      let resolveStart;
      contentTracing.startRecording.mockImplementationOnce(() => new Promise(resolve => { resolveStart = resolve; }));
      const first = performanceHandlers.startPerformanceTrace();
      expect(await performanceHandlers.startPerformanceTrace()).toMatchObject({ success: false });
      resolveStart(); await first;
      await jest.advanceTimersByTimeAsync(30000);
      expect(contentTracing.stopRecording).toHaveBeenCalledTimes(1);
      expect(await performanceHandlers.stopPerformanceTrace()).toMatchObject({ success: false });
    } finally { jest.useRealTimers(); }
  });

  test('records Chromium performance traces to user data', async () => {
    performanceHandlers.register({ app });
    const startTrace = getRegisteredHandler('performance:start-trace');
    const stopTrace = getRegisteredHandler('performance:stop-trace');

    await expect(startTrace(null, { includedCategories: ['gpu'] })).resolves.toEqual({
      success: true,
      includedCategories: ['gpu']
    });
    expect(contentTracing.startRecording).toHaveBeenCalledWith({
      included_categories: ['gpu'],
      excluded_categories: []
    });

    const stopped = await stopTrace();
    expect(stopped).toEqual(expect.objectContaining({
      success: true,
      path: expect.stringContaining('/mock/user-data/nightowl-performance-')
    }));
    expect(contentTracing.stopRecording).toHaveBeenCalled();
  });
});

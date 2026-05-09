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

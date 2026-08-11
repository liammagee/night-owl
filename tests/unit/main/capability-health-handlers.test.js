describe('capability health IPC', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('registers a fixed check handler and returns a redacted report', async () => {
    const { ipcMain } = require('electron');
    ipcMain.handle.mockClear();
    const collectCapabilityHealth = jest.fn(async () => ({ success: true, capabilities: [] }));
    jest.doMock('../../../services/capabilityHealth', () => ({ collectCapabilityHealth }));
    const handlers = require('../../../ipc/capabilityHealthHandlers');
    const tutorBridge = { probeLocalRuntime: jest.fn() };

    handlers.register({ tutorBridge });
    const registration = ipcMain.handle.mock.calls.find(([channel]) => channel === 'capability-health-check');
    expect(registration).toBeTruthy();
    await expect(registration[1]()).resolves.toEqual({ success: true, capabilities: [] });
    expect(collectCapabilityHealth).toHaveBeenCalledWith(expect.objectContaining({ tutorBridge, env: process.env }));
  });

  test('only installs the allowlisted managed Docling runtime', async () => {
    const { ipcMain } = require('electron');
    ipcMain.handle.mockClear();
    jest.doMock('../../../services/capabilityHealth', () => ({
      collectCapabilityHealth: jest.fn(async () => ({ success: true, capabilities: [] }))
    }));
    const installDoclingRuntime = jest.fn(async () => ({ success: true, version: '2.48.0' }));
    const credentialStore = {
      initialize: jest.fn(async () => {}), get: jest.fn(async () => null)
    };
    require('../../../ipc/capabilityHealthHandlers').register({
      userDataPath: '/mock/user-data', credentialStore, installDoclingRuntime
    });
    const install = ipcMain.handle.mock.calls.find(([channel]) => channel === 'capability-health-install')[1];

    await expect(install({}, { toolId: 'other' })).resolves.toMatchObject({ success: false });
    await expect(install({}, { toolId: 'docling' })).resolves.toMatchObject({ success: true, version: '2.48.0' });
    expect(installDoclingRuntime).toHaveBeenCalledWith(expect.objectContaining({ userDataPath: '/mock/user-data' }));
  });
});

describe('capability health IPC', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('registers one fixed check handler and returns a redacted report', async () => {
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
});

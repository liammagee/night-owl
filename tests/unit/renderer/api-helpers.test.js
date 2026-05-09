const path = require('path');

const apiHelpersPath = path.resolve(__dirname, '../../../orchestrator/utils/api-helpers.js');

describe('ApiHelpers', () => {
  beforeEach(() => {
    jest.resetModules();

    delete window.ApiHelpers;
    window.showNotification = jest.fn();
    window.electronAPI = {
      invoke: jest.fn()
    };
  });

  test('shows a notification when invokeElectronAPI fails', async () => {
    window.electronAPI.invoke.mockRejectedValueOnce(new Error('boom'));

    require(apiHelpersPath);

    await expect(window.ApiHelpers.invokeElectronAPI('broken-call')).rejects.toThrow('boom');
    expect(window.showNotification).toHaveBeenCalledWith('Error calling broken-call', 'error');
  });

  test('respects showNotification=false when invokeElectronAPI fails', async () => {
    window.electronAPI.invoke.mockRejectedValueOnce(new Error('boom'));

    require(apiHelpersPath);

    await expect(
      window.ApiHelpers.invokeElectronAPI('broken-call', null, { showNotification: false })
    ).rejects.toThrow('boom');

    expect(window.showNotification).not.toHaveBeenCalled();
  });

  test('handleError routes messages through window.showNotification', () => {
    require(apiHelpersPath);

    window.ApiHelpers.handleError('Something failed', new Error('boom'), 'Test');

    expect(window.showNotification).toHaveBeenCalledWith('Something failed', 'error');
  });
});

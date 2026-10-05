const path = require('path');

const apiHelpersPath = path.resolve(__dirname, '../../../orchestrator/utils/api-helpers.js');

describe('ApiHelpers', () => {
  beforeEach(() => {
    jest.resetModules();

    delete window.ApiHelpers;
    window.showNotification = jest.fn();
    delete window.electronAPI;
  });

  test('shows a notification when a capability call fails', async () => {
    const operation = jest.fn().mockRejectedValueOnce(new Error('boom'));

    require(apiHelpersPath);

    await expect(window.ApiHelpers.callElectronAPI(operation, [], {
      errorMessage: 'Error calling operation'
    })).rejects.toThrow('boom');
    expect(window.showNotification).toHaveBeenCalledWith('Error calling operation', 'error');
  });

  test('respects showNotification=false when a capability call fails', async () => {
    const operation = jest.fn().mockRejectedValueOnce(new Error('boom'));

    require(apiHelpersPath);

    await expect(
      window.ApiHelpers.callElectronAPI(operation, [], { showNotification: false })
    ).rejects.toThrow('boom');

    expect(window.showNotification).not.toHaveBeenCalled();
  });

  test('handleError routes messages through window.showNotification', () => {
    require(apiHelpersPath);

    window.ApiHelpers.handleError('Something failed', new Error('boom'), 'Test');

    expect(window.showNotification).toHaveBeenCalledWith('Something failed', 'error');
  });
});

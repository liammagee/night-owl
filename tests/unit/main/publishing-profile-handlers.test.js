describe('publishing profile IPC handlers', () => {
  let ipcMain;
  let handlers;

  function registered(channel) {
    const match = ipcMain.handle.mock.calls.find(([name]) => name === channel);
    if (!match) throw new Error(`Missing handler: ${channel}`);
    return match[1];
  }

  beforeEach(() => {
    jest.resetModules();
    ({ ipcMain } = require('electron'));
    ipcMain.handle.mockClear();
    handlers = require('../../../ipc/publishingProfileHandlers');
  });

  test('uses the live main-process workspace and delegates fixed operations', async () => {
    let workspace = '/workspace/first';
    const service = {
      inspectWorkspace: jest.fn(async workspaceRoot => ({ success: true, workspaceRoot, profiles: [] })),
      runStage: jest.fn(async (workspaceRoot, request) => ({ success: true, workspaceRoot, ...request }))
    };
    handlers.register({
      appSettings: {},
      currentWorkingDirectory: '/workspace/stale',
      getCurrentWorkingDirectory: () => workspace,
      publishingProfileService: service
    });

    await expect(registered('publishing-profile-inspect')()).resolves.toMatchObject({
      workspaceRoot: '/workspace/first'
    });
    workspace = '/workspace/second';
    const request = { profileId: 'site', stageId: 'inspect', planDigest: 'abc' };
    await expect(registered('publishing-profile-run-stage')({}, request)).resolves.toMatchObject({
      success: true,
      workspaceRoot: '/workspace/second',
      profileId: 'site'
    });
    expect(service.runStage).toHaveBeenCalledWith('/workspace/second', request);
  });

  test('returns stable error codes instead of exposing rejected IPC promises', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new Error('Plan changed'), { code: 'stale-publishing-plan' });
    handlers.register({
      appSettings: { workingDirectory: '/workspace' },
      publishingProfileService: {
        inspectWorkspace: jest.fn(async () => { throw error; }),
        runStage: jest.fn(async () => { throw error; })
      }
    });

    await expect(registered('publishing-profile-inspect')()).resolves.toEqual({
      success: false,
      code: 'stale-publishing-plan',
      error: 'Plan changed'
    });
    await expect(registered('publishing-profile-run-stage')({}, {})).resolves.toEqual({
      success: false,
      code: 'stale-publishing-plan',
      error: 'Plan changed'
    });
    consoleError.mockRestore();
  });
});

describe('validated static publishing IPC handlers', () => {
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
    handlers = require('../../../ipc/staticSiteHandlers');
  });

  test('preflights against the live workspace and returns preview-safe documents only', async () => {
    const service = {
      preflight: jest.fn(async workspaceRoot => ({
        success: true,
        ready: true,
        rendererContract: 'contract',
        report: { ready: true },
        manifest: { schemaVersion: 1 },
        documents: [{ source: 'a.md', output: 'a.html', title: 'A', html: 'private-final-html', previewHtml: 'offline-preview' }]
      }))
    };
    handlers.register({
      getCurrentWorkingDirectory: () => '/workspace/live',
      appSettings: {},
      staticPublishingService: service
    });

    await expect(registered('static-site-preview')({}, { files: [] })).resolves.toEqual({
      success: true,
      ready: true,
      rendererContract: 'contract',
      report: { ready: true },
      manifest: { schemaVersion: 1 },
      documents: [{ source: 'a.md', output: 'a.html', title: 'A', previewHtml: 'offline-preview' }]
    });
    expect(service.preflight).toHaveBeenCalledWith('/workspace/live', { files: [] });
  });

  test('cancels without writing and delegates a validated destination when selected', async () => {
    const service = {
      preflight: jest.fn(async () => ({ ready: true, report: { ready: true }, manifest: {} })),
      publish: jest.fn(async (_root, _request, destination) => ({ success: true, filePath: destination }))
    };
    const dialog = { showSaveDialog: jest.fn(async () => ({ canceled: true })) };
    handlers.register({
      getCurrentWorkingDirectory: () => '/workspace',
      appSettings: {},
      staticPublishingService: service,
      dialog
    });
    const generate = registered('static-site-generate');
    await expect(generate({}, { files: [] })).resolves.toEqual({ success: false, cancelled: true });
    expect(service.publish).not.toHaveBeenCalled();

    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/output/site' });
    await expect(generate({}, { files: [] })).resolves.toEqual({ success: true, filePath: '/output/site' });
    expect(service.publish).toHaveBeenCalledWith('/workspace', { files: [] }, '/output/site');
  });

  test('does not open a destination chooser when preflight is blocked', async () => {
    const dialog = { showSaveDialog: jest.fn() };
    handlers.register({
      getCurrentWorkingDirectory: () => '/workspace',
      appSettings: {},
      staticPublishingService: {
        preflight: jest.fn(async () => ({ ready: false, report: { ready: false }, manifest: {} }))
      },
      dialog
    });
    await expect(registered('static-site-generate')({}, {})).resolves.toMatchObject({
      success: false,
      ready: false,
      error: 'Publication preflight failed.'
    });
    expect(dialog.showSaveDialog).not.toHaveBeenCalled();
  });
});

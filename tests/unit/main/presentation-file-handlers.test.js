'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('PowerPoint file handlers', () => {
  let ipcMain;
  let handlers;
  let workspace;
  let deckPath;

  function registered(channel) {
    const match = ipcMain.handle.mock.calls.find(([name]) => name === channel);
    if (!match) throw new Error(`Missing handler: ${channel}`);
    return match[1];
  }

  beforeEach(() => {
    jest.resetModules();
    ({ ipcMain } = require('electron'));
    ipcMain.handle.mockClear();
    handlers = require('../../../ipc/presentationFileHandlers');
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-pptx-handlers-'));
    deckPath = path.join(workspace, 'deck.pptx');
    fs.writeFileSync(deckPath, 'pptx fixture');
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  test('renders a workspace deck and opens it explicitly in PowerPoint', async () => {
    const renderPptxPreview = jest.fn(async filePath => ({
      success: true,
      renderer: 'html',
      previewPath: `${filePath}.html`,
      html: '<div class="slide">Rendered</div>'
    }));
    const execFile = jest.fn((_command, _args, _options, callback) => callback(null));
    handlers.register({
      appSettings: { workspaceFolders: [] },
      getCurrentWorkingDirectory: () => workspace,
      userDataPath: path.join(workspace, '.user-data'),
      renderPptxPreview,
      platform: 'darwin',
      existsSync: target => target === '/Applications/Microsoft PowerPoint.app' || fs.existsSync(target),
      execFile
    });

    await expect(registered('render-pptx-preview')({}, { filePath: deckPath }))
      .resolves.toMatchObject({ success: true, renderer: 'html' });
    await expect(registered('open-pptx-in-powerpoint')({}, { filePath: deckPath }))
      .resolves.toEqual({ success: true, application: 'Microsoft PowerPoint' });
    expect(renderPptxPreview).toHaveBeenCalledWith(deckPath, expect.objectContaining({ platform: 'darwin' }));
    expect(execFile).toHaveBeenCalledWith(
      '/usr/bin/open',
      ['-a', 'Microsoft PowerPoint', deckPath],
      expect.any(Object),
      expect.any(Function)
    );
  });

  test('rejects decks outside the active workspace', async () => {
    handlers.register({
      appSettings: { workspaceFolders: [] },
      getCurrentWorkingDirectory: () => workspace,
      renderPptxPreview: jest.fn()
    });

    await expect(registered('render-pptx-preview')({}, { filePath: '/tmp/outside.pptx' }))
      .resolves.toMatchObject({ success: false, error: expect.stringContaining('workspace folder') });
  });
});

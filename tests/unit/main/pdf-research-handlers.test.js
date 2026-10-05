'use strict';

describe('PDF research IPC handlers', () => {
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
    handlers = require('../../../ipc/pdfResearchHandlers');
  });

  test('delegates annotation storage and note creation through the live workspace', async () => {
    let workspace = '/workspace/first';
    const service = {
      loadAnnotations: jest.fn(async filePath => ({ success: true, filePath })),
      saveAnnotations: jest.fn(async request => ({ success: true, ...request })),
      createResearchNote: jest.fn(async (workspaceRoot, request) => ({ success: true, workspaceRoot, ...request }))
    };
    handlers.register({
      currentWorkingDirectory: '/workspace/stale',
      getCurrentWorkingDirectory: () => workspace,
      pdfResearchService: service
    });

    await expect(registered('pdf-research-load-annotations')({}, { filePath: '/paper.pdf' }))
      .resolves.toMatchObject({ success: true, filePath: '/paper.pdf' });
    await expect(registered('pdf-research-save-annotations')({}, {
      filePath: '/paper.pdf', highlights: [], annotations: []
    })).resolves.toMatchObject({ success: true, filePath: '/paper.pdf' });

    workspace = '/workspace/second';
    const annotation = { id: 'annotation-1', pageNumber: 2 };
    await expect(registered('pdf-research-create-note')({}, { filePath: '/paper.pdf', annotation }))
      .resolves.toMatchObject({ success: true, workspaceRoot: '/workspace/second' });
    expect(service.createResearchNote).toHaveBeenCalledWith('/workspace/second', {
      filePath: '/paper.pdf', annotation
    });
  });

  test('returns stable failures instead of rejecting IPC calls', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new Error('Unreadable PDF'), { code: 'pdf-unreadable' });
    const failing = jest.fn(async () => { throw error; });
    handlers.register({
      currentWorkingDirectory: '/workspace',
      pdfResearchService: {
        loadAnnotations: failing,
        saveAnnotations: failing,
        createResearchNote: failing
      }
    });

    await expect(registered('pdf-research-load-annotations')({}, {})).resolves.toEqual({
      success: false,
      code: 'pdf-unreadable',
      error: 'Unreadable PDF'
    });
    await expect(registered('pdf-research-save-annotations')({}, {})).resolves.toMatchObject({
      success: false,
      code: 'pdf-unreadable'
    });
    await expect(registered('pdf-research-create-note')({}, {})).resolves.toMatchObject({
      success: false,
      code: 'pdf-unreadable'
    });
    consoleError.mockRestore();
  });
});

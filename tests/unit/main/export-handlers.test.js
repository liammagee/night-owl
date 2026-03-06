const mockMainWindow = {
  webContents: {
    send: jest.fn()
  }
};

describe('Export Handlers', () => {
  beforeEach(() => {
    jest.resetModules();

    const { ipcMain, dialog } = require('electron');
    ipcMain.handle.mockClear();
    dialog.showSaveDialog.mockReset();
    mockMainWindow.webContents.send.mockClear();
  });

  test('registers the PDF with references IPC handler', () => {
    const { ipcMain } = require('electron');
    const exportHandlers = require('../../../ipc/exportHandlers');

    exportHandlers.register({
      mainWindow: mockMainWindow,
      getCurrentFilePath: jest.fn(() => '/mock/documents/test.md'),
      currentWorkingDirectory: '/mock/documents'
    });

    const registeredChannels = ipcMain.handle.mock.calls.map(([channel]) => channel);

    expect(registeredChannels).toContain('perform-export-pdf');
    expect(registeredChannels).toContain('perform-export-pdf-pandoc');
  });

  test('uses the references PDF dialog title for the pandoc handler', async () => {
    const { ipcMain, dialog } = require('electron');
    const exportHandlers = require('../../../ipc/exportHandlers');

    exportHandlers.register({
      mainWindow: mockMainWindow,
      getCurrentFilePath: jest.fn(() => '/mock/documents/test.md'),
      currentWorkingDirectory: '/mock/documents'
    });

    dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true });

    const handlerCall = ipcMain.handle.mock.calls.find(
      ([channel]) => channel === 'perform-export-pdf-pandoc'
    );

    expect(handlerCall).toBeDefined();

    const [, handler] = handlerCall;
    const result = await handler({}, '# Test Document', { pandocArgs: ['--toc'] });

    expect(dialog.showSaveDialog).toHaveBeenCalledWith(
      mockMainWindow,
      expect.objectContaining({
        title: 'Export as PDF (with References)',
        defaultPath: '/mock/documents/test.pdf'
      })
    );
    expect(result).toEqual({ success: false, cancelled: true });
  });

  test('skips empty citations when generating BibTeX', () => {
    const exportHandlers = require('../../../ipc/exportHandlers');

    expect(exportHandlers.__test__.citationToBibTeX({
      id: 205,
      citation_type: 'article',
      title: '',
      authors: null,
      journal: null,
      url: null
    })).toBeNull();
  });

  test('prefers the current file directory for export resources', () => {
    const exportHandlers = require('../../../ipc/exportHandlers');

    const exportBaseDirectory = exportHandlers.__test__.resolveExportBaseDirectory(
      '/Users/lmagee/Dev/machinespirits-content-philosophy/articles/ai-tutor/full-paper-2026-01-28.md',
      '/Users/lmagee/Dev/hegel-pedagogy-ai',
      '/mock/documents'
    );

    expect(exportBaseDirectory).toBe(
      '/Users/lmagee/Dev/machinespirits-content-philosophy/articles/ai-tutor'
    );
  });

  test('includes stderr details in pandoc error messages', () => {
    const exportHandlers = require('../../../ipc/exportHandlers');

    expect(
      exportHandlers.__test__.formatPandocErrorMessage(
        25,
        'Error reading bibliography file test.bib',
        ''
      )
    ).toBe('Pandoc failed with exit code 25: Error reading bibliography file test.bib');
  });
});

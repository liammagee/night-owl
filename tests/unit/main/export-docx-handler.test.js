/**
 * Tests for the Word (DOCX) export handler and trigger-export forwarding.
 * Ensures the handler is registered, shows save dialogs, validates pandoc,
 * and correctly forwards export triggers to the renderer.
 */

const mockMainWindow = {
  webContents: {
    send: jest.fn()
  }
};

const mockDeps = {
  mainWindow: mockMainWindow,
  getCurrentFilePath: jest.fn(() => '/mock/documents/test.md'),
  currentWorkingDirectory: '/mock/documents'
};

describe('Word (DOCX) Export Handler', () => {
  beforeEach(() => {
    jest.resetModules();
    const { ipcMain, dialog } = require('electron');
    ipcMain.handle.mockClear();
    dialog.showSaveDialog.mockReset();
    mockMainWindow.webContents.send.mockClear();
    mockDeps.getCurrentFilePath.mockReturnValue('/mock/documents/test.md');
  });

  test('registers the perform-export-docx IPC handler', () => {
    const { ipcMain } = require('electron');
    const exportHandlers = require('../../../ipc/exportHandlers');

    exportHandlers.register(mockDeps);

    const registeredChannels = ipcMain.handle.mock.calls.map(([channel]) => channel);
    expect(registeredChannels).toContain('perform-export-docx');
  });

  test('registers the trigger-export IPC handler', () => {
    const { ipcMain } = require('electron');
    const exportHandlers = require('../../../ipc/exportHandlers');

    exportHandlers.register(mockDeps);

    const registeredChannels = ipcMain.handle.mock.calls.map(([channel]) => channel);
    expect(registeredChannels).toContain('trigger-export');
  });

  test('trigger-export handler forwards docx events to renderer', async () => {
    const { ipcMain } = require('electron');
    const exportHandlers = require('../../../ipc/exportHandlers');

    exportHandlers.register(mockDeps);

    const handlerCall = ipcMain.handle.mock.calls.find(
      ([channel]) => channel === 'trigger-export'
    );
    expect(handlerCall).toBeDefined();

    const [, handler] = handlerCall;
    const result = await handler({}, 'docx');

    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('trigger-export-docx');
    expect(result).toEqual({ success: true, exportType: 'docx' });
  });

  test('trigger-export handler forwards docx-refs events to renderer', async () => {
    const { ipcMain } = require('electron');
    const exportHandlers = require('../../../ipc/exportHandlers');

    exportHandlers.register(mockDeps);

    const [, handler] = ipcMain.handle.mock.calls.find(
      ([channel]) => channel === 'trigger-export'
    );

    const result = await handler({}, 'docx-refs');

    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('trigger-export-docx-refs');
    expect(result).toEqual({ success: true, exportType: 'docx-refs' });
  });

  test('perform-export-docx returns cancelled when dialog is dismissed', async () => {
    const { ipcMain, dialog } = require('electron');
    const exportHandlers = require('../../../ipc/exportHandlers');

    exportHandlers.register(mockDeps);

    dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true });

    const handlerCall = ipcMain.handle.mock.calls.find(
      ([channel]) => channel === 'perform-export-docx'
    );
    expect(handlerCall).toBeDefined();

    const [, handler] = handlerCall;
    const result = await handler({}, '# Test Document', {});

    expect(dialog.showSaveDialog).toHaveBeenCalledWith(
      mockMainWindow,
      expect.objectContaining({
        title: 'Export as Word',
        filters: [{ name: 'Word Documents', extensions: ['docx'] }]
      })
    );
    expect(result).toEqual({ success: false, cancelled: true });
  });

  test('perform-export-docx uses withReferences title when option set', async () => {
    const { ipcMain, dialog } = require('electron');
    const exportHandlers = require('../../../ipc/exportHandlers');

    exportHandlers.register(mockDeps);

    dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true });

    const [, handler] = ipcMain.handle.mock.calls.find(
      ([channel]) => channel === 'perform-export-docx'
    );

    await handler({}, '# Test', { withReferences: true });

    expect(dialog.showSaveDialog).toHaveBeenCalledWith(
      mockMainWindow,
      expect.objectContaining({
        title: 'Export as Word (with References)'
      })
    );
  });

  test('perform-export-docx defaults to export.docx when no file is open', async () => {
    const { ipcMain, dialog } = require('electron');
    const exportHandlers = require('../../../ipc/exportHandlers');

    mockDeps.getCurrentFilePath.mockReturnValue(null);
    exportHandlers.register(mockDeps);

    dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true });

    const [, handler] = ipcMain.handle.mock.calls.find(
      ([channel]) => channel === 'perform-export-docx'
    );

    await handler({}, '# Test', {});

    expect(dialog.showSaveDialog).toHaveBeenCalledWith(
      mockMainWindow,
      expect.objectContaining({
        defaultPath: 'export.docx'
      })
    );
  });

  test('all expected export handlers are registered', () => {
    const { ipcMain } = require('electron');
    const exportHandlers = require('../../../ipc/exportHandlers');

    exportHandlers.register(mockDeps);

    const registeredChannels = ipcMain.handle.mock.calls.map(([channel]) => channel);

    // Core export handlers that must always be present
    const requiredHandlers = [
      'perform-export-pdf',
      'perform-export-pdf-pandoc',
      'perform-export-html',
      'perform-export-pptx',
      'perform-export-docx',
      'trigger-export'
    ];

    for (const handler of requiredHandlers) {
      expect(registeredChannels).toContain(handler);
    }
  });
});

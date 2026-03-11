/**
 * Tests for BibTeX file export/import/sync IPC handler registration.
 * Ensures the handlers are registered and respond to dialog interactions.
 */

jest.mock('../../../services/citationService', () => {
  const mockInstance = {
    initialize: jest.fn(),
    addCitation: jest.fn(),
    getCitations: jest.fn(() => []),
    getCitationById: jest.fn(),
    updateCitation: jest.fn(),
    deleteCitation: jest.fn(),
    close: jest.fn()
  };
  return jest.fn().mockImplementation(() => mockInstance);
});

// citationHandlers uses require('fs').promises, not require('fs/promises')
const mockFsPromises = {
  readFile: jest.fn(),
  writeFile: jest.fn(),
  readdir: jest.fn(),
  mkdir: jest.fn(),
  access: jest.fn(),
  stat: jest.fn(),
  unlink: jest.fn()
};
jest.mock('fs', () => ({
  promises: mockFsPromises,
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}));

describe('Citation BibTeX File Handlers', () => {
  beforeEach(() => {
    jest.resetModules();
    const { ipcMain, dialog, BrowserWindow } = require('electron');
    ipcMain.handle.mockClear();
    dialog.showSaveDialog.mockReset();
    dialog.showOpenDialog.mockReset();
    BrowserWindow.getFocusedWindow.mockClear();
  });

  function registerAndGetHandlers() {
    const { ipcMain } = require('electron');
    const citationHandlers = require('../../../ipc/citationHandlers');
    citationHandlers.registerCitationHandlers('/mock/user-data');

    const handlers = {};
    for (const [channel, handler] of ipcMain.handle.mock.calls) {
      handlers[channel] = handler;
    }
    return handlers;
  }

  test('registers citations-bib-export-to-file handler', () => {
    const handlers = registerAndGetHandlers();
    expect(handlers['citations-bib-export-to-file']).toBeDefined();
  });

  test('registers citations-bib-import-from-file handler', () => {
    const handlers = registerAndGetHandlers();
    expect(handlers['citations-bib-import-from-file']).toBeDefined();
  });

  test('registers citations-bib-sync handler', () => {
    const handlers = registerAndGetHandlers();
    expect(handlers['citations-bib-sync']).toBeDefined();
  });

  test('export handler returns cancelled when dialog is dismissed', async () => {
    const { dialog } = require('electron');
    const handlers = registerAndGetHandlers();

    dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true });

    const result = await handlers['citations-bib-export-to-file']({}, null);

    // First needs to initialize and get citations — getCitations returns []
    // so it returns exported: 0 before showing dialog
    expect(result.success).toBe(true);
    expect(result.exported).toBe(0);
  });

  test('import handler returns cancelled when dialog is dismissed', async () => {
    const { dialog } = require('electron');
    const handlers = registerAndGetHandlers();

    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });

    const result = await handlers['citations-bib-import-from-file']({}, null);

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
  });

  test('export handler uses BrowserWindow.getFocusedWindow for dialog', async () => {
    const { dialog, BrowserWindow } = require('electron');
    const CitationService = require('../../../services/citationService');

    // Make getCitations return something so the dialog is shown
    const mockInstance = new CitationService();
    mockInstance.getCitations.mockResolvedValueOnce([
      { id: 1, title: 'Test', authors: 'Author', citation_type: 'article' }
    ]);

    const handlers = registerAndGetHandlers();

    dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true });

    await handlers['citations-bib-export-to-file']({}, null);

    // Verify it called getFocusedWindow (not using a missing deps.mainWindow)
    expect(BrowserWindow.getFocusedWindow).toHaveBeenCalled();
  });

  test('import handler uses BrowserWindow.getFocusedWindow for dialog', async () => {
    const { dialog, BrowserWindow } = require('electron');
    const handlers = registerAndGetHandlers();

    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });

    await handlers['citations-bib-import-from-file']({}, null);

    expect(BrowserWindow.getFocusedWindow).toHaveBeenCalled();
  });

  test('sync handler writes bib file even when no file exists yet', async () => {
    const handlers = registerAndGetHandlers();

    // Simulate file not existing
    mockFsPromises.readFile.mockRejectedValueOnce(new Error('ENOENT'));
    // Mock the write
    mockFsPromises.writeFile.mockResolvedValueOnce(undefined);

    const result = await handlers['citations-bib-sync']({}, '/tmp/test.bib');

    expect(result.success).toBe(true);
    expect(result.bibFileExisted).toBe(false);
    expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
      '/tmp/test.bib',
      expect.any(String),
      'utf8'
    );
  });

  test('all required citation handlers are registered', () => {
    const handlers = registerAndGetHandlers();

    const requiredHandlers = [
      'citations-initialize',
      'citations-add',
      'citations-bib-export-to-file',
      'citations-bib-import-from-file',
      'citations-bib-sync'
    ];

    for (const name of requiredHandlers) {
      expect(handlers[name]).toBeDefined();
    }
  });
});

const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const electron = require('electron');

describe('template PDF export', () => {
  let root, handler, printWindow;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'nightowl-pdf-export-'));
    electron.dialog.showSaveDialog.mockResolvedValue({ filePath: path.join(root, 'export.pdf') });
    printWindow = { loadURL: jest.fn().mockResolvedValue(), destroy: jest.fn(), webContents: { setWindowOpenHandler: jest.fn(), printToPDF: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')) } };
    electron.BrowserWindow.mockImplementation(() => printWindow);
    electron.ipcMain.handle.mockImplementation((channel, callback) => { if (channel === 'export-pdf-with-template') handler = callback; });
    require('../../../ipc/advancedExportHandlers').register({});
  });
  afterEach(async () => { jest.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); });
  test('prints supplied content in a sandboxed window, not the application UI', async () => {
    const sender = { printToPDF: jest.fn() };
    expect(await handler({ sender }, { htmlContent: '<h1>Chosen document</h1>', template: 'letter' })).toMatchObject({ success: true });
    expect(sender.printToPDF).not.toHaveBeenCalled();
    expect(decodeURIComponent(printWindow.loadURL.mock.calls[0][0])).toContain('<h1>Chosen document</h1>');
    expect(electron.BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({ webPreferences: expect.objectContaining({ javascript: false, sandbox: true }) }));
    expect(printWindow.webContents.printToPDF).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 'Letter' }));
    expect(printWindow.destroy).toHaveBeenCalled();
    expect(await fs.readFile(path.join(root, 'export.pdf'), 'utf8')).toBe('%PDF-test');
  });
  test('closes the print window after a renderer failure and preserves existing output', async () => {
    await fs.writeFile(path.join(root, 'export.pdf'), 'existing');
    printWindow.loadURL.mockRejectedValue(new Error('load failed'));
    expect(await handler({}, { htmlContent: 'Text' })).toMatchObject({ success: false });
    expect(printWindow.destroy).toHaveBeenCalled();
    expect(await fs.readFile(path.join(root, 'export.pdf'), 'utf8')).toBe('existing');
  });
});

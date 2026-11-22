const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');
const childProcess = require('child_process');

describe('media output boundaries', () => {
  let root, handlers;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-media-'));
    handlers = {};
    electron.ipcMain.handle.mockImplementation((name, callback) => { handlers[name] = callback; });
    electron.shell.showItemInFolder = jest.fn();
    jest.spyOn(os, 'homedir').mockReturnValue(root);
    jest.spyOn(childProcess, 'exec').mockImplementation(() => ({}));
    electron.app.getPath.mockReturnValue(path.join(root, 'Movies'));
    require('../../../ipc/imageHandlers').register({ appSettings: { workingDirectory: root } });
    require('../../../ipc/videoHandlers').register({ appSettings: {}, mainWindow: null });
  });
  afterEach(() => { jest.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
  test('rejects image traversal before writing', async () => {
    const result = await handlers['save-image-data']({}, Buffer.from('image'), '../outside.png');
    expect(result.success).toBe(false);
    expect(fs.existsSync(path.join(root, 'outside.png'))).toBe(false);
  });
  test('generates a filename when an image arrives without one', async () => {
    const result = await handlers['save-image-data']({}, Buffer.from('image'));
    expect(result.success).toBe(true);
    expect(fs.readFileSync(result.filePath, 'utf8')).toBe('image');
  });
  test('does not overwrite an existing imported image', async () => {
    await handlers['save-image-data']({}, Buffer.from('first'), 'same.png');
    const result = await handlers['save-image-data']({}, Buffer.from('second'), 'same.png');
    expect(result.success).toBe(false);
    expect(fs.readFileSync(path.join(root, 'images/same.png'), 'utf8')).toBe('first');
  });
  test('rejects recording path traversal', async () => {
    expect((await handlers['save-video-recording']({}, { buffer: [1, 2], filename: '../outside.webm' })).success).toBe(false);
  });
  test('reveals recordings without interpreting filename shell syntax', async () => {
    const filename = 'recording-$(do-not-run).webm';
    const result = await handlers['save-video-recording']({}, { buffer: [1, 2], filename, metadata: { slides: 1 } });
    expect(result.success).toBe(true);
    expect(childProcess.exec).not.toHaveBeenCalled();
    expect(electron.shell.showItemInFolder).toHaveBeenCalledWith(result.path);
    expect(result.path).toBe(path.join(root, 'Movies/NightOwl/Recordings', filename));
    expect(fs.readFileSync(result.path)).toEqual(Buffer.from([1, 2]));
  });
});

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const source = fs.readFileSync(path.join(__dirname, '../../../main.js'), 'utf8');
const start = source.indexOf('  // Prompt to save unsaved changes');
const block = source.slice(start, source.indexOf('\n  return win;', start));
const tick = () => new Promise(setImmediate);
function fixture(response) {
  const win = new EventEmitter();
  let destroyed = false;
  win.isDestroyed = () => destroyed;
  win.webContents = { isDestroyed: () => false, executeJavaScript: jest.fn(async () => ['draft']), send: jest.fn() };
  win.close = () => { let prevented = false; win.emit('close', { preventDefault() { prevented = true; } }); if (!prevented) { destroyed = true; win.emit('closed'); } };
  win.destroy = () => { destroyed = true; win.emit('closed'); };
  const ipcMain = new EventEmitter();
  const app = { relaunch: jest.fn(), quit: jest.fn() };
  const dialog = { showMessageBox: jest.fn(async () => ({ response })), showErrorBox: jest.fn() };
  const prepared = { handoff: jest.fn(async () => {}), discard: jest.fn() };
  vm.runInNewContext(block, { win, ipcMain, app, dialog, saveSettings() {}, console, setTimeout, clearTimeout });
  return { win, ipcMain, app, dialog, prepared };
}
test('cancel discards the build and a later ordinary close never installs it', async () => {
  const f = fixture(2); f.win.emit('restart-requested', null, f.prepared); await tick();
  expect(f.prepared.discard).toHaveBeenCalledTimes(1);
  expect(f.prepared.handoff).not.toHaveBeenCalled();
  f.win.webContents.executeJavaScript.mockResolvedValue([]); f.win.close(); await tick();
  expect(f.prepared.handoff).not.toHaveBeenCalled();
  expect(f.app.relaunch).not.toHaveBeenCalled();
});
test('save must finish before handing off installation and quitting', async () => {
  const f = fixture(0); f.win.emit('restart-requested', null, f.prepared); await tick();
  expect(f.win.webContents.send).toHaveBeenCalledWith('save-all-and-close');
  expect(f.prepared.handoff).not.toHaveBeenCalled();
  f.ipcMain.emit('saves-completed-close', { sender: f.win.webContents }); await tick();
  expect(f.prepared.handoff).toHaveBeenCalledTimes(1);
  expect(f.app.quit).toHaveBeenCalledTimes(1);
  expect(f.app.relaunch).not.toHaveBeenCalled();
});
test('a failed installer handoff leaves the window open and saving can be retried', async () => {
  const f = fixture(0); f.prepared.handoff.mockRejectedValue(new Error('worker failed'));
  f.win.emit('restart-requested', null, f.prepared); await tick();
  f.ipcMain.emit('saves-completed-close', { sender: f.win.webContents }); await tick();
  expect(f.win.isDestroyed()).toBe(false);
  expect(f.dialog.showErrorBox).toHaveBeenCalledWith('Restart failed', 'worker failed');
  f.win.close(); await tick();
  f.ipcMain.emit('saves-completed-close', { sender: f.win.webContents }); await tick();
  expect(f.win.isDestroyed()).toBe(true);
  expect(f.app.quit).not.toHaveBeenCalled();
});

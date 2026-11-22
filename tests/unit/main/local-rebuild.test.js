const fs = require('fs');
const os = require('os');
const path = require('path');
const { acquireLock, installPrepared } = require('../../../services/localRebuild');

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-rebuild-test-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
function config() {
  const c = { parentPid: 123, target: path.join(root, 'NightOwl.app'), staged: path.join(root, 'staged.app'), backup: path.join(root, 'backup.app'), lock: path.join(root, 'lock'), args: ['a path with spaces'], userData: path.join(root, 'profile') };
  fs.mkdirSync(c.target); fs.mkdirSync(c.staged);
  fs.writeFileSync(path.join(c.target, 'version'), 'old');
  fs.writeFileSync(path.join(c.staged, 'version'), 'new');
  fs.writeFileSync(c.lock, '123');
  return c;
}
test('rejects a simultaneous rebuild without disturbing the active lock', () => {
  const lock = acquireLock(root);
  expect(() => acquireLock(root)).toThrow('already running');
  expect(fs.readFileSync(lock, 'utf8')).toBe(String(process.pid));
});
test('waits for app exit, swaps bundles, preserves backup and profile arguments', async () => {
  const c = config();
  let polls = 0;
  const run = jest.fn(async (command, args) => {
    expect(command).toBe('/usr/bin/open');
    expect(args).toEqual(['-n', c.target, '--args', 'a path with spaces', `--nightowl-user-data-dir=${c.userData}`]);
    expect(fs.readFileSync(path.join(c.target, 'version'), 'utf8')).toBe('new');
  });
  await installPrepared(c, { alive: () => polls++ < 2, sleep: async () => {
    expect(fs.readFileSync(path.join(c.target, 'version'), 'utf8')).toBe('old');
  }, run });
  expect(run).toHaveBeenCalledTimes(1);
  expect(fs.readFileSync(path.join(c.backup, 'version'), 'utf8')).toBe('old');
  expect(fs.existsSync(c.lock)).toBe(false);
});
test('restores and reopens the previous app when launching the new bundle fails', async () => {
  const c = config();
  const run = jest.fn().mockRejectedValueOnce(new Error('launch failed')).mockResolvedValueOnce();
  await expect(installPrepared(c, { alive: () => false, run })).rejects.toThrow('launch failed');
  expect(fs.readFileSync(path.join(c.target, 'version'), 'utf8')).toBe('old');
  expect(run).toHaveBeenCalledTimes(2);
  expect(fs.existsSync(c.lock)).toBe(false);
});
test('restores previous app if staging disappears before installation', async () => {
  const c = config(); fs.rmSync(c.staged, { recursive: true });
  const run = jest.fn(async () => {});
  await expect(installPrepared(c, { alive: () => false, run })).rejects.toThrow();
  expect(fs.readFileSync(path.join(c.target, 'version'), 'utf8')).toBe('old');
  expect(run).toHaveBeenCalledTimes(1);
});
test('never replaces the running app when shutdown times out', async () => {
  const c = config(); const run = jest.fn();
  await expect(installPrepared(c, { alive: () => true, sleep: async () => {}, run })).rejects.toThrow('installation cancelled');
  expect(fs.readFileSync(path.join(c.target, 'version'), 'utf8')).toBe('old');
  expect(fs.existsSync(c.backup)).toBe(false);
  expect(run).not.toHaveBeenCalled();
});

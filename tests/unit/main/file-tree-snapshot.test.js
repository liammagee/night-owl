const fs = require('fs');
const os = require('os');
const path = require('path');
const { createFileTreeSnapshot } = require('../../../services/fileTreeSnapshot');
describe('on-demand file tree snapshots', () => {
  let root, snapshot, callbacks, closers, read;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-tree-demand-'));
    fs.mkdirSync(path.join(root, 'nested'));
    fs.writeFileSync(path.join(root, 'visible.md'), '# Visible');
    fs.writeFileSync(path.join(root, 'nested', 'deep.md'), '# Deep');
    fs.symlinkSync(root, path.join(root, 'nested', 'cycle'));
    callbacks = new Map(); closers = [];
    read = jest.fn((...args) => fs.promises.readdir(...args));
    snapshot = createFileTreeSnapshot({ fs: { readdir: read }, watch: (dir, _options, callback) => {
      callbacks.set(dir, callback); const close = jest.fn(); closers.push(close); return { close, on() {} };
    } });
  });
  afterEach(() => { snapshot.dispose(); fs.rmSync(root, { recursive: true, force: true }); });
  test('closed directories cost no traversal, repeated reads cost no filesystem calls, and expansion is lazy', async () => {
    const result = await snapshot.build(root);
    expect(result.tree.children.find(n => n.name === 'nested')).toMatchObject({ childrenLoaded: false, children: [] });
    expect(read).toHaveBeenCalledTimes(1);
    await snapshot.build(root); expect(read).toHaveBeenCalledTimes(1);
    const expanded = await snapshot.build(root, { expandedPaths: [path.join(root, 'nested')] });
    expect(read).toHaveBeenCalledTimes(2);
    expect(expanded.tree.children.find(n => n.name === 'nested').children.map(n => n.name)).toEqual(['deep.md']);
  });
  test('filesystem events invalidate only affected listings', async () => {
    await snapshot.build(root);
    fs.writeFileSync(path.join(root, 'new.md'), 'new'); callbacks.get(root)('rename');
    const result = await snapshot.build(root);
    expect(result.tree.children.map(n => n.name)).toContain('new.md');
    expect(read).toHaveBeenCalledTimes(2);
    expect(closers[0]).toHaveBeenCalledTimes(1);
  });
  test('explicit recursive search finds collapsed files without following symlink cycles', async () => {
    const result = await snapshot.build(root, { recursive: true });
    expect(result.tree.children.find(n => n.name === 'nested').children.map(n => n.name)).toEqual(['deep.md']);
    expect(read).toHaveBeenCalledTimes(2);
    snapshot.retain(new Set([root]));
    expect(snapshot.getDiagnostics().directoryWatchers).toBe(1);
    snapshot.dispose(); expect(snapshot.getDiagnostics().directoryWatchers).toBe(0);
  });
  test('unsupported watchers use an expiring cache rather than stale data forever', async () => {
    snapshot.dispose(); let now = 0;
    snapshot = createFileTreeSnapshot({ fs: { readdir: read }, watch: () => { throw new Error('unsupported'); }, now: () => now });
    await snapshot.build(root); await snapshot.build(root); expect(read).toHaveBeenCalledTimes(1);
    now = 4001; await snapshot.build(root); expect(read).toHaveBeenCalledTimes(2);
  });
});

const fs = require('fs');
const os = require('os');
const path = require('path');
const { guardedWriteFile } = require('../../../services/fileWrites');

describe('durable document saves', () => {
  let root, file;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-durable-')); file = path.join(root, 'draft.md'); fs.writeFileSync(file, 'original', { mode: 0o640 }); });
  afterEach(() => { jest.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
  test('failed writes leave the original intact and remove staging files', async () => {
    const fsApi = { ...fs.promises, writeFile: async (destination, data, options) => {
      if (String(destination).includes('.gitignore')) return fs.promises.writeFile(destination, data, options);
      await fs.promises.writeFile(destination, 'partial');
      throw new Error('simulated disk full');
    }, open: async (...args) => {
      const handle = await fs.promises.open(...args);
      handle.writeFile = async () => { await handle.write('partial'); throw new Error('simulated disk full'); };
      return handle;
    } };
    await expect(guardedWriteFile(file, 'new text', { expectedContent: 'original' }, { fsApi })).rejects.toThrow('disk full');
    expect(fs.readFileSync(file, 'utf8')).toBe('original');
    expect(fs.readdirSync(root).filter(name => name.endsWith('.tmp'))).toEqual([]);
  });
  test('concurrent expected-content writes cannot both overwrite the same version', async () => {
    const results = await Promise.all(['first', 'second'].map(content => guardedWriteFile(file, content, { expectedContent: 'original' })));
    expect(results.filter(result => result.success)).toHaveLength(1);
    expect(results.filter(result => result.code === 'FILE_MODIFIED_EXTERNALLY')).toHaveLength(1);
  });
  test('rapid saves keep distinct recoverable backups and preserve permissions', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1234);
    const a = await guardedWriteFile(file, 'first');
    const b = await guardedWriteFile(file, 'second');
    expect(a.backupPath).not.toBe(b.backupPath);
    expect(fs.readFileSync(a.backupPath, 'utf8')).toBe('original');
    expect(fs.readFileSync(b.backupPath, 'utf8')).toBe('first');
    expect(fs.statSync(file).mode & 0o777).toBe(0o640);
  });
  test('saving through a symbolic link preserves the link and updates its target', async () => {
    const alias = path.join(root, 'alias.md'); fs.symlinkSync(file, alias);
    const result = await guardedWriteFile(alias, 'updated', { expectedContent: 'original' });
    expect(result.success).toBe(true);
    expect(fs.lstatSync(alias).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toBe('updated');
  });
});

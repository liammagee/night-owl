const fs = require('fs');
const os = require('os');
const path = require('path');
const { __testHooks } = require('../../../ipc/fileHandlers');

describe('File Save Safeguards', () => {
  let root, file;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-save-')); file = path.join(root, 'draft.md'); fs.writeFileSync(file, 'original'); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  test('backup path stays in the local recovery directory', () => {
    expect(__testHooks.buildBackupFilePath(file, 1234)).toBe(path.join(root, '.nightowl-backups/draft.1234.md.bak'));
  });
  test('blocks a changed mtime baseline', async () => {
    const result = await __testHooks.guardedWriteFile(file, 'new', {}, { fileStateMap: new Map([[file, { mtimeMs: 1 }]]) });
    expect(result.code).toBe('FILE_MODIFIED_EXTERNALLY');
    expect(fs.readFileSync(file, 'utf8')).toBe('original');
  });
  test('backs up the original and updates the caller saved state', async () => {
    const fileStateMap = new Map([[file, fs.statSync(file)]]);
    const result = await __testHooks.guardedWriteFile(file, 'updated', {}, { fileStateMap });
    expect(result.success).toBe(true);
    expect(fs.readFileSync(result.backupPath, 'utf8')).toBe('original');
    expect(fs.readFileSync(file, 'utf8')).toBe('updated');
    expect(fs.readFileSync(path.join(root, '.nightowl-backups/.gitignore'), 'utf8')).toBe('*\n');
    expect(fileStateMap.get(file).mtimeMs).toBe(fs.statSync(file).mtimeMs);
  });
  test('a recovered buffer cannot overwrite newer disk content', async () => {
    const result = await __testHooks.guardedWriteFile(file, 'draft', { expectedContent: 'older original' });
    expect(result.code).toBe('FILE_MODIFIED_EXTERNALLY');
    expect(fs.readFileSync(file, 'utf8')).toBe('original');
  });
  test('does not recreate a deleted document with a known baseline', async () => {
    const fileStateMap = new Map([[file, fs.statSync(file)]]); fs.unlinkSync(file);
    const result = await __testHooks.guardedWriteFile(file, 'draft', {}, { fileStateMap });
    expect(result.code).toBe('FILE_MODIFIED_EXTERNALLY');
    expect(fs.existsSync(file)).toBe(false);
  });
  test('an explicit force saves over a confirmed conflict', async () => {
    const result = await __testHooks.guardedWriteFile(file, 'draft', { expectedContent: 'old', force: true });
    expect(result.success).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toBe('draft');
  });
});

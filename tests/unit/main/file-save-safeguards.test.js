const path = require('path');
const { __testHooks } = require('../../../ipc/fileHandlers');

describe('File Save Safeguards', () => {
  test('buildBackupFilePath writes into local backup directory', () => {
    const filePath = '/tmp/project/notes/chapter-1.md';
    const backupPath = __testHooks.buildBackupFilePath(filePath, 1700000000000);

    expect(backupPath).toContain(`${path.sep}.nightowl-backups${path.sep}`);
    expect(backupPath).toContain('chapter-1.1700000000000.md.bak');
  });

  test('guardedWriteFile blocks save when file changed externally', async () => {
    const fileStateMap = new Map();
    fileStateMap.set('/tmp/test.md', { mtimeMs: 1000, size: 20 });

    const fsApi = {
      stat: jest.fn(async () => ({ mtimeMs: 2000, size: 25 })),
      writeFile: jest.fn(),
      mkdir: jest.fn(),
      copyFile: jest.fn()
    };

    const result = await __testHooks.guardedWriteFile(
      '/tmp/test.md',
      'new content',
      {},
      { fsApi, fileStateMap }
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe(__testHooks.SAVE_CONFLICT_CODE);
    expect(fsApi.writeFile).not.toHaveBeenCalled();
  });

  test('guardedWriteFile creates backup and updates known file state', async () => {
    const filePath = '/tmp/test.md';
    const fileStateMap = new Map();
    fileStateMap.set(filePath, { mtimeMs: 1000, size: 20 });

    const statCalls = [
      { mtimeMs: 1000, size: 20 }, // pre-write check
      { mtimeMs: 1000, size: 20 }, // backup existence check
      { mtimeMs: 3000, size: 30 }  // post-write state
    ];

    const fsApi = {
      stat: jest.fn(async () => statCalls.shift()),
      mkdir: jest.fn(async () => {}),
      copyFile: jest.fn(async () => {}),
      writeFile: jest.fn(async () => {})
    };

    const result = await __testHooks.guardedWriteFile(
      filePath,
      'updated content',
      {},
      { fsApi, fileStateMap }
    );

    expect(result.success).toBe(true);
    expect(result.backupPath).toContain('.nightowl-backups');
    expect(fsApi.copyFile).toHaveBeenCalledWith(filePath, expect.stringContaining('.nightowl-backups'));
    expect(fsApi.writeFile).toHaveBeenCalledWith(filePath, 'updated content', 'utf8');
    expect(fileStateMap.get(filePath).mtimeMs).toBe(3000);
  });

  test('recovered content cannot overwrite an external edit even after its mtime baseline was refreshed', async () => {
    const fsApi = {
      stat: jest.fn(async () => ({ mtimeMs: 2000, size: 30 })),
      readFile: jest.fn(async () => 'external edits after the crash'),
      writeFile: jest.fn(), mkdir: jest.fn(), copyFile: jest.fn()
    };
    const fileStateMap = new Map([['/tmp/test.md', { mtimeMs: 2000, size: 30 }]]);

    const result = await __testHooks.guardedWriteFile('/tmp/test.md', 'recovered draft', {
      expectedContent: 'content before the crash'
    }, { fsApi, fileStateMap });

    expect(result).toMatchObject({ success: false, code: 'FILE_MODIFIED_EXTERNALLY', currentMtimeMs: 2000 });
    expect(fsApi.writeFile).not.toHaveBeenCalled();
    expect(fsApi.copyFile).not.toHaveBeenCalled();
  });

  test('autosave does not recreate a document deleted since it was opened', async () => {
    const fsApi = {
      stat: jest.fn(async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); }),
      writeFile: jest.fn()
    };
    const fileStateMap = new Map([['/tmp/test.md', { mtimeMs: 2000, size: 30 }]]);

    const result = await __testHooks.guardedWriteFile('/tmp/test.md', 'draft', {}, { fsApi, fileStateMap });

    expect(result).toMatchObject({ success: false, code: 'FILE_MODIFIED_EXTERNALLY', currentMtimeMs: null });
    expect(fsApi.writeFile).not.toHaveBeenCalled();
  });

  test('explicit force can save recovered content after a conflict was confirmed', async () => {
    const fsApi = {
      stat: jest.fn(async () => ({ mtimeMs: 2000, size: 30 })),
      readFile: jest.fn(),
      writeFile: jest.fn(), mkdir: jest.fn(), copyFile: jest.fn()
    };
    const result = await __testHooks.guardedWriteFile('/tmp/test.md', 'recovered draft', {
      expectedContent: 'old content', force: true
    }, { fsApi });

    expect(result.success).toBe(true);
    expect(fsApi.readFile).not.toHaveBeenCalled();
    expect(fsApi.writeFile).toHaveBeenCalledWith('/tmp/test.md', 'recovered draft', 'utf8');
  });
});

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseNightOwlLaunchArgs,
  resolveLaunchTarget,
  absolutizeCliPathArgs
} = require('../../../services/launchArgs');

describe('NightOwl launch argument handling', () => {
  test('parses editor-style path arguments while ignoring Electron app args', () => {
    const appRoot = '/Users/example/NightOwl';
    const parsed = parseNightOwlLaunchArgs(
      [appRoot, '--dev', '--remote-debugging-port=0', '.'],
      { cwd: '/Users/example/project', appRoot }
    );

    expect(parsed.paths).toEqual(['.']);
    expect(parsed.help).toBe(false);
    expect(parsed.version).toBe(false);
  });

  test('resolves a directory launch target as a workspace', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-launch-'));

    const target = resolveLaunchTarget('.', { cwd: tempDir });

    expect(target).toMatchObject({
      type: 'directory',
      path: tempDir,
      rawPath: '.'
    });
  });

  test('resolves a file launch target with its parent workspace', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-launch-'));
    const filePath = path.join(tempDir, 'note.md');
    fs.writeFileSync(filePath, '# Note\n');

    const target = resolveLaunchTarget('note.md', { cwd: tempDir });

    expect(target).toMatchObject({
      type: 'file',
      path: filePath,
      rawPath: 'note.md',
      workspacePath: tempDir
    });
  });

  test('absolutizes CLI path arguments before launching the app', () => {
    const args = absolutizeCliPathArgs(['--dev', '.', 'notes/today.md'], {
      cwd: '/Users/example/project'
    });

    expect(args).toEqual([
      '--dev',
      '/Users/example/project',
      '/Users/example/project/notes/today.md'
    ]);
  });
});

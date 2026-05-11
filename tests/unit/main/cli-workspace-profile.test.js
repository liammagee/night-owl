const path = require('path');

const {
  WORKSPACE_PROFILE_ENV,
  WORKSPACE_PROFILE_FLAG,
  appendWorkspaceProfileArgs,
  extractWorkspaceUserDataDir,
  getWorkspacePathForProfile,
  getWorkspaceUserDataPath,
  hasUserDataArg,
  resolveWorkspaceUserDataPath
} = require('../../../services/cliWorkspaceProfile');
const { parseNightOwlLaunchArgs } = require('../../../services/launchArgs');

describe('NightOwl CLI workspace profiles', () => {
  test('uses directory launch targets as workspace profile identity', () => {
    const fs = {
      statSync: jest.fn(() => ({ isDirectory: () => true, isFile: () => false }))
    };

    expect(getWorkspacePathForProfile(['.'], { cwd: '/Users/example/project', fs }))
      .toBe('/Users/example/project');
  });

  test('keeps a user-supplied current directory even when it is the app checkout', () => {
    const parsed = parseNightOwlLaunchArgs(['.'], {
      cwd: '/Users/example/NightOwl'
    });

    expect(parsed.paths).toEqual(['.']);
  });

  test('uses a file launch target parent directory as profile identity', () => {
    const fs = {
      statSync: jest.fn(() => ({ isDirectory: () => false, isFile: () => true }))
    };

    expect(getWorkspacePathForProfile(['/Users/example/project/note.md'], { fs }))
      .toBe('/Users/example/project');
  });

  test('generates stable, distinct user-data paths for workspaces', () => {
    const first = getWorkspaceUserDataPath('/Users/example/project', {
      baseUserDataPath: '/tmp/NightOwl'
    });
    const again = getWorkspaceUserDataPath('/Users/example/project', {
      baseUserDataPath: '/tmp/NightOwl'
    });
    const second = getWorkspaceUserDataPath('/Users/example/other', {
      baseUserDataPath: '/tmp/NightOwl'
    });

    expect(first).toBe(again);
    expect(first).not.toBe(second);
    expect(first).toContain(path.join('/tmp/NightOwl', 'workspace-profiles', 'project-'));
  });

  test('resolves profile path for environment handoff without mutating argv', () => {
    const userDataPath = resolveWorkspaceUserDataPath(['/Users/example/project'], {
      argv: ['/Users/example/project'],
      baseUserDataPath: '/tmp/NightOwl',
      fs: { statSync: () => ({ isDirectory: () => true, isFile: () => false }) }
    });

    expect(WORKSPACE_PROFILE_ENV).toBe('NIGHTOWL_WORKSPACE_USER_DATA_DIR');
    expect(userDataPath).toContain(path.join('/tmp/NightOwl', 'workspace-profiles', 'project-'));
  });

  test('prepends workspace user-data args unless the caller already provided them', () => {
    const args = appendWorkspaceProfileArgs(['/Users/example/project'], {
      cliPaths: ['/Users/example/project'],
      baseUserDataPath: '/tmp/NightOwl',
      fs: { statSync: () => ({ isDirectory: () => true, isFile: () => false }) }
    });

    expect(args[0]).toContain('--user-data-dir=');
    expect(args[0]).toContain(path.join('/tmp/NightOwl', 'workspace-profiles', 'project-'));
    expect(args[1]).toContain(`${WORKSPACE_PROFILE_FLAG}=`);
    expect(args[2]).toBe('/Users/example/project');

    expect(appendWorkspaceProfileArgs(['--user-data-dir', '/tmp/custom', '/Users/example/project'], {
      cliPaths: ['/Users/example/project']
    })).toEqual(['--user-data-dir', '/tmp/custom', '/Users/example/project']);
    expect(hasUserDataArg([WORKSPACE_PROFILE_FLAG, '/tmp/profile'])).toBe(true);
  });

  test('extracts the app-specific workspace profile flag for main-process setup', () => {
    expect(extractWorkspaceUserDataDir([WORKSPACE_PROFILE_FLAG, '/tmp/profile'])).toBe('/tmp/profile');
    expect(extractWorkspaceUserDataDir([`${WORKSPACE_PROFILE_FLAG}=/tmp/profile`])).toBe('/tmp/profile');
  });
});

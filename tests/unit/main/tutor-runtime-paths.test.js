const path = require('path');

const {
  assertWritableRuntimePath,
  isApplicationBundlePath,
  resolveTutorRuntimePaths
} = require('../../../services/tutorRuntimePaths');

describe('tutor-core runtime paths', () => {
  test('places all mutable tutor-core state beneath Electron userData', () => {
    const userDataPath = path.join(path.sep, 'tmp', 'NightOwl-profile');

    expect(resolveTutorRuntimePaths(userDataPath)).toEqual({
      dataDir: path.join(userDataPath, 'tutor-core'),
      dbPath: path.join(userDataPath, 'tutor-core', 'tutor-core.db'),
      logDir: path.join(userDataPath, 'tutor-core', 'logs')
    });
  });

  test('rejects app.asar, application-bundle, and relative destinations', () => {
    const asarPath = path.join(path.sep, 'Applications', 'NightOwl.app', 'Contents', 'Resources', 'app.asar', 'data');
    const bundlePath = path.join(path.sep, 'Applications', 'NightOwl.app', 'Contents', 'Resources', 'data');

    expect(isApplicationBundlePath(asarPath)).toBe(true);
    expect(isApplicationBundlePath(bundlePath)).toBe(true);
    expect(() => assertWritableRuntimePath(asarPath, 'data')).toThrow('app.asar');
    expect(() => assertWritableRuntimePath(bundlePath, 'data')).toThrow('application bundle');
    expect(() => assertWritableRuntimePath('relative/data', 'data')).toThrow('absolute path');
  });
});

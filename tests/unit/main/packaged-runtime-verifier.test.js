const path = require('path');
const {
  REQUIRED_NATIVE_RUNTIME_FILES,
  defaultPackagedAppPath,
  resolveResourcesPath,
  verifyPackagedRuntime
} = require('../../../scripts/verify-packaged-runtime');

describe('packaged runtime verifier', () => {
  test('uses the architecture-specific macOS unpacked app by default', () => {
    expect(defaultPackagedAppPath({ platform: 'darwin', arch: 'arm64' }))
      .toBe(path.resolve('dist/mac-arm64/NightOwl.app'));
    expect(defaultPackagedAppPath({ platform: 'darwin', arch: 'x64' }))
      .toBe(path.resolve('dist/mac/NightOwl.app'));
  });

  test('resolves the macOS Resources directory', () => {
    expect(resolveResourcesPath('/tmp/NightOwl.app', { platform: 'darwin' }))
      .toBe('/tmp/NightOwl.app/Contents/Resources');
  });

  test('accepts a complete ASAR and native unpacked payload', () => {
    const appPath = '/tmp/NightOwl.app';
    const resources = `${appPath}/Contents/Resources`;
    const present = new Set([
      `${resources}/app.asar`,
      ...REQUIRED_NATIVE_RUNTIME_FILES.map(file => `${resources}/app.asar.unpacked/${file}`)
    ]);

    expect(verifyPackagedRuntime(appPath, {
      platform: 'darwin',
      existsSync: filePath => present.has(filePath)
    })).toMatchObject({ ok: true, missing: [] });
  });

  test('rejects an empty app.asar.unpacked directory with actionable paths', () => {
    const appPath = '/tmp/NightOwl.app';
    const resources = `${appPath}/Contents/Resources`;
    const result = verifyPackagedRuntime(appPath, {
      platform: 'darwin',
      existsSync: filePath => filePath === `${resources}/app.asar`
    });

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(REQUIRED_NATIVE_RUNTIME_FILES);
    expect(result.missing).toContain('node_modules/sqlite3/package.json');
  });
});

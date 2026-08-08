'use strict';

const fs = require('fs/promises');
const path = require('path');
const { test, expect } = require('../fixtures/packaged-electron-app');

test('@packaged @tutor-core initializes writable local storage without an external AI provider', async ({
  appPage,
  packagedProfile
}) => {
  const status = await appPage.evaluate(() => window.electronAPI.invoke('get-tutor-core-status'));

  expect(status).toMatchObject({
    success: true,
    ok: true,
    coreAvailable: true,
    storageReady: true,
    learnerId: 'local-writer',
    error: null
  });
  expect(status.runtimePaths).toEqual({
    dataDir: path.join(packagedProfile, 'tutor-core'),
    dbPath: path.join(packagedProfile, 'tutor-core', 'tutor-core.db'),
    logDir: path.join(packagedProfile, 'tutor-core', 'logs')
  });

  const dbStat = await fs.stat(status.runtimePaths.dbPath);
  const logDirStat = await fs.stat(status.runtimePaths.logDir);
  expect(dbStat.isFile()).toBe(true);
  expect(logDirStat.isDirectory()).toBe(true);
  for (const targetPath of Object.values(status.runtimePaths)) {
    expect(targetPath.startsWith(`${packagedProfile}${path.sep}`)).toBe(true);
    expect(targetPath).not.toContain('app.asar');
    expect(targetPath).not.toContain(`${path.sep}Contents${path.sep}Resources${path.sep}`);
  }
});

'use strict';

const fs = require('fs/promises');
const path = require('path');
const { listPackage } = require('@electron/asar');
const { test, expect } = require('../fixtures/packaged-electron-app');

function resolveAppArchive(appPath) {
  const resolved = path.resolve(appPath);
  if (process.platform === 'darwin' && resolved.endsWith('.app')) {
    return path.join(resolved, 'Contents', 'Resources', 'app.asar');
  }
  return path.join(path.dirname(resolved), 'resources', 'app.asar');
}

test('@packaged @tutor-core initializes writable local storage without an external AI provider', async ({
  appPage,
  packagedProfile
}) => {
  const archivePath = resolveAppArchive(process.env.NIGHTOWL_PACKAGED_APP);
  const archiveEntries = listPackage(archivePath);
  const tutorCorePrefix = '/node_modules/@machinespirits/tutor-core/';
  const tutorCoreEntries = archiveEntries.filter(entry => entry.startsWith(tutorCorePrefix));
  const forbiddenEntries = [
    '.claude/',
    '.github/',
    '.npmignore',
    'CHANGELOG.md',
    'data/',
    'logs/',
    'package-lock.json',
    'services/__tests__/',
    'vitest.config.js'
  ];

  expect(tutorCoreEntries).toContain(`${tutorCorePrefix}index.js`);
  expect(tutorCoreEntries).toContain(`${tutorCorePrefix}package.json`);
  for (const forbiddenEntry of forbiddenEntries) {
    expect(tutorCoreEntries).not.toContainEqual(
      expect.stringMatching(`^${tutorCorePrefix}${forbiddenEntry}`)
    );
  }

  const status = await appPage.evaluate(() => window.electronAPI.ai.getTutorCoreStatus());

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

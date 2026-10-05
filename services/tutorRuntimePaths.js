'use strict';

const path = require('path');

function isApplicationBundlePath(targetPath) {
  const normalized = path.resolve(targetPath);
  const segments = normalized.split(path.sep).filter(Boolean);
  if (segments.some(segment => segment.endsWith('.asar'))) return true;

  const appIndex = segments.findIndex(segment => segment.endsWith('.app'));
  return appIndex >= 0 && segments[appIndex + 1] === 'Contents';
}

function assertWritableRuntimePath(targetPath, label) {
  if (!targetPath || !path.isAbsolute(targetPath)) {
    throw new Error(`${label} must be an absolute path`);
  }
  if (isApplicationBundlePath(targetPath)) {
    throw new Error(`${label} must not be inside app.asar or an application bundle`);
  }
}

function resolveTutorRuntimePaths(userDataPath) {
  assertWritableRuntimePath(userDataPath, 'Electron userData path');
  const dataDir = path.join(userDataPath, 'tutor-core');
  const runtimePaths = {
    dataDir,
    dbPath: path.join(dataDir, 'tutor-core.db'),
    logDir: path.join(dataDir, 'logs')
  };

  for (const [name, targetPath] of Object.entries(runtimePaths)) {
    assertWritableRuntimePath(targetPath, `Tutor-core ${name}`);
  }
  return runtimePaths;
}

module.exports = {
  assertWritableRuntimePath,
  isApplicationBundlePath,
  resolveTutorRuntimePaths
};

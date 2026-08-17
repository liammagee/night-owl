#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_NATIVE_RUNTIME_FILES = Object.freeze([
  'node_modules/sqlite3/package.json',
  'node_modules/sqlite3/build/Release/node_sqlite3.node',
  'node_modules/better-sqlite3/package.json',
  'node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  'node_modules/node-pty/package.json',
  'node_modules/node-pty/build/Release/pty.node'
]);

function defaultPackagedAppPath(options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  if (platform === 'darwin') {
    return path.resolve('dist', arch === 'arm64' ? 'mac-arm64' : 'mac', 'NightOwl.app');
  }
  if (platform === 'win32') {
    return path.resolve('dist', 'win-unpacked');
  }
  return path.resolve('dist', 'linux-unpacked');
}

function resolveResourcesPath(appPath, options = {}) {
  const platform = options.platform || process.platform;
  if (platform === 'darwin' || appPath.endsWith('.app')) {
    return path.join(appPath, 'Contents', 'Resources');
  }
  return path.join(appPath, 'resources');
}

function verifyPackagedRuntime(appPath, options = {}) {
  const exists = options.existsSync || fs.existsSync;
  const resolvedAppPath = path.resolve(appPath);
  const resourcesPath = resolveResourcesPath(resolvedAppPath, options);
  const asarPath = path.join(resourcesPath, 'app.asar');
  const unpackedPath = path.join(resourcesPath, 'app.asar.unpacked');
  const missing = [];

  if (!exists(asarPath)) missing.push('app.asar');
  for (const relativePath of REQUIRED_NATIVE_RUNTIME_FILES) {
    if (!exists(path.join(unpackedPath, relativePath))) missing.push(relativePath);
  }

  return {
    ok: missing.length === 0,
    appPath: resolvedAppPath,
    resourcesPath,
    unpackedPath,
    requiredFiles: [...REQUIRED_NATIVE_RUNTIME_FILES],
    missing
  };
}

function main() {
  const appPath = process.argv[2] || process.env.NIGHTOWL_PACKAGED_APP || defaultPackagedAppPath();
  const result = verifyPackagedRuntime(appPath);
  if (!result.ok) {
    console.error('[packaged-runtime] incomplete packaged native runtime:');
    for (const relativePath of result.missing) console.error(`  - ${relativePath}`);
    console.error(`[packaged-runtime] checked ${result.appPath}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[packaged-runtime] verified ${result.requiredFiles.length} native runtime files`);
  console.log(`[packaged-runtime] app: ${result.appPath}`);
}

if (require.main === module) main();

module.exports = {
  REQUIRED_NATIVE_RUNTIME_FILES,
  defaultPackagedAppPath,
  resolveResourcesPath,
  verifyPackagedRuntime
};

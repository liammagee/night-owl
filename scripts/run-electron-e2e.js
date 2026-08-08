#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const {
  REPO_ROOT,
  assertMatchingLockfile,
  findNodeModules
} = require('./local-ci');

function createPlaywrightInvocation(argv = process.argv.slice(2), env = process.env) {
  const dependency = findNodeModules({ env });
  assertMatchingLockfile(REPO_ROOT, dependency);

  const cliPath = path.join(dependency.path, '@playwright', 'test', 'cli.js');
  const electronPackagePath = path.join(dependency.path, 'electron', 'package.json');
  if (!require('fs').existsSync(cliPath) || !require('fs').existsSync(electronPackagePath)) {
    throw new Error(`Shared dependencies do not contain Playwright and Electron: ${dependency.path}`);
  }

  return {
    command: process.execPath,
    args: [cliPath, 'test', ...argv],
    dependency,
    env: {
      ...env,
      NODE_PATH: [dependency.path, env.NODE_PATH].filter(Boolean).join(path.delimiter),
      NIGHTOWL_NODE_MODULES: dependency.path
    }
  };
}

function main(argv = process.argv.slice(2)) {
  const invocation = createPlaywrightInvocation(argv);
  console.log(`Electron E2E dependencies: ${invocation.dependency.path} (${invocation.dependency.source})`);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: REPO_ROOT,
    env: invocation.env,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  return result;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`electron-e2e: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { createPlaywrightInvocation, main };

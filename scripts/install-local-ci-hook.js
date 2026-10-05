#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const hooksPath = '.githooks';
const hookFile = path.join(repoRoot, hooksPath, 'pre-push');
const uninstall = process.argv.slice(2).includes('--uninstall');

function gitConfig(args, options = {}) {
  try {
    return execFileSync('git', ['config', '--local', ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: options.quiet ? ['ignore', 'pipe', 'ignore'] : undefined
    }).trim();
  } catch (error) {
    if (options.allowFailure) return '';
    throw error;
  }
}

function main() {
  const current = gitConfig(['--get', 'core.hooksPath'], { quiet: true, allowFailure: true });

  if (uninstall) {
    if (!current) {
      console.log('Local CI hook is not installed.');
      return;
    }
    if (current !== hooksPath) {
      throw new Error(`Refusing to replace custom core.hooksPath: ${current}`);
    }
    gitConfig(['--unset', 'core.hooksPath']);
    console.log('Local CI pre-push hook disabled.');
    return;
  }

  if (current && current !== hooksPath) {
    throw new Error(`Refusing to replace custom core.hooksPath: ${current}`);
  }
  if (!fs.existsSync(hookFile)) throw new Error(`Hook file is missing: ${hookFile}`);
  fs.chmodSync(hookFile, 0o755);
  gitConfig(['core.hooksPath', hooksPath]);
  console.log('Local CI pre-push hook enabled. Every git push will run npm run ci:local.');
}

try {
  main();
} catch (error) {
  console.error(`ci-hook: ${error.message}`);
  process.exitCode = 1;
}

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  installNightOwlCli,
  uninstallNightOwlCli
} = require('../services/cliInstaller');

const repoRoot = path.resolve(__dirname, '..');
const source = path.join(repoRoot, 'bin', 'nightowl');
const uninstall = process.argv.includes('--uninstall');
const force = process.argv.includes('--force');

function main() {
  if (!fs.existsSync(source)) {
    throw new Error(`NightOwl CLI source not found: ${source}`);
  }

  if (uninstall) {
    const result = uninstallNightOwlCli({ force });
    console.log(result.removed ? `Removed ${result.target}` : `No NightOwl CLI found at ${result.target}`);
    return;
  }

  const result = installNightOwlCli({
    force,
    launcherPath: source,
    appName: 'NightOwl'
  });

  console.log(`Installed NightOwl CLI: ${result.target}`);
  if (!result.pathIncludesTargetDir) {
    console.log(`Add this directory to PATH before using it: ${result.targetDir}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`nightowl cli install failed: ${error.message}`);
  process.exit(1);
}

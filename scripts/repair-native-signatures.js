#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function info(message) {
  console.log(`[native-sign] ${message}`);
}

function warn(message) {
  console.warn(`[native-sign] ${message}`);
}

function listNodeBinaries(rootDir) {
  const binaries = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];

    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.node')) {
        binaries.push(fullPath);
      }
    }
  }

  return binaries;
}

function runCodesign(args) {
  return spawnSync('codesign', args, {
    stdio: 'pipe',
    encoding: 'utf8'
  });
}

function needsResign(filePath) {
  const verify = runCodesign(['-v', filePath]);
  if (verify.status !== 0) return true;

  const details = runCodesign(['-dv', '--verbose=2', filePath]);
  const combinedOutput = `${details.stdout || ''}\n${details.stderr || ''}`;

  // Linker-signed binaries can still trip AMFI validation in some setups.
  return combinedOutput.includes('(adhoc,linker-signed)');
}

function signBinary(filePath) {
  const sign = runCodesign(['--force', '--sign', '-', filePath]);
  if (sign.status !== 0) {
    const stderr = sign.stderr || sign.stdout || 'codesign failed';
    throw new Error(stderr.trim());
  }
}

function main() {
  if (process.platform !== 'darwin') {
    info('Skipping signature repair (non-macOS platform).');
    return;
  }

  const roots = [
    path.join(process.cwd(), 'node_modules'),
    path.resolve(process.cwd(), '../machinespirits-tutor-core/node_modules')
  ].filter(root => fs.existsSync(root));

  if (roots.length === 0) {
    info('No node_modules roots found for signature repair.');
    return;
  }

  const allBinaries = [];
  for (const root of roots) {
    allBinaries.push(...listNodeBinaries(root));
  }

  if (allBinaries.length === 0) {
    info('No native .node binaries found.');
    return;
  }

  let scanned = 0;
  let signed = 0;
  const failures = [];

  for (const binaryPath of allBinaries) {
    scanned += 1;
    try {
      if (needsResign(binaryPath)) {
        signBinary(binaryPath);
        signed += 1;
      }
    } catch (error) {
      failures.push({ binaryPath, error: error.message || String(error) });
    }
  }

  info(`Scanned ${scanned} native binaries. Re-signed ${signed}.`);

  if (failures.length > 0) {
    failures.forEach(({ binaryPath, error }) => {
      warn(`Failed signing ${binaryPath}: ${error}`);
    });
    process.exitCode = 1;
  }
}

main();

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const source = path.join(repoRoot, 'bin', 'nightowl');
const commandName = process.platform === 'win32' ? 'nightowl.cmd' : 'nightowl';
const uninstall = process.argv.includes('--uninstall');
const force = process.argv.includes('--force');

function expandHome(value) {
  if (!value) return value;
  if (value === '~') return process.env.HOME;
  if (value.startsWith('~/')) return path.join(process.env.HOME || '', value.slice(2));
  return value;
}

function candidateDirs() {
  return [
    process.env.NIGHTOWL_CLI_DIR,
    '/usr/local/bin',
    path.join(process.env.HOME || '', '.local', 'bin')
  ].filter(Boolean).map(expandHome);
}

function isWritableDirectory(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function resolveTargetDir() {
  for (const dir of candidateDirs()) {
    if (isWritableDirectory(dir)) return dir;
  }
  throw new Error('No writable CLI install directory found. Set NIGHTOWL_CLI_DIR to a writable directory.');
}

function pathIncludes(dir) {
  const entries = String(process.env.PATH || '').split(path.delimiter).map(entry => path.resolve(entry || '.'));
  return entries.includes(path.resolve(dir));
}

function removeExisting(target) {
  if (!fs.existsSync(target)) return false;
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    const linked = fs.realpathSync(target);
    if (linked === fs.realpathSync(source) || force) {
      fs.unlinkSync(target);
      return true;
    }
  }
  if (force) {
    fs.rmSync(target, { recursive: true, force: true });
    return true;
  }
  throw new Error(`${target} already exists. Re-run with --force to replace it.`);
}

function writeWindowsCommand(target) {
  const escapedSource = source.replace(/"/g, '""');
  const body = `@echo off\r\nnode "${escapedSource}" %*\r\n`;
  fs.writeFileSync(target, body, { mode: 0o755 });
}

function main() {
  if (!fs.existsSync(source)) {
    throw new Error(`NightOwl CLI source not found: ${source}`);
  }

  const targetDir = resolveTargetDir();
  const target = path.join(targetDir, commandName);

  if (uninstall) {
    const removed = removeExisting(target);
    console.log(removed ? `Removed ${target}` : `No NightOwl CLI found at ${target}`);
    return;
  }

  removeExisting(target);

  if (process.platform === 'win32') {
    writeWindowsCommand(target);
  } else {
    fs.symlinkSync(source, target);
  }

  console.log(`Installed NightOwl CLI: ${target}`);
  if (!pathIncludes(targetDir)) {
    console.log(`Add this directory to PATH before using it: ${targetDir}`);
  }
}

try {
  main();
} catch (error) {
  console.error(`nightowl cli install failed: ${error.message}`);
  process.exit(1);
}

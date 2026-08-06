#!/usr/bin/env node
'use strict';

const fs = require('fs');
const net = require('net');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const REQUIRED_NODE_MAJOR = 20;

function parseArgs(argv) {
  const options = { help: false, release: false };
  for (const argument of argv) {
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--release') options.release = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function printHelp() {
  console.log(`NightOwl local CI

Usage:
  node scripts/local-ci.js [--release]

Options:
  --release  Also run distribution-readiness checks.
  --help     Show this help.

The runner uses this worktree's node_modules when present. In a linked Git
worktree it can reuse the primary checkout's node_modules when package-lock.json
matches. NIGHTOWL_NODE_MODULES can supply an explicit dependency directory.`);
}

function hasJest(nodeModulesPath) {
  return fs.existsSync(path.join(nodeModulesPath, 'jest', 'bin', 'jest.js'));
}

function defaultGitCommonDir(repoRoot) {
  return execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: repoRoot,
    encoding: 'utf8'
  }).trim();
}

function findNodeModules({
  repoRoot = REPO_ROOT,
  env = process.env,
  getGitCommonDir = defaultGitCommonDir
} = {}) {
  const explicit = env.NIGHTOWL_NODE_MODULES;
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (!hasJest(resolved)) {
      throw new Error(`NIGHTOWL_NODE_MODULES does not contain Jest: ${resolved}`);
    }
    return { path: resolved, source: 'NIGHTOWL_NODE_MODULES' };
  }

  const local = path.join(repoRoot, 'node_modules');
  if (hasJest(local)) return { path: local, source: 'current checkout' };

  let commonDir;
  try {
    commonDir = getGitCommonDir(repoRoot);
  } catch (_error) {
    commonDir = null;
  }

  if (commonDir) {
    const absoluteCommonDir = path.resolve(repoRoot, commonDir);
    const checkoutRoot = path.dirname(absoluteCommonDir);
    const shared = path.join(checkoutRoot, 'node_modules');
    if (hasJest(shared)) return { path: shared, source: 'primary checkout' };
  }

  throw new Error(
    'Dependencies are unavailable. Run npm ci in this checkout, or set ' +
    'NIGHTOWL_NODE_MODULES to a matching node_modules directory.'
  );
}

function assertMatchingLockfile(repoRoot, dependency) {
  if (dependency.source === 'current checkout') return;
  const currentLock = path.join(repoRoot, 'package-lock.json');
  const dependencyLock = path.join(path.dirname(dependency.path), 'package-lock.json');
  if (!fs.existsSync(currentLock) || !fs.existsSync(dependencyLock)) {
    throw new Error(
      `Shared dependencies cannot be verified because a lockfile is missing: ${dependencyLock}. ` +
      'Run npm ci in this checkout or use a dependency checkout with the same package-lock.json.'
    );
  }
  if (!fs.readFileSync(currentLock).equals(fs.readFileSync(dependencyLock))) {
    throw new Error(
      `Shared dependencies are stale: ${dependencyLock} does not match this worktree's package-lock.json. ` +
      'Run npm ci in this checkout or refresh the primary checkout dependencies.'
    );
  }
}

function appendNodeOption(existing, option) {
  const value = String(existing || '').trim();
  if (value.split(/\s+/).includes(option)) return value;
  return [value, option].filter(Boolean).join(' ');
}

function probeLoopback() {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;
    const timeout = setTimeout(() => finish(false, 'probe timed out'), 2000);

    function finish(available, reason = '') {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (!available && server.listening) server.close();
      resolve({ available, reason });
    }

    server.once('error', (error) => finish(false, error.code || error.message));
    server.listen(0, '127.0.0.1', () => {
      server.close((error) => finish(!error, error ? (error.code || error.message) : ''));
    });
  });
}

async function resolveLoopbackCapability(env = process.env) {
  if (env.NIGHTOWL_TEST_LOOPBACK === '0') {
    return { available: false, reason: 'disabled by NIGHTOWL_TEST_LOOPBACK' };
  }
  if (env.NIGHTOWL_TEST_LOOPBACK === '1') {
    return { available: true, reason: 'required by NIGHTOWL_TEST_LOOPBACK' };
  }
  return probeLoopback();
}

function createStages({ dependency, release = false }) {
  const stages = [
    {
      name: 'Git whitespace',
      command: 'git',
      args: ['diff', '--check', 'HEAD']
    },
    {
      name: 'Static repository policy',
      command: process.execPath,
      args: ['scripts/quality-static-checks.js']
    },
    {
      name: 'Workplan integrity',
      command: process.execPath,
      args: ['scripts/workplan.js', 'check']
    },
    {
      name: 'Jest unit, integration, and behavioral suites',
      command: process.execPath,
      args: [path.join(dependency.path, 'jest', 'bin', 'jest.js'), '--runInBand']
    }
  ];

  if (release) {
    stages.push({
      name: 'Distribution readiness',
      command: process.execPath,
      args: ['scripts/check-distribution-readiness.js']
    });
  }
  return stages;
}

function runStage(stage, env, spawn = spawnSync) {
  const startedAt = Date.now();
  console.log(`\n--- ${stage.name}`);
  const result = spawn(stage.command, stage.args, {
    cwd: REPO_ROOT,
    env,
    stdio: 'inherit'
  });
  const durationMs = Date.now() - startedAt;
  const passed = result.status === 0;
  const detail = result.error
    ? result.error.message
    : result.signal
      ? `signal ${result.signal}`
      : `exit ${result.status}`;
  console.log(`${passed ? 'PASS' : 'FAIL'} ${stage.name} (${(durationMs / 1000).toFixed(1)}s${passed ? '' : `, ${detail}`})`);
  return { ...stage, passed, durationMs, detail };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return [];
  }

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(nodeMajor) || nodeMajor < REQUIRED_NODE_MAJOR) {
    throw new Error(`NightOwl local CI requires Node ${REQUIRED_NODE_MAJOR} or newer; found ${process.version}.`);
  }

  const dependency = findNodeModules();
  assertMatchingLockfile(REPO_ROOT, dependency);
  const loopback = await resolveLoopbackCapability();
  const env = {
    ...process.env,
    NODE_PATH: [dependency.path, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
    NODE_OPTIONS: appendNodeOption(process.env.NODE_OPTIONS, '--experimental-vm-modules'),
    NIGHTOWL_TEST_LOOPBACK: loopback.available ? '1' : '0'
  };

  console.log('NightOwl local CI');
  console.log(`Node: ${process.version}`);
  console.log(`Dependencies: ${dependency.path} (${dependency.source})`);
  console.log(
    `Loopback tests: ${loopback.available ? 'enabled' : `skipped (${loopback.reason || 'unavailable'})`}`
  );
  console.log(`Mode: ${options.release ? 'release' : 'default'}`);

  const results = createStages({ dependency, release: options.release })
    .map(stage => runStage(stage, env));
  const failed = results.filter(result => !result.passed);
  const totalMs = results.reduce((sum, result) => sum + result.durationMs, 0);

  console.log('\n=== Local CI summary');
  for (const result of results) {
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}`);
  }
  console.log(`${results.length - failed.length}/${results.length} stages passed in ${(totalMs / 1000).toFixed(1)}s.`);

  if (failed.length) process.exitCode = 1;
  return results;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`local-ci: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  REPO_ROOT,
  appendNodeOption,
  assertMatchingLockfile,
  createStages,
  findNodeModules,
  main,
  parseArgs,
  probeLoopback,
  resolveLoopbackCapability,
  runStage
};

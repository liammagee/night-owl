'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function candidatePaths(options = {}) {
  const paths = [];
  const add = value => {
    if (typeof value !== 'string' || !value.trim()) return;
    const resolved = path.resolve(value.trim());
    if (!paths.includes(resolved)) paths.push(resolved);
  };

  add(options.configuredPath);
  add(options.env?.NIGHTOWL_TUTOR_STUB_REPO || process.env.NIGHTOWL_TUTOR_STUB_REPO);

  for (const base of [options.workingDirectory, options.appPath, process.cwd()]) {
    if (!base) continue;
    add(base);
    add(path.join(path.dirname(path.resolve(base)), 'machinespirits-eval'));
  }
  add(path.join(os.homedir(), 'Dev', 'machinespirits', 'machinespirits-eval'));
  return paths;
}

function validateRepository(repositoryPath, options = {}) {
  const exists = options.existsSync || fs.existsSync;
  const read = options.readFileSync || fs.readFileSync;
  const packagePath = path.join(repositoryPath, 'package.json');
  const cliPath = path.join(repositoryPath, 'scripts', 'tutor-stub.js');
  if (!exists(packagePath) || !exists(cliPath)) {
    return { available: false, reason: 'missing-files' };
  }
  try {
    const manifest = JSON.parse(read(packagePath, 'utf8'));
    if (!manifest.scripts || typeof manifest.scripts['tutor:stub'] !== 'string') {
      return { available: false, reason: 'missing-script' };
    }
    return { available: true, reason: null, repositoryPath, command: 'npm', args: ['run', 'tutor:stub'] };
  } catch (error) {
    return { available: false, reason: 'invalid-package' };
  }
}

function findTutorStubRuntime(options = {}) {
  for (const repositoryPath of candidatePaths(options)) {
    const result = validateRepository(repositoryPath, options);
    if (result.available) return result;
  }
  return {
    available: false,
    reason: 'not-found',
    repositoryPath: null,
    command: null,
    args: []
  };
}

module.exports = { candidatePaths, findTutorStubRuntime, validateRepository };

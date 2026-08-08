const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  appendNodeOption,
  assertMatchingLockfile,
  createStages,
  findNodeModules,
  parseArgs,
  resolveLoopbackCapability
} = require('../../../scripts/local-ci');

function createDependencyTree(root) {
  const nodeModules = path.join(root, 'node_modules');
  fs.mkdirSync(path.join(nodeModules, 'jest', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(nodeModules, 'jest', 'bin', 'jest.js'), '');
  return nodeModules;
}

describe('local CI runner', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-local-ci-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('parses default and release modes and rejects unknown options', () => {
    expect(parseArgs([])).toEqual({ help: false, release: false });
    expect(parseArgs(['--release'])).toEqual({ help: false, release: true });
    expect(parseArgs(['-h'])).toEqual({ help: true, release: false });
    expect(() => parseArgs(['--fast'])).toThrow('Unknown option');
  });

  test('prefers local dependencies and supports an explicit override', () => {
    const repoRoot = path.join(tempDir, 'worktree');
    const explicitRoot = path.join(tempDir, 'explicit');
    fs.mkdirSync(repoRoot, { recursive: true });
    const local = createDependencyTree(repoRoot);
    const explicit = createDependencyTree(explicitRoot);

    expect(findNodeModules({ repoRoot, env: {}, getGitCommonDir: () => '' })).toEqual({
      path: local,
      source: 'current checkout'
    });
    expect(findNodeModules({
      repoRoot,
      env: { NIGHTOWL_NODE_MODULES: explicit },
      getGitCommonDir: () => ''
    })).toEqual({ path: explicit, source: 'NIGHTOWL_NODE_MODULES' });
  });

  test('finds matching dependencies in the primary checkout of a worktree', () => {
    const repoRoot = path.join(tempDir, 'linked-worktree');
    const primaryRoot = path.join(tempDir, 'primary');
    const commonDir = path.join(primaryRoot, '.git');
    fs.mkdirSync(repoRoot, { recursive: true });
    fs.mkdirSync(commonDir, { recursive: true });
    const shared = createDependencyTree(primaryRoot);

    expect(findNodeModules({
      repoRoot,
      env: {},
      getGitCommonDir: () => commonDir
    })).toEqual({ path: shared, source: 'primary checkout' });
  });

  test('rejects shared dependencies produced from a different lockfile', () => {
    const repoRoot = path.join(tempDir, 'linked-worktree');
    const primaryRoot = path.join(tempDir, 'primary');
    fs.mkdirSync(repoRoot, { recursive: true });
    const dependency = { path: createDependencyTree(primaryRoot), source: 'primary checkout' };
    fs.writeFileSync(path.join(repoRoot, 'package-lock.json'), 'current');
    fs.writeFileSync(path.join(primaryRoot, 'package-lock.json'), 'stale');

    expect(() => assertMatchingLockfile(repoRoot, dependency)).toThrow('Shared dependencies are stale');
  });

  test('rejects a shared dependency tree without a verifiable lockfile', () => {
    const repoRoot = path.join(tempDir, 'linked-worktree');
    const primaryRoot = path.join(tempDir, 'primary');
    fs.mkdirSync(repoRoot, { recursive: true });
    const dependency = { path: createDependencyTree(primaryRoot), source: 'primary checkout' };
    fs.writeFileSync(path.join(repoRoot, 'package-lock.json'), 'current');

    expect(() => assertMatchingLockfile(repoRoot, dependency)).toThrow('lockfile is missing');
  });

  test('builds an explicit release stage and preserves Node options', () => {
    const dependency = { path: '/tmp/nightowl-node-modules', source: 'test' };
    const defaultStages = createStages({ dependency });
    expect(defaultStages).toHaveLength(5);
    expect(defaultStages.at(-1)).toMatchObject({
      name: 'Required Electron E2E smoke',
      command: process.execPath,
      args: ['scripts/run-electron-e2e.js']
    });
    expect(createStages({ dependency, release: true }).at(-1).name).toBe('Distribution readiness');
    expect(appendNodeOption('--trace-warnings', '--experimental-vm-modules')).toBe(
      '--trace-warnings --experimental-vm-modules'
    );
    expect(appendNodeOption('--experimental-vm-modules', '--experimental-vm-modules')).toBe(
      '--experimental-vm-modules'
    );
  });

  test('honors explicit loopback capability overrides', async () => {
    await expect(resolveLoopbackCapability({ NIGHTOWL_TEST_LOOPBACK: '0' })).resolves.toEqual({
      available: false,
      reason: 'disabled by NIGHTOWL_TEST_LOOPBACK'
    });
    await expect(resolveLoopbackCapability({ NIGHTOWL_TEST_LOOPBACK: '1' })).resolves.toEqual({
      available: true,
      reason: 'required by NIGHTOWL_TEST_LOOPBACK'
    });
  });
});

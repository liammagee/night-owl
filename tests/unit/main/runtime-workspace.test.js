const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createRuntimeWorkspaceResolver,
  pathExists,
  resolveRuntimeWorkingDirectory
} = require('../../../ipc/runtimeWorkspace');

describe('runtime workspace resolver', () => {
  let tempRoot;
  let savedDir;
  let runtimeDir;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-runtime-workspace-'));
    savedDir = path.join(tempRoot, 'saved');
    runtimeDir = path.join(tempRoot, 'runtime');
    fs.mkdirSync(savedDir);
    fs.mkdirSync(runtimeDir);
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('prefers the saved working directory when it exists', () => {
    const result = resolveRuntimeWorkingDirectory({
      appSettings: { workingDirectory: savedDir },
      getCurrentWorkingDirectory: () => runtimeDir
    });

    expect(result).toBe(savedDir);
  });

  test('falls back to the live runtime directory when the saved directory is stale', () => {
    const staleSavedDir = path.join(tempRoot, 'missing');

    const result = resolveRuntimeWorkingDirectory({
      appSettings: { workingDirectory: staleSavedDir },
      getCurrentWorkingDirectory: () => runtimeDir
    });

    expect(result).toBe(runtimeDir);
  });

  test('resolver reads live runtime changes instead of capturing stale values', () => {
    let liveDirectory = runtimeDir;
    const nextRuntimeDir = path.join(tempRoot, 'runtime-next');
    fs.mkdirSync(nextRuntimeDir);

    const resolve = createRuntimeWorkspaceResolver({
      appSettings: { workingDirectory: path.join(tempRoot, 'missing') },
      getCurrentWorkingDirectory: () => liveDirectory
    });

    expect(resolve()).toBe(runtimeDir);
    liveDirectory = nextRuntimeDir;
    expect(resolve()).toBe(nextRuntimeDir);
  });

  test('pathExists tolerates invalid paths', () => {
    expect(pathExists(null)).toBe(false);
    expect(pathExists(path.join(tempRoot, 'missing'))).toBe(false);
    expect(pathExists(savedDir)).toBe(true);
  });
});

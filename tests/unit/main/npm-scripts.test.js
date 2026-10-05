const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../..');

function readPackageJson() {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

function parseCommand(script) {
  return script.trim().split(/\s+/);
}

describe('npm scripts sanity checks', () => {
  test('dev script should resolve to a valid local entry', () => {
    const packageJson = readPackageJson();
    const devScript = packageJson?.scripts?.dev;

    expect(typeof devScript).toBe('string');
    expect(devScript.length).toBeGreaterThan(0);

    const [command, firstArg] = parseCommand(devScript);

    if (command === 'tsx' && firstArg) {
      const entryPath = path.resolve(repoRoot, firstArg);
      expect(fs.existsSync(entryPath)).toBe(true);
      return;
    }

    if (command === 'npm' && firstArg === 'run') {
      const [, , nestedScript] = parseCommand(devScript);
      expect(typeof nestedScript).toBe('string');
      expect(packageJson?.scripts?.[nestedScript]).toBeDefined();
      return;
    }

    throw new Error(`Unsupported dev script format: "${devScript}"`);
  });

  test('local CI scripts point to tracked repository entry points', () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts['ci:local']).toBe('node scripts/local-ci.js');
    expect(packageJson.scripts['ci:local:release']).toBe('node scripts/local-ci.js --release');
    expect(packageJson.scripts['ci:hook:install']).toBe('node scripts/install-local-ci-hook.js');
    expect(packageJson.scripts['ci:hook:uninstall']).toBe('node scripts/install-local-ci-hook.js --uninstall');
    expect(fs.existsSync(path.join(repoRoot, 'scripts/local-ci.js'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, '.githooks/pre-push'))).toBe(true);
  });

  test('presentation source has one root build and stale-output check', () => {
    const packageJson = readPackageJson();
    const presentationPackage = require('../../../plugins/techne-presentations/package.json');

    expect(packageJson.scripts['presentation:build']).toBe('node scripts/build-presentations.js');
    expect(packageJson.scripts['presentation:check']).toBe('node scripts/build-presentations.js --check');
    expect(packageJson.scripts['dist:check']).toContain('npm run presentation:check');
    expect(presentationPackage.scripts.build).toBe('node ../../scripts/build-presentations.js');
    expect(presentationPackage.scripts.check).toBe('node ../../scripts/build-presentations.js --check');
    expect(fs.existsSync(path.join(repoRoot, 'scripts/build-presentations.js'))).toBe(true);
  });
});

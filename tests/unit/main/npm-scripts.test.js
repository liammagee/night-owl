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
});

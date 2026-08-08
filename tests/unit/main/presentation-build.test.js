const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  CONFIG_PATH,
  OUTPUT_PATH,
  PLUGIN_ROOT,
  SOURCE_PATH,
  buildPresentation,
  compilePresentation,
  parseArgs
} = require('../../../scripts/build-presentations');

describe('presentation asset build', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-presentation-build-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('the checked-in browser runtime is generated from the canonical JSX source', () => {
    expect(compilePresentation()).toBe(fs.readFileSync(OUTPUT_PATH, 'utf8'));
  });

  test('build writes deterministic output and check rejects stale output', () => {
    const outputPath = path.join(tempDir, 'MarkdownPreziApp.js');
    const options = {
      sourcePath: SOURCE_PATH,
      outputPath,
      configPath: CONFIG_PATH,
      pluginRoot: PLUGIN_ROOT
    };

    expect(buildPresentation(options)).toMatchObject({ changed: true, outputPath });
    const generated = fs.readFileSync(outputPath, 'utf8');
    expect(buildPresentation({ ...options, check: true })).toMatchObject({ changed: false, outputPath });

    fs.writeFileSync(outputPath, `${generated}\n// stale`);
    expect(() => buildPresentation({ ...options, check: true })).toThrow(
      'Run npm run presentation:build'
    );
  });

  test('only the explicit check flag is accepted', () => {
    expect(parseArgs([])).toEqual({ check: false });
    expect(parseArgs(['--check'])).toEqual({ check: true });
    expect(() => parseArgs(['--watch'])).toThrow('Unknown option');
  });
});

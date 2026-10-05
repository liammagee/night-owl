#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const REPO_ROOT = path.resolve(__dirname, '..');
const PLUGIN_ROOT = path.join(REPO_ROOT, 'plugins/techne-presentations');
const SOURCE_PATH = path.join(PLUGIN_ROOT, 'src/MarkdownPreziApp.jsx');
const OUTPUT_PATH = path.join(PLUGIN_ROOT, 'MarkdownPreziApp.js');
const CONFIG_PATH = path.join(PLUGIN_ROOT, '.babelrc');

function parseArgs(argv) {
  const options = { check: false };
  for (const argument of argv) {
    if (argument === '--check') options.check = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function compilePresentation({
  sourcePath = SOURCE_PATH,
  configPath = CONFIG_PATH,
  pluginRoot = PLUGIN_ROOT
} = {}) {
  const result = babel.transformFileSync(sourcePath, {
    cwd: pluginRoot,
    configFile: configPath,
    sourceMaps: false
  });
  if (!result?.code) throw new Error(`Babel produced no output for ${sourcePath}`);
  return result.code;
}

function buildPresentation({
  check = false,
  sourcePath = SOURCE_PATH,
  outputPath = OUTPUT_PATH,
  configPath = CONFIG_PATH,
  pluginRoot = PLUGIN_ROOT
} = {}) {
  const generated = compilePresentation({ sourcePath, configPath, pluginRoot });
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : null;

  if (current === generated) {
    console.log(`[presentation-build] current: ${path.relative(REPO_ROOT, outputPath)}`);
    return { changed: false, outputPath };
  }

  if (check) {
    throw new Error(
      `${path.relative(REPO_ROOT, outputPath)} is stale. ` +
      'Run npm run presentation:build and commit the generated output.'
    );
  }

  fs.writeFileSync(outputPath, generated);
  console.log(`[presentation-build] updated: ${path.relative(REPO_ROOT, outputPath)}`);
  return { changed: true, outputPath };
}

function main(argv = process.argv.slice(2)) {
  return buildPresentation(parseArgs(argv));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[presentation-build] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  CONFIG_PATH,
  OUTPUT_PATH,
  PLUGIN_ROOT,
  SOURCE_PATH,
  buildPresentation,
  compilePresentation,
  main,
  parseArgs
};

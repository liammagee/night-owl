'use strict';

const Module = require('module');
const path = require('path');

const appPath = process.env.NIGHTOWL_E2E_APP_PATH;
const nodeModulesPath = process.env.NIGHTOWL_NODE_MODULES;

if (!appPath || !nodeModulesPath) {
  throw new Error('Electron E2E bootstrap requires app and dependency paths');
}

process.env.NODE_PATH = [nodeModulesPath, process.env.NODE_PATH]
  .filter(Boolean)
  .join(path.delimiter);
Module._initPaths();

require(path.join(appPath, 'main.js'));

'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ipcMain, shell } = require('electron');
const { resolvePathWithinRoots } = require('./pathGuards');
const { createRuntimeWorkspaceResolver } = require('./runtimeWorkspace');
const { renderPptxPreview } = require('../services/pptxPreview');

function workspaceRoots(dependencies, workingDirectory) {
  return [
    workingDirectory,
    ...(Array.isArray(dependencies.appSettings?.workspaceFolders)
      ? dependencies.appSettings.workspaceFolders
      : [])
  ].filter(Boolean);
}

function openWithPowerPoint(filePath, options = {}) {
  const run = options.execFile || execFile;
  return new Promise(resolve => {
    run('/usr/bin/open', ['-a', 'Microsoft PowerPoint', filePath], {
      timeout: 15 * 1000,
      windowsHide: true
    }, error => resolve(error));
  });
}

function register(dependencies = {}) {
  const getWorkingDirectory = createRuntimeWorkspaceResolver(dependencies);
  const renderPreview = dependencies.renderPptxPreview || renderPptxPreview;
  const platform = dependencies.platform || process.platform;
  const exists = dependencies.existsSync || fs.existsSync;
  const shellApi = dependencies.shell || shell;

  function resolveDeck(filePath) {
    const workingDirectory = getWorkingDirectory();
    return resolvePathWithinRoots(filePath, workspaceRoots(dependencies, workingDirectory), {
      baseDirectory: workingDirectory,
      label: 'PowerPoint file'
    });
  }

  ipcMain.handle('render-pptx-preview', async (_event, request = {}) => {
    const resolved = resolveDeck(request.filePath);
    if (!resolved.success) return resolved;
    try {
      return await renderPreview(resolved.path, {
        userDataPath: dependencies.userDataPath,
        platform
      });
    } catch (error) {
      return { success: false, code: 'PPTX_PREVIEW_FAILED', error: error.message };
    }
  });

  ipcMain.handle('open-pptx-in-powerpoint', async (_event, request = {}) => {
    const resolved = resolveDeck(request.filePath);
    if (!resolved.success) return resolved;
    if (path.extname(resolved.path).toLowerCase() !== '.pptx') {
      return { success: false, error: 'Only .pptx files can be opened with this action.' };
    }
    if (!exists(resolved.path)) {
      return { success: false, error: 'The PowerPoint file could not be found.' };
    }

    if (platform === 'darwin') {
      const error = await openWithPowerPoint(resolved.path, dependencies);
      if (!error) return { success: true, application: 'Microsoft PowerPoint' };
    }

    const fallbackError = await shellApi.openPath(resolved.path);
    return fallbackError
      ? { success: false, error: fallbackError }
      : { success: true, application: 'system-default' };
  });
}

module.exports = {
  openWithPowerPoint,
  register,
  workspaceRoots
};

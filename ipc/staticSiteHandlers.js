'use strict';

const electron = require('electron');
const { createDebugLogger } = require('./logging');
const { createRuntimeWorkspaceResolver } = require('./runtimeWorkspace');
const { createStaticPublishingService } = require('../services/staticPublishing');

function failure(error) {
  return { success: false, ready: false, error: error?.message || String(error) };
}

function register(dependencies = {}) {
  const ipcMain = dependencies.ipcMain || electron.ipcMain;
  const dialog = dependencies.dialog || electron.dialog;
  const getWorkingDirectory = createRuntimeWorkspaceResolver(dependencies);
  const service = dependencies.staticPublishingService || createStaticPublishingService();
  const debug = createDebugLogger('StaticSiteHandlers');

  ipcMain.handle('static-site-preview', async (_event, request) => {
    try {
      const workspaceRoot = getWorkingDirectory();
      debug(`Preflighting static publication for ${workspaceRoot}`);
      const result = await service.preflight(workspaceRoot, request || {});
      return {
        success: result.success,
        ready: result.ready,
        rendererContract: result.rendererContract,
        report: result.report,
        manifest: result.manifest,
        documents: result.documents.map(document => ({
          source: document.source,
          output: document.output,
          title: document.title,
          previewHtml: document.previewHtml
        }))
      };
    } catch (error) {
      console.error('[StaticSiteHandlers] Preflight failed:', error);
      return failure(error);
    }
  });

  ipcMain.handle('static-site-generate', async (_event, request) => {
    try {
      const workspaceRoot = getWorkingDirectory();
      const preview = await service.preflight(workspaceRoot, request || {});
      if (!preview.ready) {
        return {
          success: false,
          ready: false,
          error: 'Publication preflight failed.',
          report: preview.report,
          manifest: preview.manifest
        };
      }
      const selection = await dialog.showSaveDialog({
        title: 'Export validated static site',
        defaultPath: 'nightowl-site',
        buttonLabel: 'Publish to folder'
      });
      if (selection.canceled || !selection.filePath) return { success: false, cancelled: true };
      return await service.publish(workspaceRoot, request || {}, selection.filePath);
    } catch (error) {
      console.error('[StaticSiteHandlers] Publication failed:', error);
      return failure(error);
    }
  });

  debug('Registered validated static publishing handlers');
}

module.exports = { failure, register };

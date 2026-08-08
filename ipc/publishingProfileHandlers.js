'use strict';

const { ipcMain } = require('electron');
const { createDebugLogger } = require('./logging');
const { createRuntimeWorkspaceResolver } = require('./runtimeWorkspace');
const { createPublishingProfileService } = require('../services/publishingProfiles');

function toFailure(error) {
  return {
    success: false,
    code: error?.code || 'publishing-profile-error',
    error: error?.message || String(error)
  };
}

function register(dependencies = {}) {
  const debug = createDebugLogger('PublishingProfileHandlers');
  const getWorkingDirectory = createRuntimeWorkspaceResolver(dependencies);
  const service = dependencies.publishingProfileService || createPublishingProfileService();

  ipcMain.handle('publishing-profile-inspect', async () => {
    try {
      const workspaceRoot = getWorkingDirectory();
      debug(`Inspecting publishing profiles for ${workspaceRoot}`);
      return await service.inspectWorkspace(workspaceRoot);
    } catch (error) {
      console.error('[PublishingProfileHandlers] Inspection failed:', error);
      return toFailure(error);
    }
  });

  ipcMain.handle('publishing-profile-run-stage', async (_event, request) => {
    try {
      const workspaceRoot = getWorkingDirectory();
      debug(`Running publishing profile stage ${request?.profileId || '?'}:${request?.stageId || '?'}`);
      return await service.runStage(workspaceRoot, request || {});
    } catch (error) {
      console.error('[PublishingProfileHandlers] Stage failed:', error);
      return toFailure(error);
    }
  });

  debug('Registered publishing profile handlers');
}

module.exports = {
  register,
  toFailure
};

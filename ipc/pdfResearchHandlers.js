'use strict';

const { ipcMain } = require('electron');
const { createDebugLogger } = require('./logging');
const { createRuntimeWorkspaceResolver } = require('./runtimeWorkspace');
const { createPdfResearchService } = require('../services/pdfResearch');

function toFailure(error, code = 'pdf-research-error') {
  return {
    success: false,
    code: error?.code || code,
    error: error?.message || String(error)
  };
}

function register(dependencies = {}) {
  const debug = createDebugLogger('PdfResearchHandlers');
  const getWorkingDirectory = createRuntimeWorkspaceResolver(dependencies);
  const service = dependencies.pdfResearchService || createPdfResearchService({
    userDataPath: dependencies.userDataPath
  });

  ipcMain.handle('pdf-research-load-annotations', async (_event, request = {}) => {
    try {
      return await service.loadAnnotations(request.filePath);
    } catch (error) {
      console.error('[PdfResearchHandlers] Failed to load annotations:', error);
      return toFailure(error, 'pdf-annotation-load-error');
    }
  });

  ipcMain.handle('pdf-research-save-annotations', async (_event, request = {}) => {
    try {
      return await service.saveAnnotations(request);
    } catch (error) {
      console.error('[PdfResearchHandlers] Failed to save annotations:', error);
      return toFailure(error, 'pdf-annotation-save-error');
    }
  });

  ipcMain.handle('pdf-research-create-note', async (_event, request = {}) => {
    try {
      return await service.createResearchNote(getWorkingDirectory(), request);
    } catch (error) {
      console.error('[PdfResearchHandlers] Failed to create research note:', error);
      return toFailure(error, 'pdf-research-note-error');
    }
  });

  debug('Registered PDF research handlers');
}

module.exports = {
  register,
  toFailure
};

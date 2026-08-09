'use strict';

const { ipcMain } = require('electron');
const { collectCapabilityHealth } = require('../services/capabilityHealth');
const { createDebugLogger } = require('./logging');

const debug = createDebugLogger('CapabilityHealthHandlers');

function register(dependencies = {}) {
  ipcMain.handle('capability-health-check', async () => {
    try {
      return await collectCapabilityHealth({
        tutorBridge: dependencies.tutorBridge,
        env: process.env
      });
    } catch (error) {
      return {
        success: false,
        error: error.message,
        capabilities: []
      };
    }
  });
  debug('Registered capability health handler');
}

module.exports = { register };

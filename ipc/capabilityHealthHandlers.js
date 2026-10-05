'use strict';

const { ipcMain } = require('electron');
const { collectCapabilityHealth } = require('../services/capabilityHealth');
const { findDoclingRuntime, installDoclingRuntime } = require('../services/doclingRuntime');
const { getCredentialStore } = require('../services/credentialStore');
const { createDebugLogger } = require('./logging');

const debug = createDebugLogger('CapabilityHealthHandlers');

function register(dependencies = {}) {
  const credentialStore = dependencies.credentialStore || getCredentialStore();
  const credentialReady = dependencies.userDataPath
    ? credentialStore.initialize(dependencies.userDataPath)
    : Promise.resolve();
  const probeDocling = dependencies.findDoclingRuntime || findDoclingRuntime;
  const installDocling = dependencies.installDoclingRuntime || installDoclingRuntime;
  let installInFlight = null;

  async function isLemonfoxConfigured() {
    if (process.env.LEMONFOX_API_KEY) return true;
    if (!dependencies.userDataPath) return false;
    await credentialReady;
    return Boolean(await credentialStore.get('lemonfox', 'api-key'));
  }

  ipcMain.handle('capability-health-check', async () => {
    try {
      return await collectCapabilityHealth({
        tutorBridge: dependencies.tutorBridge,
        env: process.env,
        ttsConfigured: await isLemonfoxConfigured(),
        tutorStub: {
          configuredPath: dependencies.appSettings?.ai?.tutorStub?.repositoryPath,
          workingDirectory: dependencies.getCurrentWorkingDirectory?.() || dependencies.appSettings?.workingDirectory,
          appPath: dependencies.app?.getAppPath?.(),
          env: process.env
        },
        doclingProbe: () => probeDocling({
          userDataPath: dependencies.userDataPath,
          resourcesPath: process.resourcesPath,
          env: process.env
        })
      });
    } catch (error) {
      return {
        success: false,
        error: error.message,
        capabilities: []
      };
    }
  });
  ipcMain.handle('capability-health-install', async (_event, request = {}) => {
    if (request.toolId !== 'docling') return { success: false, error: 'Unsupported capability installer.' };
    if (!dependencies.userDataPath) return { success: false, error: 'The NightOwl user data directory is unavailable.' };
    if (installInFlight) return installInFlight;
    installInFlight = installDocling({
      userDataPath: dependencies.userDataPath,
      env: process.env
    }).catch(error => ({ success: false, error: error.message })).finally(() => { installInFlight = null; });
    return installInFlight;
  });
  debug('Registered capability health handler');
}

module.exports = { register };

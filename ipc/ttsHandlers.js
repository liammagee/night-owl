'use strict';

const { ipcMain } = require('electron');
const { createDebugLogger } = require('./logging');
const { getCredentialStore } = require('../services/credentialStore');
const { ENGLISH_VOICES, synthesizeSpeech } = require('../services/lemonfoxTts');

const debug = createDebugLogger('TTS');
const CREDENTIAL_SOURCE = 'lemonfox';
const CREDENTIAL_NAME = 'api-key';

function register(deps = {}) {
  const { appSettings, defaultSettings } = deps;
  const credentialStore = deps.credentialStore || getCredentialStore();
  const credentialReady = deps.userDataPath
    ? credentialStore.initialize(deps.userDataPath)
    : Promise.resolve();
  const fetchImpl = deps.fetchImpl || globalThis.fetch;

  function getTTSSettings() {
    return {
      ...(defaultSettings?.tts || {}),
      ...(appSettings?.tts || {}),
      lemonfox: {
        ...(defaultSettings?.tts?.lemonfox || {}),
        ...(appSettings?.tts?.lemonfox || {})
      }
    };
  }

  async function getApiKey() {
    if (process.env.LEMONFOX_API_KEY) return { value: process.env.LEMONFOX_API_KEY, source: 'environment' };
    if (!deps.userDataPath) return { value: null, source: null };
    await credentialReady;
    return { value: await credentialStore.get(CREDENTIAL_SOURCE, CREDENTIAL_NAME), source: 'secure-storage' };
  }

  async function credentialStatus() {
    const credential = await getApiKey();
    const backend = typeof credentialStore.backendInfo === 'function'
      ? credentialStore.backendInfo()
      : { available: false, protected: false, backend: 'none' };
    return {
      success: true,
      configured: Boolean(credential.value),
      source: credential.source,
      canStoreSecurely: Boolean(backend.available && backend.protected !== false),
      backend: backend.backend || 'unknown'
    };
  }

  async function generate(request) {
    const credential = await getApiKey();
    const settings = getTTSSettings().lemonfox || {};
    return synthesizeSpeech(request, credential.value, { defaults: settings, fetchImpl });
  }

  ipcMain.handle('tts-generate-speech', async (_event, request = {}) => {
    try {
      return await generate(request);
    } catch (error) {
      console.error('[TTS] Speech generation failed:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('tts-get-voices', async () => ({
    success: true,
    voices: ENGLISH_VOICES.map(id => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      lang: ['alice', 'emma', 'isabella', 'lily', 'daniel', 'fable', 'george', 'lewis'].includes(id) ? 'en-GB' : 'en-US'
    }))
  }));

  ipcMain.handle('tts-get-settings', async () => ({ success: true, settings: getTTSSettings() }));

  ipcMain.handle('tts-check-availability', async () => {
    const status = await credentialStatus();
    return { success: true, available: status.configured, provider: 'lemonfox', source: status.source };
  });

  ipcMain.handle('tts-credential-status', async () => credentialStatus());

  ipcMain.handle('tts-set-api-key', async (_event, request = {}) => {
    try {
      const apiKey = String(request.apiKey || '').trim();
      if (!apiKey || apiKey.length > 4096) throw new Error('Enter a valid Lemonfox API key.');
      if (!deps.userDataPath) throw new Error('The NightOwl user data directory is unavailable.');
      await credentialReady;
      await credentialStore.set(CREDENTIAL_SOURCE, CREDENTIAL_NAME, apiKey);
      return await credentialStatus();
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('tts-delete-api-key', async () => {
    try {
      if (process.env.LEMONFOX_API_KEY) {
        return { success: false, error: 'The active key comes from LEMONFOX_API_KEY and must be removed from the launch environment.' };
      }
      if (deps.userDataPath) {
        await credentialReady;
        await credentialStore.delete(CREDENTIAL_SOURCE, CREDENTIAL_NAME);
      }
      return await credentialStatus();
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('tts-test-connection', async (_event, request = {}) => {
    try {
      const result = await generate({
        text: 'NightOwl speech is ready.',
        voice: request.voice,
        language: request.language,
        speed: request.speed,
        response_format: 'mp3',
        word_timestamps: false,
        region: request.region
      });
      return { ...result, message: 'Lemonfox generated the test phrase.' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('tts-test', async () => ({ success: true, message: 'TTS handlers are working' }));
  debug('Registered Lemonfox TTS and credential handlers');
}

module.exports = { register };

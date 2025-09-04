// === TTS (Text-to-Speech) IPC Handlers ===
// Handles TTS operations using Lemonfox.ai API

console.log('[TTS] Loading ttsHandlers.js module');

const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { finished } = require('stream/promises');

// Use node-fetch for Node.js environment
let fetch;
try {
  // Try to use native fetch if available (Node 18+)
  fetch = globalThis.fetch;
  if (!fetch) {
    console.log('[TTS] Native fetch not available, trying node-fetch');
    fetch = require('node-fetch');
  }
  console.log('[TTS] Fetch loaded successfully');
} catch (e) {
  console.error('[TTS] Error loading fetch:', e.message);
  // Fall back to node-fetch
  try {
    fetch = require('node-fetch');
    console.log('[TTS] Successfully loaded node-fetch as fallback');
  } catch (e2) {
    console.error('[TTS] Could not load node-fetch either:', e2.message);
  }
}

/**
 * Register all TTS IPC handlers
 * @param {Object} deps - Dependencies from main.js
 */
function register(deps) {
  console.log('[TTS] TTS handlers register function called');
  const { mainWindow, appSettings, defaultSettings } = deps;
  
  // Get API key from environment
  const LEMONFOX_API_KEY = process.env.LEMONFOX_API_KEY;
  
  // Helper function to get TTS settings
  function getTTSSettings() {
    try {
      const defaults = defaultSettings?.tts || {};
      const current = appSettings?.tts || {};
      const merged = {
        ...defaults,
        ...current
      };
      console.log('[TTS] getTTSSettings - defaults:', defaults);
      console.log('[TTS] getTTSSettings - current:', current);
      console.log('[TTS] getTTSSettings - merged:', merged);
      return merged;
    } catch (error) {
      console.error('[TTS] Error in getTTSSettings:', error);
      // Return minimal defaults if there's an error
      return {
        enabled: false,
        provider: 'auto',
        lemonfox: { voice: 'sarah', language: 'en-us', speed: 1.0, response_format: 'mp3', word_timestamps: false },
        webSpeech: { rate: 1.0, pitch: 1.0, volume: 1.0, voice: null },
        autoSpeak: true,
        stopOnSlideChange: true,
        cleanMarkdown: true,
        speakSpeakerNotes: true
      };
    }
  }
  
  if (!LEMONFOX_API_KEY) {
    console.warn('[TTS] LEMONFOX_API_KEY not found in environment variables');
  } else {
    console.log('[TTS] LEMONFOX_API_KEY found, length:', LEMONFOX_API_KEY.length);
  }

  // Generate speech from text using Lemonfox.ai
  ipcMain.handle('tts-generate-speech', async (event, { text, voice, language, speed, response_format, word_timestamps }) => {
    console.log('[TTS-IPC] === tts-generate-speech handler called ===');
    console.log('[TTS-IPC] Text length:', text?.length || 0);
    console.log('[TTS-IPC] Text preview:', text?.substring(0, 50) + '...');
    
    try {
      if (!LEMONFOX_API_KEY) {
        console.error('[TTS-IPC] LEMONFOX_API_KEY not configured!');
        throw new Error('LEMONFOX_API_KEY not configured');
      }

      if (!text || text.trim().length === 0) {
        console.error('[TTS-IPC] No text provided for TTS');
        throw new Error('No text provided for TTS');
      }

      const ttsSettings = getTTSSettings();
      const lemonfoxSettings = ttsSettings.lemonfox;

      // Use provided settings or fall back to configured defaults
      const requestParams = {
        input: text,
        voice: voice || lemonfoxSettings.voice,
        language: language || lemonfoxSettings.language,
        speed: speed || lemonfoxSettings.speed,
        response_format: response_format || lemonfoxSettings.response_format,
        word_timestamps: word_timestamps !== undefined ? word_timestamps : lemonfoxSettings.word_timestamps
      };

      console.log(`[TTS-IPC] Request parameters:`, JSON.stringify(requestParams, null, 2));
      console.log('[TTS-IPC] Making request to Lemonfox API...');

      // Make request to Lemonfox.ai API
      const response = await fetch("https://api.lemonfox.ai/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LEMONFOX_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestParams)
      });

      console.log('[TTS-IPC] Response status:', response.status);
      console.log('[TTS-IPC] Response headers:', Object.fromEntries(response.headers));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TTS-IPC] Lemonfox API error:', errorText);
        throw new Error(`Lemonfox API error: ${response.status} - ${errorText}`);
      }

      console.log('[TTS-IPC] Response OK, processing audio data...');

      // Create temp file for audio
      const tempDir = path.join(require('os').tmpdir(), 'nightowl-tts');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const audioFileName = `speech_${Date.now()}.mp3`;
      const audioFilePath = path.join(tempDir, audioFileName);
      
      // Save audio to file
      const arrayBuffer = await response.arrayBuffer();
      console.log('[TTS-IPC] Audio array buffer size:', arrayBuffer.byteLength, 'bytes');
      
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(audioFilePath, buffer);
      
      console.log(`[TTS-IPC] Audio saved to: ${audioFilePath}`);

      // Read file as base64 for sending to renderer
      const audioBuffer = fs.readFileSync(audioFilePath);
      const audioBase64 = audioBuffer.toString('base64');
      console.log('[TTS-IPC] Base64 audio length:', audioBase64.length);
      
      // Clean up temp file after a delay
      setTimeout(() => {
        try {
          fs.unlinkSync(audioFilePath);
          console.log(`[TTS-IPC] Cleaned up temp file: ${audioFilePath}`);
        } catch (err) {
          console.warn(`[TTS-IPC] Could not clean up temp file: ${err.message}`);
        }
      }, 60000); // Clean up after 1 minute

      console.log('[TTS-IPC] Returning success with audio data');
      return {
        success: true,
        audioData: audioBase64,
        format: 'mp3'
      };

    } catch (error) {
      console.error('[TTS-IPC] Error generating speech:', error);
      console.error('[TTS-IPC] Error stack:', error.stack);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Get available voices
  ipcMain.handle('tts-get-voices', async (event) => {
    // Lemonfox.ai voices - could be expanded based on their API documentation
    return {
      success: true,
      voices: [
        { id: 'sarah', name: 'Sarah', lang: 'en-US', gender: 'female' },
        { id: 'john', name: 'John', lang: 'en-US', gender: 'male' },
        { id: 'emily', name: 'Emily', lang: 'en-US', gender: 'female' },
        { id: 'michael', name: 'Michael', lang: 'en-US', gender: 'male' },
        { id: 'alice', name: 'Alice', lang: 'en-US', gender: 'female' }
      ]
    };
  });

  // Get TTS settings
  try {
    ipcMain.handle('tts-get-settings', async (event) => {
      try {
        const settings = getTTSSettings();
        console.log('[TTS] Returning settings:', settings);
        return {
          success: true,
          settings: settings
        };
      } catch (error) {
        console.error('[TTS] Error getting TTS settings:', error);
        return {
          success: false,
          error: error.message
        };
      }
    });
    console.log('[TTS] tts-get-settings handler registered successfully');
  } catch (error) {
    console.error('[TTS] Failed to register tts-get-settings handler:', error);
  }

  // Check if TTS is available
  ipcMain.handle('tts-check-availability', async (event) => {
    return {
      success: true,
      available: !!LEMONFOX_API_KEY,
      provider: 'lemonfox'
    };
  });

  // Add a simple test handler to verify registration works
  ipcMain.handle('tts-test', async (event) => {
    return { success: true, message: 'TTS handlers are working' };
  });

  console.log('[TTS] All TTS handlers registered successfully:');
  console.log('  - tts-generate-speech');
  console.log('  - tts-get-voices'); 
  console.log('  - tts-get-settings');
  console.log('  - tts-check-availability');
  console.log('  - tts-test');
}

module.exports = {
  register
};
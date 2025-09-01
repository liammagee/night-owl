// === TTS (Text-to-Speech) IPC Handlers ===
// Handles TTS operations using Lemonfox.ai API

const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { finished } = require('stream/promises');

/**
 * Register all TTS IPC handlers
 * @param {Object} deps - Dependencies from main.js
 */
function register(deps) {
  const { mainWindow } = deps;
  
  // Get API key from environment
  const LEMONFOX_API_KEY = process.env.LEMONFOX_API_KEY;
  
  if (!LEMONFOX_API_KEY) {
    console.warn('[TTS] LEMONFOX_API_KEY not found in environment variables');
  }

  // Generate speech from text using Lemonfox.ai
  ipcMain.handle('tts-generate-speech', async (event, { text, voice = 'sarah' }) => {
    try {
      if (!LEMONFOX_API_KEY) {
        throw new Error('LEMONFOX_API_KEY not configured');
      }

      if (!text || text.trim().length === 0) {
        throw new Error('No text provided for TTS');
      }

      console.log(`[TTS] Generating speech for text (${text.length} chars) with voice: ${voice}`);

      // Make request to Lemonfox.ai API
      const response = await fetch("https://api.lemonfox.ai/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LEMONFOX_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          input: text,
          voice: voice,
          response_format: "mp3"
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Lemonfox API error: ${response.status} - ${errorText}`);
      }

      // Create temp file for audio
      const tempDir = path.join(require('os').tmpdir(), 'nightowl-tts');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const audioFileName = `speech_${Date.now()}.mp3`;
      const audioFilePath = path.join(tempDir, audioFileName);
      
      // Save audio to file
      const fileStream = fs.createWriteStream(audioFilePath);
      await finished(Readable.fromWeb(response.body).pipe(fileStream));
      
      console.log(`[TTS] Audio saved to: ${audioFilePath}`);

      // Read file as base64 for sending to renderer
      const audioBuffer = fs.readFileSync(audioFilePath);
      const audioBase64 = audioBuffer.toString('base64');
      
      // Clean up temp file after a delay
      setTimeout(() => {
        try {
          fs.unlinkSync(audioFilePath);
          console.log(`[TTS] Cleaned up temp file: ${audioFilePath}`);
        } catch (err) {
          console.warn(`[TTS] Could not clean up temp file: ${err.message}`);
        }
      }, 60000); // Clean up after 1 minute

      return {
        success: true,
        audioData: audioBase64,
        format: 'mp3'
      };

    } catch (error) {
      console.error('[TTS] Error generating speech:', error);
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
        { id: 'michael', name: 'Michael', lang: 'en-US', gender: 'male' }
      ]
    };
  });

  // Check if TTS is available
  ipcMain.handle('tts-check-availability', async (event) => {
    return {
      success: true,
      available: !!LEMONFOX_API_KEY,
      provider: 'lemonfox'
    };
  });

  console.log('[TTS] TTS handlers registered');
}

module.exports = {
  register
};
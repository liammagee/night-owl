// === Image Generation Service ===
// Standalone service for AI image generation (DALL-E).
// Extracted from aiService.js during tutor-core migration.

const { OpenAI } = require('openai');
const { createDebugLogger } = require('../ipc/logging');

const debug = createDebugLogger('ImageService');

class ImageService {
  constructor() {
    this.client = null;
    this.available = false;

    if (process.env.OPENAI_API_KEY) {
      try {
        this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.available = true;
        debug('Initialized with OpenAI DALL-E support');
      } catch (error) {
        console.warn('[ImageService] Could not initialize OpenAI client:', error.message);
      }
    } else {
      debug('No OPENAI_API_KEY - image generation unavailable');
    }
  }

  /**
   * Generate an image using DALL-E.
   *
   * @param {string} prompt - Image description
   * @param {Object} [options]
   * @param {string} [options.model='dall-e-3'] - DALL-E model
   * @param {string} [options.size='1024x1024'] - Image dimensions
   * @param {string} [options.quality='standard'] - 'standard' or 'hd'
   * @param {number} [options.n=1] - Number of images
   * @param {string} [options.style='vivid'] - 'vivid' or 'natural'
   * @returns {Promise<{images: Array, provider: string, model: string}>}
   */
  async generateImage(prompt, options = {}) {
    if (!this.client) {
      throw new Error('Image generation not available — OPENAI_API_KEY not configured.');
    }

    const {
      model = 'dall-e-3',
      size = '1024x1024',
      quality = 'standard',
      n = 1,
      style = 'vivid',
    } = options;

    debug('Generating image with DALL-E');
    debug(`Model: ${model}, Size: ${size}, Quality: ${quality}`);

    try {
      const response = await this.client.images.generate({
        model,
        prompt,
        n,
        size,
        quality,
        style,
      });

      debug('Image generated successfully');

      return {
        images: response.data.map(img => ({
          url: img.url,
          revised_prompt: img.revised_prompt,
          base64: img.b64_json,
        })),
        provider: 'openai',
        model,
      };
    } catch (error) {
      console.error('[ImageService] Image generation failed:', error);
      throw new Error(`Image generation failed: ${error.message}`);
    }
  }

  isAvailable() {
    return this.available;
  }
}

module.exports = ImageService;

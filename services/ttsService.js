// Text-to-Speech Service
// Handles TTS functionality for presentation mode

class TTSService {
  constructor() {
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.currentAudio = null;
    this.voice = null;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.volume = 1.0;
    this.useLemonfox = false;
    this.lemonfoxVoice = 'sarah';
    this.availabilityChecked = false;
    this.settings = null; // Will be loaded from settings
    
    // Initialize settings and voices when available
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.initializeVoices();
    }
    
    // Delay TTS settings loading to ensure handlers are ready
    setTimeout(() => {
      this.loadSettings();
    }, 1000);
  }

  async loadSettings(retryCount = 0) {
    if (window.electronAPI && window.electronAPI.invoke) {
      try {
        // First check if the handler is available by testing a simple TTS handler
        await window.electronAPI.invoke('tts-test');
        
        const result = await window.electronAPI.invoke('tts-get-settings');
        if (result.success) {
          this.settings = result.settings;
          this.applySettings();
          console.log('[TTS] Settings loaded:', this.settings);
          return;
        }
      } catch (error) {
        // If it's a "no handler registered" error and we haven't retried too many times, wait and retry
        if (error.message.includes('No handler registered') && retryCount < 3) {
          console.log(`[TTS] Handlers not ready yet, retrying in ${(retryCount + 1) * 500}ms... (attempt ${retryCount + 1}/3)`);
          setTimeout(() => {
            this.loadSettings(retryCount + 1);
          }, (retryCount + 1) * 500);
          
          // Use defaults temporarily
          this.setDefaults();
          return;
        }
        
        console.warn('[TTS] Could not load TTS settings, using defaults:', error.message);
      }
    }
    
    // Use defaults if settings can't be loaded
    this.setDefaults();
  }
  
  setDefaults() {
    this.settings = {
      enabled: false,
      provider: 'auto',
      lemonfox: {
        voice: 'sarah',
        language: 'en-us',
        speed: 1.0,
        response_format: 'mp3',
        word_timestamps: false
      },
      webSpeech: {
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0,
        voice: null
      },
      autoSpeak: true,
      stopOnSlideChange: true,
      cleanMarkdown: true,
      speakSpeakerNotes: true
    };
    
    this.applySettings();
  }

  applySettings() {
    if (!this.settings) return;
    
    // Apply Lemonfox settings
    this.lemonfoxVoice = this.settings.lemonfox.voice;
    
    // Apply Web Speech settings
    this.rate = this.settings.webSpeech.rate;
    this.pitch = this.settings.webSpeech.pitch;
    this.volume = this.settings.webSpeech.volume;
  }

  async checkLemonfoxAvailability() {
    if (this.availabilityChecked) {
      return;
    }
    
    this.availabilityChecked = true;
    
    if (window.electronAPI && window.electronAPI.invoke) {
      try {
        // First test if any IPC is working
        console.log('[TTS] Testing IPC connection...');
        const testResult = await window.electronAPI.invoke('tts-test');
        console.log('[TTS] Test result:', testResult);
        
        // If TTS test works but settings weren't loaded, try to load them now
        if (!this.settings || !this.settings.lemonfox) {
          console.log('[TTS] TTS handlers available, retrying settings load...');
          await this.loadSettings();
        }
        
        const result = await window.electronAPI.invoke('tts-check-availability');
        console.log('[TTS] Availability check result:', result);
        if (result.success && result.available) {
          this.useLemonfox = true;
          console.log('[TTS] Lemonfox.ai TTS is available and will be used');
        } else {
          console.log('[TTS] Lemonfox.ai not configured, using Web Speech API');
        }
      } catch (error) {
        console.error('[TTS] Error checking Lemonfox availability:', error);
        console.log('[TTS] Will use Web Speech API as fallback');
      }
    } else {
      console.log('[TTS] Not in Electron environment, using Web Speech API');
    }
  }

  initializeVoices() {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      // Prefer English voices
      this.voice = voices.find(voice => voice.lang.startsWith('en-')) || voices[0];
      console.log('[TTS] Available voices:', voices.length);
      console.log('[TTS] Selected voice:', this.voice?.name);
    };

    // Load voices immediately if available
    loadVoices();
    
    // Also listen for voices changed event (needed for some browsers)
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  async speak(text, options = {}) {
    // Stop any current speech
    this.stop();

    if (!text) {
      console.warn('[TTS] Cannot speak - no text provided');
      return Promise.resolve();
    }

    // Clean the text for better speech
    const cleanText = this.cleanTextForSpeech(text);

    // Use Lemonfox if available and in Electron
    if (this.useLemonfox && window.electronAPI && window.electronAPI.invoke) {
      return this.speakWithLemonfox(cleanText, options);
    }
    
    // Fall back to Web Speech API
    if (!window.speechSynthesis) {
      console.warn('[TTS] speechSynthesis not available');
      return Promise.resolve();
    }

    return this.speakWithWebSpeech(cleanText, options);
  }

  async speakWithLemonfox(text, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        this.isSpeaking = true;
        if (options.onStart) options.onStart();
        
        console.log('[TTS] Using Lemonfox.ai to speak text');
        
        // Get audio from Lemonfox API via IPC using configured settings
        const lemonfoxSettings = this.settings?.lemonfox || {};
        const result = await window.electronAPI.invoke('tts-generate-speech', {
          text: text,
          voice: options.voice || lemonfoxSettings.voice || this.lemonfoxVoice,
          language: options.language || lemonfoxSettings.language,
          speed: options.speed || lemonfoxSettings.speed,
          response_format: options.response_format || lemonfoxSettings.response_format,
          word_timestamps: options.word_timestamps !== undefined ? options.word_timestamps : lemonfoxSettings.word_timestamps
        });
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to generate speech');
        }
        
        // Create audio element and play
        const audioBlob = this.base64ToBlob(result.audioData, 'audio/mp3');
        const audioUrl = URL.createObjectURL(audioBlob);
        
        this.currentAudio = new Audio(audioUrl);
        this.currentAudio.volume = options.volume || this.volume;
        
        this.currentAudio.onended = () => {
          this.isSpeaking = false;
          URL.revokeObjectURL(audioUrl);
          this.currentAudio = null;
          console.log('[TTS] Finished playing Lemonfox audio');
          if (options.onEnd) options.onEnd();
          resolve();
        };
        
        this.currentAudio.onerror = (error) => {
          this.isSpeaking = false;
          URL.revokeObjectURL(audioUrl);
          this.currentAudio = null;
          console.error('[TTS] Audio playback error:', error);
          if (options.onError) options.onError(error);
          reject(error);
        };
        
        await this.currentAudio.play();
        console.log('[TTS] Started playing Lemonfox audio');
        
      } catch (error) {
        this.isSpeaking = false;
        console.error('[TTS] Error with Lemonfox TTS:', error);
        if (options.onError) options.onError(error);
        
        // Only fall back to Web Speech API if this is an actual failure, not a configuration issue
        if (error.message && !error.message.includes('LEMONFOX_API_KEY')) {
          console.log('[TTS] Falling back to Web Speech API due to API error');
          return this.speakWithWebSpeech(text, options);
        } else {
          console.log('[TTS] Lemonfox not configured, skipping fallback to prevent conflicts');
          reject(error);
        }
      }
    });
  }

  speakWithWebSpeech(text, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        // Create utterance
        this.currentUtterance = new SpeechSynthesisUtterance(text);
        
        // Set voice and parameters
        if (this.voice) {
          this.currentUtterance.voice = this.voice;
        }
        this.currentUtterance.rate = options.rate || this.rate;
        this.currentUtterance.pitch = options.pitch || this.pitch;
        this.currentUtterance.volume = options.volume || this.volume;
        
        // Set up event handlers
        this.currentUtterance.onstart = () => {
          this.isSpeaking = true;
          console.log('[TTS] Started speaking with Web Speech API');
          if (options.onStart) options.onStart();
        };
        
        this.currentUtterance.onend = () => {
          this.isSpeaking = false;
          console.log('[TTS] Finished speaking with Web Speech API');
          if (options.onEnd) options.onEnd();
          resolve();
        };
        
        this.currentUtterance.onerror = (event) => {
          this.isSpeaking = false;
          console.error('[TTS] Web Speech API error:', event);
          if (options.onError) options.onError(event);
          reject(event);
        };
        
        // Start speaking
        window.speechSynthesis.speak(this.currentUtterance);
        
      } catch (error) {
        console.error('[TTS] Error setting up Web Speech:', error);
        reject(error);
      }
    });
  }

  base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  stop() {
    // Stop Lemonfox audio if playing
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
      console.log('[TTS] Stopped Lemonfox audio');
    }
    
    // Stop Web Speech API if speaking
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.currentUtterance = null;
      console.log('[TTS] Stopped Web Speech API');
    }
    
    this.isSpeaking = false;
  }

  pause() {
    if (window.speechSynthesis && this.isSpeaking) {
      window.speechSynthesis.pause();
      console.log('[TTS] Paused speaking');
    }
  }

  resume() {
    if (window.speechSynthesis) {
      window.speechSynthesis.resume();
      console.log('[TTS] Resumed speaking');
    }
  }

  cleanTextForSpeech(text) {
    // Remove markdown formatting
    let clean = text
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '')
      // Remove inline code
      .replace(/`[^`]+`/g, (match) => match.slice(1, -1))
      // Remove bold/italic markers
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Remove links but keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove headers
      .replace(/^#+\s+/gm, '')
      // Remove bullet points
      .replace(/^[\s]*[-*+]\s+/gm, '')
      // Remove numbered lists
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Remove blockquotes
      .replace(/^>\s+/gm, '')
      // Remove horizontal rules
      .replace(/^---+$/gm, '')
      // Clean up extra whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    return clean;
  }

  setVoice(voiceName) {
    // Check if it's a Lemonfox voice
    const lemonfoxVoices = ['sarah', 'john', 'emily', 'michael'];
    if (lemonfoxVoices.includes(voiceName.toLowerCase())) {
      this.lemonfoxVoice = voiceName.toLowerCase();
      console.log('[TTS] Lemonfox voice set to:', this.lemonfoxVoice);
      return;
    }
    
    // Otherwise try to set Web Speech API voice
    if (window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.name === voiceName);
      if (voice) {
        this.voice = voice;
        console.log('[TTS] Web Speech voice set to:', voice.name);
      }
    }
  }

  setRate(rate) {
    this.rate = Math.max(0.1, Math.min(10, rate));
  }

  setPitch(pitch) {
    this.pitch = Math.max(0, Math.min(2, pitch));
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  getVoices() {
    if (window.speechSynthesis) {
      return window.speechSynthesis.getVoices();
    }
    return [];
  }

  // Settings management
  getSettings() {
    return this.settings;
  }

  async updateSettings(newSettings) {
    if (this.settings) {
      this.settings = { ...this.settings, ...newSettings };
      this.applySettings();
      
      // Save to backend if available
      if (window.electronAPI && window.electronAPI.invoke) {
        try {
          await window.electronAPI.invoke('update-settings-category', 'tts', newSettings);
          console.log('[TTS] Settings updated and saved');
        } catch (error) {
          console.warn('[TTS] Could not save TTS settings:', error);
        }
      }
    }
  }

  // Convenience methods for common settings
  async setLemonfoxVoice(voice) {
    await this.updateSettings({
      lemonfox: { ...this.settings.lemonfox, voice }
    });
  }

  async setLemonfoxSpeed(speed) {
    await this.updateSettings({
      lemonfox: { ...this.settings.lemonfox, speed }
    });
  }

  async setLemonfoxLanguage(language) {
    await this.updateSettings({
      lemonfox: { ...this.settings.lemonfox, language }
    });
  }

  async setWebSpeechRate(rate) {
    await this.updateSettings({
      webSpeech: { ...this.settings.webSpeech, rate }
    });
  }

  async setWebSpeechPitch(pitch) {
    await this.updateSettings({
      webSpeech: { ...this.settings.webSpeech, pitch }
    });
  }

  async setWebSpeechVolume(volume) {
    await this.updateSettings({
      webSpeech: { ...this.settings.webSpeech, volume }
    });
  }

  async setAutoSpeak(enabled) {
    await this.updateSettings({ autoSpeak: enabled });
  }

  async setProvider(provider) {
    await this.updateSettings({ provider });
  }
}

// Create singleton instance
const ttsService = new TTSService();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ttsService;
} else if (typeof window !== 'undefined') {
  window.ttsService = ttsService;
}
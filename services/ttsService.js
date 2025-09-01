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
    
    // Check if Lemonfox is available via Electron IPC
    this.checkLemonfoxAvailability();
    
    // Initialize voices when available
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.initializeVoices();
    }
  }

  async checkLemonfoxAvailability() {
    if (window.electronAPI && window.electronAPI.invoke) {
      try {
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
        
        // Get audio from Lemonfox API via IPC
        const result = await window.electronAPI.invoke('tts-generate-speech', {
          text: text,
          voice: options.voice || this.lemonfoxVoice
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
        
        // Fall back to Web Speech API if Lemonfox fails
        console.log('[TTS] Falling back to Web Speech API');
        return this.speakWithWebSpeech(text, options);
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
}

// Create singleton instance
const ttsService = new TTSService();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ttsService;
} else if (typeof window !== 'undefined') {
  window.ttsService = ttsService;
}
// Text-to-Speech Service
// Handles TTS functionality for presentation mode

class TTSService {
  constructor() {
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.voice = null;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.volume = 1.0;
    
    // Initialize voices when available
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.initializeVoices();
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

  speak(text, options = {}) {
    // Stop any current speech
    this.stop();

    if (!text || !window.speechSynthesis) {
      console.warn('[TTS] Cannot speak - no text or speechSynthesis not available');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        // Clean the text for better speech
        const cleanText = this.cleanTextForSpeech(text);
        
        // Create utterance
        this.currentUtterance = new SpeechSynthesisUtterance(cleanText);
        
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
          console.log('[TTS] Started speaking');
          if (options.onStart) options.onStart();
        };
        
        this.currentUtterance.onend = () => {
          this.isSpeaking = false;
          console.log('[TTS] Finished speaking');
          if (options.onEnd) options.onEnd();
          resolve();
        };
        
        this.currentUtterance.onerror = (event) => {
          this.isSpeaking = false;
          console.error('[TTS] Speech error:', event);
          if (options.onError) options.onError(event);
          reject(event);
        };
        
        // Start speaking
        window.speechSynthesis.speak(this.currentUtterance);
        
      } catch (error) {
        console.error('[TTS] Error setting up speech:', error);
        reject(error);
      }
    });
  }

  stop() {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
      this.currentUtterance = null;
      console.log('[TTS] Stopped speaking');
    }
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
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.name === voiceName);
    if (voice) {
      this.voice = voice;
      console.log('[TTS] Voice set to:', voice.name);
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
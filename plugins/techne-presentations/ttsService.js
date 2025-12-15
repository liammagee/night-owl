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
    
    // Synchronous queue system - only allow one speech operation at a time
    this.speechQueue = [];
    this.isProcessingQueue = false;
    this.currentSpeechController = null; // AbortController for current speech
    
    // Mutex lock to prevent concurrent audio operations
    this.audioMutex = {
      locked: false,
      queue: []
    };
    
    // Track all audio elements for cleanup
    this.activeAudioElements = new Set();
    
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
    console.log('[TTS] === SPEAK CALLED ===');
    console.log('[TTS] Text length:', text?.length || 0);
    console.log('[TTS] Mutex locked:', this.audioMutex.locked);
    console.log('[TTS] Active audio elements:', this.activeAudioElements.size);
    
    if (!text) {
      console.warn('[TTS] Cannot speak - no text provided');
      return Promise.resolve();
    }

    // Wait for mutex if locked
    if (this.audioMutex.locked) {
      console.log('[TTS] Mutex is locked, waiting...');
      await new Promise(resolve => {
        this.audioMutex.queue.push(resolve);
      });
    }

    // Lock the mutex
    this.audioMutex.locked = true;
    console.log('[TTS] Mutex acquired, stopping all existing audio');
    
    // IMMEDIATELY stop everything and clear the queue
    this.clearQueue();
    await this.forceStopImmediate();
    
    // Clean the text for better speech
    const cleanText = this.cleanTextForSpeech(text);
    console.log('[TTS] Cleaned text (first 100 chars):', cleanText.substring(0, 100));
    
    // Check availability first (but only once)
    if (!this.availabilityChecked) {
      console.log('[TTS] Checking Lemonfox availability...');
      await this.checkLemonfoxAvailability();
    }
    
    console.log('[TTS] Provider status - useLemonfox:', this.useLemonfox);
    console.log('[TTS] Starting immediate speech');
    
    try {
      const result = await this.performImmediateSpeech(cleanText, options);
      return result;
    } finally {
      // Release mutex and process queue
      this.releaseMutex();
    }
  }
  
  releaseMutex() {
    console.log('[TTS] Releasing mutex');
    this.audioMutex.locked = false;
    
    // Process next in queue if any
    if (this.audioMutex.queue.length > 0) {
      const next = this.audioMutex.queue.shift();
      console.log('[TTS] Processing next in mutex queue');
      next();
    }
  }
  
  clearQueue() {
    console.log('[TTS] Clearing speech queue');
    this.speechQueue = [];
    this.isProcessingQueue = false;
    
    // Cancel current speech controller if exists
    if (this.currentSpeechController) {
      this.currentSpeechController.abort();
      this.currentSpeechController = null;
    }
  }
  
  async forceStopImmediate() {
    console.log('[TTS] Immediate force stop');
    console.log('[TTS] Active audio elements to clean:', this.activeAudioElements.size);
    this.isSpeaking = false;
    
    // Stop ALL tracked audio elements
    for (const audio of this.activeAudioElements) {
      try {
        console.log('[TTS] Stopping audio element');
        audio.pause();
        audio.currentTime = 0;
        // Don't revoke blob URLs here - let them be cleaned up in onended/onerror
        // Just remove the src to stop loading
        audio.src = '';
      } catch (e) {
        console.warn('[TTS] Error stopping audio element:', e);
      }
    }
    this.activeAudioElements.clear();
    
    // Stop current audio if exists
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        if (this.currentAudio.src && this.currentAudio.src.startsWith('blob:')) {
          URL.revokeObjectURL(this.currentAudio.src);
        }
        this.currentAudio.src = '';
      } catch (e) {}
      this.currentAudio = null;
    }
    
    // Cancel Web Speech API
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
      this.currentUtterance = null;
    }
    
    // Cancel any pending AbortControllers
    if (this.currentSpeechController) {
      this.currentSpeechController.abort();
      this.currentSpeechController = null;
    }
    
    // Small delay to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  async performImmediateSpeech(text, options) {
    // Create abort controller for this speech operation
    this.currentSpeechController = new AbortController();
    const signal = this.currentSpeechController.signal;
    
    try {
      // Use Lemonfox if available and in Electron
      if (this.useLemonfox && window.electronAPI && window.electronAPI.invoke) {
        console.log('[TTS] Using Lemonfox.ai provider');
        return await this.speakWithLemonfoxImmediate(text, options, signal);
      }
      
      // Fall back to Web Speech API
      if (!window.speechSynthesis) {
        console.warn('[TTS] speechSynthesis not available');
        return Promise.resolve();
      }

      console.log('[TTS] Using Web Speech API provider');
      return await this.speakWithWebSpeechImmediate(text, options, signal);
      
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('[TTS] Speech was aborted');
        return Promise.resolve();
      }
      throw error;
    } finally {
      this.currentSpeechController = null;
    }
  }

  async speakWithLemonfoxImmediate(text, options = {}, signal) {
    console.log('[TTS-LEMONFOX] === Starting Lemonfox speech ===');
    console.log('[TTS-LEMONFOX] Text preview:', text.substring(0, 50) + '...');
    
    return new Promise(async (resolve, reject) => {
      let audioUrl = null;
      
      // Set up abort listener
      const abortListener = () => {
        console.log('[TTS-LEMONFOX] Speech aborted via signal');
        this.isSpeaking = false;
        
        // Remove from active audio elements
        if (this.currentAudio) {
          this.activeAudioElements.delete(this.currentAudio);
          this.currentAudio.pause();
          this.currentAudio.src = '';
          this.currentAudio = null;
        }
        
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }
        resolve(); // Resolve, don't reject, for graceful cancellation
      };
      
      if (signal.aborted) {
        console.log('[TTS-LEMONFOX] Signal already aborted, exiting');
        abortListener();
        return;
      }
      
      signal.addEventListener('abort', abortListener);
      
      try {
        this.isSpeaking = true;
        if (options.onStart) {
          console.log('[TTS-LEMONFOX] Calling onStart callback');
          options.onStart();
        }
        
        console.log('[TTS-LEMONFOX] Preparing API request');
        
        // Get audio from Lemonfox API via IPC using configured settings
        const lemonfoxSettings = this.settings?.lemonfox || {};
        const requestParams = {
          text: text,
          voice: options.voice || lemonfoxSettings.voice || this.lemonfoxVoice,
          language: options.language || lemonfoxSettings.language,
          speed: options.speed || lemonfoxSettings.speed,
          response_format: options.response_format || lemonfoxSettings.response_format,
          word_timestamps: options.word_timestamps !== undefined ? options.word_timestamps : lemonfoxSettings.word_timestamps
        };
        
        console.log('[TTS-LEMONFOX] Request params:', requestParams);
        console.log('[TTS-LEMONFOX] Invoking IPC handler tts-generate-speech...');
        
        const result = await window.electronAPI.invoke('tts-generate-speech', requestParams);
        
        console.log('[TTS-LEMONFOX] IPC result received:', {
          success: result.success,
          hasAudioData: !!result.audioData,
          audioDataLength: result.audioData?.length || 0,
          error: result.error
        });
        
        if (signal.aborted) {
          console.log('[TTS-LEMONFOX] Signal aborted after API call');
          abortListener();
          return;
        }
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to generate speech');
        }
        
        if (!result.audioData) {
          throw new Error('No audio data received from Lemonfox API');
        }
        
        console.log('[TTS-LEMONFOX] Creating audio blob...');
        // Create audio element and play
        const audioBlob = this.base64ToBlob(result.audioData, 'audio/mp3');
        audioUrl = URL.createObjectURL(audioBlob);
        console.log('[TTS-LEMONFOX] Audio URL created:', audioUrl);
        
        // Don't call forceStopImmediate here - it's already been called in speak()
        // Just create the new audio element
        this.currentAudio = new Audio(audioUrl);
        this.currentAudio.volume = options.volume || this.volume;
        
        // Track this audio element
        this.activeAudioElements.add(this.currentAudio);
        console.log('[TTS-LEMONFOX] Audio element created and tracked with volume:', this.currentAudio.volume);
        console.log('[TTS-LEMONFOX] Total active audio elements:', this.activeAudioElements.size);
        
        this.currentAudio.onended = () => {
          // Check if this was an intentional stop
          if (!this.currentAudio || signal.aborted) {
            console.log('[TTS-LEMONFOX] Audio ended after intentional stop');
            return;
          }
          
          console.log('[TTS-LEMONFOX] Audio playback ended normally');
          this.isSpeaking = false;
          
          // Store reference before cleanup
          const audioElement = this.currentAudio;
          
          // Remove from active audio elements
          if (audioElement) {
            this.activeAudioElements.delete(audioElement);
          }
          
          if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
          }
          
          this.currentAudio = null;
          
          if (options.onEnd) {
            console.log('[TTS-LEMONFOX] Calling onEnd callback');
            options.onEnd();
          }
          
          signal.removeEventListener('abort', abortListener);
          resolve();
        };
        
        this.currentAudio.onerror = (error) => {
          // Check if this is an intentional stop (audio element was cleared)
          if (!this.currentAudio || signal.aborted) {
            console.log('[TTS-LEMONFOX] Audio error after intentional stop, ignoring');
            return;
          }
          
          // Store reference before potential cleanup
          const audioElement = this.currentAudio;
          
          console.error('[TTS-LEMONFOX] Audio playback error:', error);
          console.error('[TTS-LEMONFOX] Audio element state:', {
            src: audioElement?.src?.substring(0, 100),
            readyState: audioElement?.readyState,
            networkState: audioElement?.networkState,
            error: audioElement?.error,
            paused: audioElement?.paused
          });
          
          this.isSpeaking = false;
          
          // Remove from active audio elements
          if (audioElement) {
            this.activeAudioElements.delete(audioElement);
          }
          
          if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
          }
          
          this.currentAudio = null;
          
          // Only call error callback if not aborted
          if (!signal.aborted && options.onError) {
            console.log('[TTS-LEMONFOX] Calling onError callback');
            options.onError(error);
          }
          
          signal.removeEventListener('abort', abortListener);
          
          // Try to provide more specific error message
          const errorMsg = audioElement?.error?.message || 'Audio playback failed';
          
          // Only reject if not aborted
          if (!signal.aborted) {
            reject(new Error(errorMsg));
          } else {
            resolve(); // Resolve normally if aborted
          }
        };
        
        if (signal.aborted) {
          console.log('[TTS-LEMONFOX] Signal aborted before play');
          abortListener();
          return;
        }
        
        // Wait for audio to be ready
        await new Promise((resolvePlay, rejectPlay) => {
          const playTimeout = setTimeout(() => {
            if (!signal.aborted) {
              console.error('[TTS-LEMONFOX] Audio play timeout');
              rejectPlay(new Error('Audio play timeout'));
            } else {
              resolvePlay(); // Resolve normally if aborted
            }
          }, 5000);
          
          this.currentAudio.oncanplay = async () => {
            // Check if aborted while waiting
            if (signal.aborted || !this.currentAudio) {
              console.log('[TTS-LEMONFOX] Aborted while waiting for canplay');
              clearTimeout(playTimeout);
              resolvePlay(); // Resolve normally
              return;
            }
            
            console.log('[TTS-LEMONFOX] Audio can play, attempting to play...');
            clearTimeout(playTimeout);
            
            try {
              await this.currentAudio.play();
              console.log('[TTS-LEMONFOX] Audio playback started successfully');
              resolvePlay();
            } catch (playError) {
              // Check if this was due to abort
              if (signal.aborted || !this.currentAudio) {
                console.log('[TTS-LEMONFOX] Play aborted');
                resolvePlay(); // Resolve normally
              } else {
                console.error('[TTS-LEMONFOX] Play error:', playError);
                rejectPlay(playError);
              }
            }
          };
          
          // If already ready, trigger canplay
          if (this.currentAudio.readyState >= 3) {
            this.currentAudio.oncanplay();
          }
        });
        
      } catch (error) {
        console.error('[TTS-LEMONFOX] Exception in speakWithLemonfoxImmediate:', error);
        this.isSpeaking = false;
        if (this.currentAudio) this.currentAudio = null;
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        if (options.onError) {
          console.log('[TTS-LEMONFOX] Calling onError callback due to exception');
          options.onError(error);
        }
        signal.removeEventListener('abort', abortListener);
        reject(error);
      }
    });
  }

  async speakWithWebSpeechImmediate(text, options = {}, signal) {
    return new Promise((resolve, reject) => {
      // Set up abort listener
      const abortListener = () => {
        console.log('[TTS] Web Speech aborted');
        this.isSpeaking = false;
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
        this.currentUtterance = null;
        resolve(); // Resolve, don't reject, for graceful cancellation
      };
      
      if (signal.aborted) {
        abortListener();
        return;
      }
      
      signal.addEventListener('abort', abortListener);
      
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
          this.currentUtterance = null;
          console.log('[TTS] Finished speaking with Web Speech API');
          if (options.onEnd) options.onEnd();
          signal.removeEventListener('abort', abortListener);
          resolve();
        };
        
        this.currentUtterance.onerror = (event) => {
          this.isSpeaking = false;
          this.currentUtterance = null;
          console.error('[TTS] Web Speech API error:', event);
          if (options.onError) options.onError(event);
          signal.removeEventListener('abort', abortListener);
          
          // Only reject if it's not an interruption error
          if (event.error !== 'interrupted') {
            reject(event);
          } else {
            console.log('[TTS] Web Speech was interrupted, resolving normally');
            resolve();
          }
        };
        
        if (signal.aborted) {
          abortListener();
          return;
        }
        
        // Start speaking
        console.log('[TTS] Starting Web Speech synthesis');
        window.speechSynthesis.speak(this.currentUtterance);
        
      } catch (error) {
        this.isSpeaking = false;
        this.currentUtterance = null;
        console.error('[TTS] Error setting up Web Speech:', error);
        signal.removeEventListener('abort', abortListener);
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
    console.log('[TTS] Stop requested - clearing all operations');
    console.log('[TTS] Active audio elements:', this.activeAudioElements.size);
    
    // Cancel mutex queue
    this.audioMutex.queue = [];
    
    this.clearQueue();
    this.forceStopImmediate();
    
    // Release mutex if locked
    if (this.audioMutex.locked) {
      this.releaseMutex();
    }
  }

  async forceStop() {
    console.log('[TTS] Legacy force stop - using immediate stop');
    this.clearQueue();
    await this.forceStopImmediate();
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
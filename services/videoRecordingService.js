// Video Recording Service
// Handles recording of presentation playthrough with audio

class VideoRecordingService {
  constructor() {
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.stream = null;
    this.audioContext = null;
    this.audioDestination = null;
    this.startTime = null;
    this.recordingMetadata = {
      slides: [],
      timestamps: [],
      duration: 0
    };
  }

  // Initialize recording with both screen and audio
  async initializeRecording(options = {}) {
    try {
      console.log('[VIDEO] Initializing recording...');
      
      const {
        video = true,
        audio = true,
        videoQuality = 'high',
        audioSource = 'system', // 'system', 'microphone', 'both', or 'tts'
        frameRate = 30,
        videoBitsPerSecond = 2500000, // 2.5 Mbps default
      } = options;

      // Get screen/window stream using Electron's desktopCapturer if available
      let videoStream = null;
      let audioStream = null;

      if (video) {
        try {
          // First try the standard getDisplayMedia API which works in modern Electron
          console.log('[VIDEO] Attempting to capture screen with getDisplayMedia...');
          videoStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: 1920, max: 1920 },
              height: { ideal: 1080, max: 1080 },
              frameRate: { ideal: frameRate, max: frameRate },
              cursor: 'always' // Show mouse cursor
            },
            audio: false // We'll handle audio separately
          });
          console.log('[VIDEO] Successfully captured video stream');
        } catch (displayError) {
          console.warn('[VIDEO] getDisplayMedia failed:', displayError);
          
          // If getDisplayMedia fails and we're in Electron, try desktopCapturer
          if (window.electronAPI && window.electronAPI.invoke) {
            try {
              console.log('[VIDEO] Trying Electron desktopCapturer...');
              const sources = await window.electronAPI.invoke('video-get-sources');
              
              if (!sources.success || !sources.sources || sources.sources.length === 0) {
                throw new Error('No capture sources available');
              }
              
              const source = sources.sources[0];
              console.log('[VIDEO] Using source:', source.name);
              
              // Use the older getUserMedia API with Electron's desktopCapturer
              videoStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: source.id
                  }
                }
              });
              console.log('[VIDEO] Successfully captured video stream with desktopCapturer');
            } catch (electronError) {
              console.error('[VIDEO] Electron desktopCapturer failed:', electronError);
              throw new Error('Screen capture not available. Please check permissions.');
            }
          } else {
            throw displayError;
          }
        }
      }

      if (audio) {
        try {
          // For now, just try to capture microphone audio
          // System audio capture is complex and often requires special permissions
          if (audioSource === 'microphone' || audioSource === 'both') {
            console.log('[VIDEO] Attempting to capture microphone audio...');
            audioStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              }
            });
            console.log('[VIDEO] Successfully captured microphone audio');
          }
          
          // For TTS audio, we'll capture it directly when it plays
          if (audioSource === 'tts' && window.ttsService) {
            console.log('[VIDEO] Setting up TTS audio capture...');
            // Create audio context for TTS capture
            this.audioContext = new AudioContext();
            this.audioDestination = this.audioContext.createMediaStreamDestination();
            this.setupTTSAudioCapture();
            
            // If we have TTS destination, use it as audio stream
            if (this.audioDestination) {
              audioStream = this.audioDestination.stream;
            }
          }
        } catch (audioError) {
          console.warn('[VIDEO] Audio capture failed, continuing without audio:', audioError);
          // Continue without audio rather than failing completely
          audio = false;
        }
      }

      // Combine video and audio streams
      const tracks = [];
      if (videoStream) {
        tracks.push(...videoStream.getVideoTracks());
      }
      if (audioStream) {
        tracks.push(...audioStream.getAudioTracks());
      }

      this.stream = new MediaStream(tracks);
      
      console.log('[VIDEO] Recording initialized with tracks:', {
        video: this.stream.getVideoTracks().length,
        audio: this.stream.getAudioTracks().length
      });

      return true;
    } catch (error) {
      console.error('[VIDEO] Failed to initialize recording:', error);
      throw error;
    }
  }

  // Setup TTS audio capture
  setupTTSAudioCapture() {
    if (!window.ttsService) return;

    // Override TTS audio playback to capture it
    const originalPlay = Audio.prototype.play;
    Audio.prototype.play = async function() {
      console.log('[VIDEO] Capturing TTS audio');
      
      // If this is TTS audio and we're recording, capture it
      if (window.videoRecorder && window.videoRecorder.isRecording && this.src && this.src.includes('blob:')) {
        try {
          const audioElement = this;
          const source = window.videoRecorder.audioContext.createMediaElementSource(audioElement);
          source.connect(window.videoRecorder.audioDestination);
        } catch (error) {
          console.warn('[VIDEO] Could not capture TTS audio:', error);
        }
      }
      
      return originalPlay.call(this);
    };
  }

  // Start recording
  async startRecording(options = {}) {
    if (!this.stream) {
      await this.initializeRecording(options);
    }

    const {
      mimeType = 'video/webm;codecs=vp9,opus', // High quality codec
      videoBitsPerSecond = 2500000
    } = options;

    try {
      // Check supported mime types
      const supportedTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm',
        'video/mp4;codecs=h264,aac',
        'video/mp4'
      ];
      
      const supportedType = supportedTypes.find(type => MediaRecorder.isTypeSupported(type));
      
      if (!supportedType) {
        console.error('[VIDEO] No supported mime types found');
        throw new Error('No supported video recording format found');
      }

      console.log('[VIDEO] Using mime type:', supportedType);
      
      // Create MediaRecorder with appropriate settings
      const recorderOptions = {
        mimeType: supportedType
      };
      
      // Only add bitrate if we have video
      if (this.stream.getVideoTracks().length > 0) {
        recorderOptions.videoBitsPerSecond = videoBitsPerSecond;
      }

      this.mediaRecorder = new MediaRecorder(this.stream, recorderOptions);

      this.recordedChunks = [];
      this.startTime = Date.now();
      this.recordingMetadata = {
        slides: [],
        timestamps: [],
        duration: 0,
        startTime: new Date().toISOString()
      };

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
          console.log('[VIDEO] Data chunk received:', event.data.size, 'bytes');
        }
      };

      this.mediaRecorder.onstop = () => {
        console.log('[VIDEO] Recording stopped');
        this.recordingMetadata.duration = Date.now() - this.startTime;
        this.saveRecording();
      };

      this.mediaRecorder.onerror = (error) => {
        console.error('[VIDEO] Recording error:', error);
      };

      this.mediaRecorder.start(1000); // Collect data every second
      this.isRecording = true;
      
      console.log('[VIDEO] Recording started');
      return true;
    } catch (error) {
      console.error('[VIDEO] Failed to start recording:', error);
      throw error;
    }
  }

  // Stop recording
  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      
      // Stop all tracks
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }
      
      // Close audio context
      if (this.audioContext) {
        this.audioContext.close();
      }
      
      console.log('[VIDEO] Recording stopped');
      return true;
    }
    return false;
  }

  // Pause recording
  pauseRecording() {
    if (this.mediaRecorder && this.isRecording && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      console.log('[VIDEO] Recording paused');
      return true;
    }
    return false;
  }

  // Resume recording
  resumeRecording() {
    if (this.mediaRecorder && this.isRecording && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      console.log('[VIDEO] Recording resumed');
      return true;
    }
    return false;
  }

  // Add slide transition marker
  markSlideTransition(slideNumber, slideTitle) {
    if (this.isRecording) {
      const timestamp = Date.now() - this.startTime;
      this.recordingMetadata.slides.push({
        number: slideNumber,
        title: slideTitle,
        timestamp: timestamp
      });
      console.log('[VIDEO] Marked slide transition:', slideNumber, 'at', timestamp, 'ms');
    }
  }

  // Add custom timestamp marker
  addTimestamp(label, data = {}) {
    if (this.isRecording) {
      const timestamp = Date.now() - this.startTime;
      this.recordingMetadata.timestamps.push({
        label,
        timestamp,
        data
      });
      console.log('[VIDEO] Added timestamp:', label, 'at', timestamp, 'ms');
    }
  }

  // Save recording to file
  async saveRecording() {
    if (this.recordedChunks.length === 0) {
      console.warn('[VIDEO] No data to save');
      return;
    }

    try {
      const blob = new Blob(this.recordedChunks, {
        type: this.mediaRecorder.mimeType
      });
      
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `presentation-recording-${timestamp}.webm`;

      // If in Electron, save directly to file system
      if (window.electronAPI && window.electronAPI.saveVideoRecording) {
        const buffer = await blob.arrayBuffer();
        const result = await window.electronAPI.saveVideoRecording({
          buffer: buffer,
          filename: filename,
          metadata: this.recordingMetadata
        });
        
        console.log('[VIDEO] Recording saved:', result.path);
        return result;
      } else {
        // Fallback to browser download
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        
        // Also save metadata
        const metadataBlob = new Blob([JSON.stringify(this.recordingMetadata, null, 2)], {
          type: 'application/json'
        });
        const metadataUrl = URL.createObjectURL(metadataBlob);
        const metadataLink = document.createElement('a');
        metadataLink.href = metadataUrl;
        metadataLink.download = filename.replace('.webm', '-metadata.json');
        metadataLink.click();
        
        console.log('[VIDEO] Recording downloaded:', filename);
        
        // Clean up
        setTimeout(() => {
          URL.revokeObjectURL(url);
          URL.revokeObjectURL(metadataUrl);
        }, 100);
      }
    } catch (error) {
      console.error('[VIDEO] Failed to save recording:', error);
      throw error;
    }
  }

  // Export recording with post-processing options
  async exportRecording(options = {}) {
    const {
      format = 'mp4', // Target format
      quality = 'high', // 'low', 'medium', 'high', 'ultra'
      includeMetadata = true,
      includeChapters = true // Create chapters from slide transitions
    } = options;

    // This would require ffmpeg integration for format conversion
    // For now, we'll export as WebM with metadata
    
    if (includeChapters && this.recordingMetadata.slides.length > 0) {
      // Create WebVTT chapter file
      const chapters = this.createChapterFile();
      console.log('[VIDEO] Created chapter file with', this.recordingMetadata.slides.length, 'chapters');
    }

    return this.saveRecording();
  }

  // Create WebVTT chapter file from slide transitions
  createChapterFile() {
    let vtt = 'WEBVTT\n\n';
    
    for (let i = 0; i < this.recordingMetadata.slides.length; i++) {
      const slide = this.recordingMetadata.slides[i];
      const nextSlide = this.recordingMetadata.slides[i + 1];
      
      const startTime = this.formatTime(slide.timestamp);
      const endTime = nextSlide ? 
        this.formatTime(nextSlide.timestamp) : 
        this.formatTime(this.recordingMetadata.duration);
      
      vtt += `${startTime} --> ${endTime}\n`;
      vtt += `Slide ${slide.number}: ${slide.title || 'Untitled'}\n\n`;
    }
    
    return vtt;
  }

  // Format milliseconds to WebVTT timestamp format (HH:MM:SS.mmm)
  formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  // Get recording status
  getStatus() {
    return {
      isRecording: this.isRecording,
      duration: this.isRecording ? Date.now() - this.startTime : 0,
      slideCount: this.recordingMetadata.slides.length,
      dataSize: this.recordedChunks.reduce((acc, chunk) => acc + chunk.size, 0)
    };
  }
}

// Create singleton instance
const videoRecordingService = new VideoRecordingService();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = videoRecordingService;
} else if (typeof window !== 'undefined') {
  window.videoRecordingService = videoRecordingService;
  window.videoRecorder = videoRecordingService; // Alias for easier access
}
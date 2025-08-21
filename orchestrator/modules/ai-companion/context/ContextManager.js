// === Context Manager ===
// Manages context preparation and configuration for AI analysis

class ContextManager {
    constructor() {
        // Context Configuration
        this.contextConfig = {
            scope: 'full_document', // Options: 'full_document', 'recent_text_only', 'selected_text_only'
            maxFullDocumentLength: 10000, // Maximum characters to send as full context (performance limit)
            recentTextLength: 500, // Length of recent text to use when scope is 'recent_text_only'
            includeLineNumbers: false, // Whether to include line numbers in context
            preserveFormatting: true, // Whether to preserve markdown formatting in context
        };

        // Real-time buffer management
        this.realTimeAnalysis = {
            analysisBuffer: [], // Store recent writing for analysis
            bufferSize: 200, // Words to analyze at once
            recentTypingBuffer: '', // Buffer to track last ~150 characters as they're typed
            maxTypingBufferSize: 150, // Maximum characters to keep in typing buffer
            characterThreshold: 20, // Minimum characters typed before triggering AI analysis
        };

        // Logging configuration
        this.loggingConfig = {
            level: 'basic',
            logContextPreparation: false,
            logAnalysisSteps: false,
            logPerformanceMetrics: false,
        };

        // Load settings
        this.loadContextSettings();
    }

    // === Context Preparation Methods ===

    prepareContext(options = {}) {
        const startTime = Date.now();
        
        console.log('[ContextManager] 📄 Preparing context with scope:', this.contextConfig.scope);
        console.log('[ContextManager] 📄 Context config:', {
            scope: this.contextConfig.scope,
            maxLength: this.contextConfig.maxFullDocumentLength,
            includeLineNumbers: this.contextConfig.includeLineNumbers,
            preserveFormatting: this.contextConfig.preserveFormatting
        });
        
        let context = '';
        let metadata = {
            scope: this.contextConfig.scope,
            length: 0,
            truncated: false,
            includesSelection: false
        };

        try {
            switch (this.contextConfig.scope) {
                case 'full_document':
                    context = this.getFullDocumentContext();
                    break;
                case 'recent_text_only':
                    context = this.getRecentTextContext();
                    break;
                case 'selected_text_only':
                    context = this.getSelectedTextContext();
                    break;
                default:
                    context = this.getAdaptiveContext(options);
            }

            // Apply formatting options
            if (this.contextConfig.includeLineNumbers) {
                context = this.addLineNumbers(context);
            }

            if (!this.contextConfig.preserveFormatting) {
                context = this.stripFormatting(context);
            }

            // Check length limits and truncate if necessary
            if (context.length > this.contextConfig.maxFullDocumentLength) {
                context = this.truncateContext(context);
                metadata.truncated = true;
            }

            metadata.length = context.length;
            
            console.log('[ContextManager] 📄 Context prepared:', {
                scope: metadata.scope,
                length: metadata.length,
                truncated: metadata.truncated,
                preview: context.slice(0, 100) + (context.length > 100 ? '...' : '')
            });

            this.logContextPreparation(context, metadata, Date.now() - startTime);

            return {
                context,
                metadata
            };

        } catch (error) {
            console.error('[ContextManager] Error preparing context:', error);
            return {
                context: '',
                metadata: { ...metadata, error: error.message }
            };
        }
    }

    getFullDocumentContext() {
        if (!editor) {
            return '';
        }

        const fullText = editor.getValue();
        
        // If document is too long, intelligently truncate
        if (fullText.length > this.contextConfig.maxFullDocumentLength) {
            return this.intelligentTruncate(fullText);
        }

        return fullText;
    }

    getRecentTextContext() {
        if (!editor) {
            return '';
        }

        const fullText = editor.getValue();
        const recentLength = this.contextConfig.recentTextLength;
        
        if (fullText.length <= recentLength) {
            return fullText;
        }

        // Get the last N characters, but try to break at word boundaries
        const recentText = fullText.slice(-recentLength);
        const firstSpaceIndex = recentText.indexOf(' ');
        
        return firstSpaceIndex > 0 && firstSpaceIndex < 50 ? 
            recentText.slice(firstSpaceIndex + 1) : 
            recentText;
    }

    getSelectedTextContext() {
        if (!editor) {
            return '';
        }

        const selection = editor.getSelection();
        if (!selection.isEmpty()) {
            return editor.getModel().getValueInRange(selection);
        }

        // Fallback to recent text if no selection
        return this.getRecentTextContext();
    }

    getAdaptiveContext(options = {}) {
        // Intelligent context selection based on writing state
        if (!editor) {
            return '';
        }

        const fullText = editor.getValue();
        const selection = editor.getSelection();

        // If user has selection, use that
        if (!selection.isEmpty()) {
            return editor.getModel().getValueInRange(selection);
        }

        // If document is short, use full document
        if (fullText.length <= this.contextConfig.maxFullDocumentLength / 2) {
            return fullText;
        }

        // For longer documents, use recent context with some preceding context
        const extendedLength = this.contextConfig.recentTextLength * 2;
        return fullText.length > extendedLength ? 
            fullText.slice(-extendedLength) : 
            fullText;
    }

    // === Buffer Management ===

    updateTypingBuffer(newText) {
        // Update the real-time typing buffer
        this.realTimeAnalysis.recentTypingBuffer += newText;
        
        // Trim buffer if it gets too long
        if (this.realTimeAnalysis.recentTypingBuffer.length > this.realTimeAnalysis.maxTypingBufferSize) {
            this.realTimeAnalysis.recentTypingBuffer = 
                this.realTimeAnalysis.recentTypingBuffer.slice(-this.realTimeAnalysis.maxTypingBufferSize);
        }
    }

    updateAnalysisBuffer(text) {
        // Add text to analysis buffer
        const words = text.split(/\s+/).filter(word => word.trim().length > 0);
        this.realTimeAnalysis.analysisBuffer.push(...words);
        
        // Trim buffer if it gets too large
        if (this.realTimeAnalysis.analysisBuffer.length > this.realTimeAnalysis.bufferSize) {
            const excess = this.realTimeAnalysis.analysisBuffer.length - this.realTimeAnalysis.bufferSize;
            this.realTimeAnalysis.analysisBuffer = this.realTimeAnalysis.analysisBuffer.slice(excess);
        }
    }

    getCurrentAnalysisBuffer() {
        return this.realTimeAnalysis.analysisBuffer.join(' ');
    }

    getRecentTypingBuffer() {
        return this.realTimeAnalysis.recentTypingBuffer;
    }

    clearBuffers() {
        this.realTimeAnalysis.analysisBuffer = [];
        this.realTimeAnalysis.recentTypingBuffer = '';
    }

    // === Context Processing Helpers ===

    intelligentTruncate(text) {
        const maxLength = this.contextConfig.maxFullDocumentLength;
        
        if (text.length <= maxLength) {
            return text;
        }

        // Try to keep the beginning and end, removing middle content
        const keepStart = Math.floor(maxLength * 0.3);
        const keepEnd = Math.floor(maxLength * 0.3);
        const remaining = maxLength - keepStart - keepEnd - 50; // Buffer for separator

        if (remaining > 0) {
            const startText = text.slice(0, keepStart);
            const endText = text.slice(-keepEnd);
            const separator = '\n\n[... content truncated ...]\n\n';
            
            return startText + separator + endText;
        }

        // Fallback: just truncate from the end
        return text.slice(0, maxLength - 20) + '\n\n[... truncated]';
    }

    truncateContext(context) {
        const maxLength = this.contextConfig.maxFullDocumentLength;
        
        if (context.length <= maxLength) {
            return context;
        }

        // Try to truncate at paragraph boundary
        const truncated = context.slice(0, maxLength - 20);
        const lastParagraph = truncated.lastIndexOf('\n\n');
        
        if (lastParagraph > maxLength * 0.8) {
            return truncated.slice(0, lastParagraph) + '\n\n[... truncated]';
        }

        // Fallback: truncate at word boundary
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > maxLength * 0.9) {
            return truncated.slice(0, lastSpace) + ' [... truncated]';
        }

        return truncated + '[... truncated]';
    }

    addLineNumbers(text) {
        const lines = text.split('\n');
        return lines.map((line, index) => `${index + 1}: ${line}`).join('\n');
    }

    stripFormatting(text) {
        // Remove common markdown formatting
        return text
            .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
            .replace(/\*(.*?)\*/g, '$1')     // Italic
            .replace(/`(.*?)`/g, '$1')       // Inline code
            .replace(/^#+\s+/gm, '')         // Headers
            .replace(/^\-\s+/gm, '')         // List items
            .replace(/^\*\s+/gm, '')         // List items
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // Links
    }

    // === Validation Methods ===

    hasEnoughContent(text) {
        if (!text || typeof text !== 'string') {
            return false;
        }
        
        const trimmed = text.trim();
        return trimmed.length >= this.realTimeAnalysis.characterThreshold;
    }

    hasMeaningfulText(text) {
        if (!text || typeof text !== 'string') {
            return false;
        }

        // Check for meaningful content (not just punctuation/whitespace)
        const meaningfulChars = text.replace(/[\s\.\,\!\?\;\:\-\(\)]+/g, '');
        return meaningfulChars.length >= 5;
    }

    isLikelyFileLoadingContent(text) {
        // Detect if text looks like file content being loaded (common patterns)
        const fileLoadingPatterns = [
            /^#\s+.+\n/,                    // Starts with header
            /^\-{3,}\n/,                    // Starts with horizontal rule
            /^```[\s\S]*```$/,              // Code block
            /^import\s+.+\s+from/m,         // Import statements
            /^<\?xml|^<!DOCTYPE/,           // XML/HTML documents
        ];

        return fileLoadingPatterns.some(pattern => pattern.test(text.slice(0, 200)));
    }

    // === Settings Management ===

    async loadContextSettings() {
        try {
            const settings = await window.electronAPI.invoke('get-settings');
            console.log('[ContextManager] 🔧 Loading context settings:', settings?.ai);
            
            if (settings && settings.ai) {
                // Load context scope setting
                if (settings.ai.companionContextScope) {
                    console.log('[ContextManager] 🔧 Setting context scope from settings:', settings.ai.companionContextScope);
                    this.contextConfig.scope = settings.ai.companionContextScope;
                } else {
                    console.log('[ContextManager] 🔧 No companionContextScope in settings, using default:', this.contextConfig.scope);
                }
                
                // Load max context length setting
                if (settings.ai.companionMaxContextLength) {
                    console.log('[ContextManager] 🔧 Setting max context length from settings:', settings.ai.companionMaxContextLength);
                    this.contextConfig.maxFullDocumentLength = settings.ai.companionMaxContextLength;
                }

                // Load character threshold setting
                if (settings.ai.companionCharacterThreshold !== undefined) {
                    console.log('[ContextManager] 🔧 Setting character threshold from settings:', settings.ai.companionCharacterThreshold);
                    this.realTimeAnalysis.characterThreshold = settings.ai.companionCharacterThreshold;
                }

                // Update logging settings if they exist
                if (settings.logging) {
                    Object.assign(this.loggingConfig, settings.logging);
                }
            } else {
                console.log('[ContextManager] 🔧 No AI settings found, using defaults');
            }
            
            console.log('[ContextManager] 🔧 Final context config:', {
                scope: this.contextConfig.scope,
                maxLength: this.contextConfig.maxFullDocumentLength,
                charThreshold: this.realTimeAnalysis.characterThreshold
            });
        } catch (error) {
            console.warn('[ContextManager] Could not load settings, using defaults:', error);
        }
    }

    updateContextConfig(newConfig) {
        Object.assign(this.contextConfig, newConfig);
    }

    updateLoggingConfig(newConfig) {
        Object.assign(this.loggingConfig, newConfig);
    }

    // === Logging ===

    logContextPreparation(context, metadata, timeTaken) {
        if (this.loggingConfig.logContextPreparation) {
            console.log('[ContextManager] Context prepared:', {
                scope: metadata.scope,
                length: metadata.length,
                truncated: metadata.truncated,
                timeTaken: `${timeTaken}ms`,
                preview: context.slice(0, 100) + (context.length > 100 ? '...' : '')
            });
        }
    }

    // === Public API ===

    getContextInfo() {
        return {
            config: { ...this.contextConfig },
            bufferStatus: {
                analysisBufferSize: this.realTimeAnalysis.analysisBuffer.length,
                typingBufferSize: this.realTimeAnalysis.recentTypingBuffer.length,
                maxAnalysisBufferSize: this.realTimeAnalysis.bufferSize,
                maxTypingBufferSize: this.realTimeAnalysis.maxTypingBufferSize
            }
        };
    }

    resetBuffers() {
        this.clearBuffers();
        console.log('[ContextManager] Buffers reset');
    }
}

// Make available globally
window.ContextManager = ContextManager;
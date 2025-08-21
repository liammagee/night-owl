// === Text Collection Manager ===
// Manages text buffer, content collection, and analysis for AI flow detection

class TextCollectionManager {
    constructor() {
        this.textCollection = {
            recentText: '', // Last 200 characters typed
            lastSentence: '', // Current/last sentence being worked on
            textBuffer: [], // Buffer of recent text changes
            maxBufferSize: 50, // Keep last 50 text changes
            currentFile: '', // Current file being edited
            fileContent: '', // Current file content
            lastContentUpdate: 0 // When we last got file content
        };
    }

    // Update recent text from editor changes
    updateRecentText(newText) {
        if (!newText || typeof newText !== 'string') return;
        
        this.textCollection.recentText = newText.slice(-200); // Keep last 200 chars
        this.addToTextBuffer(newText);
        this.extractLastSentence();
    }

    // Add text change to buffer for pattern analysis
    addToTextBuffer(text) {
        const timestamp = Date.now();
        this.textCollection.textBuffer.push({
            text: text.slice(-50), // Keep last 50 chars of this change
            timestamp: timestamp,
            length: text.length
        });

        // Maintain buffer size limit
        if (this.textCollection.textBuffer.length > this.textCollection.maxBufferSize) {
            this.textCollection.textBuffer.shift();
        }
    }

    // Extract the current/last sentence being worked on
    extractLastSentence() {
        const text = this.textCollection.recentText;
        if (!text) return;

        // Find sentence boundaries (., !, ?, or line breaks)
        const sentenceEnders = /[.!?]\s*$/;
        const sentences = text.split(/[.!?\n]+/);
        
        // Get the last sentence (current work in progress)
        let lastSentence = sentences[sentences.length - 1]?.trim() || '';
        
        // If the last sentence is very short, combine with previous
        if (lastSentence.length < 10 && sentences.length > 1) {
            const previousSentence = sentences[sentences.length - 2]?.trim() || '';
            if (previousSentence) {
                lastSentence = previousSentence + '. ' + lastSentence;
            }
        }

        this.textCollection.lastSentence = lastSentence.slice(-100); // Keep reasonable length
    }

    // Update file content and metadata
    updateFileContent(fileName, content) {
        this.textCollection.currentFile = fileName || '';
        this.textCollection.fileContent = content || '';
        this.textCollection.lastContentUpdate = Date.now();
    }

    // Get recent typing velocity (characters per minute)
    getTypingVelocity(timeWindow = 60000) { // Default: last 60 seconds
        const now = Date.now();
        const cutoff = now - timeWindow;
        
        const recentChanges = this.textCollection.textBuffer.filter(
            change => change.timestamp >= cutoff
        );

        if (recentChanges.length < 2) return 0;

        const totalChars = recentChanges.reduce((sum, change) => sum + change.length, 0);
        const timeSpan = now - recentChanges[0].timestamp;
        
        return timeSpan > 0 ? (totalChars / timeSpan) * 60000 : 0; // chars per minute
    }

    // Get text composition patterns
    getCompositionPatterns() {
        const recent = this.textCollection.recentText;
        if (!recent) return {};

        return {
            avgWordLength: this.calculateAverageWordLength(recent),
            sentenceCount: this.countSentences(recent),
            punctuationDensity: this.calculatePunctuationDensity(recent),
            vocabularyComplexity: this.assessVocabularyComplexity(recent)
        };
    }

    // Calculate average word length
    calculateAverageWordLength(text) {
        const words = text.split(/\s+/).filter(word => word.length > 0);
        if (words.length === 0) return 0;
        
        const totalLength = words.reduce((sum, word) => sum + word.length, 0);
        return totalLength / words.length;
    }

    // Count sentences in text
    countSentences(text) {
        return text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    }

    // Calculate punctuation density
    calculatePunctuationDensity(text) {
        if (!text.length) return 0;
        const punctuationCount = (text.match(/[.,;:!?()"-]/g) || []).length;
        return punctuationCount / text.length;
    }

    // Assess vocabulary complexity (basic heuristic)
    assessVocabularyComplexity(text) {
        const words = text.toLowerCase().split(/\s+/).filter(word => word.length > 0);
        if (words.length === 0) return 0;

        // Count unique words vs total words
        const uniqueWords = new Set(words);
        const uniqueRatio = uniqueWords.size / words.length;

        // Factor in average word length
        const avgLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
        
        // Complex words heuristic (longer than 6 characters)
        const complexWords = words.filter(word => word.length > 6).length;
        const complexRatio = complexWords / words.length;

        // Combine metrics (0-1 scale)
        return Math.min(1, (uniqueRatio * 0.4) + (avgLength / 10 * 0.3) + (complexRatio * 0.3));
    }

    // Get analysis context for AI insights
    getAnalysisContext() {
        return {
            recentText: this.textCollection.recentText,
            lastSentence: this.textCollection.lastSentence,
            currentFile: this.textCollection.currentFile,
            contentLength: this.textCollection.fileContent.length,
            bufferSize: this.textCollection.textBuffer.length,
            typingVelocity: this.getTypingVelocity(),
            compositionPatterns: this.getCompositionPatterns()
        };
    }

    // Get text collection state
    getState() {
        return {
            ...this.textCollection,
            typingVelocity: this.getTypingVelocity(),
            compositionPatterns: this.getCompositionPatterns()
        };
    }

    // Clear text collection data
    clear() {
        this.textCollection = {
            recentText: '',
            lastSentence: '',
            textBuffer: [],
            maxBufferSize: 50,
            currentFile: '',
            fileContent: '',
            lastContentUpdate: 0
        };
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.TextCollectionManager = TextCollectionManager;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TextCollectionManager;
}
// === Text Analysis Engine ===
// Advanced text analysis including sentiment, complexity, and creativity analysis

class TextAnalysisEngine {
    constructor() {
        this.analysisCache = new Map();
        this.cacheTimeout = 300000; // 5 minutes
        
        // Analysis configuration
        this.config = {
            sentiment: {
                positiveWords: ['good', 'great', 'excellent', 'wonderful', 'amazing', 'love', 'enjoy', 'excited', 'happy', 'brilliant', 'fantastic', 'outstanding', 'superb'],
                negativeWords: ['bad', 'terrible', 'awful', 'hate', 'frustrated', 'difficult', 'struggling', 'worried', 'horrible', 'disappointing', 'confusing']
            },
            creativity: {
                metaphorIndicators: ['like', 'as', 'seems', 'appears', 'resembles', 'reminds', 'echoes', 'mirrors'],
                emotionalWords: ['feel', 'sense', 'emotion', 'heart', 'soul', 'spirit', 'passionate', 'moved', 'touched'],
                imaginativeWords: ['imagine', 'dream', 'wonder', 'envision', 'picture', 'visualize', 'conceive', 'fantasy']
            }
        };
    }

    // === Main Analysis Methods ===

    analyzeText(text, options = {}) {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return this.getEmptyAnalysis();
        }

        const cacheKey = this.getCacheKey(text, options);
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        const analysis = {
            sentiment: this.analyzeSentiment(text),
            complexity: this.analyzeComplexity(text),
            creativity: this.analyzeCreativity(text),
            structure: this.analyzeStructure(text),
            vocabulary: this.analyzeVocabulary(text),
            flow: this.analyzeFlow(text),
            timestamp: Date.now()
        };

        this.saveToCache(cacheKey, analysis);
        return analysis;
    }

    analyzeSentiment(text) {
        const words = text.toLowerCase().split(/\W+/).filter(w => w.trim().length > 0);
        const { positiveWords, negativeWords } = this.config.sentiment;
        
        const positive = words.filter(word => positiveWords.includes(word)).length;
        const negative = words.filter(word => negativeWords.includes(word)).length;
        
        const sentiment = positive - negative;
        const magnitude = Math.abs(sentiment) / Math.max(words.length, 1);
        
        return {
            score: sentiment / Math.max(positive + negative, 1), // -1 to 1
            magnitude,
            tendency: sentiment > 0 ? 'positive' : sentiment < 0 ? 'negative' : 'neutral',
            positiveWords: positive,
            negativeWords: negative,
            confidence: this.calculateSentimentConfidence(positive, negative, words.length)
        };
    }

    analyzeComplexity(text) {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return this.getEmptyComplexityAnalysis();
        }
        
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const words = text.split(/\s+/).filter(w => w.trim().length > 0);
        
        if (words.length === 0 || sentences.length === 0) {
            return this.getEmptyComplexityAnalysis();
        }
        
        const avgWordsPerSentence = words.length / sentences.length;
        const avgSyllablesPerWord = this.estimateAvgSyllables(words);
        const uniqueWordRatio = new Set(words.map(w => w.toLowerCase())).size / words.length;
        
        // Flesch Reading Ease approximation
        const fleschScore = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
        
        return {
            fleschScore: isNaN(fleschScore) ? 0 : Math.max(0, Math.min(100, fleschScore)),
            readingLevel: this.fleschToLevel(fleschScore),
            avgWordsPerSentence: isNaN(avgWordsPerSentence) ? 0 : avgWordsPerSentence,
            avgSyllablesPerWord: isNaN(avgSyllablesPerWord) ? 0 : avgSyllablesPerWord,
            uniqueWordRatio: isNaN(uniqueWordRatio) ? 0 : uniqueWordRatio,
            complexity: this.calculateComplexityScore(avgWordsPerSentence, avgSyllablesPerWord, uniqueWordRatio),
            sentenceCount: sentences.length,
            wordCount: words.length
        };
    }

    analyzeCreativity(text) {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return this.getEmptyCreativityAnalysis();
        }
        
        const words = text.toLowerCase().split(/\W+/).filter(w => w.trim().length > 0);
        const uniqueWords = new Set(words);
        const { metaphorIndicators, emotionalWords, imaginativeWords } = this.config.creativity;
        
        const metaphorScore = this.calculateIndicatorScore(words, metaphorIndicators);
        const emotionalScore = this.calculateIndicatorScore(words, emotionalWords);
        const imaginativeScore = this.calculateIndicatorScore(words, imaginativeWords);
        
        const vocabularyDiversity = words.length > 0 ? uniqueWords.size / words.length : 0;
        const unconventionalPhrases = this.detectUnconventionalPhrases(text);
        
        const score = (metaphorScore + emotionalScore + imaginativeScore + vocabularyDiversity) / 4;
        
        return {
            score: isNaN(score) ? 0 : score,
            metaphorScore: isNaN(metaphorScore) ? 0 : metaphorScore,
            emotionalScore: isNaN(emotionalScore) ? 0 : emotionalScore,
            imaginativeScore: isNaN(imaginativeScore) ? 0 : imaginativeScore,
            vocabularyDiversity: isNaN(vocabularyDiversity) ? 0 : vocabularyDiversity,
            unconventionalPhrases: unconventionalPhrases || [],
            breakthrough: score > 0.8 && unconventionalPhrases.length > 0
        };
    }

    analyzeStructure(text) {
        const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        
        return {
            paragraphCount: paragraphs.length,
            sentenceCount: sentences.length,
            avgSentencesPerParagraph: paragraphs.length > 0 ? sentences.length / paragraphs.length : 0,
            hasIntroduction: this.hasIntroductoryStructure(text),
            hasConclusion: this.hasConclusionStructure(text),
            structureScore: this.calculateStructureScore(paragraphs, sentences)
        };
    }

    analyzeVocabulary(text) {
        const words = text.toLowerCase().split(/\W+/).filter(w => w.trim().length > 2);
        const uniqueWords = new Set(words);
        
        const wordFrequency = new Map();
        words.forEach(word => {
            wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
        });
        
        const repeatedWords = Array.from(wordFrequency.entries())
            .filter(([word, count]) => count > 1)
            .sort((a, b) => b[1] - a[1]);
        
        return {
            totalWords: words.length,
            uniqueWords: uniqueWords.size,
            diversityRatio: words.length > 0 ? uniqueWords.size / words.length : 0,
            repeatedWords: repeatedWords.slice(0, 10), // Top 10 repeated words
            avgWordLength: words.length > 0 ? words.reduce((sum, word) => sum + word.length, 0) / words.length : 0,
            vocabularyRichness: this.calculateVocabularyRichness(words, uniqueWords)
        };
    }

    analyzeFlow(text) {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const words = text.split(/\s+/).filter(w => w.trim().length > 0);
        
        const sentenceLengths = sentences.map(s => s.split(/\s+/).length);
        const avgSentenceLength = sentenceLengths.reduce((sum, len) => sum + len, 0) / sentenceLengths.length;
        const sentenceLengthVariation = this.calculateVariation(sentenceLengths);
        
        return {
            rhythm: this.calculateRhythmScore(sentenceLengths),
            variation: sentenceLengthVariation,
            avgSentenceLength,
            flowScore: this.calculateFlowScore(sentenceLengths, text),
            transitions: this.analyzeTransitions(sentences),
            coherence: this.analyzeCoherence(sentences)
        };
    }

    // === Helper Methods ===

    estimateAvgSyllables(words) {
        const totalSyllables = words.reduce((sum, word) => {
            return sum + this.estimateSyllables(word);
        }, 0);
        return totalSyllables / words.length;
    }

    estimateSyllables(word) {
        if (!word || word.length === 0) return 0;
        
        word = word.toLowerCase();
        let syllables = 0;
        let previousChar = '';
        
        for (let i = 0; i < word.length; i++) {
            const char = word[i];
            if ('aeiou'.includes(char) && !('aeiou'.includes(previousChar))) {
                syllables++;
            }
            previousChar = char;
        }
        
        // Handle silent 'e'
        if (word.endsWith('e') && syllables > 1) {
            syllables--;
        }
        
        return Math.max(1, syllables);
    }

    fleschToLevel(score) {
        if (score >= 90) return 'Very Easy';
        if (score >= 80) return 'Easy';
        if (score >= 70) return 'Fairly Easy';
        if (score >= 60) return 'Standard';
        if (score >= 50) return 'Fairly Difficult';
        if (score >= 30) return 'Difficult';
        return 'Very Difficult';
    }

    calculateComplexityScore(avgWordsPerSentence, avgSyllablesPerWord, uniqueWordRatio) {
        const sentenceComplexity = Math.min(avgWordsPerSentence / 20, 1); // Normalize to 0-1
        const syllableComplexity = Math.min(avgSyllablesPerWord / 3, 1); // Normalize to 0-1
        const vocabularyComplexity = uniqueWordRatio;
        
        return (sentenceComplexity + syllableComplexity + vocabularyComplexity) / 3;
    }

    calculateIndicatorScore(words, indicators) {
        const matches = words.filter(word => indicators.includes(word)).length;
        return words.length > 0 ? matches / words.length : 0;
    }

    detectUnconventionalPhrases(text) {
        // Simple heuristic for detecting creative or unconventional phrases
        const phrases = [];
        const sentences = text.split(/[.!?]+/);
        
        sentences.forEach(sentence => {
            // Look for metaphorical or creative expressions
            if (sentence.includes(' like ') || sentence.includes(' as ')) {
                phrases.push(sentence.trim());
            }
            // Look for emotional or evocative language
            if (/\b(feels?|seems?|appears?)\b/.test(sentence)) {
                phrases.push(sentence.trim());
            }
        });
        
        return phrases.slice(0, 5); // Return up to 5 phrases
    }

    // === Cache Management ===

    getCacheKey(text, options) {
        const textHash = this.simpleHash(text);
        const optionsHash = this.simpleHash(JSON.stringify(options));
        return `${textHash}_${optionsHash}`;
    }

    getFromCache(key) {
        const cached = this.analysisCache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        if (cached) {
            this.analysisCache.delete(key);
        }
        return null;
    }

    saveToCache(key, data) {
        this.analysisCache.set(key, {
            data,
            timestamp: Date.now()
        });
        
        // Clean old cache entries
        if (this.analysisCache.size > 100) {
            this.cleanCache();
        }
    }

    cleanCache() {
        const now = Date.now();
        for (const [key, value] of this.analysisCache.entries()) {
            if (now - value.timestamp > this.cacheTimeout) {
                this.analysisCache.delete(key);
            }
        }
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    }

    // === Default/Empty Return Values ===

    getEmptyAnalysis() {
        return {
            sentiment: { score: 0, magnitude: 0, tendency: 'neutral', positiveWords: 0, negativeWords: 0, confidence: 0 },
            complexity: this.getEmptyComplexityAnalysis(),
            creativity: this.getEmptyCreativityAnalysis(),
            structure: { paragraphCount: 0, sentenceCount: 0, avgSentencesPerParagraph: 0, hasIntroduction: false, hasConclusion: false, structureScore: 0 },
            vocabulary: { totalWords: 0, uniqueWords: 0, diversityRatio: 0, repeatedWords: [], avgWordLength: 0, vocabularyRichness: 0 },
            flow: { rhythm: 0, variation: 0, avgSentenceLength: 0, flowScore: 0, transitions: 0, coherence: 0 },
            timestamp: Date.now()
        };
    }

    getEmptyComplexityAnalysis() {
        return {
            fleschScore: 0,
            readingLevel: 'No content',
            avgWordsPerSentence: 0,
            avgSyllablesPerWord: 0,
            uniqueWordRatio: 0,
            complexity: 0,
            sentenceCount: 0,
            wordCount: 0
        };
    }

    getEmptyCreativityAnalysis() {
        return {
            score: 0,
            metaphorScore: 0,
            emotionalScore: 0,
            imaginativeScore: 0,
            vocabularyDiversity: 0,
            unconventionalPhrases: [],
            breakthrough: false
        };
    }

    // === Additional Helper Methods (Placeholder implementations) ===

    calculateSentimentConfidence(positive, negative, totalWords) {
        const emotionalWords = positive + negative;
        return totalWords > 0 ? emotionalWords / totalWords : 0;
    }

    hasIntroductoryStructure(text) {
        const firstParagraph = text.split(/\n\s*\n/)[0] || '';
        return firstParagraph.length > 50 && /\b(introduce|begin|start|overview)\b/i.test(firstParagraph);
    }

    hasConclusionStructure(text) {
        const lastParagraph = text.split(/\n\s*\n/).pop() || '';
        return lastParagraph.length > 30 && /\b(conclude|summary|final|end)\b/i.test(lastParagraph);
    }

    calculateStructureScore(paragraphs, sentences) {
        const hasMultipleParagraphs = paragraphs.length > 1;
        const reasonableSentenceCount = sentences.length > 2;
        const balancedStructure = paragraphs.length > 0 && sentences.length / paragraphs.length > 1;
        
        return (hasMultipleParagraphs ? 0.4 : 0) + (reasonableSentenceCount ? 0.3 : 0) + (balancedStructure ? 0.3 : 0);
    }

    calculateVocabularyRichness(words, uniqueWords) {
        if (words.length === 0) return 0;
        const diversity = uniqueWords.size / words.length;
        const lengthBonus = words.reduce((sum, word) => sum + Math.max(0, word.length - 4), 0) / words.length / 10;
        return Math.min(1, diversity + lengthBonus);
    }

    calculateVariation(values) {
        if (values.length === 0) return 0;
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        return Math.sqrt(variance);
    }

    calculateRhythmScore(sentenceLengths) {
        if (sentenceLengths.length < 2) return 0;
        const variation = this.calculateVariation(sentenceLengths);
        const mean = sentenceLengths.reduce((sum, len) => sum + len, 0) / sentenceLengths.length;
        return Math.max(0, 1 - (variation / mean)); // Lower variation = better rhythm
    }

    calculateFlowScore(sentenceLengths, text) {
        const rhythmScore = this.calculateRhythmScore(sentenceLengths);
        const transitionScore = this.analyzeTransitions(text.split(/[.!?]+/));
        return (rhythmScore + transitionScore) / 2;
    }

    analyzeTransitions(sentences) {
        if (sentences.length < 2) return 0;
        
        const transitionWords = ['however', 'therefore', 'moreover', 'furthermore', 'additionally', 'consequently', 'meanwhile', 'nevertheless'];
        let transitionCount = 0;
        
        sentences.forEach(sentence => {
            const words = sentence.toLowerCase().split(/\s+/);
            if (words.some(word => transitionWords.includes(word))) {
                transitionCount++;
            }
        });
        
        return transitionCount / sentences.length;
    }

    analyzeCoherence(sentences) {
        // Simple coherence measure based on repeated concepts
        if (sentences.length < 2) return 1;
        
        const allWords = sentences.join(' ').toLowerCase().split(/\W+/).filter(w => w.length > 3);
        const wordFreq = new Map();
        allWords.forEach(word => wordFreq.set(word, (wordFreq.get(word) || 0) + 1));
        
        const repeatedConcepts = Array.from(wordFreq.values()).filter(count => count > 1).length;
        const totalConcepts = wordFreq.size;
        
        return totalConcepts > 0 ? repeatedConcepts / totalConcepts : 0;
    }
}

// Make available globally
window.TextAnalysisEngine = TextAnalysisEngine;
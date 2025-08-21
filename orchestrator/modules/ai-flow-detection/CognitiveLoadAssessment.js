// === Cognitive Load Assessment ===
// Analyzes mental effort and complexity indicators in writing for flow detection

class CognitiveLoadAssessment {
    constructor() {
        this.cognitiveLoad = {
            sentenceComplexity: [],
            vocabularyDemand: [],
            conceptualDepth: [],
            revisionRate: 0,
            currentLoad: 0
        };

        this.analysisWindow = 300000; // 5 minutes for load analysis
        this.maxHistorySize = 50;
        
        // Complexity indicators
        this.complexityMetrics = {
            sentenceLength: { threshold: 20, weight: 0.2 },
            subordinateClauses: { threshold: 2, weight: 0.3 },
            vocabularyComplexity: { threshold: 0.6, weight: 0.3 },
            punctuationDensity: { threshold: 0.1, weight: 0.2 }
        };
    }

    // Analyze cognitive load from text sample
    assessCognitiveLoad(textSample, context = {}) {
        if (!textSample || textSample.length < 10) return null;

        const analysis = {
            timestamp: Date.now(),
            sentenceComplexity: this.analyzeSentenceComplexity(textSample),
            vocabularyDemand: this.analyzeVocabularyDemand(textSample),
            conceptualDepth: this.analyzeConceptualDepth(textSample, context),
            overallLoad: 0
        };

        // Calculate overall cognitive load
        analysis.overallLoad = this.calculateOverallLoad(analysis);

        // Update history
        this.updateLoadHistory(analysis);

        return analysis;
    }

    // Analyze sentence complexity
    analyzeSentenceComplexity(text) {
        const sentences = this.extractSentences(text);
        if (sentences.length === 0) return { score: 0, indicators: [] };

        const complexityScores = sentences.map(sentence => {
            return this.calculateSentenceComplexity(sentence);
        });

        const avgComplexity = complexityScores.reduce((sum, score) => sum + score.score, 0) / complexityScores.length;
        const indicators = this.extractComplexityIndicators(complexityScores);

        this.cognitiveLoad.sentenceComplexity.push({
            timestamp: Date.now(),
            score: avgComplexity,
            sentenceCount: sentences.length,
            indicators
        });

        this.maintainHistorySize(this.cognitiveLoad.sentenceComplexity);

        return { score: avgComplexity, indicators, sentenceCount: sentences.length };
    }

    // Calculate complexity of individual sentence
    calculateSentenceComplexity(sentence) {
        const words = sentence.split(/\s+/).filter(word => word.length > 0);
        const length = words.length;
        
        // Length complexity
        const lengthScore = Math.min(1, length / 25); // Normalize to 25 words
        
        // Subordinate clauses (rough heuristic)
        const subordinateMarkers = /\b(that|which|who|whom|whose|when|where|while|although|because|since|if|unless|until)\b/gi;
        const subordinateClauses = (sentence.match(subordinateMarkers) || []).length;
        const clauseScore = Math.min(1, subordinateClauses / 3);
        
        // Punctuation complexity
        const punctuation = (sentence.match(/[,:;()"-]/g) || []).length;
        const punctuationScore = Math.min(1, punctuation / length * 10);
        
        // Vocabulary complexity (average word length)
        const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
        const vocabScore = Math.min(1, avgWordLength / 8);

        const totalScore = (lengthScore * 0.3) + (clauseScore * 0.3) + (punctuationScore * 0.2) + (vocabScore * 0.2);

        return {
            score: totalScore,
            indicators: {
                length: lengthScore,
                clauses: clauseScore,
                punctuation: punctuationScore,
                vocabulary: vocabScore
            }
        };
    }

    // Analyze vocabulary demand
    analyzeVocabularyDemand(text) {
        const words = text.toLowerCase().split(/\s+/).filter(word => word.length > 0);
        if (words.length === 0) return { score: 0, indicators: {} };

        // Unique word ratio
        const uniqueWords = new Set(words);
        const uniqueRatio = uniqueWords.size / words.length;

        // Average word length
        const avgLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;

        // Complex words (> 6 characters)
        const complexWords = words.filter(word => word.length > 6).length;
        const complexRatio = complexWords / words.length;

        // Technical/academic terms (heuristic)
        const technicalPattern = /\b\w{8,}\b/g;
        const technicalTerms = (text.match(technicalPattern) || []).length;
        const technicalRatio = technicalTerms / words.length;

        const score = (uniqueRatio * 0.25) + (avgLength / 10 * 0.25) + (complexRatio * 0.3) + (technicalRatio * 0.2);

        const analysis = {
            score: Math.min(1, score),
            indicators: {
                uniqueRatio,
                avgLength,
                complexRatio,
                technicalRatio,
                wordCount: words.length
            }
        };

        this.cognitiveLoad.vocabularyDemand.push({
            timestamp: Date.now(),
            ...analysis
        });

        this.maintainHistorySize(this.cognitiveLoad.vocabularyDemand);

        return analysis;
    }

    // Analyze conceptual depth (basic heuristics)
    analyzeConceptualDepth(text, context = {}) {
        // Abstract concept indicators
        const abstractTerms = /\b(concept|theory|principle|framework|methodology|paradigm|philosophy|ideology|perspective|approach|dimension|aspect|factor|element|component|structure|system|process|mechanism|phenomenon|relationship|correlation|implication|significance|relevance)\b/gi;
        const abstractCount = (text.match(abstractTerms) || []).length;
        
        // Logical connectors indicating complex reasoning
        const logicalConnectors = /\b(therefore|however|moreover|furthermore|consequently|nevertheless|nonetheless|alternatively|specifically|particularly|essentially|fundamentally|ultimately|indeed|thus|hence|whereas|although|despite|regardless|provided|assuming)\b/gi;
        const connectorCount = (text.match(logicalConnectors) || []).length;
        
        // Question words indicating exploration
        const explorationWords = /\b(why|how|what|whether|which|where|when|whom|whose)\b/gi;
        const explorationCount = (text.match(explorationWords) || []).length;

        const wordCount = text.split(/\s+/).length;
        
        const abstractScore = Math.min(1, abstractCount / wordCount * 20);
        const logicalScore = Math.min(1, connectorCount / wordCount * 30);
        const explorationScore = Math.min(1, explorationCount / wordCount * 40);
        
        const score = (abstractScore * 0.4) + (logicalScore * 0.4) + (explorationScore * 0.2);

        const analysis = {
            score,
            indicators: {
                abstractTerms: abstractCount,
                logicalConnectors: connectorCount,
                explorationWords: explorationCount,
                abstractScore,
                logicalScore,
                explorationScore
            }
        };

        this.cognitiveLoad.conceptualDepth.push({
            timestamp: Date.now(),
            ...analysis
        });

        this.maintainHistorySize(this.cognitiveLoad.conceptualDepth);

        return analysis;
    }

    // Calculate overall cognitive load
    calculateOverallLoad(analysis) {
        const weights = {
            sentenceComplexity: 0.3,
            vocabularyDemand: 0.3,
            conceptualDepth: 0.4
        };

        const load = 
            (analysis.sentenceComplexity.score * weights.sentenceComplexity) +
            (analysis.vocabularyDemand.score * weights.vocabularyDemand) +
            (analysis.conceptualDepth.score * weights.conceptualDepth);

        this.cognitiveLoad.currentLoad = load;
        return load;
    }

    // Update cognitive load history and calculate trends
    updateLoadHistory(analysis) {
        // Calculate revision rate if we have previous analyses
        this.updateRevisionRate();
        
        // Remove old analyses outside time window
        const cutoff = Date.now() - this.analysisWindow;
        ['sentenceComplexity', 'vocabularyDemand', 'conceptualDepth'].forEach(key => {
            this.cognitiveLoad[key] = this.cognitiveLoad[key].filter(
                item => item.timestamp >= cutoff
            );
        });
    }

    // Update revision rate based on load fluctuations
    updateRevisionRate() {
        const recentLoads = this.getRecentLoadScores(10); // Last 10 analyses
        if (recentLoads.length < 3) return;

        // Calculate fluctuation rate as proxy for revision activity
        let fluctuations = 0;
        for (let i = 1; i < recentLoads.length; i++) {
            const change = Math.abs(recentLoads[i] - recentLoads[i-1]);
            if (change > 0.2) { // Significant change threshold
                fluctuations++;
            }
        }

        this.cognitiveLoad.revisionRate = fluctuations / (recentLoads.length - 1);
    }

    // Extract sentences from text
    extractSentences(text) {
        return text.split(/[.!?]+/)
                  .map(sentence => sentence.trim())
                  .filter(sentence => sentence.length > 0);
    }

    // Extract complexity indicators summary
    extractComplexityIndicators(complexityScores) {
        const indicators = {
            highComplexity: complexityScores.filter(s => s.score > 0.7).length,
            mediumComplexity: complexityScores.filter(s => s.score >= 0.4 && s.score <= 0.7).length,
            lowComplexity: complexityScores.filter(s => s.score < 0.4).length
        };

        return indicators;
    }

    // Get recent load scores
    getRecentLoadScores(count = 5) {
        const allLoads = [
            ...this.cognitiveLoad.sentenceComplexity.map(item => item.score),
            ...this.cognitiveLoad.vocabularyDemand.map(item => item.score),
            ...this.cognitiveLoad.conceptualDepth.map(item => item.score)
        ].sort((a, b) => b.timestamp - a.timestamp);

        return allLoads.slice(0, count);
    }

    // Maintain maximum history size
    maintainHistorySize(array) {
        if (array.length > this.maxHistorySize) {
            array.splice(0, array.length - this.maxHistorySize);
        }
    }

    // Get flow-relevant load metrics
    getFlowMetrics() {
        const currentLoad = this.cognitiveLoad.currentLoad;
        const revisionRate = this.cognitiveLoad.revisionRate;
        
        // Optimal cognitive load for flow is moderate (0.3-0.7)
        let loadScore = 0;
        if (currentLoad >= 0.3 && currentLoad <= 0.7) {
            loadScore = 1 - Math.abs(currentLoad - 0.5) * 2; // Peak at 0.5
        } else {
            loadScore = Math.max(0, 1 - Math.abs(currentLoad - 0.5) * 1.5);
        }

        // Lower revision rate indicates flow
        const revisionScore = Math.max(0, 1 - revisionRate);

        return {
            loadScore,
            revisionScore,
            currentLoad,
            revisionRate,
            optimalLoad: currentLoad >= 0.3 && currentLoad <= 0.7,
            lowRevision: revisionRate < 0.3
        };
    }

    // Get current assessment state
    getState() {
        return {
            ...this.cognitiveLoad,
            flowMetrics: this.getFlowMetrics(),
            analysisWindow: this.analysisWindow
        };
    }

    // Reset cognitive load assessment
    reset() {
        this.cognitiveLoad = {
            sentenceComplexity: [],
            vocabularyDemand: [],
            conceptualDepth: [],
            revisionRate: 0,
            currentLoad: 0
        };
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.CognitiveLoadAssessment = CognitiveLoadAssessment;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CognitiveLoadAssessment;
}
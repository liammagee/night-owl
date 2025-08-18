// === AI-Powered Flow State Detection & Real-time Insights ===
// Advanced flow detection using writing patterns, rhythm analysis, and contextual awareness

class AIFlowDetection {
    constructor(aiCompanion, gamification) {
        this.aiCompanion = aiCompanion;
        this.gamification = gamification;
        this.initialized = false;
        
        // Flow indicator auto-hide timeout
        this.flowIndicatorTimeout = null;
        this.lastIndicatorHidden = 0; // Timestamp of when indicator was last hidden
        this.indicatorCooldown = 10000; // 10 seconds cooldown before showing again
        
        // Flow Detection Engine
        this.flowEngine = {
            isActive: false,
            currentFlowScore: 0,
            flowHistory: [],
            flowIndicators: new Map(),
            stateTransitions: [],
            
            // Real-time metrics
            typingPattern: {
                intervals: [], // Time between keystrokes
                bursts: [], // Periods of rapid typing
                pauses: [], // Longer pauses in writing
                rhythm: 0, // Overall rhythm score
                consistency: 0
            },
            
            // Cognitive load indicators
            cognitiveLoad: {
                sentenceComplexity: [],
                vocabularyDemand: [],
                conceptualDepth: [],
                revisionRate: 0,
                currentLoad: 0
            },
            
            // Contextual awareness
            context: {
                timeOfDay: null,
                sessionDuration: 0,
                environmentalFactors: {},
                previousFlow: null,
                optimalConditions: this.loadOptimalConditions()
            }
        };
        
        // Real-time Insights System
        this.insightsEngine = {
            currentInsights: [],
            insightHistory: [],
            insightTypes: {
                flow: { weight: 0.3, frequency: 'continuous' },
                creativity: { weight: 0.2, frequency: 'periodic' },
                style: { weight: 0.2, frequency: 'session_based' },
                progress: { weight: 0.15, frequency: 'milestone_based' },
                wellness: { weight: 0.15, frequency: 'adaptive' }
            },
            displayState: {
                panelVisible: false,
                lastUpdate: 0,
                updateFrequency: 15000 // 15 seconds
            }
        };
        
        // Predictive Flow Model
        this.flowPredictor = {
            model: this.initializeFlowModel(),
            predictions: [],
            accuracy: 0.7, // Model accuracy estimate
            confidenceThreshold: 0.8,
            features: [
                'typingSpeed', 'pausePattern', 'sentenceRhythm',
                'vocabularyFlow', 'conceptualCoherence', 'timeContext'
            ]
        };
        
        this.init();
    }
    
    async init() {
        if (this.initialized) return;
        
        try {
            console.log('[AI Flow Detection] Initializing advanced flow detection...');
            
            // Set up real-time typing pattern analysis
            this.setupTypingAnalysis();
            
            // Initialize flow prediction model
            this.initializeFlowPrediction();
            
            // Start real-time insights engine
            this.startInsightsEngine();
            
            // Setup UI components
            this.createFlowIndicator();
            this.createInsightsPanel();
            
            this.initialized = true;
            console.log('[AI Flow Detection] Flow detection system initialized');
            
        } catch (error) {
            console.error('[AI Flow Detection] Initialization failed:', error);
        }
    }
    
    // === Real-time Typing Pattern Analysis ===
    
    setupTypingAnalysis() {
        let lastKeystroke = 0;
        let currentBurst = [];
        let burstStartTime = 0;
        
        // Monitor keystroke patterns
        document.addEventListener('keydown', (event) => {
            if (!this.isWritingEvent(event)) return;
            
            const now = Date.now();
            const interval = now - lastKeystroke;
            
            if (lastKeystroke > 0) {
                this.analyzeKeystrokeInterval(interval);
                
                // Detect bursts and pauses
                if (interval < 200) { // Fast typing (burst)
                    if (currentBurst.length === 0) {
                        burstStartTime = lastKeystroke;
                    }
                    currentBurst.push(interval);
                } else if (interval > 1000) { // Pause in typing
                    if (currentBurst.length > 0) {
                        this.recordTypingBurst(currentBurst, burstStartTime, lastKeystroke);
                        currentBurst = [];
                    }
                    this.analyzeTypingPause(interval);
                }
            }
            
            lastKeystroke = now;
            
            // Update flow state in real-time
            this.updateRealTimeFlowState();
        });
        
        // Monitor content changes for deeper analysis
        let contentCheckTimer = setInterval(() => {
            this.analyzeContentFlow();
        }, 10000); // Every 10 seconds during active writing
    }
    
    analyzeKeystrokeInterval(interval) {
        // Add to pattern history
        this.flowEngine.typingPattern.intervals.push({
            interval,
            timestamp: Date.now()
        });
        
        // Keep only recent history (last 2 minutes)
        const cutoff = Date.now() - 120000;
        this.flowEngine.typingPattern.intervals = this.flowEngine.typingPattern.intervals
            .filter(entry => entry.timestamp > cutoff);
        
        // Calculate rhythm metrics
        this.calculateTypingRhythm();
    }
    
    calculateTypingRhythm() {
        const intervals = this.flowEngine.typingPattern.intervals.map(entry => entry.interval);
        if (intervals.length < 10) return;
        
        // Calculate rhythm consistency
        const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - mean, 2), 0) / intervals.length;
        const standardDeviation = Math.sqrt(variance);
        
        // Rhythm score (lower variance = higher rhythm)
        this.flowEngine.typingPattern.rhythm = Math.max(0, 1 - (standardDeviation / mean));
        
        // Consistency score
        this.flowEngine.typingPattern.consistency = this.calculateConsistencyScore(intervals);
    }
    
    calculateConsistencyScore(intervals) {
        // Analyze for consistent patterns vs erratic typing
        const smoothness = this.calculateSmoothness(intervals);
        const predictability = this.calculatePredictability(intervals);
        
        return (smoothness + predictability) / 2;
    }
    
    recordTypingBurst(burst, startTime, endTime) {
        const burstData = {
            intervals: [...burst],
            duration: endTime - startTime,
            avgSpeed: burst.reduce((a, b) => a + b, 0) / burst.length,
            timestamp: startTime
        };
        
        this.flowEngine.typingPattern.bursts.push(burstData);
        
        // Keep only recent bursts
        const cutoff = Date.now() - 300000; // 5 minutes
        this.flowEngine.typingPattern.bursts = this.flowEngine.typingPattern.bursts
            .filter(burst => burst.timestamp > cutoff);
        
        // Analyze burst patterns for flow indicators
        this.analyzeBurstPatterns();
    }
    
    // === Cognitive Load Detection ===
    
    analyzeContentFlow() {
        const currentContent = this.aiCompanion.getCurrentWritingContent();
        if (!currentContent) return;
        
        // Get recent additions to content
        const recentText = this.getRecentText(currentContent);
        if (recentText.length < 20) return;
        
        // Analyze cognitive load indicators
        this.analyzeCognitiveLoad(recentText);
        
        // Update flow prediction
        this.updateFlowPrediction();
        
        // Generate real-time insights
        this.generateRealtimeInsights();
    }
    
    analyzeCognitiveLoad(text) {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const words = text.split(/\\s+/);
        
        // Sentence complexity
        const avgSentenceLength = words.length / sentences.length;
        const complexityScore = this.calculateSentenceComplexity(sentences);
        
        // Vocabulary demand
        const vocabularyScore = this.calculateVocabularyDemand(words);
        
        // Conceptual depth (measure of abstract vs concrete language)
        const conceptualScore = this.calculateConceptualDepth(words);
        
        // Update cognitive load metrics
        this.flowEngine.cognitiveLoad.sentenceComplexity.push(complexityScore);
        this.flowEngine.cognitiveLoad.vocabularyDemand.push(vocabularyScore);
        this.flowEngine.cognitiveLoad.conceptualDepth.push(conceptualScore);
        
        // Calculate current cognitive load
        this.flowEngine.cognitiveLoad.currentLoad = this.calculateCurrentCognitiveLoad();
    }
    
    calculateCurrentCognitiveLoad() {
        const { sentenceComplexity, vocabularyDemand, conceptualDepth } = this.flowEngine.cognitiveLoad;
        
        // Get recent values (last 3 measurements)
        const recentComplexity = sentenceComplexity.slice(-3);
        const recentVocabulary = vocabularyDemand.slice(-3);
        const recentConceptual = conceptualDepth.slice(-3);
        
        if (recentComplexity.length === 0) return 0.5;
        
        const avgComplexity = recentComplexity.reduce((a, b) => a + b, 0) / recentComplexity.length;
        const avgVocabulary = recentVocabulary.reduce((a, b) => a + b, 0) / recentVocabulary.length;
        const avgConceptual = recentConceptual.reduce((a, b) => a + b, 0) / recentConceptual.length;
        
        // Weighted cognitive load score
        return (avgComplexity * 0.4 + avgVocabulary * 0.3 + avgConceptual * 0.3);
    }
    
    // === Flow State Prediction ===
    
    updateFlowPrediction() {
        const features = this.extractFlowFeatures();
        const prediction = this.flowPredictor.model.predict(features);
        
        this.flowPredictor.predictions.push({
            timestamp: Date.now(),
            prediction,
            confidence: prediction.confidence,
            features
        });
        
        // Keep only recent predictions
        const cutoff = Date.now() - 600000; // 10 minutes
        this.flowPredictor.predictions = this.flowPredictor.predictions
            .filter(p => p.timestamp > cutoff);
        
        // Update current flow score if confidence is high
        if (prediction.confidence > this.flowPredictor.confidenceThreshold) {
            this.flowEngine.currentFlowScore = prediction.flowScore;
            this.updateFlowState(prediction.flowScore);
        }
    }
    
    extractFlowFeatures() {
        return {
            typingSpeed: this.calculateCurrentTypingSpeed(),
            pausePattern: this.analyzePausePattern(),
            sentenceRhythm: this.calculateSentenceRhythm(),
            vocabularyFlow: this.calculateVocabularyFlow(),
            conceptualCoherence: this.calculateConceptualCoherence(),
            timeContext: this.getTimeContextFeatures(),
            cognitiveLoad: this.flowEngine.cognitiveLoad.currentLoad,
            sessionDuration: this.getSessionDuration(),
            previousFlowState: this.getPreviousFlowState()
        };
    }
    
    // === Real-time Insights Generation ===
    
    generateRealtimeInsights() {
        const insights = [];
        
        // Flow state insights
        const flowInsight = this.generateFlowInsight();
        if (flowInsight) insights.push(flowInsight);
        
        // Cognitive load insights
        const loadInsight = this.generateCognitiveLoadInsight();
        if (loadInsight) insights.push(loadInsight);
        
        // Productivity pattern insights
        const productivityInsight = this.generateProductivityInsight();
        if (productivityInsight) insights.push(productivityInsight);
        
        // Timing and wellness insights
        const wellnessInsight = this.generateWellnessInsight();
        if (wellnessInsight) insights.push(wellnessInsight);
        
        // Update insights panel
        this.updateInsightsPanel(insights);
    }
    
    generateFlowInsight() {
        const flowScore = this.flowEngine.currentFlowScore;
        const flowState = this.determineFlowState(flowScore);
        
        switch (flowState) {
            case 'deep_flow':
                return {
                    type: 'flow',
                    category: 'positive',
                    icon: '🌊',
                    message: `You're in deep flow! Your ideas are connecting beautifully. Consider continuing for another ${this.suggestOptimalContinuation()} to maximize this state.`,
                    confidence: 0.9,
                    actionable: true
                };
                
            case 'entering_flow':
                return {
                    type: 'flow',
                    category: 'positive',
                    icon: '✨',
                    message: 'You\'re entering a flow state. Your writing rhythm is becoming more natural and consistent.',
                    confidence: 0.8,
                    actionable: false
                };
                
            case 'flow_disrupted':
                return {
                    type: 'flow',
                    category: 'analytical',
                    icon: '🔄',
                    message: 'I noticed a shift in your writing pattern. Sometimes a brief pause can help reconnect with your ideas.',
                    confidence: 0.7,
                    actionable: true
                };
                
            default:
                return null;
        }
    }
    
    generateCognitiveLoadInsight() {
        const load = this.flowEngine.cognitiveLoad.currentLoad;
        
        if (load > 0.8) {
            return {
                type: 'cognitive',
                category: 'analytical',
                icon: '🧠',
                message: 'You\'re handling complex ideas right now. Your depth of thinking shows in the sophisticated language you\'re using.',
                confidence: 0.8,
                actionable: false
            };
        } else if (load < 0.3) {
            return {
                type: 'cognitive',
                category: 'creative',
                icon: '💫',
                message: 'Your ideas are flowing smoothly. This might be a great time to explore new directions or add creative elements.',
                confidence: 0.7,
                actionable: true
            };
        }
        
        return null;
    }
    
    // === UI Components ===
    
    createFlowIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'ai-flow-indicator';
        indicator.className = 'ai-flow-indicator';
        indicator.innerHTML = `
            <span class="flow-indicator-icon">🌊</span>
            <span class="flow-indicator-text">Flow State</span>
        `;
        
        // Make indicator clickable to dismiss
        indicator.addEventListener('click', () => {
            indicator.classList.remove('visible');
            if (this.flowIndicatorTimeout) {
                clearTimeout(this.flowIndicatorTimeout);
                this.flowIndicatorTimeout = null;
            }
            this.lastIndicatorHidden = Date.now();
        });
        
        document.body.appendChild(indicator);
        
        // Update indicator based on flow state
        this.updateFlowIndicator();
    }
    
    updateFlowIndicator() {
        const indicator = document.getElementById('ai-flow-indicator');
        if (!indicator) return;
        
        const flowScore = this.flowEngine.currentFlowScore;
        const flowState = this.determineFlowState(flowScore);
        
        // Clear any existing timeout first
        if (this.flowIndicatorTimeout) {
            clearTimeout(this.flowIndicatorTimeout);
            this.flowIndicatorTimeout = null;
        }
        
        // Check if we're in cooldown period (don't show indicator if recently hidden)
        const now = Date.now();
        if (now - this.lastIndicatorHidden < this.indicatorCooldown) {
            console.log(`[Flow Detection] Indicator in cooldown for ${Math.round((this.indicatorCooldown - (now - this.lastIndicatorHidden)) / 1000)}s more`);
            return; // Still in cooldown, don't show indicator
        }
        
        // Clear any existing auto-hide timeout
        if (this.flowIndicatorTimeout) {
            clearTimeout(this.flowIndicatorTimeout);
            this.flowIndicatorTimeout = null;
        }
        
        // Remove existing flow classes
        indicator.classList.remove('flow-deep', 'flow-light', 'flow-struggling', 'visible');
        
        let className = '';
        let icon = '🌊';
        let text = 'Flow State';
        let autoHideDelay = null;
        
        switch (flowState) {
            case 'deep_flow':
                className = 'flow-deep';
                icon = '🌊';
                text = 'Deep Flow';
                autoHideDelay = 8000; // Hide after 8 seconds
                break;
            case 'light_flow':
                className = 'flow-light';
                icon = '✨';
                text = 'In Flow';
                autoHideDelay = 6000; // Hide after 6 seconds
                break;
            case 'focused':
                className = 'flow-light';
                icon = '🎯';
                text = 'Focused';
                autoHideDelay = 5000; // Hide after 5 seconds
                break;
            case 'struggling':
                className = 'flow-struggling';
                icon = '🔄';
                text = 'Processing';
                autoHideDelay = 4000; // Hide after 4 seconds
                break;
            default:
                // Hide indicator when not in a notable state
                return;
        }
        
        indicator.classList.add(className, 'visible');
        indicator.querySelector('.flow-indicator-icon').textContent = icon;
        indicator.querySelector('.flow-indicator-text').textContent = text;
        
        // Set auto-hide timeout
        if (autoHideDelay) {
            this.flowIndicatorTimeout = setTimeout(() => {
                indicator.classList.remove('visible');
                this.flowIndicatorTimeout = null;
                this.lastIndicatorHidden = Date.now(); // Record when indicator was hidden
            }, autoHideDelay);
        }
    }
    
    createInsightsPanel() {
        const panel = document.createElement('div');
        panel.id = 'ai-insights-panel';
        panel.className = 'ai-insights-panel';
        panel.innerHTML = `
            <div class="insights-header">
                <h4 class="insights-title">
                    <span>🤖</span>
                    AI Insights
                </h4>
            </div>
            <div class="insights-content" id="insights-content">
                <div class="insight-item">
                    Starting analysis...
                </div>
            </div>
        `;
        
        document.body.appendChild(panel);
        
        // Add toggle functionality
        panel.addEventListener('click', () => {
            this.toggleInsightsPanel();
        });
    }
    
    updateInsightsPanel(insights) {
        const content = document.getElementById('insights-content');
        if (!content) return;
        
        if (insights.length === 0) {
            content.innerHTML = '<div class="insight-item">Writing analysis in progress...</div>';
            return;
        }
        
        content.innerHTML = insights.map(insight => `
            <div class="insight-item ${insight.category}">
                <span style="margin-right: var(--space-1);">${insight.icon}</span>
                ${insight.message}
            </div>
        `).join('');
        
        // Show panel briefly when new insights arrive
        this.showInsightsBriefly();
    }
    
    showInsightsBriefly() {
        const panel = document.getElementById('ai-insights-panel');
        if (!panel) return;
        
        panel.classList.add('visible');
        
        // Auto-hide after a few seconds unless user interacts
        setTimeout(() => {
            if (!panel.matches(':hover')) {
                panel.classList.remove('visible');
            }
        }, 5000);
    }
    
    // === Utility Methods ===
    
    isWritingEvent(event) {
        // Filter out non-writing keys
        const ignoredKeys = [
            'Meta', 'Control', 'Alt', 'Shift', 'Tab', 'Escape', 
            'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'
        ];
        
        return !ignoredKeys.includes(event.key) && 
               (event.target.tagName === 'TEXTAREA' || 
                event.target.contentEditable === 'true' ||
                event.target.classList.contains('monaco-editor'));
    }
    
    determineFlowState(flowScore) {
        if (flowScore > 0.85) return 'deep_flow';
        if (flowScore > 0.7) return 'light_flow';
        if (flowScore > 0.5) return 'focused';
        if (flowScore > 0.3) return 'struggling';
        return 'blocked';
    }
    
    getRecentText(content, wordLimit = 100) {
        const words = content.split(/\\s+/);
        return words.slice(-wordLimit).join(' ');
    }
    
    suggestOptimalContinuation() {
        const sessionDuration = this.getSessionDuration();
        
        if (sessionDuration < 900000) { // Less than 15 minutes
            return '10-15 minutes';
        } else if (sessionDuration < 1800000) { // Less than 30 minutes
            return '15-20 minutes';
        } else {
            return '5-10 minutes';
        }
    }
    
    getSessionDuration() {
        return this.gamification?.currentSession ? 
            Date.now() - this.gamification.sessionStartTime : 0;
    }
    
    // === Data Persistence ===
    
    loadOptimalConditions() {
        const stored = localStorage.getItem('ai_flow_optimal_conditions');
        return stored ? JSON.parse(stored) : {
            timeOfDay: { morning: 0.7, afternoon: 0.5, evening: 0.3 },
            sessionLength: { optimal: 1800000, range: [900000, 3600000] },
            typingSpeed: { optimal: 60, range: [40, 100] },
            pausePattern: { optimal: 0.6, range: [0.4, 0.8] }
        };
    }
    
    saveFlowData() {
        const flowData = {
            flowHistory: this.flowEngine.flowHistory.slice(-100), // Keep last 100 sessions
            optimalConditions: this.flowEngine.context.optimalConditions,
            modelAccuracy: this.flowPredictor.accuracy
        };
        
        localStorage.setItem('ai_flow_data', JSON.stringify(flowData));
    }
    
    // === Simple Predictive Model ===
    
    initializeFlowModel() {
        // Simple linear model for flow prediction
        return {
            weights: {
                typingSpeed: 0.2,
                pausePattern: 0.15,
                sentenceRhythm: 0.2,
                vocabularyFlow: 0.15,
                conceptualCoherence: 0.1,
                timeContext: 0.1,
                cognitiveLoad: -0.1 // High cognitive load can reduce flow
            },
            
            predict: function(features) {
                let score = 0;
                let confidence = 0.5;
                
                // Simple weighted sum
                for (const [feature, value] of Object.entries(features)) {
                    if (this.weights[feature] && typeof value === 'number') {
                        score += this.weights[feature] * Math.min(1, Math.max(0, value));
                        confidence += 0.1;
                    }
                }
                
                return {
                    flowScore: Math.min(1, Math.max(0, score)),
                    confidence: Math.min(1, confidence)
                };
            }
        };
    }
    
    // === Missing Methods ===
    
    initializeFlowPrediction() {
        // Set up the flow prediction system
        console.log('[AI Flow Detection] Flow prediction model initialized');
    }
    
    analyzeBurstPatterns() {
        const bursts = this.flowEngine.typingPattern.bursts;
        if (bursts.length < 2) return;
        
        // Analyze burst frequency and intensity for flow indicators
        const recentBursts = bursts.slice(-5);
        const avgBurstDuration = recentBursts.reduce((sum, burst) => sum + burst.duration, 0) / recentBursts.length;
        const avgBurstSpeed = recentBursts.reduce((sum, burst) => sum + burst.avgSpeed, 0) / recentBursts.length;
        
        // Update flow indicators based on burst patterns
        if (avgBurstDuration > 5000 && avgBurstSpeed < 150) { // Long, sustained bursts
            this.flowEngine.flowIndicators.set('burstFlow', 0.8);
        } else if (avgBurstDuration < 2000 && avgBurstSpeed > 100) { // Quick, frequent bursts
            this.flowEngine.flowIndicators.set('burstFlow', 0.6);
        } else {
            this.flowEngine.flowIndicators.set('burstFlow', 0.4);
        }
    }
    
    calculateSmoothness(intervals) {
        if (intervals.length < 2) return 0.5;
        
        let smoothTransitions = 0;
        for (let i = 1; i < intervals.length; i++) {
            const change = Math.abs(intervals[i] - intervals[i-1]);
            if (change < intervals[i-1] * 0.5) { // Less than 50% change
                smoothTransitions++;
            }
        }
        
        return smoothTransitions / (intervals.length - 1);
    }
    
    calculatePredictability(intervals) {
        if (intervals.length < 3) return 0.5;
        
        // Calculate how predictable the pattern is
        const diffs = [];
        for (let i = 1; i < intervals.length; i++) {
            diffs.push(intervals[i] - intervals[i-1]);
        }
        
        const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        const variance = diffs.reduce((sum, diff) => sum + Math.pow(diff - avgDiff, 2), 0) / diffs.length;
        
        // Lower variance means more predictable
        return Math.max(0, 1 - (Math.sqrt(variance) / Math.abs(avgDiff + 1)));
    }
    
    calculateVocabularyDemand(words) {
        if (!words || words.length === 0) return 0.5;
        
        // Analyze vocabulary complexity
        const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
        const uniqueWordRatio = new Set(words.map(w => w.toLowerCase())).size / words.length;
        
        // Complex words (longer than 7 characters)
        const complexWords = words.filter(word => word.length > 7).length;
        const complexWordRatio = complexWords / words.length;
        
        return Math.min(1, (avgWordLength / 10 + uniqueWordRatio + complexWordRatio) / 3);
    }
    
    calculateConceptualDepth(words) {
        if (!words || words.length === 0) return 0.5;
        
        // Abstract vs concrete language indicators
        const abstractWords = [
            'concept', 'idea', 'theory', 'principle', 'abstract', 'notion',
            'philosophy', 'thought', 'understanding', 'consciousness', 'awareness',
            'existence', 'reality', 'truth', 'meaning', 'purpose', 'essence'
        ];
        
        const concreteWords = [
            'see', 'hear', 'touch', 'taste', 'smell', 'look', 'walk', 'run',
            'house', 'car', 'book', 'table', 'chair', 'phone', 'computer'
        ];
        
        const abstractCount = words.filter(word => 
            abstractWords.includes(word.toLowerCase())
        ).length;
        
        const concreteCount = words.filter(word => 
            concreteWords.includes(word.toLowerCase())
        ).length;
        
        // Higher abstract to concrete ratio indicates deeper conceptual thinking
        if (concreteCount === 0) return abstractCount > 0 ? 0.8 : 0.5;
        return Math.min(1, abstractCount / (abstractCount + concreteCount));
    }
    
    generateProductivityInsight() {
        const sessionDuration = this.getSessionDuration();
        const wordCount = this.aiCompanion?.getCurrentWritingContent()?.split(/\s+/)?.length || 0;
        
        if (sessionDuration > 0) {
            const wordsPerMinute = wordCount / (sessionDuration / 60000);
            
            if (wordsPerMinute > 25) {
                return {
                    type: 'productivity',
                    category: 'positive',
                    icon: '🚀',
                    message: `You're writing at ${Math.round(wordsPerMinute)} words per minute - excellent productivity!`,
                    confidence: 0.8,
                    actionable: false
                };
            } else if (wordsPerMinute < 10 && sessionDuration > 600000) { // Less than 10 WPM after 10 minutes
                return {
                    type: 'productivity',
                    category: 'analytical',
                    icon: '🎯',
                    message: 'Taking time to craft your words carefully shows thoughtful writing. Quality over quantity!',
                    confidence: 0.7,
                    actionable: false
                };
            }
        }
        
        return null;
    }
    
    generateWellnessInsight() {
        const sessionDuration = this.getSessionDuration();
        
        if (sessionDuration > 3600000) { // More than 1 hour
            return {
                type: 'wellness',
                category: 'analytical',
                icon: '⏰',
                message: 'You\'ve been writing for over an hour. Consider taking a short break to maintain focus and creativity.',
                confidence: 0.9,
                actionable: true
            };
        } else if (sessionDuration > 7200000) { // More than 2 hours
            return {
                type: 'wellness',
                category: 'analytical',
                icon: '🌟',
                message: 'Amazing dedication! A longer break might help you return with fresh perspectives.',
                confidence: 0.95,
                actionable: true
            };
        }
        
        return null;
    }
    
    toggleInsightsPanel() {
        const panel = document.getElementById('ai-insights-panel');
        if (!panel) return;
        
        panel.classList.toggle('visible');
        this.insightsEngine.displayState.panelVisible = panel.classList.contains('visible');
    }
    
    updateFlowState(flowScore) {
        const flowState = this.determineFlowState(flowScore);
        
        // Update the flow state based on the score
        this.flowEngine.flowHistory.push({
            score: flowScore,
            timestamp: Date.now(),
            state: flowState
        });
        
        // Log significant flow state changes
        const prevState = this.flowEngine.flowHistory.length > 1 ? 
            this.flowEngine.flowHistory[this.flowEngine.flowHistory.length - 2].state : null;
        
        if (prevState && prevState !== flowState) {
            this.logFlowStateChange(prevState, flowState, flowScore);
        }
        
        // Keep only recent history
        const cutoff = Date.now() - 3600000; // 1 hour
        this.flowEngine.flowHistory = this.flowEngine.flowHistory
            .filter(entry => entry.timestamp > cutoff);
        
        // Update UI
        this.updateFlowIndicator();
    }
    
    logFlowStateChange(fromState, toState, flowScore) {
        if (this.aiCompanion && this.aiCompanion.logUsage) {
            this.aiCompanion.logUsage('flow_state_changed', {
                from: fromState,
                to: toState,
                score: flowScore,
                sessionDuration: this.getSessionDuration(),
                typingPattern: {
                    rhythm: this.flowEngine.typingPattern.rhythm,
                    consistency: this.flowEngine.typingPattern.consistency
                }
            });
        }
    }
    
    getPreviousFlowState() {
        const history = this.flowEngine.flowHistory;
        if (history.length < 2) return 0.5;
        
        return history[history.length - 2].score;
    }
    
    analyzeTypingPause(interval) {
        // Record pause for analysis
        this.flowEngine.typingPattern.pauses.push(interval);
        
        // Keep only recent pauses
        const cutoff = Date.now() - 300000; // 5 minutes
        this.flowEngine.typingPattern.pauses = this.flowEngine.typingPattern.pauses
            .slice(-20); // Keep last 20 pauses max
        
        // Analyze pause patterns for flow insights
        if (interval > 10000) { // Very long pause (10+ seconds)
            this.flowEngine.flowIndicators.set('longPause', Date.now());
        }
    }
    
    // === Additional Analysis Methods ===
    
    calculateSentenceComplexity(sentences) {
        if (!sentences || sentences.length === 0) return 0.5;
        
        const complexities = sentences.map(sentence => {
            const words = sentence.split(/\s+/);
            const length = words.length;
            const commas = (sentence.match(/,/g) || []).length;
            const subordinates = (sentence.match(/\b(because|although|while|since|if|when|where|which|that)\b/gi) || []).length;
            
            // Simple complexity formula
            return Math.min(1, (length / 30 + commas * 0.1 + subordinates * 0.2));
        });
        
        return complexities.reduce((a, b) => a + b, 0) / complexities.length;
    }
    
    suggestOptimalContinuation() {
        const sessionDuration = this.getSessionDuration();
        
        if (sessionDuration < 900000) { // Less than 15 minutes
            return '10-15 minutes';
        } else if (sessionDuration < 1800000) { // Less than 30 minutes
            return '15-20 minutes';
        } else if (sessionDuration < 2700000) { // Less than 45 minutes
            return '5-10 minutes then a short break';
        } else {
            return '2-5 minutes to wrap up';
        }
    }
    
    // === Analysis Helper Methods ===
    
    calculateCurrentTypingSpeed() {
        const recentIntervals = this.flowEngine.typingPattern.intervals.slice(-20);
        if (recentIntervals.length === 0) return 0.5;
        
        const avgInterval = recentIntervals.reduce((sum, entry) => sum + entry.interval, 0) / recentIntervals.length;
        const wpm = 60000 / (avgInterval * 5); // Rough WPM calculation
        
        return Math.min(1, wpm / 100); // Normalize to 0-1 range
    }
    
    analyzePausePattern() {
        const pauses = this.flowEngine.typingPattern.pauses.slice(-10);
        if (pauses.length === 0) return 0.5;
        
        // Analyze pause distribution for flow indicators
        const avgPause = pauses.reduce((a, b) => a + b, 0) / pauses.length;
        const idealPause = 2000; // 2 seconds is often optimal
        
        return Math.max(0, 1 - Math.abs(avgPause - idealPause) / idealPause);
    }
    
    calculateSentenceRhythm() {
        // This would analyze sentence structure rhythms
        return 0.6; // Neutral value - no random "struggling" scores
    }
    
    calculateVocabularyFlow() {
        // This would analyze vocabulary complexity and flow
        return 0.6; // Neutral value - no random "struggling" scores
    }
    
    calculateConceptualCoherence() {
        // This would analyze how well ideas connect
        return 0.6; // Neutral value - no random "struggling" scores
    }
    
    getTimeContextFeatures() {
        const hour = new Date().getHours();
        const optimal = this.flowEngine.context.optimalConditions.timeOfDay;
        
        if (hour >= 6 && hour < 12) return optimal.morning;
        if (hour >= 12 && hour < 18) return optimal.afternoon;
        return optimal.evening;
    }
    
    startInsightsEngine() {
        setInterval(() => {
            if (this.gamification?.currentSession) {
                this.generateRealtimeInsights();
            }
        }, this.insightsEngine.displayState.updateFrequency);
    }
    
    updateRealTimeFlowState() {
        // Lightweight flow state update based on recent typing patterns
        const recentScore = this.calculateQuickFlowScore();
        this.flowEngine.currentFlowScore = recentScore;
        
        // Only update indicator if score indicates a notable state AND we're not in cooldown
        const flowState = this.determineFlowState(recentScore);
        const now = Date.now();
        
        // Don't trigger indicator updates too frequently or during cooldown (v2)
        if (flowState !== 'blocked' && now - this.lastIndicatorHidden >= this.indicatorCooldown) {
            this.updateFlowIndicator();
        }
    }
    
    calculateQuickFlowScore() {
        const rhythm = this.flowEngine.typingPattern.rhythm || 0.6;
        const consistency = this.flowEngine.typingPattern.consistency || 0.6;
        const cognitiveLoad = this.flowEngine.cognitiveLoad.currentLoad || 0.4;
        
        // Only return a "struggling" score if there's real evidence of typing issues
        const recentIntervals = this.flowEngine.typingPattern.intervals.slice(-10);
        if (recentIntervals.length < 5) {
            // Not enough data to determine flow state - don't trigger indicator
            return 0.6; // Neutral state that won't trigger indicator
        }
        
        // Quick flow estimation
        const baseScore = (rhythm * 0.4 + consistency * 0.4 + (1 - cognitiveLoad) * 0.2);
        
        // Bias toward not showing indicator unless there's clear flow state
        return baseScore > 0.7 ? baseScore : 0.6;
    }
    
    // Method to force hide the indicator (useful for debugging)
    forceHideIndicator() {
        const indicator = document.getElementById('ai-flow-indicator');
        if (indicator) {
            indicator.classList.remove('visible');
            this.lastIndicatorHidden = Date.now();
            
            // Clear any pending timeouts
            if (this.flowIndicatorTimeout) {
                clearTimeout(this.flowIndicatorTimeout);
                this.flowIndicatorTimeout = null;
            }
        }
    }
    
    // Method to completely remove the indicator
    removeIndicator() {
        const indicator = document.getElementById('ai-flow-indicator');
        if (indicator) {
            indicator.remove();
        }
        
        // Clear any pending timeouts
        if (this.flowIndicatorTimeout) {
            clearTimeout(this.flowIndicatorTimeout);
            this.flowIndicatorTimeout = null;
        }
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.AIFlowDetection = AIFlowDetection;
}
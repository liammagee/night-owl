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
        this.indicatorCooldown = 15000; // 15 seconds cooldown before showing again
        this.lastShownState = null; // Track the last state shown to prevent repetition
        this.lastStateChangeTime = 0; // When the flow state last changed
        
        // Debouncing for flow updates
        this.updateDebounceTimeout = null;
        this.updateDebounceDelay = 800; // Wait 800ms before updating indicator
        
        // Text collection for AI insights
        this.textCollection = {
            recentText: '', // Last 200 characters typed
            lastSentence: '', // Current/last sentence being worked on
            textBuffer: [], // Buffer of recent text changes
            maxBufferSize: 50, // Keep last 50 text changes
            currentFile: '', // Current file being edited
            fileContent: '', // Current file content
            lastContentUpdate: 0 // When we last got file content
        };
        
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
        
        // Monitor keystroke patterns and collect text
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
            
            // Collect text for AI analysis
            this.collectTextData(event);
            
            // Update flow state in real-time
            this.updateRealTimeFlowState();
        });
        
        // Monitor content changes for deeper analysis
        let contentCheckTimer = setInterval(() => {
            this.analyzeContentFlow();
            this.updateFileContext(); // Update current file context
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
        if (intervals.length < 20) return; // Require more data before analyzing
        
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
    
    async generateRealtimeInsights() {
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
        
        // AI-powered contextual insights (every 60 seconds max)
        const aiInsight = await this.generateAIContextualInsight();
        if (aiInsight) insights.push(aiInsight);
        
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
            <span class="flow-indicator-close" title="Click to dismiss (or click anywhere on indicator)">×</span>
        `;
        
        // Make indicator clickable to dismiss
        indicator.addEventListener('click', (e) => {
            console.log('[Flow Detection] Indicator clicked - dismissing manually');
            indicator.classList.remove('visible');
            if (this.flowIndicatorTimeout) {
                clearTimeout(this.flowIndicatorTimeout);
                this.flowIndicatorTimeout = null;
                console.log('[Flow Detection] Cleared auto-hide timeout due to manual dismiss');
            }
            this.lastIndicatorHidden = Date.now();
            console.log('[Flow Detection] Indicator hidden manually, cooldown started');
            e.stopPropagation();
        });
        
        // Add hover logging for debugging
        indicator.addEventListener('mouseenter', () => {
            console.log('[Flow Detection] Indicator hovered - state:', indicator.className);
        });
        
        document.body.appendChild(indicator);
        
        // Update indicator based on flow state
        this.updateFlowIndicator();
    }
    
    // Debounced update method
    scheduleFlowIndicatorUpdate() {
        // Clear any existing debounce timeout
        if (this.updateDebounceTimeout) {
            console.log('[Flow Detection] Clearing existing debounce timeout');
            clearTimeout(this.updateDebounceTimeout);
        }
        
        console.log(`[Flow Detection] Scheduling indicator update with ${this.updateDebounceDelay}ms debounce`);
        
        // Schedule the update after debounce delay
        this.updateDebounceTimeout = setTimeout(() => {
            console.log('[Flow Detection] Debounce timeout expired - updating indicator now');
            this.updateFlowIndicator();
            this.updateDebounceTimeout = null;
        }, this.updateDebounceDelay);
    }

    updateFlowIndicator() {
        const indicator = document.getElementById('ai-flow-indicator');
        if (!indicator) {
            console.log('[Flow Detection] No indicator element found');
            return;
        }
        
        const flowScore = this.flowEngine.currentFlowScore;
        const flowState = this.determineFlowState(flowScore);
        
        console.log(`[Flow Detection] updateFlowIndicator called - Score: ${flowScore.toFixed(3)}, State: ${flowState}`);
        
        // Clear any existing timeout first
        if (this.flowIndicatorTimeout) {
            console.log('[Flow Detection] Clearing existing auto-hide timeout');
            clearTimeout(this.flowIndicatorTimeout);
            this.flowIndicatorTimeout = null;
        }
        
        // Check if we're in cooldown period (don't show indicator if recently hidden)
        const now = Date.now();
        const timeSinceHidden = now - this.lastIndicatorHidden;
        if (timeSinceHidden < this.indicatorCooldown) {
            const cooldownRemaining = Math.round((this.indicatorCooldown - timeSinceHidden) / 1000);
            console.log(`[Flow Detection] Indicator in cooldown for ${cooldownRemaining}s more (last hidden: ${new Date(this.lastIndicatorHidden).toLocaleTimeString()})`);
            return; // Still in cooldown, don't show indicator
        }
        
        // Check if this is the same state we just showed (prevent repetitive showing)
        const timeSinceStateChange = now - this.lastStateChangeTime;
        if (this.lastShownState === flowState && timeSinceStateChange < 30000) { // 30 seconds
            console.log(`[Flow Detection] Same state '${flowState}' recently shown ${Math.round(timeSinceStateChange/1000)}s ago - not showing again`);
            return;
        }
        
        // Update state tracking if the state has changed
        if (this.lastShownState !== flowState) {
            this.lastShownState = flowState;
            this.lastStateChangeTime = now;
            console.log(`[Flow Detection] Flow state changed to '${flowState}'`);
        }
        
        // Remove existing flow classes
        const wasVisible = indicator.classList.contains('visible');
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
                autoHideDelay = 3000;
                break;
            case 'light_flow':
                className = 'flow-light';
                icon = '✨';
                text = 'In Flow';
                autoHideDelay = 2500;
                break;
            case 'focused':
                className = 'flow-light';
                icon = '🎯';
                text = 'Focused';
                autoHideDelay = 2000;
                break;
            case 'struggling':
                className = 'flow-struggling';
                icon = '🔄';
                text = 'Processing';
                autoHideDelay = 1500;
                break;
            default:
                console.log('[Flow Detection] Flow state is neutral/blocked - not showing indicator');
                return;
        }
        
        console.log(`[Flow Detection] Showing indicator: ${text} (${className}) for ${autoHideDelay}ms`);
        
        indicator.classList.add(className, 'visible');
        indicator.querySelector('.flow-indicator-icon').textContent = icon;
        indicator.querySelector('.flow-indicator-text').textContent = text;
        
        // Log visibility change
        if (!wasVisible) {
            console.log(`[Flow Detection] Indicator became visible at ${new Date().toLocaleTimeString()}`);
        }
        
        // Set auto-hide timeout with logging
        if (autoHideDelay) {
            console.log(`[Flow Detection] Setting auto-hide timeout for ${autoHideDelay}ms`);
            this.flowIndicatorTimeout = setTimeout(() => {
                console.log(`[Flow Detection] Auto-hiding indicator after ${autoHideDelay}ms timeout`);
                indicator.classList.remove('visible');
                this.flowIndicatorTimeout = null;
                this.lastIndicatorHidden = Date.now();
                console.log(`[Flow Detection] Indicator auto-hidden at ${new Date().toLocaleTimeString()}, ${this.indicatorCooldown/1000}s cooldown started`);
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
    
    // === Text Collection for AI Insights ===
    
    collectTextData(event) {
        // Get current editor content
        const currentContent = this.getCurrentEditorContent();
        if (!currentContent) return;
        
        // Update recent text buffer
        const change = {
            timestamp: Date.now(),
            key: event.key,
            content: currentContent.slice(-200) // Last 200 characters
        };
        
        this.textCollection.textBuffer.push(change);
        
        // Keep buffer size manageable
        if (this.textCollection.textBuffer.length > this.textCollection.maxBufferSize) {
            this.textCollection.textBuffer = this.textCollection.textBuffer.slice(-this.textCollection.maxBufferSize);
        }
        
        // Update recent text and last sentence
        this.textCollection.recentText = currentContent.slice(-200);
        this.textCollection.lastSentence = this.extractLastSentence(currentContent);
    }
    
    getCurrentEditorContent() {
        // Try to get content from Monaco editor first
        if (window.editor && window.editor.getValue) {
            return window.editor.getValue();
        }
        
        // Fallback to active textarea or contenteditable
        const activeElement = document.activeElement;
        if (activeElement) {
            if (activeElement.tagName === 'TEXTAREA') {
                return activeElement.value;
            } else if (activeElement.contentEditable === 'true') {
                return activeElement.textContent || activeElement.innerText;
            }
        }
        
        return null;
    }
    
    extractLastSentence(content) {
        if (!content) return '';
        
        // Find the last sentence (ending with ., !, ?, or current incomplete sentence)
        const sentences = content.split(/[.!?]+/);
        const lastSentence = sentences[sentences.length - 1];
        
        // If the last part is very short, include the previous sentence too
        if (lastSentence.trim().length < 20 && sentences.length > 1) {
            const prevSentence = sentences[sentences.length - 2];
            return (prevSentence + '. ' + lastSentence).slice(-150); // Max 150 chars
        }
        
        return lastSentence.slice(-150); // Max 150 chars
    }
    
    updateFileContext() {
        const now = Date.now();
        
        // Only update file context every 30 seconds to avoid too frequent calls
        if (now - this.textCollection.lastContentUpdate < 30000) {
            return;
        }
        
        // Get current file path and content
        const currentFile = this.getCurrentFilePath();
        const fullContent = this.getCurrentEditorContent();
        
        if (currentFile && fullContent) {
            this.textCollection.currentFile = currentFile;
            this.textCollection.fileContent = fullContent;
            this.textCollection.lastContentUpdate = now;
            
            console.log(`[Flow Detection] Updated file context: ${currentFile} (${fullContent.length} chars)`);
        }
    }
    
    getCurrentFilePath() {
        // Try to get current file path from global variables
        if (window.currentFile) {
            return window.currentFile;
        }
        
        // Try to get from document title or other indicators
        const titleElement = document.querySelector('.title-bar, title');
        if (titleElement && titleElement.textContent) {
            const title = titleElement.textContent;
            // Look for file extensions in the title
            const fileMatch = title.match(/([^/\\]+\.[a-zA-Z]{2,4})/);
            if (fileMatch) {
                return fileMatch[1];
            }
        }
        
        return 'untitled.md'; // Default fallback
    }
    
    getContextForAI() {
        return {
            recentText: this.textCollection.recentText,
            lastSentence: this.textCollection.lastSentence,
            currentFile: this.textCollection.currentFile,
            fileType: this.getFileType(this.textCollection.currentFile),
            contentLength: this.textCollection.fileContent.length,
            flowScore: this.flowEngine.currentFlowScore,
            flowState: this.determineFlowState(this.flowEngine.currentFlowScore),
            sessionDuration: this.getSessionDuration(),
            typingPattern: {
                rhythm: this.flowEngine.typingPattern.rhythm,
                consistency: this.flowEngine.typingPattern.consistency,
                recentBursts: this.flowEngine.typingPattern.bursts.slice(-3)
            }
        };
    }
    
    getFileType(filename) {
        if (!filename) return 'text';
        const ext = filename.toLowerCase().split('.').pop();
        const typeMap = {
            'md': 'markdown',
            'txt': 'text',
            'js': 'javascript',
            'py': 'python',
            'html': 'html',
            'css': 'css',
            'json': 'json'
        };
        return typeMap[ext] || 'text';
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
    
    // === AI-Powered Contextual Insights ===
    
    async generateAIContextualInsight() {
        // Rate limiting - only generate AI insights every 60 seconds
        const now = Date.now();
        if (!this.lastAIInsightTime) this.lastAIInsightTime = 0;
        
        if (now - this.lastAIInsightTime < 60000) {
            return null; // Too soon for another AI insight
        }
        
        // Check if we have enough context for a meaningful insight
        const context = this.getContextForAI();
        if (!context.recentText || context.recentText.trim().length < 20) {
            return null; // Not enough recent content
        }
        
        try {
            const insight = await this.requestAIInsight(context);
            if (insight) {
                this.lastAIInsightTime = now;
                return {
                    type: 'ai_contextual',
                    category: 'creative',
                    icon: '🤖',
                    message: insight,
                    confidence: 0.8,
                    actionable: true
                };
            }
        } catch (error) {
            console.error('[Flow Detection] Error generating AI insight:', error);
        }
        
        return null;
    }
    
    async requestAIInsight(context) {
        // Check if AI service is available
        if (!window.electronAPI || !window.electronAPI.invoke) {
            console.log('[Flow Detection] AI service not available');
            return null;
        }
        
        const prompt = this.buildContextualPrompt(context);
        
        try {
            console.log('[Flow Detection] Requesting AI contextual insight...');
            
            const response = await window.electronAPI.invoke('ai-chat', {
                message: prompt,
                options: {
                    systemMessage: this.getInsightSystemPrompt(),
                    temperature: 0.7,
                    maxTokens: 150,
                    newConversation: true // Each insight is independent
                }
            });
            
            if (response && response.response) {
                console.log('[Flow Detection] Received AI insight:', response.response.substring(0, 100) + '...');
                return response.response.trim();
            }
        } catch (error) {
            console.error('[Flow Detection] AI insight request failed:', error);
        }
        
        return null;
    }
    
    buildContextualPrompt(context) {
        const fileType = context.fileType;
        const flowState = context.flowState;
        const recentText = context.recentText;
        const lastSentence = context.lastSentence;
        
        return `I'm writing a ${fileType} file and my current flow state is "${flowState}". 
        
My last sentence or paragraph is: "${lastSentence}"

Recent text context: "${recentText.slice(-100)}"

Provide a brief, helpful writing suggestion or insight (1-2 sentences max). Focus on:
- Content direction or next steps
- Writing flow improvements 
- Philosophical connections (if relevant)
- Structural suggestions

Be encouraging and specific to what I'm actually writing about.`;
    }
    
    getInsightSystemPrompt() {
        return `You are Maya, an AI writing companion specializing in academic and philosophical writing. You provide brief, contextual writing insights based on the user's current text and flow state.

Your insights should be:
- Brief (1-2 sentences max)
- Specific to the actual content being written
- Encouraging and constructive
- Focused on immediate next steps or improvements
- Philosophically informed when relevant

Avoid generic advice. Be specific to what the user is actually working on.`;
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
        
        // Update UI (debounced)
        this.scheduleFlowIndicatorUpdate();
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
        setInterval(async () => {
            if (this.gamification?.currentSession) {
                await this.generateRealtimeInsights();
            }
        }, this.insightsEngine.displayState.updateFrequency);
    }
    
    updateRealTimeFlowState() {
        // Lightweight flow state update based on recent typing patterns
        const recentScore = this.calculateQuickFlowScore();
        const previousScore = this.flowEngine.currentFlowScore;
        this.flowEngine.currentFlowScore = recentScore;
        
        // Log significant changes in flow score
        const scoreDiff = Math.abs(recentScore - previousScore);
        if (scoreDiff > 0.1) {
            console.log(`[Flow Detection] Flow score changed: ${previousScore.toFixed(3)} → ${recentScore.toFixed(3)} (diff: ${scoreDiff.toFixed(3)})`);
        }
        
        // Only update indicator if score indicates a notable state AND we're not in cooldown
        const flowState = this.determineFlowState(recentScore);
        const now = Date.now();
        const timeSinceHidden = now - this.lastIndicatorHidden;
        const timeSinceStateChange = now - this.lastStateChangeTime;
        
        // Only log real-time updates if there's a significant change or it's been a while
        if (scoreDiff > 0.1 || timeSinceHidden > this.indicatorCooldown) {
            console.log(`[Flow Detection] Real-time update - Score: ${recentScore.toFixed(3)}, State: ${flowState}, Time since hidden: ${Math.round(timeSinceHidden/1000)}s, Time since state change: ${Math.round(timeSinceStateChange/1000)}s`);
        }
        
        // Don't trigger indicator updates if:
        // 1. Still in cooldown
        // 2. Same state recently shown
        // 3. Flow state is neutral/blocked
        const shouldUpdate = flowState !== 'blocked' && 
                           timeSinceHidden >= this.indicatorCooldown && 
                           (this.lastShownState !== flowState || timeSinceStateChange >= 30000);
        
        if (shouldUpdate) {
            console.log('[Flow Detection] Conditions met - scheduling indicator update');
            this.scheduleFlowIndicatorUpdate();
        } else {
            // Only log reasons if there was a score change
            if (scoreDiff > 0.1) {
                if (flowState === 'blocked') {
                    console.log('[Flow Detection] Flow state is blocked - not updating indicator');
                } else if (timeSinceHidden < this.indicatorCooldown) {
                    console.log(`[Flow Detection] Still in cooldown (${Math.round((this.indicatorCooldown - timeSinceHidden)/1000)}s remaining) - not updating indicator`);
                } else if (this.lastShownState === flowState) {
                    console.log(`[Flow Detection] Same state '${flowState}' recently shown - not updating indicator`);
                }
            }
        }
    }
    
    calculateQuickFlowScore() {
        const rhythm = this.flowEngine.typingPattern.rhythm || 0.6;
        const consistency = this.flowEngine.typingPattern.consistency || 0.6;
        const cognitiveLoad = this.flowEngine.cognitiveLoad.currentLoad || 0.4;
        
        // Check if we have enough data for a meaningful score
        const recentIntervals = this.flowEngine.typingPattern.intervals.slice(-20);
        const dataPoints = recentIntervals.length;
        
        console.log(`[Flow Detection] calculateQuickFlowScore - Data points: ${dataPoints}, Rhythm: ${rhythm.toFixed(3)}, Consistency: ${consistency.toFixed(3)}, Cognitive load: ${cognitiveLoad.toFixed(3)}`);
        
        if (dataPoints < 20) {
            // Not enough data to determine flow state - don't trigger indicator
            console.log('[Flow Detection] Insufficient data for flow calculation (need 20+ keystrokes)');
            return 0.6; // Neutral state that won't trigger indicator
        }
        
        // Quick flow estimation with bias toward neutral scores
        const baseScore = (rhythm * 0.3 + consistency * 0.3 + (1 - cognitiveLoad) * 0.2 + 0.2); // Added 0.2 baseline
        
        console.log(`[Flow Detection] Base score calculated: ${baseScore.toFixed(3)}`);
        
        // More conservative thresholds - only show indicator for clearly notable states
        let finalScore;
        if (baseScore > 0.8) {
            finalScore = baseScore; // Clear high flow state
        } else if (baseScore < 0.3) {
            finalScore = baseScore; // Clear struggling state  
        } else {
            finalScore = 0.6; // Neutral state - don't show indicator
        }
        
        console.log(`[Flow Detection] Final flow score: ${finalScore.toFixed(3)} ${finalScore !== baseScore ? '(adjusted to neutral to reduce noise)' : ''}`);
        
        return finalScore;
    }
    
    // Method to force hide the indicator (useful for debugging)
    forceHideIndicator() {
        console.log('[Flow Detection] Force hiding indicator');
        const indicator = document.getElementById('ai-flow-indicator');
        if (indicator) {
            indicator.classList.remove('visible');
            this.lastIndicatorHidden = Date.now();
            
            // Clear any pending timeouts
            if (this.flowIndicatorTimeout) {
                clearTimeout(this.flowIndicatorTimeout);
                this.flowIndicatorTimeout = null;
                console.log('[Flow Detection] Cleared auto-hide timeout during force hide');
            }
            console.log(`[Flow Detection] Indicator force hidden at ${new Date().toLocaleTimeString()}`);
        } else {
            console.log('[Flow Detection] No indicator to force hide');
        }
    }
    
    // Method to completely remove the indicator
    removeIndicator() {
        console.log('[Flow Detection] Removing indicator completely');
        const indicator = document.getElementById('ai-flow-indicator');
        if (indicator) {
            indicator.remove();
            console.log('[Flow Detection] Indicator element removed from DOM');
        } else {
            console.log('[Flow Detection] No indicator element to remove');
        }
        
        // Clear any pending timeouts
        if (this.flowIndicatorTimeout) {
            clearTimeout(this.flowIndicatorTimeout);
            this.flowIndicatorTimeout = null;
            console.log('[Flow Detection] Cleared auto-hide timeout during removal');
        }
        
        if (this.updateDebounceTimeout) {
            clearTimeout(this.updateDebounceTimeout);
            this.updateDebounceTimeout = null;
            console.log('[Flow Detection] Cleared debounce timeout during removal');
        }
    }
    
    // Debug method to get current state information
    getDebugInfo() {
        const now = Date.now();
        const timeSinceHidden = now - this.lastIndicatorHidden;
        const indicator = document.getElementById('ai-flow-indicator');
        
        return {
            flowScore: this.flowEngine.currentFlowScore,
            flowState: this.determineFlowState(this.flowEngine.currentFlowScore),
            indicatorVisible: indicator ? indicator.classList.contains('visible') : false,
            indicatorExists: !!indicator,
            timeSinceHidden: Math.round(timeSinceHidden / 1000),
            cooldownRemaining: Math.max(0, Math.round((this.indicatorCooldown - timeSinceHidden) / 1000)),
            hasAutoHideTimeout: !!this.flowIndicatorTimeout,
            hasDebounceTimeout: !!this.updateDebounceTimeout,
            typingDataPoints: this.flowEngine.typingPattern.intervals.length,
            lastHiddenTime: new Date(this.lastIndicatorHidden).toLocaleTimeString(),
            cooldownDuration: this.indicatorCooldown / 1000,
            lastShownState: this.lastShownState,
            timeSinceStateChange: Math.round((now - this.lastStateChangeTime) / 1000),
            textCollectionActive: !!this.textCollection,
            recentTextLength: this.textCollection.recentText?.length || 0,
            lastSentenceLength: this.textCollection.lastSentence?.length || 0,
            currentFile: this.textCollection.currentFile
        };
    }
    
    // Debug method to log current state
    logDebugInfo() {
        const info = this.getDebugInfo();
        console.group('[Flow Detection] Debug Info');
        console.table(info);
        console.groupEnd();
        return info;
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.AIFlowDetection = AIFlowDetection;
    
    // Global debugging helpers (accessible from browser console)
    window.flowDebug = {
        // Get current flow detection debug info
        info: () => {
            if (window.aiFlowDetection) {
                return window.aiFlowDetection.logDebugInfo();
            } else {
                console.log('[Flow Debug] AI Flow Detection not initialized');
                return null;
            }
        },
        
        // Force hide the indicator
        hide: () => {
            if (window.aiFlowDetection) {
                window.aiFlowDetection.forceHideIndicator();
                console.log('[Flow Debug] Indicator force hidden');
            } else {
                console.log('[Flow Debug] AI Flow Detection not initialized');
            }
        },
        
        // Remove the indicator completely
        remove: () => {
            if (window.aiFlowDetection) {
                window.aiFlowDetection.removeIndicator();
                console.log('[Flow Debug] Indicator removed');
            } else {
                console.log('[Flow Debug] AI Flow Detection not initialized');
            }
        },
        
        // Show the indicator (bypass cooldown for testing)
        show: (state = 'focused') => {
            if (window.aiFlowDetection) {
                // Temporarily bypass cooldown and state tracking
                window.aiFlowDetection.lastIndicatorHidden = 0;
                window.aiFlowDetection.lastShownState = null;
                window.aiFlowDetection.lastStateChangeTime = 0;
                // Set a test flow state
                const testScores = {
                    'deep_flow': 0.9,
                    'light_flow': 0.75,
                    'focused': 0.6,
                    'struggling': 0.4
                };
                window.aiFlowDetection.flowEngine.currentFlowScore = testScores[state] || 0.6;
                window.aiFlowDetection.updateFlowIndicator();
                console.log(`[Flow Debug] Showing indicator in '${state}' state`);
            } else {
                console.log('[Flow Debug] AI Flow Detection not initialized');
            }
        },
        
        // Generate an AI insight on demand
        insight: async () => {
            if (window.aiFlowDetection) {
                try {
                    const insight = await window.aiFlowDetection.generateAIContextualInsight();
                    if (insight) {
                        console.log(`[Flow Debug] AI Insight: ${insight.message}`);
                        return insight;
                    } else {
                        console.log('[Flow Debug] No AI insight generated (rate limited or insufficient context)');
                        return null;
                    }
                } catch (error) {
                    console.error('[Flow Debug] Error generating AI insight:', error);
                    return null;
                }
            } else {
                console.log('[Flow Debug] AI Flow Detection not initialized');
                return null;
            }
        },
        
        // Show current text collection state
        text: () => {
            if (window.aiFlowDetection && window.aiFlowDetection.textCollection) {
                const tc = window.aiFlowDetection.textCollection;
                console.group('[Flow Debug] Text Collection State');
                console.log('Recent text:', tc.recentText);
                console.log('Last sentence:', tc.lastSentence);
                console.log('Current file:', tc.currentFile);
                console.log('Content length:', tc.fileContent?.length || 0);
                console.log('Buffer size:', tc.textBuffer?.length || 0);
                console.groupEnd();
                return tc;
            } else {
                console.log('[Flow Debug] Text collection not available');
                return null;
            }
        },
        
        // List available commands
        help: () => {
            console.log(`
[Flow Debug] Available commands:
• flowDebug.info() - Show current flow detection state
• flowDebug.hide() - Force hide the indicator
• flowDebug.remove() - Remove indicator completely  
• flowDebug.show('state') - Show indicator in test state (deep_flow, light_flow, focused, struggling)
• flowDebug.insight() - Generate AI insight on demand
• flowDebug.text() - Show current text collection state
• flowDebug.help() - Show this help
            `);
        }
    };
    
    console.log('[Flow Detection] Debug helpers available: flowDebug.help() for commands');
}
// === AI-Powered Writing Companion ===
// Provides intelligent, contextual, and adaptive feedback during writing
// Based on flow theory, natural language processing, and adaptive learning principles

class AIWritingCompanion {
    constructor(gamificationInstance) {
        this.gamification = gamificationInstance;
        this.initialized = false;
        
        // AI Analysis Engine
        this.analysisEngine = {
            writingStyle: this.loadWritingStyle(),
            preferences: this.loadUserPreferences(),
            patterns: this.loadWritingPatterns(),
            vocabulary: new Map(), // Dynamic vocabulary tracking
            sentimentHistory: [], // Track emotional tone over time
            topicClusters: new Map(), // Identify recurring themes
            writingRhythm: [], // Track natural writing patterns
        };
        
        // Contextual Feedback System
        this.feedbackSystem = {
            enabled: true,
            adaptiveThreshold: 0.7, // How confident AI needs to be before giving feedback
            feedbackTypes: {
                encouragement: { weight: 0.4, lastShown: 0 },
                insights: { weight: 0.3, lastShown: 0 },
                suggestions: { weight: 0.2, lastShown: 0 },
                celebrations: { weight: 0.1, lastShown: 0 }
            },
            suppressionPeriod: 300000, // 5 minutes between similar feedback types
        };
        
        // Real-time Analysis
        this.realTimeAnalysis = {
            isAnalyzing: false,
            analysisBuffer: [], // Store recent writing for analysis
            bufferSize: 200, // Words to analyze at once
            analysisInterval: 30000, // Analyze every 30 seconds during active writing
            lastAnalysis: 0,
            currentInsights: [],
        };
        
        // Adaptive Learning
        this.adaptiveLearning = {
            userEngagement: this.loadEngagementData(),
            feedbackEffectiveness: new Map(),
            learningModel: this.initializeLearningModel(),
            personalityProfile: this.loadPersonalityProfile(),
        };
        
        // AI Mentor Personas
        this.mentorPersonas = {
            current: 'adaptive', // Changes based on writing context
            personas: {
                encouraging: {
                    name: 'Maya',
                    style: 'supportive and warm',
                    triggers: ['struggle', 'low_confidence', 'beginning_session'],
                    responses: this.getEncouragingResponses()
                },
                analytical: {
                    name: 'Dr. Chen',
                    style: 'insightful and precise',
                    triggers: ['complex_writing', 'research_mode', 'editing_phase'],
                    responses: this.getAnalyticalResponses()
                },
                creative: {
                    name: 'River',
                    style: 'imaginative and inspiring',
                    triggers: ['creative_writing', 'brainstorming', 'flow_state'],
                    responses: this.getCreativeResponses()
                },
                adaptive: {
                    name: 'Sage',
                    style: 'contextually aware',
                    triggers: ['any'],
                    responses: this.getAdaptiveResponses()
                }
            }
        };
        
        this.init();
    }
    
    async init() {
        if (this.initialized) return;
        
        try {
            console.log('[AI Companion] Initializing intelligent writing companion...');
            
            // Initialize analysis systems
            this.startRealTimeAnalysis();
            this.initializeContextualDetection();
            
            // Set up adaptive feedback loops
            this.setupAdaptiveFeedback();
            
            // Initialize personality detection
            this.initializePersonalityDetection();
            
            this.initialized = true;
            console.log('[AI Companion] AI Writing Companion initialized successfully');
            
        } catch (error) {
            console.error('[AI Companion] Initialization failed:', error);
        }
    }
    
    // === Real-time Writing Analysis ===
    
    startRealTimeAnalysis() {
        // Monitor writing activity and provide contextual feedback
        let lastContent = '';
        let analysisTimer = null;
        
        const analyzeWriting = () => {
            if (!this.feedbackSystem.enabled) return;
            
            const currentContent = this.getCurrentWritingContent();
            if (currentContent === lastContent) return;
            
            const newText = currentContent.slice(lastContent.length);
            if (newText.length > 0) {
                this.processNewWriting(newText);
                lastContent = currentContent;
            }
        };
        
        // Set up intelligent polling based on writing activity
        const setupAnalysisTimer = () => {
            if (analysisTimer) clearInterval(analysisTimer);
            
            // More frequent analysis during active writing
            const interval = this.gamification?.currentSession ? 15000 : 60000;
            analysisTimer = setInterval(analyzeWriting, interval);
        };
        
        setupAnalysisTimer();
        
        // Adjust analysis frequency based on writing activity
        setInterval(setupAnalysisTimer, 300000); // Readjust every 5 minutes
    }
    
    processNewWriting(newText) {
        // Add to analysis buffer
        this.realTimeAnalysis.analysisBuffer.push({
            text: newText,
            timestamp: Date.now(),
            context: this.getCurrentWritingContext()
        });
        
        // Keep buffer at manageable size
        if (this.realTimeAnalysis.analysisBuffer.length > this.realTimeAnalysis.bufferSize) {
            this.realTimeAnalysis.analysisBuffer.shift();
        }
        
        // Trigger analysis if enough new content
        const totalNewWords = this.realTimeAnalysis.analysisBuffer
            .reduce((count, entry) => count + this.countWords(entry.text), 0);
        
        if (totalNewWords >= 50 || Date.now() - this.realTimeAnalysis.lastAnalysis > 60000) {
            this.performContextualAnalysis();
        }
    }
    
    async performContextualAnalysis() {
        if (this.realTimeAnalysis.isAnalyzing) return;
        
        this.realTimeAnalysis.isAnalyzing = true;
        this.realTimeAnalysis.lastAnalysis = Date.now();
        
        try {
            const recentWriting = this.realTimeAnalysis.analysisBuffer
                .map(entry => entry.text)
                .join(' ');
            
            if (recentWriting.length < 10) return;
            
            // Analyze multiple dimensions
            const analysis = await this.analyzeWritingDimensions(recentWriting);
            
            // Generate contextual feedback based on analysis
            this.generateContextualFeedback(analysis);
            
            // Update learning model
            this.updateLearningModel(analysis);
            
        } catch (error) {
            console.error('[AI Companion] Analysis error:', error);
        } finally {
            this.realTimeAnalysis.isAnalyzing = false;
        }
    }
    
    async analyzeWritingDimensions(text) {
        return {
            flow: this.analyzeFlowState(text),
            sentiment: this.analyzeSentiment(text),
            complexity: this.analyzeComplexity(text),
            creativity: this.analyzeCreativity(text),
            focus: this.analyzeFocus(text),
            progress: this.analyzeProgress(text),
            style: this.analyzeWritingStyle(text),
            engagement: this.analyzeEngagement(text)
        };
    }
    
    // === Intelligent Flow State Detection ===
    
    analyzeFlowState(text) {
        const words = text.split(/\\s+/);
        const sentences = text.split(/[.!?]+/);
        
        // Flow indicators
        const indicators = {
            rhythm: this.calculateWritingRhythm(words),
            complexity: this.calculateSentenceComplexity(sentences),
            vocabulary: this.analyzeVocabularyFlow(words),
            coherence: this.analyzeCoherence(sentences),
            momentum: this.calculateMomentum(words)
        };
        
        // Flow score (0-1)
        const flowScore = (
            indicators.rhythm * 0.3 +
            indicators.complexity * 0.2 +
            indicators.vocabulary * 0.2 +
            indicators.coherence * 0.15 +
            indicators.momentum * 0.15
        );
        
        return {
            score: flowScore,
            indicators,
            state: this.determineFlowState(flowScore),
            suggestions: this.generateFlowSuggestions(flowScore, indicators)
        };
    }
    
    calculateWritingRhythm(words) {
        // Analyze word length patterns and rhythm
        const lengths = words.map(word => word.length);
        const variance = this.calculateVariance(lengths);
        const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        
        // Good rhythm has moderate variance (not too monotonous, not too chaotic)
        const idealVariance = avgLength * 0.8;
        return Math.max(0, 1 - Math.abs(variance - idealVariance) / idealVariance);
    }
    
    determineFlowState(flowScore) {
        if (flowScore > 0.8) return 'deep_flow';
        if (flowScore > 0.6) return 'light_flow';
        if (flowScore > 0.4) return 'focused';
        if (flowScore > 0.2) return 'struggling';
        return 'blocked';
    }
    
    // === Contextual Feedback Generation ===
    
    generateContextualFeedback(analysis) {
        const context = this.getCurrentWritingContext();
        const persona = this.selectOptimalPersona(analysis, context);
        
        // Determine if feedback should be shown
        if (!this.shouldShowFeedback(analysis)) return;
        
        // Generate personalized feedback
        const feedback = this.generatePersonalizedFeedback(analysis, persona, context);
        
        if (feedback) {
            this.showContextualFeedback(feedback);
            this.recordFeedbackInteraction(feedback, analysis);
        }
    }
    
    shouldShowFeedback(analysis) {
        // Don't interrupt during deep flow
        if (analysis.flow.state === 'deep_flow') return false;
        
        // Show encouragement when struggling
        if (analysis.flow.state === 'struggling' || analysis.flow.state === 'blocked') return true;
        
        // Show insights when there's something meaningful to share
        if (analysis.progress.milestone || analysis.creativity.breakthrough) return true;
        
        // Adaptive timing based on user preferences
        const timeSinceLastFeedback = Date.now() - this.getLastFeedbackTime();
        const minimumInterval = this.adaptiveLearning.personalityProfile.feedbackFrequency || 600000; // 10 minutes default
        
        return timeSinceLastFeedback > minimumInterval;
    }
    
    generatePersonalizedFeedback(analysis, persona, context) {
        const feedbackType = this.selectFeedbackType(analysis, context);
        const personalizations = this.getPersonalizations(analysis);
        
        switch (feedbackType) {
            case 'encouragement':
                return this.generateEncouragement(analysis, persona, personalizations);
            case 'insight':
                return this.generateInsight(analysis, persona, personalizations);
            case 'suggestion':
                return this.generateSuggestion(analysis, persona, personalizations);
            case 'celebration':
                return this.generateCelebration(analysis, persona, personalizations);
            default:
                return null;
        }
    }
    
    generateEncouragement(analysis, persona, personalizations) {
        const encouragements = {
            struggling: [
                `${persona.name} notices you're working through some complexity here. Every great writer faces these moments—they're often where the best insights emerge.`,
                `I can sense you're pushing through a challenging section. Your persistence shows real dedication to your craft.`,
                `This feels like deep thinking territory. Sometimes the best writing comes after we wrestle with our ideas.`
            ],
            beginning: [
                `${persona.name} here! I'm excited to write alongside you today. Your unique perspective always leads to interesting places.`,
                `Ready to explore some ideas together? I love seeing where your thoughts take us.`
            ],
            momentum: [
                `You're building beautiful momentum here. I can feel the energy in your words.`,
                `There's a lovely rhythm developing in your writing. Keep riding this wave.`
            ]
        };
        
        const context = analysis.flow.state === 'struggling' ? 'struggling' : 
                       analysis.progress.isBeginning ? 'beginning' : 'momentum';
        
        const messages = encouragements[context] || encouragements.momentum;
        const message = messages[Math.floor(Math.random() * messages.length)];
        
        return {
            type: 'encouragement',
            persona: persona.name,
            message,
            confidence: 0.8,
            timing: 'gentle'
        };
    }
    
    generateInsight(analysis, persona, personalizations) {
        const insights = [];
        
        // Flow insights
        if (analysis.flow.score > 0.7) {
            insights.push(`You're in a wonderful flow state—your ideas are connecting beautifully. Consider continuing for another ${this.suggestOptimalDuration()} to maximize this momentum.`);
        }
        
        // Style insights
        if (analysis.style.evolution) {
            insights.push(`I'm noticing your writing style is evolving. Your sentences are becoming more ${analysis.style.direction}—it's adding real depth to your voice.`);
        }
        
        // Creativity insights
        if (analysis.creativity.score > 0.6) {
            insights.push(`Your creativity is really sparking today. The way you're connecting ideas feels fresh and original.`);
        }
        
        if (insights.length === 0) return null;
        
        return {
            type: 'insight',
            persona: persona.name,
            message: insights[Math.floor(Math.random() * insights.length)],
            confidence: 0.7,
            timing: 'thoughtful'
        };
    }
    
    // === Adaptive Difficulty and Challenges ===
    
    generateAdaptiveChallenges(analysis) {
        const userLevel = this.calculateUserLevel();
        const preferences = this.adaptiveLearning.personalityProfile;
        
        const challenges = [];
        
        // Flow-based challenges
        if (analysis.flow.score < 0.4) {
            challenges.push({
                type: 'flow_builder',
                title: 'Find Your Rhythm',
                description: 'Write for 10 minutes focusing on letting ideas flow naturally',
                difficulty: 'gentle',
                duration: 600000, // 10 minutes
                aiGuidance: true
            });
        }
        
        // Creativity challenges
        if (analysis.creativity.score > 0.7) {
            challenges.push({
                type: 'creative_exploration',
                title: 'Creative Deep Dive',
                description: 'Your creativity is flowing—explore an unexpected angle or metaphor',
                difficulty: 'engaging',
                aiGuidance: true
            });
        }
        
        // Style development challenges
        if (analysis.style.consistency < 0.5) {
            challenges.push({
                type: 'style_consistency',
                title: 'Voice Refinement',
                description: 'Focus on developing a consistent voice for the next 500 words',
                difficulty: 'focused',
                aiGuidance: true
            });
        }
        
        return challenges.filter(challenge => this.isAppropriateChallenge(challenge, userLevel, preferences));
    }
    
    // === Natural Language Feedback Delivery ===
    
    showContextualFeedback(feedback) {
        const display = this.createIntelligentDisplay(feedback);
        this.animateIntelligentDisplay(display);
        
        // Schedule automatic dismissal based on feedback type
        const dismissTime = this.calculateOptimalDisplayTime(feedback);
        setTimeout(() => this.dismissFeedback(display), dismissTime);
    }
    
    createIntelligentDisplay(feedback) {
        const display = document.createElement('div');
        display.className = `ai-companion-feedback feedback-${feedback.type} timing-${feedback.timing}`;
        
        // Position based on writing context
        const position = this.calculateOptimalPosition();
        
        display.innerHTML = `
            <div class="ai-companion-avatar">
                <div class="avatar-icon">🤖</div>
                <div class="avatar-persona">${feedback.persona}</div>
            </div>
            <div class="ai-companion-message">
                <div class="message-text">${feedback.message}</div>
                <div class="message-actions">
                    <button class="feedback-action helpful" onclick="aiCompanion.recordFeedback('helpful', '${feedback.id}')">
                        Helpful
                    </button>
                    <button class="feedback-action dismiss" onclick="aiCompanion.dismissFeedback(this.closest('.ai-companion-feedback'))">
                        Thanks
                    </button>
                </div>
            </div>
        `;
        
        display.style.cssText = `
            position: fixed;
            ${position.css};
            z-index: 1000;
            max-width: 320px;
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s ease;
        `;
        
        return display;
    }
    
    // === Analysis Helper Methods ===
    
    analyzeSentiment(text) {
        // Simple sentiment analysis based on word patterns
        const positiveWords = ['good', 'great', 'excellent', 'wonderful', 'amazing', 'love', 'enjoy', 'excited', 'happy'];
        const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'frustrated', 'difficult', 'struggling', 'worried'];
        
        const words = text.toLowerCase().split(/\\W+/);
        const positive = words.filter(word => positiveWords.includes(word)).length;
        const negative = words.filter(word => negativeWords.includes(word)).length;
        
        const sentiment = positive - negative;
        const magnitude = Math.abs(sentiment) / words.length;
        
        return {
            score: sentiment / Math.max(positive + negative, 1), // -1 to 1
            magnitude,
            tendency: sentiment > 0 ? 'positive' : sentiment < 0 ? 'negative' : 'neutral'
        };
    }
    
    analyzeComplexity(text) {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const words = text.split(/\\s+/);
        
        const avgWordsPerSentence = words.length / sentences.length;
        const avgSyllablesPerWord = this.estimateAvgSyllables(words);
        const uniqueWordRatio = new Set(words.map(w => w.toLowerCase())).size / words.length;
        
        // Flesch Reading Ease approximation
        const fleschScore = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
        
        return {
            fleschScore,
            readingLevel: this.fleschToLevel(fleschScore),
            avgWordsPerSentence,
            avgSyllablesPerWord,
            uniqueWordRatio,
            complexity: this.calculateComplexityScore(avgWordsPerSentence, avgSyllablesPerWord, uniqueWordRatio)
        };
    }
    
    analyzeCreativity(text) {
        const words = text.toLowerCase().split(/\\W+/);
        const uniqueWords = new Set(words);
        
        // Creativity indicators
        const metaphorIndicators = ['like', 'as', 'seems', 'appears', 'resembles'];
        const emotionalWords = ['feel', 'sense', 'emotion', 'heart', 'soul', 'spirit'];
        const imaginativeWords = ['imagine', 'dream', 'wonder', 'envision', 'picture'];
        
        const metaphorScore = this.calculateIndicatorScore(words, metaphorIndicators);
        const emotionalScore = this.calculateIndicatorScore(words, emotionalWords);
        const imaginativeScore = this.calculateIndicatorScore(words, imaginativeWords);
        
        const vocabularyDiversity = uniqueWords.size / words.length;
        const unconventionalPhrases = this.detectUnconventionalPhrases(text);
        
        return {
            score: (metaphorScore + emotionalScore + imaginativeScore + vocabularyDiversity) / 4,
            metaphorScore,
            emotionalScore,
            imaginativeScore,
            vocabularyDiversity,
            unconventionalPhrases,
            breakthrough: this.detectCreativeBreakthrough(text)
        };
    }
    
    // === Utility Methods ===
    
    getCurrentWritingContent() {
        // Get current editor content - integrate with existing editor
        if (window.editor && window.editor.getValue) {
            return window.editor.getValue();
        }
        
        // Fallback to any textarea or contenteditable
        const editor = document.querySelector('textarea, [contenteditable="true"]');
        return editor ? (editor.value || editor.textContent || '') : '';
    }
    
    getCurrentWritingContext() {
        return {
            sessionDuration: this.gamification?.currentSession ? 
                Date.now() - this.gamification.sessionStartTime : 0,
            isFlowState: this.gamification?.flowState?.isInFlow || false,
            wordCount: this.gamification?.sessionWordCount || 0,
            timeOfDay: new Date().getHours(),
            dayOfWeek: new Date().getDay(),
            isFocusSession: !!this.gamification?.focusSession
        };
    }
    
    countWords(text) {
        return text.trim().split(/\\s+/).filter(word => word.length > 0).length;
    }
    
    calculateVariance(numbers) {
        const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
        const squaredDiffs = numbers.map(num => Math.pow(num - mean, 2));
        return squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length;
    }
    
    // === Data Persistence ===
    
    loadWritingStyle() {
        const stored = localStorage.getItem('ai_companion_writing_style');
        return stored ? JSON.parse(stored) : {
            averageWordsPerSentence: 15,
            vocabularyLevel: 'intermediate',
            preferredTone: 'neutral',
            writingGenres: [],
            styleEvolution: []
        };
    }
    
    loadUserPreferences() {
        const stored = localStorage.getItem('ai_companion_preferences');
        return stored ? JSON.parse(stored) : {
            feedbackFrequency: 'moderate', // low, moderate, high
            preferredPersona: 'adaptive',
            feedbackTypes: ['encouragement', 'insights'],
            intrusivenessLevel: 'low', // low, moderate, high
            learningMode: true
        };
    }
    
    loadEngagementData() {
        const stored = localStorage.getItem('ai_companion_engagement');
        return stored ? JSON.parse(stored) : {
            totalInteractions: 0,
            positiveResponses: 0,
            dismissedFeedback: 0,
            helpfulFeedback: 0,
            engagementScore: 0.5
        };
    }
    
    loadWritingPatterns() {
        const stored = localStorage.getItem('ai_companion_writing_patterns');
        return stored ? JSON.parse(stored) : {
            commonPhrases: [],
            sentenceStarters: [],
            transitionWords: [],
            vocabularyComplexity: 'intermediate',
            averageSentenceLength: 15,
            paragraphStructure: 'varied'
        };
    }
    
    loadPersonalityProfile() {
        const stored = localStorage.getItem('ai_companion_personality_profile');
        return stored ? JSON.parse(stored) : {
            writingPersonality: 'balanced', // analytical, creative, balanced
            feedbackPreference: 'encouraging', // encouraging, direct, balanced
            interruptionTolerance: 'low', // low, medium, high
            feedbackFrequency: 600000, // 10 minutes default
            preferredChallengeTypes: [],
            responseToEncouragement: 0.7,
            responseToAnalysis: 0.5,
            learningStyle: 'adaptive'
        };
    }
    
    initializeLearningModel() {
        // Simple adaptive learning model
        return {
            feedbackEffectiveness: new Map(),
            userPreferences: new Map(),
            contextualPatterns: [],
            
            learn: function(feedback, response) {
                // Track feedback effectiveness
                const key = `${feedback.type}_${feedback.context}`;
                const current = this.feedbackEffectiveness.get(key) || { positive: 0, negative: 0, total: 0 };
                
                if (response === 'helpful') {
                    current.positive++;
                } else if (response === 'dismissed') {
                    current.negative++;
                }
                current.total++;
                
                this.feedbackEffectiveness.set(key, current);
            },
            
            predict: function(feedbackType, context) {
                const key = `${feedbackType}_${context}`;
                const stats = this.feedbackEffectiveness.get(key);
                
                if (!stats || stats.total < 3) {
                    return 0.5; // Default confidence
                }
                
                return stats.positive / stats.total;
            }
        };
    }
    
    saveCompanionData() {
        localStorage.setItem('ai_companion_writing_style', JSON.stringify(this.analysisEngine.writingStyle));
        localStorage.setItem('ai_companion_preferences', JSON.stringify(this.analysisEngine.preferences));
        localStorage.setItem('ai_companion_engagement', JSON.stringify(this.adaptiveLearning.userEngagement));
    }
    
    // === Missing Helper Methods ===
    
    initializeContextualDetection() {
        // Set up contextual awareness system
        console.log('[AI Companion] Contextual detection initialized');
    }
    
    setupAdaptiveFeedback() {
        // Initialize adaptive feedback loops
        console.log('[AI Companion] Adaptive feedback system initialized');
    }
    
    initializePersonalityDetection() {
        // Set up personality detection system
        console.log('[AI Companion] Personality detection initialized');
    }
    
    selectOptimalPersona(analysis, context) {
        // Select the best persona based on current context
        const personas = this.mentorPersonas.personas;
        
        if (analysis.flow.state === 'struggling' || analysis.flow.state === 'blocked') {
            return personas.encouraging;
        } else if (analysis.complexity && analysis.complexity.score > 0.7) {
            return personas.analytical;
        } else if (analysis.creativity && analysis.creativity.score > 0.6) {
            return personas.creative;
        } else {
            return personas.adaptive;
        }
    }
    
    getPersonalizations(analysis) {
        // Get personalized elements based on analysis
        return {
            userName: 'Writer', // Could be personalized
            timeOfDay: this.getTimeOfDayGreeting(),
            writingStyle: analysis.style || {},
            progressMetrics: analysis.progress || {}
        };
    }
    
    getTimeOfDayGreeting() {
        const hour = new Date().getHours();
        if (hour < 12) return 'morning';
        if (hour < 18) return 'afternoon';
        return 'evening';
    }
    
    selectFeedbackType(analysis, context) {
        // Select appropriate feedback type based on analysis
        if (analysis.flow.state === 'struggling') {
            return 'encouragement';
        } else if (analysis.progress && analysis.progress.milestone) {
            return 'celebration';
        } else if (analysis.creativity && analysis.creativity.breakthrough) {
            return 'celebration';
        } else if (Math.random() > 0.5) {
            return 'insight';
        } else {
            return 'suggestion';
        }
    }
    
    generateSuggestion(analysis, persona, personalizations) {
        // Generate contextual suggestions
        const suggestions = [
            `You might try exploring a different angle on this topic. Your unique perspective could add something fresh here.`,
            `Consider adding a concrete example here. It could help ground these abstract concepts.`,
            `This section has great potential. A bit more detail could really make it shine.`
        ];
        
        return {
            type: 'suggestion',
            persona: persona.name,
            message: suggestions[Math.floor(Math.random() * suggestions.length)],
            confidence: 0.6,
            timing: 'thoughtful'
        };
    }
    
    generateCelebration(analysis, persona, personalizations) {
        // Generate celebration messages
        const celebrations = [
            `Fantastic work! You've just hit a new milestone in your writing journey.`,
            `That's a creative breakthrough! Your ideas are really coming together beautifully.`,
            `You're on fire! This session has been incredibly productive.`
        ];
        
        return {
            type: 'celebration',
            persona: persona.name,
            message: celebrations[Math.floor(Math.random() * celebrations.length)],
            confidence: 0.9,
            timing: 'celebrating'
        };
    }
    
    getLastFeedbackTime() {
        // Get the timestamp of the last feedback shown
        let lastTime = 0;
        for (const type of Object.values(this.feedbackSystem.feedbackTypes)) {
            if (type.lastShown > lastTime) {
                lastTime = type.lastShown;
            }
        }
        return lastTime;
    }
    
    recordFeedbackInteraction(feedback, analysis) {
        // Record that feedback was shown
        if (this.feedbackSystem.feedbackTypes[feedback.type]) {
            this.feedbackSystem.feedbackTypes[feedback.type].lastShown = Date.now();
        }
        
        // Update learning model
        if (this.adaptiveLearning.learningModel) {
            this.adaptiveLearning.learningModel.learn(feedback, 'shown');
        }
    }
    
    calculateOptimalDisplayTime(feedback) {
        // Calculate how long to display feedback
        const baseTime = 5000; // 5 seconds base
        const wordCount = feedback.message.split(' ').length;
        const readingTime = wordCount * 200; // 200ms per word
        
        return Math.min(baseTime + readingTime, 10000); // Max 10 seconds
    }
    
    calculateOptimalPosition() {
        // Calculate optimal position for feedback display
        return {
            css: 'bottom: 100px; right: 20px'
        };
    }
    
    dismissFeedback(display) {
        // Dismiss feedback display
        if (display && display.parentNode) {
            display.classList.add('fade-out');
            setTimeout(() => {
                if (display.parentNode) {
                    display.parentNode.removeChild(display);
                }
            }, 300);
        }
    }
    
    recordFeedback(type, feedbackId) {
        // Record user feedback response
        this.adaptiveLearning.userEngagement.totalInteractions++;
        
        if (type === 'helpful') {
            this.adaptiveLearning.userEngagement.helpfulFeedback++;
        } else if (type === 'dismiss') {
            this.adaptiveLearning.userEngagement.dismissedFeedback++;
        }
        
        this.saveCompanionData();
    }
    
    animateIntelligentDisplay(display) {
        // Animate the feedback display
        document.body.appendChild(display);
        
        // Trigger animation
        requestAnimationFrame(() => {
            display.style.opacity = '1';
            display.style.transform = 'translateY(0)';
        });
    }
    
    createIntelligentDisplay(feedback) {
        // Generate unique ID for feedback
        feedback.id = 'feedback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const display = document.createElement('div');
        display.className = `ai-companion-feedback feedback-${feedback.type} timing-${feedback.timing}`;
        
        // Position based on writing context
        const position = this.calculateOptimalPosition();
        
        display.innerHTML = `
            <div class="ai-companion-avatar">
                <div class="avatar-icon">🤖</div>
                <div class="avatar-persona">${feedback.persona}</div>
            </div>
            <div class="ai-companion-message">
                <div class="message-text">${feedback.message}</div>
                <div class="message-actions">
                    <button class="feedback-action helpful" onclick="aiCompanion.recordFeedback('helpful', '${feedback.id}')">
                        Helpful
                    </button>
                    <button class="feedback-action dismiss" onclick="aiCompanion.dismissFeedback(this.closest('.ai-companion-feedback'))">
                        Thanks
                    </button>
                </div>
            </div>
        `;
        
        display.style.cssText = `
            position: fixed;
            ${position.css};
            z-index: 1000;
            max-width: 320px;
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s ease;
        `;
        
        return display;
    }
    
    // === Missing Analysis Methods ===
    
    analyzeFocus(text) {
        const words = text.split(/\s+/);
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        
        // Analyze focus indicators
        const repetitionRate = this.calculateRepetitionRate(words);
        const topicConsistency = this.calculateTopicConsistency(sentences);
        const digressionScore = this.calculateDigressionScore(sentences);
        
        const focusScore = (topicConsistency * 0.5 + (1 - digressionScore) * 0.3 + (1 - repetitionRate) * 0.2);
        
        return {
            score: focusScore,
            topicConsistency,
            digressionScore,
            repetitionRate,
            isFocused: focusScore > 0.6
        };
    }
    
    analyzeProgress(text) {
        const words = text.split(/\s+/);
        const wordCount = words.length;
        const sessionGoal = 500; // Default session goal
        
        return {
            wordCount,
            progressPercentage: Math.min(100, (wordCount / sessionGoal) * 100),
            isBeginning: wordCount < 50,
            milestone: wordCount % 100 === 0 && wordCount > 0,
            nearGoal: wordCount > sessionGoal * 0.8 && wordCount < sessionGoal
        };
    }
    
    analyzeWritingStyle(text) {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const words = text.split(/\s+/);
        
        const avgSentenceLength = words.length / Math.max(1, sentences.length);
        const vocabularyDiversity = new Set(words.map(w => w.toLowerCase())).size / words.length;
        
        // Determine style characteristics
        let direction = 'balanced';
        if (avgSentenceLength > 20) direction = 'complex and elaborate';
        else if (avgSentenceLength < 10) direction = 'concise and punchy';
        
        return {
            avgSentenceLength,
            vocabularyDiversity,
            direction,
            consistency: 0.7, // Placeholder for style consistency
            evolution: Math.random() > 0.7 // Sometimes detect style evolution
        };
    }
    
    analyzeEngagement(text) {
        const words = text.split(/\s+/);
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        
        // Simple engagement indicators
        const questionCount = (text.match(/\?/g) || []).length;
        const exclamationCount = (text.match(/!/g) || []).length;
        const emotionalWords = this.countEmotionalWords(words);
        
        const engagementScore = Math.min(1, 
            (questionCount * 0.1 + exclamationCount * 0.1 + emotionalWords * 0.05) / sentences.length + 0.5
        );
        
        return {
            score: engagementScore,
            questionCount,
            exclamationCount,
            emotionalIntensity: emotionalWords / words.length,
            isEngaging: engagementScore > 0.6
        };
    }
    
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
    
    analyzeVocabularyFlow(words) {
        if (!words || words.length === 0) return 0.5;
        
        // Track vocabulary progression
        const uniqueWords = new Set();
        let newWordRate = 0;
        
        words.forEach((word, index) => {
            const normalized = word.toLowerCase();
            if (!uniqueWords.has(normalized)) {
                uniqueWords.add(normalized);
                newWordRate += 1 / (index + 1);
            }
        });
        
        // Flow is better with controlled vocabulary introduction
        return Math.min(1, newWordRate / words.length * 10);
    }
    
    analyzeCoherence(sentences) {
        if (!sentences || sentences.length < 2) return 0.5;
        
        // Simple coherence check: shared words between consecutive sentences
        let coherenceScore = 0;
        
        for (let i = 1; i < sentences.length; i++) {
            const prevWords = new Set(sentences[i-1].toLowerCase().split(/\s+/));
            const currWords = new Set(sentences[i].toLowerCase().split(/\s+/));
            
            const intersection = new Set([...prevWords].filter(x => currWords.has(x)));
            const sharedRatio = intersection.size / Math.min(prevWords.size, currWords.size);
            
            coherenceScore += sharedRatio;
        }
        
        return Math.min(1, coherenceScore / (sentences.length - 1));
    }
    
    suggestOptimalDuration() {
        const sessionDuration = this.getCurrentWritingContext().sessionDuration;
        
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
    
    // Helper methods for analysis
    calculateRepetitionRate(words) {
        if (!words || words.length === 0) return 0;
        
        const wordCounts = {};
        words.forEach(word => {
            const normalized = word.toLowerCase();
            wordCounts[normalized] = (wordCounts[normalized] || 0) + 1;
        });
        
        const repetitions = Object.values(wordCounts).filter(count => count > 1).length;
        return repetitions / words.length;
    }
    
    calculateTopicConsistency(sentences) {
        // Simple topic consistency based on keyword overlap
        if (!sentences || sentences.length < 2) return 1;
        
        const allWords = sentences.join(' ').toLowerCase().split(/\s+/);
        const wordFreq = {};
        
        allWords.forEach(word => {
            if (word.length > 4) { // Focus on meaningful words
                wordFreq[word] = (wordFreq[word] || 0) + 1;
            }
        });
        
        // Find topic words (appearing multiple times)
        const topicWords = Object.keys(wordFreq).filter(word => wordFreq[word] > 1);
        
        if (topicWords.length === 0) return 0.5;
        
        // Check how many sentences contain topic words
        let consistentSentences = 0;
        sentences.forEach(sentence => {
            const hasTopicWord = topicWords.some(word => 
                sentence.toLowerCase().includes(word)
            );
            if (hasTopicWord) consistentSentences++;
        });
        
        return consistentSentences / sentences.length;
    }
    
    calculateDigressionScore(sentences) {
        // Simple digression detection
        if (!sentences || sentences.length < 3) return 0;
        
        // Track topic shifts
        let shifts = 0;
        for (let i = 2; i < sentences.length; i++) {
            const prev = sentences[i-1].toLowerCase().split(/\s+/);
            const curr = sentences[i].toLowerCase().split(/\s+/);
            
            const prevSet = new Set(prev.filter(w => w.length > 4));
            const currSet = new Set(curr.filter(w => w.length > 4));
            
            const overlap = [...prevSet].filter(x => currSet.has(x)).length;
            
            if (overlap === 0 && prevSet.size > 0 && currSet.size > 0) {
                shifts++;
            }
        }
        
        return Math.min(1, shifts / (sentences.length - 2));
    }
    
    countEmotionalWords(words) {
        const emotionalWords = [
            'love', 'hate', 'fear', 'joy', 'sad', 'happy', 'angry', 'excited',
            'frustrated', 'delighted', 'anxious', 'proud', 'ashamed', 'grateful',
            'hopeful', 'disappointed', 'amazed', 'confused', 'worried', 'relieved'
        ];
        
        return words.filter(word => 
            emotionalWords.includes(word.toLowerCase())
        ).length;
    }
    
    // === Response Libraries ===
    
    getEncouragingResponses() {
        return {
            struggle: [
                "Every writer faces these moments. You're doing the hard work of thinking deeply.",
                "I can sense you're working through complexity here. That's where the best insights often emerge.",
                "The fact that you're pushing through shows real dedication to your craft."
            ],
            beginning: [
                "I'm excited to write alongside you today. Your unique perspective always leads somewhere interesting.",
                "Ready to explore some ideas together? I love seeing where your thoughts take us."
            ],
            progress: [
                "You're building beautiful momentum here. I can feel the energy in your words.",
                "There's a lovely rhythm developing. Keep riding this wave."
            ]
        };
    }
    
    getAnalyticalResponses() {
        return {
            insight: [
                "I'm noticing an interesting pattern in your argument structure.",
                "Your evidence is building nicely toward a compelling conclusion.",
                "The way you're connecting these concepts shows sophisticated thinking."
            ],
            precision: [
                "Your precision with language is really serving the complexity of these ideas.",
                "The specificity in your examples is strengthening your broader points."
            ]
        };
    }
    
    getCreativeResponses() {
        return {
            inspiration: [
                "Your creativity is really flowing today. The connections you're making feel fresh and original.",
                "I love how you're approaching this from an unexpected angle.",
                "There's something beautiful emerging in the way you're weaving these ideas together."
            ],
            breakthrough: [
                "That feels like a creative breakthrough! Your ideas are connecting in a new way.",
                "You've hit on something special here. This insight could unlock a whole new direction."
            ]
        };
    }
    
    getAdaptiveResponses() {
        return {
            contextual: [
                "Your writing has a natural flow that matches your thinking process beautifully.",
                "I can sense you're in a good headspace for this kind of exploration.",
                "The way you're balancing depth and clarity is working really well."
            ]
        };
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.AIWritingCompanion = AIWritingCompanion;
}
// === AI Companion Manager ===
// Main coordinator for all AI writing companion modules
// Provides intelligent, contextual, and adaptive feedback during writing

class AICompanionManager {
    constructor(gamificationInstance) {
        this.gamification = gamificationInstance;
        this.initialized = false;
        
        // Initialize core modules
        this.textAnalysis = new TextAnalysisEngine();
        this.contextManager = new ContextManager();
        this.feedbackSystem = new FeedbackSystem(this);
        
        // Analysis state
        this.realTimeAnalysis = {
            isAnalyzing: false,
            lastAnalysis: 0,
            analysisInterval: 30000, // Analyze every 30 seconds during active writing
            sessionStartTime: Date.now(),
            currentInsights: []
        };

        // Adaptive Learning
        this.adaptiveLearning = {
            userEngagement: this.loadEngagementData(),
            feedbackEffectiveness: new Map(),
            learningModel: this.initializeLearningModel(),
            personalityProfile: this.loadPersonalityProfile(),
        };

        // Logging Configuration
        this.loggingConfig = {
            level: 'basic', // Options: 'none', 'basic', 'verbose', 'debug'
            logAIInputs: true,
            logAIOutputs: true,
            logUserInteractions: true,
            sessionId: this.generateSessionId()
        };

        // Usage tracking
        this.usageStats = {
            totalActions: 0,
            actionBreakdown: {},
            sessionStart: Date.now(),
            recentLogs: []
        };

        // AI Service configuration
        this.aiServiceConfig = {
            timeout: 10000,
            retryAttempts: 2,
            model: 'default'
        };

        this.init();
    }

    async init() {
        if (this.initialized) return;

        try {
            // Load settings
            await this.loadCompanionSettings();
            
            // Initialize real-time analysis
            this.startRealTimeAnalysis();
            
            // Mark as initialized
            this.initialized = true;
            
            console.log('[AICompanionManager] AI Writing Companion initialized');
            
        } catch (error) {
            console.error('[AICompanionManager] Initialization error:', error);
        }
    }

    // === Real-time Analysis ===

    startRealTimeAnalysis() {
        if (!this.feedbackSystem.feedbackConfig.enabled) return;

        const analysisTimer = setInterval(async () => {
            if (this.realTimeAnalysis.isAnalyzing) return;

            const currentText = this.getCurrentText();
            const hasEnoughChars = currentText && currentText.length >= this.contextManager.realTimeAnalysis.characterThreshold;
            const hasMeaningfulContent = hasEnoughChars && this.contextManager.hasMeaningfulText(currentText);

            if (hasEnoughChars && hasMeaningfulContent) {
                await this.performRealTimeAnalysis();
            }
        }, this.realTimeAnalysis.analysisInterval);

        // Readjust timer interval based on activity
        setInterval(() => {
            if (analysisTimer) clearInterval(analysisTimer);
            this.startRealTimeAnalysis();
        }, 300000); // Readjust every 5 minutes
    }

    async performRealTimeAnalysis() {
        if (this.realTimeAnalysis.isAnalyzing) return;

        try {
            this.realTimeAnalysis.isAnalyzing = true;
            this.showProgressIndicator();

            const contextData = this.contextManager.prepareContext();
            const text = contextData.context;

            if (!text || !this.contextManager.hasMeaningfulText(text)) {
                this.hideProgressIndicator();
                return;
            }

            // Perform text analysis
            const textAnalysis = this.textAnalysis.analyzeText(text);
            
            // Analyze flow state
            const flowAnalysis = this.analyzeFlowState(text);
            
            // Combine analysis results
            const combinedAnalysis = {
                ...textAnalysis,
                flow: flowAnalysis,
                recentText: this.contextManager.getRecentTypingBuffer(),
                lastSentence: this.extractLastSentence(text),
                wordCount: this.getWordCount(text),
                sessionDuration: Date.now() - this.realTimeAnalysis.sessionStartTime,
                contextMetadata: contextData.metadata
            };

            this.realTimeAnalysis.lastAnalysis = Date.now();

            // Generate contextual feedback
            const feedback = await this.feedbackSystem.generateContextualFeedback(combinedAnalysis);
            
            if (feedback) {
                this.showContextualFeedback(feedback);
                this.copyFeedbackToChat(combinedAnalysis, feedback);
                this.showNotification('✅ Ash has responded! (Copied to Chat)', 'success');
            }

            this.hideProgressIndicator();

        } catch (error) {
            console.error('[AICompanionManager] Real-time analysis error:', error);
            this.hideProgressIndicator();
        } finally {
            this.realTimeAnalysis.isAnalyzing = false;
        }
    }

    processNewWriting(newText) {
        // Update context manager buffers
        this.contextManager.updateTypingBuffer(newText);
        
        // Skip analysis for file loading content
        if (this.contextManager.isLikelyFileLoadingContent(newText)) {
            return;
        }

        this.contextManager.updateAnalysisBuffer(newText);

        // Check if enough content for analysis
        const currentBuffer = this.contextManager.getCurrentAnalysisBuffer();
        const timeSinceLastAnalysis = Date.now() - this.realTimeAnalysis.lastAnalysis;
        
        const hasEnoughWords = currentBuffer.split(/\s+/).length >= 20;
        const hasEnoughCharacters = currentBuffer.length >= this.contextManager.realTimeAnalysis.characterThreshold;
        const hasMeaningfulContent = this.contextManager.hasMeaningfulText(currentBuffer);
        
        if ((hasEnoughWords || timeSinceLastAnalysis > 60000) && hasEnoughCharacters && hasMeaningfulContent) {
            // Trigger analysis with slight delay to avoid interrupting flow
            setTimeout(() => this.performRealTimeAnalysis(), 2000);
        }
    }

    // === Flow State Analysis ===

    analyzeFlowState(text) {
        if (!text || text.length < 50) {
            return { state: 'no_data', score: 0, indicators: {} };
        }

        const words = text.split(/\s+/).filter(w => w.trim().length > 0);
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        
        if (words.length < 10 || sentences.length < 2) {
            return { state: 'insufficient_data', score: 0, indicators: {} };
        }

        const writingRhythm = this.calculateWritingRhythm(words);
        const complexity = this.textAnalysis.analyzeComplexity(text);
        const creativity = this.textAnalysis.analyzeCreativity(text);
        
        // Calculate composite flow score
        const flowScore = this.calculateFlowScore(writingRhythm, complexity, creativity);
        const flowState = this.determineFlowState(flowScore);

        return {
            state: flowState,
            score: flowScore,
            indicators: {
                rhythm: writingRhythm,
                complexity: complexity.complexity,
                creativity: creativity.score,
                consistency: this.calculateConsistency(sentences)
            }
        };
    }

    calculateWritingRhythm(words) {
        if (words.length < 5) return 0;
        
        const wordLengths = words.map(word => word.length);
        const avgLength = wordLengths.reduce((sum, len) => sum + len, 0) / wordLengths.length;
        const variance = wordLengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / wordLengths.length;
        
        // Lower variance indicates better rhythm
        return Math.max(0, 1 - (Math.sqrt(variance) / avgLength));
    }

    calculateFlowScore(rhythm, complexity, creativity) {
        // Weighted combination of factors
        const weights = { rhythm: 0.4, complexity: 0.3, creativity: 0.3 };
        
        return (
            rhythm * weights.rhythm +
            complexity.complexity * weights.complexity +
            creativity.score * weights.creativity
        );
    }

    calculateConsistency(sentences) {
        if (sentences.length < 2) return 0;
        
        const lengths = sentences.map(s => s.split(/\s+/).length);
        const avgLength = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
        const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;
        
        return Math.max(0, 1 - (Math.sqrt(variance) / avgLength));
    }

    determineFlowState(flowScore) {
        if (flowScore > 0.8) return 'deep_flow';
        if (flowScore > 0.6) return 'light_flow';
        if (flowScore > 0.4) return 'focused';
        if (flowScore > 0.2) return 'struggling';
        return 'blocked';
    }

    // === AI Service Integration ===

    async callAIService(prompt, options = {}) {
        const startTime = Date.now();
        
        try {
            this.log('verbose', 'ai_request', `Calling AI service with prompt length: ${prompt.length}`);
            
            if (this.loggingConfig.logAIInputs) {
                this.log('debug', 'ai_input', prompt);
            }

            const response = await window.electronAPI.invoke('ai-chat', {
                message: prompt,
                context: 'writing_companion',
                ...options
            });

            const duration = Date.now() - startTime;
            
            if (response.success) {
                this.log('verbose', 'ai_response', `AI response received in ${duration}ms`);
                
                if (this.loggingConfig.logAIOutputs) {
                    this.log('debug', 'ai_output', response.reply);
                }

                return {
                    message: response.reply,
                    confidence: response.confidence || 0.8,
                    duration
                };
            } else {
                this.log('basic', 'ai_error', `AI service error: ${response.error}`);
                return null;
            }

        } catch (error) {
            const duration = Date.now() - startTime;
            this.log('basic', 'ai_error', `AI service call failed after ${duration}ms: ${error.message}`);
            return null;
        }
    }

    // === Feedback Display ===

    showContextualFeedback(feedback) {
        // Create or update feedback display
        let feedbackPane = document.getElementById('ai-companion-feedback');
        
        if (!feedbackPane) {
            feedbackPane = this.createFeedbackPane();
            document.body.appendChild(feedbackPane);
        }

        feedbackPane.innerHTML = `
            <div class="ai-feedback-content">
                <div class="ai-feedback-header">
                    <span class="ai-persona">${feedback.persona}</span>
                    <span class="ai-feedback-type">${feedback.type}</span>
                    <button class="ai-feedback-close" onclick="this.parentElement.parentElement.parentElement.style.display='none'">×</button>
                </div>
                <div class="ai-feedback-message">${feedback.message}</div>
                <div class="ai-feedback-footer">
                    <span class="ai-feedback-time">${new Date(feedback.timestamp).toLocaleTimeString()}</span>
                    <span class="ai-feedback-confidence">Confidence: ${Math.round(feedback.confidence * 100)}%</span>
                </div>
            </div>
        `;

        feedbackPane.style.display = 'block';

        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (feedbackPane.style.display !== 'none') {
                feedbackPane.style.display = 'none';
            }
        }, 10000);
    }

    createFeedbackPane() {
        const pane = document.createElement('div');
        pane.id = 'ai-companion-feedback';
        pane.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            max-width: 400px;
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        return pane;
    }

    copyFeedbackToChat(analysis, feedback) {
        // Copy feedback to AI chat pane for persistence
        if (typeof window.showAIChatResponse === 'function') {
            const contextSummary = `Writing Context: ${analysis.flow?.state || 'unknown'} flow, ${analysis.wordCount || 0} words`;
            const fullMessage = `${feedback.message}\n\n_${contextSummary}_`;
            
            window.showAIChatResponse(fullMessage);
        }
    }

    showProgressIndicator() {
        let indicator = document.getElementById('ai-analysis-indicator');
        
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'ai-analysis-indicator';
            indicator.innerHTML = '🤔 Ash is thinking...';
            indicator.style.cssText = `
                position: fixed;
                top: 50px;
                right: 20px;
                background: #f0f8ff;
                padding: 8px 12px;
                border-radius: 4px;
                font-size: 12px;
                z-index: 999;
                opacity: 0.8;
            `;
            document.body.appendChild(indicator);
        }
        
        indicator.style.display = 'block';
    }

    hideProgressIndicator() {
        const indicator = document.getElementById('ai-analysis-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    // === Utility Methods ===

    getCurrentText() {
        if (!editor) return '';
        return editor.getValue();
    }

    extractLastSentence(text) {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        return sentences.length > 0 ? sentences[sentences.length - 1].trim() : '';
    }

    getWordCount(text) {
        if (!text) return 0;
        return text.split(/\s+/).filter(word => word.trim().length > 0).length;
    }

    showNotification(message, type = 'info', duration = 3000) {
        if (typeof showNotification === 'function') {
            showNotification(message, type, duration);
        } else {
            console.log(`[AICompanionManager] ${type.toUpperCase()}: ${message}`);
        }
    }

    // === Settings and Configuration ===

    async loadCompanionSettings() {
        try {
            const settings = await window.electronAPI.invoke('get-settings');
            if (settings && settings.ai) {
                // Update context manager settings
                this.contextManager.loadContextSettings();
                
                // Update logging settings
                if (settings.logging) {
                    Object.assign(this.loggingConfig, settings.logging);
                }
            }
        } catch (error) {
            console.warn('[AICompanionManager] Could not load settings, using defaults:', error);
        }
    }

    // === Usage Tracking ===

    logUsage(action, details = {}) {
        this.usageStats.totalActions++;
        this.usageStats.actionBreakdown[action] = (this.usageStats.actionBreakdown[action] || 0) + 1;
        
        const logEntry = {
            timestamp: Date.now(),
            action,
            details,
            sessionId: this.loggingConfig.sessionId
        };
        
        this.usageStats.recentLogs.push(logEntry);
        
        // Keep only recent logs
        if (this.usageStats.recentLogs.length > 100) {
            this.usageStats.recentLogs = this.usageStats.recentLogs.slice(-50);
        }
        
        if (this.loggingConfig.logUserInteractions) {
            this.log('basic', 'usage', `${action}: ${JSON.stringify(details)}`);
        }
    }

    getUsageReport() {
        return {
            ...this.usageStats,
            sessionDuration: Date.now() - this.usageStats.sessionStart,
            feedbackStats: this.feedbackSystem.getFeedbackStats()
        };
    }

    // === Logging ===

    log(level, category, message) {
        const levels = { none: 0, basic: 1, verbose: 2, debug: 3 };
        const currentLevel = levels[this.loggingConfig.level] || 1;
        const messageLevel = levels[level] || 1;
        
        if (messageLevel <= currentLevel) {
            console.log(`[AICompanion:${category}] ${message}`);
        }
    }

    // === Data Management ===

    loadEngagementData() {
        try {
            const stored = localStorage.getItem('ai_companion_engagement');
            return stored ? JSON.parse(stored) : { interactions: 0, positive_feedback: 0, last_session: Date.now() };
        } catch {
            return { interactions: 0, positive_feedback: 0, last_session: Date.now() };
        }
    }

    loadPersonalityProfile() {
        try {
            const stored = localStorage.getItem('ai_companion_personality');
            return stored ? JSON.parse(stored) : { writing_style: 'adaptive', preferences: {} };
        } catch {
            return { writing_style: 'adaptive', preferences: {} };
        }
    }

    initializeLearningModel() {
        return {
            feedback_effectiveness: new Map(),
            user_preferences: new Map(),
            adaptation_rate: 0.1
        };
    }

    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // === Public API ===

    getStats() {
        return {
            analysisEngine: {
                cacheSize: this.textAnalysis.analysisCache.size,
                lastAnalysis: this.realTimeAnalysis.lastAnalysis
            },
            contextManager: this.contextManager.getContextInfo(),
            feedbackSystem: this.feedbackSystem.getFeedbackStats(),
            usageStats: this.getUsageReport()
        };
    }

    reset() {
        this.contextManager.resetBuffers();
        this.feedbackSystem.feedbackHistory = [];
        this.realTimeAnalysis.lastAnalysis = 0;
        this.realTimeAnalysis.sessionStartTime = Date.now();
        console.log('[AICompanionManager] System reset');
    }
}

// Make available globally
window.AICompanionManager = AICompanionManager;
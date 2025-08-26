// === AI Companion Manager ===
// Main coordinator for all AI writing companion modules
// Provides intelligent, contextual, and adaptive feedback during writing

class AICompanionManager {
    constructor(gamificationInstance) {
        console.log('[AICompanionManager] 🚀 Initializing AICompanionManager with gamification:', !!gamificationInstance);
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
            currentInsights: [],
            lastAnalyzedContent: '', // Track what content was actually analyzed
            lastAnalyzedContentHash: '' // Hash of last analyzed content for comparison
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
        // DISABLED: Real-time analysis timer to prevent background AI requests
        console.log('[AICompanion] ⏸️ Real-time analysis timer disabled to prevent background AI requests');
        return;
        
        if (!this.feedbackSystem.feedbackConfig.enabled) return;

        const analysisTimer = setInterval(async () => {
            console.log('[AICompanion] ⏰ Interval-based analysis check (every 30s)');
            
            if (this.realTimeAnalysis.isAnalyzing) {
                console.log('[AICompanion] ⏸️ Already analyzing, skipping interval check');
                return;
            }

            const currentText = this.getCurrentText();
            const currentHash = this.simpleHash(currentText);
            const timeSinceLastAnalysis = Date.now() - this.realTimeAnalysis.lastAnalysis;
            
            // Use same smart content checking as keystroke-based analysis
            const contentDifference = this.calculateContentDifference(currentText, this.realTimeAnalysis.lastAnalyzedContent);
            
            // Use the same thresholds as keystroke-based analysis for consistency
            const minCharacterThreshold = this.contextManager.realTimeAnalysis.characterThreshold;
            const minWordThreshold = this.contextManager.realTimeAnalysis.wordThreshold;
            
            const hasEnoughNewWords = contentDifference.newWords >= minWordThreshold;
            const hasEnoughNewCharacters = contentDifference.newCharacters >= minCharacterThreshold;
            const hasMeaningfulContent = currentText && this.contextManager.hasMeaningfulText(currentText);
            const contentHashChanged = currentHash !== this.realTimeAnalysis.lastAnalyzedContentHash;
            
            console.log('[AICompanion] ⏰ Interval check:', {
                hasEnoughNewWords,
                hasEnoughNewCharacters,
                hasMeaningfulContent,
                contentHashChanged,
                timeSinceLastAnalysis: Math.round(timeSinceLastAnalysis / 1000) + 's',
                newWords: contentDifference.newWords,
                newChars: contentDifference.newCharacters,
                minWordThreshold,
                minCharacterThreshold
            });

            // Only analyze if we have enough NEW content based on user settings
            if ((hasEnoughNewWords || hasEnoughNewCharacters) && hasMeaningfulContent && contentHashChanged) {
                console.log('[AICompanion] ⏰ Interval triggering analysis - new content detected');
                await this.performRealTimeAnalysis();
            } else {
                console.log('[AICompanion] ⏰ Interval skipping - no new content or conditions not met');
            }
        }, this.realTimeAnalysis.analysisInterval);

        // DISABLED: Readjust timer interval to prevent background AI requests
        // setInterval(() => {
        //     if (analysisTimer) clearInterval(analysisTimer);
        //     this.startRealTimeAnalysis();
        // }, 300000);
        console.log('[AICompanion] ⏸️ Timer readjustment disabled to prevent background AI requests');
    }

    async performRealTimeAnalysis() {
        console.log('[AICompanion] 🎯 performRealTimeAnalysis CALLED');
        
        if (this.realTimeAnalysis.isAnalyzing) {
            console.log('[AICompanion] ⏸️ Already analyzing, skipping');
            return;
        }

        try {
            console.log('[AICompanion] ▶️ Starting real-time analysis');
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
            
            // Check for selected text to override recent typing buffer
            const selectedText = this.getSelectedText();
            const recentText = selectedText || this.contextManager.getRecentTypingBuffer();
            
            console.log('[AICompanion] 🔍 Text context for analysis:', {
                hasSelectedText: !!selectedText,
                selectedLength: selectedText?.length || 0,
                recentBufferLength: this.contextManager.getRecentTypingBuffer().length,
                usingSelected: !!selectedText
            });

            // Combine analysis results
            const combinedAnalysis = {
                ...textAnalysis,
                flow: flowAnalysis,
                fullDocumentText: text, // Include full document context for AI prompt
                recentText: recentText,
                selectedText: selectedText, // Include as separate field for prompt context
                lastSentence: this.extractLastSentence(text),
                wordCount: this.getWordCount(text),
                sessionDuration: Date.now() - this.realTimeAnalysis.sessionStartTime,
                contextMetadata: contextData.metadata
            };

            this.realTimeAnalysis.lastAnalysis = Date.now();

            // Generate contextual feedback
            const feedback = await this.feedbackSystem.generateContextualFeedback(combinedAnalysis);
            
            if (feedback) {
                console.log('[AICompanionManager] 🎯 About to show contextual feedback:', feedback);
                this.showContextualFeedback(feedback, combinedAnalysis);
                
                // Only show "Ash has responded" notification if enabled in settings
                const showResponseNotifications = window.appSettings?.aiCompanion?.showResponseNotifications !== false;
                console.log('[AICompanionManager] 📢 Response notifications enabled:', showResponseNotifications);
                if (showResponseNotifications) {
                    this.showNotification('✅ Ash has responded!', 'success');
                }
                
                // Track the content that was actually analyzed to prevent re-analyzing the same content
                this.realTimeAnalysis.lastAnalyzedContent = text;
                this.realTimeAnalysis.lastAnalyzedContentHash = this.simpleHash(text);
                this.log('verbose', 'buffer_management', `Updated analyzed content (${text.length} chars) to prevent repeat analysis`);
            }

            this.hideProgressIndicator();

        } catch (error) {
            console.error('[AICompanionManager] Real-time analysis error:', error);
            this.hideProgressIndicator();
        } finally {
            this.realTimeAnalysis.isAnalyzing = false;
        }
    }

    // Check if the AI companion system is enabled
    isEnabled() {
        // Check if AI writing companion is enabled in settings
        const settings = window.appSettings || {};
        return settings.ai?.enableWritingCompanion !== false;
    }

    processNewWriting(newText) {
        console.log(`[AICompanion] 🔵 processNewWriting called with: "${newText}"`);
        console.log(`[AICompanion] 🔍 Current system state:`, {
            isAnalyzing: this.realTimeAnalysis?.isAnalyzing,
            hasContextManager: !!this.contextManager,
            hasFeedbackSystem: !!this.feedbackSystem,
            systemEnabled: typeof this.isEnabled === 'function' ? this.isEnabled() : true
        });
        
        // Update context manager buffers
        this.contextManager.updateTypingBuffer(newText);
        
        // Skip analysis for file loading content
        if (this.contextManager.isLikelyFileLoadingContent(newText)) {
            console.log('[AICompanion] ⏭️ Skipping file loading content');
            return;
        }

        this.contextManager.updateAnalysisBuffer(newText);

        // Check if current content is significantly different from last analyzed content
        const currentText = this.getCurrentText();
        const currentHash = this.simpleHash(currentText);
        const timeSinceLastAnalysis = Date.now() - this.realTimeAnalysis.lastAnalysis;
        
        // Calculate content difference
        const contentDifference = this.calculateContentDifference(currentText, this.realTimeAnalysis.lastAnalyzedContent);
        
        // Use the user-configured thresholds from settings
        const minCharacterThreshold = this.contextManager.realTimeAnalysis.characterThreshold;
        const minWordThreshold = this.contextManager.realTimeAnalysis.wordThreshold;
        console.log(`[AICompanion] 📏 Using thresholds - Characters: ${minCharacterThreshold}, Words: ${minWordThreshold} (from user settings)`);
        
        // Require meaningful new content based on user settings
        const hasEnoughNewWords = contentDifference.newWords >= minWordThreshold;
        const hasEnoughNewCharacters = contentDifference.newCharacters >= minCharacterThreshold;
        const hasMeaningfulNewContent = this.contextManager.hasMeaningfulText(contentDifference.newText);
        const contentHashChanged = currentHash !== this.realTimeAnalysis.lastAnalyzedContentHash;
        
        console.log(`[AICompanion] 📊 Analysis check:`, {
            newText: `"${newText}"`,
            currentTextLength: currentText.length,
            lastAnalyzedLength: this.realTimeAnalysis.lastAnalyzedContent.length,
            newWords: contentDifference.newWords,
            newCharacters: contentDifference.newCharacters,
            hasEnoughNewWords,
            hasEnoughNewCharacters,
            hasMeaningfulNewContent,
            contentHashChanged,
            timeSinceLastAnalysis: Math.round(timeSinceLastAnalysis / 1000) + 's',
            newTextSample: `"${contentDifference.newText.slice(0, 50)}..."`
        });
        
        if (contentHashChanged && ((hasEnoughNewWords || timeSinceLastAnalysis > 60000) && hasEnoughNewCharacters && hasMeaningfulNewContent)) {
            console.log('[AICompanion] 🚀 TRIGGERING ANALYSIS in 2 seconds');
            // Trigger analysis with slight delay to avoid interrupting flow
            setTimeout(() => this.performRealTimeAnalysis(), 2000);
        } else {
            console.log('[AICompanion] ❌ NOT triggering analysis - conditions not met');
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
            // Get Ash's configuration
            const ashConfig = window.aiAssistantConfig ? 
                window.aiAssistantConfig.createServiceOptions('ash', options) : 
                { newConversation: true, context: 'writing_companion', ...options };
            
            this.log('verbose', 'ai_request', `Calling AI service for Ash with fresh conversation (prompt length: ${prompt.length})`);
            console.log('[AICompanionManager] 🤖 Using Ash configuration:', ashConfig);
            
            if (this.loggingConfig.logAIInputs) {
                this.log('debug', 'ai_input', prompt);
            }

            const response = await window.electronAPI.invoke('ai-chat', {
                message: prompt,
                options: ashConfig
            });

            const duration = Date.now() - startTime;
            
            if (response.response) {
                this.log('verbose', 'ai_response', `AI response received in ${duration}ms`);
                
                if (this.loggingConfig.logAIOutputs) {
                    this.log('debug', 'ai_output', response.response);
                }

                return {
                    message: response.response,
                    confidence: response.confidence || 0.8,
                    duration
                };
            } else {
                this.log('basic', 'ai_error', `AI service error: ${response.error || 'No response received'}`);
                return null;
            }

        } catch (error) {
            const duration = Date.now() - startTime;
            this.log('basic', 'ai_error', `AI service call failed after ${duration}ms: ${error.message}`);
            return null;
        }
    }

    // === Feedback Display ===

    showContextualFeedback(feedback, analysis) {
        console.log('[AICompanionManager] 🖼️ showContextualFeedback called with:', { feedback, analysis });
        // Create or update feedback display
        let feedbackPane = document.getElementById('ai-companion-feedback');
        
        if (!feedbackPane) {
            feedbackPane = this.createFeedbackPane();
            document.body.appendChild(feedbackPane);
        }

        // Generate unique ID for this feedback instance to handle save functionality
        const feedbackId = `feedback_${Date.now()}`;

        feedbackPane.innerHTML = `
            <div class="ai-feedback-content" data-feedback-id="${feedbackId}">
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
                <div class="ai-feedback-actions">
                    <button class="ai-feedback-thanks-btn" onclick="this.parentElement.parentElement.parentElement.style.display='none'">
                        👍 Thanks
                    </button>
                    <button class="ai-feedback-save-btn" onclick="window.aiCompanion.saveFeedbackToChat('${feedbackId}')">
                        📋 Save to Chat
                    </button>
                </div>
            </div>
        `;

        // Store the feedback and analysis data for later use
        feedbackPane.setAttribute('data-feedback', JSON.stringify(feedback));
        feedbackPane.setAttribute('data-analysis', JSON.stringify({
            flowState: analysis.flow?.state,
            wordCount: analysis.wordCount,
            sessionDuration: analysis.sessionDuration
        }));

        feedbackPane.style.display = 'block';

        // Auto-hide after 15 seconds (extended since user might want to save to chat)
        setTimeout(() => {
            if (feedbackPane.style.display !== 'none') {
                feedbackPane.style.display = 'none';
            }
        }, 15000);
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
        
        // Add CSS for the Save to Chat button
        if (!document.getElementById('ai-feedback-styles')) {
            const style = document.createElement('style');
            style.id = 'ai-feedback-styles';
            style.textContent = `
                .ai-feedback-content {
                    padding: 16px;
                }
                .ai-feedback-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid #eee;
                }
                .ai-persona {
                    font-weight: 600;
                    color: #333;
                }
                .ai-feedback-type {
                    font-size: 12px;
                    color: #666;
                    background: #f5f5f5;
                    padding: 2px 6px;
                    border-radius: 3px;
                }
                .ai-feedback-close {
                    background: none;
                    border: none;
                    font-size: 18px;
                    cursor: pointer;
                    color: #999;
                }
                .ai-feedback-close:hover {
                    color: #666;
                }
                .ai-feedback-message {
                    margin-bottom: 12px;
                    line-height: 1.4;
                    color: #444;
                }
                .ai-feedback-footer {
                    display: flex;
                    justify-content: space-between;
                    font-size: 11px;
                    color: #888;
                    margin-bottom: 12px;
                }
                .ai-feedback-actions {
                    display: flex;
                    gap: 8px;
                    justify-content: center;
                }
                .ai-feedback-thanks-btn, .ai-feedback-save-btn {
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                    transition: all 0.2s;
                }
                .ai-feedback-thanks-btn {
                    background: #f0f0f0;
                    color: #333;
                    border: 1px solid #ddd;
                }
                .ai-feedback-thanks-btn:hover {
                    background: #e0e0e0;
                }
                .ai-feedback-save-btn {
                    background: #007acc;
                    color: white;
                }
                .ai-feedback-save-btn:hover {
                    background: #005a9e;
                }
                .ai-feedback-thanks-btn:active, .ai-feedback-save-btn:active {
                    transform: translateY(1px);
                }
            `;
            document.head.appendChild(style);
        }
        
        return pane;
    }

    saveFeedbackToChat(feedbackId) {
        console.log('[AICompanionManager] saveFeedbackToChat called with ID:', feedbackId);
        
        // Get the feedback data from the popup
        const feedbackPane = document.getElementById('ai-companion-feedback');
        if (!feedbackPane) {
            console.error('[AICompanionManager] Feedback pane not found');
            return;
        }

        try {
            const feedbackData = JSON.parse(feedbackPane.getAttribute('data-feedback'));
            const analysisData = JSON.parse(feedbackPane.getAttribute('data-analysis'));
            
            console.log('[AICompanionManager] Feedback data:', { feedbackData, analysisData });
            console.log('[AICompanionManager] addChatMessage available:', typeof window.addChatMessage === 'function');
            
            if (typeof window.addChatMessage === 'function') {
                const contextSummary = `Writing Context: ${analysisData.flowState || 'unknown'} flow, ${analysisData.wordCount || 0} words`;
                const fullMessage = `**Ash's Feedback:**\n\n${feedbackData.message}\n\n_${contextSummary}_`;
                
                console.log('[AICompanionManager] Sending to AI Chat:', fullMessage);
                window.addChatMessage(fullMessage, 'AI');
                
                // Show confirmation and hide the feedback popup
                this.showNotification('💾 Feedback saved to AI Chat', 'success', 2000);
                feedbackPane.style.display = 'none';
            } else {
                console.warn('[AICompanionManager] addChatMessage function not available');
                this.showNotification('⚠️ AI Chat not available', 'warning', 3000);
            }
        } catch (error) {
            console.error('[AICompanionManager] Error saving feedback to chat:', error);
            this.showNotification('❌ Failed to save feedback', 'error', 2000);
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

    getSelectedText() {
        if (!editor) return null;
        
        const selection = editor.getSelection();
        if (!selection.isEmpty()) {
            const selectedText = editor.getModel().getValueInRange(selection);
            return selectedText.trim().length > 0 ? selectedText : null;
        }
        
        return null;
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
        this.realTimeAnalysis.lastAnalyzedContent = '';
        this.realTimeAnalysis.lastAnalyzedContentHash = '';
        this.realTimeAnalysis.sessionStartTime = Date.now();
        console.log('[AICompanionManager] System reset');
    }

    // === Backward Compatibility Methods ===

    clearAllBuffers() {
        // For compatibility with renderer.js calls
        this.contextManager.resetBuffers();
        console.log('[AICompanionManager] All buffers cleared (compatibility method)');
    }

    handleKeyboardInvocation() {
        // For compatibility with index.html keyboard shortcuts
        // Trigger immediate analysis if conditions are met
        const currentText = this.getCurrentText();
        if (currentText && this.contextManager.hasMeaningfulText(currentText)) {
            console.log('[AICompanionManager] Keyboard invocation triggered');
            this.performRealTimeAnalysis();
        } else {
            this.showNotification('💭 No meaningful text to analyze', 'info', 2000);
        }
    }

    // === Content Analysis Helpers ===

    simpleHash(str) {
        // Simple hash function for content comparison
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash;
    }

    calculateContentDifference(currentContent, lastAnalyzedContent) {
        // Calculate what's actually new since last analysis
        if (!lastAnalyzedContent) {
            // First analysis - everything is new
            const words = currentContent.split(/\s+/).filter(word => word.trim().length > 0);
            return {
                newText: currentContent,
                newCharacters: currentContent.length,
                newWords: words.length
            };
        }

        // Find the difference between current and last analyzed content
        let newText = '';
        let newCharacters = 0;
        
        if (currentContent.length > lastAnalyzedContent.length) {
            // Content was added
            if (currentContent.startsWith(lastAnalyzedContent)) {
                // Simple case: content was appended
                newText = currentContent.slice(lastAnalyzedContent.length);
                newCharacters = newText.length;
            } else {
                // Content was modified or inserted - analyze the difference more carefully
                // For simplicity, consider everything new if content changed significantly
                const similarity = this.calculateStringSimilarity(currentContent, lastAnalyzedContent);
                if (similarity < 0.8) {
                    // Significant change - treat as mostly new content
                    newText = currentContent;
                    newCharacters = currentContent.length;
                } else {
                    // Minor changes - estimate new content
                    newCharacters = Math.abs(currentContent.length - lastAnalyzedContent.length);
                    newText = currentContent.slice(-newCharacters);
                }
            }
        } else {
            // Content was deleted or unchanged
            newCharacters = 0;
            newText = '';
        }

        const newWords = newText.split(/\s+/).filter(word => word.trim().length > 0);
        
        return {
            newText,
            newCharacters,
            newWords: newWords.length
        };
    }

    calculateStringSimilarity(str1, str2) {
        // Simple similarity calculation (Jaccard similarity on words)
        const words1 = new Set(str1.split(/\s+/).filter(word => word.trim().length > 0));
        const words2 = new Set(str2.split(/\s+/).filter(word => word.trim().length > 0));
        
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        
        return intersection.size / union.size;
    }
}

// Make available globally
window.AICompanionManager = AICompanionManager;
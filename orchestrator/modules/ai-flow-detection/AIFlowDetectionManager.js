// === AI Flow Detection Manager ===
// Main coordinator for AI-powered flow state detection system

class AIFlowDetectionManager {
    constructor(aiCompanion = null, gamification = null) {
        this.aiCompanion = aiCompanion;
        this.gamification = gamification;
        this.initialized = false;
        
        // Initialize core modules
        this.textCollectionManager = new TextCollectionManager();
        this.typingPatternAnalyzer = new TypingPatternAnalyzer();
        this.cognitiveLoadAssessment = new CognitiveLoadAssessment();
        this.flowStateEngine = new FlowStateEngine();
        this.insightsEngine = new InsightsEngine();
        this.flowIndicatorUI = new FlowIndicatorUI();
        
        // Module coordination
        this.updateDebounceTimeout = null;
        this.updateDebounceDelay = 800; // 800ms debouncing
        this.lastFullAnalysis = 0;
        this.analysisInterval = 5000; // Full analysis every 5 seconds
        
        // Content change detection to prevent unnecessary AI calls
        this.lastContentHash = '';
        this.textChangeThreshold = 10; // Minimum character change to trigger AI analysis
        
        // Integration hooks
        this.eventListeners = new Map();
        
        this.init();
    }

    // Initialize the flow detection system
    async init() {
        try {
            console.log('[AIFlowDetectionManager] Initializing flow detection system...');
            
            // Set up editor integration
            this.setupEditorIntegration();
            
            // Set up periodic analysis
            this.setupPeriodicAnalysis();
            
            // Initialize content hash with current text
            const initialContext = this.gatherAnalysisContext();
            this.lastContentHash = this.hashString(initialContext.recentText || '');
            console.log('[AIFlowDetectionManager] Initial content hash set:', this.lastContentHash);
            
            // Activate flow detection
            this.flowStateEngine.activate();
            
            this.initialized = true;
            console.log('[AIFlowDetectionManager] Flow detection system initialized successfully');
            
            // Notify other systems
            this.dispatchEvent('flowDetectionInitialized', { initialized: true });
            
        } catch (error) {
            console.error('[AIFlowDetectionManager] Initialization failed:', error);
            this.initialized = false;
        }
    }

    // Set up editor integration for real-time analysis
    setupEditorIntegration() {
        // Monitor Monaco editor if available
        if (window.editor && typeof window.editor.onDidChangeModelContent === 'function') {
            window.editor.onDidChangeModelContent((e) => {
                this.handleEditorChange(e);
            });
            console.log('[AIFlowDetectionManager] Monaco editor integration active');
        }
        
        // Monitor typing events on document
        document.addEventListener('keydown', (e) => {
            this.handleKeystroke(e);
        });
        
        // Monitor text content changes
        document.addEventListener('input', (e) => {
            if (e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') {
                this.handleTextInput(e);
            }
        });
        
        console.log('[AIFlowDetectionManager] Editor integration configured');
    }

    // Set up periodic full analysis
    setupPeriodicAnalysis() {
        setInterval(() => {
            this.performFullAnalysis();
        }, this.analysisInterval);
        
        console.log('[AIFlowDetectionManager] Periodic analysis configured');
    }

    // Handle editor content changes
    handleEditorChange(changeEvent) {
        if (!this.initialized) return;
        
        try {
            const editor = window.editor;
            const model = editor.getModel();
            
            if (model) {
                const content = model.getValue();
                const fileName = window.currentFilePath || 'untitled';
                
                // Update text collection
                this.textCollectionManager.updateFileContent(fileName, content);
                
                // Get recent changes for pattern analysis
                const position = editor.getPosition();
                const lineContent = model.getLineContent(position.lineNumber);
                this.textCollectionManager.updateRecentText(content.slice(-200));
                
                // Debounced analysis update
                this.scheduleAnalysisUpdate();
            }
        } catch (error) {
            console.warn('[AIFlowDetectionManager] Editor change handling error:', error);
        }
    }

    // Handle individual keystrokes
    handleKeystroke(keyEvent) {
        if (!this.initialized) return;
        
        const timestamp = Date.now();
        const keyInfo = {
            key: keyEvent.key,
            type: this.categorizeKeystroke(keyEvent),
            ctrlKey: keyEvent.ctrlKey,
            altKey: keyEvent.altKey,
            metaKey: keyEvent.metaKey
        };
        
        // Record keystroke for pattern analysis
        this.typingPatternAnalyzer.recordKeystroke(timestamp, keyInfo);
        
        // Schedule analysis update
        this.scheduleAnalysisUpdate();
    }

    // Handle text input events
    handleTextInput(inputEvent) {
        if (!this.initialized) return;
        
        const text = inputEvent.target.value || inputEvent.target.textContent || '';
        this.textCollectionManager.updateRecentText(text);
        
        this.scheduleAnalysisUpdate();
    }

    // Categorize keystroke type
    categorizeKeystroke(keyEvent) {
        if (keyEvent.key === 'Backspace' || keyEvent.key === 'Delete') return 'delete';
        if (keyEvent.key === ' ') return 'space';
        if (keyEvent.key === 'Enter') return 'enter';
        if (keyEvent.key.length === 1) return 'input';
        return 'control';
    }

    // Schedule debounced analysis update
    scheduleAnalysisUpdate() {
        if (this.updateDebounceTimeout) {
            clearTimeout(this.updateDebounceTimeout);
        }
        
        this.updateDebounceTimeout = setTimeout(() => {
            this.performAnalysisUpdate();
        }, this.updateDebounceDelay);
    }

    // Perform quick analysis update
    async performAnalysisUpdate() {
        if (!this.initialized) return;
        
        try {
            // Get current metrics from all modules
            const analysisContext = this.gatherAnalysisContext();
            
            // Calculate flow score
            const flowScore = this.flowStateEngine.calculateFlowScore({
                typingMetrics: this.typingPatternAnalyzer.getFlowMetrics(),
                cognitiveMetrics: this.cognitiveLoadAssessment.getFlowMetrics(),
                contextMetrics: this.textCollectionManager.getAnalysisContext(),
                textMetrics: analysisContext
            });
            
            // Update UI indicator
            const flowState = this.flowStateEngine.getCurrentFlowState();
            this.flowIndicatorUI.updateIndicator(flowScore, flowState);
            
            // Generate insights periodically
            if (Date.now() - this.lastFullAnalysis > this.analysisInterval) {
                await this.performFullAnalysis();
            }
            
        } catch (error) {
            console.warn('[AIFlowDetectionManager] Analysis update error:', error);
        }
    }

    // Perform comprehensive analysis with insights
    async performFullAnalysis(options = {}) {
        if (!this.initialized) return;
        
        // Check if flow detection is temporarily disabled
        if (this._temporarilyDisabled) {
            console.log('[AIFlowDetectionManager] ⏸️ Temporarily disabled - skipping analysis');
            return;
        }
        
        try {
            this.lastFullAnalysis = Date.now();
            
            // Gather comprehensive context
            const analysisContext = this.gatherAnalysisContext();
            
            // Check if content has changed significantly to warrant AI analysis
            const currentContent = analysisContext.recentText || '';
            const currentContentHash = this.hashString(currentContent);
            const contentChanged = currentContentHash !== this.lastContentHash;
            
            // Allow bypass for explicit requests (like statistics panel)
            const isExplicitRequest = options.explicitRequest || options.bypassFlowDetection;
            
            if (contentChanged || isExplicitRequest) {
                if (isExplicitRequest) {
                    console.log('[AIFlowDetectionManager] ✅ Explicit request detected - bypassing content change detection');
                } else {
                    console.log('[AIFlowDetectionManager] ✅ Content change detected - proceeding with AI analysis');
                }
                this.lastContentHash = currentContentHash;
            } else {
                console.log('[AIFlowDetectionManager] ⏸️ No content changes - skipping AI insights generation');
            }
            
            // Perform cognitive load assessment
            if (analysisContext.recentText) {
                this.cognitiveLoadAssessment.assessCognitiveLoad(analysisContext.recentText, analysisContext);
            }
            
            // Calculate flow metrics
            const flowMetrics = {
                typingMetrics: this.typingPatternAnalyzer.getFlowMetrics(),
                cognitiveMetrics: this.cognitiveLoadAssessment.getFlowMetrics(),
                contextMetrics: analysisContext,
                flowState: this.flowStateEngine.getCurrentFlowState(),
                flowScore: this.flowStateEngine.flowEngine.currentFlowScore
            };
            
            // Generate AI insights if content changed OR explicit request, and AI companion is available
            let insights = null;
            if ((contentChanged || isExplicitRequest) && this.aiCompanion && typeof this.aiCompanion.callAIService === 'function') {
                // Check if the AI companion's auto-invocation is enabled
                if (this.aiCompanion.isAutoInvocationEnabled && !this.aiCompanion.isAutoInvocationEnabled()) {
                    console.log('[AIFlowDetectionManager] ⏸️ AI companion auto-invocation disabled - skipping AI insights');
                } else {
                    const aiService = {
                        sendMessage: (message, options) => this.aiCompanion.callAIService(message, options)
                    };
                    insights = await this.insightsEngine.generateInsights(analysisContext, aiService);
                }
            }
            
            // Notify systems of analysis completion
            this.dispatchEvent('analysisCompleted', {
                flowMetrics,
                insights,
                contentChanged,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('[AIFlowDetectionManager] Full analysis error:', error);
        }
    }

    // Gather analysis context from all modules
    gatherAnalysisContext() {
        const textState = this.textCollectionManager.getState();
        const typingState = this.typingPatternAnalyzer.getState();
        const cognitiveState = this.cognitiveLoadAssessment.getState();
        const flowState = this.flowStateEngine.getState();
        
        return {
            // Text analysis
            recentText: textState.recentText,
            lastSentence: textState.lastSentence,
            currentFile: textState.currentFile,
            textMetrics: {
                typingVelocity: textState.typingVelocity,
                compositionPatterns: textState.compositionPatterns
            },
            
            // Typing patterns
            typingMetrics: typingState.flowMetrics,
            
            // Cognitive load
            cognitiveMetrics: cognitiveState.flowMetrics,
            
            // Flow state
            flowMetrics: {
                currentState: flowState.currentState,
                currentScore: flowState.currentFlowScore,
                stateDuration: flowState.insights?.stateDuration || 0,
                recentTrend: flowState.insights?.recentTrend || 0
            }
        };
    }

    // Get comprehensive system state
    getSystemState() {
        if (!this.initialized) {
            return { initialized: false };
        }
        
        return {
            initialized: true,
            textCollection: this.textCollectionManager.getState(),
            typingPatterns: this.typingPatternAnalyzer.getState(),
            cognitiveLoad: this.cognitiveLoadAssessment.getState(),
            flowState: this.flowStateEngine.getState(),
            insights: this.insightsEngine.getState(),
            indicator: this.flowIndicatorUI.getState()
        };
    }

    // Get current flow insights
    getFlowInsights() {
        return this.flowStateEngine.getFlowInsights();
    }

    // Get display insights
    getDisplayInsights(limit = 3) {
        return this.insightsEngine.getDisplayInsights(limit);
    }

    // Manual flow analysis trigger
    async triggerAnalysis() {
        console.log('[AIFlowDetectionManager] Manual analysis triggered');
        await this.performFullAnalysis();
    }

    // Event system for module communication
    addEventListener(eventType, callback) {
        if (!this.eventListeners.has(eventType)) {
            this.eventListeners.set(eventType, []);
        }
        this.eventListeners.get(eventType).push(callback);
    }

    dispatchEvent(eventType, data) {
        if (this.eventListeners.has(eventType)) {
            this.eventListeners.get(eventType).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.warn('[AIFlowDetectionManager] Event callback error:', error);
                }
            });
        }
    }

    // Clear all analysis data
    clearAnalysisData() {
        this.textCollectionManager.clear();
        this.typingPatternAnalyzer.reset();
        this.cognitiveLoadAssessment.reset();
        this.flowStateEngine.reset();
        this.insightsEngine.reset();
        
        console.log('[AIFlowDetectionManager] Analysis data cleared');
    }

    // Stop flow detection
    stop() {
        this.initialized = false;
        this.flowStateEngine.deactivate();
        
        if (this.updateDebounceTimeout) {
            clearTimeout(this.updateDebounceTimeout);
        }
        
        console.log('[AIFlowDetectionManager] Flow detection stopped');
    }

    // Restart flow detection
    restart() {
        this.stop();
        this.clearAnalysisData();
        this.init();
    }

    // Simple hash function for content change detection
    hashString(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash;
    }

    // Debug utilities for development
    getDebugInfo() {
        return {
            systemState: this.getSystemState(),
            analysisContext: this.gatherAnalysisContext(),
            flowInsights: this.getFlowInsights(),
            displayInsights: this.getDisplayInsights()
        };
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.AIFlowDetectionManager = AIFlowDetectionManager;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIFlowDetectionManager;
}
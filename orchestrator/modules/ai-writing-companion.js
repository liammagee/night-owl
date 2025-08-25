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
        
        // Keystroke tracking for AI insight frequency control
        this.keystrokeTracking = {
            count: 0, // Total keystrokes since last AI insight
            lastAIInsightTime: 0, // Timestamp when AI insight was last generated
            threshold: this.analysisEngine.preferences.aiInsightKeystrokeThreshold || 100
        };
        
        // Context Configuration (will be loaded from settings)
        this.contextConfig = {
            scope: 'full_document', // Options: 'full_document', 'recent_text_only', 'selected_text_only'
            maxFullDocumentLength: 10000, // Maximum characters to send as full context (performance limit)
            recentTextLength: 500, // Length of recent text to use when scope is 'recent_text_only'
            includeLineNumbers: false, // Whether to include line numbers in context
            preserveFormatting: true, // Whether to preserve markdown formatting in context
        };
        
        // Load context configuration from settings
        this.loadContextSettings();
        
        // Logging Configuration
        this.loggingConfig = {
            level: 'basic', // Options: 'none', 'basic', 'verbose', 'debug'
            logAIInputs: true, // Whether to log full AI prompts
            logAIOutputs: true, // Whether to log AI responses
            logContextPreparation: false, // Whether to log context preparation details
            logAnalysisSteps: false, // Whether to log analysis step details
            logUserInteractions: true, // Whether to log user interactions
            logPerformanceMetrics: false, // Whether to log performance timing
        };
        
        // Real-time Analysis
        this.realTimeAnalysis = {
            isAnalyzing: false,
            analysisBuffer: [], // Store recent writing for analysis
            bufferSize: 200, // Words to analyze at once
            analysisInterval: 30000, // Analyze every 30 seconds during active writing
            lastAnalysis: 0,
            currentInsights: [],
            recentTypingBuffer: '', // Buffer to track last ~150 characters as they're typed
            maxTypingBufferSize: 150, // Maximum characters to keep in typing buffer
            characterThreshold: 20, // Minimum characters typed before triggering AI analysis
            lastContentHash: null, // Track content changes to prevent unnecessary AI calls
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
                    name: 'Ash',
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
                    name: 'Ash',
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
        
        // Load settings first
        await this.loadCompanionSettings();
        
        try {
            console.log('[AI Companion] Initializing intelligent writing companion...');
            
            // Log initialization
            this.logUsage('companion_initialized', {
                userPreferences: this.analysisEngine.preferences,
                enabledFeatures: Object.keys(this.feedbackSystem.feedbackTypes)
            });
            
            // Initialize analysis systems
            this.startRealTimeAnalysis();
            this.initializeContextualDetection();
            
            // Set up adaptive feedback loops
            this.setupAdaptiveFeedback();
            
            // Initialize personality detection
            this.initializePersonalityDetection();
            
            // Setup keystroke tracking for AI insight frequency control
            this.setupKeystrokeTracking();
            
            this.initialized = true;
            console.log('[AI Companion] AI Writing Companion initialized successfully');
            
        } catch (error) {
            console.error('[AI Companion] Initialization failed:', error);
        }
    }
    
    // === Keystroke Tracking for AI Insight Frequency Control ===
    
    setupKeystrokeTracking() {
        // Set up keystroke counting for both Monaco editor and textarea
        const trackKeystroke = () => {
            this.keystrokeTracking.count++;
            console.log(`[AI Companion] Keystroke count: ${this.keystrokeTracking.count}/${this.keystrokeTracking.threshold}`);
        };
        
        // Monaco editor keystroke tracking
        if (window.editor && window.editor.onKeyDown) {
            window.editor.onKeyDown(trackKeystroke);
        }
        
        // Textarea fallback keystroke tracking
        const textarea = document.querySelector('#editor-textarea');
        if (textarea) {
            textarea.addEventListener('keydown', trackKeystroke);
        }
        
        // Set up listener for when Monaco editor becomes available later
        const checkForMonaco = () => {
            if (window.editor && window.editor.onKeyDown && !this.monacoKeystrokeSetup) {
                window.editor.onKeyDown(trackKeystroke);
                this.monacoKeystrokeSetup = true;
                console.log('[AI Companion] Keystroke tracking set up for Monaco editor');
            }
        };
        
        // Check periodically for Monaco editor
        setInterval(checkForMonaco, 1000);
    }
    
    // Check if enough keystrokes have occurred since last AI insight
    hasMetKeystrokeThreshold() {
        const preferences = this.loadUserPreferences();
        const threshold = preferences.aiInsightKeystrokeThreshold || 100;
        
        // Update threshold if preferences changed
        if (this.keystrokeTracking.threshold !== threshold) {
            this.keystrokeTracking.threshold = threshold;
        }
        
        return this.keystrokeTracking.count >= threshold;
    }
    
    // Reset keystroke counter after AI insight is generated
    resetKeystrokeCounter() {
        this.keystrokeTracking.count = 0;
        this.keystrokeTracking.lastAIInsightTime = Date.now();
        console.log('[AI Companion] Keystroke counter reset after AI insight generation');
    }
    
    // === Real-time Writing Analysis ===
    
    startRealTimeAnalysis() {
        // Monitor writing activity and provide contextual feedback
        let lastContent = '';
        let analysisTimer = null;
        
        const analyzeWriting = () => {
            if (!this.feedbackSystem.enabled) return;
            
            console.log('[AI Companion] ⏰ Timer-based analysis triggered');
            
            // Don't use timer-based content comparison anymore since we have real-time capture
            // Only trigger analysis if we have enough meaningful content in our real-time buffer
            const currentBuffer = this.realTimeAnalysis.recentTypingBuffer;
            const hasEnoughChars = currentBuffer.length >= this.realTimeAnalysis.characterThreshold;
            const hasMeaningfulContent = this.hasMeaningfulText(currentBuffer);
            
            if (hasEnoughChars && hasMeaningfulContent) {
                console.log('[AI Companion] ⏰ Timer triggering analysis with meaningful real-time buffer');
                this.performContextualAnalysis();
            } else {
                const reason = !hasEnoughChars ? 
                    `insufficient characters (${currentBuffer.length}/${this.realTimeAnalysis.characterThreshold})` :
                    'no meaningful content detected';
                console.log('[AI Companion] ⏰ Timer skipped -', reason, '- buffer:', JSON.stringify(currentBuffer.substring(0, 50)));
            }
        };
        
        // Store last content hash to detect actual changes
        const initialContent = this.getCurrentWritingContent();
        let lastContentHash = this.hashString(initialContent);
        
        // DISABLED: Timer-based analysis to prevent automatic AI requests
        // AI Writing Companion should only respond to explicit user requests or character thresholds
        console.log('[AI Companion] ⏸️ Timer-based analysis disabled - only manual invocation and character thresholds will trigger AI');
    }
    
    processNewWriting(newText) {
        this.log('verbose', 'user', 'New text received:', newText);
        
        // CRITICAL: Reject content that looks like file loading or bulk content changes
        if (this.isLikelyFileLoadingContent(newText)) {
            console.log('[AI Companion] 🚫 Rejecting content that appears to be from file loading or bulk changes');
            console.log('[AI Companion] 🚫 Rejected content preview:', JSON.stringify(newText.substring(0, 100)));
            return;
        }
        
        // Check if auto-invocation requires actual text changes
        const settings = this.loadUserPreferences();
        if (settings.requireTextChanges && !this.hasRecentTypingActivity()) {
            console.log('[AI Companion] ⏸️ Skipping processing - no recent typing activity detected');
            return;
        }
        
        // Add new text to the real-time typing buffer
        this.realTimeAnalysis.recentTypingBuffer += newText;
        
        // Keep typing buffer at manageable size (last ~150 characters)
        if (this.realTimeAnalysis.recentTypingBuffer.length > this.realTimeAnalysis.maxTypingBufferSize) {
            const beforeTrim = this.realTimeAnalysis.recentTypingBuffer.length;
            // Keep only the last maxTypingBufferSize characters
            this.realTimeAnalysis.recentTypingBuffer = this.realTimeAnalysis.recentTypingBuffer.slice(-this.realTimeAnalysis.maxTypingBufferSize);
            console.log('[AI Companion] ✂️ Trimmed typing buffer from', beforeTrim, 'to', this.realTimeAnalysis.recentTypingBuffer.length, 'characters');
        }
        
        console.log('[AI Companion] 📦 Current typing buffer:', JSON.stringify(this.realTimeAnalysis.recentTypingBuffer));
        
        // Add to analysis buffer for broader analysis
        this.realTimeAnalysis.analysisBuffer.push({
            text: newText,
            timestamp: Date.now(),
            context: this.getCurrentWritingContext()
        });
        
        // Keep buffer at manageable size
        if (this.realTimeAnalysis.analysisBuffer.length > this.realTimeAnalysis.bufferSize) {
            this.realTimeAnalysis.analysisBuffer.shift();
        }
        
        // Trigger analysis if enough new content - reduced thresholds for testing
        const totalNewWords = this.realTimeAnalysis.analysisBuffer
            .reduce((count, entry) => count + this.countWords(entry.text), 0);
        
        console.log('[AI Companion] 📊 Analysis trigger check - words:', totalNewWords, 'time since last:', Date.now() - this.realTimeAnalysis.lastAnalysis);
        
        // Trigger analysis based on word count or time, but also check character threshold and meaningful content
        const currentBuffer = this.realTimeAnalysis.recentTypingBuffer;
        const hasEnoughCharacters = currentBuffer.length >= this.realTimeAnalysis.characterThreshold;
        const hasMeaningfulContent = this.hasMeaningfulText(currentBuffer);
        const hasEnoughWords = totalNewWords >= 10;
        const timeSinceLastAnalysis = Date.now() - this.realTimeAnalysis.lastAnalysis > 30000;
        
        if ((hasEnoughWords || timeSinceLastAnalysis) && hasEnoughCharacters && hasMeaningfulContent) {
            console.log('[AI Companion] 🚀 Triggering analysis due to threshold met - words:', totalNewWords, 'chars:', currentBuffer.length);
            this.performContextualAnalysis();
        } else if ((hasEnoughWords || timeSinceLastAnalysis)) {
            const reasons = [];
            if (!hasEnoughCharacters) reasons.push(`insufficient characters (${currentBuffer.length}/${this.realTimeAnalysis.characterThreshold})`);
            if (!hasMeaningfulContent) reasons.push('no meaningful content');
            
            console.log('[AI Companion] ⏳ Analysis trigger conditions met but blocked:', reasons.join(', '), 
                '- buffer:', JSON.stringify(currentBuffer.substring(0, 50)));
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
            
            // Get the current typing before proceeding
            const currentTyping = this.extractCurrentTyping();
            
            // CRITICAL: Don't proceed if we have no meaningful typing activity
            if (!this.hasMeaningfulText(currentTyping) && !this.hasMeaningfulText(recentWriting)) {
                this.log('basic', 'analysis', 'Skipping analysis - no meaningful text activity detected');
                console.log('[AI Companion] ⏸️ Analysis skipped - no meaningful text activity');
                return;
            }
            
            // Content change detection to prevent unnecessary AI calls
            const fullContent = this.getCurrentWritingContent();
            const contentHash = this.hashString(fullContent + recentWriting);
            
            if (this.realTimeAnalysis.lastContentHash && contentHash === this.realTimeAnalysis.lastContentHash) {
                this.log('basic', 'analysis', 'Skipping analysis - no content changes detected');
                console.log('[AI Companion] ⏸️ Analysis skipped - no content changes since last analysis');
                return;
            }
            
            this.realTimeAnalysis.lastContentHash = contentHash;
            
            // Analyze multiple dimensions
            const analysis = await this.analyzeWritingDimensions(recentWriting);
            
            // Add FULL DOCUMENT CONTEXT for AI understanding
            analysis.fullContext = fullContent;
            analysis.recentText = recentWriting; // Keep this for analysis buffer data
            
            // Add REAL-TIME TYPED TEXT as the focus point
            analysis.lastSentence = currentTyping;
            
            console.log('[AI Companion] 🔍 Analysis prepared with:');
            console.log('[AI Companion] 📄 Full document length:', fullContent.length);
            console.log('[AI Companion] 📚 Recent analysis text length:', recentWriting.length);
            console.log('[AI Companion] 📝 Real-time last sentence:', JSON.stringify(analysis.lastSentence));
            
            // Generate contextual feedback based on analysis
            await this.generateContextualFeedback(analysis);
            
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
    
    async generateContextualFeedback(analysis) {
        try {
            // FINAL SAFEGUARD: Don't generate feedback without meaningful content
            const hasLastSentence = analysis.lastSentence && this.hasMeaningfulText(analysis.lastSentence);
            const hasRecentText = analysis.recentText && this.hasMeaningfulText(analysis.recentText);
            
            if (!hasLastSentence && !hasRecentText) {
                this.log('basic', 'analysis', 'Skipping feedback generation - no meaningful content in analysis');
                console.log('[AI Companion] ⏸️ Feedback generation skipped - no meaningful content');
                this.hideProgressIndicator();
                return;
            }
            
            const context = this.getCurrentWritingContext();
            const persona = this.selectOptimalPersona(analysis, context);
            
            // Determine if feedback should be shown
            if (!this.shouldShowFeedback(analysis)) {
                this.hideProgressIndicator();
                return;
            }
            
            // Generate personalized feedback
            const feedback = await this.generatePersonalizedFeedback(analysis, persona, context);
            
            if (feedback) {
                // Log feedback generation
                this.logUsage('feedback_generated', {
                    type: feedback.type,
                    persona: feedback.persona,
                    flowState: analysis.flow?.state,
                    confidence: feedback.confidence,
                    sessionDuration: context.sessionDuration,
                    source: feedback.source
                });
                
                this.showContextualFeedback(feedback);
                this.recordFeedbackInteraction(feedback, analysis);
                
                // Copy to AI Chat pane for persistence
                this.copyFeedbackToChat(analysis, feedback);
                
                // Hide progress indicator on successful feedback
                this.hideProgressIndicator();
                this.showNotification('✅ Ash has responded! (Copied to Chat)', 'success');
            } else {
                // Hide progress indicator if no feedback was generated
                this.hideProgressIndicator();
                this.showNotification('⚠️ Ash couldn\'t generate feedback right now', 'warning');
            }
        } catch (error) {
            console.error('[AI Companion] Error generating contextual feedback:', error);
            this.hideProgressIndicator();
            this.showNotification('❌ Error generating feedback from Ash', 'error');
        }
    }
    
    shouldShowFeedback(analysis) {
        console.log('[AI Companion] 🤔 Checking if should show feedback:');
        console.log('[AI Companion] 🌊 Flow state:', analysis.flow?.state);
        console.log('[AI Companion] 📊 Progress milestone:', analysis.progress?.milestone);
        console.log('[AI Companion] 🎨 Creativity breakthrough:', analysis.creativity?.breakthrough);
        
        const timeSinceLastFeedback = Date.now() - this.getLastFeedbackTime();
        console.log('[AI Companion] ⏱️ Time since last feedback:', timeSinceLastFeedback, 'ms');
        
        // MORE AGGRESSIVE FOR TESTING: Show feedback much more frequently
        
        // Don't interrupt during deep flow
        if (analysis.flow.state === 'deep_flow') {
            console.log('[AI Companion] ❌ Skipping - in deep flow');
            return false;
        }
        
        // Show encouragement when struggling
        if (analysis.flow.state === 'struggling' || analysis.flow.state === 'blocked') {
            console.log('[AI Companion] ✅ Showing - struggling or blocked');
            return true;
        }
        
        // Show insights when there's something meaningful to share
        if (analysis.progress?.milestone || analysis.creativity?.breakthrough) {
            console.log('[AI Companion] ✅ Showing - milestone or breakthrough');
            return true;
        }
        
        // DISABLED: Time-based feedback to prevent automatic AI requests  
        // Only explicit user requests, struggling/blocked states, or major milestones should trigger feedback
        console.log('[AI Companion] ⏸️ No valid trigger conditions met for feedback');
        
        return false;
    }
    
    async generatePersonalizedFeedback(analysis, persona, context) {
        const feedbackType = this.selectFeedbackType(analysis, context);
        const personalizations = this.getPersonalizations(analysis);
        
        switch (feedbackType) {
            case 'encouragement':
                return await this.generateEncouragement(analysis, persona, personalizations);
            case 'insight':
                return await this.generateInsight(analysis, persona, personalizations);
            case 'suggestion':
                return this.generateSuggestion(analysis, persona, personalizations);
            case 'celebration':
                return this.generateCelebration(analysis, persona, personalizations);
            default:
                return null;
        }
    }
    
    async generateEncouragement(analysis, persona, personalizations) {
        // Get the user's last sentence for context
        const lastSentence = analysis.lastSentence || '';
        const hasLastSentence = lastSentence.trim().length > 0;
        
        // CRITICAL: Only call AI if we have ACTUAL meaningful typing activity
        const hasActualTyping = hasLastSentence && this.hasMeaningfulText(lastSentence) && this.hasRecentTypingActivity();
        
        // Try to generate AI-powered contextual encouragement first
        if (window.electronAPI && hasActualTyping) {
            try {
                const aiMessage = await this.generateAIEncouragement(analysis, persona);
                if (aiMessage) {
                    return {
                        type: 'encouragement',
                        persona: persona.name,
                        message: aiMessage,
                        confidence: 0.9,
                        timing: 'gentle',
                        source: 'ai'
                    };
                }
            } catch (error) {
                console.log('[AI Companion] AI encouragement failed, using fallback:', error.message);
            }
        }
        
        // Fallback to predefined messages
        const encouragements = {
            struggling: [
                hasLastSentence ? 
                    `${persona.name} notices you're working through some complexity here. Re: "${lastSentence}" - Every great writer faces these moments—they're often where the best insights emerge.` :
                    `${persona.name} notices you're working through some complexity here. Every great writer faces these moments—they're often where the best insights emerge.`,
                hasLastSentence ? 
                    `I can sense you're pushing through a challenging section. Re: "${lastSentence}" - Your persistence shows real dedication to your craft.` :
                    `I can sense you're pushing through a challenging section. Your persistence shows real dedication to your craft.`,
                hasLastSentence ? 
                    `This feels like deep thinking territory. Re: "${lastSentence}" - Sometimes the best writing comes after we wrestle with our ideas.` :
                    `This feels like deep thinking territory. Sometimes the best writing comes after we wrestle with our ideas.`
            ],
            beginning: [
                hasLastSentence ? 
                    `${persona.name} here! Re: "${lastSentence}" - I'm excited to see where this direction takes us today. Your unique perspective always leads to interesting places.` :
                    `${persona.name} here! I'm excited to write alongside you today. Your unique perspective always leads to interesting places.`,
                hasLastSentence ? 
                    `Ready to explore some ideas together? Re: "${lastSentence}" - I love seeing where your thoughts take us.` :
                    `Ready to explore some ideas together? I love seeing where your thoughts take us.`
            ],
            momentum: [
                hasLastSentence ? 
                    `You're building beautiful momentum here. Re: "${lastSentence}" - I can feel the energy in your words.` :
                    `You're building beautiful momentum here. I can feel the energy in your words.`,
                hasLastSentence ? 
                    `There's a lovely rhythm developing in your writing. Re: "${lastSentence}" - Keep riding this wave.` :
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
            timing: 'gentle',
            source: 'fallback'
        };
    }
    
    async generateInsight(analysis, persona, personalizations) {
        // Get the user's last sentence for context
        const lastSentence = analysis.lastSentence || '';
        const hasLastSentence = lastSentence.trim().length > 0;
        
        // CRITICAL: Only call AI if we have ACTUAL meaningful typing activity
        const hasActualTyping = hasLastSentence && this.hasMeaningfulText(lastSentence) && this.hasRecentTypingActivity();
        
        // Check keystroke threshold before generating AI insight
        const hasMetKeystrokeThreshold = this.hasMetKeystrokeThreshold();
        
        // Log keystroke threshold status
        if (!hasMetKeystrokeThreshold) {
            console.log(`[AI Companion] ⏸️ Keystroke threshold not met: ${this.keystrokeTracking.count}/${this.keystrokeTracking.threshold} keystrokes`);
        }
        
        // Try to generate AI-powered contextual insight first
        if (window.electronAPI && hasActualTyping && hasMetKeystrokeThreshold) {
            try {
                const aiMessage = await this.generateAIInsight(analysis, persona);
                if (aiMessage) {
                    // Reset keystroke counter since AI insight was successfully generated
                    this.resetKeystrokeCounter();
                    
                    return {
                        type: 'insight',
                        persona: persona.name,
                        message: aiMessage,
                        confidence: 0.9,
                        timing: 'thoughtful',
                        source: 'ai'
                    };
                }
            } catch (error) {
                console.log('[AI Companion] AI insight failed, using fallback:', error.message);
            }
        }
        
        // Fallback to predefined insights
        const insights = [];
        
        // Flow insights
        if (analysis.flow.score > 0.7) {
            insights.push(hasLastSentence ? 
                `You're in a wonderful flow state—your ideas are connecting beautifully. Re: "${lastSentence}" - Consider continuing for another ${this.suggestOptimalDuration()} to maximize this momentum.` :
                `You're in a wonderful flow state—your ideas are connecting beautifully. Consider continuing for another ${this.suggestOptimalDuration()} to maximize this momentum.`
            );
        }
        
        // Style insights
        if (analysis.style.evolution) {
            insights.push(hasLastSentence ? 
                `I'm noticing your writing style is evolving. Re: "${lastSentence}" - Your sentences are becoming more ${analysis.style.direction}—it's adding real depth to your voice.` :
                `I'm noticing your writing style is evolving. Your sentences are becoming more ${analysis.style.direction}—it's adding real depth to your voice.`
            );
        }
        
        // Creativity insights
        if (analysis.creativity.score > 0.6) {
            insights.push(hasLastSentence ? 
                `Your creativity is really sparking today. Re: "${lastSentence}" - The way you're connecting ideas feels fresh and original.` :
                `Your creativity is really sparking today. The way you're connecting ideas feels fresh and original.`
            );
        }
        
        if (insights.length === 0) return null;
        
        return {
            type: 'insight',
            persona: persona.name,
            message: insights[Math.floor(Math.random() * insights.length)],
            confidence: 0.7,
            timing: 'thoughtful',
            source: 'fallback'
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
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return {
                fleschScore: 0,
                readingLevel: 'No content',
                avgWordsPerSentence: 0,
                avgSyllablesPerWord: 0,
                uniqueWordRatio: 0,
                complexity: 0
            };
        }
        
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const words = text.split(/\s+/).filter(w => w.trim().length > 0);
        
        if (words.length === 0 || sentences.length === 0) {
            return {
                fleschScore: 0,
                readingLevel: 'No content',
                avgWordsPerSentence: 0,
                avgSyllablesPerWord: 0,
                uniqueWordRatio: 0,
                complexity: 0
            };
        }
        
        const avgWordsPerSentence = words.length / sentences.length;
        const avgSyllablesPerWord = this.estimateAvgSyllables(words);
        const uniqueWordRatio = new Set(words.map(w => w.toLowerCase())).size / words.length;
        
        // Flesch Reading Ease approximation
        const fleschScore = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
        
        return {
            fleschScore: isNaN(fleschScore) ? 0 : fleschScore,
            readingLevel: this.fleschToLevel(fleschScore),
            avgWordsPerSentence: isNaN(avgWordsPerSentence) ? 0 : avgWordsPerSentence,
            avgSyllablesPerWord: isNaN(avgSyllablesPerWord) ? 0 : avgSyllablesPerWord,
            uniqueWordRatio: isNaN(uniqueWordRatio) ? 0 : uniqueWordRatio,
            complexity: this.calculateComplexityScore(avgWordsPerSentence, avgSyllablesPerWord, uniqueWordRatio)
        };
    }
    
    analyzeCreativity(text) {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
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
        
        const words = text.toLowerCase().split(/\W+/).filter(w => w.trim().length > 0);
        const uniqueWords = new Set(words);
        
        // Creativity indicators
        const metaphorIndicators = ['like', 'as', 'seems', 'appears', 'resembles'];
        const emotionalWords = ['feel', 'sense', 'emotion', 'heart', 'soul', 'spirit'];
        const imaginativeWords = ['imagine', 'dream', 'wonder', 'envision', 'picture'];
        
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
            breakthrough: this.detectCreativeBreakthrough(text)
        };
    }
    
    // === Utility Methods ===
    
    getCurrentWritingContent() {
        // Get current editor content - integrate with existing editor
        if (window.editor && window.editor.getValue) {
            const content = window.editor.getValue();
            
            // Non-intrusive debug logging for content access
            this.log('debug', 'context', 'Accessing editor content:', {
                contentLength: content.length,
                currentFilePath: window.currentFilePath || 'unknown',
                contentHash: this.getContentHash(content),
                timestamp: new Date().toISOString()
            });
            
            return content;
        }
        
        // Fallback to any textarea or contenteditable
        const editor = document.querySelector('textarea, [contenteditable="true"]');
        const content = editor ? (editor.value || editor.textContent || '') : '';
        
        this.log('debug', 'context', 'Accessing fallback editor content:', {
            contentLength: content.length,
            currentFilePath: window.currentFilePath || 'unknown',
            contentHash: this.getContentHash(content),
            timestamp: new Date().toISOString()
        });
        
        return content;
    }
    
    // Helper method to create a simple hash for content comparison
    getContentHash(content) {
        if (!content) return 'empty';
        // Simple hash of first 100 and last 100 characters for comparison
        const start = content.substring(0, 100);
        const end = content.length > 100 ? content.substring(content.length - 100) : '';
        return `${start.length}:${end.length}:${content.length}`;
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
    
    extractLastSentence(text) {
        if (!text || typeof text !== 'string') return '';
        
        // Clean up the text
        const cleaned = text.trim().replace(/\s+/g, ' ');
        
        // Split by sentence endings, but keep the punctuation
        const sentences = cleaned.split(/([.!?]+)/);
        
        // Find the last meaningful sentence
        let lastSentence = '';
        for (let i = sentences.length - 1; i >= 0; i--) {
            const sentence = sentences[i].trim();
            if (sentence && !sentence.match(/^[.!?]+$/)) {
                lastSentence = sentence;
                // Add back the punctuation if the next element is punctuation
                if (i + 1 < sentences.length && sentences[i + 1].match(/^[.!?]+$/)) {
                    lastSentence += sentences[i + 1];
                }
                break;
            }
        }
        
        // Fallback: take the last 100 characters if no sentence found
        if (!lastSentence && cleaned.length > 0) {
            lastSentence = cleaned.slice(-100);
        }
        
        // Truncate if too long for UI display
        if (lastSentence.length > 120) {
            lastSentence = '...' + lastSentence.slice(-117);
        }
        
        return lastSentence;
    }
    
    extractCurrentTyping() {
        console.log('[AI Companion] 🔍 Extracting current typing...');
        console.log('[AI Companion] 🔍 Typing buffer length:', this.realTimeAnalysis.recentTypingBuffer.length);
        console.log('[AI Companion] 🔍 Analysis buffer entries:', this.realTimeAnalysis.analysisBuffer.length);
        
        // Return the real-time typing buffer which captures actual characters as typed
        let result = this.realTimeAnalysis.recentTypingBuffer.trim();
        console.log('[AI Companion] 📝 From typing buffer:', JSON.stringify(result));
        
        // If the typing buffer is empty, fall back to recent analysis buffer entries
        if (result.length === 0) {
            const recentEntries = this.realTimeAnalysis.analysisBuffer.slice(-3); // Last 3 entries
            if (recentEntries.length > 0) {
                result = recentEntries.map(entry => entry.text).join('').trim();
                console.log('[AI Companion] 📚 From analysis buffer:', JSON.stringify(result));
                console.log('[AI Companion] 📚 Analysis buffer entries detail:', recentEntries);
            }
        }
        
        // CRITICAL: If we're falling back to document extraction, something is wrong!
        if (result.length === 0) {
            this.log('basic', 'user', 'CRITICAL: Both typing buffer and analysis buffer are empty!');
            this.log('basic', 'user', 'This indicates editor change events may not be working properly');
            
            // DO NOT fall back to document content as this confuses file context with user input
            // Return empty string to indicate no recent typing activity
            result = '';
            this.log('basic', 'user', 'No recent typing activity detected - using empty string');
        }
        
        // Clean up and format for display
        result = result.replace(/\s+/g, ' ').trim();
        
        // Truncate if too long for UI display, but preserve the most recent content
        if (result.length > 120) {
            result = '...' + result.slice(-117);
        }
        
        console.log('[AI Companion] ✅ Final extracted typing:', JSON.stringify(result));
        return result;
    }
    
    // === AI-Powered Message Generation ===
    
    // Utility function to clean AI responses
    cleanAIResponse(response) {
        if (!response || typeof response !== 'string') return response;
        
        const originalResponse = response;
        
        // Remove <think>...</think> tags and their content (case insensitive, multiline)
        response = response.replace(/<think>[\s\S]*?<\/think>/gi, '');
        
        // Also remove any other thinking patterns that might slip through
        response = response.replace(/\*thinking\*[\s\S]*?\*\/thinking\*/gi, '');
        response = response.replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, '');
        response = response.replace(/\(thinking:[\s\S]*?\)/gi, '');
        
        // Clean up extra whitespace
        response = response.trim();
        
        // Log if anything was cleaned
        if (originalResponse !== response) {
            console.log('[AI Companion] 🧹 Cleaned AI response:');
            console.log('[AI Companion] 📥 Original:', JSON.stringify(originalResponse));
            console.log('[AI Companion] 🧽 Cleaned:', JSON.stringify(response));
        }
        
        return response;
    }
    
    async generateAIEncouragement(analysis, persona) {
        const lastSentence = analysis.lastSentence || '';
        const fullContext = analysis.fullContext || '';
        const flowState = analysis.flow?.state || 'neutral';
        
        // FINAL SAFEGUARD: Block AI calls without meaningful typing
        if (!this.hasMeaningfulText(lastSentence) || !this.hasRecentTypingActivity()) {
            console.log('[AI Companion] 🚫 Blocking AI encouragement - no meaningful typing activity');
            return null;
        }
        
        this.log('verbose', 'ai-input', 'Generating AI encouragement with data:', {
            lastSentence: lastSentence,
            contextLength: fullContext.length,
            contextPreview: fullContext.slice(-300),
            flowState: flowState
        });
        
        // Apply context configuration
        const contextText = this.prepareContextForAI(fullContext, lastSentence);
        
        // Debug logging for context verification
        this.log('verbose', 'ai-input', 'Context preparation details:', {
            fullContextLength: fullContext.length,
            contextScope: this.contextConfig.scope,
            preparedContextLength: contextText.length,
            lastSentenceLength: lastSentence.length
        });
        
        // Build prompt with clear distinction between file context and user input
        let prompt = `I'm ${persona.name}, an AI writing companion. The user is currently ${flowState} in their writing flow.

DOCUMENT CONTEXT (general background - do NOT quote from this as "what they just typed"):
${this.contextConfig.scope === 'full_document' ? 'FULL DOCUMENT:' : 'RECENT WRITING:'}
"${contextText}"
`;

        // Only include "what they typed" section if there's actual recent typing
        if (lastSentence && lastSentence.trim().length > 0) {
            prompt += `
WHAT THEY JUST TYPED (specific focus for feedback):
"${lastSentence}"

Generate a brief, encouraging comment (1-2 sentences) that:
- Starts with "Re: '[their exact text from WHAT THEY JUST TYPED]'"
- Provides specific encouragement about their current typing
- Uses the document context to understand the broader topic
- Matches my personality: ${persona.style}
- Is appropriate for their current flow state: ${flowState}

Focus on what they just typed while showing understanding of their broader work.`;
        } else {
            prompt += `
The user hasn't typed anything recently - they may be reading, thinking, or just opened the document.

Generate a brief, encouraging comment (1-2 sentences) that:
- Does NOT claim they typed anything specific
- Provides general encouragement about their writing project
- References their document content to show understanding of their work
- Matches my personality: ${persona.style}
- Is appropriate for their current flow state: ${flowState}

Be supportive about their writing process without referencing specific recent text.`;
        }

        this.log('debug', 'ai-input', 'Sending encouragement prompt to AI service');
        this.log('debug', 'ai-input', 'FULL PROMPT:', prompt);

        try {
            // Get Ash assistant settings from configuration
            let temperature = 0.7; // Default fallback for Ash
            let maxTokens = 200;   // Default for companion messages (reasonable length)
            let provider = undefined;
            let model = undefined;
            
            try {
                const settings = await window.electronAPI.invoke('get-settings');
                if (settings && settings.ai && settings.ai.assistants && settings.ai.assistants.ash) {
                    const ashSettings = settings.ai.assistants.ash.aiSettings;
                    temperature = parseFloat(ashSettings.temperature) || 0.7;
                    maxTokens = parseInt(ashSettings.maxTokens) || 200;
                    provider = ashSettings.provider;
                    model = ashSettings.model;
                    console.log('[AI Companion] ⚙️ Using Ash assistant settings - provider:', provider, 'model:', model, 'temperature:', temperature, 'maxTokens:', maxTokens);
                } else {
                    console.log('[AI Companion] ⚙️ No Ash settings found, using defaults');
                }
            } catch (settingsError) {
                console.warn('[AI Companion] Could not load Ash settings, using defaults:', settingsError);
            }
            
            const requestData = {
                message: prompt,
                options: {
                    assistant: 'ash',
                    provider: provider,
                    model: model,
                    temperature: temperature,
                    maxTokens: maxTokens,
                    newConversation: true
                }
            };
            
            console.log('[AI Companion] 📤 AI request data:', JSON.stringify(requestData, null, 2));
            
            const response = await window.electronAPI.invoke('ai-chat', requestData);
            
            console.log('[AI Companion] 📥 AI response received:', JSON.stringify(response, null, 2));
            
            const cleanedResponse = this.cleanAIResponse(response?.response?.trim()) || null;
            console.log('[AI Companion] ✨ Cleaned response:', JSON.stringify(cleanedResponse));
            
            return cleanedResponse;
        } catch (error) {
            console.log('[AI Companion] AI encouragement generation failed:', error);
            return null;
        }
    }
    
    async generateAIInsight(analysis, persona) {
        const lastSentence = analysis.lastSentence || '';
        const fullContext = analysis.fullContext || '';
        const flowState = analysis.flow?.state || 'neutral';
        
        // FINAL SAFEGUARD: Block AI calls without meaningful typing
        if (!this.hasMeaningfulText(lastSentence) || !this.hasRecentTypingActivity()) {
            console.log('[AI Companion] 🚫 Blocking AI insight - no meaningful typing activity');
            return null;
        }
        
        this.log('verbose', 'ai-input', 'Generating AI insight with data:', {
            lastSentence: lastSentence,
            contextLength: fullContext.length,
            contextPreview: fullContext.slice(-300),
            flowState: flowState
        });
        
        // Apply context configuration
        const contextText = this.prepareContextForAI(fullContext, lastSentence);
        
        // Build prompt with clear distinction between file context and user input
        let prompt = `I'm ${persona.name}, an AI writing companion. The user is in "${flowState}" flow state.

DOCUMENT CONTEXT (general background - do NOT quote from this as "what they just typed"):
${this.contextConfig.scope === 'full_document' ? 'FULL DOCUMENT:' : 'RECENT WRITING:'}
"${contextText}"
`;

        // Only include "what they typed" section if there's actual recent typing
        if (lastSentence && lastSentence.trim().length > 0) {
            prompt += `
WHAT THEY JUST TYPED (specific focus for feedback):
"${lastSentence}"

Generate a brief writing insight (1-2 sentences) that:
- Starts with "Re: '[their exact text from WHAT THEY JUST TYPED]'"
- Provides a specific insight about their current typing
- Uses the document context to understand their writing direction and style
- Matches my personality: ${persona.style}
- Offers constructive observations about their current work

Be thoughtful and insightful about what they just typed while showing understanding of their broader work.`;
        } else {
            prompt += `
The user hasn't typed anything recently - they may be reading, thinking, or just opened the document.

Generate a brief writing insight (1-2 sentences) that:
- Does NOT claim they typed anything specific
- Provides general insights about their writing project
- Uses the document context to understand their writing direction and themes
- Matches my personality: ${persona.style}
- Offers constructive observations about their work

Be thoughtful about their writing process without referencing specific recent text.`;
        }

        this.log('debug', 'ai-input', 'Sending insight prompt to AI service');
        this.log('debug', 'ai-input', 'FULL PROMPT:', prompt);

        try {
            // Get Ash assistant settings from configuration
            let temperature = 0.7; // Default fallback for insights
            let maxTokens = 200;   // Default for companion messages
            let provider = undefined;
            let model = undefined;
            
            try {
                const settings = await window.electronAPI.invoke('get-settings');
                if (settings && settings.ai && settings.ai.assistants && settings.ai.assistants.ash) {
                    const ashSettings = settings.ai.assistants.ash.aiSettings;
                    temperature = parseFloat(ashSettings.temperature) || 0.7;
                    maxTokens = parseInt(ashSettings.maxTokens) || 200;
                    provider = ashSettings.provider;
                    model = ashSettings.model;
                    console.log('[AI Companion] ⚙️ Using Ash assistant settings for insights - provider:', provider, 'model:', model, 'temperature:', temperature, 'maxTokens:', maxTokens);
                } else {
                    console.log('[AI Companion] ⚙️ No Ash settings found, using defaults for insights');
                }
            } catch (settingsError) {
                console.warn('[AI Companion] Could not load Ash settings, using defaults:', settingsError);
            }
            
            const requestData = {
                message: prompt,
                options: {
                    assistant: 'ash',
                    provider: provider,
                    model: model,
                    temperature: temperature,
                    maxTokens: maxTokens,
                    newConversation: true
                }
            };
            
            console.log('[AI Companion] 📤 AI insight request data:', JSON.stringify(requestData, null, 2));
            
            const response = await window.electronAPI.invoke('ai-chat', requestData);
            
            console.log('[AI Companion] 📥 AI insight response received:', JSON.stringify(response, null, 2));
            
            const cleanedResponse = this.cleanAIResponse(response?.response?.trim()) || null;
            console.log('[AI Companion] ✨ Cleaned insight response:', JSON.stringify(cleanedResponse));
            
            return cleanedResponse;
        } catch (error) {
            console.log('[AI Companion] AI insight generation failed:', error);
            return null;
        }
    }
    
    countWords(text) {
        return text.trim().split(/\\s+/).filter(word => word.length > 0).length;
    }
    
    calculateVariance(numbers) {
        const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
        const squaredDiffs = numbers.map(num => Math.pow(num - mean, 2));
        return squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length;
    }
    
    // === Usage Logging ===
    
    logUsage(action, data = {}) {
        const settings = window.appSettings?.ai || {};
        if (!settings.verboseLogging && !settings.enableWritingCompanion) return;
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            action,
            data,
            sessionId: this.getSessionId()
        };
        
        // Log to console for now
        console.log('[AI Companion Usage]', logEntry);
        
        // Store usage statistics
        this.updateUsageStats(action);
        
        // Could be extended to send to analytics service
        this.saveUsageLog(logEntry);
    }
    
    getSessionId() {
        if (!this.sessionId) {
            this.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        return this.sessionId;
    }
    
    updateUsageStats(action) {
        const stats = this.loadUsageStats();
        
        if (!stats[action]) {
            stats[action] = { count: 0, firstUsed: Date.now(), lastUsed: Date.now() };
        }
        
        stats[action].count++;
        stats[action].lastUsed = Date.now();
        
        localStorage.setItem('ai_companion_usage_stats', JSON.stringify(stats));
    }
    
    loadUsageStats() {
        const stored = localStorage.getItem('ai_companion_usage_stats');
        return stored ? JSON.parse(stored) : {};
    }
    
    saveUsageLog(logEntry) {
        const logs = this.loadUsageLogs();
        logs.push(logEntry);
        
        // Keep only last 100 entries to prevent storage bloat
        if (logs.length > 100) {
            logs.splice(0, logs.length - 100);
        }
        
        localStorage.setItem('ai_companion_usage_logs', JSON.stringify(logs));
    }
    
    loadUsageLogs() {
        const stored = localStorage.getItem('ai_companion_usage_logs');
        return stored ? JSON.parse(stored) : [];
    }
    
    getUsageReport() {
        const stats = this.loadUsageStats();
        const logs = this.loadUsageLogs();
        
        return {
            totalActions: Object.values(stats).reduce((sum, stat) => sum + stat.count, 0),
            actionBreakdown: stats,
            recentLogs: logs.slice(-10), // Last 10 entries
            sessionId: this.sessionId
        };
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
            learningMode: true,
            autoInvocationEnabled: false, // Default to false - only invoke when user requests or makes text changes
            requireTextChanges: true, // Only invoke when there are actual text changes
            aiInsightKeystrokeThreshold: 100 // Number of keystrokes before AI insight can be generated
        };
    }
    
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
    
    // Methods to control auto-invocation
    enableAutoInvocation() {
        const preferences = this.loadUserPreferences();
        preferences.autoInvocationEnabled = true;
        localStorage.setItem('ai_companion_preferences', JSON.stringify(preferences));
        console.log('[AI Companion] ✅ Auto-invocation enabled');
    }
    
    disableAutoInvocation() {
        const preferences = this.loadUserPreferences();
        preferences.autoInvocationEnabled = false;
        localStorage.setItem('ai_companion_preferences', JSON.stringify(preferences));
        console.log('[AI Companion] ⏸️ Auto-invocation disabled');
    }
    
    toggleAutoInvocation() {
        const preferences = this.loadUserPreferences();
        preferences.autoInvocationEnabled = !preferences.autoInvocationEnabled;
        localStorage.setItem('ai_companion_preferences', JSON.stringify(preferences));
        console.log(`[AI Companion] ${preferences.autoInvocationEnabled ? '✅ Enabled' : '⏸️ Disabled'} auto-invocation`);
        return preferences.autoInvocationEnabled;
    }
    
    isAutoInvocationEnabled() {
        const preferences = this.loadUserPreferences();
        return preferences.autoInvocationEnabled;
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
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return {
                avgSentenceLength: 0,
                vocabularyDiversity: 0,
                direction: 'no content',
                consistency: 0,
                evolution: false
            };
        }
        
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const words = text.split(/\s+/).filter(w => w.trim().length > 0);
        
        // Handle edge cases
        if (words.length === 0) {
            return {
                avgSentenceLength: 0,
                vocabularyDiversity: 0,
                direction: 'no content',
                consistency: 0,
                evolution: false
            };
        }
        
        const avgSentenceLength = words.length / Math.max(1, sentences.length);
        const vocabularyDiversity = new Set(words.map(w => w.toLowerCase())).size / words.length;
        
        // Determine style characteristics
        let direction = 'balanced';
        if (avgSentenceLength > 20) direction = 'complex and elaborate';
        else if (avgSentenceLength < 10) direction = 'concise and punchy';
        
        return {
            avgSentenceLength: isNaN(avgSentenceLength) ? 0 : avgSentenceLength,
            vocabularyDiversity: isNaN(vocabularyDiversity) ? 0 : vocabularyDiversity,
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
    
    // === Missing Flow Analysis Methods ===
    
    generateFlowSuggestions(flowScore, indicators) {
        const suggestions = [];
        
        if (flowScore < 0.3) {
            suggestions.push('Try free-writing for 5 minutes without editing');
            suggestions.push('Focus on getting ideas down rather than perfection');
        } else if (flowScore < 0.6) {
            suggestions.push('You\'re building momentum - keep going!');
            suggestions.push('Trust your instincts and write freely');
        } else {
            suggestions.push('You\'re in great flow - ride this wave!');
            suggestions.push('Consider extending your session while in this state');
        }
        
        return suggestions;
    }
    
    calculateMomentum(words) {
        // Calculate writing momentum based on word production rate and consistency
        if (!words || words.length === 0) return 0;
        
        const wordCount = words.length;
        const sessionDuration = this.getCurrentWritingContext().sessionDuration;
        
        if (sessionDuration === 0) return 0.5; // Default momentum for new sessions
        
        // Calculate words per minute
        const wordsPerMinute = (wordCount / (sessionDuration / 60000));
        
        // Momentum factors
        const speedFactor = Math.min(1, wordsPerMinute / 50); // Normalize against 50 WPM baseline
        const consistencyFactor = this.calculateWritingConsistency();
        const volumeFactor = Math.min(1, wordCount / 200); // Normalize against 200 words
        
        // Combine factors with weights
        const momentum = (speedFactor * 0.4 + consistencyFactor * 0.3 + volumeFactor * 0.3);
        
        return Math.min(1, Math.max(0, momentum));
    }
    
    calculateWritingConsistency() {
        // Simple consistency check based on recent writing activity
        const context = this.getCurrentWritingContext();
        
        if (!context.sessionDuration || context.sessionDuration < 300000) { // Less than 5 minutes
            return 0.5; // Default for short sessions
        }
        
        // Check if writing has been relatively steady (simplified)
        const timeSlices = Math.floor(context.sessionDuration / 60000); // 1-minute slices
        if (timeSlices < 2) return 0.5;
        
        // Return a consistency score based on steady writing (simplified calculation)
        return 0.7; // Placeholder - could be enhanced with actual keystroke timing data
    }
    
    // === Text Validation ===
    
    hasMeaningfulText(text) {
        if (!text || typeof text !== 'string') return false;
        
        const cleaned = text.trim();
        if (cleaned.length < 5) return false; // Too short to be meaningful
        
        // Check for sentence-like structure
        const hasWords = /\b[a-zA-Z]+\b/.test(cleaned); // Contains actual words
        const hasSpaces = /\s/.test(cleaned); // Contains spaces (multiple words)
        const hasLetters = /[a-zA-Z]/.test(cleaned); // Contains letters (not just punctuation/numbers)
        
        // Basic heuristics for meaningful text:
        // - Has actual letters
        // - If longer than 15 characters, should have spaces (multiple words)
        // - Not just repetitive characters
        const notRepetitive = !this.isRepetitiveText(cleaned);
        
        const meaningful = hasLetters && hasWords && notRepetitive && 
                          (cleaned.length <= 15 || hasSpaces);
        
        if (!meaningful) {
            console.log('[AI Companion] 🚫 Text not meaningful:', JSON.stringify(cleaned), {
                hasWords, hasSpaces, hasLetters, notRepetitive, length: cleaned.length
            });
        }
        
        return meaningful;
    }
    
    isRepetitiveText(text) {
        if (text.length < 3) return false;
        
        // Check if more than 70% of characters are the same
        const charCount = {};
        for (const char of text) {
            charCount[char] = (charCount[char] || 0) + 1;
        }
        
        const maxCount = Math.max(...Object.values(charCount));
        const repetitiveThreshold = text.length * 0.7;
        
        return maxCount > repetitiveThreshold;
    }
    
    hasRecentTypingActivity() {
        // Check if there's been actual typing activity recently
        const now = Date.now();
        const recentThreshold = 30000; // 30 seconds
        
        // Check if analysis buffer has recent entries
        const recentEntries = this.realTimeAnalysis.analysisBuffer.filter(
            entry => (now - entry.timestamp) < recentThreshold
        );
        
        // Check if typing buffer has content and was updated recently
        const hasActiveTypingBuffer = this.realTimeAnalysis.recentTypingBuffer.length > 0;
        const lastActivityTime = this.realTimeAnalysis.lastAnalysis || 0;
        const hasRecentActivity = (now - lastActivityTime) < recentThreshold;
        
        const hasActivity = (recentEntries.length > 0 || hasActiveTypingBuffer) && hasRecentActivity;
        
        if (!hasActivity) {
            console.log('[AI Companion] 🚫 No recent typing activity detected:', {
                recentEntries: recentEntries.length,
                typingBufferLength: this.realTimeAnalysis.recentTypingBuffer.length,
                timeSinceLastActivity: now - lastActivityTime,
                threshold: recentThreshold
            });
        }
        
        return hasActivity;
    }
    
    isLikelyFileLoadingContent(text) {
        if (!text || typeof text !== 'string') return false;
        
        // Reject very large chunks of text (likely file content)
        if (text.length > 500) {
            console.log('[AI Companion] 🚫 Rejecting large text chunk (likely file loading):', text.length, 'characters');
            return true;
        }
        
        // Reject text that contains multiple lines with markdown structure (likely full file)
        const lines = text.split('\n');
        if (lines.length > 10) {
            console.log('[AI Companion] 🚫 Rejecting multi-line content (likely file loading):', lines.length, 'lines');
            return true;
        }
        
        // Reject text that starts with markdown headers or other file-like patterns
        const filePatterns = [
            /^#\s+/, // Starts with markdown header
            /^---\s*$/, // Starts with markdown separator
            /^\s*```/, // Starts with code block
            /^@\w+\{/, // Starts with citation
            /^\s*\[\d+\]:/, // Starts with reference
        ];
        
        for (const pattern of filePatterns) {
            if (pattern.test(text)) {
                console.log('[AI Companion] 🚫 Rejecting content matching file pattern:', pattern);
                return true;
            }
        }
        
        // Reject content that's mostly structured (more than 50% non-letter characters)
        const letterCount = (text.match(/[a-zA-Z]/g) || []).length;
        const letterRatio = letterCount / text.length;
        if (letterRatio < 0.5 && text.length > 50) {
            console.log('[AI Companion] 🚫 Rejecting structured content (low letter ratio):', letterRatio);
            return true;
        }
        
        return false; // Content looks like actual typing
    }
    
    // === Buffer Management ===
    
    clearAllBuffers() {
        console.log('[AI Companion] 🧹 Clearing all buffers (file changed or reset)');
        this.realTimeAnalysis.recentTypingBuffer = '';
        this.realTimeAnalysis.analysisBuffer = [];
        this.realTimeAnalysis.lastAnalysis = 0;
        this.log('basic', 'system', 'All AI companion buffers cleared');
    }
    
    // === Settings Management ===
    
    async loadCompanionSettings() {
        this.log('basic', 'system', 'Loading AI companion settings...');
        
        try {
            const settings = await window.electronAPI.invoke('get-settings');
            if (settings && settings.ai) {
                // Load character threshold setting
                if (settings.ai.companionCharacterThreshold !== undefined) {
                    this.realTimeAnalysis.characterThreshold = settings.ai.companionCharacterThreshold;
                    this.log('basic', 'system', `Character threshold set to: ${this.realTimeAnalysis.characterThreshold}`);
                }
                
                // Load context settings
                if (settings.ai.companionContextScope) {
                    this.contextConfig.scope = settings.ai.companionContextScope;
                }
                
                if (settings.ai.companionMaxContextLength) {
                    this.contextConfig.maxFullDocumentLength = settings.ai.companionMaxContextLength;
                }
                
                // Update logging settings if they exist
                if (settings.logging) {
                    Object.assign(this.loggingConfig, settings.logging);
                }
            }
        } catch (error) {
            console.warn('[AI Companion] Could not load settings, using defaults:', error);
        }
    }
    
    // === Missing Helper Methods ===
    
    estimateAvgSyllables(words) {
        if (!words || words.length === 0) return 1;
        
        let totalSyllables = 0;
        
        words.forEach(word => {
            const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
            if (cleanWord.length === 0) return;
            
            // Simple syllable estimation based on vowel groups
            const vowelGroups = cleanWord.match(/[aeiouy]+/g);
            let syllables = vowelGroups ? vowelGroups.length : 1;
            
            // Adjust for common patterns
            if (cleanWord.endsWith('e') && syllables > 1) syllables--;
            if (cleanWord.endsWith('ed') && syllables > 1) syllables--;
            if (syllables === 0) syllables = 1;
            
            totalSyllables += syllables;
        });
        
        return totalSyllables / words.length;
    }
    
    fleschToLevel(fleschScore) {
        if (fleschScore >= 90) return 'Very Easy';
        if (fleschScore >= 80) return 'Easy';
        if (fleschScore >= 70) return 'Fairly Easy';
        if (fleschScore >= 60) return 'Standard';
        if (fleschScore >= 50) return 'Fairly Difficult';
        if (fleschScore >= 30) return 'Difficult';
        return 'Very Difficult';
    }
    
    calculateComplexityScore(avgWordsPerSentence, avgSyllablesPerWord, uniqueWordRatio) {
        const sentenceComplexity = Math.min(1, avgWordsPerSentence / 20);
        const syllableComplexity = Math.min(1, (avgSyllablesPerWord - 1) / 2);
        const vocabularyComplexity = uniqueWordRatio;
        
        return (sentenceComplexity * 0.4 + syllableComplexity * 0.3 + vocabularyComplexity * 0.3);
    }
    
    calculateIndicatorScore(words, indicators) {
        if (!words || words.length === 0) return 0;
        
        const indicatorCount = words.filter(word => 
            indicators.some(indicator => 
                word.toLowerCase().includes(indicator.toLowerCase())
            )
        ).length;
        
        return Math.min(1, indicatorCount / words.length * 10); // Scale up for visibility
    }
    
    detectUnconventionalPhrases(text) {
        // Simple detection of unusual word combinations
        const phrases = text.match(/\b\w+\s+\w+\b/g) || [];
        const unconventional = [];
        
        phrases.forEach(phrase => {
            const words = phrase.toLowerCase().split(' ');
            // Simple heuristic: look for unusual adjective-noun combinations
            if (words.length === 2 && Math.random() > 0.95) { // Randomly mark some as unconventional for demo
                unconventional.push(phrase);
            }
        });
        
        return unconventional;
    }
    
    detectCreativeBreakthrough(text) {
        // Simple breakthrough detection based on text patterns
        const exclamationCount = (text.match(/!/g) || []).length;
        const questionCount = (text.match(/\?/g) || []).length;
        const capitalizedWords = (text.match(/\b[A-Z]{2,}\b/g) || []).length;
        const words = text.split(/\s+/);
        
        // Heuristic: breakthrough if high engagement indicators and sufficient length
        const engagementScore = (exclamationCount + questionCount + capitalizedWords) / words.length;
        const hasLength = words.length > 50;
        const hasVariety = new Set(words.map(w => w.toLowerCase())).size / words.length > 0.7;
        
        return engagementScore > 0.02 && hasLength && hasVariety;
    }
    
    updateLearningModel(analysis) {
        // Update the adaptive learning model with new analysis data
        try {
            if (!this.adaptiveLearning.learningModel) {
                this.adaptiveLearning.learningModel = {
                    patterns: {},
                    preferences: {},
                    effectiveness: {}
                };
            }
            
            const model = this.adaptiveLearning.learningModel;
            
            // Ensure nested objects exist
            if (!model.patterns) model.patterns = {};
            if (!model.preferences) model.preferences = {};
            if (!model.effectiveness) model.effectiveness = {};
            
            // Track writing patterns
            if (analysis.style && typeof analysis.style.avgSentenceLength === 'number') {
                model.patterns.averageSentenceLength = (model.patterns.averageSentenceLength || 0) * 0.9 + analysis.style.avgSentenceLength * 0.1;
            }
            if (analysis.style && typeof analysis.style.vocabularyDiversity === 'number') {
                model.patterns.vocabularyDiversity = (model.patterns.vocabularyDiversity || 0) * 0.9 + analysis.style.vocabularyDiversity * 0.1;
            }
            
            // Track flow patterns
            if (analysis.flow && analysis.flow.state) {
                model.patterns.flowState = analysis.flow.state;
            }
            if (analysis.flow && typeof analysis.flow.score === 'number') {
                model.patterns.averageFlowScore = (model.patterns.averageFlowScore || 0) * 0.9 + analysis.flow.score * 0.1;
            }
            
            // Track creativity patterns
            if (analysis.creativity && typeof analysis.creativity.score === 'number') {
                model.patterns.creativityScore = (model.patterns.creativityScore || 0) * 0.9 + analysis.creativity.score * 0.1;
            }
            
            // Update user engagement metrics
            this.adaptiveLearning.userEngagement.totalSessions++;
            this.adaptiveLearning.userEngagement.lastUpdate = Date.now();
            
            // Save updated data
            this.saveCompanionData();
            
        } catch (error) {
            console.warn('[AI Companion] Learning model update failed:', error);
        }
    }
    
    // === Debug Methods ===
    
    debugTriggerAnalysis() {
        console.log('[AI Companion] 🔧 DEBUG: Force triggering analysis');
        console.log('[AI Companion] 🔧 Current typing buffer:', JSON.stringify(this.realTimeAnalysis.recentTypingBuffer));
        console.log('[AI Companion] 🔧 Analysis buffer entries:', this.realTimeAnalysis.analysisBuffer.length);
        this.performContextualAnalysis();
    }
    
    debugForceShowFeedback() {
        console.log('[AI Companion] 🔧 DEBUG: Force showing feedback (bypassing shouldShowFeedback)');
        
        const currentTyping = this.extractCurrentTyping();
        
        // Even in debug mode, don't proceed without some content
        if (!currentTyping && !this.realTimeAnalysis.recentTypingBuffer) {
            console.log('[AI Companion] 🔧 DEBUG: No content available for feedback, creating test content');
            // For debug purposes, create some test content
            this.realTimeAnalysis.recentTypingBuffer = 'This is test content for debugging purposes.';
        }
        
        // Create a simple analysis with current typing buffer
        const analysis = {
            flow: { state: 'struggling' }, // Force struggling state to trigger feedback
            recentText: this.realTimeAnalysis.recentTypingBuffer || 'test text',
            lastSentence: currentTyping || 'test sentence',
            progress: { milestone: false },
            creativity: { breakthrough: false }
        };
        
        console.log('[AI Companion] 🔧 DEBUG analysis:', analysis);
        
        // Force generate feedback
        this.generateContextualFeedback(analysis);
    }
    
    debugGetTypingBuffer() {
        console.log('[AI Companion] 🔧 DEBUG: Current typing buffer:', JSON.stringify(this.realTimeAnalysis.recentTypingBuffer));
        return this.realTimeAnalysis.recentTypingBuffer;
    }
    
    debugClearTypingBuffer() {
        console.log('[AI Companion] 🔧 DEBUG: Clearing typing buffer');
        this.realTimeAnalysis.recentTypingBuffer = '';
    }
    
    debugTestRealTimeCapture(testText = 'Hello world test') {
        console.log('[AI Companion] 🧪 DEBUG: Testing real-time capture with:', JSON.stringify(testText));
        
        // Manually call processNewWriting to test the system
        this.processNewWriting(testText);
        
        // Check what's in the buffer
        console.log('[AI Companion] 🧪 Buffer after test:', JSON.stringify(this.realTimeAnalysis.recentTypingBuffer));
        
        // Test extraction
        const extracted = this.extractCurrentTyping();
        console.log('[AI Companion] 🧪 Extracted text:', JSON.stringify(extracted));
        
        return extracted;
    }
    
    debugTestFullPipeline() {
        console.log('[AI Companion] 🧪 DEBUG: Testing full pipeline...');
        
        // Step 1: Test typing capture
        const testText = 'This is a test sentence about Hegel and dialectics.';
        this.debugTestRealTimeCapture(testText);
        
        // Step 2: Check if editor events are connected
        console.log('[AI Companion] 🧪 Checking editor integration...');
        console.log('[AI Companion] 🧪 window.editor exists:', !!window.editor);
        console.log('[AI Companion] 🧪 window.aiCompanion exists:', !!window.aiCompanion);
        
        // Step 3: Test context handling
        console.log('[AI Companion] 🧪 Testing context handling...');
        const fullContent = this.getCurrentWritingContent();
        const contextText = this.prepareContextForAI(fullContent, testText);
        console.log('[AI Companion] 🧪 Full content length:', fullContent.length);
        console.log('[AI Companion] 🧪 Context scope:', this.contextConfig.scope);
        console.log('[AI Companion] 🧪 Prepared context length:', contextText.length);
        console.log('[AI Companion] 🧪 Context preview:', contextText.substring(0, 200));
        
        // Step 4: Force trigger analysis
        console.log('[AI Companion] 🧪 Force triggering analysis...');
        this.debugForceShowFeedback();
        
        return {
            typingBuffer: this.realTimeAnalysis.recentTypingBuffer,
            analysisBufferEntries: this.realTimeAnalysis.analysisBuffer.length,
            editorExists: !!window.editor,
            companionExists: !!window.aiCompanion,
            contextScope: this.contextConfig.scope,
            fullContentLength: fullContent.length,
            preparedContextLength: contextText.length
        };
    }
    
    // === Manual Invocation ===
    
    invokeAshManually(selectedText = null) {
        this.log('basic', 'user', 'Manual invocation of Ash - bypassing auto-invocation restrictions');
        
        // Manual invocation always proceeds regardless of auto-invocation settings
        // This ensures the user can always explicitly request Ash assistance
        
        // If text is selected, use it to override the typing buffer
        if (selectedText && selectedText.trim()) {
            this.log('verbose', 'user', 'Using selected text:', selectedText);
            // Set the typing buffer to the selected text
            this.realTimeAnalysis.recentTypingBuffer = selectedText.trim();
            // Also add to analysis buffer
            this.realTimeAnalysis.analysisBuffer.push({
                text: selectedText.trim(),
                timestamp: Date.now(),
                context: this.getCurrentWritingContext(),
                source: 'manual_selection'
            });
        } else {
            this.log('verbose', 'user', 'No selected text, using current typing buffer');
        }
        
        // Force show feedback regardless of conditions
        this.debugForceShowFeedback();
        
        return this.realTimeAnalysis.recentTypingBuffer;
    }
    
    getSelectedText() {
        // Get selected text from Monaco editor or fallback editor
        if (window.editor && typeof window.editor.getSelection === 'function') {
            const selection = window.editor.getSelection();
            if (selection && !selection.isEmpty()) {
                const model = window.editor.getModel();
                if (model) {
                    return model.getValueInRange(selection);
                }
            }
        } else if (window.fallbackEditor) {
            // Fallback textarea
            const start = window.fallbackEditor.selectionStart;
            const end = window.fallbackEditor.selectionEnd;
            if (start !== end) {
                return window.fallbackEditor.value.substring(start, end);
            }
        }
        return null;
    }
    
    handleKeyboardInvocation() {
        this.log('basic', 'user', 'Keyboard shortcut triggered');
        
        // Show progress indicator
        this.showProgressIndicator();
        
        // Get selected text if any
        const selectedText = this.getSelectedText();
        
        if (selectedText) {
            this.log('verbose', 'user', 'Found selected text, using as focus');
            this.invokeAshManually(selectedText);
        } else {
            this.log('verbose', 'user', 'No selection, using current typing buffer');
            this.invokeAshManually();
        }
    }
    
    showProgressIndicator() {
        // Update the Invoke Ash button to show progress
        const invokeAshBtn = document.getElementById('invoke-ash-btn');
        if (invokeAshBtn) {
            invokeAshBtn.innerHTML = '⏳'; // Loading spinner
            invokeAshBtn.title = 'Ash is thinking...';
            invokeAshBtn.disabled = true;
            invokeAshBtn.style.opacity = '0.7';
            
            // Add a subtle pulsing animation
            invokeAshBtn.style.animation = 'pulse 1.5s ease-in-out infinite';
            
            // Add the keyframe animation if it doesn't exist
            if (!document.querySelector('#ash-loading-animation')) {
                const style = document.createElement('style');
                style.id = 'ash-loading-animation';
                style.textContent = `
                    @keyframes pulse {
                        0% { transform: scale(1); }
                        50% { transform: scale(1.05); }
                        100% { transform: scale(1); }
                    }
                `;
                document.head.appendChild(style);
            }
        }
        
        // Show a temporary notification
        this.showNotification('🤔 Ash is analyzing your text...', 'info');
        
        console.log('[AI Companion] 🔄 Progress indicator shown');
    }
    
    hideProgressIndicator() {
        // Restore the Invoke Ash button
        const invokeAshBtn = document.getElementById('invoke-ash-btn');
        if (invokeAshBtn) {
            invokeAshBtn.innerHTML = '💬'; // Original icon
            invokeAshBtn.title = 'Invoke Ash (AI Writing Companion) - Cmd+Shift+A';
            invokeAshBtn.disabled = false;
            invokeAshBtn.style.opacity = '1';
            invokeAshBtn.style.animation = ''; // Remove animation
        }
        
        console.log('[AI Companion] ✅ Progress indicator hidden');
    }
    
    showNotification(message, type = 'info') {
        // Try to use the global notification system if available
        if (window.showNotification && typeof window.showNotification === 'function') {
            window.showNotification(message, type);
        } else {
            // Fallback: create a simple toast notification
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${type === 'info' ? '#e3f2fd' : type === 'success' ? '#e8f5e8' : '#fff3cd'};
                border: 1px solid ${type === 'info' ? '#90caf9' : type === 'success' ? '#c3e6c3' : '#ffeaa7'};
                color: ${type === 'info' ? '#1976d2' : type === 'success' ? '#2e7d32' : '#f57c00'};
                padding: 12px 16px;
                border-radius: 4px;
                font-size: 14px;
                max-width: 300px;
                z-index: 10000;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                transition: opacity 0.3s ease;
            `;
            notification.textContent = message;
            document.body.appendChild(notification);
            
            // Auto-remove after 3 seconds
            setTimeout(() => {
                notification.style.opacity = '0';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }, 3000);
        }
    }
    
    // === Settings Loading ===
    
    async loadContextSettings() {
        try {
            const settings = await window.electronAPI.invoke('get-settings');
            if (settings && settings.ai) {
                // Load context scope setting
                if (settings.ai.companionContextScope) {
                    this.contextConfig.scope = settings.ai.companionContextScope;
                    this.log('basic', 'config', `Loaded context scope from settings: ${settings.ai.companionContextScope}`);
                }
                
                // Load max context length setting
                if (settings.ai.companionMaxContextLength && settings.ai.companionMaxContextLength > 0) {
                    this.contextConfig.maxFullDocumentLength = settings.ai.companionMaxContextLength;
                    this.log('basic', 'config', `Loaded max context length from settings: ${settings.ai.companionMaxContextLength}`);
                }
                
                this.log('basic', 'config', 'Context configuration loaded from settings successfully');
            } else {
                this.log('basic', 'config', 'No AI settings found, using default context configuration');
            }
        } catch (error) {
            this.log('basic', 'config', `Failed to load context settings, using defaults: ${error.message}`);
        }
    }
    
    // === Logging Methods ===
    
    log(level, category, message, data = null) {
        // Check if logging is enabled for this level and category
        if (!this.shouldLog(level, category)) return;
        
        const timestamp = new Date().toISOString().split('T')[1].slice(0, -1); // HH:MM:SS.mmm
        const prefix = `[AI Companion] [${timestamp}] [${level.toUpperCase()}] [${category}]`;
        
        if (data !== null) {
            console.log(prefix, message, data);
        } else {
            console.log(prefix, message);
        }
    }
    
    shouldLog(level, category) {
        // If logging is completely disabled
        if (this.loggingConfig.level === 'none') return false;
        
        // Check category-specific settings
        switch (category) {
            case 'ai-input':
                return this.loggingConfig.logAIInputs;
            case 'ai-output':
                return this.loggingConfig.logAIOutputs;
            case 'context':
                return this.loggingConfig.logContextPreparation;
            case 'analysis':
                return this.loggingConfig.logAnalysisSteps;
            case 'user':
                return this.loggingConfig.logUserInteractions;
            case 'performance':
                return this.loggingConfig.logPerformanceMetrics;
        }
        
        // Check level hierarchy
        const levels = ['none', 'basic', 'verbose', 'debug'];
        const currentLevel = levels.indexOf(this.loggingConfig.level);
        const messageLevel = levels.indexOf(level);
        
        if (currentLevel === -1 || messageLevel === -1) return false;
        
        return messageLevel <= currentLevel;
    }
    
    // Configuration methods for logging
    setLoggingLevel(level) {
        const validLevels = ['none', 'basic', 'verbose', 'debug'];
        if (validLevels.includes(level)) {
            this.loggingConfig.level = level;
            this.log('basic', 'config', `Logging level set to: ${level}`);
            return true;
        } else {
            console.warn('[AI Companion] Invalid logging level:', level, 'Valid options:', validLevels);
            return false;
        }
    }
    
    setLoggingOption(option, value) {
        const validOptions = ['logAIInputs', 'logAIOutputs', 'logContextPreparation', 'logAnalysisSteps', 'logUserInteractions', 'logPerformanceMetrics'];
        if (validOptions.includes(option) && typeof value === 'boolean') {
            this.loggingConfig[option] = value;
            this.log('basic', 'config', `Logging option ${option} set to: ${value}`);
            return true;
        } else {
            console.warn('[AI Companion] Invalid logging option or value:', option, value);
            return false;
        }
    }
    
    getLoggingConfig() {
        return { ...this.loggingConfig }; // Return copy to prevent external modification
    }
    
    // Bulk configuration update
    configureLogging(config) {
        const updated = [];
        
        if (config.level) {
            if (this.setLoggingLevel(config.level)) {
                updated.push(`level: ${config.level}`);
            }
        }
        
        ['logAIInputs', 'logAIOutputs', 'logContextPreparation', 'logAnalysisSteps', 'logUserInteractions', 'logPerformanceMetrics'].forEach(option => {
            if (config[option] !== undefined) {
                if (this.setLoggingOption(option, config[option])) {
                    updated.push(`${option}: ${config[option]}`);
                }
            }
        });
        
        this.log('basic', 'config', 'Logging configuration updated:', updated.join(', '));
        return updated.length > 0;
    }
    
    // === Context Preparation Methods ===
    
    prepareContextForAI(fullContent, focusText) {
        this.log('verbose', 'context', `Preparing context for AI with scope: ${this.contextConfig.scope}`);
        
        let contextText = '';
        
        switch (this.contextConfig.scope) {
            case 'full_document':
                contextText = fullContent || '';
                // Truncate if too long for performance
                if (contextText.length > this.contextConfig.maxFullDocumentLength) {
                    this.log('verbose', 'context', `Truncating full document context from ${contextText.length} to ${this.contextConfig.maxFullDocumentLength} characters`);
                    // Keep the beginning and end, remove middle
                    const keepStart = Math.floor(this.contextConfig.maxFullDocumentLength * 0.3);
                    const keepEnd = Math.floor(this.contextConfig.maxFullDocumentLength * 0.7);
                    contextText = contextText.substring(0, keepStart) + 
                                 '\n\n[... content truncated for length ...]\n\n' + 
                                 contextText.substring(contextText.length - keepEnd);
                }
                break;
                
            case 'recent_text_only':
                // Use recent analysis buffer + typing buffer
                const recentEntries = this.realTimeAnalysis.analysisBuffer.slice(-5);
                const recentText = recentEntries.map(entry => entry.text).join(' ');
                const combinedRecent = (recentText + ' ' + this.realTimeAnalysis.recentTypingBuffer).trim();
                contextText = combinedRecent.slice(-this.contextConfig.recentTextLength);
                this.log('verbose', 'context', `Using recent text context: ${contextText.length} characters`);
                break;
                
            case 'selected_text_only':
                // Use only the focus text (what they just typed or selected)
                contextText = focusText || '';
                this.log('verbose', 'context', `Using selected text only: ${contextText.length} characters`);
                break;
                
            default:
                this.log('basic', 'context', `Unknown context scope: ${this.contextConfig.scope}, defaulting to full document`);
                contextText = fullContent || '';
        }
        
        // Apply formatting options
        if (!this.contextConfig.preserveFormatting) {
            // Strip markdown formatting for cleaner context
            contextText = this.stripMarkdownFormatting(contextText);
        }
        
        this.log('verbose', 'context', `Context prepared: ${contextText.length} characters`);
        return contextText;
    }
    
    stripMarkdownFormatting(text) {
        if (!text) return '';
        
        // Remove common markdown syntax while preserving readability
        return text
            .replace(/#{1,6}\s+/g, '') // Headers
            .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
            .replace(/\*(.*?)\*/g, '$1') // Italic
            .replace(/`(.*?)`/g, '$1') // Inline code
            .replace(/```[\s\S]*?```/g, '[code block]') // Code blocks
            .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Links
            .replace(/^\s*[-*+]\s+/gm, '') // List items
            .replace(/^\s*\d+\.\s+/gm, '') // Numbered lists
            .replace(/^\s*>\s+/gm, '') // Blockquotes
            .replace(/\n\s*\n/g, '\n') // Extra newlines
            .trim();
    }
    
    // Configuration methods
    setContextScope(scope) {
        const validScopes = ['full_document', 'recent_text_only', 'selected_text_only'];
        if (validScopes.includes(scope)) {
            this.contextConfig.scope = scope;
            console.log('[AI Companion] ⚙️ Context scope set to:', scope);
            return true;
        } else {
            console.warn('[AI Companion] ⚠️ Invalid context scope:', scope, 'Valid options:', validScopes);
            return false;
        }
    }
    
    getContextScope() {
        return this.contextConfig.scope;
    }
    
    setMaxFullDocumentLength(length) {
        if (typeof length === 'number' && length > 0) {
            this.contextConfig.maxFullDocumentLength = length;
            console.log('[AI Companion] ⚙️ Max full document length set to:', length);
            return true;
        } else {
            console.warn('[AI Companion] ⚠️ Invalid max document length:', length);
            return false;
        }
    }
    
    setRecentTextLength(length) {
        if (typeof length === 'number' && length > 0) {
            this.contextConfig.recentTextLength = length;
            console.log('[AI Companion] ⚙️ Recent text length set to:', length);
            return true;
        } else {
            console.warn('[AI Companion] ⚠️ Invalid recent text length:', length);
            return false;
        }
    }
    
    getContextConfig() {
        return { ...this.contextConfig }; // Return copy to prevent external modification
    }
    
    // Debug method for context testing
    debugTestContextHandling() {
        console.log('[AI Companion] 🧪 DEBUG: Testing context handling...');
        
        const fullContent = this.getCurrentWritingContent();
        const testFocusText = 'This is a test focus sentence.';
        
        // Test all context scopes
        const originalScope = this.contextConfig.scope;
        const results = {};
        
        ['full_document', 'recent_text_only', 'selected_text_only'].forEach(scope => {
            this.setContextScope(scope);
            const contextText = this.prepareContextForAI(fullContent, testFocusText);
            results[scope] = {
                length: contextText.length,
                preview: contextText.substring(0, 100)
            };
            console.log(`[AI Companion] 🧪 ${scope}:`, contextText.length, 'chars');
        });
        
        // Restore original scope
        this.setContextScope(originalScope);
        
        console.log('[AI Companion] 🧪 Context test results:', results);
        return results;
    }
    
    // Debug method for logging testing
    debugTestLogging() {
        console.log('[AI Companion] 🧪 DEBUG: Testing logging configuration...');
        
        const originalConfig = { ...this.loggingConfig };
        console.log('Original config:', originalConfig);
        
        // Test all logging levels
        ['none', 'basic', 'verbose', 'debug'].forEach(level => {
            console.log(`\n--- Testing level: ${level} ---`);
            this.setLoggingLevel(level);
            
            // Test different categories
            this.log('basic', 'user', 'Test basic user message');
            this.log('verbose', 'context', 'Test verbose context message');
            this.log('debug', 'ai-input', 'Test debug AI input message');
            this.log('verbose', 'ai-output', 'Test verbose AI output message');
        });
        
        // Restore original config
        this.configureLogging(originalConfig);
        console.log('\n✅ Logging test complete - original config restored');
        
        return {
            tested: ['none', 'basic', 'verbose', 'debug'],
            categories: ['user', 'context', 'ai-input', 'ai-output', 'analysis', 'performance'],
            currentConfig: this.getLoggingConfig()
        };
    }
    
    // Debug method for investigating file content issues
    debugInvestigateContentIssues() {
        console.log('[AI Companion] 🔍 Investigating potential file content issues...');
        
        const currentContent = this.getCurrentWritingContent();
        const currentPath = window.currentFilePath || 'unknown';
        
        console.log('📄 Current file path:', currentPath);
        console.log('📄 Content length:', currentContent.length);
        console.log('📄 Content hash:', this.getContentHash(currentContent));
        console.log('📄 Content start (100 chars):', JSON.stringify(currentContent.substring(0, 100)));
        console.log('📄 Content end (100 chars):', JSON.stringify(currentContent.substring(Math.max(0, currentContent.length - 100))));
        
        // Check editor state
        console.log('🖊️ Editor state:');
        console.log('  window.editor exists:', !!window.editor);
        console.log('  window.editor.getValue available:', !!(window.editor && window.editor.getValue));
        
        if (window.editor && window.editor.getModel) {
            const model = window.editor.getModel();
            console.log('  Editor model exists:', !!model);
            if (model) {
                console.log('  Model language:', model.getLanguageId());
                console.log('  Model line count:', model.getLineCount());
            }
        }
        
        // Check auto-save state
        console.log('💾 Auto-save state:');
        console.log('  hasUnsavedChanges:', typeof hasUnsavedChanges !== 'undefined' ? hasUnsavedChanges : 'unknown');
        console.log('  suppressAutoSave:', typeof suppressAutoSave !== 'undefined' ? suppressAutoSave : 'unknown');
        console.log('  autoSaveTimer active:', typeof autoSaveTimer !== 'undefined' && autoSaveTimer ? true : false);
        
        return {
            filePath: currentPath,
            contentLength: currentContent.length,
            contentHash: this.getContentHash(currentContent),
            editorExists: !!window.editor,
            timestamp: new Date().toISOString()
        };
    }
    
    // === Chat Integration ===
    
    copyFeedbackToChat(analysis, feedback) {
        try {
            // Check if AI Chat functionality is available
            if (!window.addChatMessage || typeof window.addChatMessage !== 'function') {
                console.warn('[AI Companion] AI Chat not available for copying feedback');
                return;
            }
            
            console.log('[AI Companion] 📋 Copying feedback to AI Chat pane');
            
            // Get the user's focus text (what Ash analyzed)
            const userFocusText = analysis.lastSentence || 'No text selected';
            const feedbackMessage = feedback.message || 'No feedback generated';
            const feedbackType = feedback.type || 'feedback';
            const currentFile = window.currentFilePath || 'document';
            const fileName = currentFile.split('/').pop() || currentFile.split('\\').pop() || 'document';
            
            // Format a comprehensive user message
            const userMessage = `**Ash Feedback Request**
            
📄 **File**: ${fileName}
🎯 **Type**: ${feedbackType}
📝 **Focus text**: "${userFocusText}"

Please provide writing feedback on the above text.`;
            
            // Add user message to chat
            window.addChatMessage(userMessage, 'User');
            
            // Add Ash's response to chat with proper attribution
            window.addChatMessage(feedbackMessage, 'AI', false, { 
                provider: 'Ash', 
                model: 'Writing Companion' 
            });
            
            console.log('[AI Companion] ✅ Feedback copied to AI Chat successfully');
            
            // Optional: Auto-scroll to the chat pane to show the new messages
            this.scrollToChatMessages();
            
        } catch (error) {
            console.error('[AI Companion] Error copying feedback to chat:', error);
        }
    }
    
    scrollToChatMessages() {
        try {
            const chatMessages = document.getElementById('chat-messages');
            if (chatMessages) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        } catch (error) {
            console.warn('[AI Companion] Could not scroll to chat messages:', error);
        }
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.AIWritingCompanion = AIWritingCompanion;
}
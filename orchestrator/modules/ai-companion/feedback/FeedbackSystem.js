// === AI Feedback System ===
// Manages feedback generation, personalization, and delivery

class FeedbackSystem {
    constructor(aiCompanion) {
        this.aiCompanion = aiCompanion;
        
        // Feedback Configuration
        this.feedbackConfig = {
            enabled: true,
            adaptiveThreshold: 0.7, // How confident AI needs to be before giving feedback
            suppressionPeriod: 300000, // 5 minutes between similar feedback types
            minimumInterval: 60000, // 1 minute minimum between any feedback
            feedbackTypes: {
                encouragement: { weight: 0.4, lastShown: 0 },
                insights: { weight: 0.3, lastShown: 0 },
                suggestions: { weight: 0.2, lastShown: 0 },
                celebrations: { weight: 0.1, lastShown: 0 }
            }
        };

        // AI Cooldown System (migrated from legacy system)
        this.aiCooldown = {
            lastAICallTime: 0, // Timestamp when AI was last called
            cooldownPeriod: 30000, // Minimum 30 seconds between AI calls (default)
            minimumCharacters: 500 // Minimum characters before AI feedback (default)
        };

        // Feedback history
        this.feedbackHistory = [];
        this.lastFeedbackTime = 0;
        
        // Response libraries (must be initialized first)
        this.responseLibraries = this.initializeResponseLibraries();

        // Load cooldown settings from user preferences
        this.loadCooldownSettings();

        // Mentor personas (depends on responseLibraries)
        this.mentorPersonas = {
            current: 'adaptive',
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
    }

    // === Main Feedback Generation ===

    async generateExplicitFeedback(analysis) {
        try {
            console.log('[FeedbackSystem] 🎯 Generating EXPLICIT feedback - bypassing all cooldowns and thresholds');
            
            // Force analysis to have meaningful content for explicit invocations
            if (!analysis.fullDocumentText || analysis.fullDocumentText.length < 10) {
                analysis.lastSentence = "User explicitly requested AI feedback";
                analysis.recentText = "Explicit feedback request";
                analysis.fullDocumentText = "User has explicitly requested AI feedback assistance.";
            }
            
            const context = this.getCurrentWritingContext();
            const persona = this.selectOptimalPersona(analysis, context);
            
            console.log('[FeedbackSystem] 🚀 Bypassing cooldowns for explicit invocation');
            
            // Generate personalized feedback WITHOUT cooldown checks
            const feedback = await this.generatePersonalizedFeedbackBypass(analysis, persona, context);
            
            if (feedback) {
                // Record feedback interaction
                this.recordFeedbackInteraction(feedback, analysis);
                this.lastFeedbackTime = Date.now();
                
                // Log usage
                this.aiCompanion.logUsage('explicit_feedback_generated', {
                    type: feedback.type,
                    persona: feedback.persona,
                    explicit: true
                });
                
                console.log('[FeedbackSystem] ✅ Explicit feedback generated successfully:', feedback);
                return feedback;
            }
            
            console.warn('[FeedbackSystem] ⚠️ Failed to generate explicit feedback');
            return null;
            
        } catch (error) {
            console.error('[FeedbackSystem] ❌ Error in explicit feedback generation:', error);
            return null;
        }
    }

    async generateContextualFeedback(analysis) {
        try {
            // Validate meaningful content
            const hasLastSentence = analysis.lastSentence && this.hasMeaningfulText(analysis.lastSentence);
            const hasRecentText = analysis.recentText && this.hasMeaningfulText(analysis.recentText);
            
            if (!hasLastSentence && !hasRecentText) {
                this.log('Skipping feedback generation - no meaningful content');
                return null;
            }

            // Trust that AICompanionManager has already determined we have enough content
            // No need to check character thresholds again here
            console.log(`[FeedbackSystem] 📊 Processing feedback request with content length: ${(analysis.recentText || analysis.fullDocumentText || '').length} chars`);
            
            const context = this.getCurrentWritingContext();
            const persona = this.selectOptimalPersona(analysis, context);
            
            // Check if feedback should be shown
            if (!this.shouldShowFeedback(analysis)) {
                return null;
            }
            
            // Generate personalized feedback
            const feedback = await this.generatePersonalizedFeedback(analysis, persona, context);
            
            if (feedback) {
                // Record feedback interaction
                this.recordFeedbackInteraction(feedback, analysis);
                this.lastFeedbackTime = Date.now();
                
                // Log usage
                this.aiCompanion.logUsage('feedback_generated', {
                    type: feedback.type,
                    persona: feedback.persona,
                    flowState: analysis.flow?.state,
                    confidence: feedback.confidence
                });
                
                return feedback;
            }
            
        } catch (error) {
            console.error('[FeedbackSystem] Error generating contextual feedback:', error);
            return null;
        }
    }

    shouldShowFeedback(analysis) {
        if (!this.feedbackConfig.enabled) return false;
        
        const timeSinceLastFeedback = Date.now() - this.lastFeedbackTime;
        
        // Don't interrupt during deep flow
        if (analysis.flow?.state === 'deep_flow') {
            return false;
        }
        
        // Show encouragement when struggling
        if (analysis.flow?.state === 'struggling' || analysis.flow?.state === 'blocked') {
            return true;
        }
        
        // Show insights when there's something meaningful to share
        if (analysis.progress?.milestone || analysis.creativity?.breakthrough) {
            return true;
        }
        
        // Check minimum interval
        return timeSinceLastFeedback > this.feedbackConfig.minimumInterval;
    }

    async generatePersonalizedFeedbackBypass(analysis, persona, context) {
        const feedbackType = this.selectFeedbackType(analysis, context);
        const personalizations = this.getPersonalizations(analysis);
        
        try {
            // Use AI service to generate contextual feedback - BYPASS cooldown checks
            const aiPrompt = this.buildFeedbackPrompt(analysis, persona, feedbackType, personalizations, context);
            console.log('[FeedbackSystem] 🔄 EXPLICIT INVOCATION - bypassing cooldown for AI service call');
            console.log('[FeedbackSystem] 📝 Prompt preview:', aiPrompt.slice(0, 200) + '...');
            
            const response = await this.callAIServiceBypass(aiPrompt);
            console.log('[FeedbackSystem] 🎯 AI service response (bypass):', response);
            
            if (response && response.message) {
                console.log('[FeedbackSystem] ✅ Using AI-generated feedback (explicit invocation)');
                return {
                    type: feedbackType,
                    persona: persona.name,
                    message: response.message,
                    confidence: response.confidence || 0.9,
                    timestamp: Date.now(),
                    source: 'ai_explicit',
                    analysis: {
                        flowState: analysis.flow?.state,
                        sentiment: analysis.sentiment?.tendency
                    },
                    explicit: true
                };
            }
            
        } catch (error) {
            console.error('[FeedbackSystem] ❌ AI service call failed for explicit invocation:', error);
        }
        
        // Fallback to template-based feedback for explicit invocations
        console.log('[FeedbackSystem] 🔄 Falling back to template feedback for explicit invocation');
        return this.generateTemplateFeedback(analysis, persona, feedbackType);
    }

    async generatePersonalizedFeedback(analysis, persona, context) {
        const feedbackType = this.selectFeedbackType(analysis, context);
        const personalizations = this.getPersonalizations(analysis);
        
        try {
            // Use AI service to generate contextual feedback
            const aiPrompt = this.buildFeedbackPrompt(analysis, persona, feedbackType, personalizations, context);
            console.log('[FeedbackSystem] 🔄 Attempting AI service call with FRESH conversation (no history)');
            console.log('[FeedbackSystem] 📝 Prompt preview:', aiPrompt.slice(0, 200) + '...');
            
            const response = await this.callAIService(aiPrompt);
            console.log('[FeedbackSystem] 🎯 AI service response:', response);
            
            if (response && response.message) {
                console.log('[FeedbackSystem] ✅ Using AI-generated feedback');
                return {
                    type: feedbackType,
                    persona: persona.name,
                    message: response.message,
                    confidence: response.confidence || 0.8,
                    timestamp: Date.now(),
                    source: 'ai_generated',
                    analysis: {
                        flowState: analysis.flow?.state,
                        sentiment: analysis.sentiment?.tendency,
                        creativity: analysis.creativity?.score
                    }
                };
            } else if (response === null) {
                // Cooldown is active - don't show any feedback
                console.log('[FeedbackSystem] 🔇 Cooldown active - suppressing all feedback');
                return null;
            } else {
                console.warn('[FeedbackSystem] ⚠️ AI service returned no valid response, falling back to templates');
            }
            
        } catch (error) {
            console.error('[FeedbackSystem] ❌ Error generating AI feedback:', error);
        }
        
        // Fallback to template-based feedback only if cooldown has expired
        if (this.checkAICooldown()) {
            console.log('[FeedbackSystem] 📝 Cooldown expired - falling back to template-based feedback');
            return this.generateTemplateFeedback(analysis, persona, feedbackType);
        }
        
        console.log('[FeedbackSystem] 🔇 Still in cooldown - suppressing template feedback');
        return null;
    }

    selectFeedbackType(analysis, context) {
        // Determine the most appropriate feedback type based on analysis
        
        if (analysis.flow?.state === 'struggling' || analysis.flow?.state === 'blocked') {
            return 'encouragement';
        }
        
        if (analysis.creativity?.breakthrough || analysis.progress?.milestone) {
            return 'celebrations';
        }
        
        if (analysis.complexity?.readingLevel || analysis.structure?.structureScore > 0.7) {
            return 'insights';
        }
        
        if (context.sessionDuration > 1800000) { // 30+ minutes
            return 'suggestions';
        }
        
        return 'encouragement'; // Default fallback
    }

    selectOptimalPersona(analysis, context) {
        // Select the best persona based on writing context and analysis
        
        const flowState = analysis.flow?.state;
        const creativityScore = analysis.creativity?.score || 0;
        const complexityScore = analysis.complexity?.complexity || 0;
        
        if (flowState === 'struggling' || flowState === 'blocked') {
            return this.mentorPersonas.personas.encouraging;
        }
        
        if (creativityScore > 0.6 || flowState === 'flow') {
            return this.mentorPersonas.personas.creative;
        }
        
        if (complexityScore > 0.7 || context.documentType === 'research') {
            return this.mentorPersonas.personas.analytical;
        }
        
        return this.mentorPersonas.personas.adaptive;
    }

    getPersonalizations(analysis) {
        return {
            wordCount: analysis.wordCount || 0,
            sessionDuration: analysis.sessionDuration || 0,
            flowState: analysis.flow?.state || 'unknown',
            sentimentTrend: analysis.sentiment?.tendency || 'neutral',
            creativityLevel: analysis.creativity?.score > 0.6 ? 'high' : 'moderate',
            complexityLevel: analysis.complexity?.readingLevel || 'Standard'
        };
    }

    // === AI Service Integration ===

    buildFeedbackPrompt(analysis, persona, feedbackType, personalizations, context) {
        const hasSelectedText = analysis.selectedText && analysis.selectedText.trim().length > 0;
        const currentText = analysis.recentText || analysis.lastSentence || '';
        const textLabel = hasSelectedText ? "Selected text" : "Recent text";
        
        // Include full document if available and if it's different from recent text
        const hasFullDocument = analysis.fullDocumentText && analysis.fullDocumentText.length > currentText.length + 100;
        
        // Use the configured max context length or default to 10000 chars for prompt
        const maxContextLength = analysis.contextMetadata?.maxLength || 10000;
        const documentPreview = hasFullDocument ? 
            (analysis.fullDocumentText.length > maxContextLength ? 
                analysis.fullDocumentText.slice(0, maxContextLength) + '...[truncated]' : 
                analysis.fullDocumentText) : '';
        
        const basePrompt = `You are ${persona.name}, an AI writing companion with a ${persona.style} approach. 

${hasFullDocument ? `FULL DOCUMENT CONTEXT:
\"\"\"
${documentPreview}
\"\"\"

` : ''}Writing Context:
- ${textLabel}: "${currentText}"${hasSelectedText ? ' (user has specifically selected this text for analysis)' : ''}
- Document scope: ${analysis.contextMetadata?.scope || 'unknown'}
- Document length: ${analysis.fullDocumentText?.length || 0} characters
- Flow state: ${personalizations.flowState}
- Word count: ${personalizations.wordCount}
- Writing sentiment: ${personalizations.sentimentTrend}
- Session duration: ${Math.round(personalizations.sessionDuration / 60000)} minutes

Task: Provide ${feedbackType} feedback that is:
- Brief (1-2 sentences)
- ${persona.style}
- Contextually relevant${hasSelectedText ? ' to the selected text' : ''}${hasFullDocument ? ' within the document context' : ''}
- Encouraging but not generic

${hasSelectedText ? 
    'Focus specifically on the selected text and provide targeted feedback about it, considering its place in the overall document.' : 
    hasFullDocument ?
        'Focus on the writer\'s recent progress within the context of the full document.' :
        'Focus on the writer\'s current progress and state, not general writing advice.'
}`;

        console.log('[FeedbackSystem] 📄 Prompt includes full document:', hasFullDocument, 
                    'Document length:', analysis.fullDocumentText?.length || 0);

        return basePrompt;
    }

    async callAIServiceBypass(prompt) {
        try {
            console.log('[FeedbackSystem] 🚀 EXPLICIT INVOCATION - bypassing all cooldown checks');
            
            // DO NOT check cooldown - this is an explicit invocation
            // DO NOT update cooldown timestamp - this should not interfere with normal flow
            
            if (this.aiCompanion && this.aiCompanion.callAIService) {
                return await this.aiCompanion.callAIService(prompt);
            }
            
            // Fallback direct call
            const response = await window.electronAPI.invoke('ai-chat', {
                message: prompt,
                options: {
                    context: 'writing_companion_explicit',
                    newConversation: true, // Clear all conversation history - fresh start every time
                    conversationType: 'writing_analysis_explicit' // Distinct from regular AI calls
                }
            });
            
            return response.response ? { message: response.response, confidence: 0.9 } : null;
            
        } catch (error) {
            console.error('[FeedbackSystem] AI service call failed (explicit invocation):', error);
            return null;
        }
    }

    async callAIService(prompt) {
        try {
            // Check cooldown before making AI call
            if (!this.checkAICooldown()) {
                const timeSinceLastCall = Date.now() - this.aiCooldown.lastAICallTime;
                const remainingTime = Math.ceil((this.aiCooldown.cooldownPeriod - timeSinceLastCall) / 1000);
                console.log(`[FeedbackSystem] ⏳ AI cooldown active. ${remainingTime}s remaining.`);
                return null;
            }

            console.log('[FeedbackSystem] 🔄 Attempting AI service call with FRESH conversation (no history)');
            
            // Update cooldown timestamp BEFORE making the call
            this.aiCooldown.lastAICallTime = Date.now();

            if (this.aiCompanion && this.aiCompanion.callAIService) {
                return await this.aiCompanion.callAIService(prompt);
            }
            
            // Fallback direct call
            const response = await window.electronAPI.invoke('ai-chat', {
                message: prompt,
                options: {
                    context: 'writing_companion',
                    newConversation: true, // Clear all conversation history - fresh start every time
                    conversationType: 'writing_analysis' // Distinct from regular chat
                }
            });
            
            return response.response ? { message: response.response, confidence: 0.8 } : null;
            
        } catch (error) {
            console.error('[FeedbackSystem] AI service call failed:', error);
            return null;
        }
    }

    // === Template-based Feedback ===

    generateTemplateFeedback(analysis, persona, feedbackType) {
        console.log('[FeedbackSystem] 📋 Generating template feedback:', { feedbackType, persona: persona.name });
        
        const templates = this.responseLibraries[feedbackType] || [];
        console.log('[FeedbackSystem] Available templates for', feedbackType, ':', templates.length);
        
        if (templates.length === 0) {
            console.warn('[FeedbackSystem] ⚠️ No templates available for feedback type:', feedbackType);
            return null;
        }
        
        // Select template based on analysis
        const template = this.selectBestTemplate(templates, analysis);
        const message = this.personalizeTemplate(template, analysis);
        
        console.log('[FeedbackSystem] 📝 Generated template message:', message);
        
        return {
            type: feedbackType,
            persona: persona.name,
            message: message,
            confidence: 0.6,
            timestamp: Date.now(),
            source: 'template_based',
            analysis: {
                flowState: analysis.flow?.state,
                sentiment: analysis.sentiment?.tendency
            }
        };
    }

    selectBestTemplate(templates, analysis) {
        // Filter templates based on analysis context
        const flowState = analysis.flow?.state;
        const sentimentTrend = analysis.sentiment?.tendency;
        
        const contextualTemplates = templates.filter(template => {
            if (template.conditions) {
                return this.matchesConditions(template.conditions, { flowState, sentimentTrend });
            }
            return true;
        });
        
        // Return random template from contextual matches
        const validTemplates = contextualTemplates.length > 0 ? contextualTemplates : templates;
        return validTemplates[Math.floor(Math.random() * validTemplates.length)];
    }

    matchesConditions(conditions, context) {
        return Object.entries(conditions).every(([key, value]) => {
            if (Array.isArray(value)) {
                return value.includes(context[key]);
            }
            return context[key] === value;
        });
    }

    personalizeTemplate(template, analysis) {
        let message = template.message || template;
        
        // Replace placeholders with actual values
        const personalizations = this.getPersonalizations(analysis);
        
        Object.entries(personalizations).forEach(([key, value]) => {
            const placeholder = `{${key}}`;
            message = message.replace(new RegExp(placeholder, 'g'), value);
        });
        
        return message;
    }

    // === Feedback History and Analytics ===

    recordFeedbackInteraction(feedback, analysis) {
        this.feedbackHistory.push({
            ...feedback,
            analysis: {
                flowState: analysis.flow?.state,
                wordCount: analysis.wordCount,
                sessionDuration: analysis.sessionDuration
            }
        });
        
        // Keep only recent history
        if (this.feedbackHistory.length > 50) {
            this.feedbackHistory = this.feedbackHistory.slice(-25);
        }
        
        // Update feedback type timing
        if (this.feedbackConfig.feedbackTypes[feedback.type]) {
            this.feedbackConfig.feedbackTypes[feedback.type].lastShown = Date.now();
        }
    }

    getFeedbackStats() {
        const totalFeedback = this.feedbackHistory.length;
        const typeBreakdown = {};
        
        this.feedbackHistory.forEach(feedback => {
            typeBreakdown[feedback.type] = (typeBreakdown[feedback.type] || 0) + 1;
        });
        
        return {
            totalFeedback,
            typeBreakdown,
            lastFeedbackTime: this.lastFeedbackTime,
            averageConfidence: this.feedbackHistory.reduce((sum, f) => sum + f.confidence, 0) / totalFeedback || 0
        };
    }

    // === Response Libraries ===

    initializeResponseLibraries() {
        return {
            encouragement: [
                { message: "You're making great progress! Keep that momentum going.", conditions: { flowState: ['focused', 'light_flow'] } },
                { message: "Every word counts. You're building something meaningful.", conditions: { sentimentTrend: ['neutral', 'negative'] } },
                { message: "Writing can be challenging, but you're doing well. Take it one sentence at a time.", conditions: { flowState: ['struggling'] } },
                { message: "I can see your ideas developing. Trust the process." },
                { message: "Your writing style is engaging. Keep expressing your thoughts." }
            ],
            insights: [
                { message: "Your sentence structure is becoming more varied - great for readability!", conditions: { flowState: ['focused', 'light_flow'] } },
                { message: "I notice you're exploring complex ideas. Your depth of thinking shows.", conditions: { sentimentTrend: ['positive'] } },
                { message: "The vocabulary you're using adds richness to your writing." },
                { message: "Your writing rhythm is finding its natural flow." }
            ],
            suggestions: [
                { message: "Consider taking a short break to refresh your perspective.", conditions: { flowState: ['struggling'] } },
                { message: "You might try varying your sentence length for better flow." },
                { message: "Your ideas are solid - perhaps explore one in more depth?" },
                { message: "This section could benefit from a concrete example." }
            ],
            celebrations: [
                { message: "Excellent! You've hit a creative breakthrough with that passage.", conditions: { flowState: ['flow', 'light_flow'] } },
                { message: "That was a particularly insightful observation. Well done!" },
                { message: "You've reached a significant milestone in your writing!" },
                { message: "Beautiful work! Your writing voice is really shining through." }
            ]
        };
    }

    // === Response Library Helpers ===

    getEncouragingResponses() {
        return this.responseLibraries.encouragement;
    }

    getAnalyticalResponses() {
        return this.responseLibraries.insights;
    }

    getCreativeResponses() {
        return this.responseLibraries.celebrations;
    }

    getAdaptiveResponses() {
        return [
            ...this.responseLibraries.encouragement,
            ...this.responseLibraries.insights,
            ...this.responseLibraries.suggestions
        ];
    }

    // === Utility Methods ===

    getCurrentWritingContext() {
        const sessionStart = this.aiCompanion?.realTimeAnalysis?.sessionStartTime || Date.now();
        
        return {
            sessionDuration: Date.now() - sessionStart,
            documentType: this.detectDocumentType(),
            timeOfDay: new Date().getHours(),
            isFirstSession: this.feedbackHistory.length === 0
        };
    }

    detectDocumentType() {
        // Simple heuristic to detect document type
        if (!editor) return 'unknown';
        
        const content = editor.getValue().toLowerCase();
        
        if (content.includes('abstract') || content.includes('methodology')) {
            return 'research';
        }
        if (content.includes('chapter') || content.includes('once upon a time')) {
            return 'creative';
        }
        if (content.includes('# ') || content.includes('## ')) {
            return 'documentation';
        }
        
        return 'general';
    }

    hasMeaningfulText(text) {
        if (!text || typeof text !== 'string') return false;
        const meaningfulChars = text.replace(/[\s\.\,\!\?\;\:\-\(\)]+/g, '');
        return meaningfulChars.length >= 5;
    }

    getLastFeedbackTime() {
        return this.lastFeedbackTime;
    }

    log(message) {
        console.log(`[FeedbackSystem] ${message}`);
    }

    // === Configuration ===

    updateConfig(newConfig) {
        Object.assign(this.feedbackConfig, newConfig);
    }

    enableFeedback() {
        this.feedbackConfig.enabled = true;
    }

    disableFeedback() {
        this.feedbackConfig.enabled = false;
    }

    // === AI Cooldown System ===

    checkAICooldown() {
        const timeSinceLastCall = Date.now() - this.aiCooldown.lastAICallTime;
        const cooldownExpired = timeSinceLastCall >= this.aiCooldown.cooldownPeriod;
        
        if (!cooldownExpired) {
            const remainingTime = Math.ceil((this.aiCooldown.cooldownPeriod - timeSinceLastCall) / 1000);
            console.log(`[FeedbackSystem] ⏳ AI cooldown: ${remainingTime}s remaining`);
            return false;
        }
        
        console.log('[FeedbackSystem] ✅ AI cooldown expired, ready for new call');
        return true;
    }

    async loadCooldownSettings() {
        try {
            const settings = await window.electronAPI.invoke('get-settings');
            if (settings && settings.ai) {
                if (settings.ai.companionCharacterThreshold) {
                    this.aiCooldown.minimumCharacters = settings.ai.companionCharacterThreshold;
                    console.log(`[FeedbackSystem] Character threshold set to: ${this.aiCooldown.minimumCharacters}`);
                }
                
                if (settings.ai.companionCooldownPeriod) {
                    this.aiCooldown.cooldownPeriod = settings.ai.companionCooldownPeriod;
                    console.log(`[FeedbackSystem] Cooldown period set to: ${this.aiCooldown.cooldownPeriod}ms`);
                }
            }
        } catch (error) {
            console.error('[FeedbackSystem] Failed to load cooldown settings:', error);
        }
    }
}

// Make available globally
window.FeedbackSystem = FeedbackSystem;
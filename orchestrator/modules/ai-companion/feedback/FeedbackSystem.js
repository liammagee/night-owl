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

        // Feedback history
        this.feedbackHistory = [];
        this.lastFeedbackTime = 0;
        
        // Mentor personas
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

        // Response libraries
        this.responseLibraries = this.initializeResponseLibraries();
    }

    // === Main Feedback Generation ===

    async generateContextualFeedback(analysis) {
        try {
            // Validate meaningful content
            const hasLastSentence = analysis.lastSentence && this.hasMeaningfulText(analysis.lastSentence);
            const hasRecentText = analysis.recentText && this.hasMeaningfulText(analysis.recentText);
            
            if (!hasLastSentence && !hasRecentText) {
                this.log('Skipping feedback generation - no meaningful content');
                return null;
            }
            
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

    async generatePersonalizedFeedback(analysis, persona, context) {
        const feedbackType = this.selectFeedbackType(analysis, context);
        const personalizations = this.getPersonalizations(analysis);
        
        try {
            // Use AI service to generate contextual feedback
            const aiPrompt = this.buildFeedbackPrompt(analysis, persona, feedbackType, personalizations, context);
            const response = await this.callAIService(aiPrompt);
            
            if (response && response.message) {
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
            }
            
        } catch (error) {
            console.error('[FeedbackSystem] Error generating AI feedback:', error);
        }
        
        // Fallback to template-based feedback
        return this.generateTemplateFeedback(analysis, persona, feedbackType);
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
        const basePrompt = `You are ${persona.name}, an AI writing companion with a ${persona.style} approach. 
        
Writing Context:
- Current text: "${analysis.recentText || analysis.lastSentence || ''}"
- Flow state: ${personalizations.flowState}
- Word count: ${personalizations.wordCount}
- Writing sentiment: ${personalizations.sentimentTrend}
- Session duration: ${Math.round(personalizations.sessionDuration / 60000)} minutes

Task: Provide ${feedbackType} feedback that is:
- Brief (1-2 sentences)
- ${persona.style}
- Contextually relevant
- Encouraging but not generic

Focus on the writer's current progress and state, not general writing advice.`;

        return basePrompt;
    }

    async callAIService(prompt) {
        try {
            if (this.aiCompanion && this.aiCompanion.callAIService) {
                return await this.aiCompanion.callAIService(prompt);
            }
            
            // Fallback direct call
            const response = await window.electronAPI.invoke('ai-chat', {
                message: prompt,
                context: 'writing_companion'
            });
            
            return response.success ? { message: response.reply, confidence: 0.8 } : null;
            
        } catch (error) {
            console.error('[FeedbackSystem] AI service call failed:', error);
            return null;
        }
    }

    // === Template-based Feedback ===

    generateTemplateFeedback(analysis, persona, feedbackType) {
        const templates = this.responseLibraries[feedbackType] || [];
        
        if (templates.length === 0) {
            return null;
        }
        
        // Select template based on analysis
        const template = this.selectBestTemplate(templates, analysis);
        const message = this.personalizeTemplate(template, analysis);
        
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
}

// Make available globally
window.FeedbackSystem = FeedbackSystem;
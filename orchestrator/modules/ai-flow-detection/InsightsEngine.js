// === Insights Engine ===
// Generates real-time writing insights and AI-powered analysis for flow detection

class InsightsEngine {
    constructor() {
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

        this.maxInsightHistory = 50;
        this.insightGenerationThreshold = 10000; // 10 seconds between insights
        this.lastInsightGeneration = 0;
        
        // AI insight prompts
        this.insightPrompts = {
            flow: "Based on the user's typing patterns and current text, provide a brief insight about their writing flow state. Focus on momentum, rhythm, and engagement.",
            creativity: "Analyze the creative elements in the user's recent writing. Comment on originality, word choice, or conceptual development.",
            style: "Provide feedback on the user's writing style based on recent text. Consider clarity, tone, and effectiveness.",
            progress: "Assess the user's writing progress and suggest ways to maintain or improve momentum.",
            wellness: "Consider the user's writing patterns for signs of fatigue, stress, or optimal performance. Suggest wellness improvements if needed."
        };
    }

    // Generate real-time insights based on writing analysis
    async generateInsights(analysisContext = {}, aiService = null) {
        const now = Date.now();
        
        // Rate limiting to prevent excessive insight generation
        if (now - this.lastInsightGeneration < this.insightGenerationThreshold) {
            return null;
        }

        const insights = [];
        
        // Generate different types of insights based on available data
        if (analysisContext.flowMetrics) {
            const flowInsight = this.generateFlowInsight(analysisContext.flowMetrics);
            if (flowInsight) insights.push(flowInsight);
        }
        
        if (analysisContext.textMetrics) {
            const styleInsight = this.generateStyleInsight(analysisContext.textMetrics);
            if (styleInsight) insights.push(styleInsight);
        }
        
        if (analysisContext.typingMetrics) {
            const wellnessInsight = this.generateWellnessInsight(analysisContext.typingMetrics);
            if (wellnessInsight) insights.push(wellnessInsight);
        }

        // Generate AI-powered insight if available
        if (aiService && analysisContext.recentText) {
            const aiInsight = await this.generateAIInsight(analysisContext, aiService);
            if (aiInsight) insights.push(aiInsight);
        }

        // Update insights state
        if (insights.length > 0) {
            this.updateInsights(insights);
            this.lastInsightGeneration = now;
        }

        return insights;
    }

    // Generate flow-specific insights
    generateFlowInsight(flowMetrics) {
        const { currentState, currentScore, stateDuration, recentTrend } = flowMetrics;
        
        if (!currentState || currentScore === undefined) return null;

        let message = '';
        let priority = 'medium';
        
        switch (currentState) {
            case 'deep_flow':
                message = `Excellent! You're in deep flow (${Math.round(currentScore * 100)}% flow score). This is prime time for complex writing tasks.`;
                priority = 'high';
                break;
                
            case 'light_flow':
                message = `Good flow state detected (${Math.round(currentScore * 100)}% flow score). You're writing with good rhythm and focus.`;
                priority = 'medium';
                break;
                
            case 'focused':
                if (recentTrend > 0.1) {
                    message = `Building momentum! Your flow is improving. Consider minimizing distractions to reach deeper flow.`;
                } else {
                    message = `Focused state maintained. You're writing steadily with good concentration.`;
                }
                priority = 'medium';
                break;
                
            case 'struggling':
                message = `Detecting some writing friction. Consider breaking your task into smaller pieces or taking a brief creative break.`;
                priority = 'high';
                break;
                
            case 'blocked':
                message = `Writing flow is currently blocked. Try changing your approach, environment, or take a refreshing break.`;
                priority = 'high';
                break;
        }

        // Add duration context if state has been stable
        if (stateDuration > 300000) { // 5 minutes
            const minutes = Math.round(stateDuration / 60000);
            message += ` (${minutes} minutes in this state)`;
        }

        return {
            type: 'flow',
            message,
            priority,
            timestamp: Date.now(),
            data: { state: currentState, score: currentScore, duration: stateDuration }
        };
    }

    // Generate style-related insights
    generateStyleInsight(textMetrics) {
        const { compositionPatterns, typingVelocity } = textMetrics;
        
        if (!compositionPatterns) return null;

        const { avgWordLength, vocabularyComplexity, punctuationDensity } = compositionPatterns;
        
        let message = '';
        let priority = 'low';

        // Vocabulary complexity insights
        if (vocabularyComplexity > 0.7) {
            message = `Your vocabulary is quite sophisticated. Consider balancing complex terms with clearer expressions for readability.`;
            priority = 'medium';
        } else if (vocabularyComplexity < 0.3) {
            message = `Your writing style is clear and accessible. Consider adding more varied vocabulary for richness.`;
            priority = 'low';
        }

        // Word length insights
        if (avgWordLength > 6) {
            if (!message) message = `You're using longer, more complex words. Great for detailed analysis, but ensure clarity isn't sacrificed.`;
        } else if (avgWordLength < 4) {
            if (!message) message = `Your writing is concise and direct. Consider adding descriptive detail where it would enhance understanding.`;
        }

        // Velocity insights
        if (typingVelocity > 300) {
            message += message ? ' ' : '';
            message += `High typing velocity suggests strong ideas flowing - great momentum!`;
            priority = 'medium';
        }

        return message ? {
            type: 'style',
            message,
            priority,
            timestamp: Date.now(),
            data: { patterns: compositionPatterns, velocity: typingVelocity }
        } : null;
    }

    // Generate wellness-related insights
    generateWellnessInsight(typingMetrics) {
        const { rhythm, consistency, pauseFrequency, avgPauseDuration } = typingMetrics;
        
        let message = '';
        let priority = 'low';

        // Rhythm and consistency patterns
        if (rhythm < 0.3 && consistency < 0.3) {
            message = `Your typing rhythm seems irregular. Consider taking a moment to center yourself and find your natural writing pace.`;
            priority = 'medium';
        } else if (rhythm > 0.8 && consistency > 0.8) {
            message = `Excellent typing rhythm and consistency! You're in a great writing groove.`;
            priority = 'low';
        }

        // Pause pattern analysis
        if (pauseFrequency > 10 && avgPauseDuration > 5000) {
            message = message ? message + ' ' : '';
            message += `Frequent long pauses detected. This might indicate fatigue or complex thinking - both are natural parts of writing.`;
            priority = 'medium';
        }

        return message ? {
            type: 'wellness',
            message,
            priority,
            timestamp: Date.now(),
            data: { rhythm, consistency, pauseFrequency }
        } : null;
    }

    // Generate AI-powered insights
    async generateAIInsight(analysisContext, aiService) {
        try {
            const { recentText, lastSentence, flowMetrics } = analysisContext;
            
            if (!recentText || recentText.length < 20) return null;

            // Choose insight type based on context
            const insightType = this.selectInsightType(analysisContext);
            const prompt = this.buildAIPrompt(insightType, analysisContext);

            const response = await aiService.sendMessage(prompt, {
                maxTokens: 100,
                temperature: 0.7,
                timeout: 5000,
                context: 'flow_insight_generation'
            });

            if (response && response.response) {
                const cleanedInsight = this.processAIResponse(response.response);
                
                return {
                    type: 'ai_insight',
                    subType: insightType,
                    message: cleanedInsight,
                    priority: 'medium',
                    timestamp: Date.now(),
                    data: { model: response.model, provider: response.provider }
                };
            }

        } catch (error) {
            console.warn('[InsightsEngine] AI insight generation failed:', error);
        }

        return null;
    }

    // Select appropriate insight type based on context
    selectInsightType(analysisContext) {
        const { flowMetrics, textMetrics, typingMetrics } = analysisContext;
        
        // Priority order based on what data is most relevant
        if (flowMetrics?.currentState === 'struggling' || flowMetrics?.currentState === 'blocked') {
            return 'flow';
        } else if (textMetrics?.compositionPatterns?.vocabularyComplexity > 0.6) {
            return 'creativity';
        } else if (typingMetrics?.rhythm < 0.4) {
            return 'wellness';
        } else {
            return 'progress';
        }
    }

    // Build AI prompt for insight generation
    buildAIPrompt(insightType, analysisContext) {
        const { recentText, lastSentence, flowMetrics } = analysisContext;
        
        let contextInfo = '';
        if (flowMetrics?.currentState) {
            contextInfo = `Current writing state: ${flowMetrics.currentState}. `;
        }

        const basePrompt = this.insightPrompts[insightType] || this.insightPrompts.progress;
        const textSnippet = lastSentence || recentText.slice(-100);

        return `${contextInfo}${basePrompt}

Recent text: "${textSnippet}"

Provide a brief, encouraging insight (1-2 sentences max):`;
    }

    // Process and clean AI response
    processAIResponse(response) {
        // Remove quotes and extra whitespace
        let cleaned = response.trim().replace(/^["']|["']$/g, '');
        
        // Remove common AI prefixes
        cleaned = cleaned.replace(/^(Here's|Based on|Looking at|I notice|It seems|This suggests)\s*/i, '');
        
        // Ensure it ends with punctuation
        if (!/[.!?]$/.test(cleaned)) {
            cleaned += '.';
        }
        
        // Truncate if too long
        if (cleaned.length > 150) {
            cleaned = cleaned.slice(0, 147) + '...';
        }

        return cleaned;
    }

    // Update insights state
    updateInsights(newInsights) {
        const timestamp = Date.now();
        
        // Add to current insights
        this.insightsEngine.currentInsights = newInsights;
        
        // Add to history
        newInsights.forEach(insight => {
            this.insightsEngine.insightHistory.push({
                ...insight,
                id: `insight_${timestamp}_${Math.random().toString(36).substr(2, 9)}`
            });
        });

        // Maintain history size
        if (this.insightsEngine.insightHistory.length > this.maxInsightHistory) {
            this.insightsEngine.insightHistory.splice(0, this.insightsEngine.insightHistory.length - this.maxInsightHistory);
        }

        // Update display state
        this.insightsEngine.displayState.lastUpdate = timestamp;
    }

    // Get insights for display
    getDisplayInsights(limit = 3) {
        const insights = this.insightsEngine.currentInsights
            .sort((a, b) => {
                // Sort by priority then by timestamp
                const priorityOrder = { high: 3, medium: 2, low: 1 };
                const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
                return priorityDiff !== 0 ? priorityDiff : b.timestamp - a.timestamp;
            })
            .slice(0, limit);

        return insights;
    }

    // Get insights by type
    getInsightsByType(type, limit = 5) {
        return this.insightsEngine.insightHistory
            .filter(insight => insight.type === type)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    // Get insight statistics
    getInsightStatistics() {
        const history = this.insightsEngine.insightHistory;
        const stats = {};

        // Count by type
        Object.keys(this.insightsEngine.insightTypes).forEach(type => {
            stats[type] = history.filter(insight => insight.type === type).length;
        });

        // Count by priority
        stats.priorities = {
            high: history.filter(insight => insight.priority === 'high').length,
            medium: history.filter(insight => insight.priority === 'medium').length,
            low: history.filter(insight => insight.priority === 'low').length
        };

        // Recent activity
        const hourAgo = Date.now() - 3600000;
        stats.recentInsights = history.filter(insight => insight.timestamp >= hourAgo).length;

        return stats;
    }

    // Clear insights
    clearInsights() {
        this.insightsEngine.currentInsights = [];
    }

    // Clear insight history
    clearHistory() {
        this.insightsEngine.insightHistory = [];
    }

    // Get current engine state
    getState() {
        return {
            ...this.insightsEngine,
            statistics: this.getInsightStatistics(),
            displayInsights: this.getDisplayInsights()
        };
    }

    // Reset insights engine
    reset() {
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
                updateFrequency: 15000
            }
        };
        this.lastInsightGeneration = 0;
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.InsightsEngine = InsightsEngine;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InsightsEngine;
}
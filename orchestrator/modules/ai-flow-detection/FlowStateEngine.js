// === Flow State Engine ===
// Core flow detection and scoring logic for AI flow detection system

class FlowStateEngine {
    constructor() {
        this.flowEngine = {
            isActive: false,
            currentFlowScore: 0,
            flowHistory: [],
            flowIndicators: new Map(),
            stateTransitions: [],
            
            // Contextual awareness
            context: {
                timeOfDay: null,
                sessionDuration: 0,
                environmentalFactors: {},
                previousFlow: null,
                optimalConditions: this.loadOptimalConditions()
            }
        };

        // Flow state thresholds
        this.flowThresholds = {
            deep_flow: 0.8,
            light_flow: 0.6,
            focused: 0.4,
            struggling: 0.2,
            blocked: 0.1
        };

        // Flow detection weights
        this.detectionWeights = {
            typingPattern: 0.25,
            cognitiveLoad: 0.25,
            consistency: 0.2,
            context: 0.15,
            momentum: 0.15
        };

        this.maxHistorySize = 100;
        this.stateStabilityThreshold = 3; // Number of consistent readings needed
        this.sessionStartTime = Date.now();
    }

    // Calculate current flow score from multiple metrics
    calculateFlowScore(metrics = {}) {
        const {
            typingMetrics = {},
            cognitiveMetrics = {},
            contextMetrics = {},
            textMetrics = {}
        } = metrics;

        let totalScore = 0;
        let weightSum = 0;

        // Typing pattern contribution
        if (typingMetrics.flowScore !== undefined) {
            const typingScore = this.normalizeScore(typingMetrics.flowScore);
            totalScore += typingScore * this.detectionWeights.typingPattern;
            weightSum += this.detectionWeights.typingPattern;
        }

        // Cognitive load contribution (optimal load indicates flow)
        if (cognitiveMetrics.loadScore !== undefined) {
            const cognitiveScore = this.normalizeScore(cognitiveMetrics.loadScore);
            totalScore += cognitiveScore * this.detectionWeights.cognitiveLoad;
            weightSum += this.detectionWeights.cognitiveLoad;
        }

        // Consistency contribution
        if (typingMetrics.consistency !== undefined) {
            const consistencyScore = this.normalizeScore(typingMetrics.consistency);
            totalScore += consistencyScore * this.detectionWeights.consistency;
            weightSum += this.detectionWeights.consistency;
        }

        // Context contribution
        const contextScore = this.calculateContextScore(contextMetrics);
        totalScore += contextScore * this.detectionWeights.context;
        weightSum += this.detectionWeights.context;

        // Momentum contribution (based on recent flow history)
        const momentumScore = this.calculateMomentumScore();
        totalScore += momentumScore * this.detectionWeights.momentum;
        weightSum += this.detectionWeights.momentum;

        // Normalize by actual weights used
        const flowScore = weightSum > 0 ? totalScore / weightSum : 0;
        
        // Update flow state
        this.updateFlowState(flowScore, metrics);
        
        return flowScore;
    }

    // Normalize score to 0-1 range
    normalizeScore(score) {
        return Math.max(0, Math.min(1, score));
    }

    // Calculate context score based on environmental factors
    calculateContextScore(contextMetrics = {}) {
        let contextScore = 0.5; // Neutral baseline
        
        // Time of day factor
        const timeScore = this.calculateTimeOfDayScore();
        contextScore += (timeScore - 0.5) * 0.3;
        
        // Session duration factor
        const durationScore = this.calculateSessionDurationScore();
        contextScore += (durationScore - 0.5) * 0.3;
        
        // Text metrics factor
        if (contextMetrics.typingVelocity !== undefined) {
            const velocityScore = this.calculateVelocityScore(contextMetrics.typingVelocity);
            contextScore += (velocityScore - 0.5) * 0.4;
        }

        return this.normalizeScore(contextScore);
    }

    // Calculate time of day flow score
    calculateTimeOfDayScore() {
        const hour = new Date().getHours();
        
        // Most people have better focus 9-11 AM and 2-4 PM
        if ((hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 16)) {
            return 0.8;
        } else if ((hour >= 7 && hour <= 9) || (hour >= 11 && hour <= 14) || (hour >= 16 && hour <= 18)) {
            return 0.6;
        } else {
            return 0.3;
        }
    }

    // Calculate session duration impact on flow
    calculateSessionDurationScore() {
        const duration = Date.now() - this.sessionStartTime;
        const minutes = duration / 60000;
        
        // Flow typically peaks between 20-60 minutes of focused work
        if (minutes >= 20 && minutes <= 60) {
            return 0.8;
        } else if (minutes >= 10 && minutes <= 90) {
            return 0.6;
        } else if (minutes > 90) {
            // Fatigue factor after 90 minutes
            return Math.max(0.2, 0.6 - ((minutes - 90) / 120) * 0.4);
        } else {
            // Still warming up
            return 0.4 + (minutes / 20) * 0.2;
        }
    }

    // Calculate typing velocity score for flow
    calculateVelocityScore(velocity) {
        const optimalVelocity = 200; // keystrokes per minute
        const deviation = Math.abs(velocity - optimalVelocity) / optimalVelocity;
        return Math.max(0, 1 - deviation);
    }

    // Calculate momentum score based on recent flow history
    calculateMomentumScore() {
        const recentFlow = this.flowEngine.flowHistory.slice(-5); // Last 5 readings
        
        if (recentFlow.length < 2) return 0.5; // Neutral if insufficient data
        
        // Calculate trend
        let trend = 0;
        for (let i = 1; i < recentFlow.length; i++) {
            trend += recentFlow[i].score - recentFlow[i-1].score;
        }
        
        const avgTrend = trend / (recentFlow.length - 1);
        const currentScore = recentFlow[recentFlow.length - 1]?.score || 0.5;
        
        // Positive momentum boosts score, negative momentum reduces it
        return this.normalizeScore(currentScore + avgTrend * 0.5);
    }

    // Update flow state with new score and metrics
    updateFlowState(flowScore, metrics) {
        const timestamp = Date.now();
        const previousState = this.getCurrentFlowState();
        const newState = this.determineFlowState(flowScore);
        
        // Update current flow score
        this.flowEngine.currentFlowScore = flowScore;
        
        // Add to flow history
        this.flowEngine.flowHistory.push({
            timestamp,
            score: flowScore,
            state: newState,
            metrics: { ...metrics },
            context: this.captureCurrentContext()
        });
        
        // Maintain history size
        if (this.flowEngine.flowHistory.length > this.maxHistorySize) {
            this.flowEngine.flowHistory.shift();
        }
        
        // Track state transitions
        if (previousState !== newState) {
            this.flowEngine.stateTransitions.push({
                timestamp,
                from: previousState,
                to: newState,
                score: flowScore,
                duration: this.getStateDuration(previousState)
            });
            
            // Maintain transitions history
            if (this.flowEngine.stateTransitions.length > 50) {
                this.flowEngine.stateTransitions.shift();
            }
        }
        
        // Update indicators
        this.updateFlowIndicators(newState, flowScore, metrics);
    }

    // Determine flow state from score
    determineFlowState(score) {
        if (score >= this.flowThresholds.deep_flow) return 'deep_flow';
        if (score >= this.flowThresholds.light_flow) return 'light_flow';
        if (score >= this.flowThresholds.focused) return 'focused';
        if (score >= this.flowThresholds.struggling) return 'struggling';
        return 'blocked';
    }

    // Get current flow state
    getCurrentFlowState() {
        return this.determineFlowState(this.flowEngine.currentFlowScore);
    }

    // Get duration of current state
    getStateDuration(state) {
        const currentState = this.getCurrentFlowState();
        if (state !== currentState) return 0;
        
        // Find when this state started
        const history = this.flowEngine.flowHistory.slice().reverse();
        let duration = 0;
        
        for (const entry of history) {
            if (entry.state === state) {
                duration = Date.now() - entry.timestamp;
            } else {
                break;
            }
        }
        
        return duration;
    }

    // Capture current context
    captureCurrentContext() {
        return {
            timeOfDay: new Date().getHours(),
            sessionDuration: Date.now() - this.sessionStartTime,
            timestamp: Date.now()
        };
    }

    // Update flow indicators for UI display
    updateFlowIndicators(state, score, metrics) {
        this.flowEngine.flowIndicators.set('current', {
            state,
            score,
            confidence: this.calculateConfidence(metrics),
            timestamp: Date.now()
        });
        
        // Add state-specific indicators
        this.flowEngine.flowIndicators.set(state, {
            score,
            duration: this.getStateDuration(state),
            frequency: this.getStateFrequency(state),
            lastOccurrence: Date.now()
        });
    }

    // Calculate confidence in flow detection
    calculateConfidence(metrics) {
        let confidence = 0.5; // Base confidence
        
        // More data sources increase confidence
        const dataSourceCount = Object.keys(metrics).length;
        confidence += Math.min(0.3, dataSourceCount * 0.1);
        
        // Consistent readings increase confidence
        const recentReadings = this.flowEngine.flowHistory.slice(-5);
        if (recentReadings.length >= 3) {
            const variance = this.calculateScoreVariance(recentReadings);
            confidence += Math.max(0, 0.2 - variance);
        }
        
        return this.normalizeScore(confidence);
    }

    // Calculate variance in recent flow scores
    calculateScoreVariance(readings) {
        if (readings.length < 2) return 0;
        
        const scores = readings.map(reading => reading.score);
        const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
        
        return variance;
    }

    // Get frequency of specific state
    getStateFrequency(state, timeWindow = 3600000) { // Default: 1 hour
        const cutoff = Date.now() - timeWindow;
        const recentHistory = this.flowEngine.flowHistory.filter(
            entry => entry.timestamp >= cutoff && entry.state === state
        );
        
        return recentHistory.length;
    }

    // Load optimal conditions (placeholder for future ML model)
    loadOptimalConditions() {
        return {
            optimalTimeRanges: [[9, 11], [14, 16]], // Hours
            optimalSessionLength: [20, 60], // Minutes
            optimalTypingSpeed: [150, 250], // WPM range
            optimalCognitiveLoad: [0.3, 0.7] // Load range
        };
    }

    // Get flow insights for analysis
    getFlowInsights() {
        const currentState = this.getCurrentFlowState();
        const currentScore = this.flowEngine.currentFlowScore;
        const stateDuration = this.getStateDuration(currentState);
        
        return {
            currentState,
            currentScore,
            stateDuration,
            confidence: this.calculateConfidence({}),
            recentTrend: this.calculateMomentumScore(),
            optimalConditions: this.flowEngine.context.optimalConditions,
            suggestions: this.generateFlowSuggestions(currentState, currentScore)
        };
    }

    // Generate suggestions based on current flow state
    generateFlowSuggestions(state, score) {
        const suggestions = [];
        
        switch (state) {
            case 'blocked':
                suggestions.push('Take a short break to reset your focus');
                suggestions.push('Try changing your environment or approach');
                break;
            case 'struggling':
                suggestions.push('Break the task into smaller pieces');
                suggestions.push('Remove distractions and focus on one thing');
                break;
            case 'focused':
                suggestions.push('You\'re building momentum - keep going!');
                suggestions.push('Minimize interruptions to maintain focus');
                break;
            case 'light_flow':
                suggestions.push('Great flow state - stay in this zone');
                suggestions.push('This is an ideal time for creative work');
                break;
            case 'deep_flow':
                suggestions.push('Excellent! You\'re in deep flow');
                suggestions.push('Protect this state - avoid all distractions');
                break;
        }
        
        return suggestions;
    }

    // Get current engine state
    getState() {
        return {
            ...this.flowEngine,
            currentState: this.getCurrentFlowState(),
            insights: this.getFlowInsights(),
            sessionDuration: Date.now() - this.sessionStartTime
        };
    }

    // Reset flow engine
    reset() {
        this.flowEngine = {
            isActive: false,
            currentFlowScore: 0,
            flowHistory: [],
            flowIndicators: new Map(),
            stateTransitions: [],
            context: {
                timeOfDay: null,
                sessionDuration: 0,
                environmentalFactors: {},
                previousFlow: null,
                optimalConditions: this.loadOptimalConditions()
            }
        };
        this.sessionStartTime = Date.now();
    }

    // Activate flow detection
    activate() {
        this.flowEngine.isActive = true;
    }

    // Deactivate flow detection
    deactivate() {
        this.flowEngine.isActive = false;
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.FlowStateEngine = FlowStateEngine;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlowStateEngine;
}
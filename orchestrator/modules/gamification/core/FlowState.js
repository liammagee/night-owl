// === Flow State Detection and Management ===
// Based on Csikszentmihalyi's flow theory and typing behavior analysis

class FlowState {
    constructor(gamificationInstance) {
        this.gamification = gamificationInstance;
        this.flowState = {
            isInFlow: false,
            flowStartTime: null,
            flowDuration: 0,
            currentFlowQuality: 0,
            typingHistory: [], // Array of {timestamp, wordCount, interval}
            pauseHistory: [], // Array of pause durations
            flowSessions: [], // Array of completed flow sessions
            thresholds: {
                minFlowDuration: 300000, // 5 minutes minimum
                typingVelocityWindow: 30000, // 30 seconds for velocity calculation
                idealPauseRange: [2000, 8000], // 2-8 seconds ideal pause
                flowBreakThreshold: 30000, // 30 seconds pause breaks flow
                minWordsPerMinute: 15, // Minimum WPM to maintain flow
                consistencyThreshold: 0.7 // How consistent typing should be (0-1)
            }
        };
    }

    updateFlowState(timestamp, currentWords) {
        const flow = this.flowState;
        
        // Record typing activity
        const interval = this.lastActivityTime ? timestamp - this.lastActivityTime : 0;
        flow.typingHistory.push({
            timestamp,
            wordCount: currentWords,
            interval
        });
        
        // Keep only recent history (30 seconds)
        const cutoff = timestamp - flow.thresholds.typingVelocityWindow;
        flow.typingHistory = flow.typingHistory.filter(entry => entry.timestamp > cutoff);
        
        // Calculate current flow metrics
        const velocity = this.calculateTypingVelocity();
        const consistency = this.calculateTypingConsistency();
        const pauseQuality = this.calculatePauseQuality();
        
        // Determine if user is in flow state
        const wasInFlow = flow.isInFlow;
        const shouldBeInFlow = this.shouldBeInFlowState(velocity, consistency, pauseQuality);
        
        if (!wasInFlow && shouldBeInFlow) {
            this.startFlowState(timestamp);
        } else if (wasInFlow && !shouldBeInFlow) {
            this.endFlowState(timestamp);
        } else if (flow.isInFlow) {
            this.updateFlowQuality(velocity, consistency, pauseQuality);
            flow.flowDuration = timestamp - flow.flowStartTime;
        }
        
        this.lastActivityTime = timestamp;
    }
    
    calculateTypingVelocity() {
        const flow = this.flowState;
        if (flow.typingHistory.length < 2) return 0;
        
        const recent = flow.typingHistory.slice(-10); // Last 10 typing events
        const timeSpan = recent[recent.length - 1].timestamp - recent[0].timestamp;
        const wordsDelta = recent[recent.length - 1].wordCount - recent[0].wordCount;
        
        if (timeSpan === 0) return 0;
        
        // Words per minute
        return (wordsDelta / timeSpan) * 60000;
    }
    
    calculateTypingConsistency() {
        const flow = this.flowState;
        if (flow.typingHistory.length < 5) return 0;
        
        const intervals = flow.typingHistory
            .slice(-10)
            .map(entry => entry.interval)
            .filter(interval => interval > 0 && interval < 10000); // Filter outliers
        
        if (intervals.length < 3) return 0;
        
        const mean = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
        const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
        const stdDev = Math.sqrt(variance);
        
        // Consistency score (lower standard deviation = higher consistency)
        const coefficientOfVariation = stdDev / mean;
        return Math.max(0, 1 - coefficientOfVariation);
    }
    
    calculatePauseQuality() {
        const flow = this.flowState;
        if (flow.pauseHistory.length === 0) return 1; // No pauses = perfect
        
        const recentPauses = flow.pauseHistory.slice(-5); // Last 5 pauses
        const idealRange = flow.thresholds.idealPauseRange;
        
        let qualityScore = 0;
        recentPauses.forEach(pause => {
            if (pause >= idealRange[0] && pause <= idealRange[1]) {
                qualityScore += 1; // Perfect pause
            } else if (pause < idealRange[0]) {
                qualityScore += 0.7; // Too short but okay
            } else if (pause < flow.thresholds.flowBreakThreshold) {
                qualityScore += 0.4; // Long but not flow-breaking
            }
            // Longer pauses get 0 points
        });
        
        return recentPauses.length > 0 ? qualityScore / recentPauses.length : 1;
    }
    
    shouldBeInFlowState(velocity, consistency, pauseQuality) {
        const thresholds = this.flowState.thresholds;
        
        return (
            velocity >= thresholds.minWordsPerMinute &&
            consistency >= thresholds.consistencyThreshold &&
            pauseQuality >= 0.5 &&
            this.flowState.typingHistory.length >= 5 // Minimum data points
        );
    }

    startFlowState(timestamp) {
        const flow = this.flowState;
        flow.isInFlow = true;
        flow.flowStartTime = timestamp;
        flow.flowDuration = 0;
        flow.currentFlowQuality = 0;
        
        this.showNotification('🌊 Flow state detected! You\'re in the zone!', 'success');
        this.gamification.playSound('flowStart');
        
        // Award XP for entering flow
        const flowXP = this.gamification.xpSystem.xpGains.flowStateReached;
        this.gamification.awardXP(flowXP, 'Entered flow state');
        
        console.log('[FlowState] Flow state started');
    }

    endFlowState(timestamp) {
        const flow = this.flowState;
        if (!flow.isInFlow) return;
        
        const duration = timestamp - flow.flowStartTime;
        flow.flowDuration = duration;
        flow.isInFlow = false;
        
        // Only save significant flow sessions
        if (duration >= flow.thresholds.minFlowDuration) {
            const flowSession = {
                id: Date.now(),
                startTime: new Date(flow.flowStartTime),
                endTime: new Date(timestamp),
                duration: duration,
                quality: flow.currentFlowQuality,
                wordCount: this.getCurrentWordCount()
            };
            
            flow.flowSessions.push(flowSession);
            this.gamification.saveFlowSessions();
            
            const minutes = Math.round(duration / 60000);
            this.showNotification(
                `🏆 Flow session completed! ${minutes} minutes of deep focus.`, 
                'success'
            );
            this.gamification.playSound('flowEnd');
            
            // Award bonus XP for long flow sessions
            if (duration >= 600000) { // 10+ minutes
                this.gamification.awardXP(100, 'Extended flow session');
            }
            if (duration >= 1800000) { // 30+ minutes
                this.gamification.awardXP(200, 'Deep flow session');
            }
        } else {
            this.showNotification('Flow state ended', 'info');
        }
        
        // Reset flow state
        flow.flowStartTime = null;
        flow.flowDuration = 0;
        flow.currentFlowQuality = 0;
        
        console.log('[FlowState] Flow state ended');
    }

    updateFlowQuality(velocity, consistency, pauseQuality) {
        // Calculate composite flow quality score
        const weights = {
            velocity: 0.4,
            consistency: 0.4,
            pauseQuality: 0.2
        };
        
        const normalizedVelocity = Math.min(1, velocity / 50); // Normalize to 50 WPM max
        
        this.flowState.currentFlowQuality = 
            (normalizedVelocity * weights.velocity) +
            (consistency * weights.consistency) +
            (pauseQuality * weights.pauseQuality);
    }

    recordPause(duration) {
        this.flowState.pauseHistory.push(duration);
        
        // Keep only recent pause history
        if (this.flowState.pauseHistory.length > 20) {
            this.flowState.pauseHistory = this.flowState.pauseHistory.slice(-10);
        }
    }

    getFlowMetrics() {
        const flow = this.flowState;
        
        return {
            isInFlow: flow.isInFlow,
            currentDuration: flow.isInFlow ? Date.now() - flow.flowStartTime : 0,
            currentQuality: flow.currentFlowQuality,
            totalFlowSessions: flow.flowSessions.length,
            totalFlowTime: flow.flowSessions.reduce((total, session) => total + session.duration, 0),
            averageFlowDuration: flow.flowSessions.length > 0 ? 
                flow.flowSessions.reduce((total, session) => total + session.duration, 0) / flow.flowSessions.length : 0,
            bestFlowSession: flow.flowSessions.length > 0 ?
                flow.flowSessions.reduce((best, session) => session.duration > best.duration ? session : best) : null
        };
    }

    getCurrentWordCount() {
        if (!editor) return 0;
        
        const content = editor.getValue();
        const words = content.trim().split(/\s+/).filter(word => word.length > 0);
        return words.length;
    }

    showNotification(message, type = 'info', duration = 3000) {
        if (typeof showNotification === 'function') {
            showNotification(message, type, duration);
        } else {
            console.log(`[FlowState] ${type.toUpperCase()}: ${message}`);
        }
    }
}

// Make available globally
window.FlowState = FlowState;
// === Typing Pattern Analyzer ===
// Analyzes keystroke timing, rhythm, and typing patterns for flow detection

class TypingPatternAnalyzer {
    constructor() {
        this.typingPattern = {
            intervals: [], // Time between keystrokes
            bursts: [], // Periods of rapid typing
            pauses: [], // Longer pauses in writing
            rhythm: 0, // Overall rhythm score
            consistency: 0
        };

        this.keystrokeBuffer = [];
        this.maxBufferSize = 100; // Keep last 100 keystrokes
        this.lastKeystrokeTime = null;
        
        // Thresholds for pattern detection
        this.thresholds = {
            burstThreshold: 150, // ms - rapid typing
            pauseThreshold: 2000, // ms - significant pause
            consistencyWindow: 20, // number of intervals to analyze
            rhythmWindow: 30 // number of intervals for rhythm analysis
        };
    }

    // Record a keystroke event
    recordKeystroke(timestamp = Date.now(), keyInfo = {}) {
        const keystroke = {
            timestamp,
            key: keyInfo.key || null,
            type: keyInfo.type || 'input', // input, delete, space, etc.
            interval: null
        };

        // Calculate interval if we have a previous keystroke
        if (this.lastKeystrokeTime) {
            keystroke.interval = timestamp - this.lastKeystrokeTime;
            this.typingPattern.intervals.push(keystroke.interval);
            
            // Maintain intervals buffer size
            if (this.typingPattern.intervals.length > this.maxBufferSize) {
                this.typingPattern.intervals.shift();
            }
        }

        this.keystrokeBuffer.push(keystroke);
        this.lastKeystrokeTime = timestamp;

        // Maintain keystroke buffer size
        if (this.keystrokeBuffer.length > this.maxBufferSize) {
            this.keystrokeBuffer.shift();
        }

        // Update patterns
        this.updateTypingPatterns();
        
        return keystroke.interval;
    }

    // Update typing patterns based on recent keystrokes
    updateTypingPatterns() {
        this.detectBursts();
        this.detectPauses();
        this.calculateRhythm();
        this.calculateConsistency();
    }

    // Detect periods of rapid typing (bursts)
    detectBursts() {
        const recentIntervals = this.typingPattern.intervals.slice(-20); // Last 20 intervals
        if (recentIntervals.length < 5) return;

        const burstIntervals = recentIntervals.filter(
            interval => interval <= this.thresholds.burstThreshold
        );

        if (burstIntervals.length >= 5) {
            const burstScore = burstIntervals.length / recentIntervals.length;
            const avgBurstSpeed = burstIntervals.reduce((sum, interval) => sum + interval, 0) / burstIntervals.length;
            
            this.typingPattern.bursts.push({
                timestamp: Date.now(),
                score: burstScore,
                avgSpeed: avgBurstSpeed,
                duration: burstIntervals.length
            });

            // Keep only recent bursts (last 10 minutes)
            const cutoff = Date.now() - 600000;
            this.typingPattern.bursts = this.typingPattern.bursts.filter(
                burst => burst.timestamp >= cutoff
            );
        }
    }

    // Detect significant pauses in typing
    detectPauses() {
        const recentIntervals = this.typingPattern.intervals.slice(-10);
        
        recentIntervals.forEach((interval, index) => {
            if (interval >= this.thresholds.pauseThreshold) {
                this.typingPattern.pauses.push({
                    timestamp: Date.now() - ((recentIntervals.length - index) * 100), // Approximate
                    duration: interval,
                    context: this.getPauseContext(index)
                });
            }
        });

        // Keep only recent pauses (last 10 minutes)
        const cutoff = Date.now() - 600000;
        this.typingPattern.pauses = this.typingPattern.pauses.filter(
            pause => pause.timestamp >= cutoff
        );
    }

    // Get context around a pause
    getPauseContext(pauseIndex) {
        // Simple context: was it after punctuation, mid-word, etc.
        const recentKeystrokes = this.keystrokeBuffer.slice(-10);
        const pauseKeystroke = recentKeystrokes[pauseIndex];
        
        if (!pauseKeystroke) return 'unknown';
        
        // Check if previous keystroke was punctuation
        const prevKey = recentKeystrokes[pauseIndex - 1]?.key;
        if (prevKey && /[.!?;:]/.test(prevKey)) {
            return 'after_punctuation';
        } else if (prevKey && /\s/.test(prevKey)) {
            return 'after_space';
        } else {
            return 'mid_word';
        }
    }

    // Calculate overall typing rhythm score
    calculateRhythm() {
        const intervals = this.typingPattern.intervals.slice(-this.thresholds.rhythmWindow);
        if (intervals.length < 5) {
            this.typingPattern.rhythm = 0;
            return;
        }

        // Calculate rhythm based on interval patterns
        const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
        const variance = this.calculateVariance(intervals, avgInterval);
        const coefficientOfVariation = Math.sqrt(variance) / avgInterval;

        // Lower coefficient of variation = more rhythmic
        // Scale to 0-1 where 1 = perfect rhythm
        this.typingPattern.rhythm = Math.max(0, 1 - coefficientOfVariation);
    }

    // Calculate typing consistency
    calculateConsistency() {
        const intervals = this.typingPattern.intervals.slice(-this.thresholds.consistencyWindow);
        if (intervals.length < 5) {
            this.typingPattern.consistency = 0;
            return;
        }

        // Consistency based on how similar recent intervals are
        const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
        const deviations = intervals.map(interval => Math.abs(interval - avgInterval));
        const avgDeviation = deviations.reduce((sum, dev) => sum + dev, 0) / deviations.length;

        // Convert to consistency score (0-1, where 1 = perfectly consistent)
        const relativeDeviation = avgDeviation / avgInterval;
        this.typingPattern.consistency = Math.max(0, 1 - relativeDeviation);
    }

    // Calculate variance of intervals
    calculateVariance(intervals, mean) {
        const squaredDeviations = intervals.map(interval => Math.pow(interval - mean, 2));
        return squaredDeviations.reduce((sum, deviation) => sum + deviation, 0) / intervals.length;
    }

    // Get flow-relevant metrics
    getFlowMetrics() {
        const recentBursts = this.typingPattern.bursts.slice(-3); // Last 3 bursts
        const recentPauses = this.typingPattern.pauses.slice(-5); // Last 5 pauses
        
        return {
            rhythm: this.typingPattern.rhythm,
            consistency: this.typingPattern.consistency,
            burstActivity: recentBursts.length > 0,
            avgBurstScore: recentBursts.length > 0 ? 
                recentBursts.reduce((sum, burst) => sum + burst.score, 0) / recentBursts.length : 0,
            pauseFrequency: recentPauses.length,
            avgPauseDuration: recentPauses.length > 0 ?
                recentPauses.reduce((sum, pause) => sum + pause.duration, 0) / recentPauses.length : 0,
            typingVelocity: this.getTypingVelocity(),
            flowIndicators: this.getFlowIndicators()
        };
    }

    // Calculate current typing velocity (keystrokes per minute)
    getTypingVelocity(timeWindow = 60000) {
        const now = Date.now();
        const cutoff = now - timeWindow;
        
        const recentKeystrokes = this.keystrokeBuffer.filter(
            keystroke => keystroke.timestamp >= cutoff
        );

        return recentKeystrokes.length > 0 ? 
            (recentKeystrokes.length / timeWindow) * 60000 : 0;
    }

    // Get flow state indicators from typing patterns
    getFlowIndicators() {
        const metrics = {
            rhythm: this.typingPattern.rhythm,
            consistency: this.typingPattern.consistency,
            velocity: this.getTypingVelocity(),
            burstActivity: this.typingPattern.bursts.length > 0
        };

        // Composite flow score based on typing patterns
        let flowScore = 0;
        
        // Rhythm contributes to flow (smooth, consistent typing)
        flowScore += metrics.rhythm * 0.3;
        
        // Consistency indicates flow state
        flowScore += metrics.consistency * 0.3;
        
        // Moderate velocity (not too fast, not too slow) indicates flow
        const optimalVelocity = 200; // keystrokes per minute
        const velocityScore = 1 - Math.abs(metrics.velocity - optimalVelocity) / optimalVelocity;
        flowScore += Math.max(0, velocityScore) * 0.2;
        
        // Recent burst activity can indicate flow
        if (metrics.burstActivity) {
            flowScore += 0.2;
        }

        return {
            flowScore: Math.min(1, flowScore),
            confidence: this.keystrokeBuffer.length >= 20 ? 0.8 : 0.4,
            indicators: metrics
        };
    }

    // Get current pattern state
    getState() {
        return {
            ...this.typingPattern,
            keystrokeCount: this.keystrokeBuffer.length,
            flowMetrics: this.getFlowMetrics(),
            lastKeystroke: this.lastKeystrokeTime
        };
    }

    // Reset pattern analysis
    reset() {
        this.typingPattern = {
            intervals: [],
            bursts: [],
            pauses: [],
            rhythm: 0,
            consistency: 0
        };
        this.keystrokeBuffer = [];
        this.lastKeystrokeTime = null;
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.TypingPatternAnalyzer = TypingPatternAnalyzer;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TypingPatternAnalyzer;
}
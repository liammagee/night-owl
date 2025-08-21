// === Writing Session Management ===
// Core session tracking and management functionality

class WritingSession {
    constructor(gamificationInstance) {
        this.gamification = gamificationInstance;
        this.currentSession = null;
        this.sessionStartTime = null;
        this.lastActivityTime = null;
        this.activityThreshold = 30000; // 30 seconds of inactivity breaks flow
        this.minSessionLength = 300000; // 5 minutes minimum for a valid writing session
        
        // Writing metrics
        this.sessionWordCount = 0;
        this.sessionStartWordCount = 0;
        this.totalWordsWritten = 0;
    }

    startWritingSession() {
        if (this.currentSession) {
            // console.log('[Gamification] Session already active');
            return;
        }

        this.currentSession = {
            id: Date.now(),
            startTime: new Date(),
            endTime: null,
            wordCount: 0,
            duration: 0,
            flowInterruptions: 0,
            filePath: window.currentFilePath || 'unknown'
        };
        
        this.sessionStartTime = Date.now();
        this.lastActivityTime = Date.now();
        this.sessionStartWordCount = this.getCurrentWordCount();
        this.sessionWordCount = 0;
        
        // console.log('[Gamification] Writing session started:', this.currentSession.id);
        this.gamification.updateGamificationUI();
        this.showNotification('✍️ Writing session started! Keep the momentum flowing.', 'success');
    }

    endWritingSession() {
        if (!this.currentSession) {
            // console.log('[Gamification] No active session to end');
            return;
        }

        const now = Date.now();
        const duration = now - this.sessionStartTime;
        const wordsWritten = this.getCurrentWordCount() - this.sessionStartWordCount;
        
        this.currentSession.endTime = new Date();
        this.currentSession.duration = duration;
        this.currentSession.wordCount = Math.max(0, wordsWritten);
        
        // Only count sessions longer than minimum threshold
        if (duration >= this.minSessionLength && this.currentSession.wordCount > 0) {
            this.recordValidSession(this.currentSession);
            this.recordSessionAnalytics(this.currentSession);
            
            // Award XP for session completion and words written
            const wordXP = this.currentSession.wordCount * this.gamification.xpSystem.xpGains.wordWritten;
            const sessionXP = this.gamification.xpSystem.xpGains.sessionCompleted;
            this.gamification.awardXP(wordXP, `${this.currentSession.wordCount} words written`);
            this.gamification.awardXP(sessionXP, 'Session completed');
            
            this.gamification.checkAchievements();
            this.gamification.updateStreaks();
            this.gamification.checkGoalCompletion();
            
            // Update collaborative challenges progress
            this.gamification.updateChallengeProgress();
            
            this.showSessionSummary(this.currentSession);
            
            // Play session completion sound
            this.gamification.playSound('sessionEnd');
        } else {
            this.showNotification('Session too short to count. Keep writing for at least 5 minutes!', 'info');
        }
        
        this.currentSession = null;
        this.sessionStartTime = null;
        this.gamification.updateGamificationUI();
        
        console.log('[Gamification] Writing session ended');
    }

    recordValidSession(session) {
        const today = new Date().toDateString();
        const dailyStats = this.gamification.dailyStats;
        
        if (!dailyStats[today]) {
            dailyStats[today] = {
                sessions: [],
                totalWords: 0,
                totalDuration: 0,
                flowSessions: 0
            };
        }
        
        dailyStats[today].sessions.push(session);
        dailyStats[today].totalWords += session.wordCount;
        dailyStats[today].totalDuration += session.duration;
        
        this.gamification.saveDailyStats();
    }

    recordSessionAnalytics(session) {
        const hour = session.startTime.getHours();
        const dayOfWeek = session.startTime.getDay();
        
        // Track time slot productivity
        if (!this.gamification.analytics.timeSlots[hour]) {
            this.gamification.analytics.timeSlots[hour] = {
                sessions: 0,
                totalWords: 0,
                averageWPM: 0
            };
        }
        
        const slot = this.gamification.analytics.timeSlots[hour];
        slot.sessions++;
        slot.totalWords += session.wordCount;
        slot.averageWPM = slot.totalWords / (slot.sessions * (session.duration / 60000)); // WPM
        
        // Track day of week patterns
        if (!this.gamification.analytics.dayOfWeek[dayOfWeek]) {
            this.gamification.analytics.dayOfWeek[dayOfWeek] = {
                sessions: 0,
                totalWords: 0,
                averageDuration: 0
            };
        }
        
        const dayStats = this.gamification.analytics.dayOfWeek[dayOfWeek];
        dayStats.sessions++;
        dayStats.totalWords += session.wordCount;
        dayStats.averageDuration = 
            (dayStats.averageDuration * (dayStats.sessions - 1) + session.duration) / dayStats.sessions;
        
        this.gamification.saveAnalyticsData();
    }

    showSessionSummary(session) {
        const minutes = Math.round(session.duration / 60000);
        const wpm = Math.round(session.wordCount / (session.duration / 60000));
        
        const summary = `
            <div class="session-summary">
                <h3>🎉 Session Complete!</h3>
                <div class="session-stats">
                    <div class="stat">
                        <span class="value">${session.wordCount}</span>
                        <span class="label">Words Written</span>
                    </div>
                    <div class="stat">
                        <span class="value">${minutes}</span>
                        <span class="label">Minutes</span>
                    </div>
                    <div class="stat">
                        <span class="value">${wpm}</span>
                        <span class="label">WPM</span>
                    </div>
                </div>
            </div>
        `;
        
        this.showNotification(summary, 'success', 5000);
    }

    getCurrentWordCount() {
        if (!editor) return 0;
        
        const content = editor.getValue();
        const words = content.trim().split(/\s+/).filter(word => word.length > 0);
        return words.length;
    }

    updateActivity() {
        if (!this.currentSession) return;
        
        this.lastActivityTime = Date.now();
        const currentWordCount = this.getCurrentWordCount();
        this.sessionWordCount = Math.max(0, currentWordCount - this.sessionStartWordCount);
        this.currentSession.wordCount = this.sessionWordCount;
        
        // Update UI with current progress
        this.gamification.updateGamificationUI();
    }

    showNotification(message, type = 'info', duration = 3000) {
        if (typeof showNotification === 'function') {
            showNotification(message, type, duration);
        } else {
            console.log(`[Session] ${type.toUpperCase()}: ${message}`);
        }
    }
}

// Make available globally
window.WritingSession = WritingSession;
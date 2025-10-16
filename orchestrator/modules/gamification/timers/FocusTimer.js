// === Focus Session Timer (Pomodoro-inspired) ===
// Based on Cirillo (2006) and flow research (Csikszentmihalyi, 1990)

class FocusTimer {
    constructor(gamificationInstance) {
        this.gamification = gamificationInstance;
        this.focusTimer = null;
        this.focusSession = null;
        this.isOnBreak = false;
        this.focusSettings = this.loadFocusSettings();
    }

    startFocusSession(duration = null) {
        if (this.focusTimer) {
            this.showNotification('Focus session already active!', 'warning');
            return;
        }
        
        const sessionDuration = duration || this.focusSettings.defaultDuration;
        
        this.focusSession = {
            id: Date.now(),
            startTime: Date.now(),
            duration: sessionDuration,
            remaining: sessionDuration,
            type: this.determineFocusSessionType(sessionDuration),
            wordCountStart: this.getCurrentWordCount(),
            wordCountEnd: 0,
            completed: false,
            interrupted: false
        };
        
        this.isOnBreak = false;
        this.startFocusTimer();
        this.updateFocusUI();
        
        const minutes = Math.round(sessionDuration / 60000);
        this.showNotification(
            `🎯 ${minutes}-minute focus session started! Deep work time begins now.`, 
            'success'
        );
        this.gamification.recordWorldEvent({
            type: 'focus.started',
            payload: {
                sessionId: this.focusSession.id,
                plannedDuration: sessionDuration,
                type: this.focusSession.type,
                startedAt: this.focusSession.startTime
            }
        });
        
        // Auto-start writing session if not already active
        if (!this.gamification.writingSession.currentSession) {
            this.gamification.writingSession.startWritingSession();
        }
        
        console.log('[Gamification] Focus session started:', this.focusSession.id);
    }
    
    startFocusTimer() {
        this.focusTimer = setInterval(() => {
            this.focusSession.remaining -= 1000;
            this.updateFocusUI();
            
            // Check for session completion
            if (this.focusSession.remaining <= 0) {
                this.completeFocusSession();
            }
            
            // Motivational notifications at key intervals
            const remaining = this.focusSession.remaining;
            const total = this.focusSession.duration;
            const elapsed = total - remaining;
            
            if (elapsed === 300000) { // 5 minutes in
                this.showNotification('🔥 5 minutes of focused writing completed!', 'info');
            } else if (remaining === 300000) { // 5 minutes left
                this.showNotification('⏰ 5 minutes remaining! Final sprint!', 'info');
            } else if (remaining === 60000) { // 1 minute left
                this.showNotification('🏁 One minute left! You\'ve got this!', 'info');
            }
        }, 1000);
    }
    
    pauseFocusSession() {
        if (!this.focusSession || !this.focusTimer) return;
        
        clearInterval(this.focusTimer);
        this.focusTimer = null;
        this.updateFocusUI();
        this.showNotification('⏸️ Focus session paused', 'info');
        this.gamification.recordWorldEvent({
            type: 'focus.paused',
            payload: {
                sessionId: this.focusSession.id,
                remaining: this.focusSession.remaining,
                pausedAt: Date.now()
            }
        });
    }
    
    resumeFocusSession() {
        if (!this.focusSession || this.focusTimer) return;
        
        this.startFocusTimer();
        this.updateFocusUI();
        this.showNotification('▶️ Focus session resumed', 'info');
        this.gamification.recordWorldEvent({
            type: 'focus.resumed',
            payload: {
                sessionId: this.focusSession.id,
                remaining: this.focusSession.remaining,
                resumedAt: Date.now()
            }
        });
    }
    
    stopFocusSession() {
        if (!this.focusSession) return;
        
        const session = this.focusSession;
        session.interrupted = true;
        session.wordCountEnd = this.getCurrentWordCount();
        
        if (this.focusTimer) {
            clearInterval(this.focusTimer);
            this.focusTimer = null;
        }
        
        // Save interrupted session if it was significant
        const elapsed = session.duration - session.remaining;
        if (elapsed >= 300000) { // At least 5 minutes
            this.gamification.saveFocusSession(session);
        }
        
        this.focusSession = null;
        this.updateFocusUI();
        this.showNotification('🛑 Focus session stopped', 'warning');
        this.gamification.recordWorldEvent({
            type: 'focus.stopped',
            payload: {
                sessionId: session.id,
                elapsed,
                plannedDuration: session.duration || 0,
                stoppedAt: Date.now(),
                interrupted: true
            }
        });
    }
    
    completeFocusSession() {
        if (!this.focusSession) return;
        
        this.focusSession.completed = true;
        this.focusSession.wordCountEnd = this.getCurrentWordCount();
        this.focusSession.remaining = 0;
        
        if (this.focusTimer) {
            clearInterval(this.focusTimer);
            this.focusTimer = null;
        }
        
        const wordsWritten = Math.max(0, this.focusSession.wordCountEnd - this.focusSession.wordCountStart);
        const minutes = this.focusSession.duration / 60000;
        
        // Save completed session
        this.gamification.saveFocusSession(this.focusSession);
        this.gamification.recordWorldEvent({
            type: 'focus.completed',
            payload: {
                sessionId: this.focusSession.id,
                duration: this.focusSession.duration,
                wordsWritten,
                type: this.focusSession.type,
                completedAt: Date.now()
            }
        });
        
        // Award rewards
        this.awardFocusRewards(this.focusSession);
        
        // Show completion notification
        this.showNotification(
            `🎉 Focus session complete! ${wordsWritten} words in ${minutes} minutes`, 
            'success'
        );
        
        // Suggest break
        this.suggestBreak();
        
        this.focusSession = null;
        this.updateFocusUI();
        
        console.log('[Gamification] Focus session completed');
    }
    
    determineFocusSessionType(duration) {
        const minutes = duration / 60000;
        if (minutes <= 15) return 'sprint';
        if (minutes <= 25) return 'pomodoro';
        if (minutes <= 45) return 'extended';
        return 'marathon';
    }
    
    suggestBreak() {
        const breakSuggestions = [
            'Take a 5-minute walk to refresh your mind 🚶‍♀️',
            'Stretch your arms and back 🧘‍♂️',
            'Grab some water and hydrate 💧',
            'Look away from the screen for a moment 👀',
            'Take 5 deep breaths 🫁'
        ];
        
        const suggestion = breakSuggestions[Math.floor(Math.random() * breakSuggestions.length)];
        this.showNotification(`💡 Break suggestion: ${suggestion}`, 'info', 8000);
    }

    awardFocusRewards(session) {
        // Award XP for completing focus session
        const focusXP = this.gamification.xpSystem.xpGains.focusSessionCompleted;
        this.gamification.awardXP(focusXP, 'Focus session completed');
        
        // Bonus XP for different session types
        const typeBonus = {
            'sprint': 25,
            'pomodoro': 50,
            'extended': 100,
            'marathon': 200
        };
        
        if (typeBonus[session.type]) {
            this.gamification.awardXP(typeBonus[session.type], `${session.type} focus session bonus`);
        }

        if (session.type === 'marathon' || session.duration >= 90 * 60000) {
            this.gamification.awardArchitectTokens(1, 'Completed marathon focus ritual');
        }
        
        // Play completion sound
        this.gamification.playSound('goalComplete');
    }

    updateFocusUI() {
        const focusElement = document.getElementById('focus-timer-display');
        if (!focusElement) return;
        
        if (!this.focusSession) {
            focusElement.innerHTML = '<button onclick="window.gamification.focusTimer.startFocusSession()">Start Focus Session</button>';
            return;
        }
        
        const minutes = Math.floor(this.focusSession.remaining / 60000);
        const seconds = Math.floor((this.focusSession.remaining % 60000) / 1000);
        const timeDisplay = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        const isRunning = this.focusTimer !== null;
        const progress = ((this.focusSession.duration - this.focusSession.remaining) / this.focusSession.duration) * 100;
        
        focusElement.innerHTML = `
            <div class="focus-session-active">
                <div class="focus-timer">${timeDisplay}</div>
                <div class="focus-progress">
                    <div class="focus-progress-bar" style="width: ${progress}%"></div>
                </div>
                <div class="focus-controls">
                    ${isRunning ? 
                        '<button onclick="window.gamification.focusTimer.pauseFocusSession()">⏸️ Pause</button>' :
                        '<button onclick="window.gamification.focusTimer.resumeFocusSession()">▶️ Resume</button>'
                    }
                    <button onclick="window.gamification.focusTimer.stopFocusSession()">🛑 Stop</button>
                </div>
                <div class="focus-type">${this.focusSession.type} session</div>
            </div>
        `;
    }

    loadFocusSettings() {
        const defaultSettings = {
            defaultDuration: 25 * 60 * 1000, // 25 minutes default
            shortBreak: 5 * 60 * 1000,      // 5 minute break
            longBreak: 15 * 60 * 1000,      // 15 minute break
            autoStartBreaks: false,
            breakReminders: true
        };
        
        try {
            const saved = localStorage.getItem('focusSettings');
            return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
        } catch {
            return defaultSettings;
        }
    }

    saveFocusSettings() {
        try {
            localStorage.setItem('focusSettings', JSON.stringify(this.focusSettings));
        } catch (error) {
            console.error('[FocusTimer] Failed to save focus settings:', error);
        }
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
            console.log(`[FocusTimer] ${type.toUpperCase()}: ${message}`);
        }
    }
}

// Make available globally
window.FocusTimer = FocusTimer;

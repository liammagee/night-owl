// === Writing Momentum & Streaks Gamification Module ===
// Research-backed gamification for academic writing motivation
// Based on: Deci & Ryan (2000), Amabile & Kramer (2011), Clear (2018), Fogg (2019)

class WritingGamification {
    constructor() {
        this.initialized = false;
        this.currentSession = null;
        this.sessionStartTime = null;
        this.lastActivityTime = null;
        this.activityThreshold = 30000; // 30 seconds of inactivity breaks flow
        this.minSessionLength = 300000; // 5 minutes minimum for a valid writing session
        
        // Progress tracking
        this.dailyStats = this.loadDailyStats();
        this.streakData = this.loadStreakData();
        this.achievements = this.loadAchievements();
        this.loadFlowSessions();
        
        // Writing metrics
        this.sessionWordCount = 0;
        this.sessionStartWordCount = 0;
        this.totalWordsWritten = 0;
        
        // Flow state detection
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
        
        // Focus session timer (Pomodoro-inspired)
        this.focusTimer = null;
        this.focusSession = null;
        this.isOnBreak = false;
        this.focusSettings = this.loadFocusSettings();
        this.rewards = this.loadRewards();
        this.rewardQueue = [];
        
        // Progress goals and tracking
        this.goals = this.loadGoals();
        this.progressIndicators = {
            daily: null,
            session: null,
            weekly: null
        };
        
        // Audio system for completion sounds
        this.audioContext = null;
        this.audioSettings = {
            enabled: true,
            volume: 0.3,
            sounds: {
                achievement: { type: 'success', duration: 800 },
                goalComplete: { type: 'celebration', duration: 1200 },
                flowStart: { type: 'gentle', duration: 600 },
                flowEnd: { type: 'completion', duration: 1000 },
                sessionEnd: { type: 'chime', duration: 700 },
                levelUp: { type: 'fanfare', duration: 1500 }
            }
        };
        this.initializeAudioContext();
        
        // Writing analytics and insights
        this.analytics = {
            timeSlots: {}, // Hour-by-hour productivity data
            dayOfWeek: {}, // Weekly pattern analysis
            sessionTypes: {}, // Different session type performance
            velocityHistory: [], // Historical writing speed data
            insights: this.loadInsights() || {}
        };
        this.initializeAnalytics();
        
        // Level/XP Progression System
        this.xpSystem = {
            currentXP: this.loadXP(),
            currentLevel: 1, // Will be calculated in initializeXPSystem()
            levelDefinitions: this.getLevelDefinitions(),
            xpGains: {
                wordWritten: 1,           // 1 XP per word
                sessionCompleted: 50,     // 50 XP per session
                focusSessionCompleted: 100, // 100 XP per focus session
                achievementUnlocked: 200,  // 200 XP per achievement
                dailyGoalReached: 300,    // 300 XP for daily goal
                weeklyGoalReached: 1000,  // 1000 XP for weekly goal
                flowStateReached: 150,    // 150 XP for entering flow
                streakMaintained: 100,    // 100 XP for maintaining streak
                levelUp: 500             // 500 bonus XP for leveling up
            },
            specializations: this.loadSpecializations(),
            prestige: this.loadPrestige()
        };
        this.initializeXPSystem();
        
        // Initialize collaborative challenges after core systems
        setTimeout(() => {
            this.initializeChallenges();
            this.initializeAICompanion();
            this.initializeTodoGamification();
        }, 100);
        
        // console.log('[Gamification] Writing momentum and focus system initialized');
    }

    initialize() {
        if (this.initialized) return;
        
        this.setupEventListeners();
        this.updateGamificationUI();
        this.startActivityTracking();
        this.initialized = true;
        
        console.log('[Gamification] Event listeners and UI initialized');
    }

    // === Core Session Management ===
    
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
        this.updateGamificationUI();
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
            const wordXP = this.currentSession.wordCount * this.xpSystem.xpGains.wordWritten;
            const sessionXP = this.xpSystem.xpGains.sessionCompleted;
            this.awardXP(wordXP, `${this.currentSession.wordCount} words written`);
            this.awardXP(sessionXP, 'Session completed');
            
            this.checkAchievements();
            this.updateStreaks();
            this.checkGoalCompletion();
            
            // Update collaborative challenges progress
            this.updateChallengeProgress();
            
            this.showSessionSummary(this.currentSession);
            
            // Play session completion sound
            this.playSound('sessionEnd');
        } else {
            this.showNotification('Session too short to count. Keep writing for at least 5 minutes!', 'info');
        }
        
        this.currentSession = null;
        this.sessionStartTime = null;
        this.updateGamificationUI();
        
        console.log('[Gamification] Writing session ended');
    }

    // === Focus Session Timer (Pomodoro-inspired) ===
    // Based on Cirillo (2006) and flow research (Csikszentmihalyi, 1990)
    
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
        
        // Auto-start writing session if not already active
        if (!this.currentSession) {
            this.startWritingSession();
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
    }
    
    resumeFocusSession() {
        if (!this.focusSession || this.focusTimer) return;
        
        this.startFocusTimer();
        this.updateFocusUI();
        this.showNotification('▶️ Focus session resumed', 'info');
    }
    
    stopFocusSession() {
        if (!this.focusSession) return;
        
        this.focusSession.interrupted = true;
        this.focusSession.wordCountEnd = this.getCurrentWordCount();
        
        if (this.focusTimer) {
            clearInterval(this.focusTimer);
            this.focusTimer = null;
        }
        
        // Save interrupted session if it was significant
        const elapsed = this.focusSession.duration - this.focusSession.remaining;
        if (elapsed >= 300000) { // At least 5 minutes
            this.saveFocusSession(this.focusSession);
        }
        
        this.focusSession = null;
        this.updateFocusUI();
        this.showNotification('🛑 Focus session stopped', 'warning');
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
        this.saveFocusSession(this.focusSession);
        
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
        const breakDuration = this.calculateOptimalBreak();
        const minutes = Math.round(breakDuration / 60000);
        
        this.showBreakModal(
            `Take a ${minutes}-minute break?`,
            `Research shows breaks improve focus and creativity. Stand up, stretch, or take a short walk.`,
            () => this.startBreakTimer(breakDuration)
        );
    }
    
    calculateOptimalBreak() {
        // Based on research: 5-15 minute breaks for shorter sessions, longer for extended sessions
        const lastDuration = this.focusSession ? this.focusSession.duration : this.focusSettings.defaultDuration;
        const minutes = lastDuration / 60000;
        
        if (minutes <= 25) return 5 * 60000; // 5 minutes
        if (minutes <= 45) return 10 * 60000; // 10 minutes
        return 15 * 60000; // 15 minutes
    }
    
    startBreakTimer(duration) {
        this.isOnBreak = true;
        
        const breakSession = {
            startTime: Date.now(),
            duration: duration,
            remaining: duration
        };
        
        this.focusTimer = setInterval(() => {
            breakSession.remaining -= 1000;
            this.updateBreakUI(breakSession);
            
            if (breakSession.remaining <= 0) {
                this.completeBreak();
            }
        }, 1000);
        
        const minutes = Math.round(duration / 60000);
        this.showNotification(`☕ Break time! ${minutes} minutes to recharge`, 'info');
        this.updateBreakUI(breakSession);
    }
    
    completeBreak() {
        if (this.focusTimer) {
            clearInterval(this.focusTimer);
            this.focusTimer = null;
        }
        
        this.isOnBreak = false;
        this.updateFocusUI();
        
        this.showNotification('✨ Break complete! Ready for another focus session?', 'success');
        
        // Suggest starting another focus session
        setTimeout(() => {
            this.showFocusSessionPrompt();
        }, 2000);
    }
    
    showFocusSessionPrompt() {
        this.showModal('Ready for Another Session?', `
            <div class="focus-session-prompt">
                <p>You're refreshed and ready! Start another focus session?</p>
                <div class="session-options">
                    <button class="btn btn-primary" onclick="window.gamificationInstance.startFocusSession(15*60000)">15 min Sprint</button>
                    <button class="btn btn-primary" onclick="window.gamificationInstance.startFocusSession(25*60000)">25 min Pomodoro</button>
                    <button class="btn btn-primary" onclick="window.gamificationInstance.startFocusSession(45*60000)">45 min Deep Work</button>
                </div>
            </div>
        `);
    }

    // === Reward System ===
    // Based on operant conditioning and self-determination theory
    
    awardFocusRewards(session) {
        const rewards = [];
        const minutes = session.duration / 60000;
        const wordsWritten = Math.max(0, session.wordCountEnd - session.wordCountStart);
        
        // Award XP for focus session completion
        const focusXP = this.xpSystem.xpGains.focusSessionCompleted;
        this.awardXP(focusXP, `${minutes}-minute focus session completed`);
        
        // Award XP for words written during focus
        if (wordsWritten > 0) {
            const wordXP = wordsWritten * this.xpSystem.xpGains.wordWritten;
            this.awardXP(wordXP, `${wordsWritten} words during focus session`);
        }
        
        // Legacy points system (keep for backward compatibility)
        let points = Math.round(minutes * 10); // 10 points per minute
        rewards.push({
            type: 'points',
            amount: points,
            reason: `Completed ${minutes}-minute focus session`
        });
        
        // Word count bonus
        if (wordsWritten > 0) {
            const wordBonus = Math.round(wordsWritten * 2); // 2 points per word
            points += wordBonus;
            rewards.push({
                type: 'points',
                amount: wordBonus,
                reason: `Wrote ${wordsWritten} words during session`
            });
        }
        
        // Session type bonuses
        if (session.type === 'marathon' && session.completed) {
            rewards.push({
                type: 'badge',
                name: 'Marathon Writer',
                description: 'Completed a 45+ minute focus session'
            });
        }
        
        // Perfect focus bonus (no interruptions detected)
        if (this.currentSession && this.currentSession.flowInterruptions === 0) {
            const perfectBonus = Math.round(points * 0.5);
            rewards.push({
                type: 'points',
                amount: perfectBonus,
                reason: 'Perfect focus - no interruptions detected!'
            });
            points += perfectBonus;
        }
        
        // Apply rewards
        this.applyRewards(rewards);
        this.showRewardNotifications(rewards);
    }
    
    applyRewards(rewards) {
        for (const reward of rewards) {
            if (reward.type === 'points') {
                this.rewards.totalPoints = (this.rewards.totalPoints || 0) + reward.amount;
            } else if (reward.type === 'badge') {
                if (!this.rewards.badges) this.rewards.badges = {};
                this.rewards.badges[reward.name] = {
                    name: reward.name,
                    description: reward.description,
                    earnedAt: new Date()
                };
            }
        }
        
        this.saveRewards();
    }
    
    showRewardNotifications(rewards) {
        for (const reward of rewards) {
            if (reward.type === 'points') {
                this.showNotification(`💰 +${reward.amount} points: ${reward.reason}`, 'success');
            } else if (reward.type === 'badge') {
                this.showNotification(`🏆 New badge: ${reward.name}!`, 'success');
            }
        }
    }
    
    // === Enhanced UI Management ===
    
    updateFocusUI() {
        const focusDisplay = document.querySelector('.focus-display');
        const startFocusBtn = document.getElementById('start-focus-session');
        const pauseFocusBtn = document.getElementById('pause-focus-session');
        const stopFocusBtn = document.getElementById('stop-focus-session');
        
        if (this.focusSession && !this.isOnBreak) {
            const remaining = this.focusSession.remaining;
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            
            if (focusDisplay) {
                focusDisplay.innerHTML = `
                    <span class="focus-icon">🎯</span>
                    <span class="focus-time">${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}</span>
                    <span class="focus-type">${this.focusSession.type}</span>
                `;
                focusDisplay.style.display = 'flex';
            }
            
            if (startFocusBtn) startFocusBtn.style.display = 'none';
            if (pauseFocusBtn) pauseFocusBtn.style.display = this.focusTimer ? 'inline-block' : 'none';
            if (stopFocusBtn) stopFocusBtn.style.display = 'inline-block';
        } else {
            if (focusDisplay) focusDisplay.style.display = 'none';
            if (startFocusBtn) startFocusBtn.style.display = 'inline-block';
            if (pauseFocusBtn) pauseFocusBtn.style.display = 'none';
            if (stopFocusBtn) stopFocusBtn.style.display = 'none';
        }
        
        // Update points display
        const pointsDisplay = document.querySelector('.points-display');
        if (pointsDisplay) {
            pointsDisplay.textContent = `${this.rewards.totalPoints || 0} pts`;
        }
    }
    
    updateBreakUI(breakSession) {
        const focusDisplay = document.querySelector('.focus-display');
        
        if (focusDisplay && breakSession) {
            const remaining = breakSession.remaining;
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            
            focusDisplay.innerHTML = `
                <span class="focus-icon">☕</span>
                <span class="focus-time">${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}</span>
                <span class="focus-type">break</span>
            `;
            focusDisplay.style.display = 'flex';
        }
    }

    recordValidSession(session) {
        const today = this.getTodayKey();
        
        if (!this.dailyStats[today]) {
            this.dailyStats[today] = {
                date: today,
                sessions: [],
                totalWords: 0,
                totalDuration: 0,
                longestSession: 0,
                avgWordsPerMinute: 0
            };
        }
        
        const dayStats = this.dailyStats[today];
        dayStats.sessions.push(session);
        dayStats.totalWords += session.wordCount;
        dayStats.totalDuration += session.duration;
        dayStats.longestSession = Math.max(dayStats.longestSession, session.duration);
        
        // Calculate average words per minute
        const totalMinutes = dayStats.totalDuration / 60000;
        dayStats.avgWordsPerMinute = totalMinutes > 0 ? Math.round(dayStats.totalWords / totalMinutes) : 0;
        
        this.saveDailyStats();
        console.log('[Gamification] Session recorded for', today);
    }

    // === Activity Tracking (Flow State Detection) ===
    
    startActivityTracking() {
        // Track editor activity to detect flow state
        if (window.editor) {
            window.editor.onDidChangeModelContent(() => {
                this.onWritingActivity();
            });
        }
        
        // Track general typing activity
        document.addEventListener('keydown', (e) => {
            // Ignore keyboard shortcuts with modifiers to avoid interfering with commands
            if (e.ctrlKey || e.metaKey || e.altKey) {
                return;
            }
            
            if (this.isWritingKey(e)) {
                this.onWritingActivity();
            }
        });
        
        console.log('[Gamification] Activity tracking started');
    }

    onWritingActivity() {
        const now = Date.now();
        
        // Auto-start session if not active and user starts writing
        if (!this.currentSession && window.currentFilePath) {
            this.startWritingSession();
        }
        
        if (this.currentSession) {
            // Update word count
            const currentWords = this.getCurrentWordCount();
            this.sessionWordCount = Math.max(0, currentWords - this.sessionStartWordCount);
            this.currentSession.wordCount = this.sessionWordCount;
            
            // Flow state detection
            this.updateFlowState(now, currentWords);
            
            // Check for flow interruption (gap in activity)
            if (this.lastActivityTime && (now - this.lastActivityTime) > this.activityThreshold) {
                this.currentSession.flowInterruptions++;
                this.onFlowInterruption(now - this.lastActivityTime);
                console.log('[Gamification] Flow interruption detected');
            }
        }
        
        this.lastActivityTime = now;
        this.updateGamificationUI();
        this.updateProgressIndicators();
    }

    // === Flow State Detection Methods ===
    
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
        console.log('[Gamification] Flow state STARTED');
        this.flowState.isInFlow = true;
        this.flowState.flowStartTime = timestamp;
        this.flowState.flowDuration = 0;
        this.flowState.currentFlowQuality = 0.5;
        
        // Award XP for entering flow state
        this.awardXP(this.xpSystem.xpGains.flowStateReached, 'Entered flow state');
        
        // Trigger celebration effects for flow state
        this.triggerCelebrationEffects('flow');
        
        // Show flow notification
        this.showNotification('🌊 Flow state detected! You\'re in the zone!', 'success');
        
        // Play flow start sound
        this.playSound('flowStart');
        
        // Update UI to show flow indicator
        this.updateFlowUI();
    }
    
    endFlowState(timestamp) {
        const flow = this.flowState;
        
        if (flow.isInFlow && flow.flowStartTime) {
            const duration = timestamp - flow.flowStartTime;
            console.log('[Gamification] Flow state ENDED, duration:', duration / 1000, 'seconds');
            
            // Only record if it was a significant flow session
            if (duration >= flow.thresholds.minFlowDuration) {
                const flowSession = {
                    startTime: flow.flowStartTime,
                    endTime: timestamp,
                    duration: duration,
                    quality: flow.currentFlowQuality,
                    wordsWritten: this.sessionWordCount,
                    averageVelocity: this.calculateTypingVelocity()
                };
                
                flow.flowSessions.push(flowSession);
                this.saveFlowSessions();
                
                // Award flow bonus points
                this.awardFlowBonus(flowSession);
                
                // Show completion notification
                const minutes = Math.round(duration / 60000);
                this.showNotification(
                    `🎯 Flow session complete! ${minutes} minutes of deep focus`, 
                    'success'
                );
                
                // Play flow completion sound
                this.playSound('flowEnd');
            }
        }
        
        flow.isInFlow = false;
        flow.flowStartTime = null;
        flow.flowDuration = 0;
        flow.currentFlowQuality = 0;
        
        this.updateFlowUI();
    }
    
    updateFlowQuality(velocity, consistency, pauseQuality) {
        const normalizedVelocity = Math.min(velocity / 50, 1); // Cap at 50 WPM
        const combinedScore = (normalizedVelocity + consistency + pauseQuality) / 3;
        
        // Smooth the quality score (exponential moving average)
        this.flowState.currentFlowQuality = 
            this.flowState.currentFlowQuality * 0.8 + combinedScore * 0.2;
    }
    
    onFlowInterruption(pauseDuration) {
        this.flowState.pauseHistory.push(pauseDuration);
        
        // Keep only recent pause history
        if (this.flowState.pauseHistory.length > 20) {
            this.flowState.pauseHistory = this.flowState.pauseHistory.slice(-10);
        }
        
        // If pause was too long, end flow state
        if (pauseDuration > this.flowState.thresholds.flowBreakThreshold) {
            this.endFlowState(Date.now());
        }
    }
    
    awardFlowBonus(flowSession) {
        const minutes = flowSession.duration / 60000;
        const qualityMultiplier = 1 + flowSession.quality; // 1.0 to 2.0x multiplier
        const basePoints = Math.round(minutes * 5); // 5 points per minute
        const bonusPoints = Math.round(basePoints * qualityMultiplier);
        
        this.rewards.totalPoints = (this.rewards.totalPoints || 0) + bonusPoints;
        this.saveRewards();
        
        this.showNotification(
            `🌊 Flow bonus: +${bonusPoints} points (${Math.round(flowSession.quality * 100)}% quality)`, 
            'success'
        );
        
        // Check for flow-based achievements
        this.checkFlowAchievements();
    }
    
    checkFlowAchievements() {
        const flowSessions = this.flowState.flowSessions;
        const longestFlow = Math.max(...flowSessions.map(s => s.duration), 0);
        const totalFlowTime = flowSessions.reduce((sum, s) => sum + s.duration, 0);
        
        // Flow achievements
        const flowAchievements = [
            { key: 'first_flow', duration: 5 * 60000, title: 'First Flow', desc: 'Achieved your first 5-minute flow state!' },
            { key: 'flow_master', duration: 30 * 60000, title: 'Flow Master', desc: 'Maintained flow for 30 minutes!' },
            { key: 'flow_legend', duration: 60 * 60000, title: 'Flow Legend', desc: 'One hour of continuous flow!' },
            { key: 'flow_marathon', duration: 2 * 60 * 60000, title: 'Flow Marathon', desc: 'Two hours of flow in one session!' }
        ];
        
        flowAchievements.forEach(achievement => {
            if (longestFlow >= achievement.duration && !this.achievements[achievement.key]) {
                this.achievements[achievement.key] = {
                    title: achievement.title,
                    description: achievement.desc,
                    date: new Date(),
                    type: 'flow'
                };
                this.saveAchievements();
                this.showAchievementNotification(this.achievements[achievement.key]);
                
                // Play achievement sound
                this.playSound('achievement');
            }
        });
    }
    
    updateFlowUI() {
        const flowIndicator = document.querySelector('.flow-indicator');
        const flow = this.flowState;
        
        if (flow.isInFlow) {
            if (!flowIndicator) {
                this.createFlowIndicator();
            } else {
                this.updateFlowIndicator(flowIndicator);
            }
        } else {
            if (flowIndicator) {
                flowIndicator.remove();
            }
        }
    }
    
    createFlowIndicator() {
        const controls = this.controls;
        if (!controls) return;
        
        const indicator = document.createElement('div');
        indicator.className = 'flow-indicator';
        indicator.style.cssText = `
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 6px;
            color: white;
            font-size: 11px;
            box-shadow: 0 1px 3px rgba(102, 126, 234, 0.4);
            animation: flowPulse 2s ease-in-out infinite alternate;
        `;
        
        indicator.innerHTML = `
            <span style="font-size: 12px;">🌊</span>
            <span style="font-weight: bold;">FLOW</span>
            <span class="flow-quality">50%</span>
        `;
        
        // Add CSS animation
        if (!document.getElementById('flow-animation-styles')) {
            const style = document.createElement('style');
            style.id = 'flow-animation-styles';
            style.textContent = `
                @keyframes flowPulse {
                    0% { box-shadow: 0 1px 3px rgba(102, 126, 234, 0.4), 0 0 0 0 rgba(102, 126, 234, 0.7); }
                    100% { box-shadow: 0 1px 3px rgba(102, 126, 234, 0.4), 0 0 0 8px rgba(102, 126, 234, 0); }
                }
            `;
            document.head.appendChild(style);
        }
        
        controls.appendChild(indicator);
    }
    
    updateFlowIndicator(indicator) {
        const qualitySpan = indicator.querySelector('.flow-quality');
        if (qualitySpan) {
            const quality = Math.round(this.flowState.currentFlowQuality * 100);
            qualitySpan.textContent = `${quality}%`;
        }
    }
    
    // === Progress Indicators UI ===
    
    addProgressIndicators() {
        const controls = this.controls;
        if (!controls) return;
        
        // Check if progress indicators are enabled in settings
        if (window.appSettings?.gamification?.showProgressBar === false) {
            return;
        }
        
        // Create progress container
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-indicators';
        progressContainer.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 8px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            margin-left: 10px;
        `;
        
        // Daily progress
        const dailyProgress = this.createProgressBar('daily', '📅 Today', '#3498db');
        progressContainer.appendChild(dailyProgress);
        
        // Session progress (only show when session is active)
        if (this.currentSession) {
            const sessionProgress = this.createProgressBar('session', '✍️ Session', '#27ae60');
            progressContainer.appendChild(sessionProgress);
        }
        
        controls.appendChild(progressContainer);
        this.progressIndicators.container = progressContainer;
        
        // Update progress immediately
        this.updateProgressIndicators();
    }
    
    createProgressBar(type, label, color) {
        const container = document.createElement('div');
        container.className = `progress-bar-container progress-${type}`;
        container.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 80px;
        `;
        
        const labelDiv = document.createElement('div');
        labelDiv.style.cssText = `
            font-size: 9px;
            color: white;
            font-weight: 500;
            opacity: 0.9;
        `;
        labelDiv.textContent = label;
        
        const progressBarOuter = document.createElement('div');
        progressBarOuter.style.cssText = `
            width: 100%;
            height: 6px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 3px;
            overflow: hidden;
            position: relative;
        `;
        
        const progressBarInner = document.createElement('div');
        progressBarInner.className = `progress-fill progress-fill-${type}`;
        progressBarInner.style.cssText = `
            height: 100%;
            background: ${color};
            border-radius: 3px;
            transition: width 0.3s ease;
            width: 0%;
            position: relative;
        `;
        
        // Add shine effect
        const shine = document.createElement('div');
        shine.style.cssText = `
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
            animation: progressShine 2s infinite;
        `;
        progressBarInner.appendChild(shine);
        
        // Add percentage text
        const percentText = document.createElement('div');
        percentText.className = `progress-percent progress-percent-${type}`;
        percentText.style.cssText = `
            font-size: 8px;
            color: white;
            font-weight: bold;
            text-align: center;
            margin-top: 1px;
        `;
        percentText.textContent = '0%';
        
        progressBarOuter.appendChild(progressBarInner);
        container.appendChild(labelDiv);
        container.appendChild(progressBarOuter);
        container.appendChild(percentText);
        
        // Add CSS animation if not already added
        this.addProgressAnimationCSS();
        
        return container;
    }
    
    addProgressAnimationCSS() {
        if (document.getElementById('progress-animation-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'progress-animation-styles';
        style.textContent = `
            @keyframes progressShine {
                0% { left: -100%; }
                100% { left: 100%; }
            }
            
            .progress-bar-container:hover .progress-fill {
                filter: brightness(1.2);
                box-shadow: 0 0 8px rgba(255,255,255,0.3);
            }
        `;
        document.head.appendChild(style);
    }
    
    updateProgressIndicators() {
        if (!this.progressIndicators.container) return;
        
        // Update daily progress
        const dailyProgress = this.getDailyProgress();
        this.updateProgressBar('daily', dailyProgress.words);
        
        // Update session progress (only if session is active)
        if (this.currentSession) {
            const sessionProgress = this.getSessionProgress();
            this.updateProgressBar('session', sessionProgress.words);
            
            // Add session progress bar if it doesn't exist
            if (!this.progressIndicators.container.querySelector('.progress-session')) {
                const sessionProgressBar = this.createProgressBar('session', '✍️ Session', '#27ae60');
                this.progressIndicators.container.appendChild(sessionProgressBar);
            }
        } else {
            // Remove session progress bar if session ended
            const sessionBar = this.progressIndicators.container.querySelector('.progress-session');
            if (sessionBar) {
                sessionBar.remove();
            }
        }
    }
    
    updateProgressBar(type, progressData) {
        const fillElement = document.querySelector(`.progress-fill-${type}`);
        const percentElement = document.querySelector(`.progress-percent-${type}`);
        
        if (fillElement && percentElement) {
            const percentage = progressData.percentage;
            fillElement.style.width = `${percentage}%`;
            percentElement.textContent = `${percentage}%`;
            
            // Add completion effect
            if (percentage >= 100) {
                fillElement.style.background = 'linear-gradient(90deg, #27ae60, #2ecc71)';
                fillElement.style.boxShadow = '0 0 12px rgba(39, 174, 96, 0.6)';
                
                // Show completion notification (once per goal completion)
                const completionKey = `${type}_completed_${this.getTodayKey()}`;
                if (!localStorage.getItem(completionKey)) {
                    localStorage.setItem(completionKey, 'true');
                    this.showGoalCompletionNotification(type, progressData);
                }
            }
        }
    }
    
    showGoalCompletionNotification(type, progressData) {
        const typeNames = {
            daily: 'Daily Goal',
            session: 'Session Goal',
            weekly: 'Weekly Goal'
        };
        
        const message = `🎉 ${typeNames[type]} completed! ${progressData.current.toLocaleString()} words written!`;
        this.showNotification(message, 'success');
        
        // Award bonus points for goal completion
        const bonusPoints = type === 'daily' ? 100 : type === 'session' ? 25 : 250;
        this.rewards.totalPoints = (this.rewards.totalPoints || 0) + bonusPoints;
        this.saveRewards();
        
        setTimeout(() => {
            this.showNotification(`🏆 Bonus: +${bonusPoints} points for goal completion!`, 'success');
        }, 2000);
        
        // Play goal completion sound
        this.playSound('goalComplete');
    }
    
    // === Audio System ===
    
    initializeAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('[Gamification] Audio system initialized');
        } catch (error) {
            console.warn('[Gamification] Audio not supported:', error);
            this.audioSettings.enabled = false;
        }
    }
    
    playSound(soundType) {
        if (!this.audioSettings.enabled || !this.audioContext) return;
        
        // Check if sounds are enabled in settings
        if (window.appSettings?.gamification?.achievementNotifications === false) {
            return;
        }
        
        const soundConfig = this.audioSettings.sounds[soundType];
        if (!soundConfig) return;
        
        try {
            this.createAndPlaySound(soundConfig);
        } catch (error) {
            console.warn('[Gamification] Error playing sound:', error);
        }
    }
    
    createAndPlaySound(config) {
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        
        switch (config.type) {
            case 'success':
                this.playSuccessSound(now, config.duration);
                break;
            case 'celebration':
                this.playCelebrationSound(now, config.duration);
                break;
            case 'gentle':
                this.playGentleSound(now, config.duration);
                break;
            case 'completion':
                this.playCompletionSound(now, config.duration);
                break;
            case 'chime':
                this.playChimeSound(now, config.duration);
                break;
            case 'fanfare':
                this.playFanfareSound(now, config.duration);
                break;
            default:
                this.playDefaultSound(now, config.duration);
        }
    }
    
    playSuccessSound(startTime, duration) {
        const ctx = this.audioContext;
        
        // Create a pleasant ascending chord
        const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5
        
        frequencies.forEach((freq, index) => {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            
            oscillator.frequency.setValueAtTime(freq, startTime);
            oscillator.type = 'sine';
            
            const delay = index * 0.1;
            const noteStart = startTime + delay;
            const noteEnd = noteStart + (duration / 1000) * 0.4;
            
            gainNode.gain.setValueAtTime(0, noteStart);
            gainNode.gain.linearRampToValueAtTime(this.audioSettings.volume * 0.3, noteStart + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.001, noteEnd);
            
            oscillator.start(noteStart);
            oscillator.stop(noteEnd);
        });
    }
    
    playCelebrationSound(startTime, duration) {
        const ctx = this.audioContext;
        
        // Create a celebratory melody
        const melody = [
            { freq: 523.25, start: 0, duration: 0.2 },     // C5
            { freq: 659.25, start: 0.15, duration: 0.2 },  // E5
            { freq: 783.99, start: 0.3, duration: 0.2 },   // G5
            { freq: 1046.5, start: 0.45, duration: 0.4 },  // C6
        ];
        
        melody.forEach(note => {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            
            oscillator.frequency.setValueAtTime(note.freq, startTime);
            oscillator.type = 'triangle';
            
            const noteStart = startTime + note.start;
            const noteEnd = noteStart + note.duration;
            
            gainNode.gain.setValueAtTime(0, noteStart);
            gainNode.gain.linearRampToValueAtTime(this.audioSettings.volume * 0.4, noteStart + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, noteEnd);
            
            oscillator.start(noteStart);
            oscillator.stop(noteEnd);
        });
    }
    
    playGentleSound(startTime, duration) {
        const ctx = this.audioContext;
        
        // Soft, welcoming sound for flow start
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        
        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.frequency.setValueAtTime(440, startTime); // A4
        oscillator.frequency.exponentialRampToValueAtTime(880, startTime + duration / 1000); // A5
        oscillator.type = 'sine';
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, startTime);
        
        const endTime = startTime + duration / 1000;
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(this.audioSettings.volume * 0.2, startTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, endTime);
        
        oscillator.start(startTime);
        oscillator.stop(endTime);
    }
    
    playCompletionSound(startTime, duration) {
        const ctx = this.audioContext;
        
        // Satisfying completion sound
        const oscillator1 = ctx.createOscillator();
        const oscillator2 = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator1.connect(gainNode);
        oscillator2.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator1.frequency.setValueAtTime(523.25, startTime); // C5
        oscillator2.frequency.setValueAtTime(523.25 * 2, startTime); // C6
        
        oscillator1.type = 'sine';
        oscillator2.type = 'triangle';
        
        const endTime = startTime + duration / 1000;
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(this.audioSettings.volume * 0.3, startTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, endTime);
        
        oscillator1.start(startTime);
        oscillator2.start(startTime);
        oscillator1.stop(endTime);
        oscillator2.stop(endTime);
    }
    
    playChimeSound(startTime, duration) {
        const ctx = this.audioContext;
        
        // Bell-like chime
        const frequencies = [523.25, 659.25, 783.99, 1046.5]; // C major chord
        
        frequencies.forEach((freq, index) => {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            
            oscillator.frequency.setValueAtTime(freq, startTime);
            oscillator.type = 'sine';
            
            const noteStart = startTime;
            const noteEnd = startTime + (duration / 1000);
            
            gainNode.gain.setValueAtTime(0, noteStart);
            gainNode.gain.linearRampToValueAtTime(this.audioSettings.volume * 0.2, noteStart + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, noteEnd);
            
            oscillator.start(noteStart);
            oscillator.stop(noteEnd);
        });
    }
    
    playFanfareSound(startTime, duration) {
        const ctx = this.audioContext;
        
        // Triumphant fanfare for major achievements
        const fanfare = [
            { freq: 523.25, start: 0, duration: 0.3 },      // C5
            { freq: 659.25, start: 0.2, duration: 0.3 },    // E5
            { freq: 783.99, start: 0.4, duration: 0.3 },    // G5
            { freq: 1046.5, start: 0.6, duration: 0.6 },    // C6
            { freq: 1318.5, start: 0.8, duration: 0.7 },    // E6
        ];
        
        fanfare.forEach(note => {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            
            oscillator.frequency.setValueAtTime(note.freq, startTime);
            oscillator.type = 'sawtooth';
            
            const noteStart = startTime + note.start;
            const noteEnd = noteStart + note.duration;
            
            gainNode.gain.setValueAtTime(0, noteStart);
            gainNode.gain.linearRampToValueAtTime(this.audioSettings.volume * 0.5, noteStart + 0.03);
            gainNode.gain.exponentialRampToValueAtTime(0.001, noteEnd);
            
            oscillator.start(noteStart);
            oscillator.stop(noteEnd);
        });
    }
    
    playDefaultSound(startTime, duration) {
        const ctx = this.audioContext;
        
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.frequency.setValueAtTime(800, startTime);
        oscillator.type = 'sine';
        
        const endTime = startTime + duration / 1000;
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(this.audioSettings.volume * 0.3, startTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, endTime);
        
        oscillator.start(startTime);
        oscillator.stop(endTime);
    }
    
    // === Goal Customization Methods ===
    
    applyGoalPreset(presetType) {
        const presets = {
            beginner: {
                daily: { words: 250, sessions: 1, flowTime: 10 * 60000 },
                session: { words: 150, duration: 20 * 60000 },
                weekly: { words: 1500, sessions: 5, flowTime: 1.5 * 60 * 60000 }
            },
            intermediate: {
                daily: { words: 500, sessions: 2, flowTime: 15 * 60000 },
                session: { words: 250, duration: 25 * 60000 },
                weekly: { words: 3500, sessions: 10, flowTime: 2 * 60 * 60000 }
            },
            advanced: {
                daily: { words: 1000, sessions: 3, flowTime: 30 * 60000 },
                session: { words: 400, duration: 45 * 60000 },
                weekly: { words: 7000, sessions: 15, flowTime: 4 * 60 * 60000 }
            },
            academic: {
                daily: { words: 750, sessions: 2, flowTime: 45 * 60000 },
                session: { words: 500, duration: 90 * 60000 },
                weekly: { words: 5000, sessions: 12, flowTime: 6 * 60 * 60000 }
            }
        };
        
        const preset = presets[presetType];
        if (!preset) return;
        
        // Update form fields
        document.getElementById('daily-words').value = preset.daily.words;
        document.getElementById('daily-sessions').value = preset.daily.sessions;
        document.getElementById('daily-flow').value = Math.round(preset.daily.flowTime / 60000);
        
        document.getElementById('session-words').value = preset.session.words;
        document.getElementById('session-duration').value = Math.round(preset.session.duration / 60000);
        
        document.getElementById('weekly-words').value = preset.weekly.words;
        document.getElementById('weekly-sessions').value = preset.weekly.sessions;
        document.getElementById('weekly-flow').value = Math.round(preset.weekly.flowTime / 3600000);
        
        // Show feedback
        this.showNotification(`🎯 Applied ${presetType} preset goals!`, 'success');
    }
    
    saveCustomGoals() {
        try {
            // Collect form values
            const newGoals = {
                daily: {
                    words: parseInt(document.getElementById('daily-words').value) || 500,
                    sessions: parseInt(document.getElementById('daily-sessions').value) || 2,
                    flowTime: (parseInt(document.getElementById('daily-flow').value) || 15) * 60000
                },
                session: {
                    words: parseInt(document.getElementById('session-words').value) || 250,
                    duration: (parseInt(document.getElementById('session-duration').value) || 25) * 60000
                },
                weekly: {
                    words: parseInt(document.getElementById('weekly-words').value) || 3500,
                    sessions: parseInt(document.getElementById('weekly-sessions').value) || 10,
                    flowTime: (parseFloat(document.getElementById('weekly-flow').value) || 2) * 3600000
                }
            };
            
            // Validate goals
            if (newGoals.daily.words < 50 || newGoals.daily.words > 5000) {
                throw new Error('Daily word goal must be between 50 and 5000');
            }
            if (newGoals.session.words < 25 || newGoals.session.words > 1000) {
                throw new Error('Session word goal must be between 25 and 1000');
            }
            if (newGoals.weekly.words < 500 || newGoals.weekly.words > 25000) {
                throw new Error('Weekly word goal must be between 500 and 25000');
            }
            
            // Save new goals
            this.goals = newGoals;
            this.saveGoals();
            
            // Update progress indicators immediately
            this.updateProgressIndicators();
            
            // Show success message
            this.showNotification('🎯 Goals updated successfully!', 'success');
            
            // Play success sound
            this.playSound('success');
            
            // Close modal
            this.closeModal();
            
        } catch (error) {
            this.showNotification(`❌ Error saving goals: ${error.message}`, 'error');
        }
    }
    
    // === Writing Analytics System ===
    
    initializeAnalytics() {
        this.loadAnalyticsData();
        console.log('[Gamification] Analytics system initialized');
    }
    
    loadAnalyticsData() {
        const stored = localStorage.getItem('gamification_analytics');
        if (stored) {
            const data = JSON.parse(stored);
            this.analytics.timeSlots = data.timeSlots || {};
            this.analytics.dayOfWeek = data.dayOfWeek || {};
            this.analytics.sessionTypes = data.sessionTypes || {};
            this.analytics.velocityHistory = data.velocityHistory || [];
        }
    }
    
    saveAnalyticsData() {
        const data = {
            timeSlots: this.analytics.timeSlots,
            dayOfWeek: this.analytics.dayOfWeek,
            sessionTypes: this.analytics.sessionTypes,
            velocityHistory: this.analytics.velocityHistory
        };
        localStorage.setItem('gamification_analytics', JSON.stringify(data));
    }
    
    loadInsights() {
        const stored = localStorage.getItem('gamification_insights');
        return stored ? JSON.parse(stored) : {};
    }
    
    saveInsights() {
        localStorage.setItem('gamification_insights', JSON.stringify(this.analytics.insights));
    }
    
    recordSessionAnalytics(session) {
        if (!session || session.duration < this.minSessionLength) return;
        
        const startTime = new Date(session.startTime);
        const hour = startTime.getHours();
        const dayOfWeek = startTime.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const wordsPerMinute = session.duration > 0 ? (session.wordCount / (session.duration / 60000)) : 0;
        
        // Track hourly productivity
        if (!this.analytics.timeSlots[hour]) {
            this.analytics.timeSlots[hour] = {
                totalSessions: 0,
                totalWords: 0,
                totalTime: 0,
                avgWordsPerMinute: 0,
                flowSessions: 0
            };
        }
        
        const hourSlot = this.analytics.timeSlots[hour];
        hourSlot.totalSessions++;
        hourSlot.totalWords += session.wordCount;
        hourSlot.totalTime += session.duration;
        
        // Calculate average WPM
        const totalMinutes = hourSlot.totalTime / 60000;
        hourSlot.avgWordsPerMinute = totalMinutes > 0 ? hourSlot.totalWords / totalMinutes : 0;
        
        // Track day-of-week patterns
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = dayNames[dayOfWeek];
        
        if (!this.analytics.dayOfWeek[dayName]) {
            this.analytics.dayOfWeek[dayName] = {
                totalSessions: 0,
                totalWords: 0,
                avgWordsPerMinute: 0,
                bestStreak: 0
            };
        }
        
        const daySlot = this.analytics.dayOfWeek[dayName];
        daySlot.totalSessions++;
        daySlot.totalWords += session.wordCount;
        
        // Track velocity history (last 30 data points)
        this.analytics.velocityHistory.push({
            timestamp: session.startTime,
            wpm: wordsPerMinute,
            hour: hour,
            dayOfWeek: dayOfWeek,
            flowInterruptions: session.flowInterruptions || 0
        });
        
        // Keep only recent velocity data
        if (this.analytics.velocityHistory.length > 50) {
            this.analytics.velocityHistory = this.analytics.velocityHistory.slice(-30);
        }
        
        // Check if this was during flow state
        const sessionFlowTime = this.getSessionFlowTime(session);
        if (sessionFlowTime > 300000) { // 5+ minutes of flow
            hourSlot.flowSessions++;
        }
        
        // Update session type analytics
        const sessionType = this.categorizeSession(session);
        if (!this.analytics.sessionTypes[sessionType]) {
            this.analytics.sessionTypes[sessionType] = {
                count: 0,
                totalWords: 0,
                avgWordsPerMinute: 0
            };
        }
        
        const typeSlot = this.analytics.sessionTypes[sessionType];
        typeSlot.count++;
        typeSlot.totalWords += session.wordCount;
        typeSlot.avgWordsPerMinute = (typeSlot.avgWordsPerMinute * (typeSlot.count - 1) + wordsPerMinute) / typeSlot.count;
        
        this.saveAnalyticsData();
        
        // Generate insights periodically
        if (Math.random() < 0.3) { // 30% chance to update insights
            this.generateInsights();
        }
    }
    
    getSessionFlowTime(session) {
        // Calculate how much of the session was spent in flow state
        const sessionStart = new Date(session.startTime).getTime();
        const sessionEnd = session.endTime ? new Date(session.endTime).getTime() : Date.now();
        
        return this.flowState.flowSessions
            .filter(flowSession => {
                return flowSession.startTime >= sessionStart && flowSession.endTime <= sessionEnd;
            })
            .reduce((total, flowSession) => total + flowSession.duration, 0);
    }
    
    categorizeSession(session) {
        const duration = session.duration / 60000; // minutes
        const wpm = duration > 0 ? session.wordCount / duration : 0;
        const flowTime = this.getSessionFlowTime(session) / 60000; // minutes
        
        if (flowTime > duration * 0.7) {
            return 'Deep Flow';
        } else if (wpm > 25) {
            return 'High Velocity';
        } else if (duration > 45) {
            return 'Marathon';
        } else if (duration < 15) {
            return 'Sprint';
        } else {
            return 'Regular';
        }
    }
    
    generateInsights() {
        const insights = {};
        
        // Find best writing time
        const bestHour = this.findBestWritingHour();
        if (bestHour !== null) {
            insights.bestWritingTime = {
                hour: bestHour,
                period: this.formatHourPeriod(bestHour),
                avgWpm: this.analytics.timeSlots[bestHour]?.avgWordsPerMinute || 0
            };
        }
        
        // Find best day of week
        const bestDay = this.findBestWritingDay();
        if (bestDay) {
            insights.bestWritingDay = {
                day: bestDay,
                avgWpm: this.analytics.dayOfWeek[bestDay]?.avgWordsPerMinute || 0
            };
        }
        
        // Velocity trends
        const velocityTrend = this.analyzeVelocityTrend();
        if (velocityTrend) {
            insights.velocityTrend = velocityTrend;
        }
        
        // Session type performance
        const bestSessionType = this.findBestSessionType();
        if (bestSessionType) {
            insights.bestSessionType = bestSessionType;
        }
        
        // Productivity patterns
        const patterns = this.identifyProductivityPatterns();
        if (patterns.length > 0) {
            insights.patterns = patterns;
        }
        
        this.analytics.insights = insights;
        this.saveInsights();
        
        console.log('[Gamification] Analytics insights updated:', insights);
    }
    
    findBestWritingHour() {
        const timeSlots = this.analytics.timeSlots;
        let bestHour = null;
        let bestScore = 0;
        
        for (const hour in timeSlots) {
            const slot = timeSlots[hour];
            if (slot.totalSessions < 2) continue; // Need at least 2 sessions for reliability
            
            // Score based on WPM and flow session ratio
            const flowRatio = slot.flowSessions / slot.totalSessions;
            const score = slot.avgWordsPerMinute * (1 + flowRatio);
            
            if (score > bestScore) {
                bestScore = score;
                bestHour = parseInt(hour);
            }
        }
        
        return bestHour;
    }
    
    findBestWritingDay() {
        const daySlots = this.analytics.dayOfWeek;
        let bestDay = null;
        let bestAvgWpm = 0;
        
        for (const day in daySlots) {
            const slot = daySlots[day];
            if (slot.totalSessions < 2) continue;
            
            const avgWpm = slot.totalWords / (slot.totalSessions * 25); // Approximate
            if (avgWpm > bestAvgWpm) {
                bestAvgWpm = avgWpm;
                bestDay = day;
            }
        }
        
        return bestDay;
    }
    
    analyzeVelocityTrend() {
        const history = this.analytics.velocityHistory;
        if (history.length < 5) return null;
        
        const recent = history.slice(-10);
        const older = history.slice(-20, -10);
        
        if (older.length === 0) return null;
        
        const recentAvg = recent.reduce((sum, entry) => sum + entry.wpm, 0) / recent.length;
        const olderAvg = older.reduce((sum, entry) => sum + entry.wpm, 0) / older.length;
        
        const change = recentAvg - olderAvg;
        const percentChange = olderAvg > 0 ? (change / olderAvg) * 100 : 0;
        
        if (Math.abs(percentChange) < 5) {
            return { trend: 'stable', change: percentChange };
        } else if (percentChange > 0) {
            return { trend: 'improving', change: percentChange };
        } else {
            return { trend: 'declining', change: percentChange };
        }
    }
    
    findBestSessionType() {
        const sessionTypes = this.analytics.sessionTypes;
        let bestType = null;
        let bestWpm = 0;
        
        for (const type in sessionTypes) {
            const data = sessionTypes[type];
            if (data.count < 2) continue;
            
            if (data.avgWordsPerMinute > bestWpm) {
                bestWpm = data.avgWordsPerMinute;
                bestType = type;
            }
        }
        
        return bestType ? { type: bestType, avgWpm: bestWpm } : null;
    }
    
    identifyProductivityPatterns() {
        const patterns = [];
        
        // Morning vs Evening preference
        const morningHours = [6, 7, 8, 9, 10, 11];
        const eveningHours = [18, 19, 20, 21, 22, 23];
        
        const morningProductivity = this.calculatePeriodProductivity(morningHours);
        const eveningProductivity = this.calculatePeriodProductivity(eveningHours);
        
        if (morningProductivity > eveningProductivity * 1.2) {
            patterns.push({
                type: 'time_preference',
                description: 'You are most productive in the morning',
                confidence: Math.min(95, 60 + (morningProductivity - eveningProductivity) * 10)
            });
        } else if (eveningProductivity > morningProductivity * 1.2) {
            patterns.push({
                type: 'time_preference',
                description: 'You are most productive in the evening',
                confidence: Math.min(95, 60 + (eveningProductivity - morningProductivity) * 10)
            });
        }
        
        // Consistency patterns
        const velocityVariance = this.calculateVelocityVariance();
        if (velocityVariance < 5) {
            patterns.push({
                type: 'consistency',
                description: 'You maintain very consistent writing speed',
                confidence: 85
            });
        } else if (velocityVariance > 15) {
            patterns.push({
                type: 'variability',
                description: 'Your writing speed varies significantly between sessions',
                confidence: 80
            });
        }
        
        return patterns;
    }
    
    calculatePeriodProductivity(hours) {
        let totalWpm = 0;
        let count = 0;
        
        hours.forEach(hour => {
            const slot = this.analytics.timeSlots[hour];
            if (slot && slot.totalSessions > 0) {
                totalWpm += slot.avgWordsPerMinute;
                count++;
            }
        });
        
        return count > 0 ? totalWpm / count : 0;
    }
    
    calculateVelocityVariance() {
        const history = this.analytics.velocityHistory;
        if (history.length < 3) return 0;
        
        const wpmValues = history.map(entry => entry.wpm);
        const mean = wpmValues.reduce((sum, wpm) => sum + wpm, 0) / wpmValues.length;
        const variance = wpmValues.reduce((sum, wpm) => sum + Math.pow(wpm - mean, 2), 0) / wpmValues.length;
        
        return Math.sqrt(variance); // Standard deviation
    }
    
    formatHourPeriod(hour) {
        if (hour >= 5 && hour < 12) return 'Morning';
        if (hour >= 12 && hour < 17) return 'Afternoon';
        if (hour >= 17 && hour < 21) return 'Evening';
        return 'Night';
    }

    isWritingKey(event) {
        // Consider alphabetic keys, space, backspace, enter as writing activity
        const key = event.key;
        return (
            (key.length === 1 && /[a-zA-Z0-9\s\.,;:!?'"()\-]/.test(key)) ||
            key === 'Backspace' || 
            key === 'Delete' || 
            key === 'Enter' ||
            key === 'Space'
        );
    }

    // === Streak Management ===
    
    updateStreaks() {
        const today = this.getTodayKey();
        const yesterday = this.getYesterdayKey();
        
        if (!this.streakData.currentStreak) {
            this.streakData.currentStreak = 0;
            this.streakData.longestStreak = 0;
            this.streakData.lastWritingDay = null;
        }
        
        // Check if this is a new writing day
        if (this.streakData.lastWritingDay !== today) {
            if (this.streakData.lastWritingDay === yesterday) {
                // Continuing streak
                this.streakData.currentStreak++;
            } else if (this.streakData.lastWritingDay === today) {
                // Same day, no change to streak
                return;
            } else {
                // Streak broken, restart
                this.streakData.currentStreak = 1;
            }
            
            this.streakData.lastWritingDay = today;
            this.streakData.longestStreak = Math.max(
                this.streakData.longestStreak, 
                this.streakData.currentStreak
            );
            
            this.saveStreakData();
            
            if (this.streakData.currentStreak > 1) {
                // Award XP for maintaining streak
                this.awardXP(this.xpSystem.xpGains.streakMaintained, `${this.streakData.currentStreak} day streak`);
                // Trigger celebration effects for streaks
                if (this.streakData.currentStreak % 7 === 0) { // Weekly milestones get extra celebration
                    this.triggerCelebrationEffects('streak');
                }
                this.showNotification(
                    `🔥 ${this.streakData.currentStreak} day writing streak! Keep it going!`, 
                    'success'
                );
            }
        }
    }

    // === Achievement System ===
    
    checkAchievements() {
        const today = this.getTodayKey();
        const dayStats = this.dailyStats[today];
        
        if (!dayStats) return;
        
        const newAchievements = [];
        
        // Word count achievements
        const totalWords = this.getTotalWords();
        const wordMilestones = [500, 1000, 2500, 5000, 10000, 25000, 50000];
        
        for (const milestone of wordMilestones) {
            const achievementKey = `words_${milestone}`;
            if (totalWords >= milestone && !this.achievements[achievementKey]) {
                this.achievements[achievementKey] = {
                    title: `${milestone} Words Written`,
                    description: `You've written ${milestone} words total!`,
                    date: new Date(),
                    type: 'milestone'
                };
                newAchievements.push(this.achievements[achievementKey]);
            }
        }
        
        // Streak achievements
        const streakMilestones = [3, 7, 14, 30, 100];
        for (const milestone of streakMilestones) {
            const achievementKey = `streak_${milestone}`;
            if (this.streakData.currentStreak >= milestone && !this.achievements[achievementKey]) {
                this.achievements[achievementKey] = {
                    title: `${milestone} Day Streak`,
                    description: `${milestone} consecutive days of writing!`,
                    date: new Date(),
                    type: 'streak'
                };
                newAchievements.push(this.achievements[achievementKey]);
            }
        }
        
        // Session achievements
        if (dayStats.longestSession >= 1800000 && !this.achievements.session_30min) { // 30 minutes
            this.achievements.session_30min = {
                title: 'Deep Focus',
                description: 'Wrote for 30+ minutes in one session!',
                date: new Date(),
                type: 'focus'
            };
            newAchievements.push(this.achievements.session_30min);
        }
        
        if (dayStats.avgWordsPerMinute >= 30 && !this.achievements.speed_30wpm) {
            this.achievements.speed_30wpm = {
                title: 'Speed Writer',
                description: 'Averaged 30+ words per minute!',
                date: new Date(),
                type: 'speed'
            };
            newAchievements.push(this.achievements.speed_30wpm);
        }
        
        // Save achievements and show notifications
        if (newAchievements.length > 0) {
            this.saveAchievements();
            for (const achievement of newAchievements) {
                // Award XP for achievement unlock
                this.awardXP(this.xpSystem.xpGains.achievementUnlocked, `Achievement: ${achievement.title}`);
                // Trigger celebration effects
                this.triggerCelebrationEffects('achievement');
                this.showAchievementNotification(achievement);
            }
        }
    }

    showAchievementNotification(achievement) {
        this.showNotification(
            `🏆 Achievement Unlocked: ${achievement.title}`, 
            'success'
        );
        console.log('[Gamification] Achievement unlocked:', achievement.title);
    }

    // === UI Management ===
    
    setupEventListeners() {
        // Add gamification controls to toolbar
        this.addGamificationControls();
        
        // Auto-end session when switching files or closing
        window.addEventListener('beforeunload', () => {
            if (this.currentSession) {
                this.endWritingSession();
            }
        });
        
        // End session when file changes (but allow quick switches)
        const originalSetCurrentFile = window.setCurrentFile;
        if (originalSetCurrentFile) {
            window.setCurrentFile = (...args) => {
                if (this.currentSession) {
                    // Give a brief grace period for file switches
                    setTimeout(() => {
                        if (this.currentSession && window.currentFilePath !== this.currentSession.filePath) {
                            this.endWritingSession();
                        }
                    }, 5000);
                }
                return originalSetCurrentFile.apply(window, args);
            };
        }
    }

    addGamificationControls() {
        // Check if gamification is enabled in settings
        const enabled = this.isGamificationEnabled();
        console.log('[Gamification] Enabled check result:', enabled);
        
        if (!enabled) {
            console.log('[Gamification] Gamification disabled in settings - forcing enable for debugging');
            // Temporarily force enable for debugging
            // return;
        }
        
        console.log('[Gamification] Proceeding with UI creation');

        // Look for existing editor toolbar first
        let editorToolbar = document.getElementById('editor-toolbar');
        if (!editorToolbar) {
            editorToolbar = document.querySelector('.toolbar');
        }
        
        if (!editorToolbar) {
            console.error('[Gamification] Editor toolbar element not found');
            return;
        }

        console.log('[Gamification] Adding collapsible gamification menu');

        // Create collapsible gamification menu
        const gamificationMenu = document.createElement('div');
        gamificationMenu.id = 'gamification-menu';
        gamificationMenu.className = 'gamification-menu';
        
        // Create menu header (always visible)
        const menuHeader = document.createElement('div');
        menuHeader.className = 'gamification-menu-header';
        menuHeader.innerHTML = `
            <span class="gamification-icon">🎮</span>
            <span class="gamification-title">Writing Progress</span>
            <button class="gamification-toggle" id="gamification-toggle">▼</button>
        `;
        
        // Create collapsible content
        const menuContent = document.createElement('div');
        menuContent.className = 'gamification-menu-content';
        menuContent.id = 'gamification-menu-content';
        
        // Create dashboard container
        const controls = document.createElement('div');
        controls.className = 'gamification-dashboard';
        controls.innerHTML = `
            <div class="dashboard-grid">
                <!-- Today's Progress Card -->
                <div class="dashboard-card progress-card">
                    <div class="card-header">
                        <h4 class="card-title">📊 Today's Progress</h4>
                    </div>
                    <div class="card-content">
                        <div class="progress-stat">
                            <div class="progress-number">${this.dailyStats.wordsWritten || 0}</div>
                            <div class="progress-label">Words Written</div>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${Math.min((this.dailyStats.wordsWritten || 0) / 500 * 100, 100)}%"></div>
                            </div>
                        </div>
                        <div class="mini-stats">
                            <div class="mini-stat">
                                <span class="mini-icon">⏱️</span>
                                <span class="mini-value session-time">00:00</span>
                                <span class="mini-label">Session</span>
                            </div>
                            <div class="mini-stat">
                                <span class="mini-icon">🎯</span>
                                <span class="mini-value">${this.dailyStats.sessionsCompleted || 0}</span>
                                <span class="mini-label">Sessions</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Streak & Level Card -->
                <div class="dashboard-card streak-card">
                    <div class="card-header">
                        <h4 class="card-title">🔥 Momentum</h4>
                    </div>
                    <div class="card-content">
                        <div class="streak-display">
                            <div class="streak-number">${this.streakData.currentStreak || 0}</div>
                            <div class="streak-text">Day Streak</div>
                        </div>
                        <div class="level-info">
                            <div class="level-badge">
                                <span class="level-icon">⭐</span>
                                <span class="level-text">Level ${this.xpSystem.currentLevel || 1}</span>
                            </div>
                            <div class="points-display">${this.rewards.totalPoints || 0} pts</div>
                        </div>
                    </div>
                </div>

                <!-- Session Status Card -->
                <div class="dashboard-card session-card">
                    <div class="card-header">
                        <h4 class="card-title">✍️ Writing Session</h4>
                    </div>
                    <div class="card-content">
                        <div class="session-status inactive" id="session-status-display">
                            <div class="status-indicator"></div>
                            <div class="status-text">Ready to write</div>
                        </div>
                        <div class="session-actions">
                            <button id="start-writing-session" class="dashboard-btn primary">
                                <span class="btn-icon">▶️</span>
                                Start Session
                            </button>
                            <button id="end-writing-session" class="dashboard-btn secondary" disabled>
                                <span class="btn-icon">⏹️</span>
                                End Session
                            </button>
                        </div>
                        <div class="session-words">
                            <span class="words-count session-words">0</span> words this session
                        </div>
                    </div>
                </div>

                <!-- Focus Mode Card -->
                <div class="dashboard-card focus-card">
                    <div class="card-header">
                        <h4 class="card-title">🎯 Focus Mode</h4>
                    </div>
                    <div class="card-content">
                        <div class="focus-timer" id="focus-timer-display">
                            <div class="timer-display">25:00</div>
                            <div class="timer-label">Pomodoro Timer</div>
                        </div>
                        <div class="focus-actions">
                            <button id="start-focus-session" class="dashboard-btn accent">
                                <span class="btn-icon">🎯</span>
                                Start Focus
                            </button>
                            <div class="focus-controls" style="display: none;">
                                <button id="pause-focus-session" class="dashboard-btn warning">
                                    <span class="btn-icon">⏸️</span>
                                    Pause
                                </button>
                                <button id="stop-focus-session" class="dashboard-btn danger">
                                    <span class="btn-icon">⏹️</span>
                                    Stop
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Quick Actions Card -->
                <div class="dashboard-card actions-card">
                    <div class="card-header">
                        <h4 class="card-title">⚡ Quick Actions</h4>
                    </div>
                    <div class="card-content">
                        <div class="quick-actions">
                            <button id="show-stats" class="quick-action-btn">
                                <span class="action-icon">📈</span>
                                <span class="action-label">View Stats</span>
                            </button>
                            <button id="customize-goals" class="quick-action-btn">
                                <span class="action-icon">🎯</span>
                                <span class="action-label">Set Goals</span>
                            </button>
                            <button class="quick-action-btn" onclick="window.writingGamification?.showAchievements?.()">
                                <span class="action-icon">🏆</span>
                                <span class="action-label">Achievements</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add to menu
        menuContent.appendChild(controls);
        gamificationMenu.appendChild(menuHeader);
        gamificationMenu.appendChild(menuContent);
        
        // Insert after editor toolbar
        console.log('[Gamification] Inserting gamification menu after editor toolbar');
        editorToolbar.insertAdjacentElement('afterend', gamificationMenu);
        console.log('[Gamification] Gamification menu inserted successfully');
        
        this.controls = controls;
        this.menuContent = menuContent;
        this.isMenuExpanded = this.loadMenuState();
        this.updateMenuState();
        
        // Initialize menu visibility from saved state
        this.initializeMenuVisibility(gamificationMenu);
        
        // Add event listeners with error checking
        const toggleButton = document.getElementById('gamification-toggle');
        if (toggleButton) {
            console.log('[Gamification] Adding click listener to toggle button');
            toggleButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Gamification] Toggle button clicked');
                this.toggleMenu();
            });
        } else {
            console.error('[Gamification] Toggle button not found!');
        }

        const startButton = document.getElementById('start-writing-session');
        if (startButton) {
            startButton.addEventListener('click', () => {
                this.startWritingSession();
            });
        } else {
            console.warn('[Gamification] Start writing session button not found');
        }
        
        const endButton = document.getElementById('end-writing-session');
        if (endButton) {
            endButton.addEventListener('click', () => {
                this.endWritingSession();
            });
        } else {
            console.warn('[Gamification] End writing session button not found');
        }
        
        const statsButton = document.getElementById('show-stats');
        if (statsButton) {
            statsButton.addEventListener('click', () => {
                console.log('[Gamification] Stats button clicked');
                try {
                    this.showStatsModal();
                } catch (error) {
                    console.error('[Gamification] Error showing stats modal:', error);
                }
            });
        } else {
            console.warn('[Gamification] Show stats button not found');
        }
        
        const goalsButton = document.getElementById('customize-goals');
        if (goalsButton) {
            goalsButton.addEventListener('click', () => {
                console.log('[Gamification] Goals button clicked');
                try {
                    this.showGoalsModal();
                } catch (error) {
                    console.error('[Gamification] Error showing goals modal:', error);
                }
            });
        } else {
            console.warn('[Gamification] Customize goals button not found');
        }
        
        // Focus session controls
        document.getElementById('start-focus-session').addEventListener('click', () => {
            console.log('[Gamification] Focus button clicked');
            try {
                this.showFocusSessionSelector();
            } catch (error) {
                console.error('[Gamification] Error showing focus session selector:', error);
            }
        });
        
        document.getElementById('pause-focus-session').addEventListener('click', () => {
            if (this.focusTimer) {
                this.pauseFocusSession();
            } else {
                this.resumeFocusSession();
            }
        });
        
        document.getElementById('stop-focus-session').addEventListener('click', () => {
            this.stopFocusSession();
        });
        
        // Store reference to this instance for global access
        window.gamificationInstance = this;
        
        // Add progress bars to UI
        this.addProgressIndicators();
    }

    isGamificationEnabled() {
        // Check global settings for gamification enabled state
        console.log('[Gamification] Checking enabled state...');
        console.log('[Gamification] window.appSettings:', window.appSettings);
        console.log('[Gamification] gamification settings:', window.appSettings?.gamification);
        
        if (window.appSettings?.gamification?.enabled !== undefined) {
            console.log('[Gamification] Settings found, enabled:', window.appSettings.gamification.enabled);
            return window.appSettings.gamification.enabled;
        }
        // Default to enabled if no setting exists
        console.log('[Gamification] No settings found, defaulting to enabled');
        return true;
    }

    toggleMenu() {
        console.log('[Gamification] toggleMenu called, current state:', this.isMenuExpanded);
        this.isMenuExpanded = !this.isMenuExpanded;
        console.log('[Gamification] New state:', this.isMenuExpanded);
        this.updateMenuState();
        this.saveMenuState();
    }

    // Toggle entire menu visibility (for external toggle button)
    toggleMenuVisibility() {
        const gamificationMenu = document.getElementById('gamification-menu');
        if (!gamificationMenu) {
            console.error('[Gamification] gamification-menu element not found');
            return false;
        }
        
        const isVisible = gamificationMenu.style.display !== 'none';
        gamificationMenu.style.display = isVisible ? 'none' : 'block';
        
        // Save visibility state
        localStorage.setItem('gamification-menu-visible', JSON.stringify(!isVisible));
        
        console.log('[Gamification] Menu visibility toggled:', !isVisible);
        return !isVisible;
    }

    updateMenuState() {
        console.log('[Gamification] updateMenuState called, menuContent exists:', !!this.menuContent);
        if (!this.menuContent) {
            console.error('[Gamification] menuContent is null or undefined!');
            return;
        }
        
        const toggle = document.getElementById('gamification-toggle');
        console.log('[Gamification] Toggle button found:', !!toggle, 'isExpanded:', this.isMenuExpanded);
        
        if (this.isMenuExpanded) {
            this.menuContent.style.display = 'block';
            if (toggle) toggle.textContent = '▲';
        } else {
            this.menuContent.style.display = 'none';
            if (toggle) toggle.textContent = '▼';
        }
    }

    loadMenuState() {
        const saved = localStorage.getItem('gamification-menu-expanded');
        return saved !== null ? JSON.parse(saved) : true; // Default to expanded
    }

    saveMenuState() {
        localStorage.setItem('gamification-menu-expanded', JSON.stringify(this.isMenuExpanded));
    }

    initializeMenuVisibility(gamificationMenu) {
        // Load visibility state (default to visible if not set)
        const saved = localStorage.getItem('gamification-menu-visible');
        const isVisible = saved !== null ? JSON.parse(saved) : true;
        
        if (gamificationMenu) {
            gamificationMenu.style.display = isVisible ? 'block' : 'none';
            console.log('[Gamification] Initialized menu visibility:', isVisible);
        }
    }

    updateGamificationUI() {
        const streakCountEl = document.querySelector('.streak-count');
        const sessionTimeEl = document.querySelector('.session-time');
        const sessionWordsEl = document.querySelector('.session-words');
        const startBtn = document.getElementById('start-writing-session');
        const endBtn = document.getElementById('end-writing-session');
        
        if (streakCountEl) {
            streakCountEl.textContent = this.streakData.currentStreak || 0;
        }
        
        if (this.currentSession) {
            const elapsed = Date.now() - this.sessionStartTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            
            if (sessionTimeEl) {
                sessionTimeEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            
            if (sessionWordsEl) {
                sessionWordsEl.textContent = `${this.sessionWordCount} words`;
            }
            
            if (startBtn) startBtn.disabled = true;
            if (endBtn) endBtn.disabled = false;
        } else {
            if (sessionTimeEl) sessionTimeEl.textContent = '00:00';
            if (sessionWordsEl) sessionWordsEl.textContent = '0 words';
            if (startBtn) startBtn.disabled = false;
            if (endBtn) endBtn.disabled = true;
        }
    }

    // === Utility Functions ===
    
    getCurrentWordCount() {
        if (!window.editor || typeof window.editor.getValue !== 'function') {
            return 0;
        }
        
        const content = window.editor.getValue() || '';
        // Simple word count (split by whitespace and filter empty strings)
        return content.trim().split(/\s+/).filter(word => word.length > 0).length;
    }

    getTotalWords() {
        return Object.values(this.dailyStats).reduce((total, day) => total + day.totalWords, 0);
    }

    getTodayKey() {
        return new Date().toISOString().split('T')[0];
    }

    getYesterdayKey() {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday.toISOString().split('T')[0];
    }
    
    // === Progress Tracking Methods ===
    
    getDailyProgress() {
        const today = this.getTodayKey();
        const todayStats = this.dailyStats[today] || { sessions: [], totalWords: 0 };
        
        const todayFlowTime = this.flowState.flowSessions
            .filter(session => new Date(session.startTime).toISOString().split('T')[0] === today)
            .reduce((sum, session) => sum + session.duration, 0);
        
        return {
            words: {
                current: todayStats.totalWords,
                goal: this.goals.daily.words,
                percentage: Math.min(100, Math.round((todayStats.totalWords / this.goals.daily.words) * 100))
            },
            sessions: {
                current: todayStats.sessions.length,
                goal: this.goals.daily.sessions,
                percentage: Math.min(100, Math.round((todayStats.sessions.length / this.goals.daily.sessions) * 100))
            },
            flowTime: {
                current: todayFlowTime,
                goal: this.goals.daily.flowTime,
                percentage: Math.min(100, Math.round((todayFlowTime / this.goals.daily.flowTime) * 100))
            }
        };
    }
    
    getSessionProgress() {
        if (!this.currentSession) {
            return {
                words: { current: 0, goal: this.goals.session.words, percentage: 0 },
                duration: { current: 0, goal: this.goals.session.duration, percentage: 0 }
            };
        }
        
        const sessionDuration = Date.now() - this.sessionStartTime;
        const sessionWords = this.sessionWordCount;
        
        return {
            words: {
                current: sessionWords,
                goal: this.goals.session.words,
                percentage: Math.min(100, Math.round((sessionWords / this.goals.session.words) * 100))
            },
            duration: {
                current: sessionDuration,
                goal: this.goals.session.duration,
                percentage: Math.min(100, Math.round((sessionDuration / this.goals.session.duration) * 100))
            }
        };
    }
    
    getWeeklyProgress() {
        const today = new Date();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
        
        let weeklyWords = 0;
        let weeklySessions = 0;
        let weeklyFlowTime = 0;
        
        // Sum up data for the current week
        for (let i = 0; i < 7; i++) {
            const day = new Date(weekStart);
            day.setDate(weekStart.getDate() + i);
            const dayKey = day.toISOString().split('T')[0];
            
            const dayStats = this.dailyStats[dayKey];
            if (dayStats) {
                weeklyWords += dayStats.totalWords;
                weeklySessions += dayStats.sessions.length;
            }
            
            // Flow time for this day
            weeklyFlowTime += this.flowState.flowSessions
                .filter(session => new Date(session.startTime).toISOString().split('T')[0] === dayKey)
                .reduce((sum, session) => sum + session.duration, 0);
        }
        
        return {
            words: {
                current: weeklyWords,
                goal: this.goals.weekly.words,
                percentage: Math.min(100, Math.round((weeklyWords / this.goals.weekly.words) * 100))
            },
            sessions: {
                current: weeklySessions,
                goal: this.goals.weekly.sessions,
                percentage: Math.min(100, Math.round((weeklySessions / this.goals.weekly.sessions) * 100))
            },
            flowTime: {
                current: weeklyFlowTime,
                goal: this.goals.weekly.flowTime,
                percentage: Math.min(100, Math.round((weeklyFlowTime / this.goals.weekly.flowTime) * 100))
            }
        };
    }

    showSessionSummary(session) {
        const duration = Math.round(session.duration / 60000); // minutes
        const wpm = duration > 0 ? Math.round(session.wordCount / duration) : 0;
        
        this.showNotification(
            `📝 Session complete! ${session.wordCount} words in ${duration} minutes (${wpm} WPM)`,
            'success'
        );
    }

    showFocusSessionSelector() {
        const modalContent = `
            <div class="focus-session-selector" style="padding: 10px;">
                <h3 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 20px; font-weight: 600;">Choose Your Focus Session</h3>
                <p style="margin: 0 0 20px 0; color: #7f8c8d; font-size: 14px; line-height: 1.4;">Select a duration based on your current energy and task complexity:</p>
                <div class="session-options" style="display: grid; gap: 15px;">
                    <div class="session-option" onclick="window.gamificationInstance.startFocusSession(15*60000); window.gamificationInstance.closeModal();" style="
                        padding: 20px;
                        border: 2px solid #ecf0f1;
                        border-radius: 12px;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                    " onmouseover="this.style.borderColor='#9b59b6'; this.style.background='linear-gradient(135deg, #f4f1ff 0%, #e8e1ff 100%)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(155, 89, 182, 0.2)';" onmouseout="this.style.borderColor='#ecf0f1'; this.style.background='linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)'; this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                        <div class="session-duration" style="font-size: 24px; font-weight: bold; color: #2c3e50; margin-bottom: 5px;">⏱️ 15 Minutes</div>
                        <div class="session-type" style="font-size: 16px; font-weight: 600; color: #9b59b6; margin-bottom: 8px;">Quick Sprint</div>
                        <div class="session-description" style="font-size: 13px; color: #7f8c8d; line-height: 1.4;">Perfect for quick edits, brainstorming, or when you have limited time</div>
                    </div>
                    <div class="session-option" onclick="window.gamificationInstance.startFocusSession(25*60000); window.gamificationInstance.closeModal();" style="
                        padding: 20px;
                        border: 2px solid #3498db;
                        border-radius: 12px;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        background: linear-gradient(135deg, #ebf5ff 0%, #d6ebff 100%);
                        position: relative;
                    " onmouseover="this.style.borderColor='#2980b9'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(52, 152, 219, 0.3)';" onmouseout="this.style.borderColor='#3498db'; this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                        <span style="position: absolute; top: 10px; right: 10px; background: #e74c3c; color: white; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: bold;">RECOMMENDED</span>
                        <div class="session-duration" style="font-size: 24px; font-weight: bold; color: #2c3e50; margin-bottom: 5px;">🍅 25 Minutes</div>
                        <div class="session-type" style="font-size: 16px; font-weight: 600; color: #3498db; margin-bottom: 8px;">Classic Pomodoro</div>
                        <div class="session-description" style="font-size: 13px; color: #7f8c8d; line-height: 1.4;">Ideal for most writing tasks. Research-backed for optimal focus</div>
                    </div>
                    <div class="session-option" onclick="window.gamificationInstance.startFocusSession(45*60000); window.gamificationInstance.closeModal();" style="
                        padding: 20px;
                        border: 2px solid #ecf0f1;
                        border-radius: 12px;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                    " onmouseover="this.style.borderColor='#9b59b6'; this.style.background='linear-gradient(135deg, #f4f1ff 0%, #e8e1ff 100%)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(155, 89, 182, 0.2)';" onmouseout="this.style.borderColor='#ecf0f1'; this.style.background='linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)'; this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                        <div class="session-duration" style="font-size: 24px; font-weight: bold; color: #2c3e50; margin-bottom: 5px;">🎯 45 Minutes</div>
                        <div class="session-type" style="font-size: 16px; font-weight: 600; color: #9b59b6; margin-bottom: 8px;">Deep Work</div>
                        <div class="session-description" style="font-size: 13px; color: #7f8c8d; line-height: 1.4;">For complex writing, analysis, or when you're in flow state</div>
                    </div>
                    <div class="session-option" onclick="window.gamificationInstance.startFocusSession(90*60000); window.gamificationInstance.closeModal();" style="
                        padding: 20px;
                        border: 2px solid #ecf0f1;
                        border-radius: 12px;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                    " onmouseover="this.style.borderColor='#9b59b6'; this.style.background='linear-gradient(135deg, #f4f1ff 0%, #e8e1ff 100%)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(155, 89, 182, 0.2)';" onmouseout="this.style.borderColor='#ecf0f1'; this.style.background='linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)'; this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                        <div class="session-duration" style="font-size: 24px; font-weight: bold; color: #2c3e50; margin-bottom: 5px;">🏃 90 Minutes</div>
                        <div class="session-type" style="font-size: 16px; font-weight: 600; color: #9b59b6; margin-bottom: 8px;">Marathon Session</div>
                        <div class="session-description" style="font-size: 13px; color: #7f8c8d; line-height: 1.4;">Ultimate focus for major writing projects and dissertations</div>
                    </div>
                </div>
            </div>
        `;
        
        this.showModal('🎯 Focus Session', modalContent);
    }
    
    showBreakModal(title, message, onAccept) {
        const modalContent = `
            <div class="break-modal">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="break-suggestions">
                    <h4>Suggested break activities:</h4>
                    <ul>
                        <li>🚶 Take a short walk</li>
                        <li>💧 Drink some water</li>
                        <li>🤸 Do some stretches</li>
                        <li>👀 Look away from the screen</li>
                        <li>🧘 Practice deep breathing</li>
                    </ul>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="window.gamificationInstance.closeModal(); (${onAccept.toString()})()">Take Break</button>
                    <button class="btn btn-secondary" onclick="window.gamificationInstance.closeModal()">Skip Break</button>
                </div>
            </div>
        `;
        
        this.showModal('Break Time', modalContent);
    }
    
    closeModal() {
        const modal = document.querySelector('.gamification-modal-overlay');
        if (modal) {
            document.body.removeChild(modal);
        }
    }

    showStatsModal() {
        const totalWords = this.getTotalWords();
        const totalSessions = Object.values(this.dailyStats).reduce((total, day) => total + day.sessions.length, 0);
        const longestStreak = this.streakData.longestStreak || 0;
        const achievementCount = Object.keys(this.achievements).length;
        const totalPoints = this.rewards.totalPoints || 0;
        const badgeCount = this.rewards.badges ? Object.keys(this.rewards.badges).length : 0;
        
        // Flow statistics
        const flowSessions = this.flowState.flowSessions;
        const totalFlowTime = flowSessions.reduce((sum, s) => sum + s.duration, 0);
        const longestFlowSession = Math.max(...flowSessions.map(s => s.duration), 0);
        const averageFlowQuality = flowSessions.length > 0 ? 
            flowSessions.reduce((sum, s) => sum + s.quality, 0) / flowSessions.length : 0;
        
        const modalContent = `
            <div class="gamification-stats" style="padding: 10px;">
                <h3 style="margin: 0 0 20px 0; color: #2c3e50; font-size: 20px; font-weight: 600; border-bottom: 2px solid #9b59b6; padding-bottom: 10px;">📊 Writing Statistics</h3>
                <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin-bottom: 30px;">
                    <div class="stat-item" style="
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        border-radius: 12px;
                        padding: 20px;
                        text-align: center;
                        transition: transform 0.2s ease, box-shadow 0.2s ease;
                        color: white;
                    " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 10px 25px rgba(102, 126, 234, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                        <div class="stat-value" style="font-size: 32px; font-weight: bold; margin-bottom: 4px;">📝 ${totalWords.toLocaleString()}</div>
                        <div class="stat-label" style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; opacity: 0.9;">Total Words</div>
                    </div>
                    <div class="stat-item" style="
                        background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
                        border-radius: 12px;
                        padding: 20px;
                        text-align: center;
                        transition: transform 0.2s ease, box-shadow 0.2s ease;
                        color: white;
                    " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 10px 25px rgba(255, 107, 53, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                        <div class="stat-value" style="font-size: 32px; font-weight: bold; margin-bottom: 4px;">🔥 ${this.streakData.currentStreak || 0}</div>
                        <div class="stat-label" style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; opacity: 0.9;">Current Streak</div>
                    </div>
                    <div class="stat-item" style="
                        background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
                        border-radius: 12px;
                        padding: 20px;
                        text-align: center;
                        transition: transform 0.2s ease, box-shadow 0.2s ease;
                        color: white;
                    " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 10px 25px rgba(52, 152, 219, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                        <div class="stat-value" style="font-size: 32px; font-weight: bold; margin-bottom: 4px;">🏆 ${longestStreak}</div>
                        <div class="stat-label" style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; opacity: 0.9;">Best Streak</div>
                    </div>
                    <div class="stat-item" style="
                        background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
                        border-radius: 12px;
                        padding: 20px;
                        text-align: center;
                        transition: transform 0.2s ease, box-shadow 0.2s ease;
                        color: white;
                    " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 10px 25px rgba(39, 174, 96, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                        <div class="stat-value" style="font-size: 32px; font-weight: bold; margin-bottom: 4px;">📅 ${totalSessions}</div>
                        <div class="stat-label" style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; opacity: 0.9;">Sessions</div>
                    </div>
                    <div class="stat-item" style="
                        background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
                        border-radius: 12px;
                        padding: 20px;
                        text-align: center;
                        transition: transform 0.2s ease, box-shadow 0.2s ease;
                        color: white;
                    " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 10px 25px rgba(243, 156, 18, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                        <div class="stat-value" style="font-size: 32px; font-weight: bold; margin-bottom: 4px;">💰 ${totalPoints.toLocaleString()}</div>
                        <div class="stat-label" style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; opacity: 0.9;">Points</div>
                    </div>
                    <div class="stat-item" style="
                        background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
                        border-radius: 12px;
                        padding: 20px;
                        text-align: center;
                        transition: transform 0.2s ease, box-shadow 0.2s ease;
                        color: white;
                    " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 10px 25px rgba(231, 76, 60, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                        <div class="stat-value" style="font-size: 32px; font-weight: bold; margin-bottom: 4px;">🎖️ ${badgeCount}</div>
                        <div class="stat-label" style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; opacity: 0.9;">Badges</div>
                    </div>
                    <div class="stat-item" style="
                        background: linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%);
                        border-radius: 12px;
                        padding: 20px;
                        text-align: center;
                        transition: transform 0.2s ease, box-shadow 0.2s ease;
                        color: white;
                    " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 10px 25px rgba(155, 89, 182, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                        <div class="stat-value" style="font-size: 32px; font-weight: bold; margin-bottom: 4px;">⭐ L${this.xpSystem.currentLevel}</div>
                        <div class="stat-label" style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; opacity: 0.9;">Level</div>
                    </div>
                    <div class="stat-item" style="
                        background: linear-gradient(135deg, #16a085 0%, #27ae60 100%);
                        border-radius: 12px;
                        padding: 20px;
                        text-align: center;
                        transition: transform 0.2s ease, box-shadow 0.2s ease;
                        color: white;
                    " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 10px 25px rgba(22, 160, 133, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                        <div class="stat-value" style="font-size: 32px; font-weight: bold; margin-bottom: 4px;">✨ ${this.xpSystem.currentXP.toLocaleString()}</div>
                        <div class="stat-label" style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; opacity: 0.9;">Experience</div>
                    </div>
                </div>
                
                <h3 style="margin: 30px 0 20px 0; color: #2c3e50; font-size: 18px; font-weight: 600; border-bottom: 2px solid #9b59b6; padding-bottom: 10px;">⭐ Level Progression</h3>
                <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 12px; padding: 24px; margin-bottom: 30px; border: 1px solid #dee2e6;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <div>
                            <div style="font-size: 24px; font-weight: bold; color: #2c3e50;">Level ${this.xpSystem.currentLevel}</div>
                            <div style="font-size: 16px; color: #9b59b6; font-weight: 600;">${this.xpSystem.levelDefinitions[this.xpSystem.currentLevel].title}</div>
                            <div style="font-size: 14px; color: #7f8c8d; margin-top: 4px;">${this.xpSystem.levelDefinitions[this.xpSystem.currentLevel].description}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 18px; font-weight: bold; color: #27ae60;">${this.xpSystem.currentXP.toLocaleString()} XP</div>
                            ${this.xpSystem.currentLevel < 12 ? `
                                <div style="font-size: 12px; color: #7f8c8d;">${(this.getXPForNextLevel() - this.xpSystem.currentXP).toLocaleString()} XP to level ${this.xpSystem.currentLevel + 1}</div>
                            ` : `
                                <div style="font-size: 12px; color: #f39c12; font-weight: bold;">MAX LEVEL REACHED!</div>
                            `}
                        </div>
                    </div>
                    ${this.xpSystem.currentLevel < 12 ? `
                        <div style="margin-bottom: 12px;">
                            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #7f8c8d; margin-bottom: 4px;">
                                <span>Level ${this.xpSystem.currentLevel}</span>
                                <span>Level ${this.xpSystem.currentLevel + 1}</span>
                            </div>
                            <div style="width: 100%; height: 8px; background: #ecf0f1; border-radius: 4px; overflow: hidden;">
                                <div style="width: ${this.getProgressToNextLevel() * 100}%; height: 100%; background: linear-gradient(90deg, #9b59b6, #8e44ad); transition: width 0.3s ease;"></div>
                            </div>
                        </div>
                    ` : ''}
                    ${this.xpSystem.levelDefinitions[this.xpSystem.currentLevel].rewards.length > 0 ? `
                        <div style="margin-top: 16px;">
                            <div style="font-size: 14px; font-weight: 600; color: #2c3e50; margin-bottom: 8px;">🎁 Level Rewards:</div>
                            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #27ae60;">
                                ${this.xpSystem.levelDefinitions[this.xpSystem.currentLevel].rewards.map(reward => `<li>${reward}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
                
                <h3 style="margin: 30px 0 20px 0; color: #2c3e50; font-size: 18px; font-weight: 600; border-bottom: 2px solid #667eea; padding-bottom: 10px;">🌊 Flow State Statistics</h3>
                <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin-bottom: 30px;">
                    <div class="stat-item" style="
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        border-radius: 12px;
                        padding: 20px;
                        text-align: center;
                        transition: transform 0.2s ease, box-shadow 0.2s ease;
                        color: white;
                    " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 10px 25px rgba(102, 126, 234, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                        <div class="stat-value" style="font-size: 32px; font-weight: bold; margin-bottom: 4px;">🌊 ${flowSessions.length}</div>
                        <div class="stat-label" style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; opacity: 0.9;">Flow Sessions</div>
                    </div>
                    <div class="stat-item" style="
                        background: linear-gradient(135deg, #8e44ad 0%, #9b59b6 100%);
                        border-radius: 12px;
                        padding: 20px;
                        text-align: center;
                        transition: transform 0.2s ease, box-shadow 0.2s ease;
                        color: white;
                    " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 10px 25px rgba(142, 68, 173, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                        <div class="stat-value" style="font-size: 32px; font-weight: bold; margin-bottom: 4px;">⏰ ${Math.round(totalFlowTime / 60000)}m</div>
                        <div class="stat-label" style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; opacity: 0.9;">Total Flow Time</div>
                    </div>
                    <div class="stat-item" style="
                        background: linear-gradient(135deg, #34495e 0%, #2c3e50 100%);
                        border-radius: 12px;
                        padding: 20px;
                        text-align: center;
                        transition: transform 0.2s ease, box-shadow 0.2s ease;
                        color: white;
                    " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 10px 25px rgba(52, 73, 94, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                        <div class="stat-value" style="font-size: 32px; font-weight: bold; margin-bottom: 4px;">🏆 ${Math.round(longestFlowSession / 60000)}m</div>
                        <div class="stat-label" style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; opacity: 0.9;">Longest Flow</div>
                    </div>
                    <div class="stat-item" style="
                        background: linear-gradient(135deg, #16a085 0%, #1abc9c 100%);
                        border-radius: 12px;
                        padding: 20px;
                        text-align: center;
                        transition: transform 0.2s ease, box-shadow 0.2s ease;
                        color: white;
                    " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 10px 25px rgba(22, 160, 133, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                        <div class="stat-value" style="font-size: 32px; font-weight: bold; margin-bottom: 4px;">✨ ${Math.round(averageFlowQuality * 100)}%</div>
                        <div class="stat-label" style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; opacity: 0.9;">Avg Quality</div>
                    </div>
                </div>
                <div class="recent-achievements" style="margin-bottom: 20px;">
                    <h4 style="margin-bottom: 16px; color: #2c3e50; font-size: 16px; border-bottom: 2px solid #f39c12; padding-bottom: 8px;">🏆 Recent Achievements</h4>
                    ${this.getRecentAchievementsHTMLStyled()}
                </div>
                <div class="recent-badges" style="margin-bottom: 10px;">
                    <h4 style="margin-bottom: 16px; color: #2c3e50; font-size: 16px; border-bottom: 2px solid #3498db; padding-bottom: 8px;">🎖️ Recent Badges</h4>
                    ${this.getRecentBadgesHTMLStyled()}
                </div>
            </div>
        `;
        
        // Show in a simple modal (you might want to integrate with existing modal system)
        this.showModal('📊 Writing Statistics', modalContent);
    }
    
    showGoalsModal() {
        const goals = this.goals;
        
        const modalContent = `
            <div class="goals-customization" style="padding: 10px;">
                <h3 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 20px; font-weight: 600;">🎯 Customize Your Goals</h3>
                <p style="margin: 0 0 20px 0; color: #7f8c8d; font-size: 14px; line-height: 1.4;">Set personalized targets to stay motivated and track your progress effectively.</p>
                
                <div class="goals-sections" style="display: flex; flex-direction: column; gap: 20px;">
                    
                    <!-- Daily Goals -->
                    <div class="goal-section" style="
                        padding: 20px;
                        border: 2px solid #3498db;
                        border-radius: 12px;
                        background: linear-gradient(135deg, #ebf5ff 0%, #d6ebff 100%);
                    ">
                        <h4 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                            📅 Daily Goals
                        </h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                            <div>
                                <label style="display: block; color: #2c3e50; font-size: 12px; font-weight: 500; margin-bottom: 5px;">Words per day</label>
                                <input type="number" id="daily-words" value="${goals.daily.words}" min="50" max="5000" step="50" style="
                                    width: 100%;
                                    padding: 8px 12px;
                                    border: 1px solid #bdc3c7;
                                    border-radius: 6px;
                                    font-size: 14px;
                                    box-sizing: border-box;
                                ">
                            </div>
                            <div>
                                <label style="display: block; color: #2c3e50; font-size: 12px; font-weight: 500; margin-bottom: 5px;">Sessions per day</label>
                                <input type="number" id="daily-sessions" value="${goals.daily.sessions}" min="1" max="10" step="1" style="
                                    width: 100%;
                                    padding: 8px 12px;
                                    border: 1px solid #bdc3c7;
                                    border-radius: 6px;
                                    font-size: 14px;
                                    box-sizing: border-box;
                                ">
                            </div>
                            <div>
                                <label style="display: block; color: #2c3e50; font-size: 12px; font-weight: 500; margin-bottom: 5px;">Flow time (minutes)</label>
                                <input type="number" id="daily-flow" value="${Math.round(goals.daily.flowTime / 60000)}" min="5" max="180" step="5" style="
                                    width: 100%;
                                    padding: 8px 12px;
                                    border: 1px solid #bdc3c7;
                                    border-radius: 6px;
                                    font-size: 14px;
                                    box-sizing: border-box;
                                ">
                            </div>
                        </div>
                    </div>
                    
                    <!-- Session Goals -->
                    <div class="goal-section" style="
                        padding: 20px;
                        border: 2px solid #27ae60;
                        border-radius: 12px;
                        background: linear-gradient(135deg, #eafaf1 0%, #d5f4e6 100%);
                    ">
                        <h4 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                            ✍️ Session Goals
                        </h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                            <div>
                                <label style="display: block; color: #2c3e50; font-size: 12px; font-weight: 500; margin-bottom: 5px;">Words per session</label>
                                <input type="number" id="session-words" value="${goals.session.words}" min="25" max="1000" step="25" style="
                                    width: 100%;
                                    padding: 8px 12px;
                                    border: 1px solid #bdc3c7;
                                    border-radius: 6px;
                                    font-size: 14px;
                                    box-sizing: border-box;
                                ">
                            </div>
                            <div>
                                <label style="display: block; color: #2c3e50; font-size: 12px; font-weight: 500; margin-bottom: 5px;">Duration (minutes)</label>
                                <input type="number" id="session-duration" value="${Math.round(goals.session.duration / 60000)}" min="10" max="120" step="5" style="
                                    width: 100%;
                                    padding: 8px 12px;
                                    border: 1px solid #bdc3c7;
                                    border-radius: 6px;
                                    font-size: 14px;
                                    box-sizing: border-box;
                                ">
                            </div>
                        </div>
                    </div>
                    
                    <!-- Weekly Goals -->
                    <div class="goal-section" style="
                        padding: 20px;
                        border: 2px solid #8e44ad;
                        border-radius: 12px;
                        background: linear-gradient(135deg, #f4f1ff 0%, #e8e1ff 100%);
                    ">
                        <h4 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                            📊 Weekly Goals
                        </h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                            <div>
                                <label style="display: block; color: #2c3e50; font-size: 12px; font-weight: 500; margin-bottom: 5px;">Words per week</label>
                                <input type="number" id="weekly-words" value="${goals.weekly.words}" min="500" max="25000" step="500" style="
                                    width: 100%;
                                    padding: 8px 12px;
                                    border: 1px solid #bdc3c7;
                                    border-radius: 6px;
                                    font-size: 14px;
                                    box-sizing: border-box;
                                ">
                            </div>
                            <div>
                                <label style="display: block; color: #2c3e50; font-size: 12px; font-weight: 500; margin-bottom: 5px;">Sessions per week</label>
                                <input type="number" id="weekly-sessions" value="${goals.weekly.sessions}" min="3" max="50" step="1" style="
                                    width: 100%;
                                    padding: 8px 12px;
                                    border: 1px solid #bdc3c7;
                                    border-radius: 6px;
                                    font-size: 14px;
                                    box-sizing: border-box;
                                ">
                            </div>
                            <div>
                                <label style="display: block; color: #2c3e50; font-size: 12px; font-weight: 500; margin-bottom: 5px;">Flow time (hours)</label>
                                <input type="number" id="weekly-flow" value="${Math.round(goals.weekly.flowTime / 3600000)}" min="1" max="20" step="0.5" style="
                                    width: 100%;
                                    padding: 8px 12px;
                                    border: 1px solid #bdc3c7;
                                    border-radius: 6px;
                                    font-size: 14px;
                                    box-sizing: border-box;
                                ">
                            </div>
                        </div>
                    </div>
                    
                </div>
                
                <div class="goal-presets" style="margin-top: 25px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                    <h4 style="margin: 0 0 10px 0; color: #2c3e50; font-size: 14px; font-weight: 600;">Quick Presets:</h4>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="window.gamificationInstance.applyGoalPreset('beginner')" style="
                            padding: 6px 12px;
                            border: 1px solid #95a5a6;
                            background: white;
                            color: #2c3e50;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                            font-weight: 500;
                        ">🌱 Beginner</button>
                        <button onclick="window.gamificationInstance.applyGoalPreset('intermediate')" style="
                            padding: 6px 12px;
                            border: 1px solid #95a5a6;
                            background: white;
                            color: #2c3e50;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                            font-weight: 500;
                        ">📚 Intermediate</button>
                        <button onclick="window.gamificationInstance.applyGoalPreset('advanced')" style="
                            padding: 6px 12px;
                            border: 1px solid #95a5a6;
                            background: white;
                            color: #2c3e50;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                            font-weight: 500;
                        ">🚀 Advanced</button>
                        <button onclick="window.gamificationInstance.applyGoalPreset('academic')" style="
                            padding: 6px 12px;
                            border: 1px solid #95a5a6;
                            background: white;
                            color: #2c3e50;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                            font-weight: 500;
                        ">🎓 Academic</button>
                    </div>
                </div>
                
                <div style="margin-top: 20px; display: flex; justify-content: space-between; align-items: center;">
                    <p style="margin: 0; color: #7f8c8d; font-size: 12px;">
                        💡 Tip: Start with achievable goals and increase them gradually as you build momentum.
                    </p>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="window.gamificationInstance.closeModal()" style="
                            padding: 8px 16px;
                            border: 1px solid #95a5a6;
                            background: white;
                            color: #2c3e50;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                        ">Cancel</button>
                        <button onclick="window.gamificationInstance.saveCustomGoals()" style="
                            padding: 8px 16px;
                            border: none;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 500;
                        ">Save Goals</button>
                    </div>
                </div>
            </div>
        `;
        
        this.showModal('🎯 Goal Customization', modalContent);
    }

    getRecentAchievementsHTMLStyled() {
        const recentAchievements = Object.values(this.achievements)
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 5);
        
        if (recentAchievements.length === 0) {
            return '<p style="color: #7f8c8d; font-style: italic; padding: 20px; text-align: center; background: #f8f9fa; border-radius: 8px;">No achievements yet. Keep writing to unlock them!</p>';
        }
        
        return recentAchievements.map(achievement => `
            <div class="achievement-item" style="
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                background: linear-gradient(135deg, #fff9e6 0%, #ffeaa7 100%);
                border-radius: 8px;
                margin-bottom: 8px;
                border-left: 4px solid #f39c12;
                transition: transform 0.2s ease;
            " onmouseover="this.style.transform='translateX(5px)';" onmouseout="this.style.transform='translateX(0)';">
                <span class="achievement-icon" style="font-size: 24px; flex-shrink: 0;">🏆</span>
                <div class="achievement-info" style="flex: 1;">
                    <div class="achievement-title" style="font-weight: bold; color: #2c3e50; font-size: 14px; margin-bottom: 2px;">${achievement.title}</div>
                    <div class="achievement-description" style="font-size: 12px; color: #7f8c8d; line-height: 1.3;">${achievement.description}</div>
                </div>
            </div>
        `).join('');
    }

    getRecentBadgesHTMLStyled() {
        if (!this.rewards.badges) {
            return '<p style="color: #7f8c8d; font-style: italic; padding: 20px; text-align: center; background: #f8f9fa; border-radius: 8px;">No badges earned yet. Complete focus sessions to earn them!</p>';
        }
        
        const recentBadges = Object.values(this.rewards.badges)
            .sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt))
            .slice(0, 3);
        
        if (recentBadges.length === 0) {
            return '<p style="color: #7f8c8d; font-style: italic; padding: 20px; text-align: center; background: #f8f9fa; border-radius: 8px;">No badges earned yet. Complete focus sessions to earn them!</p>';
        }
        
        return recentBadges.map(badge => `
            <div class="badge-item" style="
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                background: linear-gradient(135deg, #e8f4ff 0%, #d1ecf1 100%);
                border-radius: 8px;
                margin-bottom: 8px;
                border-left: 4px solid #3498db;
                transition: transform 0.2s ease;
            " onmouseover="this.style.transform='translateX(5px)';" onmouseout="this.style.transform='translateX(0)';">
                <span class="badge-icon" style="font-size: 24px; flex-shrink: 0;">🎖️</span>
                <div class="badge-info" style="flex: 1;">
                    <div class="badge-title" style="font-weight: bold; color: #2c3e50; font-size: 14px; margin-bottom: 2px;">${badge.name}</div>
                    <div class="badge-description" style="font-size: 12px; color: #7f8c8d; line-height: 1.3;">${badge.description}</div>
                </div>
            </div>
        `).join('');
    }

    getRecentAchievementsHTML() {
        const recentAchievements = Object.values(this.achievements)
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 5);
        
        if (recentAchievements.length === 0) {
            return '<p>No achievements yet. Keep writing!</p>';
        }
        
        return recentAchievements.map(achievement => `
            <div class="achievement-item">
                <span class="achievement-icon">🏆</span>
                <div class="achievement-info">
                    <div class="achievement-title">${achievement.title}</div>
                    <div class="achievement-description">${achievement.description}</div>
                </div>
            </div>
        `).join('');
    }

    showModal(title, content) {
        console.log('[Gamification] showModal called with title:', title);
        
        // Remove any existing modals first
        const existingModals = document.querySelectorAll('.gamification-modal-overlay');
        existingModals.forEach(modal => modal.remove());
        
        // Simple modal implementation - integrate with existing modal system if available
        const modal = document.createElement('div');
        modal.className = 'gamification-modal-overlay';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        modal.innerHTML = `
            <div class="gamification-modal" style="
                background: white;
                border-radius: 12px;
                width: 90%;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            ">
                <div class="modal-header" style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 20px 24px;
                    border-bottom: 1px solid #eee;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border-radius: 12px 12px 0 0;
                ">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600;">${title}</h3>
                    <button class="modal-close" style="
                        background: none;
                        border: none;
                        color: white;
                        font-size: 24px;
                        cursor: pointer;
                        padding: 0;
                        width: 30px;
                        height: 30px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 50%;
                        transition: background 0.2s ease;
                    ">&times;</button>
                </div>
                <div class="modal-content" style="padding: 24px;">
                    ${content}
                </div>
            </div>
        `;
        
        console.log('[Gamification] Modal element created, appending to body');
        document.body.appendChild(modal);
        console.log('[Gamification] Modal appended, should be visible now');
        
        // Close modal handlers
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                console.log('[Gamification] Close button clicked');
                this.closeModal();
            });
        }
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                console.log('[Gamification] Modal overlay clicked');
                this.closeModal();
            }
        });
        
        // Store reference for closeModal function
        this.currentModal = modal;
    }

    closeModal() {
        console.log('[Gamification] closeModal called');
        if (this.currentModal) {
            this.currentModal.remove();
            this.currentModal = null;
        } else {
            // Fallback: remove any gamification modals
            const modals = document.querySelectorAll('.gamification-modal-overlay');
            modals.forEach(modal => modal.remove());
        }
    }

    showNotification(message, type = 'info') {
        // Use existing notification system if available
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            console.log(`[Gamification] ${type.toUpperCase()}: ${message}`);
        }
    }

    // === Data Persistence ===
    
    loadDailyStats() {
        const stored = localStorage.getItem('gamification_daily_stats');
        return stored ? JSON.parse(stored) : {};
    }

    saveDailyStats() {
        localStorage.setItem('gamification_daily_stats', JSON.stringify(this.dailyStats));
    }

    loadStreakData() {
        const stored = localStorage.getItem('gamification_streak_data');
        return stored ? JSON.parse(stored) : {
            currentStreak: 0,
            longestStreak: 0,
            lastWritingDay: null
        };
    }

    saveStreakData() {
        localStorage.setItem('gamification_streak_data', JSON.stringify(this.streakData));
    }

    loadAchievements() {
        const stored = localStorage.getItem('gamification_achievements');
        return stored ? JSON.parse(stored) : {};
    }

    saveAchievements() {
        localStorage.setItem('gamification_achievements', JSON.stringify(this.achievements));
    }

    // === Collaborative Challenges Integration ===
    
    initializeChallenges() {
        // Initialize collaborative challenges if not already done
        if (typeof CollaborativeChallenges !== 'undefined' && !this.collaborativeChallenges) {
            this.collaborativeChallenges = new CollaborativeChallenges(this);
            
            // Initialize UI
            if (typeof ChallengesUI !== 'undefined' && !this.challengesUI) {
                this.challengesUI = new ChallengesUI(this.collaborativeChallenges, this);
                // Make available globally for event handlers
                window.challengesUI = this.challengesUI;
            }
            
            console.log('[Gamification] Collaborative challenges initialized');
        }
    }
    
    updateChallengeProgress() {
        // Update collaborative challenges with current session data
        if (this.collaborativeChallenges) {
            this.collaborativeChallenges.updateFromGamificationProgress();
        }
        
        if (this.challengesUI) {
            this.challengesUI.updateProgressFromGamification();
        }
    }
    
    initializeAICompanion() {
        // Check if AI Writing Companion is enabled in settings
        const settings = window.appSettings || {};
        const aiEnabled = settings.ai?.enableWritingCompanion !== false; // Default to enabled
        
        if (!aiEnabled) {
            console.log('[Gamification] AI Writing Companion disabled in settings');
            return;
        }
        
        // Initialize AI Writing Companion if available
        console.log('[Gamification] Checking AICompanionManager availability:', {
            AICompanionManagerExists: typeof AICompanionManager !== 'undefined',
            currentCompanion: !!this.aiCompanion
        });
        
        // Check for existing global AI companion first to prevent duplicates
        const existingCompanion = window.aiCompanionManager || window.globalAICompanion;
        
        if (existingCompanion) {
            console.log('[Gamification] Using existing global AICompanionManager to prevent duplicates');
            this.aiCompanion = existingCompanion;
        } else if (typeof AICompanionManager !== 'undefined' && !this.aiCompanion) {
            console.log('[Gamification] Creating new AICompanionManager instance...');
            this.aiCompanion = new AICompanionManager(this);
            console.log('[Gamification] AICompanionManager created successfully');
            
            // Make it globally available to prevent other systems from creating duplicates
            window.aiCompanionManager = this.aiCompanion;
            
            // DISABLED: AI Flow Detection (duplicate system using file-based text extraction)
            // Keep only AI Writing Companion which uses real-time typing capture
            // if (typeof AIFlowDetection !== 'undefined' && !this.aiFlowDetection) {
            //     this.aiFlowDetection = new AIFlowDetection(this.aiCompanion, this);
            // }
            
            // Make available globally for debugging
            window.aiCompanion = this.aiCompanion;
            console.log('[Gamification] Set window.aiCompanion:', {
                exists: !!window.aiCompanion,
                hasHandleKeyboardInvocation: !!(window.aiCompanion && typeof window.aiCompanion.handleKeyboardInvocation === 'function'),
                methods: window.aiCompanion ? Object.getOwnPropertyNames(Object.getPrototypeOf(window.aiCompanion)).filter(name => typeof window.aiCompanion[name] === 'function') : []
            });
            // if (this.aiFlowDetection) {
            //     window.aiFlowDetection = this.aiFlowDetection;
            // }
            
            // Add global usage report function
            window.getAIUsageReport = () => {
                if (this.aiCompanion) {
                    const report = this.aiCompanion.getUsageReport();
                    console.log('=== AI Writing Companion Usage Report ===');
                    console.log('Total Actions:', report.totalActions);
                    console.log('Action Breakdown:', report.actionBreakdown);
                    console.log('Recent Activity:', report.recentLogs);
                    console.log('Session ID:', report.sessionId);
                    console.log('==========================================');
                    return report;
                } else {
                    console.log('AI Writing Companion not initialized');
                    return null;
                }
            };
            
            console.log('[Gamification] AI Writing Companion initialized');
        } else {
            console.warn('[Gamification] AICompanionManager not available or already initialized:', {
                AICompanionManagerExists: typeof AICompanionManager !== 'undefined',
                alreadyHasCompanion: !!this.aiCompanion
            });
        }
    }
    
    initializeTodoGamification() {
        // Initialize TODO Gamification system
        if (typeof TodoGamification !== 'undefined' && !this.todoGamification) {
            this.todoGamification = new TodoGamification(this);
            
            // Make available globally for debugging
            window.todoGamification = this.todoGamification;
            
            console.log('[Gamification] TODO Gamification initialized');
        }
    }

    // === Additional Helper Methods ===
    
    getRecentBadgesHTML() {
        if (!this.rewards.badges) {
            return '<p>No badges earned yet. Keep writing to unlock them!</p>';
        }
        
        const recentBadges = Object.values(this.rewards.badges)
            .sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt))
            .slice(0, 3);
        
        if (recentBadges.length === 0) {
            return '<p>No badges earned yet. Keep writing to unlock them!</p>';
        }
        
        return recentBadges.map(badge => `
            <div class="badge-item">
                <span class="badge-icon">🏆</span>
                <div class="badge-info">
                    <div class="badge-title">${badge.name}</div>
                    <div class="badge-description">${badge.description}</div>
                </div>
            </div>
        `).join('');
    }
    
    loadFocusSettings() {
        const stored = localStorage.getItem('gamification_focus_settings');
        return stored ? JSON.parse(stored) : {
            defaultDuration: 25 * 60000, // 25 minutes default
            breakDuration: 5 * 60000, // 5 minutes break
            longBreakInterval: 4, // Every 4 sessions
            longBreakDuration: 15 * 60000, // 15 minutes long break
            soundEnabled: true,
            notificationsEnabled: true
        };
    }
    
    saveFocusSettings() {
        localStorage.setItem('gamification_focus_settings', JSON.stringify(this.focusSettings));
    }
    
    loadRewards() {
        const stored = localStorage.getItem('gamification_rewards');
        return stored ? JSON.parse(stored) : {
            totalPoints: 0,
            badges: {},
            customRewards: []
        };
    }
    
    saveRewards() {
        localStorage.setItem('gamification_rewards', JSON.stringify(this.rewards));
    }
    
    loadFlowSessions() {
        const stored = localStorage.getItem('gamification_flow_sessions');
        if (stored) {
            this.flowState.flowSessions = JSON.parse(stored);
        }
    }
    
    saveFlowSessions() {
        localStorage.setItem('gamification_flow_sessions', JSON.stringify(this.flowState.flowSessions));
    }
    
    loadGoals() {
        const stored = localStorage.getItem('gamification_goals');
        if (stored) {
            return JSON.parse(stored);
        }
        return {
            daily: {
                words: 500,
                sessions: 2,
                flowTime: 15 * 60000 // 15 minutes
            },
            weekly: {
                words: 3500,
                sessions: 10,
                flowTime: 2 * 60 * 60000 // 2 hours
            },
            session: {
                words: 250,
                duration: 25 * 60000 // 25 minutes
            }
        };
    }
    
    saveGoals() {
        localStorage.setItem('gamification_goals', JSON.stringify(this.goals));
    }
    
    saveFocusSession(session) {
        const today = this.getTodayKey();
        
        if (!this.dailyStats[today]) {
            this.dailyStats[today] = {
                date: today,
                sessions: [],
                focusSessions: [],
                totalWords: 0,
                totalDuration: 0,
                longestSession: 0,
                avgWordsPerMinute: 0
            };
        }
        
        if (!this.dailyStats[today].focusSessions) {
            this.dailyStats[today].focusSessions = [];
        }
        
        this.dailyStats[today].focusSessions.push(session);
        this.saveDailyStats();
        
        console.log('[Gamification] Focus session saved:', session.id);
    }
    
    // === Level/XP Progression System ===
    
    initializeXPSystem() {
        console.log('[Gamification] Initializing XP system...');
        this.xpSystem.currentLevel = this.calculateLevel();
        this.updateXPDisplay();
    }
    
    getLevelDefinitions() {
        return {
            1: { title: "Novice Writer", xpRequired: 0, description: "Just starting your academic journey", rewards: [] },
            2: { title: "Apprentice Scribe", xpRequired: 500, description: "Learning the fundamentals", rewards: ["Custom theme unlock"] },
            3: { title: "Dedicated Scholar", xpRequired: 1500, description: "Building consistency", rewards: ["Extended focus sessions"] },
            4: { title: "Focused Researcher", xpRequired: 3000, description: "Mastering concentration", rewards: ["Advanced analytics"] },
            5: { title: "Prolific Author", xpRequired: 5500, description: "High output writer", rewards: ["Goal customization"] },
            6: { title: "Flow Master", xpRequired: 9000, description: "Achieving regular flow states", rewards: ["Flow state alerts"] },
            7: { title: "Academic Expert", xpRequired: 14000, description: "Expert-level productivity", rewards: ["Collaboration features"] },
            8: { title: "Publishing Scholar", xpRequired: 21000, description: "Ready for publication", rewards: ["Export templates"] },
            9: { title: "Research Leader", xpRequired: 30000, description: "Leading academic work", rewards: ["Mentorship tools"] },
            10: { title: "Distinguished Professor", xpRequired: 42000, description: "Academic excellence achieved", rewards: ["All features unlocked"] },
            // Prestige levels
            11: { title: "Emeritus Scholar", xpRequired: 60000, description: "Beyond mastery", rewards: ["Prestige badge"] },
            12: { title: "Academic Legend", xpRequired: 85000, description: "Legendary productivity", rewards: ["Legacy features"] }
        };
    }
    
    loadXP() {
        const stored = localStorage.getItem('gamification_xp');
        return stored ? parseInt(stored) : 0;
    }
    
    saveXP() {
        localStorage.setItem('gamification_xp', this.xpSystem.currentXP.toString());
    }
    
    calculateLevel() {
        // Defensive check in case this is called before xpSystem is fully initialized
        if (!this.xpSystem || !this.xpSystem.levelDefinitions) {
            return 1;
        }
        
        const xp = this.xpSystem.currentXP || 0;
        const levels = this.xpSystem.levelDefinitions;
        
        let currentLevel = 1;
        for (let level = 12; level >= 1; level--) {
            if (xp >= levels[level].xpRequired) {
                currentLevel = level;
                break;
            }
        }
        return currentLevel;
    }
    
    getXPForNextLevel() {
        const currentLevel = this.xpSystem.currentLevel;
        const nextLevel = Math.min(currentLevel + 1, 12);
        return this.xpSystem.levelDefinitions[nextLevel].xpRequired;
    }
    
    getProgressToNextLevel() {
        const currentXP = this.xpSystem.currentXP;
        const currentLevelXP = this.xpSystem.levelDefinitions[this.xpSystem.currentLevel].xpRequired;
        const nextLevelXP = this.getXPForNextLevel();
        
        if (this.xpSystem.currentLevel === 12) {
            return 1; // Max level reached
        }
        
        const progress = (currentXP - currentLevelXP) / (nextLevelXP - currentLevelXP);
        return Math.max(0, Math.min(1, progress));
    }
    
    awardXP(amount, reason = 'General activity') {
        console.log(`[Gamification] Awarding ${amount} XP for: ${reason}`);
        
        const oldLevel = this.xpSystem.currentLevel;
        this.xpSystem.currentXP += amount;
        this.xpSystem.currentLevel = this.calculateLevel();
        
        // Check for level up
        if (this.xpSystem.currentLevel > oldLevel) {
            this.handleLevelUp(oldLevel, this.xpSystem.currentLevel);
        }
        
        this.saveXP();
        this.updateXPDisplay();
        
        // Show XP gain notification
        this.showXPGainNotification(amount, reason);
        
        return {
            xpGained: amount,
            totalXP: this.xpSystem.currentXP,
            leveledUp: this.xpSystem.currentLevel > oldLevel,
            newLevel: this.xpSystem.currentLevel
        };
    }
    
    handleLevelUp(oldLevel, newLevel) {
        console.log(`[Gamification] Level up! ${oldLevel} → ${newLevel}`);
        
        // Award bonus XP for leveling up
        this.xpSystem.currentXP += this.xpSystem.xpGains.levelUp;
        
        // Play level up sound
        this.playSound('levelUp');
        
        // Show level up modal
        this.showLevelUpModal(oldLevel, newLevel);
        
        // Trigger celebration effects
        this.triggerCelebrationEffects('levelUp');
        
        // Update achievements
        this.checkAchievements();
        
        // Save progress
        this.saveXP();
    }
    
    showLevelUpModal(oldLevel, newLevel) {
        const levelInfo = this.xpSystem.levelDefinitions[newLevel];
        
        const modal = document.createElement('div');
        modal.className = 'gamification-modal-overlay';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.8); display: flex; align-items: center;
            justify-content: center; z-index: 10000; animation: fadeIn 0.3s ease;
        `;
        
        modal.innerHTML = `
            <div class="gamification-modal" style="background: white; border-radius: 16px; width: 90%; max-width: 500px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3); overflow: hidden;">
                <div class="modal-header" style="background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); color: white; padding: 24px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 16px;">🎊</div>
                    <h3 style="margin: 0; font-size: 24px; font-weight: bold;">Level Up!</h3>
                    <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 16px;">Congratulations on your progress!</p>
                </div>
                <div class="modal-content" style="padding: 32px 24px; text-align: center;">
                    <div style="margin-bottom: 24px;">
                        <div style="font-size: 48px; font-weight: bold; color: #2c3e50; margin-bottom: 8px;">
                            ${oldLevel} → ${newLevel}
                        </div>
                        <div style="font-size: 20px; font-weight: 600; color: #9b59b6; margin-bottom: 8px;">
                            ${levelInfo.title}
                        </div>
                        <div style="font-size: 14px; color: #7f8c8d; line-height: 1.4;">
                            ${levelInfo.description}
                        </div>
                    </div>
                    
                    ${levelInfo.rewards.length > 0 ? `
                        <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                            <h4 style="margin: 0 0 12px 0; color: #2c3e50; font-size: 16px;">🎁 Rewards Unlocked</h4>
                            <ul style="list-style: none; padding: 0; margin: 0;">
                                ${levelInfo.rewards.map(reward => `
                                    <li style="padding: 4px 0; color: #27ae60; font-weight: 500;">✓ ${reward}</li>
                                `).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                        <div style="font-size: 14px; margin-bottom: 8px;">Total XP</div>
                        <div style="font-size: 28px; font-weight: bold;">${this.xpSystem.currentXP.toLocaleString()}</div>
                    </div>
                    
                    <button onclick="this.closest('.gamification-modal-overlay').remove()" 
                            style="background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); color: white; border: none; padding: 12px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: transform 0.2s ease;">
                        Continue Writing!
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Auto-close after 10 seconds
        setTimeout(() => {
            if (document.body.contains(modal)) {
                modal.remove();
            }
        }, 10000);
    }
    
    showXPGainNotification(amount, reason) {
        // Create floating XP notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed; top: 80px; right: 20px; background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
            color: white; padding: 12px 16px; border-radius: 8px; font-weight: bold;
            box-shadow: 0 4px 12px rgba(243, 156, 18, 0.3); z-index: 9999;
            animation: slideInRight 0.3s ease, fadeOut 0.3s ease 2.7s forwards;
            font-size: 14px; max-width: 200px;
        `;
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 18px;">⭐</span>
                <div>
                    <div>+${amount} XP</div>
                    <div style="font-size: 11px; opacity: 0.9;">${reason}</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Remove after animation
        setTimeout(() => {
            if (document.body.contains(notification)) {
                notification.remove();
            }
        }, 3000);
    }
    
    updateXPDisplay() {
        // Update XP/level in the main gamification toolbar
        const levelDisplay = document.querySelector('.level-display');
        if (levelDisplay) {
            const progress = this.getProgressToNextLevel();
            const nextLevelXP = this.getXPForNextLevel();
            const currentLevelXP = this.xpSystem.levelDefinitions[this.xpSystem.currentLevel].xpRequired;
            const xpForNext = nextLevelXP - this.xpSystem.currentXP;
            
            levelDisplay.innerHTML = `
                <div style="display: flex; align-items: center; gap: 4px;">
                    <span style="font-size: 14px;">⭐</span>
                    <span style="font-weight: bold;">L${this.xpSystem.currentLevel}</span>
                    <div style="width: 60px; height: 6px; background: rgba(255,255,255,0.3); border-radius: 3px; overflow: hidden;">
                        <div style="width: ${progress * 100}%; height: 100%; background: #f39c12; transition: width 0.3s ease;"></div>
                    </div>
                    <span style="font-size: 10px; opacity: 0.9;">${xpForNext > 0 ? xpForNext : 'MAX'}</span>
                </div>
            `;
        }
    }
    
    loadSpecializations() {
        const stored = localStorage.getItem('gamification_specializations');
        if (stored) {
            return JSON.parse(stored);
        }
        return {
            methodology: { level: 0, xp: 0 },
            theory: { level: 0, xp: 0 },
            analysis: { level: 0, xp: 0 },
            review: { level: 0, xp: 0 }
        };
    }
    
    saveSpecializations() {
        localStorage.setItem('gamification_specializations', JSON.stringify(this.xpSystem.specializations));
    }
    
    loadPrestige() {
        const stored = localStorage.getItem('gamification_prestige');
        if (stored) {
            return JSON.parse(stored);
        }
        return {
            level: 0,
            totalResets: 0,
            bonusMultiplier: 1.0
        };
    }
    
    savePrestige() {
        localStorage.setItem('gamification_prestige', JSON.stringify(this.xpSystem.prestige));
    }
    
    // === Goal Completion System ===
    
    checkGoalCompletion() {
        const today = this.getTodayKey();
        const todayStats = this.dailyStats[today];
        
        if (!todayStats) return;
        
        // Check daily goals
        this.checkDailyGoals(todayStats);
        
        // Check weekly goals (only check once per day)
        if (!todayStats.weeklyGoalsChecked) {
            this.checkWeeklyGoals();
            todayStats.weeklyGoalsChecked = true;
            this.saveDailyStats();
        }
    }
    
    checkDailyGoals(todayStats) {
        const goals = this.goals.daily;
        const completedGoals = [];
        
        // Check word goal
        if (todayStats.totalWords >= goals.words && !todayStats.dailyWordGoalCompleted) {
            completedGoals.push('daily_words');
            todayStats.dailyWordGoalCompleted = true;
            this.awardXP(this.xpSystem.xpGains.dailyGoalReached, `Daily word goal (${goals.words} words)`);
        }
        
        // Check session goal
        if (todayStats.sessions.length >= goals.sessions && !todayStats.dailySessionGoalCompleted) {
            completedGoals.push('daily_sessions');
            todayStats.dailySessionGoalCompleted = true;
            this.awardXP(this.xpSystem.xpGains.dailyGoalReached, `Daily session goal (${goals.sessions} sessions)`);
        }
        
        // Check flow time goal
        const totalFlowTime = (todayStats.focusSessions || []).reduce((total, session) => {
            if (session.completed && session.flowDuration) {
                return total + session.flowDuration;
            }
            return total;
        }, 0);
        
        if (totalFlowTime >= goals.flowTime && !todayStats.dailyFlowGoalCompleted) {
            completedGoals.push('daily_flow');
            todayStats.dailyFlowGoalCompleted = true;
            this.awardXP(this.xpSystem.xpGains.dailyGoalReached, `Daily flow goal (${Math.round(goals.flowTime / 60000)} minutes)`);
        }
        
        // Trigger celebrations for completed goals
        if (completedGoals.length > 0) {
            this.triggerCelebrationEffects('goal');
            for (const goalType of completedGoals) {
                this.showGoalCompletionNotification(goalType);
            }
            
            // Check if all daily goals completed
            if (completedGoals.length === 3 || 
                (todayStats.dailyWordGoalCompleted && todayStats.dailySessionGoalCompleted && todayStats.dailyFlowGoalCompleted)) {
                this.showNotification('🎯 All daily goals completed! Amazing work!', 'success');
                this.awardXP(100, 'All daily goals completed');
            }
            
            this.saveDailyStats();
        }
    }
    
    checkWeeklyGoals() {
        const weekStats = this.getWeeklyStats();
        const goals = this.goals.weekly;
        const completedGoals = [];
        
        // Get current week identifier
        const now = new Date();
        const weekStart = new Date(now.getFullYear(), 0, 1 + (this.getWeekNumber(now) - 1) * 7);
        const weekKey = this.getDateKey(weekStart);
        
        // Load weekly goal completion status
        const weeklyCompletions = JSON.parse(localStorage.getItem('gamification_weekly_completions') || '{}');
        
        // Check weekly word goal
        if (weekStats.totalWords >= goals.words && !weeklyCompletions[`${weekKey}_words`]) {
            completedGoals.push('weekly_words');
            weeklyCompletions[`${weekKey}_words`] = true;
            this.awardXP(this.xpSystem.xpGains.weeklyGoalReached, `Weekly word goal (${goals.words} words)`);
        }
        
        // Check weekly session goal
        if (weekStats.totalSessions >= goals.sessions && !weeklyCompletions[`${weekKey}_sessions`]) {
            completedGoals.push('weekly_sessions');
            weeklyCompletions[`${weekKey}_sessions`] = true;
            this.awardXP(this.xpSystem.xpGains.weeklyGoalReached, `Weekly session goal (${goals.sessions} sessions)`);
        }
        
        // Check weekly flow time goal
        if (weekStats.totalFlowTime >= goals.flowTime && !weeklyCompletions[`${weekKey}_flow`]) {
            completedGoals.push('weekly_flow');
            weeklyCompletions[`${weekKey}_flow`] = true;
            this.awardXP(this.xpSystem.xpGains.weeklyGoalReached, `Weekly flow goal (${Math.round(goals.flowTime / 3600000)} hours)`);
        }
        
        // Save weekly completion status
        localStorage.setItem('gamification_weekly_completions', JSON.stringify(weeklyCompletions));
        
        // Trigger celebrations for completed weekly goals
        if (completedGoals.length > 0) {
            this.triggerCelebrationEffects('goal');
            for (const goalType of completedGoals) {
                this.showGoalCompletionNotification(goalType);
            }
            
            // Check if all weekly goals completed
            if (completedGoals.length === 3 || 
                (weeklyCompletions[`${weekKey}_words`] && weeklyCompletions[`${weekKey}_sessions`] && weeklyCompletions[`${weekKey}_flow`])) {
                this.showNotification('🏆 All weekly goals completed! Outstanding achievement!', 'success');
                this.awardXP(500, 'All weekly goals completed');
            }
        }
    }
    
    showGoalCompletionNotification(goalType) {
        const goalMessages = {
            daily_words: '🎯 Daily word goal completed!',
            daily_sessions: '🎯 Daily session goal completed!',
            daily_flow: '🎯 Daily flow time goal completed!',
            weekly_words: '🏆 Weekly word goal completed!',
            weekly_sessions: '🏆 Weekly session goal completed!',
            weekly_flow: '🏆 Weekly flow time goal completed!'
        };
        
        const message = goalMessages[goalType] || '🎯 Goal completed!';
        this.showNotification(message, 'success');
    }
    
    getWeeklyStats() {
        const now = new Date();
        const weekNumber = this.getWeekNumber(now);
        const year = now.getFullYear();
        
        let totalWords = 0;
        let totalSessions = 0;
        let totalFlowTime = 0;
        
        // Calculate stats for current week
        for (const [dateKey, dayStats] of Object.entries(this.dailyStats)) {
            const date = new Date(dateKey);
            if (date.getFullYear() === year && this.getWeekNumber(date) === weekNumber) {
                totalWords += dayStats.totalWords || 0;
                totalSessions += dayStats.sessions ? dayStats.sessions.length : 0;
                
                if (dayStats.focusSessions) {
                    totalFlowTime += dayStats.focusSessions.reduce((total, session) => {
                        return total + (session.flowDuration || 0);
                    }, 0);
                }
            }
        }
        
        return { totalWords, totalSessions, totalFlowTime };
    }
    
    getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }
    
    // === Visual Celebration Effects ===
    
    triggerCelebrationEffects(type) {
        switch (type) {
            case 'levelUp':
                this.showConfettiEffect();
                this.showSparkleEffect();
                this.showFireworksEffect();
                break;
            case 'achievement':
                this.showConfettiEffect('gold');
                this.showSparkleEffect();
                break;
            case 'streak':
                this.showFireEffect();
                this.showSparkleEffect();
                break;
            case 'flow':
                this.showWaveEffect();
                this.showGlowEffect();
                break;
            case 'goal':
                this.showConfettiEffect('multicolor');
                this.showBurstEffect();
                break;
            default:
                this.showSparkleEffect();
        }
    }
    
    showConfettiEffect(colorTheme = 'rainbow') {
        const colors = {
            rainbow: ['#ff0a54', '#ff477e', '#ff7096', '#ff85a1', '#fbb1bd', '#f9bec7'],
            gold: ['#f39c12', '#e67e22', '#d35400', '#f1c40f', '#f4d03f', '#fcf3cf'],
            multicolor: ['#3498db', '#9b59b6', '#e74c3c', '#2ecc71', '#f39c12', '#1abc9c']
        };
        
        const confettiColors = colors[colorTheme] || colors.rainbow;
        const confettiCount = 100;
        
        for (let i = 0; i < confettiCount; i++) {
            setTimeout(() => {
                this.createConfettiPiece(confettiColors);
            }, i * 20);
        }
    }
    
    createConfettiPiece(colors) {
        const confetti = document.createElement('div');
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size = Math.random() * 8 + 4;
        const leftPosition = Math.random() * window.innerWidth;
        const animationDuration = Math.random() * 3 + 2;
        const rotation = Math.random() * 360;
        
        confetti.style.cssText = `
            position: fixed;
            left: ${leftPosition}px;
            top: -10px;
            width: ${size}px;
            height: ${size}px;
            background: ${color};
            pointer-events: none;
            z-index: 10001;
            border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
            animation: confettiFall ${animationDuration}s linear forwards;
            transform: rotate(${rotation}deg);
            opacity: 0.9;
        `;
        
        document.body.appendChild(confetti);
        
        // Remove after animation
        setTimeout(() => {
            if (document.body.contains(confetti)) {
                confetti.remove();
            }
        }, animationDuration * 1000 + 100);
    }
    
    showSparkleEffect() {
        const sparkleCount = 20;
        for (let i = 0; i < sparkleCount; i++) {
            setTimeout(() => {
                this.createSparkle();
            }, i * 100);
        }
    }
    
    createSparkle() {
        const sparkle = document.createElement('div');
        const size = Math.random() * 4 + 2;
        const leftPosition = Math.random() * window.innerWidth;
        const topPosition = Math.random() * window.innerHeight;
        
        sparkle.innerHTML = '✨';
        sparkle.style.cssText = `
            position: fixed;
            left: ${leftPosition}px;
            top: ${topPosition}px;
            font-size: ${size * 4}px;
            pointer-events: none;
            z-index: 10001;
            animation: sparkleTwinkle 1.5s ease-out forwards;
            opacity: 0;
        `;
        
        document.body.appendChild(sparkle);
        
        setTimeout(() => {
            if (document.body.contains(sparkle)) {
                sparkle.remove();
            }
        }, 1500);
    }
    
    showFireworksEffect() {
        const fireworksCount = 5;
        for (let i = 0; i < fireworksCount; i++) {
            setTimeout(() => {
                this.createFirework();
            }, i * 300);
        }
    }
    
    createFirework() {
        const firework = document.createElement('div');
        const leftPosition = Math.random() * (window.innerWidth - 100) + 50;
        const topPosition = Math.random() * (window.innerHeight - 200) + 100;
        
        firework.style.cssText = `
            position: fixed;
            left: ${leftPosition}px;
            top: ${topPosition}px;
            width: 4px;
            height: 4px;
            background: #fff;
            border-radius: 50%;
            pointer-events: none;
            z-index: 10001;
        `;
        
        document.body.appendChild(firework);
        
        // Create explosion effect
        setTimeout(() => {
            this.explodeFirework(firework, leftPosition, topPosition);
        }, 200);
    }
    
    explodeFirework(firework, x, y) {
        firework.remove();
        
        const particles = 12;
        const colors = ['#ff0a54', '#ff477e', '#ff7096', '#3498db', '#9b59b6', '#f39c12'];
        
        for (let i = 0; i < particles; i++) {
            const particle = document.createElement('div');
            const angle = (i / particles) * Math.PI * 2;
            const velocity = Math.random() * 100 + 50;
            const color = colors[Math.floor(Math.random() * colors.length)];
            
            particle.style.cssText = `
                position: fixed;
                left: ${x}px;
                top: ${y}px;
                width: 3px;
                height: 3px;
                background: ${color};
                border-radius: 50%;
                pointer-events: none;
                z-index: 10001;
                animation: fireworkParticle 1s ease-out forwards;
                --angle: ${angle}rad;
                --velocity: ${velocity}px;
            `;
            
            document.body.appendChild(particle);
            
            setTimeout(() => {
                if (document.body.contains(particle)) {
                    particle.remove();
                }
            }, 1000);
        }
    }
    
    showFireEffect() {
        const fireCount = 15;
        for (let i = 0; i < fireCount; i++) {
            setTimeout(() => {
                this.createFireParticle();
            }, i * 50);
        }
    }
    
    createFireParticle() {
        const fire = document.createElement('div');
        const leftPosition = Math.random() * window.innerWidth;
        const size = Math.random() * 6 + 3;
        
        fire.innerHTML = '🔥';
        fire.style.cssText = `
            position: fixed;
            left: ${leftPosition}px;
            bottom: -30px;
            font-size: ${size * 4}px;
            pointer-events: none;
            z-index: 10001;
            animation: fireRise 2s ease-out forwards;
            opacity: 0.9;
        `;
        
        document.body.appendChild(fire);
        
        setTimeout(() => {
            if (document.body.contains(fire)) {
                fire.remove();
            }
        }, 2000);
    }
    
    showWaveEffect() {
        const wave = document.createElement('div');
        wave.innerHTML = '🌊';
        wave.style.cssText = `
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            font-size: 60px;
            pointer-events: none;
            z-index: 10001;
            animation: waveExpand 2s ease-out forwards;
            opacity: 0;
        `;
        
        document.body.appendChild(wave);
        
        setTimeout(() => {
            if (document.body.contains(wave)) {
                wave.remove();
            }
        }, 2000);
    }
    
    showGlowEffect() {
        const glow = document.createElement('div');
        glow.style.cssText = `
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle at center, rgba(52, 152, 219, 0.2) 0%, transparent 70%);
            pointer-events: none;
            z-index: 10000;
            animation: glowPulse 1.5s ease-out forwards;
            opacity: 0;
        `;
        
        document.body.appendChild(glow);
        
        setTimeout(() => {
            if (document.body.contains(glow)) {
                glow.remove();
            }
        }, 1500);
    }
    
    showBurstEffect() {
        const burstCount = 8;
        for (let i = 0; i < burstCount; i++) {
            setTimeout(() => {
                this.createBurstParticle(i, burstCount);
            }, i * 30);
        }
    }
    
    createBurstParticle(index, total) {
        const particle = document.createElement('div');
        const angle = (index / total) * Math.PI * 2;
        const distance = 150;
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        particle.innerHTML = '⭐';
        particle.style.cssText = `
            position: fixed;
            left: ${centerX}px;
            top: ${centerY}px;
            font-size: 20px;
            pointer-events: none;
            z-index: 10001;
            animation: burstParticle 1s ease-out forwards;
            --angle: ${angle}rad;
            --distance: ${distance}px;
            opacity: 0;
        `;
        
        document.body.appendChild(particle);
        
        setTimeout(() => {
            if (document.body.contains(particle)) {
                particle.remove();
            }
        }, 1000);
    }
    
    // Make the instance globally accessible
    setupGlobalAccess() {
        window.writingGamification = this;
        window.gamificationInstance = this;
    }
}

// Global instance
let writingGamification = null;

// Initialize gamification system
window.initializeGamification = function() {
    if (!writingGamification) {
        writingGamification = new WritingGamification();
    }
    writingGamification.initialize();
    writingGamification.setupGlobalAccess();
    return writingGamification;
};

// Export for use in other modules
window.writingGamification = writingGamification;
window.gamificationInstance = writingGamification;

console.log('[Gamification] Module loaded at', new Date());
console.log('[Gamification] initializeGamification function available:', typeof window.initializeGamification);

// Module loaded successfully
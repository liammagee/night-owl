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
        
        // Writing metrics
        this.sessionWordCount = 0;
        this.sessionStartWordCount = 0;
        this.totalWordsWritten = 0;
        
        // Focus session timer (Pomodoro-inspired)
        this.focusTimer = null;
        this.focusSession = null;
        this.isOnBreak = false;
        this.focusSettings = this.loadFocusSettings();
        this.rewards = this.loadRewards();
        this.rewardQueue = [];
        
        console.log('[Gamification] Writing momentum and focus system initialized');
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
            console.log('[Gamification] Session already active');
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
        
        console.log('[Gamification] Writing session started:', this.currentSession.id);
        this.updateGamificationUI();
        this.showNotification('✍️ Writing session started! Keep the momentum flowing.', 'success');
    }

    endWritingSession() {
        if (!this.currentSession) {
            console.log('[Gamification] No active session to end');
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
            this.checkAchievements();
            this.updateStreaks();
            this.showSessionSummary(this.currentSession);
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
        const wordsWritten = session.wordCountEnd - session.wordCountStart;
        
        // Base completion reward
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
            // Check for flow interruption (gap in activity)
            if (this.lastActivityTime && (now - this.lastActivityTime) > this.activityThreshold) {
                this.currentSession.flowInterruptions++;
                console.log('[Gamification] Flow interruption detected');
            }
            
            // Update word count
            const currentWords = this.getCurrentWordCount();
            this.sessionWordCount = Math.max(0, currentWords - this.sessionStartWordCount);
            this.currentSession.wordCount = this.sessionWordCount;
        }
        
        this.lastActivityTime = now;
        this.updateGamificationUI();
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
        if (!this.isGamificationEnabled()) {
            console.log('[Gamification] Gamification disabled in settings');
            return;
        }

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
        
        // Create controls container
        const controls = document.createElement('div');
        controls.className = 'gamification-controls';
        controls.innerHTML = `
            <div class="gamification-section" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px;">
                <div class="streak-display" style="display: flex; align-items: center; gap: 3px; padding: 4px 8px; background: rgba(255, 107, 53, 0.9); border-radius: 4px; color: white; font-size: 11px; font-weight: bold; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
                    <span class="streak-icon">🔥</span>
                    <span class="streak-count">${this.streakData.currentStreak || 0}</span>
                    <span class="streak-label">streak</span>
                </div>
                <div class="session-display" style="display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: rgba(52, 152, 219, 0.9); border-radius: 4px; color: white; font-size: 11px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
                    <span class="session-status">✍️</span>
                    <span class="session-time">00:00</span>
                    <span class="session-words">0 words</span>
                </div>
                <div class="focus-display" style="display: none; align-items: center; gap: 4px; padding: 4px 8px; background: rgba(155, 89, 182, 0.9); border-radius: 4px; color: white; font-size: 11px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
                    <span class="focus-icon">🎯</span>
                    <span class="focus-time">00:00</span>
                    <span class="focus-type">focus</span>
                </div>
                <div class="points-display" style="padding: 4px 8px; background: rgba(243, 156, 18, 0.9); border-radius: 4px; color: white; font-size: 11px; font-weight: bold; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
                    ${this.rewards.totalPoints || 0} pts
                </div>
                <div style="width: 1px; height: 16px; background: rgba(155, 89, 182, 0.3); margin: 0 4px;"></div>
                <button id="start-writing-session" class="toolbar-btn" style="padding: 6px 10px; border: 1px solid rgba(155, 89, 182, 0.5); background: rgba(39, 174, 96, 0.8); color: white; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 500; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">Start Writing</button>
                <button id="end-writing-session" class="toolbar-btn" style="padding: 6px 10px; border: 1px solid rgba(155, 89, 182, 0.5); background: rgba(231, 76, 60, 0.8); color: white; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 500; box-shadow: 0 1px 3px rgba(0,0,0,0.2);" disabled>End Session</button>
                <button id="start-focus-session" class="toolbar-btn" style="padding: 6px 10px; border: 1px solid rgba(155, 89, 182, 0.5); background: rgba(155, 89, 182, 0.8); color: white; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 500; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">🎯 Focus</button>
                <button id="pause-focus-session" class="toolbar-btn" style="display: none; padding: 6px 10px; border: 1px solid rgba(155, 89, 182, 0.5); background: rgba(243, 156, 18, 0.8); color: white; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 500; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">⏸️</button>
                <button id="stop-focus-session" class="toolbar-btn" style="display: none; padding: 6px 10px; border: 1px solid rgba(155, 89, 182, 0.5); background: rgba(231, 76, 60, 0.8); color: white; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 500; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">⏹️</button>
                <button id="show-stats" class="toolbar-btn" style="padding: 6px 10px; border: 1px solid rgba(155, 89, 182, 0.5); background: rgba(52, 152, 219, 0.8); color: white; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 500; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">Stats</button>
            </div>
        `;
        
        // Add to menu
        menuContent.appendChild(controls);
        gamificationMenu.appendChild(menuHeader);
        gamificationMenu.appendChild(menuContent);
        
        // Insert after editor toolbar
        editorToolbar.insertAdjacentElement('afterend', gamificationMenu);
        
        this.controls = controls;
        this.menuContent = menuContent;
        this.isMenuExpanded = this.loadMenuState();
        this.updateMenuState();
        
        // Add event listeners
        document.getElementById('gamification-toggle').addEventListener('click', () => {
            this.toggleMenu();
        });

        document.getElementById('start-writing-session').addEventListener('click', () => {
            this.startWritingSession();
        });
        
        document.getElementById('end-writing-session').addEventListener('click', () => {
            this.endWritingSession();
        });
        
        document.getElementById('show-stats').addEventListener('click', () => {
            console.log('[Gamification] Stats button clicked');
            try {
                this.showStatsModal();
            } catch (error) {
                console.error('[Gamification] Error showing stats modal:', error);
            }
        });
        
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
    }

    isGamificationEnabled() {
        // Check global settings for gamification enabled state
        if (window.appSettings?.gamification?.enabled !== undefined) {
            return window.appSettings.gamification.enabled;
        }
        // Default to enabled if no setting exists
        return true;
    }

    toggleMenu() {
        this.isMenuExpanded = !this.isMenuExpanded;
        this.updateMenuState();
        this.saveMenuState();
    }

    updateMenuState() {
        if (!this.menuContent) return;
        
        const toggle = document.getElementById('gamification-toggle');
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
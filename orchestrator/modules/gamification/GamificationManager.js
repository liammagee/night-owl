// === Gamification Manager ===
// Main coordinator for all gamification modules
// Research-backed gamification for academic writing motivation
// Based on: Deci & Ryan (2000), Amabile & Kramer (2011), Clear (2018), Fogg (2019)

class GamificationManager {
    constructor() {
        this.initialized = false;
        
        // Initialize data persistence layer first
        this.dataPersistence = new DataPersistence();
        
        // Initialize core modules
        this.writingSession = new WritingSession(this);
        this.focusTimer = new FocusTimer(this);
        this.flowState = new FlowState(this);
        
        // Load persistent data
        this.dailyStats = this.dataPersistence.loadDailyStats();
        this.streakData = this.dataPersistence.loadStreakData();
        this.achievements = this.dataPersistence.loadAchievements();
        this.goals = this.dataPersistence.loadGoals();
        this.rewards = this.dataPersistence.loadRewards();
        
        // Level/XP Progression System
        this.xpSystem = {
            currentXP: this.dataPersistence.loadXP().currentXP || 0,
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
            specializations: this.dataPersistence.loadSpecializations(),
            prestige: this.dataPersistence.loadPrestige()
        };
        
        // Writing analytics and insights
        this.analytics = this.dataPersistence.loadAnalyticsData();
        this.insights = this.dataPersistence.loadInsights();
        
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
        
        // Progress indicators
        this.progressIndicators = {
            daily: null,
            session: null,
            weekly: null
        };
        
        // Initialize systems
        this.initializeXPSystem();
        this.initializeAudioContext();
        
        // Initialize integrations after a short delay
        setTimeout(() => {
            this.initializeChallenges();
            this.initializeAICompanion();
            this.initializeTodoGamification();
        }, 100);
        
        console.log('[GamificationManager] Gamification system initialized');
    }

    initialize() {
        if (this.initialized) return;
        
        this.setupEventListeners();
        this.updateGamificationUI();
        this.startActivityTracking();
        this.initialized = true;
        
        console.log('[GamificationManager] Event listeners and UI initialized');
    }

    // === Session Management Delegations ===
    
    startWritingSession() {
        return this.writingSession.startWritingSession();
    }

    endWritingSession() {
        return this.writingSession.endWritingSession();
    }

    // === Focus Timer Delegations ===

    startFocusSession(duration = null) {
        return this.focusTimer.startFocusSession(duration);
    }

    pauseFocusSession() {
        return this.focusTimer.pauseFocusSession();
    }

    resumeFocusSession() {
        return this.focusTimer.resumeFocusSession();
    }

    stopFocusSession() {
        return this.focusTimer.stopFocusSession();
    }

    // === Activity Tracking ===

    startActivityTracking() {
        if (!editor) {
            console.warn('[GamificationManager] Editor not available for activity tracking');
            return;
        }

        // Track typing activity for flow state detection
        editor.onDidChangeModelContent(() => {
            this.updateActivity();
        });

        // Track cursor position changes (indicating engagement)
        editor.onDidChangeCursorPosition(() => {
            this.updateActivity();
        });

        console.log('[GamificationManager] Activity tracking started');
    }

    updateActivity() {
        const now = Date.now();
        const currentWordCount = this.getCurrentWordCount();
        
        // Update writing session
        this.writingSession.updateActivity();
        
        // Update flow state detection
        this.flowState.updateFlowState(now, currentWordCount);
        
        // Update UI
        this.updateGamificationUI();
    }

    // === Data Persistence Helpers ===

    saveDailyStats() {
        return this.dataPersistence.saveDailyStats(this.dailyStats);
    }

    saveStreakData() {
        return this.dataPersistence.saveStreakData(this.streakData);
    }

    saveAchievements() {
        return this.dataPersistence.saveAchievements(this.achievements);
    }

    saveGoals() {
        return this.dataPersistence.saveGoals(this.goals);
    }

    saveXP() {
        return this.dataPersistence.saveXP({
            currentXP: this.xpSystem.currentXP,
            currentLevel: this.xpSystem.currentLevel,
            totalXPEarned: this.xpSystem.currentXP
        });
    }

    saveFlowSessions() {
        return this.dataPersistence.saveFlowSessions(this.flowState.flowState.flowSessions);
    }

    saveFocusSession(session) {
        // This would typically save to a focus sessions collection
        // For now, we'll add it to analytics
        if (!this.analytics.focusSessions) {
            this.analytics.focusSessions = [];
        }
        this.analytics.focusSessions.push(session);
        this.saveAnalyticsData();
    }

    saveAnalyticsData() {
        return this.dataPersistence.saveAnalyticsData(this.analytics);
    }

    // === Placeholder Methods (to be implemented) ===

    updateGamificationUI() {
        // Update UI elements with current stats
        // This would be implemented based on the actual UI structure
        console.log('[GamificationManager] UI updated');
    }

    checkAchievements() {
        // Check for newly earned achievements
        console.log('[GamificationManager] Checking achievements');
    }

    updateStreaks() {
        // Update writing streaks
        console.log('[GamificationManager] Updating streaks');
    }

    checkGoalCompletion() {
        // Check if goals have been reached
        console.log('[GamificationManager] Checking goal completion');
    }

    awardXP(amount, reason) {
        this.xpSystem.currentXP += amount;
        console.log(`[GamificationManager] Awarded ${amount} XP for: ${reason}`);
        this.saveXP();
    }

    playSound(soundType) {
        if (this.audioSettings.enabled && this.audioContext) {
            console.log(`[GamificationManager] Playing sound: ${soundType}`);
            // Audio implementation would go here
        }
    }

    setupEventListeners() {
        // Setup global event listeners
        console.log('[GamificationManager] Event listeners setup');
    }

    initializeXPSystem() {
        // Calculate current level from XP
        const xp = this.xpSystem.currentXP;
        this.xpSystem.currentLevel = this.calculateLevelFromXP(xp);
        console.log('[GamificationManager] XP system initialized');
    }

    initializeAudioContext() {
        // Initialize Web Audio API if available
        if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
            try {
                this.audioContext = new (AudioContext || webkitAudioContext)();
                console.log('[GamificationManager] Audio context initialized');
            } catch (error) {
                console.warn('[GamificationManager] Failed to initialize audio context:', error);
            }
        }
    }

    // === Integration Methods ===

    initializeChallenges() {
        if (typeof CollaborativeChallenges !== 'undefined' && !this.collaborativeChallenges) {
            this.collaborativeChallenges = new CollaborativeChallenges(this);
            console.log('[GamificationManager] Collaborative challenges initialized');
        }
    }

    initializeAICompanion() {
        const settings = window.appSettings || {};
        const aiEnabled = settings.ai?.enableWritingCompanion !== false;
        
        if (aiEnabled && typeof AIWritingCompanion !== 'undefined' && !this.aiCompanion) {
            this.aiCompanion = new AIWritingCompanion(this);
            window.aiCompanion = this.aiCompanion;
            console.log('[GamificationManager] AI Writing Companion initialized');
        }
    }

    initializeTodoGamification() {
        if (typeof TodoGamification !== 'undefined' && !this.todoGamification) {
            this.todoGamification = new TodoGamification(this);
            console.log('[GamificationManager] Todo Gamification initialized');
        }
    }

    updateChallengeProgress() {
        if (this.collaborativeChallenges) {
            this.collaborativeChallenges.updateFromGamificationProgress();
        }
    }

    // === Utility Methods ===

    getCurrentWordCount() {
        if (!editor) return 0;
        
        const content = editor.getValue();
        const words = content.trim().split(/\s+/).filter(word => word.length > 0);
        return words.length;
    }

    calculateLevelFromXP(xp) {
        // Simple level calculation - could be made more sophisticated
        return Math.floor(xp / 1000) + 1;
    }

    getLevelDefinitions() {
        // Define level requirements and rewards
        return {
            1: { minXP: 0, title: 'Novice Writer' },
            2: { minXP: 1000, title: 'Aspiring Author' },
            3: { minXP: 2500, title: 'Dedicated Scribe' },
            4: { minXP: 5000, title: 'Focused Writer' },
            5: { minXP: 10000, title: 'Word Master' },
            // Add more levels as needed
        };
    }

    showNotification(message, type = 'info', duration = 3000) {
        if (typeof showNotification === 'function') {
            showNotification(message, type, duration);
        } else {
            console.log(`[GamificationManager] ${type.toUpperCase()}: ${message}`);
        }
    }

    // === Public API Methods ===

    getStats() {
        return {
            currentSession: this.writingSession.currentSession,
            focusSession: this.focusTimer.focusSession,
            flowMetrics: this.flowState.getFlowMetrics(),
            xp: this.xpSystem,
            dailyStats: this.dailyStats,
            streaks: this.streakData,
            achievements: this.achievements,
            goals: this.goals
        };
    }

    exportData() {
        return this.dataPersistence.exportAllData();
    }

    importData(data) {
        return this.dataPersistence.importAllData(data);
    }
}

// Make available globally
window.GamificationManager = GamificationManager;
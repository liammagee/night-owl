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
        
        // Library world progression state
        if (typeof LibraryWorldEngine !== 'undefined') {
            this.worldEngine = new LibraryWorldEngine(this);
        } else {
            console.warn('[GamificationManager] LibraryWorldEngine not available. Library world features disabled.');
            this.worldEngine = null;
        }
        
        if (typeof LibraryArchitectBridge !== 'undefined') {
            this.architectBridge = new LibraryArchitectBridge(this);
        } else {
            console.warn('[GamificationManager] LibraryArchitectBridge not available. Architect integrations disabled.');
            this.architectBridge = null;
        }

        if (typeof LibraryExplorerView !== 'undefined') {
            this.explorerView = new LibraryExplorerView(this);
            this.explorerView.ensureContainer();
        } else {
            console.warn('[GamificationManager] LibraryExplorerView not available. Explorer UI disabled.');
            this.explorerView = null;
        }
        
        // Library progression system (formerly XP)
        this.lexiconTheme = {
            resourceLabel: 'Lexicon Shards',
            resourceTicker: 'shards',
            progressionLabel: 'Stack Tier',
            prestigeLabel: 'Archive Prestige'
        };

        // Live progress tracking for incremental feedback
        this.liveProgress = {
            accumulatedWords: 0,
            shardInterval: 30,
            shardsPerInterval: 12,
            recentSnippet: '',
            lastMilestoneAt: null
        };

        this.architectAutomation = {
            threshold: 3,
            inFlight: false
        };

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

        const storedLedger = this.dataPersistence.loadResourceLedger();
        this.resourceLedger = {
            lexiconShards: storedLedger.lexiconShards != null ? storedLedger.lexiconShards : this.xpSystem.currentXP,
            catalogueSigils: storedLedger.catalogueSigils || 0,
            architectTokens: storedLedger.architectTokens || 0,
            nextArchitectMilestone: storedLedger.nextArchitectMilestone || 5000
        };
        this.saveResourceLedger();
        
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
        
        // Initialize integrations after a delay to allow all modules to load
        setTimeout(() => {
            this.initializeChallenges();
            this.initializeAICompanion();
            this.initializeTodoGamification();
        }, 500);
        
        console.log('[GamificationManager] Gamification system initialized');
    }

    initialize() {
        if (this.initialized) return;
        
        this.setupEventListeners();
        this.updateGamificationUI(true);
        this.startActivityTracking();
        this.initialized = true;
        
        console.log('[GamificationManager] Event listeners and UI initialized');
    }

    // === Session Management Delegations ===
    
    startWritingSession(options = {}) {
        return this.writingSession.startWritingSession(options);
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
        if (!this.writingSession.currentSession) {
            this.writingSession.startWritingSession({ silent: true });
        }
        this.writingSession.updateActivity();
        
        // Update flow state detection
        this.flowState.updateFlowState(now, currentWordCount);
        
        // Update UI
        if (this.explorerView) {
            this.explorerView.signalActivity('typing');
        }
        this.updateGamificationUI(true);
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

    saveResourceLedger() {
        return this.dataPersistence.saveResourceLedger({
            lexiconShards: this.resourceLedger.lexiconShards,
            catalogueSigils: this.resourceLedger.catalogueSigils,
            architectTokens: this.resourceLedger.architectTokens,
            nextArchitectMilestone: this.resourceLedger.nextArchitectMilestone || 5000
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

    updateGamificationUI(force = false) {
        if (this.explorerView && this.worldEngine) {
            this.explorerView.render(
                this.worldEngine.getWorldState(),
                this.resourceLedger,
                {
                    force,
                    snippet: this.liveProgress.recentSnippet,
                    pulse: {
                        wordsRemaining: Math.max(
                            this.liveProgress.shardInterval - this.liveProgress.accumulatedWords,
                            0
                        ),
                        shardInterval: this.liveProgress.shardInterval,
                        shardsPerInterval: this.liveProgress.shardsPerInterval,
                        lastMilestoneAt: this.liveProgress.lastMilestoneAt
                    }
                }
            );
        }
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
        const label = this.lexiconTheme.resourceLabel;
        console.log(`[GamificationManager] Harvested ${amount} ${label} for: ${reason}`);
        this.saveXP();
        this.resourceLedger.lexiconShards = (this.resourceLedger.lexiconShards || 0) + amount;
        this.checkArchitectMilestones();
        this.saveResourceLedger();
        this.recordWorldEvent({
            type: 'resource.harvested',
            payload: { amount, reason, resource: 'lexiconShards' }
        });
    }

    awardCatalogueSigils(amount, reason = 'Task progress', { notify = false } = {}) {
        if (!amount || amount <= 0) {
            return;
        }

        if (!this.resourceLedger) {
            this.resourceLedger = this.dataPersistence.loadResourceLedger();
        }

        this.resourceLedger.catalogueSigils = (this.resourceLedger.catalogueSigils || 0) + amount;

        if (!this.rewards) {
            this.rewards = this.dataPersistence.loadRewards();
        }
        if (this.rewards) {
            this.rewards.totalPoints = this.resourceLedger.catalogueSigils;
            this.saveRewards();
        }

        this.saveResourceLedger();

        console.log(`[GamificationManager] Minted ${amount} catalogue sigils for: ${reason}`);

        if (notify && typeof window !== 'undefined' && window.showNotification) {
            window.showNotification(`📑 +${amount} catalogue sigils: ${reason}`, 'success');
        }

        this.recordWorldEvent({
            type: 'resource.minted',
            payload: { amount, reason, resource: 'catalogueSigils' }
        });
    }

    awardArchitectTokens(amount, reason = 'Library expansion') {
        if (!amount || amount <= 0) {
            return;
        }

        if (!this.resourceLedger) {
            this.resourceLedger = this.dataPersistence.loadResourceLedger();
        }

        this.resourceLedger.architectTokens = (this.resourceLedger.architectTokens || 0) + amount;

        this.saveResourceLedger();

        console.log(`[GamificationManager] Forged ${amount} architect tokens for: ${reason}`);

        if (typeof window !== 'undefined' && window.showNotification) {
            window.showNotification(`🏛 +${amount} architect token${amount !== 1 ? 's' : ''}: ${reason}`, 'success');
        }

        this.recordWorldEvent({
            type: 'resource.minted',
            payload: { amount, reason, resource: 'architectTokens' }
        });
    }

    checkArchitectMilestones() {
        if (!this.resourceLedger) {
            return;
        }

        let milestone = this.resourceLedger.nextArchitectMilestone || 5000;
        let minted = 0;

        while (this.resourceLedger.lexiconShards >= milestone) {
            minted += 1;
            milestone += 5000;
        }

        if (minted > 0) {
            this.resourceLedger.nextArchitectMilestone = milestone;
            this.saveResourceLedger();
            this.awardArchitectTokens(minted, 'Lexicon shard milestone reached');
        }
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
        console.log('[GamificationManager] Library ledger initialized');
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
        
        console.log('[GamificationManager] Initializing AI Companion:', {
            aiEnabled,
            AICompanionManagerAvailable: typeof AICompanionManager !== 'undefined',
            currentAICompanion: !!this.aiCompanion
        });
        
        // Check for existing global AI companion first to prevent duplicates
        const existingCompanion = window.aiCompanionManager || window.aiCompanion || window.globalAICompanion;
        
        if (existingCompanion) {
            console.log('[GamificationManager] Using existing global AICompanionManager to prevent duplicates');
            this.aiCompanion = existingCompanion;
        } else if (aiEnabled && typeof AICompanionManager !== 'undefined' && !this.aiCompanion) {
            try {
                this.aiCompanion = new AICompanionManager(this);
                window.aiCompanion = this.aiCompanion;
                window.aiCompanionManager = this.aiCompanion; // For compatibility
                console.log('[GamificationManager] AI Writing Companion initialized successfully');
                console.log('[GamificationManager] window.aiCompanion available:', typeof window.aiCompanion?.handleKeyboardInvocation === 'function');
            } catch (error) {
                console.error('[GamificationManager] Failed to initialize AI Companion:', error);
            }
        } else {
            console.log('[GamificationManager] AI Companion not initialized:', {
                aiEnabled,
                AICompanionManagerAvailable: typeof AICompanionManager !== 'undefined',
                alreadyHasAICompanion: !!this.aiCompanion
            });
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
            1: { minXP: 0, title: 'Dusty Alcove' },
            2: { minXP: 1000, title: 'Keeper of the Catalog' },
            3: { minXP: 2500, title: 'Curator of Stacks' },
            4: { minXP: 5000, title: 'Architect of Aisles' },
            5: { minXP: 10000, title: 'Warden of the Infinite' }
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
            libraryLedger: this.resourceLedger,
            xp: this.xpSystem, // legacy alias
            dailyStats: this.dailyStats,
            streaks: this.streakData,
            achievements: this.achievements,
            goals: this.goals,
            libraryWorld: this.worldEngine ? this.worldEngine.getWorldState() : null
        };
    }

    exportData() {
        return this.dataPersistence.exportAllData();
    }

    importData(data) {
        return this.dataPersistence.importAllData(data);
    }

    recordWorldEvent(event) {
        if (!this.worldEngine || !this.worldEngine.recordProgressEvent) return;
        this.worldEngine.recordProgressEvent(event);
        
        if (this.shouldQueueArchitectReview(event)) {
            const resources = {
                lexiconShards: this.resourceLedger?.lexiconShards || 0,
                catalogueSigils: this.resourceLedger?.catalogueSigils || 0,
                architectTokens: this.resourceLedger?.architectTokens || 0
            };

            this.worldEngine.queueArchitectPrompt({
                event,
                resources,
                flowMetrics: this.flowState.getFlowMetrics()
            });

            this.scheduleArchitectAutoBuild();
        }

        if (this.explorerView) {
            this.explorerView.signalActivity('event', event);
        }
        this.updateGamificationUI(true);
    }

    getLibraryWorldState() {
        return this.worldEngine ? this.worldEngine.getWorldState() : null;
    }

    toggleMenuVisibility() {
        if (!this.explorerView) return false;
        return this.explorerView.toggleVisibility();
    }

    shouldQueueArchitectReview(event) {
        if (!event || !event.type) return false;
        const interestingTypes = [
            'session.completed',
            'flow.completed',
            'focus.completed',
            'analytics.dailyUpdated',
            'resource.minted',
            'typing.milestone',
            'world.roomSpawned'
        ];
        return interestingTypes.includes(event.type);
    }

    async requestLibraryBlueprint(options = {}) {
        if (!this.architectBridge) {
            console.warn('[GamificationManager] Architect bridge unavailable.');
            return null;
        }
        return this.architectBridge.requestBlueprint(options);
    }

    applyLibraryBlueprint(blueprint) {
        if (!this.architectBridge) return false;
        const applied = this.architectBridge.applyBlueprint(blueprint);
        if (applied) {
            this.updateGamificationUI(true);
            if (this.explorerView) {
                this.explorerView.signalActivity('maze');
            }
        }
        return applied;
    }

    handleLiveWordDelta(delta, snippet = '') {
        if (delta <= 0) return;

        this.liveProgress.accumulatedWords += delta;
        if (snippet) {
            this.liveProgress.recentSnippet = snippet;
        }

        this.updateGamificationUI(true);

        let milestonesAwarded = 0;
        while (this.liveProgress.accumulatedWords >= this.liveProgress.shardInterval) {
            this.liveProgress.accumulatedWords -= this.liveProgress.shardInterval;
            milestonesAwarded += 1;
            const awardAmount = this.liveProgress.shardsPerInterval;
            this.awardXP(awardAmount, 'Writing momentum pulse');
            this.recordWorldEvent({
                type: 'typing.milestone',
                payload: {
                    awardAmount,
                    snippet: this.liveProgress.recentSnippet,
                    milestoneSize: this.liveProgress.shardInterval,
                    remaining: this.liveProgress.accumulatedWords
                }
            });
            this.spawnLibraryRoomFromSnippet(this.liveProgress.recentSnippet, awardAmount);
        }

        if (milestonesAwarded > 0) {
            this.liveProgress.lastMilestoneAt = Date.now();
            this.scheduleArchitectAutoBuild();
        }
    }

    spawnLibraryRoomFromSnippet(snippet, awardAmount = 0) {
        if (!this.worldEngine) return;

        const now = Date.now();

        const cleanSnippet = (snippet || '').trim();
        const words = cleanSnippet ? cleanSnippet.split(/\s+/).filter(Boolean) : [];
        const anchorId = this.worldEngine.worldState?.anchors?.flowAtrium?.unlocked ? 'flowAtrium' : 'scriptorium';
        const roomId = `scribe-${now}-${Math.floor(Math.random() * 1000)}`;

        const titleWords = words.slice(-3).map(w => this.capitalizeWord(w)).filter(Boolean);
        const title = titleWords.length ? titleWords.join(' ') : `Chamber ${new Date(now).toLocaleTimeString()}`;
        const description = cleanSnippet
            ? `Echoes of recent prose:\n${cleanSnippet.slice(-220)}`
            : 'An alcove formed from momentum, awaiting inscription.';

        const tagCandidates = words
            .filter(word => word.length > 4)
            .slice(-6)
            .map(word => word.toLowerCase());
        const thematicTags = Array.from(new Set(tagCandidates)).slice(-4);

        const room = {
            id: roomId,
            title,
            description,
            anchor: anchorId,
            unlockCost: {
                lexiconShards: 0,
                catalogueSigils: Math.max(1, Math.floor(awardAmount / 2)),
                architectTokens: 0
            },
            thematicTags
        };

        const corridor = {
            from: anchorId,
            to: roomId,
            description: 'A passage woven from your latest writing surge.'
        };

        const loreFragment = {
            id: `lore-${roomId}`,
            roomId,
            prose: cleanSnippet || 'A fragment awaiting its author.'
        };

        this.worldEngine.addRoom(room);
        this.worldEngine.addCorridor(corridor);
        this.worldEngine.addLoreFragment(loreFragment);

        this.recordWorldEvent({
            type: 'world.roomSpawned',
            payload: {
                roomId,
                anchor: anchorId,
                title,
                tags: thematicTags
            }
        });

        this.updateGamificationUI(true);
    }

    capitalizeWord(word) {
        if (!word) return '';
        const cleaned = word.replace(/[^a-zA-Z0-9'-]+/g, '');
        if (!cleaned) return '';
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
    }

    async scheduleArchitectAutoBuild() {
        if (!this.worldEngine?.peekArchitectQueue || !this.architectBridge) return;
        if (this.architectAutomation.inFlight) return;

        const pendingEntries = this.worldEngine.peekArchitectQueue();
        if (pendingEntries.length < this.architectAutomation.threshold) return;

        this.architectAutomation.inFlight = true;
        try {
            const blueprint = await this.requestLibraryBlueprint({
                context: {
                    pendingPrompts: pendingEntries.map(entry => entry.context?.event || entry),
                    trigger: 'auto'
                }
            });

            if (blueprint?.parsed) {
                const applied = this.applyLibraryBlueprint(blueprint.parsed);
                if (applied && typeof this.worldEngine.consumeArchitectQueue === 'function') {
                    const idsToConsume = pendingEntries.map(entry => entry.id);
                    this.worldEngine.consumeArchitectQueue(idsToConsume);
                }
            }
        } finally {
            this.architectAutomation.inFlight = false;
        }
    }
}

// Make available globally
window.GamificationManager = GamificationManager;

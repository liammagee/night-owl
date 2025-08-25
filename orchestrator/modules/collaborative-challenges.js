// === Collaborative Challenges & Leaderboards Module ===
// Enables writers to participate in shared challenges and compete on leaderboards
// Based on social learning theory and competitive motivation research

class CollaborativeChallenges {
    constructor(gamificationInstance) {
        this.gamification = gamificationInstance;
        this.initialized = false;
        
        // User identification for challenges
        this.userId = this.getUserId();
        this.username = this.getUsername();
        
        // Challenge data
        this.activeChallenges = new Map();
        this.completedChallenges = new Map();
        this.leaderboards = new Map();
        
        // Local storage for offline mode
        this.localChallenges = this.loadLocalChallenges();
        this.localLeaderboards = this.loadLocalLeaderboards();
        this.userStats = this.loadUserStats();
        
        // Challenge types and configurations
        this.challengeTypes = {
            DAILY_WORDS: {
                name: 'Daily Word Count',
                description: 'Write a target number of words in a day',
                icon: '📝',
                scoring: 'words',
                duration: 'daily'
            },
            WRITING_STREAK: {
                name: 'Writing Streak',
                description: 'Maintain consecutive days of writing',
                icon: '🔥',
                scoring: 'days',
                duration: 'ongoing'
            },
            FOCUS_TIME: {
                name: 'Focus Sessions',
                description: 'Complete focused writing sessions',
                icon: '⏰',
                scoring: 'minutes',
                duration: 'weekly'
            },
            WORD_SPRINT: {
                name: 'Word Sprint',
                description: 'Write as many words as possible in a time limit',
                icon: '⚡',
                scoring: 'words',
                duration: 'session'
            },
            CONSISTENCY: {
                name: 'Consistency Challenge',
                description: 'Write regularly over a period',
                icon: '📈',
                scoring: 'sessions',
                duration: 'monthly'
            },
            FLOW_STATE: {
                name: 'Flow State Master',
                description: 'Achieve and maintain flow states',
                icon: '🌊',
                scoring: 'flow_minutes',
                duration: 'weekly'
            }
        };
        
        // Leaderboard types
        this.leaderboardTypes = {
            GLOBAL_WORDS: 'global_total_words',
            GLOBAL_STREAKS: 'global_longest_streak',
            WEEKLY_WORDS: 'weekly_words',
            MONTHLY_FOCUS: 'monthly_focus_time',
            CHALLENGE_COMPLETIONS: 'challenge_completions'
        };
        
        this.init();
    }
    
    async init() {
        if (this.initialized) return;
        
        try {
            console.log('[Collaborative Challenges] Initializing...');
            
            // Initialize sample challenges for demonstration
            this.createSampleChallenges();
            
            // Start periodic updates
            this.startPeriodicUpdates();
            
            // Update leaderboards
            this.updateGlobalLeaderboards();
            
            this.initialized = true;
            console.log('[Collaborative Challenges] Initialized successfully');
            
        } catch (error) {
            console.error('[Collaborative Challenges] Initialization failed:', error);
        }
    }
    
    // === User Management ===
    
    getUserId() {
        let userId = localStorage.getItem('collaborative_user_id');
        if (!userId) {
            userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('collaborative_user_id', userId);
        }
        return userId;
    }
    
    getUsername() {
        let username = localStorage.getItem('collaborative_username');
        if (!username) {
            username = `Writer${Math.floor(Math.random() * 1000)}`;
            localStorage.setItem('collaborative_username', username);
        }
        return username;
    }
    
    setUsername(newUsername) {
        if (newUsername && newUsername.trim()) {
            this.username = newUsername.trim();
            localStorage.setItem('collaborative_username', this.username);
            this.updateUserStats();
            return true;
        }
        return false;
    }
    
    // === Data Persistence ===
    
    loadLocalChallenges() {
        const stored = localStorage.getItem('collaborative_challenges');
        return stored ? JSON.parse(stored) : {};
    }
    
    saveLocalChallenges() {
        localStorage.setItem('collaborative_challenges', JSON.stringify(Object.fromEntries(this.activeChallenges)));
    }
    
    loadLocalLeaderboards() {
        const stored = localStorage.getItem('collaborative_leaderboards');
        return stored ? JSON.parse(stored) : {};
    }
    
    saveLocalLeaderboards() {
        localStorage.setItem('collaborative_leaderboards', JSON.stringify(Object.fromEntries(this.leaderboards)));
    }
    
    loadUserStats() {
        const stored = localStorage.getItem('collaborative_user_stats');
        return stored ? JSON.parse(stored) : {
            totalChallengesCompleted: 0,
            totalWordsInChallenges: 0,
            totalFocusTimeInChallenges: 0,
            bestDailyWordCount: 0,
            longestChallengeStreak: 0,
            averageWordsPerChallenge: 0,
            challengeCompletionRate: 0,
            favoriteChallenge: null,
            joinDate: Date.now(),
            lastActive: Date.now()
        };
    }
    
    saveUserStats() {
        this.userStats.lastActive = Date.now();
        localStorage.setItem('collaborative_user_stats', JSON.stringify(this.userStats));
    }
    
    updateUserStats() {
        // Update comprehensive user statistics
        const challenges = Array.from(this.activeChallenges.values()).concat(Array.from(this.completedChallenges.values()));
        
        this.userStats.totalChallengesCompleted = this.completedChallenges.size;
        this.userStats.totalWordsInChallenges = challenges.reduce((total, challenge) => {
            return total + (challenge.userProgress?.words || 0);
        }, 0);
        
        this.userStats.totalFocusTimeInChallenges = challenges.reduce((total, challenge) => {
            return total + (challenge.userProgress?.focusTime || 0);
        }, 0);
        
        if (this.userStats.totalChallengesCompleted > 0) {
            this.userStats.averageWordsPerChallenge = Math.round(this.userStats.totalWordsInChallenges / this.userStats.totalChallengesCompleted);
        }
        
        this.saveUserStats();
    }
    
    // === Challenge Management ===
    
    createChallenge(config) {
        const challenge = {
            id: 'challenge_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            type: config.type,
            name: config.name || this.challengeTypes[config.type].name,
            description: config.description || this.challengeTypes[config.type].description,
            icon: config.icon || this.challengeTypes[config.type].icon,
            
            // Challenge parameters
            target: config.target || 1000, // Target value (words, minutes, etc.)
            duration: config.duration || 'daily', // daily, weekly, monthly, session
            startDate: config.startDate || Date.now(),
            endDate: config.endDate || this.calculateEndDate(config.duration, config.startDate),
            
            // Participation
            participants: new Map(),
            maxParticipants: config.maxParticipants || 100,
            
            // Status
            status: 'active', // active, completed, cancelled
            creator: this.userId,
            createdAt: Date.now(),
            
            // Progress tracking
            leaderboard: [],
            totalProgress: 0,
            
            // Rewards
            rewards: config.rewards || this.getDefaultRewards(config.type),
            
            // Social features
            allowComments: config.allowComments !== false,
            isPublic: config.isPublic !== false,
            tags: config.tags || []
        };
        
        // Add creator as first participant
        this.joinChallenge(challenge.id, challenge);
        
        this.activeChallenges.set(challenge.id, challenge);
        this.saveLocalChallenges();
        
        console.log(`[Challenges] Created challenge: ${challenge.name}`);
        return challenge;
    }
    
    joinChallenge(challengeId, challenge = null) {
        const targetChallenge = challenge || this.activeChallenges.get(challengeId);
        if (!targetChallenge) {
            console.error('[Challenges] Challenge not found:', challengeId);
            return false;
        }
        
        if (targetChallenge.participants.has(this.userId)) {
            console.log('[Challenges] Already participating in challenge');
            return false;
        }
        
        if (targetChallenge.participants.size >= targetChallenge.maxParticipants) {
            console.log('[Challenges] Challenge is full');
            return false;
        }
        
        const participation = {
            userId: this.userId,
            username: this.username,
            joinedAt: Date.now(),
            progress: 0,
            status: 'active',
            lastUpdate: Date.now(),
            dailyProgress: {},
            achievements: []
        };
        
        targetChallenge.participants.set(this.userId, participation);
        targetChallenge.userProgress = participation; // Quick reference for current user
        
        this.activeChallenges.set(challengeId, targetChallenge);
        this.saveLocalChallenges();
        
        console.log(`[Challenges] Joined challenge: ${targetChallenge.name}`);
        return true;
    }
    
    updateChallengeProgress(challengeId, progressData) {
        const challenge = this.activeChallenges.get(challengeId);
        if (!challenge || !challenge.participants.has(this.userId)) {
            return false;
        }
        
        const participation = challenge.participants.get(this.userId);
        const today = new Date().toDateString();
        
        // Update progress based on challenge type
        switch (challenge.type) {
            case 'DAILY_WORDS':
                participation.progress = Math.max(participation.progress, progressData.words || 0);
                participation.dailyProgress[today] = progressData.words || 0;
                break;
                
            case 'WRITING_STREAK':
                participation.progress = progressData.streakDays || 0;
                break;
                
            case 'FOCUS_TIME':
                participation.progress += progressData.focusMinutes || 0;
                break;
                
            case 'WORD_SPRINT':
                participation.progress = Math.max(participation.progress, progressData.words || 0);
                break;
                
            case 'CONSISTENCY':
                if (!participation.dailyProgress[today]) {
                    participation.progress += 1;
                    participation.dailyProgress[today] = true;
                }
                break;
                
            case 'FLOW_STATE':
                participation.progress += progressData.flowMinutes || 0;
                break;
        }
        
        participation.lastUpdate = Date.now();
        challenge.participants.set(this.userId, participation);
        challenge.userProgress = participation;
        
        // Check if challenge is completed
        this.checkChallengeCompletion(challengeId);
        
        // Update leaderboard
        this.updateChallengeLeaderboard(challengeId);
        
        this.saveLocalChallenges();
        return true;
    }
    
    checkChallengeCompletion(challengeId) {
        const challenge = this.activeChallenges.get(challengeId);
        if (!challenge) return false;
        
        const participation = challenge.participants.get(this.userId);
        if (!participation) return false;
        
        const isCompleted = participation.progress >= challenge.target;
        
        if (isCompleted && participation.status === 'active') {
            participation.status = 'completed';
            participation.completedAt = Date.now();
            
            // Award rewards
            this.awardChallengeRewards(challenge, participation);
            
            // Update user stats
            this.userStats.totalChallengesCompleted += 1;
            this.updateUserStats();
            
            // Move to completed challenges if all participants are done or time expired
            if (this.shouldArchiveChallenge(challenge)) {
                this.completedChallenges.set(challengeId, challenge);
                this.activeChallenges.delete(challengeId);
            }
            
            console.log(`[Challenges] Completed challenge: ${challenge.name}`);
            
            // Show completion notification
            if (window.showNotification) {
                window.showNotification(`🎉 Challenge Complete: ${challenge.name}!`, 'success');
            }
            
            return true;
        }
        
        return false;
    }
    
    shouldArchiveChallenge(challenge) {
        // Archive if past end date or all participants completed
        const isExpired = Date.now() > challenge.endDate;
        const allCompleted = Array.from(challenge.participants.values())
            .every(p => p.status === 'completed');
        
        return isExpired || allCompleted;
    }
    
    // === Leaderboard System ===
    
    updateChallengeLeaderboard(challengeId) {
        const challenge = this.activeChallenges.get(challengeId) || this.completedChallenges.get(challengeId);
        if (!challenge) return;
        
        const leaderboard = Array.from(challenge.participants.values())
            .sort((a, b) => b.progress - a.progress)
            .slice(0, 50) // Top 50
            .map((participant, index) => ({
                rank: index + 1,
                userId: participant.userId,
                username: participant.username,
                progress: participant.progress,
                status: participant.status,
                progressPercentage: Math.min(100, (participant.progress / challenge.target) * 100),
                lastUpdate: participant.lastUpdate
            }));
        
        challenge.leaderboard = leaderboard;
        
        // Update global leaderboards
        this.updateGlobalLeaderboards();
    }
    
    updateGlobalLeaderboards() {
        // Global word count leaderboard
        this.updateGlobalWordCountLeaderboard();
        
        // Global streak leaderboard
        this.updateGlobalStreakLeaderboard();
        
        // Weekly active writers
        this.updateWeeklyActiveLeaderboard();
        
        // Challenge completion leaders
        this.updateChallengeCompletionLeaderboard();
        
        this.saveLocalLeaderboards();
    }
    
    updateGlobalWordCountLeaderboard() {
        const userStats = this.getAllUserStats();
        const leaderboard = userStats
            .sort((a, b) => b.totalWords - a.totalWords)
            .slice(0, 100)
            .map((user, index) => ({
                rank: index + 1,
                username: user.username,
                totalWords: user.totalWords,
                level: this.calculateUserLevel(user.totalWords),
                lastActive: user.lastActive
            }));
        
        this.leaderboards.set('global_words', {
            type: 'global_words',
            title: 'Global Word Champions',
            icon: '🏆',
            data: leaderboard,
            lastUpdated: Date.now()
        });
    }
    
    updateGlobalStreakLeaderboard() {
        const userStats = this.getAllUserStats();
        const leaderboard = userStats
            .sort((a, b) => b.longestStreak - a.longestStreak)
            .slice(0, 100)
            .map((user, index) => ({
                rank: index + 1,
                username: user.username,
                longestStreak: user.longestStreak,
                currentStreak: user.currentStreak || 0,
                lastActive: user.lastActive
            }));
        
        this.leaderboards.set('global_streaks', {
            type: 'global_streaks',
            title: 'Streak Masters',
            icon: '🔥',
            data: leaderboard,
            lastUpdated: Date.now()
        });
    }
    
    updateWeeklyActiveLeaderboard() {
        const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const activeUsers = this.getAllUserStats()
            .filter(user => user.lastActive > weekAgo)
            .sort((a, b) => b.weeklyWords - a.weeklyWords)
            .slice(0, 50)
            .map((user, index) => ({
                rank: index + 1,
                username: user.username,
                weeklyWords: user.weeklyWords || 0,
                sessionsThisWeek: user.sessionsThisWeek || 0,
                lastActive: user.lastActive
            }));
        
        this.leaderboards.set('weekly_active', {
            type: 'weekly_active',
            title: 'This Week\'s Champions',
            icon: '📅',
            data: activeUsers,
            lastUpdated: Date.now()
        });
    }
    
    updateChallengeCompletionLeaderboard() {
        const userStats = this.getAllUserStats();
        const leaderboard = userStats
            .sort((a, b) => b.totalChallengesCompleted - a.totalChallengesCompleted)
            .slice(0, 50)
            .map((user, index) => ({
                rank: index + 1,
                username: user.username,
                challengesCompleted: user.totalChallengesCompleted,
                completionRate: user.challengeCompletionRate || 0,
                lastActive: user.lastActive
            }));
        
        this.leaderboards.set('challenge_completions', {
            type: 'challenge_completions',
            title: 'Challenge Champions',
            icon: '🎯',
            data: leaderboard,
            lastUpdated: Date.now()
        });
    }
    
    // === Sample Data & Demo Mode ===
    
    createSampleChallenges() {
        // Create some sample challenges for demonstration
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const weekFromNow = new Date(today);
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        
        // Daily word challenge
        this.createChallenge({
            type: 'DAILY_WORDS',
            name: 'Daily 500 Club',
            description: 'Write 500 words today',
            target: 500,
            duration: 'daily',
            endDate: tomorrow.getTime()
        });
        
        // Weekly focus challenge
        this.createChallenge({
            type: 'FOCUS_TIME',
            name: 'Focus Masters Weekly',
            description: 'Complete 120 minutes of focused writing this week',
            target: 120,
            duration: 'weekly',
            endDate: weekFromNow.getTime()
        });
        
        // Writing streak challenge
        this.createChallenge({
            type: 'WRITING_STREAK',
            name: 'November Streak Challenge',
            description: 'Write every day this month',
            target: 30,
            duration: 'monthly'
        });
        
        // Add some sample participants to challenges
        this.addSampleParticipants();
    }
    
    addSampleParticipants() {
        const sampleUsers = [
            { username: 'WriteWise', progress: Math.floor(Math.random() * 400) + 100 },
            { username: 'PenMaster', progress: Math.floor(Math.random() * 350) + 150 },
            { username: 'WordFlow', progress: Math.floor(Math.random() * 300) + 200 },
            { username: 'StorySeeker', progress: Math.floor(Math.random() * 450) + 50 },
            { username: 'ThoughtCraft', progress: Math.floor(Math.random() * 380) + 120 }
        ];
        
        // Add sample participants to each challenge
        for (const challenge of this.activeChallenges.values()) {
            sampleUsers.forEach(user => {
                const participation = {
                    userId: 'sample_' + user.username,
                    username: user.username,
                    joinedAt: Date.now() - Math.random() * 86400000, // Random time in last day
                    progress: Math.min(user.progress, challenge.target),
                    status: user.progress >= challenge.target ? 'completed' : 'active',
                    lastUpdate: Date.now() - Math.random() * 3600000, // Random time in last hour
                    dailyProgress: {},
                    achievements: []
                };
                
                challenge.participants.set(participation.userId, participation);
            });
            
            this.updateChallengeLeaderboard(challenge.id);
        }
        
        this.saveLocalChallenges();
    }
    
    // === Helper Methods ===
    
    calculateEndDate(duration, startDate = Date.now()) {
        const start = new Date(startDate);
        
        switch (duration) {
            case 'daily':
                start.setDate(start.getDate() + 1);
                break;
            case 'weekly':
                start.setDate(start.getDate() + 7);
                break;
            case 'monthly':
                start.setMonth(start.getMonth() + 1);
                break;
            case 'session':
                start.setTime(start.getTime() + (2 * 60 * 60 * 1000)); // 2 hours
                break;
            default:
                start.setDate(start.getDate() + 7); // Default to weekly
        }
        
        return start.getTime();
    }
    
    getDefaultRewards(challengeType) {
        const baseRewards = {
            xp: 100,
            badge: null,
            title: null
        };
        
        switch (challengeType) {
            case 'DAILY_WORDS':
                return { ...baseRewards, xp: 150, badge: 'Daily Writer' };
            case 'WRITING_STREAK':
                return { ...baseRewards, xp: 300, badge: 'Streak Master' };
            case 'FOCUS_TIME':
                return { ...baseRewards, xp: 200, badge: 'Focus Champion' };
            case 'WORD_SPRINT':
                return { ...baseRewards, xp: 120, badge: 'Speed Writer' };
            case 'CONSISTENCY':
                return { ...baseRewards, xp: 250, badge: 'Consistency King' };
            case 'FLOW_STATE':
                return { ...baseRewards, xp: 180, badge: 'Flow Master' };
            default:
                return baseRewards;
        }
    }
    
    awardChallengeRewards(challenge, participation) {
        const rewards = challenge.rewards;
        
        // Award XP through gamification system
        if (this.gamification && rewards.xp) {
            this.gamification.awardXP(rewards.xp, `Challenge: ${challenge.name}`);
        }
        
        // Award badge
        if (rewards.badge) {
            participation.achievements.push({
                type: 'badge',
                name: rewards.badge,
                earnedAt: Date.now(),
                challengeId: challenge.id
            });
        }
        
        console.log(`[Challenges] Awarded rewards for ${challenge.name}: ${rewards.xp} XP`);
    }
    
    getAllUserStats() {
        // In a real implementation, this would fetch from a server
        // For now, return sample data combined with current user
        const sampleStats = [
            {
                username: this.username,
                totalWords: this.userStats.totalWordsInChallenges,
                longestStreak: this.userStats.longestChallengeStreak,
                currentStreak: this.gamification?.streakData?.currentStreak || 0,
                totalChallengesCompleted: this.userStats.totalChallengesCompleted,
                challengeCompletionRate: this.userStats.challengeCompletionRate,
                weeklyWords: Math.floor(Math.random() * 2000) + 500,
                sessionsThisWeek: Math.floor(Math.random() * 10) + 2,
                lastActive: this.userStats.lastActive
            }
        ];
        
        // Add sample users for demonstration
        const sampleUsers = [
            'WriteWise', 'PenMaster', 'WordFlow', 'StorySeeker', 'ThoughtCraft',
            'ProsePoet', 'VerseVirtuoso', 'NarrativeNinja', 'ScriptSage', 'BookBuilder'
        ];
        
        sampleUsers.forEach(username => {
            sampleStats.push({
                username,
                totalWords: Math.floor(Math.random() * 50000) + 5000,
                longestStreak: Math.floor(Math.random() * 30) + 1,
                currentStreak: Math.floor(Math.random() * 15),
                totalChallengesCompleted: Math.floor(Math.random() * 20) + 1,
                challengeCompletionRate: Math.floor(Math.random() * 40) + 60,
                weeklyWords: Math.floor(Math.random() * 3000) + 200,
                sessionsThisWeek: Math.floor(Math.random() * 15) + 1,
                lastActive: Date.now() - Math.random() * 604800000 // Random time in last week
            });
        });
        
        return sampleStats;
    }
    
    calculateUserLevel(totalWords) {
        // Simple level calculation based on total words
        if (totalWords < 1000) return 1;
        if (totalWords < 5000) return 2;
        if (totalWords < 10000) return 3;
        if (totalWords < 25000) return 4;
        if (totalWords < 50000) return 5;
        return Math.floor(totalWords / 10000) + 1;
    }
    
    startPeriodicUpdates() {
        // DISABLED: Periodic updates to prevent background AI requests
        // setInterval(() => {
        //     this.updateGlobalLeaderboards();
        // }, 5 * 60 * 1000);
        
        // DISABLED: Check for expired challenges to prevent background AI requests
        // setInterval(() => {
        //     this.checkExpiredChallenges();
        // }, 60 * 60 * 1000);
        console.log('[Collaborative Challenges] ⏸️ Periodic updates disabled to prevent background AI requests');
    }
    
    checkExpiredChallenges() {
        const now = Date.now();
        
        for (const [challengeId, challenge] of this.activeChallenges) {
            if (now > challenge.endDate) {
                console.log(`[Challenges] Challenge expired: ${challenge.name}`);
                this.completedChallenges.set(challengeId, challenge);
                this.activeChallenges.delete(challengeId);
            }
        }
        
        this.saveLocalChallenges();
    }
    
    // === Integration with Gamification ===
    
    updateFromGamificationProgress() {
        if (!this.gamification) return;
        
        const gamificationStats = {
            words: this.gamification.sessionWordCount || 0,
            focusMinutes: this.gamification.focusSession?.duration ? 
                Math.floor(this.gamification.focusSession.duration / 60000) : 0,
            streakDays: this.gamification.streakData?.currentStreak || 0,
            flowMinutes: this.gamification.flowState?.flowDuration ? 
                Math.floor(this.gamification.flowState.flowDuration / 60000) : 0
        };
        
        // Update progress for all active challenges
        for (const challengeId of this.activeChallenges.keys()) {
            this.updateChallengeProgress(challengeId, gamificationStats);
        }
    }
    
    // === Public API ===
    
    getChallenges() {
        return {
            active: Array.from(this.activeChallenges.values()),
            completed: Array.from(this.completedChallenges.values())
        };
    }
    
    getLeaderboards() {
        return Array.from(this.leaderboards.values());
    }
    
    getUserProgress(challengeId) {
        const challenge = this.activeChallenges.get(challengeId);
        return challenge?.participants.get(this.userId) || null;
    }
    
    getChallengeById(challengeId) {
        return this.activeChallenges.get(challengeId) || this.completedChallenges.get(challengeId);
    }
    
    getAvailableChallengeTypes() {
        return Object.entries(this.challengeTypes).map(([key, type]) => ({
            id: key,
            ...type
        }));
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CollaborativeChallenges;
} else if (typeof window !== 'undefined') {
    window.CollaborativeChallenges = CollaborativeChallenges;
}
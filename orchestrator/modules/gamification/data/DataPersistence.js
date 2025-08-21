// === Data Persistence Layer ===
// Centralized storage management for gamification data

class DataPersistence {
    constructor() {
        this.storagePrefix = 'gamification_';
        this.storageKeys = {
            dailyStats: 'daily_stats',
            streakData: 'streak_data', 
            achievements: 'achievements',
            focusSettings: 'focus_settings',
            rewards: 'rewards',
            flowSessions: 'flow_sessions',
            goals: 'goals',
            xp: 'xp_data',
            specializations: 'specializations',
            prestige: 'prestige',
            analyticsData: 'analytics_data',
            insights: 'insights'
        };
    }

    // === Core Storage Methods ===

    load(key, defaultValue = null) {
        try {
            const stored = localStorage.getItem(this.storagePrefix + this.storageKeys[key]);
            return stored ? JSON.parse(stored) : defaultValue;
        } catch (error) {
            console.error(`[DataPersistence] Failed to load ${key}:`, error);
            return defaultValue;
        }
    }

    save(key, data) {
        try {
            localStorage.setItem(this.storagePrefix + this.storageKeys[key], JSON.stringify(data));
            return true;
        } catch (error) {
            console.error(`[DataPersistence] Failed to save ${key}:`, error);
            return false;
        }
    }

    remove(key) {
        try {
            localStorage.removeItem(this.storagePrefix + this.storageKeys[key]);
            return true;
        } catch (error) {
            console.error(`[DataPersistence] Failed to remove ${key}:`, error);
            return false;
        }
    }

    // === Specific Data Loaders ===

    loadDailyStats() {
        return this.load('dailyStats', {});
    }

    saveDailyStats(data) {
        return this.save('dailyStats', data);
    }

    loadStreakData() {
        return this.load('streakData', {
            currentStreak: 0,
            longestStreak: 0,
            lastWritingDay: null
        });
    }

    saveStreakData(data) {
        return this.save('streakData', data);
    }

    loadAchievements() {
        return this.load('achievements', {});
    }

    saveAchievements(data) {
        return this.save('achievements', data);
    }

    loadFocusSettings() {
        return this.load('focusSettings', {
            defaultDuration: 25 * 60 * 1000, // 25 minutes
            shortBreak: 5 * 60 * 1000,      // 5 minutes
            longBreak: 15 * 60 * 1000,      // 15 minutes
            autoStartBreaks: false,
            breakReminders: true
        });
    }

    saveFocusSettings(data) {
        return this.save('focusSettings', data);
    }

    loadRewards() {
        return this.load('rewards', {
            unlockedSounds: ['basic'],
            unlockedThemes: ['default'],
            availableRewards: [],
            pendingRewards: []
        });
    }

    saveRewards(data) {
        return this.save('rewards', data);
    }

    loadFlowSessions() {
        return this.load('flowSessions', []);
    }

    saveFlowSessions(data) {
        return this.save('flowSessions', data);
    }

    loadGoals() {
        return this.load('goals', {
            daily: { target: 500, current: 0 },
            weekly: { target: 3500, current: 0 },
            custom: []
        });
    }

    saveGoals(data) {
        return this.save('goals', data);
    }

    loadXP() {
        return this.load('xp', {
            currentXP: 0,
            currentLevel: 1,
            totalXPEarned: 0
        });
    }

    saveXP(data) {
        return this.save('xp', data);
    }

    loadSpecializations() {
        return this.load('specializations', {
            available: [],
            active: null,
            progress: {}
        });
    }

    saveSpecializations(data) {
        return this.save('specializations', data);
    }

    loadPrestige() {
        return this.load('prestige', {
            level: 0,
            points: 0,
            bonuses: []
        });
    }

    savePrestige(data) {
        return this.save('prestige', data);
    }

    loadAnalyticsData() {
        return this.load('analyticsData', {
            timeSlots: {},
            dayOfWeek: {},
            sessionTypes: {},
            velocityHistory: []
        });
    }

    saveAnalyticsData(data) {
        return this.save('analyticsData', data);
    }

    loadInsights() {
        return this.load('insights', {
            lastGenerated: null,
            productivity: {},
            patterns: {},
            recommendations: []
        });
    }

    saveInsights(data) {
        return this.save('insights', data);
    }

    // === Utility Methods ===

    exportAllData() {
        const exportData = {};
        
        Object.keys(this.storageKeys).forEach(key => {
            exportData[key] = this.load(key);
        });
        
        return {
            exportDate: new Date().toISOString(),
            version: '1.0',
            data: exportData
        };
    }

    importAllData(importData) {
        if (!importData.data) {
            throw new Error('Invalid import data format');
        }
        
        let successCount = 0;
        let errorCount = 0;
        
        Object.keys(importData.data).forEach(key => {
            if (this.storageKeys[key]) {
                if (this.save(key, importData.data[key])) {
                    successCount++;
                } else {
                    errorCount++;
                }
            }
        });
        
        return { successCount, errorCount };
    }

    clearAllData() {
        Object.keys(this.storageKeys).forEach(key => {
            this.remove(key);
        });
    }

    getStorageSize() {
        let totalSize = 0;
        
        Object.keys(this.storageKeys).forEach(key => {
            const stored = localStorage.getItem(this.storagePrefix + this.storageKeys[key]);
            if (stored) {
                totalSize += stored.length;
            }
        });
        
        return {
            bytes: totalSize,
            kb: Math.round(totalSize / 1024 * 100) / 100,
            mb: Math.round(totalSize / (1024 * 1024) * 100) / 100
        };
    }

    validateData(key, data) {
        // Basic validation - can be extended for specific data types
        if (data === null || data === undefined) {
            return false;
        }
        
        // Specific validations for different data types
        switch (key) {
            case 'dailyStats':
                return typeof data === 'object';
            case 'streakData':
                return data.hasOwnProperty('currentStreak') && 
                       data.hasOwnProperty('longestStreak');
            case 'achievements':
                return typeof data === 'object';
            case 'xp':
                return data.hasOwnProperty('currentXP') && 
                       typeof data.currentXP === 'number';
            default:
                return true; // Basic validation passed
        }
    }

    // === Migration Support ===

    migrateData(fromVersion, toVersion) {
        console.log(`[DataPersistence] Migrating data from version ${fromVersion} to ${toVersion}`);
        
        // Add migration logic here when needed
        // For now, just log the migration attempt
        
        return true;
    }
}

// Make available globally
window.DataPersistence = DataPersistence;
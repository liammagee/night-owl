// Behavioral tests for the gamification system
// These tests focus on user behaviors and system responses

describe('Gamification System Behavior', () => {
  let mockLocalStorage, mockAudioContext, mockGamification;
  
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = `
      <div id="gamification-panel">
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value" data-stat="words-today">0</div>
            <div class="stat-label">Words Today</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" data-stat="current-streak">0</div>
            <div class="stat-label">Current Streak</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" data-stat="total-points">0</div>
            <div class="stat-label">Total Points</div>
          </div>
        </div>
        <div class="gamification-actions">
          <button id="start-writing-session-btn">Start Writing Session</button>
          <button id="view-achievements-btn">View Achievements</button>
        </div>
      </div>
      <div id="notification-container"></div>
    `;

    // Mock localStorage
    mockLocalStorage = {
      data: {},
      getItem: jest.fn((key) => mockLocalStorage.data[key] || null),
      setItem: jest.fn((key, value) => { mockLocalStorage.data[key] = value; }),
      removeItem: jest.fn((key) => delete mockLocalStorage.data[key]),
      clear: jest.fn(() => { mockLocalStorage.data = {}; })
    };

    // Mock AudioContext
    mockAudioContext = {
      createOscillator: jest.fn(() => ({
        frequency: { setValueAtTime: jest.fn() },
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn()
      })),
      createGain: jest.fn(() => ({
        gain: { setValueAtTime: jest.fn() },
        connect: jest.fn()
      })),
      destination: {}
    };

    global.localStorage = mockLocalStorage;
    global.AudioContext = jest.fn(() => mockAudioContext);
    global.Date = Date;

    // Reset all mocks
    jest.clearAllMocks();
  });

  // Mock simplified gamification system for behavioral testing
  class MockGamificationSystem {
    constructor() {
      this.dailyStats = this.loadDailyStats();
      this.streakData = this.loadStreakData();
      this.achievements = this.loadAchievements();
      this.rewards = this.loadRewards();
      this.isWritingSession = false;
      this.sessionStartTime = null;
      this.sessionWordCount = 0;
      this.audioContext = new AudioContext();
    }

    loadDailyStats() {
      const stored = localStorage.getItem('gamification_daily_stats');
      return stored ? JSON.parse(stored) : {};
    }

    saveDailyStats() {
      localStorage.setItem('gamification_daily_stats', JSON.stringify(this.dailyStats));
    }

    loadStreakData() {
      const stored = localStorage.getItem('gamification_streak_data');
      return stored ? JSON.parse(stored) : { currentStreak: 0, longestStreak: 0, lastWritingDate: null };
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

    loadRewards() {
      const stored = localStorage.getItem('gamification_rewards');
      return stored ? JSON.parse(stored) : { totalPoints: 0, badges: {} };
    }

    saveRewards() {
      localStorage.setItem('gamification_rewards', JSON.stringify(this.rewards));
    }

    startWritingSession() {
      if (this.isWritingSession) return false;
      
      this.isWritingSession = true;
      this.sessionStartTime = Date.now();
      this.sessionWordCount = 0;
      
      this.showNotification('🎯 Writing session started! Focus mode activated.', 'success');
      this.updateUI();
      
      return true;
    }

    endWritingSession() {
      if (!this.isWritingSession) return;
      
      const sessionDuration = Date.now() - this.sessionStartTime;
      const sessionMinutes = Math.floor(sessionDuration / 60000);
      
      if (sessionMinutes >= 5) { // Minimum 5 minutes for valid session
        this.processSessionRewards(sessionDuration, this.sessionWordCount);
        this.updateDailyStats(sessionDuration, this.sessionWordCount);
        this.checkAchievements();
        this.updateStreak();
      }
      
      this.isWritingSession = false;
      this.sessionStartTime = null;
      this.sessionWordCount = 0;
      
      this.showNotification(`✅ Writing session completed! ${sessionMinutes} minutes`, 'success');
      this.updateUI();
    }

    trackWordCount(wordCount) {
      if (this.isWritingSession) {
        const wordsAdded = Math.max(0, wordCount - this.sessionWordCount);
        this.sessionWordCount = wordCount;
        
        if (wordsAdded > 0) {
          this.awardPoints(wordsAdded, 'Words written');
        }
      }
    }

    awardPoints(amount, reason) {
      this.rewards.totalPoints += amount;
      this.saveRewards();
      this.updateUI();
      
      if (amount >= 10) {
        this.showNotification(`+${amount} points: ${reason}`, 'points');
      }
    }

    updateDailyStats(duration, wordCount) {
      const today = new Date().toDateString();
      
      if (!this.dailyStats[today]) {
        this.dailyStats[today] = {
          sessions: [],
          totalWords: 0,
          totalDuration: 0,
          longestSession: 0,
          avgWordsPerMinute: 0
        };
      }
      
      const dayStats = this.dailyStats[today];
      dayStats.sessions.push({
        startTime: this.sessionStartTime,
        duration: duration,
        wordCount: wordCount
      });
      
      dayStats.totalWords += wordCount;
      dayStats.totalDuration += duration;
      dayStats.longestSession = Math.max(dayStats.longestSession, duration);
      
      if (dayStats.totalDuration > 0) {
        dayStats.avgWordsPerMinute = Math.round((dayStats.totalWords / dayStats.totalDuration) * 60000);
      }
      
      this.saveDailyStats();
    }

    updateStreak() {
      const today = new Date().toDateString();
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();
      
      if (this.streakData.lastWritingDate === yesterday) {
        this.streakData.currentStreak += 1;
      } else if (this.streakData.lastWritingDate !== today) {
        this.streakData.currentStreak = 1;
      }
      
      this.streakData.longestStreak = Math.max(
        this.streakData.longestStreak, 
        this.streakData.currentStreak
      );
      this.streakData.lastWritingDate = today;
      
      this.saveStreakData();
    }

    checkAchievements() {
      const totalWords = this.getTotalWords();
      const newAchievements = [];
      
      // Word count achievements
      const wordMilestones = [100, 500, 1000, 5000];
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
      const streakMilestones = [3, 7, 14, 30];
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
      
      if (newAchievements.length > 0) {
        this.saveAchievements();
        newAchievements.forEach(achievement => {
          this.showAchievementNotification(achievement);
          this.awardPoints(50, `Achievement: ${achievement.title}`);
        });
      }
    }

    getTotalWords() {
      return Object.values(this.dailyStats).reduce((total, day) => total + day.totalWords, 0);
    }

    showNotification(message, type = 'info') {
      const container = document.getElementById('notification-container');
      if (!container) return;
      
      const notification = document.createElement('div');
      notification.className = `notification ${type}`;
      notification.textContent = message;
      container.appendChild(notification);
      
      // Auto-remove after 3 seconds
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 3000);
    }

    showAchievementNotification(achievement) {
      this.showNotification(`🏆 Achievement Unlocked: ${achievement.title}`, 'achievement');
      this.playSound('achievement');
    }

    playSound(type) {
      try {
        const ctx = this.audioContext;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        if (type === 'achievement') {
          oscillator.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
          gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        }
        
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.2);
      } catch (error) {
        // Silently fail if audio context is not available
      }
    }

    updateUI() {
      // Update stats display
      const today = new Date().toDateString();
      const todayStats = this.dailyStats[today];
      
      const wordsToday = todayStats ? todayStats.totalWords : 0;
      const currentStreak = this.streakData.currentStreak;
      const totalPoints = this.rewards.totalPoints;
      
      const wordsElement = document.querySelector('[data-stat="words-today"]');
      const streakElement = document.querySelector('[data-stat="current-streak"]');
      const pointsElement = document.querySelector('[data-stat="total-points"]');
      
      if (wordsElement) wordsElement.textContent = wordsToday;
      if (streakElement) streakElement.textContent = currentStreak;
      if (pointsElement) pointsElement.textContent = totalPoints;
    }

    showStatsModal() {
      const totalWords = this.getTotalWords();
      const totalSessions = Object.values(this.dailyStats).reduce((total, day) => total + day.sessions.length, 0);
      const achievementCount = Object.keys(this.achievements).length;
      
      alert(`📊 Writing Statistics
      
Total Words: ${totalWords}
Total Sessions: ${totalSessions}
Current Streak: ${this.streakData.currentStreak} days
Longest Streak: ${this.streakData.longestStreak} days
Achievements: ${achievementCount}
Total Points: ${this.rewards.totalPoints}`);
    }
  }

  describe('Writing Session Behavior', () => {
    let gamification;

    beforeEach(() => {
      gamification = new MockGamificationSystem();
    });

    test('should start a writing session when user clicks start button', () => {
      const result = gamification.startWritingSession();
      
      expect(result).toBe(true);
      expect(gamification.isWritingSession).toBe(true);
      expect(gamification.sessionStartTime).toBeTruthy();
      
      // Should show notification
      const notifications = document.querySelectorAll('.notification');
      expect(notifications).toHaveLength(1);
      expect(notifications[0].textContent).toContain('Writing session started');
    });

    test('should not allow starting multiple sessions simultaneously', () => {
      gamification.startWritingSession();
      const result = gamification.startWritingSession();
      
      expect(result).toBe(false);
      expect(gamification.isWritingSession).toBe(true);
    });

    test('should end writing session and award points for valid session', () => {
      gamification.startWritingSession();
      
      // Simulate 6 minutes passing
      gamification.sessionStartTime = Date.now() - (6 * 60 * 1000);
      gamification.sessionWordCount = 150;
      
      const initialPoints = gamification.rewards.totalPoints;
      gamification.endWritingSession();
      
      expect(gamification.isWritingSession).toBe(false);
      expect(gamification.rewards.totalPoints).toBeGreaterThan(initialPoints);
      
      // Should update daily stats
      const today = new Date().toDateString();
      expect(gamification.dailyStats[today]).toBeTruthy();
      expect(gamification.dailyStats[today].sessions).toHaveLength(1);
    });

    test('should not award points for sessions shorter than 5 minutes', () => {
      gamification.startWritingSession();
      
      // Simulate 3 minutes passing
      gamification.sessionStartTime = Date.now() - (3 * 60 * 1000);
      gamification.sessionWordCount = 50;
      
      const initialStats = Object.keys(gamification.dailyStats).length;
      gamification.endWritingSession();
      
      expect(gamification.isWritingSession).toBe(false);
      expect(Object.keys(gamification.dailyStats)).toHaveLength(initialStats);
    });

    test('should track word count during active session', () => {
      gamification.startWritingSession();
      
      const initialPoints = gamification.rewards.totalPoints;
      gamification.trackWordCount(25);
      
      expect(gamification.sessionWordCount).toBe(25);
      expect(gamification.rewards.totalPoints).toBe(initialPoints + 25);
    });

    test('should not award points for word count when not in session', () => {
      const initialPoints = gamification.rewards.totalPoints;
      gamification.trackWordCount(50);
      
      expect(gamification.rewards.totalPoints).toBe(initialPoints);
    });
  });

  describe('Achievement System Behavior', () => {
    let gamification;

    beforeEach(() => {
      gamification = new MockGamificationSystem();
    });

    test('should unlock word count achievements progressively', () => {
      // Simulate reaching 500 words
      const today = new Date().toDateString();
      gamification.dailyStats[today] = { totalWords: 500, sessions: [], totalDuration: 0, longestSession: 0, avgWordsPerMinute: 0 };
      
      gamification.checkAchievements();
      
      expect(gamification.achievements.words_100).toBeTruthy();
      expect(gamification.achievements.words_500).toBeTruthy();
      expect(gamification.achievements.words_1000).toBeFalsy();
      
      expect(gamification.achievements.words_500.title).toBe('500 Words Written');
      expect(gamification.achievements.words_500.type).toBe('milestone');
    });

    test('should unlock streak achievements', () => {
      gamification.streakData.currentStreak = 7;
      
      gamification.checkAchievements();
      
      expect(gamification.achievements.streak_3).toBeTruthy();
      expect(gamification.achievements.streak_7).toBeTruthy();
      expect(gamification.achievements.streak_14).toBeFalsy();
      
      expect(gamification.achievements.streak_7.title).toBe('7 Day Streak');
      expect(gamification.achievements.streak_7.type).toBe('streak');
    });

    test('should not unlock the same achievement twice', () => {
      gamification.achievements.words_100 = { title: 'Existing', date: new Date() };
      
      const today = new Date().toDateString();
      gamification.dailyStats[today] = { totalWords: 200, sessions: [], totalDuration: 0, longestSession: 0, avgWordsPerMinute: 0 };
      
      const initialAchievements = Object.keys(gamification.achievements).length;
      gamification.checkAchievements();
      
      // Should only add the new achievement (words_100 already exists)
      expect(Object.keys(gamification.achievements).length).toBe(initialAchievements);
      expect(gamification.achievements.words_100.title).toBe('Existing');
    });

    test('should show achievement notifications with sound', () => {
      const today = new Date().toDateString();
      gamification.dailyStats[today] = { totalWords: 100, sessions: [], totalDuration: 0, longestSession: 0, avgWordsPerMinute: 0 };
      
      const playSoundSpy = jest.spyOn(gamification, 'playSound');
      gamification.checkAchievements();
      
      const notifications = document.querySelectorAll('.notification.achievement');
      expect(notifications).toHaveLength(1);
      expect(notifications[0].textContent).toContain('Achievement Unlocked');
      expect(playSoundSpy).toHaveBeenCalledWith('achievement');
    });

    test('should award bonus points for achievements', () => {
      const initialPoints = gamification.rewards.totalPoints;
      
      const today = new Date().toDateString();
      gamification.dailyStats[today] = { totalWords: 100, sessions: [], totalDuration: 0, longestSession: 0, avgWordsPerMinute: 0 };
      
      gamification.checkAchievements();
      
      // Should award 50 points for the achievement
      expect(gamification.rewards.totalPoints).toBe(initialPoints + 50);
    });
  });

  describe('Streak System Behavior', () => {
    let gamification;

    beforeEach(() => {
      gamification = new MockGamificationSystem();
    });

    test('should start new streak on first writing day', () => {
      gamification.updateStreak();
      
      expect(gamification.streakData.currentStreak).toBe(1);
      expect(gamification.streakData.longestStreak).toBe(1);
      expect(gamification.streakData.lastWritingDate).toBe(new Date().toDateString());
    });

    test('should continue streak on consecutive days', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();
      gamification.streakData.lastWritingDate = yesterday;
      gamification.streakData.currentStreak = 5;
      gamification.streakData.longestStreak = 5;
      
      gamification.updateStreak();
      
      expect(gamification.streakData.currentStreak).toBe(6);
      expect(gamification.streakData.longestStreak).toBe(6);
    });

    test('should reset streak when missing a day', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toDateString();
      gamification.streakData.lastWritingDate = twoDaysAgo;
      gamification.streakData.currentStreak = 5;
      gamification.streakData.longestStreak = 10;
      
      gamification.updateStreak();
      
      expect(gamification.streakData.currentStreak).toBe(1);
      expect(gamification.streakData.longestStreak).toBe(10); // Should preserve longest
    });

    test('should not change streak when writing multiple times same day', () => {
      const today = new Date().toDateString();
      gamification.streakData.lastWritingDate = today;
      gamification.streakData.currentStreak = 3;
      
      gamification.updateStreak();
      
      expect(gamification.streakData.currentStreak).toBe(3);
    });
  });

  describe('UI Feedback Behavior', () => {
    let gamification;

    beforeEach(() => {
      gamification = new MockGamificationSystem();
    });

    test('should update UI stats display', () => {
      const today = new Date().toDateString();
      gamification.dailyStats[today] = { totalWords: 250, sessions: [], totalDuration: 0, longestSession: 0, avgWordsPerMinute: 0 };
      gamification.streakData.currentStreak = 5;
      gamification.rewards.totalPoints = 150;
      
      gamification.updateUI();
      
      expect(document.querySelector('[data-stat="words-today"]').textContent).toBe('250');
      expect(document.querySelector('[data-stat="current-streak"]').textContent).toBe('5');
      expect(document.querySelector('[data-stat="total-points"]').textContent).toBe('150');
    });

    test('should display zero stats for new user', () => {
      gamification.updateUI();
      
      expect(document.querySelector('[data-stat="words-today"]').textContent).toBe('0');
      expect(document.querySelector('[data-stat="current-streak"]').textContent).toBe('0');
      expect(document.querySelector('[data-stat="total-points"]').textContent).toBe('0');
    });

    test('should show comprehensive stats modal', () => {
      // Set up some data
      const today = new Date().toDateString();
      gamification.dailyStats[today] = { 
        totalWords: 300, 
        sessions: [{ duration: 600000, wordCount: 300 }],
        totalDuration: 600000,
        longestSession: 600000,
        avgWordsPerMinute: 30
      };
      gamification.streakData = { currentStreak: 3, longestStreak: 7 };
      gamification.achievements = { words_100: {}, streak_3: {} };
      gamification.rewards.totalPoints = 400;
      
      // Mock alert
      global.alert = jest.fn();
      
      gamification.showStatsModal();
      
      expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('Total Words: 300'));
      expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('Current Streak: 3'));
      expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('Achievements: 2'));
    });

    test('should show notifications with auto-removal', (done) => {
      gamification.showNotification('Test message', 'info');
      
      const notifications = document.querySelectorAll('.notification');
      expect(notifications).toHaveLength(1);
      expect(notifications[0].textContent).toBe('Test message');
      expect(notifications[0].classList.contains('info')).toBe(true);
      
      // Check that notification is removed after timeout
      setTimeout(() => {
        const notificationsAfter = document.querySelectorAll('.notification');
        expect(notificationsAfter).toHaveLength(0);
        done();
      }, 3100);
    });
  });

  describe('Data Persistence Behavior', () => {
    let gamification;

    beforeEach(() => {
      gamification = new MockGamificationSystem();
    });

    test('should persist daily stats', () => {
      const today = new Date().toDateString();
      gamification.dailyStats[today] = { totalWords: 200, sessions: [], totalDuration: 0, longestSession: 0, avgWordsPerMinute: 0 };
      
      gamification.saveDailyStats();
      
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'gamification_daily_stats',
        JSON.stringify(gamification.dailyStats)
      );
    });

    test('should persist streak data', () => {
      gamification.streakData.currentStreak = 5;
      
      gamification.saveStreakData();
      
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'gamification_streak_data',
        JSON.stringify(gamification.streakData)
      );
    });

    test('should persist achievements', () => {
      gamification.achievements.words_100 = { title: 'Test Achievement' };
      
      gamification.saveAchievements();
      
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'gamification_achievements',
        JSON.stringify(gamification.achievements)
      );
    });

    test('should load existing data on initialization', () => {
      mockLocalStorage.data['gamification_daily_stats'] = JSON.stringify({
        '2024-01-01': { totalWords: 500, sessions: [] }
      });
      mockLocalStorage.data['gamification_streak_data'] = JSON.stringify({
        currentStreak: 10, longestStreak: 15
      });
      
      const newGamification = new MockGamificationSystem();
      
      expect(newGamification.dailyStats['2024-01-01'].totalWords).toBe(500);
      expect(newGamification.streakData.currentStreak).toBe(10);
    });

    test('should handle missing localStorage data gracefully', () => {
      // Clear all localStorage data
      mockLocalStorage.data = {};
      
      const newGamification = new MockGamificationSystem();
      
      expect(newGamification.dailyStats).toEqual({});
      expect(newGamification.streakData.currentStreak).toBe(0);
      expect(newGamification.achievements).toEqual({});
      expect(newGamification.rewards.totalPoints).toBe(0);
    });
  });
});
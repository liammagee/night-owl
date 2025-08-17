// === TODO Gamification System ===
// Adds points, reminders, achievements, and AI suggestions to Kanban TODO boards

class TodoGamification {
    constructor(gamificationInstance) {
        this.gamification = gamificationInstance;
        this.initialized = false;
        
        // TODO scoring system
        this.scoring = {
            taskCreated: 5,
            taskCompleted: 10,
            taskCompletedOnTime: 15,
            taskCompletedEarly: 20,
            streakBonus: 5, // Per day in streak
            urgentTaskCompleted: 25,
            weeklyGoalMet: 50
        };
        
        // TODO achievements
        this.achievements = {
            taskMaster: { name: 'Task Master', description: 'Complete 10 tasks', icon: '🏆', threshold: 10 },
            speedRunner: { name: 'Speed Runner', description: 'Complete 5 tasks in one day', icon: '⚡', threshold: 5 },
            planner: { name: 'Master Planner', description: 'Create 20 tasks', icon: '📋', threshold: 20 },
            streakKeeper: { name: 'Streak Keeper', description: 'Complete tasks 7 days in a row', icon: '🔥', threshold: 7 },
            earlyBird: { name: 'Early Bird', description: 'Complete 10 tasks ahead of schedule', icon: '🐦', threshold: 10 },
            organizer: { name: 'Organizer', description: 'Use 3 different TODO lists', icon: '📁', threshold: 3 }
        };
        
        // Reminder system
        this.reminders = {
            enabled: true,
            intervals: [
                { type: 'urgent', hours: 1 },
                { type: 'daily', hours: 24 },
                { type: 'weekly', hours: 168 }
            ],
            lastCheck: Date.now()
        };
        
        // AI suggestion system
        this.aiSuggestions = {
            enabled: true,
            lastGenerated: 0,
            cooldown: 3600000, // 1 hour
            maxSuggestions: 5,
            contextKeywords: []
        };
        
        // User statistics
        this.stats = this.loadStats();
        
        this.init();
    }
    
    async init() {
        if (this.initialized) return;
        
        try {
            console.log('[TODO Gamification] Initializing TODO gamification system...');
            
            // Set up reminders
            this.setupReminders();
            
            // Initialize AI suggestions
            this.setupAISuggestions();
            
            // Set up event listeners for TODO interactions
            this.setupTodoEventListeners();
            
            // Load and display gamification UI
            this.createGamificationUI();
            
            this.initialized = true;
            console.log('[TODO Gamification] TODO gamification system initialized successfully');
            
        } catch (error) {
            console.error('[TODO Gamification] Initialization failed:', error);
        }
    }
    
    // === Event Handlers ===
    
    setupTodoEventListeners() {
        // Listen for kanban updates
        document.addEventListener('kanbanTaskAdded', (e) => {
            this.handleTaskCreated(e.detail);
        });
        
        document.addEventListener('kanbanTaskCompleted', (e) => {
            this.handleTaskCompleted(e.detail);
        });
        
        document.addEventListener('kanbanTaskMoved', (e) => {
            this.handleTaskMoved(e.detail);
        });
        
        document.addEventListener('kanbanBoardRendered', (e) => {
            this.handleBoardRendered(e.detail);
        });
    }
    
    handleTaskCreated(taskData) {
        const points = this.scoring.taskCreated;
        this.awardPoints(points, `Created task: ${taskData.text}`);
        this.updateStats('tasksCreated', 1);
        this.checkAchievements();
        
        // Log for AI learning
        this.logTaskAction('created', taskData);
    }
    
    handleTaskCompleted(taskData) {
        let points = this.scoring.taskCompleted;
        let reason = `Completed task: ${taskData.text}`;
        
        // Check for bonus conditions
        if (this.isTaskUrgent(taskData)) {
            points = this.scoring.urgentTaskCompleted;
            reason += ' (Urgent!)';
        } else if (this.isTaskCompletedEarly(taskData)) {
            points = this.scoring.taskCompletedEarly;
            reason += ' (Early!)';
        } else if (this.isTaskCompletedOnTime(taskData)) {
            points = this.scoring.taskCompletedOnTime;
            reason += ' (On time!)';
        }
        
        // Streak bonus
        const streak = this.updateCompletionStreak();
        if (streak > 1) {
            const streakBonus = this.scoring.streakBonus * Math.min(streak, 7);
            points += streakBonus;
            reason += ` +${streakBonus} streak bonus`;
        }
        
        this.awardPoints(points, reason);
        this.updateStats('tasksCompleted', 1);
        this.updateStats('totalPointsFromTodos', points);
        
        // Show celebration effect
        this.showTaskCompletionEffect(taskData, points);
        
        this.checkAchievements();
        this.logTaskAction('completed', taskData, { points, streak });
    }
    
    handleTaskMoved(taskData) {
        const { from, to, task } = taskData;
        
        if (to === 'done') {
            this.handleTaskCompleted(task);
        } else if (from === 'todo' && to === 'inprogress') {
            this.awardPoints(2, `Started working on: ${task.text}`);
            this.logTaskAction('started', task);
        }
    }
    
    handleBoardRendered(boardData) {
        // Track TODO list usage
        if (boardData.filePath) {
            const fileName = boardData.filePath.split('/').pop() || 'unknown';
            this.stats.todoListsUsed.add(fileName);
            this.saveStats();
        }
        
        // Update gamification UI when board changes
        this.updateGamificationDisplay();
        
        // Generate AI suggestions if needed
        this.checkAndGenerateAISuggestions(boardData);
        
        // Set up reminders for tasks
        this.setupTaskReminders(boardData);
    }
    
    // === Points and Achievements ===
    
    awardPoints(points, reason) {
        if (this.gamification) {
            this.gamification.awardXP(points, reason);
        }
        
        // Also track in local stats
        this.stats.totalPoints += points;
        this.saveStats();
    }
    
    updateCompletionStreak() {
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        
        if (this.stats.lastCompletionDate === today) {
            // Already completed today, don't update streak
            return this.stats.completionStreak;
        } else if (this.stats.lastCompletionDate === yesterday) {
            // Continued streak
            this.stats.completionStreak++;
        } else {
            // Streak broken or first completion
            this.stats.completionStreak = 1;
        }
        
        this.stats.lastCompletionDate = today;
        this.saveStats();
        
        return this.stats.completionStreak;
    }
    
    checkAchievements() {
        Object.entries(this.achievements).forEach(([key, achievement]) => {
            if (this.stats.unlockedAchievements.includes(key)) return;
            
            let achieved = false;
            
            switch (key) {
                case 'taskMaster':
                    achieved = this.stats.tasksCompleted >= achievement.threshold;
                    break;
                case 'speedRunner':
                    achieved = this.getTodayCompletedTasks() >= achievement.threshold;
                    break;
                case 'planner':
                    achieved = this.stats.tasksCreated >= achievement.threshold;
                    break;
                case 'streakKeeper':
                    achieved = this.stats.completionStreak >= achievement.threshold;
                    break;
                case 'earlyBird':
                    achieved = this.stats.earlyCompletions >= achievement.threshold;
                    break;
                case 'organizer':
                    achieved = this.stats.todoListsUsed.size >= achievement.threshold;
                    break;
            }
            
            if (achieved) {
                this.unlockAchievement(key, achievement);
            }
        });
    }
    
    unlockAchievement(key, achievement) {
        this.stats.unlockedAchievements.push(key);
        this.saveStats();
        
        // Award bonus points
        const bonusPoints = 50;
        this.awardPoints(bonusPoints, `Achievement unlocked: ${achievement.name}`);
        
        // Show achievement notification
        this.showAchievementNotification(achievement);
        
        console.log(`[TODO Gamification] Achievement unlocked: ${achievement.name}`);
    }
    
    // === Reminders System ===
    
    setupReminders() {
        // Check for reminders every 15 minutes
        setInterval(() => {
            this.checkReminders();
        }, 900000);
        
        // Initial check
        setTimeout(() => this.checkReminders(), 5000);
    }
    
    checkReminders() {
        if (!this.reminders.enabled) return;
        
        const now = Date.now();
        if (now - this.reminders.lastCheck < 900000) return; // 15 minutes cooldown
        
        this.reminders.lastCheck = now;
        
        // Get current tasks
        const kanbanBoard = document.querySelector('.kanban-board');
        if (!kanbanBoard) return;
        
        const tasks = this.extractTasksFromBoard(kanbanBoard);
        
        // Check for tasks needing reminders
        const urgentTasks = tasks.filter(task => this.shouldRemindUrgent(task));
        const staleTasks = tasks.filter(task => this.shouldRemindStale(task));
        
        if (urgentTasks.length > 0) {
            this.showReminderNotification('urgent', urgentTasks);
        }
        
        if (staleTasks.length > 0) {
            this.showReminderNotification('stale', staleTasks);
        }
    }
    
    shouldRemindUrgent(task) {
        // Check if task has urgent keywords
        const urgentKeywords = ['urgent', 'asap', 'deadline', 'due', 'important', '!'];
        return urgentKeywords.some(keyword => 
            task.text.toLowerCase().includes(keyword)
        );
    }
    
    shouldRemindStale(task) {
        // Check if task has been in progress for too long
        const taskAge = this.getTaskAge(task);
        return task.status === 'inprogress' && taskAge > 86400000 * 3; // 3 days
    }
    
    showReminderNotification(type, tasks) {
        const taskList = tasks.map(t => `• ${t.text}`).join('\\n');
        let message = '';
        
        if (type === 'urgent') {
            message = `⚠️ Urgent tasks need attention:\\n${taskList}`;
        } else if (type === 'stale') {
            message = `📌 These tasks have been in progress for a while:\\n${taskList}`;
        }
        
        if (window.showNotification) {
            window.showNotification(message, 'info');
        }
        
        // Log reminder
        console.log(`[TODO Gamification] Reminder: ${type}`, tasks);
    }
    
    // === AI Suggestions System ===
    
    setupAISuggestions() {
        // Generate suggestions when board is idle
        this.suggestionTimer = null;
    }
    
    async checkAndGenerateAISuggestions(boardData) {
        if (!this.aiSuggestions.enabled) return;
        
        const now = Date.now();
        if (now - this.aiSuggestions.lastGenerated < this.aiSuggestions.cooldown) return;
        
        // Clear existing timer
        if (this.suggestionTimer) {
            clearTimeout(this.suggestionTimer);
        }
        
        // Wait a bit to see if user is still actively editing
        this.suggestionTimer = setTimeout(() => {
            this.generateAISuggestions(boardData);
        }, 30000); // 30 seconds of inactivity
    }
    
    async generateAISuggestions(boardData) {
        try {
            const context = await this.extractTodoContext();
            const currentTasks = this.extractTasksFromBoard(document.querySelector('.kanban-board'));
            
            if (!context && currentTasks.length === 0) return;
            
            const suggestions = await this.callAIForSuggestions(context, currentTasks);
            
            if (suggestions && suggestions.length > 0) {
                this.displayAISuggestions(suggestions);
                this.aiSuggestions.lastGenerated = Date.now();
            }
            
        } catch (error) {
            console.warn('[TODO Gamification] AI suggestions failed:', error);
        }
    }
    
    async extractTodoContext() {
        // Look for context in the document header
        const editor = window.editor;
        if (!editor) return null;
        
        const content = editor.getValue();
        const lines = content.split('\\n');
        
        // Look for context block in first 10 lines
        let contextBlock = '';
        let inContextBlock = false;
        
        for (let i = 0; i < Math.min(10, lines.length); i++) {
            const line = lines[i].trim();
            
            if (line.match(/^#+.*TODO.*CONTEXT|^#+.*CONTEXT.*TODO/i)) {
                inContextBlock = true;
                continue;
            } else if (line.startsWith('#') && inContextBlock) {
                break; // End of context block
            } else if (inContextBlock && line) {
                contextBlock += line + ' ';
            }
        }
        
        return contextBlock.trim() || null;
    }
    
    async callAIForSuggestions(context, currentTasks) {
        // Check if AI chat is available
        if (!window.sendChatMessage) {
            console.log('[TODO Gamification] AI chat not available for suggestions');
            return [];
        }
        
        const taskList = currentTasks.map(t => `${t.status}: ${t.text}`).join('\\n');
        
        const prompt = `Based on this TODO context: "${context || 'General task management'}"
        
Current tasks:
${taskList || 'No current tasks'}

Suggest ${this.aiSuggestions.maxSuggestions} specific, actionable TODO items that would complement the existing tasks. Format as a simple list:
1. Task description
2. Task description
etc.

Keep suggestions practical and relevant to the context. Don't repeat existing tasks.`;

        try {
            // Send request to AI (this would need to be integrated with the existing AI system)
            console.log('[TODO Gamification] Requesting AI suggestions...');
            
            // For now, return sample suggestions
            return [
                'Review and prioritize current tasks',
                'Set deadlines for pending items',
                'Break down complex tasks into subtasks',
                'Schedule time blocks for focused work',
                'Identify dependencies between tasks'
            ];
            
        } catch (error) {
            console.error('[TODO Gamification] AI suggestion request failed:', error);
            return [];
        }
    }
    
    displayAISuggestions(suggestions) {
        // Create suggestion panel
        const panel = this.createSuggestionPanel(suggestions);
        document.body.appendChild(panel);
        
        // Auto-hide after 30 seconds
        setTimeout(() => {
            if (panel.parentNode) {
                panel.remove();
            }
        }, 30000);
    }
    
    createSuggestionPanel(suggestions) {
        const panel = document.createElement('div');
        panel.className = 'ai-todo-suggestions';
        panel.innerHTML = `
            <div class="suggestion-header">
                <h4>🤖 AI Task Suggestions</h4>
                <button class="close-suggestions">×</button>
            </div>
            <div class="suggestion-list">
                ${suggestions.map((suggestion, index) => `
                    <div class="suggestion-item">
                        <span class="suggestion-text">${suggestion}</span>
                        <button class="add-suggestion" data-suggestion="${suggestion}">+ Add</button>
                    </div>
                `).join('')}
            </div>
            <div class="suggestion-footer">
                <button class="refresh-suggestions">🔄 Refresh</button>
                <button class="disable-suggestions">⚙️ Settings</button>
            </div>
        `;
        
        // Add event listeners
        panel.querySelector('.close-suggestions').onclick = () => panel.remove();
        panel.querySelector('.refresh-suggestions').onclick = () => {
            panel.remove();
            this.generateAISuggestions();
        };
        
        panel.querySelectorAll('.add-suggestion').forEach(btn => {
            btn.onclick = () => this.addSuggestedTask(btn.dataset.suggestion);
        });
        
        return panel;
    }
    
    addSuggestedTask(suggestion) {
        // Add task to the TODO column
        const kanbanBoard = document.querySelector('.kanban-board');
        if (!kanbanBoard) return;
        
        const todoColumn = kanbanBoard.querySelector('[data-column="todo"]');
        if (!todoColumn) return;
        
        // Find the add task button and simulate click
        const addTaskBtn = todoColumn.querySelector('.add-task-btn');
        if (addTaskBtn) {
            addTaskBtn.click();
            
            // Wait a moment then fill in the suggestion
            setTimeout(() => {
                const newTaskInput = todoColumn.querySelector('.kanban-task-edit input');
                if (newTaskInput) {
                    newTaskInput.value = suggestion;
                    newTaskInput.dispatchEvent(new Event('blur'));
                }
            }, 100);
        }
        
        // Award points for using AI suggestion
        this.awardPoints(3, `Added AI suggested task: ${suggestion}`);
    }
    
    // === UI Components ===
    
    createGamificationUI() {
        // Add gamification stats to kanban board
        const statsPanel = this.createStatsPanel();
        
        // Insert after kanban board if it exists
        const kanbanBoard = document.querySelector('.kanban-board');
        if (kanbanBoard && kanbanBoard.parentNode) {
            kanbanBoard.parentNode.insertBefore(statsPanel, kanbanBoard.nextSibling);
        }
    }
    
    createStatsPanel() {
        const panel = document.createElement('div');
        panel.className = 'todo-gamification-stats';
        panel.innerHTML = `
            <div class="stats-header">📊 TODO Progress</div>
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-value">${this.stats.tasksCompleted}</span>
                    <span class="stat-label">Completed</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${this.stats.completionStreak}</span>
                    <span class="stat-label">Day Streak</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${this.stats.totalPoints}</span>
                    <span class="stat-label">Points</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${this.stats.unlockedAchievements.length}</span>
                    <span class="stat-label">Achievements</span>
                </div>
            </div>
            <div class="achievement-preview">
                ${this.getRecentAchievements().map(a => `<span class="achievement-badge">${a.icon} ${a.name}</span>`).join('')}
            </div>
        `;
        
        return panel;
    }
    
    updateGamificationDisplay() {
        const panel = document.querySelector('.todo-gamification-stats');
        if (!panel) return;
        
        // Update stat values
        panel.querySelector('.stat-item:nth-child(1) .stat-value').textContent = this.stats.tasksCompleted;
        panel.querySelector('.stat-item:nth-child(2) .stat-value').textContent = this.stats.completionStreak;
        panel.querySelector('.stat-item:nth-child(3) .stat-value').textContent = this.stats.totalPoints;
        panel.querySelector('.stat-item:nth-child(4) .stat-value').textContent = this.stats.unlockedAchievements.length;
        
        // Update achievements
        const achievementPreview = panel.querySelector('.achievement-preview');
        achievementPreview.innerHTML = this.getRecentAchievements()
            .map(a => `<span class="achievement-badge">${a.icon} ${a.name}</span>`)
            .join('');
    }
    
    showTaskCompletionEffect(task, points) {
        // Create floating points animation
        const effect = document.createElement('div');
        effect.className = 'task-completion-effect';
        effect.textContent = `+${points}`;
        effect.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            color: #4caf50;
            font-weight: bold;
            font-size: 24px;
            pointer-events: none;
            z-index: 10000;
            animation: floatUp 2s ease-out forwards;
        `;
        
        document.body.appendChild(effect);
        
        setTimeout(() => effect.remove(), 2000);
    }
    
    showAchievementNotification(achievement) {
        if (window.showNotification) {
            window.showNotification(
                `🏆 Achievement Unlocked: ${achievement.icon} ${achievement.name}`, 
                'success'
            );
        }
    }
    
    // === Helper Methods ===
    
    extractTasksFromBoard(board) {
        if (!board) return [];
        
        const tasks = [];
        board.querySelectorAll('.kanban-task').forEach(taskEl => {
            const text = taskEl.querySelector('.kanban-task-text')?.textContent || '';
            const status = taskEl.closest('.kanban-tasks')?.dataset.column || 'todo';
            const id = taskEl.dataset.taskId || '';
            
            tasks.push({ id, text, status, element: taskEl });
        });
        
        return tasks;
    }
    
    getTodayCompletedTasks() {
        const today = new Date().toDateString();
        return this.stats.dailyCompletions[today] || 0;
    }
    
    getTaskAge(task) {
        // Simple implementation - could be enhanced with actual task timestamps
        return Date.now() - (Date.now() - 86400000); // Placeholder
    }
    
    getRecentAchievements() {
        return this.stats.unlockedAchievements
            .slice(-3)
            .map(key => this.achievements[key])
            .filter(Boolean);
    }
    
    isTaskUrgent(task) {
        const urgentKeywords = ['urgent', 'asap', 'deadline', 'due', 'important', '!!!'];
        return urgentKeywords.some(keyword => 
            task.text.toLowerCase().includes(keyword)
        );
    }
    
    isTaskCompletedEarly(task) {
        // Simple implementation - could be enhanced with deadline parsing
        return task.text.toLowerCase().includes('early') || 
               task.text.toLowerCase().includes('ahead');
    }
    
    isTaskCompletedOnTime(task) {
        // Simple implementation - could be enhanced with deadline parsing
        return task.text.toLowerCase().includes('deadline') || 
               task.text.toLowerCase().includes('due');
    }
    
    updateStats(key, value) {
        if (typeof this.stats[key] === 'number') {
            this.stats[key] += value;
        } else {
            this.stats[key] = value;
        }
        
        // Update daily completions
        if (key === 'tasksCompleted') {
            const today = new Date().toDateString();
            this.stats.dailyCompletions[today] = (this.stats.dailyCompletions[today] || 0) + value;
        }
        
        this.saveStats();
    }
    
    logTaskAction(action, task, extra = {}) {
        console.log(`[TODO Gamification] Task ${action}:`, {
            action,
            task: task.text,
            timestamp: new Date().toISOString(),
            ...extra
        });
    }
    
    // === Data Persistence ===
    
    loadStats() {
        const stored = localStorage.getItem('todo_gamification_stats');
        if (stored) {
            const parsed = JSON.parse(stored);
            // Convert Array back to Set
            parsed.todoListsUsed = new Set(parsed.todoListsUsed || []);
            return parsed;
        }
        
        return {
            tasksCreated: 0,
            tasksCompleted: 0,
            totalPoints: 0,
            completionStreak: 0,
            lastCompletionDate: null,
            dailyCompletions: {},
            earlyCompletions: 0,
            unlockedAchievements: [],
            todoListsUsed: new Set()
        };
    }
    
    saveStats() {
        // Convert Set to Array for JSON serialization
        const statsToSave = {
            ...this.stats,
            todoListsUsed: Array.from(this.stats.todoListsUsed)
        };
        
        localStorage.setItem('todo_gamification_stats', JSON.stringify(statsToSave));
    }
    
    // === Public API ===
    
    getStats() {
        return { ...this.stats };
    }
    
    resetStats() {
        this.stats = this.loadStats();
        localStorage.removeItem('todo_gamification_stats');
        this.updateGamificationDisplay();
    }
    
    toggleReminders(enabled) {
        this.reminders.enabled = enabled;
        console.log(`[TODO Gamification] Reminders ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    toggleAISuggestions(enabled) {
        this.aiSuggestions.enabled = enabled;
        console.log(`[TODO Gamification] AI suggestions ${enabled ? 'enabled' : 'disabled'}`);
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.TodoGamification = TodoGamification;
}
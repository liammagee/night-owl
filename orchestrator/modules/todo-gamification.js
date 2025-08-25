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
            cooldown: 300000, // 5 minutes for better testing
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
        const { from, to, text, id, filePath } = taskData;
        
        // Create task object for compatibility with other methods
        const task = { text, id, filePath };
        
        if (to === 'done') {
            this.handleTaskCompleted(task);
        } else if (from === 'todo' && to === 'inprogress') {
            this.awardPoints(2, `Started working on: ${text}`);
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
    
    setupTaskReminders(boardData) {
        // Set up task-specific reminders based on board data
        if (!boardData || !boardData.tasksByColumn) return;
        
        const allTasks = [];
        Object.values(boardData.tasksByColumn).forEach(columnTasks => {
            allTasks.push(...columnTasks);
        });
        
        // Store current tasks for reminder checking
        this.currentTasks = allTasks.map(task => ({
            id: task.id,
            text: task.text,
            status: task.status,
            filePath: boardData.filePath,
            lastSeen: Date.now()
        }));
        
        console.log(`[TODO Gamification] Set up reminders for ${allTasks.length} tasks`);
    }
    
    // === AI Suggestions System ===
    
    setupAISuggestions() {
        // Generate suggestions when board is idle
        this.suggestionTimer = null;
    }
    
    async checkAndGenerateAISuggestions(boardData) {
        console.log('[TODO Gamification] Checking AI suggestions...', {
            enabled: this.aiSuggestions.enabled,
            cooldownRemaining: this.aiSuggestions.cooldown - (Date.now() - this.aiSuggestions.lastGenerated),
            boardData
        });
        
        if (!this.aiSuggestions.enabled) {
            console.log('[TODO Gamification] AI suggestions disabled');
            return;
        }
        
        const now = Date.now();
        const timeSinceLastGenerated = now - this.aiSuggestions.lastGenerated;
        if (timeSinceLastGenerated < this.aiSuggestions.cooldown) {
            console.log('[TODO Gamification] Still in cooldown period:', {
                timeSinceLastGenerated,
                cooldown: this.aiSuggestions.cooldown
            });
            return;
        }
        
        // Clear existing timer
        if (this.suggestionTimer) {
            clearTimeout(this.suggestionTimer);
        }
        
        // Reduce wait time for testing - Wait a bit to see if user is still actively editing
        this.suggestionTimer = setTimeout(() => {
            console.log('[TODO Gamification] Generating AI suggestions after timeout...');
            this.generateAISuggestions(boardData);
        }, 5000); // Reduced to 5 seconds for better user experience
    }
    
    async generateAISuggestions(boardData) {
        try {
            console.log('[TODO Gamification] Starting AI suggestion generation...');
            
            const context = await this.extractTodoContext();
            const currentTasks = this.extractTasksFromBoard(document.querySelector('.kanban-board'));
            
            console.log('[TODO Gamification] Extracted data:', {
                context,
                contextSource: context ? 'extracted' : 'none found',
                filePath: window.currentFilePath,
                currentTasksCount: currentTasks.length,
                currentTasks: currentTasks.map(t => t.text)
            });
            
            // Always generate suggestions, even if no context or tasks
            const suggestions = await this.callAIForSuggestions(context, currentTasks);
            
            console.log('[TODO Gamification] Generated suggestions:', suggestions);
            
            if (suggestions && suggestions.length > 0) {
                this.displayAISuggestions(suggestions);
                this.aiSuggestions.lastGenerated = Date.now();
                console.log('[TODO Gamification] AI suggestions displayed successfully');
            } else {
                console.log('[TODO Gamification] No suggestions to display');
            }
            
        } catch (error) {
            console.error('[TODO Gamification] AI suggestions failed:', error);
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
        
        // If no explicit context found, try to infer from filename and content
        if (!contextBlock.trim()) {
            contextBlock = this.inferContextFromContent(content, window.currentFilePath);
        }
        
        return contextBlock.trim() || null;
    }
    
    inferContextFromContent(content, filePath) {
        let inferredContext = '';
        
        // Analyze filename for context clues
        if (filePath) {
            const fileName = filePath.split('/').pop().toLowerCase();
            
            if (fileName.includes('lecture')) {
                inferredContext += 'Educational content and lecture preparation. ';
            }
            if (fileName.includes('research')) {
                inferredContext += 'Research and academic work. ';
            }
            if (fileName.includes('project')) {
                inferredContext += 'Project management and development. ';
            }
            if (fileName.includes('dev') || fileName.includes('code')) {
                inferredContext += 'Software development and programming. ';
            }
        }
        
        // Analyze content for domain-specific keywords
        const contentLower = content.toLowerCase();
        const keywordAnalysis = {
            education: ['lecture', 'teaching', 'student', 'course', 'curriculum', 'pedagogy', 'learning'],
            development: ['code', 'programming', 'development', 'software', 'application', 'feature', 'bug', 'testing'],
            research: ['research', 'analysis', 'study', 'investigation', 'methodology', 'data', 'results'],
            philosophy: ['philosophy', 'hegel', 'dialectic', 'phenomenology', 'concept', 'thesis', 'antithesis'],
            presentation: ['presentation', 'slide', 'powerpoint', 'export', 'template', 'format'],
            ai: ['ai', 'artificial intelligence', 'machine learning', 'automation', 'intelligent']
        };
        
        // Count keyword occurrences
        const domainScores = {};
        Object.entries(keywordAnalysis).forEach(([domain, keywords]) => {
            domainScores[domain] = keywords.reduce((score, keyword) => {
                const regex = new RegExp(keyword, 'gi');
                const matches = contentLower.match(regex);
                return score + (matches ? matches.length : 0);
            }, 0);
        });
        
        // Find dominant domains
        const topDomains = Object.entries(domainScores)
            .filter(([domain, score]) => score > 0)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 2);
        
        // Generate context description
        topDomains.forEach(([domain, score]) => {
            switch (domain) {
                case 'education':
                    inferredContext += 'Educational content, teaching materials, and pedagogy. ';
                    break;
                case 'development':
                    inferredContext += 'Software development, programming, and technical implementation. ';
                    break;
                case 'research':
                    inferredContext += 'Academic research, analysis, and scholarly work. ';
                    break;
                case 'philosophy':
                    inferredContext += 'Philosophical analysis, Hegelian concepts, and theoretical work. ';
                    break;
                case 'presentation':
                    inferredContext += 'Presentation creation, slide development, and content formatting. ';
                    break;
                case 'ai':
                    inferredContext += 'Artificial intelligence, automation, and intelligent systems. ';
                    break;
            }
        });
        
        return inferredContext.trim();
    }
    
    async callAIForSuggestions(context, currentTasks) {
        // Check if AI chat is available
        if (!window.sendChatMessage) {
            console.log('[TODO Gamification] AI chat not available, generating offline suggestions');
            return this.generateOfflineSuggestions(context, currentTasks);
        }
        
        try {
            const taskList = currentTasks.map(t => `${t.status}: ${t.text}`).join('\\n');
            
            const prompt = `Based on this TODO context: "${context || 'General task management'}"
            
Current tasks:
${taskList || 'No current tasks'}

Suggest ${this.aiSuggestions.maxSuggestions} specific, actionable TODO items that would complement the existing tasks. Format as a simple list:
1. Task description
2. Task description
etc.

Keep suggestions practical and relevant to the context. Don't repeat existing tasks.`;

            // Send request to AI (this would need to be integrated with the existing AI system)
            console.log('[TODO Gamification] Requesting AI suggestions...');
            
            // TODO: Integrate with actual AI service
            // For now, return contextual offline suggestions
            return this.generateOfflineSuggestions(context, currentTasks);
            
        } catch (error) {
            console.error('[TODO Gamification] AI suggestion request failed, falling back to offline suggestions:', error);
            return this.generateOfflineSuggestions(context, currentTasks);
        }
    }
    
    generateOfflineSuggestions(context, currentTasks) {
        console.log('[TODO Gamification] Generating offline contextual suggestions...');
        
        const suggestions = [];
        const existingTaskTexts = currentTasks.map(t => t.text.toLowerCase());
        
        // Base suggestions that work for any project
        const baseSuggestions = [
            'Review and prioritize current tasks',
            'Set deadlines for pending items',
            'Break down complex tasks into subtasks',
            'Schedule time blocks for focused work',
            'Identify dependencies between tasks',
            'Create backup plan for critical tasks',
            'Document progress and lessons learned',
            'Prepare materials needed for next tasks',
            'Review completed tasks for improvements',
            'Plan communication with stakeholders'
        ];
        
        // Context-specific suggestions
        const contextSuggestions = this.generateContextualSuggestions(context, currentTasks);
        
        // Task-pattern based suggestions
        const patternSuggestions = this.generatePatternBasedSuggestions(currentTasks);
        
        // Combine all suggestions and filter out duplicates
        const allSuggestions = [...contextSuggestions, ...patternSuggestions, ...baseSuggestions];
        
        // Filter out suggestions that are too similar to existing tasks
        const filteredSuggestions = allSuggestions.filter(suggestion => {
            const suggestionWords = suggestion.toLowerCase().split(' ');
            return !existingTaskTexts.some(taskText => {
                const taskWords = taskText.split(' ');
                const overlap = suggestionWords.filter(word => taskWords.includes(word));
                return overlap.length > 2; // Avoid if more than 2 words overlap
            });
        });
        
        // Return up to maxSuggestions unique suggestions
        const uniqueSuggestions = [...new Set(filteredSuggestions)];
        return uniqueSuggestions.slice(0, this.aiSuggestions.maxSuggestions);
    }
    
    generateContextualSuggestions(context, currentTasks) {
        const suggestions = [];
        
        if (!context) return suggestions;
        
        const contextLower = context.toLowerCase();
        
        // AI/Technology context
        if (contextLower.includes('ai') || contextLower.includes('artificial intelligence') || 
            contextLower.includes('machine learning') || contextLower.includes('technology')) {
            suggestions.push(
                'Research latest AI developments and trends',
                'Test AI tools for current workflow',
                'Document AI implementation best practices',
                'Review AI ethics and guidelines'
            );
        }
        
        // Educational/Pedagogy context
        if (contextLower.includes('education') || contextLower.includes('pedagogy') || 
            contextLower.includes('teaching') || contextLower.includes('learning') ||
            contextLower.includes('lecture') || contextLower.includes('course')) {
            suggestions.push(
                'Create learning objectives and outcomes',
                'Design assessment criteria',
                'Gather student feedback and iterate',
                'Research pedagogical best practices',
                'Prepare interactive lecture activities',
                'Design course materials and handouts',
                'Create practice exercises for students',
                'Plan lecture timing and pacing'
            );
        }
        
        // Development/Software context
        if (contextLower.includes('development') || contextLower.includes('programming') || 
            contextLower.includes('software') || contextLower.includes('code') ||
            contextLower.includes('feature') || contextLower.includes('application')) {
            suggestions.push(
                'Write comprehensive unit tests',
                'Document API and code architecture',
                'Optimize performance bottlenecks',
                'Implement error handling and logging',
                'Create user documentation',
                'Set up continuous integration',
                'Plan code review process',
                'Design database schema updates'
            );
        }
        
        // Presentation/Export context
        if (contextLower.includes('presentation') || contextLower.includes('slide') || 
            contextLower.includes('export') || contextLower.includes('template') ||
            contextLower.includes('powerpoint') || contextLower.includes('format')) {
            suggestions.push(
                'Design consistent slide templates',
                'Create engaging visual elements',
                'Plan presentation flow and transitions',
                'Prepare speaker notes and cues',
                'Test export functionality across formats',
                'Optimize presentation for different audiences',
                'Create backup presentation formats',
                'Design interactive presentation elements'
            );
        }
        
        // Philosophy context (especially Hegel)
        if (contextLower.includes('philosophy') || contextLower.includes('hegel') || 
            contextLower.includes('dialectic') || contextLower.includes('phenomenology')) {
            suggestions.push(
                'Analyze dialectical relationships in concepts',
                'Create conceptual maps and connections',
                'Review primary philosophical sources',
                'Develop philosophical arguments and critiques'
            );
        }
        
        // Research context
        if (contextLower.includes('research') || contextLower.includes('study') || 
            contextLower.includes('analysis') || contextLower.includes('investigation')) {
            suggestions.push(
                'Conduct literature review',
                'Define research methodology',
                'Collect and organize data sources',
                'Plan research validation steps'
            );
        }
        
        // Writing context
        if (contextLower.includes('writing') || contextLower.includes('documentation') || 
            contextLower.includes('paper') || contextLower.includes('article')) {
            suggestions.push(
                'Create detailed outline',
                'Draft introduction and conclusion',
                'Review and edit for clarity',
                'Cite sources and references'
            );
        }
        
        return suggestions;
    }
    
    generatePatternBasedSuggestions(currentTasks) {
        const suggestions = [];
        
        if (currentTasks.length === 0) {
            return [
                'Define project goals and objectives',
                'Create initial project timeline',
                'List required resources and materials',
                'Identify key stakeholders and contacts'
            ];
        }
        
        // Analyze task patterns
        const todoTasks = currentTasks.filter(t => t.status === 'todo');
        const inProgressTasks = currentTasks.filter(t => t.status === 'inprogress');
        const doneTasks = currentTasks.filter(t => t.status === 'done');
        
        // If too many in-progress tasks
        if (inProgressTasks.length > 3) {
            suggestions.push('Focus on completing current in-progress tasks');
            suggestions.push('Review task priorities to avoid multitasking');
        }
        
        // If few TODO tasks but many done
        if (todoTasks.length < 2 && doneTasks.length > 3) {
            suggestions.push('Plan next phase of work');
            suggestions.push('Add follow-up tasks based on completed work');
        }
        
        // Look for common task patterns
        const taskTexts = currentTasks.map(t => t.text.toLowerCase());
        
        if (taskTexts.some(text => text.includes('test') || text.includes('review'))) {
            suggestions.push('Create comprehensive testing checklist');
        }
        
        if (taskTexts.some(text => text.includes('document') || text.includes('write'))) {
            suggestions.push('Plan documentation structure and format');
        }
        
        if (taskTexts.some(text => text.includes('design') || text.includes('create'))) {
            suggestions.push('Gather feedback on design decisions');
        }
        
        return suggestions;
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
        
        panel.querySelector('.disable-suggestions').onclick = () => {
            // Open AI settings dialog
            if (window.openSettingsDialog) {
                panel.remove();
                window.openSettingsDialog('ai');
            } else {
                console.warn('[TODO Gamification] Settings dialog not available');
                // Fallback: toggle AI suggestions
                this.toggleAISuggestions(!this.aiSuggestions.enabled);
                if (window.showNotification) {
                    window.showNotification(
                        `AI suggestions ${this.aiSuggestions.enabled ? 'enabled' : 'disabled'}`, 
                        'info'
                    );
                }
            }
        };
        
        panel.querySelectorAll('.add-suggestion').forEach(btn => {
            btn.onclick = async () => {
                btn.disabled = true;
                btn.textContent = '⏳';
                btn.style.opacity = '0.6';
                
                try {
                    await this.addSuggestedTask(btn.dataset.suggestion);
                } catch (error) {
                    // Reset button on error
                    btn.disabled = false;
                    btn.textContent = '+ Add';
                    btn.style.opacity = '1';
                }
            };
        });
        
        return panel;
    }
    
    async addSuggestedTask(suggestion) {
        try {
            // Get current file path from kanban board
            const kanbanBoard = document.querySelector('.kanban-board');
            if (!kanbanBoard) {
                throw new Error('Kanban board not found');
            }
            
            const filePath = kanbanBoard.dataset.filePath;
            if (!filePath) {
                throw new Error('No file path found for current kanban board');
            }
            
            // Directly add task to file using kanban's addTaskToFile function
            if (typeof window.addTaskToFile === 'function') {
                await window.addTaskToFile(filePath, suggestion, 'todo');
            } else {
                // Fallback: call the function directly
                await addTaskToFile(filePath, suggestion, 'todo');
            }
            
            // Show success notification
            if (window.showNotification) {
                window.showNotification(`AI suggestion added: ${suggestion}`, 'success');
            }
            
            // Dispatch task created event for gamification
            const taskData = { text: suggestion, status: 'todo', filePath };
            document.dispatchEvent(new CustomEvent('kanbanTaskAdded', { detail: taskData }));
            
            // Award points for using AI suggestion
            this.awardPoints(3, `Added AI suggested task: ${suggestion}`);
            
            // Refresh the editor and kanban board to show the new task (following kanban.js pattern)
            console.log('[TODO Gamification] Refreshing UI...', {
                currentFilePath: window.currentFilePath,
                targetFilePath: filePath,
                filePathsMatch: window.currentFilePath === filePath,
                refreshCurrentFileExists: !!window.refreshCurrentFile
            });
            
            if (window.currentFilePath === filePath) {
                if (window.refreshCurrentFile) {
                    console.log('[TODO Gamification] Calling refreshCurrentFile...');
                    await window.refreshCurrentFile();
                    if (window.editor) {
                        window.lastSavedContent = window.editor.getValue();
                        window.hasUnsavedChanges = false;
                        if (window.updateUnsavedIndicator) {
                            window.updateUnsavedIndicator(false);
                        }
                    }
                    console.log('[TODO Gamification] refreshCurrentFile completed');
                }
            } else {
                console.log('[TODO Gamification] File paths do not match, skipping refresh');
            }
            
            // Force kanban board to refresh by resetting state
            console.log('[TODO Gamification] Forcing kanban board refresh...', {
                resetKanbanStateExists: !!window.resetKanbanState,
                updatePreviewAndStructureExists: !!window.updatePreviewAndStructure
            });
            
            if (window.resetKanbanState) {
                console.log('[TODO Gamification] Resetting kanban state...');
                window.resetKanbanState();
            }
            
            // Trigger a preview update to show the new task
            if (window.updatePreviewAndStructure) {
                setTimeout(() => {
                    console.log('[TODO Gamification] Calling updatePreviewAndStructure...');
                    // Pass editor content if available, otherwise let the function handle it
                    const content = window.editor && window.editor.getValue ? window.editor.getValue() : undefined;
                    window.updatePreviewAndStructure(content);
                    console.log('[TODO Gamification] updatePreviewAndStructure called');
                }, 100);
            } else {
                console.log('[TODO Gamification] updatePreviewAndStructure not available');
            }
            
            // Close the suggestion panel after successful addition
            const suggestionPanel = document.querySelector('.ai-todo-suggestions');
            if (suggestionPanel) {
                suggestionPanel.remove();
            }
            
        } catch (error) {
            console.error('[TODO Gamification] Error adding suggested task:', error);
            
            if (window.showNotification) {
                window.showNotification(`Failed to add suggestion: ${error.message}`, 'error');
            }
        }
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
            <div class="gamification-actions">
                <button class="ai-suggestions-btn" title="Generate AI task suggestions">🤖 Get AI Suggestions</button>
            </div>
        `;
        
        // Add event listener for AI suggestions button
        const aiBtn = panel.querySelector('.ai-suggestions-btn');
        if (aiBtn) {
            aiBtn.onclick = () => {
                console.log('[TODO Gamification] Manual AI suggestions trigger');
                aiBtn.disabled = true;
                aiBtn.textContent = '⏳ Generating...';
                
                // Force generation bypassing cooldown
                this.generateAISuggestionsNow().finally(() => {
                    aiBtn.disabled = false;
                    aiBtn.textContent = '🤖 Get AI Suggestions';
                });
            };
        }
        
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
    
    // === Manual AI Suggestions Trigger ===
    
    async generateAISuggestionsNow() {
        // Force generation without cooldown check
        try {
            console.log('[TODO Gamification] Force generating AI suggestions...');
            
            const context = await this.extractTodoContext();
            const currentTasks = this.extractTasksFromBoard(document.querySelector('.kanban-board'));
            
            console.log('[TODO Gamification] Extracted data:', {
                context,
                contextSource: context ? 'extracted' : 'none found',
                filePath: window.currentFilePath,
                currentTasksCount: currentTasks.length,
                currentTasks: currentTasks.map(t => t.text)
            });
            
            const suggestions = await this.callAIForSuggestions(context, currentTasks);
            
            console.log('[TODO Gamification] Generated suggestions:', suggestions);
            
            if (suggestions && suggestions.length > 0) {
                this.displayAISuggestions(suggestions);
                this.aiSuggestions.lastGenerated = Date.now();
                console.log('[TODO Gamification] AI suggestions displayed successfully');
            } else {
                console.log('[TODO Gamification] No suggestions to display');
                if (window.showNotification) {
                    window.showNotification('No AI suggestions available at this time', 'info');
                }
            }
            
        } catch (error) {
            console.error('[TODO Gamification] AI suggestions failed:', error);
            if (window.showNotification) {
                window.showNotification('Failed to generate AI suggestions', 'error');
            }
        }
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
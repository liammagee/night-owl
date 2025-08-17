// === Collaborative Challenges & Leaderboards UI Module ===
// UI components and interactions for collaborative writing challenges

class ChallengesUI {
    constructor(challengesInstance, gamificationInstance) {
        this.challenges = challengesInstance;
        this.gamification = gamificationInstance;
        this.currentModal = null;
        this.activeTab = 'active';
        this.selectedChallengeType = null;
        
        this.init();
    }
    
    init() {
        // Add challenges button to gamification controls if not already present
        this.addChallengesButton();
        
        // Set up periodic UI updates
        this.startPeriodicUpdates();
        
        console.log('[Challenges UI] Initialized');
    }
    
    addChallengesButton() {
        const toolbar = document.querySelector('.gamification-controls');
        if (!toolbar) return;
        
        // Check if button already exists
        if (document.getElementById('challenges-btn')) return;
        
        const challengesBtn = document.createElement('button');
        challengesBtn.id = 'challenges-btn';
        challengesBtn.className = 'btn btn-info';
        challengesBtn.innerHTML = '🏆 Challenges';
        challengesBtn.title = 'View challenges and leaderboards';
        challengesBtn.onclick = () => this.showChallengesModal();
        
        // Insert before stats button if it exists
        const statsBtn = document.getElementById('stats-btn');
        if (statsBtn) {
            toolbar.insertBefore(challengesBtn, statsBtn);
        } else {
            toolbar.appendChild(challengesBtn);
        }
    }
    
    showChallengesModal() {
        if (this.currentModal) {
            this.currentModal.remove();
        }
        
        this.currentModal = this.createChallengesModal();
        document.body.appendChild(this.currentModal);
        
        // Show the modal
        requestAnimationFrame(() => {
            this.currentModal.classList.add('active');
        });
    }
    
    createChallengesModal() {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                this.closeChallengesModal();
            }
        };
        
        const dialog = document.createElement('div');
        dialog.className = 'modal-dialog';
        dialog.style.maxWidth = '1200px';
        
        const header = document.createElement('div');
        header.className = 'modal-header';
        header.innerHTML = `
            <h2 class="modal-title">🏆 Challenges & Leaderboards</h2>
            <button class="modal-close" onclick="challengesUI.closeChallengesModal()">&times;</button>
        `;
        
        const body = document.createElement('div');
        body.className = 'modal-body';
        body.style.flexDirection = 'column';
        body.style.padding = '0';
        
        // Create tab navigation
        const tabNav = document.createElement('div');
        tabNav.className = 'tab-navigation';
        tabNav.style.padding = '0 var(--space-6)';
        tabNav.style.paddingTop = 'var(--space-4)';
        tabNav.innerHTML = `
            <button class="tab-button active" data-tab="active">Active Challenges</button>
            <button class="tab-button" data-tab="leaderboards">Leaderboards</button>
            <button class="tab-button" data-tab="create">Create Challenge</button>
            <button class="tab-button" data-tab="completed">Completed</button>
        `;
        
        // Add tab click handlers
        tabNav.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
        
        // Create tab content container
        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content-container';
        tabContent.style.padding = 'var(--space-6)';
        tabContent.style.flex = '1';
        tabContent.style.overflow = 'auto';
        
        // Create tab contents
        tabContent.appendChild(this.createActiveChallengesTab());
        tabContent.appendChild(this.createLeaderboardsTab());
        tabContent.appendChild(this.createChallengeCreationTab());
        tabContent.appendChild(this.createCompletedChallengesTab());
        
        body.appendChild(tabNav);
        body.appendChild(tabContent);
        
        dialog.appendChild(header);
        dialog.appendChild(body);
        overlay.appendChild(dialog);
        
        // Set initial active tab
        this.switchTab('active');
        
        return overlay;
    }
    
    switchTab(tabName) {
        if (!this.currentModal) return;
        
        this.activeTab = tabName;
        
        // Update tab buttons
        this.currentModal.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        // Update tab content
        this.currentModal.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.dataset.tab === tabName);
        });
        
        // Refresh content for active tab
        if (tabName === 'active') {
            this.refreshActiveChallenges();
        } else if (tabName === 'leaderboards') {
            this.refreshLeaderboards();
        } else if (tabName === 'completed') {
            this.refreshCompletedChallenges();
        }
    }
    
    createActiveChallengesTab() {
        const tab = document.createElement('div');
        tab.className = 'tab-content';
        tab.dataset.tab = 'active';
        
        const header = document.createElement('div');
        header.style.marginBottom = 'var(--space-4)';
        header.innerHTML = `
            <h3 style="margin: 0 0 var(--space-2) 0; color: var(--text);">Active Challenges</h3>
            <p style="margin: 0; color: var(--text-muted); font-size: var(--text-sm);">
                Join challenges to compete with other writers and track your progress
            </p>
        `;
        
        const container = document.createElement('div');
        container.className = 'challenges-container';
        container.id = 'active-challenges-container';
        
        tab.appendChild(header);
        tab.appendChild(container);
        
        return tab;
    }
    
    createLeaderboardsTab() {
        const tab = document.createElement('div');
        tab.className = 'tab-content';
        tab.dataset.tab = 'leaderboards';
        
        const header = document.createElement('div');
        header.style.marginBottom = 'var(--space-4)';
        header.innerHTML = `
            <h3 style="margin: 0 0 var(--space-2) 0; color: var(--text);">Leaderboards</h3>
            <p style="margin: 0; color: var(--text-muted); font-size: var(--text-sm);">
                See how you stack up against other writers worldwide
            </p>
        `;
        
        const container = document.createElement('div');
        container.className = 'leaderboards-container';
        container.id = 'leaderboards-container';
        container.style.display = 'grid';
        container.style.gap = 'var(--space-4)';
        container.style.gridTemplateColumns = 'repeat(auto-fit, minmax(350px, 1fr))';
        
        tab.appendChild(header);
        tab.appendChild(container);
        
        return tab;
    }
    
    createChallengeCreationTab() {
        const tab = document.createElement('div');
        tab.className = 'tab-content';
        tab.dataset.tab = 'create';
        
        const header = document.createElement('div');
        header.style.marginBottom = 'var(--space-4)';
        header.innerHTML = `
            <h3 style="margin: 0 0 var(--space-2) 0; color: var(--text);">Create New Challenge</h3>
            <p style="margin: 0; color: var(--text-muted); font-size: var(--text-sm);">
                Create a custom challenge for yourself and other writers to join
            </p>
        `;
        
        const form = document.createElement('form');
        form.className = 'challenge-creation-form';
        form.onsubmit = (e) => {
            e.preventDefault();
            this.createNewChallenge();
        };
        
        form.innerHTML = `
            <div class="form-group">
                <label class="form-label">Challenge Type</label>
                <div class="challenge-type-grid" id="challenge-type-selector">
                    ${this.renderChallengeTypes()}
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="challenge-name">Challenge Name</label>
                <input type="text" id="challenge-name" class="form-input" placeholder="e.g., Morning Pages Marathon" required>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="challenge-description">Description</label>
                <textarea id="challenge-description" class="form-input form-textarea" placeholder="Describe your challenge..."></textarea>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="challenge-target">Target Goal</label>
                <input type="number" id="challenge-target" class="form-input" placeholder="1000" min="1" required>
                <small style="color: var(--text-muted); font-size: var(--text-xs);">
                    The target value depends on challenge type (words, minutes, days, etc.)
                </small>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="challenge-duration">Duration</label>
                <select id="challenge-duration" class="form-select" required>
                    <option value="daily">Daily (24 hours)</option>
                    <option value="weekly">Weekly (7 days)</option>
                    <option value="monthly">Monthly (30 days)</option>
                    <option value="session">Single Session (2 hours)</option>
                </select>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="max-participants">Maximum Participants</label>
                <input type="number" id="max-participants" class="form-input" value="50" min="2" max="1000">
            </div>
            
            <div style="display: flex; gap: var(--space-3); justify-content: flex-end;">
                <button type="button" class="btn btn-secondary" onclick="challengesUI.switchTab('active')">Cancel</button>
                <button type="submit" class="btn btn-primary">Create Challenge</button>
            </div>
        `;
        
        // Add event listeners for challenge type selection
        setTimeout(() => {
            const typeOptions = form.querySelectorAll('.challenge-type-option');
            typeOptions.forEach(option => {
                option.addEventListener('click', () => {
                    typeOptions.forEach(opt => opt.classList.remove('selected'));
                    option.classList.add('selected');
                    this.selectedChallengeType = option.dataset.type;
                });
            });
        }, 0);
        
        tab.appendChild(header);
        tab.appendChild(form);
        
        return tab;
    }
    
    createCompletedChallengesTab() {
        const tab = document.createElement('div');
        tab.className = 'tab-content';
        tab.dataset.tab = 'completed';
        
        const header = document.createElement('div');
        header.style.marginBottom = 'var(--space-4)';
        header.innerHTML = `
            <h3 style="margin: 0 0 var(--space-2) 0; color: var(--text);">Completed Challenges</h3>
            <p style="margin: 0; color: var(--text-muted); font-size: var(--text-sm);">
                View your completed challenges and achievements
            </p>
        `;
        
        const container = document.createElement('div');
        container.className = 'challenges-container';
        container.id = 'completed-challenges-container';
        
        tab.appendChild(header);
        tab.appendChild(container);
        
        return tab;
    }
    
    renderChallengeTypes() {
        const types = this.challenges.getAvailableChallengeTypes();
        return types.map(type => `
            <div class="challenge-type-option" data-type="${type.id}">
                <div class="challenge-type-icon">${type.icon}</div>
                <div class="challenge-type-name">${type.name}</div>
                <div class="challenge-type-description">${type.description}</div>
            </div>
        `).join('');
    }
    
    refreshActiveChallenges() {
        const container = document.getElementById('active-challenges-container');
        if (!container) return;
        
        const challenges = this.challenges.getChallenges();
        const activeChallenges = challenges.active;
        
        if (activeChallenges.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: var(--space-8); color: var(--text-muted);">
                    <div style="font-size: var(--text-4xl); margin-bottom: var(--space-4);">🎯</div>
                    <h4 style="margin: 0 0 var(--space-2) 0;">No Active Challenges</h4>
                    <p style="margin: 0; font-size: var(--text-sm);">Create a new challenge or wait for others to join</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = activeChallenges.map(challenge => this.renderChallengeCard(challenge)).join('');
    }
    
    refreshLeaderboards() {
        const container = document.getElementById('leaderboards-container');
        if (!container) return;
        
        const leaderboards = this.challenges.getLeaderboards();
        
        if (leaderboards.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: var(--space-8); color: var(--text-muted);">
                    <div style="font-size: var(--text-4xl); margin-bottom: var(--space-4);">📊</div>
                    <h4 style="margin: 0 0 var(--space-2) 0;">No Leaderboards Yet</h4>
                    <p style="margin: 0; font-size: var(--text-sm);">Leaderboards will appear as challenges progress</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = leaderboards.map(leaderboard => this.renderLeaderboard(leaderboard)).join('');
    }
    
    refreshCompletedChallenges() {
        const container = document.getElementById('completed-challenges-container');
        if (!container) return;
        
        const challenges = this.challenges.getChallenges();
        const completedChallenges = challenges.completed;
        
        if (completedChallenges.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: var(--space-8); color: var(--text-muted);">
                    <div style="font-size: var(--text-4xl); margin-bottom: var(--space-4);">🏁</div>
                    <h4 style="margin: 0 0 var(--space-2) 0;">No Completed Challenges</h4>
                    <p style="margin: 0; font-size: var(--text-sm);">Complete challenges to see them here</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = completedChallenges.map(challenge => this.renderChallengeCard(challenge, true)).join('');
    }
    
    renderChallengeCard(challenge, isCompleted = false) {
        const userProgress = challenge.userProgress || { progress: 0, status: 'not_joined' };
        const progressPercentage = Math.min(100, (userProgress.progress / challenge.target) * 100);
        const isParticipating = challenge.participants && challenge.participants.has(this.challenges.userId);
        const isUserCompleted = userProgress.status === 'completed';
        
        const timeRemaining = this.getTimeRemaining(challenge.endDate);
        const participantCount = challenge.participants ? challenge.participants.size : 0;
        
        let cardClasses = 'challenge-card';
        if (isParticipating) cardClasses += ' user-participating';
        if (isUserCompleted || isCompleted) cardClasses += ' completed';
        
        const statusBadge = isUserCompleted ? 'completed' : (isCompleted ? 'expired' : 'active');
        const statusText = isUserCompleted ? 'Completed' : (isCompleted ? 'Expired' : 'Active');
        
        return `
            <div class="${cardClasses}">
                <div class="challenge-header">
                    <div class="challenge-icon">${challenge.icon}</div>
                    <div class="challenge-info">
                        <h4 class="challenge-title">${challenge.name}</h4>
                        <p class="challenge-description">${challenge.description}</p>
                        <div class="challenge-meta">
                            <div class="challenge-meta-item">
                                <span>⏰</span>
                                <span>${timeRemaining}</span>
                            </div>
                            <div class="challenge-meta-item">
                                <span>👥</span>
                                <span>${participantCount} participants</span>
                            </div>
                            <div class="challenge-meta-item">
                                <span>🎯</span>
                                <span>Goal: ${challenge.target}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                ${isParticipating ? `
                    <div class="challenge-progress">
                        <div class="challenge-progress-header">
                            <span class="challenge-progress-label">Your Progress</span>
                            <span class="challenge-progress-value">${userProgress.progress} / ${challenge.target}</span>
                        </div>
                        <div class="challenge-progress-bar">
                            <div class="challenge-progress-fill" style="width: ${progressPercentage}%"></div>
                        </div>
                    </div>
                ` : ''}
                
                <div class="challenge-participants">
                    <div class="challenge-participants-header">
                        <span>👥</span>
                        <span>Participants</span>
                    </div>
                    <div class="challenge-participants-list">
                        ${this.renderParticipantsList(challenge.participants)}
                    </div>
                </div>
                
                <div class="challenge-actions">
                    <span class="challenge-status-badge ${statusBadge}">${statusText}</span>
                    ${!isParticipating && !isCompleted ? `
                        <button class="btn btn-primary" onclick="challengesUI.joinChallenge('${challenge.id}')">
                            Join Challenge
                        </button>
                    ` : ''}
                    ${isParticipating ? `
                        <button class="btn btn-secondary" onclick="challengesUI.viewChallengeDetails('${challenge.id}')">
                            View Details
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    renderParticipantsList(participants) {
        if (!participants || participants.size === 0) {
            return '<span class="challenge-participant">No participants yet</span>';
        }
        
        const participantArray = Array.from(participants.values()).slice(0, 5); // Show first 5
        const overflow = participants.size - 5;
        
        let html = participantArray.map(participant => {
            const isCurrentUser = participant.userId === this.challenges.userId;
            const className = isCurrentUser ? 'challenge-participant current-user' : 'challenge-participant';
            return `<span class="${className}">${participant.username}</span>`;
        }).join('');
        
        if (overflow > 0) {
            html += `<span class="challenge-participant">+${overflow} more</span>`;
        }
        
        return html;
    }
    
    renderLeaderboard(leaderboard) {
        const entries = leaderboard.data.slice(0, 10); // Top 10
        
        return `
            <div class="leaderboard-container">
                <div class="leaderboard-header">
                    <h4 class="leaderboard-title">
                        <span>${leaderboard.icon}</span>
                        ${leaderboard.title}
                    </h4>
                    <p class="leaderboard-subtitle">
                        Updated ${this.formatTime(leaderboard.lastUpdated)}
                    </p>
                </div>
                <div class="leaderboard-list">
                    ${entries.map((entry, index) => this.renderLeaderboardItem(entry, index + 1, leaderboard.type)).join('')}
                </div>
            </div>
        `;
    }
    
    renderLeaderboardItem(entry, rank, leaderboardType) {
        const isCurrentUser = entry.username === this.challenges.username;
        const rankClass = rank <= 3 ? `rank-${rank} top-3` : '';
        
        let scoreDisplay = '';
        let statsDisplay = '';
        
        switch (leaderboardType) {
            case 'global_words':
                scoreDisplay = `${entry.totalWords.toLocaleString()} words`;
                statsDisplay = `Level ${entry.level}`;
                break;
            case 'global_streaks':
                scoreDisplay = `${entry.longestStreak} days`;
                statsDisplay = `Current: ${entry.currentStreak} days`;
                break;
            case 'weekly_active':
                scoreDisplay = `${entry.weeklyWords.toLocaleString()} words`;
                statsDisplay = `${entry.sessionsThisWeek} sessions this week`;
                break;
            case 'challenge_completions':
                scoreDisplay = `${entry.challengesCompleted} completed`;
                statsDisplay = `${entry.completionRate}% completion rate`;
                break;
            default:
                scoreDisplay = entry.score || '0';
        }
        
        return `
            <div class="leaderboard-item ${isCurrentUser ? 'current-user' : ''}">
                <div class="leaderboard-rank ${rankClass}">${rank}</div>
                <div class="leaderboard-user">
                    <div class="leaderboard-username">${entry.username}</div>
                    <div class="leaderboard-stats">${statsDisplay}</div>
                </div>
                <div class="leaderboard-score">${scoreDisplay}</div>
            </div>
        `;
    }
    
    getTimeRemaining(endDate) {
        const now = Date.now();
        const remaining = endDate - now;
        
        if (remaining <= 0) {
            return 'Expired';
        }
        
        const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
        const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
        
        if (days > 0) {
            return `${days}d ${hours}h remaining`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m remaining`;
        } else {
            return `${minutes}m remaining`;
        }
    }
    
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) { // Less than 1 minute
            return 'just now';
        } else if (diff < 3600000) { // Less than 1 hour
            return `${Math.floor(diff / 60000)}m ago`;
        } else if (diff < 86400000) { // Less than 1 day
            return `${Math.floor(diff / 3600000)}h ago`;
        } else {
            return date.toLocaleDateString();
        }
    }
    
    // === Event Handlers ===
    
    joinChallenge(challengeId) {
        const success = this.challenges.joinChallenge(challengeId);
        
        if (success) {
            if (window.showNotification) {
                window.showNotification('Successfully joined challenge!', 'success');
            }
            this.refreshActiveChallenges();
        } else {
            if (window.showNotification) {
                window.showNotification('Failed to join challenge', 'error');
            }
        }
    }
    
    createNewChallenge() {
        if (!this.selectedChallengeType) {
            if (window.showNotification) {
                window.showNotification('Please select a challenge type', 'warning');
            }
            return;
        }
        
        const name = document.getElementById('challenge-name').value;
        const description = document.getElementById('challenge-description').value;
        const target = parseInt(document.getElementById('challenge-target').value);
        const duration = document.getElementById('challenge-duration').value;
        const maxParticipants = parseInt(document.getElementById('max-participants').value);
        
        if (!name || !target) {
            if (window.showNotification) {
                window.showNotification('Please fill in all required fields', 'warning');
            }
            return;
        }
        
        const challenge = this.challenges.createChallenge({
            type: this.selectedChallengeType,
            name,
            description,
            target,
            duration,
            maxParticipants
        });
        
        if (challenge) {
            if (window.showNotification) {
                window.showNotification('Challenge created successfully!', 'success');
            }
            
            // Reset form
            document.getElementById('challenge-name').value = '';
            document.getElementById('challenge-description').value = '';
            document.getElementById('challenge-target').value = '';
            document.getElementById('max-participants').value = '50';
            this.selectedChallengeType = null;
            
            // Clear selection
            document.querySelectorAll('.challenge-type-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            
            // Switch to active tab to see the new challenge
            this.switchTab('active');
        } else {
            if (window.showNotification) {
                window.showNotification('Failed to create challenge', 'error');
            }
        }
    }
    
    viewChallengeDetails(challengeId) {
        // This could open a detailed view modal
        const challenge = this.challenges.getChallengeById(challengeId);
        if (challenge) {
            console.log('Challenge details:', challenge);
            // For now, just show a notification
            if (window.showNotification) {
                window.showNotification(`Viewing details for ${challenge.name}`, 'info');
            }
        }
    }
    
    closeChallengesModal() {
        if (this.currentModal) {
            this.currentModal.classList.remove('active');
            setTimeout(() => {
                if (this.currentModal) {
                    this.currentModal.remove();
                    this.currentModal = null;
                }
            }, 200);
        }
    }
    
    startPeriodicUpdates() {
        // Update UI every 30 seconds
        setInterval(() => {
            if (this.currentModal && this.activeTab) {
                if (this.activeTab === 'active') {
                    this.refreshActiveChallenges();
                } else if (this.activeTab === 'leaderboards') {
                    this.refreshLeaderboards();
                } else if (this.activeTab === 'completed') {
                    this.refreshCompletedChallenges();
                }
            }
        }, 30000);
    }
    
    // === Integration with Gamification ===
    
    updateProgressFromGamification() {
        if (this.challenges) {
            this.challenges.updateFromGamificationProgress();
            
            // Refresh UI if modal is open
            if (this.currentModal && this.activeTab === 'active') {
                this.refreshActiveChallenges();
            }
        }
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.ChallengesUI = ChallengesUI;
}
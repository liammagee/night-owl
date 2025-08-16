
// === Settings Dialog Implementation ===

let settingsDialog = null;
let currentSettings = null;

async function openSettingsDialog(category = 'general') {
    try {
        // Load current settings
        currentSettings = await window.electronAPI.invoke('get-settings');
        
        // Create dialog if it doesn't exist
        if (!settingsDialog) {
            createSettingsDialog();
        }
        
        // Show the appropriate category
        showSettingsCategory(category);
        
        // Show the dialog
        settingsDialog.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
        
    } catch (error) {
        console.error('[Renderer] Error opening settings dialog:', error);
        showNotification('Error opening settings dialog', 'error');
    }
}

function createSettingsDialog() {
    // Create dialog overlay
    settingsDialog = document.createElement('div');
    settingsDialog.id = 'settings-dialog';
    settingsDialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: none;
        z-index: 10000;
        overflow: auto;
    `;
    
    // Create dialog content
    const dialogContent = document.createElement('div');
    dialogContent.style.cssText = `
        background: var(--editor-bg, white);
        margin: 50px auto;
        padding: 0;
        border-radius: 8px;
        width: 80%;
        max-width: 900px;
        max-height: 80vh;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        display: flex;
        flex-direction: column;
        color: var(--editor-fg, black);
    `;
    
    // Create dialog header
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 20px 24px 16px 24px;
        border-bottom: 1px solid var(--border-color, #ddd);
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    
    const title = document.createElement('h2');
    title.id = 'settings-title';
    title.textContent = 'Settings';
    title.style.cssText = 'margin: 0; font-size: 24px; font-weight: 500;';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        color: var(--editor-fg, black);
    `;
    closeBtn.onclick = closeSettingsDialog;
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    // Create dialog body
    const body = document.createElement('div');
    body.style.cssText = `
        display: flex;
        flex: 1;
        overflow: hidden;
    `;
    
    // Create sidebar
    const sidebar = document.createElement('div');
    sidebar.id = 'settings-sidebar';
    sidebar.style.cssText = `
        width: 200px;
        background: var(--sidebar-bg, #f5f5f5);
        border-right: 1px solid var(--border-color, #ddd);
        overflow-y: auto;
        flex-shrink: 0;
    `;
    
    // Create content area
    const content = document.createElement('div');
    content.id = 'settings-content';
    content.style.cssText = `
        flex: 1;
        padding: 24px;
        overflow-y: auto;
        background: var(--editor-bg, white);
    `;
    
    // Add CSS styles for settings layout
    const settingsStyles = document.createElement('style');
    settingsStyles.textContent = `
        .settings-section {
            margin-bottom: 32px;
        }
        
        .settings-section h3 {
            margin: 0 0 16px 0;
            font-size: 18px;
            font-weight: 600;
            color: var(--editor-fg, #333);
            border-bottom: 1px solid var(--border-color, #e0e0e0);
            padding-bottom: 8px;
        }
        
        .settings-group {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        .settings-group label {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px 0;
            cursor: pointer;
            transition: background-color 0.2s;
            border-radius: 4px;
        }
        
        .settings-group label:hover {
            background-color: var(--hover-bg, #f8f9fa);
            padding-left: 8px;
            padding-right: 8px;
        }
        
        .settings-group input[type="checkbox"] {
            width: 18px;
            height: 18px;
            margin: 0;
            cursor: pointer;
        }
        
        .settings-group input[type="text"],
        .settings-group input[type="number"] {
            padding: 6px 8px;
            border: 1px solid var(--border-color, #ccc);
            border-radius: 4px;
            font-size: 14px;
            min-width: 120px;
        }
        
        .settings-group select {
            padding: 6px 8px;
            border: 1px solid var(--border-color, #ccc);
            border-radius: 4px;
            font-size: 14px;
            min-width: 120px;
            background: var(--editor-bg, white);
        }
        
        .settings-group span {
            font-size: 14px;
            color: var(--editor-fg, #333);
            flex: 1;
        }
        
        .settings-group p {
            margin: 0 0 8px 0;
            color: var(--editor-fg, #666);
            font-size: 14px;
        }
        
        .settings-group button {
            padding: 8px 16px;
            margin: 4px 8px 4px 0;
            border: 1px solid var(--border-color, #ccc);
            border-radius: 4px;
            background: var(--editor-bg, white);
            color: var(--editor-fg, #333);
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
        }
        
        .settings-group button:hover {
            background-color: var(--hover-bg, #f0f0f0);
        }
        
        /* Dark mode adjustments */
        body.dark-mode .settings-group label:hover {
            background-color: var(--hover-bg, #2a2a2a);
        }
        
        body.dark-mode .settings-group input[type="text"],
        body.dark-mode .settings-group input[type="number"],
        body.dark-mode .settings-group select {
            background: var(--editor-bg, #1e1e1e);
            color: var(--editor-fg, #d4d4d4);
            border-color: var(--border-color, #444);
        }
        
        body.dark-mode .settings-group button {
            background: var(--editor-bg, #2d2d30);
            color: var(--editor-fg, #d4d4d4);
            border-color: var(--border-color, #444);
        }
        
        body.dark-mode .settings-group button:hover {
            background-color: var(--hover-bg, #3a3a3a);
        }
    `;
    document.head.appendChild(settingsStyles);
    
    body.appendChild(sidebar);
    body.appendChild(content);
    
    // Create footer
    const footer = document.createElement('div');
    footer.style.cssText = `
        padding: 16px 24px;
        border-top: 1px solid var(--border-color, #ddd);
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        background: var(--editor-bg, white);
    `;
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
        padding: 8px 16px;
        border: 1px solid var(--border-color, #ddd);
        background: var(--editor-bg, white);
        color: var(--editor-fg, black);
        border-radius: 4px;
        cursor: pointer;
    `;
    cancelBtn.onclick = closeSettingsDialog;
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Settings';
    saveBtn.style.cssText = `
        padding: 8px 16px;
        border: none;
        background: #0066cc;
        color: white;
        border-radius: 4px;
        cursor: pointer;
    `;
    saveBtn.onclick = saveSettingsDialog;
    
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    
    // Assemble dialog
    dialogContent.appendChild(header);
    dialogContent.appendChild(body);
    dialogContent.appendChild(footer);
    settingsDialog.appendChild(dialogContent);
    
    // Add to document
    document.body.appendChild(settingsDialog);
    
    // Create sidebar navigation
    createSettingsSidebar();
    
    // Close dialog when clicking outside
    settingsDialog.addEventListener('click', (e) => {
        if (e.target === settingsDialog) {
            closeSettingsDialog();
        }
    });
    
    // Close dialog with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && settingsDialog.style.display === 'block') {
            closeSettingsDialog();
        }
    });
}

function createSettingsSidebar() {
    const sidebar = document.getElementById('settings-sidebar');
    if (!sidebar) return;
    
    const categories = [
        { id: 'general', label: 'General', icon: '⚙️' },
        { id: 'appearance', label: 'Appearance', icon: '🎨' },
        { id: 'editor', label: 'Editor', icon: '📝' },
        { id: 'gamification', label: 'Gamification', icon: '🎮' },
        { id: 'ai', label: 'AI Settings', icon: '🤖' },
        { id: 'export', label: 'Export', icon: '📤' },
        { id: 'kanban', label: 'Kanban', icon: '📋' },
        { id: 'visualization', label: 'Visualizations', icon: '🕸️' },
        { id: 'advanced', label: 'Advanced', icon: '🔧' }
    ];
    
    sidebar.innerHTML = '';
    
    categories.forEach(category => {
        const item = document.createElement('div');
        item.className = 'settings-nav-item';
        item.dataset.category = category.id;
        item.style.cssText = `
            padding: 12px 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: background-color 0.2s;
            border-bottom: 1px solid var(--border-color, #e0e0e0);
        `;
        
        item.innerHTML = `
            <span style="font-size: 16px;">${category.icon}</span>
            <span>${category.label}</span>
        `;
        
        item.addEventListener('click', () => {
            showSettingsCategory(category.id);
        });
        
        sidebar.appendChild(item);
    });
}

function showSettingsCategory(category) {
    // Update sidebar selection
    document.querySelectorAll('.settings-nav-item').forEach(item => {
        item.style.backgroundColor = item.dataset.category === category ? 
            'var(--selection-bg, #e3f2fd)' : 'transparent';
    });
    
    // Update content
    const content = document.getElementById('settings-content');
    if (!content) return;
    
    const title = document.getElementById('settings-title');
    if (title) {
        const categoryNames = {
            general: 'General Settings',
            appearance: 'Appearance',
            editor: 'Editor Settings',
            gamification: 'Gamification Settings',
            ai: 'AI Configuration',
            export: 'Export Preferences',
            kanban: 'Kanban Settings',
            visualization: 'Visualization Filters',
            advanced: 'Advanced Settings'
        };
        title.textContent = categoryNames[category] || 'Settings';
    }
    
    // Generate content for the category
    content.innerHTML = generateSettingsContent(category);
    
    // Add event listeners for form elements
    addSettingsEventListeners(category);
}

function generateSettingsContent(category) {
    if (!currentSettings) return '<p>Loading settings...</p>';
    
    switch (category) {
        case 'general':
            return generateGeneralSettings();
        case 'appearance':
            return generateAppearanceSettings();
        case 'editor':
            return generateEditorSettings();
        case 'gamification':
            return generateGamificationSettings();
        case 'ai':
            return generateAISettings();
        case 'export':
            return generateExportSettings();
        case 'kanban':
            return generateKanbanSettings();
        case 'visualization':
            return generateVisualizationSettings();
        case 'advanced':
            return generateAdvancedSettings();
        default:
            return '<p>Select a settings category from the sidebar.</p>';
    }
}

function generateGeneralSettings() {
    return `
        <div class="settings-section">
            <h3>File Management</h3>
            <div class="settings-group">
                <label>
                    <input type="text" id="working-directory" value="${currentSettings.workingDirectory || ''}" readonly>
                    <span>Working Directory</span>
                    <button type="button" onclick="changeWorkingDirectory()">Change...</button>
                </label>
                <label>
                    <input type="text" id="default-file-type" value="${currentSettings.defaultFileType || '.md'}">
                    <span>Default File Extension</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Auto-save</h3>
            <div class="settings-group">
                <label>
                    <input type="checkbox" id="auto-save-enabled" ${currentSettings.autoSave?.enabled ? 'checked' : ''}>
                    <span>Enable auto-save</span>
                </label>
                <label>
                    <input type="number" id="auto-save-interval" value="${currentSettings.autoSave?.interval || 2000}" min="1000" max="30000" step="500">
                    <span>Auto-save interval (milliseconds)</span>
                </label>
                <label>
                    <input type="checkbox" id="create-backups" ${currentSettings.autoSave?.createBackups ? 'checked' : ''}>
                    <span>Create backup files</span>
                </label>
            </div>
        </div>
    `;
}

function generateAppearanceSettings() {
    return `
        <div class="settings-section">
            <h3>Theme</h3>
            <div class="settings-group">
                <label>
                    <select id="theme-select">
                        <option value="auto" ${currentSettings.theme === 'auto' ? 'selected' : ''}>Auto (Follow System)</option>
                        <option value="light" ${currentSettings.theme === 'light' ? 'selected' : ''}>Light</option>
                        <option value="dark" ${currentSettings.theme === 'dark' ? 'selected' : ''}>Dark</option>
                    </select>
                    <span>Theme</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Layout</h3>
            <div class="settings-group">
                <label>
                    <input type="text" id="structure-width" value="${currentSettings.layout?.structureWidth || '18%'}">
                    <span>Structure Panel Width</span>
                </label>
                <label>
                    <input type="text" id="editor-width" value="${currentSettings.layout?.editorWidth || '45%'}">
                    <span>Editor Width</span>
                </label>
                <label>
                    <input type="text" id="right-width" value="${currentSettings.layout?.rightWidth || '37%'}">
                    <span>Preview Panel Width</span>
                </label>
            </div>
        </div>
    `;
}

function generateEditorSettings() {
    return `
        <div class="settings-section">
            <h3>Editor Appearance</h3>
            <div class="settings-group">
                <label>
                    <input type="number" id="editor-font-size" value="${currentSettings.editor?.fontSize || 14}" min="8" max="72">
                    <span>Font Size</span>
                </label>
                <label>
                    <input type="text" id="editor-font-family" value="${currentSettings.editor?.fontFamily || 'Monaco, Menlo, monospace'}">
                    <span>Font Family</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Editor Behavior</h3>
            <div class="settings-group">
                <label>
                    <input type="checkbox" id="show-line-numbers" ${currentSettings.editor?.showLineNumbers ? 'checked' : ''}>
                    <span>Show Line Numbers</span>
                </label>
                <label>
                    <input type="checkbox" id="show-minimap" ${currentSettings.editor?.showMinimap ? 'checked' : ''}>
                    <span>Show Minimap</span>
                </label>
                <label>
                    <input type="checkbox" id="word-wrap" ${currentSettings.editor?.wordWrap === 'on' ? 'checked' : ''}>
                    <span>Word Wrap</span>
                </label>
                <label>
                    <input type="number" id="tab-size" value="${currentSettings.editor?.tabSize || 2}" min="1" max="8">
                    <span>Tab Size</span>
                </label>
                <label>
                    <input type="checkbox" id="enable-citation-autocomplete" ${currentSettings.editor?.enableCitationAutocomplete !== false ? 'checked' : ''}>
                    <span>Enable Citation Autocomplete</span>
                    <small class="setting-description">Show suggestions when typing [@. Disables bracket auto-completion.</small>
                </label>
            </div>
        </div>
    `;
}

function generateGamificationSettings() {
    const gamificationSettings = currentSettings.gamification || {};
    
    return `
        <div class="settings-section">
            <h3>Writing Gamification</h3>
            <div class="settings-group">
                <label>
                    <input type="checkbox" id="gamification-enabled" ${gamificationSettings.enabled !== false ? 'checked' : ''}>
                    <span>Enable Writing Gamification</span>
                </label>
                <p style="color: #666; font-size: 13px; margin: 8px 0;">
                    Turn on research-backed gamification features to boost motivation and combat procrastination during academic writing.
                </p>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Writing Sessions</h3>
            <div class="settings-group">
                <label>
                    <input type="checkbox" id="auto-start-sessions" ${gamificationSettings.autoStartSessions !== false ? 'checked' : ''}>
                    <span>Auto-start writing sessions when typing</span>
                </label>
                <label>
                    <input type="number" id="min-session-length" value="${gamificationSettings.minSessionLength || 5}" min="1" max="60">
                    <span>Minimum session length (minutes)</span>
                </label>
                <label>
                    <input type="number" id="activity-timeout" value="${gamificationSettings.activityTimeout || 30}" min="10" max="300">
                    <span>Inactivity timeout (seconds)</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Focus Sessions & Pomodoro Timer</h3>
            <div class="settings-group">
                <label>
                    <input type="checkbox" id="focus-sessions-enabled" ${gamificationSettings.focusSessionsEnabled !== false ? 'checked' : ''}>
                    <span>Enable focus session timer</span>
                </label>
                <label>
                    <select id="default-focus-duration">
                        <option value="15" ${(gamificationSettings.defaultFocusDuration || 25) === 15 ? 'selected' : ''}>15 minutes</option>
                        <option value="25" ${(gamificationSettings.defaultFocusDuration || 25) === 25 ? 'selected' : ''}>25 minutes (Pomodoro)</option>
                        <option value="45" ${(gamificationSettings.defaultFocusDuration || 25) === 45 ? 'selected' : ''}>45 minutes</option>
                        <option value="90" ${(gamificationSettings.defaultFocusDuration || 25) === 90 ? 'selected' : ''}>90 minutes</option>
                    </select>
                    <span>Default focus session duration</span>
                </label>
                <label>
                    <input type="checkbox" id="break-reminders" ${gamificationSettings.breakReminders !== false ? 'checked' : ''}>
                    <span>Show break reminders after focus sessions</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Achievements & Rewards</h3>
            <div class="settings-group">
                <label>
                    <input type="checkbox" id="achievements-enabled" ${gamificationSettings.achievementsEnabled !== false ? 'checked' : ''}>
                    <span>Enable achievement system</span>
                </label>
                <label>
                    <input type="checkbox" id="streak-tracking" ${gamificationSettings.streakTracking !== false ? 'checked' : ''}>
                    <span>Track daily writing streaks</span>
                </label>
                <label>
                    <input type="checkbox" id="points-system" ${gamificationSettings.pointsSystem !== false ? 'checked' : ''}>
                    <span>Enable points and rewards system</span>
                </label>
                <label>
                    <input type="checkbox" id="achievement-notifications" ${gamificationSettings.achievementNotifications !== false ? 'checked' : ''}>
                    <span>Show achievement notifications</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Interface & Display</h3>
            <div class="settings-group">
                <label>
                    <input type="checkbox" id="show-progress-bar" ${gamificationSettings.showProgressBar !== false ? 'checked' : ''}>
                    <span>Show writing progress indicators</span>
                </label>
                <label>
                    <input type="checkbox" id="compact-mode" ${gamificationSettings.compactMode ? 'checked' : ''}>
                    <span>Use compact gamification display</span>
                </label>
                <label>
                    <input type="checkbox" id="menu-collapsed-default" ${gamificationSettings.menuCollapsedDefault ? 'checked' : ''}>
                    <span>Start with gamification menu collapsed</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Data & Privacy</h3>
            <div class="settings-group">
                <label>
                    <button type="button" onclick="clearGamificationData()" style="background: #e74c3c; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">Clear All Gamification Data</button>
                    <span style="color: #666; font-size: 12px;">This will reset all streaks, achievements, and points</span>
                </label>
                <label>
                    <button type="button" onclick="exportGamificationData()" style="background: #3498db; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">Export Gamification Data</button>
                    <span style="color: #666; font-size: 12px;">Download your writing statistics and achievements</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <p style="color: #666; font-size: 12px; line-height: 1.4;">
                <strong>Research Foundation:</strong> These gamification features are based on research from Deci & Ryan (Self-Determination Theory), 
                Csikszentmihalyi (Flow Theory), James Clear (Atomic Habits), BJ Fogg (Tiny Habits), and Francesco Cirillo (Pomodoro Technique).
            </p>
        </div>
    `;
}

function generateAISettings() {
    return `
        <div class="settings-section">
            <h3>AI Provider Configuration</h3>
            <div class="settings-group">
                <label>
                    <select id="ai-provider" onchange="updateModelOptions()">
                        <option value="auto" ${(currentSettings.ai?.preferredProvider || 'auto') === 'auto' ? 'selected' : ''}>Auto (Use Available)</option>
                        <option value="openai" ${currentSettings.ai?.preferredProvider === 'openai' ? 'selected' : ''}>OpenAI</option>
                        <option value="anthropic" ${currentSettings.ai?.preferredProvider === 'anthropic' ? 'selected' : ''}>Anthropic</option>
                        <option value="groq" ${currentSettings.ai?.preferredProvider === 'groq' ? 'selected' : ''}>Groq</option>
                        <option value="openrouter" ${currentSettings.ai?.preferredProvider === 'openrouter' ? 'selected' : ''}>OpenRouter</option>
                    </select>
                    <span>Preferred Provider</span>
                </label>
                <label>
                    <select id="ai-model">
                        <option value="auto">Auto (Provider Default)</option>
                        ${generateModelOptions(currentSettings.ai?.preferredProvider || 'auto', currentSettings.ai?.preferredModel)}
                    </select>
                    <span>Preferred Model</span>
                </label>
                <div id="current-config" style="margin-top: 10px; padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 12px; color: #666;">
                    Current: Loading configuration...
                </div>
            </div>
        </div>

        <div class="settings-section">
            <h3>System Prompt Configuration</h3>
            <div class="settings-group">
                <label>
                    <input type="radio" name="system-prompt-source" value="default" ${(!currentSettings.ai?.systemPromptSource || currentSettings.ai?.systemPromptSource === 'default') ? 'checked' : ''} onchange="toggleSystemPromptOptions()">
                    <span>Use Default System Prompt</span>
                </label>
                <label>
                    <input type="radio" name="system-prompt-source" value="custom" ${currentSettings.ai?.systemPromptSource === 'custom' ? 'checked' : ''} onchange="toggleSystemPromptOptions()">
                    <span>Custom Text</span>
                </label>
                <label>
                    <input type="radio" name="system-prompt-source" value="file" ${currentSettings.ai?.systemPromptSource === 'file' ? 'checked' : ''} onchange="toggleSystemPromptOptions()">
                    <span>Markdown File</span>
                </label>
                
                <div id="custom-prompt-area" style="display: ${currentSettings.ai?.systemPromptSource === 'custom' ? 'block' : 'none'}; margin-top: 10px;">
                    <textarea id="custom-system-prompt" rows="4" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace; font-size: 12px;" placeholder="Enter your custom system prompt...">${currentSettings.ai?.customSystemPrompt || ''}</textarea>
                </div>
                
                <div id="file-prompt-area" style="display: ${currentSettings.ai?.systemPromptSource === 'file' ? 'block' : 'none'}; margin-top: 10px;">
                    <input type="text" id="system-prompt-file" value="${currentSettings.ai?.systemPromptFile || ''}" placeholder="Path to markdown file (e.g., ./prompts/system.md)" style="width: 70%; padding: 8px; margin-right: 10px;">
                    <button type="button" onclick="browseSystemPromptFile()">Browse...</button>
                </div>
                
                <div id="default-prompt-preview" style="display: ${(!currentSettings.ai?.systemPromptSource || currentSettings.ai?.systemPromptSource === 'default') ? 'block' : 'none'}; margin-top: 10px; padding: 8px; background: #f9f9f9; border-radius: 4px; font-size: 11px; color: #666;">
                    <strong>Default:</strong> You are a helpful assistant integrated into a Markdown editor for Hegelian philosophy and pedagogy. Provide thoughtful, educational responses.
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>AI Parameters</h3>
            <div class="settings-group">
                <label>
                    <input type="range" id="ai-temperature" min="0" max="2" step="0.1" value="${currentSettings.ai?.temperature || 0.7}">
                    <span>Temperature: <span id="temperature-value">${currentSettings.ai?.temperature || 0.7}</span></span>
                </label>
                <label>
                    <input type="number" id="ai-max-tokens" value="${currentSettings.ai?.maxTokens || 2000}" min="100" max="8000" step="100">
                    <span>Max Tokens</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>AI Features</h3>
            <div class="settings-group">
                <label>
                    <input type="checkbox" id="ai-chat-enabled" ${currentSettings.ai?.enableChat ? 'checked' : ''}>
                    <span>Enable AI Chat</span>
                </label>
                <label>
                    <input type="checkbox" id="ai-summarization-enabled" ${currentSettings.ai?.enableSummarization ? 'checked' : ''}>
                    <span>Enable Summarization</span>
                </label>
                <label>
                    <input type="checkbox" id="ai-note-extraction-enabled" ${currentSettings.ai?.enableNoteExtraction ? 'checked' : ''}>
                    <span>Enable Note Extraction</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Debugging & Logging</h3>
            <div class="settings-group">
                <label>
                    <input type="checkbox" id="ai-verbose-logging" ${currentSettings.ai?.verboseLogging ? 'checked' : ''}>
                    <span>Verbose API Logging</span>
                </label>
                <div style="margin-top: 5px; font-size: 11px; color: #666; margin-left: 20px;">
                    When enabled, logs full messages and responses to console.<br>
                    When disabled, logs only previews to reduce log size.
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <p><strong>Note:</strong> API keys are configured via environment variables (.env file). See the .env.example file for details.</p>
        </div>
    `;
}

function generateExportSettings() {
    return `
        <div class="settings-section">
            <h3>Default Export Format</h3>
            <div class="settings-group">
                <label>
                    <select id="default-export-format">
                        <option value="pdf" ${currentSettings.export?.defaultFormat === 'pdf' ? 'selected' : ''}>PDF</option>
                        <option value="html" ${currentSettings.export?.defaultFormat === 'html' ? 'selected' : ''}>HTML</option>
                        <option value="pptx" ${currentSettings.export?.defaultFormat === 'pptx' ? 'selected' : ''}>PowerPoint</option>
                    </select>
                    <span>Default Format</span>
                </label>
                <label>
                    <input type="checkbox" id="include-references" ${currentSettings.export?.includeReferences ? 'checked' : ''}>
                    <span>Include References by Default</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>PDF Export</h3>
            <div class="settings-group">
                <label>
                    <select id="pdf-engine">
                        <option value="pdflatex" ${currentSettings.export?.pandoc?.pdfEngine === 'pdflatex' ? 'selected' : ''}>PDFLaTeX</option>
                        <option value="xelatex" ${currentSettings.export?.pandoc?.pdfEngine === 'xelatex' ? 'selected' : ''}>XeLaTeX</option>
                        <option value="lualatex" ${currentSettings.export?.pandoc?.pdfEngine === 'lualatex' ? 'selected' : ''}>LuaLaTeX</option>
                    </select>
                    <span>PDF Engine</span>
                </label>
                <label>
                    <input type="checkbox" id="include-toc" ${currentSettings.export?.pandoc?.includeTableOfContents ? 'checked' : ''}>
                    <span>Include Table of Contents</span>
                </label>
                <label>
                    <input type="checkbox" id="number-sections" ${currentSettings.export?.pandoc?.numberSections ? 'checked' : ''}>
                    <span>Number Sections</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>HTML Export</h3>
            <div class="settings-group">
                <label>
                    <select id="math-renderer">
                        <option value="mathjax" ${currentSettings.export?.html?.mathRenderer === 'mathjax' ? 'selected' : ''}>MathJax</option>
                        <option value="katex" ${currentSettings.export?.html?.mathRenderer === 'katex' ? 'selected' : ''}>KaTeX</option>
                        <option value="none" ${currentSettings.export?.html?.mathRenderer === 'none' ? 'selected' : ''}>None</option>
                    </select>
                    <span>Math Renderer</span>
                </label>
                <label>
                    <select id="syntax-highlighting">
                        <option value="pygments" ${currentSettings.export?.html?.syntaxHighlighting === 'pygments' ? 'selected' : ''}>Pygments</option>
                        <option value="highlight.js" ${currentSettings.export?.html?.syntaxHighlighting === 'highlight.js' ? 'selected' : ''}>Highlight.js</option>
                        <option value="none" ${currentSettings.export?.html?.syntaxHighlighting === 'none' ? 'selected' : ''}>None</option>
                    </select>
                    <span>Syntax Highlighting</span>
                </label>
            </div>
        </div>
    `;
}

function generateKanbanSettings() {
    const kanbanSettings = currentSettings.kanban || {};
    const todoFilePatterns = kanbanSettings.todoFilePatterns || [];
    const columns = kanbanSettings.columns || [];
    const doneMarkers = kanbanSettings.doneMarkers || [];
    const inProgressMarkers = kanbanSettings.inProgressMarkers || [];
    
    return `
        <div class="settings-section">
            <h3>TODO File Patterns</h3>
            <div class="settings-group">
                <label>
                    <input type="text" id="todo-file-patterns" value="${todoFilePatterns.join(', ')}" placeholder="TODO.md, TODOS.md, todo.md">
                    <span>File patterns that should render as Kanban boards (comma-separated)</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Task Status Markers</h3>
            <div class="settings-group">
                <label>
                    <input type="text" id="done-markers" value="${doneMarkers.join(', ')}" placeholder="DONE, COMPLETED, ✓">
                    <span>Done status markers (comma-separated)</span>
                </label>
                <label>
                    <input type="text" id="inprogress-markers" value="${inProgressMarkers.join(', ')}" placeholder="IN PROGRESS, DOING, ⏳">
                    <span>In Progress status markers (comma-separated)</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Kanban Board Options</h3>
            <div class="settings-group">
                <label>
                    <input type="checkbox" id="kanban-drag-drop" ${kanbanSettings.enableDragDrop ? 'checked' : ''}>
                    <span>Enable drag and drop for tasks</span>
                </label>
                <label>
                    <input type="checkbox" id="kanban-auto-save" ${kanbanSettings.autoSave ? 'checked' : ''}>
                    <span>Auto-save changes when tasks are moved</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Kanban Columns</h3>
            <div class="settings-group">
                <p>Configure your Kanban board columns:</p>
                <div id="kanban-columns-editor">
                    ${columns.map((col, index) => `
                        <div class="kanban-column-row" data-index="${index}">
                            <input type="text" class="column-name" value="${col.name}" placeholder="Column Name">
                            <input type="color" class="column-color" value="${col.color}">
                            <button type="button" class="remove-column" onclick="removeKanbanColumn(${index})">×</button>
                        </div>
                    `).join('')}
                </div>
                <button type="button" onclick="addKanbanColumn()">Add Column</button>
            </div>
        </div>
    `;
}

function generateVisualizationSettings() {
    const vizSettings = currentSettings.visualization || {};
    const includePatterns = vizSettings.includePatterns || ['lectures/*.md', '*.md'];
    const excludePatterns = vizSettings.excludePatterns || ['**/test/**', '**/tests/**', 'HELP.md', 'README.md', '**/node_modules/**'];
    
    return `
        <div class="settings-section">
            <h3>File Filtering for Network/Graph/Circle Views</h3>
            <p style="color: #666; font-size: 13px; margin-bottom: 15px;">
                Control which files are included in visualization views (Network, Graph, Circle). 
                Use glob patterns like <code>**/*.md</code> to include all markdown files or <code>**/test/**</code> to exclude test directories.
            </p>
            
            <div class="settings-group">
                <label>
                    <span>Include Patterns (one per line)</span>
                    <textarea id="viz-include-patterns" rows="4" style="width: 100%; font-family: monospace; font-size: 12px; margin-top: 5px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">${includePatterns.join('\\n')}</textarea>
                    <small style="color: #666; font-size: 11px;">Examples: **/*.md, lectures/**/*.md, *.markdown</small>
                </label>
                
                <label style="margin-top: 15px;">
                    <span>Exclude Patterns (one per line)</span>
                    <textarea id="viz-exclude-patterns" rows="6" style="width: 100%; font-family: monospace; font-size: 12px; margin-top: 5px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">${excludePatterns.join('\\n')}</textarea>
                    <small style="color: #666; font-size: 11px;">Examples: **/test/**, **/tests/**, HELP.md, README.md, **/*.tmp</small>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Cache Management</h3>
            <div class="settings-group">
                <label>
                    <input type="number" id="viz-cache-expiry" value="${vizSettings.cacheExpiryHours || 24}" min="1" max="168">
                    <span>Summary cache expiry (hours)</span>
                </label>
                
                <label>
                    <input type="number" id="viz-change-threshold" value="${Math.round((vizSettings.changeThreshold || 0.15) * 100)}" min="5" max="50" step="5">
                    <span>Content change threshold (%) - triggers summary refresh</span>
                </label>
                
                <div style="margin-top: 15px;">
                    <button type="button" onclick="clearVisualizationCache()" style="padding: 8px 16px; background: #ff6b35; color: white; border: none; border-radius: 4px; cursor: pointer;">Clear Summary Cache</button>
                    <small style="color: #666; font-size: 11px; margin-left: 10px;">Clears all cached AI summaries</small>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Preview</h3>
            <div class="settings-group">
                <label>
                    <span style="font-weight: bold;">Current Filters:</span>
                </label>
                <div id="filter-preview" style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px; font-family: monospace; font-size: 12px;">
                    <div style="color: #28a745;"><strong>Included:</strong> ${includePatterns.join(', ')}</div>
                    <div style="color: #dc3545; margin-top: 5px;"><strong>Excluded:</strong> ${excludePatterns.join(', ')}</div>
                </div>
                <button type="button" onclick="testVisualizationFilters()" style="margin-top: 10px; padding: 6px 12px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Test Filters</button>
            </div>
        </div>
    `;
}

function generateAdvancedSettings() {
    return `
        <div class="settings-section">
            <h3>Performance</h3>
            <div class="settings-group">
                <label>
                    <input type="checkbox" id="enable-preview-cache" ${currentSettings.performance?.enablePreviewCache ? 'checked' : ''}>
                    <span>Enable Preview Cache</span>
                </label>
                <label>
                    <input type="number" id="max-cache-size" value="${currentSettings.performance?.maxCacheSize || 50}" min="10" max="500">
                    <span>Max Cache Size (MB)</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Developer Options</h3>
            <div class="settings-group">
                <label>
                    <input type="checkbox" id="enable-debug-mode" ${currentSettings.advanced?.enableDebugMode ? 'checked' : ''}>
                    <span>Enable Debug Mode</span>
                </label>
                <label>
                    <input type="checkbox" id="show-performance-metrics" ${currentSettings.advanced?.showPerformanceMetrics ? 'checked' : ''}>
                    <span>Show Performance Metrics</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Data Management</h3>
            <div class="settings-group">
                <button type="button" onclick="exportSettingsFromDialog()">Export Settings</button>
                <button type="button" onclick="importSettingsFromDialog()">Import Settings</button>
                <button type="button" onclick="resetSettingsFromDialog()" style="background: #dc3545; color: white;">Reset All Settings</button>
            </div>
        </div>
    `;
}

function addSettingsEventListeners(category) {
    // Add specific event listeners based on category
    
    // Temperature slider update
    const tempSlider = document.getElementById('ai-temperature');
    if (tempSlider) {
        tempSlider.addEventListener('input', (e) => {
            const valueSpan = document.getElementById('temperature-value');
            if (valueSpan) {
                valueSpan.textContent = e.target.value;
            }
        });
    }
    
    // Visualization settings event listeners
    if (category === 'visualization') {
        // Update filter preview when patterns change
        const includePatterns = document.getElementById('viz-include-patterns');
        const excludePatterns = document.getElementById('viz-exclude-patterns');
        
        function updateFilterPreview() {
            const preview = document.getElementById('filter-preview');
            if (preview && includePatterns && excludePatterns) {
                const includeList = includePatterns.value.split('\n').filter(p => p.trim()).join(', ');
                const excludeList = excludePatterns.value.split('\n').filter(p => p.trim()).join(', ');
                
                preview.innerHTML = `
                    <div style="color: #28a745;"><strong>Included:</strong> ${includeList || 'None'}</div>
                    <div style="color: #dc3545; margin-top: 5px;"><strong>Excluded:</strong> ${excludeList || 'None'}</div>
                `;
            }
        }
        
        if (includePatterns) {
            includePatterns.addEventListener('input', updateFilterPreview);
        }
        if (excludePatterns) {
            excludePatterns.addEventListener('input', updateFilterPreview);
        }
    }
}

async function saveSettingsDialog() {
    try {
        // Collect all form values
        const updatedSettings = collectSettingsFromForm();
        
        // Update settings via IPC
        await window.electronAPI.invoke('set-settings', updatedSettings);
        
        // Update global settings object
        window.appSettings = updatedSettings;
        
        // Apply editor settings immediately
        if (window.applyEditorSettings) {
            window.applyEditorSettings(updatedSettings);
        }
        
        // Refresh chat header if AI settings were changed
        if (updatedSettings.ai && window.refreshChatHeader) {
            try {
                await window.refreshChatHeader();
            } catch (error) {
                console.warn('[Settings] Could not refresh chat header:', error);
            }
        }
        
        // Close dialog
        closeSettingsDialog();
        
        // Show success message
        showNotification('Settings saved successfully', 'success');
        
    } catch (error) {
        console.error('[Renderer] Error saving settings:', error);
        showNotification('Error saving settings', 'error');
    }
}

function collectSettingsFromForm() {
    const updatedSettings = JSON.parse(JSON.stringify(currentSettings));
    
    // General settings
    const workingDir = document.getElementById('working-directory')?.value;
    if (workingDir) updatedSettings.workingDirectory = workingDir;
    
    const defaultFileType = document.getElementById('default-file-type')?.value;
    if (defaultFileType !== undefined) updatedSettings.defaultFileType = defaultFileType;
    
    // Auto-save settings
    const autoSaveEnabled = document.getElementById('auto-save-enabled')?.checked;
    if (autoSaveEnabled !== undefined) {
        if (!updatedSettings.autoSave) updatedSettings.autoSave = {};
        updatedSettings.autoSave.enabled = autoSaveEnabled;
    }
    
    const autoSaveInterval = document.getElementById('auto-save-interval')?.value;
    if (autoSaveInterval) {
        if (!updatedSettings.autoSave) updatedSettings.autoSave = {};
        updatedSettings.autoSave.interval = parseInt(autoSaveInterval);
    }
    
    // Theme settings
    const theme = document.getElementById('theme-select')?.value;
    if (theme) updatedSettings.theme = theme;
    
    // Editor settings
    const fontSize = document.getElementById('editor-font-size')?.value;
    if (fontSize) {
        if (!updatedSettings.editor) updatedSettings.editor = {};
        updatedSettings.editor.fontSize = parseInt(fontSize);
    }
    
    const fontFamily = document.getElementById('editor-font-family')?.value;
    if (fontFamily) {
        if (!updatedSettings.editor) updatedSettings.editor = {};
        updatedSettings.editor.fontFamily = fontFamily;
    }
    
    const showLineNumbers = document.getElementById('show-line-numbers')?.checked;
    if (showLineNumbers !== undefined) {
        if (!updatedSettings.editor) updatedSettings.editor = {};
        updatedSettings.editor.showLineNumbers = showLineNumbers;
    }
    
    const showMinimap = document.getElementById('show-minimap')?.checked;
    if (showMinimap !== undefined) {
        if (!updatedSettings.editor) updatedSettings.editor = {};
        updatedSettings.editor.showMinimap = showMinimap;
    }
    
    const wordWrap = document.getElementById('word-wrap')?.checked;
    if (wordWrap !== undefined) {
        if (!updatedSettings.editor) updatedSettings.editor = {};
        updatedSettings.editor.wordWrap = wordWrap ? 'on' : 'off';
    }
    
    const tabSize = document.getElementById('tab-size')?.value;
    if (tabSize) {
        if (!updatedSettings.editor) updatedSettings.editor = {};
        updatedSettings.editor.tabSize = parseInt(tabSize);
    }
    
    const enableCitationAutocomplete = document.getElementById('enable-citation-autocomplete')?.checked;
    if (enableCitationAutocomplete !== undefined) {
        if (!updatedSettings.editor) updatedSettings.editor = {};
        updatedSettings.editor.enableCitationAutocomplete = enableCitationAutocomplete;
    }
    
    // Gamification settings
    const gamificationEnabled = document.getElementById('gamification-enabled')?.checked;
    if (gamificationEnabled !== undefined) {
        if (!updatedSettings.gamification) updatedSettings.gamification = {};
        updatedSettings.gamification.enabled = gamificationEnabled;
    }
    
    const autoStartSessions = document.getElementById('auto-start-sessions')?.checked;
    if (autoStartSessions !== undefined) {
        if (!updatedSettings.gamification) updatedSettings.gamification = {};
        updatedSettings.gamification.autoStartSessions = autoStartSessions;
    }
    
    const minSessionLength = document.getElementById('min-session-length')?.value;
    if (minSessionLength) {
        if (!updatedSettings.gamification) updatedSettings.gamification = {};
        updatedSettings.gamification.minSessionLength = parseInt(minSessionLength);
    }
    
    const activityTimeout = document.getElementById('activity-timeout')?.value;
    if (activityTimeout) {
        if (!updatedSettings.gamification) updatedSettings.gamification = {};
        updatedSettings.gamification.activityTimeout = parseInt(activityTimeout);
    }
    
    const focusSessionsEnabled = document.getElementById('focus-sessions-enabled')?.checked;
    if (focusSessionsEnabled !== undefined) {
        if (!updatedSettings.gamification) updatedSettings.gamification = {};
        updatedSettings.gamification.focusSessionsEnabled = focusSessionsEnabled;
    }
    
    const defaultFocusDuration = document.getElementById('default-focus-duration')?.value;
    if (defaultFocusDuration) {
        if (!updatedSettings.gamification) updatedSettings.gamification = {};
        updatedSettings.gamification.defaultFocusDuration = parseInt(defaultFocusDuration);
    }
    
    const breakReminders = document.getElementById('break-reminders')?.checked;
    if (breakReminders !== undefined) {
        if (!updatedSettings.gamification) updatedSettings.gamification = {};
        updatedSettings.gamification.breakReminders = breakReminders;
    }
    
    const achievementsEnabled = document.getElementById('achievements-enabled')?.checked;
    if (achievementsEnabled !== undefined) {
        if (!updatedSettings.gamification) updatedSettings.gamification = {};
        updatedSettings.gamification.achievementsEnabled = achievementsEnabled;
    }
    
    const streakTracking = document.getElementById('streak-tracking')?.checked;
    if (streakTracking !== undefined) {
        if (!updatedSettings.gamification) updatedSettings.gamification = {};
        updatedSettings.gamification.streakTracking = streakTracking;
    }
    
    const pointsSystem = document.getElementById('points-system')?.checked;
    if (pointsSystem !== undefined) {
        if (!updatedSettings.gamification) updatedSettings.gamification = {};
        updatedSettings.gamification.pointsSystem = pointsSystem;
    }
    
    const achievementNotifications = document.getElementById('achievement-notifications')?.checked;
    if (achievementNotifications !== undefined) {
        if (!updatedSettings.gamification) updatedSettings.gamification = {};
        updatedSettings.gamification.achievementNotifications = achievementNotifications;
    }
    
    const showProgressBar = document.getElementById('show-progress-bar')?.checked;
    if (showProgressBar !== undefined) {
        if (!updatedSettings.gamification) updatedSettings.gamification = {};
        updatedSettings.gamification.showProgressBar = showProgressBar;
    }
    
    const compactMode = document.getElementById('compact-mode')?.checked;
    if (compactMode !== undefined) {
        if (!updatedSettings.gamification) updatedSettings.gamification = {};
        updatedSettings.gamification.compactMode = compactMode;
    }
    
    const menuCollapsedDefault = document.getElementById('menu-collapsed-default')?.checked;
    if (menuCollapsedDefault !== undefined) {
        if (!updatedSettings.gamification) updatedSettings.gamification = {};
        updatedSettings.gamification.menuCollapsedDefault = menuCollapsedDefault;
    }
    
    // AI settings
    const aiProvider = document.getElementById('ai-provider')?.value;
    if (aiProvider) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        updatedSettings.ai.preferredProvider = aiProvider;
    }
    
    const aiModel = document.getElementById('ai-model')?.value;
    if (aiModel) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        updatedSettings.ai.preferredModel = aiModel;
    }
    
    const aiTemperature = document.getElementById('ai-temperature')?.value;
    if (aiTemperature) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        updatedSettings.ai.temperature = parseFloat(aiTemperature);
    }
    
    const aiMaxTokens = document.getElementById('ai-max-tokens')?.value;
    if (aiMaxTokens) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        updatedSettings.ai.maxTokens = parseInt(aiMaxTokens);
    }
    
    // System prompt settings
    const systemPromptSource = document.querySelector('input[name="system-prompt-source"]:checked')?.value;
    if (systemPromptSource) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        updatedSettings.ai.systemPromptSource = systemPromptSource;
    }
    
    const customSystemPrompt = document.getElementById('custom-system-prompt')?.value;
    if (customSystemPrompt !== undefined) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        updatedSettings.ai.customSystemPrompt = customSystemPrompt;
    }
    
    const systemPromptFile = document.getElementById('system-prompt-file')?.value;
    if (systemPromptFile !== undefined) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        updatedSettings.ai.systemPromptFile = systemPromptFile;
    }
    
    const verboseLogging = document.getElementById('ai-verbose-logging')?.checked;
    if (verboseLogging !== undefined) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        updatedSettings.ai.verboseLogging = verboseLogging;
    }
    
    // Export settings
    const defaultFormat = document.getElementById('default-export-format')?.value;
    if (defaultFormat) {
        if (!updatedSettings.export) updatedSettings.export = {};
        updatedSettings.export.defaultFormat = defaultFormat;
    }
    
    const includeReferences = document.getElementById('include-references')?.checked;
    if (includeReferences !== undefined) {
        if (!updatedSettings.export) updatedSettings.export = {};
        updatedSettings.export.includeReferences = includeReferences;
    }
    
    // Kanban settings
    const todoFilePatterns = document.getElementById('todo-file-patterns')?.value;
    if (todoFilePatterns !== undefined) {
        if (!updatedSettings.kanban) updatedSettings.kanban = {};
        updatedSettings.kanban.todoFilePatterns = todoFilePatterns.split(',').map(p => p.trim()).filter(p => p);
    }
    
    const doneMarkers = document.getElementById('done-markers')?.value;
    if (doneMarkers !== undefined) {
        if (!updatedSettings.kanban) updatedSettings.kanban = {};
        updatedSettings.kanban.doneMarkers = doneMarkers.split(',').map(p => p.trim()).filter(p => p);
    }
    
    const inprogressMarkers = document.getElementById('inprogress-markers')?.value;
    if (inprogressMarkers !== undefined) {
        if (!updatedSettings.kanban) updatedSettings.kanban = {};
        updatedSettings.kanban.inProgressMarkers = inprogressMarkers.split(',').map(p => p.trim()).filter(p => p);
    }
    
    const kanbanDragDrop = document.getElementById('kanban-drag-drop')?.checked;
    if (kanbanDragDrop !== undefined) {
        if (!updatedSettings.kanban) updatedSettings.kanban = {};
        updatedSettings.kanban.enableDragDrop = kanbanDragDrop;
    }
    
    const kanbanAutoSave = document.getElementById('kanban-auto-save')?.checked;
    if (kanbanAutoSave !== undefined) {
        if (!updatedSettings.kanban) updatedSettings.kanban = {};
        updatedSettings.kanban.autoSave = kanbanAutoSave;
    }
    
    // Kanban columns
    const kanbanColumnsEditor = document.getElementById('kanban-columns-editor');
    if (kanbanColumnsEditor) {
        if (!updatedSettings.kanban) updatedSettings.kanban = {};
        updatedSettings.kanban.columns = [];
        
        Array.from(kanbanColumnsEditor.children).forEach((row, index) => {
            const nameInput = row.querySelector('.column-name');
            const colorInput = row.querySelector('.column-color');
            
            if (nameInput && colorInput) {
                updatedSettings.kanban.columns.push({
                    id: nameInput.value.toLowerCase().replace(/\s+/g, '-'),
                    name: nameInput.value,
                    color: colorInput.value
                });
            }
        });
    }
    
    // Visualization settings
    const vizIncludePatterns = document.getElementById('viz-include-patterns')?.value;
    if (vizIncludePatterns !== undefined) {
        if (!updatedSettings.visualization) updatedSettings.visualization = {};
        updatedSettings.visualization.includePatterns = vizIncludePatterns.split('\n').filter(p => p.trim());
    }
    
    const vizExcludePatterns = document.getElementById('viz-exclude-patterns')?.value;
    if (vizExcludePatterns !== undefined) {
        if (!updatedSettings.visualization) updatedSettings.visualization = {};
        updatedSettings.visualization.excludePatterns = vizExcludePatterns.split('\n').filter(p => p.trim());
    }
    
    const vizCacheExpiry = document.getElementById('viz-cache-expiry')?.value;
    if (vizCacheExpiry) {
        if (!updatedSettings.visualization) updatedSettings.visualization = {};
        updatedSettings.visualization.cacheExpiryHours = parseInt(vizCacheExpiry);
    }
    
    const vizChangeThreshold = document.getElementById('viz-change-threshold')?.value;
    if (vizChangeThreshold) {
        if (!updatedSettings.visualization) updatedSettings.visualization = {};
        updatedSettings.visualization.changeThreshold = parseInt(vizChangeThreshold) / 100; // Convert percentage to decimal
    }
    
    return updatedSettings;
}

function closeSettingsDialog() {
    if (settingsDialog) {
        settingsDialog.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// Visualization settings helper functions
function clearVisualizationCache() {
    if (window.sharedSummaryCache) {
        const cacheSize = window.sharedSummaryCache.size;
        window.sharedSummaryCache.clear();
        
        // Also clear preview zoom cache if it exists
        if (window.previewZoom && window.previewZoom.summaryCache) {
            window.previewZoom.summaryCache.clear();
        }
        
        showNotification(`Cleared ${cacheSize} cached summaries`, 'success');
        console.log('[Settings] Cleared visualization cache');
    } else {
        showNotification('No cache to clear', 'info');
    }
}

async function testVisualizationFilters() {
    try {
        const includePatterns = document.getElementById('viz-include-patterns')?.value.split('\n').filter(p => p.trim()) || [];
        const excludePatterns = document.getElementById('viz-exclude-patterns')?.value.split('\n').filter(p => p.trim()) || [];
        
        // Get all files and test filters
        const allFiles = await window.electronAPI.invoke('get-available-files');
        const filteredFiles = filterVisualizationFiles(allFiles, includePatterns, excludePatterns);
        
        // Show results
        const resultDiv = document.createElement('div');
        resultDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10001;
            max-width: 80%;
            max-height: 80%;
            overflow: auto;
        `;
        
        resultDiv.innerHTML = `
            <h3>Filter Test Results</h3>
            <p><strong>Total files found:</strong> ${allFiles.length}</p>
            <p><strong>Files after filtering:</strong> ${filteredFiles.length}</p>
            <div style="margin: 15px 0;">
                <strong>Filtered files:</strong>
                <div style="max-height: 300px; overflow-y: auto; font-family: monospace; font-size: 12px; background: #f8f9fa; padding: 10px; border-radius: 4px; margin-top: 5px;">
                    ${filteredFiles.map(f => `<div>${f}</div>`).join('')}
                </div>
            </div>
            <button onclick="this.parentElement.remove()" style="padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
        `;
        
        document.body.appendChild(resultDiv);
        
    } catch (error) {
        console.error('[Settings] Error testing filters:', error);
        showNotification('Error testing filters', 'error');
    }
}

// Helper functions for dialog buttons
async function changeWorkingDirectory() {
    try {
        const result = await window.electronAPI.invoke('change-working-directory');
        if (result.success) {
            const input = document.getElementById('working-directory');
            if (input && result.directory) {
                input.value = result.directory;
            }
        }
    } catch (error) {
        console.error('[Renderer] Error changing working directory:', error);
    }
}

async function exportSettingsFromDialog() {
    try {
        await window.electronAPI.invoke('export-settings');
        showNotification('Settings exported successfully', 'success');
    } catch (error) {
        console.error('[Renderer] Error exporting settings:', error);
        showNotification('Error exporting settings', 'error');
    }
}

async function importSettingsFromDialog() {
    try {
        await window.electronAPI.invoke('import-settings');
        showNotification('Settings imported successfully', 'success');
    } catch (error) {
        console.error('[Renderer] Error importing settings:', error);
        showNotification('Error importing settings', 'error');
    }
}

function resetSettingsFromDialog() {
    if (confirm('Are you sure you want to reset all settings to their default values? This action cannot be undone.')) {
        // This will be handled by the main process menu action
        showNotification('Use Settings → Reset All Settings from the main menu', 'info');
    }
}

// AI Settings Helper Functions

function generateModelOptions(provider, selectedModel) {
    const models = {
        openai: [
            'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'
        ],
        anthropic: [
            'claude-opus-4-1-20250805', 'claude-opus-4-20250514', 'claude-sonnet-4-20250514',
            'claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022',
            'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'
        ],
        groq: [
            'llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'llama-3.2-90b-text-preview',
            'llama-3.2-11b-text-preview', 'mixtral-8x7b-32768', 'gemma2-9b-it'
        ],
        openrouter: [
            'anthropic/claude-3.5-sonnet', 'anthropic/claude-3-opus', 'openai/gpt-4', 'openai/gpt-4-turbo',
            'meta-llama/llama-3.1-70b-instruct', 'google/gemini-pro-1.5', 'mistralai/mistral-large'
        ]
    };
    
    if (provider === 'auto' || !models[provider]) {
        return '';
    }
    
    return models[provider].map(model => 
        `<option value="${model}" ${selectedModel === model ? 'selected' : ''}>${model}</option>`
    ).join('');
}

async function updateModelOptions() {
    const providerSelect = document.getElementById('ai-provider');
    const modelSelect = document.getElementById('ai-model');
    const currentConfigDiv = document.getElementById('current-config');
    
    if (!providerSelect || !modelSelect || !currentConfigDiv) return;
    
    const provider = providerSelect.value;
    
    // Update model options
    if (provider === 'auto') {
        modelSelect.innerHTML = '<option value="auto" selected>Auto (Provider Default)</option>';
    } else {
        modelSelect.innerHTML = '<option value="auto">Auto (Provider Default)</option>' + 
                                generateModelOptions(provider, null);
    }
    
    // Update current configuration display
    try {
        const currentConfig = await window.electronAPI.invoke('get-current-ai-config');
        const configText = currentConfig.success ? 
            `Current: ${currentConfig.provider} / ${currentConfig.model}` :
            'Current: Configuration unavailable';
        currentConfigDiv.textContent = configText;
    } catch (error) {
        currentConfigDiv.textContent = 'Current: Error loading configuration';
    }
}

function toggleSystemPromptOptions() {
    const source = document.querySelector('input[name="system-prompt-source"]:checked')?.value;
    
    const customArea = document.getElementById('custom-prompt-area');
    const fileArea = document.getElementById('file-prompt-area');
    const defaultPreview = document.getElementById('default-prompt-preview');
    const customTextarea = document.getElementById('custom-system-prompt');
    
    if (customArea) customArea.style.display = source === 'custom' ? 'block' : 'none';
    if (fileArea) fileArea.style.display = source === 'file' ? 'block' : 'none';
    if (defaultPreview) defaultPreview.style.display = (!source || source === 'default') ? 'block' : 'none';
    
    // When switching to custom text, populate with default prompt if empty
    if (source === 'custom' && customTextarea) {
        const currentValue = customTextarea.value.trim();
        if (!currentValue) {
            const defaultPrompt = 'You are a helpful assistant integrated into a Markdown editor for Hegelian philosophy and pedagogy. Provide thoughtful, educational responses.';
            customTextarea.value = defaultPrompt;
        }
    }
}

async function browseSystemPromptFile() {
    try {
        const result = await window.electronAPI.invoke('browse-system-prompt-file');
        if (result.success && result.filePath) {
            const input = document.getElementById('system-prompt-file');
            if (input) {
                input.value = result.filePath;
            }
        }
    } catch (error) {
        console.error('[Settings] Error browsing system prompt file:', error);
        showNotification('Error browsing for system prompt file', 'error');
    }
}

// Gamification Settings Helper Functions

function clearGamificationData() {
    if (confirm('Are you sure you want to clear all gamification data? This will reset all streaks, achievements, points, and session history. This action cannot be undone.')) {
        try {
            // Clear localStorage data
            localStorage.removeItem('gamification_daily_stats');
            localStorage.removeItem('gamification_streak_data');
            localStorage.removeItem('gamification_achievements');
            localStorage.removeItem('gamification_rewards');
            localStorage.removeItem('gamification_focus_settings');
            localStorage.removeItem('gamification-menu-expanded');
            
            showNotification('All gamification data has been cleared', 'success');
            
            // Reinitialize gamification if it exists
            if (window.gamificationInstance) {
                window.gamificationInstance.dailyStats = {};
                window.gamificationInstance.streakData = {
                    currentStreak: 0,
                    longestStreak: 0,
                    lastWritingDay: null
                };
                window.gamificationInstance.achievements = {};
                window.gamificationInstance.rewards = {
                    totalPoints: 0,
                    badges: {},
                    customRewards: []
                };
                
                // Update UI if visible
                if (window.gamificationInstance.updateGamificationUI) {
                    window.gamificationInstance.updateGamificationUI();
                }
            }
            
        } catch (error) {
            console.error('[Settings] Error clearing gamification data:', error);
            showNotification('Error clearing gamification data', 'error');
        }
    }
}

function exportGamificationData() {
    try {
        const gamificationData = {
            dailyStats: JSON.parse(localStorage.getItem('gamification_daily_stats') || '{}'),
            streakData: JSON.parse(localStorage.getItem('gamification_streak_data') || '{}'),
            achievements: JSON.parse(localStorage.getItem('gamification_achievements') || '{}'),
            rewards: JSON.parse(localStorage.getItem('gamification_rewards') || '{}'),
            focusSettings: JSON.parse(localStorage.getItem('gamification_focus_settings') || '{}'),
            exportDate: new Date().toISOString(),
            version: '1.0'
        };
        
        const dataStr = JSON.stringify(gamificationData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `gamification-data-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Gamification data exported successfully', 'success');
        
    } catch (error) {
        console.error('[Settings] Error exporting gamification data:', error);
        showNotification('Error exporting gamification data', 'error');
    }
}

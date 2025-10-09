
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
        settingsDialog.classList.add('active');
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
    settingsDialog.className = 'modal-overlay';
    
    // Create dialog content
    const dialogContent = document.createElement('div');
    dialogContent.className = 'modal-dialog';
    
    // Create dialog header
    const header = document.createElement('div');
    header.className = 'modal-header';
    
    const title = document.createElement('h2');
    title.id = 'settings-title';
    title.textContent = 'Settings';
    title.className = 'modal-title';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.className = 'modal-close';
    closeBtn.onclick = closeSettingsDialog;
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    
    // Create dialog body
    const body = document.createElement('div');
    body.className = 'modal-body';
    
    // Create sidebar
    const sidebar = document.createElement('div');
    sidebar.id = 'settings-sidebar';
    sidebar.className = 'modal-sidebar';
    
    // Create content area
    const content = document.createElement('div');
    content.id = 'settings-content';
    content.className = 'modal-content';
    
    // Settings styles are now in main CSS file
    
    body.appendChild(sidebar);
    body.appendChild(content);
    
    // Create footer
    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'btn btn-secondary';
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
        if (e.key === 'Escape' && settingsDialog.classList.contains('active')) {
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
        { id: 'themes', label: 'Templates', icon: '🎭' },
        { id: 'editor', label: 'Editor', icon: '📝' },
        { id: 'gamification', label: 'Gamification', icon: '🎮' },
        { id: 'ai', label: 'AI Settings', icon: '🤖' },
        { id: 'ai-prompts', label: 'AI Custom Prompts', icon: '💬' },
        { id: 'tts', label: 'Text-to-Speech', icon: '🔊' },
        { id: 'export', label: 'Export', icon: '📤' },
        { id: 'kanban', label: 'Kanban', icon: '📋' },
        { id: 'visualization', label: 'Visualizations', icon: '🕸️' },
        { id: 'advanced', label: 'Advanced', icon: '🔧' }
    ];
    
    // Create navigation list
    const nav = document.createElement('ul');
    nav.className = 'settings-nav';
    sidebar.innerHTML = '';
    
    categories.forEach(category => {
        const item = document.createElement('li');
        item.className = 'settings-nav-item';
        item.dataset.category = category.id;
        
        item.innerHTML = `
            <span class="nav-icon">${category.icon}</span>
            <span class="nav-label">${category.label}</span>
        `;
        
        item.addEventListener('click', () => {
            showSettingsCategory(category.id);
        });
        
        nav.appendChild(item);
    });
    
    sidebar.appendChild(nav);
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
            themes: 'Templates',
            editor: 'Editor Settings',
            gamification: 'Gamification Settings',
            ai: 'AI Configuration',
            tts: 'Text-to-Speech Settings',
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
        case 'themes':
            return generateThemesSettings();
        case 'editor':
            return generateEditorSettings();
        case 'gamification':
            return generateGamificationSettings();
        case 'ai':
            return generateAISettings();
        case 'ai-prompts':
            return generateAIPromptsSettings();
        case 'tts':
            return generateTTSSettings();
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
        
        <div class="settings-section">
            <h3>Internal Links</h3>
            <div class="settings-group">
                <label>
                    <select id="link-preview-mode">
                        <option value="disabled" ${(currentSettings.linkPreview?.mode || 'hover') === 'disabled' ? 'selected' : ''}>Disabled (plain text)</option>
                        <option value="hover" ${(currentSettings.linkPreview?.mode || 'hover') === 'hover' ? 'selected' : ''}>Hover (tooltip preview)</option>
                        <option value="inline" ${(currentSettings.linkPreview?.mode || 'hover') === 'inline' ? 'selected' : ''}>Inline (embedded content)</option>
                    </select>
                    <span>Link preview mode</span>
                </label>
                <p style="color: #666; font-size: 13px; margin: 8px 0;">
                    Choose how internal links ([[filename]]) are displayed and behave in your documents.
                </p>
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

function generateThemesSettings() {
    return `
        <div class="settings-section">
            <h3>Presentation Templates</h3>
            <div class="settings-group">
                <label>
                    <select id="presentation-template-select">
                        <option value="default" ${(currentSettings.stylePreferences?.presentationTemplate || 'default') === 'default' ? 'selected' : ''}>Default</option>
                        <option value="academic" ${(currentSettings.stylePreferences?.presentationTemplate || 'default') === 'academic' ? 'selected' : ''}>Academic</option>
                        <option value="minimal" ${(currentSettings.stylePreferences?.presentationTemplate || 'default') === 'minimal' ? 'selected' : ''}>Minimal</option>
                        <option value="dark" ${(currentSettings.stylePreferences?.presentationTemplate || 'default') === 'dark' ? 'selected' : ''}>Dark</option>
                    </select>
                    <span>Presentation Template</span>
                </label>
                <div style="font-size: 12px; color: #666; margin-top: 5px;">
                    Choose the visual template for presentation mode slides
                </div>
            </div>
        </div>

        <div class="settings-section">
            <h3>Preview Templates</h3>
            <div class="settings-group">
                <label>
                    <select id="preview-style-select">
                        <option value="latex" ${(currentSettings.stylePreferences?.previewStyle || 'latex') === 'latex' ? 'selected' : ''}>LaTeX Document</option>
                        <option value="academic-preview" ${(currentSettings.stylePreferences?.previewStyle || 'latex') === 'academic-preview' ? 'selected' : ''}>Academic Preview</option>
                        <option value="minimal-preview" ${(currentSettings.stylePreferences?.previewStyle || 'latex') === 'minimal-preview' ? 'selected' : ''}>Minimal Preview</option>
                    </select>
                    <span>Preview Style</span>
                </label>
                <div style="font-size: 12px; color: #666; margin-top: 5px;">
                    Choose the visual style for the document preview pane
                </div>
            </div>
        </div>

        <div class="settings-section">
            <h3>Export Templates</h3>
            <div class="settings-group">
                <label>
                    <select id="export-style-select">
                        <option value="academic-export" ${(currentSettings.stylePreferences?.exportStyle || 'academic-export') === 'academic-export' ? 'selected' : ''}>Academic Export</option>
                    </select>
                    <span>Export Style</span>
                </label>
                <div style="font-size: 12px; color: #666; margin-top: 5px;">
                    Choose the visual style for PDF and HTML exports
                </div>
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
            <h3>AI Companion Behavior</h3>
            <p style="color: #666; font-size: 13px; margin-bottom: 15px;">
                Configure how the AI writing companion interacts with you while writing.
            </p>
            <div class="settings-group">
                <label>
                    <input type="checkbox" id="ai-companion-show-response-notifications" ${currentSettings?.aiCompanion?.showResponseNotifications !== false ? 'checked' : ''}>
                    <span>Show "Ash has responded!" notifications</span>
                </label>
                <p style="color: #666; font-size: 12px; margin-left: 20px; margin-top: 5px;">
                    When disabled, Ash will still provide feedback popups but won't show notification messages about responses.
                </p>
            </div>
        </div>

        <div class="settings-section">
            <h3>AI Assistant Configuration</h3>
            <p style="color: #666; font-size: 13px; margin-bottom: 15px;">
                Configure different AI assistants for different purposes. Ash provides quick writing feedback, while Dr. Chen offers deep dialogue and analysis.
            </p>
            
            <!-- Assistant Selection Tabs -->
            <div class="assistant-tabs" style="margin-bottom: 20px;">
                <button class="assistant-tab active" onclick="switchAssistantTab('ash')" id="ash-tab">Ash (Quick Feedback)</button>
                <button class="assistant-tab" onclick="switchAssistantTab('chen')" id="chen-tab">Dr. Chen (Deep Dialogue)</button>
            </div>
            
            <!-- Ash Configuration -->
            <div id="ash-config" class="assistant-config active">
                <h4 style="color: #007acc; margin-bottom: 15px;">Ash - AI Writing Companion</h4>
                <div class="settings-group">
                    <label>
                        <select id="ash-provider" onchange="updateModelOptions('ash')">
                            <option value="auto" ${getAssistantProvider('ash') === 'auto' ? 'selected' : ''}>Auto (Use Available)</option>
                            <option value="openai" ${getAssistantProvider('ash') === 'openai' ? 'selected' : ''}>OpenAI</option>
                            <option value="anthropic" ${getAssistantProvider('ash') === 'anthropic' ? 'selected' : ''}>Anthropic</option>
                            <option value="gemini" ${getAssistantProvider('ash') === 'gemini' ? 'selected' : ''}>Google Gemini</option>
                            <option value="groq" ${getAssistantProvider('ash') === 'groq' ? 'selected' : ''}>Groq</option>
                            <option value="openrouter" ${getAssistantProvider('ash') === 'openrouter' ? 'selected' : ''}>OpenRouter</option>
                            <option value="local" ${getAssistantProvider('ash') === 'local' ? 'selected' : ''}>Local AI</option>
                        </select>
                        <span>AI Provider</span>
                    </label>
                    <label>
                        <select id="ash-model">
                            <option value="auto">Auto (Provider Default)</option>
                            ${generateModelOptions(getAssistantProvider('ash'), getAssistantModel('ash'))}
                        </select>
                        <span>AI Model</span>
                    </label>
                    <label>
                        <input type="range" id="ash-temperature" min="0" max="2" step="0.1" value="${getAssistantTemperature('ash')}">
                        <span>Temperature: <span id="ash-temperature-value">${getAssistantTemperature('ash')}</span></span>
                    </label>
                    <label>
                        <input type="number" id="ash-max-tokens" value="${getAssistantMaxTokens('ash')}" min="50" max="500" step="10">
                        <span>Max Tokens (Brief responses)</span>
                    </label>
                    <label>
                        <textarea id="ash-system-prompt" rows="6" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace; font-size: 12px; resize: vertical;">${getAssistantSystemPrompt('ash')}</textarea>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                            <span>System Prompt</span>
                            <button type="button" onclick="resetSystemPrompt('ash')" style="padding: 4px 8px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">
                                Use Default Prompt
                            </button>
                        </div>
                        <div style="font-size: 11px; color: #666; margin-top: 4px;">
                            Customize Ash's personality and behavior. This prompt defines how Ash responds and interacts.
                        </div>
                    </label>
                </div>
            </div>
            
            <!-- Dr. Chen Configuration -->
            <div id="chen-config" class="assistant-config">
                <h4 style="color: #007acc; margin-bottom: 15px;">Dr. Chen - Philosophical Dialogue Partner</h4>
                <div class="settings-group">
                    <label>
                        <select id="chen-provider" onchange="updateModelOptions('chen')">
                            <option value="auto" ${getAssistantProvider('chen') === 'auto' ? 'selected' : ''}>Auto (Use Available)</option>
                            <option value="openai" ${getAssistantProvider('chen') === 'openai' ? 'selected' : ''}>OpenAI</option>
                            <option value="anthropic" ${getAssistantProvider('chen') === 'anthropic' ? 'selected' : ''}>Anthropic</option>
                            <option value="gemini" ${getAssistantProvider('chen') === 'gemini' ? 'selected' : ''}>Google Gemini</option>
                            <option value="groq" ${getAssistantProvider('chen') === 'groq' ? 'selected' : ''}>Groq</option>
                            <option value="openrouter" ${getAssistantProvider('chen') === 'openrouter' ? 'selected' : ''}>OpenRouter</option>
                            <option value="local" ${getAssistantProvider('chen') === 'local' ? 'selected' : ''}>Local AI</option>
                        </select>
                        <span>AI Provider</span>
                    </label>
                    <label>
                        <select id="chen-model">
                            <option value="auto">Auto (Provider Default)</option>
                            ${generateModelOptions(getAssistantProvider('chen'), getAssistantModel('chen'))}
                        </select>
                        <span>AI Model</span>
                    </label>
                    <label>
                        <input type="range" id="chen-temperature" min="0" max="2" step="0.1" value="${getAssistantTemperature('chen')}">
                        <span>Temperature: <span id="chen-temperature-value">${getAssistantTemperature('chen')}</span></span>
                    </label>
                    <label>
                        <input type="number" id="chen-max-tokens" value="${getAssistantMaxTokens('chen')}" min="200" max="2000" step="50">
                        <span>Max Tokens (Detailed responses)</span>
                    </label>
                    <label>
                        <textarea id="chen-system-prompt" rows="8" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace; font-size: 12px; resize: vertical;">${getAssistantSystemPrompt('chen')}</textarea>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                            <span>System Prompt</span>
                            <button type="button" onclick="resetSystemPrompt('chen')" style="padding: 4px 8px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">
                                Use Default Prompt
                            </button>
                        </div>
                        <div style="font-size: 11px; color: #666; margin-top: 4px;">
                            Customize Dr. Chen's personality and behavior. This prompt defines how Dr. Chen responds and engages in philosophical dialogue.
                        </div>
                    </label>
                </div>
            </div>
            
            <!-- Local AI Configuration -->
            <div class="settings-section">
                <h3>Local AI Configuration</h3>
                <div class="settings-group" id="local-ai-config">
                    <label>
                        <input type="text" id="local-ai-url" value="${currentSettings.ai?.localAIUrl || 'http://localhost:1234/'}" placeholder="http://localhost:1234/" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        <span>Local AI Server URL</span>
                    </label>
                    <div style="font-size: 11px; color: #666; margin-top: 4px;">
                        URL for your local AI server (OpenAI-compatible API). Include the trailing slash.
                    </div>
                    <div style="font-size: 11px; color: #666; margin-top: 8px;">
                        <strong>Note:</strong> This setting applies when either assistant uses "Local AI" provider.
                    </div>
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
                <label>
                    <input type="checkbox" id="ai-writing-companion-enabled" ${currentSettings.ai?.enableWritingCompanion !== false ? 'checked' : ''} onchange="toggleWritingCompanionOptions()">
                    <span>Enable AI Writing Companion</span>
                </label>
                <div style="margin-left: 20px; font-size: 11px; color: #666; margin-top: 2px;">
                    Real-time flow detection, contextual feedback, and intelligent writing insights
                </div>
                
                <div style="margin-left: 20px; margin-top: 10px; display: ${currentSettings.ai?.enableWritingCompanion !== false ? 'block' : 'none'};" id="writing-companion-options">
                    <label style="display: block; margin-bottom: 5px; font-size: 12px; color: #333;">Context Scope:</label>
                    <select id="ai-companion-context-scope" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 11px;">
                        <option value="full_document" ${(!currentSettings.ai?.companionContextScope || currentSettings.ai?.companionContextScope === 'full_document') ? 'selected' : ''}>Full Document (Recommended)</option>
                        <option value="recent_text_only" ${currentSettings.ai?.companionContextScope === 'recent_text_only' ? 'selected' : ''}>Recent Text Only</option>
                        <option value="selected_text_only" ${currentSettings.ai?.companionContextScope === 'selected_text_only' ? 'selected' : ''}>Selected Text Only</option>
                    </select>
                    <div style="font-size: 10px; color: #666; margin-top: 3px;">
                        Controls how much context the AI writing companion uses for feedback
                    </div>
                    
                    <div style="margin-top: 8px;">
                        <label style="display: block; margin-bottom: 3px; font-size: 12px; color: #333;">Max Document Length:</label>
                        <input type="number" id="ai-companion-max-context" value="${currentSettings.ai?.companionMaxContextLength || 10000}" min="1000" max="50000" step="1000" style="width: 100%; padding: 4px; border: 1px solid #ccc; border-radius: 4px; font-size: 11px;">
                        <div style="font-size: 10px; color: #666; margin-top: 2px;">
                            Maximum characters to send as context (for performance)
                        </div>
                    </div>
                    
                    <div style="margin-top: 8px;">
                        <label style="display: block; margin-bottom: 3px; font-size: 12px; color: #333;">Minimum Characters for AI Feedback:</label>
                        <input type="number" id="ai-companion-character-threshold" value="${currentSettings.ai?.companionCharacterThreshold || 500}" min="100" max="2000" step="100" style="width: 100%; padding: 4px; border: 1px solid #ccc; border-radius: 4px; font-size: 11px;">
                        <div style="font-size: 10px; color: #666; margin-top: 2px;">
                            Characters to type before AI can provide feedback (prevents frequent interruptions)
                        </div>
                    </div>
                    
                    <div style="margin-top: 8px;">
                        <label style="display: block; margin-bottom: 3px; font-size: 12px; color: #333;">Minimum Words for AI Feedback:</label>
                        <input type="number" id="ai-companion-word-threshold" value="${currentSettings.ai?.companionWordThreshold || 10}" min="5" max="50" step="5" style="width: 100%; padding: 4px; border: 1px solid #ccc; border-radius: 4px; font-size: 11px;">
                        <div style="font-size: 10px; color: #666; margin-top: 2px;">
                            Words to type before AI can provide feedback (alternative to character count)
                        </div>
                    </div>
                    
                    <div style="margin-top: 8px;">
                        <label style="display: block; margin-bottom: 3px; font-size: 12px; color: #333;">AI Cooldown Period (seconds):</label>
                        <input type="number" id="ai-companion-cooldown-period" value="${(currentSettings.ai?.companionCooldownPeriod || 30000) / 1000}" min="10" max="300" step="10" style="width: 100%; padding: 4px; border: 1px solid #ccc; border-radius: 4px; font-size: 11px;">
                        <div style="font-size: 10px; color: #666; margin-top: 2px;">
                            Minimum time between AI feedback messages (prevents API spam)
                        </div>
                    </div>
                </div>
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

function generateAIPromptsSettings() {
    return `
        <div class="settings-section">
            <h3>Custom AI Prompts</h3>
            <p style="color: #666; font-size: 13px; margin-bottom: 15px;">
                Create custom slash commands for AI Chat with your own prompts and templates. Use <code>{content}</code> to insert selected text or document content, and <code>{statistics}</code> for document statistics.
            </p>
            
            <div id="slash-commands-container">
                <!-- Slash commands will be populated here -->
            </div>
            
            <div style="margin-top: 15px;">
                <button type="button" onclick="addSlashCommand()" style="padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    + Add New Command
                </button>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Template Variables</h3>
            <p style="color: #666; font-size: 13px; margin-bottom: 15px;">
                Use these template variables in your custom prompts:
            </p>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 12px;">
                <div style="margin-bottom: 8px;"><code>{content}</code> - Selected text or current document content</div>
                <div style="margin-bottom: 8px;"><code>{statistics}</code> - Document statistics (word count, reading time, etc.)</div>
                <div style="margin-bottom: 8px;"><code>{filename}</code> - Current file name</div>
                <div><code>{timestamp}</code> - Current date and time</div>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Example Commands</h3>
            <p style="color: #666; font-size: 13px; margin-bottom: 15px;">
                Here are some useful command examples you can create:
            </p>
            <div style="background: #f0f8ff; padding: 15px; border-radius: 8px; font-size: 13px;">
                <div style="margin-bottom: 12px;"><strong>/summarize</strong> - Summarize the current content</div>
                <div style="margin-bottom: 12px;"><strong>/improve</strong> - Suggest improvements for writing style and clarity</div>
                <div style="margin-bottom: 12px;"><strong>/translate</strong> - Translate content to another language</div>
                <div style="margin-bottom: 12px;"><strong>/brainstorm</strong> - Generate related ideas and concepts</div>
                <div><strong>/format</strong> - Suggest better formatting and structure</div>
            </div>
        </div>
    `;
}

// Populate slash commands in AI settings
function populateSlashCommands() {
    const container = document.getElementById('slash-commands-container');
    if (!container) return;
    
    const slashCommands = currentSettings.ai?.slashCommands || {};
    container.innerHTML = '';
    
    if (Object.keys(slashCommands).length === 0) {
        container.innerHTML = '<p style="color: #666; font-style: italic;">No slash commands configured. Click "Add New Command" to create one.</p>';
        return;
    }
    
    Object.entries(slashCommands).forEach(([command, config]) => {
        const commandDiv = document.createElement('div');
        commandDiv.className = 'slash-command-item';
        commandDiv.style.cssText = `
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
            background: #f9f9f9;
            position: relative;
        `;
        
        commandDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                <h4 style="margin: 0; color: #007acc; font-size: 14px;">${command}</h4>
                <button type="button" onclick="removeSlashCommand('${command}')" 
                        style="background: #dc3545; color: white; border: none; border-radius: 3px; padding: 4px 8px; cursor: pointer; font-size: 12px;">
                    Delete
                </button>
            </div>
            
            <div style="margin-bottom: 10px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold; font-size: 12px;">Command Name:</label>
                <input type="text" value="${command}" onchange="updateSlashCommand('${command}', 'command', this.value)"
                       style="width: 30%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px;">
            </div>
            
            <div style="margin-bottom: 10px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold; font-size: 12px;">Display Name:</label>
                <input type="text" value="${config.name || ''}" onchange="updateSlashCommand('${command}', 'name', this.value)"
                       style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px;">
            </div>
            
            <div style="margin-bottom: 10px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold; font-size: 12px;">Description:</label>
                <input type="text" value="${config.description || ''}" onchange="updateSlashCommand('${command}', 'description', this.value)"
                       style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px;">
            </div>
            
            <div>
                <label style="display: block; margin-bottom: 5px; font-weight: bold; font-size: 12px;">Prompt Template:</label>
                <div style="font-size: 11px; color: #666; margin-bottom: 5px;">
                    Use <code>{content}</code> for selected text/document content, <code>{statistics}</code> for document statistics.
                </div>
                <textarea onchange="updateSlashCommand('${command}', 'prompt', this.value)"
                          style="width: 100%; height: 120px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace; font-size: 11px; resize: vertical;">${config.prompt || ''}</textarea>
            </div>
        `;
        
        container.appendChild(commandDiv);
    });
}

// Add new slash command
function addSlashCommand() {
    const command = prompt('Enter command name (including /):', '/newcommand');
    if (!command || !command.startsWith('/')) {
        alert('Command must start with /');
        return;
    }
    
    if (!currentSettings.ai) currentSettings.ai = {};
    if (!currentSettings.ai.slashCommands) currentSettings.ai.slashCommands = {};
    
    currentSettings.ai.slashCommands[command] = {
        name: 'New Command',
        description: 'Description of what this command does',
        prompt: 'Your prompt template here. Use {content} to insert the content to analyze.'
    };
    
    populateSlashCommands();
}

// Update slash command property
function updateSlashCommand(oldCommand, property, newValue) {
    if (!currentSettings.ai?.slashCommands?.[oldCommand]) return;
    
    if (property === 'command') {
        // Renaming command
        if (!newValue.startsWith('/')) {
            alert('Command must start with /');
            populateSlashCommands(); // Reset the UI
            return;
        }
        
        if (newValue !== oldCommand && currentSettings.ai.slashCommands[newValue]) {
            alert('Command already exists!');
            populateSlashCommands(); // Reset the UI
            return;
        }
        
        // Move to new key
        currentSettings.ai.slashCommands[newValue] = currentSettings.ai.slashCommands[oldCommand];
        delete currentSettings.ai.slashCommands[oldCommand];
        populateSlashCommands(); // Refresh UI
    } else {
        // Updating other properties
        currentSettings.ai.slashCommands[oldCommand][property] = newValue;
    }
}

// Remove slash command
function removeSlashCommand(command) {
    if (confirm(`Delete command ${command}?`)) {
        if (currentSettings.ai?.slashCommands) {
            delete currentSettings.ai.slashCommands[command];
            populateSlashCommands();
        }
    }
}

function generateTTSSettings() {
    const ttsSettings = currentSettings.tts || {};
    const lemonfoxSettings = ttsSettings.lemonfox || {};
    const webSpeechSettings = ttsSettings.webSpeech || {};
    
    return `
        <div class="settings-section">
            <h3>General TTS Settings</h3>
            <div class="settings-group">
                <label>
                    <input type="checkbox" id="tts-enabled" ${ttsSettings.enabled ? 'checked' : ''}>
                    <span>Enable TTS in Presentation Mode</span>
                </label>
                <label>
                    <select id="tts-provider">
                        <option value="auto" ${ttsSettings.provider === 'auto' ? 'selected' : ''}>Auto (Prefer Lemonfox.ai)</option>
                        <option value="lemonfox" ${ttsSettings.provider === 'lemonfox' ? 'selected' : ''}>Lemonfox.ai Only</option>
                        <option value="webspeech" ${ttsSettings.provider === 'webspeech' ? 'selected' : ''}>Web Speech API Only</option>
                    </select>
                    <span>TTS Provider</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Behavior Settings</h3>
            <div class="settings-group">
                <label>
                    <input type="checkbox" id="tts-auto-speak" ${ttsSettings.autoSpeak !== false ? 'checked' : ''}>
                    <span>Auto-speak when slide changes</span>
                </label>
                <label>
                    <input type="checkbox" id="tts-stop-on-slide-change" ${ttsSettings.stopOnSlideChange !== false ? 'checked' : ''}>
                    <span>Stop current speech when changing slides</span>
                </label>
                <label>
                    <input type="checkbox" id="tts-clean-markdown" ${ttsSettings.cleanMarkdown !== false ? 'checked' : ''}>
                    <span>Clean markdown formatting before speaking</span>
                </label>
                <label>
                    <input type="checkbox" id="tts-speak-speaker-notes" ${ttsSettings.speakSpeakerNotes !== false ? 'checked' : ''}>
                    <span>Speak speaker notes instead of slide content</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Lemonfox.ai Settings</h3>
            <p style="color: #666; font-size: 13px; margin-bottom: 15px;">
                High-quality neural voices powered by Lemonfox.ai. Requires LEMONFOX_API_KEY environment variable.
            </p>
            <div class="settings-group">
                <label>
                    <select id="tts-lemonfox-voice">
                        <option value="sarah" ${lemonfoxSettings.voice === 'sarah' ? 'selected' : ''}>Sarah (Female)</option>
                        <option value="michael" ${lemonfoxSettings.voice === 'michael' ? 'selected' : ''}>Michael (Male)</option>
                        <option value="alice" ${lemonfoxSettings.voice === 'alice' ? 'selected' : ''}>Alice (Female)</option>
                        <option value="john" ${lemonfoxSettings.voice === 'john' ? 'selected' : ''}>John (Male)</option>
                        <option value="emily" ${lemonfoxSettings.voice === 'emily' ? 'selected' : ''}>Emily (Female)</option>
                    </select>
                    <span>Voice</span>
                </label>
                <label>
                    <select id="tts-lemonfox-language">
                        <option value="en-us" ${lemonfoxSettings.language === 'en-us' ? 'selected' : ''}>English (US)</option>
                        <option value="en-gb" ${lemonfoxSettings.language === 'en-gb' ? 'selected' : ''}>English (UK)</option>
                        <option value="es" ${lemonfoxSettings.language === 'es' ? 'selected' : ''}>Spanish</option>
                        <option value="fr" ${lemonfoxSettings.language === 'fr' ? 'selected' : ''}>French</option>
                        <option value="it" ${lemonfoxSettings.language === 'it' ? 'selected' : ''}>Italian</option>
                        <option value="pt-br" ${lemonfoxSettings.language === 'pt-br' ? 'selected' : ''}>Portuguese (Brazil)</option>
                        <option value="ja" ${lemonfoxSettings.language === 'ja' ? 'selected' : ''}>Japanese</option>
                        <option value="zh" ${lemonfoxSettings.language === 'zh' ? 'selected' : ''}>Chinese</option>
                        <option value="hi" ${lemonfoxSettings.language === 'hi' ? 'selected' : ''}>Hindi</option>
                    </select>
                    <span>Language</span>
                </label>
                <label>
                    <input type="range" id="tts-lemonfox-speed" min="0.5" max="4.0" step="0.1" value="${lemonfoxSettings.speed || 1.0}">
                    <span>Speech Speed (${lemonfoxSettings.speed || 1.0}x)</span>
                </label>
                <label>
                    <select id="tts-lemonfox-format">
                        <option value="mp3" ${lemonfoxSettings.response_format === 'mp3' ? 'selected' : ''}>MP3</option>
                        <option value="opus" ${lemonfoxSettings.response_format === 'opus' ? 'selected' : ''}>Opus</option>
                        <option value="aac" ${lemonfoxSettings.response_format === 'aac' ? 'selected' : ''}>AAC</option>
                        <option value="flac" ${lemonfoxSettings.response_format === 'flac' ? 'selected' : ''}>FLAC</option>
                        <option value="wav" ${lemonfoxSettings.response_format === 'wav' ? 'selected' : ''}>WAV</option>
                        <option value="ogg" ${lemonfoxSettings.response_format === 'ogg' ? 'selected' : ''}>OGG</option>
                        <option value="pcm" ${lemonfoxSettings.response_format === 'pcm' ? 'selected' : ''}>PCM</option>
                    </select>
                    <span>Audio Format</span>
                </label>
                <label>
                    <input type="checkbox" id="tts-lemonfox-timestamps" ${lemonfoxSettings.word_timestamps ? 'checked' : ''}>
                    <span>Include word timestamps (English only)</span>
                </label>
            </div>
        </div>
        
        <div class="settings-section">
            <h3>Web Speech API Settings</h3>
            <p style="color: #666; font-size: 13px; margin-bottom: 15px;">
                Fallback to browser's built-in text-to-speech when Lemonfox.ai is not available.
            </p>
            <div class="settings-group">
                <label>
                    <input type="range" id="tts-webspeech-rate" min="0.1" max="10" step="0.1" value="${webSpeechSettings.rate || 1.0}">
                    <span>Speech Rate (${webSpeechSettings.rate || 1.0}x)</span>
                </label>
                <label>
                    <input type="range" id="tts-webspeech-pitch" min="0" max="2" step="0.1" value="${webSpeechSettings.pitch || 1.0}">
                    <span>Speech Pitch (${webSpeechSettings.pitch || 1.0})</span>
                </label>
                <label>
                    <input type="range" id="tts-webspeech-volume" min="0" max="1" step="0.1" value="${webSpeechSettings.volume || 1.0}">
                    <span>Speech Volume (${Math.round((webSpeechSettings.volume || 1.0) * 100)}%)</span>
                </label>
            </div>
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

function applyTheme(theme) {
    const body = document.body;

    // Remove existing theme classes
    body.classList.remove('dark-mode');

    if (theme === 'dark') {
        body.classList.add('dark-mode');
    } else if (theme === 'auto') {
        // Check system preference
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            body.classList.add('dark-mode');
        }
    }
    // 'light' theme is the default (no class needed)
}

// Make applyTheme available globally
window.applyTheme = applyTheme;

function addSettingsEventListeners(category) {
    // Add specific event listeners based on category
    
    // Link preview mode dropdown
    const linkPreviewMode = document.getElementById('link-preview-mode');
    if (linkPreviewMode) {
        linkPreviewMode.addEventListener('change', async (e) => {
            const newMode = e.target.value;
            
            // Update internal links settings
            if (window.setLinkPreviewMode) {
                window.setLinkPreviewMode(newMode);
            }
            
            // Update app settings
            if (!window.appSettings) window.appSettings = {};
            if (!window.appSettings.linkPreview) window.appSettings.linkPreview = {};
            window.appSettings.linkPreview.mode = newMode;
            
            // Save settings
            try {
                await window.electronAPI.invoke('set-settings', window.appSettings);
                
                // Update currentSettings to reflect the change
                if (!currentSettings.linkPreview) currentSettings.linkPreview = {};
                currentSettings.linkPreview.mode = newMode;
                
                // Add visual feedback - briefly highlight the changed setting
                e.target.style.backgroundColor = '#d4edda';
                e.target.style.borderColor = '#28a745';
                setTimeout(() => {
                    e.target.style.backgroundColor = '';
                    e.target.style.borderColor = '';
                }, 1000);
                
                // Show notification
                const modes = {
                    'disabled': 'Link previews disabled',
                    'hover': 'Link previews on hover',
                    'inline': 'Inline link previews'
                };
                window.showNotification(modes[newMode], 'success');
                
                // Update preview to reflect changes
                if (window.updatePreviewAndStructure && window.editor) {
                    await window.updatePreviewAndStructure(window.editor.getValue());
                }
            } catch (error) {
                console.error('Failed to save link preview settings:', error);
                
                // Visual feedback for error
                e.target.style.backgroundColor = '#f8d7da';
                e.target.style.borderColor = '#dc3545';
                setTimeout(() => {
                    e.target.style.backgroundColor = '';
                    e.target.style.borderColor = '';
                }, 1000);
            }
        });
    }

    // Application theme selection
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        themeSelect.addEventListener('change', async (e) => {
            const newTheme = e.target.value;

            try {
                // Apply the theme immediately
                applyTheme(newTheme);

                // Update app settings
                if (!window.appSettings) window.appSettings = {};
                window.appSettings.theme = newTheme;

                // Save settings
                await window.electronAPI.invoke('set-settings', window.appSettings);

                // Update currentSettings to reflect the change
                currentSettings.theme = newTheme;

                // Update the dropdown to reflect the change
                e.target.value = newTheme;

                // Visual feedback for success
                e.target.style.backgroundColor = '#d4edda';
                e.target.style.borderColor = '#28a745';
                setTimeout(() => {
                    e.target.style.backgroundColor = '';
                    e.target.style.borderColor = '';
                }, 1000);

                // Show notification
                const themeNames = {
                    'auto': 'Auto theme applied (follows system)',
                    'light': 'Light theme applied',
                    'dark': 'Dark theme applied'
                };
                window.showNotification(themeNames[newTheme] || 'Theme applied', 'success');

            } catch (error) {
                console.error('Failed to apply theme:', error);
                window.showNotification('Failed to apply theme', 'error');

                // Visual feedback for error
                e.target.style.backgroundColor = '#f8d7da';
                e.target.style.borderColor = '#dc3545';
                setTimeout(() => {
                    e.target.style.backgroundColor = '';
                    e.target.style.borderColor = '';
                }, 1000);
            }
        });
    }

    // Presentation template selection
    const presentationTemplateSelect = document.getElementById('presentation-template-select');
    if (presentationTemplateSelect) {
        presentationTemplateSelect.addEventListener('change', async (e) => {
            const newTemplate = e.target.value;

            try {
                // Apply the presentation template immediately (this also saves the preference)
                if (window.styleManager) {
                    const success = await window.styleManager.applyPresentationTemplate(newTemplate);
                    if (!success) {
                        throw new Error('Failed to apply presentation template');
                    }
                }

                // Update currentSettings to reflect the change
                if (!currentSettings.stylePreferences) currentSettings.stylePreferences = {};
                currentSettings.stylePreferences.presentationTemplate = newTemplate;

                // Visual feedback for success
                e.target.style.backgroundColor = '#d4edda';
                e.target.style.borderColor = '#28a745';
                setTimeout(() => {
                    e.target.style.backgroundColor = '';
                    e.target.style.borderColor = '';
                }, 1000);

                // Show notification
                const templateNames = {
                    'default': 'Default presentation theme applied',
                    'academic': 'Academic presentation theme applied',
                    'minimal': 'Minimal presentation theme applied',
                    'dark': 'Dark presentation theme applied'
                };
                window.showNotification(templateNames[newTemplate] || 'Presentation theme applied', 'success');

            } catch (error) {
                console.error('Failed to apply presentation template:', error);

                // Visual feedback for error
                e.target.style.backgroundColor = '#f8d7da';
                e.target.style.borderColor = '#dc3545';
                setTimeout(() => {
                    e.target.style.backgroundColor = '';
                    e.target.style.borderColor = '';
                }, 1000);

                window.showNotification('Failed to apply presentation theme', 'error');
            }
        });
    }


    // Dual assistant temperature sliders
    const ashTempSlider = document.getElementById('ash-temperature');
    if (ashTempSlider) {
        ashTempSlider.addEventListener('input', (e) => {
            const valueSpan = document.getElementById('ash-temperature-value');
            if (valueSpan) {
                valueSpan.textContent = e.target.value;
            }
        });
    }
    
    const chenTempSlider = document.getElementById('chen-temperature');
    if (chenTempSlider) {
        chenTempSlider.addEventListener('input', (e) => {
            const valueSpan = document.getElementById('chen-temperature-value');
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
    
    // AI assistant tab styling
    if (category === 'ai') {
        // Add assistant tab styles
        injectAssistantTabStyles();
    }
    
    // AI custom prompts setup
    if (category === 'ai-prompts') {
        // Populate slash commands
        setTimeout(() => populateSlashCommands(), 100); // Small delay to ensure DOM is ready
    }
    
    // TTS settings event listeners
    if (category === 'tts') {
        setupTTSEventListeners();
    }
}

function setupTTSEventListeners() {
    // General TTS settings
    const ttsEnabled = document.getElementById('tts-enabled');
    const ttsProvider = document.getElementById('tts-provider');
    
    // Behavior settings
    const autoSpeak = document.getElementById('tts-auto-speak');
    const stopOnSlideChange = document.getElementById('tts-stop-on-slide-change');
    const cleanMarkdown = document.getElementById('tts-clean-markdown');
    const speakSpeakerNotes = document.getElementById('tts-speak-speaker-notes');
    
    // Lemonfox settings
    const lemonfoxVoice = document.getElementById('tts-lemonfox-voice');
    const lemonfoxLanguage = document.getElementById('tts-lemonfox-language');
    const lemonfoxSpeed = document.getElementById('tts-lemonfox-speed');
    const lemonfoxFormat = document.getElementById('tts-lemonfox-format');
    const lemonfoxTimestamps = document.getElementById('tts-lemonfox-timestamps');
    
    // Web Speech settings
    const webSpeechRate = document.getElementById('tts-webspeech-rate');
    const webSpeechPitch = document.getElementById('tts-webspeech-pitch');
    const webSpeechVolume = document.getElementById('tts-webspeech-volume');
    
    // Helper function to save TTS settings
    async function saveTTSSettings(updates) {
        try {
            await window.electronAPI.invoke('update-settings-category', 'tts', updates);
            console.log('[Settings] TTS settings saved:', updates);
            
            // Update current settings to reflect changes
            if (!currentSettings.tts) currentSettings.tts = {};
            Object.keys(updates).forEach(key => {
                if (typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
                    currentSettings.tts[key] = { ...currentSettings.tts[key], ...updates[key] };
                } else {
                    currentSettings.tts[key] = updates[key];
                }
            });
            
            // Notify TTS service of settings change
            if (window.ttsService && typeof window.ttsService.loadSettings === 'function') {
                await window.ttsService.loadSettings();
            }
            
        } catch (error) {
            console.error('[Settings] Failed to save TTS settings:', error);
            window.showNotification('Failed to save TTS settings', 'error');
        }
    }
    
    // General settings
    if (ttsEnabled) {
        ttsEnabled.addEventListener('change', (e) => {
            saveTTSSettings({ enabled: e.target.checked });
        });
    }
    
    if (ttsProvider) {
        ttsProvider.addEventListener('change', (e) => {
            saveTTSSettings({ provider: e.target.value });
        });
    }
    
    // Behavior settings
    if (autoSpeak) {
        autoSpeak.addEventListener('change', (e) => {
            saveTTSSettings({ autoSpeak: e.target.checked });
        });
    }
    
    if (stopOnSlideChange) {
        stopOnSlideChange.addEventListener('change', (e) => {
            saveTTSSettings({ stopOnSlideChange: e.target.checked });
        });
    }
    
    if (cleanMarkdown) {
        cleanMarkdown.addEventListener('change', (e) => {
            saveTTSSettings({ cleanMarkdown: e.target.checked });
        });
    }
    
    if (speakSpeakerNotes) {
        speakSpeakerNotes.addEventListener('change', (e) => {
            saveTTSSettings({ speakSpeakerNotes: e.target.checked });
        });
    }
    
    // Lemonfox settings
    if (lemonfoxVoice) {
        lemonfoxVoice.addEventListener('change', (e) => {
            saveTTSSettings({ lemonfox: { voice: e.target.value } });
        });
    }
    
    if (lemonfoxLanguage) {
        lemonfoxLanguage.addEventListener('change', (e) => {
            saveTTSSettings({ lemonfox: { language: e.target.value } });
        });
    }
    
    if (lemonfoxSpeed) {
        lemonfoxSpeed.addEventListener('input', (e) => {
            const speed = parseFloat(e.target.value);
            const label = e.target.nextElementSibling;
            if (label) label.textContent = `Speech Speed (${speed}x)`;
            saveTTSSettings({ lemonfox: { speed } });
        });
    }
    
    if (lemonfoxFormat) {
        lemonfoxFormat.addEventListener('change', (e) => {
            saveTTSSettings({ lemonfox: { response_format: e.target.value } });
        });
    }
    
    if (lemonfoxTimestamps) {
        lemonfoxTimestamps.addEventListener('change', (e) => {
            saveTTSSettings({ lemonfox: { word_timestamps: e.target.checked } });
        });
    }
    
    // Web Speech settings
    if (webSpeechRate) {
        webSpeechRate.addEventListener('input', (e) => {
            const rate = parseFloat(e.target.value);
            const label = e.target.nextElementSibling;
            if (label) label.textContent = `Speech Rate (${rate}x)`;
            saveTTSSettings({ webSpeech: { rate } });
        });
    }
    
    if (webSpeechPitch) {
        webSpeechPitch.addEventListener('input', (e) => {
            const pitch = parseFloat(e.target.value);
            const label = e.target.nextElementSibling;
            if (label) label.textContent = `Speech Pitch (${pitch})`;
            saveTTSSettings({ webSpeech: { pitch } });
        });
    }
    
    if (webSpeechVolume) {
        webSpeechVolume.addEventListener('input', (e) => {
            const volume = parseFloat(e.target.value);
            const label = e.target.nextElementSibling;
            if (label) label.textContent = `Speech Volume (${Math.round(volume * 100)}%)`;
            saveTTSSettings({ webSpeech: { volume } });
        });
    }
}

// Inject CSS styles for assistant tabs
function injectAssistantTabStyles() {
    if (document.getElementById('assistant-tab-styles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'assistant-tab-styles';
    styles.textContent = `
        .assistant-tabs {
            display: flex;
            border-bottom: 1px solid #e0e0e0;
            margin-bottom: 20px;
        }
        
        .assistant-tab {
            padding: 12px 20px;
            background: none;
            border: none;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            font-weight: 500;
            color: #666;
            transition: all 0.2s;
            margin-right: 10px;
        }
        
        .assistant-tab:hover {
            color: #333;
            background: #f8f9fa;
        }
        
        .assistant-tab.active {
            color: #007acc;
            border-bottom-color: #007acc;
        }
        
        .assistant-config {
            display: none;
            padding: 15px;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            margin-bottom: 20px;
        }
        
        .assistant-config.active {
            display: block;
        }
        
        .assistant-config h4 {
            margin-top: 0;
            margin-bottom: 15px;
        }
    `;
    
    document.head.appendChild(styles);
}

async function saveSettingsDialog() {
    try {
        // Collect all form values
        const updatedSettings = collectSettingsFromForm();
        
        // Update settings via IPC
        await window.electronAPI.invoke('set-settings', updatedSettings);
        
        // Update global settings object
        window.appSettings = updatedSettings;
        
        // Update currentSettings to reflect the changes (used by helper functions)
        currentSettings = updatedSettings;
        
        // Apply editor settings immediately
        if (window.applyEditorSettings) {
            window.applyEditorSettings(updatedSettings);
        }
        
        // Refresh AI systems if AI settings were changed
        if (updatedSettings.ai) {
            // Refresh chat header
            if (window.refreshChatHeader) {
                try {
                    await window.refreshChatHeader();
                } catch (error) {
                    console.warn('[Settings] Could not refresh chat header:', error);
                }
            }
            
            // Refresh AI assistant configuration
            if (window.aiAssistantConfig && typeof window.aiAssistantConfig.reloadConfiguration === 'function') {
                try {
                    await window.aiAssistantConfig.reloadConfiguration();
                    console.log('[Settings] AI assistant configuration reloaded');
                } catch (error) {
                    console.warn('[Settings] Could not reload AI assistant configuration:', error);
                }
            }
            
            // Clear any cached AI provider/model info
            if (window.clearAICache) {
                try {
                    window.clearAICache();
                    console.log('[Settings] AI cache cleared');
                } catch (error) {
                    console.warn('[Settings] Could not clear AI cache:', error);
                }
            }
            
            // Force refresh of AI Chat system
            if (window.refreshAISystem) {
                try {
                    await window.refreshAISystem();
                    console.log('[Settings] AI system refreshed');
                } catch (error) {
                    console.warn('[Settings] Could not refresh AI system:', error);
                }
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

    // Presentation template settings
    const presentationTemplate = document.getElementById('presentation-template-select')?.value;
    if (presentationTemplate) {
        if (!updatedSettings.stylePreferences) updatedSettings.stylePreferences = {};
        updatedSettings.stylePreferences.presentationTemplate = presentationTemplate;
    }

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
    
    // AI Companion settings
    const showResponseNotifications = document.getElementById('ai-companion-show-response-notifications')?.checked;
    if (showResponseNotifications !== undefined) {
        if (!updatedSettings.aiCompanion) updatedSettings.aiCompanion = {};
        updatedSettings.aiCompanion.showResponseNotifications = showResponseNotifications;
    }

    // Dual assistant AI settings
    if (!updatedSettings.ai) updatedSettings.ai = {};
    if (!updatedSettings.ai.assistants) updatedSettings.ai.assistants = {};
    
    // Ash assistant settings
    const ashProvider = document.getElementById('ash-provider')?.value;
    const ashModel = document.getElementById('ash-model')?.value;
    const ashTemperature = document.getElementById('ash-temperature')?.value;
    const ashMaxTokens = document.getElementById('ash-max-tokens')?.value;
    
    // Always create the assistant structure and set values (including defaults)
    if (!updatedSettings.ai.assistants.ash) updatedSettings.ai.assistants.ash = {};
    if (!updatedSettings.ai.assistants.ash.aiSettings) updatedSettings.ai.assistants.ash.aiSettings = {};
    
    updatedSettings.ai.assistants.ash.aiSettings.provider = ashProvider || 'auto';
    updatedSettings.ai.assistants.ash.aiSettings.model = ashModel || 'auto';
    updatedSettings.ai.assistants.ash.aiSettings.temperature = ashTemperature ? parseFloat(ashTemperature) : 0.7;
    updatedSettings.ai.assistants.ash.aiSettings.maxTokens = ashMaxTokens ? parseInt(ashMaxTokens) : 200;
    
    // System prompt for Ash
    const ashSystemPrompt = document.getElementById('ash-system-prompt')?.value;
    if (ashSystemPrompt !== undefined) {
        updatedSettings.ai.assistants.ash.systemPrompt = ashSystemPrompt;
    }
    
    
    // Dr. Chen assistant settings
    const chenProvider = document.getElementById('chen-provider')?.value;
    const chenModel = document.getElementById('chen-model')?.value;
    const chenTemperature = document.getElementById('chen-temperature')?.value;
    const chenMaxTokens = document.getElementById('chen-max-tokens')?.value;
    
    // Always create the assistant structure and set values (including defaults)
    if (!updatedSettings.ai.assistants.chen) updatedSettings.ai.assistants.chen = {};
    if (!updatedSettings.ai.assistants.chen.aiSettings) updatedSettings.ai.assistants.chen.aiSettings = {};
    
    updatedSettings.ai.assistants.chen.aiSettings.provider = chenProvider || 'auto';
    updatedSettings.ai.assistants.chen.aiSettings.model = chenModel || 'auto';
    updatedSettings.ai.assistants.chen.aiSettings.temperature = chenTemperature ? parseFloat(chenTemperature) : 0.8;
    updatedSettings.ai.assistants.chen.aiSettings.maxTokens = chenMaxTokens ? parseInt(chenMaxTokens) : 1000;
    
    // System prompt for Dr. Chen
    const chenSystemPrompt = document.getElementById('chen-system-prompt')?.value;
    if (chenSystemPrompt !== undefined) {
        updatedSettings.ai.assistants.chen.systemPrompt = chenSystemPrompt;
    }
    
    // Note: Legacy AI provider/model settings removed - now using assistant-specific settings
    
    const localAIUrl = document.getElementById('local-ai-url')?.value;
    if (localAIUrl !== undefined) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        updatedSettings.ai.localAIUrl = localAIUrl;
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
    
    // AI feature settings
    const aiChatEnabled = document.getElementById('ai-chat-enabled')?.checked;
    if (aiChatEnabled !== undefined) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        updatedSettings.ai.enableChat = aiChatEnabled;
    }
    
    const aiSummarizationEnabled = document.getElementById('ai-summarization-enabled')?.checked;
    if (aiSummarizationEnabled !== undefined) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        updatedSettings.ai.enableSummarization = aiSummarizationEnabled;
    }
    
    const aiNoteExtractionEnabled = document.getElementById('ai-note-extraction-enabled')?.checked;
    if (aiNoteExtractionEnabled !== undefined) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        updatedSettings.ai.enableNoteExtraction = aiNoteExtractionEnabled;
    }
    
    const aiWritingCompanionEnabled = document.getElementById('ai-writing-companion-enabled')?.checked;
    if (aiWritingCompanionEnabled !== undefined) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        updatedSettings.ai.enableWritingCompanion = aiWritingCompanionEnabled;
    }
    
    const aiCompanionContextScope = document.getElementById('ai-companion-context-scope')?.value;
    if (aiCompanionContextScope) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        updatedSettings.ai.companionContextScope = aiCompanionContextScope;
    }
    
    const aiCompanionMaxContext = parseInt(document.getElementById('ai-companion-max-context')?.value);
    if (aiCompanionMaxContext && aiCompanionMaxContext > 0) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        updatedSettings.ai.companionMaxContextLength = aiCompanionMaxContext;
    }
    
    const aiCompanionCharacterThreshold = parseInt(document.getElementById('ai-companion-character-threshold')?.value);
    if (aiCompanionCharacterThreshold && aiCompanionCharacterThreshold > 0) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        updatedSettings.ai.companionCharacterThreshold = aiCompanionCharacterThreshold;
    }
    
    const aiCompanionWordThreshold = parseInt(document.getElementById('ai-companion-word-threshold')?.value);
    if (aiCompanionWordThreshold && aiCompanionWordThreshold > 0) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        updatedSettings.ai.companionWordThreshold = aiCompanionWordThreshold;
    }
    
    const aiCompanionCooldownPeriod = parseInt(document.getElementById('ai-companion-cooldown-period')?.value);
    if (aiCompanionCooldownPeriod && aiCompanionCooldownPeriod > 0) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        // Convert seconds to milliseconds for storage
        updatedSettings.ai.companionCooldownPeriod = aiCompanionCooldownPeriod * 1000;
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
        settingsDialog.classList.remove('active');
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
        showNotification('Error changing working directory', 'error');
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

// Get assistant configuration from settings or defaults
function getAssistantProvider(assistantKey) {
    const provider = currentSettings?.ai?.assistants?.[assistantKey]?.aiSettings?.provider;
    
    if (!provider) {
        // Return default from aiAssistantConfig if available
        if (window.aiAssistantConfig) {
            const assistant = window.aiAssistantConfig.getAssistant(assistantKey);
            return assistant?.aiSettings?.provider || 'auto';
        }
        return 'auto';
    }
    return provider;
}

function getAssistantModel(assistantKey) {
    if (!currentSettings?.ai?.assistants?.[assistantKey]?.aiSettings?.model) {
        if (window.aiAssistantConfig) {
            const assistant = window.aiAssistantConfig.getAssistant(assistantKey);
            return assistant?.aiSettings?.model || 'auto';
        }
        return 'auto';
    }
    return currentSettings.ai.assistants[assistantKey].aiSettings.model;
}

function getAssistantTemperature(assistantKey) {
    if (!currentSettings?.ai?.assistants?.[assistantKey]?.aiSettings?.temperature) {
        if (window.aiAssistantConfig) {
            const assistant = window.aiAssistantConfig.getAssistant(assistantKey);
            return assistant?.aiSettings?.temperature || (assistantKey === 'ash' ? 0.7 : 0.8);
        }
        return assistantKey === 'ash' ? 0.7 : 0.8;
    }
    return currentSettings.ai.assistants[assistantKey].aiSettings.temperature;
}

function getAssistantMaxTokens(assistantKey) {
    if (!currentSettings?.ai?.assistants?.[assistantKey]?.aiSettings?.maxTokens) {
        if (window.aiAssistantConfig) {
            const assistant = window.aiAssistantConfig.getAssistant(assistantKey);
            return assistant?.aiSettings?.maxTokens || (assistantKey === 'ash' ? 150 : 1000);
        }
        return assistantKey === 'ash' ? 150 : 1000;
    }
    return currentSettings.ai.assistants[assistantKey].aiSettings.maxTokens;
}

function getAssistantSystemPrompt(assistantKey) {
    // Check if there's a custom system prompt in settings
    const customPrompt = currentSettings?.ai?.assistants?.[assistantKey]?.systemPrompt;
    if (customPrompt) {
        return customPrompt;
    }
    
    // Return default from aiAssistantConfig if available
    if (window.aiAssistantConfig) {
        const assistant = window.aiAssistantConfig.getAssistant(assistantKey);
        return assistant?.systemPrompt || '';
    }
    
    // Fallback defaults
    if (assistantKey === 'ash') {
        return `You are Ash, an AI writing companion focused on providing quick, contextual feedback during the writing process. 

Your role:
- Provide brief (1-2 sentences) feedback on writing as it develops
- Be supportive and encouraging while maintaining authenticity  
- Focus on the writer's immediate context and progress
- Avoid generic writing advice - be specific to what they're working on
- Help maintain writing flow without interrupting

Your style is supportive, warm, and contextually aware.`;
    } else if (assistantKey === 'chen') {
        return `You are Dr. Chen, a thoughtful AI assistant specializing in philosophical dialogue and deep analytical thinking.

Your role:
- Engage in substantive conversations about ideas, concepts, and philosophical questions
- Provide thorough, well-reasoned responses that explore multiple perspectives
- Help develop and refine intellectual arguments and understanding
- Draw connections between concepts and broader philosophical frameworks
- Support serious academic and creative work with depth and nuance

Your style is scholarly, patient, and intellectually rigorous while remaining accessible and engaging. You take time to explore ideas fully rather than rushing to quick conclusions.`;
    }
    
    return '';
}

function resetSystemPrompt(assistantKey) {
    const textarea = document.getElementById(`${assistantKey}-system-prompt`);
    if (!textarea) return;
    
    // Get the default prompt from the fallback logic
    let defaultPrompt = '';
    if (assistantKey === 'ash') {
        defaultPrompt = `You are Ash, an AI writing companion focused on providing quick, contextual feedback during the writing process. 

Your role:
- Provide brief (1-2 sentences) feedback on writing as it develops
- Be supportive and encouraging while maintaining authenticity  
- Focus on the writer's immediate context and progress
- Avoid generic writing advice - be specific to what they're working on
- Help maintain writing flow without interrupting

Your style is supportive, warm, and contextually aware.`;
    } else if (assistantKey === 'chen') {
        defaultPrompt = `You are Dr. Chen, a thoughtful AI assistant specializing in philosophical dialogue and deep analytical thinking.

Your role:
- Engage in substantive conversations about ideas, concepts, and philosophical questions
- Provide thorough, well-reasoned responses that explore multiple perspectives
- Help develop and refine intellectual arguments and understanding
- Draw connections between concepts and broader philosophical frameworks
- Support serious academic and creative work with depth and nuance

Your style is scholarly, patient, and intellectually rigorous while remaining accessible and engaging. You take time to explore ideas fully rather than rushing to quick conclusions.`;
    }
    
    // Set the textarea value to the default
    textarea.value = defaultPrompt;
    
    // Show visual feedback
    textarea.style.backgroundColor = '#e8f5e8';
    setTimeout(() => {
        textarea.style.backgroundColor = '';
    }, 1000);
    
    // Optional: Show notification
    if (window.showNotification) {
        window.showNotification(`${assistantKey === 'ash' ? 'Ash' : 'Dr. Chen'} system prompt reset to default`, 'success');
    }
}

function switchAssistantTab(assistantKey) {
    // Update tab selection
    document.querySelectorAll('.assistant-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.getElementById(`${assistantKey}-tab`).classList.add('active');
    
    // Update config visibility
    document.querySelectorAll('.assistant-config').forEach(config => {
        config.classList.remove('active');
    });
    document.getElementById(`${assistantKey}-config`).classList.add('active');
    
    // Update local AI config visibility based on current assistant
    updateLocalAIVisibility();
}

function updateLocalAIVisibility() {
    const localAIConfig = document.getElementById('local-ai-config');
    const activeConfig = document.querySelector('.assistant-config.active');
    
    if (!localAIConfig || !activeConfig) return;
    
    const assistantKey = activeConfig.id.replace('-config', '');
    const providerSelect = document.getElementById(`${assistantKey}-provider`);
    const isLocal = providerSelect && providerSelect.value === 'local';
    
    localAIConfig.style.display = isLocal ? 'block' : 'none';
}

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
        gemini: [
            'gemini-2.5-flash-image-preview', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 
            'gemini-1.5-flash-8b', 'gemini-1.5-flash-002', 'gemini-1.5-pro', 'gemini-1.5-pro-002', 
            'gemini-1.0-pro', 'gemini-pro-vision'
        ],
        groq: [
            'llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'llama-3.2-90b-text-preview',
            'llama-3.2-11b-text-preview', 'mixtral-8x7b-32768', 'gemma2-9b-it'
        ],
        openrouter: [
            'anthropic/claude-3.5-sonnet', 'anthropic/claude-3-opus', 'openai/gpt-4', 'openai/gpt-4-turbo',
            'meta-llama/llama-3.1-70b-instruct', 'google/gemini-pro-1.5', 'mistralai/mistral-large'
        ],
        local: [
            'local-model', 'llama', 'codellama', 'mistral', 'neural-chat', 'vicuna', 'alpaca'
        ]
    };
    
    if (provider === 'auto' || !models[provider]) {
        return '';
    }
    
    return models[provider].map(model => 
        `<option value="${model}" ${selectedModel === model ? 'selected' : ''}>${model}</option>`
    ).join('');
}

async function updateModelOptions(assistantKey) {
    // If assistantKey is provided, update specific assistant model options
    if (assistantKey) {
        const providerSelect = document.getElementById(`${assistantKey}-provider`);
        const modelSelect = document.getElementById(`${assistantKey}-model`);
        
        if (!providerSelect || !modelSelect) return;
        
        const provider = providerSelect.value;
        
        // Update model options
        if (provider === 'auto') {
            modelSelect.innerHTML = '<option value="auto" selected>Auto (Provider Default)</option>';
        } else {
            modelSelect.innerHTML = '<option value="auto">Auto (Provider Default)</option>' + 
                                    generateModelOptions(provider, null);
        }
        
        // Update local AI visibility
        updateLocalAIVisibility();
        
        return;
    }
    
    // Show/hide Local AI configuration based on assistant settings
    const localAIConfig = document.getElementById('local-ai-config');
    if (localAIConfig) {
        // Show local AI config if any assistant uses local provider
        const ashProvider = document.getElementById('ash-provider')?.value;
        const chenProvider = document.getElementById('chen-provider')?.value;
        const showLocalConfig = ashProvider === 'local' || chenProvider === 'local';
        localAIConfig.style.display = showLocalConfig ? 'block' : 'none';
    }
    
    // Note: Legacy model updating code removed - now handled by updateModelOptions() per assistant
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

function toggleWritingCompanionOptions() {
    const isEnabled = document.getElementById('ai-writing-companion-enabled')?.checked;
    const optionsDiv = document.getElementById('writing-companion-options');
    
    if (optionsDiv) {
        optionsDiv.style.display = isEnabled ? 'block' : 'none';
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

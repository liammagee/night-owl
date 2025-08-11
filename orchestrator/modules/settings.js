
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
        { id: 'ai', label: 'AI Settings', icon: '🤖' },
        { id: 'export', label: 'Export', icon: '📤' },
        { id: 'kanban', label: 'Kanban', icon: '📋' },
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
            ai: 'AI Configuration',
            export: 'Export Preferences',
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
        case 'ai':
            return generateAISettings();
        case 'export':
            return generateExportSettings();
        case 'kanban':
            return generateKanbanSettings();
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

function generateAISettings() {
    return `
        <div class="settings-section">
            <h3>AI Provider</h3>
            <div class="settings-group">
                <label>
                    <select id="ai-provider">
                        <option value="auto" ${(currentSettings.ai?.preferredProvider || 'auto') === 'auto' ? 'selected' : ''}>Auto (Use Available)</option>
                        <option value="openai" ${currentSettings.ai?.preferredProvider === 'openai' ? 'selected' : ''}>OpenAI</option>
                        <option value="anthropic" ${currentSettings.ai?.preferredProvider === 'anthropic' ? 'selected' : ''}>Anthropic</option>
                        <option value="groq" ${currentSettings.ai?.preferredProvider === 'groq' ? 'selected' : ''}>Groq</option>
                        <option value="openrouter" ${currentSettings.ai?.preferredProvider === 'openrouter' ? 'selected' : ''}>OpenRouter</option>
                    </select>
                    <span>Preferred Provider</span>
                </label>
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
}

async function saveSettingsDialog() {
    try {
        // Collect all form values
        const updatedSettings = collectSettingsFromForm();
        
        // Update settings via IPC
        await window.electronAPI.invoke('set-settings', updatedSettings);
        
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
    
    // AI settings
    const aiProvider = document.getElementById('ai-provider')?.value;
    if (aiProvider) {
        if (!updatedSettings.ai) updatedSettings.ai = {};
        updatedSettings.ai.preferredProvider = aiProvider;
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
    
    return updatedSettings;
}

function closeSettingsDialog() {
    if (settingsDialog) {
        settingsDialog.style.display = 'none';
        document.body.style.overflow = 'auto';
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

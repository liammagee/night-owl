// === Style Settings UI Module ===
// Provides UI for managing presentation templates, preview styles, and export stylesheets

class StyleSettingsUI {
    constructor() {
        this.modal = null;
        this.currentTab = 'presentation';
        this.editingStyle = null;
        this.cssEditor = null;
        
        this.initializeEventListeners();
    }

    // Initialize event listeners
    initializeEventListeners() {
        // Listen for style changes
        window.addEventListener('presentation-template-changed', (event) => {
            // Template preview updates automatically through re-rendering
            if (this.modal && this.currentTab === 'presentation') {
                this.renderCurrentTab();
            }
        });

        window.addEventListener('preview-style-changed', (event) => {
            // Preview sample updates automatically through re-rendering
            if (this.modal && this.currentTab === 'preview') {
                this.renderCurrentTab();
            }
        });

        // Listen for keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'T') {
                event.preventDefault();
                this.showStyleSettings();
            }
        });
    }

    // Show style settings modal
    showStyleSettings() {
        if (this.modal) {
            this.hideStyleSettings();
            return;
        }

        this.createModal();
        this.renderCurrentTab();
        document.body.appendChild(this.modal);
        
        // Focus management
        setTimeout(() => {
            const firstFocusable = this.modal.querySelector('button, input, select, textarea');
            if (firstFocusable) firstFocusable.focus();
        }, 100);
    }

    // Hide style settings modal
    hideStyleSettings() {
        if (this.modal) {
            document.body.removeChild(this.modal);
            this.modal = null;
            this.editingStyle = null;
            if (this.cssEditor) {
                this.cssEditor.dispose();
                this.cssEditor = null;
            }
        }
    }

    // Create modal structure
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'style-settings-modal-overlay';
        this.modal.innerHTML = `
            <div class="style-settings-modal">
                <div class="style-settings-header">
                    <h2>Style Settings</h2>
                    <button class="close-btn" onclick="window.styleSettingsUI.hideStyleSettings()">×</button>
                </div>
                
                <div class="style-settings-tabs">
                    <button class="tab-btn ${this.currentTab === 'presentation' ? 'active' : ''}" 
                            onclick="window.styleSettingsUI.switchTab('presentation')">
                        Presentation Templates
                    </button>
                    <button class="tab-btn ${this.currentTab === 'preview' ? 'active' : ''}" 
                            onclick="window.styleSettingsUI.switchTab('preview')">
                        Preview Styles
                    </button>
                    <button class="tab-btn ${this.currentTab === 'export' ? 'active' : ''}" 
                            onclick="window.styleSettingsUI.switchTab('export')">
                        Export Styles
                    </button>
                    <button class="tab-btn ${this.currentTab === 'custom' ? 'active' : ''}" 
                            onclick="window.styleSettingsUI.switchTab('custom')">
                        Create Custom
                    </button>
                </div>
                
                <div class="style-settings-content">
                    <!-- Content will be rendered by renderCurrentTab() -->
                </div>
                
                <div class="style-settings-footer">
                    <button class="btn btn-secondary" onclick="window.styleSettingsUI.hideStyleSettings()">Close</button>
                    <button class="btn btn-primary" onclick="window.styleSettingsUI.applyCurrentSelections()">Apply Changes</button>
                </div>
            </div>
        `;

        // Add styles
        this.injectModalStyles();

        // Handle click outside to close
        this.modal.addEventListener('click', (event) => {
            if (event.target === this.modal) {
                this.hideStyleSettings();
            }
        });

        // Handle escape key
        this.modal.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.hideStyleSettings();
            }
        });
    }

    // Switch between tabs
    switchTab(tab) {
        this.currentTab = tab;
        
        // Update tab buttons
        this.modal.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        this.modal.querySelector(`[onclick*="${tab}"]`).classList.add('active');
        
        // Render new content
        this.renderCurrentTab();
    }

    // Render content for current tab
    renderCurrentTab() {
        const content = this.modal.querySelector('.style-settings-content');
        
        switch (this.currentTab) {
            case 'presentation':
                content.innerHTML = this.renderPresentationTemplates();
                break;
            case 'preview':
                content.innerHTML = this.renderPreviewStyles();
                break;
            case 'export':
                content.innerHTML = this.renderExportStyles();
                break;
            case 'custom':
                content.innerHTML = this.renderCustomStyleEditor();
                this.initializeCustomEditor();
                break;
        }
    }

    // Render presentation templates
    renderPresentationTemplates() {
        const templates = window.styleManager.getPresentationTemplates();
        const current = window.styleManager.getCurrentStyles().presentation;
        
        return `
            <div class="style-section">
                <h3>Available Presentation Templates</h3>
                <div class="template-grid">
                    ${templates.map(template => `
                        <div class="template-card ${template.id === current ? 'selected' : ''}" 
                             onclick="window.styleSettingsUI.selectTemplate('${template.id}')">
                            <div class="template-preview">
                                ${template.preview ? 
                                    `<img src="${template.preview}" alt="${template.name} preview" />` :
                                    `<div class="template-placeholder">${template.name.charAt(0)}</div>`
                                }
                            </div>
                            <div class="template-info">
                                <h4>${template.name}</h4>
                                <p>${template.description}</p>
                                ${template.custom ? '<span class="custom-badge">Custom</span>' : ''}
                            </div>
                            ${template.custom ? 
                                `<button class="delete-btn" onclick="event.stopPropagation(); window.styleSettingsUI.deleteCustomStyle('${template.id}')">🗑️</button>` : 
                                ''
                            }
                        </div>
                    `).join('')}
                </div>
                <button class="btn btn-secondary add-template-btn" onclick="window.styleSettingsUI.createNewTemplate()">
                    + Create New Template
                </button>
            </div>
        `;
    }

    // Render preview styles
    renderPreviewStyles() {
        const styles = window.styleManager.getPreviewStyles();
        const current = window.styleManager.getCurrentStyles().preview;
        
        return `
            <div class="style-section">
                <h3>Preview Pane Styles</h3>
                <div class="preview-styles-list">
                    ${styles.map(style => `
                        <div class="style-option ${style.id === current ? 'selected' : ''}"
                             onclick="window.styleSettingsUI.selectPreviewStyle('${style.id}')">
                            <div class="style-sample">
                                <div class="sample-content" id="preview-sample-${style.id}">
                                    <h3>Sample Heading</h3>
                                    <p>This is sample paragraph text to demonstrate the preview style.</p>
                                    <code>code sample</code>
                                </div>
                            </div>
                            <div class="style-info">
                                <h4>${style.name}</h4>
                                <p>${style.description}</p>
                                ${style.custom ? '<span class="custom-badge">Custom</span>' : ''}
                            </div>
                            ${style.custom ? 
                                `<button class="delete-btn" onclick="event.stopPropagation(); window.styleSettingsUI.deleteCustomStyle('${style.id}')">🗑️</button>` : 
                                ''
                            }
                        </div>
                    `).join('')}
                </div>
                <button class="btn btn-secondary add-style-btn" onclick="window.styleSettingsUI.createNewPreviewStyle()">
                    + Create New Preview Style
                </button>
            </div>
        `;
    }

    // Render export styles
    renderExportStyles() {
        const styles = window.styleManager.getExportStyles();
        const current = window.styleManager.getCurrentStyles().export;
        
        return `
            <div class="style-section">
                <h3>Export Stylesheets</h3>
                <div class="export-styles-list">
                    ${styles.map(style => `
                        <div class="export-style-option ${style.id === current ? 'selected' : ''}"
                             onclick="window.styleSettingsUI.selectExportStyle('${style.id}')">
                            <div class="export-preview">
                                <div class="export-sample">
                                    <div class="sample-page">
                                        <h1>Document Title</h1>
                                        <h2>Section Heading</h2>
                                        <p>Sample paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
                                        <blockquote>Sample blockquote text</blockquote>
                                    </div>
                                </div>
                            </div>
                            <div class="style-info">
                                <h4>${style.name}</h4>
                                <p>${style.description}</p>
                                ${style.custom ? '<span class="custom-badge">Custom</span>' : ''}
                            </div>
                            ${style.custom ? 
                                `<button class="delete-btn" onclick="event.stopPropagation(); window.styleSettingsUI.deleteCustomStyle('${style.id}')">🗑️</button>` : 
                                ''
                            }
                        </div>
                    `).join('')}
                </div>
                <button class="btn btn-secondary add-export-btn" onclick="window.styleSettingsUI.createNewExportStyle()">
                    + Create New Export Style
                </button>
            </div>
        `;
    }

    // Render custom style editor
    renderCustomStyleEditor() {
        return `
            <div class="custom-editor-section">
                <h3>Create Custom Style</h3>
                <div class="editor-form">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="custom-style-name">Style Name:</label>
                            <input type="text" id="custom-style-name" placeholder="Enter style name..." />
                        </div>
                        <div class="form-group">
                            <label for="custom-style-type">Style Type:</label>
                            <select id="custom-style-type">
                                <option value="presentation">Presentation Template</option>
                                <option value="preview">Preview Style</option>
                                <option value="export">Export Style</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="custom-style-description">Description:</label>
                        <input type="text" id="custom-style-description" placeholder="Brief description..." />
                    </div>
                    
                    <div class="form-group">
                        <label for="css-editor-container">CSS Code:</label>
                        <div id="css-editor-container" class="css-editor-container"></div>
                    </div>
                    
                    <div class="editor-actions">
                        <button class="btn btn-secondary" onclick="window.styleSettingsUI.resetCustomEditor()">Reset</button>
                        <button class="btn btn-primary" onclick="window.styleSettingsUI.saveCustomStyle()">Save Custom Style</button>
                    </div>
                </div>
                
                <div class="style-preview-panel">
                    <h4>Preview</h4>
                    <div id="custom-style-preview" class="custom-preview">
                        <h1>Sample Title</h1>
                        <h2>Sample Heading</h2>
                        <p>This is sample text to preview your custom style. It includes <strong>bold</strong> and <em>italic</em> text.</p>
                        <blockquote>This is a sample blockquote</blockquote>
                        <code>sample code</code>
                    </div>
                </div>
            </div>
        `;
    }

    // Initialize custom CSS editor
    initializeCustomEditor() {
        const container = this.modal.querySelector('#css-editor-container');
        if (!container || !window.monaco) return;

        // Create Monaco editor for CSS
        this.cssEditor = monaco.editor.create(container, {
            value: '/* Enter your custom CSS here */\n\n',
            language: 'css',
            theme: 'vs',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            fontSize: 13,
            lineNumbers: 'on',
            automaticLayout: true,
            // Disable sticky scroll to prevent line number errors
            stickyScroll: {
                enabled: false
            }
        });

        // Auto-preview on changes
        this.cssEditor.onDidChangeModelContent(() => {
            this.updateCustomPreview();
        });
    }

    // Update custom style preview
    updateCustomPreview() {
        if (!this.cssEditor) return;
        
        const css = this.cssEditor.getValue();
        const preview = this.modal.querySelector('#custom-style-preview');
        
        // Remove existing custom preview styles
        document.querySelectorAll('#custom-preview-style').forEach(el => el.remove());
        
        // Apply new styles
        const style = document.createElement('style');
        style.id = 'custom-preview-style';
        style.textContent = `#custom-style-preview { ${css} }`;
        document.head.appendChild(style);
    }

    // Template/style selection handlers
    selectTemplate(templateId) {
        this.modal.querySelectorAll('.template-card').forEach(card => {
            card.classList.remove('selected');
        });
        this.modal.querySelector(`[onclick*="selectTemplate('${templateId}')"]`).classList.add('selected');
        
        // Apply immediately for preview
        window.styleManager.applyPresentationTemplate(templateId);
    }

    selectPreviewStyle(styleId) {
        this.modal.querySelectorAll('.style-option').forEach(option => {
            option.classList.remove('selected');
        });
        this.modal.querySelector(`[onclick*="selectPreviewStyle('${styleId}')"]`).classList.add('selected');
        
        // Apply immediately for preview
        window.styleManager.applyPreviewStyle(styleId);
    }

    selectExportStyle(styleId) {
        this.modal.querySelectorAll('.export-style-option').forEach(option => {
            option.classList.remove('selected');
        });
        this.modal.querySelector(`[onclick*="selectExportStyle('${styleId}')"]`).classList.add('selected');
        
        // Update current export style
        window.styleManager.currentExportStyle = styleId;
    }

    // Custom style actions
    async saveCustomStyle() {
        const name = this.modal.querySelector('#custom-style-name').value.trim();
        const type = this.modal.querySelector('#custom-style-type').value;
        const description = this.modal.querySelector('#custom-style-description').value.trim();
        const css = this.cssEditor ? this.cssEditor.getValue().trim() : '';
        
        if (!name || !css) {
            alert('Please provide both a name and CSS code for your custom style.');
            return;
        }
        
        const styleId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        
        const success = await window.styleManager.createCustomStyle({
            id: styleId,
            name,
            description,
            type,
            css
        });
        
        if (success) {
            alert('Custom style saved successfully!');
            this.resetCustomEditor();
            // Refresh the appropriate tab
            if (this.currentTab !== 'custom') {
                this.switchTab(type);
            }
        } else {
            alert('Error saving custom style. Please try again.');
        }
    }

    resetCustomEditor() {
        if (this.cssEditor) {
            this.cssEditor.setValue('/* Enter your custom CSS here */\n\n');
        }
        this.modal.querySelector('#custom-style-name').value = '';
        this.modal.querySelector('#custom-style-description').value = '';
        document.querySelectorAll('#custom-preview-style').forEach(el => el.remove());
    }

    async deleteCustomStyle(styleId) {
        if (confirm('Are you sure you want to delete this custom style?')) {
            const success = await window.styleManager.deleteCustomStyle(styleId);
            if (success) {
                this.renderCurrentTab(); // Refresh current tab
            }
        }
    }

    // Apply current selections
    async applyCurrentSelections() {
        // Selections are applied immediately, so just close
        this.hideStyleSettings();
    }

    // Inject modal styles
    injectModalStyles() {
        if (document.getElementById('style-settings-modal-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'style-settings-modal-styles';
        styles.textContent = `
            .style-settings-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .style-settings-modal {
                background: white;
                border-radius: 12px;
                width: 90%;
                max-width: 1200px;
                height: 80%;
                max-height: 800px;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            }
            
            .style-settings-header {
                padding: 20px;
                border-bottom: 1px solid #e0e0e0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .style-settings-header h2 {
                margin: 0;
                color: #333;
            }
            
            .close-btn {
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                padding: 5px 10px;
                border-radius: 4px;
                color: #666;
            }
            
            .close-btn:hover {
                background: #f0f0f0;
                color: #333;
            }
            
            .style-settings-tabs {
                display: flex;
                border-bottom: 1px solid #e0e0e0;
                padding: 0 20px;
            }
            
            .tab-btn {
                padding: 12px 20px;
                background: none;
                border: none;
                cursor: pointer;
                border-bottom: 2px solid transparent;
                font-weight: 500;
                color: #666;
                transition: all 0.2s;
            }
            
            .tab-btn:hover {
                color: #333;
                background: #f8f9fa;
            }
            
            .tab-btn.active {
                color: #007acc;
                border-bottom-color: #007acc;
            }
            
            .style-settings-content {
                flex: 1;
                overflow-y: auto;
                padding: 20px;
            }
            
            .style-settings-footer {
                padding: 20px;
                border-top: 1px solid #e0e0e0;
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            }
            
            .template-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                gap: 20px;
                margin-bottom: 20px;
            }
            
            .template-card {
                border: 2px solid #e0e0e0;
                border-radius: 8px;
                padding: 15px;
                cursor: pointer;
                transition: all 0.2s;
                position: relative;
            }
            
            .template-card:hover {
                border-color: #007acc;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            }
            
            .template-card.selected {
                border-color: #007acc;
                background: #f0f8ff;
            }
            
            .template-preview {
                height: 120px;
                background: #f8f9fa;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 10px;
                overflow: hidden;
            }
            
            .template-preview img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                border-radius: 4px;
            }
            
            .template-placeholder {
                font-size: 48px;
                font-weight: bold;
                color: #ccc;
            }
            
            .template-info h4 {
                margin: 0 0 5px 0;
                color: #333;
            }
            
            .template-info p {
                margin: 0;
                color: #666;
                font-size: 14px;
            }
            
            .custom-badge {
                display: inline-block;
                background: #28a745;
                color: white;
                font-size: 11px;
                padding: 2px 8px;
                border-radius: 12px;
                margin-top: 5px;
            }
            
            .delete-btn {
                position: absolute;
                top: 10px;
                right: 10px;
                background: #dc3545;
                color: white;
                border: none;
                border-radius: 50%;
                width: 30px;
                height: 30px;
                cursor: pointer;
                font-size: 12px;
            }
            
            .css-editor-container {
                height: 300px;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
            }
            
            .custom-preview {
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                padding: 20px;
                background: white;
            }
            
            .btn {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 500;
                transition: background-color 0.2s;
            }
            
            .btn-primary {
                background: #007acc;
                color: white;
            }
            
            .btn-primary:hover {
                background: #0056a3;
            }
            
            .btn-secondary {
                background: #6c757d;
                color: white;
            }
            
            .btn-secondary:hover {
                background: #545b62;
            }
            
            .form-group {
                margin-bottom: 15px;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: 500;
                color: #333;
            }
            
            .form-group input, .form-group select {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                font-size: 14px;
            }
            
            .form-row {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 15px;
            }
            
            .editor-actions {
                margin-top: 20px;
                display: flex;
                gap: 10px;
            }
        `;
        
        document.head.appendChild(styles);
    }
}

// Create global instance
window.styleSettingsUI = new StyleSettingsUI();

// Add to command palette
if (window.registerCommand) {
    window.registerCommand('style.settings', 'Style: Open Style Settings', () => {
        window.styleSettingsUI.showStyleSettings();
    }, 'Cmd+Shift+T');
}
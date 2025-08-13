// === Style Manager Module ===
// Manages presentation templates, preview styles, and export stylesheets

class StyleManager {
    constructor() {
        this.presentationTemplates = new Map();
        this.previewStyles = new Map();
        this.exportStyles = new Map();
        this.currentPresentationTemplate = 'minimal';
        this.currentPreviewStyle = 'minimal-preview';
        this.currentExportStyle = 'academic-export';
        this.customStyles = new Map();
        
        this.initializeDefaultTemplates();
        this.loadUserStyles();
    }

    // Initialize default templates and styles
    initializeDefaultTemplates() {
        // Presentation templates
        this.presentationTemplates.set('academic', {
            name: 'Academic',
            description: 'Professional academic presentation style',
            cssFile: './styles/templates/presentations/academic.css',
            preview: './styles/previews/academic-presentation.png'
        });

        this.presentationTemplates.set('minimal', {
            name: 'Minimal',
            description: 'Clean, minimalist presentation style',
            cssFile: './styles/templates/presentations/minimal.css',
            preview: './styles/previews/minimal-presentation.png'
        });

        this.presentationTemplates.set('dark', {
            name: 'Dark',
            description: 'Dark theme for presentations',
            cssFile: './styles/templates/presentations/dark.css',
            preview: './styles/previews/dark-presentation.png'
        });

        // Preview styles
        this.previewStyles.set('academic-preview', {
            name: 'Academic Preview',
            description: 'Professional styling for preview pane',
            cssFile: './styles/templates/preview/academic-preview.css'
        });

        this.previewStyles.set('minimal-preview', {
            name: 'Minimal Preview',
            description: 'Clean styling for preview pane',
            cssFile: './styles/templates/preview/minimal-preview.css'
        });

        // Export styles
        this.exportStyles.set('academic-export', {
            name: 'Academic Export',
            description: 'Professional styling for PDF/HTML export',
            cssFile: './styles/templates/export/academic-export.css'
        });
    }

    // Load user-defined custom styles
    async loadUserStyles() {
        try {
            if (window.electronAPI) {
                const userStyles = await window.electronAPI.invoke('load-user-styles');
                if (userStyles) {
                    Object.entries(userStyles).forEach(([key, style]) => {
                        this.customStyles.set(key, style);
                    });
                }
            }
        } catch (error) {
            console.warn('[StyleManager] Could not load user styles:', error);
        }
    }

    // Save user styles
    async saveUserStyles() {
        try {
            if (window.electronAPI) {
                const userStylesObj = Object.fromEntries(this.customStyles);
                await window.electronAPI.invoke('save-user-styles', userStylesObj);
            }
        } catch (error) {
            console.error('[StyleManager] Could not save user styles:', error);
        }
    }

    // Get all available presentation templates
    getPresentationTemplates() {
        const templates = new Map([...this.presentationTemplates, ...this.getCustomPresentationTemplates()]);
        return Array.from(templates.entries()).map(([key, template]) => ({
            id: key,
            ...template
        }));
    }

    // Get all available preview styles
    getPreviewStyles() {
        const styles = new Map([...this.previewStyles, ...this.getCustomPreviewStyles()]);
        return Array.from(styles.entries()).map(([key, style]) => ({
            id: key,
            ...style
        }));
    }

    // Get all available export styles
    getExportStyles() {
        const styles = new Map([...this.exportStyles, ...this.getCustomExportStyles()]);
        return Array.from(styles.entries()).map(([key, style]) => ({
            id: key,
            ...style
        }));
    }

    // Filter custom styles by type
    getCustomPresentationTemplates() {
        const custom = new Map();
        this.customStyles.forEach((style, key) => {
            if (style.type === 'presentation') {
                custom.set(key, style);
            }
        });
        return custom;
    }

    getCustomPreviewStyles() {
        const custom = new Map();
        this.customStyles.forEach((style, key) => {
            if (style.type === 'preview') {
                custom.set(key, style);
            }
        });
        return custom;
    }

    getCustomExportStyles() {
        const custom = new Map();
        this.customStyles.forEach((style, key) => {
            if (style.type === 'export') {
                custom.set(key, style);
            }
        });
        return custom;
    }

    // Apply presentation template
    async applyPresentationTemplate(templateId) {
        try {
            const template = this.presentationTemplates.get(templateId) || 
                            this.customStyles.get(templateId);
            
            if (!template) {
                throw new Error(`Template ${templateId} not found`);
            }

            // Remove existing presentation styles
            this.removeStyleElement('presentation-template');

            // Load and apply new template
            const css = await this.loadCSSFile(template.cssFile || template.css);
            this.injectStyle(css, 'presentation-template');

            this.currentPresentationTemplate = templateId;
            
            // Save preference
            await this.saveStylePreferences();
            
            // Dispatch event for UI updates
            window.dispatchEvent(new CustomEvent('presentation-template-changed', {
                detail: { templateId, template }
            }));

            return true;
        } catch (error) {
            console.error('[StyleManager] Error applying presentation template:', error);
            return false;
        }
    }

    // Apply preview style
    async applyPreviewStyle(styleId) {
        try {
            const style = this.previewStyles.get(styleId) || 
                         this.customStyles.get(styleId);
            
            if (!style) {
                throw new Error(`Preview style ${styleId} not found`);
            }

            // Remove existing preview styles
            this.removeStyleElement('preview-style');

            // Load and apply new style
            const css = await this.loadCSSFile(style.cssFile || style.css);
            this.injectStyle(css, 'preview-style');

            this.currentPreviewStyle = styleId;
            
            // Save preference
            await this.saveStylePreferences();

            // Dispatch event for UI updates
            window.dispatchEvent(new CustomEvent('preview-style-changed', {
                detail: { styleId, style }
            }));

            return true;
        } catch (error) {
            console.error('[StyleManager] Error applying preview style:', error);
            return false;
        }
    }

    // Get export stylesheet CSS for PDF/HTML export
    async getExportStylesheet(styleId = null) {
        try {
            const id = styleId || this.currentExportStyle;
            const style = this.exportStyles.get(id) || 
                         this.customStyles.get(id);
            
            if (!style) {
                console.warn(`Export style ${id} not found, using default`);
                return await this.loadCSSFile('./styles/templates/export/academic-export.css');
            }

            return await this.loadCSSFile(style.cssFile || style.css);
        } catch (error) {
            console.error('[StyleManager] Error loading export stylesheet:', error);
            // Return basic fallback CSS
            return `
                body { 
                    font-family: 'Times New Roman', serif; 
                    line-height: 1.6; 
                    color: #333; 
                    max-width: 800px; 
                    margin: 0 auto; 
                    padding: 20px; 
                }
                h1, h2, h3 { color: #2c3e50; }
                code { background: #f4f4f4; padding: 2px 4px; }
                blockquote { border-left: 4px solid #3498db; padding-left: 1em; }
            `;
        }
    }

    // Create custom style
    async createCustomStyle(styleData) {
        try {
            const { id, name, description, type, css } = styleData;
            
            if (!id || !name || !type || !css) {
                throw new Error('Missing required style data');
            }

            if (!['presentation', 'preview', 'export'].includes(type)) {
                throw new Error('Invalid style type');
            }

            const customStyle = {
                name,
                description: description || '',
                type,
                css,
                custom: true,
                created: new Date().toISOString()
            };

            this.customStyles.set(id, customStyle);
            await this.saveUserStyles();

            // Dispatch event
            window.dispatchEvent(new CustomEvent('custom-style-created', {
                detail: { id, style: customStyle }
            }));

            return true;
        } catch (error) {
            console.error('[StyleManager] Error creating custom style:', error);
            return false;
        }
    }

    // Delete custom style
    async deleteCustomStyle(styleId) {
        try {
            if (!this.customStyles.has(styleId)) {
                throw new Error(`Custom style ${styleId} not found`);
            }

            this.customStyles.delete(styleId);
            await this.saveUserStyles();

            // If this was the current style, revert to default
            if (this.currentPresentationTemplate === styleId) {
                await this.applyPresentationTemplate('academic');
            }
            if (this.currentPreviewStyle === styleId) {
                await this.applyPreviewStyle('academic-preview');
            }
            if (this.currentExportStyle === styleId) {
                this.currentExportStyle = 'academic-export';
            }

            // Dispatch event
            window.dispatchEvent(new CustomEvent('custom-style-deleted', {
                detail: { styleId }
            }));

            return true;
        } catch (error) {
            console.error('[StyleManager] Error deleting custom style:', error);
            return false;
        }
    }

    // Utility methods
    async loadCSSFile(filePath) {
        try {
            if (filePath.startsWith('./styles/') && window.electronAPI) {
                // Load from file system
                return await window.electronAPI.invoke('load-style-file', filePath);
            } else {
                // Treat as inline CSS
                return filePath;
            }
        } catch (error) {
            console.error('[StyleManager] Error loading CSS file:', error);
            return '';
        }
    }

    injectStyle(css, id) {
        const styleElement = document.createElement('style');
        styleElement.id = id;
        styleElement.textContent = css;
        document.head.appendChild(styleElement);
    }

    removeStyleElement(id) {
        const existing = document.getElementById(id);
        if (existing) {
            existing.remove();
        }
    }

    // Save current style preferences
    async saveStylePreferences() {
        try {
            const preferences = {
                presentationTemplate: this.currentPresentationTemplate,
                previewStyle: this.currentPreviewStyle,
                exportStyle: this.currentExportStyle
            };

            if (window.electronAPI) {
                await window.electronAPI.invoke('save-style-preferences', preferences);
            } else {
                localStorage.setItem('hegel-style-preferences', JSON.stringify(preferences));
            }
        } catch (error) {
            console.error('[StyleManager] Error saving style preferences:', error);
        }
    }

    // Load style preferences
    async loadStylePreferences() {
        try {
            let preferences;
            
            if (window.electronAPI) {
                preferences = await window.electronAPI.invoke('load-style-preferences');
            } else {
                const stored = localStorage.getItem('hegel-style-preferences');
                preferences = stored ? JSON.parse(stored) : null;
            }

            if (preferences) {
                if (preferences.presentationTemplate) {
                    this.currentPresentationTemplate = preferences.presentationTemplate;
                }
                if (preferences.previewStyle) {
                    this.currentPreviewStyle = preferences.previewStyle;
                }
                if (preferences.exportStyle) {
                    this.currentExportStyle = preferences.exportStyle;
                }
            }
        } catch (error) {
            console.error('[StyleManager] Error loading style preferences:', error);
        }
    }

    // Get current styles
    getCurrentStyles() {
        return {
            presentation: this.currentPresentationTemplate,
            preview: this.currentPreviewStyle,
            export: this.currentExportStyle
        };
    }

    // Initialize - apply saved preferences
    async initialize() {
        await this.loadStylePreferences();
        
        // Apply saved styles
        if (this.currentPresentationTemplate) {
            await this.applyPresentationTemplate(this.currentPresentationTemplate);
        }
        if (this.currentPreviewStyle) {
            await this.applyPreviewStyle(this.currentPreviewStyle);
        }
    }
}

// Create global instance
window.styleManager = new StyleManager();

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StyleManager;
}
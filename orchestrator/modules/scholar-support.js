// === Scholar Support Module ===
// AI-powered academic writing assistance for generating contextual headings

class ScholarSupport {
    constructor() {
        this.initialized = false;
        this.aiService = null;
        this.currentDocument = '';
        this.headingPattern = null; // Will be extracted from document
    }

    async initialize() {
        if (this.initialized) return;
        
        console.log('[Scholar Support] Initializing...');
        
        // Set up event listeners for text selection
        this.setupSelectionHandlers();
        
        // Add context menu option
        this.addContextMenuOption();
        
        this.initialized = true;
        console.log('[Scholar Support] Initialized successfully');
    }

    setupSelectionHandlers() {
        console.log('[Scholar Support] Setting up selection handlers...');
        
        // Listen for text selection events
        document.addEventListener('mouseup', (e) => {
            setTimeout(() => this.handleTextSelection(e), 10);
        });

        document.addEventListener('keyup', (e) => {
            // Handle keyboard-based selections
            if (e.ctrlKey || e.metaKey || e.shiftKey) {
                setTimeout(() => this.handleTextSelection(e), 10);
            }
        });
        
        // Special handling for Monaco editor if available
        if (window.editor && window.editor.onDidChangeCursorSelection) {
            console.log('[Scholar Support] Setting up Monaco selection handler');
            window.editor.onDidChangeCursorSelection((e) => {
                // Check if there's a selection
                if (!e.selection.isEmpty()) {
                    setTimeout(() => this.handleTextSelection(e), 10);
                } else {
                    this.hideHeadingButton();
                }
            });
        }
        
        console.log('[Scholar Support] Selection handlers configured');
    }

    handleTextSelection(event) {
        // Skip if click is in the sidebar, Citations panel, or any interactive elements
        if (event && event.target) {
            const clickedElement = event.target;
            const sidebar = document.getElementById('left-sidebar');
            const citationsPane = document.getElementById('citations-pane');
            
            // Also check for specific interactive elements that should be ignored
            const isButton = clickedElement.tagName === 'BUTTON' || clickedElement.closest('button');
            const isInput = clickedElement.tagName === 'INPUT' || clickedElement.closest('input');
            const isModal = clickedElement.closest('.modal-overlay');
            
            if ((sidebar && sidebar.contains(clickedElement)) || 
                (citationsPane && citationsPane.contains(clickedElement)) ||
                isButton || isInput || isModal) {
                // Don't log for citation buttons to reduce console noise
                if (citationsPane && citationsPane.contains(clickedElement)) {
                    // Silent skip for citations area
                } else {
                    console.log('[Scholar Support] Click in sidebar/UI element - skipping');
                }
                this.hideHeadingButton();
                return;
            }
        }
        
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
            this.hideHeadingButton();
            return;
        }

        const selectedText = selection.toString().trim();
        console.log('[Scholar Support] Selected text length:', selectedText.length, 'Text preview:', selectedText.substring(0, 50));
        
        if (selectedText.length < 10) { // Minimum text length for heading generation
            console.log('[Scholar Support] Selected text too short (< 10 chars)');
            this.hideHeadingButton();
            return;
        }

        // Check if selection is in the editor
        const editorElement = this.getEditorElement();
        console.log('[Scholar Support] Editor element found:', !!editorElement);
        
        if (!editorElement) {
            console.log('[Scholar Support] No editor element found');
            this.hideHeadingButton();
            return;
        }
        
        const anchorInEditor = editorElement.contains(selection.anchorNode);
        console.log('[Scholar Support] Selection anchor in editor:', anchorInEditor);
        
        if (!anchorInEditor) {
            console.log('[Scholar Support] Selection not in editor');
            this.hideHeadingButton();
            return;
        }

        console.log('[Scholar Support] All checks passed - showing heading button');
        this.showHeadingButton(selection, selectedText);
    }

    getEditorElement() {
        console.log('[Scholar Support] Looking for editor element...');
        
        // Try to find the Monaco editor or fallback to textarea
        const monacoEditor = document.querySelector('.monaco-editor');
        if (monacoEditor) {
            console.log('[Scholar Support] Found Monaco editor');
            return monacoEditor;
        }
        
        const textarea = document.querySelector('#editor-textarea');
        if (textarea) {
            console.log('[Scholar Support] Found textarea editor');
            return textarea;
        }
        
        // Try alternative selectors
        const codeEditor = document.querySelector('[data-testid="editor"]') || 
                          document.querySelector('.editor') ||
                          document.querySelector('#editor') ||
                          document.querySelector('textarea');
        
        if (codeEditor) {
            console.log('[Scholar Support] Found alternative editor:', codeEditor.tagName, codeEditor.className || codeEditor.id);
            return codeEditor;
        }
        
        console.log('[Scholar Support] No editor element found');
        return null;
    }

    showHeadingButton(selection, selectedText) {
        // Remove any existing button
        this.hideHeadingButton();

        // Create floating button near selection
        const button = document.createElement('button');
        button.id = 'generate-heading-btn';
        button.className = 'scholar-support-btn';
        button.innerHTML = '📑 Add Heading';
        button.title = 'Generate contextual heading for selected text';

        // Position button near selection
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        button.style.position = 'fixed';
        button.style.left = `${rect.left}px`;
        button.style.top = `${rect.top - 40}px`;
        button.style.zIndex = '10000';
        button.style.padding = '6px 12px';
        button.style.backgroundColor = '#667eea';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.fontSize = '12px';
        button.style.fontWeight = '500';
        button.style.cursor = 'pointer';
        button.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';

        button.addEventListener('click', (e) => {
            e.preventDefault();
            this.generateHeading(selectedText, selection);
        });

        document.body.appendChild(button);

        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.hideHeadingButton();
        }, 5000);
    }

    hideHeadingButton() {
        const existingButton = document.getElementById('generate-heading-btn');
        if (existingButton) {
            existingButton.remove();
        }
    }

    addContextMenuOption() {
        // Add to existing context menu if available
        document.addEventListener('contextmenu', (e) => {
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed) {
                const selectedText = selection.toString().trim();
                if (selectedText.length >= 10) {
                    // Store selection for context menu use
                    this.contextMenuSelection = {
                        text: selectedText,
                        selection: selection
                    };
                }
            }
        });
    }

    async generateHeading(selectedText, selection) {
        try {
            this.hideHeadingButton();
            
            // Show loading state
            this.showLoadingIndicator();

            console.log('[Scholar Support] Generating heading for selected text:', selectedText.substring(0, 100) + '...');

            // Get full document content
            const fullContent = await this.getCurrentDocumentContent();
            
            // Extract existing heading patterns
            const headingStyle = this.analyzeHeadingStyle(fullContent);
            
            // Generate heading using Dr. Chen
            const heading = await this.callDrChenForHeading(selectedText, fullContent, headingStyle);
            
            if (heading) {
                // Insert heading at the preceding paragraph mark
                await this.insertHeading(heading, selection);
                console.log('[Scholar Support] Successfully inserted heading:', heading);
            } else {
                throw new Error('No heading generated');
            }

        } catch (error) {
            console.error('[Scholar Support] Error generating heading:', error);
            this.showError('Failed to generate heading. Please try again.');
        } finally {
            this.hideLoadingIndicator();
        }
    }

    async getCurrentDocumentContent() {
        try {
            // Try to get content from Monaco editor first
            if (window.monaco && window.editor) {
                return window.editor.getValue();
            }
            
            // Fallback to textarea
            const textarea = document.querySelector('#editor-textarea');
            if (textarea) {
                return textarea.value;
            }

            // Fallback to electron API
            if (window.electronAPI) {
                const currentFile = await window.electronAPI.invoke('get-current-file-content');
                return currentFile?.content || '';
            }

            return '';
        } catch (error) {
            console.error('[Scholar Support] Error getting document content:', error);
            return '';
        }
    }

    analyzeHeadingStyle(content) {
        const headings = [];
        const lines = content.split('\n');
        
        // Extract existing headings (markdown format)
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('#')) {
                const match = trimmedLine.match(/^(#+)\s+(.+)$/);
                if (match) {
                    headings.push({
                        level: match[1].length,
                        text: match[2],
                        raw: trimmedLine
                    });
                }
            }
        }

        if (headings.length === 0) {
            return {
                format: 'markdown',
                levels: [2], // Default to ## level
                style: 'academic',
                examples: []
            };
        }

        // Analyze heading patterns
        const levels = [...new Set(headings.map(h => h.level))].sort();
        const examples = headings.slice(0, 5).map(h => h.text);
        
        // Determine style (academic, casual, technical, etc.)
        const style = this.determineHeadingStyle(examples);

        return {
            format: 'markdown',
            levels: levels,
            style: style,
            examples: examples
        };
    }

    determineHeadingStyle(examples) {
        const combinedText = examples.join(' ').toLowerCase();
        
        // Academic indicators
        if (combinedText.includes('analysis') || 
            combinedText.includes('discussion') || 
            combinedText.includes('introduction') ||
            combinedText.includes('conclusion') ||
            combinedText.includes('methodology')) {
            return 'academic';
        }
        
        // Technical indicators
        if (combinedText.includes('implementation') ||
            combinedText.includes('system') ||
            combinedText.includes('algorithm') ||
            combinedText.includes('design')) {
            return 'technical';
        }
        
        // Default to academic for scholarly work
        return 'academic';
    }

    async callDrChenForHeading(selectedText, fullContent, headingStyle) {
        if (!window.electronAPI) {
            throw new Error('Electron API not available');
        }

        const prompt = this.buildHeadingPrompt(selectedText, fullContent, headingStyle);
        
        const requestData = {
            message: prompt,
            options: {
                temperature: 0.3, // Lower temperature for more consistent headings
                maxTokens: 100,   // Short response needed
                newConversation: true,
                provider: 'chen'  // Specifically use Dr. Chen
            }
        };

        console.log('[Scholar Support] Calling Dr. Chen with request:', {
            selectedTextLength: selectedText.length,
            fullContentLength: fullContent.length,
            headingStyle: headingStyle
        });

        const response = await window.electronAPI.invoke('ai-chat', requestData);
        
        if (!response?.response) {
            throw new Error('No response from AI service');
        }

        return this.cleanHeading(response.response);
    }

    buildHeadingPrompt(selectedText, fullContent, headingStyle) {
        const examplesText = headingStyle.examples.length > 0 ? 
            `\n\nExisting headings in this document:\n${headingStyle.examples.map(ex => `- ${ex}`).join('\n')}` : '';
        
        const levelIndicator = headingStyle.levels.length > 0 ? 
            `Use ${headingStyle.levels.includes(1) ? '#' : '##'} markdown heading format.` : 
            'Use ## markdown heading format.';

        return `I am Dr. Chen, an AI assistant specializing in academic writing and scholarly document organization.

You are working on a scholarly document. I need to generate a concise, contextual heading for a selected text passage.

DOCUMENT CONTEXT (for understanding existing heading style and content themes):
${fullContent.length > 3000 ? fullContent.substring(0, 3000) + '...' : fullContent}${examplesText}

SELECTED TEXT TO SUMMARIZE:
${selectedText}

TASK: Generate a single, concise heading that:
1. Summarizes the key concept/theme of the selected text
2. Matches the style and tone of existing headings in this document
3. Uses ${headingStyle.style} writing conventions
4. Is suitable for scholarly/academic work

${levelIndicator}

Respond with ONLY the heading text (including the # markdown symbols). No explanation or additional text.`;
    }

    cleanHeading(rawHeading) {
        // Clean up the AI response
        let cleaned = rawHeading.trim();
        
        // Remove quotes if present
        cleaned = cleaned.replace(/^["']|["']$/g, '');
        
        // Ensure it starts with # if it doesn't already
        if (!cleaned.startsWith('#')) {
            cleaned = '## ' + cleaned;
        }
        
        // Remove multiple spaces
        cleaned = cleaned.replace(/\s+/g, ' ');
        
        // Ensure there's a space after the # symbols
        cleaned = cleaned.replace(/^(#+)([^#\s])/, '$1 $2');
        
        return cleaned;
    }

    async insertHeading(heading, selection) {
        try {
            // Get the current cursor position or selection start
            const range = selection.getRangeAt(0);
            const startContainer = range.startContainer;
            
            // For Monaco editor
            if (window.monaco && window.editor) {
                return this.insertHeadingInMonaco(heading, selection);
            }
            
            // For textarea
            const textarea = document.querySelector('#editor-textarea');
            if (textarea) {
                return this.insertHeadingInTextarea(heading, textarea);
            }
            
            throw new Error('No editor found');
            
        } catch (error) {
            console.error('[Scholar Support] Error inserting heading:', error);
            throw error;
        }
    }

    insertHeadingInMonaco(heading, selection) {
        const editor = window.editor;
        const model = editor.getModel();
        
        // Get selection start position
        const selectionStart = editor.getSelection().getStartPosition();
        
        // Find the line containing the selection start
        const lineNumber = selectionStart.lineNumber;
        
        // Find the preceding paragraph break (empty line or start of document)
        let insertLineNumber = lineNumber;
        for (let i = lineNumber - 1; i >= 1; i--) {
            const lineContent = model.getLineContent(i);
            if (lineContent.trim() === '') {
                insertLineNumber = i + 1;
                break;
            }
        }
        
        // Insert the heading with proper spacing
        const insertText = insertLineNumber === 1 ? 
            `${heading}\n\n` : 
            `\n${heading}\n\n`;
            
        const insertPosition = { lineNumber: insertLineNumber, column: 1 };
        
        editor.executeEdits('scholar-support', [{
            range: new monaco.Range(insertPosition.lineNumber, insertPosition.column, insertPosition.lineNumber, insertPosition.column),
            text: insertText
        }]);
        
        // Focus back to editor
        editor.focus();
    }

    insertHeadingInTextarea(heading, textarea) {
        const content = textarea.value;
        const cursorPos = textarea.selectionStart;
        
        // Find the preceding paragraph break
        let insertPos = cursorPos;
        
        // Look backwards for empty line or start of text
        for (let i = cursorPos - 1; i >= 0; i--) {
            if (content[i] === '\n' && (i === 0 || content[i-1] === '\n')) {
                insertPos = i + 1;
                break;
            }
        }
        
        // Insert heading with spacing
        const beforeText = content.substring(0, insertPos);
        const afterText = content.substring(insertPos);
        const insertText = insertPos === 0 ? 
            `${heading}\n\n` : 
            `\n${heading}\n\n`;
        
        textarea.value = beforeText + insertText + afterText;
        
        // Update cursor position
        textarea.setSelectionRange(insertPos + insertText.length, insertPos + insertText.length);
        textarea.focus();
    }

    showLoadingIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'scholar-loading';
        indicator.innerHTML = '🤔 Dr. Chen is analyzing...';
        indicator.style.position = 'fixed';
        indicator.style.top = '20px';
        indicator.style.right = '20px';
        indicator.style.background = '#667eea';
        indicator.style.color = 'white';
        indicator.style.padding = '10px 15px';
        indicator.style.borderRadius = '6px';
        indicator.style.fontSize = '13px';
        indicator.style.fontWeight = '500';
        indicator.style.zIndex = '10001';
        indicator.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
        
        document.body.appendChild(indicator);
    }

    hideLoadingIndicator() {
        const indicator = document.getElementById('scholar-loading');
        if (indicator) {
            indicator.remove();
        }
    }

    showError(message) {
        const error = document.createElement('div');
        error.innerHTML = `❌ ${message}`;
        error.style.position = 'fixed';
        error.style.top = '20px';
        error.style.right = '20px';
        error.style.background = '#e53e3e';
        error.style.color = 'white';
        error.style.padding = '10px 15px';
        error.style.borderRadius = '6px';
        error.style.fontSize = '13px';
        error.style.fontWeight = '500';
        error.style.zIndex = '10001';
        error.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
        
        document.body.appendChild(error);
        
        setTimeout(() => {
            error.remove();
        }, 4000);
    }
}

// Initialize Scholar Support
let scholarSupport = null;

function initializeScholarSupport() {
    console.log('[Scholar Support] initializeScholarSupport called');
    if (!scholarSupport) {
        try {
            scholarSupport = new ScholarSupport();
            scholarSupport.initialize();
            
            // Make it globally accessible for debugging
            window.scholarSupport = scholarSupport;
            console.log('[Scholar Support] Successfully initialized and added to window');
        } catch (error) {
            console.error('[Scholar Support] Initialization error:', error);
        }
    } else {
        console.log('[Scholar Support] Already initialized');
    }
}

// Also try to initialize when Monaco editor is loaded
function waitForMonacoAndInitialize() {
    console.log('[Scholar Support] Waiting for Monaco editor...');
    let attempts = 0;
    const maxAttempts = 50; // Wait up to 5 seconds
    
    const checkMonaco = () => {
        attempts++;
        if (window.monaco && window.editor) {
            console.log('[Scholar Support] Monaco editor detected, initializing...');
            initializeScholarSupport();
        } else if (attempts < maxAttempts) {
            setTimeout(checkMonaco, 100);
        } else {
            console.log('[Scholar Support] Monaco not found, initializing anyway...');
            initializeScholarSupport();
        }
    };
    
    checkMonaco();
}

// Auto-initialize when DOM is ready
console.log('[Scholar Support] ===== SCHOLAR SUPPORT MODULE LOADED =====', document.readyState);
console.log('[Scholar Support] Window object available:', !!window);
console.log('[Scholar Support] Document available:', !!document);
if (document.readyState === 'loading') {
    console.log('[Scholar Support] Waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', waitForMonacoAndInitialize);
} else {
    console.log('[Scholar Support] Document ready, waiting for Monaco...');
    waitForMonacoAndInitialize();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScholarSupport;
}
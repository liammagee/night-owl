console.log('[renderer.js] Script executing...');

// --- Electron IPC (for theme) ---
// Access IPC functions exposed by preload.js via window.electronAPI

// --- Electron Remote (for context menu) ---
// Context menu items (Menu, MenuItem) are now handled in the main process

// --- Global Variables ---
let editor = null;
let markedInstance = null;

// Auto-save variables
let autoSaveTimer = null;
let hasUnsavedChanges = false;
let lastSavedContent = '';

// Speaker notes variables
let currentSpeakerNotes = [];
let speakerNotesVisible = false;

// --- DOM Elements ---
const editorContainer = document.getElementById('editor-container');
const previewContent = document.getElementById('preview-content');
const structureList = document.getElementById('structure-list');
const showPreviewBtn = document.getElementById('show-preview-btn');
const showChatBtn = document.getElementById('show-chat-btn');
const previewPane = document.getElementById('preview-pane');
const chatPane = document.getElementById('chat-pane');
const structurePaneTitle = document.getElementById('structure-pane-title');
const showStructureBtn = document.getElementById('show-structure-btn');
const showFilesBtn = document.getElementById('show-files-btn');
const fileTreeView = document.getElementById('file-tree-view');
const newFolderBtn = document.getElementById('new-folder-btn');
const changeDirectoryBtn = document.getElementById('change-directory-btn');
const chatMessages = document.getElementById('chat-messages');

// Find & Replace elements
const findReplaceDialog = document.getElementById('find-replace-dialog');
const findReplaceClose = document.getElementById('find-replace-close');
const findInput = document.getElementById('find-input');
const replaceInput = document.getElementById('replace-input');
const caseSensitive = document.getElementById('case-sensitive');
const regexMode = document.getElementById('regex-mode');
const wholeWord = document.getElementById('whole-word');
const findNext = document.getElementById('find-next');
const findPrevious = document.getElementById('find-previous');
const replaceCurrent = document.getElementById('replace-current');
const replaceAll = document.getElementById('replace-all');
const findReplaceStats = document.getElementById('find-replace-stats');

// Folder name modal elements
const folderNameModal = document.getElementById('folder-name-modal');
const folderNameInput = document.getElementById('folder-name-input');
const folderNameError = document.getElementById('folder-name-error');
const folderNameCancel = document.getElementById('folder-name-cancel');
const folderNameCreate = document.getElementById('folder-name-create');

const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const loadEditorToChatBtn = document.getElementById('load-editor-to-chat-btn'); // Get the new button
const copyAIResponseBtn = document.getElementById('copy-ai-response-btn'); // New button

// Keep require.config as needed - only if require is available
if (typeof require !== 'undefined') {
    require.config({ paths: { 'vs': './node_modules/monaco-editor/min/vs' } });
}

// --- Status Bar Update Function ---
function updateStatusBar(content) {
    const wordCountEl = document.getElementById('word-count');
    const charCountEl = document.getElementById('char-count');
    const lineCountEl = document.getElementById('line-count');
    const cursorPosEl = document.getElementById('cursor-position');
    
    if (!content) content = '';
    
    // Count words (split by whitespace, filter empty strings)
    const words = content.trim().split(/\s+/).filter(word => word.length > 0);
    const wordCount = content.trim() === '' ? 0 : words.length;
    
    // Count characters
    const charCount = content.length;
    
    // Count lines
    const lineCount = content === '' ? 1 : content.split('\n').length;
    
    // Update status bar elements
    if (wordCountEl) wordCountEl.textContent = `Words: ${wordCount}`;
    if (charCountEl) charCountEl.textContent = `Characters: ${charCount}`;
    if (lineCountEl) lineCountEl.textContent = `Lines: ${lineCount}`;
    
    // Update cursor position if editor is available
    if (editor && editor.getPosition) {
        const position = editor.getPosition();
        if (cursorPosEl && position) {
            cursorPosEl.textContent = `Ln ${position.lineNumber}, Col ${position.column}`;
        }
    } else if (cursorPosEl) {
        cursorPosEl.textContent = 'Ln 1, Col 1';
    }
}

function updateStatusBarWithKanban(totalTasks, doneTasks) {
    const wordCountEl = document.getElementById('word-count');
    const charCountEl = document.getElementById('char-count');
    const lineCountEl = document.getElementById('line-count');
    const cursorPosEl = document.getElementById('cursor-position');
    
    // Calculate progress
    const inProgressTasks = totalTasks - doneTasks;
    const progressPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
    
    // Update status bar elements with Kanban stats
    if (wordCountEl) wordCountEl.textContent = `📋 Total Tasks: ${totalTasks}`;
    if (charCountEl) charCountEl.textContent = `✅ Completed: ${doneTasks}`;
    if (lineCountEl) lineCountEl.textContent = `⏳ Remaining: ${inProgressTasks}`;
    if (cursorPosEl) cursorPosEl.textContent = `📊 Progress: ${progressPercent}%`;
}

// --- Process Speaker Notes Extension ---
function processSpeakerNotes(content) {
    // Extract speaker notes from ```notes blocks
    const speakerNotesRegex = /```notes\n([\s\S]*?)\n```/g;
    const extractedNotes = [];
    let noteIndex = 0;
    
    // Replace speaker notes blocks with placeholders and extract content
    const processedContent = content.replace(speakerNotesRegex, (match, notesContent) => {
        const noteId = `speaker-note-${noteIndex}`;
        extractedNotes.push({
            id: noteId,
            content: notesContent.trim(),
            index: noteIndex
        });
        noteIndex++;
        
        // Return a placeholder that will be processed later
        return `<div class="speaker-notes-placeholder" data-note-id="${noteId}" style="display: none;"></div>`;
    });
    
    // Store extracted notes globally
    currentSpeakerNotes = extractedNotes;
    console.log(`[renderer.js] Extracted ${extractedNotes.length} speaker note blocks`);
    
    return processedContent;
}

// --- Process Obsidian-style Internal Links ---
function processInternalLinks(content) {
    // Regular expression to match [[link]] and [[link|display text]] patterns
    const internalLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    
    return content.replace(internalLinkRegex, (match, link, displayText) => {
        // Clean up the link (remove any leading/trailing whitespace)
        const cleanLink = link.trim();
        const display = displayText ? displayText.trim() : cleanLink;
        
        // Convert to file path (assume .md extension if not present)
        let filePath = cleanLink;
        if (!filePath.endsWith('.md') && !filePath.endsWith('.bib') && !filePath.endsWith('.pdf') && !filePath.endsWith('.html') && !filePath.endsWith('.htm') && !filePath.includes('.')) {
            filePath += '.md';
        }
        
        // Create a markdown link that will be processed by marked.js
        // Use a data attribute to mark it as an internal link
        return `<a href="#" class="internal-link" data-link="${encodeURIComponent(filePath)}" data-original-link="${encodeURIComponent(cleanLink)}" title="Open ${display}">${display}</a>`;
    });
}

// --- Process Annotations ---
function processAnnotations(text) {
    // Global annotation counter for unique IDs
    if (!window.annotationCounter) {
        window.annotationCounter = 0;
    }
    
    console.log('[renderer.js] Processing annotations on content length:', text.length);
    let processedText = text;
    
    // 1. Process HTML comment annotations: <!-- @note: This is an annotation -->
    const commentAnnotationRegex = /<!--\s*@(\w+):\s*(.*?)\s*-->/g;
    let commentMatches = 0;
    processedText = processedText.replace(commentAnnotationRegex, (match, type, content) => {
        commentMatches++;
        console.log(`[renderer.js] Found comment annotation #${commentMatches}:`, type, content);
        const id = `annotation-${++window.annotationCounter}`;
        const marker = createAnnotationMarker(id, type, content, 'comment');
        console.log(`[renderer.js] Generated marker:`, marker);
        return marker;
    });
    console.log(`[renderer.js] Processed ${commentMatches} comment annotations`);
    
    // 2. Process inline highlight annotations: ==text=={@note Important concept}
    const inlineAnnotationRegex = /==(.*?)==\{@(\w+)\s+(.*?)\}/g;
    let inlineMatches = 0;
    processedText = processedText.replace(inlineAnnotationRegex, (match, highlightText, type, content) => {
        inlineMatches++;
        console.log(`[renderer.js] Found inline annotation #${inlineMatches}:`, highlightText, type, content);
        const id = `annotation-${++window.annotationCounter}`;
        const marker = createAnnotationMarker(id, type, content, 'inline');
        return `<mark class="annotation-highlight" data-annotation-id="${id}">${highlightText}</mark>${marker}`;
    });
    console.log(`[renderer.js] Processed ${inlineMatches} inline annotations`);
    
    // 3. Process block annotations: :::annotation type="note" author="instructor" ... :::
    const blockAnnotationRegex = /:::\s*annotation\s+(.*?)\n([\s\S]*?)\n:::/g;
    let blockMatches = 0;
    processedText = processedText.replace(blockAnnotationRegex, (match, attributes, content) => {
        blockMatches++;
        console.log(`[renderer.js] Found block annotation #${blockMatches}:`, attributes, content);
        const id = `annotation-${++window.annotationCounter}`;
        
        // Parse attributes
        const attrs = {};
        const attrRegex = /(\w+)=["']([^"']*?)["']/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attributes)) !== null) {
            attrs[attrMatch[1]] = attrMatch[2];
        }
        
        const type = attrs.type || 'note';
        const marker = createAnnotationMarker(id, type, content, 'block', attrs);
        
        return `<div class="annotation-block" data-annotation-id="${id}">${content}</div>${marker}`;
    });
    console.log(`[renderer.js] Processed ${blockMatches} block annotations`);
    
    console.log('[renderer.js] Final processed text length:', processedText.length);
    return processedText;
}

// --- Create Annotation Marker ---
function createAnnotationMarker(id, type, content, style, attrs = {}) {
    const author = attrs.author || 'Anonymous';
    const timestamp = attrs.timestamp || new Date().toISOString();
    
    // Store annotation data globally
    if (!window.annotations) {
        window.annotations = new Map();
    }
    
    window.annotations.set(id, {
        id,
        type,
        content,
        style,
        author,
        timestamp,
        attrs
    });
    
    // Create the visual marker based on style
    let markerClass = 'annotation-marker';
    let markerSymbol = '💬';
    
    switch (type) {
        case 'note':
            markerSymbol = '📝';
            markerClass += ' annotation-note';
            break;
        case 'thought':
            markerSymbol = '💭';
            markerClass += ' annotation-thought';
            break;
        case 'link':
            markerSymbol = '🔗';
            markerClass += ' annotation-link';
            break;
        case 'question':
            markerSymbol = '❓';
            markerClass += ' annotation-question';
            break;
        case 'warning':
            markerSymbol = '⚠️';
            markerClass += ' annotation-warning';
            break;
        default:
            markerSymbol = '💬';
            markerClass += ' annotation-default';
    }
    
    return `<span class="${markerClass}" 
                  data-annotation-id="${id}" 
                  data-annotation-type="${type}"
                  data-annotation-style="${style}"
                  title="Click to view ${type}"
                  onclick="showAnnotationTooltip('${id}')">${markerSymbol}</span>`;
}

// --- Show Annotation Tooltip ---
function showAnnotationTooltip(annotationId) {
    const annotation = window.annotations?.get(annotationId);
    if (!annotation) {
        console.warn(`[renderer.js] Annotation not found: ${annotationId}`);
        return;
    }
    
    // Remove any existing tooltip
    const existingTooltip = document.querySelector('.annotation-tooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }
    
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'annotation-tooltip';
    tooltip.innerHTML = `
        <div class="annotation-tooltip-header">
            <span class="annotation-type">${annotation.type}</span>
            <span class="annotation-author">${annotation.author}</span>
            <button class="annotation-close" onclick="hideAnnotationTooltip()">&times;</button>
        </div>
        <div class="annotation-content">${annotation.content}</div>
        <div class="annotation-timestamp">${new Date(annotation.timestamp).toLocaleString()}</div>
    `;
    
    // Position tooltip near the marker with smart positioning
    const marker = document.querySelector(`[data-annotation-id="${annotationId}"]`);
    if (marker) {
        const rect = marker.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const tooltipWidth = 350; // max-width from CSS
        const tooltipHeight = 200; // estimated height
        
        let left = rect.right + 15;
        let top = rect.top;
        
        // Check if tooltip would go off screen horizontally
        if (left + tooltipWidth > viewportWidth - 20) {
            left = rect.left - tooltipWidth - 15; // Show on left side instead
        }
        
        // Check if tooltip would go off screen vertically
        if (top + tooltipHeight > viewportHeight - 20) {
            top = viewportHeight - tooltipHeight - 20;
        }
        
        // Ensure tooltip doesn't go above viewport
        if (top < 20) {
            top = 20;
        }
        
        tooltip.style.position = 'fixed';
        tooltip.style.left = `${Math.max(10, left)}px`;
        tooltip.style.top = `${top}px`;
        tooltip.style.zIndex = '10000';
        
        // Adjust arrow position based on tooltip position
        const arrowLeft = left < rect.right ? tooltipWidth - 30 : 20;
        tooltip.style.setProperty('--arrow-left', `${arrowLeft}px`);
    }
    
    document.body.appendChild(tooltip);
    console.log(`[renderer.js] Showing annotation tooltip for: ${annotationId}`);
}

// --- Hide Annotation Tooltip ---
function hideAnnotationTooltip() {
    const tooltip = document.querySelector('.annotation-tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

// --- Handle Internal Link Clicks ---
function handleInternalLinkClick(event) {
    if (event.target.classList.contains('internal-link')) {
        event.preventDefault();
        const filePath = decodeURIComponent(event.target.getAttribute('data-link'));
        const originalLink = decodeURIComponent(event.target.getAttribute('data-original-link'));
        
        console.log(`[renderer.js] Internal link clicked: ${originalLink} -> ${filePath}`);
        
        // Try to open the linked file
        openInternalLink(filePath, originalLink);
    }
}

// --- Open Internal Link ---
async function openInternalLink(filePath, originalLink) {
    try {
        // First, try to find the file in the current working directory
        const workingDir = window.appSettings?.workingDirectory || '/Users/lmagee/Dev/hegel-pedagogy-ai/lectures';
        const fullPath = `${workingDir}/${filePath}`;
        
        console.log(`[renderer.js] Attempting to open internal link: ${fullPath}`);
        
        // Try to open the file
        const result = await window.electronAPI.invoke('open-file-path', fullPath);
        
        if (result.success) {
            console.log(`[renderer.js] Successfully opened internal link: ${filePath}`);
            
            // If we're currently in presentation mode, switch to editor mode first
            if (window.switchToMode && typeof window.switchToMode === 'function') {
                const presentationContent = document.getElementById('presentation-content');
                if (presentationContent && presentationContent.classList.contains('active')) {
                    console.log(`[renderer.js] Switching from presentation to editor mode to open internal link`);
                    window.switchToMode('editor');
                }
            }
            
            // Load the file content into both editor and preview
            openFileInEditor(result.filePath, result.content);
        } else {
            console.warn(`[renderer.js] Could not open internal link: ${result.error}`);
            
            // Try to automatically create the file based on current content
            await autoCreateInternalLinkFile(fullPath, originalLink, filePath);
        }
    } catch (error) {
        console.error(`[renderer.js] Error opening internal link:`, error);
    }
}

// --- Automatically Create New File for Internal Link ---
async function autoCreateInternalLinkFile(fullPath, originalLink, filePath) {
    try {
        console.log(`[renderer.js] Auto-creating file for internal link: ${fullPath}`);
        
        // Check if file already exists to detect conflicts
        const fileExists = await window.electronAPI.invoke('check-file-exists', fullPath);
        
        if (fileExists) {
            console.log(`[renderer.js] File already exists: ${fullPath}`);
            // Show conflict dialog and let user decide
            const shouldOverwrite = confirm(`File "${filePath}" already exists. Would you like to open it instead?`);
            if (shouldOverwrite) {
                // Try to open the existing file
                const result = await window.electronAPI.invoke('open-file-path', fullPath);
                if (result.success) {
                    openFileInEditor(result.filePath, result.content);
                    return;
                }
            }
            return; // User chose not to overwrite, or opening failed
        }
        
        // Generate content based on the current file and context
        const newFileContent = await generateContentForInternalLink(originalLink, filePath);
        
        // Create the file automatically at the expected path
        const result = await window.electronAPI.invoke('create-internal-link-file', {
            filePath: fullPath,
            content: newFileContent,
            originalLink: originalLink
        });
        
        if (result.success) {
            console.log(`[renderer.js] Auto-created file for internal link: ${result.filePath}`);
            
            // Refresh file tree to show the new file
            renderFileTree();
            
            // Automatically open the new file
            openFileInEditor(result.filePath, newFileContent);
            
            showNotification(`Created "${fullPath.split('/').pop()}" from internal link`, 'success');
        } else {
            console.error(`[renderer.js] Failed to auto-create file for internal link:`, result.error);
            
            // Fall back to manual creation with dialog
            const shouldCreateManually = confirm(`Failed to automatically create "${filePath}". Would you like to choose a location manually?`);
            if (shouldCreateManually) {
                const manualResult = await window.electronAPI.invoke('perform-save-as', newFileContent);
                if (manualResult.success) {
                    renderFileTree();
                    showNotification('File created from internal link', 'success');
                }
            }
        }
    } catch (error) {
        console.error(`[renderer.js] Error auto-creating file for internal link:`, error);
        showNotification('Error creating file from internal link', 'error');
    }
}

// --- Generate Content for Internal Link File ---
async function generateContentForInternalLink(originalLink, filePath) {
    let content = '';
    
    try {
        // Get current file content and metadata
        const currentContent = getCurrentEditorContent();
        const currentFileName = window.currentFilePath ? window.currentFilePath.split('/').pop().replace('.md', '') : '';
        
        // Extract context around the internal link from current content
        const linkContext = extractLinkContext(currentContent, originalLink);
        
        // Generate structured content for the new file
        content = `# ${originalLink}\n\n`;
        
        // Add back-reference to the source file
        if (currentFileName) {
            content += `*Referenced from: [[${currentFileName}]]*\n\n`;
        }
        
        // Add context if found
        if (linkContext.contextBefore || linkContext.contextAfter) {
            content += `## Context\n\n`;
            if (linkContext.contextBefore) {
                content += `${linkContext.contextBefore}\n\n`;
            }
            content += `**→ [[${originalLink}]] ←** *(This file)*\n\n`;
            if (linkContext.contextAfter) {
                content += `${linkContext.contextAfter}\n\n`;
            }
        }
        
        // Add template sections based on the link name
        content += generateTemplateSections(originalLink);
        
        console.log(`[renderer.js] Generated ${content.length} characters of content for internal link file`);
        
    } catch (error) {
        console.error('[renderer.js] Error generating content for internal link:', error);
        // Fall back to basic content
        content = `# ${originalLink}\n\n*This file was automatically created from an internal link.*\n\n## Notes\n\n`;
    }
    
    return content;
}

// --- Extract Context Around Internal Link ---
function extractLinkContext(content, linkText) {
    const linkPattern = new RegExp(`\\[\\[${linkText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\|[^\\]]+)?\\]\\]`, 'g');
    const lines = content.split('\n');
    
    let contextBefore = '';
    let contextAfter = '';
    
    // Find the line containing the link
    for (let i = 0; i < lines.length; i++) {
        if (linkPattern.test(lines[i])) {
            // Get context before (previous 1-2 lines)
            const beforeLines = [];
            for (let j = Math.max(0, i - 2); j < i; j++) {
                const line = lines[j].trim();
                if (line && !line.startsWith('#')) {
                    beforeLines.push(line);
                }
            }
            contextBefore = beforeLines.join(' ');
            
            // Get context after (next 1-2 lines) 
            const afterLines = [];
            for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
                const line = lines[j].trim();
                if (line && !line.startsWith('#')) {
                    afterLines.push(line);
                }
            }
            contextAfter = afterLines.join(' ');
            break;
        }
    }
    
    return { contextBefore, contextAfter };
}

// --- Generate Template Sections Based on Link Name ---
function generateTemplateSections(linkName) {
    let sections = '';
    
    // Analyze the link name to suggest appropriate sections
    const lowerName = linkName.toLowerCase();
    
    if (lowerName.includes('concept') || lowerName.includes('theory') || lowerName.includes('principle')) {
        sections += `## Definition\n\n*What is ${linkName}?*\n\n## Key Components\n\n- \n- \n- \n\n## Applications\n\n*How is this concept used?*\n\n## Related Concepts\n\n- \n- \n\n`;
    } else if (lowerName.includes('lecture') || lowerName.includes('lesson') || lowerName.includes('chapter')) {
        sections += `## Overview\n\n*Brief summary of this ${lowerName.includes('lecture') ? 'lecture' : 'chapter'}*\n\n## Key Points\n\n1. \n2. \n3. \n\n## Discussion Questions\n\n- \n- \n\n## Further Reading\n\n- \n\n`;
    } else if (lowerName.includes('example') || lowerName.includes('case')) {
        sections += `## Description\n\n*Describe the ${lowerName.includes('example') ? 'example' : 'case'}*\n\n## Analysis\n\n*What does this demonstrate?*\n\n## Implications\n\n*What can we learn from this?*\n\n## Related Examples\n\n- \n- \n\n`;
    } else {
        // Generic template
        sections += `## Overview\n\n*Brief description of ${linkName}*\n\n## Details\n\n*More detailed information*\n\n## Notes\n\n- \n- \n\n## Related Topics\n\n- \n- \n\n`;
    }
    
    return sections;
}

// --- Update Function Definition ---
function updatePreviewAndStructure(markdownContent) {
    console.log('[renderer.js] Updating preview and structure...'); // Add logging
    console.log('[renderer.js] Current file path:', window.currentFilePath);
    console.log('[renderer.js] Markdown content length:', markdownContent?.length || 0);
    
    if (!previewContent) {
        console.error('[renderer.js] previewContent element not found!');
        return; // Don't proceed if the element is missing
    }
    
    // Check if this should be rendered as a Kanban board (async)
    const currentFilePath = window.currentFilePath;
    console.log('[renderer.js] About to check Kanban rendering for:', currentFilePath);
    
    if (currentFilePath) {
        // Handle Kanban check asynchronously
        window.electronAPI.invoke('get-settings')
            .then(settings => {
                console.log('[renderer.js] Got settings for Kanban check:', settings?.kanban ? 'Kanban settings found' : 'No Kanban settings');
                console.log('[renderer.js] Full Kanban settings:', JSON.stringify(settings?.kanban, null, 2));
                if (shouldRenderAsKanban(currentFilePath, settings)) {
                    console.log('[renderer.js] Rendering as Kanban board...');
                    // Add visual indicator to title
                    document.title = '📋 Kanban: ' + (currentFilePath.split('/').pop() || 'TODO');
                    
                    // Parse and render Kanban board
                    const parsedKanban = parseKanbanFromMarkdown(markdownContent, settings);
                    const kanbanHtml = renderKanbanBoard(parsedKanban, currentFilePath);
                    
                    previewContent.innerHTML = kanbanHtml;
                    
                    // Force horizontal scrolling after Kanban renders
                    setTimeout(() => {
                        forceKanbanHorizontalScroll();
                    }, 100);
                    
                    // Setup drag and drop if enabled
                    if (settings.kanban?.enableDragDrop) {
                        const kanbanBoard = previewContent.querySelector('.kanban-board');
                        if (kanbanBoard) {
                            setupKanbanDragAndDrop(kanbanBoard, currentFilePath);
                        }
                    }
                    
                    // Update status bar with Kanban stats
                    const totalTasks = parsedKanban.tasks.length;
                    const doneTasks = parsedKanban.tasksByColumn.done?.length || 0;
                    updateStatusBarWithKanban(totalTasks, doneTasks);
                    
                    // Clear structure pane for Kanban view
                    const structureList = document.getElementById('structure-list');
                    if (structureList) {
                        structureList.innerHTML = '<li>📋 Kanban Board View</li>';
                    }
                    
                    // Adjust layout for Kanban view - minimize editor pane
                    const editorPane = document.getElementById('editor-pane');
                    const previewPane = document.getElementById('preview-pane');
                    if (editorPane && previewPane) {
                        editorPane.style.flex = '0 0 300px'; // Minimize editor to 300px
                        previewPane.style.flex = '1'; // Preview takes remaining space
                        console.log('[renderer.js] Adjusted layout for Kanban view');
                    }
                    
                    return; // Exit early for Kanban rendering
                }
                
                // Not a Kanban file - render as regular markdown
                document.title = '📝 ' + (currentFilePath.split('/').pop() || 'Markdown');
                renderRegularMarkdown(markdownContent);
            })
            .catch(error => {
                console.error('[renderer.js] Error checking Kanban rendering:', error);
                // Fall back to regular markdown rendering
                renderRegularMarkdown(markdownContent);
            });
        
        return; // Exit to avoid double rendering
    }
    
    // If no currentFilePath, render regular markdown
    renderRegularMarkdown(markdownContent);
}

function renderRegularMarkdown(markdownContent) {
    console.log('[renderer.js] renderRegularMarkdown called with content length:', markdownContent.length);
    // Restore normal layout (in case we're switching from Kanban view)
    const editorPane = document.getElementById('editor-pane');
    const previewPane = document.getElementById('preview-pane');
    if (editorPane && previewPane) {
        editorPane.style.flex = '1'; // 50% width for editor
        previewPane.style.flex = '1'; // 50% width for preview
        
        // Force remove Kanban-specific width constraints (including !important ones)
        previewPane.style.setProperty('max-width', 'none', 'important');
        previewPane.style.setProperty('overflow-x', 'visible', 'important');
        previewPane.style.setProperty('overflow-y', 'visible', 'important');
        
        // Then remove the properties entirely to let CSS defaults take over
        setTimeout(() => {
            previewPane.style.removeProperty('max-width');
            previewPane.style.removeProperty('overflow-x');
            previewPane.style.removeProperty('overflow-y');
        }, 10);
        
        console.log('[renderer.js] Restored normal layout and removed Kanban constraints');
    }
    
    // Also reset any problematic saved layout that might be causing width issues
    const leftSidebar = document.getElementById('left-sidebar');
    if (leftSidebar && editorPane && previewPane) {
        // Check for corrupted layout values and reset if necessary
        let shouldResetLayout = false;
        
        try {
            const settings = window.appSettings;
            if (settings?.layout) {
                const rightWidthNum = parseFloat(settings.layout.rightWidth);
                const editorWidthNum = parseFloat(settings.layout.editorWidth);
                const structureWidthNum = parseFloat(settings.layout.structureWidth);
                
                // If any width is over 80% or the total is over 120%, layout is corrupted
                if (rightWidthNum > 80 || editorWidthNum > 80 || structureWidthNum > 80 ||
                    (rightWidthNum + editorWidthNum + structureWidthNum) > 120) {
                    shouldResetLayout = true;
                    console.log('[renderer.js] Detected corrupted layout values, resetting');
                }
            }
        } catch (error) {
            shouldResetLayout = true;
            console.log('[renderer.js] Error checking layout, resetting to defaults');
        }
        
        if (shouldResetLayout) {
            // Reset to sensible default layout when switching from Kanban
            leftSidebar.style.flex = '0 0 18%';
            editorPane.style.flex = '0 0 41%';
            previewPane.style.flex = '0 0 41%';
            console.log('[renderer.js] Reset to default layout percentages');
            
            // Also save the corrected layout
            if (window.electronAPI) {
                window.electronAPI.invoke('set-settings', 'layout', {
                    structureWidth: '18%',
                    editorWidth: '41%',
                    rightWidth: '41%'
                }).catch(error => console.error('Failed to save corrected layout:', error));
            }
        }
    }
    
    // Also remove overflow constraints from preview content
    if (previewContent) {
        previewContent.style.setProperty('overflow-x', 'visible', 'important');
        previewContent.style.setProperty('overflow-y', 'visible', 'important');
        
        setTimeout(() => {
            previewContent.style.removeProperty('overflow-x');
            previewContent.style.removeProperty('overflow-y');
        }, 10);
    }
    
    // Update status bar with current content
    updateStatusBar(markdownContent);

    try {
        // Check if marked is available
        if (typeof marked === 'undefined') {
            console.error('[renderer.js] Marked library not loaded, using fallback');
            previewContent.innerHTML = '<pre>' + markdownContent + '</pre>';
            return;
        }
        
        // Create a custom Marked renderer
        const renderer = new marked.Renderer();
        const originalHeading = renderer.heading.bind(renderer); // Keep original renderer
        const originalImage = renderer.image.bind(renderer); // Keep original image renderer
        const originalParagraph = renderer.paragraph.bind(renderer); // Keep original paragraph renderer

        // Override the heading method
        renderer.heading = (text, level, raw) => {
            // Use the original renderer first to get the basic HTML
            let html = originalHeading(text, level, raw);
            // Generate the ID using the raw, unescaped text
            const id = `heading-${slugify(raw || text)}`; // Use raw, fallback to text if raw is undefined
            if (id !== 'heading-') { // Avoid empty IDs
                // Add the ID to the heading tag
                // This is a bit fragile; assumes the heading tag is the first tag
                 html = html.replace(/^(<h[1-6])/, `$1 id="${id}"`);
                 console.log(`[Marked Renderer] Added ID: ${id} to H${level}`); // Log added IDs
            } else {
                 console.warn(`[Marked Renderer] Could not generate valid ID for heading: ${raw || text}`);
            }
            return html;
        };

        // Override the image method to fix relative paths
        renderer.image = (href, title, text) => {
            // Check if this is a relative path
            if (href && !href.startsWith('http') && !href.startsWith('/') && !href.startsWith('file://')) {
                // Use current file directory if available, otherwise fallback to working directory
                const baseDir = window.currentFileDirectory || window.appSettings?.workingDirectory || '/Users/lmagee/Dev/hegel-pedagogy-ai/lectures';
                const fullPath = `file://${baseDir}/${href}`;
                console.log(`[Marked Renderer] Converting relative image path: ${href} -> ${fullPath}`);
                return originalImage(fullPath, title, text);
            }
            return originalImage(href, title, text);
        };

        if (window.marked) {
            // Process content in the correct order: annotations first, then speaker notes, then internal links
            let processedContent = processAnnotations(markdownContent);
            
            // Process speaker notes after annotations
            processedContent = processSpeakerNotes(processedContent);
            
            // Process Obsidian-style [[]] internal links last
            processedContent = processInternalLinks(processedContent);
            
            // Use the custom renderer with marked.parse
            const htmlContent = window.marked.parse(processedContent, { renderer: renderer, gfm: true, breaks: true });
            previewContent.innerHTML = htmlContent;
            
            // Update speaker notes display if visible
            updateSpeakerNotesDisplay();
            
            console.log('[renderer.js] Preview updated with heading IDs, internal links, and speaker notes.');
        } else {
            console.warn('[renderer.js] Marked instance not available yet');
            previewContent.innerHTML = '<p>Markdown preview loading...</p>';
        }
    } catch (error) {
        console.error('[renderer.js] Error parsing Markdown for preview:', error);
        previewContent.innerHTML = '<p>Error rendering Markdown preview.</p>';
    }

    // Update structure pane (ensure this happens after preview update)
    updateStructurePane(markdownContent);
}

// --- Structure Pane Logic ---
function updateStructurePane(markdownContent) {
    if (!markedInstance) {
        console.warn('[renderer.js] Marked instance not ready for structure pane.');
        return;
    }

    structureList.innerHTML = ''; // Clear existing structure
    const lines = markdownContent.split('\n');
    const headings = [];
    const headingRegex = /^(#{1,6})\s+(.*)/; // Regex to find headings

    // Iterate through lines to find headings and their correct line numbers
    lines.forEach((line, index) => {
        const match = line.trim().match(headingRegex);
        if (match) {
            const level = match[1].length; // Number of '#' determines level
            const title = match[2].trim(); // Text after '#'
            headings.push({
                level: level,
                title: title,
                startLine: index, // Use the actual line index (0-based)
                endLine: lines.length - 1 // Default end line, will be updated
            });
        }
    });

    // First pass: Identify headings and their start lines (Now done by iterating lines)
    // Second pass: Determine end lines
    for (let i = 0; i < headings.length; i++) {
        let nextHeadingLine = lines.length; // Default to end of doc
        for (let j = i + 1; j < headings.length; j++) {
            // Find the next heading at the same or higher level
            if (headings[j].level <= headings[i].level) {
                nextHeadingLine = headings[j].startLine;
                break;
            }
        }
        // End line is the line before the next heading starts
        headings[i].endLine = nextHeadingLine > 0 ? nextHeadingLine - 1 : 0;
        // Adjust end line if it's before start line (e.g., empty section)
        if (headings[i].endLine < headings[i].startLine) {
             headings[i].endLine = headings[i].startLine; 
        }
    }

    // Populate the structure list
    headings.forEach((heading, index) => {
         const li = document.createElement('li');
         li.classList.add(`level-${heading.level}`);

         // Add toggle icon
         const toggle = document.createElement('span');
         toggle.classList.add('structure-toggle');
         toggle.textContent = '▼'; // Default: expanded
         toggle.onclick = (event) => {
             event.stopPropagation(); // Prevent li's onclick from firing
             toggleCollapse(li, heading.level);
         };
         li.appendChild(toggle);

         // Add heading text
         const textSpan = document.createElement('span');
         textSpan.textContent = heading.title;
         li.appendChild(textSpan);

         li.draggable = true;
         li.dataset.startLine = heading.startLine; // Now uses the correct index
         li.dataset.endLine = heading.endLine;
         li.dataset.headingIndex = index; // Keep track of the original index
         li.dataset.level = heading.level;
         li.dataset.expanded = 'true'; // Default state
         li.dataset.headingText = heading.title; // Use heading.title here

         // Placeholder event handlers - Implement these functions later
         li.ondragstart = (event) => handleDragStart(event, heading);
         li.ondragover = (event) => handleDragOver(event);
         li.ondrop = (event) => handleDrop(event, heading);
         li.oncontextmenu = (event) => handleContextMenu(event, heading);
         // Optional: Add click listener to scroll editor
         li.onclick = (event) => {
            // Prevent triggering click if toggle icon was clicked
            if (event.target.classList.contains('structure-toggle')) {
                return;
            }

            const lineNumber = parseInt(li.dataset.startLine, 10) + 1; // Get startLine and add 1 for editor
            const headingText = li.dataset.headingText; // Get heading text from LI dataset

            // 1. Scroll Editor Pane
            if (editor && typeof editor.revealLineInCenter === 'function') {
                console.log(`[Structure Click] Scrolling editor to line: ${lineNumber}`);
                editor.revealLineInCenter(lineNumber);
                editor.setPosition({ lineNumber: lineNumber, column: 1 });
                editor.focus(); // Focus editor after scrolling
            } else {
                console.warn(`[Structure Click] Editor not available or invalid lineNumber (${listItem.dataset.startLine}) for scrolling.`);
            }

            // 2. Scroll Preview Pane
            if (headingText) {
                const previewId = `heading-${slugify(headingText)}`;
                const previewElement = document.getElementById(previewId);
                const previewContentDiv = document.getElementById('preview-content');

                if (previewElement && previewContentDiv) {
                    console.log(`[Structure Click] Scrolling preview to element: #${previewId}`);
                    // --- Removed diagnostic logs ---
                    
                    // Wrap scroll in requestAnimationFrame to handle timing issues
                    requestAnimationFrame(() => {
                        previewElement.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start' // Scrolls to the top of the element
                        });
                    });
                    
                } else {
                    console.warn(`[Structure Click] Preview element '#${previewId}' or container '#preview-content' not found.`);
                }
            } else {
                 console.warn('[Structure Click] Heading text not found in dataset.');
            }
        };
        structureList.appendChild(li);
    });
}

// --- Expand/Collapse Logic ---
function toggleCollapse(listItem, level) {
    const isExpanded = listItem.dataset.expanded === 'true';
    const toggleIcon = listItem.querySelector('.structure-toggle');

    // Update state and icon
    listItem.dataset.expanded = isExpanded ? 'false' : 'true';
    toggleIcon.textContent = isExpanded ? '▶' : '▼';

    // Iterate over subsequent siblings
    let currentSibling = listItem.nextElementSibling;    
    while (currentSibling) {        
         const siblingLevel = parseInt(currentSibling.dataset.level, 10);

         // Stop if we reach a heading at the same or higher level
         if (siblingLevel <= level) {
             break;
         }

         // Toggle visibility of children
         if (isExpanded) {
             // Collapse: hide children deeper than the current level
             currentSibling.style.display = 'none';            
         } else {
             // Expand: Show only direct children (level + 1).
             // If a direct child is collapsed, its children remain hidden.
             if (siblingLevel === level + 1) {
                 currentSibling.style.display = 'flex'; // Or 'block', 'flex' used for alignment
                 // If this newly shown child is itself collapsed, skip its children
                 if (currentSibling.dataset.expanded === 'false') {
                     // Skip deeper levels until we find the next sibling at level+1 or <= level
                     let deeperSibling = currentSibling.nextElementSibling;
                     while (deeperSibling) {
                         const deeperLevel = parseInt(deeperSibling.dataset.level, 10);
                         if (deeperLevel <= siblingLevel) break; // Found next relevant sibling
                         deeperSibling = deeperSibling.nextElementSibling;
                     }
                     currentSibling = deeperSibling; // Jump ahead
                     continue; // Skip the standard nextElementSibling increment
                 }
             }
         }

         currentSibling = currentSibling ? currentSibling.nextElementSibling : null;
     }
 }

 // --- Drag and Drop Handlers (Placeholders) ---
function handleDragStart(event, heading) {
    console.log('Drag Start:', heading.title, `Lines ${heading.startLine}-${heading.endLine}`);
    event.dataTransfer.setData('text/plain', JSON.stringify(heading)); // Pass heading data
    event.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(event) {
    event.preventDefault(); // Necessary to allow dropping
    event.dataTransfer.dropEffect = 'move';
}

function handleDrop(event, targetHeading) {
    event.preventDefault();
    const draggedHeadingData = event.dataTransfer.getData('text/plain');
    if (!draggedHeadingData) return;

    try {
        const draggedHeading = JSON.parse(draggedHeadingData);

        // Prevent dropping onto itself
        if (draggedHeading.startLine === targetHeading.startLine) {
            console.log("Cannot drop heading onto itself.");
            return;
        }

        console.log(`Dragged: ${draggedHeading.title} (Lines ${draggedHeading.startLine}-${draggedHeading.endLine})`);
        console.log(`Dropped onto: ${targetHeading.title} (Lines ${targetHeading.startLine}-${targetHeading.endLine})`);

        if (!editor) {
            console.error("Editor instance not available for drop operation.");
            return;
        }

        const model = editor.getModel();
        if (!model) {
            console.error("Editor model not available for drop operation.");
            return;
        }

        // 1. Define the range of the dragged section (Monaco lines are 1-based)
        // Ensure endLine includes the last character of the line
        const dragRange = new monaco.Range(
            draggedHeading.startLine + 1, 
            1, 
            draggedHeading.endLine + 1, 
            model.getLineLength(draggedHeading.endLine + 1) + 1 // Correct method + column is 1-based
        );

        // 2. Get the text content of the dragged section (including trailing newline)
        let draggedText = model.getValueInRange(dragRange);
        // Ensure it ends with a newline for proper formatting
        if (!draggedText.endsWith('\n')) {
             draggedText += '\n';
        }
         // Add extra newline if needed between sections
        const lineAfterNumber = draggedHeading.endLine + 2;
        if (draggedText.length > 0 && !draggedText.endsWith('\n\n') && lineAfterNumber <= model.getLineCount()) {
             const lineAfter = model.getLineContent(lineAfterNumber);
             if (lineAfter && lineAfter.trim() !== '') {
                 // Add newline if the next line isn't empty
                 draggedText += '\n'; 
             }
        }

        // 3. Define the insertion position (before the target heading's line, column 1)
        // Adjust insertion point if dragging downwards past the target
        const insertLineNumber = targetHeading.startLine + 1;
        const insertPosition = new monaco.Position(insertLineNumber, 1);

        // 4. Create edit operations
        const edits = [];

        // Delete operation: Delete the original text
        edits.push({
            range: dragRange,
            text: null // Setting text to null signifies deletion
        });

        // Insert operation: Insert the text at the new position
        edits.push({
            range: new monaco.Range(insertPosition.lineNumber, insertPosition.column, insertPosition.lineNumber, insertPosition.column),
            text: draggedText,
            forceMoveMarkers: true // Important for cursor/selection behavior
        });

        // 5. Apply edits atomically
        // Using pushEditOperations for better undo/redo stack management
        const identifier = { major: 1, minor: 1 }; // Identifier for the edits
        model.pushEditOperations([], edits, (inverseEdits) => inverseEdits);

        // The onDidChangeModelContent listener will handle refreshing the UI
        console.log("Drop operation applied to editor model.");

    } catch (e) {
        console.error("Error processing drop data:", e);
    }
}

// --- Context Menu Handler ---
function handleContextMenu(event, heading) {
    event.preventDefault(); // Prevent default browser context menu
    console.log('[renderer.js] Context menu triggered on structure pane.');

    const target = event.target;
    const li = target.closest('li'); // Find the closest list item

    if (li && li.dataset.lineNumber) {
        const lineNumberStr = li.dataset.lineNumber;
        console.log(`[renderer.js] Requesting context menu from main for line: ${lineNumberStr}`);

        // Ask the main process to show the context menu
        window.electronAPI.invoke('show-context-menu', { lineNumber: lineNumberStr })
          .then(() => console.log('[renderer.js] Context menu request sent to main.'))
          .catch(err => console.error('[renderer.js] Error invoking context menu:', err));
    } else {
        console.log('[renderer.js] Context menu triggered outside a valid list item.');
    }
}

// Listener for commands coming back from the main process context menu
function setupContextMenuListener() {
    if (!window.electronAPI) {
        console.error("[renderer.js] Cannot set up context menu listener: electronAPI not available.");
        return;
    }
    window.electronAPI.on('context-menu-command', (args) => {
        const { command, lineNumber } = args;
        console.log(`[renderer.js] Received context menu command: ${command} for line ${lineNumber}`);
        handleContextMenuAction(command, parseInt(lineNumber, 10)); // Reuse existing handler
    });
    console.log('[renderer.js] Context menu command listener set up.');
}

async function handleContextMenuAction(action, lineNumber) {
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    // 1. Define the range of the section (Monaco lines are 1-based)
    // Ensure endLine includes the last character of the line
    const range = new monaco.Range(
        lineNumber + 1, 
        1, 
        lineNumber + 1, 
        model.getLineLength(lineNumber + 1) + 1 // Correct method + column is 1-based
    );

    // 2. Get the text content of the section (including trailing newline)
    let text = model.getValueInRange(range);
    // Ensure it ends with a newline for proper formatting
    if (!text.endsWith('\n')) {
         text += '\n';
    }

    switch (action) {
        case 'cut':
            navigator.clipboard.writeText(text)
                .then(() => {
                    console.log(`Cut section: ${lineNumber}`);
                    // Perform delete after successful copy
                    const deleteEdit = { range: range, text: null };
                    model.pushEditOperations([], [deleteEdit], () => null);
                })
                .catch(err => console.error('Failed to cut text: ', err));
            break;
        case 'copy':
            navigator.clipboard.writeText(text)
                .then(() => console.log(`Copied section: ${lineNumber}`))
                .catch(err => console.error('Failed to copy text: ', err));
            break;
        case 'paste':
            try {
                let textToPaste = await navigator.clipboard.readText();
                if (!textToPaste) return;

                // Ensure trailing newlines for proper formatting
                if (!textToPaste.endsWith('\n')) {
                    textToPaste += '\n';
                }
                if (!textToPaste.endsWith('\n\n')) {
                    textToPaste += '\n'; // Add a blank line after pasted content
                }

                const insertPosition = new monaco.Position(lineNumber + 1, 1);
                const pasteEdit = {
                    range: new monaco.Range(insertPosition.lineNumber, 1, insertPosition.lineNumber, 1),
                    text: textToPaste,
                    forceMoveMarkers: true
                };
                model.pushEditOperations([], [pasteEdit], () => null);
                console.log(`Pasted content before section: ${lineNumber}`);
            } catch (err) {
                console.error('Failed to paste text: ', err);
            }
            break;
        case 'delete':
            const deleteEdit = { range: range, text: null };
            model.pushEditOperations([], [deleteEdit], () => null);
            console.log(`Deleted section: ${lineNumber}`);
            break;
        default:
            console.error(`Unknown context menu action: ${action}`);
    }
}

function slugify(text) {
    if (!text) return '';
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-\-+/g, '-')         // Replace multiple - with single -
        .replace(/^[-]+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
}

// --- Markdown Folding Provider ---
function registerMarkdownFoldingProvider() {
    try {
        monaco.languages.registerFoldingRangeProvider('markdown', {
            provideFoldingRanges: function(model, context, token) {
                console.log('[renderer.js] Folding provider called');
                const foldingRanges = [];
                const lines = model.getLinesContent(); // Use getLinesContent() instead
                
                console.log('[renderer.js] Processing', lines.length, 'lines for folding');
                
                // Simple header-based folding first
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    
                    // Match headers (# ## ### etc.)
                    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
                    if (headerMatch) {
                        const level = headerMatch[1].length;
                        const startLine = i + 1; // Monaco uses 1-based line numbers
                        
                        // Find the next header of same or higher level (lower number)
                        let endLine = lines.length;
                        for (let j = i + 1; j < lines.length; j++) {
                            const nextHeaderMatch = lines[j].match(/^(#{1,6})\s+(.+)/);
                            if (nextHeaderMatch) {
                                const nextLevel = nextHeaderMatch[1].length;
                                if (nextLevel <= level) {
                                    endLine = j;
                                    break;
                                }
                            }
                        }
                        
                        // Only create fold range if there's content to fold
                        if (endLine > startLine + 1) {
                            foldingRanges.push({
                                start: startLine,
                                end: endLine,
                                kind: monaco.languages.FoldingRangeKind.Region
                            });
                            console.log('[renderer.js] Added header folding range:', startLine, '->', endLine);
                        }
                    }
                    
                    // Match code blocks
                    const codeBlockMatch = line.match(/^```/);
                    if (codeBlockMatch) {
                        const startLine = i + 1;
                        // Find closing ```
                        for (let j = i + 1; j < lines.length; j++) {
                            if (lines[j].match(/^```\s*$/)) {
                                const endLine = j + 1;
                                foldingRanges.push({
                                    start: startLine,
                                    end: endLine,
                                    kind: monaco.languages.FoldingRangeKind.Region
                                });
                                console.log('[renderer.js] Added code block folding range:', startLine, '->', endLine);
                                break;
                            }
                        }
                    }
                }
                
                console.log('[renderer.js] Generated', foldingRanges.length, 'folding ranges');
                return foldingRanges;
            }
        });
        
        console.log('[renderer.js] Markdown folding provider registered successfully');
    } catch (error) {
        console.error('[renderer.js] Error registering folding provider:', error);
    }
}

// --- Folding Keyboard Shortcuts ---
function addFoldingKeyboardShortcuts() {
    // Fold current section (Ctrl/Cmd + Shift + [)
    editor.addAction({
        id: 'fold-current',
        label: 'Fold Current Section',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.US_OPEN_SQUARE_BRACKET
        ],
        run: function() {
            editor.getAction('editor.fold').run();
        }
    });
    
    // Unfold current section (Ctrl/Cmd + Shift + ])
    editor.addAction({
        id: 'unfold-current',
        label: 'Unfold Current Section',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.US_CLOSE_SQUARE_BRACKET
        ],
        run: function() {
            editor.getAction('editor.unfold').run();
        }
    });
    
    // Fold all sections (Ctrl/Cmd + K, Ctrl/Cmd + 0)
    editor.addAction({
        id: 'fold-all',
        label: 'Fold All Sections',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_K,
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_0
        ],
        run: function() {
            editor.getAction('editor.foldAll').run();
        }
    });
    
    // Unfold all sections (Ctrl/Cmd + K, Ctrl/Cmd + J)
    editor.addAction({
        id: 'unfold-all',
        label: 'Unfold All Sections',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_K,
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_J
        ],
        run: function() {
            editor.getAction('editor.unfoldAll').run();
        }
    });
    
    // Fold recursively (Ctrl/Cmd + K, Ctrl/Cmd + [)
    editor.addAction({
        id: 'fold-recursively',
        label: 'Fold Recursively',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_K,
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_OPEN_SQUARE_BRACKET
        ],
        run: function() {
            editor.getAction('editor.foldRecursively').run();
        }
    });
    
    // Unfold recursively (Ctrl/Cmd + K, Ctrl/Cmd + ])
    editor.addAction({
        id: 'unfold-recursively',
        label: 'Unfold Recursively',
        keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_K,
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_CLOSE_SQUARE_BRACKET
        ],
        run: function() {
            editor.getAction('editor.unfoldRecursively').run();
        }
    });
    
    console.log('[renderer.js] Folding keyboard shortcuts added');
}

// --- Folding Toolbar Controls ---
function addFoldingToolbarControls() {
    // Get toolbar buttons
    const foldAllBtn = document.getElementById('fold-all-btn');
    const unfoldAllBtn = document.getElementById('unfold-all-btn');
    const foldCurrentBtn = document.getElementById('fold-current-btn');
    const unfoldCurrentBtn = document.getElementById('unfold-current-btn');
    
    if (foldAllBtn) {
        foldAllBtn.addEventListener('click', () => {
            editor.getAction('editor.foldAll').run();
        });
    }
    
    if (unfoldAllBtn) {
        unfoldAllBtn.addEventListener('click', () => {
            editor.getAction('editor.unfoldAll').run();
        });
    }
    
    if (foldCurrentBtn) {
        foldCurrentBtn.addEventListener('click', () => {
            editor.getAction('editor.fold').run();
        });
    }
    
    if (unfoldCurrentBtn) {
        unfoldCurrentBtn.addEventListener('click', () => {
            editor.getAction('editor.unfold').run();
        });
    }
    
    console.log('[renderer.js] Folding toolbar controls added');
}

// --- AI Summarization Action ---
function addAISummarizationAction() {
    if (!editor) {
        console.warn('[renderer.js] Cannot add AI summarization action: editor not available');
        return;
    }
    
    // Add context menu action for AI summarization
    editor.addAction({
        id: 'ai-summarize-to-notes',
        label: '🤖 Summarize to Speaker Notes',
        contextMenuGroupId: 'modification',
        contextMenuOrder: 1.5,
        
        // Show only when text is selected
        precondition: 'editorHasSelection',
        
        run: async function(ed) {
            const selection = ed.getSelection();
            const selectedText = ed.getModel().getValueInRange(selection);
            
            if (!selectedText || selectedText.trim() === '') {
                console.warn('[renderer.js] No text selected for AI summarization');
                showNotification('Please select some text to summarize', 'warning');
                return;
            }
            
            console.log(`[renderer.js] Starting AI summarization for selected text: "${selectedText.substring(0, 100)}..."`);
            
            try {
                // Show loading indicator
                showNotification('Generating speaker notes...', 'info');
                
                // Call the AI summarization service
                const result = await window.electronAPI.invoke('summarize-text-to-notes', selectedText);
                
                if (result.error) {
                    console.error('[renderer.js] AI summarization failed:', result.error);
                    showNotification(`Error: ${result.error}`, 'error');
                    return;
                }
                
                if (result.success) {
                    console.log(`[renderer.js] AI summarization successful from ${result.provider}`);
                    
                    // Replace selected text with the wrapped notes
                    ed.executeEdits('ai-summarization', [{
                        range: selection,
                        text: result.wrappedText
                    }]);
                    
                    showNotification(`Speaker notes generated using ${result.provider} (${result.model})`, 'success');
                    
                    // Log the transformation for debugging
                    console.log('[renderer.js] Original text replaced with notes:', {
                        original: selectedText.substring(0, 100) + '...',
                        heading: result.heading,
                        bullets: result.bullets,
                        provider: result.provider,
                        model: result.model
                    });
                }
            } catch (error) {
                console.error('[renderer.js] Error in AI summarization:', error);
                showNotification('Failed to generate speaker notes. Please try again.', 'error');
            }
        }
    });
    
    // Add context menu action for extracting notes content
    editor.addAction({
        id: 'extract-notes-content',
        label: '📝 Extract Notes Content',
        contextMenuGroupId: 'modification',
        contextMenuOrder: 1.6,
        
        // Show only when text is selected
        precondition: 'editorHasSelection',
        
        run: async function(ed) {
            const selection = ed.getSelection();
            const selectedText = ed.getModel().getValueInRange(selection);
            
            if (!selectedText || selectedText.trim() === '') {
                console.warn('[renderer.js] No text selected for notes extraction');
                showNotification('Please select some text to extract notes from', 'warning');
                return;
            }
            
            console.log(`[renderer.js] Starting notes extraction for selected text: "${selectedText.substring(0, 100)}..."`);
            
            try {
                // Show loading indicator
                showNotification('Extracting notes content...', 'info');
                
                // Call the notes extraction service
                const result = await window.electronAPI.invoke('extract-notes-content', selectedText);
                
                if (result.error) {
                    console.error('[renderer.js] Notes extraction failed:', result.error);
                    showNotification(`Error: ${result.error}`, 'error');
                    return;
                }
                
                if (result.success) {
                    console.log(`[renderer.js] Notes extraction successful: found ${result.blocksFound} block(s)`);
                    
                    // Replace selected text with the extracted notes content
                    ed.executeEdits('extract-notes', [{
                        range: selection,
                        text: result.extractedContent
                    }]);
                    
                    // Show success notification
                    const message = `Extracted content from ${result.blocksFound} notes block${result.blocksFound === 1 ? '' : 's'}`;
                    showNotification(message, 'success');
                } else {
                    console.warn('[renderer.js] Notes extraction returned no success flag');
                    showNotification('Failed to extract notes content', 'error');
                }
                
            } catch (error) {
                console.error('[renderer.js] Notes extraction failed:', error);
                showNotification('Failed to extract notes content', 'error');
            }
        }
    });
    
    console.log('[renderer.js] AI summarization and notes extraction context menu actions added');
}

// --- Navigation Controls Setup ---
function setupNavigationControls() {
    const backBtn = document.getElementById('nav-back-btn');
    const forwardBtn = document.getElementById('nav-forward-btn');
    
    if (backBtn) {
        backBtn.addEventListener('click', navigateBack);
    }
    
    if (forwardBtn) {
        forwardBtn.addEventListener('click', navigateForward);
    }
    
    // Add keyboard shortcuts for navigation
    document.addEventListener('keydown', (event) => {
        // Alt+Left Arrow = Back
        if (event.altKey && event.code === 'ArrowLeft') {
            event.preventDefault();
            navigateBack();
        }
        // Alt+Right Arrow = Forward
        else if (event.altKey && event.code === 'ArrowRight') {
            event.preventDefault();
            navigateForward();
        }
    });
    
    // Initialize buttons state and load saved history
    updateNavigationButtons();
    loadNavigationHistoryFromSettings();
    
    console.log('[renderer.js] Navigation controls setup complete');
}

// --- BibTeX Language Registration ---
function registerBibTeXLanguage() {
    console.log('[renderer.js] Registering BibTeX language support...');
    
    // Register the BibTeX language
    monaco.languages.register({ id: 'bibtex' });
    
    // Define BibTeX tokens for syntax highlighting
    monaco.languages.setMonarchTokensProvider('bibtex', {
        tokenizer: {
            root: [
                // Entry types (@article, @book, etc.)
                [/@\w+/, 'keyword'],
                
                // Entry keys (the citation key after the entry type)
                [/\{\s*([^,\s}]+)/, 'entity.name.function'],
                
                // Field names (title, author, year, etc.)
                [/\b(title|author|editor|journal|booktitle|year|volume|number|pages|publisher|address|isbn|doi|url|note|keywords|abstract)\s*=/, 'attribute.name'],
                
                // Quoted strings
                [/"([^"]*)"/, 'string'],
                
                // Braced strings
                [/\{([^{}]*)\}/, 'string'],
                
                // Numbers
                [/\b\d+\b/, 'number'],
                
                // Comments
                [/%.*$/, 'comment'],
                
                // Braces and brackets
                [/[{}\[\]]/, 'bracket'],
                
                // Commas and equals
                [/[,=]/, 'delimiter'],
                
                // Whitespace
                [/\s+/, 'white']
            ]
        }
    });
    
    // Define BibTeX language configuration
    monaco.languages.setLanguageConfiguration('bibtex', {
        brackets: [
            ['{', '}'],
            ['[', ']'],
            ['(', ')']
        ],
        autoClosingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '"', close: '"' }
        ],
        surroundingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '"', close: '"' }
        ],
        comments: {
            lineComment: '%'
        }
    });
    
    // Define theme colors for BibTeX
    monaco.editor.defineTheme('bibtex-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'keyword', foreground: '569cd6', fontStyle: 'bold' },
            { token: 'entity.name.function', foreground: 'dcdcaa' },
            { token: 'attribute.name', foreground: '9cdcfe' },
            { token: 'string', foreground: 'ce9178' },
            { token: 'number', foreground: 'b5cea8' },
            { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
            { token: 'bracket', foreground: 'ffd700' },
            { token: 'delimiter', foreground: 'd4d4d4' }
        ],
        colors: {}
    });
    
    monaco.editor.defineTheme('bibtex-light', {
        base: 'vs',
        inherit: true,
        rules: [
            { token: 'keyword', foreground: '0000ff', fontStyle: 'bold' },
            { token: 'entity.name.function', foreground: '795e26' },
            { token: 'attribute.name', foreground: '001080' },
            { token: 'string', foreground: 'a31515' },
            { token: 'number', foreground: '09885a' },
            { token: 'comment', foreground: '008000', fontStyle: 'italic' },
            { token: 'bracket', foreground: 'af00db' },
            { token: 'delimiter', foreground: '000000' }
        ],
        colors: {}
    });
    
    console.log('[renderer.js] BibTeX language support registered successfully.');
}

// --- Citation Autocomplete Functionality ---
let bibEntries = [];

// Parse BibTeX entries from content
function parseBibTeX(content) {
    const entries = [];
    const entryRegex = /@(\w+)\s*\{\s*([^,\s}]+)\s*,([^}]*)\}/g;
    let match;
    
    while ((match = entryRegex.exec(content)) !== null) {
        const type = match[1];
        const key = match[2];
        const fields = match[3];
        
        // Extract title and author for better display
        const titleMatch = fields.match(/title\s*=\s*[{"']([^}"']*)[}"']/i);
        const authorMatch = fields.match(/author\s*=\s*[{"']([^}"']*)[}"']/i);
        const yearMatch = fields.match(/year\s*=\s*[{"']?(\d{4})[}"']?/i);
        
        const title = titleMatch ? titleMatch[1] : '';
        const author = authorMatch ? authorMatch[1] : '';
        const year = yearMatch ? yearMatch[1] : '';
        
        entries.push({
            key: key,
            type: type,
            title: title,
            author: author,
            year: year
        });
    }
    
    return entries;
}

// Load BibTeX files from the lectures directory
async function loadBibTeXFiles() {
    try {
        const bibFiles = ['references.bib', 'sample-bibliography.bib'];
        bibEntries = [];
        
        for (const fileName of bibFiles) {
            try {
                const content = await window.electronAPI.invoke('read-file', `lectures/${fileName}`);
                const entries = parseBibTeX(content);
                bibEntries.push(...entries);
                console.log(`[renderer.js] Loaded ${entries.length} entries from ${fileName}`);
            } catch (error) {
                console.log(`[renderer.js] Could not load ${fileName}:`, error.message);
            }
        }
        
        console.log(`[renderer.js] Total BibTeX entries loaded: ${bibEntries.length}`);
        return bibEntries;
    } catch (error) {
        console.error('[renderer.js] Error loading BibTeX files:', error);
        return [];
    }
}

// Register citation autocomplete provider for Markdown
function registerCitationAutocomplete() {
    console.log('[renderer.js] Registering citation autocomplete provider...');
    
    monaco.languages.registerCompletionItemProvider('markdown', {
        triggerCharacters: ['@'],
        provideCompletionItems: function(model, position) {
            // Get current line text
            const currentLine = model.getLineContent(position.lineNumber);
            const textBeforePointer = currentLine.substring(0, position.column - 1);
            
            // Look for citation pattern: [@...] where we're after the @
            const citationMatch = textBeforePointer.match(/\[@([^\]]*)?$/);
            
            if (!citationMatch) {
                return { suggestions: [] };
            }
            
            const searchTerm = citationMatch[1] || '';
            
            // Filter entries based on search term
            const suggestions = bibEntries
                .filter(entry => {
                    if (!searchTerm) return true;
                    const searchLower = searchTerm.toLowerCase();
                    return entry.key.toLowerCase().includes(searchLower) ||
                           entry.title.toLowerCase().includes(searchLower) ||
                           entry.author.toLowerCase().includes(searchLower);
                })
                .map(entry => {
                    // Create a detailed description
                    const description = [
                        entry.author && `Author: ${entry.author}`,
                        entry.year && `Year: ${entry.year}`,
                        entry.title && `Title: ${entry.title}`
                    ].filter(Boolean).join('\n');
                    
                    return {
                        label: entry.key,
                        kind: monaco.languages.CompletionItemKind.Reference,
                        insertText: entry.key,
                        detail: `@${entry.type}`,
                        documentation: description,
                        range: {
                            startLineNumber: position.lineNumber,
                            endLineNumber: position.lineNumber,
                            startColumn: position.column - searchTerm.length,
                            endColumn: position.column
                        }
                    };
                });
            
            return { suggestions: suggestions };
        }
    });
    
    console.log('[renderer.js] Citation autocomplete provider registered successfully.');
}

// --- Initialize Application ---
function initializeApp() {
    console.log('[renderer.js] Initializing application...');
    console.log('[renderer.js] Initializing Monaco editor...');
    require(['vs/editor/editor.main'], function() {
        console.log('[renderer.js] Monaco module loaded.');
        
        // Register BibTeX language support
        registerBibTeXLanguage();
        
        try {
            editor = monaco.editor.create(editorContainer, {
                value: '# My Markdown Document\n\n' +
                       'This is the introduction to the document.\n\n' +
                       '## Section One\n' +
                       'This is content under section one.\n' +
                       'More content here.\n\n' +
                       '### Subsection A\n' +
                       'Content for subsection A.\n' +
                       'Additional details.\n\n' +
                       '### Subsection B\n' +
                       'Content for subsection B.\n' +
                       'More information here.\n\n' +
                       '## Section Two\n' +
                       'This is content under section two.\n\n' +
                       '```javascript\n' +
                       'console.log("Hello, world!");\n' +
                       'function test() {\n' +
                       '    return "Code folding test";\n' +
                       '}\n' +
                       '```\n\n' +
                       '## Section Three\n' +
                       'Final section content.\n' +
                       'The end.',
                language: 'markdown',
                theme: 'vs-dark',
                automaticLayout: true,
                wordWrap: 'on',
                // Conditionally disable auto-closing brackets based on citation autocomplete setting
                autoClosingBrackets: 'beforeWhitespace', // Will be updated after settings load
                autoClosingQuotes: 'never',
                // Code folding options
                folding: true,
                foldingStrategy: 'auto', // Change from 'indentation' to 'auto'
                foldingHighlight: true,
                unfoldOnClickAfterEndOfLine: true,
                showFoldingControls: 'always',
                // Additional options for better folding experience
                minimap: {
                    enabled: true,
                    showSlider: 'always'
                },
                scrollbar: {
                    verticalScrollbarSize: 10,
                    horizontalScrollbarSize: 10
                }
            });
            console.log('[renderer.js] Monaco editor instance created.');
            
            // Register custom Markdown folding provider and add shortcuts
            setTimeout(() => {
                registerMarkdownFoldingProvider();
                addFoldingKeyboardShortcuts();
                addFoldingToolbarControls();
                addAISummarizationAction();
                console.log('[renderer.js] Folding features and AI actions initialized');
            }, 100);
            
            updatePreviewAndStructure(editor.getValue());
            editor.onDidChangeModelContent(() => {
                const currentContent = editor.getValue();
                updatePreviewAndStructure(currentContent);
                scheduleAutoSave(); // Schedule auto-save when content changes
            });
            
            // Initialize auto-save after editor is ready
            initializeAutoSave();
            
            // Load settings and conditionally enable citation autocomplete
            window.electronAPI.invoke('get-settings').then(settings => {
                window.appSettings = settings;
                
                // Update editor options based on settings
                if (settings?.editor?.enableCitationAutocomplete !== false) {
                    editor.updateOptions({
                        autoClosingBrackets: 'never' // Disable auto-closing brackets for citation autocomplete
                    });
                    
                    // Load BibTeX files and register citation autocomplete
                    loadBibTeXFiles().then(() => {
                        registerCitationAutocomplete();
                    });
                }
            }).catch(error => {
                console.error('[renderer.js] Error loading settings:', error);
                // Fallback: enable citation autocomplete by default
                editor.updateOptions({
                    autoClosingBrackets: 'never'
                });
                loadBibTeXFiles().then(() => {
                    registerCitationAutocomplete();
                });
            });
            
            // Update cursor position when cursor moves
            editor.onDidChangeCursorPosition(() => {
                const position = editor.getPosition();
                const cursorPosEl = document.getElementById('cursor-position');
                if (cursorPosEl && position) {
                    cursorPosEl.textContent = `Ln ${position.lineNumber}, Col ${position.column}`;
                }
            });

            // --- THEME SYNC: Ensure Monaco theme matches settings ---
            // Use the current body class to determine theme if appSettings is not yet set
            let isDark;
            if (window.appSettings && typeof appSettings.theme === 'string') {
                isDark = appSettings.theme === 'dark';
            } else {
                // Fallback: check body class
                isDark = document.body.classList.contains('dark-mode');
            }
            applyTheme(isDark);

            // --- Resizing Logic (MOVED HERE) --- 
            console.log('[renderer.js] Setting up resizer logic...');
            const resizer = document.getElementById('resizer');
            const editorPane = document.getElementById('editor-pane'); 
            const rightPane = document.getElementById('right-pane'); 
            let isResizing = false;
            let startX, initialEditorWidth, initialRightWidth;

            // Check if elements were found before proceeding
            if (!resizer || !editorPane || !rightPane) {
                console.error('Resizer or pane elements not found after Monaco init!');
                console.log('[renderer.js] Debug - resizer:', resizer, 'editorPane:', editorPane, 'rightPane:', rightPane);
            } else {
                // Attach the initial mousedown listener to the resizer only if elements exist
                resizer.addEventListener('mousedown', handleMouseDown);
                console.log('[renderer.js] Vertical resizer event listener attached to:', resizer);
            }

            // --- Resizing Logic for Left Resizer ---
            console.log('[renderer.js] Setting up left resizer logic...');
            const resizerLeft = document.getElementById('sidebar-resizer');
            const leftSidebar = document.getElementById('left-sidebar');
            // editorPane is already defined above for the right resizer

            let isResizingLeft = false;
            let startXLeft, initialSidebarWidth;

            if (!resizerLeft || !leftSidebar) { // Check all required panes
                console.error('Left resizer or left sidebar not found after Monaco init!');
                console.log('[renderer.js] Debug - resizerLeft:', resizerLeft, 'leftSidebar:', leftSidebar);
            } else {
                resizerLeft.addEventListener('mousedown', handleMouseDownLeft);
                console.log('[renderer.js] Horizontal (sidebar) resizer event listener attached to:', resizerLeft);
            }

            function handleMouseDownLeft(e) {
                if (!resizerLeft || !leftSidebar) return;
                console.log('[Resize Left] Mouse Down');
                isResizingLeft = true;
                startXLeft = e.clientX;
                initialSidebarWidth = leftSidebar.offsetWidth;
                // Prevent text selection during drag
                e.preventDefault(); 
                document.addEventListener('mousemove', handleMouseMoveLeft);
                document.addEventListener('mouseup', handleMouseUpLeft);
            }

            function handleMouseMoveLeft(e) {
                if (!isResizingLeft || !leftSidebar) return;
                // console.log('[Resize Left] Mouse Move');
                const container = leftSidebar.parentElement; // Get the container
                if (!container) return;
                const containerWidth = container.offsetWidth;

                const deltaX = e.clientX - startXLeft;
                let newSidebarPx = initialSidebarWidth + deltaX;

                const minWidth = 200; // Min width for sidebar
                const maxWidth = containerWidth * 0.5; // Max 50% of container width

                // Enforce minimum and maximum widths
                if (newSidebarPx < minWidth) {
                    newSidebarPx = minWidth;
                }
                if (newSidebarPx > maxWidth) {
                    newSidebarPx = maxWidth;
                }

                // Apply the new width directly
                console.log(`[Resize Left] Setting sidebar width: ${newSidebarPx}px`);
                leftSidebar.style.width = `${newSidebarPx}px`;
                leftSidebar.style.flexBasis = `${newSidebarPx}px`;
                leftSidebar.style.flex = `0 0 ${newSidebarPx}px`;

                // Trigger layout recalculation for Monaco if needed (resizing sidebar might shift editor)
                requestAnimationFrame(() => {
                    if (editor && typeof editor.layout === 'function') {
                        editor.layout(); 
                    }
                });
            }

            function handleMouseUpLeft() {
                if (!isResizingLeft) return;
                console.log('[Resize Left] Mouse Up');
                isResizingLeft = false;
                document.removeEventListener('mousemove', handleMouseMoveLeft);
                document.removeEventListener('mouseup', handleMouseUpLeft);
                // Send layout settings to main process
                saveCurrentLayout();
            }

            // Define handlers within the scope where variables are accessible
            function handleMouseDown(e) {
                if (!resizer || !editorPane || !rightPane) return; 
                console.log('[Resize] Mouse Down on resizer');
                isResizing = true;
                startX = e.clientX;
                initialEditorWidth = editorPane.offsetWidth;
                initialRightWidth = rightPane.offsetWidth; // Need right width too
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            }
        
            function handleMouseMove(e) {
                if (!isResizing || !editorPane || !rightPane) return;
                // console.log('[Resize] Mouse Move during resize');
                const container = editorPane.parentElement;
                if (!container) return;
                const containerWidth = container.offsetWidth;

                const deltaX = e.clientX - startX;
                let newEditorPx = initialEditorWidth + deltaX;
                let newRightPx = initialRightWidth - deltaX;

                const minWidth = 150; 
                // Enforce minimum widths
                if (newEditorPx < minWidth) {
                    const diff = minWidth - newEditorPx;
                    newEditorPx = minWidth;
                    newRightPx -= diff;
                }
                if (newRightPx < minWidth) {
                    const diff = minWidth - newRightPx;
                    newRightPx = minWidth;
                    newEditorPx -= diff;
                }

                // Check boundaries again after adjustments
                if (newEditorPx < minWidth) newEditorPx = minWidth;

                // Apply the new widths directly
                console.log(`[Resize] Setting editor width: ${newEditorPx}px, right width: ${newRightPx}px`);
                editorPane.style.flex = `0 0 ${newEditorPx}px`;
                rightPane.style.flex = `0 0 ${newRightPx}px`;
                
                // Also set width for backup
                editorPane.style.width = `${newEditorPx}px`;
                rightPane.style.width = `${newRightPx}px`;

                requestAnimationFrame(() => {
                    if (editor && typeof editor.layout === 'function') {
                        editor.layout(); 
                    }
                });
            }
        
            function handleMouseUp() {
                if (!isResizing) return;
                console.log('[Resize] Mouse Up, stopping resize');
                isResizing = false;
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                // Send layout settings to main process
                saveCurrentLayout();
            }

        } catch (error) {
            console.error('[renderer.js] Failed to create Monaco editor instance:', error);
            editorContainer.innerText = 'Failed to load code editor.';
            createFallbackEditor(); 
        }
    }); 

    // --- Theme Initialization (Can stay here) ---
    // initializeTheme(); // removed, using settings-based theme only

    // Listen for theme updates from main process
    // window.electronAPI.on('theme-updated', (osIsDarkMode) => {
    //     // Skip OS updates if user has custom theme selected
    //     if (typeof appSettings.theme === 'string' && appSettings.theme !== 'auto') {
    //         console.log('[renderer.js] Skipping OS theme update due to custom theme setting:', appSettings.theme);
    //         return;
    //     }
    //     console.log('[renderer.js] Received OS theme update:', osIsDarkMode ? 'dark' : 'light');
    //     applyTheme(osIsDarkMode);
    // });
    // console.log('[renderer.js] OS theme update listener initialized.');
}

async function loadAppSettings() {
    if (!window.electronAPI) {
        console.error('[renderer.js] electronAPI not available for loading settings.');
        return;
    }
    try {
        appSettings = await window.electronAPI.invoke('get-settings');
        window.appSettings = appSettings; // Make settings globally available
        window.currentFilePath = appSettings.currentFile || null; // Set current file path globally
        console.log('[renderer.js] Loaded settings:', appSettings);
        let themeAppliedFromSettings = false;

        // 1. Apply theme based on explicit settings ('light' or 'dark')
        if (typeof appSettings.theme === 'string') {
            if (appSettings.theme === 'dark') {
                console.log('[renderer.js] Applying theme from setting: dark');
                applyTheme(true);
                themeAppliedFromSettings = true;
            } else if (appSettings.theme === 'light') {
                console.log('[renderer.js] Applying theme from setting: light');
                applyTheme(false);
                themeAppliedFromSettings = true;
            }
        }

        // 2. If no specific theme set (or set to 'auto'), check initial OS theme
        if (!themeAppliedFromSettings) {
            console.log('[renderer.js] No explicit theme in settings or theme is auto, checking initial OS theme...');
            try {
                // Assuming 'get-initial-theme' returns boolean 'isDarkMode'
                const osIsDarkMode = await window.electronAPI.invoke('get-initial-theme');
                console.log('[renderer.js] Initial OS theme is:', osIsDarkMode ? 'dark' : 'light');
                applyTheme(osIsDarkMode);
            } catch (osThemeErr) {
                console.error('[renderer.js] Failed to get initial OS theme:', osThemeErr);
                // Apply a default fallback if OS theme check fails?
                // applyTheme(false); // e.g., default to light
            }
        }

        // Apply layout settings
        applyLayoutSettings(appSettings.layout);

        // --- Restore last opened file if present ---
        if (appSettings.currentFile && typeof appSettings.currentFile === 'string' && appSettings.currentFile.length > 0) {
            console.log('[renderer.js] Attempting to reopen last file:', appSettings.currentFile);
            
            // Wait a bit for Monaco editor to be ready before loading file
            const loadFileWhenReady = () => {
                if (typeof monaco !== 'undefined' && monaco.editor) {
                    // Monaco is ready, load the file
                    window.electronAPI.invoke('open-file-path', appSettings.currentFile)
                        .then(result => {
                            console.log('[renderer.js] File loading result:', result);
                            if (result.success && result.content) {
                                console.log(`[renderer.js] Successfully loaded file content, length: ${result.content.length}`);
                                openFileInEditor(result.filePath, result.content);
                                console.log('[renderer.js] openFileInEditor called - file should now be in editor');
                            } else {
                                console.warn('[renderer.js] Could not reopen last file:', result.error);
                            }
                        })
                        .catch(err => {
                            console.error('[renderer.js] Error reopening last file:', err);
                        });
                } else {
                    // Monaco not ready yet, wait a bit more
                    console.log('[renderer.js] Monaco not ready yet, waiting...');
                    setTimeout(loadFileWhenReady, 100);
                }
            };
            
            // Start checking for Monaco readiness
            loadFileWhenReady();
        }

        // 3. NOW set up the listener for future OS changes, only once
        if (!window.electronAPI._themeListenerAttached) { // Use a flag to prevent duplicates
            window.electronAPI.on('theme-updated', (osIsDarkMode) => {
                console.log('[renderer.js] OS theme updated event received.');
                // Skip OS updates if user has an explicit 'light' or 'dark' theme selected
                if (typeof appSettings.theme === 'string' && (appSettings.theme === 'light' || appSettings.theme === 'dark')) {
                    console.log('[renderer.js] Skipping OS theme update due to explicit user setting:', appSettings.theme);
                    return;
                }
                // Apply theme based on OS update if setting is 'auto' or not set
                console.log('[renderer.js] Applying OS theme update:', osIsDarkMode ? 'dark' : 'light');
                applyTheme(osIsDarkMode);
            });
            window.electronAPI._themeListenerAttached = true; // Set flag
            console.log('[renderer.js] OS theme update listener initialized.');
        } else {
            console.log('[renderer.js] OS theme update listener already attached.');
        }

    } catch (err) {
        console.error('[renderer.js] Failed to load settings:', err);
    }
}

// Handle file opened event (e.g., from File > Open or File Tree click)
if (window.electronAPI) {
    window.electronAPI.on('file-opened', (data) => {
        console.log('[Renderer] Received file-opened event:', data);
        if (data && typeof data.content === 'string' && typeof data.filePath === 'string') {
            openFileInEditor(data.filePath, data.content);
            // Save current file to settings
            window.electronAPI.invoke('set-current-file', data.filePath);
        }
    });
}

// Helper to open file in editor
async function refreshCurrentFile() {
    if (!currentFilePath) {
        console.log('[Renderer] No current file to refresh');
        return;
    }
    
    try {
        console.log('[Renderer] Refreshing current file:', currentFilePath);
        console.log('[Renderer] Before refresh - editor content preview:', editor ? editor.getValue().substring(0, 200) : 'No editor');
        
        const result = await window.electronAPI.invoke('open-file-path', currentFilePath);
        console.log('[Renderer] Open-file result:', result.success ? 'Success' : 'Failed', result.error);
        
        if (result.success) {
            console.log('[Renderer] New file content preview:', result.content.substring(0, 200));
            
            // Preserve the current cursor position if possible
            const editor = document.querySelector('.editor textarea');
            const cursorPos = editor ? editor.selectionStart : 0;
            
            openFileInEditor(result.filePath, result.content);
            
            // Restore cursor position
            if (editor && cursorPos) {
                setTimeout(() => {
                    const newEditor = document.querySelector('.editor textarea');
                    if (newEditor) {
                        newEditor.setSelectionRange(cursorPos, cursorPos);
                    }
                }, 100);
            }
            
            console.log('[Renderer] File refreshed successfully');
            console.log('[Renderer] After refresh - editor content preview:', editor ? editor.getValue().substring(0, 200) : 'No editor');
        } else {
            console.error('[Renderer] Failed to refresh file:', result.error);
        }
    } catch (error) {
        console.error('[Renderer] Error refreshing current file:', error);
    }
}

function openFileInEditor(filePath, content) {
    console.log('[Renderer] Opening file in editor:', filePath);
    
    // Detect file type
    const isPDF = filePath.endsWith('.pdf');
    const isHTML = filePath.endsWith('.html') || filePath.endsWith('.htm');
    const isBibTeX = filePath.endsWith('.bib');
    const isMarkdown = filePath.endsWith('.md') || filePath.endsWith('.markdown');
    
    // Set current file path globally for auto-save
    window.currentFilePath = filePath;
    
    // Add to navigation history and recent files (unless we're navigating history)
    const fileName = filePath.split('/').pop();
    addToNavigationHistory(filePath, fileName);
    addFileToRecents(filePath);
    
    // Store current file directory for image path resolution
    // Extract directory from file path
    const lastSlash = filePath.lastIndexOf('/');
    window.currentFileDirectory = lastSlash >= 0 ? filePath.substring(0, lastSlash) : '';
    console.log('[Renderer] Set current file directory:', window.currentFileDirectory);
    
    // Handle PDF files
    if (isPDF) {
        handlePDFFile(filePath);
        return;
    }
    
    // Handle HTML files
    if (isHTML) {
        handleHTMLFile(filePath, content);
        return;
    }
    
    // Handle editable files (Markdown, BibTeX)
    handleEditableFile(filePath, content, { isBibTeX, isMarkdown });
}

// Handle PDF file opening
function handlePDFFile(filePath) {
    console.log('[Renderer] Handling PDF file:', filePath);
    
    // Check for associated Markdown file
    const baseName = filePath.replace(/\.pdf$/i, '');
    const associatedMdFile = baseName + '.md';
    
    // Check if associated markdown file exists
    window.electronAPI.invoke('check-file-exists', associatedMdFile)
        .then(exists => {
            if (exists) {
                console.log('[Renderer] Found associated markdown file:', associatedMdFile);
                // Load the markdown file in the editor
                return window.electronAPI.invoke('open-file-path', associatedMdFile);
            }
            return null;
        })
        .then(markdownResult => {
            if (markdownResult && markdownResult.success) {
                console.log('[Renderer] Loading associated markdown file in editor');
                handleEditableFile(associatedMdFile, markdownResult.content, { isMarkdown: true });
            } else {
                // No associated markdown, just clear the editor
                clearEditor();
            }
            
            // Display PDF in preview panel
            displayPDFInPreview(filePath);
        })
        .catch(error => {
            console.error('[Renderer] Error checking for associated markdown:', error);
            clearEditor();
            displayPDFInPreview(filePath);
        });
}

// Handle HTML file opening
function handleHTMLFile(filePath, content) {
    console.log('[Renderer] Handling HTML file:', filePath);
    
    // Check for associated Markdown file
    const baseName = filePath.replace(/\.html?$/i, '');
    const associatedMdFile = baseName + '.md';
    
    // Check if associated markdown file exists
    window.electronAPI.invoke('check-file-exists', associatedMdFile)
        .then(exists => {
            if (exists) {
                console.log('[Renderer] Found associated markdown file:', associatedMdFile);
                // Load the markdown file in the editor
                return window.electronAPI.invoke('open-file-path', associatedMdFile);
            }
            return null;
        })
        .then(markdownResult => {
            if (markdownResult && markdownResult.success) {
                console.log('[Renderer] Loading associated markdown file in editor');
                handleEditableFile(associatedMdFile, markdownResult.content, { isMarkdown: true });
            } else {
                // No associated markdown, just clear the editor
                clearEditor();
            }
            
            // Display HTML in preview panel
            displayHTMLInPreview(content, filePath);
        })
        .catch(error => {
            console.error('[Renderer] Error checking for associated markdown:', error);
            clearEditor();
            displayHTMLInPreview(content, filePath);
        });
}

// Handle editable files (Markdown, BibTeX)
function handleEditableFile(filePath, content, fileTypes) {
    console.log('[Renderer] Handling editable file:', filePath, fileTypes);
    
    // Set up internal link click handler if not already done
    if (!window.internalLinkHandlerSetup) {
        document.addEventListener('click', handleInternalLinkClick);
        window.internalLinkHandlerSetup = true;
        console.log('[Renderer] Internal link click handler set up');
    }
    
    // Set editor content and language (Monaco or fallback)
    if (editor && typeof editor.setValue === 'function') {
        editor.setValue(content);
        
        // Configure language and theme based on file type
        if (fileTypes.isBibTeX) {
            const model = editor.getModel();
            if (model) {
                monaco.editor.setModelLanguage(model, 'bibtex');
                // Apply appropriate BibTeX theme based on current theme
                const isDarkTheme = editor._themeService?.getColorTheme()?.type === 'dark' || 
                                  window.currentTheme === 'dark';
                editor.updateOptions({ theme: isDarkTheme ? 'bibtex-dark' : 'bibtex-light' });
                console.log('[Renderer] Configured editor for BibTeX file with', isDarkTheme ? 'dark' : 'light', 'theme');
            }
        } else {
            // Default to markdown for .md files and others
            const model = editor.getModel();
            if (model) {
                monaco.editor.setModelLanguage(model, 'markdown');
                editor.updateOptions({ theme: window.currentTheme === 'dark' ? 'vs-dark' : 'vs' });
            }
        }
    } else if (fallbackEditor) {
        fallbackEditor.value = content;
    }
    
    // Update last saved content for auto-save tracking
    lastSavedContent = content;
    hasUnsavedChanges = false;
    updateUnsavedIndicator(false);
    
    // Update preview and structure
    updatePreviewAndStructure(content);
    
    // Sync content to presentation view (if available)
    if (window.syncContentToPresentation) {
        console.log('[Renderer] Syncing file content to presentation view');
        window.syncContentToPresentation(content);
    }
    
    // Save current file to settings (redundant, but ensures consistency)
    window.electronAPI.invoke('set-current-file', filePath);
}

// Clear the editor
function clearEditor() {
    console.log('[Renderer] Clearing editor for non-editable file');
    if (editor && typeof editor.setValue === 'function') {
        editor.setValue('# File Preview\n\nThis file is displayed in the preview panel.');
    } else if (fallbackEditor) {
        fallbackEditor.value = '# File Preview\n\nThis file is displayed in the preview panel.';
    }
    lastSavedContent = '';
    hasUnsavedChanges = false;
    updateUnsavedIndicator(false);
}

// Display PDF in preview panel
function displayPDFInPreview(filePath) {
    console.log('[Renderer] Displaying PDF in preview:', filePath);
    const previewContent = document.getElementById('preview-content');
    
    if (previewContent) {
        // Create PDF viewer using HTML5 embed or iframe
        const pdfViewer = `
            <div class="pdf-preview-container" style="width: 100%; height: 100vh; display: flex; flex-direction: column; position: absolute; top: 0; left: 0; right: 0; bottom: 0;">
                <div class="pdf-header" style="padding: 8px 12px; background: var(--preview-bg-color, #f8f9fa); border-bottom: 1px solid var(--border-color, #e1e4e8); font-weight: bold; flex-shrink: 0; font-size: 14px;">
                    📄 ${filePath.split('/').pop()}
                </div>
                <div style="flex: 1; position: relative; overflow: hidden; min-height: 0;">
                    <embed src="file://${filePath}" type="application/pdf" width="100%" height="100%" style="border: none; display: block;">
                    <div class="pdf-fallback" style="display: none; padding: 20px; text-align: center; color: #666;">
                        <p>📄 PDF preview not available</p>
                        <p><small>Path: ${filePath}</small></p>
                        <button onclick="window.electronAPI.invoke('open-external', '${filePath}')" style="margin-top: 10px; padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;">Open in External Viewer</button>
                    </div>
                </div>
            </div>
        `;
        
        previewContent.innerHTML = pdfViewer;
        
        // Handle PDF load errors
        const embed = previewContent.querySelector('embed');
        if (embed) {
            embed.onerror = () => {
                console.warn('[Renderer] PDF embed failed, showing fallback');
                embed.style.display = 'none';
                previewContent.querySelector('.pdf-fallback').style.display = 'block';
            };
        }
    }
}

// Display HTML in preview panel
function displayHTMLInPreview(htmlContent, filePath) {
    console.log('[Renderer] Displaying HTML in preview:', filePath);
    const previewContent = document.getElementById('preview-content');
    
    if (previewContent) {
        // Create HTML preview with safety measures
        const htmlViewer = `
            <div class="html-preview-container" style="width: 100%; height: 100vh; display: flex; flex-direction: column; position: absolute; top: 0; left: 0; right: 0; bottom: 0;">
                <div class="html-header" style="padding: 8px 12px; background: var(--preview-bg-color, #f8f9fa); border-bottom: 1px solid var(--border-color, #e1e4e8); font-weight: bold; flex-shrink: 0; font-size: 14px;">
                    🌐 ${filePath.split('/').pop()}
                </div>
                <div style="flex: 1; overflow: hidden; position: relative; min-height: 0;">
                    <iframe srcdoc="${htmlContent.replace(/"/g, '&quot;')}" 
                            style="width: 100%; height: 100%; border: 1px solid var(--border-color, #e1e4e8); border-radius: 4px; display: block;"
                            sandbox="allow-scripts allow-same-origin">
                    </iframe>
                </div>
            </div>
        `;
        
        previewContent.innerHTML = htmlViewer;
    }
}

// Update cursor position for fallback textarea editor
function updateFallbackCursorPosition() {
    const textarea = document.getElementById('fallback-editor');
    const cursorPosEl = document.getElementById('cursor-position');
    
    if (!textarea || !cursorPosEl) return;
    
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = textarea.value.substring(0, cursorPos);
    const lines = textBeforeCursor.split('\n');
    const lineNumber = lines.length;
    const columnNumber = lines[lines.length - 1].length + 1;
    
    cursorPosEl.textContent = `Ln ${lineNumber}, Col ${columnNumber}`;
}

// Fallback editor in case Monaco fails to load
function createFallbackEditor() {
    console.log('[renderer.js] Creating fallback textarea editor...');
    const textarea = document.createElement('textarea');
    textarea.value = '# Welcome!\n\nStart typing your Markdown here.';
    textarea.style.width = '100%';
    textarea.style.height = '100%';
    textarea.style.padding = '8px';
    textarea.style.border = 'none';
    textarea.style.resize = 'none';
    textarea.style.fontFamily = 'monospace';
    editorContainer.innerHTML = '';
    editorContainer.appendChild(textarea);
    updatePreviewAndStructure(textarea.value);
    textarea.addEventListener('input', () => {
        updatePreviewAndStructure(textarea.value);
    });
    
    // Update cursor position for fallback editor
    textarea.addEventListener('selectionchange', updateFallbackCursorPosition);
    textarea.addEventListener('keyup', updateFallbackCursorPosition);
    textarea.addEventListener('mouseup', updateFallbackCursorPosition);
    
    console.log('[renderer.js] Fallback editor created and initialized.');
}

// --- Global Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
    // Only handle shortcuts when not in input fields (except find/replace inputs)
    const isInInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
    const isInFindReplace = e.target === findInput || e.target === replaceInput;
    
    // Ctrl+F or Cmd+F: Open Find dialog
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        showFindReplaceDialog(false);
        return;
    }
    
    // Ctrl+H or Cmd+H: Open Find & Replace dialog
    if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        showFindReplaceDialog(true);
        return;
    }
    
    // Ctrl+Shift+F or Cmd+Shift+F: Open Global Search
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        showRightPane('search');
        if (globalSearchInput) {
            globalSearchInput.focus();
        }
        return;
    }
    
    // Markdown formatting shortcuts
    // Ctrl+B or Cmd+B: Bold
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        formatText('**', '**', 'bold text');
        return;
    }
    
    // Ctrl+I or Cmd+I: Italic
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        formatText('*', '*', 'italic text');
        return;
    }
    
    // Ctrl+` or Cmd+`: Inline code
    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        formatText('`', '`', 'code');
        return;
    }
    
    // Ctrl+K or Cmd+K: Insert link
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        insertLink();
        return;
    }
    
    // F3: Find Next (when find dialog is open or when not in input)
    if (e.key === 'F3' && (!isInInput || isInFindReplace)) {
        e.preventDefault();
        if (e.shiftKey) {
            findPreviousMatch();
        } else {
            findNextMatch();
        }
        return;
    }
    
    // Escape: Close find dialog (global)
    if (e.key === 'Escape' && !findReplaceDialog.classList.contains('hidden')) {
        hideFindReplaceDialog();
        return;
    }
});

// Wait for the DOM to be fully loaded before trying to initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[renderer.js] DOM fully loaded and parsed.');
    // Load settings before initializing the rest of the app
    await loadAppSettings();
    // Since Marked script has 'defer', it should be loaded and executed before DOMContentLoaded.
    // Let's check if window.marked exists now.
    if (window.marked) {
        console.log('[renderer.js] window.marked found after DOMContentLoaded.');
        markedInstance = window.marked; // Assign the globally loaded instance
        markedInstance.setOptions({
            breaks: true,
            gfm: true,
            headerIds: false,
            mangle: false
        });
        console.log('[renderer.js] Marked instance configured.');
        applyLayoutSettings(appSettings.layout); // Apply saved layout settings
        initializeApp(); // Initialize now that Marked is ready and DOM is loaded
        setupNavigationControls(); // Setup navigation buttons and keyboard shortcuts
        
        // Initialize file tree view on startup
        console.log('[renderer.js] Initializing file tree view on startup');
        switchStructureView('file'); // Switch to file view
        renderFileTree(); // Load the file tree
    } else {
        // If Marked is still not loaded here, there's a problem with the script tag or network.
        console.error('[renderer.js] CRITICAL: window.marked not found after DOMContentLoaded. Check Marked script tag in index.html and network connection.');
        // Optionally, initialize with a fallback or show an error message.
        // For now, we might still attempt init, but preview will fail.
        // initializeApp(); // Or maybe prevent init entirely?
        // Or create fallback:
        // createFallbackEditor(); // (Already called above, perhaps move that call here?)
    }
});

// --- Apply Layout Settings Function ---
function applyLayoutSettings(layout) {
    console.log('[renderer.js] Applying layout settings:', layout);
    
    // Check if we're in editor mode before applying layout
    const editorContent = document.getElementById('editor-content');
    if (!editorContent || !editorContent.classList.contains('active')) {
        console.log('[renderer.js] Not in editor mode, skipping layout application.');
        return;
    }
    
    const leftSidebar = document.getElementById('left-sidebar');
    const editorPane = document.getElementById('editor-pane');
    const rightPane = document.getElementById('right-pane');
    const container = editorContent; // Use editor content as container

    if (!leftSidebar || !editorPane || !rightPane) {
        console.error('[renderer.js] Cannot apply layout: one or more pane elements not found in editor mode.');
        return;
    }

    // Use default layout if settings are invalid or missing
    const defaultLayout = { structureWidth: '20%', editorWidth: '50%', rightWidth: '30%' };
    const effectiveLayout = {
        structureWidth: layout?.structureWidth || defaultLayout.structureWidth,
        editorWidth: layout?.editorWidth || defaultLayout.editorWidth,
        rightWidth: layout?.rightWidth || defaultLayout.rightWidth
    };

    // Basic validation: ensure they look like percentages
    const isValid = (val) => typeof val === 'string' && /^\d+(\.\d+)?%$/.test(val);

    if (isValid(effectiveLayout.structureWidth) && 
        isValid(effectiveLayout.editorWidth) && 
        isValid(effectiveLayout.rightWidth)) {

        // Ensure percentages roughly add up to 100% (allow for minor rounding)
        const totalPercent = parseFloat(effectiveLayout.structureWidth) + 
                             parseFloat(effectiveLayout.editorWidth) + 
                             parseFloat(effectiveLayout.rightWidth);

        if (totalPercent < 98 || totalPercent > 102) {
            console.warn(`[renderer.js] Layout percentages (${totalPercent}%) do not add up near 100%. Using defaults.`);
            leftSidebar.style.flex = `0 0 ${defaultLayout.structureWidth}`;
            editorPane.style.flex = `0 0 ${defaultLayout.editorWidth}`;
            rightPane.style.flex = `0 0 ${defaultLayout.rightWidth}`;
        } else {
            console.log('[renderer.js] Applying valid layout:', effectiveLayout);
            leftSidebar.style.flex = `0 0 ${effectiveLayout.structureWidth}`;
            editorPane.style.flex = `0 0 ${effectiveLayout.editorWidth}`;
            rightPane.style.flex = `0 0 ${effectiveLayout.rightWidth}`;
        }
    } else {
        console.warn('[renderer.js] Invalid layout format found in settings. Using defaults.');
        leftSidebar.style.flex = `0 0 ${defaultLayout.structureWidth}`;
        editorPane.style.flex = `0 0 ${defaultLayout.editorWidth}`;
        rightPane.style.flex = `0 0 ${defaultLayout.rightWidth}`;
    }
}

// --- Settings Management ---
let appSettings = {};


// --- Structure/File Pane Toggle Listeners ---
let currentStructureView = 'file'; // 'structure' or 'file' - default to files

showStructureBtn.addEventListener('click', () => {
    if (currentStructureView !== 'structure') {
        switchStructureView('structure');
    }
});

showFilesBtn.addEventListener('click', () => {
    if (currentStructureView !== 'file') {
        switchStructureView('file');
    }
});

// --- New Folder Button Listener ---
newFolderBtn.addEventListener('click', async () => {
    console.log('[Renderer] New Folder button clicked');
    await createNewFolder();
});

// --- Change Directory Button Listener ---
changeDirectoryBtn.addEventListener('click', async () => {
    console.log('[Renderer] Change Directory button clicked');
    try {
        const result = await window.electronAPI.invoke('change-working-directory');
        if (result.success) {
            showNotification(`Working directory changed`, 'success');
            // Refresh file tree to show new directory contents
            renderFileTree();
        } else if (!result.error.includes('cancelled')) {
            showNotification(result.error, 'error');
        }
    } catch (error) {
        console.error('[Renderer] Error changing directory:', error);
        showNotification('Error changing working directory', 'error');
    }
});

// --- Find & Replace Event Listeners ---
findReplaceClose.addEventListener('click', hideFindReplaceDialog);

// Button event listeners
findNext.addEventListener('click', findNextMatch);
findPrevious.addEventListener('click', findPreviousMatch);
replaceCurrent.addEventListener('click', replaceCurrentMatch);
replaceAll.addEventListener('click', replaceAllMatches);

// Input event listeners
findInput.addEventListener('input', performSearch);
findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
            findPreviousMatch();
        } else {
            findNextMatch();
        }
    } else if (e.key === 'Escape') {
        hideFindReplaceDialog();
    }
});

replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        replaceCurrentMatch();
    } else if (e.key === 'Escape') {
        hideFindReplaceDialog();
    }
});

// Option change listeners
caseSensitive.addEventListener('change', performSearch);
regexMode.addEventListener('change', performSearch);
wholeWord.addEventListener('change', performSearch);

// --- Folder Name Modal Event Listeners ---
folderNameCancel.addEventListener('click', hideFolderNameModal);
folderNameCreate.addEventListener('click', handleCreateFolder);

// Handle Enter key in folder name input
folderNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleCreateFolder();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        hideFolderNameModal();
    }
});

// Hide modal when clicking on backdrop
folderNameModal.addEventListener('click', (e) => {
    if (e.target === folderNameModal) {
        hideFolderNameModal();
    }
});

// Clear validation error when typing
folderNameInput.addEventListener('input', () => {
    if (folderNameError.style.display !== 'none') {
        hideFolderNameError();
    }
});

// --- Right Pane Toggle Listeners (Updated to use unified function) ---
showPreviewBtn.addEventListener('click', () => {
    showRightPane('preview');
});

showChatBtn.addEventListener('click', () => {
    showRightPane('chat');
});

// --- Right Pane Switching Function ---
function showRightPane(paneType) {
    // Hide all content panes
    if (previewPane) previewPane.style.display = 'none';
    if (chatPane) chatPane.style.display = 'none';
    if (searchPane) searchPane.style.display = 'none';
    if (speakerNotesPane) speakerNotesPane.style.display = 'none';
    
    // Remove active state from all toggle buttons
    if (showPreviewBtn) showPreviewBtn.classList.remove('active');
    if (showChatBtn) showChatBtn.classList.remove('active');
    if (showSearchBtn) showSearchBtn.classList.remove('active');
    if (showSpeakerNotesBtn) showSpeakerNotesBtn.classList.remove('active');
    
    // Show the requested pane and activate its button
    switch (paneType) {
        case 'preview':
            if (previewPane) previewPane.style.display = '';
            if (showPreviewBtn) showPreviewBtn.classList.add('active');
            break;
        case 'chat':
            if (chatPane) chatPane.style.display = '';
            if (showChatBtn) showChatBtn.classList.add('active');
            break;
        case 'search':
            if (searchPane) searchPane.style.display = '';
            if (showSearchBtn) showSearchBtn.classList.add('active');
            break;
        case 'speaker-notes':
            if (speakerNotesPane) speakerNotesPane.style.display = '';
            if (showSpeakerNotesBtn) showSpeakerNotesBtn.classList.add('active');
            // Update speaker notes content when pane is shown
            updateSpeakerNotesDisplay();
            break;
        default:
            // Default to preview if unknown pane type
            if (previewPane) previewPane.style.display = '';
            if (showPreviewBtn) showPreviewBtn.classList.add('active');
            break;
    }
}

// --- Structure Pane / File Tree Functions ---

/**
 * Switches the view in the structure pane between 'structure' and 'file'.
 * @param {'structure' | 'file'} view - The view to switch to.
 */
function switchStructureView(view) {
    currentStructureView = view;
    if (view === 'structure') {
        structurePaneTitle.textContent = 'Structure';
        showStructureBtn.classList.add('active');
        showFilesBtn.classList.remove('active');
        structureList.style.display = ''; // Show structure list
        fileTreeView.style.display = 'none'; // Hide file tree
        newFolderBtn.style.display = 'none'; // Hide New Folder button
        changeDirectoryBtn.style.display = 'none'; // Hide Change Directory button
        // Optionally, re-run structure update if needed
        // updateStructurePane(editor?.getValue() || '');
    } else { // view === 'file'
        structurePaneTitle.textContent = 'Files';
        showStructureBtn.classList.remove('active');
        showFilesBtn.classList.add('active');
        structureList.style.display = 'none'; // Hide structure list
        fileTreeView.style.display = ''; // Show file tree
        newFolderBtn.style.display = ''; // Show New Folder button
        changeDirectoryBtn.style.display = ''; // Show Change Directory button
        renderFileTree(); // Populate the file tree view
    }
}

// --- Folder Name Modal Functions ---
function showFolderNameModal() {
    folderNameModal.classList.remove('hidden');
    folderNameInput.value = '';
    folderNameError.style.display = 'none';
    folderNameInput.focus();
}

function hideFolderNameModal() {
    folderNameModal.classList.add('hidden');
}

function validateFolderName(name) {
    if (!name || name.trim() === '') {
        return 'Folder name cannot be empty.';
    }
    
    const trimmedName = name.trim();
    
    if (!/^[a-zA-Z0-9_\-\s]+$/.test(trimmedName)) {
        return 'Folder name can only contain letters, numbers, spaces, hyphens, and underscores.';
    }
    
    return null; // Valid
}

function showFolderNameError(message) {
    folderNameError.textContent = message;
    folderNameError.style.display = 'block';
    folderNameInput.style.borderColor = '#dc3545';
}

function hideFolderNameError() {
    folderNameError.style.display = 'none';
    folderNameInput.style.borderColor = '#ddd';
}

// --- Create New Folder Function ---
async function createNewFolder() {
    showFolderNameModal();
}

async function handleCreateFolder() {
    const folderName = folderNameInput.value;
    
    // Validate folder name
    const validationError = validateFolderName(folderName);
    if (validationError) {
        showFolderNameError(validationError);
        return;
    }
    
    hideFolderNameError();
    const trimmedName = folderName.trim();
    
    try {
        console.log(`[Renderer] Creating new folder: ${trimmedName}`);
        
        // Send request to main process to create folder
        const result = await window.electronAPI.invoke('create-folder', trimmedName);
        
        if (result.success) {
            console.log(`[Renderer] Folder created successfully: ${result.folderPath}`);
            hideFolderNameModal();
            // Refresh the file tree to show the new folder
            renderFileTree();
            showNotification('Folder created successfully', 'success');
        } else {
            console.error(`[Renderer] Error creating folder: ${result.error}`);
            showFolderNameError(result.error);
        }
    } catch (error) {
        console.error('[Renderer] Error in handleCreateFolder:', error);
        showFolderNameError('Failed to create folder. Please try again.');
    }
}

// --- Find & Replace Functionality ---
let currentSearchResults = [];
let currentSearchIndex = -1;
let currentDecorations = [];

function showFindReplaceDialog(showReplace = false) {
    findReplaceDialog.classList.remove('hidden');
    
    // Show/hide replace field
    const replaceField = replaceInput.closest('.find-replace-field');
    if (showReplace) {
        replaceField.style.display = 'block';
    } else {
        replaceField.style.display = 'none';
    }
    
    // Focus find input and select current selection if any
    findInput.focus();
    
    if (editor && editor.getModel()) {
        const selection = editor.getSelection();
        if (selection && !selection.isEmpty()) {
            const selectedText = editor.getModel().getValueInRange(selection);
            findInput.value = selectedText;
        }
    }
}

function hideFindReplaceDialog() {
    findReplaceDialog.classList.add('hidden');
    clearSearchHighlights();
    // Return focus to editor
    if (editor) {
        editor.focus();
    }
}

function buildSearchQuery() {
    const query = findInput.value;
    if (!query) return null;
    
    let flags = 'g';
    if (!caseSensitive.checked) {
        flags += 'i';
    }
    
    let pattern = query;
    if (regexMode.checked) {
        try {
            return new RegExp(pattern, flags);
        } catch (e) {
            console.warn('Invalid regex pattern:', pattern);
            return null;
        }
    } else {
        // Escape special regex characters for literal search
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        if (wholeWord.checked) {
            pattern = '\\b' + pattern + '\\b';
        }
        
        return new RegExp(pattern, flags);
    }
}

function performSearch() {
    if (!editor || !editor.getModel()) {
        return;
    }
    
    const regex = buildSearchQuery();
    if (!regex) {
        clearSearchHighlights();
        updateSearchStats(0, -1);
        return;
    }
    
    const model = editor.getModel();
    const text = model.getValue();
    
    // Find all matches
    currentSearchResults = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        const startPos = model.getPositionAt(match.index);
        const endPos = model.getPositionAt(match.index + match[0].length);
        
        currentSearchResults.push({
            range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
            text: match[0]
        });
        
        // Prevent infinite loop for zero-length matches
        if (match[0].length === 0) {
            regex.lastIndex = match.index + 1;
        }
    }
    
    // Highlight all matches
    highlightSearchResults();
    
    // Update stats
    updateSearchStats(currentSearchResults.length, currentSearchIndex);
    
    // Move to first result if any
    if (currentSearchResults.length > 0) {
        currentSearchIndex = 0;
        goToSearchResult(currentSearchIndex);
    } else {
        currentSearchIndex = -1;
    }
}

function highlightSearchResults() {
    if (!editor || !editor.getModel()) {
        return;
    }
    
    // Clear previous decorations
    clearSearchHighlights();
    
    if (currentSearchResults.length === 0) {
        return;
    }
    
    // Create decorations for all matches
    const decorations = currentSearchResults.map((result, index) => ({
        range: result.range,
        options: {
            className: index === currentSearchIndex ? 'findMatch currentFindMatch' : 'findMatch',
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
    }));
    
    currentDecorations = editor.deltaDecorations(currentDecorations, decorations);
}

function clearSearchHighlights() {
    if (editor && currentDecorations.length > 0) {
        currentDecorations = editor.deltaDecorations(currentDecorations, []);
    }
}

function updateSearchStats(totalResults, currentIndex) {
    if (totalResults === 0) {
        findReplaceStats.textContent = 'No results';
    } else {
        findReplaceStats.textContent = `${currentIndex + 1} of ${totalResults}`;
    }
}

function goToSearchResult(index) {
    if (!editor || index < 0 || index >= currentSearchResults.length) {
        return;
    }
    
    const result = currentSearchResults[index];
    editor.setSelection(result.range);
    editor.revealRangeInCenter(result.range);
    
    // Update current index and re-highlight
    currentSearchIndex = index;
    highlightSearchResults();
    updateSearchStats(currentSearchResults.length, currentSearchIndex);
}

function findNextMatch() {
    if (currentSearchResults.length === 0) {
        performSearch();
        return;
    }
    
    let nextIndex = currentSearchIndex + 1;
    if (nextIndex >= currentSearchResults.length) {
        nextIndex = 0; // Wrap around
    }
    
    goToSearchResult(nextIndex);
}

function findPreviousMatch() {
    if (currentSearchResults.length === 0) {
        performSearch();
        return;
    }
    
    let prevIndex = currentSearchIndex - 1;
    if (prevIndex < 0) {
        prevIndex = currentSearchResults.length - 1; // Wrap around
    }
    
    goToSearchResult(prevIndex);
}

function replaceCurrentMatch() {
    if (!editor || currentSearchIndex < 0 || currentSearchIndex >= currentSearchResults.length) {
        return;
    }
    
    const replacement = replaceInput.value;
    const currentResult = currentSearchResults[currentSearchIndex];
    
    // Replace the text
    editor.executeEdits('find-replace', [{
        range: currentResult.range,
        text: replacement
    }]);
    
    // Re-search to update results
    setTimeout(() => {
        performSearch();
    }, 10);
}

function replaceAllMatches() {
    if (!editor || currentSearchResults.length === 0) {
        return;
    }
    
    const replacement = replaceInput.value;
    
    // Replace all matches in reverse order to maintain positions
    const edits = currentSearchResults.reverse().map(result => ({
        range: result.range,
        text: replacement
    }));
    
    editor.executeEdits('find-replace-all', edits);
    
    // Clear results and re-search
    currentSearchResults = [];
    currentSearchIndex = -1;
    clearSearchHighlights();
    
    setTimeout(() => {
        performSearch();
    }, 10);
}

/**
 * Requests file tree data from main process and renders it.
 */
async function renderFileTree() {
    fileTreeView.innerHTML = '<p>Loading file tree...</p>'; // Placeholder
    console.log('[Renderer] Requesting file tree data from main process...');
    try {
        // Request data from main process using the exposed invoke function
        const treeData = await window.electronAPI.invoke('request-file-tree');
        console.log('[Renderer] Received file tree data:', treeData);

        fileTreeView.innerHTML = ''; // Clear loading message
        if (treeData && treeData.children) {
            const treeElement = buildTreeHtml(treeData); // Build from the root object
            if (treeElement) {
                fileTreeView.appendChild(treeElement);
            } else {
                fileTreeView.innerHTML = '<p>Could not build file tree.</p>';
            }
        } else {
            fileTreeView.innerHTML = '<p>No files or folders found, or error loading.</p>';
        }
    } catch (error) {
        console.error('[Renderer] Error requesting/rendering file tree:', error);
        fileTreeView.innerHTML = `<p>Error loading file tree: ${error.message}</p>`;
    }
}

/**
 * Refreshes the contents of a specific folder in the file tree.
 * @param {string} folderPath - The path of the folder to refresh
 * @param {HTMLElement} childrenList - The UL element containing the folder's children
 */
async function refreshFolderContents(folderPath, childrenList) {
    console.log(`[Renderer] Refreshing folder contents: ${folderPath}`);
    
    try {
        // Add a loading indicator
        childrenList.innerHTML = '<li style="color: #999; font-style: italic;">Refreshing...</li>';
        
        // Request updated file tree for the specific folder
        const updatedTree = await window.electronAPI.invoke('request-file-tree');
        
        if (updatedTree && updatedTree.children) {
            // Find the specific folder node in the updated tree
            const folderNode = findNodeByPath(updatedTree, folderPath);
            
            if (folderNode && folderNode.children) {
                // Clear the children list
                childrenList.innerHTML = '';
                
                // Rebuild the folder's children
                folderNode.children.forEach(childNode => {
                    const childElement = buildTreeHtml(childNode);
                    if (childElement) {
                        if (childElement instanceof DocumentFragment) {
                            childrenList.appendChild(childElement);
                        } else {
                            childrenList.appendChild(childElement);
                        }
                    }
                });
                
                console.log(`[Renderer] Successfully refreshed folder: ${folderPath} with ${folderNode.children.length} items`);
            } else {
                childrenList.innerHTML = '<li style="color: #999;">Empty folder</li>';
                console.log(`[Renderer] Folder is empty or not found: ${folderPath}`);
            }
        } else {
            childrenList.innerHTML = '<li style="color: #ff6b6b;">Error refreshing folder</li>';
            console.error('[Renderer] Failed to get updated file tree data');
        }
    } catch (error) {
        console.error(`[Renderer] Error refreshing folder ${folderPath}:`, error);
        childrenList.innerHTML = '<li style="color: #ff6b6b;">Error refreshing folder</li>';
    }
}

/**
 * Recursively searches for a node with the specified path in the file tree.
 * @param {object} node - The current node to search
 * @param {string} targetPath - The path to search for
 * @returns {object|null} The found node or null
 */
function findNodeByPath(node, targetPath) {
    if (!node) return null;
    
    // Check if this node matches the target path
    if (node.path === targetPath) {
        return node;
    }
    
    // Recursively search children
    if (node.children) {
        for (const child of node.children) {
            const found = findNodeByPath(child, targetPath);
            if (found) return found;
        }
    }
    
    return null;
}

/**
 * Recursively builds the HTML UL/LI structure for the file tree.
 * @param {object} node - The current node (file or folder) in the tree data.
 * @returns {HTMLElement | DocumentFragment | null} The generated UL/LI element or a fragment containing multiple elements.
 */
function buildTreeHtml(node) {
    if (!node) return null;

    if (node.type === 'folder') {
        const childrenUl = document.createElement('ul');
        childrenUl.classList.add('file-tree-children'); // Add class to children UL for specific styling

        // Special handling for the root node representation
        if (node.isRoot) {
            childrenUl.classList.add('file-tree-root');
            // Process children and append to the root UL
            if (node.children && node.children.length > 0) {
                node.children.forEach(childNode => {
                    const childElement = buildTreeHtml(childNode);
                    if (childElement) {
                        // If childElement is a fragment (folder+children), append its contents
                        if (childElement instanceof DocumentFragment) {
                             childrenUl.appendChild(childElement);
                        } else {
                             childrenUl.appendChild(childElement); // Append file LI
                        }
                    }
                });
            }
            return childrenUl; // Return only the root UL containing everything
        } else {
            // Non-root folder: Create the LI for the folder itself
            const folderLi = document.createElement('li');
            folderLi.classList.add('folder');
            folderLi.textContent = `📂 ${node.name}`; // Use open folder icon since expanded by default
            folderLi.dataset.path = node.path; // Store path if needed later
            folderLi.draggable = true; // Make folders draggable

            // Process children and append to the children UL
            if (node.children && node.children.length > 0) {
                node.children.forEach(childNode => {
                    const childElement = buildTreeHtml(childNode);
                     if (childElement) {
                        // If childElement is a fragment (folder+children), append its contents
                        if (childElement instanceof DocumentFragment) {
                             childrenUl.appendChild(childElement);
                        } else {
                             childrenUl.appendChild(childElement); // Append file LI
                        }
                    }
                });
            }

            // Show children UL by default (expanded folders)
            childrenUl.style.display = '';

            // Create a fragment to hold both the folder LI and its children UL as siblings
            const fragment = document.createDocumentFragment();
            fragment.appendChild(folderLi);
            fragment.appendChild(childrenUl);
            return fragment; // Return the fragment
        }

    } else if (node.type === 'file') {
        const li = document.createElement('li');
        li.classList.add('file');
        li.textContent = `📄 ${node.name}`; // Simple file indicator
        li.dataset.path = node.path; // Store the full path for opening
        li.draggable = true; // Make files draggable
        return li;
    }

    return null; // Should not happen with valid data
}

// Add event listener to the file tree container for delegation
fileTreeView.addEventListener('click', (event) => {
    const target = event.target;

    // Check if a file was clicked
    if (target.classList.contains('file') && target.dataset.path) {
        const filePath = target.dataset.path;
        console.log(`[Renderer] File clicked: ${filePath}`);
        // Send request to main process to open this file
        // Use invoke since main process uses ipcMain.handle
        window.electronAPI.invoke('open-file-path', filePath)
          .then(result => {
            if (result.success) {
                console.log('[Renderer] File opened successfully:', result.filePath);
                openFileInEditor(result.filePath, result.content);
            } else {
                console.error('[Renderer] Main process reported error opening file:', result.error);
                // Optionally show an error to the user via UI element
            }
          })
          .catch(err => {
            console.error('[Renderer] Error invoking open-file-path:', err);
            // Optionally show an error to the user
          });
    }
    // Check if a folder was clicked (specifically the text part, not the nested UL)
    else if (target.classList.contains('folder')) {
         // Find the next sibling UL (which contains the children)
         const childrenList = target.nextElementSibling;
         if (childrenList && childrenList.tagName === 'UL' && childrenList.classList.contains('file-tree-children')) { 
                   // Toggle visibility
                   const isVisible = childrenList.style.display !== 'none';
                   
                   if (isVisible) {
                       // Collapsing - just hide
                       childrenList.style.display = 'none';
                       target.textContent = `📁 ${target.textContent.substring(2)}`;
                   } else {
                       // Expanding - refresh contents and show
                       childrenList.style.display = '';
                       target.textContent = `📂 ${target.textContent.substring(2)}`;
                       
                       // Refresh folder contents when expanding
                       const folderPath = target.dataset.path;
                       if (folderPath) {
                           refreshFolderContents(folderPath, childrenList);
                       }
                   }
         }
    }
});

// Global variables for cut/copy operations
let clipboardItem = null; // { type: 'file'|'folder', path: string, operation: 'cut'|'copy' }

// Add right-click context menu for file and folder management
fileTreeView.addEventListener('contextmenu', (event) => {
    const target = event.target;
    
    // Show context menu for both files and folders
    if ((target.classList.contains('file') || target.classList.contains('folder')) && target.dataset.path) {
        event.preventDefault(); // Prevent default context menu
        
        const itemPath = target.dataset.path;
        const isFile = target.classList.contains('file');
        const isFolder = target.classList.contains('folder');
        const itemName = target.textContent.substring(2); // Remove the emoji
        
        // Create context menu
        const contextMenu = createContextMenu(event.pageX, event.pageY);
        
        // Add menu items based on item type
        if (isFile) {
            addMenuItem(contextMenu, 'Cut File', '✂️', () => handleCutCopy(itemPath, 'file', 'cut'));
            addMenuItem(contextMenu, 'Copy File', '📋', () => handleCutCopy(itemPath, 'file', 'copy'));
            addMenuSeparator(contextMenu);
            addMenuItem(contextMenu, 'Delete File', '🗑️', () => handleDelete(itemPath, 'file', itemName), '#dc3545');
        } else if (isFolder) {
            addMenuItem(contextMenu, 'Cut Folder', '✂️', () => handleCutCopy(itemPath, 'folder', 'cut'));
            addMenuItem(contextMenu, 'Copy Folder', '📋', () => handleCutCopy(itemPath, 'folder', 'copy'));
            addMenuSeparator(contextMenu);
            if (clipboardItem) {
                addMenuItem(contextMenu, `Paste ${clipboardItem.type}`, '📁', () => handlePaste(itemPath));
            }
            addMenuSeparator(contextMenu);
            addMenuItem(contextMenu, 'Delete Folder', '🗑️', () => handleDelete(itemPath, 'folder', itemName), '#dc3545');
        }
        
        document.body.appendChild(contextMenu);
        
        // Remove context menu when clicking elsewhere
        const removeContextMenu = (e) => {
            if (contextMenu && !contextMenu.contains(e.target)) {
                document.body.removeChild(contextMenu);
                document.removeEventListener('click', removeContextMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', removeContextMenu);
        }, 100);
    }
});

function createContextMenu(x, y) {
    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.cssText = `
        position: fixed;
        background: var(--bg-color, white);
        color: var(--text-color, black);
        border: 1px solid var(--border-color, #ccc);
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        padding: 4px 0;
        min-width: 160px;
        font-size: 14px;
        left: ${x}px;
        top: ${y}px;
    `;
    return contextMenu;
}

function addMenuItem(menu, text, icon, onClick, color = null) {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    item.innerHTML = `${icon} ${text}`;
    item.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        ${color ? `color: ${color};` : ''}
    `;
    
    item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = 'var(--hover-color, #f8f9fa)';
    });
    
    item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = '';
    });
    
    item.addEventListener('click', () => {
        onClick();
        document.body.removeChild(menu);
    });
    
    menu.appendChild(item);
}

function addMenuSeparator(menu) {
    const separator = document.createElement('div');
    separator.style.cssText = `
        height: 1px;
        background: var(--border-color, #e9ecef);
        margin: 4px 0;
    `;
    menu.appendChild(separator);
}

async function handleCutCopy(path, type, operation) {
    clipboardItem = { path, type, operation };
    console.log(`[Renderer] ${operation} ${type}:`, path);
    
    // Visual feedback - could add styling to show cut items
    if (operation === 'cut') {
        const element = document.querySelector(`[data-path="${path}"]`);
        if (element) {
            element.style.opacity = '0.5';
        }
    }
}

async function handlePaste(targetFolderPath) {
    if (!clipboardItem) return;
    
    try {
        const result = await window.electronAPI.invoke('move-item', {
            sourcePath: clipboardItem.path,
            targetPath: targetFolderPath,
            operation: clipboardItem.operation,
            type: clipboardItem.type
        });
        
        if (result.success) {
            console.log(`[Renderer] ${clipboardItem.operation} completed successfully`);
            
            // Clear clipboard if it was a cut operation
            if (clipboardItem.operation === 'cut') {
                clipboardItem = null;
            }
            
            renderFileTree();
        } else {
            console.error('[Renderer] Error moving item:', result.error);
            showNotification(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('[Renderer] Error moving item:', error);
        showNotification('Error moving item', 'error');
    }
}

async function handleDelete(path, type, name) {
    try {
        const result = await window.electronAPI.invoke('delete-item', {
            path: path,
            type: type,
            name: name
        });
        
        if (result.success) {
            console.log(`[Renderer] ${type} deleted successfully:`, path);
            renderFileTree();
            showNotification(`${type === 'file' ? 'File' : 'Folder'} deleted successfully`, 'success');
        } else {
            console.error(`[Renderer] Error deleting ${type}:`, result.error);
            showNotification(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error(`[Renderer] Error deleting ${type}:`, error);
        showNotification(`Error deleting ${type}`, 'error');
    }
}

function showNotification(message, type = 'info', timeout = 3000) {
    // Create a simple notification
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 16px;
        background: ${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#007bff'};
        color: white;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        z-index: 2000;
        font-size: 14px;
        max-width: 300px;
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after specified timeout
    setTimeout(() => {
        if (notification.parentNode) {
            document.body.removeChild(notification);
        }
    }, timeout);
}

// Global drag and drop state
let draggedItem = null;

// Navigation history system
let navigationHistory = [];
let currentHistoryIndex = -1;
let isNavigatingHistory = false; // Prevent adding to history during back/forward navigation

// --- Navigation History Management ---
function addToNavigationHistory(filePath, fileName) {
    if (isNavigatingHistory || !filePath) return;
    
    // Don't add duplicate consecutive entries
    if (navigationHistory.length > 0 && 
        navigationHistory[currentHistoryIndex]?.filePath === filePath) {
        return;
    }
    
    // Remove any forward history if we're not at the end
    if (currentHistoryIndex < navigationHistory.length - 1) {
        navigationHistory = navigationHistory.slice(0, currentHistoryIndex + 1);
    }
    
    // Add new entry
    navigationHistory.push({
        filePath: filePath,
        fileName: fileName || filePath.split('/').pop(),
        timestamp: Date.now()
    });
    
    currentHistoryIndex = navigationHistory.length - 1;
    
    // Limit history size
    if (navigationHistory.length > 50) {
        navigationHistory = navigationHistory.slice(-50);
        currentHistoryIndex = navigationHistory.length - 1;
    }
    
    updateNavigationButtons();
    updateCurrentFileName(fileName);
    
    // Save navigation history to persistent settings
    saveNavigationHistoryToSettings();
    
    console.log('[Navigation] Added to history:', fileName, 'Index:', currentHistoryIndex);
}

function navigateBack() {
    if (currentHistoryIndex > 0) {
        currentHistoryIndex--;
        const historyItem = navigationHistory[currentHistoryIndex];
        
        console.log('[Navigation] Going back to:', historyItem.fileName);
        
        isNavigatingHistory = true;
        openFileFromHistory(historyItem);
    }
}

function navigateForward() {
    if (currentHistoryIndex < navigationHistory.length - 1) {
        currentHistoryIndex++;
        const historyItem = navigationHistory[currentHistoryIndex];
        
        console.log('[Navigation] Going forward to:', historyItem.fileName);
        
        isNavigatingHistory = true;
        openFileFromHistory(historyItem);
    }
}

async function openFileFromHistory(historyItem) {
    try {
        const result = await window.electronAPI.invoke('open-file-path', historyItem.filePath);
        if (result.success) {
            openFileInEditor(result.filePath, result.content);
            updateNavigationButtons();
            updateCurrentFileName(historyItem.fileName);
        } else {
            console.error('[Navigation] Error opening file from history:', result.error);
            showNotification(`Error opening ${historyItem.fileName}: ${result.error}`, 'error');
            // Remove invalid entry from history
            navigationHistory.splice(currentHistoryIndex, 1);
            if (currentHistoryIndex >= navigationHistory.length) {
                currentHistoryIndex = navigationHistory.length - 1;
            }
            updateNavigationButtons();
        }
    } catch (error) {
        console.error('[Navigation] Error opening file from history:', error);
        showNotification('Error navigating to file', 'error');
    } finally {
        isNavigatingHistory = false;
    }
}

function updateNavigationButtons() {
    const backBtn = document.getElementById('nav-back-btn');
    const forwardBtn = document.getElementById('nav-forward-btn');
    
    if (backBtn) {
        backBtn.disabled = currentHistoryIndex <= 0;
        backBtn.title = currentHistoryIndex > 0 
            ? `Go Back to: ${navigationHistory[currentHistoryIndex - 1].fileName} (Alt+Left)`
            : 'Go Back (Alt+Left)';
    }
    
    if (forwardBtn) {
        forwardBtn.disabled = currentHistoryIndex >= navigationHistory.length - 1;
        forwardBtn.title = currentHistoryIndex < navigationHistory.length - 1
            ? `Go Forward to: ${navigationHistory[currentHistoryIndex + 1].fileName} (Alt+Right)`
            : 'Go Forward (Alt+Right)';
    }
}

function updateCurrentFileName(fileName) {
    const currentFileNameEl = document.getElementById('current-file-name');
    if (currentFileNameEl) {
        currentFileNameEl.textContent = fileName || 'No file selected';
        currentFileNameEl.title = fileName || '';
    }
}

// --- Settings Integration ---
async function saveNavigationHistoryToSettings() {
    try {
        await window.electronAPI.invoke('save-navigation-history', navigationHistory);
    } catch (error) {
        console.error('[Navigation] Error saving navigation history:', error);
    }
}

async function loadNavigationHistoryFromSettings() {
    try {
        const savedHistory = await window.electronAPI.invoke('get-navigation-history');
        if (Array.isArray(savedHistory) && savedHistory.length > 0) {
            navigationHistory = savedHistory;
            currentHistoryIndex = navigationHistory.length - 1;
            updateNavigationButtons();
            
            // Set current file name if we have history
            if (navigationHistory.length > 0) {
                updateCurrentFileName(navigationHistory[currentHistoryIndex].fileName);
            }
            
            console.log('[Navigation] Loaded navigation history:', navigationHistory.length, 'entries');
        }
    } catch (error) {
        console.error('[Navigation] Error loading navigation history:', error);
    }
}

async function addFileToRecents(filePath) {
    try {
        await window.electronAPI.invoke('add-recent-file', filePath);
    } catch (error) {
        console.error('[Settings] Error adding file to recents:', error);
    }
}

// Add drag and drop event listeners to file tree
fileTreeView.addEventListener('dragstart', (event) => {
    const target = event.target;
    console.log('[Renderer] Dragstart event on:', target, 'Classes:', target.classList.toString(), 'Draggable:', target.draggable);
    
    if ((target.classList.contains('file') || target.classList.contains('folder')) && target.dataset.path) {
        draggedItem = {
            element: target,
            path: target.dataset.path,
            type: target.classList.contains('file') ? 'file' : 'folder',
            name: target.textContent.substring(2) // Remove emoji
        };
        
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', draggedItem.path);
        
        // Visual feedback
        target.style.opacity = '0.5';
        target.style.border = '2px dashed #007bff';
        
        console.log('[Renderer] Drag started:', draggedItem);
    } else {
        console.log('[Renderer] Drag not started - invalid target');
    }
}, true);

fileTreeView.addEventListener('dragend', (event) => {
    console.log('[Renderer] Drag ended');
    // Don't clear draggedItem here immediately, let drop handle it
    // Just reset visual feedback on the dragged element
    if (draggedItem && draggedItem.element) {
        draggedItem.element.style.opacity = '';
        draggedItem.element.style.border = '';
    }
    
    // Clear draggedItem after a short delay to allow drop event to process
    setTimeout(() => {
        if (draggedItem) {
            draggedItem = null;
        }
        // Clear any remaining visual feedback
        const allFolders = fileTreeView.querySelectorAll('.folder');
        allFolders.forEach(folder => {
            folder.style.backgroundColor = '';
            folder.style.border = '';
        });
    }, 100);
}, true);

fileTreeView.addEventListener('dragover', (event) => {
    const target = event.target;
    if (target.classList.contains('folder') && target.dataset.path && draggedItem) {
        event.preventDefault(); // Allow drop
        event.dataTransfer.dropEffect = 'move';
        
        // Visual feedback for drop target
        target.style.backgroundColor = 'var(--hover-color, #e3f2fd)';
        target.style.border = '2px solid #007bff';
        
        console.log('[Renderer] Dragover on folder:', target.dataset.path);
    }
}, true);

fileTreeView.addEventListener('dragleave', (event) => {
    const target = event.target;
    if (target.classList.contains('folder')) {
        // Remove visual feedback
        target.style.backgroundColor = '';
        target.style.border = '';
    }
}, true);

fileTreeView.addEventListener('drop', async (event) => {
    console.log('[Renderer] Drop event');
    event.preventDefault();
    event.stopPropagation();
    
    const target = event.target;
    console.log('[Renderer] Drop target:', target, 'Classes:', target.classList.toString());
    console.log('[Renderer] Dragged item:', draggedItem);
    
    // Validate we have all required data
    if (!target.classList.contains('folder') || !target.dataset.path) {
        console.log('[Renderer] Drop not processed - invalid target');
        return;
    }
    
    if (!draggedItem || !draggedItem.path || !draggedItem.type) {
        console.log('[Renderer] Drop not processed - no valid dragged item');
        showNotification('Drag and drop failed - no valid item being dragged', 'error');
        return;
    }
    
    const targetFolderPath = target.dataset.path;
    
    // Remove visual feedback
    target.style.backgroundColor = '';
    target.style.border = '';
    
    console.log('[Renderer] Attempting to move:', draggedItem.path, 'to:', targetFolderPath);
    
    // Don't allow dropping item into itself or its children
    if (draggedItem.path === targetFolderPath || targetFolderPath.startsWith(draggedItem.path + '/')) {
        showNotification('Cannot move item into itself or its subdirectory', 'error');
        return;
    }
    
    // Store reference to dragged item before it gets cleared
    const itemToMove = {
        path: draggedItem.path,
        type: draggedItem.type,
        name: draggedItem.name
    };
    
    try {
        const result = await window.electronAPI.invoke('move-item', {
            sourcePath: itemToMove.path,
            targetPath: targetFolderPath,
            operation: 'cut', // Drag and drop is always move
            type: itemToMove.type
        });
        
        if (result.success) {
            console.log('[Renderer] Drag and drop move completed successfully');
            renderFileTree();
            showNotification(`${itemToMove.type === 'file' ? 'File' : 'Folder'} moved successfully`, 'success');
        } else {
            console.error('[Renderer] Error in drag and drop move:', result.error);
            showNotification(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('[Renderer] Error in drag and drop move:', error);
        showNotification('Error moving item', 'error');
    }
    
    // Clear the dragged item
    draggedItem = null;
}, true);

// --- Theme Handling ---
function applyTheme(isDarkMode) {
    console.log('[renderer.js] Applying theme:', isDarkMode ? 'dark' : 'light');
    const body = document.body;
    // Only toggle theme classes on body! CSS expects this.
    if (isDarkMode) {
        body.classList.remove('light-mode');
        body.classList.add('dark-mode');
        if (window.monaco && monaco.editor) {
            monaco.editor.setTheme('vs-dark');
            console.log('[renderer.js] Set Monaco theme to vs-dark');
        } else {
            console.log('[renderer.js] Monaco editor not available to set theme.');
        }
    } else {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        if (window.monaco && monaco.editor) {
            monaco.editor.setTheme('vs');
            console.log('[renderer.js] Set Monaco theme to vs');
        } else {
            console.log('[renderer.js] Monaco editor not available to set theme.');
        }
    }
}


// Setup context menu listener
setupContextMenuListener();

// Handle file opened event (e.g., from File > Open or File Tree click)
if (window.electronAPI) {
    window.electronAPI.on('file-opened', (data) => {
        console.log('[Renderer] Received file-opened event:', data);
        if (data && typeof data.content === 'string' && typeof data.filePath === 'string') {
            openFileInEditor(data.filePath, data.content);
            // Save current file to settings
            window.electronAPI.invoke('set-current-file', data.filePath);
        }
    });
}

// Handle new file creation signal from main process
if (window.electronAPI) {
    window.electronAPI.on('new-file-created', () => {
        console.log('[Renderer] Received new-file-created signal.');
        // Clear editor
        if (editor) {
            editor.setValue('');
        } else if (fallbackEditor) {
            fallbackEditor.value = '';
        }
        // Clear preview
        if (previewContent) {
            previewContent.innerHTML = '';
        }
        // Clear structure pane
        if (structureList) {
            structureList.innerHTML = '';
        }
        // Ensure structure view is active (optional, good UX)
        if (currentStructureView !== 'structure') {
            switchStructureView('structure');
        }
        console.log('[Renderer] Editor, preview, and structure cleared for new file.');
    });
}

// Listen for signal to refresh the file tree (e.g., after Open Folder)
if (window.electronAPI) {
    window.electronAPI.on('refresh-file-tree', () => {
        console.log('[Renderer] Received refresh-file-tree signal.');
        // Always switch to file view and refresh file tree
        if (currentStructureView !== 'files') {
            switchStructureView('file');
        }
        renderFileTree();
    });
}

// Listen for theme updates from main process
// if (window.electronAPI) {
//     window.electronAPI.on('theme-updated', (osIsDarkMode) => {
//         // Skip OS updates if user has custom theme selected
//         if (typeof appSettings.theme === 'string' && appSettings.theme !== 'auto') {
//             console.log('[renderer.js] Skipping OS theme update due to custom theme setting:', appSettings.theme);
//             return;
//         }
//         console.log('[renderer.js] Received OS theme update:', osIsDarkMode ? 'dark' : 'light');
//         applyTheme(osIsDarkMode);
//     });
//     console.log('[renderer.js] OS theme update listener initialized.');
// }

// Listen for 'set-theme' event via electronAPI, calling applyTheme(theme === 'dark')
if (window.electronAPI && window.electronAPI.on) {
    window.electronAPI.on('set-theme', (theme) => {
        console.log('[renderer.js] Received set-theme event:', theme);
        applyTheme(theme === 'dark');
    });
}

// --- AI Chat Functionality ---

// Function to add a message to the chat display
function addChatMessage(message, sender) {
    if (!chatMessages) return;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('chat-message', `chat-message-${sender.toLowerCase()}`); // e.g., chat-message-user, chat-message-ai

    const senderSpan = document.createElement('span');
    senderSpan.classList.add('chat-sender');
    senderSpan.textContent = sender === 'User' ? 'You: ' : 'AI: ';

    const contentSpan = document.createElement('span');
    contentSpan.classList.add('chat-content');
    // Basic sanitization/rendering (consider a Markdown library for AI responses)
    if (sender === 'AI') {
        // Render basic markdown like newlines
        contentSpan.innerHTML = message.replace(/\n/g, '<br>');
    } else {
        contentSpan.textContent = message;
    }

    messageDiv.appendChild(senderSpan);
    messageDiv.appendChild(contentSpan);
    chatMessages.appendChild(messageDiv);

    // Scroll to the bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Function to handle sending a chat message
async function sendChatMessage() {
    if (!chatInput || !window.electronAPI || !chatInput.value.trim()) {
        return; // Don't send empty messages
    }

    const userMessage = chatInput.value.trim();
    addChatMessage(userMessage, 'User'); // Display user's message immediately
    chatInput.value = ''; // Clear the input field
    chatInput.disabled = true; // Disable input while waiting for AI
    chatSendBtn.disabled = true;
    addChatMessage('...', 'AI'); // Show typing indicator (optional)

    try {
        const result = await window.electronAPI.invoke('send-chat-message', userMessage);
        
        // Remove typing indicator
        const typingIndicator = chatMessages.lastChild;
        if (typingIndicator && typingIndicator.textContent.includes('AI: ...')) {
            chatMessages.removeChild(typingIndicator);
        }

        if (result.error) {
            console.error('[Renderer] Chat Error:', result.error);
            addChatMessage(`Error: ${result.error}`, 'AI');
        } else if (result.response) {
            addChatMessage(result.response, 'AI');
        } else {
             addChatMessage('Received an empty response from the AI.', 'AI');
        }
    } catch (error) {
        console.error('[Renderer] Failed to send/receive chat message via IPC:', error);
        // Remove typing indicator in case of error
        const typingIndicator = chatMessages.lastChild;
        if (typingIndicator && typingIndicator.textContent.includes('AI: ...')) {
            chatMessages.removeChild(typingIndicator);
        }
        addChatMessage('Error communicating with the AI service.', 'AI');
    } finally {
         chatInput.disabled = false; // Re-enable input
         chatSendBtn.disabled = false;
         chatInput.focus(); // Keep focus on input
    }
}

// Event listeners for chat
if (chatSendBtn) {
    chatSendBtn.addEventListener('click', sendChatMessage);
}

if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
        // Send on Enter key, but allow Shift+Enter for newlines
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Prevent default newline insertion
            sendChatMessage();
        }
    });
}

// Event listener for Load Editor to Chat button
if (loadEditorToChatBtn && chatInput && (typeof editor !== 'undefined' || typeof fallbackEditor !== 'undefined')) {
    loadEditorToChatBtn.addEventListener('click', () => {
        let editorContent = '';
        if (editor) { // Check if Monaco editor is initialized
            editorContent = editor.getValue();
        } else if (fallbackEditor) { // Fallback if Monaco fails
            editorContent = fallbackEditor.value;
        }
        
        if (editorContent) {
            // Prepend existing chat input content (if any) or just set
            const currentChatContent = chatInput.value.trim();
            if (currentChatContent) {
                 // Add a separator if needed
                 chatInput.value = currentChatContent + '\n\n---\n\n' + editorContent;
            } else {
                 chatInput.value = editorContent;
            }
            chatInput.focus(); // Focus the chat input
            // Optionally adjust scroll height if textarea content becomes large
            chatInput.scrollTop = chatInput.scrollHeight; 
            console.log('[Renderer] Loaded editor content into chat input.');
        } else {
            console.log('[Renderer] Editor is empty, nothing to load.');
            // Optionally provide feedback to the user (e.g., temporary message)
        }
    });
} else {
     console.warn('[Renderer] Could not find Load Editor button, chat input, or editor instance for event binding.');
}

// Event listener for Copy to Editor button
if (copyAIResponseBtn && chatMessages) {
    copyAIResponseBtn.addEventListener('click', () => {
        // Find the last AI message
        const aiMessages = Array.from(chatMessages.querySelectorAll('.chat-message-ai .chat-content'));
        if (aiMessages.length === 0) {
            alert('No AI response to copy.');
            return;
        }
        const lastAIContent = aiMessages[aiMessages.length - 1].innerText || aiMessages[aiMessages.length - 1].textContent;
        if (!lastAIContent) {
            alert('No AI response to copy.');
            return;
        }
        // Add to bottom of editor
        if (editor && typeof editor.getValue === 'function' && typeof editor.setValue === 'function') {
            // Monaco Editor
            const current = editor.getValue();
            editor.setValue(current + (current.endsWith('\n') ? '' : '\n') + lastAIContent + '\n');
        } else if (fallbackEditor) {
            // Fallback textarea
            const current = fallbackEditor.value;
            fallbackEditor.value = current + (current.endsWith('\n') ? '' : '\n') + lastAIContent + '\n';
        } else {
            alert('Editor not available.');
        }
    });
}

// --- Save/Save As Logic ---
// Function to get current editor content
function getCurrentEditorContent() {
    let content = '';
    if (editor && typeof editor.getValue === 'function') {
        content = editor.getValue();
    } else if (fallbackEditor) { // Fallback if Monaco fails
        content = fallbackEditor.value;
    }
    return content;
}

// Listen for 'Save' trigger from main process
if (window.electronAPI) {
    window.electronAPI.on('trigger-save', async () => {
        console.log('[Renderer] Received trigger-save.');
        const content = getCurrentEditorContent();
        
        try {
            const result = await window.electronAPI.invoke('perform-save', content);
            if (result.success) {
                console.log(`[Renderer] File saved successfully to: ${result.filePath}`);
                // Note: Removed renderFileTree() call to prevent unwanted file switching
                showNotification('File saved successfully', 'success');
                markContentAsSaved(); // Mark content as saved for auto-save
            } else {
                // Check if it failed due to an error or just cancellation/non-error
                if (result.error) {
                     console.error(`[Renderer] Save failed: ${result.error}`);
                     showNotification(`Save failed: ${result.error}`, 'error');
                } else {
                     console.log('[Renderer] Save operation did not complete (e.g., was cancelled).');
                     // Optional: Add different UI feedback for cancellation
                }
            }
        } catch (error) {
            console.error('[Renderer] Error invoking perform-save:', error);
            showNotification('Error saving file', 'error');
        }
    });
}

// Listen for 'Save As' trigger from main process
if (window.electronAPI) {
    window.electronAPI.on('trigger-save-as', async () => {
        console.log('[Renderer] Received trigger-save-as.');
        const content = getCurrentEditorContent();
        try {
            const result = await window.electronAPI.invoke('perform-save-as', content);
             if (result.success) {
                console.log(`[Renderer] File saved successfully (Save As) to: ${result.filePath}`);
                // Note: Removed renderFileTree() call to prevent unwanted file switching  
                showNotification('File saved successfully', 'success');
                markContentAsSaved(); // Mark content as saved for auto-save
             } else {
                 // Check if it failed due to an error or just cancellation/non-error
                 if (result.error) {
                      console.error(`[Renderer] Save As failed: ${result.error}`);
                      showNotification(`Save As failed: ${result.error}`, 'error');
                 } else {
                      console.log('[Renderer] Save As operation did not complete (e.g., was cancelled).');
                      // Optional: Add different UI feedback for cancellation
                 }
             }
        } catch (error) {
            console.error('[Renderer] Error invoking perform-save-as:', error);
            showNotification('Error saving file', 'error');
            // Optional: Show error to user
        }
    });
}

// --- End Save/Save As Logic ---

// --- Export Logic ---

// Handle HTML export signal from main process
if (window.electronAPI) {
    window.electronAPI.on('trigger-export-html', async () => {
        console.log('[Renderer] Received trigger-export-html.');
        const content = getCurrentEditorContent();
        try {
            // Show initial notification
            showNotification('Preparing HTML export...', 'info');
            
            // Generate HTML from markdown
            const htmlContent = generateHTMLFromMarkdown(content);
            
            // Export options for enhanced pandoc support
            const exportOptions = {
                usePandoc: true,
                pandocArgs: [
                    '--mathjax', // Enable math rendering
                    '--highlight-style=github', // Code syntax highlighting
                    '--css=pandoc.css' // Add custom styling if available
                ]
            };
            
            const result = await window.electronAPI.invoke('perform-export-html', content, htmlContent, exportOptions);
            if (result.success) {
                console.log(`[Renderer] HTML exported successfully to: ${result.filePath}`);
                
                // Enhanced success message
                let message = 'HTML exported successfully';
                if (result.usedPandoc) {
                    message += ' (with Pandoc)';
                    if (result.bibFilesFound > 0) {
                        message += ` and ${result.bibFilesFound} bibliography file${result.bibFilesFound === 1 ? '' : 's'}`;
                    }
                }
                showNotification(message, 'success');
            } else if (!result.cancelled) {
                console.error(`[Renderer] HTML export failed: ${result.error}`);
                showNotification(result.error || 'HTML export failed', 'error');
            }
        } catch (error) {
            console.error('[Renderer] Error during HTML export:', error);
            showNotification('Error during HTML export', 'error');
        }
    });

    // Handle HTML export with references signal from main process
    window.electronAPI.on('trigger-export-html-pandoc', async () => {
        console.log('[Renderer] Received trigger-export-html-pandoc.');
        const content = getCurrentEditorContent();
        try {
            // Show initial notification
            showNotification('Preparing HTML export with references...', 'info');
            
            // Generate HTML from markdown
            const htmlContent = generateHTMLFromMarkdown(content);
            
            // Export options for pandoc with bibliography support
            const exportOptions = {
                usePandoc: true,
                pandocArgs: [
                    '--mathjax', // Enable math rendering
                    '--highlight-style=pygments' // Code syntax highlighting
                ]
            };
            
            const result = await window.electronAPI.invoke('perform-export-html-pandoc', content, htmlContent, exportOptions);
            if (result.success) {
                console.log(`[Renderer] HTML with references exported successfully to: ${result.filePath}`);
                
                // Enhanced success message
                let message = 'HTML with references exported successfully';
                if (result.bibFilesFound > 0) {
                    message += ` (${result.bibFilesFound} bibliography file${result.bibFilesFound === 1 ? '' : 's'} processed)`;
                } else {
                    message += ' (no bibliography files found)';
                }
                showNotification(message, 'success');
            } else if (!result.cancelled) {
                console.error(`[Renderer] HTML with references export failed: ${result.error}`);
                showNotification(result.error || 'HTML with references export failed', 'error');
            }
        } catch (error) {
            console.error('[Renderer] Error during HTML with references export:', error);
            showNotification('Error during HTML with references export', 'error');
        }
    });

    window.electronAPI.on('trigger-export-pdf', async () => {
        console.log('[Renderer] Received trigger-export-pdf.');
        const content = getCurrentEditorContent();
        try {
            // Show initial notification
            showNotification('Preparing PDF export...', 'info');
            
            // Generate HTML from markdown
            const htmlContent = generateHTMLFromMarkdown(content);
            
            // Export options for enhanced pandoc support
            const exportOptions = {
                usePandoc: true,
                pandocArgs: [
                    '--mathjax', // Enable math rendering
                    '--highlight-style=github', // Code syntax highlighting
                    '--variable', 'linkcolor:blue',
                    '--variable', 'urlcolor:blue'
                ]
            };
            
            const result = await window.electronAPI.invoke('perform-export-pdf', content, htmlContent, exportOptions);
            if (result.success) {
                console.log(`[Renderer] PDF exported successfully to: ${result.filePath}`);
                
                // Enhanced success message
                let message = 'PDF exported successfully';
                if (result.usedPandoc) {
                    message += ' (with Pandoc)';
                    if (result.bibFilesFound > 0) {
                        message += ` and ${result.bibFilesFound} bibliography file${result.bibFilesFound === 1 ? '' : 's'}`;
                    }
                } else {
                    message += ' (using Electron renderer)';
                }
                showNotification(message, 'success');
            } else if (!result.cancelled) {
                console.error(`[Renderer] PDF export failed: ${result.error}`);
                showNotification(result.error || 'PDF export failed', 'error');
            }
        } catch (error) {
            console.error('[Renderer] Error during PDF export:', error);
            showNotification('Error during PDF export', 'error');
        }
    });

    window.electronAPI.on('trigger-export-pptx', async () => {
        console.log('[Renderer] Received trigger-export-pptx.');
        const content = getCurrentEditorContent();
        try {
            // Show initial notification
            showNotification('Preparing PowerPoint export...', 'info');
            
            // Export options for PowerPoint
            const exportOptions = {
                usePandoc: true,
                pandocArgs: [
                    '--variable', 'theme:metropolis', // Clean theme
                    '--variable', 'aspectratio:169'   // 16:9 aspect ratio
                ]
            };
            
            const result = await window.electronAPI.invoke('perform-export-pptx', content, exportOptions);
            if (result.success) {
                console.log(`[Renderer] PowerPoint exported successfully to: ${result.filePath}`);
                
                // Enhanced success message
                let message = `PowerPoint exported successfully (${result.slidesCreated} slide${result.slidesCreated === 1 ? '' : 's'})`;
                if (result.bibFilesFound > 0) {
                    message += ` with ${result.bibFilesFound} bibliography file${result.bibFilesFound === 1 ? '' : 's'}`;
                }
                showNotification(message, 'success');
            } else if (!result.cancelled) {
                console.error(`[Renderer] PowerPoint export failed: ${result.error}`);
                showNotification(result.error || 'PowerPoint export failed', 'error');
            }
        } catch (error) {
            console.error('[Renderer] Error during PowerPoint export:', error);
            showNotification('Error during PowerPoint export', 'error');
        }
    });

    window.electronAPI.on('trigger-export-pdf-pandoc', async () => {
        console.log('[Renderer] Received trigger-export-pdf-pandoc.');
        const content = getCurrentEditorContent();
        try {
            // Show initial notification
            showNotification('Preparing PDF export with references...', 'info');
            
            // Export options for enhanced PDF with references
            const exportOptions = {
                pandocArgs: [
                    '--variable', 'linkcolor:blue',
                    '--variable', 'urlcolor:blue',
                    '--variable', 'toccolor:black'
                    // Note: removed eisvogel template as it may not be installed
                ]
            };
            
            const result = await window.electronAPI.invoke('perform-export-pdf-pandoc', content, exportOptions);
            if (result.success) {
                console.log(`[Renderer] PDF with references exported successfully to: ${result.filePath}`);
                
                // Enhanced success message
                let message = 'PDF with references exported successfully';
                if (result.bibFilesFound > 0) {
                    message += ` (${result.bibFilesFound} bibliography file${result.bibFilesFound === 1 ? '' : 's'} processed)`;
                } else {
                    message += ' (no bibliography files found)';
                }
                showNotification(message, 'success');
            } else if (!result.cancelled) {
                console.error(`[Renderer] PDF with references export failed: ${result.error}`);
                showNotification(result.error || 'PDF export with references failed', 'error');
            }
        } catch (error) {
            console.error('[Renderer] Error during PDF with references export:', error);
            showNotification('Error during PDF export with references', 'error');
        }
    });

    // Handle settings dialog triggers from main process
    window.electronAPI.on('open-settings-dialog', () => {
        console.log('[Renderer] Received open-settings-dialog');
        openSettingsDialog();
    });

    window.electronAPI.on('open-ai-settings-dialog', () => {
        console.log('[Renderer] Received open-ai-settings-dialog');
        openSettingsDialog('ai');
    });

    window.electronAPI.on('open-editor-settings-dialog', () => {
        console.log('[Renderer] Received open-editor-settings-dialog');
        openSettingsDialog('editor');
    });

    window.electronAPI.on('open-export-settings-dialog', () => {
        console.log('[Renderer] Received open-export-settings-dialog');
        openSettingsDialog('export');
    });
}

// Generate HTML from markdown content
function generateHTMLFromMarkdown(markdownContent) {
    if (!markdownContent) {
        return '<html><head><title>Export</title></head><body><p>No content to export</p></body></html>';
    }

    // Check if marked is available (it should be loaded from CDN)
    if (typeof marked === 'undefined') {
        console.warn('[Renderer] Marked library not available, using plain text');
        return `<html>
<head>
    <title>Export</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px; 
            line-height: 1.6; 
        }
    </style>
</head>
<body>
    <pre>${escapeHtml(markdownContent)}</pre>
</body>
</html>`;
    }

    // Convert markdown to HTML using marked
    const htmlBody = marked.parse(markdownContent);
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Exported Document</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px; 
            margin: 0 auto; 
            padding: 40px 20px; 
            line-height: 1.6; 
            color: #333;
        }
        h1, h2, h3, h4, h5, h6 {
            color: #2c3e50;
            margin-top: 2em;
            margin-bottom: 1em;
        }
        h1 { font-size: 2.5em; border-bottom: 2px solid #3498db; padding-bottom: 0.5em; }
        h2 { font-size: 2em; border-bottom: 1px solid #bdc3c7; padding-bottom: 0.3em; }
        h3 { font-size: 1.5em; }
        p { margin-bottom: 1em; }
        code {
            background-color: #f8f9fa;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: 'Monaco', 'Consolas', monospace;
        }
        pre {
            background-color: #f8f9fa;
            padding: 1em;
            border-radius: 5px;
            overflow-x: auto;
        }
        blockquote {
            border-left: 4px solid #3498db;
            margin: 1em 0;
            padding: 0 1em;
            color: #7f8c8d;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 0.5em;
            text-align: left;
        }
        th {
            background-color: #f8f9fa;
            font-weight: bold;
        }
        ul, ol {
            margin: 1em 0;
            padding-left: 2em;
        }
        li {
            margin: 0.5em 0;
        }
        @media print {
            body { margin: 0; padding: 20px; }
        }
    </style>
</head>
<body>
    ${htmlBody}
</body>
</html>`;
}

// --- End Export Logic ---

// --- Theme Change Listeners ---
// --- Helper to Save Current Layout --- 
function saveCurrentLayout() {
    const leftSidebar = document.getElementById('left-sidebar');
    const editorPane = document.getElementById('editor-pane');
    const rightPane = document.getElementById('right-pane');
    const appContainer = document.getElementById('app-container');

    if (!leftSidebar || !editorPane || !rightPane || !appContainer) {
        console.error('[renderer.js] Cannot save layout: one or more pane elements or container not found.');
        return;
    }

    const containerWidth = appContainer.offsetWidth;
    if (containerWidth <= 0) {
         console.warn('[renderer.js] Cannot save layout: container width is zero.');
        return;
    }

    const layoutData = {
        structureWidth: `${(leftSidebar.offsetWidth / containerWidth) * 100}%`,
        editorWidth: `${(editorPane.offsetWidth / containerWidth) * 100}%`,
        rightWidth: `${(rightPane.offsetWidth / containerWidth) * 100}%`
    };

    console.log('[renderer.js] Sending layout settings to main:', layoutData);
    window.electronAPI.send('save-layout', layoutData);
}

// --- Global Search Implementation ---
let globalSearchResults = [];
let searchInProgress = false;

// Get search elements
const showSearchBtn = document.getElementById('show-search-btn');
const searchPane = document.getElementById('search-pane');
const globalSearchInput = document.getElementById('global-search-input');
const globalSearchBtn = document.getElementById('global-search-btn');
const searchCaseSensitive = document.getElementById('search-case-sensitive');
const searchRegex = document.getElementById('search-regex');
const searchWholeWord = document.getElementById('search-whole-word');
const searchFilePattern = document.getElementById('search-file-pattern');
const searchResults = document.getElementById('search-results');
const searchStatus = document.getElementById('search-status');

// Get replace elements
const globalReplaceInput = document.getElementById('global-replace-input');
const globalReplaceExecuteBtn = document.getElementById('global-replace-execute');
const globalReplacePreviewBtn = document.getElementById('global-replace-preview');

// Initialize global search
function initializeGlobalSearch() {
    if (showSearchBtn) {
        showSearchBtn.addEventListener('click', () => {
            showRightPane('search');
        });
    }
    
    if (globalSearchBtn) {
        globalSearchBtn.addEventListener('click', performGlobalSearch);
    }
    
    if (globalSearchInput) {
        globalSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                performGlobalSearch();
            }
        });
    }
    
    // Replace functionality event handlers
    if (globalReplaceExecuteBtn) {
        globalReplaceExecuteBtn.addEventListener('click', () => {
            performGlobalReplace(false); // false = execute replacement
        });
    }
    
    if (globalReplacePreviewBtn) {
        globalReplacePreviewBtn.addEventListener('click', () => {
            performGlobalReplace(true); // true = preview only
        });
    }
    
    if (globalReplaceInput) {
        globalReplaceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                performGlobalReplace(false); // Ctrl+Enter to execute
            }
        });
    }
}

// Perform global search
async function performGlobalSearch() {
    if (!globalSearchInput || !window.electronAPI) return;
    
    const query = globalSearchInput.value.trim();
    if (!query) {
        showSearchStatus('Please enter a search term');
        return;
    }
    
    if (searchInProgress) {
        showSearchStatus('Search in progress...');
        return;
    }
    
    searchInProgress = true;
    showSearchStatus('Searching...');
    clearSearchResults();
    
    try {
        const options = {
            caseSensitive: searchCaseSensitive?.checked || false,
            wholeWord: searchWholeWord?.checked || false,
            useRegex: searchRegex?.checked || false,
            filePattern: searchFilePattern?.value || '*.{md,markdown,txt}'
        };
        
        const result = await window.electronAPI.invoke('global-search', { query, options });
        
        if (result.success) {
            globalSearchResults = result.results;
            displaySearchResults(result.results, query);
            showSearchStatus(`Found ${result.results.length} matches`);
        } else {
            showSearchStatus(`Search failed: ${result.error}`);
        }
    } catch (error) {
        console.error('[renderer.js] Global search error:', error);
        showSearchStatus(`Search error: ${error.message}`);
    } finally {
        searchInProgress = false;
    }
}

// Display search results
function displaySearchResults(results, query) {
    if (!searchResults) return;
    
    searchResults.innerHTML = '';
    
    if (results.length === 0) {
        const noResultsDiv = document.createElement('div');
        noResultsDiv.className = 'search-no-results';
        noResultsDiv.textContent = 'No matches found';
        searchResults.appendChild(noResultsDiv);
        return;
    }
    
    // Group results by file
    const fileGroups = {};
    results.forEach(result => {
        if (!fileGroups[result.file]) {
            fileGroups[result.file] = [];
        }
        fileGroups[result.file].push(result);
    });
    
    // Create file sections
    Object.entries(fileGroups).forEach(([filePath, fileResults]) => {
        const fileSection = document.createElement('div');
        fileSection.className = 'search-file-section';
        
        // File header
        const fileHeader = document.createElement('div');
        fileHeader.className = 'search-file-header';
        fileHeader.innerHTML = `
            <span class="search-file-name">${fileResults[0].fileName}</span>
            <span class="search-file-count">${fileResults.length} matches</span>
        `;
        fileSection.appendChild(fileHeader);
        
        // File results
        const fileResultsList = document.createElement('div');
        fileResultsList.className = 'search-file-results';
        
        fileResults.forEach(result => {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'search-result-item';
            resultDiv.innerHTML = `
                <div class="search-result-line">
                    <span class="search-result-line-number">Line ${result.line}</span>
                    <span class="search-result-text">${highlightSearchMatch(result.text, query)}</span>
                </div>
            `;
            
            resultDiv.addEventListener('click', () => {
                openFileAtLocation(result.file, result.line, result.column);
            });
            
            fileResultsList.appendChild(resultDiv);
        });
        
        fileSection.appendChild(fileResultsList);
        searchResults.appendChild(fileSection);
    });
}

// Highlight search matches in result text
function highlightSearchMatch(text, query) {
    if (!query) return escapeHtml(text);
    
    try {
        const escaped = escapeHtml(text);
        const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
        return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
    } catch (error) {
        return escapeHtml(text);
    }
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Helper function to escape regex special characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Open file at specific location
async function openFileAtLocation(filePath, line, column) {
    try {
        const result = await window.electronAPI.invoke('open-file-path', filePath);
        if (result.success) {
            // Set editor content
            if (editor) {
                editor.setValue(result.content);
                editor.setPosition({ lineNumber: line, column: column });
                editor.revealLineInCenter(line);
                editor.focus();
            }
            
            // Update current file tracking
            await window.electronAPI.invoke('set-current-file', filePath);
            addToNavigationHistory(filePath);
            
            // Update UI
            updateWindowTitle(result.filePath);
            updateCurrentFileName(result.filePath);
            // Extract filename from path
            const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'Unknown';
            showNotification(`Opened ${fileName} at line ${line}`, 'info');
        } else {
            showNotification(`Failed to open file: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('[renderer.js] Error opening file from search:', error);
        showNotification('Error opening file', 'error');
    }
}

// Perform global replace
async function performGlobalReplace(previewOnly = false) {
    if (!globalSearchInput || !globalReplaceInput || !window.electronAPI) return;
    
    const searchQuery = globalSearchInput.value.trim();
    const replaceText = globalReplaceInput.value; // Allow empty replace text
    
    if (!searchQuery) {
        showSearchStatus('Please enter a search term first');
        return;
    }
    
    // Check if we have search results
    if (!globalSearchResults || globalSearchResults.length === 0) {
        showSearchStatus('Please perform a search first');
        return;
    }
    
    if (searchInProgress) {
        showSearchStatus('Operation in progress...');
        return;
    }
    
    // Show confirmation dialog for actual replacement
    if (!previewOnly) {
        const matchCount = globalSearchResults.length;
        const fileCount = [...new Set(globalSearchResults.map(r => r.file))].length;
        const confirmed = confirm(
            `Are you sure you want to replace ${matchCount} occurrences in ${fileCount} files?\n\n` +
            `Search: "${searchQuery}"\n` +
            `Replace with: "${replaceText}"\n\n` +
            `This action cannot be undone.`
        );
        
        if (!confirmed) {
            showSearchStatus('Replace operation cancelled');
            return;
        }
    }
    
    searchInProgress = true;
    showSearchStatus(previewOnly ? 'Generating preview...' : 'Replacing...');
    
    try {
        const options = {
            caseSensitive: searchCaseSensitive?.checked || false,
            wholeWord: searchWholeWord?.checked || false,
            useRegex: searchRegex?.checked || false,
            filePattern: searchFilePattern?.value || '*.{md,markdown,txt}',
            previewOnly: previewOnly
        };
        
        const result = await window.electronAPI.invoke('global-replace', {
            searchQuery,
            replaceText,
            searchResults: globalSearchResults,
            options
        });
        
        if (result.success) {
            if (previewOnly) {
                displayReplacePreview(result.preview, searchQuery, replaceText);
                showSearchStatus(`Preview: ${result.matchCount} matches would be replaced in ${result.fileCount} files`);
            } else {
                displayReplaceResults(result.results, searchQuery, replaceText);
                showSearchStatus(`Replaced ${result.replacedCount} occurrences in ${result.modifiedFiles} files`);
                
                // Clear search results since files have been modified
                globalSearchResults = [];
                
                // Refresh current file if it was modified
                if (result.modifiedFilePaths && result.modifiedFilePaths.includes(window.currentFilePath)) {
                    if (confirm('The current file was modified. Would you like to reload it?')) {
                        location.reload();
                    }
                }
            }
        } else {
            showSearchStatus(`Error: ${result.error}`);
        }
    } catch (error) {
        console.error('[renderer.js] Error in global replace:', error);
        showSearchStatus('Error during replace operation');
    } finally {
        searchInProgress = false;
    }
}

// Show search status message
function showSearchStatus(message) {
    if (searchStatus) {
        searchStatus.textContent = message;
    }
}

// Clear search results
function clearSearchResults() {
    if (searchResults) {
        searchResults.innerHTML = '';
    }
}

// Display replace preview
function displayReplacePreview(previewData, searchQuery, replaceText) {
    if (!searchResults) return;
    
    searchResults.innerHTML = '';
    
    if (!previewData || previewData.length === 0) {
        const noResultsDiv = document.createElement('div');
        noResultsDiv.className = 'search-no-results';
        noResultsDiv.textContent = 'No matches to preview';
        searchResults.appendChild(noResultsDiv);
        return;
    }
    
    // Add preview header
    const previewHeader = document.createElement('div');
    previewHeader.className = 'replace-preview-header';
    previewHeader.innerHTML = `
        <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin-bottom: 12px; border-left: 3px solid #007bff;">
            <strong>Replace Preview</strong><br>
            <small>Search: <code>${escapeHtml(searchQuery)}</code> → Replace: <code>${escapeHtml(replaceText)}</code></small>
        </div>
    `;
    searchResults.appendChild(previewHeader);
    
    // Group preview by file
    const fileGroups = {};
    previewData.forEach(item => {
        if (!fileGroups[item.file]) {
            fileGroups[item.file] = [];
        }
        fileGroups[item.file].push(item);
    });
    
    // Create file sections
    Object.entries(fileGroups).forEach(([filePath, filePreview]) => {
        const fileSection = document.createElement('div');
        fileSection.className = 'search-file-section';
        
        const fileHeader = document.createElement('div');
        fileHeader.className = 'search-file-header';
        fileHeader.innerHTML = `
            <span class="search-file-name">${filePreview[0].fileName}</span>
            <span class="search-file-count">${filePreview.length} replacements</span>
        `;
        fileSection.appendChild(fileHeader);
        
        const fileResultsList = document.createElement('div');
        fileResultsList.className = 'search-file-results';
        
        filePreview.forEach(item => {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'replace-preview-item';
            resultDiv.innerHTML = `
                <div class="replace-preview-line" style="margin: 4px 0; padding: 8px; background: #fff3cd; border-left: 3px solid #ffc107;">
                    <div style="font-size: 11px; color: #666; margin-bottom: 2px;">Line ${item.line}</div>
                    <div style="font-family: monospace; font-size: 12px;">
                        <div style="color: #dc3545;">- ${escapeHtml(item.originalLine)}</div>
                        <div style="color: #28a745;">+ ${escapeHtml(item.replacedLine)}</div>
                    </div>
                </div>
            `;
            fileResultsList.appendChild(resultDiv);
        });
        
        fileSection.appendChild(fileResultsList);
        searchResults.appendChild(fileSection);
    });
}

// Display replace results
function displayReplaceResults(resultsData, searchQuery, replaceText) {
    if (!searchResults) return;
    
    searchResults.innerHTML = '';
    
    if (!resultsData || resultsData.length === 0) {
        const noResultsDiv = document.createElement('div');
        noResultsDiv.className = 'search-no-results';
        noResultsDiv.textContent = 'No replacements made';
        searchResults.appendChild(noResultsDiv);
        return;
    }
    
    // Add results header
    const resultsHeader = document.createElement('div');
    resultsHeader.className = 'replace-results-header';
    resultsHeader.innerHTML = `
        <div style="background: #d4edda; padding: 8px; border-radius: 4px; margin-bottom: 12px; border-left: 3px solid #28a745;">
            <strong>Replacement Complete</strong><br>
            <small>Replaced: <code>${escapeHtml(searchQuery)}</code> → <code>${escapeHtml(replaceText)}</code></small>
        </div>
    `;
    searchResults.appendChild(resultsHeader);
    
    // Group results by file
    const fileGroups = {};
    resultsData.forEach(item => {
        if (!fileGroups[item.file]) {
            fileGroups[item.file] = [];
        }
        fileGroups[item.file].push(item);
    });
    
    // Create file sections
    Object.entries(fileGroups).forEach(([filePath, fileResults]) => {
        const fileSection = document.createElement('div');
        fileSection.className = 'search-file-section';
        
        const fileHeader = document.createElement('div');
        fileHeader.className = 'search-file-header';
        fileHeader.innerHTML = `
            <span class="search-file-name">${fileResults[0].fileName}</span>
            <span class="search-file-count">${fileResults.length} replaced</span>
        `;
        fileSection.appendChild(fileHeader);
        
        const fileResultsList = document.createElement('div');
        fileResultsList.className = 'search-file-results';
        
        fileResults.forEach(item => {
            const resultDiv = document.createElement('div');
            resultDiv.className = 'replace-result-item';
            resultDiv.innerHTML = `
                <div style="margin: 2px 0; padding: 4px; font-size: 12px; background: #f8f9fa;">
                    Line ${item.line}: Replaced "${escapeHtml(searchQuery)}" with "${escapeHtml(replaceText)}"
                </div>
            `;
            fileResultsList.appendChild(resultDiv);
        });
        
        fileSection.appendChild(fileResultsList);
        searchResults.appendChild(fileSection);
    });
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize global search when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeGlobalSearch);

// Initialize speaker notes when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeSpeakerNotes);

// --- Markdown Formatting Functions ---

// Get references to formatting buttons
const formatBoldBtn = document.getElementById('format-bold-btn');
const formatItalicBtn = document.getElementById('format-italic-btn');
const formatCodeBtn = document.getElementById('format-code-btn');
const formatH1Btn = document.getElementById('format-h1-btn');
const formatH2Btn = document.getElementById('format-h2-btn');
const formatH3Btn = document.getElementById('format-h3-btn');
const formatListBtn = document.getElementById('format-list-btn');
const formatNumberedListBtn = document.getElementById('format-numbered-list-btn');
const formatQuoteBtn = document.getElementById('format-quote-btn');
const formatLinkBtn = document.getElementById('format-link-btn');
const formatImageBtn = document.getElementById('format-image-btn');
const formatTableBtn = document.getElementById('format-table-btn');
const autoSlideMarkersBtn = document.getElementById('auto-slide-markers-btn');
const removeSlideMarkersBtn = document.getElementById('remove-slide-markers-btn');
const insertSpeakerNotesBtn = document.getElementById('insert-speaker-notes-btn');

// Speaker notes elements
const showSpeakerNotesBtn = document.getElementById('show-speaker-notes-btn');
const speakerNotesPane = document.getElementById('speaker-notes-pane');
const speakerNotesContent = document.getElementById('speaker-notes-content');
const toggleSpeakerNotesInPreviewBtn = document.getElementById('toggle-speaker-notes-in-preview');

// Initialize markdown formatting
function initializeMarkdownFormatting() {
    console.log('[renderer.js] Initializing markdown formatting...');
    
    if (formatBoldBtn) formatBoldBtn.addEventListener('click', () => formatText('**', '**', 'bold text'));
    if (formatItalicBtn) formatItalicBtn.addEventListener('click', () => formatText('*', '*', 'italic text'));
    if (formatCodeBtn) formatCodeBtn.addEventListener('click', () => formatText('`', '`', 'code'));
    
    if (formatH1Btn) formatH1Btn.addEventListener('click', () => formatHeading(1));
    if (formatH2Btn) formatH2Btn.addEventListener('click', () => formatHeading(2));
    if (formatH3Btn) formatH3Btn.addEventListener('click', () => formatHeading(3));
    
    if (formatListBtn) formatListBtn.addEventListener('click', () => formatList('-'));
    if (formatNumberedListBtn) formatNumberedListBtn.addEventListener('click', () => formatList('1.'));
    if (formatQuoteBtn) formatQuoteBtn.addEventListener('click', () => formatBlockquote());
    
    if (formatLinkBtn) formatLinkBtn.addEventListener('click', () => insertLink());
    if (formatImageBtn) formatImageBtn.addEventListener('click', () => insertImage());
    if (formatTableBtn) formatTableBtn.addEventListener('click', () => insertTable());
    if (autoSlideMarkersBtn) autoSlideMarkersBtn.addEventListener('click', () => addSlideMarkersToParagraphs());
    if (removeSlideMarkersBtn) removeSlideMarkersBtn.addEventListener('click', () => removeAllSlideMarkers());
    if (insertSpeakerNotesBtn) insertSpeakerNotesBtn.addEventListener('click', () => insertSpeakerNotesTemplate());
    
    // Annotation button event handlers
    const insertCommentAnnotationBtn = document.getElementById('insert-comment-annotation-btn');
    const insertHighlightAnnotationBtn = document.getElementById('insert-highlight-annotation-btn');
    const insertBlockAnnotationBtn = document.getElementById('insert-block-annotation-btn');
    
    if (insertCommentAnnotationBtn) insertCommentAnnotationBtn.addEventListener('click', () => insertCommentAnnotation());
    if (insertHighlightAnnotationBtn) insertHighlightAnnotationBtn.addEventListener('click', () => insertHighlightAnnotation());
    if (insertBlockAnnotationBtn) insertBlockAnnotationBtn.addEventListener('click', () => insertBlockAnnotation());
    
    console.log('[renderer.js] Markdown formatting initialized');
}

// Format text with wrap characters (bold, italic, code)
function formatText(prefix, suffix, placeholder) {
    if (!editor) return;
    
    const selection = editor.getSelection();
    const selectedText = editor.getModel().getValueInRange(selection);
    
    if (selectedText) {
        // Wrap selected text
        const newText = prefix + selectedText + suffix;
        editor.executeEdits('format-text', [{
            range: selection,
            text: newText
        }]);
        
        // Update selection to include the new formatting
        const endPos = {
            lineNumber: selection.endLineNumber,
            column: selection.endColumn + prefix.length + suffix.length
        };
        editor.setSelection(new monaco.Selection(
            selection.startLineNumber,
            selection.startColumn,
            endPos.lineNumber,
            endPos.column
        ));
    } else {
        // Insert placeholder text with formatting
        const position = editor.getPosition();
        const newText = prefix + placeholder + suffix;
        
        editor.executeEdits('format-text', [{
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            text: newText
        }]);
        
        // Select the placeholder text for easy replacement
        const startPos = {
            lineNumber: position.lineNumber,
            column: position.column + prefix.length
        };
        const endPos = {
            lineNumber: position.lineNumber,
            column: position.column + prefix.length + placeholder.length
        };
        
        editor.setSelection(new monaco.Selection(
            startPos.lineNumber,
            startPos.column,
            endPos.lineNumber,
            endPos.column
        ));
    }
    
    editor.focus();
    updatePreviewAndStructure(editor.getValue());
}

// Format headings
function formatHeading(level) {
    if (!editor) return;
    
    const position = editor.getPosition();
    const lineContent = editor.getModel().getLineContent(position.lineNumber);
    
    // Remove existing heading markers
    const cleanLine = lineContent.replace(/^#+\s*/, '');
    
    // Add new heading markers
    const headingMarkers = '#'.repeat(level) + ' ';
    const newLine = headingMarkers + cleanLine;
    
    // Replace the entire line
    const range = new monaco.Range(
        position.lineNumber, 1,
        position.lineNumber, lineContent.length + 1
    );
    
    editor.executeEdits('format-heading', [{
        range: range,
        text: newLine
    }]);
    
    // Position cursor at end of line
    editor.setPosition({
        lineNumber: position.lineNumber,
        column: newLine.length + 1
    });
    
    editor.focus();
    updatePreviewAndStructure(editor.getValue());
}

// Format lists
function formatList(marker) {
    if (!editor) return;
    
    const selection = editor.getSelection();
    const model = editor.getModel();
    
    // Handle multiple lines if selected
    const startLine = selection.startLineNumber;
    const endLine = selection.endLineNumber;
    
    const edits = [];
    
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
        const lineContent = model.getLineContent(lineNum);
        
        // Skip empty lines
        if (lineContent.trim() === '') continue;
        
        // Remove existing list markers
        const cleanLine = lineContent.replace(/^\s*[-*+]\s*/, '').replace(/^\s*\d+\.\s*/, '');
        
        // Add new list marker
        const newLine = marker + ' ' + cleanLine.trim();
        
        edits.push({
            range: new monaco.Range(lineNum, 1, lineNum, lineContent.length + 1),
            text: newLine
        });
    }
    
    if (edits.length > 0) {
        editor.executeEdits('format-list', edits);
    } else {
        // If no selection, create a new list item
        const position = editor.getPosition();
        const newText = marker + ' ';
        
        editor.executeEdits('format-list', [{
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            text: newText
        }]);
        
        editor.setPosition({
            lineNumber: position.lineNumber,
            column: position.column + newText.length
        });
    }
    
    editor.focus();
    updatePreviewAndStructure(editor.getValue());
}

// Format blockquote
function formatBlockquote() {
    if (!editor) return;
    
    const selection = editor.getSelection();
    const model = editor.getModel();
    
    const startLine = selection.startLineNumber;
    const endLine = selection.endLineNumber;
    
    const edits = [];
    
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
        const lineContent = model.getLineContent(lineNum);
        
        // Skip empty lines
        if (lineContent.trim() === '') continue;
        
        // Remove existing blockquote markers
        const cleanLine = lineContent.replace(/^\s*>\s*/, '');
        
        // Add blockquote marker
        const newLine = '> ' + cleanLine.trim();
        
        edits.push({
            range: new monaco.Range(lineNum, 1, lineNum, lineContent.length + 1),
            text: newLine
        });
    }
    
    if (edits.length > 0) {
        editor.executeEdits('format-blockquote', edits);
    } else {
        // If no selection, create a new blockquote
        const position = editor.getPosition();
        const newText = '> ';
        
        editor.executeEdits('format-blockquote', [{
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            text: newText
        }]);
        
        editor.setPosition({
            lineNumber: position.lineNumber,
            column: position.column + newText.length
        });
    }
    
    editor.focus();
    updatePreviewAndStructure(editor.getValue());
}

// Insert link
function insertLink() {
    if (!editor) return;
    
    const selection = editor.getSelection();
    const selectedText = editor.getModel().getValueInRange(selection);
    
    // Simple prompt for now - could be enhanced with a modal dialog
    const url = prompt('Enter the URL:');
    if (!url) return;
    
    const linkText = selectedText || prompt('Enter the link text:') || 'link';
    const linkMarkdown = `[${linkText}](${url})`;
    
    editor.executeEdits('insert-link', [{
        range: selection,
        text: linkMarkdown
    }]);
    
    editor.focus();
    updatePreviewAndStructure(editor.getValue());
}

// Insert image
function insertImage() {
    if (!editor) return;
    
    const url = prompt('Enter the image URL:');
    if (!url) return;
    
    const altText = prompt('Enter the alt text:') || 'image';
    const imageMarkdown = `![${altText}](${url})`;
    
    const position = editor.getPosition();
    editor.executeEdits('insert-image', [{
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: imageMarkdown
    }]);
    
    editor.focus();
    updatePreviewAndStructure(editor.getValue());
}

// Insert table
function insertTable() {
    if (!editor) return;
    
    const rows = parseInt(prompt('Number of rows:') || '3');
    const cols = parseInt(prompt('Number of columns:') || '3');
    
    if (isNaN(rows) || isNaN(cols) || rows < 1 || cols < 1) return;
    
    let tableMarkdown = '';
    
    // Create header row
    const headerCells = Array(cols).fill('Header').map((cell, i) => `${cell} ${i + 1}`);
    tableMarkdown += '| ' + headerCells.join(' | ') + ' |\n';
    
    // Create separator row
    const separators = Array(cols).fill('---');
    tableMarkdown += '| ' + separators.join(' | ') + ' |\n';
    
    // Create data rows
    for (let row = 1; row < rows; row++) {
        const dataCells = Array(cols).fill('Data').map((cell, i) => `${cell} ${row}-${i + 1}`);
        tableMarkdown += '| ' + dataCells.join(' | ') + ' |\n';
    }
    
    const position = editor.getPosition();
    editor.executeEdits('insert-table', [{
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: '\n' + tableMarkdown
    }]);
    
    editor.focus();
    updatePreviewAndStructure(editor.getValue());
}

// Add slide markers to paragraphs that don't already have them
function addSlideMarkersToParagraphs() {
    if (!editor) {
        console.warn('[renderer.js] Cannot add slide markers - no editor available');
        return;
    }
    
    const content = editor.getValue();
    const lines = content.split('\n');
    const newLines = [];
    let i = 0;
    
    console.log('[renderer.js] Adding slide markers to paragraphs...');
    
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Add current line
        newLines.push(line);
        
        // Check if this is the end of a paragraph (non-empty line followed by empty line or end of file)
        if (trimmed !== '' && 
            (i === lines.length - 1 || lines[i + 1].trim() === '')) {
            
            // Check if the next non-empty line is already a slide marker
            let nextNonEmptyIndex = i + 1;
            while (nextNonEmptyIndex < lines.length && lines[nextNonEmptyIndex].trim() === '') {
                nextNonEmptyIndex++;
            }
            
            // Don't add slide marker if:
            // - Next non-empty line is already a slide marker (---)
            // - Current line is already a slide marker
            // - Current line is a heading (#)
            // - We're at the very end of the document
            const isCurrentSlideMarker = trimmed === '---';
            const isCurrentHeading = trimmed.match(/^#+\s/);
            const nextLine = nextNonEmptyIndex < lines.length ? lines[nextNonEmptyIndex].trim() : '';
            const isNextSlideMarker = nextLine === '---';
            const isAtEnd = i === lines.length - 1;
            
            if (!isCurrentSlideMarker && !isCurrentHeading && !isNextSlideMarker && !isAtEnd) {
                // Add empty line if there isn't one already
                if (i < lines.length - 1 && lines[i + 1].trim() !== '') {
                    newLines.push('');
                }
                // Add slide marker
                newLines.push('---');
                console.log(`[renderer.js] Added slide marker after line ${i + 1}: "${trimmed}"`);
            }
        }
        
        i++;
    }
    
    const newContent = newLines.join('\n');
    if (newContent !== content) {
        editor.setValue(newContent);
        updatePreviewAndStructure(newContent);
        console.log('[renderer.js] Slide markers added successfully');
    } else {
        console.log('[renderer.js] No slide markers needed to be added');
    }
}

// Remove all slide markers from the document with confirmation
function removeAllSlideMarkers() {
    if (!editor) {
        console.warn('[renderer.js] Cannot remove slide markers - no editor available');
        return;
    }
    
    const content = editor.getValue();
    const slideMarkerCount = (content.match(/^---$/gm) || []).length;
    
    if (slideMarkerCount === 0) {
        alert('No slide markers found in the document.');
        return;
    }
    
    // Show confirmation dialog
    const confirmed = confirm(`Are you sure you want to remove all ${slideMarkerCount} slide markers from the document?\n\nThis action cannot be undone.`);
    
    if (!confirmed) {
        console.log('[renderer.js] User cancelled slide marker removal');
        return;
    }
    
    console.log('[renderer.js] Removing all slide markers...');
    
    const lines = content.split('\n');
    const newLines = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Skip lines that are just slide markers
        if (trimmed === '---') {
            console.log(`[renderer.js] Removed slide marker at line ${i + 1}`);
            continue;
        }
        
        newLines.push(line);
    }
    
    const newContent = newLines.join('\n');
    editor.setValue(newContent);
    updatePreviewAndStructure(newContent);
    console.log(`[renderer.js] Successfully removed ${slideMarkerCount} slide markers`);
}

// --- Speaker Notes Functionality ---

// Insert speaker notes template
function insertSpeakerNotesTemplate() {
    if (!editor) {
        console.warn('[renderer.js] Cannot insert speaker notes template - no editor available');
        return;
    }
    
    const position = editor.getPosition();
    const template = '\n\n```notes\nAdd your speaker notes here.\n\nRemember to:\n- Speak clearly and at a moderate pace\n- Make eye contact with your audience\n- Pause for questions\n```\n\n';
    
    editor.executeEdits('insert-speaker-notes', [{
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: template
    }]);
    
    // Position cursor inside the notes block
    const newPosition = {
        lineNumber: position.lineNumber + 2,
        column: 1
    };
    editor.setPosition(newPosition);
    editor.focus();
    
    updatePreviewAndStructure(editor.getValue());
    console.log('[renderer.js] Inserted speaker notes template');
}

// --- Annotation Insertion Functions ---

function insertCommentAnnotation() {
    if (!editor) {
        console.warn('[renderer.js] Cannot insert comment annotation - no editor available');
        return;
    }
    
    const selection = editor.getSelection();
    const position = editor.getPosition();
    
    showAnnotationDialog('comment', (result) => {
        if (result) {
            const template = `<!-- @${result.type}: ${result.content.trim()} -->`;
            
            editor.executeEdits('insert-comment-annotation', [{
                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                text: template
            }]);
            
            editor.focus();
            updatePreviewAndStructure(editor.getValue());
            console.log(`[renderer.js] Inserted comment annotation: ${result.type}`);
        }
    });
}

function insertHighlightAnnotation() {
    if (!editor) {
        console.warn('[renderer.js] Cannot insert highlight annotation - no editor available');
        return;
    }
    
    const selection = editor.getSelection();
    const selectedText = editor.getModel().getValueInRange(selection);
    
    if (!selectedText || selectedText.trim() === '') {
        showNotification('Please select text to highlight before adding an annotation.', 'warning');
        return;
    }
    
    showAnnotationDialog('highlight', (result) => {
        if (result) {
            const template = `==${selectedText}=={@${result.type} ${result.content.trim()}}`;
            
            editor.executeEdits('insert-highlight-annotation', [{
                range: selection,
                text: template
            }]);
            
            editor.focus();
            updatePreviewAndStructure(editor.getValue());
            console.log(`[renderer.js] Inserted highlight annotation: ${result.type}`);
        }
    });
}

function insertBlockAnnotation() {
    if (!editor) {
        console.warn('[renderer.js] Cannot insert block annotation - no editor available');
        return;
    }
    
    const position = editor.getPosition();
    
    showAnnotationDialog('block', (result) => {
        if (result) {
            const template = `\n:::annotation type="${result.type}" author="${result.author}"\n${result.content.trim()}\n:::\n`;
            
            editor.executeEdits('insert-block-annotation', [{
                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                text: template
            }]);
            
            editor.focus();
            updatePreviewAndStructure(editor.getValue());
            console.log(`[renderer.js] Inserted block annotation: ${result.type}`);
        }
    });
}

// --- Annotation Dialog Functions ---

function showAnnotationDialog(annotationType, callback) {
    // Remove any existing dialog
    const existingDialog = document.querySelector('.annotation-dialog');
    if (existingDialog) {
        existingDialog.remove();
    }
    
    // Create dialog overlay
    const overlay = document.createElement('div');
    overlay.className = 'annotation-dialog-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'annotation-dialog';
    dialog.style.cssText = `
        background: white;
        border-radius: 8px;
        padding: 20px;
        min-width: 400px;
        max-width: 500px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    const titleText = annotationType === 'comment' ? 'Add Comment Annotation' :
                     annotationType === 'highlight' ? 'Add Highlight Annotation' :
                     'Add Block Annotation';
    
    dialog.innerHTML = `
        <h3 style="margin: 0 0 16px 0; color: #333;">${titleText}</h3>
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Annotation Type:</label>
            <select id="annotation-type-select" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                <option value="note">📝 Note</option>
                <option value="thought">💭 Thought</option>
                <option value="question">❓ Question</option>
                <option value="warning">⚠️ Warning</option>
                <option value="link">🔗 Link</option>
            </select>
        </div>
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Content:</label>
            <textarea id="annotation-content" placeholder="Enter your annotation content..." style="width: 100%; height: 100px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; resize: vertical; font-family: inherit;"></textarea>
        </div>
        ${annotationType === 'block' ? `
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Author (optional):</label>
            <input type="text" id="annotation-author" placeholder="instructor" value="instructor" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        ` : ''}
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;">
            <button id="annotation-cancel" style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
            <button id="annotation-ok" style="padding: 8px 16px; border: none; background: #2196F3; color: white; border-radius: 4px; cursor: pointer;">Add Annotation</button>
        </div>
    `;
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // Focus the content textarea
    const contentTextarea = dialog.querySelector('#annotation-content');
    setTimeout(() => contentTextarea.focus(), 100);
    
    // Handle button clicks
    const cancelBtn = dialog.querySelector('#annotation-cancel');
    const okBtn = dialog.querySelector('#annotation-ok');
    
    function closeDialog(result = null) {
        overlay.remove();
        callback(result);
    }
    
    cancelBtn.addEventListener('click', () => closeDialog());
    
    okBtn.addEventListener('click', () => {
        const type = dialog.querySelector('#annotation-type-select').value;
        const content = dialog.querySelector('#annotation-content').value.trim();
        const authorInput = dialog.querySelector('#annotation-author');
        const author = authorInput ? authorInput.value.trim() || 'instructor' : 'instructor';
        
        if (!content) {
            showNotification('Please enter annotation content.', 'warning');
            return;
        }
        
        closeDialog({
            type,
            content,
            author
        });
    });
    
    // Handle overlay click to close
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeDialog();
        }
    });
    
    // Handle ESC key
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            closeDialog();
            document.removeEventListener('keydown', handleKeyDown);
        }
    };
    document.addEventListener('keydown', handleKeyDown);
}

function showNotification(message, type = 'info') {
    // Remove any existing notification
    const existingNotification = document.querySelector('.annotation-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = 'annotation-notification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'warning' ? '#ff9800' : '#4caf50'};
        color: white;
        padding: 12px 16px;
        border-radius: 4px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        z-index: 10001;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        max-width: 300px;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}

// Update speaker notes display
function updateSpeakerNotesDisplay() {
    if (!speakerNotesContent) return;
    
    if (currentSpeakerNotes.length === 0) {
        speakerNotesContent.innerHTML = `
            <p style="color: #666; text-align: center; padding: 20px;">
                No speaker notes found.<br>
                <small>Add notes using <code>\`\`\`notes</code> blocks in your Markdown.</small>
            </p>
        `;
        return;
    }
    
    let notesHtml = '';
    currentSpeakerNotes.forEach((note, index) => {
        const noteContent = window.marked ? window.marked.parse(note.content) : note.content.replace(/\n/g, '<br>');
        notesHtml += `
            <div class="speaker-note" style="margin-bottom: 16px; padding: 12px; background: #f8f9fa; border-left: 4px solid #007bff; border-radius: 4px;">
                <div class="speaker-note-header" style="font-size: 12px; color: #666; margin-bottom: 8px; font-weight: bold;">
                    📝 Note ${index + 1}
                </div>
                <div class="speaker-note-content" style="line-height: 1.6;">
                    ${noteContent}
                </div>
            </div>
        `;
    });
    
    speakerNotesContent.innerHTML = notesHtml;
    console.log(`[renderer.js] Updated speaker notes display with ${currentSpeakerNotes.length} notes`);
}

// Toggle speaker notes visibility in preview
function toggleSpeakerNotesInPreview() {
    speakerNotesVisible = !speakerNotesVisible;
    
    const placeholders = document.querySelectorAll('.speaker-notes-placeholder');
    placeholders.forEach(placeholder => {
        if (speakerNotesVisible) {
            const noteId = placeholder.getAttribute('data-note-id');
            const note = currentSpeakerNotes.find(n => n.id === noteId);
            if (note) {
                const noteContent = window.marked ? window.marked.parse(note.content) : note.content.replace(/\n/g, '<br>');
                placeholder.innerHTML = `
                    <div class="speaker-notes-preview" style="margin: 8px 0; padding: 8px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; font-size: 12px;">
                        <div style="font-weight: bold; color: #856404; margin-bottom: 4px;">📝 Speaker Notes:</div>
                        <div style="color: #856404;">${noteContent}</div>
                    </div>
                `;
                placeholder.style.display = 'block';
            }
        } else {
            placeholder.innerHTML = '';
            placeholder.style.display = 'none';
        }
    });
    
    // Update button text
    if (toggleSpeakerNotesInPreviewBtn) {
        toggleSpeakerNotesInPreviewBtn.textContent = speakerNotesVisible ? 'Hide in Preview' : 'Show in Preview';
    }
    
    console.log(`[renderer.js] Speaker notes in preview: ${speakerNotesVisible ? 'visible' : 'hidden'}`);
}

// Initialize speaker notes functionality
function initializeSpeakerNotes() {
    if (showSpeakerNotesBtn) {
        showSpeakerNotesBtn.addEventListener('click', () => {
            showRightPane('speaker-notes');
        });
    }
    
    if (toggleSpeakerNotesInPreviewBtn) {
        toggleSpeakerNotesInPreviewBtn.addEventListener('click', toggleSpeakerNotesInPreview);
    }
    
    console.log('[renderer.js] Speaker notes functionality initialized');
}

// --- Auto-save functionality ---

// Initialize auto-save functionality
function initializeAutoSave() {
    if (!window.appSettings || !window.appSettings.ui || !window.appSettings.ui.autoSave) {
        console.log('[renderer.js] Auto-save disabled in settings');
        return;
    }
    
    const interval = window.appSettings.ui.autoSaveInterval || 2000; // Default 2 seconds
    console.log(`[renderer.js] Auto-save initialized with ${interval}ms interval`);
    
    // Set initial saved content
    if (editor) {
        lastSavedContent = editor.getValue();
    }
}

// Mark that there are unsaved changes and schedule auto-save
function scheduleAutoSave() {
    if (!window.appSettings?.ui?.autoSave) return;
    
    const currentContent = editor ? editor.getValue() : '';
    
    // Check if content has actually changed
    if (currentContent === lastSavedContent) {
        hasUnsavedChanges = false;
        return;
    }
    
    hasUnsavedChanges = true;
    
    // Clear existing timer
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
    }
    
    // Schedule auto-save
    const interval = window.appSettings.ui.autoSaveInterval || 2000;
    autoSaveTimer = setTimeout(() => {
        performAutoSave();
    }, interval);
    
    // Update status indicator
    updateUnsavedIndicator(true);
}

// Perform the actual auto-save
async function performAutoSave() {
    if (!hasUnsavedChanges || !editor) {
        return;
    }
    
    try {
        const content = editor.getValue();
        console.log('[renderer.js] Performing auto-save...');
        
        // Only save if we have a current file path
        if (window.currentFilePath && window.electronAPI) {
            const result = await window.electronAPI.invoke('perform-save', content);
            
            if (result.success) {
                lastSavedContent = content;
                hasUnsavedChanges = false;
                updateUnsavedIndicator(false);
                console.log('[renderer.js] Auto-save completed successfully');
                showNotification('Auto-saved', 'success', 1000); // Brief notification
                
                // Update current file path if this was a save-as operation
                if (result.filePath && result.filePath !== window.currentFilePath) {
                    window.currentFilePath = result.filePath;
                    if (window.electronAPI) {
                        window.electronAPI.invoke('set-current-file', result.filePath);
                    }
                }
            } else {
                console.warn('[renderer.js] Auto-save failed:', result.error);
            }
        } else {
            console.log('[renderer.js] Auto-save skipped - no file path or API unavailable');
        }
    } catch (error) {
        console.error('[renderer.js] Auto-save error:', error);
    }
}

// Update the unsaved changes indicator
function updateUnsavedIndicator(hasUnsaved) {
    const currentFileName = document.getElementById('current-file-name');
    if (currentFileName) {
        const text = currentFileName.textContent;
        if (hasUnsaved && !text.includes('●')) {
            currentFileName.textContent = '● ' + text;
        } else if (!hasUnsaved && text.includes('●')) {
            currentFileName.textContent = text.replace('● ', '');
        }
    }
}

// Mark content as saved (called when user manually saves)
function markContentAsSaved() {
    if (editor) {
        lastSavedContent = editor.getValue();
        hasUnsavedChanges = false;
        updateUnsavedIndicator(false);
        
        // Clear auto-save timer
        if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = null;
        }
    }
}

// Initialize markdown formatting when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeMarkdownFormatting);

// --- Auto-Numbering and Smart List Functions ---

// Initialize smart list behavior
function initializeSmartLists() {
    if (!editor) {
        console.log('[renderer.js] Cannot initialize smart lists - no editor');
        return;
    }
    
    // Use onKeyDown for better control over Enter key
    editor.onKeyDown((e) => {
        if (e.keyCode === monaco.KeyCode.Enter) {
            if (handleSimpleListEnter()) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
    });
    
    console.log('[renderer.js] Smart list behavior initialized with onKeyDown');
}

// Simple list enter handler
function handleSimpleListEnter() {
    if (!editor) {
        return false;
    }
    
    try {
        const position = editor.getPosition();
        const lineContent = editor.getModel().getLineContent(position.lineNumber);
        
        // Check if current line is a numbered list item
        const numberedMatch = lineContent.match(/^(\s*)(\d+)\.\s+(.*)$/);
        if (numberedMatch) {
            const [, indent, currentNum, content] = numberedMatch;
            
            // If empty list item, exit list
            if (content.trim() === '') {
                editor.executeEdits('exit-list', [{
                    range: new monaco.Range(position.lineNumber, 1, position.lineNumber, lineContent.length + 1),
                    text: indent
                }]);
                return true;
            }
            
            // Create next numbered item
            const nextNum = parseInt(currentNum) + 1;
            const newText = '\n' + indent + nextNum + '. ';
            
            // Insert at current cursor position
            editor.executeEdits('continue-list', [{
                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                text: newText
            }]);
            
            // Move cursor to end of new line
            editor.setPosition({
                lineNumber: position.lineNumber + 1,
                column: indent.length + nextNum.toString().length + 3
            });
            
            return true;
        }
        
        // Check if current line is a bulleted list item
        const bulletMatch = lineContent.match(/^(\s*)([-*+])\s+(.*)$/);
        if (bulletMatch) {
            const [, indent, bullet, content] = bulletMatch;
            
            // If empty list item, exit list  
            if (content.trim() === '') {
                editor.executeEdits('exit-list', [{
                    range: new monaco.Range(position.lineNumber, 1, position.lineNumber, lineContent.length + 1),
                    text: indent
                }]);
                return true;
            }
            
            // Create next bulleted item
            const newText = '\n' + indent + bullet + ' ';
            
            // Insert at current cursor position
            editor.executeEdits('continue-list', [{
                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                text: newText
            }]);
            
            // Move cursor to end of new line
            editor.setPosition({
                lineNumber: position.lineNumber + 1,
                column: indent.length + bullet.length + 2
            });
            
            return true;
        }
        
        return false; // Let Monaco handle default Enter behavior
        
    } catch (error) {
        console.error('[handleSimpleListEnter] Error:', error);
        return false;
    }
}

// Get the next number for a numbered list
function getNextListNumber(currentLine, indent) {
    const model = editor.getModel();
    let lastNumber = 0;
    
    // Look backwards from current line to find the last number
    for (let lineNum = currentLine - 1; lineNum >= 1; lineNum--) {
        const lineContent = model.getLineContent(lineNum);
        const listMatch = lineContent.match(/^(\s*)([-*+]|\d+\.)\s*(.*)/);
        
        if (listMatch) {
            const [, lineIndent, marker] = listMatch;
            
            // If indentation doesn't match, we've left this list level
            if (lineIndent.length !== indent.length) {
                break;
            }
            
            // If it's a numbered item at the same level
            const numberMatch = marker.match(/(\d+)\./);
            if (numberMatch) {
                lastNumber = parseInt(numberMatch[1]);
                break;
            }
            
            // If it's a bullet at the same level, we've left the numbered section
            if (marker.match(/[-*+]/)) {
                break;
            }
        } else {
            // Non-list line breaks the list
            break;
        }
    }
    
    return lastNumber + 1;
}

// Handle Tab and Shift+Tab for list indentation
function handleListIndentation(isIndent) {
    if (!editor) return false;
    
    const position = editor.getPosition();
    const lineContent = editor.getModel().getLineContent(position.lineNumber);
    
    // Check if we're on a list line
    const listMatch = lineContent.match(/^(\s*)([-*+]|\d+\.)\s*(.*)/);
    
    if (listMatch) {
        const [, indent, marker, content] = listMatch;
        
        let newIndent;
        if (isIndent) {
            // Add 2 spaces for indentation
            newIndent = indent + '  ';
        } else {
            // Remove 2 spaces for outdentation (minimum 0)
            newIndent = indent.length >= 2 ? indent.substring(2) : '';
        }
        
        // For numbered lists, restart numbering at new indent level
        let newMarker = marker;
        if (marker.match(/\d+\./)) {
            if (isIndent) {
                newMarker = '1.'; // Start new nested numbered list
            } else {
                // When outdenting, get appropriate number for the parent level
                const parentNumber = getNextListNumber(position.lineNumber, newIndent);
                newMarker = parentNumber + '.';
            }
        }
        
        const newLine = newIndent + newMarker + ' ' + content;
        
        const range = new monaco.Range(
            position.lineNumber, 1,
            position.lineNumber, lineContent.length + 1
        );
        
        editor.executeEdits('indent-list', [{
            range: range,
            text: newLine
        }]);
        
        // Maintain cursor position relative to content
        const newCursorColumn = newIndent.length + newMarker.length + 2 + 
                              Math.max(0, position.column - (indent.length + marker.length + 2));
        
        editor.setPosition({
            lineNumber: position.lineNumber,
            column: Math.min(newCursorColumn, newLine.length + 1)
        });
        
        updatePreviewAndStructure(editor.getValue());
        return true;
    }
    
    return false; // Not in a list, use default behavior
}

// Auto-renumber all numbered lists in the document
function renumberAllLists() {
    if (!editor) return;
    
    const model = editor.getModel();
    const totalLines = model.getLineCount();
    const edits = [];
    
    let currentListStart = -1;
    let currentIndent = '';
    let currentNumber = 1;
    
    for (let lineNum = 1; lineNum <= totalLines; lineNum++) {
        const lineContent = model.getLineContent(lineNum);
        const listMatch = lineContent.match(/^(\s*)([-*+]|\d+\.)\s*(.*)/);
        
        if (listMatch) {
            const [, indent, marker, content] = listMatch;
            
            if (marker.match(/\d+\./)) {
                // This is a numbered list item
                
                if (currentListStart === -1 || indent !== currentIndent) {
                    // Starting a new numbered list or new indent level
                    currentListStart = lineNum;
                    currentIndent = indent;
                    currentNumber = 1;
                } else {
                    // Continuing current numbered list
                    currentNumber++;
                }
                
                const correctMarker = currentNumber + '.';
                if (marker !== correctMarker) {
                    // Need to renumber this line
                    const newLine = indent + correctMarker + ' ' + content;
                    edits.push({
                        range: new monaco.Range(lineNum, 1, lineNum, lineContent.length + 1),
                        text: newLine
                    });
                }
            } else {
                // Bullet list item - resets numbered list tracking
                currentListStart = -1;
            }
        } else {
            // Non-list line - resets numbered list tracking
            currentListStart = -1;
        }
    }
    
    if (edits.length > 0) {
        editor.executeEdits('renumber-lists', edits);
        updatePreviewAndStructure(editor.getValue());
        console.log(`[renderer.js] Renumbered ${edits.length} list items`);
    }
}

// Add renumber button to toolbar
function addRenumberButton() {
    const toolbar = document.getElementById('editor-toolbar');
    if (!toolbar) return;
    
    // Find the "Format" separator and add the renumber button after it
    const formatSeparator = Array.from(toolbar.children).find(child => 
        child.textContent && child.textContent.includes('Format')
    );
    
    if (formatSeparator) {
        // Create renumber button
        const renumberBtn = document.createElement('button');
        renumberBtn.id = 'renumber-lists-btn';
        renumberBtn.className = 'toolbar-btn';
        renumberBtn.title = 'Renumber All Lists';
        renumberBtn.style.cssText = 'padding: 4px 8px; border: 1px solid #ccc; background: white; border-radius: 3px; cursor: pointer; font-size: 11px;';
        renumberBtn.innerHTML = '🔢 Renumber';
        
        renumberBtn.addEventListener('click', () => {
            renumberAllLists();
            showNotification('Lists renumbered successfully', 'success');
        });
        
        // Insert after the Format separator
        formatSeparator.parentNode.insertBefore(renumberBtn, formatSeparator.nextSibling);
        
        console.log('[renderer.js] Added renumber button to toolbar');
    }
}

// Initialize smart lists after Monaco editor is ready
function initializeSmartListsWhenReady() {
    // Wait for editor to be initialized
    const checkEditor = setInterval(() => {
        if (editor && editor.getModel) {
            clearInterval(checkEditor);
            initializeSmartLists();
            addRenumberButton();
        }
    }, 100);
    
    // Timeout after 5 seconds
    setTimeout(() => {
        clearInterval(checkEditor);
    }, 5000);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeSmartListsWhenReady);

// === Pane Toggle Functionality ===
let sidebarVisible = true;
let editorVisible = true;
let previewVisible = true;

function toggleSidebar() {
    const sidebar = document.getElementById('left-sidebar');
    const resizer = document.getElementById('sidebar-resizer');
    const toggleBtn = document.getElementById('toggle-sidebar-btn');
    
    if (sidebarVisible) {
        sidebar.style.display = 'none';
        resizer.style.display = 'none';
        toggleBtn.style.background = '#ccc';
        toggleBtn.style.color = '#666';
    } else {
        sidebar.style.display = 'flex';
        resizer.style.display = 'block';
        toggleBtn.style.background = '#007acc';
        toggleBtn.style.color = 'white';
    }
    sidebarVisible = !sidebarVisible;
}

function toggleEditor() {
    const editorPane = document.getElementById('editor-pane');
    const toggleBtn = document.getElementById('toggle-editor-btn');
    
    if (editorVisible) {
        editorPane.style.display = 'none';
        toggleBtn.style.background = '#ccc';
        toggleBtn.style.color = '#666';
        // Adjust preview to take full width
        const previewPane = document.getElementById('preview-pane');
        if (previewPane) previewPane.style.flex = '1';
    } else {
        editorPane.style.display = 'flex';
        toggleBtn.style.background = '#007acc';
        toggleBtn.style.color = 'white';
        // Restore normal layout proportions
        refreshLayoutProportions();
    }
    editorVisible = !editorVisible;
}

function togglePreview() {
    const previewPane = document.getElementById('preview-pane');
    const toggleBtn = document.getElementById('toggle-preview-btn');
    
    if (previewVisible) {
        previewPane.style.display = 'none';
        toggleBtn.style.background = '#ccc';
        toggleBtn.style.color = '#666';
        // Adjust editor to take full width
        const editorPane = document.getElementById('editor-pane');
        if (editorPane) editorPane.style.flex = '1';
    } else {
        previewPane.style.display = 'flex';
        toggleBtn.style.background = '#007acc';
        toggleBtn.style.color = 'white';
        // Restore normal layout proportions
        refreshLayoutProportions();
    }
    previewVisible = !previewVisible;
}

function refreshLayoutProportions() {
    const editorPane = document.getElementById('editor-pane');
    const previewPane = document.getElementById('preview-pane');
    
    // Check if we're in Kanban view
    const isKanban = document.querySelector('.kanban-board') !== null;
    
    if (editorVisible && previewVisible) {
        if (isKanban) {
            editorPane.style.flex = '0 0 300px';
            previewPane.style.flex = '1';
        } else {
            editorPane.style.flex = '1';
            previewPane.style.flex = '1';
        }
    }
}

function forceKanbanHorizontalScroll() {
    const previewContent = document.getElementById('preview-content');
    const kanbanBoard = document.querySelector('.kanban-board');
    
    if (!previewContent || !kanbanBoard) {
        console.log('[Kanban] Preview content or Kanban board not found for scroll setup');
        return;
    }
    
    console.log('[Kanban] Setting up horizontal scroll...');
    
    // CORRECT APPROACH: Constrain the parent containers that are too wide
    // The issue is the main content area is enormous, making preview-content expand
    
    // Find and constrain the problematic parent containers
    const previewPane = document.getElementById('preview-pane');
    const editorContent = document.getElementById('editor-content');
    
    console.log('[Kanban] Preview content width:', previewContent.offsetWidth + 'px');
    console.log('[Kanban] Preview pane width:', previewPane ? previewPane.offsetWidth : 'not found');
    console.log('[Kanban] Editor content width:', editorContent ? editorContent.offsetWidth : 'not found');
    
    // Constrain the preview pane to a reasonable width for Kanban viewing
    const maxKanbanContainerWidth = 1200; // Reasonable max width for Kanban
    
    if (previewPane) {
        previewPane.style.setProperty('max-width', maxKanbanContainerWidth + 'px', 'important');
        previewPane.style.setProperty('overflow-x', 'auto', 'important');
        previewPane.style.setProperty('overflow-y', 'auto', 'important');
        console.log('[Kanban] Constrained preview pane to max', maxKanbanContainerWidth + 'px');
    }
    
    // Set overflow properties on preview content
    previewContent.style.setProperty('overflow-x', 'auto', 'important');
    previewContent.style.setProperty('overflow-y', 'auto', 'important');
    
    // Make Kanban board wider than the constrained container
    const columns = kanbanBoard.querySelectorAll('.kanban-column');
    const minColumnWidth = 350; // Good column width for readability
    const calculatedWidth = columns.length * (minColumnWidth + 16) + 32; // columns * (width + gap) + padding
    const requiredWidth = Math.max(calculatedWidth, maxKanbanContainerWidth + 200); // Ensure overflow
    
    console.log('[Kanban] Found', columns.length, 'columns');
    console.log('[Kanban] Calculated Kanban width:', calculatedWidth + 'px');
    console.log('[Kanban] Required width for overflow:', requiredWidth + 'px');
    
    // Apply natural sizing to Kanban board
    kanbanBoard.style.setProperty('min-width', requiredWidth + 'px', 'important');
    kanbanBoard.style.setProperty('width', 'max-content', 'important');
    kanbanBoard.style.setProperty('flex-shrink', '0', 'important');
    
    // Ensure columns have appropriate width
    columns.forEach(column => {
        column.style.setProperty('min-width', minColumnWidth + 'px', 'important');
        column.style.setProperty('max-width', minColumnWidth + 'px', 'important');
        column.style.setProperty('flex-shrink', '0', 'important');
    });
    
    // Force reflow
    previewContent.offsetHeight;
    
    console.log('[Kanban] After setup:');
    console.log('[Kanban] - Preview pane client width:', previewPane ? previewPane.clientWidth : 'N/A');
    console.log('[Kanban] - Preview content client width:', previewContent.clientWidth);
    console.log('[Kanban] - Preview content scroll width:', previewContent.scrollWidth);
    console.log('[Kanban] - Horizontal scroll available:', previewContent.scrollWidth > previewContent.clientWidth);
    
    if (previewContent.scrollWidth > previewContent.clientWidth) {
        console.log('[Kanban] SUCCESS! Horizontal scrolling should now be available');
        // Test the scroll
        setTimeout(() => {
            previewContent.scrollLeft = 100;
            setTimeout(() => previewContent.scrollLeft = 0, 1000);
        }, 500);
    } else {
        console.log('[Kanban] Still no overflow - may need further adjustment');
    }
}

// Initialize pane toggles
document.addEventListener('DOMContentLoaded', function() {
    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const toggleEditorBtn = document.getElementById('toggle-editor-btn');
    const togglePreviewBtn = document.getElementById('toggle-preview-btn');
    
    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener('click', toggleSidebar);
    }
    
    if (toggleEditorBtn) {
        toggleEditorBtn.addEventListener('click', toggleEditor);
    }
    
    if (togglePreviewBtn) {
        togglePreviewBtn.addEventListener('click', togglePreview);
    }
});

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

// === Kanban Settings Helper Functions ===

function addKanbanColumn() {
    const editor = document.getElementById('kanban-columns-editor');
    if (!editor) return;
    
    const index = editor.children.length;
    const newColumn = document.createElement('div');
    newColumn.className = 'kanban-column-row';
    newColumn.dataset.index = index;
    newColumn.innerHTML = `
        <input type="text" class="column-name" value="New Column" placeholder="Column Name">
        <input type="color" class="column-color" value="#f0f0f0">
        <button type="button" class="remove-column" onclick="removeKanbanColumn(${index})">×</button>
    `;
    editor.appendChild(newColumn);
}

function removeKanbanColumn(index) {
    const editor = document.getElementById('kanban-columns-editor');
    if (!editor) return;
    
    const row = editor.querySelector(`[data-index="${index}"]`);
    if (row) {
        row.remove();
        
        // Reindex remaining rows
        Array.from(editor.children).forEach((child, newIndex) => {
            child.dataset.index = newIndex;
            const removeBtn = child.querySelector('.remove-column');
            if (removeBtn) {
                removeBtn.setAttribute('onclick', `removeKanbanColumn(${newIndex})`);
            }
        });
    }
}

// === Kanban Board Functions ===

function shouldRenderAsKanban(filePath, settings) {
    console.log('[Kanban] shouldRenderAsKanban called with:', { filePath, settings: settings?.kanban });
    
    if (!settings?.kanban?.todoFilePatterns) {
        console.log('[Kanban] No todoFilePatterns found in settings');
        return false;
    }
    
    const fileName = filePath.split('/').pop() || '';
    console.log('[Kanban] Extracted fileName:', fileName);
    console.log('[Kanban] Available patterns:', settings.kanban.todoFilePatterns);
    
    const shouldRender = settings.kanban.todoFilePatterns.some(pattern => {
        const regex = new RegExp(pattern.replace('*', '.*').replace(/\./g, '\\.'), 'i');
        const matches = regex.test(fileName);
        console.log('[Kanban] Testing pattern:', pattern, 'against fileName:', fileName, 'matches:', matches);
        return matches;
    });
    
    console.log('[Kanban] Final shouldRender result:', shouldRender);
    return shouldRender;
}

function parseKanbanFromMarkdown(content, settings) {
    const kanbanSettings = settings?.kanban || {};
    const doneMarkers = kanbanSettings.doneMarkers || ['DONE', 'COMPLETED', '✓', '✔', '[x]', '[X]'];
    const inProgressMarkers = kanbanSettings.inProgressMarkers || ['IN PROGRESS', 'DOING', '⏳', '[~]'];
    const columns = kanbanSettings.columns || [
        { id: 'todo', name: 'To Do', color: '#e3f2fd' },
        { id: 'inprogress', name: 'In Progress', color: '#fff3e0' },
        { id: 'done', name: 'Done', color: '#e8f5e8' }
    ];
    
    const tasks = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Match numbered lists (1. 2. etc.) or bullet points (- * +)
        const listMatch = line.match(/^(\d+\.\s*|\*\s*|\-\s*|\+\s*)(.*)/);
        if (listMatch) {
            const taskText = listMatch[2].trim();
            if (!taskText) continue;
            
            let status = 'todo';
            let cleanText = taskText;
            
            // Check for done markers
            const hasDoneMarker = doneMarkers.some(marker => {
                if (taskText.toUpperCase().includes(marker.toUpperCase())) {
                    cleanText = taskText.replace(new RegExp(marker, 'gi'), '').trim();
                    // Remove common separators left behind
                    cleanText = cleanText.replace(/^[-\s]*|[-\s]*$/g, '').trim();
                    return true;
                }
                return false;
            });
            
            if (hasDoneMarker) {
                status = 'done';
            } else {
                // Check for in-progress markers
                const hasInProgressMarker = inProgressMarkers.some(marker => {
                    if (taskText.toUpperCase().includes(marker.toUpperCase())) {
                        cleanText = taskText.replace(new RegExp(marker, 'gi'), '').trim();
                        cleanText = cleanText.replace(/^[-\s]*|[-\s]*$/g, '').trim();
                        return true;
                    }
                    return false;
                });
                
                if (hasInProgressMarker) {
                    status = 'inprogress';
                }
            }
            
            tasks.push({
                id: `task-${i}`,
                number: listMatch[1].trim(),
                text: cleanText,
                originalText: taskText,
                status: status,
                lineNumber: i
            });
        }
    }
    
    // Group tasks by status
    const tasksByColumn = {};
    columns.forEach(column => {
        tasksByColumn[column.id] = tasks.filter(task => task.status === column.id);
    });
    
    return { columns, tasks, tasksByColumn };
}

function renderKanbanBoard(parsedKanban, filePath) {
    const { columns, tasksByColumn } = parsedKanban;
    
    let boardHtml = '<div class="kanban-board" data-file-path="' + filePath + '">';
    
    columns.forEach(column => {
        const tasks = tasksByColumn[column.id] || [];
        
        boardHtml += `
            <div class="kanban-column" data-column-id="${column.id}" style="background-color: ${column.color}">
                <div class="kanban-column-header">${column.name} (${tasks.length})</div>
                <div class="kanban-tasks" data-column="${column.id}">
        `;
        
        tasks.forEach(task => {
            boardHtml += `
                <div class="kanban-task" 
                     data-task-id="${task.id}"
                     data-line-number="${task.lineNumber}"
                     data-original-status="${task.status}"
                     draggable="true">
                    <div class="kanban-task-number">${task.number}</div>
                    <div class="kanban-task-text">${task.text}</div>
                </div>
            `;
        });
        
        boardHtml += `
                </div>
            </div>
        `;
    });
    
    boardHtml += '</div>';
    
    return boardHtml;
}

function setupKanbanDragAndDrop(container, filePath) {
    const tasks = container.querySelectorAll('.kanban-task');
    const columns = container.querySelectorAll('.kanban-tasks');
    
    // Setup drag events for tasks
    tasks.forEach(task => {
        task.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', task.dataset.taskId);
            task.classList.add('dragging');
        });
        
        task.addEventListener('dragend', () => {
            task.classList.remove('dragging');
        });
    });
    
    // Setup drop events for columns
    columns.forEach(column => {
        column.addEventListener('dragover', (e) => {
            e.preventDefault();
            column.parentElement.classList.add('drag-over');
        });
        
        column.addEventListener('dragleave', (e) => {
            if (!column.contains(e.relatedTarget)) {
                column.parentElement.classList.remove('drag-over');
            }
        });
        
        column.addEventListener('drop', async (e) => {
            e.preventDefault();
            column.parentElement.classList.remove('drag-over');
            
            const taskId = e.dataTransfer.getData('text/plain');
            const task = container.querySelector(`[data-task-id="${taskId}"]`);
            
            if (task && task.parentElement !== column) {
                const newColumnId = column.dataset.column;
                const oldColumnId = task.dataset.originalStatus;
                
                // Move the task visually
                column.appendChild(task);
                task.dataset.originalStatus = newColumnId;
                
                // Update column headers
                updateKanbanColumnHeaders(container);
                
                // Save the change back to the file
                try {
                    // Temporarily disable auto-save to prevent conflicts
                    const wasAutoSaveEnabled = window.appSettings?.ui?.autoSave;
                    if (wasAutoSaveEnabled && autoSaveTimer) {
                        clearTimeout(autoSaveTimer);
                        autoSaveTimer = null;
                        console.log('[Kanban] Temporarily disabled auto-save during Kanban update');
                    }
                    
                    await updateKanbanTaskInFile(filePath, task, newColumnId);
                    showNotification('Task moved successfully', 'success');
                    
                    // Refresh the editor content if this file is currently open
                    if (currentFilePath === filePath) {
                        console.log('[Kanban] Refreshing editor content after task update');
                        await refreshCurrentFile();
                        
                        // Update the lastSavedContent to prevent auto-save conflicts
                        if (editor) {
                            lastSavedContent = editor.getValue();
                            hasUnsavedChanges = false;
                            updateUnsavedIndicator(false);
                        }
                    }
                    
                    // Re-enable auto-save after a short delay
                    if (wasAutoSaveEnabled) {
                        setTimeout(() => {
                            console.log('[Kanban] Re-enabled auto-save after Kanban update');
                        }, 500);
                    }
                } catch (error) {
                    console.error('Error updating task:', error);
                    showNotification('Error saving task change', 'error');
                    
                    // Revert the visual change on error
                    const originalColumn = container.querySelector(`[data-column="${oldColumnId}"]`);
                    if (originalColumn) {
                        originalColumn.appendChild(task);
                        task.dataset.originalStatus = oldColumnId;
                        updateKanbanColumnHeaders(container);
                    }
                }
            }
        });
    });
}

function updateKanbanColumnHeaders(container) {
    const columns = container.querySelectorAll('.kanban-column');
    columns.forEach(column => {
        const header = column.querySelector('.kanban-column-header');
        const tasks = column.querySelectorAll('.kanban-task');
        const columnName = header.textContent.replace(/\s*\(\d+\)$/, '');
        header.textContent = `${columnName} (${tasks.length})`;
    });
}

async function updateKanbanTaskInFile(filePath, taskElement, newStatus) {
    console.log(`[Kanban] === Starting updateKanbanTaskInFile ===`);
    console.log(`[Kanban] FilePath: ${filePath}`);
    console.log(`[Kanban] NewStatus: ${newStatus}`);
    console.log(`[Kanban] TaskElement dataset:`, taskElement.dataset);
    
    try {
        // Get current file content
        console.log(`[Kanban] Reading current file content...`);
        const content = await window.electronAPI.invoke('read-file', filePath);
        console.log(`[Kanban] File content length: ${content.length}`);
        console.log(`[Kanban] File content preview:`, content.substring(0, 300));
        
        const lines = content.split('\n');
        const lineNumber = parseInt(taskElement.dataset.lineNumber);
        console.log(`[Kanban] Target line number: ${lineNumber}`);
        
        if (lineNumber >= 0 && lineNumber < lines.length) {
            const originalLine = lines[lineNumber];
            const taskText = taskElement.querySelector('.kanban-task-text').textContent;
            
            // Get current settings to determine markers
            const settings = await window.electronAPI.invoke('get-settings');
            const kanbanSettings = settings.kanban || {};
            const doneMarkers = kanbanSettings.doneMarkers || ['DONE'];
            const inProgressMarkers = kanbanSettings.inProgressMarkers || ['IN PROGRESS'];
            
            // Remove existing status markers
            let newLine = originalLine;
            [...doneMarkers, ...inProgressMarkers].forEach(marker => {
                newLine = newLine.replace(new RegExp(`\\s*-\\s*${marker}\\s*`, 'gi'), '');
                newLine = newLine.replace(new RegExp(`\\s*${marker}\\s*-\\s*`, 'gi'), '');
                newLine = newLine.replace(new RegExp(`\\s*${marker}\\s*`, 'gi'), '');
            });
            
            // Add new status marker
            if (newStatus === 'done') {
                newLine = newLine.trim() + ' - ' + doneMarkers[0];
            } else if (newStatus === 'inprogress') {
                newLine = newLine.trim() + ' - ' + inProgressMarkers[0];
            }
            
            // Update the line
            lines[lineNumber] = newLine;
            
            // Save the file
            console.log(`[Kanban] About to write file with updated content:`, lines[lineNumber]);
            await window.electronAPI.invoke('write-file', filePath, lines.join('\n'));
            
            console.log(`[Kanban] Updated task on line ${lineNumber} to status: ${newStatus}`);
        }
    } catch (error) {
        console.error('[Kanban] Error updating file:', error);
        throw error;
    }
}
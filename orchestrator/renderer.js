console.log('RENDERER.JS TEST - Main script is loading');
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
const findNextEl = document.getElementById('find-next');
const findPreviousEl = document.getElementById('find-previous');
const replaceCurrent = document.getElementById('replace-current');
const replaceAllEl = document.getElementById('replace-all');
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

// Internal links processing is handled by the internalLinks.js module

// --- Process Annotations ---
// Annotations processing is handled by the annotations.js module

// --- Internal Links Functionality ---
// All internal links functionality has been moved to modules/internalLinks.js
// --- Update Function Definition ---
async function updatePreviewAndStructure(markdownContent) {
    console.log('[renderer.js] Updating preview and structure...'); // Add logging
    console.log('[renderer.js] Current file path:', window.currentFilePath);
    console.log('[renderer.js] Markdown content length:', markdownContent?.length || 0);
    
    // Check if we should suppress this preview update (for PDF/non-markdown files)
    if (window.suppressNextPreviewUpdate || window.suppressPreviewUpdateCount > 0) {
        console.log('[renderer.js] Suppressing preview update as requested');
        window.suppressNextPreviewUpdate = false;
        if (window.suppressPreviewUpdateCount > 0) {
            window.suppressPreviewUpdateCount--;
            console.log('[renderer.js] Remaining suppression count:', window.suppressPreviewUpdateCount);
        }
        return;
    }
    
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
            .then(async settings => {
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
                await renderRegularMarkdown(markdownContent);
            })
            .catch(async error => {
                console.error('[renderer.js] Error checking Kanban rendering:', error);
                // Fall back to regular markdown rendering
                await renderRegularMarkdown(markdownContent);
            });
        
        return; // Exit to avoid double rendering
    }
    
    // If no currentFilePath, render regular markdown
    await renderRegularMarkdown(markdownContent);
}

async function renderRegularMarkdown(markdownContent) {
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
            // processAnnotations is handled by the annotations.js module
            let processedContent = markdownContent;
            if (typeof processAnnotations === 'function') {
                processedContent = processAnnotations(markdownContent);
            }
            
            // Process speaker notes after annotations
            processedContent = processSpeakerNotes(processedContent);
            
            // Process Obsidian-style [[]] internal links last (now async)
            // processInternalLinks is handled by the internalLinks.js module
            if (typeof processInternalLinks === 'function') {
                processedContent = await processInternalLinks(processedContent);
            }
            
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
async function initializeApp() {
    console.log('[renderer.js] Initializing application...');
    console.log('[renderer.js] Initializing Monaco editor...');
    require(['vs/editor/editor.main'], async function() {
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
            
            // Make editor available globally for formatting functions
            window.editor = editor;
            console.log('[renderer.js] Monaco editor instance created and assigned to window.editor.');
            
            // Register custom Markdown folding provider and add shortcuts
            setTimeout(() => {
                registerMarkdownFoldingProvider();
                addFoldingKeyboardShortcuts();
                addFoldingToolbarControls();
                addAISummarizationAction();
                console.log('[renderer.js] Folding features and AI actions initialized');
            }, 100);
            
            await updatePreviewAndStructure(editor.getValue());
            editor.onDidChangeModelContent(async () => {
                const currentContent = editor.getValue();
                await updatePreviewAndStructure(currentContent);
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
            await createFallbackEditor(); 
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
                        .then(async result => {
                            console.log('[renderer.js] File loading result:', result);
                            if (result.success && result.content) {
                                console.log(`[renderer.js] Successfully loaded file content, length: ${result.content.length}`);
                                await openFileInEditor(result.filePath, result.content);
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
    window.electronAPI.on('file-opened', async (data) => {
        console.log('[Renderer] Received file-opened event:', data);
        if (data && typeof data.content === 'string' && typeof data.filePath === 'string') {
            await openFileInEditor(data.filePath, data.content);
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
            
            await openFileInEditor(result.filePath, result.content);
            
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

async function openFileInEditor(filePath, content) {
    console.log('[Renderer] Opening file in editor:', filePath);
    
    // Detect file type
    const isPDF = filePath.endsWith('.pdf');
    const isHTML = filePath.endsWith('.html') || filePath.endsWith('.htm');
    const isBibTeX = filePath.endsWith('.bib');
    const isMarkdown = filePath.endsWith('.md') || filePath.endsWith('.markdown');
    
    // Set current file path globally for auto-save
    window.currentFilePath = filePath;
    
    // Highlight the currently opened file in the file tree
    highlightCurrentFileInTree(filePath);
    
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
        await handleHTMLFile(filePath, content);
        return;
    }
    
    // Handle editable files (Markdown, BibTeX)
    await handleEditableFile(filePath, content, { isBibTeX, isMarkdown });
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
        .then(async markdownResult => {
            if (markdownResult && markdownResult.success) {
                console.log('[Renderer] Loading associated markdown file in editor');
                // Set a counter for multiple suppression calls
                window.suppressPreviewUpdateCount = 2; // For both Monaco event and handleEditableFile call
                await handleEditableFile(associatedMdFile, markdownResult.content, { isMarkdown: true });
            } else {
                // No associated markdown, clear editor without updating preview
                clearEditor(true);
            }
            
            // Display PDF in preview panel (this should not be overridden)
            displayPDFInPreview(filePath);
        })
        .catch(error => {
            console.error('[Renderer] Error checking for associated markdown:', error);
            clearEditor(true);
            displayPDFInPreview(filePath);
        });
}

// Handle HTML file opening
async function handleHTMLFile(filePath, content) {
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
        .then(async markdownResult => {
            if (markdownResult && markdownResult.success) {
                console.log('[Renderer] Loading associated markdown file in editor');
                // Set suppression counter for both Monaco event and handleEditableFile call
                window.suppressPreviewUpdateCount = 2;
                await handleEditableFile(associatedMdFile, markdownResult.content, { isMarkdown: true });
            } else {
                // No associated markdown, load the HTML content in the editor
                console.log('[Renderer] No associated markdown found, loading HTML content in editor');
                // Suppress preview updates so HTML file content shows in preview, not markdown rendering
                window.suppressPreviewUpdateCount = 2;
                await handleEditableFile(filePath, content, { isHTML: true });
            }
            
            // Display HTML in preview panel (should not be overridden by markdown rendering)
            displayHTMLInPreview(content, filePath);
        })
        .catch(async error => {
            console.error('[Renderer] Error checking for associated markdown:', error);
            // Fallback to loading HTML content in editor
            window.suppressPreviewUpdateCount = 2;
            await handleEditableFile(filePath, content, { isHTML: true });
            displayHTMLInPreview(content, filePath);
        });
}

// Handle editable files (Markdown, BibTeX, HTML)
async function handleEditableFile(filePath, content, fileTypes) {
    console.log('[Renderer] Handling editable file:', filePath, fileTypes);
    
    // Set up internal link click handler if not already done
    if (!window.internalLinkHandlerSetup) {
        document.addEventListener('click', handleInternalLinkClick);
        window.internalLinkHandlerSetup = true;
        console.log('[Renderer] Internal link click handler set up');
    }
    
    // Set up link preview handlers if not already done
    if (!window.linkPreviewHandlerSetup) {
        setupLinkPreviewHandlers();
        window.linkPreviewHandlerSetup = true;
        console.log('[Renderer] Link preview handlers set up');
    }
    
    // Set editor content and language (Monaco or fallback)
    if (editor && typeof editor.setValue === 'function') {
        editor.setValue(content);
        
        // Configure language and theme based on file type
        const model = editor.getModel();
        if (model) {
            if (fileTypes.isBibTeX) {
                monaco.editor.setModelLanguage(model, 'bibtex');
                // Apply appropriate BibTeX theme based on current theme
                const isDarkTheme = editor._themeService?.getColorTheme()?.type === 'dark' || 
                                  window.currentTheme === 'dark';
                editor.updateOptions({ theme: isDarkTheme ? 'bibtex-dark' : 'bibtex-light' });
                console.log('[Renderer] Configured editor for BibTeX file with', isDarkTheme ? 'dark' : 'light', 'theme');
            } else if (fileTypes.isHTML) {
                monaco.editor.setModelLanguage(model, 'html');
                editor.updateOptions({ theme: window.currentTheme === 'dark' ? 'vs-dark' : 'vs' });
                console.log('[Renderer] Configured editor for HTML file');
            } else {
                // Default to markdown for .md files and others
                monaco.editor.setModelLanguage(model, 'markdown');
                editor.updateOptions({ theme: window.currentTheme === 'dark' ? 'vs-dark' : 'vs' });
                console.log('[Renderer] Configured editor for Markdown file');
            }
        }
    } else if (fallbackEditor) {
        fallbackEditor.value = content;
    }
    
    // Update last saved content for auto-save tracking
    lastSavedContent = content;
    hasUnsavedChanges = false;
    updateUnsavedIndicator(false);
    
    // Update preview and structure (unless suppressed)
    if (!window.suppressNextPreviewUpdate && !window.suppressPreviewUpdateCount) {
        await updatePreviewAndStructure(content);
    } else {
        console.log('[Renderer] Skipping preview update in handleEditableFile due to suppression');
        // Don't clear the flags here - let updatePreviewAndStructure handle the counters
    }
    
    // Sync content to presentation view (if available)
    if (window.syncContentToPresentation) {
        console.log('[Renderer] Syncing file content to presentation view');
        window.syncContentToPresentation(content);
    }
    
    // Save current file to settings (redundant, but ensures consistency)
    window.electronAPI.invoke('set-current-file', filePath);
}

// Clear the editor
function clearEditor(suppressPreviewUpdate = false) {
    console.log('[Renderer] Clearing editor for non-editable file, suppressPreviewUpdate:', suppressPreviewUpdate);
    
    if (editor && typeof editor.setValue === 'function') {
        if (suppressPreviewUpdate) {
            // Set a flag to prevent the next preview update
            window.suppressNextPreviewUpdate = true;
        }
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
async function createFallbackEditor() {
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
    await updatePreviewAndStructure(textarea.value);
    textarea.addEventListener('input', async () => {
        await updatePreviewAndStructure(textarea.value);
    });
    
    // Update cursor position for fallback editor
    textarea.addEventListener('selectionchange', updateFallbackCursorPosition);
    textarea.addEventListener('keyup', updateFallbackCursorPosition);
    textarea.addEventListener('mouseup', updateFallbackCursorPosition);
    
    console.log('[renderer.js] Fallback editor created and initialized.');
}

// --- Global Keyboard Shortcuts ---
document.addEventListener('keydown', async (e) => {
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
        await formatText('**', '**', 'bold text');
        return;
    }
    
    // Ctrl+I or Cmd+I: Italic
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        await formatText('*', '*', 'italic text');
        return;
    }
    
    // Ctrl+` or Cmd+`: Inline code
    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        await formatText('`', '`', 'code');
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
            findPrevious();
        } else {
            findNext();
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
        await initializeApp(); // Initialize now that Marked is ready and DOM is loaded
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
findNextEl.addEventListener('click', findNext);
findPreviousEl.addEventListener('click', findPrevious);
replaceCurrent.addEventListener('click', replaceNext);
replaceAllEl.addEventListener('click', replaceAll);

// Input event listeners
findInput.addEventListener('input', performSearch);
findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
            findPrevious();
        } else {
            findNext();
        }
    } else if (e.key === 'Escape') {
        hideFindReplaceDialog();
    }
});

replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        replaceNext();
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

// --- File Tree Functions ---
async function renderFileTree() {
    if (!window.electronAPI) {
        console.warn('[renderFileTree] ElectronAPI not available');
        return;
    }
    
    try {
        console.log('[renderFileTree] Requesting file tree...');
        const fileTree = await window.electronAPI.invoke('request-file-tree');
        console.log('[renderFileTree] Received file tree:', fileTree);
        
        if (!fileTreeView) {
            console.warn('[renderFileTree] fileTreeView element not found');
            return;
        }
        
        // Clear existing content
        fileTreeView.innerHTML = '';
        
        // Render the file tree
        if (fileTree && fileTree.children) {
            renderFileTreeNode(fileTree, fileTreeView, 0);
        } else {
            fileTreeView.innerHTML = '<div class="no-files">No files found</div>';
        }
        
        console.log('[renderFileTree] File tree rendered successfully');
    } catch (error) {
        console.error('[renderFileTree] Error loading file tree:', error);
        if (fileTreeView) {
            fileTreeView.innerHTML = '<div class="error">Error loading files</div>';
        }
    }
}

function renderFileTreeNode(node, container, depth) {
    const nodeElement = document.createElement('div');
    nodeElement.className = 'file-tree-item';
    nodeElement.style.paddingLeft = `${depth * 16}px`;
    
    const isFolder = node.type === 'folder' || node.type === 'directory';
    const icon = isFolder ? '📁' : '📄';
    const fileName = node.name;
    
    nodeElement.innerHTML = `
        <span class="file-icon">${icon}</span>
        <span class="file-name">${fileName}</span>
    `;
    
    // Add click handler for files
    if (!isFolder && node.path) {
        nodeElement.classList.add('file-clickable');
        nodeElement.addEventListener('click', async () => {
            try {
                console.log(`[renderFileTree] Opening file: ${node.path}`);
                const result = await window.electronAPI.invoke('open-file-path', node.path);
                if (result.success && window.openFileInEditor) {
                    await window.openFileInEditor(result.filePath, result.content);
                }
            } catch (error) {
                console.error('[renderFileTree] Error opening file:', error);
            }
        });
    }
    
    container.appendChild(nodeElement);
    
    // Render children if it's a folder
    if (isFolder && node.children && node.children.length > 0) {
        for (const child of node.children) {
            renderFileTreeNode(child, container, depth + 1);
        }
    }
}

function highlightCurrentFileInTree(filePath) {
    if (!fileTreeView || !filePath) {
        return;
    }
    
    try {
        console.log('[highlightCurrentFileInTree] Highlighting file:', filePath);
        
        // Remove existing highlights
        const existingHighlights = fileTreeView.querySelectorAll('.file-tree-item.current-file');
        existingHighlights.forEach(item => item.classList.remove('current-file'));
        
        // Find and highlight the current file
        const fileItems = fileTreeView.querySelectorAll('.file-tree-item');
        const fileName = filePath.split('/').pop();
        
        for (const item of fileItems) {
            const fileNameSpan = item.querySelector('.file-name');
            if (fileNameSpan && fileNameSpan.textContent === fileName) {
                item.classList.add('current-file');
                console.log('[highlightCurrentFileInTree] Highlighted file:', fileName);
                break;
            }
        }
    } catch (error) {
        console.error('[highlightCurrentFileInTree] Error highlighting file:', error);
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

// Navigation history management is handled by the navigation.js module

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
    window.electronAPI.on('file-opened', async (data) => {
        console.log('[Renderer] Received file-opened event:', data);
        if (data && typeof data.content === 'string' && typeof data.filePath === 'string') {
            await openFileInEditor(data.filePath, data.content);
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

// AI chat functionality is handled by the aiChat.js module

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

// Export functionality including HTML generation is handled by the export.js module

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

// Global search functionality is handled by the search.js module



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

// Initialize formatting directly
setTimeout(() => {
    console.log('[Renderer] Initializing formatting directly...');
    
    const formatBoldBtn = document.getElementById('format-bold-btn');
    const formatItalicBtn = document.getElementById('format-italic-btn');
    const formatCodeBtn = document.getElementById('format-code-btn');
    
    if (formatBoldBtn && window.formatText) {
        formatBoldBtn.addEventListener('click', async () => await window.formatText('**', '**', 'bold text'));
        console.log('[Renderer] Bold button initialized');
    }
    if (formatItalicBtn && window.formatText) {
        formatItalicBtn.addEventListener('click', async () => await window.formatText('*', '*', 'italic text'));
        console.log('[Renderer] Italic button initialized');
    }
    if (formatCodeBtn && window.formatText) {
        formatCodeBtn.addEventListener('click', async () => await window.formatText('`', '`', 'code'));
        console.log('[Renderer] Code button initialized');
    }
    
    console.log('[Renderer] Direct formatting initialization complete');
}, 2000);

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

// --- Command Palette ---
// Command palette functionality moved to modules/commandPalette.js
// Export command functions are handled by the export.js module
console.log('[renderer.js] Script executing...');

// --- Electron IPC (for theme) ---
// Access IPC functions exposed by preload.js via window.electronAPI

// --- Electron Remote (for context menu) ---
// Context menu items (Menu, MenuItem) are now handled in the main process

// --- Global Variables ---
let editor = null;
let markedInstance = null;

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
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const loadEditorToChatBtn = document.getElementById('load-editor-to-chat-btn'); // Get the new button
const copyAIResponseBtn = document.getElementById('copy-ai-response-btn'); // New button

// Keep require.config as needed - only if require is available
if (typeof require !== 'undefined') {
    require.config({ paths: { 'vs': './node_modules/monaco-editor/min/vs' } });
}

// --- Update Function Definition ---
function updatePreviewAndStructure(markdownContent) {
    console.log('[renderer.js] Updating preview and structure...'); // Add logging
    if (!previewContent) {
        console.error('[renderer.js] previewContent element not found!');
        return; // Don't proceed if the element is missing
    }

    try {
        // Create a custom Marked renderer
        const renderer = new marked.Renderer();
        const originalHeading = renderer.heading.bind(renderer); // Keep original renderer
        const originalImage = renderer.image.bind(renderer); // Keep original image renderer

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
            // Use the custom renderer with marked.parse
            const htmlContent = window.marked.parse(markdownContent, { renderer: renderer, gfm: true, breaks: true });
            previewContent.innerHTML = htmlContent;
            console.log('[renderer.js] Preview updated with heading IDs.');
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

// --- Initialize Application ---
function initializeApp() {
    console.log('[renderer.js] Initializing application...');
    console.log('[renderer.js] Initializing Monaco editor...');
    require(['vs/editor/editor.main'], function() {
        console.log('[renderer.js] Monaco module loaded.');
        try {
            editor = monaco.editor.create(editorContainer, {
                value: '# My Markdown Document\n\n' +
                       '## Introduction\n' +
                       'Welcome to the advanced Markdown editor. This document contains multiple sections and demonstrates various Markdown features.\n\n' +
                       '## Features\n' +
                       '- **Live Preview**: See your Markdown rendered in real time.\n' +
                       '- **Editor**: Powered by Monaco.\n' +
                       '- **Structure Pane**: Automatically extracts headings from your document.\n\n' +
                       '### Code Example\n' +
                       '```javascript\n' +
                       'console.log("Hello, world!");\n' +
                       '```\n\n' +
                       '## Workflow\n' +
                       '1. Write your Markdown.\n' +
                       '2. The structure pane updates automatically.\n' +
                       '3. View the live preview in real time.\n\n' +
                       '## Conclusion\n' +
                       'Thank you for using our editor.',
                language: 'markdown',
                theme: 'vs-dark',
                automaticLayout: true,
                wordWrap: 'on'
            });
            console.log('[renderer.js] Monaco editor instance created.');
            updatePreviewAndStructure(editor.getValue());
            editor.onDidChangeModelContent(() => {
                const currentContent = editor.getValue();
                updatePreviewAndStructure(currentContent);
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
            window.electronAPI.invoke('open-file-path', appSettings.currentFile)
                .then(result => {
                    if (result.success && result.content) {
                        openFileInEditor(result.filePath, result.content);
                    } else {
                        console.warn('[renderer.js] Could not reopen last file:', result.error);
                    }
                })
                .catch(err => {
                    console.error('[renderer.js] Error reopening last file:', err);
                });
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
function openFileInEditor(filePath, content) {
    console.log('[Renderer] Opening file in editor:', filePath);
    
    // Store current file directory for image path resolution
    // Extract directory from file path
    const lastSlash = filePath.lastIndexOf('/');
    window.currentFileDirectory = lastSlash >= 0 ? filePath.substring(0, lastSlash) : '';
    console.log('[Renderer] Set current file directory:', window.currentFileDirectory);
    
    // Set editor content (Monaco or fallback)
    if (editor && typeof editor.setValue === 'function') {
        editor.setValue(content);
    } else if (fallbackEditor) {
        fallbackEditor.value = content;
    }
    
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
    console.log('[renderer.js] Fallback editor created and initialized.');
}

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

// Function to load settings from main process
async function loadAppSettings() {
    if (!window.electronAPI) {
        console.error('[renderer.js] electronAPI not available for loading settings.');
        return;
    }
    try {
        appSettings = await window.electronAPI.invoke('get-settings');
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

// --- Structure/File Pane Toggle Listeners ---
let currentStructureView = 'structure'; // 'structure' or 'file'

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

// --- Right Pane Toggle Listeners (Existing) ---
showPreviewBtn.addEventListener('click', () => {
    if (previewPane.style.display === 'none') {
        previewPane.style.display = '';
        chatPane.style.display = 'none';
        showPreviewBtn.classList.add('active');
        showChatBtn.classList.remove('active');
    }
});

showChatBtn.addEventListener('click', () => {
    if (chatPane.style.display === 'none') {
        chatPane.style.display = '';
        previewPane.style.display = 'none';
        showChatBtn.classList.add('active');
        showPreviewBtn.classList.remove('active');
    }
});

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
        // Optionally, re-run structure update if needed
        // updateStructurePane(editor?.getValue() || '');
    } else { // view === 'file'
        structurePaneTitle.textContent = 'Files';
        showStructureBtn.classList.remove('active');
        showFilesBtn.classList.add('active');
        structureList.style.display = 'none'; // Hide structure list
        fileTreeView.style.display = ''; // Show file tree
        renderFileTree(); // Populate the file tree view
    }
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
                   childrenList.style.display = isVisible ? 'none' : '';
                   // Optional: Change folder icon based on state
                   target.textContent = isVisible ? `📁 ${target.textContent.substring(2)}` : `📂 ${target.textContent.substring(2)}`;
         }
    }
});

// Add right-click context menu for file deletion
fileTreeView.addEventListener('contextmenu', (event) => {
    const target = event.target;
    
    // Only show context menu for files, not folders
    if (target.classList.contains('file') && target.dataset.path) {
        event.preventDefault(); // Prevent default context menu
        
        const filePath = target.dataset.path;
        const fileName = target.textContent.substring(2); // Remove the 📄 emoji
        
        // Create a simple context menu
        const contextMenu = document.createElement('div');
        contextMenu.className = 'context-menu';
        contextMenu.style.cssText = `
            position: fixed;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            z-index: 1000;
            padding: 4px 0;
            min-width: 120px;
        `;
        
        const deleteOption = document.createElement('div');
        deleteOption.className = 'context-menu-item';
        deleteOption.textContent = 'Delete File';
        deleteOption.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            color: #dc3545;
            font-size: 14px;
        `;
        
        deleteOption.addEventListener('mouseenter', () => {
            deleteOption.style.backgroundColor = '#f8f9fa';
        });
        
        deleteOption.addEventListener('mouseleave', () => {
            deleteOption.style.backgroundColor = '';
        });
        
        deleteOption.addEventListener('click', async () => {
            // Show confirmation dialog
            const confirmed = await window.electronAPI.invoke('show-delete-confirm', {
                fileName: fileName,
                filePath: filePath
            });
            
            if (confirmed) {
                try {
                    const result = await window.electronAPI.invoke('delete-file', filePath);
                    if (result.success) {
                        console.log('[Renderer] File deleted successfully:', filePath);
                        // Refresh the file tree to show the file is gone
                        renderFileTree();
                    } else {
                        console.error('[Renderer] Error deleting file:', result.error);
                    }
                } catch (error) {
                    console.error('[Renderer] Error deleting file:', error);
                }
            }
            
            // Remove context menu
            document.body.removeChild(contextMenu);
        });
        
        contextMenu.appendChild(deleteOption);
        
        // Position the context menu at the mouse position
        contextMenu.style.left = event.pageX + 'px';
        contextMenu.style.top = event.pageY + 'px';
        
        document.body.appendChild(contextMenu);
        
        // Remove context menu when clicking elsewhere
        const removeContextMenu = (e) => {
            if (!contextMenu.contains(e.target)) {
                document.body.removeChild(contextMenu);
                document.removeEventListener('click', removeContextMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', removeContextMenu);
        }, 100);
    }
});

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

// Function to load settings from main process
async function loadAppSettings() {
    if (!window.electronAPI) {
        console.error('[renderer.js] electronAPI not available for loading settings.');
        return;
    }
    try {
        appSettings = await window.electronAPI.invoke('get-settings');
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
                // Optional: Add UI feedback (e.g., status bar message)
            } else {
                // Check if it failed due to an error or just cancellation/non-error
                if (result.error) {
                     console.error(`[Renderer] Save failed: ${result.error}`);
                     // Optional: Show specific error to user
                } else {
                     console.log('[Renderer] Save operation did not complete (e.g., was cancelled).');
                     // Optional: Add different UI feedback for cancellation
                }
            }
        } catch (error) {
            console.error('[Renderer] Error invoking perform-save:', error);
            // Optional: Show error to user
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
                // Optional: Add UI feedback
             } else {
                 // Check if it failed due to an error or just cancellation/non-error
                 if (result.error) {
                      console.error(`[Renderer] Save As failed: ${result.error}`);
                      // Optional: Show specific error to user
                 } else {
                      console.log('[Renderer] Save As operation did not complete (e.g., was cancelled).');
                      // Optional: Add different UI feedback for cancellation
                 }
             }
        } catch (error) {
            console.error('[Renderer] Error invoking perform-save-as:', error);
            // Optional: Show error to user
        }
    });
}

// --- End Save/Save As Logic ---

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
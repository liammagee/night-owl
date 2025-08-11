// === Command Palette Module ===
// Provides a command palette interface for quick access to all application functions
// Supports keyboard navigation, fuzzy search, and keyboard shortcuts

// --- Command Registry ---
let commandRegistry = new Map();
let commandPalette = null;
let selectedIndex = 0;

// --- Command Registration ---
function registerCommand(id, label, action, shortcut = null) {
    commandRegistry.set(id, {
        id,
        label,
        action,
        shortcut,
        searchText: label.toLowerCase()
    });
}

// --- Initialize Command Palette ---
function initializeCommandPalette() {
    // File Operations
    registerCommand('file.new', 'File: New File', () => window.newFile(), 'Cmd+N');
    registerCommand('file.open', 'File: Open File', () => window.openFile(), 'Cmd+O');
    registerCommand('file.save', 'File: Save', () => window.saveFile(), 'Cmd+S');
    registerCommand('file.saveAs', 'File: Save As...', () => window.saveAsFile(), 'Cmd+Shift+S');
    registerCommand('file.openFolder', 'File: Open Folder', () => window.changeDirectory(), 'Cmd+Shift+O');
    registerCommand('file.newFolder', 'File: New Folder', () => window.showNewFolderModal());
    
    // Edit Operations
    registerCommand('edit.find', 'Edit: Find and Replace', () => window.showFindReplaceDialog(), 'Cmd+F');
    registerCommand('edit.findGlobal', 'Edit: Global Search', () => window.showGlobalSearchDialog(), 'Cmd+Shift+F');
    registerCommand('edit.undo', 'Edit: Undo', () => window.editor?.trigger('source', 'undo'), 'Cmd+Z');
    registerCommand('edit.redo', 'Edit: Redo', () => window.editor?.trigger('source', 'redo'), 'Cmd+Shift+Z');
    
    // View Operations
    registerCommand('view.togglePreview', 'View: Toggle Preview', () => window.togglePreview(), 'Cmd+Shift+V');
    registerCommand('view.toggleStructure', 'View: Toggle Structure Panel', () => window.toggleStructurePane());
    registerCommand('view.toggleFiles', 'View: Toggle File Explorer', () => window.toggleFilePane());
    registerCommand('view.presentationMode', 'View: Enter Presentation Mode', () => window.enterPresentationMode(), 'F5');
    registerCommand('view.kanban', 'View: Open Kanban Board', () => window.showKanbanBoard(), 'Cmd+K');
    
    // Formatting
    registerCommand('format.bold', 'Format: Bold', () => window.applyMarkdownFormatting('**'), 'Cmd+B');
    registerCommand('format.italic', 'Format: Italic', () => window.applyMarkdownFormatting('*'), 'Cmd+I');
    registerCommand('format.code', 'Format: Inline Code', () => window.applyMarkdownFormatting('`'), 'Cmd+`');
    registerCommand('format.codeBlock', 'Format: Code Block', () => window.insertCodeBlock(), 'Cmd+Shift+`');
    registerCommand('format.link', 'Format: Insert Link', () => window.insertLink(), 'Cmd+L');
    registerCommand('format.image', 'Format: Insert Image', () => window.insertImage());
    registerCommand('format.table', 'Format: Insert Table', () => window.insertTable());
    registerCommand('format.heading1', 'Format: Heading 1', () => window.insertHeading(1), 'Cmd+1');
    registerCommand('format.heading2', 'Format: Heading 2', () => window.insertHeading(2), 'Cmd+2');
    registerCommand('format.heading3', 'Format: Heading 3', () => window.insertHeading(3), 'Cmd+3');
    
    // Annotations
    registerCommand('annotation.comment', 'Annotation: Insert Comment', async () => await window.insertCommentAnnotation());
    registerCommand('annotation.highlight', 'Annotation: Insert Highlight', async () => await window.insertHighlightAnnotation());
    registerCommand('annotation.block', 'Annotation: Insert Block', async () => await window.insertBlockAnnotation());
    
    // Navigation
    registerCommand('nav.back', 'Navigate: Back', () => window.navigateBack());
    registerCommand('nav.forward', 'Navigate: Forward', () => window.navigateForward());
    registerCommand('nav.gotoLine', 'Navigate: Go to Line', () => window.showGoToLineDialog(), 'Ctrl+G');
    
    // Folding
    registerCommand('fold.all', 'Fold: Fold All', () => window.foldAll());
    registerCommand('fold.unfoldAll', 'Fold: Unfold All', () => window.unfoldAll());
    registerCommand('fold.current', 'Fold: Fold Current', () => window.foldCurrent());
    registerCommand('fold.unfoldCurrent', 'Fold: Unfold Current', () => window.unfoldCurrent());
    
    // Export
    registerCommand('export.pdf', 'Export: PDF', () => window.exportToPDF());
    registerCommand('export.pdfWithRefs', 'Export: PDF with References', () => window.exportToPDFWithReferences());
    registerCommand('export.html', 'Export: HTML', () => window.exportToHTML());
    registerCommand('export.htmlWithRefs', 'Export: HTML with References', () => window.exportToHTMLWithReferences());
    registerCommand('export.powerpoint', 'Export: PowerPoint', () => window.exportToPowerPoint());
    
    // AI Operations
    registerCommand('ai.summarize', 'AI: Summarize Document', () => window.summarizeDocument());
    registerCommand('ai.chat', 'AI: Open Chat', () => window.openAIChat());
    
    // Settings
    registerCommand('settings.open', 'Settings: Open Preferences', () => window.openSettings(), 'Cmd+,');
    registerCommand('settings.theme.toggle', 'Settings: Toggle Theme', () => window.toggleTheme());
    registerCommand('settings.linkPreview.toggle', 'Settings: Toggle Link Previews', async () => await window.toggleLinkPreview());
    
    // Speaker Notes
    registerCommand('speaker.toggle', 'Speaker Notes: Toggle View', () => window.toggleSpeakerNotesView());
    registerCommand('speaker.add', 'Speaker Notes: Add Note', () => window.addSpeakerNote());
    
    console.log(`[CommandPalette] Registered ${commandRegistry.size} commands`);
    
    // Set up keyboard shortcut to show command palette
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
            e.preventDefault();
            showCommandPalette();
        }
    });
}

// --- Command Palette UI ---
function showCommandPalette() {
    if (commandPalette) {
        hideCommandPalette();
        return;
    }
    
    // Create command palette overlay
    commandPalette = document.createElement('div');
    commandPalette.className = 'command-palette-overlay';
    commandPalette.innerHTML = `
        <div class="command-palette">
            <div class="command-palette-input-container">
                <input type="text" class="command-palette-input" placeholder="Type a command..." autocomplete="off" spellcheck="false">
                <div class="command-palette-shortcut">Ctrl+Shift+P</div>
            </div>
            <div class="command-palette-results" id="command-results"></div>
        </div>
    `;
    
    document.body.appendChild(commandPalette);
    
    const input = commandPalette.querySelector('.command-palette-input');
    const results = commandPalette.querySelector('.command-palette-results');
    
    // Focus input
    setTimeout(() => input.focus(), 10);
    
    // Show all commands initially
    selectedIndex = 0;
    updateCommandResults('', results);
    
    // Handle input changes
    input.addEventListener('input', (e) => {
        selectedIndex = 0; // Reset selection when search changes
        updateCommandResults(e.target.value, results);
    });
    
    // Handle keyboard navigation
    input.addEventListener('keydown', async (e) => {
        const items = results.querySelectorAll('.command-item');
        
        switch (e.key) {
            case 'Escape':
                e.preventDefault();
                hideCommandPalette();
                break;
                
            case 'ArrowDown':
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                updateSelection(items, selectedIndex);
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, 0);
                updateSelection(items, selectedIndex);
                break;
                
            case 'Enter':
                e.preventDefault();
                const selectedItem = items[selectedIndex];
                if (selectedItem) {
                    await executeCommand(selectedItem.dataset.commandId);
                }
                hideCommandPalette();
                break;
        }
    });
    
    // Handle click outside to close
    commandPalette.addEventListener('click', (e) => {
        if (e.target === commandPalette) {
            hideCommandPalette();
        }
    });
}

function hideCommandPalette() {
    if (commandPalette) {
        document.body.removeChild(commandPalette);
        commandPalette = null;
        
        // Return focus to editor
        if (window.editor) {
            setTimeout(() => window.editor.focus(), 10);
        }
    }
}

function updateCommandResults(query, resultsContainer) {
    const filteredCommands = Array.from(commandRegistry.values())
        .filter(cmd => cmd.searchText.includes(query.toLowerCase()))
        .slice(0, 50);
    
    resultsContainer.innerHTML = filteredCommands.map((cmd, index) => `
        <div class="command-item ${index === 0 ? 'selected' : ''}" data-command-id="${cmd.id}">
            <div class="command-label">${highlightMatch(cmd.label, query)}</div>
            ${cmd.shortcut ? `<div class="command-shortcut">${cmd.shortcut}</div>` : ''}
        </div>
    `).join('');
    
    // Add click handlers
    resultsContainer.querySelectorAll('.command-item').forEach(item => {
        item.addEventListener('click', async () => {
            await executeCommand(item.dataset.commandId);
            hideCommandPalette();
        });
    });
}

function highlightMatch(text, query) {
    if (!query) return text;
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

function updateSelection(items, selectedIndex) {
    items.forEach((item, index) => {
        item.classList.toggle('selected', index === selectedIndex);
    });
    
    // Scroll selected item into view
    const selectedItem = items[selectedIndex];
    if (selectedItem) {
        selectedItem.scrollIntoView({ 
            block: 'nearest', 
            behavior: 'smooth',
            inline: 'nearest'
        });
    }
}

async function executeCommand(commandId) {
    const command = commandRegistry.get(commandId);
    if (command) {
        console.log(`[CommandPalette] Executing command: ${command.label}`);
        try {
            await command.action();
        } catch (error) {
            console.error(`[CommandPalette] Error executing command ${commandId}:`, error);
            if (window.showNotification) {
                window.showNotification(`Error executing command: ${command.label}`, 'error');
            }
        }
    }
}

// --- Export Functions for Global Access ---
window.showCommandPalette = showCommandPalette;
window.hideCommandPalette = hideCommandPalette;
window.initializeCommandPalette = initializeCommandPalette;
window.registerCommand = registerCommand;
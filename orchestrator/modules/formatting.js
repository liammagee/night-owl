// --- Markdown Formatting Functions ---

// Initialize markdown formatting
function initializeMarkdownFormatting() {
    
    // Get references to formatting buttons (inside initialization to ensure DOM is ready)
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
    
    if (formatBoldBtn) formatBoldBtn.addEventListener('click', async () => await formatText('**', '**', 'bold text'));
    if (formatItalicBtn) formatItalicBtn.addEventListener('click', async () => await formatText('*', '*', 'italic text'));
    if (formatCodeBtn) formatCodeBtn.addEventListener('click', async () => await formatText('`', '`', 'code'));
    
    if (formatH1Btn) formatH1Btn.addEventListener('click', async () => await formatHeading(1));
    if (formatH2Btn) formatH2Btn.addEventListener('click', async () => await formatHeading(2));
    if (formatH3Btn) formatH3Btn.addEventListener('click', async () => await formatHeading(3));
    
    if (formatListBtn) formatListBtn.addEventListener('click', async () => await formatList('-'));
    if (formatNumberedListBtn) formatNumberedListBtn.addEventListener('click', async () => await formatList('1.'));
    if (formatQuoteBtn) formatQuoteBtn.addEventListener('click', async () => await formatBlockquote());
    
    if (formatLinkBtn) formatLinkBtn.addEventListener('click', async () => await insertLink());
    if (formatImageBtn) formatImageBtn.addEventListener('click', () => insertImage());
    if (formatTableBtn) formatTableBtn.addEventListener('click', () => insertTable());
    if (autoSlideMarkersBtn) autoSlideMarkersBtn.addEventListener('click', async () => await addSlideMarkersToParagraphs());
    if (removeSlideMarkersBtn) removeSlideMarkersBtn.addEventListener('click', async () => await removeAllSlideMarkers());
    if (insertSpeakerNotesBtn) insertSpeakerNotesBtn.addEventListener('click', async () => await insertSpeakerNotesTemplate());
    
    // Annotation button event handlers
    const insertCommentAnnotationBtn = document.getElementById('insert-comment-annotation-btn');
    const insertHighlightAnnotationBtn = document.getElementById('insert-highlight-annotation-btn');
    const insertBlockAnnotationBtn = document.getElementById('insert-block-annotation-btn');
    
    if (insertCommentAnnotationBtn) insertCommentAnnotationBtn.addEventListener('click', async () => await window.insertCommentAnnotation());
    if (insertHighlightAnnotationBtn) insertHighlightAnnotationBtn.addEventListener('click', async () => await window.insertHighlightAnnotation());
    if (insertBlockAnnotationBtn) insertBlockAnnotationBtn.addEventListener('click', async () => await window.insertBlockAnnotation());
    
}


// === Formatting Module ===
// Handles all Markdown formatting functions including:
// - Text formatting (bold, italic, code)
// - Headings (H1, H2, H3)
// - Lists (bulleted and numbered)
// - Blockquotes
// - Links and images
// - Tables
// - Slide markers
// - Speaker notes

// --- Text Formatting ---
async function formatText(prefix, suffix, placeholder) {
    if (!window.editor) return;
    
    const selection = window.editor.getSelection();
    const selectedText = window.editor.getModel().getValueInRange(selection);
    
    if (selectedText) {
        // Wrap selected text
        const newText = prefix + selectedText + suffix;
        window.editor.executeEdits('format-text', [{
            range: selection,
            text: newText
        }]);
        
        // Update selection to include the new formatting
        const endPos = {
            lineNumber: selection.endLineNumber,
            column: selection.endColumn + prefix.length + suffix.length
        };
        window.editor.setSelection(new monaco.Selection(
            selection.startLineNumber,
            selection.startColumn,
            endPos.lineNumber,
            endPos.column
        ));
    } else {
        // Insert placeholder text with formatting
        const position = window.editor.getPosition();
        const newText = prefix + placeholder + suffix;
        
        window.editor.executeEdits('format-text', [{
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
        
        window.editor.setSelection(new monaco.Selection(
            startPos.lineNumber,
            startPos.column,
            endPos.lineNumber,
            endPos.column
        ));
    }
    
    window.editor.focus();
    if (window.updatePreviewAndStructure) {
        await window.updatePreviewAndStructure(window.editor.getValue());
    }
}

// --- Heading Formatting ---
async function formatHeading(level) {
    if (!window.editor) return;
    
    const position = window.editor.getPosition();
    const lineContent = window.editor.getModel().getLineContent(position.lineNumber);
    
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
    
    window.editor.executeEdits('format-heading', [{
        range: range,
        text: newLine
    }]);
    
    // Position cursor at end of line
    window.editor.setPosition({
        lineNumber: position.lineNumber,
        column: newLine.length + 1
    });
    
    window.editor.focus();
    if (window.updatePreviewAndStructure) {
        await window.updatePreviewAndStructure(window.editor.getValue());
    }
}

// --- List Formatting ---
async function formatList(marker) {
    if (!window.editor) return;
    
    const selection = window.editor.getSelection();
    const model = window.editor.getModel();
    
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
        window.editor.executeEdits('format-list', edits);
    } else {
        // If no selection, create a new list item
        const position = window.editor.getPosition();
        const newText = marker + ' ';
        
        window.editor.executeEdits('format-list', [{
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            text: newText
        }]);
        
        window.editor.setPosition({
            lineNumber: position.lineNumber,
            column: position.column + newText.length
        });
    }
    
    window.editor.focus();
    if (window.updatePreviewAndStructure) {
        await window.updatePreviewAndStructure(window.editor.getValue());
    }
}

// --- Blockquote Formatting ---
async function formatBlockquote() {
    if (!window.editor) return;
    
    const selection = window.editor.getSelection();
    const model = window.editor.getModel();
    
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
        window.editor.executeEdits('format-blockquote', edits);
    } else {
        // If no selection, create a new blockquote
        const position = window.editor.getPosition();
        const newText = '> ';
        
        window.editor.executeEdits('format-blockquote', [{
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            text: newText
        }]);
        
        window.editor.setPosition({
            lineNumber: position.lineNumber,
            column: position.column + newText.length
        });
    }
    
    window.editor.focus();
    if (window.updatePreviewAndStructure) {
        await window.updatePreviewAndStructure(window.editor.getValue());
    }
}

// --- Link Insertion ---
async function insertLink() {
    if (!window.editor) return;
    
    const selection = window.editor.getSelection();
    const selectedText = window.editor.getModel().getValueInRange(selection);
    
    // Simple prompt for now - could be enhanced with a modal dialog
    const url = prompt('Enter the URL:');
    if (!url) return;
    
    const linkText = selectedText || prompt('Enter the link text:') || 'link';
    const linkMarkdown = `[${linkText}](${url})`;
    
    window.editor.executeEdits('insert-link', [{
        range: selection,
        text: linkMarkdown
    }]);
    
    window.editor.focus();
    if (window.updatePreviewAndStructure) {
        await window.updatePreviewAndStructure(window.editor.getValue());
    }
}

// --- Image Insertion ---
async function insertImage() {
    if (!window.editor) return;
    
    const url = prompt('Enter the image URL:');
    if (!url) return;
    
    const altText = prompt('Enter the alt text:') || 'image';
    const imageMarkdown = `![${altText}](${url})`;
    
    const position = window.editor.getPosition();
    window.editor.executeEdits('insert-image', [{
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: imageMarkdown
    }]);
    
    window.editor.focus();
    if (window.updatePreviewAndStructure) {
        await window.updatePreviewAndStructure(window.editor.getValue());
    }
}

// --- Table Insertion ---
async function insertTable() {
    if (!window.editor) return;
    
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
    
    const position = window.editor.getPosition();
    window.editor.executeEdits('insert-table', [{
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: '\n' + tableMarkdown
    }]);
    
    window.editor.focus();
    if (window.updatePreviewAndStructure) {
        await window.updatePreviewAndStructure(window.editor.getValue());
    }
}

// --- Slide Markers ---
async function addSlideMarkersToParagraphs() {
    if (!window.editor) {
        return;
    }
    
    const content = window.editor.getValue();
    const lines = content.split('\n');
    const newLines = [];
    let i = 0;
    
    
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
            }
        }
        
        i++;
    }
    
    const newContent = newLines.join('\n');
    if (newContent !== content) {
        window.editor.setValue(newContent);
        if (window.updatePreviewAndStructure) {
            await window.updatePreviewAndStructure(newContent);
        }
    } else {
    }
}

async function removeAllSlideMarkers() {
    if (!window.editor) {
        return;
    }
    
    const content = window.editor.getValue();
    const slideMarkerCount = (content.match(/^---$/gm) || []).length;
    
    if (slideMarkerCount === 0) {
        alert('No slide markers found in the document.');
        return;
    }
    
    // Show confirmation dialog
    const confirmed = confirm(`Are you sure you want to remove all ${slideMarkerCount} slide markers from the document?\n\nThis action cannot be undone.`);
    
    if (!confirmed) {
        return;
    }
    
    
    const lines = content.split('\n');
    const newLines = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Skip lines that are just slide markers
        if (trimmed === '---') {
            continue;
        }
        
        newLines.push(line);
    }
    
    const newContent = newLines.join('\n');
    window.editor.setValue(newContent);
    if (window.updatePreviewAndStructure) {
        await window.updatePreviewAndStructure(newContent);
    }
}

// --- Speaker Notes ---
async function insertSpeakerNotesTemplate() {
    if (!window.editor) {
        return;
    }
    
    const position = window.editor.getPosition();
    const template = '\n\n```notes\nAdd your speaker notes here.\n\nRemember to:\n- Speak clearly and at a moderate pace\n- Make eye contact with your audience\n- Pause for questions\n```\n\n';
    
    window.editor.executeEdits('insert-speaker-notes', [{
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: template
    }]);
    
    // Position cursor inside the notes block
    const newPosition = {
        lineNumber: position.lineNumber + 2,
        column: 1
    };
    window.editor.setPosition(newPosition);
    window.editor.focus();
    
    if (window.updatePreviewAndStructure) {
        window.updatePreviewAndStructure(window.editor.getValue());
    }
}

// --- Initialization ---
function initializeMarkdownFormatting() {
    
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
    
    // Text formatting
    if (formatBoldBtn) formatBoldBtn.addEventListener('click', async () => await formatText('**', '**', 'bold text'));
    if (formatItalicBtn) formatItalicBtn.addEventListener('click', async () => await formatText('*', '*', 'italic text'));
    if (formatCodeBtn) formatCodeBtn.addEventListener('click', async () => await formatText('`', '`', 'code'));
    
    // Headings
    if (formatH1Btn) formatH1Btn.addEventListener('click', async () => await formatHeading(1));
    if (formatH2Btn) formatH2Btn.addEventListener('click', async () => await formatHeading(2));
    if (formatH3Btn) formatH3Btn.addEventListener('click', async () => await formatHeading(3));
    
    // Lists and blockquotes
    if (formatListBtn) formatListBtn.addEventListener('click', async () => await formatList('-'));
    if (formatNumberedListBtn) formatNumberedListBtn.addEventListener('click', async () => await formatList('1.'));
    if (formatQuoteBtn) formatQuoteBtn.addEventListener('click', async () => await formatBlockquote());
    
    // Links, images, tables
    if (formatLinkBtn) formatLinkBtn.addEventListener('click', async () => await insertLink());
    if (formatImageBtn) formatImageBtn.addEventListener('click', async () => await insertImage());
    if (formatTableBtn) formatTableBtn.addEventListener('click', async () => await insertTable());
    
    // Slide markers and speaker notes
    if (autoSlideMarkersBtn) autoSlideMarkersBtn.addEventListener('click', async () => await addSlideMarkersToParagraphs());
    if (removeSlideMarkersBtn) removeSlideMarkersBtn.addEventListener('click', async () => await removeAllSlideMarkers());
    if (insertSpeakerNotesBtn) insertSpeakerNotesBtn.addEventListener('click', async () => await insertSpeakerNotesTemplate());
    
}

// --- Utility Functions ---
function applyMarkdownFormatting(wrapper) {
    formatText(wrapper, wrapper, 'text');
}

function insertHeading(level) {
    formatHeading(level);
}

function insertCodeBlock() {
    if (!window.editor) return;
    
    const position = window.editor.getPosition();
    const template = '\n```\n// Your code here\n```\n';
    
    window.editor.executeEdits('insert-code-block', [{
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: template
    }]);
    
    // Position cursor inside the code block
    const newPosition = {
        lineNumber: position.lineNumber + 2,
        column: 1
    };
    window.editor.setPosition(newPosition);
    window.editor.focus();
}

// --- Export for Global Access ---
window.formatText = formatText;
window.formatHeading = formatHeading;
window.formatList = formatList;
window.formatBlockquote = formatBlockquote;
window.insertLink = insertLink;
window.insertImage = insertImage;
window.insertTable = insertTable;
window.insertCodeBlock = insertCodeBlock;
window.addSlideMarkersToParagraphs = addSlideMarkersToParagraphs;
window.removeAllSlideMarkers = removeAllSlideMarkers;
window.insertSpeakerNotesTemplate = insertSpeakerNotesTemplate;
window.initializeMarkdownFormatting = initializeMarkdownFormatting;

// --- Initialization is called from renderer.js with a delay ---
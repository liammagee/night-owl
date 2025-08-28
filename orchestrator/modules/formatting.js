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
    const formatInlineMathBtn = document.getElementById('format-inline-math-btn');
    const formatDisplayMathBtn = document.getElementById('format-display-math-btn');
    const autoSlideMarkersBtn = document.getElementById('auto-slide-markers-btn');
    const removeSlideMarkersBtn = document.getElementById('remove-slide-markers-btn');
    const insertSpeakerNotesBtn = document.getElementById('insert-speaker-notes-btn');
    const insertTocBtn = document.getElementById('insert-toc-btn');
    const removeTocBtn = document.getElementById('remove-toc-btn');
    const commandPaletteBtn = document.getElementById('command-palette-btn');
    
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
    if (formatInlineMathBtn) formatInlineMathBtn.addEventListener('click', async () => await formatText('$', '$', 'math'));
    if (formatDisplayMathBtn) formatDisplayMathBtn.addEventListener('click', async () => await formatDisplayMath());
    if (autoSlideMarkersBtn) autoSlideMarkersBtn.addEventListener('click', async () => await addSlideMarkersToParagraphs());
    if (removeSlideMarkersBtn) removeSlideMarkersBtn.addEventListener('click', async () => await removeAllSlideMarkers());
    if (insertSpeakerNotesBtn) insertSpeakerNotesBtn.addEventListener('click', async () => await insertSpeakerNotesTemplate());
    if (insertTocBtn) insertTocBtn.addEventListener('click', async () => await insertTableOfContents());
    if (removeTocBtn) removeTocBtn.addEventListener('click', async () => await removeTableOfContents());
    if (commandPaletteBtn) commandPaletteBtn.addEventListener('click', () => {
        if (window.showCommandPalette) window.showCommandPalette();
    });
    
    // Annotation button event handlers
    const insertCommentAnnotationBtn = document.getElementById('insert-comment-annotation-btn');
    const insertHighlightAnnotationBtn = document.getElementById('insert-highlight-annotation-btn');
    const insertBlockAnnotationBtn = document.getElementById('insert-block-annotation-btn');
    
    if (insertCommentAnnotationBtn) insertCommentAnnotationBtn.addEventListener('click', async () => await window.insertCommentAnnotation());
    if (insertHighlightAnnotationBtn) insertHighlightAnnotationBtn.addEventListener('click', async () => await window.insertHighlightAnnotation());
    if (insertBlockAnnotationBtn) insertBlockAnnotationBtn.addEventListener('click', async () => await window.insertBlockAnnotation());
    
    // Add ToC buttons dynamically (in case they're not in HTML)
    setTimeout(() => {
        addToCButtons();
    }, 100);
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

// --- Dialog Utility ---
function createInputDialog(title, fields, callback) {
    const dialog = document.createElement('div');
    dialog.className = 'input-dialog-overlay';
    dialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    
    const dialogContent = document.createElement('div');
    dialogContent.className = 'input-dialog-content';
    dialogContent.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        min-width: 400px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    
    const titleEl = document.createElement('h3');
    titleEl.textContent = title;
    titleEl.style.margin = '0 0 15px 0';
    dialogContent.appendChild(titleEl);
    
    const form = document.createElement('form');
    const inputs = {};
    
    fields.forEach(field => {
        const fieldDiv = document.createElement('div');
        fieldDiv.style.marginBottom = '12px';
        
        const label = document.createElement('label');
        label.textContent = field.label + ':';
        label.style.display = 'block';
        label.style.marginBottom = '5px';
        fieldDiv.appendChild(label);
        
        const input = document.createElement('input');
        input.type = field.type || 'text';
        input.value = field.value || '';
        input.placeholder = field.placeholder || '';
        input.style.cssText = `
            width: 100%;
            padding: 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-sizing: border-box;
        `;
        inputs[field.name] = input;
        fieldDiv.appendChild(input);
        
        form.appendChild(fieldDiv);
    });
    
    const buttonDiv = document.createElement('div');
    buttonDiv.style.cssText = `
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
    `;
    
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
        padding: 8px 16px;
        background: #f5f5f5;
        border: 1px solid #ccc;
        border-radius: 4px;
        cursor: pointer;
    `;
    
    const okBtn = document.createElement('button');
    okBtn.type = 'submit';
    okBtn.textContent = 'OK';
    okBtn.style.cssText = `
        padding: 8px 16px;
        background: #007acc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    `;
    
    buttonDiv.appendChild(cancelBtn);
    buttonDiv.appendChild(okBtn);
    form.appendChild(buttonDiv);
    
    dialogContent.appendChild(form);
    dialog.appendChild(dialogContent);
    
    // Event handlers
    const cleanup = () => document.body.removeChild(dialog);
    
    cancelBtn.onclick = cleanup;
    dialog.onclick = (e) => { if (e.target === dialog) cleanup(); };
    
    form.onsubmit = (e) => {
        e.preventDefault();
        const values = {};
        fields.forEach(field => {
            values[field.name] = inputs[field.name].value;
        });
        cleanup();
        callback(values);
    };
    
    document.body.appendChild(dialog);
    
    // Focus first input
    if (fields.length > 0) {
        inputs[fields[0].name].focus();
    }
}

// --- Link Insertion ---
async function insertLink() {
    if (!window.editor) return;
    
    const selection = window.editor.getSelection();
    const selectedText = window.editor.getModel().getValueInRange(selection);
    
    createInputDialog('Insert Link', [
        { name: 'url', label: 'URL', placeholder: 'https://example.com' },
        { name: 'text', label: 'Link Text', value: selectedText, placeholder: 'Link text' }
    ], async (values) => {
        if (!values.url) return;
        
        const linkText = values.text || 'link';
        const linkMarkdown = `[${linkText}](${values.url})`;
        
        window.editor.executeEdits('insert-link', [{
            range: selection,
            text: linkMarkdown
        }]);
        
        window.editor.focus();
        if (window.updatePreviewAndStructure) {
            await window.updatePreviewAndStructure(window.editor.getValue());
        }
    });
}

// --- Image Insertion ---
async function insertImage() {
    if (!window.editor) return;
    
    createImageDialog();
}

function createImageDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'input-dialog-overlay';
    dialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    
    const dialogContent = document.createElement('div');
    dialogContent.className = 'input-dialog-content';
    dialogContent.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        min-width: 450px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        color: black;
    `;
    
    const titleEl = document.createElement('h3');
    titleEl.textContent = 'Insert Image';
    titleEl.style.margin = '0 0 15px 0';
    dialogContent.appendChild(titleEl);
    
    // Image source section
    const sourceLabel = document.createElement('label');
    sourceLabel.textContent = 'Image Source:';
    sourceLabel.style.cssText = 'display: block; margin-bottom: 8px; font-weight: bold;';
    dialogContent.appendChild(sourceLabel);
    
    const sourceContainer = document.createElement('div');
    sourceContainer.style.cssText = 'display: flex; gap: 10px; margin-bottom: 15px; align-items: stretch;';
    
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'Enter image URL or select a file...';
    urlInput.style.cssText = 'flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;';
    
    const selectFileBtn = document.createElement('button');
    selectFileBtn.textContent = 'Select Image File';
    selectFileBtn.style.cssText = `
        background: #007acc;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        white-space: nowrap;
    `;
    
    sourceContainer.appendChild(urlInput);
    sourceContainer.appendChild(selectFileBtn);
    dialogContent.appendChild(sourceContainer);
    
    // Alt text section
    const altLabel = document.createElement('label');
    altLabel.textContent = 'Alt Text:';
    altLabel.style.cssText = 'display: block; margin-bottom: 8px; font-weight: bold;';
    dialogContent.appendChild(altLabel);
    
    const altInput = document.createElement('input');
    altInput.type = 'text';
    altInput.value = 'image';
    altInput.placeholder = 'Description of the image';
    altInput.style.cssText = 'width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 15px; box-sizing: border-box;';
    dialogContent.appendChild(altInput);
    
    // Button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; justify-content: flex-end; gap: 10px;';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;';
    
    const okBtn = document.createElement('button');
    okBtn.textContent = 'Insert Image';
    okBtn.style.cssText = 'padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;';
    
    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(okBtn);
    dialogContent.appendChild(buttonContainer);
    
    dialog.appendChild(dialogContent);
    document.body.appendChild(dialog);
    
    // Event handlers
    selectFileBtn.addEventListener('click', async () => {
        try {
            const result = await window.electronAPI.invoke('browse-for-image');
            if (result.success) {
                urlInput.value = result.relativePath || result.filePath;
                // Auto-populate alt text with filename (without extension)
                if (!altInput.value || altInput.value === 'image') {
                    altInput.value = result.fileName.replace(/\.[^/.]+$/, '');
                }
                console.log('[Formatting] Image selected:', result.fileName);
            }
        } catch (error) {
            console.error('[Formatting] Error selecting image:', error);
        }
    });
    
    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(dialog);
    });
    
    okBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        const alt = altInput.value.trim() || 'image';
        
        if (!url) {
            alert('Please enter an image URL or select an image file.');
            return;
        }
        
        const imageMarkdown = `![${alt}](${url})`;
        
        const position = window.editor.getPosition();
        window.editor.executeEdits('insert-image', [{
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            text: imageMarkdown
        }]);
        
        window.editor.focus();
        if (window.updatePreviewAndStructure) {
            await window.updatePreviewAndStructure(window.editor.getValue());
        }
        
        document.body.removeChild(dialog);
    });
    
    // Focus on URL input initially
    setTimeout(() => urlInput.focus(), 100);
    
    // Close on Escape key
    const keyHandler = (e) => {
        if (e.key === 'Escape') {
            document.body.removeChild(dialog);
            document.removeEventListener('keydown', keyHandler);
        }
    };
    document.addEventListener('keydown', keyHandler);
    
    // Close on overlay click
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            document.body.removeChild(dialog);
            document.removeEventListener('keydown', keyHandler);
        }
    });
}

// --- Table Insertion ---
async function insertTable() {
    if (!window.editor) return;
    
    createInputDialog('Insert Table', [
        { name: 'rows', label: 'Number of Rows', type: 'number', value: '3', placeholder: '3' },
        { name: 'cols', label: 'Number of Columns', type: 'number', value: '3', placeholder: '3' }
    ], async (values) => {
        const rows = parseInt(values.rows) || 3;
        const cols = parseInt(values.cols) || 3;
        
        if (rows < 1 || cols < 1) return;
        
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
    });
}

// --- Math Formatting ---
async function formatDisplayMath() {
    if (!window.editor) return;
    
    const selection = window.editor.getSelection();
    const selectedText = window.editor.getModel().getValueInRange(selection);
    
    let mathContent = selectedText || 'E = mc^2';
    const displayMath = `$$\n${mathContent}\n$$`;
    
    window.editor.executeEdits('format-display-math', [{
        range: selection,
        text: displayMath
    }]);
    
    // Position cursor after the math block if no text was selected
    if (!selectedText) {
        const position = window.editor.getPosition();
        const newPosition = {
            lineNumber: position.lineNumber - 1,
            column: mathContent.length + 1
        };
        window.editor.setPosition(newPosition);
        window.editor.focus();
    }
    
    if (window.updatePreviewAndStructure) {
        await window.updatePreviewAndStructure(window.editor.getValue());
    }
}

// --- Slide Markers ---
async function addSlideMarkersToParagraphs() {
    if (!window.editor) {
        console.error('[addSlideMarkersToParagraphs] No editor available');
        return;
    }
    
    // Add confirmation dialog to prevent accidental modifications
    const confirmed = confirm(
        'This will add slide markers (---) after each paragraph in your document.\n\n' +
        'This is useful for creating presentation slides from your content.\n\n' +
        'Do you want to continue?'
    );
    
    if (!confirmed) {
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
        
        // Count how many markers were added
        const originalMarkers = (content.match(/^---$/gm) || []).length;
        const newMarkers = (newContent.match(/^---$/gm) || []).length;
        const markersAdded = newMarkers - originalMarkers;
        
        if (window.showNotification) {
            window.showNotification(`Added ${markersAdded} slide marker${markersAdded !== 1 ? 's' : ''}`, 'success');
        }
    } else {
        if (window.showNotification) {
            window.showNotification('No paragraphs needed slide markers', 'info');
        }
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
    
    if (window.showNotification) {
        window.showNotification(`Removed ${slideMarkerCount} slide marker${slideMarkerCount !== 1 ? 's' : ''}`, 'success');
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

// --- Table of Contents ---
async function insertTableOfContents() {
    if (!window.editor) return;
    
    const content = window.editor.getValue();
    const lines = content.split('\n');
    
    // Check if ToC already exists
    const tocStartRegex = /^<!-- TOC START -->/;
    const existingTocLine = lines.findIndex(line => tocStartRegex.test(line.trim()));
    
    if (existingTocLine !== -1) {
        alert('Table of Contents already exists. Remove it first if you want to regenerate.');
        return;
    }
    
    // Extract headings and prepare edits
    const headings = [];
    const edits = [];
    let tocInsertOffset = 0; // Track line offset for ToC insertion
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        
        if (headingMatch) {
            const level = headingMatch[1].length;
            let text = headingMatch[2].trim();
            
            // If heading already has anchor tags, extract the clean text
            const anchorRegex = /<a\s+id="[^"]*"><\/a>/g;
            const cleanText = text.replace(anchorRegex, '').trim();
            const anchor = generateAnchor(cleanText);
            
            // Check if heading already has an anchor
            const hasAnchor = text.includes('<a id=') || text.includes('<a name=');
            
            if (!hasAnchor) {
                // Add anchor to heading
                const newHeading = `${headingMatch[1]} <a id="${anchor}"></a>${cleanText}`;
                edits.push({
                    range: new monaco.Range(i + 1, 1, i + 1, line.length + 1),
                    text: newHeading
                });
            }
            
            headings.push({
                level,
                text: cleanText, // Use clean text for ToC links
                anchor,
                lineNumber: i + 1
            });
        }
    }
    
    if (headings.length === 0) {
        alert('No headings found in the document.');
        return;
    }
    
    // Generate ToC content
    let tocContent = '<!-- TOC START -->\n## <a id="table-of-contents"></a>Table of Contents\n\n';
    
    for (const heading of headings) {
        const indent = '  '.repeat(Math.max(0, heading.level - 1)); // Indent based on heading level
        const link = `[${heading.text}](#${heading.anchor})`;
        tocContent += `${indent}- ${link}\n`;
    }
    
    tocContent += '\n<!-- TOC END -->\n\n';
    
    // Apply all edits in a single operation
    // First add anchors to headings, then insert ToC
    if (edits.length > 0) {
        window.editor.executeEdits('add-heading-anchors', edits);
    }
    
    // Insert ToC at the beginning of the document
    window.editor.executeEdits('insert-toc', [{
        range: new monaco.Range(1, 1, 1, 1),
        text: tocContent
    }]);
    
    // Position cursor after ToC
    const tocLines = tocContent.split('\n').length;
    window.editor.setPosition({
        lineNumber: tocLines,
        column: 1
    });
    
    window.editor.focus();
    
    if (window.updatePreviewAndStructure) {
        await window.updatePreviewAndStructure(window.editor.getValue());
    }
    
    alert(`Table of Contents inserted with ${headings.length} headings and anchors.`);
}

async function removeTableOfContents() {
    if (!window.editor) return;
    
    const content = window.editor.getValue();
    const lines = content.split('\n');
    
    // Find ToC boundaries
    const tocStartRegex = /^<!-- TOC START -->/;
    const tocEndRegex = /^<!-- TOC END -->/;
    
    let startLine = -1;
    let endLine = -1;
    
    for (let i = 0; i < lines.length; i++) {
        if (startLine === -1 && tocStartRegex.test(lines[i].trim())) {
            startLine = i;
        } else if (startLine !== -1 && tocEndRegex.test(lines[i].trim())) {
            endLine = i;
            break;
        }
    }
    
    if (startLine === -1 || endLine === -1) {
        alert('No Table of Contents found to remove.');
        return;
    }
    
    // Ask user if they want to remove anchor tags from headings as well
    const removeAnchors = confirm('Remove anchor tags from headings as well?\n\nClick OK to remove both ToC and anchors, or Cancel to remove only the ToC.');
    
    const edits = [];
    
    // Remove ToC section (including the extra newline after TOC END)
    const removeEndLine = endLine + 1 < lines.length && lines[endLine + 1].trim() === '' ? endLine + 2 : endLine + 1;
    
    edits.push({
        range: new monaco.Range(startLine + 1, 1, removeEndLine, 1),
        text: ''
    });
    
    // Optionally remove anchor tags from headings
    if (removeAnchors) {
        for (let i = 0; i < lines.length; i++) {
            // Skip lines that are part of the ToC we're removing
            if (i >= startLine && i <= endLine) {
                continue;
            }
            
            const line = lines[i];
            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
            
            if (headingMatch) {
                const text = headingMatch[2];
                // Remove anchor tags: <a id="..."></a> or <a name="..."></a>
                const cleanText = text.replace(/<a\s+(id|name)="[^"]*"><\/a>/g, '').trim();
                
                if (cleanText !== text) {
                    const newHeading = `${headingMatch[1]} ${cleanText}`;
                    
                    edits.push({
                        range: new monaco.Range(i + 1, 1, i + 1, line.length + 1),
                        text: newHeading
                    });
                }
            }
        }
    }
    
    // Apply all edits
    window.editor.executeEdits('remove-toc-and-anchors', edits);
    
    // Position cursor at the beginning
    window.editor.setPosition({
        lineNumber: startLine + 1,
        column: 1
    });
    
    window.editor.focus();
    
    if (window.updatePreviewAndStructure) {
        await window.updatePreviewAndStructure(window.editor.getValue());
    }
    
    const message = removeAnchors ? 
        'Table of Contents and heading anchors removed successfully.' : 
        'Table of Contents removed successfully. Heading anchors preserved.';
    alert(message);
}

// Generate URL-friendly anchor from heading text
function generateAnchor(headingText) {
    return headingText
        .toLowerCase()
        .replace(/[^\w\s-]/g, '') // Remove special characters except hyphens
        .replace(/\s+/g, '-')     // Replace spaces with hyphens
        .replace(/-+/g, '-')      // Collapse multiple hyphens
        .replace(/^-|-$/g, '');   // Remove leading/trailing hyphens
}

// Add ToC buttons to toolbar dynamically
function addToCButtons() {
    const toolbar = document.getElementById('editor-toolbar');
    if (!toolbar) return;
    
    // Find the speaker notes button to insert after it
    const speakerNotesBtn = document.getElementById('insert-speaker-notes-btn');
    if (!speakerNotesBtn) return;
    
    // Check if ToC buttons already exist
    if (document.getElementById('insert-toc-btn')) return;
    
    // Create Insert ToC button
    const insertTocBtn = document.createElement('button');
    insertTocBtn.id = 'insert-toc-btn';
    insertTocBtn.className = 'toolbar-btn';
    insertTocBtn.title = 'Insert Table of Contents';
    insertTocBtn.style.cssText = 'padding: 3px 5px; border: 1px solid #ccc; background: white; border-radius: 3px; cursor: pointer; font-size: 10px;';
    insertTocBtn.innerHTML = '📑+';
    
    insertTocBtn.addEventListener('click', async () => await insertTableOfContents());
    
    // Create Remove ToC button
    const removeTocBtn = document.createElement('button');
    removeTocBtn.id = 'remove-toc-btn';
    removeTocBtn.className = 'toolbar-btn';
    removeTocBtn.title = 'Remove Table of Contents';
    removeTocBtn.style.cssText = 'padding: 3px 5px; border: 1px solid #ccc; background: white; border-radius: 3px; cursor: pointer; font-size: 10px;';
    removeTocBtn.innerHTML = '📑✖️';
    
    removeTocBtn.addEventListener('click', async () => await removeTableOfContents());
    
    // Insert buttons after speaker notes button
    speakerNotesBtn.parentNode.insertBefore(insertTocBtn, speakerNotesBtn.nextSibling);
    speakerNotesBtn.parentNode.insertBefore(removeTocBtn, insertTocBtn.nextSibling);
    
    console.log('[formatting.js] Added ToC buttons to toolbar');
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
window.insertTableOfContents = insertTableOfContents;
window.removeTableOfContents = removeTableOfContents;
window.addToCButtons = addToCButtons;
window.initializeMarkdownFormatting = initializeMarkdownFormatting;

// --- Initialization is called from renderer.js with a delay ---
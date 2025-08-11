
// --- Auto-Numbering and Smart List Functions ---

// Initialize smart list behavior
function initializeSmartLists() {
    if (!window.editor) {
        console.log('[renderer.js] Cannot initialize smart lists - no window.editor');
        return;
    }
    
    // Use onKeyDown for better control over Enter key
    window.editor.onKeyDown((e) => {
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
    if (!window.editor) {
        return false;
    }
    
    try {
        const position = window.editor.getPosition();
        const lineContent = window.editor.getModel().getLineContent(position.lineNumber);
        
        // Check if current line is a numbered list item
        const numberedMatch = lineContent.match(/^(\s*)(\d+)\.\s+(.*)$/);
        if (numberedMatch) {
            const [, indent, currentNum, content] = numberedMatch;
            
            // If empty list item, exit list
            if (content.trim() === '') {
                window.editor.executeEdits('exit-list', [{
                    range: new monaco.Range(position.lineNumber, 1, position.lineNumber, lineContent.length + 1),
                    text: indent
                }]);
                return true;
            }
            
            // Create next numbered item
            const nextNum = parseInt(currentNum) + 1;
            const newText = '\n' + indent + nextNum + '. ';
            
            // Insert at current cursor position
            window.editor.executeEdits('continue-list', [{
                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                text: newText
            }]);
            
            // Move cursor to end of new line
            window.editor.setPosition({
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
                window.editor.executeEdits('exit-list', [{
                    range: new monaco.Range(position.lineNumber, 1, position.lineNumber, lineContent.length + 1),
                    text: indent
                }]);
                return true;
            }
            
            // Create next bulleted item
            const newText = '\n' + indent + bullet + ' ';
            
            // Insert at current cursor position
            window.editor.executeEdits('continue-list', [{
                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                text: newText
            }]);
            
            // Move cursor to end of new line
            window.editor.setPosition({
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
    const model = window.editor.getModel();
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
async function handleListIndentation(isIndent) {
    if (!window.editor) return false;
    
    const position = window.editor.getPosition();
    const lineContent = window.editor.getModel().getLineContent(position.lineNumber);
    
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
        
        window.editor.executeEdits('indent-list', [{
            range: range,
            text: newLine
        }]);
        
        // Maintain cursor position relative to content
        const newCursorColumn = newIndent.length + newMarker.length + 2 + 
                              Math.max(0, position.column - (indent.length + marker.length + 2));
        
        window.editor.setPosition({
            lineNumber: position.lineNumber,
            column: Math.min(newCursorColumn, newLine.length + 1)
        });
        
        await updatePreviewAndStructure(window.editor.getValue());
        return true;
    }
    
    return false; // Not in a list, use default behavior
}

// Auto-renumber all numbered lists in the document
async function renumberAllLists() {
    if (!window.editor) return;
    
    const model = window.editor.getModel();
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
        window.editor.executeEdits('renumber-lists', edits);
        await updatePreviewAndStructure(window.editor.getValue());
        console.log(`[renderer.js] Renumbered ${edits.length} list items`);
    }
}

// Add renumber button to toolbar
function addRenumberButton() {
    const toolbar = document.getElementById('window.editor-toolbar');
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
        
        renumberBtn.addEventListener('click', async () => {
            await renumberAllLists();
            showNotification('Lists renumbered successfully', 'success');
        });
        
        // Insert after the Format separator
        formatSeparator.parentNode.insertBefore(renumberBtn, formatSeparator.nextSibling);
        
        console.log('[renderer.js] Added renumber button to toolbar');
    }
}

// Initialize smart lists after Monaco window.editor is ready
function initializeSmartListsWhenReady() {
    // Wait for window.editor to be initialized
    const checkEditor = setInterval(() => {
        if (window.editor && window.editor.getModel) {
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

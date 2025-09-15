
// --- Auto-Numbering and Smart List Functions ---

// Initialize smart list behavior
function initializeSmartLists() {
    if (!window.editor) {
        console.log('[renderer.js] Cannot initialize smart lists - no window.editor');
        return;
    }
    
    // Track if we're doing a programmatic renumbering to avoid loops
    let isRenumbering = false;
    window.isListRenumbering = () => isRenumbering;
    window.setListRenumbering = (value) => { isRenumbering = value; };
    
    // Use onKeyDown for better control over Enter key and other list operations
    window.editor.onKeyDown((e) => {
        if (e.keyCode === monaco.KeyCode.Enter) {
            if (handleSimpleListEnter()) {
                e.preventDefault();
                e.stopPropagation();
            }
        } else if (e.keyCode === monaco.KeyCode.Backspace) {
            // Handle backspace at the beginning of a list item
            if (handleListBackspace()) {
                e.preventDefault();
                e.stopPropagation();
            }
        } else if (e.keyCode === monaco.KeyCode.Tab) {
            // Handle Tab for list indentation
            if (handleListIndentation(!e.shiftKey)) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
    });
    
    // Add content change listener for automatic renumbering
    let renumberTimeout;
    window.editor.onDidChangeModelContent((e) => {
        // Skip if we're already renumbering (to avoid loops)
        if (isRenumbering) return;
        
        // Debounce renumbering to avoid excessive operations
        clearTimeout(renumberTimeout);
        renumberTimeout = setTimeout(() => {
            checkForListRenumbering(e);
        }, 500);
    });
    
    console.log('[renderer.js] Smart list behavior initialized with onKeyDown and change detection');
}

// Check if content changes require list renumbering
function checkForListRenumbering(changeEvent) {
    if (!window.editor) return;
    
    const model = window.editor.getModel();
    
    // Check each change to see if it affects numbered lists
    for (const change of changeEvent.changes) {
        const startLine = change.range.startLineNumber;
        const endLine = change.range.endLineNumber;
        
        // Check if this was a deletion (empty text with multi-line range)
        const isDeletion = change.text === '' && (endLine > startLine || change.range.endColumn > change.range.startColumn);
        
        // Check if the changed text contains numbered list patterns (insertion/modification)
        const changedText = change.text;
        const isListInsertion = changedText.match(/^\s*\d+\.\s/m);
        
        if (isDeletion) {
            // Line was deleted - check if there are numbered lists after this position
            // Look at the line that's now at startLine position
            if (startLine <= model.getLineCount()) {
                const currentLine = model.getLineContent(startLine);
                const listMatch = currentLine.match(/^(\s*)(\d+\.)\s*(.*)/);
                
                if (listMatch) {
                    // There's a numbered list item here - renumber from this point
                    const [, indent] = listMatch;
                    
                    // Find the correct starting number by looking backwards
                    let startNumber = 1;
                    let foundPreviousItem = false;
                    
                    for (let lineNum = startLine - 1; lineNum >= 1; lineNum--) {
                        const prevLine = model.getLineContent(lineNum);
                        const prevMatch = prevLine.match(/^(\s*)([-*+]|\d+\.)\s*(.*)/);
                        
                        if (prevMatch) {
                            const [, prevIndent, prevMarker] = prevMatch;

                            // Check indentation level
                            if (prevIndent.length < indent.length) {
                                // Parent list level - stop searching, start at 1
                                break;
                            } else if (prevIndent.length === indent.length) {
                                // Same indent level
                                if (prevMarker.match(/\d+\./)) {
                                    // Found previous numbered item at same level
                                    startNumber = parseInt(prevMarker) + 1;
                                    foundPreviousItem = true;
                                    break;
                                } else {
                                    // Bullet list at same level - start at 1
                                    break;
                                }
                            }
                            // If prevIndent.length > indent.length, it's a nested item - continue searching
                        } else if (prevLine.trim() !== '') {
                            // Non-list, non-empty line
                            // Only break if we haven't found any items yet
                            if (!foundPreviousItem) {
                                break;
                            }
                        }
                    }
                    
                    // Renumber from this line with the correct starting number
                    setTimeout(() => {
                        renumberSubsequentItems(startLine, indent, startNumber);
                    }, 50);
                }
            }
        } else if (isListInsertion) {
            // A numbered list item was inserted or modified
            // Find all affected list sections and renumber them
            renumberListsInRange(startLine, endLine + changedText.split('\n').length);
        }
    }
}

// Renumber all numbered lists in a specific range
async function renumberListsInRange(startLine, endLine) {
    if (!window.editor) return;
    
    const model = window.editor.getModel();
    const processedLists = new Set(); // Track indentation levels we've already processed
    
    for (let lineNum = startLine; lineNum <= Math.min(endLine, model.getLineCount()); lineNum++) {
        const lineContent = model.getLineContent(lineNum);
        const listMatch = lineContent.match(/^(\s*)(\d+\.)\s*(.*)/);
        
        if (listMatch) {
            const [, indent] = listMatch;
            const indentKey = `${indent}`;
            
            // Only process each indent level once in this range
            if (!processedLists.has(indentKey)) {
                processedLists.add(indentKey);
                await renumberListFromLine(lineNum, indent);
            }
        }
    }
}

// Handle backspace at the beginning of a list item
function handleListBackspace() {
    if (!window.editor) return false;
    
    try {
        const position = window.editor.getPosition();
        const lineContent = window.editor.getModel().getLineContent(position.lineNumber);
        
        // Check if we're at the beginning of a list item
        const listMatch = lineContent.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        if (listMatch) {
            const [, indent, marker, content] = listMatch;
            const markerEndPos = indent.length + marker.length + 1; // +1 for the space
            
            // If cursor is right after the list marker and space
            if (position.column === markerEndPos + 1) {
                // Remove the list marker and convert to normal text
                window.editor.executeEdits('remove-list-marker', [{
                    range: new monaco.Range(position.lineNumber, 1, position.lineNumber, markerEndPos),
                    text: indent
                }]);
                
                // Position cursor at the beginning of the content
                window.editor.setPosition({
                    lineNumber: position.lineNumber,
                    column: indent.length + 1
                });
                
                // If this was a numbered list, renumber subsequent items
                if (marker.match(/\d+\./)) {
                    setTimeout(() => {
                        const model = window.editor.getModel();
                        // Check if there's a next list item
                        if (position.lineNumber < model.getLineCount()) {
                            const nextLine = model.getLineContent(position.lineNumber + 1);
                            const nextMatch = nextLine.match(/^(\s*)(\d+\.)\s*(.*)/);
                            if (nextMatch && nextMatch[1] === indent) {
                                // Renumber from the next line, starting with the current number
                                const currentNum = parseInt(marker);
                                renumberSubsequentItems(position.lineNumber + 1, indent, currentNum);
                            }
                        }
                    }, 50);
                }
                
                return true;
            }
        }
        
        return false;
    } catch (error) {
        console.error('[handleListBackspace] Error:', error);
        return false;
    }
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
            
            // We want to insert a new item after the current one
            // The new item gets the next number, and all subsequent items are renumbered
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
            
            // Renumber items after the new line (line + 2 onwards)
            // They should start from nextNum + 1
            setTimeout(() => {
                renumberSubsequentItems(position.lineNumber + 2, indent, nextNum + 1);
            }, 50);
            
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
        const oldIndent = indent;
        
        let newIndent;
        if (isIndent) {
            // Add 2 or 4 spaces for indentation (detect existing pattern)
            const indentSize = detectIndentSize(position.lineNumber);
            newIndent = indent + ' '.repeat(indentSize);
        } else {
            // Remove appropriate number of spaces for outdentation
            const indentSize = detectIndentSize(position.lineNumber);
            newIndent = indent.length >= indentSize ? indent.substring(indentSize) : '';
        }
        
        // For numbered lists, calculate appropriate number at new indent level
        let newMarker = marker;
        if (marker.match(/\d+\./)) {
            if (isIndent) {
                // Starting a new nested list - find next number at this indentation
                newMarker = getNextListNumber(position.lineNumber, newIndent) + '.';
            } else {
                // Moving to parent level - find next number at parent indentation
                newMarker = getNextListNumber(position.lineNumber, newIndent) + '.';
            }
        }
        
        const newLine = newIndent + newMarker + ' ' + content;
        
        const range = new monaco.Range(
            position.lineNumber, 1,
            position.lineNumber, lineContent.length + 1
        );
        
        // Set flag to prevent recursive renumbering during this edit
        if (window.setListRenumbering) window.setListRenumbering(true);
        
        window.editor.executeEdits('indent-list', [{
            range: range,
            text: newLine
        }]);
        
        // Maintain cursor position relative to content
        const newCursorColumn = newIndent.length + newMarker.length + 2 + 
                              Math.max(0, position.column - (oldIndent.length + marker.length + 2));
        
        window.editor.setPosition({
            lineNumber: position.lineNumber,
            column: Math.min(newCursorColumn, newLine.length + 1)
        });
        
        // After changing indentation, renumber affected lists
        setTimeout(async () => {
            await renumberAfterIndentationChange(position.lineNumber, oldIndent, newIndent);
            if (window.setListRenumbering) window.setListRenumbering(false);
        }, 50);
        
        await updatePreviewAndStructure(window.editor.getValue());
        return true;
    }
    
    return false; // Not in a list, use default behavior
}

// Detect indent size (2 or 4 spaces) by examining nearby list items
function detectIndentSize(currentLine) {
    if (!window.editor) return 2; // Default to 2 spaces
    
    const model = window.editor.getModel();
    const totalLines = model.getLineCount();
    
    // Look for existing indentation patterns within 20 lines
    const searchRange = 20;
    const startLine = Math.max(1, currentLine - searchRange);
    const endLine = Math.min(totalLines, currentLine + searchRange);
    
    const indentSizes = new Set();
    
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
        const lineContent = model.getLineContent(lineNum);
        const listMatch = lineContent.match(/^(\s*)([-*+]|\d+\.)\s*(.*)/);
        
        if (listMatch) {
            const indent = listMatch[1];
            if (indent.length > 0) {
                // Check if it's a multiple of 2 or 4
                if (indent.length % 4 === 0) {
                    indentSizes.add(4);
                } else if (indent.length % 2 === 0) {
                    indentSizes.add(2);
                }
            }
        }
    }
    
    // Prefer 4-space if found, otherwise default to 2-space
    return indentSizes.has(4) ? 4 : 2;
}

// Handle renumbering after indentation change
async function renumberAfterIndentationChange(changedLine, oldIndent, newIndent) {
    if (!window.editor) return;
    
    const model = window.editor.getModel();
    
    // If indentation increased (item moved to nested level)
    if (newIndent.length > oldIndent.length) {
        // Renumber the new nested list starting from this item
        await renumberSubsequentItems(changedLine, newIndent, 1);
        
        // Renumber the original list that this item left
        if (changedLine < model.getLineCount()) {
            // Find the next item at the old indentation level
            for (let lineNum = changedLine + 1; lineNum <= model.getLineCount(); lineNum++) {
                const lineContent = model.getLineContent(lineNum);
                const listMatch = lineContent.match(/^(\s*)([-*+]|\d+\.)\s*(.*)/);
                
                if (listMatch) {
                    const [, indent, marker] = listMatch;
                    
                    if (indent.length < oldIndent.length) {
                        // Reached parent level, stop
                        break;
                    } else if (indent.length === oldIndent.length && marker.match(/\d+\./)) {
                        // Found next item at original level, renumber from here
                        const startNumber = findCorrectStartNumber(lineNum, oldIndent);
                        await renumberSubsequentItems(lineNum, oldIndent, startNumber);
                        break;
                    }
                }
            }
        }
    }
    // If indentation decreased (item moved to parent level)
    else if (newIndent.length < oldIndent.length) {
        // Renumber the list at the new level starting from this item
        const startNumber = findCorrectStartNumber(changedLine, newIndent);
        await renumberSubsequentItems(changedLine, newIndent, startNumber);
        
        // Renumber any remaining items at the old nested level
        for (let lineNum = changedLine + 1; lineNum <= model.getLineCount(); lineNum++) {
            const lineContent = model.getLineContent(lineNum);
            const listMatch = lineContent.match(/^(\s*)([-*+]|\d+\.)\s*(.*)/);
            
            if (listMatch) {
                const [, indent, marker] = listMatch;
                
                if (indent.length < oldIndent.length) {
                    // Reached parent level, stop
                    break;
                } else if (indent.length === oldIndent.length && marker.match(/\d+\./)) {
                    // Found items at old level, renumber from 1
                    await renumberSubsequentItems(lineNum, oldIndent, 1);
                    break;
                }
            }
        }
    }
}

// Find the correct starting number for a list item at a specific indentation
function findCorrectStartNumber(lineNum, targetIndent) {
    if (!window.editor) return 1;
    
    const model = window.editor.getModel();
    
    // Look backwards to find the previous item at the same indentation level
    for (let checkLine = lineNum - 1; checkLine >= 1; checkLine--) {
        const lineContent = model.getLineContent(checkLine);
        const listMatch = lineContent.match(/^(\s*)([-*+]|\d+\.)\s*(.*)/);
        
        if (listMatch) {
            const [, indent, marker] = listMatch;
            
            if (indent.length < targetIndent.length) {
                // Reached parent level, start new list at 1
                break;
            } else if (indent.length === targetIndent.length) {
                // Found item at same level
                if (marker.match(/\d+\./)) {
                    // Return next number
                    return parseInt(marker) + 1;
                } else {
                    // Bullet list breaks numbering, start at 1
                    break;
                }
            }
            // Continue if indent.length > targetIndent.length (nested level)
        } else if (lineContent.trim() !== '') {
            // Non-list content breaks the list context
            break;
        }
    }
    
    return 1; // Default to starting a new list
}

// Renumber only subsequent items in a list starting from a specific line and number
async function renumberSubsequentItems(startLine, targetIndent, startNumber) {
    if (!window.editor) return;
    
    const model = window.editor.getModel();
    const totalLines = model.getLineCount();
    const edits = [];
    
    let currentNumber = startNumber;
    let inNestedList = false;
    
    // Only renumber from startLine onwards
    for (let lineNum = startLine; lineNum <= totalLines; lineNum++) {
        const lineContent = model.getLineContent(lineNum);
        const listMatch = lineContent.match(/^(\s*)([-*+]|\d+\.)\s*(.*)/);
        
        if (listMatch) {
            const [, indent, marker, content] = listMatch;
            
            // Check indentation level
            if (indent.length < targetIndent.length) {
                // We've outdented - stop processing
                break;
            } else if (indent.length > targetIndent.length) {
                // We've indented - this is a nested list, skip it but continue
                inNestedList = true;
                continue;
            } else {
                // Same indentation level
                inNestedList = false;
                
                if (marker.match(/\d+\./)) {
                    // This is a numbered list item at our target level
                    const correctMarker = currentNumber + '.';
                    if (marker !== correctMarker) {
                        // Need to renumber this line
                        const newLine = indent + correctMarker + ' ' + content;
                        edits.push({
                            range: new monaco.Range(lineNum, 1, lineNum, lineContent.length + 1),
                            text: newLine
                        });
                    }
                    currentNumber++;
                } else {
                    // Bullet list item at same level - stops this numbered list
                    break;
                }
            }
        } else {
            // Non-list line
            if (!inNestedList) {
                // If we're not in a nested list, a non-list line breaks the sequence
                break;
            }
            // Otherwise, continue looking for more items at our level
        }
    }
    
    if (edits.length > 0) {
        // Set flag to prevent recursive renumbering
        if (window.setListRenumbering) window.setListRenumbering(true);
        
        window.editor.executeEdits('renumber-subsequent', edits);
        await updatePreviewAndStructure(window.editor.getValue());
        
        // Clear flag after a short delay
        setTimeout(() => {
            if (window.setListRenumbering) window.setListRenumbering(false);
        }, 100);
    }
}

// Renumber a numbered list starting from a specific line
async function renumberListFromLine(startLine, targetIndent) {
    if (!window.editor) return;
    
    const model = window.editor.getModel();
    const totalLines = model.getLineCount();
    const edits = [];
    
    // Find the start of this list to get the correct numbering
    let listStartNumber = 1;
    for (let lineNum = startLine - 1; lineNum >= 1; lineNum--) {
        const lineContent = model.getLineContent(lineNum);
        const listMatch = lineContent.match(/^(\s*)([-*+]|\d+\.)\s*(.*)/);
        
        if (listMatch) {
            const [, indent, marker] = listMatch;
            
            // If indentation doesn't match, we've left this list level
            if (indent !== targetIndent) {
                break;
            }
            
            // If it's a numbered item at the same level
            const numberMatch = marker.match(/(\d+)\./);
            if (numberMatch) {
                listStartNumber = lineNum;
                continue;
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
    
    // Now renumber from the found start
    let currentNumber = 1;
    for (let lineNum = listStartNumber; lineNum <= totalLines; lineNum++) {
        const lineContent = model.getLineContent(lineNum);
        const listMatch = lineContent.match(/^(\s*)([-*+]|\d+\.)\s*(.*)/);
        
        if (listMatch) {
            const [, indent, marker, content] = listMatch;
            
            // Stop if we've left this list level
            if (indent !== targetIndent) {
                break;
            }
            
            if (marker.match(/\d+\./)) {
                // This is a numbered list item at our target level
                const correctMarker = currentNumber + '.';
                if (marker !== correctMarker) {
                    // Need to renumber this line
                    const newLine = indent + correctMarker + ' ' + content;
                    edits.push({
                        range: new monaco.Range(lineNum, 1, lineNum, lineContent.length + 1),
                        text: newLine
                    });
                }
                currentNumber++;
            } else {
                // Bullet list item - stops this numbered list
                break;
            }
        } else {
            // Non-list line - stops this numbered list
            break;
        }
    }
    
    if (edits.length > 0) {
        // Set flag to prevent recursive renumbering
        if (window.setListRenumbering) window.setListRenumbering(true);
        
        window.editor.executeEdits('renumber-list-section', edits);
        await updatePreviewAndStructure(window.editor.getValue());
        
        // Clear flag after a short delay
        setTimeout(() => {
            if (window.setListRenumbering) window.setListRenumbering(false);
        }, 100);
    }
}

// Auto-renumber all numbered lists in the document
async function renumberAllLists() {
    if (!window.editor) return;
    
    const model = window.editor.getModel();
    const totalLines = model.getLineCount();
    const edits = [];
    
    // Track multiple indent levels simultaneously
    const listStates = new Map(); // indent -> { startLine, currentNumber }
    
    for (let lineNum = 1; lineNum <= totalLines; lineNum++) {
        const lineContent = model.getLineContent(lineNum);
        const listMatch = lineContent.match(/^(\s*)([-*+]|\d+\.)\s*(.*)/);
        
        if (listMatch) {
            const [, indent, marker, content] = listMatch;
            
            if (marker.match(/\d+\./)) {
                // This is a numbered list item
                
                // Clear any list states for deeper indentation (sublists that have ended)
                for (const [key, value] of listStates.entries()) {
                    if (key.length > indent.length) {
                        listStates.delete(key);
                    }
                }
                
                // Get or initialize state for this indentation level
                if (!listStates.has(indent)) {
                    // Starting a new numbered list at this indent level
                    listStates.set(indent, { startLine: lineNum, currentNumber: 1 });
                } else {
                    // Continuing numbered list at this indent level
                    const state = listStates.get(indent);
                    state.currentNumber++;
                }
                
                const state = listStates.get(indent);
                const correctMarker = state.currentNumber + '.';
                
                if (marker !== correctMarker) {
                    // Need to renumber this line
                    const newLine = indent + correctMarker + ' ' + content;
                    edits.push({
                        range: new monaco.Range(lineNum, 1, lineNum, lineContent.length + 1),
                        text: newLine
                    });
                }
            } else {
                // Bullet list item - clear numbered list tracking for this indent
                listStates.delete(indent);
            }
        } else {
            // Non-list line - check if it's truly breaking lists or just content within nested structure
            // Only clear states for indent level 0 (top-level lists)
            if (lineContent.trim() !== '') {
                // Non-empty, non-list line - clear top-level list
                for (const [key, value] of listStates.entries()) {
                    if (key === '') {
                        listStates.delete(key);
                    }
                }
            }
        }
    }
    
    if (edits.length > 0) {
        // Set flag to prevent recursive renumbering
        if (window.setListRenumbering) window.setListRenumbering(true);
        
        window.editor.executeEdits('renumber-lists', edits);
        await updatePreviewAndStructure(window.editor.getValue());
        console.log(`[renderer.js] Renumbered ${edits.length} list items`);
        
        // Clear flag after a short delay
        setTimeout(() => {
            if (window.setListRenumbering) window.setListRenumbering(false);
        }, 100);
    }
}

// Insert a new numbered list item at cursor position and renumber
async function insertNumberedListItem() {
    if (!window.editor) return;
    
    const position = window.editor.getPosition();
    const lineContent = window.editor.getModel().getLineContent(position.lineNumber);
    
    // Determine appropriate indentation and number
    let indent = '';
    let newNumber = 1;
    
    // Check if we're already in a list
    const currentListMatch = lineContent.match(/^(\s*)([-*+]|\d+\.)\s*(.*)/);
    if (currentListMatch) {
        indent = currentListMatch[1];
        // Insert after current item
        const nextLine = position.lineNumber + 1;
        const newText = '\n' + indent + newNumber + '. ';
        
        window.editor.executeEdits('insert-list-item', [{
            range: new monaco.Range(position.lineNumber, lineContent.length + 1, position.lineNumber, lineContent.length + 1),
            text: newText
        }]);
        
        // Position cursor on new line
        window.editor.setPosition({
            lineNumber: nextLine,
            column: indent.length + 3
        });
        
        // Renumber the entire list
        setTimeout(() => {
            renumberListFromLine(nextLine, indent);
        }, 50);
        
    } else {
        // Insert at current position
        const newText = '1. ';
        
        window.editor.executeEdits('insert-list-item', [{
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            text: newText
        }]);
        
        // Position cursor after the marker
        window.editor.setPosition({
            lineNumber: position.lineNumber,
            column: position.column + 3
        });
    }
    
    await updatePreviewAndStructure(window.editor.getValue());
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

// Export functions globally
window.renumberAllLists = renumberAllLists;
window.insertNumberedListItem = insertNumberedListItem;
window.renumberListFromLine = renumberListFromLine;
window.renumberSubsequentItems = renumberSubsequentItems;
window.handleListIndentation = handleListIndentation;

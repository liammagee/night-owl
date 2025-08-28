// Editor Utility Functions
// Handles editor formatting, text manipulation, and utility functions

function handleFormatText(type) {
  console.log('[Editor] Formatting text with type:', type);
  
  if (!window.editor) {
    console.warn('[Editor] No editor instance available');
    return;
  }
  
  applyFormatting(type);
}

function applyFormatting(type) {
  if (!window.editor) return;
  
  const selection = window.editor.getSelection();
  const selectedText = window.editor.getModel().getValueInRange(selection);
  
  let newText = '';
  let newSelection = null;
  
  switch (type) {
    case 'bold':
      if (selectedText) {
        newText = `**${selectedText}**`;
      } else {
        newText = '**bold text**';
        newSelection = new monaco.Range(
          selection.startLineNumber, selection.startColumn + 2,
          selection.endLineNumber, selection.endColumn + 11
        );
      }
      break;
      
    case 'italic':
      if (selectedText) {
        newText = `*${selectedText}*`;
      } else {
        newText = '*italic text*';
        newSelection = new monaco.Range(
          selection.startLineNumber, selection.startColumn + 1,
          selection.endLineNumber, selection.endColumn + 12
        );
      }
      break;
      
    case 'code':
      if (selectedText) {
        newText = `\`${selectedText}\``;
      } else {
        newText = '`code`';
        newSelection = new monaco.Range(
          selection.startLineNumber, selection.startColumn + 1,
          selection.endLineNumber, selection.endColumn + 5
        );
      }
      break;
      
    case 'strikethrough':
      if (selectedText) {
        newText = `~~${selectedText}~~`;
      } else {
        newText = '~~strikethrough~~';
        newSelection = new monaco.Range(
          selection.startLineNumber, selection.startColumn + 2,
          selection.endLineNumber, selection.endColumn + 15
        );
      }
      break;
      
    case 'link':
      if (selectedText) {
        newText = `[${selectedText}](url)`;
        newSelection = new monaco.Range(
          selection.endLineNumber, selection.endColumn + 3,
          selection.endLineNumber, selection.endColumn + 6
        );
      } else {
        newText = '[link text](url)';
        newSelection = new monaco.Range(
          selection.startLineNumber, selection.startColumn + 1,
          selection.endLineNumber, selection.endColumn + 10
        );
      }
      break;
      
    case 'image':
      // Use file browser for image selection
      handleImageInsertion();
      return;
      
    case 'heading1':
      insertAtLineStart('# ', 'Heading 1');
      return;
      
    case 'heading2':
      insertAtLineStart('## ', 'Heading 2');
      return;
      
    case 'heading3':
      insertAtLineStart('### ', 'Heading 3');
      return;
      
    case 'quote':
      insertAtLineStart('> ', 'Quote');
      return;
      
    case 'list':
      insertAtLineStart('- ', 'List item');
      return;
      
    case 'numberlist':
      insertAtLineStart('1. ', 'Numbered item');
      return;
      
    case 'codeblock':
      newText = selectedText ? 
        `\`\`\`\n${selectedText}\n\`\`\`` :
        '```\ncode block\n```';
      newSelection = selectedText ? null : new monaco.Range(
        selection.startLineNumber + 1, selection.startColumn,
        selection.endLineNumber + 1, selection.endColumn + 10
      );
      break;
      
    default:
      console.warn('[Editor] Unknown formatting type:', type);
      return;
  }
  
  // Apply the formatting
  window.editor.executeEdits('format-text', [{
    range: selection,
    text: newText,
    forceMoveMarkers: true
  }]);
  
  // Set new selection if specified
  if (newSelection) {
    window.editor.setSelection(newSelection);
  }
  
  // Focus the editor
  window.editor.focus();
}

function insertAtLineStart(prefix, placeholder) {
  if (!window.editor) return;
  
  const selection = window.editor.getSelection();
  const position = selection.getStartPosition();
  const line = window.editor.getModel().getLineContent(position.lineNumber);
  
  // Check if line already has this prefix
  const prefixRegex = new RegExp('^(\\s*)' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (prefixRegex.test(line)) {
    // Remove the prefix
    const newLine = line.replace(new RegExp('^(\\s*)' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), '$1');
    const range = new monaco.Range(position.lineNumber, 1, position.lineNumber, line.length + 1);
    window.editor.executeEdits('remove-prefix', [{
      range: range,
      text: newLine,
      forceMoveMarkers: true
    }]);
  } else {
    // Add the prefix
    const leadingWhitespace = line.match(/^(\s*)/)[1];
    const newLine = leadingWhitespace + prefix + (line.trim() || placeholder);
    const range = new monaco.Range(position.lineNumber, 1, position.lineNumber, line.length + 1);
    window.editor.executeEdits('add-prefix', [{
      range: range,
      text: newLine,
      forceMoveMarkers: true
    }]);
    
    // Move cursor to end of line
    const newPosition = new monaco.Position(position.lineNumber, newLine.length + 1);
    window.editor.setPosition(newPosition);
  }
  
  window.editor.focus();
}

function getCurrentEditorContent() {
  if (window.editor && window.editor.getValue) {
    return window.editor.getValue();
  } else if (window.fallbackEditor) {
    return window.fallbackEditor.value;
  }
  return '';
}

function setEditorContent(content) {
  if (window.editor && window.editor.setValue) {
    window.editor.setValue(content);
  } else if (window.fallbackEditor) {
    window.fallbackEditor.value = content;
  }
}

function insertTextAtCursor(text) {
  if (!window.editor) {
    console.warn('[Editor] No editor instance available');
    return;
  }
  
  const selection = window.editor.getSelection();
  window.editor.executeEdits('insert-text', [{
    range: selection,
    text: text,
    forceMoveMarkers: true
  }]);
  
  // Move cursor to end of inserted text
  const endPosition = new monaco.Position(
    selection.endLineNumber,
    selection.endColumn + text.length
  );
  window.editor.setPosition(endPosition);
  window.editor.focus();
}

function getSelectedText() {
  if (!window.editor) return '';
  
  const selection = window.editor.getSelection();
  return window.editor.getModel().getValueInRange(selection);
}

function replaceSelectedText(newText) {
  if (!window.editor) return;
  
  const selection = window.editor.getSelection();
  window.editor.executeEdits('replace-selection', [{
    range: selection,
    text: newText,
    forceMoveMarkers: true
  }]);
  
  window.editor.focus();
}

function focusEditor() {
  if (window.editor && window.editor.focus) {
    window.editor.focus();
  } else if (window.fallbackEditor) {
    window.fallbackEditor.focus();
  }
}

function getEditorLineCount() {
  if (window.editor && window.editor.getModel) {
    return window.editor.getModel().getLineCount();
  }
  return 0;
}

function goToLine(lineNumber) {
  if (!window.editor) return;
  
  window.editor.setPosition({ lineNumber: lineNumber, column: 1 });
  window.editor.revealLineInCenter(lineNumber);
  window.editor.focus();
}

function findInEditor(searchText, options = {}) {
  if (!window.editor) return [];
  
  const model = window.editor.getModel();
  return model.findMatches(
    searchText,
    false, // searchOnlyEditableRange
    options.isRegex || false,
    options.matchCase || false,
    options.matchWholeWord || false,
    true // captureMatches
  );
}

function replaceInEditor(searchText, replaceText, options = {}) {
  if (!window.editor) return 0;
  
  const matches = findInEditor(searchText, options);
  if (matches.length === 0) return 0;
  
  // Apply replacements in reverse order to maintain correct positions
  const edits = matches.reverse().map(match => ({
    range: match.range,
    text: replaceText,
    forceMoveMarkers: true
  }));
  
  window.editor.executeEdits('replace-all', edits);
  return matches.length;
}

// Setup editor formatting toolbar handlers
function setupEditorFormatting() {
  // Bold
  const boldBtn = document.getElementById('format-bold-btn');
  if (boldBtn) {
    boldBtn.addEventListener('click', () => handleFormatText('bold'));
  }
  
  // Italic
  const italicBtn = document.getElementById('format-italic-btn');
  if (italicBtn) {
    italicBtn.addEventListener('click', () => handleFormatText('italic'));
  }
  
  // Code
  const codeBtn = document.getElementById('format-code-btn');
  if (codeBtn) {
    codeBtn.addEventListener('click', () => handleFormatText('code'));
  }
  
  // Strikethrough
  const strikeBtn = document.getElementById('format-strikethrough-btn');
  if (strikeBtn) {
    strikeBtn.addEventListener('click', () => handleFormatText('strikethrough'));
  }
  
  // Link
  const linkBtn = document.getElementById('format-link-btn');
  if (linkBtn) {
    linkBtn.addEventListener('click', () => handleFormatText('link'));
  }
  
  // Image
  const imageBtn = document.getElementById('format-image-btn');
  if (imageBtn) {
    imageBtn.addEventListener('click', () => handleFormatText('image'));
  }
  
  // Headings
  const h1Btn = document.getElementById('format-h1-btn');
  if (h1Btn) {
    h1Btn.addEventListener('click', () => handleFormatText('heading1'));
  }
  
  const h2Btn = document.getElementById('format-h2-btn');
  if (h2Btn) {
    h2Btn.addEventListener('click', () => handleFormatText('heading2'));
  }
  
  const h3Btn = document.getElementById('format-h3-btn');
  if (h3Btn) {
    h3Btn.addEventListener('click', () => handleFormatText('heading3'));
  }
  
  // Quote
  const quoteBtn = document.getElementById('format-quote-btn');
  if (quoteBtn) {
    quoteBtn.addEventListener('click', () => handleFormatText('quote'));
  }
  
  // Lists
  const listBtn = document.getElementById('format-list-btn');
  if (listBtn) {
    listBtn.addEventListener('click', () => handleFormatText('list'));
  }
  
  const numberListBtn = document.getElementById('format-numberlist-btn');
  if (numberListBtn) {
    numberListBtn.addEventListener('click', () => handleFormatText('numberlist'));
  }
  
  // Code block
  const codeBlockBtn = document.getElementById('format-codeblock-btn');
  if (codeBlockBtn) {
    codeBlockBtn.addEventListener('click', () => handleFormatText('codeblock'));
  }
  
  console.log('[Editor Utils] Formatting toolbar setup completed');
}

// Handle image insertion with file browser
async function handleImageInsertion() {
  console.log('[Editor] Opening image file browser');
  
  try {
    // Call the IPC handler to browse for image
    const result = await window.electronAPI.invoke('browse-for-image');
    
    if (!result.success) {
      if (!result.canceled) {
        console.error('[Editor] Error browsing for image:', result.error);
      }
      return;
    }
    
    console.log('[Editor] Image selected:', result.fileName);
    
    // Create the image markdown with the selected file
    const altText = result.fileName.replace(/\.[^/.]+$/, ''); // Remove extension for alt text
    const imagePath = result.relativePath || result.filePath; // Use relative path if available
    const imageMarkdown = `![${altText}](${imagePath})`;
    
    // Insert the image markdown at current cursor position
    const position = window.editor.getPosition();
    window.editor.executeEdits('insert-image', [{
      range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
      text: imageMarkdown
    }]);
    
    // Focus the editor
    window.editor.focus();
    
    // Update preview if available
    if (window.updatePreviewAndStructure) {
      await window.updatePreviewAndStructure(window.editor.getValue());
    }
    
  } catch (error) {
    console.error('[Editor] Error in image insertion:', error);
  }
}

// Export functions to global scope for backward compatibility
window.handleFormatText = handleFormatText;
window.applyFormatting = applyFormatting;
window.insertAtLineStart = insertAtLineStart;
window.getCurrentEditorContent = getCurrentEditorContent;
window.setEditorContent = setEditorContent;
window.insertTextAtCursor = insertTextAtCursor;
window.getSelectedText = getSelectedText;
window.replaceSelectedText = replaceSelectedText;
window.focusEditor = focusEditor;
window.getEditorLineCount = getEditorLineCount;
window.goToLine = goToLine;
window.findInEditor = findInEditor;
window.replaceInEditor = replaceInEditor;
window.setupEditorFormatting = setupEditorFormatting;
window.handleImageInsertion = handleImageInsertion;
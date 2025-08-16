// === Annotations Module ===
// Handles three types of annotations:
// 1. HTML comment annotations: <!-- @note: This is an annotation -->
// 2. Inline highlight annotations: ==text=={@note Important concept}
// 3. Block annotations: :::annotation type="note" author="instructor" ... :::

// --- Global Variables ---
let annotationCounter = 0;
const annotations = new Map();

// --- Core Annotation Processing ---
function processAnnotations(text) {
    // Handle undefined or null text
    if (!text || typeof text !== 'string') {
        console.warn('[Annotations] Text is undefined or not a string:', text);
        return text || '';
    }
    
    // Initialize global annotation counter if needed
    if (!window.annotationCounter) {
        window.annotationCounter = 0;
    }
    annotationCounter = window.annotationCounter;
    
    console.log('[Annotations] Processing annotations on content length:', text.length);
    let processedText = text;
    
    // 1. Process HTML comment annotations: <!-- @note: This is an annotation -->
    const commentAnnotationRegex = /<!--\s*@(\w+):\s*(.*?)\s*-->/g;
    let commentMatches = 0;
    processedText = processedText.replace(commentAnnotationRegex, (match, type, content) => {
        commentMatches++;
        console.log(`[Annotations] Found comment annotation #${commentMatches}:`, type, content);
        const id = `annotation-${++annotationCounter}`;
        const marker = createAnnotationMarker(id, type, content, 'comment');
        console.log(`[Annotations] Generated marker:`, marker);
        return marker;
    });
    console.log(`[Annotations] Processed ${commentMatches} comment annotations`);
    
    // 2. Process inline highlight annotations: ==text=={@note Important concept}
    const inlineAnnotationRegex = /==(.*?)==\{@(\w+)\s+(.*?)\}/g;
    let inlineMatches = 0;
    processedText = processedText.replace(inlineAnnotationRegex, (match, highlightText, type, content) => {
        inlineMatches++;
        console.log(`[Annotations] Found inline annotation #${inlineMatches}:`, highlightText, type, content);
        const id = `annotation-${++annotationCounter}`;
        const marker = createAnnotationMarker(id, type, content, 'inline');
        return `<mark class="annotation-highlight" data-annotation-id="${id}">${highlightText}</mark>${marker}`;
    });
    console.log(`[Annotations] Processed ${inlineMatches} inline annotations`);
    
    // 3. Process block annotations: :::annotation type="note" author="instructor" ... :::
    const blockAnnotationRegex = /:::\s*annotation\s+(.*?)\n([\s\S]*?)\n:::/g;
    let blockMatches = 0;
    processedText = processedText.replace(blockAnnotationRegex, (match, attributes, content) => {
        blockMatches++;
        console.log(`[Annotations] Found block annotation #${blockMatches}:`, attributes, content);
        const id = `annotation-${++annotationCounter}`;
        
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
    console.log(`[Annotations] Processed ${blockMatches} block annotations`);
    
    // Update global counter
    window.annotationCounter = annotationCounter;
    
    console.log('[Annotations] Final processed text length:', processedText.length);
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
    
    // Store in local map too for module access
    annotations.set(id, {
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
    const annotation = window.annotations?.get(annotationId) || annotations.get(annotationId);
    if (!annotation) {
        console.warn(`[Annotations] Annotation not found: ${annotationId}`);
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
    console.log(`[Annotations] Showing annotation tooltip for: ${annotationId}`);
}

// --- Hide Annotation Tooltip ---
function hideAnnotationTooltip() {
    const tooltip = document.querySelector('.annotation-tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

// --- Annotation Insertion Functions ---
async function insertCommentAnnotation() {
    if (!window.editor) {
        console.warn('[Annotations] Cannot insert comment annotation - no editor available');
        return;
    }
    
    const selection = window.editor.getSelection();
    const position = window.editor.getPosition();
    
    showAnnotationDialog('comment', (result) => {
        if (result) {
            const template = `<!-- @${result.type}: ${result.content.trim()} -->`;
            
            window.editor.executeEdits('insert-comment-annotation', [{
                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                text: template
            }]);
            
            window.editor.focus();
            if (window.updatePreviewAndStructure) {
                window.updatePreviewAndStructure(window.editor.getValue());
            }
            console.log(`[Annotations] Inserted comment annotation: ${result.type}`);
        }
    });
}

async function insertHighlightAnnotation() {
    if (!window.editor) {
        console.warn('[Annotations] Cannot insert highlight annotation - no editor available');
        return;
    }
    
    const selection = window.editor.getSelection();
    const selectedText = window.editor.getModel().getValueInRange(selection);
    
    if (!selectedText || selectedText.trim() === '') {
        if (window.showNotification) {
            window.showNotification('Please select text to highlight before adding an annotation.', 'warning');
        }
        return;
    }
    
    showAnnotationDialog('highlight', (result) => {
        if (result) {
            const template = `==${selectedText}=={@${result.type} ${result.content.trim()}}`;
            
            window.editor.executeEdits('insert-highlight-annotation', [{
                range: selection,
                text: template
            }]);
            
            window.editor.focus();
            if (window.updatePreviewAndStructure) {
                window.updatePreviewAndStructure(window.editor.getValue());
            }
            console.log(`[Annotations] Inserted highlight annotation: ${result.type}`);
        }
    });
}

async function insertBlockAnnotation() {
    if (!window.editor) {
        console.warn('[Annotations] Cannot insert block annotation - no editor available');
        return;
    }
    
    const position = window.editor.getPosition();
    
    showAnnotationDialog('block', (result) => {
        if (result) {
            const template = `\n:::annotation type="${result.type}" author="${result.author}"\n${result.content.trim()}\n:::\n`;
            
            window.editor.executeEdits('insert-block-annotation', [{
                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                text: template
            }]);
            
            window.editor.focus();
            if (window.updatePreviewAndStructure) {
                window.updatePreviewAndStructure(window.editor.getValue());
            }
            console.log(`[Annotations] Inserted block annotation: ${result.type}`);
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
            if (window.showNotification) {
                window.showNotification('Please enter annotation content.', 'warning');
            }
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

// --- Utility Functions ---
function getAnnotationById(id) {
    return window.annotations?.get(id) || annotations.get(id);
}

function getAllAnnotations() {
    return window.annotations || annotations;
}

function clearAllAnnotations() {
    if (window.annotations) {
        window.annotations.clear();
    }
    annotations.clear();
    if (window.annotationCounter !== undefined) {
        window.annotationCounter = 0;
    }
    annotationCounter = 0;
}

// --- Global Function Exposure (for onclick handlers) ---
// These need to be available globally for the onclick handlers in HTML
window.showAnnotationTooltip = showAnnotationTooltip;
window.hideAnnotationTooltip = hideAnnotationTooltip;
window.insertCommentAnnotation = insertCommentAnnotation;
window.insertHighlightAnnotation = insertHighlightAnnotation;
window.insertBlockAnnotation = insertBlockAnnotation;
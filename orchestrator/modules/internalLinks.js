// === Internal Links Module ===
// Handles Obsidian-style [[]] internal links with three preview modes:
// - disabled: plain text
// - hover: tooltip on hover
// - inline: embedded content

// --- Core Internal Links Processing ---
async function processInternalLinks(content) {
    const previewMode = getLinkPreviewMode();
    
    // If disabled, remove internal links entirely or render as plain text
    if (previewMode === 'disabled') {
        const internalLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
        return content.replace(internalLinkRegex, (match, link, displayText) => {
            const display = displayText ? displayText.trim() : link.trim();
            return display; // Just show the text without link functionality
        });
    }
    
    // For hover and inline modes, we need to process each link
    const internalLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    
    // If inline mode, we need to load content for each link
    if (previewMode === 'inline') {
        const linkPromises = [];
        const linkData = [];
        let match;
        
        // Collect all links first
        while ((match = internalLinkRegex.exec(content)) !== null) {
            const cleanLink = match[1].trim();
            const display = match[2] ? match[2].trim() : cleanLink;
            
            let filePath = cleanLink;
            if (!filePath.endsWith('.md') && !filePath.endsWith('.bib') && !filePath.endsWith('.pdf') && !filePath.endsWith('.html') && !filePath.endsWith('.htm') && !filePath.includes('.')) {
                filePath += '.md';
            }
            
            linkData.push({ match: match[0], cleanLink, display, filePath });
            linkPromises.push(loadLinkContent(filePath));
        }
        
        // Load all link contents
        const linkContents = await Promise.all(linkPromises);
        
        // Replace links with inline content
        let processedContent = content;
        for (let i = linkData.length - 1; i >= 0; i--) { // Reverse order to maintain positions
            const { match, cleanLink, display, filePath } = linkData[i];
            const linkContent = linkContents[i];
            
            const inlineHTML = createInlineLinkPreview(display, cleanLink, filePath, linkContent);
            processedContent = processedContent.replace(match, inlineHTML);
        }
        
        return processedContent;
    }
    
    // Default hover mode
    return content.replace(internalLinkRegex, (match, link, displayText) => {
        const cleanLink = link.trim();
        const display = displayText ? displayText.trim() : cleanLink;
        
        let filePath = cleanLink;
        if (!filePath.endsWith('.md') && !filePath.endsWith('.bib') && !filePath.endsWith('.pdf') && !filePath.endsWith('.html') && !filePath.endsWith('.htm') && !filePath.includes('.')) {
            filePath += '.md';
        }
        
        return `<a href="#" class="internal-link" data-link="${encodeURIComponent(filePath)}" data-original-link="${encodeURIComponent(cleanLink)}" title="Open ${display}">${display}</a>`;
    });
}

async function loadLinkContent(filePath) {
    try {
        const workingDir = window.appSettings?.workingDirectory || '/Users/lmagee/Dev/hegel-pedagogy-ai/lectures';
        const fullPath = `${workingDir}/${filePath}`;
        
        // CRITICAL FIX: Use read-file-content to avoid changing currentFilePath
        const result = await window.electronAPI.invoke('read-file-content', fullPath);
        
        if (result.success) {
            return extractPreviewContent(result.content);
        }
    } catch (error) {
    }
    
    return 'Content not available';
}

function createInlineLinkPreview(display, cleanLink, filePath, content) {
    // Render markdown content as HTML if marked is available
    const renderedContent = window.marked ? window.marked.parse(content) : content.replace(/\n/g, '<br>');
    
    return `
        <div class="inline-link-preview">
            <div class="inline-link-header">
                <a href="#" class="internal-link" data-link="${encodeURIComponent(filePath)}" data-original-link="${encodeURIComponent(cleanLink)}" title="Open ${display}">
                    📄 ${display}
                </a>
            </div>
            <div class="inline-link-content">
                ${renderedContent}
            </div>
        </div>
    `;
}

// --- Link Click Handler ---
function handleInternalLinkClick(event) {
    if (event.target && event.target.classList && event.target.classList.contains('internal-link')) {
        event.preventDefault();
        const filePath = decodeURIComponent(event.target.getAttribute('data-link'));
        const originalLink = decodeURIComponent(event.target.getAttribute('data-original-link'));
        
        
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
        
        
        // CRITICAL FIX: Use read-file-content instead of open-file-path to avoid changing currentFilePath
        const result = await window.electronAPI.invoke('read-file-content', fullPath);
        
        if (result.success) {
            
            // If we're currently in presentation mode, switch to editor mode first
            if (window.switchToMode && typeof window.switchToMode === 'function') {
                const presentationContent = document.getElementById('presentation-content');
                if (presentationContent && presentationContent.classList.contains('active')) {
                    window.switchToMode('editor');
                }
            }
            
            // Load the file content into both editor and preview
            // CRITICAL FIX: Pass flag to prevent changing currentFilePath
            await window.openFileInEditor(result.filePath, result.content, { isInternalLinkPreview: true });
        } else {
            // File not found - just show an error, don't auto-create
            console.warn(`[openInternalLink] File not found: ${fullPath}`);
            alert(`File not found: ${filePath}`);
        }
    } catch (error) {
    }
}

// --- Link Preview Functions ---
function setupLinkPreviewHandlers() {
    // Event delegation for dynamically created internal links
    document.addEventListener('mouseenter', handleLinkHover, true);
    document.addEventListener('mouseleave', handleLinkMouseOut, true);
    document.addEventListener('mousemove', handleLinkMouseMove, true);
}

function handleLinkHover(event) {
    if (event.target && event.target.classList && event.target.classList.contains('internal-link')) {
        const filePath = decodeURIComponent(event.target.getAttribute('data-link'));
        const originalLink = decodeURIComponent(event.target.getAttribute('data-original-link'));
        
        // Only show tooltip if not in inline mode
        const previewMode = getLinkPreviewMode();
        if (previewMode === 'hover') {
            showLinkPreview(filePath, originalLink, event.target, event.pageX, event.pageY);
        }
    }
}

function handleLinkMouseOut(event) {
    if (event.target && event.target.classList && event.target.classList.contains('internal-link')) {
        hideLinkPreview();
    }
}

function handleLinkMouseMove(event) {
    if (event.target && event.target.classList && event.target.classList.contains('internal-link')) {
        updateLinkPreviewPosition(event.pageX, event.pageY);
    }
}

async function showLinkPreview(filePath, originalLink, linkElement, x, y) {
    try {
        const workingDir = window.appSettings?.workingDirectory || '/Users/lmagee/Dev/hegel-pedagogy-ai/lectures';
        const fullPath = `${workingDir}/${filePath}`;
        
        // CRITICAL FIX: Use read-file-content for hover previews to avoid changing currentFilePath
        const result = await window.electronAPI.invoke('read-file-content', fullPath);
        
        if (result.success && result.content) {
            const content = extractPreviewContent(result.content);
            const tooltip = createLinkPreviewTooltip(originalLink, filePath, content, x, y);
            document.body.appendChild(tooltip);
        }
    } catch (error) {
    }
}

function extractPreviewContent(content) {
    if (!content) return 'No content available';
    
    // Split into lines and filter out empty lines
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return 'Empty file';
    
    // Collect meaningful content lines (excluding headers, links, code blocks, etc.)
    const meaningfulLines = [];
    let inCodeBlock = false;
    
    for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Skip empty lines
        if (!trimmedLine) continue;
        
        // Track code block boundaries
        if (trimmedLine.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }
        
        // Skip content inside code blocks
        if (inCodeBlock) continue;
        
        // Skip markdown headers
        if (trimmedLine.startsWith('#')) continue;
        
        // Skip lines that are just internal links
        if (trimmedLine.match(/^\[\[[^\]]+\]\]$/)) continue;
        
        // Skip lines that are just markdown formatting (like ---, ***, etc.)
        if (trimmedLine.match(/^[-*=_]{3,}$/)) continue;
        
        // Skip lines that start with markdown list markers followed by just a link
        if (trimmedLine.match(/^[-*+]\s*\[\[[^\]]+\]\]$/)) continue;
        
        // This looks like meaningful content
        meaningfulLines.push(trimmedLine);
        
        // Stop once we have enough content (equivalent to about 2 sentences)
        const combinedText = meaningfulLines.join(' ');
        if (combinedText.length > 300 || meaningfulLines.length >= 3) {
            break;
        }
    }
    
    if (meaningfulLines.length === 0) {
        // Fallback: return first non-header line even if it might be a link
        const fallbackLine = lines.find(line => !line.trim().startsWith('#'));
        return fallbackLine ? fallbackLine.trim().substring(0, 200) + '...' : 'No content preview available';
    }
    
    // Join the meaningful lines and clean up any remaining markdown
    let previewText = meaningfulLines.join(' ');
    
    // Remove internal links from the preview text
    previewText = previewText.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, link, displayText) => {
        return displayText ? displayText.trim() : link.trim();
    });
    
    // Remove inline code markers
    previewText = previewText.replace(/`([^`]+)`/g, '$1');
    
    // Remove bold/italic markers
    previewText = previewText.replace(/\*\*([^*]+)\*\*/g, '$1');
    previewText = previewText.replace(/\*([^*]+)\*/g, '$1');
    
    // Limit length and add ellipsis if needed
    if (previewText.length > 400) {
        // Try to cut at a sentence boundary
        const sentences = previewText.substring(0, 400).split(/[.!?]/);
        if (sentences.length > 1) {
            // Use all complete sentences except the last incomplete one
            previewText = sentences.slice(0, -1).join('.') + '.';
        } else {
            // Cut at word boundary
            const words = previewText.substring(0, 400).split(' ');
            previewText = words.slice(0, -1).join(' ') + '...';
        }
    }
    
    return previewText || 'No content preview available';
}

function createLinkPreviewTooltip(originalLink, filePath, content, x, y) {
    const tooltip = document.createElement('div');
    tooltip.className = 'link-preview-tooltip';
    
    // Render markdown content as HTML if marked is available
    const renderedContent = window.marked ? window.marked.parse(content) : content.replace(/\n/g, '<br>');
    
    tooltip.innerHTML = `
        <div class="link-preview-header">
            <strong>${originalLink}</strong>
            <div class="link-preview-path">${filePath}</div>
        </div>
        <div class="link-preview-content">${renderedContent}</div>
    `;
    
    updateTooltipPosition(tooltip, x, y);
    return tooltip;
}

function updateTooltipPosition(tooltip, x, y) {
    const offset = 15;
    tooltip.style.position = 'fixed';
    tooltip.style.left = `${x + offset}px`;
    tooltip.style.top = `${y + offset}px`;
    tooltip.style.zIndex = '10000';
    tooltip.style.maxWidth = '350px';
    tooltip.style.background = 'white';
    tooltip.style.border = '1px solid #ccc';
    tooltip.style.borderRadius = '8px';
    tooltip.style.padding = '12px';
    tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    tooltip.style.fontSize = '14px';
    tooltip.style.fontFamily = 'system-ui, -apple-system, sans-serif';
}

let currentPreviewTooltip = null;

function updateLinkPreviewPosition(x, y) {
    const tooltip = document.querySelector('.link-preview-tooltip');
    if (tooltip) {
        updateTooltipPosition(tooltip, x, y);
    }
}

function hideLinkPreview() {
    const tooltip = document.querySelector('.link-preview-tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

// --- Link Preview Settings ---
function isLinkPreviewEnabled() {
    return window.appSettings?.linkPreview?.enabled !== false;
}

function getLinkPreviewMode() {
    return window.appSettings?.linkPreview?.mode || 'hover'; // 'disabled', 'hover', 'inline'
}

function setLinkPreviewMode(mode) {
    if (!window.appSettings) window.appSettings = {};
    if (!window.appSettings.linkPreview) window.appSettings.linkPreview = {};
    window.appSettings.linkPreview.mode = mode;
}

async function toggleLinkPreview() {
    const currentMode = getLinkPreviewMode();
    let newMode;
    
    // Cycle through: disabled → hover → inline → disabled
    switch (currentMode) {
        case 'disabled':
            newMode = 'hover';
            break;
        case 'hover':
            newMode = 'inline';
            break;
        case 'inline':
        default:
            newMode = 'disabled';
            break;
    }
    
    setLinkPreviewMode(newMode);
    
    // Update settings
    try {
        const updatedSettings = { ...window.appSettings };
        updatedSettings.linkPreview.mode = newMode;
        await window.electronAPI.invoke('set-settings', updatedSettings);
        
        // Show notification
        const modes = {
            'disabled': 'Link previews disabled',
            'hover': 'Link previews on hover',
            'inline': 'Inline link previews'
        };
        window.showNotification(modes[newMode], 'success');
        
        // Update preview to reflect changes
        if (window.updatePreviewAndStructure && window.editor) {
            await window.updatePreviewAndStructure(window.editor.getValue());
        }
    } catch (error) {
    }
}

// --- Auto-create Link File Functions ---
async function autoCreateInternalLinkFile(fullPath, originalLink, filePath) {
    // DISABLED: This function was causing file overwrites
    console.error(`[autoCreateInternalLinkFile] AUTO-CREATION DISABLED - File not found: ${fullPath}`);
    alert(`File not found: ${filePath}\n\nAuto-creation has been disabled to prevent file overwrites.`);
    return;
}

async function generateContentForInternalLink(originalLink, filePath) {
    // DISABLED: This function was causing file overwrites
    console.error(`[generateContentForInternalLink] DISABLED - Content generation blocked for: ${originalLink}`);
    return `# ${originalLink}\n\n(Auto-generation disabled)`;
}

// --- Process Internal Links in HTML (after markdown rendering) ---
async function processInternalLinksHTML(htmlContent) {
    const previewMode = getLinkPreviewMode();
    
    // If disabled, remove internal links entirely
    if (previewMode === 'disabled') {
        // Find [[link]] patterns in HTML and replace with just the display text
        return htmlContent.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, link, displayText) => {
            const display = displayText ? displayText.trim() : link.trim();
            return display;
        });
    }
    
    // For hover mode, replace with clickable links
    if (previewMode === 'hover') {
        return htmlContent.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, link, displayText) => {
            const cleanLink = link.trim();
            const display = displayText ? displayText.trim() : cleanLink;
            
            let filePath = cleanLink;
            if (!filePath.endsWith('.md') && !filePath.endsWith('.bib') && !filePath.endsWith('.pdf') && !filePath.endsWith('.html') && !filePath.endsWith('.htm') && !filePath.includes('.')) {
                filePath += '.md';
            }
            
            return `<a href="#" class="internal-link" data-link="${encodeURIComponent(filePath)}" data-original-link="${encodeURIComponent(cleanLink)}" title="Open ${display}">${display}</a>`;
        });
    }
    
    // For inline mode, we need to load content for each link
    if (previewMode === 'inline') {
        const linkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
        const linkPromises = [];
        const linkData = [];
        let match;
        
        // Collect all links first
        const tempContent = htmlContent; // Work on a copy
        while ((match = linkRegex.exec(tempContent)) !== null) {
            const cleanLink = match[1].trim();
            const display = match[2] ? match[2].trim() : cleanLink;
            
            let filePath = cleanLink;
            if (!filePath.endsWith('.md') && !filePath.endsWith('.bib') && !filePath.endsWith('.pdf') && !filePath.endsWith('.html') && !filePath.endsWith('.htm') && !filePath.includes('.')) {
                filePath += '.md';
            }
            
            linkData.push({ match: match[0], cleanLink, display, filePath });
            linkPromises.push(loadLinkContent(filePath));
        }
        
        // Load all link contents
        const linkContents = await Promise.all(linkPromises);
        
        // Replace links with inline content
        let processedHTML = htmlContent;
        for (let i = linkData.length - 1; i >= 0; i--) { // Reverse order to maintain positions
            const { match, cleanLink, display, filePath } = linkData[i];
            const linkContent = linkContents[i];
            
            const inlineHTML = createInlineLinkPreview(display, cleanLink, filePath, linkContent);
            processedHTML = processedHTML.replace(match, inlineHTML);
        }
        
        return processedHTML;
    }
    
    return htmlContent;
}

// --- Export for Global Access ---
window.processInternalLinks = processInternalLinks;
window.processInternalLinksHTML = processInternalLinksHTML;
window.openInternalLink = openInternalLink;
window.setupLinkPreviewHandlers = setupLinkPreviewHandlers;
window.toggleLinkPreview = toggleLinkPreview;
window.autoCreateInternalLinkFile = autoCreateInternalLinkFile;
window.generateContentForInternalLink = generateContentForInternalLink;

function extractLinkContext(content, linkText) {
    try {
        // Find the line containing the link
        const lines = content.split('\n');
        const linkLineIndex = lines.findIndex(line => line.includes(`[[${linkText}]]`) || line.includes(`[[${linkText}|`));
        
        if (linkLineIndex === -1) return 'No context found';
        
        // Get surrounding context (3 lines before and after)
        const start = Math.max(0, linkLineIndex - 3);
        const end = Math.min(lines.length, linkLineIndex + 4);
        const contextLines = lines.slice(start, end);
        
        return contextLines.map((line, index) => {
            const actualLineIndex = start + index;
            const marker = actualLineIndex === linkLineIndex ? '→ ' : '  ';
            return `${marker}${line}`;
        }).join('\n');
    } catch (error) {
        return 'Context extraction failed';
    }
}

function generateTemplateSections(linkName) {
    // Generate relevant sections based on the link name/topic
    const cleanName = linkName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    
    if (cleanName.includes('concept') || cleanName.includes('theory') || cleanName.includes('principle')) {
        return `## Definition

Define ${linkName} here.

## Key Points

- Point 1
- Point 2
- Point 3

## Examples

Provide examples of ${linkName}.

## Related Concepts

- [[Related Concept 1]]
- [[Related Concept 2]]`;
    }
    
    if (cleanName.includes('process') || cleanName.includes('method') || cleanName.includes('procedure')) {
        return `## Overview

Describe the ${linkName} process.

## Steps

1. Step 1
2. Step 2  
3. Step 3

## Requirements

List requirements for ${linkName}.

## Outcomes

Expected outcomes of ${linkName}.`;
    }
    
    // Default template
    return `## Overview

Brief description of ${linkName}.

## Details

Detailed information about ${linkName}.

## References

- Reference 1
- Reference 2`;
}

// Export functions to global scope
window.handleInternalLinkClick = handleInternalLinkClick;
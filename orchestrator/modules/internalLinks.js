console.log('INTERNAL LINKS MODULE TEST - File is being loaded');
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
        
        const result = await window.electronAPI.invoke('open-file-path', fullPath);
        
        if (result.success) {
            return extractPreviewContent(result.content);
        }
    } catch (error) {
        console.error(`[InlinePreview] Error loading content for ${filePath}:`, error);
    }
    
    return 'Content not available';
}

function createInlineLinkPreview(display, cleanLink, filePath, content) {
    return `
        <div class="inline-link-preview">
            <div class="inline-link-header">
                <a href="#" class="internal-link" data-link="${encodeURIComponent(filePath)}" data-original-link="${encodeURIComponent(cleanLink)}" title="Open ${display}">
                    📄 ${display}
                </a>
            </div>
            <div class="inline-link-content">
                <p>${content}</p>
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
        
        console.log(`[renderer.js] Internal link clicked: ${originalLink} -> ${filePath}`);
        
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
        
        console.log(`[renderer.js] Attempting to open internal link: ${fullPath}`);
        
        // Try to open the file
        const result = await window.electronAPI.invoke('open-file-path', fullPath);
        
        if (result.success) {
            console.log(`[renderer.js] Successfully opened internal link: ${filePath}`);
            
            // If we're currently in presentation mode, switch to editor mode first
            if (window.switchToMode && typeof window.switchToMode === 'function') {
                const presentationContent = document.getElementById('presentation-content');
                if (presentationContent && presentationContent.classList.contains('active')) {
                    console.log(`[renderer.js] Switching from presentation to editor mode to open internal link`);
                    window.switchToMode('editor');
                }
            }
            
            // Load the file content into both editor and preview
            await window.openFileInEditor(result.filePath, result.content);
        } else {
            console.warn(`[renderer.js] Could not open internal link: ${result.error}`);
            
            // Try to automatically create the file based on current content
            await autoCreateInternalLinkFile(fullPath, originalLink, filePath);
        }
    } catch (error) {
        console.error(`[renderer.js] Error opening internal link:`, error);
    }
}

// --- Link Preview Functions ---
function setupLinkPreviewHandlers() {
    console.log('[LinkPreview] Setting up link preview handlers...');
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
        
        console.log(`[LinkPreview] Loading preview for: ${fullPath}`);
        
        const result = await window.electronAPI.invoke('open-file-path', fullPath);
        
        if (result.success && result.content) {
            const content = extractPreviewContent(result.content);
            const tooltip = createLinkPreviewTooltip(originalLink, filePath, content, x, y);
            document.body.appendChild(tooltip);
        }
    } catch (error) {
        console.error(`[LinkPreview] Error loading preview for ${filePath}:`, error);
    }
}

function extractPreviewContent(content) {
    if (!content) return 'No content available';
    
    // Extract first paragraph or first 200 characters
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return 'Empty file';
    
    // Find first non-header line
    const contentLine = lines.find(line => !line.trim().startsWith('#'));
    if (contentLine) {
        return contentLine.trim().substring(0, 200) + (contentLine.length > 200 ? '...' : '');
    }
    
    // Fallback to first line
    return lines[0].substring(0, 200) + (lines[0].length > 200 ? '...' : '');
}

function createLinkPreviewTooltip(originalLink, filePath, content, x, y) {
    const tooltip = document.createElement('div');
    tooltip.className = 'link-preview-tooltip';
    tooltip.innerHTML = `
        <div class="link-preview-header">
            <strong>${originalLink}</strong>
            <div class="link-preview-path">${filePath}</div>
        </div>
        <div class="link-preview-content">${content}</div>
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
        console.log(`[Settings] Link preview mode changed to: ${newMode}`);
        
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
        console.error('[Settings] Failed to update link preview mode:', error);
    }
}

// --- Auto-create Link File Functions ---
async function autoCreateInternalLinkFile(fullPath, originalLink, filePath) {
    try {
        console.log(`[renderer.js] Auto-creating file for internal link: ${fullPath}`);
        
        // Check if file already exists to detect conflicts
        const fileExists = await window.electronAPI.invoke('check-file-exists', fullPath);
        
        if (fileExists) {
            console.log(`[renderer.js] File already exists: ${fullPath}`);
            // Show conflict dialog and let user decide
            const shouldOverwrite = confirm(`File "${filePath}" already exists. Would you like to open it instead?`);
            if (shouldOverwrite) {
                // Try to open the existing file
                const result = await window.electronAPI.invoke('open-file-path', fullPath);
                if (result.success) {
                    await window.openFileInEditor(result.filePath, result.content);
                    return;
                }
            }
            return; // User chose not to overwrite, or opening failed
        }
        
        // Generate content based on the current file and context
        const newFileContent = await generateContentForInternalLink(originalLink, filePath);
        
        // Create the file automatically at the expected path
        const result = await window.electronAPI.invoke('create-internal-link-file', {
            filePath: fullPath,
            content: newFileContent
        });
        
        if (result.success) {
            console.log(`[renderer.js] Successfully created file for internal link: ${fullPath}`);
            
            // Refresh file tree to show the new file
            if (window.renderFileTree) window.renderFileTree();
            
            // Automatically open the new file
            await window.openFileInEditor(result.filePath, newFileContent);
            
            // Show success notification
            window.showNotification(`Created new file: ${filePath}`, 'success');
        } else {
            console.error(`[renderer.js] Failed to auto-create file for internal link:`, result.error);
            
            // Fall back to manual creation with dialog
            const shouldCreateManually = confirm(`Failed to automatically create "${filePath}". Would you like to choose a location manually?`);
            if (shouldCreateManually) {
                // Get default directory
                let defaultDirectory = window.appSettings?.workingDirectory;
                if (!defaultDirectory) {
                    try {
                        const settings = await window.electronAPI.invoke('get-settings');
                        defaultDirectory = settings?.workingDirectory;
                    } catch (error) {
                        console.warn('[Internal Links] Failed to load settings for save-as:', error);
                    }
                }
                
                const manualResult = await window.electronAPI.invoke('perform-save-as', {
                    content: newFileContent,
                    defaultDirectory: defaultDirectory
                });
                if (manualResult.success) {
                    console.log(`[renderer.js] Manual file creation succeeded: ${manualResult.filePath}`);
                    window.renderFileTree();
                }
            }
        }
    } catch (error) {
        console.error(`[renderer.js] Error in autoCreateInternalLinkFile:`, error);
    }
}

async function generateContentForInternalLink(originalLink, filePath) {
    try {
        // Extract context around this link from the current content
        const currentContent = window.editor ? window.editor.getValue() : '';
        const context = extractLinkContext(currentContent, originalLink);
        
        // Generate template sections based on the link name
        const templateSections = generateTemplateSections(originalLink);
        
        // Combine context and template
        const content = `# ${originalLink}

> Generated from link in: ${window.currentFilePath ? window.currentFilePath.split('/').pop() : 'current document'}

## Context

${context}

${templateSections}

## Notes

- Add your content here
- This file was automatically created from an internal link
- Edit this content to customize the document

---

*Created: ${new Date().toISOString().split('T')[0]}*
`;
        
        return content;
    } catch (error) {
        console.error('[generateContentForInternalLink] Error:', error);
        // Fallback to simple template
        return `# ${originalLink}

## Notes

Add your content here.

---

*Created: ${new Date().toISOString().split('T')[0]}*
`;
    }
}

// --- Export for Global Access ---
window.processInternalLinks = processInternalLinks;
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
        console.error('[extractLinkContext] Error:', error);
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
// === Export Module ===
// Handles all document export functionality including:
// - PDF export (with and without references)
// - HTML export (with and without references)  
// - PowerPoint export
// - HTML generation from markdown
// - Export event handlers and IPC communication

// --- Utility Functions ---
function getCurrentEditorContent() {
    let content = '';
    if (window.editor && typeof window.editor.getValue === 'function') {
        content = window.editor.getValue();
    } else if (window.fallbackEditor) { // Fallback if Monaco fails
        content = window.fallbackEditor.value;
    }
    return content;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- HTML Generation ---
function generateHTMLFromMarkdown(markdownContent) {
    if (!markdownContent) {
        return '<html><head><title>Export</title></head><body><p>No content to export</p></body></html>';
    }

    // Check if marked is available (it should be loaded from CDN)
    if (typeof marked === 'undefined') {
        console.warn('[Export] Marked library not available, using plain text');
        return `<html>
<head>
    <title>Export</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px; 
            line-height: 1.6; 
        }
    </style>
</head>
<body>
    <pre>${escapeHtml(markdownContent)}</pre>
</body>
</html>`;
    }

    // Convert markdown to HTML using marked
    const htmlBody = marked.parse(markdownContent);
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Exported Document</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px; 
            margin: 0 auto; 
            padding: 40px 20px; 
            line-height: 1.6; 
            color: #333;
        }
        h1, h2, h3, h4, h5, h6 {
            color: #2c3e50;
            margin-top: 2em;
            margin-bottom: 1em;
        }
        h1 { font-size: 2.5em; border-bottom: 2px solid #3498db; padding-bottom: 0.5em; }
        h2 { font-size: 2em; border-bottom: 1px solid #bdc3c7; padding-bottom: 0.3em; }
        h3 { font-size: 1.5em; }
        p { margin-bottom: 1em; }
        code {
            background-color: #f8f9fa;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: 'Monaco', 'Consolas', monospace;
        }
        pre {
            background-color: #f8f9fa;
            padding: 1em;
            border-radius: 5px;
            overflow-x: auto;
        }
        blockquote {
            border-left: 4px solid #3498db;
            margin: 1em 0;
            padding: 0 1em;
            color: #7f8c8d;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 0.5em;
            text-align: left;
        }
        th {
            background-color: #f8f9fa;
            font-weight: bold;
        }
        ul, ol {
            margin: 1em 0;
            padding-left: 2em;
        }
        li {
            margin: 0.5em 0;
        }
        @media print {
            body { margin: 0; padding: 20px; }
        }
    </style>
</head>
<body>
    ${htmlBody}
</body>
</html>`;
}

// --- Export Command Functions ---
function exportToPDF() {
    if (!window.currentFilePath) {
        if (window.showNotification) {
            window.showNotification('Please open a file first', 'error');
        }
        return;
    }
    
    console.log('[Export] Triggering PDF export...');
    if (window.electronAPI) {
        window.electronAPI.invoke('trigger-export', 'pdf');
    }
}

function exportToPDFWithReferences() {
    if (!window.currentFilePath) {
        if (window.showNotification) {
            window.showNotification('Please open a file first', 'error');
        }
        return;
    }
    
    console.log('[Export] Triggering PDF export with references...');
    if (window.electronAPI) {
        window.electronAPI.invoke('trigger-export', 'pdf-pandoc');
    }
}

function exportToHTML() {
    if (!window.currentFilePath) {
        if (window.showNotification) {
            window.showNotification('Please open a file first', 'error');
        }
        return;
    }
    
    console.log('[Export] Triggering HTML export...');
    if (window.electronAPI) {
        window.electronAPI.invoke('trigger-export', 'html');
    }
}

function exportToHTMLWithReferences() {
    if (!window.currentFilePath) {
        if (window.showNotification) {
            window.showNotification('Please open a file first', 'error');
        }
        return;
    }
    
    console.log('[Export] Triggering HTML export with references...');
    if (window.electronAPI) {
        window.electronAPI.invoke('trigger-export', 'html-pandoc');
    }
}

function exportToPowerPoint() {
    if (!window.currentFilePath) {
        if (window.showNotification) {
            window.showNotification('Please open a file first', 'error');
        }
        return;
    }
    
    console.log('[Export] Triggering PowerPoint export...');
    if (window.electronAPI) {
        window.electronAPI.invoke('trigger-export', 'pptx');
    }
}

// --- Export Event Handlers ---
function initializeExportHandlers() {
    console.log('[Export] Initializing export handlers...');
    
    if (!window.electronAPI) {
        console.warn('[Export] ElectronAPI not available, skipping export handler initialization');
        return;
    }

    // HTML export handler
    window.electronAPI.on('trigger-export-html', async () => {
        console.log('[Export] Received trigger-export-html.');
        const content = getCurrentEditorContent();
        try {
            // Show initial notification
            if (window.showNotification) {
                window.showNotification('Preparing HTML export...', 'info');
            }
            
            // Generate HTML from markdown
            const htmlContent = generateHTMLFromMarkdown(content);
            
            // Export options for enhanced pandoc support
            const exportOptions = {
                usePandoc: true,
                pandocArgs: [
                    '--mathjax', // Enable math rendering
                    '--highlight-style=github', // Code syntax highlighting
                    '--css=pandoc.css' // Add custom styling if available
                ]
            };
            
            const result = await window.electronAPI.invoke('perform-export-html', content, htmlContent, exportOptions);
            if (result.success) {
                console.log(`[Export] HTML exported successfully to: ${result.filePath}`);
                
                // Enhanced success message
                let message = 'HTML exported successfully';
                if (result.usedPandoc) {
                    message += ' (with Pandoc)';
                    if (result.bibFilesFound > 0) {
                        message += ` and ${result.bibFilesFound} bibliography file${result.bibFilesFound === 1 ? '' : 's'}`;
                    }
                }
                if (window.showNotification) {
                    window.showNotification(message, 'success');
                }
            } else if (!result.cancelled) {
                console.error(`[Export] HTML export failed: ${result.error}`);
                if (window.showNotification) {
                    window.showNotification(result.error || 'HTML export failed', 'error');
                }
            }
        } catch (error) {
            console.error('[Export] Error during HTML export:', error);
            if (window.showNotification) {
                window.showNotification('Error during HTML export', 'error');
            }
        }
    });

    // HTML export with references handler
    window.electronAPI.on('trigger-export-html-pandoc', async () => {
        console.log('[Export] Received trigger-export-html-pandoc.');
        const content = getCurrentEditorContent();
        try {
            // Show initial notification
            if (window.showNotification) {
                window.showNotification('Preparing HTML export with references...', 'info');
            }
            
            // Generate HTML from markdown
            const htmlContent = generateHTMLFromMarkdown(content);
            
            // Export options for pandoc with bibliography support
            const exportOptions = {
                usePandoc: true,
                pandocArgs: [
                    '--mathjax', // Enable math rendering
                    '--highlight-style=pygments' // Code syntax highlighting
                ]
            };
            
            const result = await window.electronAPI.invoke('perform-export-html-pandoc', content, htmlContent, exportOptions);
            if (result.success) {
                console.log(`[Export] HTML with references exported successfully to: ${result.filePath}`);
                
                // Enhanced success message
                let message = 'HTML with references exported successfully';
                if (result.bibFilesFound > 0) {
                    message += ` (${result.bibFilesFound} bibliography file${result.bibFilesFound === 1 ? '' : 's'} processed)`;
                } else {
                    message += ' (no bibliography files found)';
                }
                if (window.showNotification) {
                    window.showNotification(message, 'success');
                }
            } else if (!result.cancelled) {
                console.error(`[Export] HTML with references export failed: ${result.error}`);
                if (window.showNotification) {
                    window.showNotification(result.error || 'HTML with references export failed', 'error');
                }
            }
        } catch (error) {
            console.error('[Export] Error during HTML with references export:', error);
            if (window.showNotification) {
                window.showNotification('Error during HTML with references export', 'error');
            }
        }
    });

    // PDF export handler
    window.electronAPI.on('trigger-export-pdf', async () => {
        console.log('[Export] Received trigger-export-pdf.');
        const content = getCurrentEditorContent();
        try {
            // Show initial notification
            if (window.showNotification) {
                window.showNotification('Preparing PDF export...', 'info');
            }
            
            // Generate HTML from markdown
            const htmlContent = generateHTMLFromMarkdown(content);
            
            // Export options for enhanced pandoc support
            const exportOptions = {
                usePandoc: true,
                pandocArgs: [
                    '--mathjax', // Enable math rendering
                    '--highlight-style=github', // Code syntax highlighting
                    '--variable', 'linkcolor:blue',
                    '--variable', 'urlcolor:blue'
                ]
            };
            
            const result = await window.electronAPI.invoke('perform-export-pdf', content, htmlContent, exportOptions);
            if (result.success) {
                console.log(`[Export] PDF exported successfully to: ${result.filePath}`);
                
                // Enhanced success message
                let message = 'PDF exported successfully';
                if (result.usedPandoc) {
                    message += ' (with Pandoc)';
                    if (result.bibFilesFound > 0) {
                        message += ` and ${result.bibFilesFound} bibliography file${result.bibFilesFound === 1 ? '' : 's'}`;
                    }
                } else {
                    message += ' (using Electron renderer)';
                }
                if (window.showNotification) {
                    window.showNotification(message, 'success');
                }
            } else if (!result.cancelled) {
                console.error(`[Export] PDF export failed: ${result.error}`);
                if (window.showNotification) {
                    window.showNotification(result.error || 'PDF export failed', 'error');
                }
            }
        } catch (error) {
            console.error('[Export] Error during PDF export:', error);
            if (window.showNotification) {
                window.showNotification('Error during PDF export', 'error');
            }
        }
    });

    // PowerPoint export handler
    window.electronAPI.on('trigger-export-pptx', async () => {
        console.log('[Export] Received trigger-export-pptx.');
        const content = getCurrentEditorContent();
        try {
            // Show initial notification
            if (window.showNotification) {
                window.showNotification('Preparing PowerPoint export...', 'info');
            }
            
            // Export options for PowerPoint
            const exportOptions = {
                usePandoc: true,
                pandocArgs: [
                    '--variable', 'theme:metropolis', // Clean theme
                    '--variable', 'aspectratio:169'   // 16:9 aspect ratio
                ]
            };
            
            const result = await window.electronAPI.invoke('perform-export-pptx', content, exportOptions);
            if (result.success) {
                console.log(`[Export] PowerPoint exported successfully to: ${result.filePath}`);
                
                // Enhanced success message
                let message = `PowerPoint exported successfully (${result.slidesCreated} slide${result.slidesCreated === 1 ? '' : 's'})`;
                if (result.bibFilesFound > 0) {
                    message += ` with ${result.bibFilesFound} bibliography file${result.bibFilesFound === 1 ? '' : 's'}`;
                }
                if (window.showNotification) {
                    window.showNotification(message, 'success');
                }
            } else if (!result.cancelled) {
                console.error(`[Export] PowerPoint export failed: ${result.error}`);
                if (window.showNotification) {
                    window.showNotification(result.error || 'PowerPoint export failed', 'error');
                }
            }
        } catch (error) {
            console.error('[Export] Error during PowerPoint export:', error);
            if (window.showNotification) {
                window.showNotification('Error during PowerPoint export', 'error');
            }
        }
    });

    // PDF with references export handler
    window.electronAPI.on('trigger-export-pdf-pandoc', async () => {
        console.log('[Export] Received trigger-export-pdf-pandoc.');
        const content = getCurrentEditorContent();
        try {
            // Show initial notification
            if (window.showNotification) {
                window.showNotification('Preparing PDF export with references...', 'info');
            }
            
            // Export options for enhanced PDF with references
            const exportOptions = {
                pandocArgs: [
                    '--variable', 'linkcolor:blue',
                    '--variable', 'urlcolor:blue',
                    '--variable', 'toccolor:black'
                    // Note: removed eisvogel template as it may not be installed
                ]
            };
            
            const result = await window.electronAPI.invoke('perform-export-pdf-pandoc', content, exportOptions);
            if (result.success) {
                console.log(`[Export] PDF with references exported successfully to: ${result.filePath}`);
                
                // Enhanced success message
                let message = 'PDF with references exported successfully';
                if (result.bibFilesFound > 0) {
                    message += ` (${result.bibFilesFound} bibliography file${result.bibFilesFound === 1 ? '' : 's'} processed)`;
                } else {
                    message += ' (no bibliography files found)';
                }
                if (window.showNotification) {
                    window.showNotification(message, 'success');
                }
            } else if (!result.cancelled) {
                console.error(`[Export] PDF with references export failed: ${result.error}`);
                if (window.showNotification) {
                    window.showNotification(result.error || 'PDF export with references failed', 'error');
                }
            }
        } catch (error) {
            console.error('[Export] Error during PDF with references export:', error);
            if (window.showNotification) {
                window.showNotification('Error during PDF export with references', 'error');
            }
        }
    });

    console.log('[Export] Export handlers initialized.');
}

// --- Export Menu Integration ---
function createExportMenu() {
    return [
        { label: 'PDF', action: exportToPDF },
        { label: 'PDF with References', action: exportToPDFWithReferences },
        { label: 'HTML', action: exportToHTML },
        { label: 'HTML with References', action: exportToHTMLWithReferences },
        { label: 'PowerPoint', action: exportToPowerPoint }
    ];
}

// --- Export Validation ---
function validateExportPrerequisites() {
    const issues = [];
    
    if (!window.currentFilePath) {
        issues.push('No file is currently open');
    }
    
    if (!window.electronAPI) {
        issues.push('Electron API not available');
    }
    
    const content = getCurrentEditorContent();
    if (!content.trim()) {
        issues.push('Document is empty');
    }
    
    return {
        valid: issues.length === 0,
        issues: issues
    };
}

// --- Export All Formats ---
async function exportAllFormats() {
    const validation = validateExportPrerequisites();
    if (!validation.valid) {
        const errorMsg = `Cannot export: ${validation.issues.join(', ')}`;
        console.error('[Export]', errorMsg);
        if (window.showNotification) {
            window.showNotification(errorMsg, 'error');
        }
        return;
    }
    
    const formats = ['pdf', 'html', 'pptx'];
    const results = [];
    
    if (window.showNotification) {
        window.showNotification('Exporting to all formats...', 'info');
    }
    
    for (const format of formats) {
        try {
            console.log(`[Export] Exporting to ${format.toUpperCase()}...`);
            if (window.electronAPI) {
                const result = await window.electronAPI.invoke('trigger-export', format);
                results.push({ format, success: result.success });
            }
        } catch (error) {
            console.error(`[Export] Failed to export ${format}:`, error);
            results.push({ format, success: false, error: error.message });
        }
    }
    
    const successful = results.filter(r => r.success).length;
    const total = results.length;
    
    if (window.showNotification) {
        window.showNotification(`Export completed: ${successful}/${total} formats successful`, 
            successful === total ? 'success' : 'warning');
    }
    
    return results;
}

// --- Export for Global Access ---
window.exportToPDF = exportToPDF;
window.exportToPDFWithReferences = exportToPDFWithReferences;
window.exportToHTML = exportToHTML;
window.exportToHTMLWithReferences = exportToHTMLWithReferences;
window.exportToPowerPoint = exportToPowerPoint;
window.initializeExportHandlers = initializeExportHandlers;
window.exportAllFormats = exportAllFormats;
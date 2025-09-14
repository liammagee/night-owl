// Export Visualization Module
// Provides functionality to export canvas and SVG visualizations as PNG images

class VisualizationExporter {
    constructor() {
        this.isExporting = false;
    }

    // Main export function that determines the type of element and exports accordingly
    async exportAsPNG(elementId, filename = 'visualization') {
        if (this.isExporting) {
            console.log('Export already in progress');
            return;
        }

        this.isExporting = true;
        
        try {
            // Special handling for presentation mode to export all slides
            if (elementId === 'presentation-root') {
                await this.exportAllPresentationSlides(filename);
                return;
            }

            const element = document.getElementById(elementId);
            if (!element) {
                throw new Error(`Element with ID "${elementId}" not found`);
            }

            // Determine the type of element and export accordingly
            if (element.tagName.toLowerCase() === 'svg') {
                await this.exportSVGAsPNG(element, filename);
            } else if (element.tagName.toLowerCase() === 'canvas') {
                await this.exportCanvasAsPNG(element, filename);
            } else {
                // For other elements, try to find SVG or canvas inside
                const svg = element.querySelector('svg');
                const canvas = element.querySelector('canvas');
                
                if (svg) {
                    await this.exportSVGAsPNG(svg, filename);
                } else if (canvas) {
                    await this.exportCanvasAsPNG(canvas, filename);
                } else {
                    // Use html2canvas as fallback for complex HTML elements
                    await this.exportHTMLAsPNG(element, filename);
                }
            }
        } catch (error) {
            console.error('Error exporting visualization:', error);
            this.showNotification('Failed to export visualization', 'error');
        } finally {
            this.isExporting = false;
        }
    }

    // Export all presentation slides as a single image
    async exportAllPresentationSlides(filename) {
        try {
            this.showNotification('Preparing to export all slides...', 'info');
            
            // Get the presentation container
            const presentationRoot = document.getElementById('presentation-root');
            if (!presentationRoot) {
                throw new Error('Presentation container not found');
            }

            // Try to capture the zoomed-out view with current layout
            const capturedCanvas = await this.captureZoomedOutPresentation(presentationRoot);
            
            if (capturedCanvas) {
                // Export the captured canvas
                await this.exportCanvasAsPNG(capturedCanvas, filename + '_all-slides');
            } else {
                // Fallback to creating a grid view
                const getAllSlidesCanvas = await this.createAllSlidesCanvas(presentationRoot);
                if (getAllSlidesCanvas) {
                    await this.exportCanvasAsPNG(getAllSlidesCanvas, filename + '_all-slides');
                } else {
                    this.showNotification('Could not capture all slides, exporting current view', 'warning');
                    const canvas = presentationRoot.querySelector('canvas');
                    const svg = presentationRoot.querySelector('svg');
                    if (canvas) {
                        await this.exportCanvasAsPNG(canvas, filename);
                    } else if (svg) {
                        await this.exportSVGAsPNG(svg, filename);
                    }
                }
            }
        } catch (error) {
            console.error('Error exporting all slides:', error);
            this.showNotification('Failed to export all slides: ' + error.message, 'error');
        }
    }

    // Capture the presentation in zoomed-out state
    async captureZoomedOutPresentation(presentationRoot) {
        try {
            // Find the canvas container with the transform
            const canvasContainer = presentationRoot.querySelector('[style*="transform"]');
            if (!canvasContainer) {
                console.log('Canvas container not found');
                return null;
            }

            // Store original transform values
            const originalStyle = canvasContainer.style.cssText;
            const originalTransform = canvasContainer.style.transform;
            
            // Calculate zoom level to fit all slides
            // Try to trigger a zoom-to-fit or set a very small zoom level
            const slides = canvasContainer.querySelectorAll('.slide-node, [class*="slide"]');
            if (!slides || slides.length === 0) {
                console.log('No slides found in presentation');
                return null;
            }

            // Find the bounds of all slides
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            slides.forEach(slide => {
                const rect = slide.getBoundingClientRect();
                const transform = window.getComputedStyle(slide).transform;
                // Parse transform to get actual position
                // This is a simplified approach - may need adjustment based on actual structure
                minX = Math.min(minX, rect.left);
                minY = Math.min(minY, rect.top);
                maxX = Math.max(maxX, rect.right);
                maxY = Math.max(maxY, rect.bottom);
            });

            // Calculate required zoom to fit all slides
            const containerRect = presentationRoot.getBoundingClientRect();
            const contentWidth = maxX - minX;
            const contentHeight = maxY - minY;
            const zoomX = containerRect.width / contentWidth;
            const zoomY = containerRect.height / contentHeight;
            const optimalZoom = Math.min(zoomX, zoomY) * 0.9; // 90% to add padding

            // Apply zoom-out transform
            canvasContainer.style.transform = `translate(0px, 0px) scale(${optimalZoom})`;
            
            // Wait for render
            await new Promise(resolve => setTimeout(resolve, 100));

            // Use html2canvas or dom-to-image library if available
            const canvas = await this.captureElementToCanvas(presentationRoot);

            // Restore original transform
            canvasContainer.style.cssText = originalStyle;
            
            return canvas;
        } catch (error) {
            console.error('Error capturing zoomed-out presentation:', error);
            return null;
        }
    }

    // Capture an element to canvas
    async captureElementToCanvas(element) {
        try {
            // Create a canvas to draw the element
            const rect = element.getBoundingClientRect();
            const canvas = document.createElement('canvas');
            canvas.width = rect.width * 2; // Higher resolution
            canvas.height = rect.height * 2;
            const ctx = canvas.getContext('2d');
            
            // Scale for higher resolution
            ctx.scale(2, 2);

            // Try to use html2canvas if available
            if (window.html2canvas) {
                const tempCanvas = await window.html2canvas(element, {
                    backgroundColor: '#ffffff',
                    scale: 2
                });
                ctx.drawImage(tempCanvas, 0, 0, rect.width, rect.height);
                return canvas;
            }

            // Fallback: Manual canvas drawing
            // Fill background
            ctx.fillStyle = '#f8f9fa';
            ctx.fillRect(0, 0, rect.width, rect.height);

            // Try to draw visible content
            const slides = element.querySelectorAll('.slide-node, [class*="slide"]');
            slides.forEach((slide, index) => {
                const slideRect = slide.getBoundingClientRect();
                const x = slideRect.left - rect.left;
                const y = slideRect.top - rect.top;
                
                // Draw slide background
                ctx.fillStyle = 'white';
                ctx.fillRect(x, y, slideRect.width, slideRect.height);
                
                // Draw slide border
                ctx.strokeStyle = '#ddd';
                ctx.strokeRect(x, y, slideRect.width, slideRect.height);
                
                // Try to get slide text content
                const text = slide.textContent || `Slide ${index + 1}`;
                ctx.fillStyle = '#333';
                ctx.font = '14px Arial';
                ctx.fillText(text.substring(0, 50), x + 10, y + 30);
            });

            return canvas;
        } catch (error) {
            console.error('Error capturing element to canvas:', error);
            return null;
        }
    }

    // Create a canvas with all slides arranged in a grid
    async createAllSlidesCanvas(presentationRoot) {
        try {
            // Try to get slides data from the presentation
            const slidesData = this.getPresentationSlidesData();
            if (!slidesData || slidesData.length === 0) {
                console.log('No slides data available');
                return null;
            }

            // Calculate grid layout
            const numSlides = slidesData.length;
            const cols = Math.ceil(Math.sqrt(numSlides));
            const rows = Math.ceil(numSlides / cols);
            
            // Thumbnail size for each slide
            const slideWidth = 400;
            const slideHeight = 300;
            const padding = 20;
            
            // Create canvas for all slides
            const canvas = document.createElement('canvas');
            canvas.width = cols * (slideWidth + padding) + padding;
            canvas.height = rows * (slideHeight + padding) + padding;
            const ctx = canvas.getContext('2d');
            
            // Fill background
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw each slide
            for (let i = 0; i < numSlides; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const x = padding + col * (slideWidth + padding);
                const y = padding + row * (slideHeight + padding);
                
                // Draw slide background
                ctx.fillStyle = 'white';
                ctx.fillRect(x, y, slideWidth, slideHeight);
                
                // Draw slide border
                ctx.strokeStyle = '#ddd';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, slideWidth, slideHeight);
                
                // Draw slide number
                ctx.fillStyle = '#666';
                ctx.font = 'bold 14px Arial';
                ctx.fillText(`Slide ${i + 1}`, x + 10, y + 25);
                
                // Draw slide title if available
                const slideTitle = slidesData[i]?.title || slidesData[i]?.split('\n')[0] || '';
                if (slideTitle) {
                    ctx.fillStyle = '#333';
                    ctx.font = '16px Arial';
                    const maxWidth = slideWidth - 20;
                    const titleLines = this.wrapText(ctx, slideTitle, maxWidth);
                    let yOffset = 50;
                    for (const line of titleLines.slice(0, 2)) { // Max 2 lines
                        ctx.fillText(line, x + 10, y + yOffset);
                        yOffset += 25;
                    }
                }
                
                // Draw slide content preview if available
                const slideContent = slidesData[i]?.content || slidesData[i] || '';
                if (slideContent) {
                    ctx.fillStyle = '#666';
                    ctx.font = '12px Arial';
                    const contentLines = slideContent.split('\n').slice(1, 6); // Skip title, show first 5 lines
                    let yOffset = 100;
                    for (const line of contentLines) {
                        if (line.trim()) {
                            const wrappedLines = this.wrapText(ctx, line, slideWidth - 20);
                            for (const wrappedLine of wrappedLines.slice(0, 1)) { // One line per content line
                                ctx.fillText(wrappedLine, x + 10, y + yOffset);
                                yOffset += 18;
                                if (yOffset > y + slideHeight - 20) break;
                            }
                        }
                        if (yOffset > y + slideHeight - 20) break;
                    }
                }
            }
            
            // Add title at the top
            ctx.fillStyle = '#333';
            ctx.font = 'bold 20px Arial';
            ctx.fillText('All Presentation Slides', padding, 25);
            
            return canvas;
        } catch (error) {
            console.error('Error creating all slides canvas:', error);
            return null;
        }
    }

    // Helper function to wrap text
    wrapText(ctx, text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        
        for (const word of words) {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        
        if (currentLine) {
            lines.push(currentLine);
        }
        
        return lines;
    }

    // Get presentation slides data from the React component or editor
    getPresentationSlidesData() {
        try {
            // Try to get slides from the editor content (markdown)
            if (window.editor && typeof window.editor.getValue === 'function') {
                const content = window.editor.getValue();
                if (content) {
                    // Split by slide separator (--- on standalone lines)
                    const slideSeparatorRegex = /(?:^|\n)---(?:\n|$)/;
                    const slides = content.split(slideSeparatorRegex).filter(s => s.trim());
                    return slides;
                }
            }
            
            // Try to get from React component state if exposed
            if (window.presentationSlides) {
                return window.presentationSlides;
            }
            
            // Try to get from localStorage or any other storage
            const storedSlides = localStorage.getItem('presentationSlides');
            if (storedSlides) {
                return JSON.parse(storedSlides);
            }
            
            return null;
        } catch (error) {
            console.error('Error getting slides data:', error);
            return null;
        }
    }

    // Export SVG element as PNG
    async exportSVGAsPNG(svgElement, filename) {
        try {
            // Method 1: Try using blob URL (may be blocked by CSP)
            await this.exportSVGWithBlobURL(svgElement, filename);
        } catch (error) {
            console.log('Blob URL method failed, trying data URL method:', error.message);
            try {
                // Method 2: Use data URL instead of blob URL
                await this.exportSVGWithDataURL(svgElement, filename);
            } catch (error2) {
                console.log('Data URL method failed, using direct canvas method:', error2.message);
                // Method 3: Direct canvas serialization
                this.exportSVGDirect(svgElement, filename);
            }
        }
    }

    // Method 1: Using Blob URL (original method)
    async exportSVGWithBlobURL(svgElement, filename) {
        const svgClone = svgElement.cloneNode(true);
        const bbox = svgElement.getBoundingClientRect();
        const width = bbox.width || 800;
        const height = bbox.height || 600;
        
        svgClone.setAttribute('width', width);
        svgClone.setAttribute('height', height);
        
        if (!svgClone.querySelector('rect.export-background')) {
            const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            background.setAttribute('width', '100%');
            background.setAttribute('height', '100%');
            background.setAttribute('fill', 'white');
            background.setAttribute('class', 'export-background');
            svgClone.insertBefore(background, svgClone.firstChild);
        }
        
        const svgData = new XMLSerializer().serializeToString(svgClone);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);
        
        const img = new Image();
        img.width = width;
        img.height = height;
        
        return new Promise((resolve, reject) => {
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    this.downloadBlob(blob, `${filename}.png`);
                    URL.revokeObjectURL(svgUrl);
                    resolve();
                }, 'image/png');
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(svgUrl);
                reject(new Error('Failed to load SVG as image with blob URL'));
            };
            
            img.src = svgUrl;
        });
    }

    // Method 2: Using Data URL (CSP-friendly)
    async exportSVGWithDataURL(svgElement, filename) {
        const svgClone = svgElement.cloneNode(true);
        const bbox = svgElement.getBoundingClientRect();
        const width = bbox.width || 800;
        const height = bbox.height || 600;
        
        svgClone.setAttribute('width', width);
        svgClone.setAttribute('height', height);
        svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        
        if (!svgClone.querySelector('rect.export-background')) {
            const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            background.setAttribute('width', '100%');
            background.setAttribute('height', '100%');
            background.setAttribute('fill', 'white');
            background.setAttribute('class', 'export-background');
            svgClone.insertBefore(background, svgClone.firstChild);
        }
        
        const svgData = new XMLSerializer().serializeToString(svgClone);
        const base64 = btoa(unescape(encodeURIComponent(svgData)));
        const dataUrl = `data:image/svg+xml;base64,${base64}`;
        
        const img = new Image();
        img.width = width;
        img.height = height;
        
        return new Promise((resolve, reject) => {
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    this.downloadBlob(blob, `${filename}.png`);
                    resolve();
                }, 'image/png');
            };
            
            img.onerror = () => {
                reject(new Error('Failed to load SVG as image with data URL'));
            };
            
            img.src = dataUrl;
        });
    }

    // Method 3: Direct Canvas Export (fallback)
    exportSVGDirect(svgElement, filename) {
        const bbox = svgElement.getBoundingClientRect();
        const width = bbox.width || 800;
        const height = bbox.height || 600;
        
        // Create a canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Fill white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        
        // Try to use canvg if available (for better SVG rendering)
        if (window.canvg) {
            window.canvg(canvas, new XMLSerializer().serializeToString(svgElement));
            canvas.toBlob((blob) => {
                this.downloadBlob(blob, `${filename}.png`);
            }, 'image/png');
        } else {
            // Basic fallback: serialize SVG data directly
            const svgData = new XMLSerializer().serializeToString(svgElement);
            const svgSize = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'}).size;
            
            // Download as SVG if we can't convert to PNG
            const svgBlob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
            this.downloadBlob(svgBlob, `${filename}.svg`);
            this.showNotification(`Exported as SVG (${Math.round(svgSize/1024)}KB). PNG conversion unavailable.`, 'info');
        }
    }

    // Export Canvas element as PNG
    async exportCanvasAsPNG(canvasElement, filename) {
        return new Promise((resolve) => {
            canvasElement.toBlob((blob) => {
                this.downloadBlob(blob, `${filename}.png`);
                resolve();
            }, 'image/png');
        });
    }

    // Export HTML element as PNG using DOM-to-image approach
    async exportHTMLAsPNG(element, filename) {
        // Create a canvas from the HTML element
        const canvas = document.createElement('canvas');
        const rect = element.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        const ctx = canvas.getContext('2d');
        
        // Fill white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // For React presentation component, we need special handling
        if (element.id === 'presentation-content') {
            // Try to find the canvas or SVG within
            const innerCanvas = element.querySelector('canvas');
            const innerSvg = element.querySelector('svg');
            
            if (innerCanvas) {
                ctx.drawImage(innerCanvas, 0, 0);
            } else if (innerSvg) {
                await this.exportSVGAsPNG(innerSvg, filename);
                return;
            } else {
                // Fallback: create image from visible content
                this.showNotification('Complex HTML export - using screenshot method', 'info');
                this.captureVisibleContent(element, filename);
                return;
            }
        }
        
        // Convert to PNG and download
        canvas.toBlob((blob) => {
            this.downloadBlob(blob, `${filename}.png`);
        }, 'image/png');
    }

    // Capture visible content using a more robust method
    captureVisibleContent(element, filename) {
        // Use Electron's screenshot capability if available
        if (window.electronAPI && window.electronAPI.captureElement) {
            window.electronAPI.captureElement(element.id).then(dataUrl => {
                this.downloadDataURL(dataUrl, `${filename}.png`);
            }).catch(error => {
                console.error('Failed to capture element:', error);
                this.showNotification('Failed to capture visualization', 'error');
            });
        } else {
            this.showNotification('Screenshot capture not available in this environment', 'warning');
        }
    }

    // Download blob as file
    async downloadBlob(blob, filename) {
        // Check if we're in Electron and can save to current directory
        if (window.electronAPI && window.electronAPI.saveImageToCurrentDir) {
            try {
                // Convert blob to base64 for Electron IPC
                const reader = new FileReader();
                reader.onloadend = async () => {
                    const base64data = reader.result.split(',')[1];
                    const result = await window.electronAPI.saveImageToCurrentDir(filename, base64data);
                    if (result.success) {
                        this.showNotification(`Saved to: ${result.path}`, 'success');
                    } else {
                        throw new Error(result.error || 'Failed to save file');
                    }
                };
                reader.onerror = () => {
                    // Fallback to browser download
                    this.browserDownloadBlob(blob, filename);
                };
                reader.readAsDataURL(blob);
            } catch (error) {
                console.error('Error saving to current directory:', error);
                // Fallback to browser download
                this.browserDownloadBlob(blob, filename);
            }
        } else {
            // Not in Electron, use browser download
            this.browserDownloadBlob(blob, filename);
        }
    }

    // Browser fallback download
    browserDownloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        this.downloadURL(url, filename);
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }

    // Download data URL as file
    async downloadDataURL(dataUrl, filename) {
        // Check if we're in Electron and can save to current directory
        if (window.electronAPI && window.electronAPI.saveImageToCurrentDir) {
            try {
                const base64data = dataUrl.split(',')[1];
                const result = await window.electronAPI.saveImageToCurrentDir(filename, base64data);
                if (result.success) {
                    this.showNotification(`Saved to: ${result.path}`, 'success');
                } else {
                    throw new Error(result.error || 'Failed to save file');
                }
            } catch (error) {
                console.error('Error saving to current directory:', error);
                // Fallback to browser download
                this.downloadURL(dataUrl, filename);
            }
        } else {
            // Not in Electron, use browser download
            this.downloadURL(dataUrl, filename);
        }
    }

    // Download URL as file (browser method)
    downloadURL(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        this.showNotification(`Exported as ${filename}`, 'success');
    }

    // Show notification to user
    showNotification(message, type = 'info') {
        // Try to use the app's notification system if available
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            console.log(`[Export] ${type}: ${message}`);
        }
    }

    // Get a formatted filename with timestamp
    getTimestampedFilename(prefix = 'visualization') {
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
        return `${prefix}_${timestamp}`;
    }
}

// Create singleton instance
const visualizationExporter = new VisualizationExporter();

// Export function for easy access
window.exportVisualizationAsPNG = function(elementId, filename) {
    const timestampedFilename = filename || visualizationExporter.getTimestampedFilename(elementId);
    return visualizationExporter.exportAsPNG(elementId, timestampedFilename);
};

// Add export button to a container
window.addExportButton = function(containerId, targetElementId, buttonText = '📸 Export as PNG') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`[ExportVisualization] Container "${containerId}" not found - skipping export button`);
        return;
    }
    
    // Check if button already exists
    if (container.querySelector('.export-png-btn')) {
        return;
    }
    
    const button = document.createElement('button');
    button.className = 'export-png-btn btn';
    button.innerHTML = buttonText;
    button.title = 'Export visualization as PNG';
    
    // Match the style of other buttons in the control bar
    button.style.cssText = `
        padding: 6px 12px;
        background: #f8f9fa;
        color: #333;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        gap: 4px;
    `;
    
    button.addEventListener('mouseenter', () => {
        button.style.background = '#e9ecef';
        button.style.borderColor = '#adb5bd';
    });
    
    button.addEventListener('mouseleave', () => {
        button.style.background = '#f8f9fa';
        button.style.borderColor = '#dee2e6';
    });
    
    button.addEventListener('click', () => {
        const modeName = targetElementId.replace('-content', '').replace('-visualization', '').replace('-canvas', '');
        window.exportVisualizationAsPNG(targetElementId, modeName);
    });
    
    container.appendChild(button);
};

console.log('[Export Visualization] Module loaded');
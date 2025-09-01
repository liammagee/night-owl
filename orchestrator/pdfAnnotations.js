/**
 * PDF Annotation System
 * Handles text selection, highlighting, and annotations for PDF documents
 */

// Load pdf-lib library dynamically
async function loadPdfLib() {
    return new Promise((resolve, reject) => {
        if (typeof window.PDFLib !== 'undefined') {
            resolve();
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
        script.onload = () => {
            console.log('[PDF] pdf-lib loaded successfully');
            resolve();
        };
        script.onerror = (error) => {
            console.error('[PDF] Failed to load pdf-lib:', error);
            reject(error);
        };
        document.head.appendChild(script);
    });
}

// Canvas-based text selection system
class CanvasTextSelector {
    constructor() {
        this.isSelecting = false;
        this.startPoint = null;
        this.endPoint = null;
        this.currentSelection = null;
        this.textItems = [];
        this.canvas = null;
        this.ctx = null;
        this.page = null;
        this.viewport = null;
        this.pageImage = null; // Store the page image for redrawing
    }

    initialize(canvas, page, viewport, textContent) {
        console.log('[CanvasTextSelector] Initializing with canvas:', canvas);
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.page = page;
        this.viewport = viewport;
        this.textItems = textContent.items || [];
        
        // Clear any current selection when initializing new page
        this.currentSelection = null;
        console.log('[CanvasTextSelector] Cleared current selection for new page');
        
        // Use global permanent highlights and annotations
        this.permanentHighlights = window.globalPermanentHighlights || [];
        this.permanentAnnotations = window.globalPermanentAnnotations || [];
        
        // Capture the current page as an image for redrawing
        this.capturePageImage();
        
        // Add mouse event listeners
        this.addEventListeners();
        
        // Redraw with any existing highlights for this page
        console.log(`[CanvasTextSelector] About to redraw highlights, currentPage should be: ${window.pdfViewerState?.currentPage}`);
        setTimeout(() => this.redrawWithHighlights(), 100);
        
        console.log('[CanvasTextSelector] Initialization complete');
    }
    
    capturePageImage() {
        // Create an off-screen canvas to store the page image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.canvas.width;
        tempCanvas.height = this.canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Copy the current canvas content
        tempCtx.drawImage(this.canvas, 0, 0);
        
        // Store as image
        this.pageImage = tempCanvas;
        console.log('[CanvasTextSelector] Page image captured for redrawing');
    }

    addEventListeners() {
        if (!this.canvas) return;
        
        // Remove any existing listeners first
        this.removeEventListeners();
        
        // Bind methods to preserve context
        this.boundMouseDown = this.onMouseDown.bind(this);
        this.boundMouseMove = this.onMouseMove.bind(this);
        this.boundMouseUp = this.onMouseUp.bind(this);
        this.boundContextMenu = this.onContextMenu.bind(this);
        this.boundDocumentClick = this.onDocumentClick.bind(this);

        this.canvas.addEventListener('mousedown', this.boundMouseDown);
        this.canvas.addEventListener('mousemove', this.boundMouseMove);
        this.canvas.addEventListener('mouseup', this.boundMouseUp);
        this.canvas.addEventListener('mouseout', this.boundMouseUp);
        this.canvas.addEventListener('contextmenu', this.boundContextMenu);
        
        // Listen for clicks outside to hide context menu
        document.addEventListener('click', this.boundDocumentClick);
        
        console.log('[CanvasTextSelector] Event listeners added successfully');
    }

    removeEventListeners() {
        if (!this.canvas || !this.boundMouseDown) return;

        this.canvas.removeEventListener('mousedown', this.boundMouseDown);
        this.canvas.removeEventListener('mousemove', this.boundMouseMove);
        this.canvas.removeEventListener('mouseup', this.boundMouseUp);
        this.canvas.removeEventListener('mouseout', this.boundMouseUp);
        this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
        
        if (this.boundDocumentClick) {
            document.removeEventListener('click', this.boundDocumentClick);
        }
    }

    onMouseDown(event) {
        console.log('[CanvasTextSelector] Mouse down event, button:', event.button);
        
        // Don't start new selection on right click
        if (event.button === 2) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (event.clientY - rect.top) * (this.canvas.height / rect.height);
        
        this.isSelecting = true;
        this.startPoint = { x, y };
        this.endPoint = { x, y };
        
        // Clear any existing selection
        this.clearSelection();
        
        console.log('[CanvasTextSelector] Selection started at:', this.startPoint);
    }

    onMouseMove(event) {
        if (!this.isSelecting) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (event.clientY - rect.top) * (this.canvas.height / rect.height);
        
        this.endPoint = { x, y };
        this.updateSelection();
    }

    onMouseUp(event) {
        if (!this.isSelecting) return;
        
        console.log('[CanvasTextSelector] Mouse up - finalizing selection');
        this.isSelecting = false;
        
        // Only process if we have a meaningful selection
        if (this.startPoint && this.endPoint && 
            (Math.abs(this.endPoint.x - this.startPoint.x) > 5 || 
             Math.abs(this.endPoint.y - this.startPoint.y) > 5)) {
            // Finalize selection and extract text
            this.finalizeSelection();
        }
    }

    onContextMenu(event) {
        event.preventDefault();
        
        // Get click position relative to canvas
        const rect = this.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (event.clientY - rect.top) * (this.canvas.height / rect.height);
        
        console.log('[CanvasTextSelector] Right click at position:', { x, y });
        
        // Check if clicking on existing highlight/annotation even without current selection
        const clickedHighlight = this.findHighlightAtPoint(x, y);
        const clickedAnnotation = this.findAnnotationAtPoint(x, y);
        
        if (clickedHighlight || clickedAnnotation || (this.currentSelection && this.currentSelection.text)) {
            console.log('[CanvasTextSelector] Showing context menu');
            // Show context menu at mouse position
            this.showContextMenu(event.clientX, event.clientY, { x, y });
        } else {
            console.log('[CanvasTextSelector] No selection or existing item at click position');
        }
    }

    onDocumentClick(event) {
        // Hide context menu when clicking elsewhere
        this.hideContextMenu();
    }

    showContextMenu(x, y, clickPoint = null) {
        // Remove existing context menu
        this.hideContextMenu();
        
        // Create context menu
        const contextMenu = document.createElement('div');
        contextMenu.id = 'pdf-text-context-menu';
        contextMenu.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 10000;
            padding: 4px 0;
            min-width: 150px;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 14px;
        `;
        
        // Check if clicking on existing highlight/annotation
        // First try to find items at click point, then fall back to selection
        let existingHighlight = clickPoint ? this.findHighlightAtPoint(clickPoint.x, clickPoint.y) : null;
        let existingAnnotation = clickPoint ? this.findAnnotationAtPoint(clickPoint.x, clickPoint.y) : null;
        
        // If nothing found at click point, check current selection
        if (!existingHighlight && !existingAnnotation) {
            existingHighlight = this.findHighlightAtSelection();
            existingAnnotation = this.findAnnotationAtSelection();
        }
        
        console.log('[CanvasTextSelector] Context menu - existing highlight:', existingHighlight);
        console.log('[CanvasTextSelector] Context menu - existing annotation:', existingAnnotation);
        
        // Create menu items based on what's being clicked
        const menuItems = [];
        
        // Always show copy option
        menuItems.push({ label: 'Copy', action: () => this.handleCopy() });
        
        if (existingHighlight || existingAnnotation) {
            // Options for existing highlights/annotations
            if (existingHighlight && existingHighlight.type !== 'annotation') {
                menuItems.push({ label: 'Remove Highlight', action: () => this.removeHighlight(existingHighlight) });
            }
            if (existingAnnotation) {
                menuItems.push({ label: 'Edit Annotation', action: () => this.editAnnotation(existingAnnotation) });
                menuItems.push({ label: 'Remove Annotation', action: () => this.removeAnnotation(existingAnnotation) });
            }
            if (existingHighlight && existingHighlight.type === 'annotation') {
                menuItems.push({ label: 'Remove Annotated Text', action: () => this.removeAnnotatedHighlight(existingHighlight) });
            }
        } else {
            // Options for new selection
            menuItems.push({ label: 'Highlight', action: () => this.handleHighlight() });
            menuItems.push({ label: 'Add Annotation', action: () => this.handleAnnotation() });
        }
        
        menuItems.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.style.cssText = `
                padding: 8px 16px;
                cursor: pointer;
                user-select: none;
            `;
            menuItem.textContent = item.label;
            
            menuItem.addEventListener('mouseenter', () => {
                menuItem.style.background = '#f0f0f0';
            });
            
            menuItem.addEventListener('mouseleave', () => {
                menuItem.style.background = 'transparent';
            });
            
            menuItem.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideContextMenu();
                item.action();
            });
            
            contextMenu.appendChild(menuItem);
        });
        
        document.body.appendChild(contextMenu);
        
        // Adjust position if menu goes off screen
        const rect = contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            contextMenu.style.left = (x - rect.width) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            contextMenu.style.top = (y - rect.height) + 'px';
        }
        
        console.log('[CanvasTextSelector] Context menu shown');
    }

    hideContextMenu() {
        const existingMenu = document.getElementById('pdf-text-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }
    }
    
    // Show context menu specifically for annotation cards
    showAnnotationCardContextMenu(x, y, annotationData) {
        // Remove any existing context menu
        this.hideContextMenu();
        
        console.log('[CanvasTextSelector] Showing annotation card context menu for:', annotationData);
        
        // Create context menu
        const contextMenu = document.createElement('div');
        contextMenu.id = 'pdf-text-context-menu';
        contextMenu.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 10001;
            padding: 4px 0;
            min-width: 150px;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 14px;
        `;
        
        // Menu items for annotation card
        const menuItems = [
            { label: 'Edit Annotation', action: () => this.editAnnotation(annotationData) },
            { label: 'Remove Annotation', action: () => this.removeAnnotation(annotationData) },
            { label: 'Copy Annotation Text', action: () => this.copyToClipboard(annotationData.annotation) },
            { label: 'Copy Selected Text', action: () => this.copyToClipboard(annotationData.text) }
        ];
        
        // Find associated highlight to enable removing it too
        const associatedHighlight = this.permanentHighlights?.find(h => 
            h.pageNumber === annotationData.pageNumber && 
            h.type === 'annotation' && 
            Math.abs(h.bounds.left - annotationData.x) < 1 && // Use small tolerance for floating point comparison
            Math.abs(h.bounds.top - annotationData.y) < 1
        );
        
        if (associatedHighlight) {
            menuItems.push({ label: 'Remove Highlighted Text', action: () => this.removeAnnotatedHighlight(associatedHighlight) });
        }
        
        // Create menu items
        menuItems.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.style.cssText = `
                padding: 8px 16px;
                cursor: pointer;
                user-select: none;
            `;
            menuItem.textContent = item.label;
            
            menuItem.addEventListener('mouseenter', () => {
                menuItem.style.background = '#f0f0f0';
            });
            
            menuItem.addEventListener('mouseleave', () => {
                menuItem.style.background = 'transparent';
            });
            
            menuItem.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideContextMenu();
                item.action();
            });
            
            contextMenu.appendChild(menuItem);
        });
        
        document.body.appendChild(contextMenu);
        
        // Adjust position if menu goes off screen
        const rect = contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            contextMenu.style.left = (x - rect.width) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            contextMenu.style.top = (y - rect.height) + 'px';
        }
        
        console.log('[CanvasTextSelector] Annotation card context menu shown');
    }

    // Helper method to find highlight at a specific point
    findHighlightAtPoint(x, y) {
        if (!this.permanentHighlights) return null;
        
        const currentPage = window.pdfViewerState?.currentPage || 1;
        
        console.log('[CanvasTextSelector] Finding highlight at point:', { x, y }, 'on page:', currentPage);
        
        return this.permanentHighlights.find(highlight => {
            if (highlight.pageNumber !== currentPage) return false;
            
            const bounds = highlight.bounds;
            // Check if point is within highlight bounds
            const inBounds = x >= bounds.left && x <= bounds.right && 
                           y >= bounds.top && y <= bounds.bottom;
            
            if (inBounds) {
                console.log('[CanvasTextSelector] Found highlight at point:', highlight);
            }
            
            return inBounds;
        });
    }
    
    // Helper method to find annotation at a specific point
    findAnnotationAtPoint(x, y) {
        if (!this.permanentAnnotations) return null;
        
        const currentPage = window.pdfViewerState?.currentPage || 1;
        
        console.log('[CanvasTextSelector] Finding annotation at point:', { x, y }, 'on page:', currentPage);
        
        return this.permanentAnnotations.find(annotation => {
            if (annotation.pageNumber !== currentPage) return false;
            
            // Check if point is within annotation bounds
            const inBounds = x >= annotation.x && x <= (annotation.x + annotation.width) && 
                           y >= annotation.y && y <= (annotation.y + annotation.height);
            
            if (inBounds) {
                console.log('[CanvasTextSelector] Found annotation at point:', annotation);
            }
            
            return inBounds;
        });
    }
    
    // Helper method to find highlight at current selection
    findHighlightAtSelection() {
        if (!this.currentSelection || !this.permanentHighlights) {
            console.log('[CanvasTextSelector] findHighlightAtSelection: no selection or highlights');
            return null;
        }
        
        const currentPage = window.pdfViewerState?.currentPage || 1;
        const selection = this.currentSelection;
        
        console.log('[CanvasTextSelector] Finding highlight at selection on page:', currentPage);
        console.log('[CanvasTextSelector] Selection bounds:', selection.bounds);
        console.log('[CanvasTextSelector] Available highlights:', this.permanentHighlights.length);
        
        const found = this.permanentHighlights.find(highlight => {
            if (highlight.pageNumber !== currentPage) return false;
            
            const bounds = highlight.bounds;
            // Check if selection overlaps with highlight bounds using selection.bounds
            const overlaps = !(selection.bounds.right < bounds.left || 
                             selection.bounds.left > bounds.right ||
                             selection.bounds.bottom < bounds.top ||
                             selection.bounds.top > bounds.bottom);
            
            if (overlaps) {
                console.log('[CanvasTextSelector] Found overlapping highlight:', highlight);
            }
            
            return overlaps;
        });
        
        console.log('[CanvasTextSelector] findHighlightAtSelection result:', found);
        return found;
    }

    // Helper method to find annotation at current selection
    findAnnotationAtSelection() {
        if (!this.currentSelection || !this.permanentAnnotations) {
            console.log('[CanvasTextSelector] findAnnotationAtSelection: no selection or annotations');
            return null;
        }
        
        const currentPage = window.pdfViewerState?.currentPage || 1;
        const selection = this.currentSelection;
        
        console.log('[CanvasTextSelector] Finding annotation at selection on page:', currentPage);
        console.log('[CanvasTextSelector] Selection bounds:', selection.bounds);
        console.log('[CanvasTextSelector] Available annotations:', this.permanentAnnotations.length);
        
        const found = this.permanentAnnotations.find(annotation => {
            if (annotation.pageNumber !== currentPage) return false;
            
            // Check if selection overlaps with annotation coordinates using selection.bounds
            const overlaps = !(selection.bounds.right < annotation.x || 
                             selection.bounds.left > (annotation.x + annotation.width) ||
                             selection.bounds.bottom < annotation.y ||
                             selection.bounds.top > (annotation.y + annotation.height));
            
            if (overlaps) {
                console.log('[CanvasTextSelector] Found overlapping annotation:', annotation);
            }
            
            return overlaps;
        });
        
        console.log('[CanvasTextSelector] findAnnotationAtSelection result:', found);
        return found;
    }

    // Remove a regular highlight
    removeHighlight(highlight) {
        console.log('[CanvasTextSelector] Removing highlight:', highlight);
        
        // Remove from global array
        const index = window.globalPermanentHighlights.indexOf(highlight);
        if (index > -1) {
            window.globalPermanentHighlights.splice(index, 1);
        }
        
        // Update local reference
        this.permanentHighlights = window.globalPermanentHighlights;
        
        // Redraw page
        this.redrawWithHighlights();
        
        // Save annotations to PDF-specific file
        window.savePDFAnnotations();
        
        console.log('[CanvasTextSelector] Highlight removed successfully');
    }

    // Remove annotation and its associated highlight
    removeAnnotation(annotation) {
        console.log('[CanvasTextSelector] Removing annotation:', annotation);
        
        // Remove annotation from global array
        const annotationIndex = window.globalPermanentAnnotations.indexOf(annotation);
        if (annotationIndex > -1) {
            window.globalPermanentAnnotations.splice(annotationIndex, 1);
        }
        
        // Remove associated highlight (annotation type)
        const associatedHighlight = window.globalPermanentHighlights.find(h => 
            h.pageNumber === annotation.pageNumber && 
            h.type === 'annotation' && 
            h.bounds.left === annotation.x &&
            h.bounds.top === annotation.y
        );
        
        if (associatedHighlight) {
            const highlightIndex = window.globalPermanentHighlights.indexOf(associatedHighlight);
            if (highlightIndex > -1) {
                window.globalPermanentHighlights.splice(highlightIndex, 1);
            }
        }
        
        // Update local references
        this.permanentAnnotations = window.globalPermanentAnnotations;
        this.permanentHighlights = window.globalPermanentHighlights;
        
        // Redraw page and annotations
        this.redrawWithHighlights();
        
        // Save annotations to PDF-specific file
        window.savePDFAnnotations();
        
        // Remove visual annotation element
        this.clearExistingAnnotations();
        this.displayAnnotationsForCurrentPage();
        
        console.log('[CanvasTextSelector] Annotation removed successfully');
    }

    // Remove annotated highlight (when user right-clicks on orange highlight)
    removeAnnotatedHighlight(highlight) {
        console.log('[CanvasTextSelector] Removing annotated highlight:', highlight);
        
        // Find and remove associated annotation
        const associatedAnnotation = window.globalPermanentAnnotations.find(annotation => 
            annotation.pageNumber === highlight.pageNumber && 
            annotation.x === highlight.bounds.left &&
            annotation.y === highlight.bounds.top
        );
        
        if (associatedAnnotation) {
            this.removeAnnotation(associatedAnnotation);
        } else {
            // Just remove the highlight if no annotation found
            this.removeHighlight(highlight);
        }
    }

    // Edit existing annotation
    async editAnnotation(annotation) {
        console.log('[CanvasTextSelector] Editing annotation:', annotation);
        
        try {
            // Show annotation modal with existing text, passing the selected text for display
            const newAnnotationText = await this.showAnnotationModal(annotation.annotation, annotation.text);
            
            if (!newAnnotationText) {
                console.log('[CanvasTextSelector] No new annotation text provided, cancelling edit');
                return;
            }
            
            // Update annotation text
            annotation.annotation = newAnnotationText;
            annotation.timestamp = new Date().toISOString();
            
            // Redraw annotations to reflect changes
            this.displayAnnotationsForCurrentPage();
            
            // Save annotations to PDF-specific file
            await window.savePDFAnnotations();
            
            console.log('[CanvasTextSelector] Annotation edited successfully');
        } catch (error) {
            console.error('[CanvasTextSelector] Error editing annotation:', error);
        }
    }

    handleCopy() {
        if (this.currentSelection && this.currentSelection.text) {
            this.copyToClipboard(this.currentSelection.text);
            console.log('[CanvasTextSelector] Text copied to clipboard');
        }
    }

    handleHighlight() {
        if (this.currentSelection) {
            // Store permanent highlight
            this.addPermanentHighlight(this.currentSelection);
            console.log('[CanvasTextSelector] Added permanent highlight');
        }
    }

    async handleAnnotation() {
        if (!this.currentSelection) return;
        
        console.log('[CanvasTextSelector] Starting annotation process');
        console.log('[CanvasTextSelector] Current selection:', this.currentSelection);
        
        try {
            // Create a custom modal for annotation input
            const annotation = await this.showAnnotationModal();
            console.log('[CanvasTextSelector] Modal returned annotation:', annotation);
            
            if (!annotation) {
                console.log('[CanvasTextSelector] No annotation provided, cancelling');
                return;
            }
            
            // Save annotation to file
            await this.saveAnnotation(this.currentSelection, annotation);
            console.log('[CanvasTextSelector] Annotation saved successfully');
        } catch (error) {
            console.error('[CanvasTextSelector] Error in annotation process:', error);
        }
    }

    showAnnotationModal(defaultText = '', selectedText = null) {
        console.log('[CanvasTextSelector] Creating annotation modal');
        return new Promise((resolve) => {
            try {
                // Create modal overlay
                const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 20000;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            // Create modal content
            const modal = document.createElement('div');
            modal.style.cssText = `
                background: white;
                border-radius: 8px;
                padding: 24px;
                max-width: 500px;
                width: 90%;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                font-family: system-ui, -apple-system, sans-serif;
            `;

            // Add title
            const title = document.createElement('h3');
            title.textContent = defaultText ? 'Edit Annotation' : 'Add Annotation';
            title.style.cssText = `
                margin: 0 0 16px 0;
                font-size: 18px;
                font-weight: 600;
            `;

            // Show selected text (if available)
            const textToDisplay = selectedText || (this.currentSelection ? this.currentSelection.text : null);
            let selectedTextDiv = null;
            
            if (textToDisplay) {
                selectedTextDiv = document.createElement('div');
                selectedTextDiv.style.cssText = `
                    background: #f5f5f5;
                    padding: 12px;
                    border-radius: 4px;
                    margin-bottom: 16px;
                    font-style: italic;
                    border-left: 3px solid #007acc;
                `;
                selectedTextDiv.textContent = `"${textToDisplay}"`;
            }

            // Create textarea
            const textarea = document.createElement('textarea');
            textarea.placeholder = 'Enter your annotation...';
            textarea.value = defaultText; // Set default text for editing
            textarea.style.cssText = `
                width: 100%;
                height: 100px;
                border: 1px solid #ccc;
                border-radius: 4px;
                padding: 8px;
                font-family: inherit;
                font-size: 14px;
                resize: vertical;
            `;

            // Create buttons
            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = `
                display: flex;
                justify-content: flex-end;
                gap: 12px;
                margin-top: 16px;
            `;

            const cancelButton = document.createElement('button');
            cancelButton.textContent = 'Cancel';
            cancelButton.style.cssText = `
                padding: 8px 16px;
                border: 1px solid #ccc;
                border-radius: 4px;
                background: white;
                cursor: pointer;
                font-size: 14px;
            `;

            const saveButton = document.createElement('button');
            saveButton.textContent = 'Save';
            saveButton.style.cssText = `
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                background: #007acc;
                color: white;
                cursor: pointer;
                font-size: 14px;
            `;

            // Add event listeners
            const cleanup = () => {
                document.body.removeChild(overlay);
            };

            cancelButton.addEventListener('click', () => {
                cleanup();
                resolve(null);
            });

            saveButton.addEventListener('click', () => {
                const annotation = textarea.value.trim();
                cleanup();
                resolve(annotation || null);
            });

            // ESC key to cancel
            const handleKeyDown = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    resolve(null);
                    document.removeEventListener('keydown', handleKeyDown);
                }
            };
            document.addEventListener('keydown', handleKeyDown);

            // Click overlay to cancel
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    cleanup();
                    resolve(null);
                }
            });

            // Build modal
            buttonContainer.appendChild(cancelButton);
            buttonContainer.appendChild(saveButton);
            modal.appendChild(title);
            if (selectedTextDiv) {
                modal.appendChild(selectedTextDiv);
            }
            modal.appendChild(textarea);
            modal.appendChild(buttonContainer);
            overlay.appendChild(modal);

            // Add to document and focus textarea
            document.body.appendChild(overlay);
            textarea.focus();
            
            } catch (error) {
                console.error('[CanvasTextSelector] Error creating modal:', error);
                resolve(null);
            }
        });
    }

    async saveAnnotation(selection, annotation) {
        try {
            const currentPage = window.pdfViewerState?.currentPage || 1;
            const fileName = window.currentFilePath ? window.currentFilePath.split('/').pop() : 'Unknown PDF';
            
            const annotationEntry = {
                source: fileName,
                page: currentPage,
                selectedText: selection.text,
                annotation: annotation,
                timestamp: new Date().toISOString()
            };
            
            console.log('[CanvasTextSelector] Saving annotation:', annotationEntry);
            
            // Create annotation entry for Markdown file
            const annotationText = `## Page ${currentPage}\n**Selected Text:** "${selection.text}"\n**Annotation:** ${annotation}\n**Date:** ${new Date().toLocaleString()}\n\n---\n\n`;
            
            // Save to annotations.md file in working directory
            const annotationsPath = await window.electronAPI.invoke('get-working-directory') + '/annotations.md';
            const response = await window.electronAPI.invoke('read-file', annotationsPath);
            
            let existingContent = '';
            if (response.success) {
                existingContent = response.content;
            }
            
            const newContent = existingContent + annotationText;
            const saveResponse = await window.electronAPI.invoke('write-file', annotationsPath, newContent);
            
            if (saveResponse.success) {
                console.log('[CanvasTextSelector] Annotation saved to:', annotationsPath);
                
                // Store annotation for visual display
                const annotationData = {
                    pageNumber: currentPage,
                    text: selection.text,
                    annotation: annotation,
                    timestamp: new Date().toISOString(),
                    x: selection.bounds.left,
                    y: selection.bounds.top,
                    width: selection.bounds.right - selection.bounds.left,
                    height: selection.bounds.bottom - selection.bounds.top
                };
                
                // Add to global annotations array
                window.globalPermanentAnnotations.push(annotationData);
                this.permanentAnnotations = window.globalPermanentAnnotations;
                
                // Create a special highlight for annotated text (different color than regular highlights)
                const annotatedHighlight = {
                    pageNumber: currentPage,
                    bounds: {
                        left: selection.bounds.left,
                        top: selection.bounds.top,
                        right: selection.bounds.right,
                        bottom: selection.bounds.bottom
                    },
                    text: selection.text,
                    type: 'annotation', // Mark as annotation highlight
                    timestamp: new Date().toISOString()
                };
                
                // Add annotation highlight to global highlights array
                window.globalPermanentHighlights.push(annotatedHighlight);
                this.permanentHighlights = window.globalPermanentHighlights;
                
                // Create visual annotation in margin
                this.createVisualAnnotation(annotationData);
                
                // Save annotations to PDF-specific file
                await window.savePDFAnnotations();
                
                console.log('[CanvasTextSelector] Annotation stored and displayed');
            } else {
                console.error('[CanvasTextSelector] Failed to save annotation:', saveResponse.error);
            }
            
        } catch (error) {
            console.error('[CanvasTextSelector] Error saving annotation:', error);
        }
    }

    createVisualAnnotation(annotationData) {
        try {
            console.log('[CanvasTextSelector] Creating visual annotation in margin');
            
            // Get the preview container to position the annotation relative to
            const canvas = this.canvas;
            if (!canvas) return;
            
            const previewContainer = document.getElementById('preview-content');
            if (!previewContainer) {
                console.error('[CanvasTextSelector] Preview container not found');
                return;
            }
            
            // Create annotation element
            const annotationElement = document.createElement('div');
            annotationElement.className = 'pdf-annotation-marker';
            
            // Calculate position - place to the right of the canvas within the preview container
            const canvasRect = canvas.getBoundingClientRect();
            
            // Position to the right of the canvas, accounting for scrolling
            const leftPosition = canvasRect.width + 20; // 20px margin from canvas edge
            
            // Convert PDF coordinates to screen coordinates using current scale
            const currentScale = window.pdfViewerState?.scale || 1.0;
            const screenY = annotationData.y * currentScale;
            const screenHeight = annotationData.height * currentScale;
            
            // Position annotation at the middle of the text selection vertically
            const topPosition = Math.max(0, screenY + (screenHeight / 2) - 30); // Center annotation on text selection
            
            console.log(`[CanvasTextSelector] PDF coordinates: x=${annotationData.x}, y=${annotationData.y}, w=${annotationData.width}, h=${annotationData.height}`);
            console.log(`[CanvasTextSelector] Current scale: ${currentScale}`);
            console.log(`[CanvasTextSelector] Screen coordinates: left=${leftPosition}px, top=${topPosition}px (centered on selection)`);
            console.log(`[CanvasTextSelector] Canvas dimensions: ${canvasRect.width} x ${canvas.height || canvas.clientHeight}`);
            
            annotationElement.style.cssText = `
                position: absolute;
                left: ${leftPosition}px;
                top: ${topPosition}px;
                background: #fff3cd;
                border: 2px solid #ffc107;
                border-radius: 8px;
                padding: 12px;
                max-width: 200px;
                font-size: 12px;
                font-family: system-ui, -apple-system, sans-serif;
                box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                z-index: 1000;
                cursor: pointer;
            `;
            
            // Add tooltip
            annotationElement.title = 'Right-click for options | Double-click to edit';
            
            // Create annotation content
            const selectedTextDiv = document.createElement('div');
            selectedTextDiv.style.cssText = `
                font-style: italic;
                color: #666;
                font-size: 11px;
                margin-bottom: 8px;
                border-left: 2px solid #ffc107;
                padding-left: 6px;
            `;
            const displayText = annotationData.text || annotationData.selectedText || 'No text selected';
            selectedTextDiv.textContent = `"${displayText.substring(0, 40)}${displayText.length > 40 ? '...' : ''}"`;
            
            const annotationTextDiv = document.createElement('div');
            annotationTextDiv.style.cssText = `
                color: #333;
                line-height: 1.4;
            `;
            annotationTextDiv.textContent = annotationData.annotation;
            
            // Create connection line to highlight
            const connectionLine = document.createElement('div');
            connectionLine.style.cssText = `
                position: absolute;
                left: -20px;
                top: 50%;
                width: 18px;
                height: 2px;
                background: #ffc107;
                transform: translateY(-50%);
            `;
            
            // Add hover effects
            annotationElement.addEventListener('mouseenter', () => {
                annotationElement.style.background = '#fff8e1';
                annotationElement.style.transform = 'scale(1.02)';
                annotationElement.style.transition = 'all 0.2s ease';
            });
            
            annotationElement.addEventListener('mouseleave', () => {
                annotationElement.style.background = '#fff3cd';
                annotationElement.style.transform = 'scale(1)';
            });
            
            // Add right-click context menu functionality
            annotationElement.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                event.stopPropagation(); // Prevent canvas context menu from also appearing
                
                console.log('[CanvasTextSelector] Right-click on annotation card');
                
                // Show context menu for annotation card
                this.showAnnotationCardContextMenu(event.clientX, event.clientY, annotationData);
            });
            
            // Add double-click to edit functionality
            annotationElement.addEventListener('dblclick', () => {
                console.log('[CanvasTextSelector] Annotation double-clicked - editing');
                this.editAnnotation(annotationData);
            });
            
            // Build the annotation
            annotationElement.appendChild(selectedTextDiv);
            annotationElement.appendChild(annotationTextDiv);
            annotationElement.appendChild(connectionLine);
            
            // Find the PDF container to append the annotation
            const pdfContainer = canvas.parentElement;
            console.log('[CanvasTextSelector] PDF container found:', !!pdfContainer);
            if (pdfContainer) {
                // Ensure container is positioned and has enough width for annotations
                pdfContainer.style.position = 'relative'; 
                pdfContainer.style.overflow = 'visible'; // Allow annotations to show outside canvas
                pdfContainer.style.minWidth = `${canvasRect.width + 250}px`; // Ensure space for annotations
                
                pdfContainer.appendChild(annotationElement);
                console.log('[CanvasTextSelector] Visual annotation added to DOM');
                console.log('[CanvasTextSelector] Container style:', pdfContainer.style.cssText);
                console.log('[CanvasTextSelector] Annotation element:', annotationElement);
            } else {
                console.error('[CanvasTextSelector] No PDF container found - annotation cannot be displayed');
            }
            
        } catch (error) {
            console.error('[CanvasTextSelector] Error creating visual annotation:', error);
        }
    }

    displayAnnotationsForCurrentPage() {
        // Clear existing annotation elements first
        this.clearExistingAnnotations();
        
        if (this.permanentAnnotations && this.permanentAnnotations.length > 0) {
            const currentPage = window.pdfViewerState?.currentPage || 1;
            console.log(`[CanvasTextSelector] Displaying annotations for page ${currentPage}`);
            
            const pageAnnotations = this.permanentAnnotations.filter(annotation => {
                return annotation.pageNumber === currentPage;
            });
            
            console.log(`[CanvasTextSelector] Found ${pageAnnotations.length} annotations for page ${currentPage}`);
            
            pageAnnotations.forEach(annotation => {
                this.createVisualAnnotation(annotation);
            });
        }
    }
    
    clearExistingAnnotations() {
        // Remove all existing annotation elements
        const existingAnnotations = document.querySelectorAll('.pdf-annotation-marker');
        existingAnnotations.forEach(element => {
            element.remove();
        });
    }

    updateSelection() {
        if (!this.pageImage || !this.ctx) return;
        
        // Restore the original page image
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.pageImage, 0, 0);
        
        // Draw selection rectangle on top
        if (this.startPoint && this.endPoint && this.isSelecting) {
            this.ctx.save();
            this.ctx.strokeStyle = 'rgba(0, 123, 255, 0.8)';
            this.ctx.fillStyle = 'rgba(0, 123, 255, 0.1)';
            this.ctx.lineWidth = 2;
            
            const x = Math.min(this.startPoint.x, this.endPoint.x);
            const y = Math.min(this.startPoint.y, this.endPoint.y);
            const width = Math.abs(this.endPoint.x - this.startPoint.x);
            const height = Math.abs(this.endPoint.y - this.startPoint.y);
            
            this.ctx.fillRect(x, y, width, height);
            this.ctx.strokeRect(x, y, width, height);
            this.ctx.restore();
        }
    }

    finalizeSelection() {
        if (!this.startPoint || !this.endPoint) return;
        
        console.log('[CanvasTextSelector] Finalizing selection');
        
        // Create selection bounds
        const selectionBounds = {
            left: Math.min(this.startPoint.x, this.endPoint.x),
            top: Math.min(this.startPoint.y, this.endPoint.y),
            right: Math.max(this.startPoint.x, this.endPoint.x),
            bottom: Math.max(this.startPoint.y, this.endPoint.y)
        };
        
        // Extract text within bounds
        const selectedText = this.extractTextFromBounds(selectionBounds);
        
        if (selectedText.trim()) {
            // Copy to clipboard
            this.copyToClipboard(selectedText);
            
            // Store selection for highlighting
            this.currentSelection = {
                bounds: selectionBounds,
                text: selectedText
            };
            
            console.log('[CanvasTextSelector] Final selected text:', selectedText);
            console.log('[CanvasTextSelector] Selection bounds:', selectionBounds);
            
            // Keep the selection highlighted permanently until user clicks elsewhere
            this.drawSelectedTextHighlight();
        } else {
            console.log('[CanvasTextSelector] No text found in selection bounds');
            this.clearSelection();
        }
    }

    extractTextFromBounds(bounds) {
        if (!this.textItems) return '';
        
        const selectedItems = [];
        
        for (const item of this.textItems) {
            // Transform text item coordinates using viewport
            const transform = item.transform;
            const x = transform[4];
            const y = transform[5];
            const width = item.width;
            const height = item.height;
            
            // Check if text item intersects with selection bounds
            if (x < bounds.right && x + width > bounds.left &&
                y - height < bounds.bottom && y > bounds.top) {
                selectedItems.push({
                    text: item.str,
                    x: x,
                    y: y,
                    width: width,
                    height: height
                });
            }
        }
        
        // Sort by Y position first, then X position
        selectedItems.sort((a, b) => {
            const yDiff = b.y - a.y; // Reverse Y since PDF coordinates are bottom-up
            if (Math.abs(yDiff) > 5) return yDiff; // Different lines
            return a.x - b.x; // Same line, sort by X
        });
        
        return selectedItems.map(item => item.text).join(' ');
    }

    drawSelectedTextHighlight() {
        if (!this.currentSelection || !this.pageImage) return;
        
        // Restore page and draw highlight
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.pageImage, 0, 0);
        
        // Draw current selection highlight
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
        
        const bounds = this.currentSelection.bounds;
        this.ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
        this.ctx.restore();
        
        console.log('[CanvasTextSelector] Drew selection highlight');
    }

    clearSelection() {
        console.log('[CanvasTextSelector] Clearing current selection');
        this.currentSelection = null;
        // Redraw with permanent highlights (if any)
        this.redrawWithHighlights();
    }

    addPermanentHighlight(selection) {
        const currentPage = window.pdfViewerState?.currentPage || 1;
        
        // Add current selection as permanent highlight to global array
        const highlight = {
            bounds: selection.bounds,
            text: selection.text,
            pageNumber: currentPage
        };
        
        window.globalPermanentHighlights.push(highlight);
        
        // Update local reference
        this.permanentHighlights = window.globalPermanentHighlights;
        
        // Redraw with permanent highlights
        this.redrawWithHighlights();
        
        // Save annotations to PDF-specific file
        window.savePDFAnnotations();
        
        console.log(`[CanvasTextSelector] Added permanent highlight on page ${currentPage}`);
        console.log('[CanvasTextSelector] Highlight details:', highlight);
        console.log(`[CanvasTextSelector] Total permanent highlights: ${window.globalPermanentHighlights.length}`);
        console.log('[CanvasTextSelector] All highlights:', window.globalPermanentHighlights);
    }

    redrawWithHighlights() {
        if (!this.pageImage || !this.ctx) return;
        
        // Restore the original page image
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.pageImage, 0, 0);
        
        // Draw all permanent highlights for current page
        if (this.permanentHighlights) {
            const currentPage = window.pdfViewerState?.currentPage || 1;
            console.log(`[CanvasTextSelector] Redrawing highlights for page ${currentPage}`);
            console.log(`[CanvasTextSelector] Total highlights in array: ${this.permanentHighlights.length}`);
            console.log('[CanvasTextSelector] All highlights with page numbers:', 
                this.permanentHighlights.map(h => ({ page: h.pageNumber, text: h.text.substring(0, 20) + '...' })));
            
            const pageHighlights = this.permanentHighlights.filter(highlight => {
                console.log(`[CanvasTextSelector] Checking highlight: page ${highlight.pageNumber} vs current ${currentPage}`);
                return highlight.pageNumber === currentPage;
            });
            console.log(`[CanvasTextSelector] Highlights for current page: ${pageHighlights.length}`);
            
            this.ctx.save();
            
            pageHighlights.forEach((highlight, index) => {
                console.log(`[CanvasTextSelector] Drawing highlight ${index + 1} on page ${currentPage}:`, highlight);
                
                // Use different colors based on highlight type
                if (highlight.type === 'annotation') {
                    // Orange/amber color for annotated text
                    this.ctx.fillStyle = 'rgba(255, 165, 0, 0.5)'; // Orange with transparency
                    console.log(`[CanvasTextSelector] Using annotation color for highlight ${index + 1}`);
                } else {
                    // Regular yellow for normal highlights
                    this.ctx.fillStyle = 'rgba(255, 255, 0, 0.4)';
                    console.log(`[CanvasTextSelector] Using regular color for highlight ${index + 1}`);
                }
                
                const bounds = highlight.bounds;
                this.ctx.fillRect(
                    bounds.left,
                    bounds.top,
                    bounds.right - bounds.left,
                    bounds.bottom - bounds.top
                );
                
                console.log(`[CanvasTextSelector] Drew highlight ${index + 1}: bounds=(${bounds.left}, ${bounds.top}, ${bounds.right}, ${bounds.bottom}), text="${highlight.text.substring(0, 30)}..."`);
            });
            
            this.ctx.restore();
            console.log(`[CanvasTextSelector] Finished redrawing ${pageHighlights.length} highlights`);
        }
        
        // Also display annotations for current page
        this.displayAnnotationsForCurrentPage();
    }

    copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(err => {
                console.error('[CanvasTextSelector] Failed to copy to clipboard:', err);
                // Fallback to document.execCommand
                this.fallbackCopyToClipboard(text);
            });
        } else {
            this.fallbackCopyToClipboard(text);
        }
    }

    fallbackCopyToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
            console.log('[CanvasTextSelector] Text copied using fallback method');
        } catch (err) {
            console.error('[CanvasTextSelector] Fallback copy failed:', err);
        }
        
        document.body.removeChild(textArea);
    }
}

// Global variables and functions for PDF annotation system
// canvasTextSelector is declared in renderer.js

// Initialize global arrays if they don't exist
if (typeof window !== 'undefined') {
    window.globalPermanentHighlights = window.globalPermanentHighlights || [];
    window.globalPermanentAnnotations = window.globalPermanentAnnotations || [];
    
    // Function to clear all highlights and annotations when switching PDFs
    window.clearAllHighlights = function() {
        console.log('[PDF] Clearing all highlights and annotations for new document');
        window.globalPermanentHighlights.length = 0; // Clear array
        window.globalPermanentAnnotations.length = 0; // Clear annotations array
        if (canvasTextSelector) {
            canvasTextSelector.currentSelection = null;
            canvasTextSelector.permanentHighlights = [];
            canvasTextSelector.permanentAnnotations = [];
        }
    };

    // Save highlights and annotations to PDF-specific file
    window.savePDFAnnotations = async function(embedInPDF = false) {
        try {
            if (!window.currentFilePath || !window.currentFilePath.endsWith('.pdf')) return;
            
            if (embedInPDF) {
                // Embed annotations directly in the PDF
                await window.embedAnnotationsInPDF();
                console.log('[PDF] Annotations embedded directly in PDF file');
            } else {
                // Save to separate .annotations file (default behavior)
                const annotationsFile = window.currentFilePath.replace('.pdf', '.annotations');
                const data = {
                    highlights: window.globalPermanentHighlights,
                    annotations: window.globalPermanentAnnotations,
                    lastModified: new Date().toISOString()
                };
                
                await window.electronAPI.invoke('save-file', {
                    filePath: annotationsFile,
                    content: JSON.stringify(data, null, 2)
                });
                
                console.log('[PDF] Annotations saved to:', annotationsFile);
            }
        } catch (error) {
            console.error('[PDF] Error saving annotations:', error);
        }
    };

    // Load highlights and annotations from PDF-specific file  
    window.loadPDFAnnotations = async function() {
        try {
            if (!window.currentFilePath || !window.currentFilePath.endsWith('.pdf')) return;
            
            const annotationsFile = window.currentFilePath.replace('.pdf', '.annotations');
            const response = await window.electronAPI.invoke('read-file', annotationsFile);
            
            if (response.success) {
                const data = JSON.parse(response.content);
                window.globalPermanentHighlights.length = 0;
                window.globalPermanentAnnotations.length = 0;
                
                if (data.highlights) {
                    window.globalPermanentHighlights.push(...data.highlights);
                }
                if (data.annotations) {
                    window.globalPermanentAnnotations.push(...data.annotations);
                }
                
                // Update text selector references
                if (canvasTextSelector) {
                    canvasTextSelector.permanentHighlights = window.globalPermanentHighlights;
                    canvasTextSelector.permanentAnnotations = window.globalPermanentAnnotations;
                }
                
                console.log(`[PDF] Loaded ${window.globalPermanentHighlights.length} highlights and ${window.globalPermanentAnnotations.length} annotations from:`, annotationsFile);
            }
        } catch (error) {
            console.log('[PDF] No existing annotations file found (this is normal for new PDFs)');
        }
    };

    // Embed annotations directly into PDF file
    window.embedAnnotationsInPDF = async function() {
        try {
            if (!window.currentFilePath || !window.currentFilePath.endsWith('.pdf')) return;
            
            const annotationData = {
                highlights: window.globalPermanentHighlights,
                annotations: window.globalPermanentAnnotations,
                filePath: window.currentFilePath
            };
            
            const result = await window.electronAPI.invoke('embed-pdf-annotations', annotationData);
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to embed annotations');
            }
            
            console.log('[PDF] Annotations embedded into PDF file successfully');
            
        } catch (error) {
            console.error('[PDF] Error embedding annotations into PDF:', error);
            throw error;
        }
    };

    // Save annotations with user choice
    window.saveAnnotationsWithChoice = async function() {
        if (window.globalPermanentHighlights.length === 0 && window.globalPermanentAnnotations.length === 0) {
            console.log('[PDF] No annotations to save');
            return;
        }
        
        const choice = confirm(
            `Choose how to save your annotations:\n\n` +
            `OK = Embed directly in PDF file (PERMANENT - cannot be deleted later)\n` +
            `Cancel = Save to separate .annotations file (can be modified/deleted)\n\n` +
            `⚠️ WARNING: Embedded annotations become permanent part of the PDF file.\n` +
            `Once embedded, they cannot be removed through this application.\n` +
            `A backup of the original PDF will be created.`
        );
        
        await window.savePDFAnnotations(choice);
    };

    // Add keyboard shortcuts for PDF operations
    document.addEventListener('keydown', (e) => {
        // Ctrl+S or Cmd+S for save with choice
        if ((e.ctrlKey || e.metaKey) && e.key === 's' && window.currentFilePath && window.currentFilePath.endsWith('.pdf')) {
            e.preventDefault();
            window.saveAnnotationsWithChoice();
        }
        
        // Ctrl+Shift+S or Cmd+Shift+S for direct PDF embedding
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S' && window.currentFilePath && window.currentFilePath.endsWith('.pdf')) {
            e.preventDefault();
            const confirmed = confirm(
                `⚠️ EMBED ANNOTATIONS DIRECTLY IN PDF?\n\n` +
                `This will permanently embed all highlights and annotations into the PDF file.\n` +
                `They CANNOT be removed later through this application.\n\n` +
                `A backup of the original PDF will be created.\n\n` +
                `Continue with embedding?`
            );
            if (confirmed) {
                window.savePDFAnnotations(true);
            }
        }
    });

    // Create global text selector instance
    window.createCanvasTextSelector = function() {
        if (canvasTextSelector) {
            canvasTextSelector.removeEventListeners();
        }
        canvasTextSelector = new CanvasTextSelector();
        return canvasTextSelector;
    };
}

// Export the class and functions for browser environment
if (typeof window !== 'undefined') {
    window.CanvasTextSelector = CanvasTextSelector;
    console.log('[pdfAnnotations.js] PDF annotations module initialized successfully');
} else if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment - export class only
    module.exports = { CanvasTextSelector };
}
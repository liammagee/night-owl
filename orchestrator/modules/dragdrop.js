// Add drag and drop event listeners to file tree  
// Use the fileTreeView already declared in renderer.js

// Global variable to track dragged items
let draggedItem = null;

// Initialize drag and drop when fileTreeView is ready
function initializeDragAndDrop() {
    // Wait for window.fileTreeView and required functions to be initialized
    const checkDependencies = setInterval(() => {
        if (window.fileTreeView && window.renderFileTree && window.showNotification) {
            clearInterval(checkDependencies);
            setupDragAndDropListeners();
        }
    }, 100);
}

// Set up all drag and drop event listeners
function setupDragAndDropListeners() {
    window.fileTreeView.addEventListener('dragstart', (event) => {
    const target = event.target;
    
    if ((target.classList.contains('file') || target.classList.contains('folder')) && target.dataset.path) {
        draggedItem = {
            element: target,
            path: target.dataset.path,
            type: target.classList.contains('file') ? 'file' : 'folder',
            name: target.textContent.substring(2) // Remove emoji
        };
        
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', draggedItem.path);
        
        // Visual feedback
        target.style.opacity = '0.5';
        target.style.border = '2px dashed #007bff';
        
    } else {
    }
}, true);

window.fileTreeView.addEventListener('dragend', (event) => {
    // Don't clear draggedItem here immediately, let drop handle it
    // Just reset visual feedback on the dragged element
    if (draggedItem && draggedItem.element) {
        draggedItem.element.style.opacity = '';
        draggedItem.element.style.border = '';
    }
    
    // Clear draggedItem after a short delay to allow drop event to process
    setTimeout(() => {
        if (draggedItem) {
            draggedItem = null;
        }
        // Clear any remaining visual feedback
        const allFolders = window.fileTreeView.querySelectorAll('.folder');
        allFolders.forEach(folder => {
            folder.style.backgroundColor = '';
            folder.style.border = '';
        });
    }, 100);
}, true);

window.fileTreeView.addEventListener('dragover', (event) => {
    let target = event.target;
    // If target is not a folder, try to find the folder parent
    if (!target.classList.contains('folder')) {
        target = target.closest('.folder');
    }
    if (target && target.classList.contains('folder') && target.dataset.path && draggedItem) {
        event.preventDefault(); // Allow drop
        event.dataTransfer.dropEffect = 'move';
        
        // Visual feedback for drop target
        target.style.backgroundColor = 'var(--hover-color, #e3f2fd)';
        target.style.border = '2px solid #007bff';
        
    }
}, true);

window.fileTreeView.addEventListener('dragleave', (event) => {
    let target = event.target;
    // If target is not a folder, try to find the folder parent
    if (!target.classList.contains('folder')) {
        target = target.closest('.folder');
    }
    if (target && target.classList.contains('folder')) {
        // Remove visual feedback
        target.style.backgroundColor = '';
        target.style.border = '';
    }
}, true);

window.fileTreeView.addEventListener('drop', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    
    let target = event.target;
    
    // If target is not a folder, try to find the folder parent
    if (!target.classList.contains('folder')) {
        target = target.closest('.folder');
    }
    
    // Validate we have all required data
    if (!target || !target.classList.contains('folder') || !target.dataset.path) {
        return;
    }
    
    if (!draggedItem || !draggedItem.path || !draggedItem.type) {
        window.showNotification('Drag and drop failed - no valid item being dragged', 'error');
        return;
    }
    
    const targetFolderPath = target.dataset.path;
    
    // Remove visual feedback
    target.style.backgroundColor = '';
    target.style.border = '';
    
    
    // Don't allow dropping item into itself or its children
    if (draggedItem.path === targetFolderPath || targetFolderPath.startsWith(draggedItem.path + '/')) {
        window.showNotification('Cannot move item into itself or its subdirectory', 'error');
        return;
    }
    
    // Store reference to dragged item before it gets cleared
    const itemToMove = {
        path: draggedItem.path,
        type: draggedItem.type,
        name: draggedItem.name
    };
    
    try {
        const result = await window.electronAPI.invoke('move-item', {
            sourcePath: itemToMove.path,
            targetPath: targetFolderPath,
            operation: 'cut', // Drag and drop is always move
            type: itemToMove.type
        });
        
        if (result.success) {
            window.renderFileTree();
            window.showNotification(`${itemToMove.type === 'file' ? 'File' : 'Folder'} moved successfully`, 'success');
        } else {
            window.showNotification(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        window.showNotification('Error moving item', 'error');
    }
    
    // Clear the dragged item
    draggedItem = null;
}, true);
}

// Initialize drag and drop functionality
initializeDragAndDrop();

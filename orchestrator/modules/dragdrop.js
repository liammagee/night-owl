
// Add drag and drop event listeners to file tree
fileTreeView.addEventListener('dragstart', (event) => {
    const target = event.target;
    console.log('[Renderer] Dragstart event on:', target, 'Classes:', target.classList.toString(), 'Draggable:', target.draggable);
    
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
        
        console.log('[Renderer] Drag started:', draggedItem);
    } else {
        console.log('[Renderer] Drag not started - invalid target');
    }
}, true);

fileTreeView.addEventListener('dragend', (event) => {
    console.log('[Renderer] Drag ended');
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
        const allFolders = fileTreeView.querySelectorAll('.folder');
        allFolders.forEach(folder => {
            folder.style.backgroundColor = '';
            folder.style.border = '';
        });
    }, 100);
}, true);

fileTreeView.addEventListener('dragover', (event) => {
    const target = event.target;
    if (target.classList.contains('folder') && target.dataset.path && draggedItem) {
        event.preventDefault(); // Allow drop
        event.dataTransfer.dropEffect = 'move';
        
        // Visual feedback for drop target
        target.style.backgroundColor = 'var(--hover-color, #e3f2fd)';
        target.style.border = '2px solid #007bff';
        
        console.log('[Renderer] Dragover on folder:', target.dataset.path);
    }
}, true);

fileTreeView.addEventListener('dragleave', (event) => {
    const target = event.target;
    if (target.classList.contains('folder')) {
        // Remove visual feedback
        target.style.backgroundColor = '';
        target.style.border = '';
    }
}, true);

fileTreeView.addEventListener('drop', async (event) => {
    console.log('[Renderer] Drop event');
    event.preventDefault();
    event.stopPropagation();
    
    const target = event.target;
    console.log('[Renderer] Drop target:', target, 'Classes:', target.classList.toString());
    console.log('[Renderer] Dragged item:', draggedItem);
    
    // Validate we have all required data
    if (!target.classList.contains('folder') || !target.dataset.path) {
        console.log('[Renderer] Drop not processed - invalid target');
        return;
    }
    
    if (!draggedItem || !draggedItem.path || !draggedItem.type) {
        console.log('[Renderer] Drop not processed - no valid dragged item');
        showNotification('Drag and drop failed - no valid item being dragged', 'error');
        return;
    }
    
    const targetFolderPath = target.dataset.path;
    
    // Remove visual feedback
    target.style.backgroundColor = '';
    target.style.border = '';
    
    console.log('[Renderer] Attempting to move:', draggedItem.path, 'to:', targetFolderPath);
    
    // Don't allow dropping item into itself or its children
    if (draggedItem.path === targetFolderPath || targetFolderPath.startsWith(draggedItem.path + '/')) {
        showNotification('Cannot move item into itself or its subdirectory', 'error');
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
            console.log('[Renderer] Drag and drop move completed successfully');
            renderFileTree();
            showNotification(`${itemToMove.type === 'file' ? 'File' : 'Folder'} moved successfully`, 'success');
        } else {
            console.error('[Renderer] Error in drag and drop move:', result.error);
            showNotification(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('[Renderer] Error in drag and drop move:', error);
        showNotification('Error moving item', 'error');
    }
    
    // Clear the dragged item
    draggedItem = null;
}, true);




// === Kanban Settings Helper Functions ===

function addKanbanColumn() {
    const editor = document.getElementById('kanban-columns-editor');
    if (!editor) return;
    
    const index = editor.children.length;
    const newColumn = document.createElement('div');
    newColumn.className = 'kanban-column-row';
    newColumn.dataset.index = index;
    newColumn.innerHTML = `
        <input type="text" class="column-name" value="New Column" placeholder="Column Name">
        <input type="color" class="column-color" value="#f0f0f0">
        <button type="button" class="remove-column" onclick="removeKanbanColumn(${index})">×</button>
    `;
    editor.appendChild(newColumn);
}

function removeKanbanColumn(index) {
    const editor = document.getElementById('kanban-columns-editor');
    if (!editor) return;
    
    const row = editor.querySelector(`[data-index="${index}"]`);
    if (row) {
        row.remove();
        
        // Reindex remaining rows
        Array.from(editor.children).forEach((child, newIndex) => {
            child.dataset.index = newIndex;
            const removeBtn = child.querySelector('.remove-column');
            if (removeBtn) {
                removeBtn.setAttribute('onclick', `removeKanbanColumn(${newIndex})`);
            }
        });
    }
}

// === Kanban Board Functions ===

// Store reference to current kanban state to enable intelligent updates
let currentKanbanState = null;

function shouldRenderAsKanban(filePath, settings) {
    console.log('[Kanban] shouldRenderAsKanban called with:', { filePath, settings: settings?.kanban });
    
    if (!settings?.kanban?.todoFilePatterns) {
        console.log('[Kanban] No todoFilePatterns found in settings');
        return false;
    }
    
    const fileName = filePath.split('/').pop() || '';
    console.log('[Kanban] Extracted fileName:', fileName);
    console.log('[Kanban] Available patterns:', settings.kanban.todoFilePatterns);
    
    const shouldRender = settings.kanban.todoFilePatterns.some(pattern => {
        const regex = new RegExp(pattern.replace('*', '.*').replace(/\./g, '\\.'), 'i');
        const matches = regex.test(fileName);
        console.log('[Kanban] Testing pattern:', pattern, 'against fileName:', fileName, 'matches:', matches);
        return matches;
    });
    
    console.log('[Kanban] Final shouldRender result:', shouldRender);
    return shouldRender;
}

function parseKanbanFromMarkdown(content, settings) {
    const kanbanSettings = settings?.kanban || {};
    const doneMarkers = kanbanSettings.doneMarkers || ['DONE', 'COMPLETED', '✓', '✔', '[x]', '[X]'];
    const inProgressMarkers = kanbanSettings.inProgressMarkers || ['IN PROGRESS', 'DOING', '⏳', '[~]'];
    const columns = kanbanSettings.columns || [
        { id: 'todo', name: 'To Do', color: '#e3f2fd' },
        { id: 'inprogress', name: 'In Progress', color: '#fff3e0' },
        { id: 'done', name: 'Done', color: '#e8f5e8' }
    ];
    
    const tasks = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Match numbered lists (1. 2. etc.) or bullet points (- * +)
        const listMatch = line.match(/^(\d+\.\s*|\*\s*|\-\s*|\+\s*)(.*)/);
        if (listMatch) {
            const taskText = listMatch[2].trim();
            if (!taskText) continue;
            
            let status = 'todo';
            let cleanText = taskText;
            
            // Check for done markers
            const hasDoneMarker = doneMarkers.some(marker => {
                if (taskText.toUpperCase().includes(marker.toUpperCase())) {
                    const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    cleanText = taskText.replace(new RegExp(escapedMarker, 'gi'), '').trim();
                    // Remove common separators left behind
                    cleanText = cleanText.replace(/^[-\s]*|[-\s]*$/g, '').trim();
                    return true;
                }
                return false;
            });
            
            if (hasDoneMarker) {
                status = 'done';
            } else {
                // Check for in-progress markers
                const hasInProgressMarker = inProgressMarkers.some(marker => {
                    if (taskText.toUpperCase().includes(marker.toUpperCase())) {
                        const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        cleanText = taskText.replace(new RegExp(escapedMarker, 'gi'), '').trim();
                        cleanText = cleanText.replace(/^[-\s]*|[-\s]*$/g, '').trim();
                        return true;
                    }
                    return false;
                });
                
                if (hasInProgressMarker) {
                    status = 'inprogress';
                }
            }
            
            tasks.push({
                id: `task-${i}`,
                number: listMatch[1].trim(),
                text: cleanText,
                originalText: taskText,
                status: status,
                lineNumber: i
            });
        }
    }
    
    // Group tasks by status
    const tasksByColumn = {};
    columns.forEach(column => {
        tasksByColumn[column.id] = tasks.filter(task => task.status === column.id);
    });
    
    return { columns, tasks, tasksByColumn };
}

function renderKanbanBoard(parsedKanban, filePath) {
    const { columns, tasksByColumn } = parsedKanban;
    
    let boardHtml = '<div class="kanban-board" data-file-path="' + filePath + '">';
    
    columns.forEach(column => {
        const tasks = tasksByColumn[column.id] || [];
        
        boardHtml += `
            <div class="kanban-column" data-column-id="${column.id}" style="background-color: ${column.color}">
                <div class="kanban-column-header">${column.name} (${tasks.length})</div>
                <div class="kanban-tasks" data-column="${column.id}">
        `;
        
        tasks.forEach(task => {
            boardHtml += `
                <div class="kanban-task" 
                     data-task-id="${task.id}"
                     data-line-number="${task.lineNumber}"
                     data-original-status="${task.status}"
                     draggable="true">
                    <div class="kanban-task-content">
                        <div class="kanban-task-number">${task.number}</div>
                        <div class="kanban-task-text" data-editable="true">${task.text}</div>
                    </div>
                    <div class="kanban-task-actions">
                        <button class="task-edit-btn" title="Edit task">✎</button>
                        <button class="task-delete-btn" title="Delete task">×</button>
                    </div>
                </div>
            `;
        });
        
        boardHtml += `
                    <div class="kanban-add-task">
                        <button class="add-task-btn" data-column="${column.id}">+ Add Task</button>
                    </div>
                </div>
            </div>
        `;
    });
    
    boardHtml += '</div>';
    
    return boardHtml;
}

// Intelligent update function that preserves layout and only updates what changed
function updateKanbanBoard(container, parsedKanban, filePath) {
    const { columns, tasks, tasksByColumn } = parsedKanban;
    
    // Store current state for comparison
    const newState = JSON.stringify({ tasks: tasks.map(t => ({ id: t.id, text: t.text, status: t.status })) });
    
    // If nothing changed, don't update
    if (currentKanbanState === newState) {
        console.log('[Kanban] No changes detected, skipping update');
        return false;
    }
    
    console.log('[Kanban] Changes detected, performing intelligent update');
    currentKanbanState = newState;
    
    // Get existing board or create new one
    let kanbanBoard = container.querySelector('.kanban-board');
    
    if (!kanbanBoard) {
        // First render - use full render
        console.log('[Kanban] First render, creating full board');
        const kanbanHtml = renderKanbanBoard(parsedKanban, filePath);
        container.innerHTML = kanbanHtml;
        return true;
    }
    
    // Update existing board intelligently
    columns.forEach(column => {
        const columnTasks = tasksByColumn[column.id] || [];
        const columnElement = kanbanBoard.querySelector(`[data-column-id="${column.id}"]`);
        
        if (!columnElement) {
            console.warn(`[Kanban] Column ${column.id} not found, forcing full render`);
            const kanbanHtml = renderKanbanBoard(parsedKanban, filePath);
            container.innerHTML = kanbanHtml;
            return true;
        }
        
        const tasksContainer = columnElement.querySelector('.kanban-tasks');
        const headerElement = columnElement.querySelector('.kanban-column-header');
        
        // Update header count
        const columnName = column.name;
        headerElement.textContent = `${columnName} (${columnTasks.length})`;
        
        // Get existing tasks
        const existingTasks = Array.from(tasksContainer.querySelectorAll('.kanban-task'));
        const existingTaskIds = existingTasks.map(t => t.dataset.taskId);
        const newTaskIds = columnTasks.map(t => t.id);
        
        // Remove tasks that no longer exist in this column
        existingTasks.forEach(taskEl => {
            if (!newTaskIds.includes(taskEl.dataset.taskId)) {
                taskEl.remove();
            }
        });
        
        // Add or update tasks
        columnTasks.forEach((task, index) => {
            let taskElement = tasksContainer.querySelector(`[data-task-id="${task.id}"]`);
            
            if (!taskElement) {
                // Create new task element
                taskElement = document.createElement('div');
                taskElement.className = 'kanban-task';
                taskElement.setAttribute('data-task-id', task.id);
                taskElement.setAttribute('data-line-number', task.lineNumber);
                taskElement.setAttribute('data-original-status', task.status);
                taskElement.setAttribute('draggable', 'true');
                
                taskElement.innerHTML = `
                    <div class="kanban-task-content">
                        <div class="kanban-task-number">${task.number}</div>
                        <div class="kanban-task-text" data-editable="true">${task.text}</div>
                    </div>
                    <div class="kanban-task-actions">
                        <button class="task-edit-btn" title="Edit task">✎</button>
                        <button class="task-delete-btn" title="Delete task">×</button>
                    </div>
                `;
                
                // Add drag event listeners for new tasks
                taskElement.addEventListener('dragstart', (e) => {
                    console.log('[Kanban] Drag started for new task:', task.id);
                    e.dataTransfer.setData('text/plain', task.id);
                    taskElement.classList.add('dragging');
                });
                
                taskElement.addEventListener('dragend', (e) => {
                    console.log('[Kanban] Drag ended for new task:', task.id);
                    taskElement.classList.remove('dragging');
                });
                
                // Set up task action event listeners for new tasks
                const editBtn = taskElement.querySelector('.task-edit-btn');
                const deleteBtn = taskElement.querySelector('.task-delete-btn');
                
                if (editBtn && !editBtn.hasAttribute('data-listeners-attached')) {
                    editBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        handleTaskEdit(taskElement, filePath);
                    });
                    editBtn.setAttribute('data-listeners-attached', 'true');
                }
                
                if (deleteBtn && !deleteBtn.hasAttribute('data-listeners-attached')) {
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        handleTaskDelete(taskElement, filePath);
                    });
                    deleteBtn.setAttribute('data-listeners-attached', 'true');
                }
                
                // Insert at correct position
                if (index < tasksContainer.children.length) {
                    tasksContainer.insertBefore(taskElement, tasksContainer.children[index]);
                } else {
                    tasksContainer.appendChild(taskElement);
                }
            } else {
                // Update existing task content if changed
                const numberEl = taskElement.querySelector('.kanban-task-number');
                const textEl = taskElement.querySelector('.kanban-task-text');
                
                if (numberEl.textContent !== task.number) {
                    numberEl.textContent = task.number;
                }
                if (textEl.textContent !== task.text) {
                    textEl.textContent = task.text;
                }
                
                // Update attributes
                taskElement.setAttribute('data-line-number', task.lineNumber);
                taskElement.setAttribute('data-original-status', task.status);
                
                // Ensure correct position
                const currentIndex = Array.from(tasksContainer.children).indexOf(taskElement);
                if (currentIndex !== index) {
                    if (index < tasksContainer.children.length) {
                        tasksContainer.insertBefore(taskElement, tasksContainer.children[index]);
                    } else {
                        tasksContainer.appendChild(taskElement);
                    }
                }
            }
        });
        
        // Ensure add task button exists
        let addTaskContainer = columnElement.querySelector('.kanban-add-task');
        if (!addTaskContainer) {
            addTaskContainer = document.createElement('div');
            addTaskContainer.className = 'kanban-add-task';
            addTaskContainer.innerHTML = `<button class="add-task-btn" data-column="${column.id}">+ Add Task</button>`;
            columnElement.appendChild(addTaskContainer);
            
            // Set up event handler for new add button
            const addBtn = addTaskContainer.querySelector('.add-task-btn');
            if (addBtn && !addBtn.hasAttribute('data-listeners-attached')) {
                addBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const columnId = addBtn.dataset.column;
                    handleAddTask(columnId, filePath, container);
                });
                addBtn.setAttribute('data-listeners-attached', 'true');
            }
        }
    });
    
    return true;
}

function setupKanbanDragAndDrop(container, filePath) {
    console.log('[Kanban] Setting up drag-and-drop for:', filePath);
    
    const kanbanBoard = container.querySelector('.kanban-board');
    if (!kanbanBoard) {
        console.log('[Kanban] No kanban board found for drag-and-drop setup');
        return;
    }
    
    // Clear any existing drag setup and always set it up fresh
    // This ensures drag-and-drop works even if there were issues before
    kanbanBoard.removeAttribute('data-drag-setup');
    console.log('[Kanban] Setting up drag-and-drop handlers...');
    
    // Setup drag events for each task individually (more reliable than delegation)
    const tasks = kanbanBoard.querySelectorAll('.kanban-task');
    console.log(`[Kanban] Setting up drag handlers for ${tasks.length} tasks`);
    
    tasks.forEach((task, index) => {
        console.log(`[Kanban] Setting up drag for task ${index}:`, task.dataset.taskId);
        
        // Ensure draggable attribute is set
        task.setAttribute('draggable', 'true');
        
        task.addEventListener('dragstart', (e) => {
            console.log('[Kanban] Drag started for task:', task.dataset.taskId);
            e.dataTransfer.setData('text/plain', task.dataset.taskId);
            task.classList.add('dragging');
        });
        
        task.addEventListener('dragend', (e) => {
            console.log('[Kanban] Drag ended for task:', task.dataset.taskId);
            task.classList.remove('dragging');
        });
    });
    
    // Setup drop events for columns  
    const columns = container.querySelectorAll('.kanban-tasks');
    console.log(`[Kanban] Setting up drop handlers for ${columns.length} columns`);
    
    // Setup drop events for columns
    columns.forEach((column, index) => {
        console.log(`[Kanban] Setting up drop handler for column ${index}: ${column.dataset.column}`);
        
        column.addEventListener('dragover', (e) => {
            e.preventDefault();
            column.parentElement.classList.add('drag-over');
        });
        
        column.addEventListener('dragleave', (e) => {
            if (!column.contains(e.relatedTarget)) {
                column.parentElement.classList.remove('drag-over');
            }
        });
        
        column.addEventListener('drop', async (e) => {
            e.preventDefault();
            console.log('[Kanban] Drop event triggered on column:', column.dataset.column);
            column.parentElement.classList.remove('drag-over');
            
            const taskId = e.dataTransfer.getData('text/plain');
            const task = container.querySelector(`[data-task-id="${taskId}"]`);
            
            if (task && task.parentElement !== column) {
                const newColumnId = column.dataset.column;
                const oldColumnId = task.dataset.originalStatus;
                
                // Move the task visually
                column.appendChild(task);
                task.dataset.originalStatus = newColumnId;
                
                // Update column headers
                updateKanbanColumnHeaders(container);
                
                // Save the change back to the file
                try {
                    // Temporarily disable auto-save to prevent conflicts
                    const wasAutoSaveEnabled = window.appSettings?.ui?.autoSave;
                    if (wasAutoSaveEnabled && autoSaveTimer) {
                        clearTimeout(autoSaveTimer);
                        autoSaveTimer = null;
                        console.log('[Kanban] Temporarily disabled auto-save during Kanban update');
                    }
                    
                    await updateKanbanTaskInFile(filePath, task, newColumnId);
                    showNotification('Task moved successfully', 'success');
                    
                    // Refresh the editor content if this file is currently open
                    if (currentFilePath === filePath) {
                        console.log('[Kanban] Refreshing editor content after task update');
                        await refreshCurrentFile();
                        
                        // Update the lastSavedContent to prevent auto-save conflicts
                        if (editor) {
                            lastSavedContent = editor.getValue();
                            hasUnsavedChanges = false;
                            updateUnsavedIndicator(false);
                        }
                    }
                    
                    // Re-enable auto-save after a short delay
                    if (wasAutoSaveEnabled) {
                        setTimeout(() => {
                            console.log('[Kanban] Re-enabled auto-save after Kanban update');
                        }, 500);
                    }
                } catch (error) {
                    console.error('Error updating task:', error);
                    showNotification('Error saving task change', 'error');
                    
                    // Revert the visual change on error
                    const originalColumn = container.querySelector(`[data-column="${oldColumnId}"]`);
                    if (originalColumn) {
                        originalColumn.appendChild(task);
                        task.dataset.originalStatus = oldColumnId;
                        updateKanbanColumnHeaders(container);
                    }
                }
            }
        });
    });
    
    console.log(`[Kanban] Drag-and-drop setup completed! Set up ${columns.length} drop zones for file: ${filePath}`);
}

function updateKanbanColumnHeaders(container) {
    const columns = container.querySelectorAll('.kanban-column');
    columns.forEach(column => {
        const header = column.querySelector('.kanban-column-header');
        const tasks = column.querySelectorAll('.kanban-task');
        const columnName = header.textContent.replace(/\s*\(\d+\)$/, '');
        header.textContent = `${columnName} (${tasks.length})`;
    });
}

async function updateKanbanTaskInFile(filePath, taskElement, newStatus) {
    console.log(`[Kanban] === Starting updateKanbanTaskInFile ===`);
    console.log(`[Kanban] FilePath: ${filePath}`);
    console.log(`[Kanban] NewStatus: ${newStatus}`);
    console.log(`[Kanban] TaskElement dataset:`, taskElement.dataset);
    
    try {
        // Get current file content
        console.log(`[Kanban] Reading current file content...`);
        const content = await window.electronAPI.invoke('read-file', filePath);
        console.log(`[Kanban] File content length: ${content.length}`);
        console.log(`[Kanban] File content preview:`, content.substring(0, 300));
        
        const lines = content.split('\n');
        const lineNumber = parseInt(taskElement.dataset.lineNumber);
        console.log(`[Kanban] Target line number: ${lineNumber}`);
        
        if (lineNumber >= 0 && lineNumber < lines.length) {
            const originalLine = lines[lineNumber];
            const taskText = taskElement.querySelector('.kanban-task-text').textContent;
            
            // Get current settings to determine markers
            const settings = await window.electronAPI.invoke('get-settings');
            const kanbanSettings = settings.kanban || {};
            const doneMarkers = kanbanSettings.doneMarkers || ['DONE'];
            const inProgressMarkers = kanbanSettings.inProgressMarkers || ['IN PROGRESS'];
            
            // Remove existing status markers
            let newLine = originalLine;
            [...doneMarkers, ...inProgressMarkers].forEach(marker => {
                // Escape special regex characters in the marker
                const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                
                // Remove marker with various patterns (with dashes, spaces, etc.)
                newLine = newLine.replace(new RegExp(`\\s*-\\s*${escapedMarker}\\s*`, 'gi'), '');
                newLine = newLine.replace(new RegExp(`\\s*${escapedMarker}\\s*-\\s*`, 'gi'), '');
                newLine = newLine.replace(new RegExp(`\\s*${escapedMarker}\\s*`, 'gi'), '');
            });
            
            // Add new status marker
            if (newStatus === 'done') {
                newLine = newLine.trim() + ' - ' + doneMarkers[0];
            } else if (newStatus === 'inprogress') {
                newLine = newLine.trim() + ' - ' + inProgressMarkers[0];
            }
            
            // Update the line
            lines[lineNumber] = newLine;
            
            // Save the file
            console.log(`[Kanban] About to write file with updated content:`, lines[lineNumber]);
            await window.electronAPI.invoke('write-file', filePath, lines.join('\n'));
            
            console.log(`[Kanban] Updated task on line ${lineNumber} to status: ${newStatus}`);
        }
    } catch (error) {
        console.error('[Kanban] Error updating file:', error);
        throw error;
    }
}

// === Kanban Task Action Functions ===

function setupKanbanTaskActions(container, filePath) {
    console.log('[Kanban] Setting up task action handlers for:', filePath);
    
    const kanbanBoard = container.querySelector('.kanban-board');
    if (!kanbanBoard) {
        console.log('[Kanban] No kanban board found for task actions setup');
        return;
    }
    
    // Clear any existing event listeners by cloning and replacing elements
    // This prevents duplicate event listeners
    const existingButtons = kanbanBoard.querySelectorAll('.task-edit-btn, .task-delete-btn, .add-task-btn');
    existingButtons.forEach(btn => {
        if (btn.hasAttribute('data-listeners-attached')) {
            return; // Skip if already has listeners
        }
    });
    
    // Edit task buttons
    const editButtons = kanbanBoard.querySelectorAll('.task-edit-btn:not([data-listeners-attached])');
    editButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleTaskEdit(btn.closest('.kanban-task'), filePath);
        });
        btn.setAttribute('data-listeners-attached', 'true');
    });
    
    // Delete task buttons  
    const deleteButtons = kanbanBoard.querySelectorAll('.task-delete-btn:not([data-listeners-attached])');
    deleteButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleTaskDelete(btn.closest('.kanban-task'), filePath);
        });
        btn.setAttribute('data-listeners-attached', 'true');
    });
    
    // Add task buttons
    const addButtons = kanbanBoard.querySelectorAll('.add-task-btn:not([data-listeners-attached])');
    addButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const columnId = btn.dataset.column;
            handleAddTask(columnId, filePath, container);
        });
        btn.setAttribute('data-listeners-attached', 'true');
    });
}

async function handleTaskEdit(taskElement, filePath) {
    const textElement = taskElement.querySelector('.kanban-task-text');
    const originalText = textElement.textContent.trim();
    
    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalText;
    input.className = 'kanban-task-edit-input';
    input.style.cssText = 'width: 100%; padding: 4px; border: 1px solid #ccc; border-radius: 3px;';
    
    // Replace text with input
    textElement.style.display = 'none';
    textElement.parentNode.insertBefore(input, textElement.nextSibling);
    input.focus();
    input.select();
    
    const saveEdit = async () => {
        const newText = input.value.trim();
        if (newText && newText !== originalText) {
            try {
                await updateTaskTextInFile(filePath, taskElement, newText);
                textElement.textContent = newText;
                showNotification('Task updated successfully', 'success');
                
                // Refresh editor if this file is open
                if (window.currentFilePath === filePath) {
                    await refreshCurrentFile();
                    if (window.editor) {
                        window.lastSavedContent = window.editor.getValue();
                        window.hasUnsavedChanges = false;
                        updateUnsavedIndicator(false);
                    }
                }
            } catch (error) {
                console.error('Error updating task text:', error);
                showNotification('Error updating task', 'error');
            }
        }
        
        // Cleanup
        textElement.style.display = '';
        input.remove();
    };
    
    const cancelEdit = () => {
        textElement.style.display = '';
        input.remove();
    };
    
    // Save on Enter, cancel on Escape
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    });
    
    // Save on blur
    input.addEventListener('blur', saveEdit);
}

async function handleTaskDelete(taskElement, filePath) {
    const taskText = taskElement.querySelector('.kanban-task-text').textContent.trim();
    
    if (!confirm(`Delete task: "${taskText}"?`)) {
        return;
    }
    
    try {
        // Get container reference before removing the element
        const container = taskElement.closest('.kanban-board').parentElement;
        
        await deleteTaskFromFile(filePath, taskElement);
        taskElement.remove();
        
        // Update column header counts
        updateKanbanColumnHeaders(container);
        
        showNotification('Task deleted successfully', 'success');
        
        // Refresh editor if this file is open
        if (window.currentFilePath === filePath) {
            await refreshCurrentFile();
            if (window.editor) {
                window.lastSavedContent = window.editor.getValue();
                window.hasUnsavedChanges = false;
                updateUnsavedIndicator(false);
            }
        }
    } catch (error) {
        console.error('Error deleting task:', error);
        showNotification('Error deleting task', 'error');
    }
}

async function handleAddTask(columnId, filePath, container) {
    console.log('[Kanban] handleAddTask called with:', { columnId, filePath, container });
    
    if (!container) {
        console.error('[Kanban] Container is null in handleAddTask');
        return;
    }
    
    // Create input for new task
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Enter new task...';
    input.className = 'kanban-new-task-input';
    input.style.cssText = 'width: 100%; padding: 8px; margin: 4px 0; border: 1px solid #ccc; border-radius: 3px;';
    
    const column = container.querySelector(`[data-column="${columnId}"]`);
    if (!column) {
        console.error(`[Kanban] Could not find column with id: ${columnId}`);
        return;
    }
    
    const addTaskButton = column.querySelector('.kanban-add-task');
    if (!addTaskButton) {
        console.error(`[Kanban] Could not find add task button in column: ${columnId}`);
        return;
    }
    
    // Insert input before the add button
    column.insertBefore(input, addTaskButton);
    input.focus();
    
    const saveNewTask = async () => {
        const taskText = input.value.trim();
        if (taskText) {
            try {
                await addTaskToFile(filePath, taskText, columnId);
                showNotification('Task added successfully', 'success');
                
                // Refresh editor if this file is open
                if (window.currentFilePath === filePath) {
                    await refreshCurrentFile();
                    if (window.editor) {
                        window.lastSavedContent = window.editor.getValue();
                        window.hasUnsavedChanges = false;
                        updateUnsavedIndicator(false);
                    }
                }
                
                // Trigger a preview update to show the new task
                if (window.updatePreviewAndStructure) {
                    window.updatePreviewAndStructure();
                }
            } catch (error) {
                console.error('Error adding task:', error);
                showNotification('Error adding task', 'error');
            }
        }
        
        input.remove();
    };
    
    const cancelNewTask = () => {
        input.remove();
    };
    
    // Save on Enter, cancel on Escape
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveNewTask();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelNewTask();
        }
    });
    
    // Cancel on blur
    input.addEventListener('blur', cancelNewTask);
}

async function updateTaskTextInFile(filePath, taskElement, newText) {
    console.log(`[Kanban] Updating task text in file: ${filePath}`);
    
    try {
        const content = await window.electronAPI.invoke('read-file', filePath);
        const lines = content.split('\n');
        const lineNumber = parseInt(taskElement.dataset.lineNumber);
        
        if (lineNumber >= 0 && lineNumber < lines.length) {
            const originalLine = lines[lineNumber];
            
            // Extract the list marker (1. or - or * etc.)
            const listMatch = originalLine.match(/^(\s*(?:\d+\.\s*|\*\s*|\-\s*|\+\s*))/);
            if (listMatch) {
                const prefix = listMatch[1];
                
                // Get current settings to preserve status markers
                const settings = await window.electronAPI.invoke('get-settings');
                const kanbanSettings = settings.kanban || {};
                const doneMarkers = kanbanSettings.doneMarkers || ['DONE'];
                const inProgressMarkers = kanbanSettings.inProgressMarkers || ['IN PROGRESS'];
                
                // Find existing status marker in original line
                let statusMarker = '';
                const currentStatus = taskElement.dataset.originalStatus;
                if (currentStatus === 'done') {
                    // Check if line has a done marker
                    for (const marker of doneMarkers) {
                        if (originalLine.toUpperCase().includes(marker.toUpperCase())) {
                            statusMarker = ` - ${marker}`;
                            break;
                        }
                    }
                } else if (currentStatus === 'inprogress') {
                    // Check if line has an in-progress marker
                    for (const marker of inProgressMarkers) {
                        if (originalLine.toUpperCase().includes(marker.toUpperCase())) {
                            statusMarker = ` - ${marker}`;
                            break;
                        }
                    }
                }
                
                // Reconstruct the line with new text but preserved status
                lines[lineNumber] = prefix + newText + statusMarker;
                
                await window.electronAPI.invoke('write-file', filePath, lines.join('\n'));
                console.log(`[Kanban] Updated task text on line ${lineNumber}`);
            }
        }
    } catch (error) {
        console.error('[Kanban] Error updating task text:', error);
        throw error;
    }
}

async function deleteTaskFromFile(filePath, taskElement) {
    console.log(`[Kanban] Deleting task from file: ${filePath}`);
    
    try {
        const content = await window.electronAPI.invoke('read-file', filePath);
        const lines = content.split('\n');
        const lineNumber = parseInt(taskElement.dataset.lineNumber);
        
        if (lineNumber >= 0 && lineNumber < lines.length) {
            // Remove the line
            lines.splice(lineNumber, 1);
            
            await window.electronAPI.invoke('write-file', filePath, lines.join('\n'));
            console.log(`[Kanban] Deleted task on line ${lineNumber}`);
        }
    } catch (error) {
        console.error('[Kanban] Error deleting task:', error);
        throw error;
    }
}

async function addTaskToFile(filePath, taskText, columnId) {
    console.log(`[Kanban] Adding task to file: ${filePath}, column: ${columnId}`);
    
    try {
        const content = await window.electronAPI.invoke('read-file', filePath);
        const lines = content.split('\n');
        
        // Get settings to determine status markers
        const settings = await window.electronAPI.invoke('get-settings');
        const kanbanSettings = settings.kanban || {};
        const doneMarkers = kanbanSettings.doneMarkers || ['DONE'];
        const inProgressMarkers = kanbanSettings.inProgressMarkers || ['IN PROGRESS'];
        
        // Find the highest numbered item to continue the sequence
        let maxNumber = 0;
        lines.forEach(line => {
            const match = line.match(/^\s*(\d+)\./);
            if (match) {
                maxNumber = Math.max(maxNumber, parseInt(match[1]));
            }
        });
        
        const nextNumber = maxNumber + 1;
        let newLine = `${nextNumber}. ${taskText}`;
        
        // Add status marker based on column
        if (columnId === 'done') {
            newLine += ` - ${doneMarkers[0]}`;
        } else if (columnId === 'inprogress') {
            newLine += ` - ${inProgressMarkers[0]}`;
        }
        
        // Add the new task at the end of the file
        lines.push(newLine);
        
        await window.electronAPI.invoke('write-file', filePath, lines.join('\n'));
        console.log(`[Kanban] Added new task: ${newLine}`);
    } catch (error) {
        console.error('[Kanban] Error adding task:', error);
        throw error;
    }
}

// Make functions available globally
window.updateKanbanBoard = updateKanbanBoard;
window.setupKanbanTaskActions = setupKanbanTaskActions;

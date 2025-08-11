
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
                    cleanText = taskText.replace(new RegExp(marker, 'gi'), '').trim();
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
                        cleanText = taskText.replace(new RegExp(marker, 'gi'), '').trim();
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
                    <div class="kanban-task-number">${task.number}</div>
                    <div class="kanban-task-text">${task.text}</div>
                </div>
            `;
        });
        
        boardHtml += `
                </div>
            </div>
        `;
    });
    
    boardHtml += '</div>';
    
    return boardHtml;
}

function setupKanbanDragAndDrop(container, filePath) {
    const tasks = container.querySelectorAll('.kanban-task');
    const columns = container.querySelectorAll('.kanban-tasks');
    
    // Setup drag events for tasks
    tasks.forEach(task => {
        task.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', task.dataset.taskId);
            task.classList.add('dragging');
        });
        
        task.addEventListener('dragend', () => {
            task.classList.remove('dragging');
        });
    });
    
    // Setup drop events for columns
    columns.forEach(column => {
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
                newLine = newLine.replace(new RegExp(`\\s*-\\s*${marker}\\s*`, 'gi'), '');
                newLine = newLine.replace(new RegExp(`\\s*${marker}\\s*-\\s*`, 'gi'), '');
                newLine = newLine.replace(new RegExp(`\\s*${marker}\\s*`, 'gi'), '');
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

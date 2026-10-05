
// === Kanban Settings Helper Functions ===

const DEFAULT_KANBAN_COLUMNS = [
    { id: 'todo', name: 'To Do', color: '#e3f2fd' },
    { id: 'inprogress', name: 'In Progress', color: '#fff3e0' },
    { id: 'done', name: 'Done', color: '#e8f5e8' }
];
const DEFAULT_DONE_MARKERS = ['DONE', 'COMPLETED', '✓', '✔', '[x]', '[X]'];
const DEFAULT_IN_PROGRESS_MARKERS = ['IN PROGRESS', 'DOING', '⏳', '[~]'];
const DEFAULT_KANBAN_GROUP_SIZE = 12;
const KANBAN_AUTO_COLLAPSE_TASK_THRESHOLD = 40;

function cloneDefaultColumns() {
    return DEFAULT_KANBAN_COLUMNS.map(column => ({ ...column }));
}

function getKanbanSettings(settings) {
    return settings?.kanban || {};
}

function getKanbanColumns(settings) {
    const configuredColumns = getKanbanSettings(settings).columns;
    return Array.isArray(configuredColumns) && configuredColumns.length
        ? configuredColumns
        : cloneDefaultColumns();
}

function getKanbanGroupSize(settings) {
    const configuredSize = Number(getKanbanSettings(settings).groupSize);
    return Number.isFinite(configuredSize) && configuredSize > 0
        ? Math.floor(configuredSize)
        : DEFAULT_KANBAN_GROUP_SIZE;
}

function isKanbanGroupingEnabled(settings) {
    return getKanbanSettings(settings).enableGrouping !== false;
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/\n/g, '&#10;');
}

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getMarked() {
    if (typeof window !== 'undefined' && window.marked) return window.marked;
    if (typeof marked !== 'undefined') return marked;
    return null;
}

function getPreviewSanitizer() {
    return typeof window !== 'undefined'
        ? window.NightOwlPreviewMarkdown?.sanitizePreviewHTML
        : null;
}

function renderKanbanMarkdown(markdown) {
    const source = String(markdown == null ? '' : markdown).trim();
    if (!source) return '';

    const sanitizer = getPreviewSanitizer();
    const markedLib = getMarked();
    if (sanitizer && markedLib?.parse) {
        try {
            return sanitizer(markedLib.parse(source, { gfm: true, breaks: true }));
        } catch (error) {
            console.warn('[Kanban] Markdown rendering failed, using escaped text:', error);
        }
    }

    return `<p>${escapeHtml(source).replace(/\n/g, '<br>')}</p>`;
}

function getIndent(line) {
    return (String(line || '').match(/^\s*/) || [''])[0].length;
}

function isThematicBreak(line) {
    const trimmed = String(line || '').trim();
    return /^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed);
}

function stripInlineMarkdown(value) {
    return String(value || '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_~]+/g, '')
        .trim();
}

function slugifyKanbanGroup(value) {
    return stripInlineMarkdown(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'tasks';
}

function matchMarkdownHeading(line) {
    const match = String(line || '').match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) return null;

    return {
        level: match[1].length,
        text: stripInlineMarkdown(match[2]),
        rawText: match[2]
    };
}

function updateHeadingStack(headingStack, heading, lineNumber) {
    while (headingStack.length && headingStack[headingStack.length - 1].level >= heading.level) {
        headingStack.pop();
    }

    headingStack.push({
        ...heading,
        lineNumber,
        id: `heading-${lineNumber}-${slugifyKanbanGroup(heading.text)}`
    });
}

function getCurrentTaskGroup(headingStack) {
    const heading = headingStack[headingStack.length - 1];
    if (!heading) {
        return {
            id: 'group-ungrouped',
            name: 'Tasks',
            lineNumber: -1,
            depth: 0
        };
    }

    return {
        id: heading.id,
        name: heading.text || 'Tasks',
        lineNumber: heading.lineNumber,
        depth: heading.level
    };
}

function matchKanbanListItem(line) {
    const raw = String(line || '');
    const prefixMatch = raw.match(/^(\s*(?:\d+\.|[*+-])(?:\s+|$))/);
    if (!prefixMatch) return null;

    const marker = prefixMatch[0].trim();
    return {
        indent: getIndent(raw),
        prefix: prefixMatch[0],
        marker,
        isOrdered: /^\d+\.$/.test(marker),
        text: raw.slice(prefixMatch[0].length)
    };
}

function isKanbanBlockBoundary(line, baseIndent) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return false;

    const indent = getIndent(line);
    if (indent > baseIndent) return false;

    return Boolean(matchKanbanListItem(line)) ||
        /^#{1,6}\s+/.test(trimmed) ||
        isThematicBreak(line);
}

function findNextNonBlankLine(lines, startIndex) {
    for (let i = startIndex; i < lines.length; i++) {
        if (String(lines[i] || '').trim()) {
            return { index: i, line: lines[i] };
        }
    }
    return null;
}

function normalizeContinuationLine(line, taskMatch) {
    const raw = String(line || '');
    if (!raw.trim()) return '';

    const removableIndent = taskMatch.prefix.length;
    const leadingWhitespace = getIndent(raw);
    const removeCount = Math.min(removableIndent, leadingWhitespace);
    return raw.slice(removeCount);
}

function stripStatusMarker(text, markers) {
    let cleanText = String(text || '');
    let matched = false;

    for (const marker of markers) {
        if (cleanText.toUpperCase().includes(String(marker).toUpperCase())) {
            cleanText = cleanText
                .replace(new RegExp(escapeRegExp(marker), 'gi'), '')
                .replace(/^[-\s]*|[-\s]*$/g, '')
                .trim();
            matched = true;
            break;
        }
    }

    return { cleanText, matched };
}

function extractKanbanTaskStatus(firstLineText, kanbanSettings) {
    const doneMarkers = kanbanSettings.doneMarkers || DEFAULT_DONE_MARKERS;
    const inProgressMarkers = kanbanSettings.inProgressMarkers || DEFAULT_IN_PROGRESS_MARKERS;

    const doneResult = stripStatusMarker(firstLineText, doneMarkers);
    if (doneResult.matched) {
        return { status: 'done', cleanText: doneResult.cleanText };
    }

    const inProgressResult = stripStatusMarker(firstLineText, inProgressMarkers);
    if (inProgressResult.matched) {
        return { status: 'inprogress', cleanText: inProgressResult.cleanText };
    }

    return { status: 'todo', cleanText: String(firstLineText || '').trim() };
}

function extractTaskListCheckbox(firstLineText) {
    const match = String(firstLineText || '').match(/^\s*\[([ xX~\-])\]\s*/);
    if (!match) {
        return {
            status: null,
            cleanText: String(firstLineText || '').trim()
        };
    }

    const marker = match[1];
    let status = 'todo';
    if (marker === 'x' || marker === 'X') {
        status = 'done';
    } else if (marker === '~' || marker === '-') {
        status = 'inprogress';
    }

    return {
        status,
        cleanText: String(firstLineText || '').slice(match[0].length).trim()
    };
}

function collectKanbanTaskBlock(lines, startIndex, taskMatch) {
    const textLines = [taskMatch.text.trim()];
    let endLineNumber = startIndex;

    for (let i = startIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = String(line || '').trim();

        if (!trimmed) {
            const next = findNextNonBlankLine(lines, i + 1);
            if (!next || isKanbanBlockBoundary(next.line, taskMatch.indent) || getIndent(next.line) <= taskMatch.indent) {
                break;
            }
            textLines.push('');
            endLineNumber = i;
            continue;
        }

        if (isKanbanBlockBoundary(line, taskMatch.indent)) {
            break;
        }

        textLines.push(normalizeContinuationLine(line, taskMatch));
        endLineNumber = i;
    }

    return { textLines, endLineNumber };
}

function renderKanbanTaskText(textElement, task) {
    if (!textElement) return;
    textElement.dataset.markdown = task.text || '';
    textElement.innerHTML = renderKanbanMarkdown(task.text);
}

function renderKanbanTaskNumber(task) {
    return task.number
        ? `<div class="kanban-task-number">${escapeHtml(task.number)}</div>`
        : '';
}

function renderKanbanTaskMarkup(task) {
    return `
        <div class="kanban-task"
             data-task-id="${escapeAttr(task.id)}"
             data-line-number="${escapeAttr(task.lineNumber)}"
             data-end-line-number="${escapeAttr(task.endLineNumber)}"
             data-original-status="${escapeAttr(task.status)}"
             draggable="true">
            <div class="kanban-task-content">
                ${renderKanbanTaskNumber(task)}
                <div class="kanban-task-text" data-editable="true" data-markdown="${escapeAttr(task.text)}">${renderKanbanMarkdown(task.text)}</div>
            </div>
            <div class="kanban-task-actions">
                <button class="task-edit-btn" title="Edit task">✎</button>
                <button class="task-delete-btn" title="Delete task">×</button>
            </div>
        </div>
    `;
}

function createKanbanRenderGroup(group, tasks, chunkIndex = 0, chunkStart = 0, chunkEnd = tasks.length) {
    const baseName = group.name || 'Tasks';
    const chunkedName = group.chunked
        ? (baseName === 'Tasks'
            ? `Tasks ${chunkStart + 1}-${chunkEnd}`
            : `${baseName} (${chunkStart + 1}-${chunkEnd})`)
        : baseName;

    return {
        id: chunkIndex
            ? `${group.id}-chunk-${chunkIndex}`
            : group.id,
        name: chunkedName,
        sourceName: baseName,
        lineNumber: group.lineNumber,
        depth: group.depth,
        tasks
    };
}

function groupTasksForColumn(tasks, maxGroupSize) {
    const sourceGroups = [];
    let currentGroup = null;

    tasks.forEach(task => {
        if (!currentGroup || currentGroup.id !== task.groupId) {
            currentGroup = {
                id: task.groupId || 'group-ungrouped',
                name: task.groupName || 'Tasks',
                lineNumber: task.groupLineNumber ?? -1,
                depth: task.groupDepth ?? 0,
                tasks: []
            };
            sourceGroups.push(currentGroup);
        }

        currentGroup.tasks.push(task);
    });

    const renderGroups = [];
    sourceGroups.forEach(sourceGroup => {
        if (sourceGroup.tasks.length > maxGroupSize) {
            for (let start = 0; start < sourceGroup.tasks.length; start += maxGroupSize) {
                const chunk = sourceGroup.tasks.slice(start, start + maxGroupSize);
                renderGroups.push(createKanbanRenderGroup(
                    { ...sourceGroup, chunked: true },
                    chunk,
                    Math.floor(start / maxGroupSize) + 1,
                    start,
                    start + chunk.length
                ));
            }
            return;
        }

        renderGroups.push(createKanbanRenderGroup(sourceGroup, sourceGroup.tasks));
    });

    return renderGroups;
}

function shouldOpenKanbanTaskGroup(totalTasks, groupCount) {
    return totalTasks <= KANBAN_AUTO_COLLAPSE_TASK_THRESHOLD && groupCount <= 6;
}

function renderKanbanTaskGroup(group, totalTasks, groupCount) {
    const openAttr = shouldOpenKanbanTaskGroup(totalTasks, groupCount) ? ' open' : '';
    const taskHtml = group.tasks.map(renderKanbanTaskMarkup).join('');

    return `
        <details class="kanban-task-group" data-group-id="${escapeAttr(group.id)}"${openAttr}>
            <summary class="kanban-task-group-summary">
                <span class="kanban-task-group-title">${escapeHtml(group.name)}</span>
                <span class="kanban-task-group-count">${group.tasks.length}</span>
            </summary>
            <div class="kanban-task-group-body">
                ${taskHtml}
            </div>
        </details>
    `;
}

function buildKanbanGroupsByColumn(columns, tasksByColumn, maxGroupSize) {
    const groupsByColumn = {};
    columns.forEach(column => {
        groupsByColumn[column.id] = groupTasksForColumn(tasksByColumn[column.id] || [], maxGroupSize);
    });
    return groupsByColumn;
}

function createKanbanTaskElement(task) {
    const template = document.createElement('template');
    template.innerHTML = renderKanbanTaskMarkup(task).trim();
    return template.content.firstElementChild;
}

function updateKanbanTaskNumber(numberElement, taskElement, task) {
    if (!taskElement) return;

    let currentNumberElement = numberElement;
    if (task.number) {
        if (!currentNumberElement) {
            currentNumberElement = document.createElement('div');
            currentNumberElement.className = 'kanban-task-number';
            const contentElement = taskElement.querySelector('.kanban-task-content');
            contentElement?.insertBefore(currentNumberElement, contentElement.firstChild);
        }
        if (currentNumberElement.textContent !== task.number) {
            currentNumberElement.textContent = task.number;
        }
    } else if (currentNumberElement) {
        currentNumberElement.remove();
    }
}

function setTaskLineAttributes(taskElement, task) {
    taskElement.setAttribute('data-line-number', task.lineNumber);
    taskElement.setAttribute('data-end-line-number', task.endLineNumber);
    taskElement.setAttribute('data-original-status', task.status);
}

function getTaskMarkdownFromElement(taskElement) {
    const textElement = taskElement?.querySelector('.kanban-task-text');
    return textElement?.dataset.markdown || textElement?.textContent || '';
}

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
let currentKanbanFilePath = null;

function shouldRenderAsKanban(filePath, settings) {
    if (!settings?.kanban?.todoFilePatterns) {
        return false;
    }
    
    const fileName = filePath.split('/').pop() || '';
    
    const shouldRender = settings.kanban.todoFilePatterns.some(pattern => {
        const regex = new RegExp(pattern.replace('*', '.*').replace(/\./g, '\\.'), 'i');
        return regex.test(fileName);
    });
    
    return shouldRender;
}

function parseKanbanFromMarkdown(content, settings) {
    // Handle undefined or null content
    if (!content || typeof content !== 'string') {
        console.warn('[Kanban] Content is undefined or not a string:', content);
        return {
            columns: getKanbanColumns(settings),
            tasks: [],
            tasksByColumn: {}
        };
    }
    
    const kanbanSettings = getKanbanSettings(settings);
    const columns = getKanbanColumns(settings);
    const groupingEnabled = isKanbanGroupingEnabled(settings);
    const groupSize = getKanbanGroupSize(settings);
    const tasks = [];
    const lines = content.split('\n');
    const headingStack = [];
    
    for (let i = 0; i < lines.length; i++) {
        const heading = matchMarkdownHeading(lines[i]);
        if (heading) {
            updateHeadingStack(headingStack, heading, i);
            continue;
        }

        const taskMatch = matchKanbanListItem(lines[i]);
        if (!taskMatch) continue;

        const { textLines, endLineNumber } = collectKanbanTaskBlock(lines, i, taskMatch);
        const taskText = textLines.join('\n').trim();
        if (!taskText) continue;

        const checkboxStatus = extractTaskListCheckbox(textLines[0]);
        let taskStatus = checkboxStatus.status;
        if (taskStatus) {
            textLines[0] = checkboxStatus.cleanText;
        } else {
            const markerStatus = extractKanbanTaskStatus(checkboxStatus.cleanText, kanbanSettings);
            taskStatus = markerStatus.status;
            textLines[0] = markerStatus.cleanText;
        }
        const cleanText = textLines.join('\n').trim();
        const group = getCurrentTaskGroup(headingStack);

        tasks.push({
            id: `task-${i}`,
            number: taskMatch.isOrdered ? taskMatch.marker : '',
            marker: taskMatch.marker,
            text: cleanText,
            originalText: taskText,
            status: taskStatus,
            lineNumber: i,
            endLineNumber,
            groupId: group.id,
            groupName: group.name,
            groupLineNumber: group.lineNumber,
            groupDepth: group.depth
        });

        i = endLineNumber;
    }
    
    // Group tasks by status
    const tasksByColumn = {};
    columns.forEach(column => {
        tasksByColumn[column.id] = tasks.filter(task => task.status === column.id);
    });
    const groupsByColumn = groupingEnabled
        ? buildKanbanGroupsByColumn(columns, tasksByColumn, groupSize)
        : {};
    
    return { columns, tasks, tasksByColumn, groupsByColumn, groupingEnabled, groupSize };
}

function renderKanbanBoard(parsedKanban, filePath) {
    const { columns, tasksByColumn, groupsByColumn, groupingEnabled } = parsedKanban;
    const totalTasks = parsedKanban.tasks?.length || 0;
    
    let boardHtml = '<div class="kanban-board" data-file-path="' + escapeAttr(filePath) + '">';
    
    columns.forEach(column => {
        const tasks = tasksByColumn[column.id] || [];
        
        boardHtml += `
            <div class="kanban-column" data-column-id="${escapeAttr(column.id)}" style="--kanban-column-accent: ${escapeAttr(column.color)}">
                <div class="kanban-column-header">${escapeHtml(column.name)} (${tasks.length})</div>
                <div class="kanban-tasks" data-column="${escapeAttr(column.id)}">
        `;
        
        if (groupingEnabled) {
            const groups = groupsByColumn?.[column.id] || groupTasksForColumn(tasks, parsedKanban.groupSize || DEFAULT_KANBAN_GROUP_SIZE);
            boardHtml += groups.map(group => renderKanbanTaskGroup(group, totalTasks, groups.length)).join('');
        } else {
            tasks.forEach(task => {
                boardHtml += renderKanbanTaskMarkup(task);
            });
        }
        
        boardHtml += `
                    <div class="kanban-add-task">
                        <button class="add-task-btn" data-column="${escapeAttr(column.id)}">+ Add Task</button>
                    </div>
                </div>
            </div>
        `;
    });
    
    boardHtml += '</div>';
    
    // Dispatch board rendered event for gamification
    setTimeout(() => {
        document.dispatchEvent(new CustomEvent('kanbanBoardRendered', { 
            detail: { columns, tasksByColumn, filePath }
        }));
    }, 100);
    
    return boardHtml;
}

// Intelligent update function that preserves layout and only updates what changed
// Reset kanban state when switching files
function resetKanbanState() {
    currentKanbanState = null;
    currentKanbanFilePath = null;
}

function updateKanbanBoard(container, parsedKanban, filePath) {
    const { columns, tasks, tasksByColumn } = parsedKanban;
    
    // Store current state for comparison
    const newState = JSON.stringify({
        tasks: tasks.map(t => ({
            id: t.id,
            text: t.text,
            status: t.status,
            endLineNumber: t.endLineNumber,
            groupId: t.groupId,
            groupName: t.groupName
        }))
    });
    
    // If file has changed, force refresh regardless of content
    const fileChanged = currentKanbanFilePath !== filePath;
    if (fileChanged) {
        console.log('[Kanban] File changed, forcing kanban refresh:', currentKanbanFilePath, '->', filePath);
        currentKanbanFilePath = filePath;
        currentKanbanState = null; // Force refresh
    }
    
    // If nothing changed and same file, don't update
    if (currentKanbanState === newState && !fileChanged) {
        return false;
    }
    
    currentKanbanState = newState;
    
    // Get existing board or create new one
    let kanbanBoard = container.querySelector('.kanban-board');
    
    if (!kanbanBoard) {
        // First render - use full render
        const kanbanHtml = renderKanbanBoard(parsedKanban, filePath);
        container.innerHTML = kanbanHtml;
        return true;
    }

    if (parsedKanban.groupingEnabled) {
        const kanbanHtml = renderKanbanBoard(parsedKanban, filePath);
        container.innerHTML = kanbanHtml;
        return true;
    }
    
    // Update existing board intelligently
    columns.forEach(column => {
        const columnTasks = tasksByColumn[column.id] || [];
        const columnElement = kanbanBoard.querySelector(`[data-column-id="${column.id}"]`);
        
        if (!columnElement) {
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
                taskElement = createKanbanTaskElement(task);
                
                // Add drag event listeners for new tasks
                taskElement.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', task.id);
                    taskElement.classList.add('dragging');
                });
                
                taskElement.addEventListener('dragend', (e) => {
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
                
                updateKanbanTaskNumber(numberEl, taskElement, task);
                if (textEl && textEl.dataset.markdown !== task.text) {
                    renderKanbanTaskText(textEl, task);
                }
                
                // Update attributes
                setTaskLineAttributes(taskElement, task);
                
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
            addTaskContainer.innerHTML = `<button class="add-task-btn" data-column="${escapeAttr(column.id)}">+ Add Task</button>`;
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
    const kanbanBoard = container.querySelector('.kanban-board');
    if (!kanbanBoard) {
        return;
    }
    
    // Clear any existing drag setup and always set it up fresh
    kanbanBoard.removeAttribute('data-drag-setup');
    
    // Setup drag events for each task individually
    const tasks = kanbanBoard.querySelectorAll('.kanban-task');
    
    tasks.forEach((task, index) => {
        // Ensure draggable attribute is set
        task.setAttribute('draggable', 'true');
        
        task.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', task.dataset.taskId);
            task.classList.add('dragging');
        });
        
        task.addEventListener('dragend', (e) => {
            task.classList.remove('dragging');
        });
    });
    
    // Setup drop events for columns  
    const columns = container.querySelectorAll('.kanban-tasks');
    
    // Setup drop events for columns
    columns.forEach((column, index) => {
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
                    }
                    
                    await updateKanbanTaskInFile(filePath, task, newColumnId);
                    showNotification('Task moved successfully', 'success');
                    
                    // Dispatch task moved event for gamification
                    const taskData = {
                        text: getTaskMarkdownFromElement(task),
                        id: taskId,
                        from: oldColumnId,
                        to: newColumnId,
                        filePath
                    };
                    
                    if (newColumnId === 'done') {
                        document.dispatchEvent(new CustomEvent('kanbanTaskCompleted', { detail: taskData }));
                    } else {
                        document.dispatchEvent(new CustomEvent('kanbanTaskMoved', { detail: taskData }));
                    }
                    
                    // Refresh the editor content if this file is currently open
                    if (currentFilePath === filePath) {
                        await refreshCurrentFile();
                        
                        // Update the lastSavedContent to prevent auto-save conflicts
                        if (editor) {
                            lastSavedContent = editor.getValue();
                            hasUnsavedChanges = false;
                            updateUnsavedIndicator(false);
                        }
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
    
    try {
        // Get current file content
        const result = await window.electronAPI.files.readFile(filePath);
        
        // Check if file read was successful
        if (!result.success) {
            throw new Error(result.error || 'Failed to read file');
        }
        
        const content = result.content || '';
        const lines = content.split('\n');
        const lineNumber = parseInt(taskElement.dataset.lineNumber);
        
        if (lineNumber >= 0 && lineNumber < lines.length) {
            const originalLine = lines[lineNumber];
            
            // Get current settings to determine markers
            const settings = await window.electronAPI.settings.getSettings();
            const kanbanSettings = settings.kanban || {};
            const doneMarkers = kanbanSettings.doneMarkers || DEFAULT_DONE_MARKERS;
            const inProgressMarkers = kanbanSettings.inProgressMarkers || DEFAULT_IN_PROGRESS_MARKERS;
            
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
                newLine = newLine.replace(/\s+$/g, '') + ' - ' + doneMarkers[0];
            } else if (newStatus === 'inprogress') {
                newLine = newLine.replace(/\s+$/g, '') + ' - ' + inProgressMarkers[0];
            }
            
            // Update the line
            lines[lineNumber] = newLine;
            
            // Save the file
            await window.electronAPI.files.writeFile(filePath, lines.join('\n'));
        }
    } catch (error) {
        console.error('[Kanban] Error updating file:', error);
        throw error;
    }
}

// === Kanban Task Action Functions ===

function setupKanbanTaskActions(container, filePath) {
    const kanbanBoard = container.querySelector('.kanban-board');
    if (!kanbanBoard) {
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
    const originalText = getTaskMarkdownFromElement(taskElement).trim();
    
    // Create textarea so multiline task bodies can be edited without flattening them.
    const input = document.createElement('textarea');
    input.value = originalText;
    input.className = 'kanban-task-edit-input';
    input.rows = Math.min(8, Math.max(3, originalText.split(/\r?\n/).length));
    input.style.cssText = 'width: 100%; min-height: 96px; padding: 4px; border: 1px solid #ccc; border-radius: 3px; resize: vertical;';
    
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
                renderKanbanTaskText(textElement, { text: newText });
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
    
    // Save on Cmd/Ctrl+Enter, cancel on Escape. Plain Enter inserts a newline.
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
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
    const taskText = getTaskMarkdownFromElement(taskElement).replace(/\s+/g, ' ').trim();
    
    if (!(await window.showAppConfirm({
        title: 'Delete Task',
        message: `Delete task: "${taskText}"?`,
        detail: 'This removes the task from the source file.',
        paths: [filePath],
        confirmText: 'Delete Task',
        variant: 'danger'
    }))) {
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
    
    let inputRemoved = false;
    
    const saveNewTask = async () => {
        const taskText = input.value.trim();
        if (taskText) {
            try {
                await addTaskToFile(filePath, taskText, columnId);
                showNotification('Task added successfully', 'success');
                
                // Dispatch task created event for gamification
                const taskData = { text: taskText, status: columnId, filePath };
                document.dispatchEvent(new CustomEvent('kanbanTaskAdded', { detail: taskData }));
                
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
                    // Pass editor content if available, otherwise let the function handle it
                    const content = window.editor && window.editor.getValue ? window.editor.getValue() : undefined;
                    window.updatePreviewAndStructure(content);
                }
            } catch (error) {
                console.error('Error adding task:', error);
                showNotification('Error adding task', 'error');
            }
        }
        
        // Remove input safely
        if (!inputRemoved && input.parentNode) {
            input.remove();
            inputRemoved = true;
        }
    };
    
    const cancelNewTask = () => {
        // Remove input safely
        if (!inputRemoved && input.parentNode) {
            input.remove();
            inputRemoved = true;
        }
    };
    
    // Save on Enter, cancel on Escape
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            // Remove blur listener to prevent double removal
            input.removeEventListener('blur', cancelNewTask);
            saveNewTask();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            // Remove blur listener to prevent double removal
            input.removeEventListener('blur', cancelNewTask);
            cancelNewTask();
        }
    });
    
    // Cancel on blur
    input.addEventListener('blur', cancelNewTask);
}

async function updateTaskTextInFile(filePath, taskElement, newText) {
    
    try {
        const result = await window.electronAPI.files.readFile(filePath);
        
        // Check if file read was successful
        if (!result.success) {
            throw new Error(result.error || 'Failed to read file');
        }
        
        const content = result.content || '';
        const lines = content.split('\n');
        const lineNumber = parseInt(taskElement.dataset.lineNumber);
        const endLineNumber = parseInt(taskElement.dataset.endLineNumber || taskElement.dataset.lineNumber);
        
        if (lineNumber >= 0 && lineNumber < lines.length) {
            const originalLine = lines[lineNumber];
            
            // Extract the list marker (1. or - or * etc.)
            const listMatch = matchKanbanListItem(originalLine);
            if (listMatch) {
                const prefix = listMatch.prefix;
                
                // Get current settings to preserve status markers
                const settings = await window.electronAPI.settings.getSettings();
                const kanbanSettings = settings.kanban || {};
                const doneMarkers = kanbanSettings.doneMarkers || DEFAULT_DONE_MARKERS;
                const inProgressMarkers = kanbanSettings.inProgressMarkers || DEFAULT_IN_PROGRESS_MARKERS;
                
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
                
                const newTextLines = String(newText || '').replace(/\r\n/g, '\n').split('\n');
                const continuationPrefix = ' '.repeat(prefix.length);
                const replacementLines = [
                    prefix + (newTextLines[0] || '') + statusMarker,
                    ...newTextLines.slice(1).map(line => line ? continuationPrefix + line : '')
                ];
                
                const boundedEndLineNumber = Number.isFinite(endLineNumber)
                    ? Math.min(Math.max(endLineNumber, lineNumber), lines.length - 1)
                    : lineNumber;
                lines.splice(lineNumber, boundedEndLineNumber - lineNumber + 1, ...replacementLines);
                taskElement.dataset.endLineNumber = String(lineNumber + replacementLines.length - 1);

                await window.electronAPI.files.writeFile(filePath, lines.join('\n'));
            }
        }
    } catch (error) {
        console.error('[Kanban] Error updating task text:', error);
        throw error;
    }
}

async function deleteTaskFromFile(filePath, taskElement) {
    
    try {
        const result = await window.electronAPI.files.readFile(filePath);
        
        // Check if file read was successful
        if (!result.success) {
            throw new Error(result.error || 'Failed to read file');
        }
        
        const content = result.content || '';
        const lines = content.split('\n');
        const lineNumber = parseInt(taskElement.dataset.lineNumber);
        const endLineNumber = parseInt(taskElement.dataset.endLineNumber || taskElement.dataset.lineNumber);
        
        if (lineNumber >= 0 && lineNumber < lines.length) {
            const boundedEndLineNumber = Number.isFinite(endLineNumber)
                ? Math.min(Math.max(endLineNumber, lineNumber), lines.length - 1)
                : lineNumber;
            lines.splice(lineNumber, boundedEndLineNumber - lineNumber + 1);
            
            await window.electronAPI.files.writeFile(filePath, lines.join('\n'));
        }
    } catch (error) {
        console.error('[Kanban] Error deleting task:', error);
        throw error;
    }
}

async function addTaskToFile(filePath, taskText, columnId) {
    
    try {
        const result = await window.electronAPI.files.readFile(filePath);
        
        // Check if file read was successful
        if (!result.success) {
            throw new Error(result.error || 'Failed to read file');
        }
        
        const content = result.content || '';
        const lines = content.split('\n');
        
        // Get settings to determine status markers
        const settings = await window.electronAPI.settings.getSettings();
        const kanbanSettings = settings.kanban || {};
        const doneMarkers = kanbanSettings.doneMarkers || DEFAULT_DONE_MARKERS;
        const inProgressMarkers = kanbanSettings.inProgressMarkers || DEFAULT_IN_PROGRESS_MARKERS;
        
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
        
        await window.electronAPI.files.writeFile(filePath, lines.join('\n'));
    } catch (error) {
        console.error('[Kanban] Error adding task:', error);
        throw error;
    }
}

const kanbanApi = {
    shouldRenderAsKanban,
    parseKanbanFromMarkdown,
    renderKanbanBoard,
    updateKanbanBoard,
    setupKanbanDragAndDrop,
    setupKanbanTaskActions,
    resetKanbanState,
    addTaskToFile,
    updateTaskTextInFile,
    deleteTaskFromFile,
    renderKanbanMarkdown,
    matchKanbanListItem
};

// Make functions available globally
if (typeof window !== 'undefined') {
    Object.assign(window, kanbanApi);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = kanbanApi;
}

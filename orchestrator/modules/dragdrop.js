// Add drag and drop event listeners to file tree.
// Use the fileTreeView already declared in renderer.js.
(function(root) {
    let draggedItem = null;
    let listenersAttached = false;

    function pathBaseName(filePath) {
        return String(filePath || '').replace(/\/+$/, '').split('/').pop() || '';
    }

    function pathDirName(filePath) {
        const normalized = String(filePath || '').replace(/\/+$/, '');
        const index = normalized.lastIndexOf('/');
        return index > 0 ? normalized.slice(0, index) : '';
    }

    function getDragElement(target) {
        if (!target) return null;
        if (target.classList?.contains('file') || target.classList?.contains('folder')) {
            return target;
        }
        return target.closest?.('.file-tree-item.file, .file-tree-item.folder') || null;
    }

    function getSelectedFilePaths(deps = root) {
        if (typeof deps.getSelectedFiles === 'function') {
            return deps.getSelectedFiles().filter(Boolean);
        }
        if (deps.selectedFiles && typeof deps.selectedFiles[Symbol.iterator] === 'function') {
            return Array.from(deps.selectedFiles).filter(Boolean);
        }
        return [];
    }

    function createDraggedItemFromElement(element, deps = root) {
        if (!element?.dataset?.path) return null;

        const isFile = element.classList.contains('file');
        const isFolder = element.classList.contains('folder');
        if (!isFile && !isFolder) return null;

        const itemPath = element.dataset.path;
        const isWorkspaceRoot = element.classList.contains('workspace-folder-root') ||
            element.classList.contains('primary-folder-root');
        const selectedPaths = isFile ? getSelectedFilePaths(deps) : [];
        const paths = isFile && selectedPaths.length > 1 && selectedPaths.includes(itemPath)
            ? selectedPaths
            : [itemPath];

        return {
            element,
            path: itemPath,
            paths,
            type: isFile ? 'file' : 'folder',
            name: pathBaseName(itemPath),
            isWorkspaceRoot,
            isMulti: paths.length > 1,
            items: paths.map(pathValue => ({
                path: pathValue,
                type: 'file',
                name: pathBaseName(pathValue)
            }))
        };
    }

    function clearFolderDropStyles(fileTreeView = root.fileTreeView) {
        if (!fileTreeView?.querySelectorAll) return;
        const allFolders = fileTreeView.querySelectorAll('.folder');
        allFolders.forEach(folder => {
            folder.style.backgroundColor = '';
            folder.style.border = '';
            folder.style.borderTop = '';
        });
    }

    async function reorderWorkspaceFolder(item, targetFolderPath, deps = root) {
        const foldersResult = await deps.electronAPI.invoke('get-workspace-folders');
        const currentFolders = foldersResult.workspaceFolders || [];
        const primaryFolder = foldersResult.primaryFolder;
        const allFolders = [primaryFolder, ...currentFolders];
        const dragIdx = allFolders.indexOf(item.path);
        const dropIdx = allFolders.indexOf(targetFolderPath);

        if (dragIdx === -1 || dropIdx === -1 || dragIdx === dropIdx) {
            return { success: true, changed: false };
        }

        allFolders.splice(dragIdx, 1);
        const newDropIdx = allFolders.indexOf(targetFolderPath);
        allFolders.splice(newDropIdx, 0, item.path);

        const newWorkspaceFolders = allFolders.filter(folderPath => folderPath !== primaryFolder);
        await deps.electronAPI.invoke('reorder-workspace-folders', newWorkspaceFolders);
        if (deps.appSettings) {
            deps.appSettings.workspaceFolders = newWorkspaceFolders;
        }
        return { success: true, changed: true, workspaceFolders: newWorkspaceFolders };
    }

    async function moveDraggedItemsToFolder(item, targetFolderPath, deps = root) {
        const items = item?.isMulti ? item.items : [{
            path: item?.path,
            type: item?.type,
            name: item?.name
        }];

        const summary = {
            moved: 0,
            failed: 0,
            skipped: 0,
            movedItems: [],
            failures: []
        };

        for (const itemToMove of items) {
            if (!itemToMove?.path || !itemToMove?.type) {
                summary.failed++;
                summary.failures.push({ item: itemToMove, error: 'Missing item path or type' });
                continue;
            }

            if (itemToMove.path === targetFolderPath || targetFolderPath.startsWith(itemToMove.path + '/')) {
                summary.failed++;
                summary.failures.push({ item: itemToMove, error: 'Cannot move item into itself or its subdirectory' });
                continue;
            }

            if (pathDirName(itemToMove.path) === targetFolderPath) {
                summary.skipped++;
                continue;
            }

            try {
                const result = await deps.electronAPI.invoke('move-item', {
                    sourcePath: itemToMove.path,
                    targetPath: targetFolderPath,
                    operation: 'cut',
                    type: itemToMove.type
                });

                if (result.success) {
                    const newPath = result.targetPath || result.newPath || `${targetFolderPath}/${itemToMove.name}`;
                    summary.moved++;
                    summary.movedItems.push({ oldPath: itemToMove.path, newPath, type: itemToMove.type });

                    if (deps.currentFilePath === itemToMove.path) {
                        deps.currentFilePath = newPath;
                        if (typeof deps.updateBreadcrumb === 'function') {
                            deps.updateBreadcrumb(newPath);
                        }
                    }
                    if (typeof deps.syncMovedPathWithOpenTabs === 'function') {
                        deps.syncMovedPathWithOpenTabs(itemToMove.path, newPath, itemToMove.type === 'folder');
                    }
                } else {
                    summary.failed++;
                    summary.failures.push({ item: itemToMove, error: result.error || 'Move failed' });
                }
            } catch (error) {
                summary.failed++;
                summary.failures.push({ item: itemToMove, error: error.message || 'Move failed' });
            }
        }

        return summary;
    }

    function notifyMoveSummary(summary, item, targetFolderPath, deps = root) {
        if (item.isMulti) {
            if (summary.moved > 0 && summary.failed === 0) {
                deps.showNotification(`Moved ${summary.moved} files to ${pathBaseName(targetFolderPath)}`, 'success');
            } else if (summary.moved > 0) {
                deps.showNotification(`Moved ${summary.moved} files, ${summary.failed} failed`, 'warning');
            } else if (summary.skipped > 0 && summary.failed === 0) {
                deps.showNotification('Selected files are already in this folder', 'info');
            } else {
                deps.showNotification(summary.failures[0]?.error || 'Error moving selected files', 'error');
            }
            return;
        }

        if (summary.moved === 1) {
            deps.showNotification(`${item.type === 'file' ? 'File' : 'Folder'} moved successfully`, 'success');
        } else if (summary.skipped === 1 && summary.failed === 0) {
            deps.showNotification(`${item.type === 'file' ? 'File' : 'Folder'} is already in this folder`, 'info');
        } else {
            deps.showNotification(summary.failures[0]?.error || 'Error moving item', 'error');
        }
    }

    // Initialize drag and drop when fileTreeView is ready.
    function initializeDragAndDrop(deps = root) {
        const checkDependencies = setInterval(() => {
            if (deps.fileTreeView && deps.renderFileTree && deps.showNotification) {
                clearInterval(checkDependencies);
                setupDragAndDropListeners(deps.fileTreeView, deps);
            }
        }, 100);
        return checkDependencies;
    }

    // Set up all drag and drop event listeners.
    function setupDragAndDropListeners(fileTreeView = root.fileTreeView, deps = root) {
        if (!fileTreeView || listenersAttached) return;
        listenersAttached = true;

        fileTreeView.addEventListener('dragstart', (event) => {
            const target = getDragElement(event.target);
            const item = createDraggedItemFromElement(target, deps);

            if (!item) return;

            draggedItem = item;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', item.paths.join('\n'));
            event.dataTransfer.setData('application/x-nightowl-file-paths', JSON.stringify(item.paths));

            target.style.opacity = '0.5';
            target.style.border = '2px dashed #007bff';
        }, true);

        fileTreeView.addEventListener('dragend', () => {
            if (draggedItem?.element) {
                draggedItem.element.style.opacity = '';
                draggedItem.element.style.border = '';
            }

            setTimeout(() => {
                draggedItem = null;
                clearFolderDropStyles(fileTreeView);
            }, 100);
        }, true);

        fileTreeView.addEventListener('dragover', (event) => {
            const target = getDragElement(event.target);
            const folderTarget = target?.classList?.contains('folder')
                ? target
                : target?.closest?.('.folder');

            if (folderTarget?.dataset?.path && draggedItem) {
                if (draggedItem.isWorkspaceRoot) {
                    const targetIsRoot = folderTarget.classList.contains('workspace-folder-root') ||
                        folderTarget.classList.contains('primary-folder-root');
                    if (!targetIsRoot || folderTarget.dataset.path === draggedItem.path) return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';

                if (draggedItem.isWorkspaceRoot) {
                    folderTarget.style.borderTop = '3px solid #007bff';
                } else {
                    folderTarget.style.backgroundColor = 'var(--hover-color, #e3f2fd)';
                    folderTarget.style.border = '2px solid #007bff';
                }
            }
        }, true);

        fileTreeView.addEventListener('dragleave', (event) => {
            const target = getDragElement(event.target);
            const folderTarget = target?.classList?.contains('folder')
                ? target
                : target?.closest?.('.folder');
            if (folderTarget) {
                folderTarget.style.backgroundColor = '';
                folderTarget.style.border = '';
                folderTarget.style.borderTop = '';
            }
        }, true);

        fileTreeView.addEventListener('drop', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const target = getDragElement(event.target);
            const folderTarget = target?.classList?.contains('folder')
                ? target
                : target?.closest?.('.folder');

            if (!folderTarget?.dataset?.path) return;

            if (!draggedItem?.path || !draggedItem?.type) {
                deps.showNotification('Drag and drop failed - no valid item being dragged', 'error');
                return;
            }

            const targetFolderPath = folderTarget.dataset.path;
            folderTarget.style.backgroundColor = '';
            folderTarget.style.border = '';
            folderTarget.style.borderTop = '';

            if (draggedItem.isWorkspaceRoot) {
                const targetIsRoot = folderTarget.classList.contains('workspace-folder-root') ||
                    folderTarget.classList.contains('primary-folder-root');
                if (targetIsRoot && targetFolderPath !== draggedItem.path) {
                    try {
                        const result = await reorderWorkspaceFolder(draggedItem, targetFolderPath, deps);
                        if (result.changed) {
                            deps.renderFileTree();
                            deps.showNotification('Workspace folders reordered', 'success');
                        }
                    } catch (error) {
                        console.error('[DragDrop] Error reordering workspace folders:', error);
                        deps.showNotification('Error reordering folders', 'error');
                    }
                }
                draggedItem = null;
                return;
            }

            const itemToMove = draggedItem;
            const summary = await moveDraggedItemsToFolder(itemToMove, targetFolderPath, deps);
            if (summary.moved > 0 && typeof deps.renderFileTree === 'function') {
                deps.renderFileTree();
            }
            notifyMoveSummary(summary, itemToMove, targetFolderPath, deps);
            draggedItem = null;
        }, true);
    }

    const api = {
        createDraggedItemFromElement,
        getSelectedFilePaths,
        initializeDragAndDrop,
        moveDraggedItemsToFolder,
        pathBaseName,
        pathDirName,
        setupDragAndDropListeners
    };

    root.NightOwlDragDrop = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (!root.__NIGHTOWL_DISABLE_AUTO_DRAGDROP) {
        initializeDragAndDrop(root);
    }
})(typeof window !== 'undefined' ? window : globalThis);

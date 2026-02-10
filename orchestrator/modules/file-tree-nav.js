// File Tree Keyboard Navigation Module
// Extracted from renderer.js — handles arrow key navigation, Enter to open,
// Home/End for first/last file in the file tree panel.

let currentSelectedFileIndex = -1;
let fileTreeItems = [];

function updateFileTreeItems() {
    const fileTreeView = document.getElementById('file-tree-view');
    if (!fileTreeView) return;

    // Get all file items (not folders)
    fileTreeItems = Array.from(fileTreeView.querySelectorAll('.file-tree-item'))
        .filter(item => item.classList.contains('file') && !item.classList.contains('folder'));

}

function selectFileTreeItem(index) {
    if (!fileTreeItems.length) return;

    // Remove previous selection highlight
    fileTreeItems.forEach(item => item.classList.remove('keyboard-selected'));

    // Ensure index is within bounds
    if (index < 0) index = fileTreeItems.length - 1;
    if (index >= fileTreeItems.length) index = 0;

    currentSelectedFileIndex = index;
    const selectedItem = fileTreeItems[index];

    // Add selection highlight
    selectedItem.classList.add('keyboard-selected');

    // Scroll item into view
    selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

}

function moveFileSelection(direction) {
    updateFileTreeItems(); // Refresh the list in case files changed

    if (!fileTreeItems.length) {
        return;
    }

    let newIndex = currentSelectedFileIndex + direction;
    selectFileTreeItem(newIndex);
}

function openSelectedFile() {
    if (currentSelectedFileIndex >= 0 && currentSelectedFileIndex < fileTreeItems.length) {
        const selectedItem = fileTreeItems[currentSelectedFileIndex];
        // Trigger click on the selected item
        selectedItem.click();
    }
}

function initializeFileTreeNavigation() {

    // Add keyboard event listener
    document.addEventListener('keydown', (e) => {
        // Only handle navigation when file tree is focused or visible
        const fileTreeView = document.getElementById('file-tree-view');
        const leftPane = document.querySelector('.left-pane');

        if (!fileTreeView || !leftPane) return;

        // Check if left pane is visible (not collapsed)
        const leftPaneVisible = !leftPane.style.display || leftPane.style.display !== 'none';

        // Check if user is not typing in an input field
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.contentEditable === 'true' ||
            activeElement.classList.contains('monaco-editor')
        );

        if (!leftPaneVisible || isInputFocused) return;

        // Handle keyboard navigation
        switch(e.key) {
            case 'ArrowUp':
                e.preventDefault();
                moveFileSelection(-1);
                break;

            case 'ArrowDown':
                e.preventDefault();
                moveFileSelection(1);
                break;

            case 'Enter':
                e.preventDefault();
                openSelectedFile();
                break;

            case 'Home':
                e.preventDefault();
                selectFileTreeItem(0);
                break;

            case 'End':
                e.preventDefault();
                selectFileTreeItem(fileTreeItems.length - 1);
                break;
        }
    });

    // Update file list when tree is rendered
    const originalRenderFileTree = window.renderFileTree;
    window.renderFileTree = function(...args) {
        const result = originalRenderFileTree.apply(this, args);
        // Small delay to ensure DOM is updated
        setTimeout(() => {
            updateFileTreeItems();
            // Reset selection
            currentSelectedFileIndex = -1;
        }, 100);
        return result;
    };
}

// Initialize navigation when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeFileTreeNavigation);
} else {
    initializeFileTreeNavigation();
}

// Export to global scope
window.updateFileTreeItems = updateFileTreeItems;
window.selectFileTreeItem = selectFileTreeItem;
window.moveFileSelection = moveFileSelection;
window.openSelectedFile = openSelectedFile;
window.initializeFileTreeNavigation = initializeFileTreeNavigation;

// Save the exact buffers that were inspected before allowing a window to close.
(function () {
    'use strict';

    function unsavedNames(host = window) {
        const names = host.tabManager
            ? [...host.tabManager.tabs.values()].filter(tab => tab.isDirty).map(tab => tab.fileName)
            : (host.hasUnsavedChanges ? ['current file'] : []);
        if (host.tabManager && !host.tabManager.tabs.has(host.tabManager.activeTabPath) && host.hasUnsavedChanges) {
            names.push('current file');
        }
        if (host.splitEditor?.hasUnsavedChanges()) names.push('split editor');
        return names;
    }

    async function saveBeforeClose(host = window) {
        // Startup can have a scratch model before the first tab exists. Let
        // Save As adopt it, outside the queue that saveFile itself acquires.
        if (host.tabManager && !host.tabManager.tabs.has(host.tabManager.activeTabPath) && host.hasUnsavedChanges) {
            const result = await host.saveFile();
            if (!result?.success) return false;
        }
        if (host.tabManager && host.enqueueEditorSave) return host.enqueueEditorSave(() => saveBuffers(host));
        return saveBuffers(host);
    }

    async function saveBuffers(host) {
        const manager = host.tabManager;
        if (manager) {
            for (const [originalPath, tab] of [...manager.tabs]) {
                if (!tab.isDirty) continue;
                const content = tab.model.getValue();
                const untitled = originalPath.startsWith('untitled:');
                const result = untitled
                    ? await host.electronAPI.invoke('perform-save-as', {
                        content,
                        defaultDirectory: host.selectedFolderPath || host.appSettings?.workingDirectory
                    })
                    : await host.electronAPI.invoke('perform-save-with-path', content, originalPath, {
                        expectedContent: tab.lastSavedContent
                    });
                if (untitled) {
                    // The native dialog may update main-process state even when
                    // another tab became active while it was open.
                    await host.electronAPI.invoke('set-current-file', host.currentFilePath || null);
                }
                if (!result?.success || (untitled && !result.filePath)) return false;
                // A tab may have been closed or renamed while the dialog/write was pending.
                if (manager.tabs.get(originalPath) !== tab) return false;
                if (untitled) {
                    if (manager.tabs.has(result.filePath)) return false;
                    manager.rekeyTab(originalPath, result.filePath);
                    if (manager.activeTabPath === result.filePath) manager.activateTab(result.filePath);
                }
                tab.lastSavedContent = content;
                tab.isDirty = tab.model.getValue() !== content;
                if (manager.activeTabPath === tab.filePath) {
                    manager.syncActiveTabDirty(tab.isDirty, content);
                    host._setLastSavedContent?.(content);
                    host.hasUnsavedChanges = tab.isDirty;
                    host.updateUnsavedIndicator?.(tab.isDirty);
                }
            }
            manager._renderTabBar();
            await manager._persistRecovery();
        } else if (host.hasUnsavedChanges) {
            await host.saveFile();
        }
        if (host.splitEditor?.flushPendingSave && !await host.splitEditor.flushPendingSave()) return false;
        // New edits or newly opened dirty tabs keep the window open.
        return unsavedNames(host).length === 0;
    }

    const api = { unsavedNames, saveBeforeClose };
    if (typeof window !== 'undefined') window.NightOwlWindowClose = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

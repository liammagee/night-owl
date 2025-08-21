// Refactored menu creation functions
const { app, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;

function createFileMenu() {
    return {
        label: 'File',
        submenu: [
            createNewFileMenuItem(),
            createOpenFileMenuItem(),
            createOpenFolderMenuItem(),
            createSaveMenuItem(),
            createSaveAsMenuItem(),
            { type: 'separator' },
            createExportSubmenu(),
            { type: 'separator' },
            createPrintMenuItem(),
            { type: 'separator' },
            createRecentFilesSubmenu(),
            createRecentWorkspacesSubmenu(),
            { type: 'separator' },
            createQuitMenuItem()
        ]
    };
}

function createNewFileMenuItem() {
    return {
        label: 'New File',
        accelerator: 'CmdOrCtrl+N',
        click: async () => {
            if (!mainWindow) return;
            console.log('[main.js] New File menu item clicked.');
            currentFilePath = null;
            mainWindow.setTitle('Hegel Pedagogy AI - Untitled');
            mainWindow.webContents.send('new-file-created');
            console.log('[main.js] Sent new-file-created signal to renderer.');
        }
    };
}

function createOpenFileMenuItem() {
    return {
        label: 'Open File...',
        accelerator: 'CmdOrCtrl+O',
        click: async () => {
            if (!mainWindow) return;
            console.log('[main.js] Open File menu item clicked.');
            const result = await openFile();
            if (result && result.filePath && mainWindow) {
                console.log(`[main.js] File opened via menu: ${result.filePath}`);
            } else {
                console.log('[main.js] Open File dialog cancelled or failed.');
            }
        }
    };
}

function createOpenFolderMenuItem() {
    return {
        label: 'Open Folder...',
        accelerator: 'CmdOrCtrl+Shift+O',
        click: async () => {
            if (!mainWindow) return;
            console.log('[main.js] Open Folder menu item clicked.');
            const result = await dialog.showOpenDialog(mainWindow, {
                properties: ['openDirectory'],
                title: 'Select Working Directory'
            });
            
            if (!result.canceled && result.filePaths.length > 0) {
                const folderPath = result.filePaths[0];
                console.log(`[main.js] User selected folder: ${folderPath}`);
                currentWorkingDirectory = folderPath;
                appSettings.workingDirectory = folderPath;
                addToRecentWorkspaces(folderPath);
                currentFilePath = null;
                mainWindow.setTitle('Hegel Pedagogy AI - Untitled');
                mainWindow.webContents.send('refresh-file-tree');
                console.log('[main.js] Sent refresh-file-tree signal to renderer.');
            }
        }
    };
}

function createSaveMenuItem() {
    return {
        label: 'Save',
        accelerator: 'CmdOrCtrl+S',
        click: async () => {
            if (!mainWindow) return;
            console.log('[main.js] Save menu item clicked.');
            mainWindow.webContents.send('perform-save');
        }
    };
}

function createSaveAsMenuItem() {
    return {
        label: 'Save As...',
        accelerator: 'CmdOrCtrl+Shift+S',
        click: async () => {
            if (!mainWindow) return;
            console.log('[main.js] Save As menu item clicked.');
            mainWindow.webContents.send('perform-save-as');
        }
    };
}

function createExportSubmenu() {
    return {
        label: 'Export',
        submenu: [
            {
                label: 'Export as PDF...',
                accelerator: 'CmdOrCtrl+Shift+E',
                click: async () => {
                    if (!mainWindow) return;
                    console.log('[main.js] Export PDF menu item clicked.');
                    mainWindow.webContents.send('export-pdf');
                }
            },
            {
                label: 'Export as HTML...',
                accelerator: 'CmdOrCtrl+Alt+H',
                click: async () => {
                    if (!mainWindow) return;
                    console.log('[main.js] Export HTML menu item clicked.');
                    mainWindow.webContents.send('export-html');
                }
            },
            {
                label: 'Export as Accessible HTML...',
                click: async () => {
                    if (!mainWindow) return;
                    console.log('[main.js] Export Accessible HTML menu item clicked.');
                    mainWindow.webContents.send('export-accessible-html');
                }
            }
        ]
    };
}

function createPrintMenuItem() {
    return {
        label: 'Print...',
        accelerator: 'CmdOrCtrl+P',
        click: async () => {
            if (!mainWindow) return;
            console.log('[main.js] Print menu item clicked.');
            mainWindow.webContents.print({
                silent: false,
                printBackground: true,
                margins: {
                    marginType: 'default'
                }
            });
        }
    };
}

function createRecentFilesSubmenu() {
    const recentFilesMenu = getRecentFiles().map(file => ({
        label: path.basename(file),
        click: async () => {
            if (!mainWindow) return;
            try {
                const content = await fs.readFile(file, 'utf8');
                currentFilePath = file;
                appSettings.currentFile = file;
                saveSettings();
                mainWindow.setTitle(`Hegel Pedagogy AI - ${path.basename(file)}`);
                mainWindow.webContents.send('file-opened', { 
                    filePath: file, 
                    content: content 
                });
                addToRecentFiles(file);
            } catch (error) {
                console.error(`[main.js] Error opening recent file ${file}:`, error);
                removeFromRecentFiles(file);
            }
        }
    }));

    if (recentFilesMenu.length === 0) {
        recentFilesMenu.push({ label: 'No recent files', enabled: false });
    }

    return {
        label: 'Recent Files',
        submenu: recentFilesMenu
    };
}

function createRecentWorkspacesSubmenu() {
    const recentWorkspacesMenu = getRecentWorkspaces().map(workspace => ({
        label: path.basename(workspace) || workspace,
        click: async () => {
            if (!mainWindow) return;
            currentWorkingDirectory = workspace;
            appSettings.workingDirectory = workspace;
            saveSettings();
            mainWindow.webContents.send('refresh-file-tree');
            addToRecentWorkspaces(workspace);
        }
    }));

    if (recentWorkspacesMenu.length === 0) {
        recentWorkspacesMenu.push({ label: 'No recent workspaces', enabled: false });
    }

    return {
        label: 'Recent Workspaces',
        submenu: recentWorkspacesMenu
    };
}

function createQuitMenuItem() {
    return {
        label: process.platform === 'darwin' ? 'Quit' : 'Exit',
        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
        click: () => {
            app.quit();
        }
    };
}

function createEditMenu() {
    return {
        label: 'Edit',
        submenu: [
            { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
            { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
            { type: 'separator' },
            { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
            { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
            { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
            { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
            { type: 'separator' },
            createFindMenuItem(),
            createReplaceMenuItem(),
            { type: 'separator' },
            createSettingsMenuItem()
        ]
    };
}

function createFindMenuItem() {
    return {
        label: 'Find...',
        accelerator: 'CmdOrCtrl+F',
        click: () => {
            if (!mainWindow) return;
            mainWindow.webContents.send('trigger-find');
        }
    };
}

function createReplaceMenuItem() {
    return {
        label: 'Replace...',
        accelerator: 'CmdOrCtrl+H',
        click: () => {
            if (!mainWindow) return;
            mainWindow.webContents.send('trigger-replace');
        }
    };
}

function createSettingsMenuItem() {
    return {
        label: 'Settings...',
        accelerator: 'CmdOrCtrl+,',
        click: () => {
            if (!mainWindow) return;
            mainWindow.webContents.send('open-settings');
        }
    };
}

function createViewMenu() {
    return {
        label: 'View',
        submenu: [
            createViewModeSubmenu(),
            { type: 'separator' },
            createPresentationControlsSubmenu(),
            { type: 'separator' },
            createZoomControlsSubmenu(),
            { type: 'separator' },
            createTogglePanesSubmenu(),
            { type: 'separator' },
            createThemeSubmenu(),
            createDevToolsMenuItem()
        ]
    };
}

function createViewModeSubmenu() {
    return {
        label: 'Mode',
        submenu: [
            {
                label: 'Editor',
                accelerator: 'CmdOrCtrl+1',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('switch-to-editor');
                }
            },
            {
                label: 'Presentation',
                accelerator: 'CmdOrCtrl+2',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('switch-to-presentation');
                }
            },
            {
                label: 'Network',
                accelerator: 'CmdOrCtrl+3',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('switch-to-network');
                }
            }
        ]
    };
}

function createPresentationControlsSubmenu() {
    return {
        label: 'Presentation',
        submenu: [
            {
                label: 'Start Presentation',
                accelerator: 'F5',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('start-presentation');
                }
            },
            {
                label: 'Exit Presentation',
                accelerator: 'Escape',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('exit-presentation');
                }
            },
            { type: 'separator' },
            {
                label: 'Next Slide',
                accelerator: 'Right',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('next-slide');
                }
            },
            {
                label: 'Previous Slide',
                accelerator: 'Left',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('previous-slide');
                }
            }
        ]
    };
}

function createZoomControlsSubmenu() {
    return {
        label: 'Zoom',
        submenu: [
            {
                label: 'Zoom In',
                accelerator: 'CmdOrCtrl+Plus',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('zoom-in');
                }
            },
            {
                label: 'Zoom Out',
                accelerator: 'CmdOrCtrl+-',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('zoom-out');
                }
            },
            {
                label: 'Reset Zoom',
                accelerator: 'CmdOrCtrl+0',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('reset-zoom');
                }
            }
        ]
    };
}

function createTogglePanesSubmenu() {
    return {
        label: 'Toggle',
        submenu: [
            {
                label: 'Toggle Preview',
                accelerator: 'CmdOrCtrl+Shift+V',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('toggle-preview');
                }
            },
            {
                label: 'Toggle Sidebar',
                accelerator: 'CmdOrCtrl+B',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('toggle-sidebar');
                }
            },
            {
                label: 'Toggle Full Screen',
                accelerator: process.platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.setFullScreen(!mainWindow.isFullScreen());
                }
            }
        ]
    };
}

function createThemeSubmenu() {
    return {
        label: 'Theme',
        submenu: [
            {
                label: 'Light',
                type: 'radio',
                checked: appSettings.theme === 'light',
                click: () => {
                    appSettings.theme = 'light';
                    saveSettings();
                    if (mainWindow) {
                        mainWindow.webContents.send('theme-changed', 'light');
                    }
                }
            },
            {
                label: 'Dark',
                type: 'radio',
                checked: appSettings.theme === 'dark',
                click: () => {
                    appSettings.theme = 'dark';
                    saveSettings();
                    if (mainWindow) {
                        mainWindow.webContents.send('theme-changed', 'dark');
                    }
                }
            }
        ]
    };
}

function createDevToolsMenuItem() {
    return {
        label: 'Toggle Developer Tools',
        accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
        click: () => {
            if (!mainWindow) return;
            mainWindow.webContents.toggleDevTools();
        }
    };
}

function createFormatMenu() {
    return {
        label: 'Format',
        submenu: [
            createTextFormattingSubmenu(),
            { type: 'separator' },
            createHeadingSubmenu(),
            { type: 'separator' },
            createListSubmenu(),
            { type: 'separator' },
            createInsertSubmenu()
        ]
    };
}

function createTextFormattingSubmenu() {
    return {
        label: 'Text',
        submenu: [
            {
                label: 'Bold',
                accelerator: 'CmdOrCtrl+B',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('format-bold');
                }
            },
            {
                label: 'Italic',
                accelerator: 'CmdOrCtrl+I',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('format-italic');
                }
            },
            {
                label: 'Strikethrough',
                accelerator: 'CmdOrCtrl+Shift+X',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('format-strikethrough');
                }
            }
        ]
    };
}

function createHeadingSubmenu() {
    return {
        label: 'Heading',
        submenu: [1, 2, 3, 4, 5, 6].map(level => ({
            label: `Heading ${level}`,
            accelerator: `CmdOrCtrl+${level}`,
            click: () => {
                if (!mainWindow) return;
                mainWindow.webContents.send('format-heading', level);
            }
        }))
    };
}

function createListSubmenu() {
    return {
        label: 'List',
        submenu: [
            {
                label: 'Bullet List',
                accelerator: 'CmdOrCtrl+Shift+8',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('format-bullet-list');
                }
            },
            {
                label: 'Numbered List',
                accelerator: 'CmdOrCtrl+Shift+7',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('format-numbered-list');
                }
            },
            {
                label: 'Todo List',
                accelerator: 'CmdOrCtrl+Shift+9',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('format-todo-list');
                }
            }
        ]
    };
}

function createInsertSubmenu() {
    return {
        label: 'Insert',
        submenu: [
            {
                label: 'Link',
                accelerator: 'CmdOrCtrl+K',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('insert-link');
                }
            },
            {
                label: 'Image',
                accelerator: 'CmdOrCtrl+Shift+I',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('insert-image');
                }
            },
            {
                label: 'Code Block',
                accelerator: 'CmdOrCtrl+Shift+C',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('insert-code-block');
                }
            },
            {
                label: 'Horizontal Rule',
                accelerator: 'CmdOrCtrl+Shift+H',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('insert-horizontal-rule');
                }
            }
        ]
    };
}

function createAIMenu() {
    return {
        label: 'AI',
        submenu: [
            {
                label: 'AI Chat',
                accelerator: 'CmdOrCtrl+Shift+A',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('toggle-ai-chat');
                }
            },
            {
                label: 'Summarize Selection',
                accelerator: 'CmdOrCtrl+Shift+S',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('ai-summarize');
                }
            },
            {
                label: 'Expand Selection',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('ai-expand');
                }
            },
            {
                label: 'Improve Writing',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('ai-improve');
                }
            },
            { type: 'separator' },
            {
                label: 'AI Settings...',
                click: () => {
                    if (!mainWindow) return;
                    mainWindow.webContents.send('open-ai-settings');
                }
            }
        ]
    };
}

function createWindowMenu() {
    return {
        label: 'Window',
        submenu: [
            { label: 'Minimize', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
            { label: 'Close', accelerator: 'CmdOrCtrl+W', role: 'close' },
            ...(process.platform === 'darwin' ? [
                { type: 'separator' },
                { label: 'Bring All to Front', role: 'front' }
            ] : [])
        ]
    };
}

function createHelpMenu() {
    return {
        label: 'Help',
        submenu: [
            {
                label: 'Documentation',
                click: async () => {
                    await shell.openExternal('https://github.com/yourusername/hegel-pedagogy-ai/wiki');
                }
            },
            {
                label: 'Report Issue',
                click: async () => {
                    await shell.openExternal('https://github.com/yourusername/hegel-pedagogy-ai/issues');
                }
            },
            { type: 'separator' },
            {
                label: 'About',
                click: () => {
                    if (!mainWindow) return;
                    dialog.showMessageBox(mainWindow, {
                        type: 'info',
                        title: 'About Hegel Pedagogy AI',
                        message: 'Hegel Pedagogy AI',
                        detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}`,
                        buttons: ['OK']
                    });
                }
            }
        ]
    };
}

// Main refactored function
function createMainMenu(context) {
    const {
        mainWindow,
        currentFilePath,
        currentWorkingDirectory,
        appSettings,
        saveSettings,
        openFile,
        addToRecentFiles,
        removeFromRecentFiles,
        getRecentFiles,
        addToRecentWorkspaces,
        getRecentWorkspaces
    } = context;

    const template = [
        createFileMenu(context),
        createEditMenu(context),
        createViewMenu(context),
        createFormatMenu(context),
        createAIMenu(context),
        createWindowMenu(context),
        createHelpMenu(context)
    ];

    // macOS specific adjustments
    if (process.platform === 'darwin') {
        // Add app menu for macOS
        template.unshift({
            label: app.getName(),
            submenu: [
                { label: 'About ' + app.getName(), role: 'about' },
                { type: 'separator' },
                { label: 'Services', role: 'services', submenu: [] },
                { type: 'separator' },
                { label: 'Hide ' + app.getName(), accelerator: 'Command+H', role: 'hide' },
                { label: 'Hide Others', accelerator: 'Command+Shift+H', role: 'hideothers' },
                { label: 'Show All', role: 'unhide' },
                { type: 'separator' },
                { label: 'Quit', accelerator: 'Command+Q', click: () => app.quit() }
            ]
        });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

module.exports = {
    createMainMenu,
    // Export individual menu creators for testing/reuse
    createFileMenu,
    createEditMenu,
    createViewMenu,
    createFormatMenu,
    createAIMenu,
    createWindowMenu,
    createHelpMenu
};
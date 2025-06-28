// main.js - Merged Hegel Pedagogy AI Application
console.log('--- main.js execution START ---');
require('dotenv').config(); // Load .env file
const { app, BrowserWindow, ipcMain, dialog, nativeTheme, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { OpenAI } = require('openai');
require('@electron/remote/main').initialize();

// --- OpenAI Client Initialization ---
let openai;
try {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[main.js] WARNING: OPENAI_API_KEY not found in .env file. AI Chat feature will be disabled.');
  } else {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log('[main.js] OpenAI client initialized.');
  }
} catch (error) {
    console.error('[main.js] Error initializing OpenAI client:', error);
}

// --- Global Variables ---
let mainWindow = null;
let currentFilePath = null;
let currentWorkingDirectory = app.getAppPath();

// --- Persistent Settings Storage ---
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
let appSettings = {};

// Default settings structure
const defaultSettings = {
    theme: 'light',
    layout: {
        structureWidth: '18%',
        editorWidth: '45%',
        rightWidth: '37%'
    },
    workingDirectory: app.getPath('documents'),
    currentFile: '',
    presentationMode: false,
    presentationLayout: 'spiral'
};

// Load settings from disk
function loadSettings() {
    try {
        const fsSync = require('fs');
        if (fsSync.existsSync(SETTINGS_FILE)) {
            const raw = fsSync.readFileSync(SETTINGS_FILE, 'utf-8');
            const loadedSettings = JSON.parse(raw);
            appSettings = loadedSettings;
            appSettings = { ...defaultSettings, ...appSettings };
            if (loadedSettings.layout) {
                appSettings.layout = { ...defaultSettings.layout, ...loadedSettings.layout };
            }
            console.log('[main.js] Loaded settings:', appSettings);
        } else {
            console.log('[main.js] No settings file found, using defaults.');
            appSettings = defaultSettings;
        }
    } catch (err) {
        console.error('[main.js] Failed to load settings:', err);
    }
}

// Save settings to disk
function saveSettings() {
    try {
        const fsSync = require('fs');
        fsSync.writeFileSync(SETTINGS_FILE, JSON.stringify(appSettings, null, 2));
        console.log('[main.js] Saved settings:', appSettings);
    } catch (err) {
        console.error('[main.js] Failed to save settings:', err);
    }
}

// Load settings before app ready
loadSettings();

// Save settings on shutdown
app.on('before-quit', saveSettings);

// --- Theme Handling ---
nativeTheme.on('updated', () => {
    console.log(`[main.js] nativeTheme updated. Should use dark colors: ${nativeTheme.shouldUseDarkColors}`);
    mainWindow?.webContents.send('theme-updated', nativeTheme.shouldUseDarkColors);
});

// --- Window Creation ---
function createWindow() {
  console.log('[main.js] Creating main window...');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
    },
    title: 'Hegel Pedagogy AI - Advanced Editor & Presentations',
    titleBarStyle: 'hidden',
    show: false
  });

  // Enable @electron/remote for this window
  require("@electron/remote/main").enable(mainWindow.webContents);

  // Load the index.html of the app.
  const indexPath = path.join(__dirname, 'index.html');
  console.log(`[main.js] Loading URL: ${indexPath}`);
  mainWindow.loadFile(indexPath);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    if (process.argv.includes('--dev')) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Set up application menu
  const menu = Menu.buildFromTemplate(createMainMenu());
  Menu.setApplicationMenu(menu);

  // Suppress common Chrome DevTools console errors
  mainWindow.webContents.on('console-message', (_, level, message) => {
    if (message.includes('Autofill.enable') || message.includes('Autofill.setAddresses')) {
      return;
    }
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    console.log('[main.js] Main window closed.');
    mainWindow = null;
  });

  // Send initial theme to renderer once DOM is ready
  mainWindow.webContents.on('did-finish-load', () => {
      const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
      console.log(`[main.js] Window finished loading. Sending initial theme: ${theme}`);
      mainWindow.webContents.send('theme-changed', theme);
      mainWindow.webContents.send('refresh-file-tree');
      console.log('[main.js] Sent refresh-file-tree signal to renderer.');
  });

  // Save settings explicitly when the window is about to close
  mainWindow.on('close', () => {
    console.log('[main.js] Main window closing. Saving final settings.');
    saveSettings();
  });
}

function createMainMenu() {
    const template = [
      {
        label: 'File',
        submenu: [
          {
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
          },
          {
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
          },
          {
            label: 'Open Markdown File (Presentation)',
            accelerator: 'CmdOrCtrl+Shift+O',
            click: async () => {
              if (!mainWindow) return;
              const result = await dialog.showOpenDialog(mainWindow, {
                properties: ['openFile'],
                filters: [
                  { name: 'Markdown Files', extensions: ['md', 'markdown'] },
                  { name: 'All Files', extensions: ['*'] }
                ]
              });

              if (!result.canceled && result.filePaths.length > 0) {
                const filePath = result.filePaths[0];
                try {
                  const content = require('fs').readFileSync(filePath, 'utf-8');
                  mainWindow.webContents.send('load-presentation-file', content, filePath, null);
                } catch (error) {
                  console.error('Error loading file:', error);
                  mainWindow.webContents.send('load-presentation-file', null, filePath, error.message);
                }
              }
            }
          },
          {
            label: 'Open Folder...',
            accelerator: 'CmdOrCtrl+Alt+O',
            click: async () => {
               if (!mainWindow) return;
               console.log('[main.js] Open Folder menu item clicked.');
               try {
                    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
                        properties: ['openDirectory']
                    });
                    if (!canceled && filePaths && filePaths.length > 0) {
                        const folderPath = filePaths[0];
                        console.log(`[main.js] Folder selected: ${folderPath}`);
                        currentWorkingDirectory = folderPath;
                        appSettings.workingDirectory = folderPath;
                        saveSettings();
                        currentFilePath = null;
                        mainWindow.setTitle('Hegel Pedagogy AI - Untitled'); 
                        mainWindow.webContents.send('refresh-file-tree');
                         console.log('[main.js] Sent refresh-file-tree signal to renderer.');
                    } else {
                         console.log('[main.js] Open Folder dialog cancelled.');
                    }
               } catch (err) {
                    console.error('[main.js] Error opening folder:', err);
                    dialog.showErrorBox('Open Folder Error', `Could not open the selected folder: ${err.message}`);
               }
            }
          },
          {
            label: 'Save',
            accelerator: 'CmdOrCtrl+S',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Save menu item clicked. Triggering save in renderer.');
                mainWindow.webContents.send('trigger-save');
              }
            }
          },
          {
            label: 'Save As...',
            accelerator: 'Shift+CmdOrCtrl+S',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Save As menu item clicked. Triggering save-as in renderer.');
                mainWindow.webContents.send('trigger-save-as');
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Exit',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
            click: () => {
              app.quit();
            }
          }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
         label: 'View',
         submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            {
                label: 'Theme',
                submenu: [
                    { label: 'Light', type: 'radio', checked: nativeTheme.themeSource === 'light', click: () => { 
                        console.log('[main.js] Theme menu: Light selected'); 
                        nativeTheme.themeSource = 'light'; 
                        if (mainWindow) { 
                            console.log('[main.js] Sending set-theme: light');
                            mainWindow.webContents.send('set-theme', 'light'); 
                        } 
                    } },
                    { label: 'Dark', type: 'radio', checked: nativeTheme.themeSource === 'dark', click: () => { 
                        console.log('[main.js] Theme menu: Dark selected'); 
                        nativeTheme.themeSource = 'dark'; 
                        if (mainWindow) { 
                            console.log('[main.js] Sending set-theme: dark');
                            mainWindow.webContents.send('set-theme', 'dark'); 
                        } 
                    } },
                    { label: 'System', type: 'radio', checked: nativeTheme.themeSource === 'system', click: () => { 
                        console.log('[main.js] Theme menu: System selected'); 
                        nativeTheme.themeSource = 'system'; 
                        if (mainWindow) { 
                            const sysTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
                            console.log('[main.js] Sending set-theme:', sysTheme);
                            mainWindow.webContents.send('set-theme', sysTheme); 
                        } 
                    } },
                ]
            },
            { type: 'separator' },
            {
                label: 'Editor Mode',
                accelerator: 'CmdOrCtrl+1',
                click: () => {
                    if (mainWindow) {
                        console.log('[main.js] Switching to Editor mode via menu');
                        mainWindow.webContents.send('switch-to-editor');
                    }
                }
            },
            {
                label: 'Presentation Mode',
                accelerator: 'CmdOrCtrl+2',
                click: () => {
                    if (mainWindow) {
                        console.log('[main.js] Switching to Presentation mode via menu');
                        mainWindow.webContents.send('switch-to-presentation');
                    }
                }
            },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
         ]
      },
      {
        label: 'Presentation',
        submenu: [
          {
            label: 'Generate Lecture Summary',
            accelerator: 'CmdOrCtrl+G',
            click: async () => {
              if (mainWindow) {
                console.log('[main.js] Generate Lecture Summary clicked');
                await generateAndLoadLectureSummary();
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Toggle Presentation Mode',
            accelerator: 'CmdOrCtrl+P',
            click: () => {
              if (mainWindow) {
                mainWindow.webContents.send('toggle-presentation-mode');
              }
            }
          },
          {
            label: 'Start Presentation',
            accelerator: 'F5',
            click: () => {
              if (mainWindow) {
                mainWindow.webContents.send('start-presentation');
              }
            }
          },
          {
            label: 'Exit Presentation',
            accelerator: 'Escape',
            click: () => {
              if (mainWindow) {
                mainWindow.webContents.send('exit-presentation');
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Next Slide',
            accelerator: 'Right',
            click: () => {
              if (mainWindow) {
                mainWindow.webContents.send('next-slide');
              }
            }
          },
          {
            label: 'Previous Slide',
            accelerator: 'Left',
            click: () => {
              if (mainWindow) {
                mainWindow.webContents.send('previous-slide');
              }
            }
          },
          {
            label: 'First Slide',
            accelerator: 'Home',
            click: () => {
              if (mainWindow) {
                mainWindow.webContents.send('first-slide');
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Layout',
            submenu: [
              {
                label: 'Spiral',
                type: 'radio',
                checked: appSettings.presentationLayout === 'spiral',
                click: () => {
                  appSettings.presentationLayout = 'spiral';
                  saveSettings();
                  mainWindow?.webContents.send('change-layout', 'spiral');
                }
              },
              {
                label: 'Linear',
                type: 'radio',
                checked: appSettings.presentationLayout === 'linear',
                click: () => {
                  appSettings.presentationLayout = 'linear';
                  saveSettings();
                  mainWindow?.webContents.send('change-layout', 'linear');
                }
              },
              {
                label: 'Grid',
                type: 'radio',
                checked: appSettings.presentationLayout === 'grid',
                click: () => {
                  appSettings.presentationLayout = 'grid';
                  saveSettings();
                  mainWindow?.webContents.send('change-layout', 'grid');
                }
              },
              {
                label: 'Circle',
                type: 'radio',
                checked: appSettings.presentationLayout === 'circle',
                click: () => {
                  appSettings.presentationLayout = 'circle';
                  saveSettings();
                  mainWindow?.webContents.send('change-layout', 'circle');
                }
              },
              {
                label: 'Tree',
                type: 'radio',
                checked: appSettings.presentationLayout === 'tree',
                click: () => {
                  appSettings.presentationLayout = 'tree';
                  saveSettings();
                  mainWindow?.webContents.send('change-layout', 'tree');
                }
              },
              {
                label: 'Zigzag',
                type: 'radio',
                checked: appSettings.presentationLayout === 'zigzag',
                click: () => {
                  appSettings.presentationLayout = 'zigzag';
                  saveSettings();
                  mainWindow?.webContents.send('change-layout', 'zigzag');
                }
              }
            ]
          }
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'About Hegel Pedagogy AI',
            click: () => {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'About Hegel Pedagogy AI',
                message: 'Hegel Pedagogy AI',
                detail: 'Advanced Markdown editor and presentation platform for exploring Hegelian philosophy and AI pedagogy.\n\nVersion 1.0.0'
              });
            }
          },
          {
            label: 'Keyboard Shortcuts',
            click: () => {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Keyboard Shortcuts',
                message: 'Keyboard Shortcuts',
                detail: `
Editor:
• Cmd/Ctrl+N: New file
• Cmd/Ctrl+O: Open file
• Cmd/Ctrl+S: Save
• Cmd/Ctrl+Shift+S: Save As

Presentation:
• Cmd/Ctrl+P: Toggle presentation mode
• F5: Start presentation
• Escape: Exit presentation
• Arrow Keys: Navigate slides
• Home: Go to first slide

View:
• Cmd/Ctrl+Plus: Zoom in
• Cmd/Ctrl+Minus: Zoom out
• Cmd/Ctrl+0: Reset zoom
• F11: Toggle fullscreen
                `.trim()
              });
            }
          }
        ]
      }
    ];

    // Add macOS specific menu items
    if (process.platform === 'darwin') {
      template.unshift({ 
        label: app.getName(), 
        submenu: [
          { role: 'about' }, 
          { type: 'separator' }, 
          { role: 'services' }, 
          { type: 'separator' }, 
          { role: 'hide' }, 
          { role: 'hideOthers' }, 
          { role: 'unhide' }, 
          { type: 'separator' }, 
          { role: 'quit' }
        ] 
      });
      // Edit menu
      template[2].submenu.push({ type: 'separator' }, { label: 'Speech', submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }] });
    }
    return template;
}

// File management functions
async function getFiles(dir) {
    let results = [];
    const list = await fs.readdir(dir, { withFileTypes: true });
    for (const dirent of list) {
        const res = path.resolve(dir, dirent.name);
        if (dirent.isDirectory()) {
            if (dirent.name !== 'node_modules' && !dirent.name.startsWith('.')) {
                 results.push({ path: res, type: 'folder' });
            }
        } else {
            if (res.endsWith('.md') || res.endsWith('.markdown')) {
                results.push({ path: res, type: 'file' });
            }
        }
    }
    return results;
}

function buildFileTree(basePath, files) {
    const tree = { name: path.basename(basePath), path: basePath, type: 'folder', children: [] };
    files.forEach(file => {
        const relativePath = path.relative(basePath, file.path);
        const parts = relativePath.split(path.sep);
        let currentLevel = tree.children;
        let currentPath = basePath;

        parts.forEach((part, index) => {
            currentPath = path.join(currentPath, part);
            let existingNode = currentLevel.find(node => node.name === part);

            if (!existingNode) {
                const isLastPart = index === parts.length - 1;
                const nodeType = isLastPart && file.type === 'file' ? 'file' : 'folder';
                existingNode = {
                    name: part,
                    path: currentPath,
                    type: nodeType,
                    children: nodeType === 'folder' ? [] : undefined
                };
                currentLevel.push(existingNode);
                 currentLevel.sort((a, b) => {
                     if (a.type === b.type) {
                         return a.name.localeCompare(b.name);
                     }
                     return a.type === 'folder' ? -1 : 1;
                 });
            }

            if (existingNode.type === 'folder') {
                currentLevel = existingNode.children;
            }
        });
    });
    return tree;
}

async function saveFile(filePath, content) {
    try {
        await fs.writeFile(filePath, content, 'utf8');
        console.log(`[main.js] Content successfully saved to ${filePath}`);
        currentFilePath = filePath;
        if (mainWindow) {
            mainWindow.setTitle(`Hegel Pedagogy AI - ${path.basename(filePath)}`);
        }
        return { success: true, filePath: filePath };
    } catch (err) {
        console.error(`[main.js] Error saving file to ${filePath}:`, err);
        dialog.showErrorBox('Save Error', `Failed to save the file: ${err.message}`);
        return { success: false, error: err.message };
    }
}

async function performSaveAs(content) {
     if (!mainWindow) {
          console.error('[main.js] Cannot show Save As dialog, mainWindow is not available.');
          return { success: false, error: 'Main window not found.' };
     }
     try {
         const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Save Markdown File As',
            defaultPath: currentFilePath || path.join(app.getPath('documents'), 'untitled.md'),
            filters: [
                { name: 'Markdown Files', extensions: ['md', 'markdown'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (canceled || !filePath) {
            console.log('[main.js] Save As dialog was cancelled.');
            return { success: false };
        }

        console.log(`[main.js] User chose path for Save As: ${filePath}`);
        return await saveFile(filePath, content);

    } catch (err) {
        console.error('[main.js] Error during Save As dialog or save operation:', err);
        dialog.showErrorBox('Save As Error', `Failed to save the file: ${err.message}`);
        return { success: false, error: err.message };
    }
}

async function generateAndLoadLectureSummary() {
    try {
        console.log('[main.js] Starting lecture summary generation...');
        
        // Get the current working directory (should be the lectures folder)
        const workingDir = appSettings.workingDirectory || path.join(__dirname, 'lectures');
        console.log(`[main.js] Using working directory: ${workingDir}`);
        
        // Run the Python script with the working directory and output path
        const { spawn } = require('child_process');
        const scriptPath = path.join(__dirname, 'generate_lecture_summary.py');
        const outputPath = path.join(workingDir, 'summary.md');
        
        return new Promise((resolve, reject) => {
            const pythonProcess = spawn('python3', [scriptPath, workingDir, outputPath], {
                cwd: __dirname,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let stdout = '';
            let stderr = '';
            
            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            pythonProcess.on('close', async (code) => {
                if (code === 0) {
                    console.log('[main.js] Lecture summary generated successfully');
                    console.log(`[main.js] Python output: ${stdout}`);
                    
                    // Load the generated summary.md file from the working directory
                    try {
                        const content = await fs.readFile(outputPath, 'utf8');
                        console.log('[main.js] Loaded lecture summary content from:', outputPath);
                        
                        // Send the content to the presentation mode (but don't auto-switch)
                        if (mainWindow) {
                            mainWindow.webContents.send('load-presentation-content', content);
                            // Don't auto-switch to presentation mode - let user verify the file first
                        }
                        
                        // Refresh the file tree to show the new summary.md file
                        if (mainWindow) {
                            mainWindow.webContents.send('refresh-file-tree');
                        }
                        
                        // Show success notification
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'Lecture Summary Generated',
                            message: `Successfully generated summary.md in:\n${workingDir}`,
                            detail: 'The summary has been loaded into presentation mode. Switch to Presentation Mode when ready to view.'
                        });
                        
                        resolve({ success: true });
                    } catch (readError) {
                        console.error('[main.js] Error reading generated summary:', readError);
                        dialog.showErrorBox('Error', 'Failed to read generated lecture summary');
                        reject(readError);
                    }
                } else {
                    console.error('[main.js] Python script failed with code:', code);
                    console.error('[main.js] Python stderr:', stderr);
                    dialog.showErrorBox('Error', `Failed to generate lecture summary: ${stderr}`);
                    reject(new Error(`Python script failed with code ${code}`));
                }
            });
            
            pythonProcess.on('error', (error) => {
                console.error('[main.js] Error running Python script:', error);
                dialog.showErrorBox('Error', 'Failed to run lecture summary generator. Make sure Python 3 is installed.');
                reject(error);
            });
        });
        
    } catch (error) {
        console.error('[main.js] Error in generateAndLoadLectureSummary:', error);
        dialog.showErrorBox('Error', `Failed to generate lecture summary: ${error.message}`);
    }
}

async function openFile() {
    if (!mainWindow) return null;
    console.log('[main.js] Showing Open File dialog...');
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                { name: 'Markdown Files', extensions: ['md', 'markdown'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (canceled || !filePaths || filePaths.length === 0) {
            console.log('[main.js] Open File dialog cancelled.');
            return null;
        }

        const filePath = filePaths[0];
        console.log(`[main.js] User selected file: ${filePath}`);
        const content = await fs.readFile(filePath, 'utf8');
        currentFilePath = filePath;
        mainWindow.setTitle(`Hegel Pedagogy AI - ${path.basename(filePath)}`);
         if (mainWindow) {
            mainWindow.webContents.send('file-opened', { filePath, content });
            console.log(`[main.js] Sent file-opened event for ${filePath}`);
         }
        return { filePath, content };
    } catch (err) {
        console.error(`[main.js] Error opening file:`, err);
        dialog.showErrorBox('Open File Error', `Could not open the selected file: ${err.message}`);
        return null;
    }
}

// --- App Initialization ---
app.whenReady().then(() => {
  console.log('[main.js] App is ready via whenReady()');
  currentWorkingDirectory = app.getPath('documents');
  console.log(`[main.js] Initial working directory: ${currentWorkingDirectory}`);

  // --- IPC Handlers ---
  ipcMain.handle('request-file-tree', async (event) => {
    if (appSettings.workingDirectory && appSettings.workingDirectory.length > 0) {
      currentWorkingDirectory = appSettings.workingDirectory;
    }
    console.log(`[main.js] Received request-file-tree for dir: ${currentWorkingDirectory}`);
    try {
        const files = await getFiles(currentWorkingDirectory);
        const tree = buildFileTree(currentWorkingDirectory, files);
        return tree;
    } catch (error) {
        console.error(`[main.js] Error getting file tree for ${currentWorkingDirectory}:`, error);
        dialog.showErrorBox('File Tree Error', `Could not read directory contents for ${currentWorkingDirectory}. Please check permissions.`);
        return { name: path.basename(currentWorkingDirectory), type: 'folder', children: [] };
    }
  });

  ipcMain.handle('get-initial-theme', (event) => {
    return nativeTheme.shouldUseDarkColors;
  });

  ipcMain.handle('set-current-file', (event, filePath) => {
    if (typeof filePath === 'string') {
        currentFilePath = filePath;  // Update the current file path for save operations
        appSettings.currentFile = filePath;
        saveSettings();
        console.log('[main.js] Updated currentFile in settings and currentFilePath:', filePath);
        return { success: true };
    } else {
        return { success: false, error: 'Invalid file path' };
    }
});

  ipcMain.handle('open-file-path', async (event, filePath) => {
    try {
        if (!filePath || typeof filePath !== 'string') {
            throw new Error('No file path specified');
        }
        const content = await fs.readFile(filePath, 'utf8');
        appSettings.currentFile = filePath;
        saveSettings();
        if (mainWindow) {
            mainWindow.setTitle(`Hegel Pedagogy AI - ${path.basename(filePath)}`);
        }
        return { success: true, filePath, content };
    } catch (err) {
        console.error('[main.js] Error opening file by path:', err);
        return { success: false, error: err.message };
    }
});

  ipcMain.handle('send-chat-message', async (event, userMessage) => {
    if (!openai) {
        console.error('[main.js] OpenAI client not initialized. Cannot send chat message.');
        return { error: 'AI Client not configured. Please check server logs and API key.' };
    }
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim() === '') {
        console.error('[main.js] Invalid user message received.');
        return { error: 'Invalid message format.' };
    }
    console.log(`[main.js] Received chat message: "${userMessage}"`);
    try {
      const completion = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
              { role: 'system', content: 'You are a helpful assistant integrated into a Markdown editor for Hegelian philosophy and pedagogy. Provide thoughtful, educational responses.' },
              { role: 'user', content: userMessage }
          ],
      });
      const aiResponse = completion.choices[0]?.message?.content;
      console.log(`[main.js] OpenAI response: "${aiResponse}"`);
      if (aiResponse) {
          return { response: aiResponse };
      } else {
          console.error('[main.js] OpenAI response format invalid:', completion);
          return { error: 'Received an unexpected response format from the AI.' };
      }
    } catch (error) {
        console.error('[main.js] Error calling OpenAI API:', error);
        let errorMessage = 'An error occurred while contacting the AI service.';
        if (error.response) {
          console.error('API Error Status:', error.response.status);
          console.error('API Error Data:', error.response.data);
          if (error.response.status === 401) {
               errorMessage = 'Authentication error. Please check your OpenAI API key.';
          } else if (error.response.status === 429) {
               errorMessage = 'API rate limit exceeded. Please try again later.';
          }
        } else if (error.request) {
          errorMessage = 'Network error. Could not reach the AI service.';
        }
        return { error: errorMessage };
    }
  });

  ipcMain.handle('perform-save', async (event, content) => {
    console.log(`[main.js] Received perform-save. Current path: ${currentFilePath}`);
    if (currentFilePath) {
        return await saveFile(currentFilePath, content);
    } else {
        console.log('[main.js] No current path, triggering Save As dialog.');
        return await performSaveAs(content);
    }
  });

  ipcMain.handle('perform-save-as', async (event, content) => {
    console.log('[main.js] Received perform-save-as.');
     return await performSaveAs(content);
  });

  ipcMain.handle('get-settings', () => {
    return appSettings;
  });
  
  ipcMain.handle('set-settings', (event, newSettings) => {
    appSettings = { ...appSettings, ...newSettings };
    saveSettings();
    return { success: true };
  });

  // File deletion handlers
  ipcMain.handle('show-delete-confirm', async (event, { fileName, filePath }) => {
    if (!mainWindow) return false;
    
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Delete File',
      message: `Are you sure you want to delete "${fileName}"?`,
      detail: 'This action cannot be undone.',
      buttons: ['Cancel', 'Delete'],
      defaultId: 0,
      cancelId: 0
    });
    
    return result.response === 1; // Return true if "Delete" was clicked
  });

  ipcMain.handle('delete-file', async (event, filePath) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid file path');
      }
      
      // Use fs.unlink to delete the file
      await fs.unlink(filePath);
      console.log(`[main.js] File deleted successfully: ${filePath}`);
      
      // If the deleted file was the current file, clear it
      if (currentFilePath === filePath) {
        currentFilePath = null;
        if (mainWindow) {
          mainWindow.setTitle('Hegel Pedagogy AI - Untitled');
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error('[main.js] Error deleting file:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.on('save-layout', (event, layoutData) => {
    console.log('[main.js] Received save-layout request:', layoutData);
    if (layoutData && 
        typeof layoutData.structureWidth === 'string' &&
        typeof layoutData.editorWidth === 'string' &&
        typeof layoutData.rightWidth === 'string') {
        
        const isValid = (val) => /^\d+(\.\d+)?%$/.test(val);
        
        if (isValid(layoutData.structureWidth) && isValid(layoutData.editorWidth) && isValid(layoutData.rightWidth)) {
            appSettings.layout = layoutData;
            saveSettings();
            console.log('[main.js] Layout settings updated and saved.');
        } else {
            console.warn('[main.js] Invalid layout data received:', layoutData);
        }
    } else {
        console.warn('[main.js] Malformed layout data received:', layoutData);
    }
});

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  nativeTheme.on('updated', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    console.log(`[main.js] Native theme updated. Sending to renderer.`);
    if (mainWindow) {
      mainWindow.webContents.send('theme-changed', theme);
    }
  });

});

// --- App Lifecycle ---
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    console.log('[main.js] All windows closed, quitting app.');
    app.quit();
  }
});

// Handle file associations
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    try {
      const content = require('fs').readFileSync(filePath, 'utf-8');
      mainWindow.webContents.send('load-presentation-file', content, filePath, null);
    } catch (error) {
      console.error('Error loading file:', error);
      mainWindow.webContents.send('load-presentation-file', null, filePath, error.message);
    }
  }
});

console.log('--- main.js execution END ---');
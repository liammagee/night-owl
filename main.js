// main.js - Merged Hegel Pedagogy AI Application
console.log('--- main.js execution START ---');
require('dotenv').config(); // Load .env file
const { app, BrowserWindow, ipcMain, dialog, nativeTheme, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { OpenAI } = require('openai');
require('@electron/remote/main').initialize();

// Set app name immediately - before anything else
app.setName('Hegel Pedagogy AI');
process.title = 'Hegel Pedagogy AI';
console.log(`[main.js] App name set to: ${app.getName()}`);
console.log(`[main.js] Process title set to: ${process.title}`);

// Enable hot reload for electron app in development
if (process.argv.includes('--dev')) {
  try {
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
      hardResetMethod: 'exit'
    });
    console.log('[main.js] Electron auto-reload enabled for development - files will refresh automatically!');
  } catch (error) {
    console.error('[main.js] Failed to enable electron-reload:', error);
  }
}

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
    presentationLayout: 'spiral',
    // New settings for enhanced user experience
    editor: {
        fontSize: 14,
        wordWrap: 'on',
        showLineNumbers: true,
        showMinimap: true,
        folding: true
    },
    navigation: {
        maxHistoryEntries: 50,
        persistHistory: true,
        history: []
    },
    ui: {
        showToolbar: true,
        compactMode: false,
        autoSave: true,
        autoSaveInterval: 2000 // milliseconds
    },
    // Recently opened files for quick access
    recentFiles: [],
    maxRecentFiles: 10
};

// Deep merge function for nested objects
function deepMerge(target, source) {
    const result = { ...target };
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(target[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    return result;
}

// Load settings from disk
function loadSettings() {
    try {
        const fsSync = require('fs');
        if (fsSync.existsSync(SETTINGS_FILE)) {
            const raw = fsSync.readFileSync(SETTINGS_FILE, 'utf-8');
            
            // Check if file is empty or corrupted
            if (!raw || raw.trim().length === 0) {
                console.warn('[main.js] Settings file is empty, using defaults.');
                appSettings = JSON.parse(JSON.stringify(defaultSettings)); // Deep copy
                saveSettings(); // Save defaults to fix the empty file
                return;
            }
            
            const loadedSettings = JSON.parse(raw);
            
            // Deep merge to preserve nested structure
            appSettings = deepMerge(defaultSettings, loadedSettings);
            
            // Validate critical settings
            validateSettings();
            
            console.log('[main.js] Loaded settings:', appSettings);
        } else {
            console.log('[main.js] No settings file found, using defaults.');
            appSettings = JSON.parse(JSON.stringify(defaultSettings)); // Deep copy
        }
    } catch (err) {
        console.error('[main.js] Failed to load settings:', err);
        console.log('[main.js] Backing up corrupted settings file and using defaults.');
        
        // Backup the corrupted file if it exists
        const fsSync = require('fs');
        if (fsSync.existsSync(SETTINGS_FILE)) {
            try {
                const backupPath = SETTINGS_FILE + '.backup.' + Date.now();
                fsSync.copyFileSync(SETTINGS_FILE, backupPath);
                console.log(`[main.js] Corrupted settings backed up to: ${backupPath}`);
            } catch (backupError) {
                console.warn('[main.js] Could not backup corrupted settings:', backupError);
            }
        }
        
        // Use defaults and save them
        appSettings = JSON.parse(JSON.stringify(defaultSettings)); // Deep copy
        saveSettings();
    }
}

// Validate and fix settings
function validateSettings() {
    // Ensure arrays exist
    if (!Array.isArray(appSettings.recentFiles)) {
        appSettings.recentFiles = [];
    }
    if (!appSettings.navigation || !Array.isArray(appSettings.navigation.history)) {
        if (!appSettings.navigation) appSettings.navigation = {};
        appSettings.navigation.history = [];
    }
    
    // Validate working directory exists
    if (appSettings.workingDirectory) {
        const fs = require('fs');
        try {
            if (!fs.existsSync(appSettings.workingDirectory)) {
                console.warn('[main.js] Working directory does not exist, resetting to default:', appSettings.workingDirectory);
                appSettings.workingDirectory = defaultSettings.workingDirectory;
            }
        } catch (error) {
            console.warn('[main.js] Error checking working directory:', error);
            appSettings.workingDirectory = defaultSettings.workingDirectory;
        }
    }
    
    // Limit array sizes
    if (appSettings.recentFiles.length > appSettings.maxRecentFiles) {
        appSettings.recentFiles = appSettings.recentFiles.slice(0, appSettings.maxRecentFiles);
    }
    if (appSettings.navigation.history.length > appSettings.navigation.maxHistoryEntries) {
        appSettings.navigation.history = appSettings.navigation.history.slice(-appSettings.navigation.maxHistoryEntries);
    }
}

// Save settings to disk
function saveSettings() {
    try {
        const fsSync = require('fs');
        const settingsJson = JSON.stringify(appSettings, null, 2);
        
        // Validate JSON before writing
        JSON.parse(settingsJson); // This will throw if invalid
        
        // Write atomically using a temporary file
        const tempFile = SETTINGS_FILE + '.tmp';
        fsSync.writeFileSync(tempFile, settingsJson);
        fsSync.renameSync(tempFile, SETTINGS_FILE);
        
        console.log('[main.js] Saved settings');
    } catch (err) {
        console.error('[main.js] Failed to save settings:', err);
        
        // Clean up temp file if it exists
        const fsSync = require('fs');
        const tempFile = SETTINGS_FILE + '.tmp';
        if (fsSync.existsSync(tempFile)) {
            try {
                fsSync.unlinkSync(tempFile);
            } catch (cleanupErr) {
                console.warn('[main.js] Could not clean up temp settings file:', cleanupErr);
            }
        }
    }
}

// Add file to recent files list
function addToRecentFiles(filePath) {
    if (!filePath || !appSettings.recentFiles) return;
    
    // Remove if already exists
    appSettings.recentFiles = appSettings.recentFiles.filter(f => f.path !== filePath);
    
    // Add to beginning
    appSettings.recentFiles.unshift({
        path: filePath,
        name: path.basename(filePath),
        lastOpened: new Date().toISOString()
    });
    
    // Limit size
    if (appSettings.recentFiles.length > appSettings.maxRecentFiles) {
        appSettings.recentFiles = appSettings.recentFiles.slice(0, appSettings.maxRecentFiles);
    }
    
    saveSettings();
}

// Save navigation history
function saveNavigationHistory(history) {
    if (!appSettings.navigation.persistHistory) return;
    
    appSettings.navigation.history = history.slice(-appSettings.navigation.maxHistoryEntries);
    saveSettings();
}

// Get settings for specific category
function getSettings(category = null) {
    if (category) {
        return appSettings[category] || {};
    }
    return appSettings;
}

// Update settings for specific category
function updateSettings(category, newSettings) {
    if (category && appSettings[category]) {
        appSettings[category] = { ...appSettings[category], ...newSettings };
    } else {
        appSettings = { ...appSettings, ...newSettings };
    }
    saveSettings();
}

// Load settings before app ready
loadSettings();

// Set additional app metadata
if (process.platform !== 'darwin') {
    // On non-macOS platforms, also set the desktop name
    app.setDesktopName('Hegel Pedagogy AI');
} else {
    // Set macOS About panel information
    app.setAboutPanelOptions({
        applicationName: 'Hegel Pedagogy AI',
        applicationVersion: '1.0.0',
        version: '1.0.0',
        credits: 'Advanced Markdown editor and presentation app for Hegelian philosophy and AI pedagogy'
    });
}

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
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
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
      console.log(`[main.js] App name in ready-to-show: ${app.getName()}`);
      console.log(`[main.js] Process title: ${process.title}`);
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
      
      // Send refresh signal with a slight delay to ensure renderer is ready
      setTimeout(() => {
        console.log('[main.js] Sending refresh-file-tree signal to renderer.');
        mainWindow.webContents.send('refresh-file-tree');
      }, 100);
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
            // Skip node_modules, hidden directories, and .git
            if (dirent.name !== 'node_modules' && 
                !dirent.name.startsWith('.') && 
                dirent.name !== '__pycache__') {
                
                // Add the folder itself
                results.push({ path: res, type: 'folder' });
                
                // Recursively scan the subfolder for its contents
                try {
                    const subfolderFiles = await getFiles(res);
                    results = results.concat(subfolderFiles);
                } catch (error) {
                    console.warn(`[main.js] Could not read subfolder ${res}:`, error.message);
                }
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

// Global search implementation
async function performGlobalSearch(query, workingDir, options = {}) {
    const {
        caseSensitive = false,
        wholeWord = false,
        useRegex = false,
        filePattern = '*.{md,markdown,txt}',
        maxResults = 500
    } = options;

    const results = [];
    
    try {
        // Create search pattern
        let searchPattern;
        if (useRegex) {
            try {
                searchPattern = new RegExp(query, caseSensitive ? 'gm' : 'gim');
            } catch (error) {
                throw new Error(`Invalid regex pattern: ${error.message}`);
            }
        } else {
            // Escape special regex characters for literal search
            const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const wordBoundary = wholeWord ? '\\b' : '';
            const flags = caseSensitive ? 'gm' : 'gim';
            searchPattern = new RegExp(`${wordBoundary}${escapedQuery}${wordBoundary}`, flags);
        }

        // Get all markdown and text files recursively
        const files = await getSearchableFiles(workingDir);
        
        for (const file of files) {
            if (results.length >= maxResults) break;
            
            try {
                const content = await fs.readFile(file.path, 'utf8');
                const lines = content.split('\n');
                
                lines.forEach((line, lineIndex) => {
                    if (results.length >= maxResults) return;
                    
                    const matches = [...line.matchAll(searchPattern)];
                    matches.forEach(match => {
                        if (results.length >= maxResults) return;
                        
                        results.push({
                            file: file.path,
                            fileName: path.basename(file.path),
                            line: lineIndex + 1,
                            column: match.index + 1,
                            text: line.trim(),
                            match: match[0],
                            preview: getLinePreview(lines, lineIndex, 2)
                        });
                    });
                });
            } catch (error) {
                console.warn(`[main.js] Could not search file ${file.path}:`, error.message);
            }
        }
        
        console.log(`[main.js] Global search found ${results.length} matches in ${files.length} files`);
        return results;
        
    } catch (error) {
        console.error('[main.js] Error in performGlobalSearch:', error);
        throw error;
    }
}

// Get searchable files in directory
async function getSearchableFiles(dir) {
    const files = [];
    const searchableExtensions = ['.md', '.markdown', '.txt', '.text'];
    
    async function scanDirectory(currentDir) {
        try {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                
                if (entry.isDirectory()) {
                    // Skip hidden directories, node_modules, .git
                    if (!entry.name.startsWith('.') && 
                        entry.name !== 'node_modules' && 
                        entry.name !== '__pycache__') {
                        await scanDirectory(fullPath);
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (searchableExtensions.includes(ext)) {
                        files.push({ path: fullPath, name: entry.name });
                    }
                }
            }
        } catch (error) {
            console.warn(`[main.js] Could not scan directory ${currentDir}:`, error.message);
        }
    }
    
    await scanDirectory(dir);
    return files;
}

// Get preview context around a line
function getLinePreview(lines, lineIndex, contextLines = 2) {
    const start = Math.max(0, lineIndex - contextLines);
    const end = Math.min(lines.length, lineIndex + contextLines + 1);
    
    return lines.slice(start, end).map((line, index) => ({
        lineNumber: start + index + 1,
        text: line,
        isMatch: start + index === lineIndex
    }));
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
  
  // Use saved working directory from settings, fallback to documents
  if (appSettings.workingDirectory && appSettings.workingDirectory.length > 0) {
    currentWorkingDirectory = appSettings.workingDirectory;
    console.log(`[main.js] Using saved working directory: ${currentWorkingDirectory}`);
  } else {
    currentWorkingDirectory = app.getPath('documents');
    console.log(`[main.js] Using default working directory: ${currentWorkingDirectory}`);
  }

  // Set dock icon on macOS
  if (process.platform === 'darwin') {
    const dockIconPath = path.join(__dirname, 'build', 'icon.png');
    try {
      if (require('fs').existsSync(dockIconPath)) {
        app.dock.setIcon(dockIconPath);
        console.log('[main.js] Dock icon set successfully');
      }
    } catch (error) {
      console.warn('[main.js] Could not set dock icon:', error);
    }
  }

  // --- IPC Handlers ---
  
  // Create folder handler
  ipcMain.handle('create-folder', async (event, folderName) => {
    try {
      const workingDir = appSettings.workingDirectory || currentWorkingDirectory;
      const folderPath = path.join(workingDir, folderName);
      
      console.log(`[main.js] Creating folder: ${folderPath}`);
      
      // Check if folder already exists
      try {
        await fs.access(folderPath);
        return {
          success: false,
          error: 'A folder with that name already exists'
        };
      } catch (err) {
        // Folder doesn't exist, which is what we want
      }
      
      // Create the folder
      await fs.mkdir(folderPath, { recursive: true });
      
      console.log(`[main.js] Folder created successfully: ${folderPath}`);
      
      return {
        success: true,
        folderPath: folderPath
      };
    } catch (error) {
      console.error('[main.js] Error creating folder:', error);
      return {
        success: false,
        error: error.message || 'Failed to create folder'
      };
    }
  });

  ipcMain.handle('request-file-tree', async (event) => {
    if (appSettings.workingDirectory && appSettings.workingDirectory.length > 0) {
      currentWorkingDirectory = appSettings.workingDirectory;
    }
    console.log(`[main.js] Received request-file-tree for dir: ${currentWorkingDirectory}`);
    try {
        const files = await getFiles(currentWorkingDirectory);
        console.log(`[main.js] Found ${files.length} files in directory`);
        console.log(`[main.js] First few files:`, files.slice(0, 3));
        const tree = buildFileTree(currentWorkingDirectory, files);
        console.log(`[main.js] Built file tree with ${tree.children ? tree.children.length : 0} root items`);
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

  // Enhanced settings handlers
  ipcMain.handle('get-settings', (event, category = null) => {
    return getSettings(category);
  });
  
  ipcMain.handle('set-settings', (event, category, newSettings) => {
    if (typeof category === 'string') {
      updateSettings(category, newSettings);
    } else {
      // If category is actually the settings object (backwards compatibility)
      appSettings = { ...appSettings, ...category };
      saveSettings();
    }
    return { success: true };
  });

  // Navigation history handlers
  ipcMain.handle('save-navigation-history', (event, history) => {
    saveNavigationHistory(history);
  });

  ipcMain.handle('get-navigation-history', () => {
    return appSettings.navigation.history || [];
  });

  // Recent files handlers
  ipcMain.handle('add-recent-file', (event, filePath) => {
    addToRecentFiles(filePath);
    return appSettings.recentFiles;
  });

  ipcMain.handle('get-recent-files', () => {
    return appSettings.recentFiles || [];
  });

  // Working directory handler
  ipcMain.handle('change-working-directory', async () => {
    if (!mainWindow) return { success: false, error: 'No main window available' };
    
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Working Directory',
      defaultPath: appSettings.workingDirectory
    });

    if (!result.canceled && result.filePaths.length > 0) {
      appSettings.workingDirectory = result.filePaths[0];
      currentWorkingDirectory = appSettings.workingDirectory;
      saveSettings();
      
      console.log('[main.js] Working directory changed to:', appSettings.workingDirectory);
      return { 
        success: true, 
        path: appSettings.workingDirectory,
        message: 'Working directory updated successfully'
      };
    }

    return { success: false, error: 'Directory selection cancelled' };
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

  // Enhanced delete handler for both files and folders
  ipcMain.handle('delete-item', async (event, { path, type, name }) => {
    try {
      if (!path || typeof path !== 'string') {
        throw new Error('Invalid path');
      }

      // Show confirmation dialog
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: `Delete ${type === 'file' ? 'File' : 'Folder'}`,
        message: `Are you sure you want to delete "${name}"?`,
        detail: type === 'folder' 
          ? 'This will permanently delete the folder and all its contents. This action cannot be undone.'
          : 'This action cannot be undone.',
        buttons: ['Cancel', 'Delete'],
        defaultId: 0,
        cancelId: 0
      });

      if (result.response !== 1) {
        return { success: false, error: 'User cancelled' };
      }

      // Delete the item
      if (type === 'file') {
        await fs.unlink(path);
        console.log(`[main.js] File deleted successfully: ${path}`);
        
        // Clear current file if it was deleted
        if (currentFilePath === path) {
          currentFilePath = null;
          if (mainWindow) {
            mainWindow.setTitle('Hegel Pedagogy AI - Untitled');
          }
        }
      } else if (type === 'folder') {
        await fs.rm(path, { recursive: true, force: true });
        console.log(`[main.js] Folder deleted successfully: ${path}`);
      }

      return { success: true };
    } catch (error) {
      console.error(`[main.js] Error deleting ${type}:`, error);
      return { success: false, error: error.message };
    }
  });

  // Move/copy handler
  ipcMain.handle('move-item', async (event, { sourcePath, targetPath, operation, type }) => {
    try {
      if (!sourcePath || !targetPath || !operation || !type) {
        throw new Error('Missing required parameters');
      }

      const sourceBasename = path.basename(sourcePath);
      const destinationPath = path.join(targetPath, sourceBasename);

      // Check if destination already exists
      try {
        await fs.access(destinationPath);
        return { success: false, error: `A ${type} with this name already exists in the destination folder` };
      } catch (error) {
        // File doesn't exist, which is what we want
      }

      if (operation === 'cut') {
        // Move the item
        await fs.rename(sourcePath, destinationPath);
        console.log(`[main.js] ${type} moved successfully from ${sourcePath} to ${destinationPath}`);
        
        // Update current file path if it was moved
        if (currentFilePath === sourcePath) {
          currentFilePath = destinationPath;
          if (mainWindow) {
            const fileName = path.basename(destinationPath);
            mainWindow.setTitle(`Hegel Pedagogy AI - ${fileName}`);
          }
        }
      } else if (operation === 'copy') {
        // Copy the item
        if (type === 'file') {
          await fs.copyFile(sourcePath, destinationPath);
        } else if (type === 'folder') {
          await fs.cp(sourcePath, destinationPath, { recursive: true });
        }
        console.log(`[main.js] ${type} copied successfully from ${sourcePath} to ${destinationPath}`);
      }

      return { success: true, newPath: destinationPath };
    } catch (error) {
      console.error(`[main.js] Error ${operation}ing ${type}:`, error);
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

  // Global search handler
  ipcMain.handle('global-search', async (event, { query, options = {} }) => {
    try {
      const workingDir = appSettings.workingDirectory || currentWorkingDirectory;
      console.log(`[main.js] Global search for "${query}" in ${workingDir}`);
      
      if (!query || query.trim().length === 0) {
        return { success: false, error: 'Search query is required' };
      }
      
      const searchResults = await performGlobalSearch(query, workingDir, options);
      return { success: true, results: searchResults };
    } catch (error) {
      console.error('[main.js] Error in global search:', error);
      return { success: false, error: error.message };
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
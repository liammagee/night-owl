// main.js - Merged Hegel Pedagogy AI Application
console.log('--- main.js execution START ---');
require('dotenv').config(); // Load .env file
const { app, BrowserWindow, ipcMain, dialog, nativeTheme, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const AIService = require('./services/aiService');
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
      hardResetMethod: 'exit',
      // Ignore user data directories to prevent reload when saving user files
      ignored: [
        /node_modules|[\/\\]\./,
        /lectures[\/\\]/, // Ignore the lectures directory
        /\.md$/, // Ignore markdown files anywhere
        /settings\.json$/ // Ignore settings file changes
      ]
    });
    console.log('[main.js] Electron auto-reload enabled for development - app files only');
  } catch (error) {
    console.error('[main.js] Failed to enable electron-reload:', error);
  }
}

// --- AI Service Initialization ---
let aiService;
try {
  aiService = new AIService();
  console.log('[main.js] AI Service initialized with providers:', aiService.getAvailableProviders());
  
  if (aiService.getAvailableProviders().length === 0) {
    console.warn('[main.js] WARNING: No AI providers configured. AI Chat feature will be disabled.');
    console.warn('[main.js] Please add API keys to your .env file. See .env.example for details.');
  }
} catch (error) {
  console.error('[main.js] Error initializing AI Service:', error);
}

// --- Process Event Handlers ---
// Handle uncaught exceptions and EPIPE errors
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE') {
    // EPIPE errors occur when stdout pipe is closed - ignore them
    return;
  }
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  if (mainWindow) {
    mainWindow.close();
  } else {
    app.quit();
  }
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  if (mainWindow) {
    mainWindow.close();
  } else {
    app.quit();
  }
});

// --- Global Variables ---
let mainWindow = null;
let currentFilePath = null;
// Set working directory to project root instead of app path
let currentWorkingDirectory = path.resolve(app.getAppPath(), '..');

// --- Persistent Settings Storage ---
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
let appSettings = {};

// Default settings structure
const defaultSettings = {
    // === Theme and Appearance ===
    theme: 'auto', // 'light', 'dark', 'auto'
    customThemes: {}, // User-defined theme overrides
    
    // === Layout Configuration ===
    layout: {
        structureWidth: '18%',
        editorWidth: '45%',
        rightWidth: '37%'
    },
    
    // === File System ===
    workingDirectory: app.getPath('documents'),
    currentFile: '',
    defaultFileType: '.md', // Default extension for new files
    
    // === Presentation Settings ===
    presentation: {
        mode: false,
        layout: 'spiral', // 'spiral', 'linear', 'grid', 'circle', 'tree', 'zigzag'
        autoAdvance: false,
        autoAdvanceInterval: 5000, // milliseconds
        showSpeakerNotes: true
    },
    
    // === Editor Configuration ===
    editor: {
        fontSize: 14,
        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
        wordWrap: 'on', // 'on', 'off', 'wordWrapColumn'
        showLineNumbers: true,
        showMinimap: true,
        folding: true,
        tabSize: 2,
        insertSpaces: true,
        autoIndent: 'full', // 'none', 'keep', 'brackets', 'advanced', 'full'
        cursorStyle: 'line', // 'line', 'block', 'underline'
        renderWhitespace: 'selection', // 'none', 'boundary', 'selection', 'all'
        highlightActiveLine: true,
        scrollBeyondLastLine: true,
        enableCitationAutocomplete: true // Enable citation autocomplete on [@
    },
    
    // === AI Configuration ===
    ai: {
        preferredProvider: 'auto', // 'auto', 'openai', 'anthropic', 'groq', 'openrouter'
        models: {
            openai: 'gpt-4o',
            anthropic: 'claude-3-5-sonnet-20241022',
            groq: 'llama-3.1-70b-versatile',
            openrouter: 'anthropic/claude-3.5-sonnet'
        },
        temperature: 0.7,
        maxTokens: 2000,
        enableChat: true,
        enableSummarization: true,
        enableNoteExtraction: true,
        chatHistory: {
            persist: true,
            maxEntries: 100,
            autoSave: true
        },
        responseFormat: 'markdown' // 'plain', 'markdown', 'html'
    },
    
    // === Export Settings ===
    export: {
        defaultFormat: 'pdf',
        includeReferences: true,
        pandoc: {
            pdfEngine: 'pdflatex', // 'pdflatex', 'xelatex', 'lualatex'
            citationStyle: 'chicago-author-date', // CSL style name
            includeTableOfContents: true,
            tocDepth: 3,
            numberSections: true
        },
        html: {
            standalone: true,
            mathRenderer: 'mathjax', // 'mathjax', 'katex', 'none'
            syntaxHighlighting: 'pygments',
            includeCSS: false
        }
    },
    
    // === Navigation and History ===
    navigation: {
        maxHistoryEntries: 50,
        persistHistory: true,
        history: [],
        enableBreadcrumbs: true,
        showFileTree: true,
        autoExpandFolders: false
    },
    
    // === UI Preferences ===
    ui: {
        showToolbar: true,
        showStatusBar: true,
        compactMode: false,
        showWelcomeScreen: true,
        confirmBeforeClose: false,
        language: 'en', // Future: internationalization support
        dateFormat: 'ISO', // 'ISO', 'US', 'EU', 'relative'
    },
    
    // === Auto-save and Backup ===
    autoSave: {
        enabled: true,
        interval: 2000, // milliseconds
        createBackups: true,
        maxBackups: 5,
        backupLocation: 'default' // 'default' uses app data directory
    },
    
    // === Performance ===
    performance: {
        enablePreviewCache: true,
        maxCacheSize: 50, // MB
        enableLazyLoading: true,
        renderTimeout: 5000 // milliseconds
    },
    
    // === Recently opened files and workspaces ===
    recents: {
        files: [],
        workspaces: [],
        maxFiles: 10,
        maxWorkspaces: 5
    },
    
    // === Notifications ===
    notifications: {
        enabled: true,
        position: 'bottom-right', // 'top-left', 'top-right', 'bottom-left', 'bottom-right'
        duration: 3000, // milliseconds, 0 = permanent
        showProgress: true
    },
    
    // === Search and Replace ===
    search: {
        caseSensitive: false,
        wholeWord: false,
        regex: false,
        highlightMatches: true,
        maxResults: 1000
    },
    
    // === Accessibility ===
    accessibility: {
        highContrast: false,
        reducedMotion: false,
        screenReaderOptimized: false,
        fontSize: 'normal', // 'small', 'normal', 'large', 'larger'
    },
    
    // === Kanban Board Settings ===
    kanban: {
        todoFilePatterns: ['TODO.md', 'TODOS.md', 'todo.md', 'todos.md', 'TASKS.md', 'tasks.md'],
        columns: [
            { id: 'todo', name: 'To Do', color: '#e3f2fd' },
            { id: 'inprogress', name: 'In Progress', color: '#fff3e0' },
            { id: 'done', name: 'Done', color: '#e8f5e8' }
        ],
        doneMarkers: ['DONE', 'COMPLETED', '✓', '✔', '[x]', '[X]'],
        inProgressMarkers: ['IN PROGRESS', 'DOING', '⏳', '[~]'],
        enableDragDrop: true,
        autoSave: true
    },
    
    // === Advanced Developer Options ===
    advanced: {
        enableDebugMode: false,
        showPerformanceMetrics: false,
        enableExperimentalFeatures: false,
        customCSSPath: '', // Path to custom CSS file
        pluginPaths: [] // Paths to custom plugins (future feature)
    }
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
    // Ensure critical nested objects exist
    if (!appSettings.navigation) appSettings.navigation = {};
    if (!appSettings.recents) appSettings.recents = {};
    if (!appSettings.ai) appSettings.ai = {};
    if (!appSettings.editor) appSettings.editor = {};
    if (!appSettings.export) appSettings.export = {};
    if (!appSettings.ui) appSettings.ui = {};
    if (!appSettings.autoSave) appSettings.autoSave = {};
    if (!appSettings.presentation) appSettings.presentation = {};
    if (!appSettings.accessibility) appSettings.accessibility = {};
    if (!appSettings.advanced) appSettings.advanced = {};
    
    // Ensure arrays exist
    if (!Array.isArray(appSettings.navigation.history)) {
        appSettings.navigation.history = [];
    }
    if (!Array.isArray(appSettings.recents.files)) {
        appSettings.recents.files = [];
    }
    if (!Array.isArray(appSettings.recents.workspaces)) {
        appSettings.recents.workspaces = [];
    }
    
    // Backward compatibility: migrate old recentFiles to new structure
    if (Array.isArray(appSettings.recentFiles)) {
        appSettings.recents.files = appSettings.recentFiles;
        delete appSettings.recentFiles;
    }
    if (appSettings.maxRecentFiles) {
        appSettings.recents.maxFiles = appSettings.maxRecentFiles;
        delete appSettings.maxRecentFiles;
    }
    
    // Backward compatibility: migrate old presentationMode and presentationLayout
    if (typeof appSettings.presentationMode !== 'undefined') {
        appSettings.presentation.mode = appSettings.presentationMode;
        delete appSettings.presentationMode;
    }
    if (appSettings.presentationLayout) {
        appSettings.presentation.layout = appSettings.presentationLayout;
        delete appSettings.presentationLayout;
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
    
    // Validate numeric settings have reasonable bounds
    if (appSettings.editor && typeof appSettings.editor.fontSize === 'number') {
        appSettings.editor.fontSize = Math.max(8, Math.min(72, appSettings.editor.fontSize));
    }
    if (appSettings.autoSave && typeof appSettings.autoSave.interval === 'number') {
        appSettings.autoSave.interval = Math.max(1000, Math.min(30000, appSettings.autoSave.interval));
    }
    if (appSettings.ai && typeof appSettings.ai.temperature === 'number') {
        appSettings.ai.temperature = Math.max(0, Math.min(2, appSettings.ai.temperature));
    }
    if (appSettings.ai && typeof appSettings.ai.maxTokens === 'number') {
        appSettings.ai.maxTokens = Math.max(100, Math.min(8000, appSettings.ai.maxTokens));
    }
    
    // Validate theme setting
    if (appSettings.theme && !['light', 'dark', 'auto'].includes(appSettings.theme)) {
        appSettings.theme = defaultSettings.theme;
    }
    
    // Limit array sizes
    const maxFiles = appSettings.recents.maxFiles || defaultSettings.recents.maxFiles;
    const maxWorkspaces = appSettings.recents.maxWorkspaces || defaultSettings.recents.maxWorkspaces;
    const maxHistoryEntries = appSettings.navigation.maxHistoryEntries || defaultSettings.navigation.maxHistoryEntries;
    
    if (appSettings.recents.files.length > maxFiles) {
        appSettings.recents.files = appSettings.recents.files.slice(0, maxFiles);
    }
    if (appSettings.recents.workspaces.length > maxWorkspaces) {
        appSettings.recents.workspaces = appSettings.recents.workspaces.slice(0, maxWorkspaces);
    }
    if (appSettings.navigation.history.length > maxHistoryEntries) {
        appSettings.navigation.history = appSettings.navigation.history.slice(-maxHistoryEntries);
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
        
        // Settings saved successfully
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
    if (!filePath) return;
    
    // Ensure recents structure exists
    if (!appSettings.recents) appSettings.recents = {};
    if (!Array.isArray(appSettings.recents.files)) appSettings.recents.files = [];
    
    // Remove if already exists
    appSettings.recents.files = appSettings.recents.files.filter(f => f.path !== filePath);
    
    // Add to beginning
    appSettings.recents.files.unshift({
        path: filePath,
        name: path.basename(filePath),
        lastOpened: new Date().toISOString(),
        type: path.extname(filePath) || 'unknown'
    });
    
    // Limit size
    const maxFiles = appSettings.recents.maxFiles || defaultSettings.recents.maxFiles;
    if (appSettings.recents.files.length > maxFiles) {
        appSettings.recents.files = appSettings.recents.files.slice(0, maxFiles);
    }
    
    saveSettings();
}

// Add workspace to recent workspaces list
function addToRecentWorkspaces(workspacePath) {
    if (!workspacePath) return;
    
    // Ensure recents structure exists
    if (!appSettings.recents) appSettings.recents = {};
    if (!Array.isArray(appSettings.recents.workspaces)) appSettings.recents.workspaces = [];
    
    // Remove if already exists
    appSettings.recents.workspaces = appSettings.recents.workspaces.filter(w => w.path !== workspacePath);
    
    // Add to beginning
    appSettings.recents.workspaces.unshift({
        path: workspacePath,
        name: path.basename(workspacePath),
        lastOpened: new Date().toISOString()
    });
    
    // Limit size
    const maxWorkspaces = appSettings.recents.maxWorkspaces || defaultSettings.recents.maxWorkspaces;
    if (appSettings.recents.workspaces.length > maxWorkspaces) {
        appSettings.recents.workspaces = appSettings.recents.workspaces.slice(0, maxWorkspaces);
    }
    
    saveSettings();
}

// Save navigation history
function saveNavigationHistory(history) {
    if (!appSettings.navigation.persistHistory) return;
    
    appSettings.navigation.history = history.slice(-appSettings.navigation.maxHistoryEntries);
    saveSettings();
}

// Settings utility functions
function getSettingsCategory(category) {
    return appSettings[category] || defaultSettings[category] || {};
}

function updateSettingsCategory(category, updates) {
    if (!appSettings[category]) {
        appSettings[category] = {};
    }
    
    // Deep merge the updates
    appSettings[category] = deepMerge(appSettings[category], updates);
    saveSettings();
    
    return appSettings[category];
}

function resetSettingsCategory(category) {
    if (defaultSettings[category]) {
        appSettings[category] = JSON.parse(JSON.stringify(defaultSettings[category]));
        saveSettings();
        return appSettings[category];
    }
    return null;
}

function exportSettings() {
    // Return a clean copy of settings without sensitive information
    const exportData = JSON.parse(JSON.stringify(appSettings));
    
    // Remove or mask sensitive data if needed
    if (exportData.advanced && exportData.advanced.enableDebugMode !== undefined) {
        delete exportData.advanced.enableDebugMode;
    }
    
    return {
        version: '1.0',
        timestamp: new Date().toISOString(),
        settings: exportData
    };
}

function importSettings(importData) {
    try {
        if (!importData || !importData.settings) {
            throw new Error('Invalid settings import data');
        }
        
        // Validate the imported data structure
        const imported = importData.settings;
        
        // Merge with current settings, preserving critical data
        const criticalData = {
            currentFile: appSettings.currentFile,
            workingDirectory: appSettings.workingDirectory,
            navigation: appSettings.navigation
        };
        
        // Deep merge imported settings with defaults first
        appSettings = deepMerge(defaultSettings, imported);
        
        // Restore critical data
        appSettings = deepMerge(appSettings, criticalData);
        
        // Validate the merged settings
        validateSettings();
        
        // Save the new settings
        saveSettings();
        
        return { success: true, message: 'Settings imported successfully' };
    } catch (error) {
        console.error('[main.js] Error importing settings:', error);
        return { success: false, error: error.message };
    }
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

// Initialize currentFilePath from saved settings
if (appSettings.currentFile && typeof appSettings.currentFile === 'string' && appSettings.currentFile.trim() !== '') {
    currentFilePath = appSettings.currentFile;
    console.log('[main.js] Initialized currentFilePath from settings:', currentFilePath);
} else {
    currentFilePath = null;
    console.log('[main.js] No current file in settings, currentFilePath set to null');
}

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
    
    // Always open dev tools for debugging
    mainWindow.webContents.openDevTools();
    console.log(`[main.js] App name in ready-to-show: ${app.getName()}`);
    console.log(`[main.js] Process title: ${process.title}`);
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
                        addToRecentWorkspaces(folderPath); // Track workspace in recents
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
            label: 'Export as HTML',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Export HTML menu item clicked. Triggering export-html in renderer.');
                mainWindow.webContents.send('trigger-export-html');
              }
            }
          },
          {
            label: 'Export as HTML (with References)',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Export HTML with References menu item clicked. Triggering export-html-pandoc in renderer.');
                mainWindow.webContents.send('trigger-export-html-pandoc');
              }
            }
          },
          {
            label: 'Export as PDF',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Export PDF menu item clicked. Triggering export-pdf in renderer.');
                mainWindow.webContents.send('trigger-export-pdf');
              }
            }
          },
          {
            label: 'Export as PDF (with References)',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Export PDF with References menu item clicked. Triggering export-pdf-pandoc in renderer.');
                mainWindow.webContents.send('trigger-export-pdf-pandoc');
              }
            }
          },
          {
            label: 'Export as PowerPoint',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Export PowerPoint menu item clicked. Triggering export-pptx in renderer.');
                mainWindow.webContents.send('trigger-export-pptx');
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
        label: 'Format',
        submenu: [
          {
            label: 'Bold',
            accelerator: 'CmdOrCtrl+B',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Format: Bold');
                mainWindow.webContents.send('format-text', { type: 'bold' });
              }
            }
          },
          {
            label: 'Italic',
            accelerator: 'CmdOrCtrl+I',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Format: Italic');
                mainWindow.webContents.send('format-text', { type: 'italic' });
              }
            }
          },
          {
            label: 'Code',
            accelerator: 'CmdOrCtrl+`',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Format: Code');
                mainWindow.webContents.send('format-text', { type: 'code' });
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Heading 1',
            accelerator: 'CmdOrCtrl+Alt+1',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Format: Heading 1');
                mainWindow.webContents.send('format-text', { type: 'heading1' });
              }
            }
          },
          {
            label: 'Heading 2',
            accelerator: 'CmdOrCtrl+Alt+2',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Format: Heading 2');
                mainWindow.webContents.send('format-text', { type: 'heading2' });
              }
            }
          },
          {
            label: 'Heading 3',
            accelerator: 'CmdOrCtrl+Alt+3',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Format: Heading 3');
                mainWindow.webContents.send('format-text', { type: 'heading3' });
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Bullet List',
            accelerator: 'CmdOrCtrl+Shift+8',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Format: Bullet List');
                mainWindow.webContents.send('format-text', { type: 'bulletlist' });
              }
            }
          },
          {
            label: 'Numbered List',
            accelerator: 'CmdOrCtrl+Shift+7',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Format: Numbered List');
                mainWindow.webContents.send('format-text', { type: 'numberedlist' });
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Insert Link',
            accelerator: 'CmdOrCtrl+K',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Format: Insert Link');
                mainWindow.webContents.send('format-text', { type: 'link' });
              }
            }
          },
          {
            label: 'Insert Image',
            accelerator: 'CmdOrCtrl+Shift+I',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Format: Insert Image');
                mainWindow.webContents.send('format-text', { type: 'image' });
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Blockquote',
            accelerator: 'CmdOrCtrl+Shift+.',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Format: Blockquote');
                mainWindow.webContents.send('format-text', { type: 'blockquote' });
              }
            }
          },
          {
            label: 'Strikethrough',
            accelerator: 'CmdOrCtrl+Shift+X',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Format: Strikethrough');
                mainWindow.webContents.send('format-text', { type: 'strikethrough' });
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Fold Current Section',
            accelerator: 'CmdOrCtrl+Shift+[',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Format: Fold Current');
                mainWindow.webContents.send('format-text', { type: 'fold-current' });
              }
            }
          },
          {
            label: 'Expand Current Section',
            accelerator: 'CmdOrCtrl+Shift+]',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Format: Expand Current');
                mainWindow.webContents.send('format-text', { type: 'unfold-current' });
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Fold All Sections',
            accelerator: 'CmdOrCtrl+K CmdOrCtrl+0',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Format: Fold All');
                mainWindow.webContents.send('format-text', { type: 'fold-all' });
              }
            }
          },
          {
            label: 'Expand All Sections',
            accelerator: 'CmdOrCtrl+K CmdOrCtrl+J',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Format: Expand All');
                mainWindow.webContents.send('format-text', { type: 'unfold-all' });
              }
            }
          }
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
            {
                label: 'Network Mode',
                accelerator: 'CmdOrCtrl+3',
                click: () => {
                    if (mainWindow) {
                        console.log('[main.js] Switching to Network mode via menu');
                        mainWindow.webContents.send('switch-to-network');
                    }
                }
            },
            { type: 'separator' },
            {
                label: 'Style Settings...',
                accelerator: 'CmdOrCtrl+Shift+T',
                click: () => {
                    if (mainWindow) {
                        console.log('[main.js] Opening Style Settings via menu');
                        mainWindow.webContents.send('open-style-settings');
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
                checked: (appSettings.presentation?.layout || defaultSettings.presentation.layout) === 'spiral',
                click: () => {
                  if (!appSettings.presentation) appSettings.presentation = {};
                  appSettings.presentation.layout = 'spiral';
                  saveSettings();
                  mainWindow?.webContents.send('change-layout', 'spiral');
                }
              },
              {
                label: 'Linear',
                type: 'radio',
                checked: (appSettings.presentation?.layout || defaultSettings.presentation.layout) === 'linear',
                click: () => {
                  if (!appSettings.presentation) appSettings.presentation = {};
                  appSettings.presentation.layout = 'linear';
                  saveSettings();
                  mainWindow?.webContents.send('change-layout', 'linear');
                }
              },
              {
                label: 'Grid',
                type: 'radio',
                checked: (appSettings.presentation?.layout || defaultSettings.presentation.layout) === 'grid',
                click: () => {
                  if (!appSettings.presentation) appSettings.presentation = {};
                  appSettings.presentation.layout = 'grid';
                  saveSettings();
                  mainWindow?.webContents.send('change-layout', 'grid');
                }
              },
              {
                label: 'Circle',
                type: 'radio',
                checked: (appSettings.presentation?.layout || defaultSettings.presentation.layout) === 'circle',
                click: () => {
                  if (!appSettings.presentation) appSettings.presentation = {};
                  appSettings.presentation.layout = 'circle';
                  saveSettings();
                  mainWindow?.webContents.send('change-layout', 'circle');
                }
              },
              {
                label: 'Tree',
                type: 'radio',
                checked: (appSettings.presentation?.layout || defaultSettings.presentation.layout) === 'tree',
                click: () => {
                  if (!appSettings.presentation) appSettings.presentation = {};
                  appSettings.presentation.layout = 'tree';
                  saveSettings();
                  mainWindow?.webContents.send('change-layout', 'tree');
                }
              },
              {
                label: 'Zigzag',
                type: 'radio',
                checked: (appSettings.presentation?.layout || defaultSettings.presentation.layout) === 'zigzag',
                click: () => {
                  if (!appSettings.presentation) appSettings.presentation = {};
                  appSettings.presentation.layout = 'zigzag';
                  saveSettings();
                  mainWindow?.webContents.send('change-layout', 'zigzag');
                }
              }
            ]
          }
        ]
      },
      {
        label: 'Settings',
        submenu: [
          {
            label: 'Preferences...',
            accelerator: 'CmdOrCtrl+,',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Opening settings dialog');
                mainWindow.webContents.send('open-settings-dialog');
              }
            }
          },
          { type: 'separator' },
          {
            label: 'AI Configuration',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Opening AI configuration dialog');
                mainWindow.webContents.send('open-ai-settings-dialog');
              }
            }
          },
          {
            label: 'Editor Settings',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Opening editor settings dialog');
                mainWindow.webContents.send('open-editor-settings-dialog');
              }
            }
          },
          {
            label: 'Export Preferences',
            click: () => {
              if (mainWindow) {
                console.log('[main.js] Opening export settings dialog');
                mainWindow.webContents.send('open-export-settings-dialog');
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Import Settings...',
            click: async () => {
              try {
                const result = await dialog.showOpenDialog(mainWindow, {
                  title: 'Import Settings',
                  defaultPath: app.getPath('documents'),
                  filters: [
                    { name: 'JSON Files', extensions: ['json'] },
                    { name: 'All Files', extensions: ['*'] }
                  ],
                  properties: ['openFile']
                });

                if (!result.canceled && result.filePaths.length > 0) {
                  const fs = require('fs').promises;
                  const importData = JSON.parse(await fs.readFile(result.filePaths[0], 'utf8'));
                  const importResult = importSettings(importData);
                  
                  if (importResult.success) {
                    dialog.showMessageBox(mainWindow, {
                      type: 'info',
                      title: 'Import Complete',
                      message: 'Settings imported successfully',
                      detail: 'The application will restart to apply the new settings.'
                    });
                    app.relaunch();
                    app.exit();
                  } else {
                    dialog.showErrorBox('Import Failed', importResult.error);
                  }
                }
              } catch (error) {
                dialog.showErrorBox('Import Error', error.message);
              }
            }
          },
          {
            label: 'Export Settings...',
            click: async () => {
              try {
                const result = await dialog.showSaveDialog(mainWindow, {
                  title: 'Export Settings',
                  defaultPath: path.join(app.getPath('documents'), 'hegel-pedagogy-ai-settings.json'),
                  filters: [
                    { name: 'JSON Files', extensions: ['json'] },
                    { name: 'All Files', extensions: ['*'] }
                  ]
                });

                if (!result.canceled) {
                  const fs = require('fs').promises;
                  const exportData = exportSettings();
                  await fs.writeFile(result.filePath, JSON.stringify(exportData, null, 2));
                  
                  dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'Export Complete',
                    message: 'Settings exported successfully',
                    detail: `Settings saved to: ${result.filePath}`
                  });
                }
              } catch (error) {
                dialog.showErrorBox('Export Error', error.message);
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Reset All Settings',
            click: () => {
              dialog.showMessageBox(mainWindow, {
                type: 'warning',
                title: 'Reset Settings',
                message: 'Are you sure you want to reset all settings to their default values?',
                detail: 'This action cannot be undone. The application will restart after resetting.',
                buttons: ['Cancel', 'Reset'],
                defaultId: 0,
                cancelId: 0
              }).then((result) => {
                if (result.response === 1) {
                  // Reset to defaults
                  appSettings = JSON.parse(JSON.stringify(defaultSettings));
                  saveSettings();
                  
                  dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'Reset Complete',
                    message: 'All settings have been reset to defaults',
                    detail: 'The application will restart to apply the changes.'
                  });
                  app.relaunch();
                  app.exit();
                }
              });
            }
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
            if (res.endsWith('.md') || res.endsWith('.markdown') || res.endsWith('.bib') || res.endsWith('.pdf') || res.endsWith('.html') || res.endsWith('.htm')) {
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

// Add H1 heading with filename if needed
function addH1HeadingIfNeeded(content, fileName) {
    console.log('[main.js] addH1HeadingIfNeeded called with:', { content: content.substring(0, 50), fileName });
    
    // Clean the filename for use as a heading
    const cleanFileName = fileName
        .replace(/[-_]/g, ' ') // Replace dashes and underscores with spaces
        .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize each word
    
    console.log('[main.js] Clean filename:', cleanFileName);
    
    // Check if content is empty or very short (just whitespace)
    const trimmedContent = content.trim();
    console.log('[main.js] Trimmed content length:', trimmedContent.length);
    
    if (trimmedContent.length === 0) {
        // Empty file - add H1 heading
        const result = `# ${cleanFileName}\n\n`;
        console.log('[main.js] Empty file - adding H1:', result);
        return result;
    }
    
    // Check if content already starts with an H1 heading
    const lines = content.split('\n');
    const firstNonEmptyLine = lines.find(line => line.trim().length > 0);
    console.log('[main.js] First non-empty line:', firstNonEmptyLine);
    
    if (firstNonEmptyLine && firstNonEmptyLine.trim().startsWith('# ')) {
        // Already has H1 heading - don't add another
        console.log('[main.js] Already has H1 - no change');
        return content;
    }
    
    // Check if content starts with slide markers (---) - presentation format
    if (firstNonEmptyLine && firstNonEmptyLine.trim() === '---') {
        // This is presentation content with slide markers
        // Add H1 as the first slide content, not before the markers
        console.log('[main.js] Detected slide markers - adding H1 as first slide');
        
        // Find the end of the first slide marker section
        let insertIndex = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === '---') {
                insertIndex = i + 1;
                break;
            }
        }
        
        // Insert the H1 heading after the first slide marker
        const beforeMarker = lines.slice(0, insertIndex);
        const afterMarker = lines.slice(insertIndex);
        const result = beforeMarker.concat([`# ${cleanFileName}`, ''], afterMarker).join('\n');
        console.log('[main.js] Adding H1 after first slide marker:', result.substring(0, 100));
        return result;
    }
    
    // Add H1 heading at the beginning (normal content)
    const result = `# ${cleanFileName}\n\n${content}`;
    console.log('[main.js] Adding H1 to beginning:', result.substring(0, 100));
    return result;
}

async function performSaveAs(options) {
     if (!mainWindow) {
          console.error('[main.js] Cannot show Save As dialog, mainWindow is not available.');
          return { success: false, error: 'Main window not found.' };
     }
     
     // Handle both old format (just content string) and new format (object with content and defaultDirectory)
     let content = typeof options === 'string' ? options : options.content;
     const defaultDirectory = typeof options === 'object' ? options.defaultDirectory : null;
     
     try {
         // Determine default path - use directory only for better dialog behavior
         let defaultPath;
         if (defaultDirectory) {
             defaultPath = defaultDirectory;
         } else if (currentFilePath && currentFilePath.trim() !== '') {
             defaultPath = path.dirname(currentFilePath);
         } else {
             defaultPath = app.getPath('documents');
         }
         
         const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Save Markdown File As',
            defaultPath: defaultPath,
            filters: [
                { name: 'Markdown Files', extensions: ['md', 'markdown'] },
                { name: 'BibTeX Files', extensions: ['bib'] },
                { name: 'PDF Files', extensions: ['pdf'] },
                { name: 'HTML Files', extensions: ['html', 'htm'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (canceled || !filePath) {
            console.log('[main.js] Save As dialog was cancelled.');
            return { success: false };
        }

        console.log(`[main.js] User chose path for Save As: ${filePath}`);
        // Add H1 heading with filename if needed
        const fileName = path.basename(filePath, path.extname(filePath)); // Remove extension
        const contentWithHeading = addH1HeadingIfNeeded(content, fileName);
        
        const result = await saveFile(filePath, contentWithHeading);
        
        // Include the updated content in the result so frontend can update the editor
        if (result.success) {
            result.updatedContent = contentWithHeading;
            result.contentChanged = contentWithHeading !== content;
        }
        
        return result;

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

// Global replace implementation
async function performGlobalReplace(searchQuery, replaceText, searchResults, options = {}) {
    const {
        caseSensitive = false,
        wholeWord = false,
        useRegex = false,
        previewOnly = false
    } = options;

    console.log(`[main.js] Performing global replace ${previewOnly ? '(preview)' : '(execute)'}`);
    
    // Group search results by file
    const fileGroups = {};
    searchResults.forEach(result => {
        if (!fileGroups[result.file]) {
            fileGroups[result.file] = [];
        }
        fileGroups[result.file].push(result);
    });

    const results = [];
    const modifiedFilePaths = [];
    let totalReplacements = 0;

    for (const [filePath, fileResults] of Object.entries(fileGroups)) {
        try {
            const originalContent = await fs.readFile(filePath, 'utf8');
            const lines = originalContent.split('\n');
            let modifiedLines = [...lines];
            let fileReplacements = 0;
            const fileResults_sorted = fileResults.sort((a, b) => b.line - a.line); // Sort in reverse order

            // Create search pattern
            let searchPattern;
            if (useRegex) {
                try {
                    searchPattern = new RegExp(searchQuery, caseSensitive ? 'g' : 'gi');
                } catch (error) {
                    throw new Error(`Invalid regex pattern: ${error.message}`);
                }
            } else {
                const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const wordBoundary = wholeWord ? '\\b' : '';
                const flags = caseSensitive ? 'g' : 'gi';
                searchPattern = new RegExp(`${wordBoundary}${escapedQuery}${wordBoundary}`, flags);
            }

            // Process replacements
            for (const result of fileResults_sorted) {
                const lineIndex = result.line - 1; // Convert to 0-based index
                if (lineIndex >= 0 && lineIndex < modifiedLines.length) {
                    const originalLine = modifiedLines[lineIndex];
                    const newLine = originalLine.replace(searchPattern, replaceText);
                    
                    if (newLine !== originalLine) {
                        if (previewOnly) {
                            results.push({
                                file: filePath,
                                fileName: path.basename(filePath),
                                line: result.line,
                                originalLine: originalLine,
                                replacedLine: newLine
                            });
                        } else {
                            modifiedLines[lineIndex] = newLine;
                            results.push({
                                file: filePath,
                                fileName: path.basename(filePath),
                                line: result.line
                            });
                        }
                        fileReplacements++;
                        totalReplacements++;
                    }
                }
            }

            // Write modified content to file (only if not preview and changes were made)
            if (!previewOnly && fileReplacements > 0) {
                const newContent = modifiedLines.join('\n');
                await fs.writeFile(filePath, newContent, 'utf8');
                modifiedFilePaths.push(filePath);
                console.log(`[main.js] Modified ${filePath} with ${fileReplacements} replacements`);
            }

        } catch (error) {
            console.error(`[main.js] Error processing file ${filePath}:`, error);
            // Continue with other files
        }
    }

    const fileCount = Object.keys(fileGroups).length;
    
    if (previewOnly) {
        return {
            preview: results,
            matchCount: totalReplacements,
            fileCount: fileCount
        };
    } else {
        return {
            results: results,
            replacedCount: totalReplacements,
            modifiedFiles: modifiedFilePaths.length,
            modifiedFilePaths: modifiedFilePaths
        };
    }
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
                { name: 'BibTeX Files', extensions: ['bib'] },
                { name: 'PDF Files', extensions: ['pdf'] },
                { name: 'HTML Files', extensions: ['html', 'htm'] },
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
  
  // Use saved working directory from settings, fallback to project root
  if (appSettings.workingDirectory && appSettings.workingDirectory.length > 0) {
    currentWorkingDirectory = appSettings.workingDirectory;
    console.log(`[main.js] Using saved working directory: ${currentWorkingDirectory}`);
  } else {
    // Default to project root (parent of app directory)
    currentWorkingDirectory = path.resolve(app.getAppPath(), '..');
    console.log(`[main.js] Using project root as working directory: ${currentWorkingDirectory}`);
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

  // Handler for getting available markdown files (for graph visualization)
  ipcMain.handle('get-available-files', async (event) => {
    try {
      const files = await getFiles(currentWorkingDirectory);
      // Filter for markdown files - files are objects with path and type properties
      const markdownFiles = files
        .filter(file => file.type === 'file' && (file.path.endsWith('.md') || file.path.endsWith('.markdown')))
        .map(file => file.path); // Return just the paths
      console.log(`[main.js] Found ${markdownFiles.length} markdown files for graph`);
      return markdownFiles;
    } catch (error) {
      console.error('[main.js] Error getting available files:', error);
      return [];
    }
  });

  // Handler for opening files from graph visualization
  ipcMain.handle('open-file', async (event, filePath) => {
    try {
      console.log(`[main.js] Opening file from graph: ${filePath}`);
      
      // Set current file path and update UI
      currentFilePath = filePath;
      
      // Send file-opened event to renderer
      if (mainWindow) {
        mainWindow.webContents.send('file-opened', { 
          filePath: filePath,
          switchToEditor: true 
        });
      }
      
      return { success: true };
    } catch (error) {
      console.error('[main.js] Error opening file from graph:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-initial-theme', (event) => {
    return nativeTheme.shouldUseDarkColors;
  });

  ipcMain.handle('set-current-file', (event, filePath) => {
    console.log('[main.js] set-current-file called with:', filePath);
    if (typeof filePath === 'string') {
        currentFilePath = filePath;  // Update the current file path for save operations
        appSettings.currentFile = filePath;
        console.log('[main.js] Updated appSettings.currentFile to:', appSettings.currentFile);
        saveSettings();
        console.log('[main.js] Settings saved successfully');
        return { success: true };
    } else if (filePath === null) {
        currentFilePath = null;
        appSettings.currentFile = '';
        console.log('[main.js] Cleared currentFile (set to empty string)');
        saveSettings();
        console.log('[main.js] Settings saved successfully');
        return { success: true };
    } else {
        console.error('[main.js] Invalid file path type:', typeof filePath, filePath);
        return { success: false, error: 'Invalid file path' };
    }
});

  ipcMain.handle('open-file-path', async (event, filePath) => {
    try {
        if (!filePath || typeof filePath !== 'string') {
            throw new Error('No file path specified');
        }
        const content = await fs.readFile(filePath, 'utf8');
        currentFilePath = filePath; // Update global current file path
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

// NEW: Read file content without side effects (for previews, internal links, etc.)
ipcMain.handle('read-file-content', async (event, filePath) => {
    try {
        if (!filePath || typeof filePath !== 'string') {
            throw new Error('No file path specified');
        }
        
        console.log(`[main.js] read-file-content called with: ${filePath}`);
        console.log(`[main.js] Current working directory: ${currentWorkingDirectory}`);
        
        // Handle both absolute and relative paths
        let fullPath;
        if (path.isAbsolute(filePath)) {
            fullPath = filePath;
            console.log(`[main.js] Using absolute path: ${fullPath}`);
        } else {
            // Resolve relative paths from the current working directory
            fullPath = path.resolve(currentWorkingDirectory, filePath);
            console.log(`[main.js] Resolved relative path to: ${fullPath}`);
        }
        
        // Check if file exists
        try {
            await fs.access(fullPath);
        } catch {
            console.error(`[main.js] File does not exist at: ${fullPath}`);
            // Try without extension if it's a markdown file without extension
            if (!filePath.endsWith('.md')) {
                const mdPath = fullPath + '.md';
                try {
                    await fs.access(mdPath);
                    fullPath = mdPath;
                    console.log(`[main.js] Found file with .md extension: ${fullPath}`);
                } catch {
                    // Keep original path
                }
            }
        }
        
        console.log(`[main.js] read-file-content: Reading file from: ${fullPath}`);
        const content = await fs.readFile(fullPath, 'utf8');
        console.log('[main.js] Successfully read file, current file remains:', currentFilePath);
        // DO NOT change currentFilePath or settings - just return the content
        return { success: true, filePath: fullPath, content };
    } catch (err) {
        console.error('[main.js] Error reading file content:', err);
        console.error('[main.js] Failed path was:', filePath);
        return { success: false, error: err.message };
    }
});

// Open file by filename (used by network visualization)
ipcMain.handle('perform-open-file', async (event, filename) => {
  try {
    if (!filename || typeof filename !== 'string') {
      throw new Error('No filename specified');
    }
    
    // Construct full path by joining with current working directory
    const workingDir = appSettings.workingDirectory || process.cwd();
    const filePath = path.join(workingDir, filename);
    
    console.log(`[main.js] Opening file: ${filename} at path: ${filePath}`);
    
    // Check if file exists
    if (!fsSync.existsSync(filePath)) {
      throw new Error(`File not found: ${filename}`);
    }
    
    const content = await fs.readFile(filePath, 'utf8');
    currentFilePath = filePath; // Update global current file path
    appSettings.currentFile = filePath;
    saveSettings();
    
    if (mainWindow) {
      mainWindow.setTitle(`Hegel Pedagogy AI - ${filename}`);
    }
    
    // Send the file content to the renderer
    mainWindow.webContents.send('file-opened', { content, filePath, filename });
    
    return { success: true, filePath, content, filename };
  } catch (err) {
    console.error('[main.js] Error opening file:', err);
    return { success: false, error: err.message };
  }
});

// Kanban board file operations
ipcMain.handle('read-file', async (event, filePath) => {
  try {
      if (!filePath || typeof filePath !== 'string') {
          throw new Error('No file path specified');
      }
      
      // Handle both absolute and relative paths
      let fullPath;
      if (path.isAbsolute(filePath)) {
          fullPath = filePath;
      } else {
          // Resolve relative paths from the current working directory
          fullPath = path.resolve(currentWorkingDirectory, filePath);
      }
      
      console.log(`[main.js] Reading file from: ${fullPath} (cwd: ${currentWorkingDirectory})`);
      const content = await fs.readFile(fullPath, 'utf8');
      return content;
  } catch (err) {
      console.error(`[main.js] Failed to read file at ${filePath}:`, err);
      throw err;
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
      if (!filePath || typeof filePath !== 'string') {
          throw new Error('No file path specified');
      }
      if (typeof content !== 'string') {
          throw new Error('Content must be a string');
      }
      await fs.writeFile(filePath, content, 'utf8');
      return { success: true };
  } catch (err) {
      console.error(`[main.js] Failed to write file at ${filePath}:`, err);
      throw err;
  }
});

  ipcMain.handle('send-chat-message', async (event, userMessage) => {
    if (!aiService || aiService.getAvailableProviders().length === 0) {
        console.error('[main.js] AI Service not available. Cannot send chat message.');
        return { error: 'AI Service not configured. Please check server logs and API keys in .env file.' };
    }
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim() === '') {
        console.error('[main.js] Invalid user message received.');
        return { error: 'Invalid message format.' };
    }
    console.log(`[main.js] 🤖 Received chat message: "${userMessage.substring(0, 100)}..."`);
    console.log('[main.js] 📝 Message preview being sent to AI service:');
    console.log('[main.js] Message length:', userMessage.length, 'characters');
    console.log('[main.js] ---------- MESSAGE PREVIEW START ----------');
    console.log(userMessage.substring(0, 200) + (userMessage.length > 200 ? '...' : ''));
    console.log('[main.js] ----------- MESSAGE PREVIEW END -----------');
    
    try {
      const response = await aiService.sendMessage(userMessage);
      console.log(`[main.js] AI response from ${response.provider} (${response.model}):`, response.response?.substring(0, 100) + '...');
      
      return {
        response: response.response,
        provider: response.provider,
        model: response.model,
        usage: response.usage
      };
    } catch (error) {
        console.error('[main.js] Error calling AI API:', error);
        let errorMessage = 'An error occurred while contacting the AI service.';
        
        if (error.message) {
            if (error.message.includes('401')) {
                errorMessage = 'Invalid API key. Please check your API key configuration.';
            } else if (error.message.includes('429')) {
                errorMessage = 'Rate limit exceeded. Please try again later.';
            } else if (error.message.includes('402')) {
                errorMessage = 'Quota exceeded. Please check your billing.';
            } else {
                errorMessage = `API Error: ${error.message}`;
            }
        }
        
        return { error: errorMessage };
    }
  });

  // AI Provider Management Handlers
  ipcMain.handle('get-available-ai-providers', async (event) => {
    if (!aiService) {
      return { providers: [], defaultProvider: null };
    }
    
    return {
      providers: aiService.getAvailableProviders(),
      defaultProvider: aiService.getDefaultProvider()
    };
  });

  ipcMain.handle('get-default-ai-provider', async (event) => {
    if (!aiService) {
      return null;
    }
    
    return aiService.getDefaultProvider();
  });

  ipcMain.handle('get-provider-models', async (event, provider) => {
    if (!aiService) {
      return { models: [] };
    }
    
    try {
      const models = aiService.getProviderModels(provider);
      return { models };
    } catch (error) {
      console.error('[main.js] Error getting provider models:', error);
      return { models: [], error: error.message };
    }
  });

  ipcMain.handle('set-default-ai-provider', async (event, provider) => {
    if (!aiService) {
      return { success: false, error: 'AI Service not available' };
    }
    
    try {
      aiService.setDefaultProvider(provider);
      return { success: true };
    } catch (error) {
      console.error('[main.js] Error setting default provider:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('send-chat-message-with-options', async (event, userMessage, options = {}) => {
    if (!aiService || aiService.getAvailableProviders().length === 0) {
        console.error('[main.js] AI Service not available. Cannot send chat message.');
        return { error: 'AI Service not configured. Please check server logs and API keys in .env file.' };
    }
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim() === '') {
        console.error('[main.js] Invalid user message received.');
        return { error: 'Invalid message format.' };
    }
    
    console.log(`[main.js] 🤖 Received chat message with options: "${userMessage.substring(0, 100)}..."`);
    console.log('[main.js] 📝 Message preview being sent to AI service:');
    console.log('[main.js] Message length:', userMessage.length, 'characters');
    console.log('[main.js] Chat options:', options);
    console.log('[main.js] ---------- MESSAGE PREVIEW START ----------');
    console.log(userMessage.substring(0, 200) + (userMessage.length > 200 ? '...' : ''));
    console.log('[main.js] ----------- MESSAGE PREVIEW END -----------');
    
    try {
      const response = await aiService.sendMessage(userMessage, options);
      console.log(`[main.js] AI response from ${response.provider} (${response.model}):`, response.response?.substring(0, 100) + '...');
      
      return {
        response: response.response,
        provider: response.provider,
        model: response.model,
        usage: response.usage
      };
    } catch (error) {
        console.error('[main.js] Error calling AI API:', error);
        let errorMessage = 'An error occurred while contacting the AI service.';
        
        if (error.message) {
            if (error.message.includes('401')) {
                errorMessage = 'Invalid API key. Please check your API key configuration.';
            } else if (error.message.includes('429')) {
                errorMessage = 'Rate limit exceeded. Please try again later.';
            } else if (error.message.includes('402')) {
                errorMessage = 'Quota exceeded. Please check your billing.';
            } else {
                errorMessage = `API Error: ${error.message}`;
            }
        }
        
        return { error: errorMessage };
    }
  });

  // Enhanced AI Chat with File Context
  ipcMain.handle('send-chat-message-with-context', async (event, data) => {
    const { message, fileContext, currentFile } = data;
    
    if (!aiService || aiService.getAvailableProviders().length === 0) {
      console.error('[main.js] AI Service not available. Cannot send chat message.');
      return { error: 'AI Service not configured. Please check server logs and API keys in .env file.' };
    }

    try {
      console.log(`[main.js] 🤖 Received chat message with context: "${message.substring(0, 100)}..."`);
      
      // Build enhanced prompt with file context
      let enhancedPrompt = `You are an AI assistant similar to Claude Code, helping with a Hegel Pedagogy AI project. `;
      
      if (currentFile) {
        enhancedPrompt += `Currently working on file: ${currentFile}\n\n`;
      }
      
      if (fileContext && fileContext.files && fileContext.files.length > 0) {
        enhancedPrompt += `Available files in the working directory:\n`;
        // Limit to first 5 files to keep context manageable
        const filesToInclude = fileContext.files.slice(0, 5);
        filesToInclude.forEach(file => {
          enhancedPrompt += `\n**${file.name}** (${file.fullSize || file.size} chars):\n${file.content}\n`;
        });
        if (fileContext.files.length > 5) {
          enhancedPrompt += `\n... and ${fileContext.files.length - 5} more files\n`;
        }
        enhancedPrompt += `\n---\n\n`;
      }
      
      if (fileContext && fileContext.workingDirectory) {
        enhancedPrompt += `Working directory: ${fileContext.workingDirectory}\n\n`;
      }
      
      enhancedPrompt += `User request: ${message}`;

      console.log('[main.js] 📝 Enhanced message preview being sent to AI service:');
      console.log('[main.js] Message length:', enhancedPrompt.length, 'characters');
      console.log('[main.js] ---------- ENHANCED MESSAGE PREVIEW START ----------');
      console.log(enhancedPrompt.substring(0, 200) + (enhancedPrompt.length > 200 ? '...' : ''));
      console.log('[main.js] ----------- ENHANCED MESSAGE PREVIEW END -----------');

      const response = await aiService.sendMessage(enhancedPrompt);
      console.log(`[main.js] AI response from ${response.provider} (${response.model}):`, response.response?.substring(0, 100) + '...');
      
      return {
        response: response.response,
        provider: response.provider,
        model: response.model,
        usage: response.usage
      };
    } catch (error) {
      console.error('[main.js] Error calling AI API:', error);
      let errorMessage = 'An error occurred while contacting the AI service.';
      
      if (error.message) {
        if (error.message.includes('401')) {
          errorMessage = 'Invalid API key. Please check your API key configuration.';
        } else if (error.message.includes('429')) {
          errorMessage = 'Rate limit exceeded. Please try again later.';
        } else if (error.message.includes('402')) {
          errorMessage = 'Quota exceeded. Please check your billing.';
        } else {
          errorMessage = `API Error: ${error.message}`;
        }
      }
      
      return { error: errorMessage };
    }
  });

  // File System Context Handler
  ipcMain.handle('get-file-context', async (event) => {
    try {
      const files = [];
      const workingDir = currentWorkingDirectory;
      
      // Read all .md, .txt, and other text files
      const dirEntries = await fs.readdir(workingDir, { withFileTypes: true });
      const textExtensions = ['.md', '.txt', '.json', '.js', '.css', '.html', '.py', '.ts', '.tsx', '.jsx'];
      
      for (const entry of dirEntries) {
        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (textExtensions.includes(ext)) {
            try {
              const filePath = path.join(workingDir, entry.name);
              const stats = await fs.stat(filePath);
              // Only read files under 10KB to prevent memory issues and limit context
              if (stats.size < 10000) {
                const content = await fs.readFile(filePath, 'utf8');
                // Limit content to first 300 characters for context
                const contextContent = content.length > 300 ? 
                  content.substring(0, 300) + '\n[... truncated ...]' : 
                  content;
                  
                files.push({
                  name: entry.name,
                  content: contextContent,
                  fullSize: stats.size,
                  size: contextContent.length,
                  extension: ext
                });
              }
            } catch (error) {
              console.warn(`[main.js] Could not read file ${entry.name}:`, error.message);
            }
          }
        }
      }
      
      return {
        workingDirectory: workingDir,
        files: files,
        totalFiles: files.length
      };
    } catch (error) {
      console.error('[main.js] Error getting file context:', error);
      return { error: error.message };
    }
  });

  // Directory Listing Handler
  ipcMain.handle('list-directory-files', async (event, subdir) => {
    try {
      let targetDir;
      if (subdir) {
        // Handle both absolute and relative paths
        if (path.isAbsolute(subdir)) {
          targetDir = subdir;
        } else {
          // Resolve relative paths from the current working directory
          targetDir = path.resolve(currentWorkingDirectory, subdir);
        }
      } else {
        targetDir = currentWorkingDirectory;
      }
      
      console.log(`[main.js] Listing directory: ${targetDir}`);
      const dirEntries = await fs.readdir(targetDir, { withFileTypes: true });
      return dirEntries.map(entry => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile()
      }));
    } catch (error) {
      console.error(`[main.js] Error listing directory ${subdir || 'root'}:`, error.message);
      return [];
    }
  });

  // Working Directory Handler
  ipcMain.handle('get-working-directory', async (event) => {
    return currentWorkingDirectory;
  });

  // REMOVED: Duplicate read-file-content handler (keeping the one at line 2203)

  // Test handler for debugging AI service
  ipcMain.handle('test-ai-service', async (event) => {
    console.log('[main.js] Testing AI service...');
    
    if (!aiService) {
      return { success: false, error: 'AI Service not initialized' };
    }
    
    console.log('[main.js] Available providers:', aiService.getAvailableProviders());
    console.log('[main.js] Default provider:', aiService.getDefaultProvider());
    
    try {
      const testMessage = 'Hello, this is a test message. Please respond with "Test successful".';
      console.log('[main.js] Sending test message...');
      
      const response = await aiService.sendMessage(testMessage);
      console.log('[main.js] Test response received:', response);
      
      return { 
        success: true, 
        provider: response.provider,
        model: response.model,
        response: response.response 
      };
    } catch (error) {
      console.error('[main.js] Test failed:', error);
      return { 
        success: false, 
        error: error.message,
        stack: error.stack
      };
    }
  });

  // AI Text Summarization Handler
  ipcMain.handle('summarize-text-to-notes', async (event, selectedText) => {
    if (!aiService || aiService.getAvailableProviders().length === 0) {
      console.error('[main.js] AI Service not available. Cannot summarize text.');
      return { error: 'AI Service not configured. Please check server logs and API keys in .env file.' };
    }
    
    if (!selectedText || typeof selectedText !== 'string' || selectedText.trim() === '') {
      console.error('[main.js] Invalid text received for summarization.');
      return { error: 'Invalid text format.' };
    }
    
    console.log(`[main.js] Received text for summarization: "${selectedText.substring(0, 100)}..."`);
    
    try {
      const prompt = `Please analyze the following text and provide:
1. A concise heading that captures the main topic
2. 2-4 bullet points summarizing the key ideas

Text to analyze:
"${selectedText}"

Format your response as:
HEADING: [your heading here]
BULLETS:
- [bullet point 1]
- [bullet point 2]
- [bullet point 3]
- [bullet point 4]

Keep it concise and focused on the most important points.`;

      const response = await aiService.sendMessage(prompt, {
        temperature: 1.0, // Lower temperature for more focused summaries
        maxTokens: 300
      });
      
      console.log(`[main.js] AI summarization from ${response.provider}: Generated heading and bullets`);
      
      // Parse the response to extract heading and bullets
      const responseText = response.response;
      const headingMatch = responseText.match(/HEADING:\s*(.+?)(?:\n|BULLETS:|$)/i);
      const bulletsMatch = responseText.match(/BULLETS:\s*([\s\S]*)/i);
      
      let heading = 'Summary';
      let bullets = [];
      
      if (headingMatch) {
        heading = headingMatch[1].trim();
      }
      
      if (bulletsMatch) {
        const bulletText = bulletsMatch[1];
        bullets = bulletText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('-') || line.startsWith('•'))
          .map(line => line.replace(/^[-•]\s*/, ''));
      }
      
      // Create the visible summary content (heading + bullets)
      const summaryContent = bullets.length > 0 
        ? `## ${heading}\n\n${bullets.map(bullet => `- ${bullet}`).join('\n')}`
        : `## ${heading}\n\n- ${responseText.replace(/^(HEADING:|BULLETS:)/gm, '').trim()}`;
      
      // Create the replacement text: slide marker + summary above + original text in notes
      const wrappedText = `---\n\n${summaryContent}\n\n\`\`\`notes\n${selectedText}\n\`\`\``;
      
      return {
        success: true,
        heading,
        bullets,
        summaryContent,
        wrappedText,
        provider: response.provider,
        model: response.model
      };
    } catch (error) {
      console.error('[main.js] Error in AI text summarization:', error);
      let errorMessage = 'An error occurred while summarizing the text.';
      
      if (error.message) {
        if (error.message.includes('401')) {
          errorMessage = 'Invalid API key. Please check your API key configuration.';
        } else if (error.message.includes('429')) {
          errorMessage = 'Rate limit exceeded. Please try again later.';
        } else if (error.message.includes('402')) {
          errorMessage = 'Quota exceeded. Please check your billing.';
        } else {
          errorMessage = `API Error: ${error.message}`;
        }
      }
      
      return { error: errorMessage };
    }
  });

  // Extract Notes Content Handler
  ipcMain.handle('extract-notes-content', async (event, selectedText) => {
    if (!selectedText || typeof selectedText !== 'string' || selectedText.trim() === '') {
      console.error('[main.js] Invalid text received for notes extraction.');
      return { error: 'Invalid text format.' };
    }
    
    console.log(`[main.js] Received text for notes extraction: "${selectedText.substring(0, 100)}..."`);
    
    try {
      // Look for ```notes blocks in the selected text
      const notesRegex = /```notes\s*\n([\s\S]*?)\n```/gi;
      const matches = [];
      let match;
      
      while ((match = notesRegex.exec(selectedText)) !== null) {
        matches.push(match[1].trim());
      }
      
      if (matches.length === 0) {
        return {
          error: 'No ```notes blocks found in the selected text.'
        };
      }
      
      // Join all found notes content with double newlines
      const extractedContent = matches.join('\n\n');
      
      console.log(`[main.js] Successfully extracted ${matches.length} notes block(s)`);
      
      return {
        success: true,
        extractedContent,
        blocksFound: matches.length
      };
    } catch (error) {
      console.error('[main.js] Error extracting notes content:', error);
      return { error: 'An error occurred while extracting notes content.' };
    }
  });

  ipcMain.handle('perform-save', async (event, content) => {
    console.log(`[main.js] Received perform-save. Current path: "${currentFilePath}"`);
    
    if (currentFilePath && typeof currentFilePath === 'string' && currentFilePath.trim() !== '') {
        return await saveFile(currentFilePath, content);
    } else {
        console.log('[main.js] No valid current path for auto-save, skipping save operation.');
        // Don't trigger Save As dialog for auto-save operations - just return failure
        // This prevents addH1HeadingIfNeeded from being called during auto-save
        return { success: false, error: 'No current file path available for save operation' };
    }
  });

  ipcMain.handle('perform-save-as', async (event, options) => {
    return await performSaveAs(options);
  });

  // Trigger new file creation (for programmatic access)
  ipcMain.handle('trigger-new-file', async (event) => {
    console.log('[main.js] Programmatic new file triggered.');
    currentFilePath = null;
    if (mainWindow) {
      mainWindow.setTitle('Hegel Pedagogy AI - Untitled');
      mainWindow.webContents.send('new-file-created');
      console.log('[main.js] Sent new-file-created signal to renderer.');
    }
    return { success: true };
  });

  // Check if a file exists
  ipcMain.handle('check-file-exists', async (event, filePath) => {
    try {
      const stats = await fs.stat(filePath);
      return stats.isFile();
    } catch (error) {
      return false; // File doesn't exist or other error
    }
  });

  // Create internal link file automatically
  ipcMain.handle('create-internal-link-file', async (event, { filePath, content, originalLink }) => {
    console.log(`[main.js] Creating internal link file: ${filePath}`);
    try {
      // Double-check that file doesn't already exist to prevent accidental overwrites
      const fsSync = require('fs');
      if (fsSync.existsSync(filePath)) {
        console.warn(`[main.js] Refusing to create file - already exists: ${filePath}`);
        return { success: false, error: 'File already exists', filePath };
      }
      
      // Ensure directory exists
      const dirPath = path.dirname(filePath);
      await fs.mkdir(dirPath, { recursive: true });
      
      // Write the file
      await fs.writeFile(filePath, content, 'utf8');
      
      console.log(`[main.js] Internal link file created successfully: ${filePath}`);
      
      // Update current file path
      currentFilePath = filePath;
      if (mainWindow) {
        mainWindow.setTitle(`Hegel Pedagogy AI - ${path.basename(filePath)}`);
      }
      
      return { 
        success: true, 
        filePath: filePath,
        message: `Created file for internal link: ${originalLink}`
      };
    } catch (error) {
      console.error(`[main.js] Error creating internal link file: ${error.message}`);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // Extract text to new file feature
  ipcMain.handle('extract-text-to-file', async (event, { filePath, content, fileName }) => {
    console.log(`[main.js] Extracting text to new file: ${filePath}`);
    try {
      // Check if file already exists
      try {
        await fs.access(filePath);
        return {
          success: false,
          error: `File "${fileName}.md" already exists. Please choose a different name.`
        };
      } catch (err) {
        // File doesn't exist, which is good
      }
      
      // Ensure directory exists
      const dirPath = path.dirname(filePath);
      await fs.mkdir(dirPath, { recursive: true });
      
      // Add H1 heading if needed using the same logic as save operations
      const finalContent = addH1HeadingIfNeeded(content, fileName);
      
      // Write the file
      await fs.writeFile(filePath, finalContent, 'utf8');
      
      console.log(`[main.js] Text extracted to new file successfully: ${filePath}`);
      
      return { 
        success: true, 
        filePath: filePath,
        message: `Extracted text to new file: ${fileName}.md`
      };
    } catch (error) {
      console.error(`[main.js] Error extracting text to file: ${error.message}`);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // Combined extract text and replace feature - handles both operations atomically
  ipcMain.handle('extract-text-with-replacement', async (event, { 
    originalFilePath, textToReplace, replacementText, 
    newFilePath, newFileContent, fileName 
  }) => {
    console.log(`[main.js] Extract text with replacement - original: ${originalFilePath}, new: ${newFilePath}`);
    
    try {
      // Step 1: Check if new file already exists
      try {
        await fs.access(newFilePath);
        return {
          success: false,
          error: `File "${fileName}.md" already exists. Please choose a different name.`
        };
      } catch (err) {
        // File doesn't exist, which is good - we can create it
      }

      // Step 2: Read the original file
      if (!originalFilePath || !await fs.access(originalFilePath).then(() => true).catch(() => false)) {
        return {
          success: false,
          error: 'Original file not found or not accessible'
        };
      }

      let originalContent;
      try {
        originalContent = await fs.readFile(originalFilePath, 'utf8');
        console.log(`[main.js] Read original file content (${originalContent.length} chars)`);
      } catch (error) {
        return {
          success: false,
          error: `Failed to read original file: ${error.message}`
        };
      }

      // Step 3: Replace the text in original content
      const updatedOriginalContent = originalContent.replace(textToReplace, replacementText);
      console.log(`[main.js] Text replacement - original length: ${originalContent.length}, new length: ${updatedOriginalContent.length}`);
      console.log(`[main.js] Replacement successful: ${updatedOriginalContent.includes(replacementText)}`);

      // Step 4: Write the updated original file
      try {
        await fs.writeFile(originalFilePath, updatedOriginalContent, 'utf8');
        console.log(`[main.js] ✅ Successfully updated original file with internal link`);
      } catch (error) {
        return {
          success: false,
          error: `Failed to update original file: ${error.message}`
        };
      }

      // Step 5: Create the new file
      try {
        const dirPath = path.dirname(newFilePath);
        await fs.mkdir(dirPath, { recursive: true });
        
        // Add H1 heading if needed
        const finalNewContent = addH1HeadingIfNeeded(newFileContent, fileName);
        
        await fs.writeFile(newFilePath, finalNewContent, 'utf8');
        console.log(`[main.js] ✅ Successfully created new file: ${newFilePath}`);
      } catch (error) {
        // If new file creation fails, try to restore original file
        try {
          await fs.writeFile(originalFilePath, originalContent, 'utf8');
          console.log(`[main.js] Restored original file after new file creation failed`);
        } catch (restoreError) {
          console.error(`[main.js] Failed to restore original file:`, restoreError);
        }
        
        return {
          success: false,
          error: `Failed to create new file: ${error.message}`
        };
      }

      // Step 6: Success - return updated content for editor reload
      return {
        success: true,
        filePath: newFilePath,
        fileName: fileName,
        updatedOriginalContent: updatedOriginalContent,
        message: `Extracted text to new file: ${fileName}.md and inserted internal link`
      };

    } catch (error) {
      console.error(`[main.js] Error in extract-text-with-replacement:`, error);
      return {
        success: false,
        error: `Extraction failed: ${error.message}`
      };
    }
  });


  // Handle HTML export with pandoc and bibliography support
  ipcMain.handle('perform-export-html', async (event, content, htmlContent, exportOptions) => {
    console.log('[main.js] Received perform-export-html with options:', exportOptions);
    try {
      const { dialog } = require('electron');
      const { spawn } = require('child_process');
      const path = require('path');
      const os = require('os');
      
      const defaultPath = currentFilePath ? 
        currentFilePath.replace(/\.[^/.]+$/, '.html') : 
        'export.html';
      
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export as HTML',
        defaultPath: defaultPath,
        filters: [
          { name: 'HTML Files', extensions: ['html'] }
        ]
      });

      if (result.canceled) {
        return { success: false, cancelled: true };
      }

      // Try to use pandoc if available
      const hasPandoc = await checkPandocAvailability();
      let finalHtml = htmlContent;
      
      if (hasPandoc && exportOptions?.usePandoc !== false) {
        console.log('[main.js] Using pandoc for HTML export');
        
        // Find .bib files in current directory
        const bibFiles = await findBibFiles();
        
        // Create temporary markdown file
        const tempDir = os.tmpdir();
        const tempMdFile = path.join(tempDir, 'temp_export.md');
        await fs.writeFile(tempMdFile, content, 'utf8');
        
        try {
          const pandocArgs = [
            tempMdFile,
            '-f', 'markdown',
            '-t', 'html5',
            '--standalone',
            '--toc',
            '--toc-depth=3',
            '--number-sections'
          ];
          
          // Add bibliography support if .bib files found
          if (bibFiles.length > 0) {
            console.log(`[main.js] Found ${bibFiles.length} .bib file(s):`, bibFiles.map(f => path.basename(f)));
            pandocArgs.push('--citeproc');
            bibFiles.forEach(bibFile => {
              pandocArgs.push('--bibliography', bibFile);
            });
            // Add citation style
            const cslStyle = await getDefaultCSLStyle();
            if (cslStyle) {
              pandocArgs.push('--csl', cslStyle);
            }
          }
          
          // Add custom pandoc options if provided
          if (exportOptions?.pandocArgs) {
            pandocArgs.push(...exportOptions.pandocArgs);
          }
          
          finalHtml = await runPandoc(pandocArgs);
          console.log('[main.js] Pandoc HTML export completed successfully');
        } catch (pandocError) {
          console.warn('[main.js] Pandoc export failed, falling back to basic HTML:', pandocError.message);
          // Fall back to the original HTML content
        } finally {
          // Clean up temp file
          try {
            await fs.unlink(tempMdFile);
          } catch (e) {
            console.warn('[main.js] Could not clean up temp file:', e.message);
          }
        }
      } else if (!hasPandoc) {
        console.log('[main.js] Pandoc not available, using basic HTML export');
      }

      await fs.writeFile(result.filePath, finalHtml, 'utf8');
      console.log(`[main.js] HTML exported successfully to: ${result.filePath}`);
      return { 
        success: true, 
        filePath: result.filePath, 
        usedPandoc: hasPandoc && exportOptions?.usePandoc !== false,
        bibFilesFound: hasPandoc ? (await findBibFiles()).length : 0
      };
    } catch (error) {
      console.error('[main.js] Error exporting HTML:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle HTML export with pandoc and bibliography support (with References)
  ipcMain.handle('perform-export-html-pandoc', async (event, content, htmlContent, exportOptions) => {
    console.log('[main.js] Received perform-export-html-pandoc with options:', exportOptions);
    try {
      const { dialog } = require('electron');
      const path = require('path');
      const os = require('os');
      
      const defaultPath = currentFilePath ? 
        currentFilePath.replace(/\.[^/.]+$/, '.html') : 
        'export.html';
      
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export as HTML (with References)',
        defaultPath: defaultPath,
        filters: [
          { name: 'HTML Files', extensions: ['html'] }
        ]
      });

      if (result.canceled) {
        return { success: false, cancelled: true };
      }

      console.log('[main.js] Using pandoc for HTML export with bibliography support');
      
      // Find .bib files for citations
      const bibFiles = await findBibFiles();
      
      // Create temporary markdown file
      const tempDir = os.tmpdir();
      const tempMdFile = path.join(tempDir, 'temp_html_pandoc_export.md');
      console.log('[main.js] Working directory:', currentWorkingDirectory);
      console.log('[main.js] Temp directory:', tempDir);
      console.log('[main.js] Temp markdown file:', tempMdFile);
      
      await fs.writeFile(tempMdFile, content);
      console.log('[main.js] Written markdown content to temp file');
      
      // Prepare pandoc args for HTML with bibliography
      const pandocArgs = [
        tempMdFile,
        '-t', 'html5',
        '--standalone',
        '--mathjax',
        '--highlight-style=pygments',
        '-o', result.filePath
      ];
      
      if (bibFiles.length > 0) {
        console.log('[main.js] Found .bib files:', bibFiles);
        pandocArgs.push('--citeproc');
        bibFiles.forEach(bibFile => {
          pandocArgs.push('--bibliography', bibFile);
        });
        const cslStyle = await getDefaultCSLStyle();
        if (cslStyle) {
          console.log('[main.js] Adding CSL style for HTML:', cslStyle);
          pandocArgs.push('--csl', cslStyle);
        }
      }
      
      // Change to the correct working directory before running pandoc
      const originalCwd = process.cwd();
      if (currentWorkingDirectory && currentWorkingDirectory !== originalCwd) {
        console.log('[main.js] Changing working directory from', originalCwd, 'to', currentWorkingDirectory);
        process.chdir(currentWorkingDirectory);
      }
      
      try {
        console.log('[main.js] Running pandoc with args:', pandocArgs);
        
        // Add custom pandoc options if provided
        if (exportOptions?.pandocArgs) {
          console.log('[main.js] Adding custom pandoc args:', exportOptions.pandocArgs);
          pandocArgs.push(...exportOptions.pandocArgs);
        }
        
        await runPandoc(pandocArgs);
        
        console.log('[main.js] Pandoc HTML export completed successfully');
        
        return {
          success: true,
          filePath: result.filePath,
          usedPandoc: true,
          bibFilesFound: bibFiles.length
        };
        
      } finally {
        // Restore original working directory
        if (currentWorkingDirectory && currentWorkingDirectory !== originalCwd) {
          console.log('[main.js] Restoring working directory to', originalCwd);
          process.chdir(originalCwd);
        }
        
        // Clean up temp file
        try {
          await fs.unlink(tempMdFile);
          console.log('[main.js] Cleaned up temp markdown file');
        } catch (cleanupError) {
          console.warn('[main.js] Could not clean up temp file:', cleanupError.message);
        }
      }
    } catch (error) {
      console.error('[main.js] Error in pandoc HTML export:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle PDF export with pandoc and bibliography support
  ipcMain.handle('perform-export-pdf', async (event, content, htmlContent, exportOptions) => {
    console.log('[main.js] Received perform-export-pdf with options:', exportOptions);
    try {
      const { dialog } = require('electron');
      const { spawn } = require('child_process');
      const path = require('path');
      const os = require('os');
      
      const defaultPath = currentFilePath ? 
        currentFilePath.replace(/\.[^/.]+$/, '.pdf') : 
        'export.pdf';
      
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export as PDF',
        defaultPath: defaultPath,
        filters: [
          { name: 'PDF Files', extensions: ['pdf'] }
        ]
      });

      if (result.canceled) {
        return { success: false, cancelled: true };
      }

      // Try to use pandoc if available
      const hasPandoc = await checkPandocAvailability();
      
      if (hasPandoc && exportOptions?.usePandoc !== false) {
        console.log('[main.js] Using pandoc for PDF export');
        
        // Find .bib files in current directory
        const bibFiles = await findBibFiles();
        
        // Create temporary markdown file
        const tempDir = os.tmpdir();
        const tempMdFile = path.join(tempDir, 'temp_export.md');
        await fs.writeFile(tempMdFile, content, 'utf8');
        
        try {
          const pandocArgs = [
            tempMdFile,
            '-f', 'markdown',
            '-t', 'pdf',
            '--toc',
            '--toc-depth=3',
            '--number-sections',
            '--mathjax',
            '-o', result.filePath
          ];
          
          // Add bibliography support if .bib files found
          if (bibFiles.length > 0) {
            console.log(`[main.js] Found ${bibFiles.length} .bib file(s):`, bibFiles.map(f => path.basename(f)));
            pandocArgs.push('--citeproc');
            bibFiles.forEach(bibFile => {
              pandocArgs.push('--bibliography', bibFile);
            });
            // Add citation style
            const cslStyle = await getDefaultCSLStyle();
            if (cslStyle) {
              pandocArgs.push('--csl', cslStyle);
            }
          }
          
          // Add PDF-specific options
          pandocArgs.push('--variable', 'geometry:margin=1in');
          pandocArgs.push('--variable', 'fontsize=12pt');
          pandocArgs.push('--variable', 'papersize=a4');
          
          // Add custom pandoc options if provided
          if (exportOptions?.pandocArgs) {
            pandocArgs.push(...exportOptions.pandocArgs);
          }
          
          await runPandoc(pandocArgs);
          console.log('[main.js] Pandoc PDF export completed successfully');
          
          // Clean up temp file
          try {
            await fs.unlink(tempMdFile);
          } catch (e) {
            console.warn('[main.js] Could not clean up temp file:', e.message);
          }
          
          return { 
            success: true, 
            filePath: result.filePath, 
            usedPandoc: true,
            bibFilesFound: bibFiles.length
          };
        } catch (pandocError) {
          console.warn('[main.js] Pandoc PDF export failed, falling back to Electron PDF:', pandocError.message);
          // Fall back to Electron's PDF generation
          
          // Clean up temp file
          try {
            await fs.unlink(tempMdFile);
          } catch (e) {
            console.warn('[main.js] Could not clean up temp file:', e.message);
          }
        }
      }
      
      // Fallback to Electron's built-in PDF generation
      console.log('[main.js] Using Electron for PDF generation');
      
      const { BrowserWindow } = require('electron');
      const pdfWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      // Load HTML content into the window
      await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
      
      // Generate PDF
      const pdfBuffer = await pdfWindow.webContents.printToPDF({
        marginsType: 0,
        pageSize: 'A4',
        printBackground: true,
        landscape: false
      });

      pdfWindow.close();
      
      await fs.writeFile(result.filePath, pdfBuffer);
      console.log(`[main.js] PDF exported successfully to: ${result.filePath}`);
      return { 
        success: true, 
        filePath: result.filePath, 
        usedPandoc: false,
        bibFilesFound: 0
      };
    } catch (error) {
      console.error('[main.js] Error exporting PDF:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle PowerPoint export with pandoc
  ipcMain.handle('perform-export-pptx', async (event, content, exportOptions) => {
    console.log('[main.js] Received perform-export-pptx with options:', exportOptions);
    try {
      const { dialog } = require('electron');
      const { spawn } = require('child_process');
      const path = require('path');
      const os = require('os');
      
      const defaultPath = currentFilePath ? 
        currentFilePath.replace(/\.[^/.]+$/, '.pptx') : 
        'export.pptx';
      
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export as PowerPoint',
        defaultPath: defaultPath,
        filters: [
          { name: 'PowerPoint Files', extensions: ['pptx'] }
        ]
      });

      if (result.canceled) {
        return { success: false, cancelled: true };
      }

      // Check if pandoc is available
      const hasPandoc = await checkPandocAvailability();
      
      if (!hasPandoc) {
        return { 
          success: false, 
          error: 'Pandoc is required for PowerPoint export. Please install pandoc from https://pandoc.org/' 
        };
      }

      console.log('[main.js] Using pandoc for PowerPoint export');
      
      // Process markdown content to extract slides and speaker notes
      const processedContent = await processMarkdownForPowerPoint(content);
      
      // Find .bib files for citations
      const bibFiles = await findBibFiles();
      
      // Create temporary markdown file
      const tempDir = os.tmpdir();
      const tempMdFile = path.join(tempDir, 'temp_powerpoint_export.md');
      console.log('[main.js] Working directory:', currentWorkingDirectory);
      console.log('[main.js] Temp directory:', tempDir);
      console.log('[main.js] Temp markdown file:', tempMdFile);
      console.log('[main.js] Output file:', result.filePath);
      
      await fs.writeFile(tempMdFile, processedContent, 'utf8');
      console.log('[main.js] Temp file written, size:', processedContent.length, 'characters');
      console.log('[main.js] Processed content preview:', processedContent.substring(0, 300), '...');
      
      try {
        const pandocArgs = [
          tempMdFile,
          '-f', 'markdown',
          '-t', 'pptx',
          '--slide-level=2', // H2 headers create new slides
          '--mathjax', // Math rendering support
          '-o', result.filePath
        ];
        
        // Add bibliography support if .bib files found
        if (bibFiles.length > 0) {
          console.log(`[main.js] Found ${bibFiles.length} .bib file(s) for PowerPoint:`, bibFiles.map(f => path.basename(f)));
          console.log('[main.js] Adding --citeproc for citation processing');
          pandocArgs.push('--citeproc');
          bibFiles.forEach((bibFile, index) => {
            console.log(`[main.js] Adding bibliography [${index + 1}]: ${bibFile}`);
            pandocArgs.push('--bibliography', bibFile);
          });
          const cslStyle = await getDefaultCSLStyle();
          if (cslStyle) {
            console.log('[main.js] Adding CSL style:', cslStyle);
            pandocArgs.push('--csl', cslStyle);
          } else {
            console.log('[main.js] No CSL style specified - using pandoc default');
          }
        } else {
          console.log('[main.js] No bibliography files found - citations will not be processed');
        }
        
        // Add PowerPoint-specific options
        if (exportOptions?.pandocArgs) {
          pandocArgs.push(...exportOptions.pandocArgs);
        }
        
        await runPandoc(pandocArgs);
        console.log('[main.js] PowerPoint export completed successfully');
        
        // Clean up temp file
        try {
          await fs.unlink(tempMdFile);
        } catch (e) {
          console.warn('[main.js] Could not clean up temp file:', e.message);
        }
        
        return { 
          success: true, 
          filePath: result.filePath,
          slidesCreated: processedContent.match(/^## /gm)?.length || 0,
          bibFilesFound: bibFiles.length
        };
      } catch (pandocError) {
        console.error('[main.js] PowerPoint export failed:', pandocError.message);
        
        // Clean up temp file
        try {
          await fs.unlink(tempMdFile);
        } catch (e) {
          console.warn('[main.js] Could not clean up temp file:', e.message);
        }
        
        return { 
          success: false, 
          error: `PowerPoint export failed: ${pandocError.message}` 
        };
      }
    } catch (error) {
      console.error('[main.js] Error exporting PowerPoint:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle PDF export with pandoc (with full bibliography support)
  ipcMain.handle('perform-export-pdf-pandoc', async (event, content, exportOptions) => {
    console.log('[main.js] Received perform-export-pdf-pandoc with options:', exportOptions);
    try {
      const { dialog } = require('electron');
      const path = require('path');
      const os = require('os');
      
      const defaultPath = currentFilePath ? 
        currentFilePath.replace(/\.[^/.]+$/, '.pdf') : 
        'export.pdf';
      
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export as PDF (with References)',
        defaultPath: defaultPath,
        filters: [
          { name: 'PDF Files', extensions: ['pdf'] }
        ]
      });

      if (result.canceled) {
        return { success: false, cancelled: true };
      }

      // Check if pandoc is available
      const hasPandoc = await checkPandocAvailability();
      
      if (!hasPandoc) {
        return { 
          success: false, 
          error: 'Pandoc is required for PDF export with references. Please install pandoc from https://pandoc.org/' 
        };
      }

      console.log('[main.js] Using pandoc for PDF export with bibliography support');
      
      // Find .bib files for citations
      const bibFiles = await findBibFiles();
      
      // Create temporary markdown file
      const tempDir = os.tmpdir();
      const tempMdFile = path.join(tempDir, 'temp_pdf_pandoc_export.md');
      console.log('[main.js] Working directory:', currentWorkingDirectory);
      console.log('[main.js] Temp directory:', tempDir);
      console.log('[main.js] Temp markdown file:', tempMdFile);
      console.log('[main.js] Output file:', result.filePath);
      
      await fs.writeFile(tempMdFile, content, 'utf8');
      console.log('[main.js] Temp file written, size:', content.length, 'characters');
      console.log('[main.js] Content preview (first 500 chars):');
      console.log(content.substring(0, 500));
      console.log('[main.js] Content preview (last 500 chars):');
      console.log(content.substring(Math.max(0, content.length - 500)));
      
      try {
        const pandocArgs = [
          tempMdFile,
          '-f', 'markdown',
          '-t', 'pdf',
          '--toc',
          '--toc-depth=3',
          '--number-sections'
        ];
        
        // Add bibliography support if .bib files found
        if (bibFiles.length > 0) {
          console.log(`[main.js] Found ${bibFiles.length} .bib file(s) for PDF:`, bibFiles.map(f => path.basename(f)));
          console.log('[main.js] Adding --citeproc for citation processing');
          pandocArgs.push('--citeproc');
          bibFiles.forEach((bibFile, index) => {
            console.log(`[main.js] Adding bibliography [${index + 1}]: ${bibFile}`);
            pandocArgs.push('--bibliography', bibFile);
          });
          const cslStyle = await getDefaultCSLStyle();
          if (cslStyle) {
            console.log('[main.js] Adding CSL style:', cslStyle);
            pandocArgs.push('--csl', cslStyle);
          } else {
            console.log('[main.js] No CSL style specified - using pandoc default');
          }
        } else {
          console.log('[main.js] No bibliography files found - citations will not be processed');
        }
        
        // Add output file last
        pandocArgs.push('-o', result.filePath);
        
        // Add PDF-specific formatting options
        pandocArgs.push('--pdf-engine=pdflatex');
        pandocArgs.push('--variable', 'geometry:margin=1in');
        pandocArgs.push('--variable', 'fontsize=12pt');
        pandocArgs.push('--variable', 'papersize=a4');
        pandocArgs.push('--variable', 'documentclass=article');
        
        // Add enhanced features
        pandocArgs.push('--highlight-style=pygments'); // Code syntax highlighting
        pandocArgs.push('--pdf-engine=xelatex'); // Better Unicode support
        pandocArgs.push('--mathjax'); // Math rendering support
        
        // Add custom pandoc options if provided
        if (exportOptions?.pandocArgs) {
          console.log('[main.js] Adding custom pandoc args:', exportOptions.pandocArgs);
          pandocArgs.push(...exportOptions.pandocArgs);
        }
        
        await runPandoc(pandocArgs);
        console.log('[main.js] Pandoc PDF export completed successfully');
        
        // Clean up temp file
        try {
          await fs.unlink(tempMdFile);
        } catch (e) {
          console.warn('[main.js] Could not clean up temp file:', e.message);
        }
        
        return { 
          success: true, 
          filePath: result.filePath,
          method: 'pandoc',
          bibFilesFound: bibFiles.length
        };
      } catch (pandocError) {
        console.error('[main.js] Pandoc PDF export failed:', pandocError.message);
        
        // Clean up temp file
        try {
          await fs.unlink(tempMdFile);
        } catch (e) {
          console.warn('[main.js] Could not clean up temp file:', e.message);
        }
        
        return { 
          success: false, 
          error: `Pandoc PDF export failed: ${pandocError.message}` 
        };
      }
    } catch (error) {
      console.error('[main.js] Error in pandoc PDF export:', error);
      return { success: false, error: error.message };
    }
  });

  // --- Export Helper Functions ---
  
  // Check if pandoc is available
  async function checkPandocAvailability() {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const pandoc = spawn('pandoc', ['--version']);
      
      let output = '';
      pandoc.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pandoc.on('close', (code) => {
        if (code === 0 && output.includes('pandoc')) {
          console.log('[main.js] Pandoc is available:', output.split('\n')[0]);
          resolve(true);
        } else {
          console.log('[main.js] Pandoc not found or not working');
          resolve(false);
        }
      });
      
      pandoc.on('error', () => {
        console.log('[main.js] Pandoc not available (command not found)');
        resolve(false);
      });
    });
  }
  
  // Find .bib files in the current working directory
  async function findBibFiles() {
    try {
      const path = require('path');
      const workingDir = currentWorkingDirectory || app.getPath('documents');
      
      console.log('\n=== BIBLIOGRAPHY DETECTION ===');
      console.log('[main.js] Looking for .bib files in:', workingDir);
      
      const items = await fs.readdir(workingDir, { withFileTypes: true });
      const bibFiles = [];
      const allFiles = [];
      
      for (const item of items) {
        if (item.isFile()) {
          allFiles.push(item.name);
          if (item.name.endsWith('.bib')) {
            const fullPath = path.join(workingDir, item.name);
            bibFiles.push(fullPath);
            
            // Check file size and contents preview
            try {
              const stats = await fs.stat(fullPath);
              const content = await fs.readFile(fullPath, 'utf8');
              const entryCount = (content.match(/@\w+\{/g) || []).length;
              console.log(`[main.js] Found .bib file: ${item.name}`);
              console.log(`  - Size: ${stats.size} bytes`);
              console.log(`  - Entries: ${entryCount}`);
              console.log(`  - Path: ${fullPath}`);
              if (content.length > 0) {
                const preview = content.substring(0, 200).replace(/\n/g, ' ');
                console.log(`  - Preview: ${preview}...`);
              }
            } catch (readError) {
              console.warn(`[main.js] Could not read .bib file ${fullPath}:`, readError.message);
            }
          }
        }
      }
      
      console.log(`[main.js] Directory contains ${allFiles.length} files total:`);
      console.log('[main.js] All files:', allFiles.slice(0, 10).join(', '), allFiles.length > 10 ? '...' : '');
      console.log(`[main.js] Bibliography files found: ${bibFiles.length}`);
      bibFiles.forEach((file, index) => {
        console.log(`  [${index + 1}]: ${path.basename(file)}`);
      });
      console.log('=== END BIBLIOGRAPHY DETECTION ===\n');
      
      return bibFiles;
    } catch (error) {
      console.warn('[main.js] Error looking for .bib files:', error.message);
      return [];
    }
  }
  
  // Get default CSL style (Chicago style as a reasonable academic default)
  async function getDefaultCSLStyle() {
    // Check if we can use a built-in style or need to download one
    // For now, let's try without a custom CSL style to use pandoc defaults
    console.log('[main.js] Using pandoc default citation style (no custom CSL)');
    return null; // Return null to skip CSL specification
  }
  
  // Run pandoc with given arguments
  async function runPandoc(args) {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      
      
      const pandoc = spawn('pandoc', args);
      let output = '';
      let errorOutput = '';
      
      pandoc.stdout.on('data', (data) => {
        const outputText = data.toString();
        output += outputText;
        if (outputText.trim()) {
          console.log('[main.js] Pandoc stdout:', outputText.trim());
        }
      });
      
      pandoc.stderr.on('data', (data) => {
        const errorText = data.toString();
        errorOutput += errorText;
        console.log('[main.js] Pandoc stderr:', errorText.trim());
      });
      
      pandoc.on('close', (code) => {
        if (code === 0) {
          console.log('[main.js] Pandoc completed successfully');
          resolve(output);
        } else {
          console.error('[main.js] Pandoc failed with code:', code);
          console.error('[main.js] Pandoc error output:', errorOutput);
          reject(new Error(`Pandoc failed with code ${code}: ${errorOutput}`));
        }
      });
      
      pandoc.on('error', (error) => {
        console.error('[main.js] Pandoc spawn error:', error.message);
        reject(error);
      });
    });
  }
  
  // Process markdown content for PowerPoint export
  async function processMarkdownForPowerPoint(content) {
    console.log('[main.js] Processing markdown content for PowerPoint export');
    
    // Split content by slide markers (---)
    const slides = content.split(/^---\s*$/gm);
    const processedSlides = [];
    
    for (let i = 0; i < slides.length; i++) {
      let slideContent = slides[i].trim();
      
      if (slideContent === '') continue;
      
      // Extract speaker notes from ```notes blocks
      const notesBlocks = [];
      let cleanContent = slideContent;
      
      // Find all ```notes blocks and extract them
      const notesRegex = /```notes\s*\n([\s\S]*?)\n```/g;
      let match;
      
      while ((match = notesRegex.exec(slideContent)) !== null) {
        notesBlocks.push(match[1].trim());
      }
      
      // Remove notes blocks from main content
      cleanContent = cleanContent.replace(/```notes\s*\n[\s\S]*?\n```/g, '').trim();
      
      // Ensure slide has a title (H2 level for pandoc slide-level=2)
      if (!cleanContent.match(/^## /m)) {
        // If no H2 found, check for H1 and convert it
        if (cleanContent.match(/^# /m)) {
          cleanContent = cleanContent.replace(/^# /gm, '## ');
        } else {
          // If no heading at all, add a default one
          const firstLine = cleanContent.split('\n')[0];
          const title = firstLine.length > 50 ? 'Slide' : firstLine.replace(/[#*_`]/g, '').trim() || 'Slide';
          cleanContent = `## ${title}\n\n${cleanContent}`;
        }
      }
      
      // Add speaker notes as pandoc div syntax
      if (notesBlocks.length > 0) {
        const notesContent = notesBlocks.join('\n\n');
        cleanContent += `\n\n::: notes\n${notesContent}\n:::`;
      }
      
      processedSlides.push(cleanContent);
    }
    
    // If no slides found (no --- markers), treat the entire content as one slide
    if (processedSlides.length === 0) {
      let singleSlide = content.trim();
      
      // Extract speaker notes
      const notesBlocks = [];
      const notesRegex = /```notes\s*\n([\s\S]*?)\n```/g;
      let match;
      
      while ((match = notesRegex.exec(singleSlide)) !== null) {
        notesBlocks.push(match[1].trim());
      }
      
      // Remove notes blocks from main content
      singleSlide = singleSlide.replace(/```notes\s*\n[\s\S]*?\n```/g, '').trim();
      
      // Ensure we have H2 headers for slides
      singleSlide = singleSlide.replace(/^# /gm, '## ');
      
      // Add speaker notes
      if (notesBlocks.length > 0) {
        const notesContent = notesBlocks.join('\n\n');
        singleSlide += `\n\n::: notes\n${notesContent}\n:::`;
      }
      
      processedSlides.push(singleSlide);
    }
    
    const result = processedSlides.join('\n\n---\n\n');
    console.log(`[main.js] Processed ${processedSlides.length} slides for PowerPoint`);
    
    return result;
  }

  // Open external file handler
  ipcMain.handle('open-external', async (event, filePath) => {
    try {
      const { shell } = require('electron');
      await shell.openPath(filePath);
      console.log(`[main.js] Opened external file: ${filePath}`);
      return { success: true };
    } catch (error) {
      console.error(`[main.js] Failed to open external file: ${filePath}`, error);
      return { success: false, error: error.message };
    }
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

  // New category-specific settings handlers
  ipcMain.handle('get-settings-category', (event, category) => {
    return getSettingsCategory(category);
  });

  ipcMain.handle('update-settings-category', (event, category, updates) => {
    return updateSettingsCategory(category, updates);
  });

  ipcMain.handle('reset-settings-category', (event, category) => {
    return resetSettingsCategory(category);
  });

  ipcMain.handle('export-settings', () => {
    return exportSettings();
  });

  ipcMain.handle('import-settings', (event, importData) => {
    return importSettings(importData);
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

  // Style management handlers
  ipcMain.handle('load-style-file', async (event, filePath) => {
    try {
      const fullPath = path.join(__dirname, filePath);
      const content = await fs.readFile(fullPath, 'utf8');
      return content;
    } catch (error) {
      console.error('[main.js] Error loading style file:', error);
      return '';
    }
  });

  ipcMain.handle('save-user-styles', async (event, styles) => {
    try {
      appSettings.userStyles = styles;
      saveSettings();
      return true;
    } catch (error) {
      console.error('[main.js] Error saving user styles:', error);
      return false;
    }
  });

  ipcMain.handle('load-user-styles', () => {
    return appSettings.userStyles || {};
  });

  ipcMain.handle('save-style-preferences', async (event, preferences) => {
    try {
      appSettings.stylePreferences = preferences;
      saveSettings();
      return true;
    } catch (error) {
      console.error('[main.js] Error saving style preferences:', error);
      return false;
    }
  });

  ipcMain.handle('load-style-preferences', () => {
    return appSettings.stylePreferences || {};
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
    console.log(`[main.js] Deleting file/folder: ${filePath}`);
    try {
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid file path');
      }
      
      // Check if path exists
      try {
        await fs.access(filePath);
      } catch (err) {
        return {
          success: false,
          error: 'File or folder does not exist'
        };
      }
      
      // Get file stats to determine if it's a file or directory
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) {
        // Delete directory (recursive)
        await fs.rmdir(filePath, { recursive: true });
        console.log(`[main.js] Directory deleted successfully: ${filePath}`);
        return {
          success: true,
          message: `Directory deleted: ${path.basename(filePath)}`,
          type: 'folder'
        };
      } else {
        // Delete file
        await fs.unlink(filePath);
        console.log(`[main.js] File deleted successfully: ${filePath}`);
        
        // If we just deleted the currently open file, clear currentFilePath
        if (currentFilePath === filePath) {
          currentFilePath = null;
          if (mainWindow) {
            mainWindow.setTitle('Hegel Pedagogy AI');
          }
        }
        
        return {
          success: true,
          message: `File deleted: ${path.basename(filePath)}`,
          type: 'file'
        };
      }
    } catch (error) {
      console.error('[main.js] Error deleting file/folder:', error);
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

  // Export trigger handler
  ipcMain.handle('trigger-export', async (event, exportType) => {
    console.log(`[main.js] Received trigger-export request: ${exportType}`);
    
    if (!mainWindow) {
      console.error('[main.js] No main window available for export trigger');
      return;
    }
    
    switch (exportType) {
      case 'html':
        console.log('[main.js] Triggering HTML export');
        mainWindow.webContents.send('trigger-export-html');
        break;
      case 'html-pandoc':
        console.log('[main.js] Triggering HTML export with references');
        mainWindow.webContents.send('trigger-export-html-pandoc');
        break;
      case 'pdf':
        console.log('[main.js] Triggering PDF export');
        mainWindow.webContents.send('trigger-export-pdf');
        break;
      case 'pdf-pandoc':
        console.log('[main.js] Triggering PDF export with references');
        mainWindow.webContents.send('trigger-export-pdf-pandoc');
        break;
      case 'pptx':
        console.log('[main.js] Triggering PowerPoint export');
        mainWindow.webContents.send('trigger-export-pptx');
        break;
      default:
        console.error(`[main.js] Unknown export type: ${exportType}`);
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

  // Global replace handler
  ipcMain.handle('global-replace', async (event, { searchQuery, replaceText, searchResults, options = {} }) => {
    try {
      console.log(`[main.js] Global replace "${searchQuery}" with "${replaceText}"`);
      
      if (!searchQuery || !searchResults || searchResults.length === 0) {
        return { success: false, error: 'Invalid search parameters' };
      }
      
      const result = await performGlobalReplace(searchQuery, replaceText, searchResults, options);
      return { success: true, ...result };
    } catch (error) {
      console.error('[main.js] Error in global replace:', error);
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
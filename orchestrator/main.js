// main.js
console.log('--- main.js execution START ---');
require('dotenv').config(); // Load .env file
const { app, BrowserWindow, ipcMain, dialog, nativeTheme, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises; // Use promises API
const AIService = require('../services/aiService');
require('@electron/remote/main').initialize();

// --- AI Service Initialization ---
let aiService;
try {
  aiService = new AIService();
  console.log('[orchestrator/main.js] AI Service initialized with providers:', aiService.getAvailableProviders());
  
  if (aiService.getAvailableProviders().length === 0) {
    console.warn('[orchestrator/main.js] WARNING: No AI providers configured. AI Chat feature will be disabled.');
    console.warn('[orchestrator/main.js] Please add API keys to your .env file. See .env.example for details.');
  }
} catch (error) {
  console.error('[orchestrator/main.js] Error initializing AI Service:', error);
}

// --- Global Variables ---
let mainWindow = null;
let currentFilePath = null; // Track the path of the currently open file
let currentWorkingDirectory = app.getAppPath(); // Default to app path, update later

// --- Persistent Settings Storage ---
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
let appSettings = {};

// Default settings structure
const defaultSettings = {
    theme: 'light', // 'light', 'dark', or 'auto'
    layout: {
        structureWidth: '20%',
        editorWidth: '50%',
        rightWidth: '30%'
    },
    workingDirectory: app.getPath('documents'), // Default to user's documents
    currentFile: '' // Track the currently open file
};

// Load settings from disk
function loadSettings() {
    try {
        const fsSync = require('fs');
        if (fsSync.existsSync(SETTINGS_FILE)) {
            const raw = fsSync.readFileSync(SETTINGS_FILE, 'utf-8');
            const loadedSettings = JSON.parse(raw);
            appSettings = loadedSettings;
            // Ensure all default keys exist, merge missing ones
            appSettings = { ...defaultSettings, ...appSettings };
            // Deep merge for layout if it exists partially
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

// --- Helper Function Definitions (outside whenReady) ---

function createWindow() {
  console.log('[main.js] Creating main window...');
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // Keep true for security
      nodeIntegration: false, // Keep false for security
      enableRemoteModule: false, // Keep false, use IPC
    },
    title: 'NotAnotherNoteApp', // Should match productName
    icon: path.join(__dirname, 'assets/icon.png') // Ensure this points to the correct icon
  });

  // Enable @electron/remote for this window
  require("@electron/remote/main").enable(mainWindow.webContents);

  // Load the index.html of the app.
  const indexPath = path.join(__dirname, 'index.html');
  console.log(`[main.js] Loading URL: ${indexPath}`);
  mainWindow.loadFile(indexPath);

  // Open the DevTools (optional).
  // mainWindow.webContents.openDevTools();

  // Set up application menu
  const menu = Menu.buildFromTemplate(createMainMenu());
  Menu.setApplicationMenu(menu);

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    console.log('[main.js] Main window closed.');
    mainWindow = null;
  });

  // Send initial theme to renderer once DOM is ready
  mainWindow.webContents.on('did-finish-load', () => {
      const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
      console.log(`[main.js] Window finished loading. Sending initial theme: ${theme}`);
      mainWindow.webContents.send('theme-changed', theme);
      // Also request initial file tree render
      mainWindow.webContents.send('refresh-file-tree');
      console.log('[main.js] Sent refresh-file-tree signal to renderer.');
  });

  // Save settings explicitly when the window is about to close
  mainWindow.on('close', () => {
    console.log('[main.js] Main window closing. Saving final settings.');
    saveSettings(); // Ensure the latest appSettings are written
  });
}

function createMainMenu() {
    // Template definition (remains the same as before)
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
              currentFilePath = null; // Reset the current file path
              mainWindow.setTitle('NotAnotherNoteApp - Untitled'); // Update window title
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
              const result = await openFile(); // Use helper
              if (result && result.filePath && mainWindow) {
                  console.log(`[main.js] File opened via menu: ${result.filePath}`);
                  // currentFilePath is updated within openFile or saveFile now
                  // Renderer is notified via 'file-opened' within openFile
              } else {
                   console.log('[main.js] Open File dialog cancelled or failed.');
              }
            }
          },
          {
            label: 'Open Folder...',
            accelerator: 'CmdOrCtrl+Shift+O',
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
                        // Reset current file path as context changed
                        currentFilePath = null;
                        mainWindow.setTitle('NotAnotherNoteApp - Untitled'); 
                        // Optionally clear editor? No, let user decide.
                        // Refresh the file tree view in the renderer
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
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
         ]
      }
      // Add other menus like View, Help etc. if needed
    ];
    // Add macOS specific menu items
    if (process.platform === 'darwin') {
      template.unshift({ label: app.getName(), submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] });
      // Edit menu
      template[2].submenu.push({ type: 'separator' }, { label: 'Speech', submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }] });
      // Window menu
      // template[3]... (add window menu if needed)
    }
    return template;
}

async function getFiles(dir) {
    // Implementation remains the same
    let results = [];
    const list = await fs.readdir(dir, { withFileTypes: true });
    for (const dirent of list) {
        const res = path.resolve(dir, dirent.name);
        if (dirent.isDirectory()) {
            // Only include specific directories or exclude node_modules etc.
            if (dirent.name !== 'node_modules' && !dirent.name.startsWith('.')) {
                 results.push({ path: res, type: 'folder' });
                // Recursively get files from subdirectories if needed, or handle in buildFileTree
            }
        } else {
            // Only include Markdown files
            if (res.endsWith('.md') || res.endsWith('.markdown') || res.endsWith('.bib') || res.endsWith('.pdf') || res.endsWith('.html') || res.endsWith('.htm')) {
                results.push({ path: res, type: 'file' });
            }
        }
    }
    return results;
}

function buildFileTree(basePath, files) {
    // Implementation remains the same
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
                 // Sort currentLevel alphabetically, folders first
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
    // Implementation remains the same
    try {
        await fs.writeFile(filePath, content, 'utf8');
        console.log(`[main.js] Content successfully saved to ${filePath}`);
        currentFilePath = filePath;
        if (mainWindow) {
            mainWindow.setTitle(`NotAnotherNoteApp - ${path.basename(filePath)}`);
        }
        return { success: true, filePath: filePath };
    } catch (err) {
        console.error(`[main.js] Error saving file to ${filePath}:`, err);
        dialog.showErrorBox('Save Error', `Failed to save the file: ${err.message}`);
        return { success: false, error: err.message };
    }
}

async function performSaveAs(content) {
    // Implementation remains the same
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
                { name: 'BibTeX Files', extensions: ['bib'] },
                { name: 'PDF Files', extensions: ['pdf'] },
                { name: 'HTML Files', extensions: ['html', 'htm'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (canceled || !filePath) {
            console.log('[main.js] Save As dialog was cancelled.');
            return { success: false }; // Indicate cancellation, not an error
        }

        console.log(`[main.js] User chose path for Save As: ${filePath}`);
        return await saveFile(filePath, content);

    } catch (err) {
        console.error('[main.js] Error during Save As dialog or save operation:', err);
        dialog.showErrorBox('Save As Error', `Failed to save the file: ${err.message}`);
        return { success: false, error: err.message };
    }
}

async function openFile() {
    // Implementation remains the same
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
        currentFilePath = filePath; // Update the current file path
        mainWindow.setTitle(`NotAnotherNoteApp - ${path.basename(filePath)}`);
         // Send content back to renderer
         if (mainWindow) {
            mainWindow.webContents.send('file-opened', { filePath, content });
            console.log(`[main.js] Sent file-opened event for ${filePath}`);
         }
        return { filePath, content }; // Return data
    } catch (err) {
        console.error(`[main.js] Error opening file:`, err);
        dialog.showErrorBox('Open File Error', `Could not open the selected file: ${err.message}`);
        return null;
    }
}


// --- App Initialization (whenReady) ---

app.whenReady().then(() => {
  console.log('[main.js] App is ready via whenReady()');
  currentWorkingDirectory = app.getPath('documents'); // Start in Documents directory
  console.log(`[main.js] Initial working directory: ${currentWorkingDirectory}`);

  // --- IPC Handlers (inside whenReady) ---
  ipcMain.handle('request-file-tree', async (event) => {
    // Use workingDirectory from settings if available
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
        return { name: path.basename(currentWorkingDirectory), type: 'folder', children: [] }; // Return empty tree on error
    }
  });

  ipcMain.handle('get-initial-theme', (event) => {
    return nativeTheme.shouldUseDarkColors;
  });

  ipcMain.handle('set-current-file', (event, filePath) => {
    if (typeof filePath === 'string') {
        appSettings.currentFile = filePath;
        saveSettings();
        console.log('[main.js] Updated currentFile in settings:', filePath);
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
            mainWindow.setTitle(`NotAnotherNoteApp - ${path.basename(filePath)}`);
        }
        return { success: true, filePath, content };
    } catch (err) {
        console.error('[main.js] Error opening file by path:', err);
        return { success: false, error: err.message };
    }
});

  ipcMain.handle('send-chat-message', async (event, userMessage) => {
    if (!aiService || aiService.getAvailableProviders().length === 0) {
        console.error('[orchestrator/main.js] AI Service not available. Cannot send chat message.');
        return { error: 'AI Service not configured. Please check server logs and API keys in .env file.' };
    }
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim() === '') {
        console.error('[orchestrator/main.js] Invalid user message received.');
        return { error: 'Invalid message format.' };
    }
    console.log(`[orchestrator/main.js] Received chat message: "${userMessage.substring(0, 100)}..."`);
    
    try {
      const response = await aiService.sendMessage(userMessage);
      console.log(`[orchestrator/main.js] AI response from ${response.provider} (${response.model}):`, response.response?.substring(0, 100) + '...');
      
      return {
        response: response.response,
        provider: response.provider,
        model: response.model,
        usage: response.usage
      };
    } catch (error) {
        console.error('[orchestrator/main.js] Error calling AI API:', error);
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

  // AI Text Summarization Handler
  ipcMain.handle('summarize-text-to-notes', async (event, selectedText) => {
    if (!aiService || aiService.getAvailableProviders().length === 0) {
      console.error('[orchestrator/main.js] AI Service not available. Cannot summarize text.');
      return { error: 'AI Service not configured. Please check server logs and API keys in .env file.' };
    }
    
    if (!selectedText || typeof selectedText !== 'string' || selectedText.trim() === '') {
      console.error('[orchestrator/main.js] Invalid text received for summarization.');
      return { error: 'Invalid text format.' };
    }
    
    console.log(`[orchestrator/main.js] Received text for summarization: "${selectedText.substring(0, 100)}..."`);
    
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
      
      console.log(`[orchestrator/main.js] AI summarization from ${response.provider}: Generated heading and bullets`);
      
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
      console.error('[orchestrator/main.js] Error in AI text summarization:', error);
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
      console.error('[orchestrator/main.js] Invalid text received for notes extraction.');
      return { error: 'Invalid text format.' };
    }
    
    console.log(`[orchestrator/main.js] Received text for notes extraction: "${selectedText.substring(0, 100)}..."`);
    
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
      
      console.log(`[orchestrator/main.js] Successfully extracted ${matches.length} notes block(s)`);
      
      return {
        success: true,
        extractedContent,
        blocksFound: matches.length
      };
    } catch (error) {
      console.error('[orchestrator/main.js] Error extracting notes content:', error);
      return { error: 'An error occurred while extracting notes content.' };
    }
  });

  // Check if a file exists
  ipcMain.handle('check-file-exists', async (event, filePath) => {
    try {
      await fs.access(filePath);
      console.log(`[orchestrator/main.js] File exists: ${filePath}`);
      return true;
    } catch (error) {
      console.log(`[orchestrator/main.js] File does not exist: ${filePath}`);
      return false;
    }
  });

  // Open external file handler
  ipcMain.handle('open-external', async (event, filePath) => {
    try {
      const { shell } = require('electron');
      await shell.openPath(filePath);
      console.log(`[orchestrator/main.js] Opened external file: ${filePath}`);
      return { success: true };
    } catch (error) {
      console.error(`[orchestrator/main.js] Failed to open external file: ${filePath}`, error);
      return { success: false, error: error.message };
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

  ipcMain.on('save-layout', (event, layoutData) => {
    console.log('[main.js] Received save-layout request:', layoutData);
    if (layoutData && 
        typeof layoutData.structureWidth === 'string' &&
        typeof layoutData.editorWidth === 'string' &&
        typeof layoutData.rightWidth === 'string') {
        
        // Basic validation (ensure they look like percentages)
        const isValid = (val) => /^\d+(\.\d+)?%$/.test(val);
        
        if (isValid(layoutData.structureWidth) && isValid(layoutData.editorWidth) && isValid(layoutData.rightWidth)) {
            appSettings.layout = layoutData;
            saveSettings(); // Persist the changes
            console.log('[main.js] Layout settings updated and saved.');
        } else {
            console.warn('[main.js] Invalid layout data received:', layoutData);
        }
    } else {
        console.warn('[main.js] Malformed layout data received:', layoutData);
    }
});

  createWindow(); // Create the main window

  // --- App Lifecycle & Window Management (within whenReady) ---

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Set theme based on system preference and notify renderer
  nativeTheme.on('updated', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    console.log(`[main.js] Native theme updated. Sending to renderer.`);
    if (mainWindow) {
      mainWindow.webContents.send('theme-changed', theme);
    }
  });

}); // <<< END of app.whenReady().then()


// --- App Lifecycle (outside whenReady) ---

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    console.log('[main.js] All windows closed, quitting app.');
    app.quit();
  }
});


console.log('--- main.js execution END ---');
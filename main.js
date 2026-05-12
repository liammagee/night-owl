// main.js - NightOwl Application

// IMPORTANT: Unset ELECTRON_RUN_AS_NODE before anything else
// This prevents conflicts when launched from environments like Claude Code
// that set this variable, which would cause Electron to run as Node.js instead of GUI
if (process.env.ELECTRON_RUN_AS_NODE) {
  delete process.env.ELECTRON_RUN_AS_NODE;
}

require('dotenv').config({ quiet: true }); // Load .env file
const { app, BrowserWindow, ipcMain, dialog, nativeTheme, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { execFile } = require('child_process');
const tutorBridge = require('./orchestrator/modules/tutor-bridge');
const ImageService = require('./services/imageService');
const {
  createCitationCaptureServer,
  DEFAULT_CAPTURE_HOST,
  DEFAULT_CAPTURE_PORT
} = require('./services/citationCaptureBridge');
const {
  normalizeWorkspacePath,
  sanitizeWorkspaceFolders
} = require('./ipc/workspacePaths');
const { resolvePathWithinRoots } = require('./ipc/pathGuards');
const {
  parseNightOwlLaunchArgs,
  resolveLaunchTargets
} = require('./services/launchArgs');
const {
  WORKSPACE_PROFILE_ENV,
  extractWorkspaceUserDataDir
} = require('./services/cliWorkspaceProfile');
const { installNightOwlCli } = require('./services/cliInstaller');
const ipcHandlers = require('./ipc');
const { createDebugLogger } = require('./ipc/logging');

const debugMain = createDebugLogger('Main');
debugMain('main.js execution START');

// Initialize @electron/remote after checking if electron module loaded correctly
try {
    if (typeof ipcMain !== 'undefined' && ipcMain && typeof ipcMain.on === 'function') {
        require('@electron/remote/main').initialize();
        debugMain('@electron/remote initialized successfully');
    } else {
        console.warn('[main.js] Skipping @electron/remote initialization - ipcMain not available');
    }
} catch (error) {
    console.error('[main.js] Failed to initialize @electron/remote:', error.message);
}

// Utility function to clean AI responses
function cleanAIResponse(response) {
    if (!response || typeof response !== 'string') return response;
    
    // Remove <think>...</think> tags and their content
    return response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

// Set app name immediately - before anything else
if (app && typeof app.setName === 'function') {
    app.setName('NightOwl');
    const workspaceUserDataDir = process.env[WORKSPACE_PROFILE_ENV] || extractWorkspaceUserDataDir(process.argv);
    if (workspaceUserDataDir) {
        try {
            fsSync.mkdirSync(workspaceUserDataDir, { recursive: true });
            app.setPath('userData', workspaceUserDataDir);
        } catch (error) {
            console.error('[main.js] Failed to configure workspace user-data directory:', error);
        }
    }
    process.title = 'NightOwl';
    debugMain(`App name set to: ${app.getName()}`);
    debugMain(`Process title set to: ${process.title}`);
} else {
    debugMain('Running in Node.js mode - skipping Electron app setup');
    process.exit(0);
}

const shouldUseSingleInstanceLock = process.env.NIGHTOWL_DISABLE_SINGLE_INSTANCE !== '1' &&
  process.env.NODE_ENV !== 'test';
const hasSingleInstanceLock = !shouldUseSingleInstanceLock ||
  typeof app.requestSingleInstanceLock !== 'function' ||
  app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  debugMain('Another NightOwl instance is already running; forwarding launch arguments.');
  app.quit();
  process.exit(0);
}

app.on('second-instance', async (_event, commandLine, workingDirectory) => {
  try {
    const applied = await applyLaunchTargetsFromCommandLine(
      Array.isArray(commandLine) ? commandLine.slice(1) : [],
      workingDirectory || process.cwd()
    );
    if (!applied && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  } catch (error) {
    console.error('[main.js] Failed to handle second-instance launch:', error);
  }
});

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
        /generated-images[\/\\]/, // Ignore the generated-images directory
        /\.md$/, // Ignore markdown files anywhere
        /settings\.json$/, // Ignore settings file changes
        /generated_image_.*\.(png|jpg|jpeg|gif|webp)$/, // Ignore generated images anywhere
        /ENTER_FILE_NAME_.*\.(png|jpg|jpeg|gif|webp)$/, // Ignore any generated image files anywhere
        /\.bib$/ // Ignore BibTeX files (citations.bib is written by citation manager)
      ]
    });
    debugMain('Electron auto-reload enabled for development - app files only');
  } catch (error) {
    console.error('[main.js] Failed to enable electron-reload:', error);
  }
}

// --- AI Service Initialization ---
let imageService;
// Context tracking for intelligent context inclusion
let lastContextHash = null;
let lastFileTimestamps = new Map();

// AIService will be initialized after settings are loaded

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
  debugMain('Received SIGINT, shutting down gracefully...');
  if (mainWindow) {
    mainWindow.close();
  } else {
    app.quit();
  }
});

process.on('SIGTERM', () => {
  debugMain('Received SIGTERM, shutting down gracefully...');
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
let citationCaptureServer = null;
let citationCaptureBridgeConfig = {
  host: DEFAULT_CAPTURE_HOST,
  port: DEFAULT_CAPTURE_PORT
};
let rendererCitationCaptureReady = false;
let pendingCitationCaptures = [];

function enqueueCitationCapture(payload) {
  if (!payload || typeof payload !== 'object' || !payload.rawText) {
    return;
  }

  const capturePayload = {
    ...payload,
    rawText: String(payload.rawText).trim()
  };

  if (!capturePayload.rawText) {
    return;
  }

  const canDeliverLive = mainWindow &&
    !mainWindow.isDestroyed() &&
    rendererCitationCaptureReady;

  if (canDeliverLive) {
    mainWindow.webContents.send('citation-capture-request', capturePayload);
    return;
  }

  pendingCitationCaptures.push(capturePayload);
  if (pendingCitationCaptures.length > 50) {
    pendingCitationCaptures = pendingCitationCaptures.slice(-50);
  }
}

function flushCitationCaptureQueue() {
  if (!mainWindow || mainWindow.isDestroyed() || !rendererCitationCaptureReady) {
    return;
  }

  if (pendingCitationCaptures.length === 0) {
    return;
  }

  const queuedCaptures = [...pendingCitationCaptures];
  pendingCitationCaptures = [];

  queuedCaptures.forEach(payload => {
    mainWindow.webContents.send('citation-capture-request', payload);
  });
}

function buildCitationCaptureBookmarklet(captureEndpoint) {
  const endpoint = captureEndpoint || `http://${citationCaptureBridgeConfig.host}:${citationCaptureBridgeConfig.port}/capture`;

  return `javascript:(()=>{try{const selected=(window.getSelection?window.getSelection().toString():'').trim();const bodyText=((document.body&&document.body.innerText)||'');const bibMatch=bodyText.match(/@[A-Za-z]+\\s*[{(][\\s\\S]{0,15000}[})]/);const citationText=(bibMatch?bibMatch[0]:(selected||document.title||location.href)).trim();const query=new URLSearchParams({text:citationText,title:document.title||'',url:location.href,source:'bookmarklet'});(new Image()).src='${endpoint}?'+query.toString();}catch(error){console.error('NightOwl capture failed',error);}})();`;
}

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        const wrapped = new Error(stderr || stdout || error.message);
        wrapped.originalError = error;
        reject(wrapped);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function formatCaptureTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function packageCaptureExtension(sourceDir, outputZipPath) {
  if (process.platform === 'darwin') {
    await execFileAsync('/usr/bin/ditto', [
      '-c',
      '-k',
      '--sequesterRsrc',
      '--keepParent',
      sourceDir,
      outputZipPath
    ]);
    return;
  }

  await execFileAsync('zip', [
    '-r',
    outputZipPath,
    path.basename(sourceDir)
  ], {
    cwd: path.dirname(sourceDir)
  });
}

// --- Persistent Settings Storage ---
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
let appSettings = {};
const VALID_APP_THEMES = [
    'auto',
    'light',
    'dark',
    'techne',
    'techne-red-light',
    'techne-red-dark',
    'techne-orange-light',
    'techne-orange-dark',
    'solarized-light',
    'solarized-dark',
    'nord',
    'dracula',
    'monokai',
    'sepia'
];

// Default settings structure
const defaultSettings = {
    // === Theme and Appearance ===
    theme: 'solarized-light', // 'auto', 'light', 'dark', 'techne', and managed theme variants
    customThemes: {}, // User-defined theme overrides
    techne: {
        accent: 'red', // 'red' | 'orange'
        grid: true,
        noise: true
    },

    // === Bundled app features ===
    features: {
        enabled: [
            'techne-backdrop',
            'techne-presentations',
            'techne-markdown-renderer',
            'techne-network-diagram'
        ]
    },
    
    // === Layout Configuration ===
    layout: {
        structureWidth: '18%',
        editorWidth: '45%',
        rightWidth: '37%'
    },
    
    // === File System ===
    workingDirectory: app.getPath('documents'),
    workspaceFolders: [], // Additional folders to show in file tree (multi-folder support)
    currentFile: '',
    defaultFileType: '.md', // Default extension for new files
    publishing: {
        urlMappings: [] // [{ localRoot, urlTemplate }] for opening published pages from the file tree
    },
    
    // === Presentation Settings ===
    presentation: {
        mode: false,
        layout: 'spiral', // 'spiral', 'linear', 'grid', 'circle', 'tree', 'zigzag'
        autoAdvance: false,
        autoAdvanceInterval: 5000, // milliseconds
        showSpeakerNotes: true
    },
    
    // === Text-to-Speech Settings ===
    tts: {
        enabled: false, // Auto-enable TTS when entering presentation mode
        provider: 'auto', // 'auto', 'lemonfox', 'webspeech'
        
        // Lemonfox.ai Settings
        lemonfox: {
            voice: 'sarah', // Default voice: 'sarah', 'michael', 'alice', etc.
            language: 'en-us', // 'en-us', 'en-gb', 'ja', 'zh', 'es', 'fr', 'hi', 'it', 'pt-br'
            speed: 1.0, // 0.5 to 4.0
            response_format: 'mp3', // 'mp3', 'opus', 'aac', 'flac', 'pcm', 'ogg', 'wav'
            word_timestamps: false // Currently only supported in English
        },
        
        // Web Speech API Settings (fallback)
        webSpeech: {
            rate: 1.0, // 0.1 to 10
            pitch: 1.0, // 0 to 2
            volume: 1.0, // 0 to 1
            voice: null // Will auto-select best English voice
        },
        
        // Behavior Settings
        autoSpeak: true, // Automatically speak when slide changes
        stopOnSlideChange: true, // Stop current speech when changing slides
        cleanMarkdown: true, // Remove markdown formatting before speaking
        speakSpeakerNotes: true // Speak speaker notes instead of slide content
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
        verboseLogging: false, // true: log full messages, false: log previews only
        chatHistory: {
            persist: true,
            maxEntries: 100,
            autoSave: true
        },
        responseFormat: 'markdown', // 'plain', 'markdown', 'html'
        // Slash Commands Configuration
        slashCommands: {
            '/analyze': {
                name: 'Document Analysis',
                prompt: `Please analyze this content and provide:
1. **Readability Assessment**: Rate the readability on a scale of 1-10 and explain why
2. **Key Themes**: Identify the 3-5 main themes or topics  
3. **Writing Style**: Describe the writing style (academic, casual, technical, etc.)
4. **Suggestions**: Provide 2-3 specific suggestions to improve clarity or engagement
5. **Word Cloud Keywords**: List the 10 most important/frequent keywords

Content to analyze:
{content}

{statistics}`,
                description: 'Analyzes document readability, themes, style, and provides improvement suggestions'
            },
            '/summarize': {
                name: 'Summarize Content',
                prompt: 'Please provide a concise summary of the following content, highlighting the main points and key takeaways:\n\n{content}',
                description: 'Creates a concise summary of the current document or selection'
            },
            '/improve': {
                name: 'Improve Writing',
                prompt: 'Please review this text and suggest specific improvements for clarity, flow, and engagement. Provide rewritten versions of problematic sentences:\n\n{content}',
                description: 'Suggests improvements for writing clarity and engagement'
            },
            '/explain': {
                name: 'Explain Complex Terms',
                prompt: 'Please explain any complex terms, concepts, or jargon in this content. Make it accessible to a general audience:\n\n{content}',
                description: 'Explains complex terms and concepts in simple language'
            }
        },
        // Assistant configurations
        assistants: {
            ash: {
                aiSettings: {
                    provider: 'auto',
                    model: 'auto',
                    temperature: 0.7,
                    maxTokens: 200
                }
            },
            chen: {
                aiSettings: {
                    provider: 'auto',
                    model: 'auto',
                    temperature: 0.8,
                    maxTokens: 1000
                }
            }
        }
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
        autoExpandFolders: false,
        hideGeneratedArtifacts: false
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
    
    // === Gamification Settings ===
    gamification: {
        focusSessionsEnabled: true,
        defaultFocusDuration: 25, // minutes
        breakReminders: true,
        achievementsEnabled: true,
        streakTracking: true,
        ledgerTracking: true,
        pointsSystem: true,
        achievementNotifications: true,
        showProgressBar: true,
        compactMode: false,
        menuCollapsedDefault: false
    },
    
    // === Editor Tabs (persisted open tabs) ===
    editorTabs: {
        openTabs: [],      // [{ filePath, fileName }] in visual order
        activeTabIndex: 0
    },

    // === Advanced Developer Options ===
    advanced: {
        enableDebugMode: false,
        showPerformanceMetrics: false,
        enableExperimentalFeatures: false,
        customCSSPath: '', // Path to custom CSS file
        featurePaths: [] // Paths to custom feature bundles (future feature)
    }
};

const retiredFeatureIds = new Set([
    'techne-theme-manager'
]);

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
            
            debugMain('Loaded settings', appSettings);
        } else {
            debugMain('No settings file found, using defaults.');
            appSettings = JSON.parse(JSON.stringify(defaultSettings)); // Deep copy
        }
    } catch (err) {
        console.error('[main.js] Failed to load settings:', err);
        debugMain('Backing up corrupted settings file and using defaults.');
        
        // Backup the corrupted file if it exists
        const fsSync = require('fs');
        if (fsSync.existsSync(SETTINGS_FILE)) {
            try {
                const backupPath = SETTINGS_FILE + '.backup.' + Date.now();
                fsSync.copyFileSync(SETTINGS_FILE, backupPath);
                debugMain(`Corrupted settings backed up to: ${backupPath}`);
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
    if (!appSettings.features) appSettings.features = {};
    if (!appSettings.techne) appSettings.techne = {};
    if (!appSettings.publishing || typeof appSettings.publishing !== 'object' || Array.isArray(appSettings.publishing)) {
        appSettings.publishing = {};
    }
    
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
    if (!Array.isArray(appSettings.features.enabled)) {
        appSettings.features.enabled = Array.isArray(appSettings.plugins?.enabled)
            ? appSettings.plugins.enabled.filter(Boolean)
            : [];
    }
    if (!Array.isArray(appSettings.workspaceFolders)) {
        appSettings.workspaceFolders = [];
    }
    if (!Array.isArray(appSettings.publishing.urlMappings)) {
        appSettings.publishing.urlMappings = [];
    }
    appSettings.publishing.urlMappings = appSettings.publishing.urlMappings
        .filter(mapping => mapping && typeof mapping === 'object')
        .map(mapping => ({
            localRoot: typeof mapping.localRoot === 'string' ? mapping.localRoot.trim() : '',
            urlTemplate: typeof mapping.urlTemplate === 'string' ? mapping.urlTemplate.trim() : ''
        }))
        .filter(mapping => mapping.localRoot && mapping.urlTemplate);
    const normalizedWorkingDirectory = normalizeWorkspacePath(appSettings.workingDirectory);
    if (normalizedWorkingDirectory) {
        appSettings.workingDirectory = normalizedWorkingDirectory;
    }
    const workspaceFolderResult = sanitizeWorkspaceFolders(
        appSettings.workingDirectory,
        appSettings.workspaceFolders
    );
    if (workspaceFolderResult.changed) {
        appSettings.workspaceFolders = workspaceFolderResult.workspaceFolders;
        console.warn(`[main.js] Removed ${workspaceFolderResult.removed.length} duplicate/overlapping workspace folder(s) from settings`);
    }

    // Ensure default bundled features are present (feature list is additive)
    const defaultFeatures = Array.isArray(defaultSettings?.features?.enabled) ? defaultSettings.features.enabled : [];
    for (const featureId of defaultFeatures) {
        if (!featureId) continue;
        if (!appSettings.features.enabled.includes(featureId)) {
            appSettings.features.enabled.push(featureId);
        }
    }
    appSettings.features.enabled = appSettings.features.enabled
        .filter(featureId => featureId && !retiredFeatureIds.has(featureId));
    for (const featureId of retiredFeatureIds) {
        delete appSettings.features[featureId];
    }

    // Migrate legacy per-plugin enable/disable overrides into feature settings.
    if (appSettings.plugins && typeof appSettings.plugins === 'object') {
        for (const [featureId, config] of Object.entries(appSettings.plugins)) {
            if (retiredFeatureIds.has(featureId)) continue;
            if (featureId === 'enabled' || !config || typeof config !== 'object') continue;
            if (config.enabled === false) {
                appSettings.features.enabled = appSettings.features.enabled.filter(id => id !== featureId);
                appSettings.features[featureId] = { enabled: false };
            } else if (config.enabled === true) {
                if (!appSettings.features.enabled.includes(featureId)) {
                    appSettings.features.enabled.push(featureId);
                }
                appSettings.features[featureId] = { enabled: true };
            }
        }
        delete appSettings.plugins;
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
    
    // Working directory: do NOT mutate the saved value when it's missing on disk.
    // Previously this overwrote appSettings.workingDirectory with the (huge) ~/Documents
    // default, which was then persisted by the next saveSettings() call — silently
    // destroying the user's chosen workspace whenever the directory was renamed/moved.
    // The saved value represents user intent and must survive transient absences;
    // app.whenReady computes a runtime fallback (currentWorkingDirectory) when the
    // saved dir doesn't exist, so the app stays usable without losing the saved choice.
    if (appSettings.workingDirectory) {
        const fs = require('fs');
        try {
            if (!fs.existsSync(appSettings.workingDirectory)) {
                debugMain('Saved working directory not currently present on disk; will use a runtime fallback but keep the saved value:', appSettings.workingDirectory);
            }
        } catch (error) {
            console.warn('[main.js] Error checking working directory existence:', error);
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
    if (appSettings.theme && !VALID_APP_THEMES.includes(appSettings.theme)) {
        appSettings.theme = defaultSettings.theme;
    }

    // Ensure Techne theme settings are valid
    if (!appSettings.techne || typeof appSettings.techne !== 'object') {
        appSettings.techne = JSON.parse(JSON.stringify(defaultSettings.techne));
    } else {
        const accent = appSettings.techne.accent === 'orange' ? 'orange' : 'red';
        const grid = appSettings.techne.grid !== false;
        const noise = appSettings.techne.noise !== false;
        appSettings.techne = {
            ...defaultSettings.techne,
            ...appSettings.techne,
            accent,
            grid,
            noise
        };
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

// Get recent workspaces list (paths only)
function getRecentWorkspaces() {
    if (!appSettings.recents || !Array.isArray(appSettings.recents.workspaces)) return [];
    return appSettings.recents.workspaces.map(w => w.path);
}

function getMacAppBundlePath() {
    if (process.platform !== 'darwin') return '';
    let current = process.execPath;
    while (current && current !== path.dirname(current)) {
        if (current.endsWith('.app')) return current;
        current = path.dirname(current);
    }
    return '';
}

function getCliInstallerOptions() {
    const isPackaged = Boolean(app.isPackaged);
    const appPath = process.platform === 'darwin'
        ? getMacAppBundlePath()
        : process.execPath;
    return {
        appName: app.getName() || 'NightOwl',
        appPath: isPackaged ? appPath : '',
        launcherPath: isPackaged ? '' : path.join(__dirname, 'bin', 'nightowl')
    };
}

async function installNightOwlShellCommand() {
    try {
        const result = installNightOwlCli(getCliInstallerOptions());
        const pathNote = result.pathIncludesTargetDir
            ? 'You can now run: nightowl .'
            : `Add this directory to PATH before using it: ${result.targetDir}`;

        await dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'NightOwl Command Installed',
            message: 'Installed the nightowl command.',
            detail: `${result.target}\n\n${pathNote}`
        });
    } catch (error) {
        await dialog.showMessageBox(mainWindow, {
            type: 'error',
            title: 'NightOwl Command Install Failed',
            message: 'Could not install the nightowl command.',
            detail: error.message || String(error)
        });
    }
}

function setPrimaryWorkingDirectory(folderPath) {
    const normalizedFolderPath = normalizeWorkspacePath(folderPath) || folderPath;
    currentWorkingDirectory = normalizedFolderPath;
    appSettings.workingDirectory = normalizedFolderPath;

    const workspaceFolderResult = sanitizeWorkspaceFolders(
        normalizedFolderPath,
        appSettings.workspaceFolders
    );
    if (workspaceFolderResult.changed) {
        appSettings.workspaceFolders = workspaceFolderResult.workspaceFolders;
        console.warn(`[main.js] Removed ${workspaceFolderResult.removed.length} duplicate/overlapping workspace folder(s) after primary folder change`);
    }

    return normalizedFolderPath;
}

function getLaunchTargetsFromCommandLine(commandLine = process.argv.slice(1), cwd = process.cwd()) {
    const parsed = parseNightOwlLaunchArgs(commandLine, { appRoot: __dirname, cwd });
    return resolveLaunchTargets(parsed.paths, { cwd, fs: fsSync })
        .filter((target) => {
            if (target.type === 'directory' || target.type === 'file') return true;
            console.warn(`[main.js] Ignoring launch path "${target.rawPath}": ${target.error}`);
            return false;
        });
}

function clearPersistedEditorTabs() {
    if (!appSettings.editorTabs || typeof appSettings.editorTabs !== 'object') {
        appSettings.editorTabs = {};
    }
    appSettings.editorTabs.openTabs = [];
    appSettings.editorTabs.activeTabIndex = 0;
}

function applyLaunchTargetToSettings(target) {
    if (!target || !target.path) return null;

    if (target.type === 'directory') {
        const folderPath = setPrimaryWorkingDirectory(target.path);
        addToRecentWorkspaces(folderPath);
        currentFilePath = null;
        appSettings.currentFile = '';
        clearPersistedEditorTabs();
        saveSettings();
        debugMain(`Launch target applied as workspace: ${folderPath}`);
        return { ...target, path: folderPath };
    }

    if (target.type === 'file') {
        const filePath = target.path;
        const folderPath = setPrimaryWorkingDirectory(target.workspacePath || path.dirname(filePath));
        addToRecentWorkspaces(folderPath);
        addToRecentFiles(filePath);
        currentFilePath = filePath;
        appSettings.currentFile = filePath;
        appSettings.editorTabs = {
            ...(appSettings.editorTabs || {}),
            openTabs: [{ filePath, fileName: path.basename(filePath) }],
            activeTabIndex: 0
        };
        saveSettings();
        debugMain(`Launch target applied as file: ${filePath}`);
        return { ...target, path: filePath, workspacePath: folderPath };
    }

    return null;
}

async function notifyRendererOfLaunchTarget(target) {
    if (!target || !mainWindow || mainWindow.isDestroyed()) return;

    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('settings-changed', {
        workingDirectory: appSettings.workingDirectory,
        workspaceFolders: appSettings.workspaceFolders,
        currentFile: appSettings.currentFile,
        editorTabs: appSettings.editorTabs
    });
    mainWindow.webContents.send('refresh-file-tree');

    if (target.type !== 'file') return;

    try {
        const content = await fs.readFile(target.path, 'utf8');
        mainWindow.webContents.send('file-opened', { filePath: target.path, content });
    } catch (error) {
        console.error(`[main.js] Could not open launch file ${target.path}:`, error);
    }
}

async function applyLaunchTargetsFromCommandLine(commandLine, cwd) {
    const targets = getLaunchTargetsFromCommandLine(commandLine, cwd);
    if (!targets.length) return null;
    const applied = applyLaunchTargetToSettings(targets[0]);
    await notifyRendererOfLaunchTarget(applied);
    return applied;
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
    
    // Apply AI provider settings if changed
    if (category === 'ai' && updates) {
        if (updates.preferredProvider && updates.preferredProvider !== 'auto') {
            try {
                tutorBridge.setDefaultProvider(updates.preferredProvider);
                debugMain(`Applied AI provider preference: ${updates.preferredProvider}`);
            } catch (error) {
                console.warn('[main.js] Could not apply AI provider preference:', error);
            }
        }
    }
    
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
    
    // Apply AI provider settings if changed
    if (category === 'ai' && newSettings) {
        // Update Local AI URL if changed
        if (newSettings.localAIUrl) {
            try {
                tutorBridge.updateLocalAIUrl(newSettings.localAIUrl);
                debugMain(`Updated Local AI URL: ${newSettings.localAIUrl}`);
            } catch (error) {
                console.warn('[main.js] Could not update Local AI URL:', error);
            }
        }

        if (newSettings.preferredProvider && newSettings.preferredProvider !== 'auto') {
            try {
                tutorBridge.setDefaultProvider(newSettings.preferredProvider);
                debugMain(`Applied AI provider preference: ${newSettings.preferredProvider}`);
            } catch (error) {
                console.warn('[main.js] Could not apply AI provider preference:', error);
            }
        }
    }
}

// Load settings before app ready
loadSettings();
const initialLaunchTargets = getLaunchTargetsFromCommandLine(process.argv.slice(1), process.cwd());
if (initialLaunchTargets.length > 0) {
  applyLaunchTargetToSettings(initialLaunchTargets[0]);
}

// Initialize Image Service (standalone, synchronous)
try {
  imageService = new ImageService();
  debugMain('ImageService initialized, available:', imageService.isAvailable());
} catch (error) {
  console.error('[main.js] Error initializing ImageService:', error);
}

// Set LOCAL_AI_URL from settings before tutor-bridge init
if (appSettings.ai && appSettings.ai.localAIUrl) {
  process.env.LOCAL_AI_URL = appSettings.ai.localAIUrl;
  debugMain('Setting LOCAL_AI_URL from settings:', appSettings.ai.localAIUrl);
}

// Note: tutorBridge.initTutorBridge() is called in app.whenReady() (async)
// because it uses dynamic import() to load ES module tutor-core.

// Initialize currentFilePath from saved settings
if (appSettings.currentFile && typeof appSettings.currentFile === 'string' && appSettings.currentFile.trim() !== '') {
    currentFilePath = appSettings.currentFile;
    debugMain('Initialized currentFilePath from settings:', currentFilePath);
} else {
    currentFilePath = null;
    debugMain('No current file in settings, currentFilePath set to null');
}

// Set additional app metadata
if (process.platform !== 'darwin') {
    // On non-macOS platforms, also set the desktop name
    app.setDesktopName('NightOwl');
} else {
    // Set macOS About panel information
    app.setAboutPanelOptions({
        applicationName: 'NightOwl',
        applicationVersion: '1.0.0',
        version: '1.0.0',
        credits: 'Advanced Markdown editor and presentation app for philosophical writing and teaching'
    });
}

// Save settings and stop capture bridge on shutdown
app.on('before-quit', () => {
  saveSettings();
  if (citationCaptureServer && citationCaptureServer.isRunning()) {
    citationCaptureServer.stop().catch((error) => {
      console.error('[main.js] Failed to stop citation capture bridge:', error);
    });
  }
});

// --- Theme Handling ---
nativeTheme.on('updated', () => {
    debugMain(`nativeTheme updated. Should use dark colors: ${nativeTheme.shouldUseDarkColors}`);
    // Guard against firing into a destroyed/closing webContents — produces the same
    // "webFrameMain was disposed" error class as the close-handler bug otherwise.
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('theme-updated', nativeTheme.shouldUseDarkColors);
    }
});

// --- Window Creation ---
let speakerNotesWindow = null;

function createWindow() {
  debugMain('Creating main window...');
  rendererCitationCaptureReady = false;
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload imports local app modules; Electron sandbox preloads cannot require them.
      sandbox: false,
      enableRemoteModule: false,
      spellcheck: true,
    },
    title: 'NightOwl - Philosophical Writing & Teaching',
    // Use native window frame and titlebar
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    show: false
  });

  // Enable @electron/remote for this window
  require("@electron/remote/main").enable(mainWindow.webContents);

  // Load the index.html of the app.
  const indexPath = path.join(__dirname, 'index.html');
  debugMain(`Loading URL: ${indexPath}`);
  mainWindow.loadFile(indexPath);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    const shouldOpenDevTools = process.argv.includes('--open-devtools') ||
      process.env.NIGHTOWL_OPEN_DEVTOOLS === '1';
    if (shouldOpenDevTools) {
      mainWindow.webContents.openDevTools();
    }
    debugMain(`App name in ready-to-show: ${app.getName()}`);
    debugMain(`Process title: ${process.title}`);
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
    debugMain('Main window closed.');
    rendererCitationCaptureReady = false;
    mainWindow = null;
  });

  // Send initial theme to renderer once DOM is ready
  mainWindow.webContents.on('did-finish-load', () => {
      const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
      debugMain(`Window finished loading. Sending initial theme: ${theme}`);
      mainWindow.webContents.send('theme-changed', theme);
      rendererCitationCaptureReady = false;
      
      // Send refresh signal with a slight delay to ensure renderer is ready
      setTimeout(() => {
        debugMain('Sending refresh-file-tree signal to renderer.');
        mainWindow.webContents.send('refresh-file-tree');
      }, 100);
  });

  // Prompt to save unsaved changes before closing the window
  let isForceClosing = false;
  mainWindow.on('close', async (e) => {
    if (isForceClosing) {
      saveSettings();
      return; // Allow close to proceed
    }

    e.preventDefault();

    // If the renderer is already gone (crashed, navigated, or being torn down),
    // don't try to talk to it — just save settings and tear the window down.
    const wc = mainWindow.webContents;
    if (!wc || wc.isDestroyed() || wc.isCrashed?.()) {
      saveSettings();
      isForceClosing = true;
      if (!mainWindow.isDestroyed()) mainWindow.destroy();
      return;
    }

    try {
      // Ask renderer if there are unsaved changes (only for files that still exist on disk).
      // Race the IPC call against a timeout so a disposed/hung renderer can't trap the user —
      // the previous "Render frame was disposed" rejection caused the close handler to hang
      // when executeJavaScript never settled.
      const dirtyFilesPromise = wc.executeJavaScript(
        `(async function() {
          async function fileExists(p) {
            try {
              const r = await window.electronAPI.invoke('check-file-exists', p);
              return typeof r === 'object' ? !!r?.exists : !!r;
            } catch (e) { return true; } // assume dirty on IPC error
          }
          if (window.editorTabs) {
            // Parallelize existence checks so we don't serialize one IPC round-trip per tab —
            // a long sequential loop widens the window for frame-disposal races during close.
            const checks = [];
            for (const [path, tab] of window.editorTabs.tabs) {
              if (tab.isDirty) {
                checks.push(fileExists(path).then(ok => ok ? tab.fileName : null));
              }
            }
            const results = await Promise.all(checks);
            return results.filter(Boolean);
          }
          if (window.hasUnsavedChanges && window.currentFilePath) {
            const ok = await fileExists(window.currentFilePath);
            if (!ok) { window.hasUnsavedChanges = false; return []; }
          }
          return window.hasUnsavedChanges ? ['current file'] : [];
        })()`
      );

      const TIMEOUT_MS = 2000;
      let timeoutHandle;
      const dirtyFiles = await Promise.race([
        dirtyFilesPromise,
        new Promise((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error('renderer-dirty-check-timeout')),
            TIMEOUT_MS
          );
        }),
      ]);
      clearTimeout(timeoutHandle);

      if (dirtyFiles.length === 0) {
        // No unsaved changes — close immediately
        isForceClosing = true;
        mainWindow.close();
        return;
      }

      const fileList = dirtyFiles.length === 1
        ? `"${dirtyFiles[0]}" has unsaved changes.`
        : `${dirtyFiles.length} files have unsaved changes.`;

      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Save', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        title: 'Unsaved Changes',
        message: fileList,
        detail: 'Do you want to save before closing?'
      });

      if (response === 0) {
        // Save — tell renderer to save all, then close
        if (!wc.isDestroyed()) wc.send('save-all-and-close');
      } else if (response === 1) {
        // Don't Save — close without saving
        isForceClosing = true;
        mainWindow.close();
      }
      // response === 2 (Cancel) — do nothing, window stays open
    } catch (err) {
      console.error('[main.js] Error checking unsaved changes:', err);
      // Renderer is unreachable (disposed frame, timeout, crash). Don't trap the user —
      // persist settings, then destroy() to bypass the close-event re-entry that close() triggers.
      saveSettings();
      isForceClosing = true;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.destroy();
      }
    }
  });

  // Renderer signals that all saves completed — now close the window
  ipcMain.once('saves-completed-close', () => {
    isForceClosing = true;
    if (mainWindow) mainWindow.close();
  });
}

// Helper functions for menu creation
function createFileMenuItems() {
    return [
      {
        label: 'New File',
        accelerator: 'CmdOrCtrl+N',
        click: async () => {
          if (!mainWindow) return;
          debugMain('[main.js] New File menu item clicked.');
          currentFilePath = null;
          // Title remains consistent - don't change app title for new files
          mainWindow.webContents.send('new-file-created');
          debugMain('[main.js] Sent new-file-created signal to renderer.');
        }
      },
      {
        label: 'Open File...',
        accelerator: 'CmdOrCtrl+O',
        click: async () => {
          if (!mainWindow) return;
          debugMain('[main.js] Open File menu item clicked.');
          const result = await openFile();
          if (result && result.filePath && mainWindow) {
              debugMain(`[main.js] File opened via menu: ${result.filePath}`);
          } else {
               debugMain('[main.js] Open File dialog cancelled or failed.');
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
           debugMain('[main.js] Open Folder menu item clicked.');
           try {
                const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
                    properties: ['openDirectory']
                });
	                if (!canceled && filePaths && filePaths.length > 0) {
	                    const folderPath = setPrimaryWorkingDirectory(filePaths[0]);
	                    debugMain(`[main.js] Folder selected: ${folderPath}`);
	                    addToRecentWorkspaces(folderPath);
	                    saveSettings();
	                    currentFilePath = null;
	                    // Notify renderer so its cached appSettings stays in sync
	                    mainWindow.webContents.send('settings-changed', {
	                        workingDirectory: folderPath,
	                        workspaceFolders: appSettings.workspaceFolders
	                    });
	                    mainWindow.webContents.send('refresh-file-tree');
	                     debugMain('[main.js] Sent refresh-file-tree signal to renderer.');
                } else {
                     debugMain('[main.js] Open Folder dialog cancelled.');
                }
           } catch (err) {
                console.error('[main.js] Error opening folder:', err);
                dialog.showErrorBox('Open Folder Error', `Could not open the selected folder: ${err.message}`);
           }
        }
      },
      {
        label: 'Recent Workspaces',
        submenu: (() => {
          const workspaces = getRecentWorkspaces();
          if (workspaces.length === 0) {
            return [{ label: 'No recent workspaces', enabled: false }];
          }
	          return workspaces.map(workspace => ({
	            label: path.basename(workspace) || workspace,
	            click: async () => {
	              if (!mainWindow) return;
	              const folderPath = setPrimaryWorkingDirectory(workspace);
	              saveSettings();
	              // Notify renderer so its cached appSettings stays in sync
	              mainWindow.webContents.send('settings-changed', {
	                workingDirectory: folderPath,
	                workspaceFolders: appSettings.workspaceFolders
	              });
	              mainWindow.webContents.send('refresh-file-tree');
	              addToRecentWorkspaces(folderPath);
	            }
	          }));
        })()
      },
      { type: 'separator' },
      {
        label: 'Import PDF as Markdown (Docling)',
        click: async () => {
          if (!mainWindow) return;
          debugMain('[main.js] Import PDF as Markdown menu item clicked.');
          mainWindow.webContents.send('trigger-import-pdf');
        }
      },
      {
        label: 'Import Word as Markdown (Pandoc)',
        click: async () => {
          if (!mainWindow) return;
          debugMain('[main.js] Import Word as Markdown menu item clicked.');
          mainWindow.webContents.send('trigger-import-word');
        }
      },
      {
        label: 'Generate Thumbnail (Nano Banana)',
        accelerator: 'CmdOrCtrl+Shift+T',
        click: async () => {
          if (!mainWindow) return;
          debugMain('[main.js] Generate Thumbnail menu item clicked.');
          mainWindow.webContents.send('trigger-generate-thumbnail');
        }
      },
      { type: 'separator' },
      {
        label: 'Save',
        accelerator: 'CmdOrCtrl+S',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Save menu item clicked. Triggering save in renderer.');
            mainWindow.webContents.send('trigger-save');
          }
        }
      },
      {
        label: 'Save As...',
        accelerator: 'Shift+CmdOrCtrl+S',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Save As menu item clicked. Triggering save-as in renderer.');
            mainWindow.webContents.send('trigger-save-as');
          }
        }
      },
      {
        // Cmd+W closes the active editor tab. Child windows (presentation
        // popup, etc.) still get native close behaviour via the focused-window
        // check — Cmd+W in those windows dismisses the popup as expected.
        label: 'Close Tab',
        accelerator: 'CmdOrCtrl+W',
        click: () => {
          const focused = BrowserWindow.getFocusedWindow();
          if (!focused) return;
          if (focused === mainWindow) {
            focused.webContents.send('menu:close-tab');
          } else {
            focused.close();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Export as HTML',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Export HTML menu item clicked. Triggering export-html in renderer.');
            mainWindow.webContents.send('trigger-export-html');
          }
        }
      },
      {
        label: 'Export as HTML (with References)',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Export HTML with References menu item clicked. Triggering export-html-pandoc in renderer.');
            mainWindow.webContents.send('trigger-export-html-pandoc');
          }
        }
      },
      {
        label: 'Export as PDF',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Export PDF menu item clicked. Triggering export-pdf in renderer.');
            mainWindow.webContents.send('trigger-export-pdf');
          }
        }
      },
      {
        label: 'Export as PDF (with References)',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Export PDF with References menu item clicked. Triggering export-pdf-pandoc in renderer.');
            mainWindow.webContents.send('trigger-export-pdf-pandoc');
          }
        }
      },
      {
        label: 'Export as Word',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('trigger-export-docx');
          }
        }
      },
      {
        label: 'Export as Word (with References)',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('trigger-export-docx-refs');
          }
        }
      },
      {
        label: 'Export as PowerPoint',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Export PowerPoint menu item clicked. Triggering export-pptx in renderer.');
            mainWindow.webContents.send('trigger-export-pptx');
          }
        }
      },
      {
        label: 'Export as Accessible HTML',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Export Accessible HTML menu item clicked. Triggering export-html-accessible in renderer.');
            mainWindow.webContents.send('trigger-export-html-accessible');
          }
        }
      }
    ];
}

function createEditMenuItems() {
    return [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
      { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
      { type: 'separator' },
      { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
      { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
      { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
      { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
      { type: 'separator' },
      {
        label: 'Settings...',
        accelerator: 'CmdOrCtrl+,',
        click: () => {
          if (!mainWindow) return;
          mainWindow.webContents.send('open-settings');
        }
      }
    ];
}

function createViewMenuItems() {
    return [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      {
        label: 'Theme',
        submenu: [
          { 
            label: 'Light', 
            type: 'radio', 
            checked: nativeTheme.themeSource === 'light', 
            click: () => { 
              debugMain('[main.js] Theme menu: Light selected');
              nativeTheme.themeSource = 'light'; 
              if (mainWindow) { 
                debugMain('[main.js] Sending set-theme: light');
                mainWindow.webContents.send('set-theme', 'light'); 
              } 
            } 
          },
          { 
            label: 'Dark', 
            type: 'radio', 
            checked: nativeTheme.themeSource === 'dark', 
            click: () => { 
              debugMain('[main.js] Theme menu: Dark selected');
              nativeTheme.themeSource = 'dark'; 
              if (mainWindow) { 
                debugMain('[main.js] Sending set-theme: dark');
                mainWindow.webContents.send('set-theme', 'dark'); 
              } 
            } 
          },
          { 
            label: 'System', 
            type: 'radio', 
            checked: nativeTheme.themeSource === 'system', 
            click: () => { 
              debugMain('[main.js] Theme menu: System selected');
              nativeTheme.themeSource = 'system'; 
              if (mainWindow) { 
                const sysTheme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
                debugMain('[main.js] Sending set-theme:', sysTheme);
                mainWindow.webContents.send('set-theme', sysTheme); 
              } 
            } 
          }
        ]
      },
      { type: 'separator' },
      {
        label: 'Editor Mode',
        accelerator: 'CmdOrCtrl+1',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Switching to Editor mode via menu');
            mainWindow.webContents.send('switch-to-editor');
          }
        }
      },
      {
        label: 'Presentation Mode',
        accelerator: 'CmdOrCtrl+2',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Switching to Presentation mode via menu');
            mainWindow.webContents.send('switch-to-presentation');
          }
        }
      },
      {
        label: 'Network Mode',
        accelerator: 'CmdOrCtrl+3',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Switching to Network mode via menu');
            mainWindow.webContents.send('switch-to-network');
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Command Palette...',
        accelerator: 'CmdOrCtrl+Shift+P',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Opening Command Palette via menu');
            mainWindow.webContents.send('show-command-palette');
          }
        }
      },
      {
        label: 'Style Settings...',
        accelerator: 'CmdOrCtrl+Shift+T',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Opening Style Settings via menu');
            mainWindow.webContents.send('open-style-settings');
          }
        }
      },
      {
        label: 'Show Writing Stats',
        accelerator: 'CmdOrCtrl+Shift+G',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Toggling Writing Stats panel via menu');
            mainWindow.webContents.send('toggle-gamification-panel');
          }
        }
      },
      {
        label: 'Visual Markdown',
        accelerator: 'CmdOrCtrl+Shift+V',
        type: 'checkbox',
        checked: appSettings.editor?.visualMarkdown || false,
        click: (menuItem) => {
          if (mainWindow) {
            debugMain('[main.js] Toggling Visual Markdown:', menuItem.checked);
            // Save the setting
            if (!appSettings.editor) appSettings.editor = {};
            appSettings.editor.visualMarkdown = menuItem.checked;
            saveSettings();
            mainWindow.webContents.send('toggle-visual-markdown', menuItem.checked);
          }
        }
      },
      {
        label: 'Toggle Preview Pane',
        accelerator: 'CmdOrCtrl+Shift+M',
        type: 'checkbox',
        checked: appSettings.editor?.showPreview !== false, // Default to true
        click: (menuItem) => {
          if (mainWindow) {
            debugMain('[main.js] Toggling Preview Pane:', menuItem.checked);
            // Save the setting
            if (!appSettings.editor) appSettings.editor = {};
            appSettings.editor.showPreview = menuItem.checked;
            saveSettings();
            mainWindow.webContents.send('toggle-preview-pane', menuItem.checked);
          }
        }
      },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ];
}

function createFormatMenuItems() {
    return [
      {
        label: 'Bold',
        accelerator: 'CmdOrCtrl+B',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Format: Bold');
            mainWindow.webContents.send('format-text', { type: 'bold' });
          }
        }
      },
      {
        label: 'Italic',
        accelerator: 'CmdOrCtrl+I',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Format: Italic');
            mainWindow.webContents.send('format-text', { type: 'italic' });
          }
        }
      },
      {
        label: 'Code',
        accelerator: 'CmdOrCtrl+`',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Format: Code');
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
            debugMain('[main.js] Format: Heading 1');
            mainWindow.webContents.send('format-text', { type: 'heading1' });
          }
        }
      },
      {
        label: 'Heading 2',
        accelerator: 'CmdOrCtrl+Alt+2',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Format: Heading 2');
            mainWindow.webContents.send('format-text', { type: 'heading2' });
          }
        }
      },
      {
        label: 'Heading 3',
        accelerator: 'CmdOrCtrl+Alt+3',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Format: Heading 3');
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
            debugMain('[main.js] Format: Bullet List');
            mainWindow.webContents.send('format-text', { type: 'bulletlist' });
          }
        }
      },
      {
        label: 'Numbered List',
        accelerator: 'CmdOrCtrl+Shift+7',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Format: Numbered List');
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
            debugMain('[main.js] Format: Insert Link');
            mainWindow.webContents.send('format-text', { type: 'link' });
          }
        }
      },
      {
        label: 'Insert Image',
        accelerator: 'CmdOrCtrl+Shift+I',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Format: Insert Image');
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
            debugMain('[main.js] Format: Blockquote');
            mainWindow.webContents.send('format-text', { type: 'blockquote' });
          }
        }
      },
      {
        label: 'Strikethrough',
        accelerator: 'CmdOrCtrl+Shift+X',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Format: Strikethrough');
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
            debugMain('[main.js] Format: Fold Current');
            mainWindow.webContents.send('format-text', { type: 'fold-current' });
          }
        }
      },
      {
        label: 'Expand Current Section',
        accelerator: 'CmdOrCtrl+Shift+]',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Format: Expand Current');
            mainWindow.webContents.send('format-text', { type: 'unfold-current' });
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Fold All Sections',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Format: Fold All');
            mainWindow.webContents.send('format-text', { type: 'fold-all' });
          }
        }
      },
      {
        label: 'Expand All Sections',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Format: Expand All');
            mainWindow.webContents.send('format-text', { type: 'unfold-all' });
          }
        }
      }
    ];
}

function createPresentationMenuItems() {
    return [
      {
        label: 'Generate Lecture Summary',
        accelerator: 'CmdOrCtrl+G',
        click: async () => {
          if (mainWindow) {
            debugMain('[main.js] Generate Lecture Summary clicked');
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
        // accelerator: 'Right', // Disabled to allow renderer to handle arrow keys (fixes autocomplete focus)
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('next-slide');
          }
        }
      },
      {
        label: 'Previous Slide',
        // accelerator: 'Left', // Disabled to allow renderer to handle arrow keys (fixes autocomplete focus)
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
    ];
}

function createSettingsMenuItems() {
    return [
      {
        label: 'Preferences...',
        accelerator: 'CmdOrCtrl+,',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Opening settings dialog');
            mainWindow.webContents.send('open-settings-dialog');
          }
        }
      },
      { type: 'separator' },
      {
        label: 'AI Configuration',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Opening AI configuration dialog');
            mainWindow.webContents.send('open-ai-settings-dialog');
          }
        }
      },
      {
        label: 'Editor Settings',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Opening editor settings dialog');
            mainWindow.webContents.send('open-editor-settings-dialog');
          }
        }
      },
      {
        label: 'Export Preferences',
        click: () => {
          if (mainWindow) {
            debugMain('[main.js] Opening export settings dialog');
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
              defaultPath: path.join(app.getPath('documents'), 'machinespirits-ide-settings.json'),
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
    ];
}

function createHelpMenuItems() {
    return [
      {
        label: 'About NightOwl',
        click: () => {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'About NightOwl',
            message: 'NightOwl',
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

AI Writing:
• Cmd+Shift+': Invoke Ash (AI Writing Companion)

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
      },
      { type: 'separator' },
      {
        label: "Install 'nightowl' Shell Command",
        click: async () => {
          await installNightOwlShellCommand();
        }
      }
    ];
}

function createMainMenu() {
    const template = [
      {
        label: 'File',
        submenu: createFileMenuItems()
      },
      {
        label: 'Edit', 
        submenu: createEditMenuItems()
      },
      {
        label: 'Format',
        submenu: createFormatMenuItems()
      },
      {
        label: 'View',
        submenu: createViewMenuItems()
      },
      {
        label: 'Presentation',
        submenu: createPresentationMenuItems()
      },
      {
        label: 'Settings',
        submenu: createSettingsMenuItems()
      },
      {
        label: 'Help',
        submenu: createHelpMenuItems()
      }
    ];

    // macOS specific adjustments
    if (process.platform === 'darwin') {
        template.unshift({
          label: app.getName(),
          submenu: [
            { label: 'About ' + app.getName(), role: 'about' },
            { type: 'separator' },
            { label: 'Quit', accelerator: 'Command+Q', click: () => app.quit() }
          ] 
        });
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
        debugMain(`[main.js] Content successfully saved to ${filePath}`);
        currentFilePath = filePath;
        // Title remains consistent - don't change app title based on file name
        return { success: true, filePath: filePath };
    } catch (err) {
        console.error(`[main.js] Error saving file to ${filePath}:`, err);
        dialog.showErrorBox('Save Error', `Failed to save the file: ${err.message}`);
        return { success: false, error: err.message };
    }
}

function getMainWorkspaceWriteRoots() {
    const roots = [
        currentWorkingDirectory,
        appSettings.workingDirectory,
        ...(Array.isArray(appSettings.workspaceFolders) ? appSettings.workspaceFolders : [])
    ];

    return roots
        .map((rootPath) => normalizeWorkspacePath(rootPath) || rootPath)
        .filter(Boolean);
}

function resolveMainWorkspaceWritePath(filePath, label = 'File path') {
    return resolvePathWithinRoots(filePath, getMainWorkspaceWriteRoots(), {
        label,
        baseDirectory: currentWorkingDirectory || appSettings.workingDirectory || process.cwd()
    });
}

// Add H1 heading with filename if needed
function addH1HeadingIfNeeded(content, fileName) {
    debugMain('[main.js] addH1HeadingIfNeeded called with:', { content: content.substring(0, 50), fileName });
    
    // Clean the filename for use as a heading
    const cleanFileName = fileName
        .replace(/[-_]/g, ' ') // Replace dashes and underscores with spaces
        .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize each word
    
    debugMain('[main.js] Clean filename:', cleanFileName);
    
    // Check if content is empty or very short (just whitespace)
    const trimmedContent = content.trim();
    debugMain('[main.js] Trimmed content length:', trimmedContent.length);
    
    if (trimmedContent.length === 0) {
        // Empty file - add H1 heading
        const result = `# ${cleanFileName}\n\n`;
        debugMain('[main.js] Empty file - adding H1:', result);
        return result;
    }
    
    // Check if content already starts with an H1 heading
    const lines = content.split('\n');
    const firstNonEmptyLine = lines.find(line => line.trim().length > 0);
    debugMain('[main.js] First non-empty line:', firstNonEmptyLine);
    
    if (firstNonEmptyLine && firstNonEmptyLine.trim().startsWith('# ')) {
        // Already has H1 heading - don't add another
        debugMain('[main.js] Already has H1 - no change');
        return content;
    }
    
    // Check if content starts with slide markers (---) - presentation format
    if (firstNonEmptyLine && firstNonEmptyLine.trim() === '---') {
        // This is presentation content with slide markers
        // Add H1 as the first slide content, not before the markers
        debugMain('[main.js] Detected slide markers - adding H1 as first slide');
        
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
        debugMain('[main.js] Adding H1 after first slide marker:', result.substring(0, 100));
        return result;
    }
    
    // Add H1 heading at the beginning (normal content)
    const result = `# ${cleanFileName}\n\n${content}`;
    debugMain('[main.js] Adding H1 to beginning:', result.substring(0, 100));
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
            debugMain('[main.js] Save As dialog was cancelled.');
            return { success: false };
        }

        debugMain(`[main.js] User chose path for Save As: ${filePath}`);
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
        
        debugMain(`[main.js] Global search found ${results.length} matches in ${files.length} files`);
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

    debugMain(`[main.js] Performing global replace ${previewOnly ? '(preview)' : '(execute)'}`);
    
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
                debugMain(`[main.js] Modified ${filePath} with ${fileReplacements} replacements`);
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
        debugMain('[main.js] Starting lecture summary generation...');
        
        // Get the current working directory (should be the lectures folder)
        const workingDir = appSettings.workingDirectory || path.join(__dirname, 'lectures');
        debugMain(`[main.js] Using working directory: ${workingDir}`);
        
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
                    debugMain('[main.js] Lecture summary generated successfully');
                    debugMain(`[main.js] Python output: ${stdout}`);
                    
                    // Load the generated summary.md file from the working directory
                    try {
                        const content = await fs.readFile(outputPath, 'utf8');
                        debugMain('[main.js] Loaded lecture summary content from:', outputPath);
                        
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
    debugMain('[main.js] Showing Open File dialog...');
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
            debugMain('[main.js] Open File dialog cancelled.');
            return null;
        }

        const filePath = filePaths[0];
        debugMain(`[main.js] User selected file: ${filePath}`);
        const content = await fs.readFile(filePath, 'utf8');
        currentFilePath = filePath;
        // Title remains consistent - don't change app title based on file name
         if (mainWindow) {
            mainWindow.webContents.send('file-opened', { filePath, content });
            debugMain(`[main.js] Sent file-opened event for ${filePath}`);
         }
        return { filePath, content };
    } catch (err) {
        console.error(`[main.js] Error opening file:`, err);
        dialog.showErrorBox('Open File Error', `Could not open the selected file: ${err.message}`);
        return null;
    }
}

// --- App Initialization ---
app.whenReady().then(async () => {
  debugMain('App is ready via whenReady()');
  
  // Resolve a usable runtime working directory. The saved value
  // (appSettings.workingDirectory) is preserved as user intent — we never overwrite
  // it here — but it may currently point at a missing dir (renamed/moved/deleted),
  // so we pick the best existing fallback for actual runtime use.
  // Fallback chain: saved dir → first existing workspaceFolders entry →
  // first existing recents.workspaces entry → directory of currentFile if real →
  // user home (NOT ~/Documents — too heavy for the file tree walk).
  {
    const fsSync = require('fs');
    const candidates = [];
    if (appSettings.workingDirectory) candidates.push(appSettings.workingDirectory);
    if (Array.isArray(appSettings.workspaceFolders)) {
      candidates.push(...appSettings.workspaceFolders);
    }
    if (appSettings.recents?.workspaces) {
      for (const w of appSettings.recents.workspaces) {
        const p = typeof w === 'string' ? w : w?.path;
        if (p) candidates.push(p);
      }
    }
    if (typeof appSettings.currentFile === 'string'
        && !appSettings.currentFile.startsWith('untitled')) {
      candidates.push(path.dirname(appSettings.currentFile));
    }
    candidates.push(app.getPath('home'));

    currentWorkingDirectory = candidates.find((p) => {
      try { return p && fsSync.existsSync(p); } catch { return false; }
    }) || app.getPath('home');

    if (currentWorkingDirectory !== appSettings.workingDirectory) {
      debugMain(`Saved workingDirectory not present; using runtime fallback: ${currentWorkingDirectory} (saved value preserved: ${appSettings.workingDirectory})`);
    } else {
      debugMain(`Using saved working directory: ${currentWorkingDirectory}`);
    }
  }

  // Set dock icon on macOS
  if (process.platform === 'darwin') {
    const dockIconPath = path.join(__dirname, 'build', 'icon.png');
    try {
      if (require('fs').existsSync(dockIconPath)) {
        app.dock.setIcon(dockIconPath);
        debugMain('Dock icon set successfully');
      }
    } catch (error) {
      console.warn('[main.js] Could not set dock icon:', error);
    }
  }

  // --- Helper Functions for IPC Handlers ---
  
  // System prompt helper function
  async function buildSystemMessage(aiSettings = {}) {
    const systemPromptSource = aiSettings.systemPromptSource || 'default';
    let systemMessage = '';
    
    switch (systemPromptSource) {
      case 'file':
        if (aiSettings.systemPromptFile && aiSettings.systemPromptFile.trim()) {
          try {
            systemMessage = await fs.readFile(aiSettings.systemPromptFile, 'utf8');
            debugMain(`Loaded system prompt from file: ${aiSettings.systemPromptFile}`);
          } catch (error) {
            console.warn(`[main.js] Could not load system prompt file: ${error.message}`);
            systemMessage = 'You are a helpful AI assistant focused on academic writing and research.';
          }
        } else {
          systemMessage = 'You are a helpful AI assistant focused on academic writing and research.';
        }
        break;
        
      case 'custom':
        systemMessage = aiSettings.customSystemPrompt || 'You are a helpful AI assistant focused on academic writing and research.';
        break;
        
      default: // 'default'
        systemMessage = 'You are a helpful AI assistant focused on academic writing and research. Provide clear, accurate, and well-structured responses that help users with their writing, research, and learning goals.';
        break;
    }
    
    return systemMessage;
  }

  // --- IPC Handlers ---
  
  // Speaker Notes Window handlers
  ipcMain.handle('open-speaker-notes-window', async (event, notes) => {
    if (speakerNotesWindow && !speakerNotesWindow.isDestroyed()) {
      speakerNotesWindow.focus();
      speakerNotesWindow.webContents.send('update-speaker-notes', notes);
      return { success: true };
    }
    
    // Get screen dimensions for positioning
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    
    // Calculate 2:1 ratio - main window gets 2/3, notes get 1/3
    const notesWidth = Math.floor(screenWidth / 3);
    const mainWidth = screenWidth - notesWidth;
    const windowHeight = screenHeight;
    
    // Position main window on the left (2/3 of screen)
    if (mainWindow) {
      mainWindow.setBounds({
        x: 0,
        y: 0,
        width: mainWidth,
        height: windowHeight
      });
      debugMain(`[main.js] Positioned main window: ${mainWidth}x${windowHeight} at (0,0)`);
    }
    
    speakerNotesWindow = new BrowserWindow({
      width: notesWidth,
      height: windowHeight,
      x: mainWidth, // Position on the right side
      y: 0,
      minWidth: 300,
      minHeight: 400,
      title: 'Speaker Notes - NightOwl',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, 'speaker-notes-preload.js'),
      },
      alwaysOnTop: false,
      frame: true,
      show: false
    });
    
    // Load a simple HTML page for speaker notes with proper styling
    const notesHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Speaker Notes</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #2c3e50;
      color: white;
      overflow-y: auto;
      height: 100vh;
      box-sizing: border-box;
    }
    
    .speaker-notes-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 16px 16px 8px 16px;
      padding-top: 8px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .speaker-notes-header h4 {
      margin: 0;
      font-size: 14px;
      color: #ecf0f1;
    }
    
    .slide-indicator {
      background: #34495e;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
    }
    
    #notes-content {
      font-size: 13px;
      line-height: 1.4;
      color: #bdc3c7;
      padding: 0 16px 16px 16px;
      overflow-y: auto;
      height: calc(100vh - 80px);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    
    #notes-content h3 {
      color: #4ecdc4;
      margin-bottom: 10px;
      font-size: 16px;
    }
    
    #notes-content p {
      margin-bottom: 10px;
      font-size: 14px !important;
    }
    
    #notes-content ul,
    #notes-content ol {
      margin-left: 20px;
      margin-bottom: 10px;
    }
    
    #notes-content li {
      margin-bottom: 5px;
    }
    
    em {
      color: #95a5a6;
      font-style: italic;
    }
    
    /* Make sure text is readable */
    #notes-content strong {
      color: #ecf0f1;
    }
    
    /* Style any code blocks */
    #notes-content code {
      background: rgba(52, 73, 94, 0.5);
      padding: 2px 4px;
      border-radius: 3px;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    }
  </style>
</head>
<body>
  <div class="speaker-notes-header">
    <h4>📝 Speaker Notes</h4>
    <div class="slide-indicator">Slide <span id="slide-number">1</span></div>
  </div>
  <div id="notes-content"><em>No speaker notes for this slide.</em></div>
  <script>
    function renderEmptyState(contentDiv) {
      contentDiv.replaceChildren();
      const empty = document.createElement('em');
      empty.textContent = 'No speaker notes for this slide.';
      contentDiv.appendChild(empty);
    }

    function renderNotes(contentDiv, notes) {
      if (!notes) {
        renderEmptyState(contentDiv);
        return;
      }

      contentDiv.replaceChildren();
      const lines = String(notes).split(/\\r?\\n/);
      let currentList = null;

      const flushList = () => {
        currentList = null;
      };

      lines.forEach((line) => {
        const trimmed = line.trim();

        if (!trimmed) {
          flushList();
          return;
        }

        if (/^[-*]\\s+/.test(trimmed)) {
          if (!currentList) {
            currentList = document.createElement('ul');
            contentDiv.appendChild(currentList);
          }
          const item = document.createElement('li');
          item.textContent = trimmed.replace(/^[-*]\\s+/, '');
          currentList.appendChild(item);
          return;
        }

        flushList();

        const paragraph = document.createElement('p');
        paragraph.textContent = trimmed;
        contentDiv.appendChild(paragraph);
      });

      if (!contentDiv.childNodes.length) {
        renderEmptyState(contentDiv);
      }
    }

    window.speakerNotesAPI.onUpdateSpeakerNotes((data) => {
      const contentDiv = document.getElementById('notes-content');
      const slideNumber = document.getElementById('slide-number');
      
      renderNotes(contentDiv, data && data.notes);
      if (data.slideNumber !== undefined) {
        slideNumber.textContent = data.slideNumber;
      }
    });
  </script>
</body>
</html>`;
    
    speakerNotesWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(notesHTML)}`);
    
    speakerNotesWindow.once('ready-to-show', () => {
      speakerNotesWindow.show();
      speakerNotesWindow.webContents.send('update-speaker-notes', notes);
    });
    
    speakerNotesWindow.on('closed', () => {
      speakerNotesWindow = null;
      
      // Restore main window to full screen when speaker notes window is manually closed
      if (mainWindow && !mainWindow.isDestroyed()) {
        const { screen } = require('electron');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
        
        mainWindow.setBounds({
          x: 0,
          y: 0,
          width: screenWidth,
          height: screenHeight
        });
        debugMain('[main.js] Restored main window to full screen after manual close');
        
        // Notify main window that speaker notes window was closed
        mainWindow.webContents.send('speaker-notes-window-closed');
      }
    });
    
    return { success: true };
  });
  
  ipcMain.handle('close-speaker-notes-window', async () => {
    if (speakerNotesWindow && !speakerNotesWindow.isDestroyed()) {
      speakerNotesWindow.close();
      speakerNotesWindow = null;
    }
    
    // Restore main window to full screen when speaker notes are closed
    if (mainWindow && !mainWindow.isDestroyed()) {
      const { screen } = require('electron');
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
      
      mainWindow.setBounds({
        x: 0,
        y: 0,
        width: screenWidth,
        height: screenHeight
      });
      debugMain('[main.js] Restored main window to full screen');
    }
    
    return { success: true };
  });
  
  ipcMain.handle('update-speaker-notes', async (event, notes) => {
    if (speakerNotesWindow && !speakerNotesWindow.isDestroyed()) {
      speakerNotesWindow.webContents.send('update-speaker-notes', notes);
    } else {
      // Return failure so caller knows the window needs to be recreated
      return { success: false, error: 'Speaker notes window not available' };
    }
    return { success: true };
  });

  ipcMain.handle('focus-main-window', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
      mainWindow.show();
      return { success: true };
    }
    return { success: false, error: 'Main window not available' };
  });

  // Get recent workspaces for the renderer dropdown
  ipcMain.handle('get-recent-workspaces', () => {
    return getRecentWorkspaces();
  });

  // Switch primary working directory (from renderer, given a path)
  ipcMain.handle('switch-workspace', async (event, workspacePath) => {
    try {
      const fsSync = require('fs');
      const folderPath = normalizeWorkspacePath(workspacePath) || workspacePath;
      if (!fsSync.existsSync(folderPath)) {
        return { success: false, error: 'Folder no longer exists' };
      }
      setPrimaryWorkingDirectory(folderPath);
      addToRecentWorkspaces(folderPath);
      saveSettings();
      if (mainWindow) {
        // Notify renderer so its cached appSettings stays in sync
        mainWindow.webContents.send('settings-changed', {
          workingDirectory: folderPath,
          workspaceFolders: appSettings.workspaceFolders
        });
        mainWindow.webContents.send('refresh-file-tree');
      }
      return { success: true, directory: folderPath };
    } catch (error) {
      console.error('[main.js] Error switching workspace:', error);
      return { success: false, error: error.message };
    }
  });

  // Save editor layout (pane proportions + visibility) from renderer
  ipcMain.on('save-layout', (event, layoutData) => {
    if (layoutData && typeof layoutData === 'object') {
      appSettings.layout = { ...appSettings.layout, ...layoutData };
      saveSettings();
    }
  });

  ipcMain.on('citations-capture-ready', () => {
    rendererCitationCaptureReady = true;
    flushCitationCaptureQueue();
  });

  ipcMain.handle('citations-get-pending-captures', async () => {
    const captures = [...pendingCitationCaptures];
    pendingCitationCaptures = [];
    return { success: true, captures };
  });

  ipcMain.handle('citations-get-capture-tools', async () => {
    const endpoint = `http://${citationCaptureBridgeConfig.host}:${citationCaptureBridgeConfig.port}/capture`;
    return {
      success: true,
      endpoint,
      host: citationCaptureBridgeConfig.host,
      port: citationCaptureBridgeConfig.port,
      bookmarklet: buildCitationCaptureBookmarklet(endpoint)
    };
  });

  ipcMain.handle('citations-export-browser-capture-bundles', async () => {
    try {
      const integrationRoot = path.join(__dirname, 'integrations', 'citation-capture');
      const chromeExtensionDir = path.join(integrationRoot, 'chrome-extension');
      const firefoxExtensionDir = path.join(integrationRoot, 'firefox-extension');

      const timestamp = formatCaptureTimestamp();
      const exportRoot = path.join(
        currentWorkingDirectory || app.getPath('downloads'),
        'nightowl-citation-capture'
      );
      const bundleDirectory = path.join(exportRoot, `bundle-${timestamp}`);

      await fs.mkdir(bundleDirectory, { recursive: true });

      const copiedAssets = [];
      for (const filename of ['README.md', 'bookmarklet-source.js']) {
        const sourcePath = path.join(integrationRoot, filename);
        const destinationPath = path.join(bundleDirectory, filename);
        await fs.copyFile(sourcePath, destinationPath);
        copiedAssets.push(destinationPath);
      }

      const bundledArtifacts = [];
      const warnings = [];
      const extensionTargets = [
        {
          name: 'chrome',
          sourceDir: chromeExtensionDir,
          zipName: 'nightowl-citation-capture-chrome.zip'
        },
        {
          name: 'firefox',
          sourceDir: firefoxExtensionDir,
          zipName: 'nightowl-citation-capture-firefox.zip'
        }
      ];

      for (const target of extensionTargets) {
        const zipPath = path.join(bundleDirectory, target.zipName);

        try {
          await packageCaptureExtension(target.sourceDir, zipPath);
          bundledArtifacts.push({
            browser: target.name,
            type: 'zip',
            path: zipPath
          });
        } catch (error) {
          const fallbackDir = path.join(bundleDirectory, `${target.name}-extension`);
          await fs.cp(target.sourceDir, fallbackDir, { recursive: true });
          bundledArtifacts.push({
            browser: target.name,
            type: 'directory',
            path: fallbackDir
          });
          warnings.push(`Could not zip ${target.name} extension automatically: ${error.message}`);
        }
      }

      return {
        success: true,
        bundleDirectory,
        files: [...copiedAssets, ...bundledArtifacts.map(item => item.path)],
        artifacts: bundledArtifacts,
        warnings
      };
    } catch (error) {
      console.error('[main.js] Failed to export browser capture bundles:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  // Handle saving images to current directory
  ipcMain.handle('save-image-to-current-dir', async (event, filename, base64data) => {
    try {
      const buffer = Buffer.from(base64data, 'base64');
      const baseDirectory = path.resolve(currentWorkingDirectory || process.cwd());
      const safeFilename = path.basename(String(filename || ''));

      if (!safeFilename || safeFilename === '.' || safeFilename === path.sep) {
        return {
          success: false,
          error: 'Invalid image filename'
        };
      }

      const filePath = path.resolve(baseDirectory, safeFilename);
      if (path.dirname(filePath) !== baseDirectory) {
        return {
          success: false,
          error: 'Image path must stay inside the working directory'
        };
      }
      
      // fs is already imported as fs.promises at the top, so use it directly
      await fs.writeFile(filePath, buffer);
      
      return { 
        success: true, 
        path: filePath 
      };
    } catch (error) {
      console.error('Error saving image:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  // Handle saving files
  ipcMain.handle('save-file', async (event, { filePath, content }) => {
    try {
      const targetResult = resolveMainWorkspaceWritePath(filePath, 'File path');
      if (!targetResult.success) {
        return {
          success: false,
          error: targetResult.error,
          filePath
        };
      }

      const result = await saveFile(targetResult.path, content);
      return result.success
        ? { success: true, path: targetResult.path, filePath: targetResult.path }
        : result;
    } catch (error) {
      console.error('Error saving file:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  });

  const parsedCapturePort = Number.parseInt(process.env.NIGHTOWL_CAPTURE_PORT, 10);
  const capturePort = Number.isInteger(parsedCapturePort) && parsedCapturePort > 0 && parsedCapturePort < 65536
    ? parsedCapturePort
    : DEFAULT_CAPTURE_PORT;

  citationCaptureBridgeConfig = {
    host: DEFAULT_CAPTURE_HOST,
    port: capturePort
  };

  const capturePortCandidates = [capturePort];
  for (let offset = 1; offset <= 5; offset += 1) {
    capturePortCandidates.push(capturePort + offset);
  }
  capturePortCandidates.push(0); // Let OS assign an available ephemeral port as final fallback

  let captureBridgeStarted = false;
  for (const candidatePort of capturePortCandidates) {
    citationCaptureServer = createCitationCaptureServer({
      host: citationCaptureBridgeConfig.host,
      port: candidatePort,
      onCapture: (payload) => {
        enqueueCitationCapture(payload);
      },
      logger: console
    });

    try {
      const address = await citationCaptureServer.start();
      citationCaptureBridgeConfig = address;
      captureBridgeStarted = true;
    debugMain(`Citation capture bridge listening on http://${address.host}:${address.port}/capture`);
      break;
    } catch (error) {
      const isAddressInUse = error && error.code === 'EADDRINUSE';
      if (!isAddressInUse) {
        console.error('[main.js] Failed to start citation capture bridge:', error);
        break;
      }

      debugMain(`Capture bridge port ${candidatePort} is in use, trying next port...`);
    }
  }

  if (!captureBridgeStarted) {
    console.error('[main.js] Citation capture bridge unavailable. Browser capture features are disabled for this session.');
  }
  
  createWindow();
  
  // Initialize tutor-bridge (async — loads ESM tutor-core via dynamic import)
  try {
    await tutorBridge.initTutorBridge({
      learnerId: 'local-writer',
      dbPath: path.join(app.getPath('userData'), 'tutor-core.db')
    });
    debugMain('TutorBridge initialized successfully');

    // Apply saved AI settings
    if (appSettings.ai && appSettings.ai.preferredProvider) {
      try {
        tutorBridge.setDefaultProvider(appSettings.ai.preferredProvider);
        debugMain(`Applied saved AI provider preference: ${appSettings.ai.preferredProvider}`);
      } catch (error) {
        console.warn('[main.js] Could not apply saved AI provider preference:', error);
      }
    }

    const providers = tutorBridge.getAvailableProviders();
    debugMain('AI providers available via tutor-core:', providers);
    if (providers.length === 0) {
      debugMain('No AI providers configured. Built-in AI writing features will be disabled.');
      debugMain('Add API keys to your .env file to enable built-in AI features. See .env.example for details.');
    }
  } catch (error) {
    console.error('[main.js] Error initializing TutorBridge:', error);
  }

  // Register modular IPC handlers after window is created
  ipcHandlers.registerAllHandlers({
    app,
    appSettings,
    defaultSettings,
    saveSettings,
    mainWindow,
    getMainWindow: () => mainWindow,
    tutorBridge,
    imageService,
    getCurrentFilePath: () => currentFilePath,
    getCurrentWorkingDirectory: () => currentWorkingDirectory,
    setCurrentWorkingDirectory: (directory) => {
      currentWorkingDirectory = directory;
    },
    currentWorkingDirectory,
    userDataPath: app.getPath('userData'),
    setCurrentFilePath: (path) => {
      currentFilePath = path;
      appSettings.currentFile = path;
      saveSettings();
      debugMain(`Current file updated and saved to settings: ${path}`);
    },
    buildSystemMessage,
    cleanAIResponse
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  nativeTheme.on('updated', () => {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    debugMain('Native theme updated. Sending to renderer.');
    if (mainWindow) {
      mainWindow.webContents.send('theme-changed', theme);
    }
  });
});

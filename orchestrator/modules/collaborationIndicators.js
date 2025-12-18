/**
 * Collaboration Indicators Module
 * Provides real-time collaboration visualization for multi-user editing:
 * - Remote cursor positions with user labels
 * - Edit highlights showing sections being modified by others
 * - User presence indicators
 *
 * This module provides the UI infrastructure for collaboration.
 * It can work with:
 * 1. A simulated mode for testing/demo
 * 2. A real WebSocket server for actual collaboration
 *
 * @module collaborationIndicators
 */

// --- Configuration ---
const config = {
    enabled: false,
    // Cursor display settings
    cursorBlink: true,
    cursorBlinkInterval: 500, // ms
    showCursorLabel: true,
    labelDisplayDuration: 3000, // ms to show label after cursor moves
    // Edit highlight settings
    highlightFadeDelay: 2000, // ms before fading edit highlights
    highlightFadeDuration: 500, // ms for fade animation
    // User colors (assigned automatically)
    userColors: [
        '#FF6B6B', // Red
        '#4ECDC4', // Teal
        '#45B7D1', // Blue
        '#96CEB4', // Green
        '#FFEAA7', // Yellow
        '#DDA0DD', // Plum
        '#98D8C8', // Mint
        '#F7DC6F', // Gold
        '#BB8FCE', // Purple
        '#85C1E9'  // Sky Blue
    ]
};

// --- State ---
/** @type {Map<string, RemoteUser>} Map of user ID to user data */
const remoteUsers = new Map();

/** @type {Map<string, Array>} Map of user ID to their cursor decoration IDs */
const cursorDecorations = new Map();

/** @type {Map<string, Array>} Map of user ID to their edit highlight decoration IDs */
const editDecorations = new Map();

/** @type {Map<string, HTMLElement>} Map of user ID to cursor label elements */
const cursorLabels = new Map();

/** @type {Map<string, number>} Map of user ID to label hide timeout */
const labelTimeouts = new Map();

/** @type {Object|null} Monaco editor instance */
let editor = null;

/** @type {number} Color index counter for assigning colors */
let colorIndex = 0;

/** @type {Object|null} Connection adapter (WebSocket, mock, etc.) */
let connectionAdapter = null;

/** @type {string|null} Local user ID */
let localUserId = null;

/** @type {function|null} Cursor position listener disposable */
let cursorListener = null;

/** @type {function|null} Selection listener disposable */
let selectionListener = null;

// --- User Management ---

/**
 * @typedef {Object} RemoteUser
 * @property {string} id - Unique user ID
 * @property {string} name - Display name
 * @property {string} color - Assigned color
 * @property {Object|null} cursor - Current cursor position {lineNumber, column}
 * @property {Object|null} selection - Current selection range
 * @property {number} lastActivity - Timestamp of last activity
 */

/**
 * Add or update a remote user
 * @param {string} userId - User ID
 * @param {string} userName - Display name
 * @returns {RemoteUser}
 */
function addRemoteUser(userId, userName) {
    if (remoteUsers.has(userId)) {
        const user = remoteUsers.get(userId);
        user.name = userName;
        user.lastActivity = Date.now();
        return user;
    }

    const user = {
        id: userId,
        name: userName,
        color: config.userColors[colorIndex % config.userColors.length],
        cursor: null,
        selection: null,
        lastActivity: Date.now()
    };

    colorIndex++;
    remoteUsers.set(userId, user);

    emit('user:joined', { user });
    console.log(`[Collaboration] User joined: ${userName} (${userId})`);

    return user;
}

/**
 * Remove a remote user and clean up their indicators
 * @param {string} userId - User ID to remove
 */
function removeRemoteUser(userId) {
    const user = remoteUsers.get(userId);
    if (!user) return;

    // Clean up decorations
    clearUserDecorations(userId);

    // Clean up label element
    const label = cursorLabels.get(userId);
    if (label && label.parentNode) {
        label.parentNode.removeChild(label);
    }
    cursorLabels.delete(userId);

    // Clear timeouts
    const timeout = labelTimeouts.get(userId);
    if (timeout) clearTimeout(timeout);
    labelTimeouts.delete(userId);

    remoteUsers.delete(userId);

    emit('user:left', { userId, userName: user.name });
    console.log(`[Collaboration] User left: ${user.name} (${userId})`);
}

/**
 * Get all remote users
 * @returns {RemoteUser[]}
 */
function getRemoteUsers() {
    return Array.from(remoteUsers.values());
}

// --- Cursor Indicators ---

/**
 * Update a remote user's cursor position
 * @param {string} userId - User ID
 * @param {Object} position - Cursor position {lineNumber, column}
 */
function updateRemoteCursor(userId, position) {
    const user = remoteUsers.get(userId);
    if (!user || !editor) return;

    user.cursor = position;
    user.lastActivity = Date.now();

    renderCursorIndicator(user);
    showCursorLabel(user);
}

/**
 * Render cursor indicator decoration for a user
 * @param {RemoteUser} user - User to render cursor for
 */
function renderCursorIndicator(user) {
    if (!editor || !user.cursor) return;

    const { lineNumber, column } = user.cursor;

    // Create decoration for cursor line
    const decorations = [
        {
            range: new monaco.Range(lineNumber, column, lineNumber, column + 1),
            options: {
                className: `collab-cursor collab-cursor-${user.id}`,
                beforeContentClassName: `collab-cursor-bar collab-cursor-bar-${user.id}`,
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
            }
        }
    ];

    // Apply decorations
    const oldDecorations = cursorDecorations.get(user.id) || [];
    const newDecorations = editor.deltaDecorations(oldDecorations, decorations);
    cursorDecorations.set(user.id, newDecorations);

    // Ensure CSS for this user's color exists
    ensureUserCursorStyles(user);
}

/**
 * Ensure CSS styles exist for a user's cursor
 * @param {RemoteUser} user - User to create styles for
 */
function ensureUserCursorStyles(user) {
    const styleId = `collab-cursor-style-${user.id}`;
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .collab-cursor-bar-${user.id}::before {
            content: '';
            position: absolute;
            width: 2px;
            height: 18px;
            background-color: ${user.color};
            animation: ${config.cursorBlink ? 'collabCursorBlink 1s step-end infinite' : 'none'};
        }
        .collab-selection-${user.id} {
            background-color: ${user.color}40;
        }
        .collab-edit-highlight-${user.id} {
            background-color: ${user.color}30;
            border-left: 3px solid ${user.color};
        }
    `;
    document.head.appendChild(style);
}

/**
 * Show cursor label for a user
 * @param {RemoteUser} user - User to show label for
 */
function showCursorLabel(user) {
    if (!config.showCursorLabel || !editor || !user.cursor) return;

    let label = cursorLabels.get(user.id);

    if (!label) {
        label = createCursorLabel(user);
        cursorLabels.set(user.id, label);
    }

    // Update label text and position
    label.textContent = user.name;
    label.style.backgroundColor = user.color;
    label.style.opacity = '1';

    // Position the label above the cursor
    positionCursorLabel(user, label);

    // Clear existing timeout
    const existingTimeout = labelTimeouts.get(user.id);
    if (existingTimeout) clearTimeout(existingTimeout);

    // Set timeout to fade label
    const timeout = setTimeout(() => {
        label.style.opacity = '0.5';
    }, config.labelDisplayDuration);
    labelTimeouts.set(user.id, timeout);
}

/**
 * Create cursor label element
 * @param {RemoteUser} user - User to create label for
 * @returns {HTMLElement}
 */
function createCursorLabel(user) {
    const label = document.createElement('div');
    label.className = 'collab-cursor-label';
    label.style.cssText = `
        position: absolute;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 11px;
        font-weight: 500;
        color: white;
        background-color: ${user.color};
        white-space: nowrap;
        pointer-events: none;
        z-index: 1000;
        transition: opacity 0.3s ease;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    `;

    // Add to editor container
    const editorContainer = document.querySelector('.monaco-editor');
    if (editorContainer) {
        editorContainer.appendChild(label);
    }

    return label;
}

/**
 * Position cursor label above the cursor
 * @param {RemoteUser} user - User whose label to position
 * @param {HTMLElement} label - Label element
 */
function positionCursorLabel(user, label) {
    if (!editor || !user.cursor) return;

    const position = user.cursor;

    // Get pixel position from Monaco
    const top = editor.getTopForLineNumber(position.lineNumber);
    const scrollTop = editor.getScrollTop();
    const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);

    // Get column pixel position
    const contentWidth = editor.getLayoutInfo().contentWidth;
    const column = position.column;
    const characterWidth = 7.8; // Approximate character width

    const left = Math.min((column - 1) * characterWidth, contentWidth - 100);
    const topPosition = top - scrollTop - 20; // Position above cursor

    label.style.left = `${Math.max(left, 0)}px`;
    label.style.top = `${Math.max(topPosition, 0)}px`;
}

// --- Selection Indicators ---

/**
 * Update a remote user's selection
 * @param {string} userId - User ID
 * @param {Object|null} selection - Selection range {startLineNumber, startColumn, endLineNumber, endColumn}
 */
function updateRemoteSelection(userId, selection) {
    const user = remoteUsers.get(userId);
    if (!user || !editor) return;

    user.selection = selection;
    user.lastActivity = Date.now();

    renderSelectionIndicator(user);
}

/**
 * Render selection indicator decoration for a user
 * @param {RemoteUser} user - User to render selection for
 */
function renderSelectionIndicator(user) {
    if (!editor) return;

    const decorations = [];

    // Add selection highlight if there's a selection
    if (user.selection && (
        user.selection.startLineNumber !== user.selection.endLineNumber ||
        user.selection.startColumn !== user.selection.endColumn
    )) {
        decorations.push({
            range: new monaco.Range(
                user.selection.startLineNumber,
                user.selection.startColumn,
                user.selection.endLineNumber,
                user.selection.endColumn
            ),
            options: {
                className: `collab-selection collab-selection-${user.id}`,
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
            }
        });
    }

    // Add cursor decoration at selection end
    if (user.cursor) {
        decorations.push({
            range: new monaco.Range(user.cursor.lineNumber, user.cursor.column, user.cursor.lineNumber, user.cursor.column + 1),
            options: {
                className: `collab-cursor collab-cursor-${user.id}`,
                beforeContentClassName: `collab-cursor-bar collab-cursor-bar-${user.id}`,
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
            }
        });
    }

    // Apply decorations
    const oldDecorations = cursorDecorations.get(user.id) || [];
    const newDecorations = editor.deltaDecorations(oldDecorations, decorations);
    cursorDecorations.set(user.id, newDecorations);
}

// --- Edit Highlights ---

/**
 * Show edit highlight for a region being modified
 * @param {string} userId - User ID making the edit
 * @param {Object} range - Range being edited {startLineNumber, startColumn, endLineNumber, endColumn}
 */
function showEditHighlight(userId, range) {
    const user = remoteUsers.get(userId);
    if (!user || !editor) return;

    // Create edit highlight decoration
    const highlightDecoration = {
        range: new monaco.Range(
            range.startLineNumber,
            1, // Highlight full line
            range.endLineNumber,
            1
        ),
        options: {
            isWholeLine: true,
            className: `collab-edit-highlight collab-edit-highlight-${user.id}`,
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
    };

    // Apply decoration
    const oldDecorations = editDecorations.get(userId) || [];
    const newDecorations = editor.deltaDecorations(oldDecorations, [highlightDecoration]);
    editDecorations.set(userId, newDecorations);

    // Set timeout to fade and remove highlight
    setTimeout(() => {
        fadeEditHighlight(userId);
    }, config.highlightFadeDelay);
}

/**
 * Fade and remove edit highlight
 * @param {string} userId - User ID whose highlight to fade
 */
function fadeEditHighlight(userId) {
    if (!editor) return;

    // Remove decorations
    const oldDecorations = editDecorations.get(userId) || [];
    editor.deltaDecorations(oldDecorations, []);
    editDecorations.delete(userId);
}

// --- Cleanup ---

/**
 * Clear all decorations for a user
 * @param {string} userId - User ID
 */
function clearUserDecorations(userId) {
    if (!editor) return;

    // Clear cursor decorations
    const cursorDecs = cursorDecorations.get(userId) || [];
    editor.deltaDecorations(cursorDecs, []);
    cursorDecorations.delete(userId);

    // Clear edit decorations
    const editDecs = editDecorations.get(userId) || [];
    editor.deltaDecorations(editDecs, []);
    editDecorations.delete(userId);
}

/**
 * Clear all collaboration indicators
 */
function clearAllIndicators() {
    if (!editor) return;

    // Clear all user decorations
    for (const userId of remoteUsers.keys()) {
        clearUserDecorations(userId);
    }

    // Remove all cursor labels
    for (const label of cursorLabels.values()) {
        if (label.parentNode) {
            label.parentNode.removeChild(label);
        }
    }
    cursorLabels.clear();

    // Clear all timeouts
    for (const timeout of labelTimeouts.values()) {
        clearTimeout(timeout);
    }
    labelTimeouts.clear();
}

// --- Event System ---
const eventHandlers = new Map();

function on(event, handler) {
    const handlers = eventHandlers.get(event) || [];
    handlers.push(handler);
    eventHandlers.set(event, handlers);
    return () => off(event, handler);
}

function off(event, handler) {
    const handlers = eventHandlers.get(event) || [];
    const filtered = handlers.filter(h => h !== handler);
    eventHandlers.set(event, filtered);
}

function emit(event, data) {
    const handlers = eventHandlers.get(event) || [];
    for (const handler of handlers) {
        try {
            handler(data);
        } catch (err) {
            console.error(`[Collaboration] Event handler error for ${event}:`, err);
        }
    }
}

// --- Connection Adapter Interface ---

/**
 * Set the connection adapter for real-time communication
 * @param {Object} adapter - Connection adapter with methods: connect, disconnect, send, on
 */
function setConnectionAdapter(adapter) {
    connectionAdapter = adapter;

    if (adapter) {
        // Listen for remote events
        adapter.on('cursor', ({ userId, position }) => {
            updateRemoteCursor(userId, position);
        });

        adapter.on('selection', ({ userId, selection }) => {
            updateRemoteSelection(userId, selection);
        });

        adapter.on('edit', ({ userId, range }) => {
            showEditHighlight(userId, range);
        });

        adapter.on('user-joined', ({ userId, userName }) => {
            addRemoteUser(userId, userName);
        });

        adapter.on('user-left', ({ userId }) => {
            removeRemoteUser(userId);
        });
    }
}

/**
 * Broadcast local cursor position
 */
function broadcastCursor() {
    if (!connectionAdapter || !editor || !localUserId) return;

    const position = editor.getPosition();
    if (position) {
        connectionAdapter.send('cursor', {
            userId: localUserId,
            position: { lineNumber: position.lineNumber, column: position.column }
        });
    }
}

/**
 * Broadcast local selection
 */
function broadcastSelection() {
    if (!connectionAdapter || !editor || !localUserId) return;

    const selection = editor.getSelection();
    if (selection) {
        connectionAdapter.send('selection', {
            userId: localUserId,
            selection: {
                startLineNumber: selection.startLineNumber,
                startColumn: selection.startColumn,
                endLineNumber: selection.endLineNumber,
                endColumn: selection.endColumn
            }
        });
    }
}

// --- Initialization ---

/**
 * Initialize collaboration indicators
 * @param {Object} monacoEditor - Monaco editor instance
 * @param {Object} options - Configuration options
 */
function initialize(monacoEditor, options = {}) {
    if (!monacoEditor) {
        console.error('[Collaboration] Cannot initialize without editor');
        return;
    }

    editor = monacoEditor;

    // Apply options
    Object.assign(config, options);

    // Add global cursor blink animation
    addGlobalStyles();

    // Set up cursor change listener
    cursorListener = editor.onDidChangeCursorPosition(() => {
        broadcastCursor();
    });

    // Set up selection change listener
    selectionListener = editor.onDidChangeCursorSelection(() => {
        broadcastSelection();
    });

    config.enabled = true;
    console.log('[Collaboration] Initialized collaboration indicators');
}

/**
 * Add global CSS styles for collaboration
 */
function addGlobalStyles() {
    const styleId = 'collab-global-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        @keyframes collabCursorBlink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
        }

        .collab-cursor-label {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }

        .collab-edit-highlight {
            transition: background-color 0.3s ease;
        }
    `;
    document.head.appendChild(style);
}

/**
 * Cleanup collaboration indicators
 */
function cleanup() {
    clearAllIndicators();

    // Remove listeners
    if (cursorListener) {
        cursorListener.dispose();
        cursorListener = null;
    }
    if (selectionListener) {
        selectionListener.dispose();
        selectionListener = null;
    }

    // Clear users
    remoteUsers.clear();

    // Reset state
    editor = null;
    connectionAdapter = null;
    config.enabled = false;

    console.log('[Collaboration] Cleaned up collaboration indicators');
}

/**
 * Set the local user ID
 * @param {string} userId - Local user's ID
 */
function setLocalUserId(userId) {
    localUserId = userId;
}

// --- Mock Adapter for Testing ---

/**
 * Create a mock adapter for demo/testing purposes
 * @returns {Object} Mock connection adapter
 */
function createMockAdapter() {
    const handlers = new Map();

    return {
        connect: () => Promise.resolve(),
        disconnect: () => Promise.resolve(),
        send: (event, data) => {
            console.log(`[MockAdapter] Sending ${event}:`, data);
        },
        on: (event, handler) => {
            const list = handlers.get(event) || [];
            list.push(handler);
            handlers.set(event, list);
        },
        // Helper to simulate remote events for testing
        simulateEvent: (event, data) => {
            const list = handlers.get(event) || [];
            for (const handler of list) {
                handler(data);
            }
        }
    };
}

/**
 * Demo mode: simulate collaboration with mock users
 * @param {number} userCount - Number of mock users to simulate
 */
function startDemo(userCount = 2) {
    if (!editor) {
        console.error('[Collaboration] Initialize first before starting demo');
        return;
    }

    const mockNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];

    for (let i = 0; i < Math.min(userCount, mockNames.length); i++) {
        const userId = `demo-user-${i}`;
        addRemoteUser(userId, mockNames[i]);

        // Simulate cursor movement
        const user = remoteUsers.get(userId);
        const randomLine = Math.floor(Math.random() * 20) + 1;
        const randomColumn = Math.floor(Math.random() * 40) + 1;

        updateRemoteCursor(userId, { lineNumber: randomLine, column: randomColumn });
    }

    console.log(`[Collaboration] Demo mode started with ${userCount} mock users`);
}

/**
 * Stop demo mode
 */
function stopDemo() {
    // Remove all demo users
    for (const userId of remoteUsers.keys()) {
        if (userId.startsWith('demo-user-')) {
            removeRemoteUser(userId);
        }
    }
    console.log('[Collaboration] Demo mode stopped');
}

// --- Exports ---
window.CollaborationIndicators = {
    // Initialization
    initialize,
    cleanup,
    setLocalUserId,
    setConnectionAdapter,

    // User management
    addRemoteUser,
    removeRemoteUser,
    getRemoteUsers,

    // Cursor indicators
    updateRemoteCursor,
    updateRemoteSelection,
    showEditHighlight,

    // Demo/testing
    createMockAdapter,
    startDemo,
    stopDemo,

    // Events
    on,
    off,

    // Configuration
    config
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.CollaborationIndicators;
}

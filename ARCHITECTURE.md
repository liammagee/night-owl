# NightOwl Architecture

This document describes the architecture and module structure of the NightOwl application.

## Overview

NightOwl is an Electron-based desktop application with a clear separation between:
- **Main Process** (`main.js`) - Node.js environment handling system operations
- **Renderer Process** (`orchestrator/`) - Browser environment handling UI
- **Preload Script** (`preload.js`) - Secure bridge between main and renderer

```
┌─────────────────────────────────────────────────────────────┐
│                      Electron App                            │
├─────────────────────┬───────────────────────────────────────┤
│   Main Process      │          Renderer Process             │
│   (main.js)         │          (orchestrator/)              │
│                     │                                        │
│   ┌─────────────┐   │   ┌──────────────────────────────┐    │
│   │ File I/O    │   │   │  Monaco Editor               │    │
│   │ IPC Handlers│◄──┼──►│  (window.editor)             │    │
│   │ Settings    │   │   └──────────────────────────────┘    │
│   │ Citations   │   │                                        │
│   └─────────────┘   │   ┌──────────────────────────────┐    │
│                     │   │  Renderer Modules             │    │
│   ┌─────────────┐   │   │  ┌─────────────────────────┐ │    │
│   │ Services    │   │   │  │ visualMarkdown.js       │ │    │
│   │ ┌─────────┐ │   │   │  │ graph.js                │ │    │
│   │ │Citation │ │   │   │  │ citationManager.js      │ │    │
│   │ │Service  │ │   │   │  │ findReplace.js          │ │    │
│   │ └─────────┘ │   │   │  └─────────────────────────┘ │    │
│   └─────────────┘   │   └──────────────────────────────┘    │
└─────────────────────┴───────────────────────────────────────┘
                           │
                    preload.js
                    (contextBridge)
```

## Directory Structure

```
hegel-pedagogy-ai/
├── main.js                 # Electron main process
├── preload.js              # Context bridge for IPC
├── index.html              # Main application HTML
├── styles.css              # Global styles
├── orchestrator/
│   ├── renderer.js         # Main renderer logic (2500+ lines)
│   └── modules/
│       ├── graph.js            # Force-directed graph visualization
│       ├── visualMarkdown.js   # Visual markdown enhancements
│       ├── citationManager.js  # Citation management UI
│       └── findReplace.js      # Find & replace functionality
├── services/
│   └── citationService.js  # Citation backend service
├── plugins/                # Techne plugin system
│   └── techne-*/           # Individual plugins
├── lib/
│   └── d3.min.js           # D3.js for graph visualization
├── tests/
│   ├── unit/               # Jest unit tests
│   ├── integration/        # Jest integration tests
│   └── e2e/                # Playwright end-to-end tests
└── docs/                   # Documentation
```

## Core Modules

### Main Process (main.js)

The main process handles:
- Window management
- File system operations
- Application menu
- IPC handlers for renderer communication
- Settings persistence
- Citation service initialization

Key IPC handlers:
- `read-file-content` - Read file from disk
- `save-file-content` - Write file to disk
- `get-markdown-files` - List workspace files
- `open-file` - Open file in editor
- `citations-*` - Citation CRUD operations

### Preload Script (preload.js)

Exposes a secure API to the renderer via `contextBridge`:

```javascript
window.electronAPI = {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    on: (channel, listener) => { /* ... */ },
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    // Presentation controls
    onNextSlide, onPreviousSlide, onFirstSlide,
    // View toggles
    onToggleVisualMarkdown, onTogglePreviewPane,
    // Utility
    isElectron: true,
    platform: process.platform
}
```

### Renderer Modules

#### renderer.js

The main renderer orchestrates all UI components:
- Monaco editor initialization
- File tree management
- Tab management
- Preview pane
- Settings dialog
- Keyboard shortcuts

#### graph.js

Force-directed graph visualization using D3.js:

```javascript
class GraphView {
    nodes = [];           // Graph nodes (files, headings, tags)
    links = [];           // Connections between nodes
    simulation = null;    // D3 force simulation

    async initialize(container) { /* ... */ }
    async loadGraphData() { /* ... */ }
    navigateToHeading(text, level) { /* ... */ }
}
```

Node types:
- `file` - Markdown document
- `heading` - Document heading (H1-H6)
- `tag` - Extracted hashtag

Link types:
- `contains` - File contains heading
- `hierarchy` - Heading parent-child
- `reference` - Internal link between files
- `tagged` - File has tag

#### visualMarkdown.js

Visual enhancements for the Monaco editor:

```javascript
// Configuration
const config = {
    enabled: false,
    showImagePreviews: true,
    showFormattingDecorations: true,
    showCodeBlockDecorations: true,
    collapsibleCodeBlocks: true
};

// Key functions
initializeVisualMarkdown(editor)
updateVisualMarkdown(editor)
cleanupVisualMarkdown(editor)
setVisualMarkdownEnabled(enabled)
```

Features:
- Image content widgets
- Formatting decorations (bold, italic, strikethrough)
- Link decorations with hover preview
- Wiki-link navigation `[[filename]]`
- Collapsible code blocks
- Table preview rendering
- WYSIWYG click-to-edit

#### citationManager.js

Frontend citation management:

```javascript
class CitationManager {
    citations = [];
    projects = [];

    async initialize() { /* ... */ }
    async addCitation(data) { /* ... */ }
    async findDuplicates() { /* ... */ }
    async assignProjectToSelected() { /* ... */ }
}
```

#### findReplace.js

Find and replace functionality:

```javascript
// State
let currentSearchResults = [];
let currentSearchIndex = -1;
let currentDecorations = [];

// Key functions
showFindReplaceDialog(showReplace)
performSearch()
findNext()
findPrevious()
replaceNext()
replaceAll()
```

## IPC Communication

Communication between main and renderer uses Electron's IPC:

```
Renderer                          Main
   │                                │
   │  invoke('read-file-content')   │
   │ ─────────────────────────────► │
   │                                │
   │  { success: true, content }    │
   │ ◄───────────────────────────── │
   │                                │
```

### IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `read-file-content` | R→M | Read file from disk |
| `save-file-content` | R→M | Write file to disk |
| `get-markdown-files` | R→M | List workspace files |
| `open-file` | R→M | Open file in editor |
| `open-external` | R→M | Open URL in browser |
| `get-settings` | R→M | Get app settings |
| `set-settings` | R→M | Save app settings |
| `citations-*` | R→M | Citation operations |
| `toggle-visual-markdown` | M→R | Toggle visual markdown |
| `toggle-preview-pane` | M→R | Toggle preview |

## Plugin System

The Techne plugin system enables extensibility:

```
plugins/
└── techne-{name}/
    ├── manifest.json       # Plugin metadata
    ├── index.js           # Main plugin code
    └── styles.css         # Plugin styles (optional)
```

### Plugin Manifest

```json
{
    "name": "techne-example",
    "displayName": "Example Plugin",
    "version": "1.0.0",
    "description": "An example plugin",
    "main": "index.js",
    "styles": "styles.css"
}
```

### Plugin Lifecycle

1. Plugins discovered in `plugins/` directory
2. Manifests loaded on app startup
3. User enables/disables via Settings UI
4. Enabled plugins loaded into harness

## Data Flow

### File Operations

```
User Action → Renderer → IPC → Main → File System
     │
     └── Update UI ◄── Response
```

### Visual Markdown Update

```
Editor Content Change
        │
        ▼
updateVisualMarkdown()
        │
        ├── updateImagePreviews()
        ├── updateFormattingDecorations()
        ├── updateLinkDecorations()
        ├── updateCodeBlockDecorations()
        └── updateTableDecorations()
```

### Citation Save Flow

```
User adds citation
        │
        ▼
CitationManager.addCitation()
        │
        ▼
IPC: citations-add
        │
        ▼
CitationService.addCitation()
        │
        ▼
SQLite database write
        │
        ▼
Return success → Update UI
```

## State Management

State is managed through:
- **Global window objects** - `window.editor`, `window.currentFilePath`
- **Module-level variables** - Decorations, widget arrays
- **Class instances** - `CitationManager`, `GraphView`
- **Settings** - Persisted to JSON file

## Security

- **Context Isolation** - Renderer has no direct Node.js access
- **Preload Script** - Controlled API exposure
- **Input Validation** - File paths validated in main process
- **No Remote Module** - Using contextBridge instead

## Performance Considerations

- **Debounced Updates** - Visual markdown updates debounced (150ms)
- **Lazy Loading** - Plugins loaded on demand
- **Virtual Scrolling** - Planned for large documents
- **Cached Parsing** - Planned for markdown parsing

## Testing Strategy

- **Unit Tests** - Individual functions (Jest)
- **Integration Tests** - IPC communication (Jest + mocks)
- **E2E Tests** - User workflows (Playwright)

## Future Improvements

See [TODO.md](TODO.md) for planned improvements including:
- Module splitting for large files
- Virtual scrolling for performance
- Plugin hot reload
- Real-time collaboration indicators

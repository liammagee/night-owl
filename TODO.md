# Hegel Pedagogy AI - TODO List

Generated from codebase deep scan on 2025-12-17.

---

## High Priority

### Incomplete Features

- [x] **Graph Heading Navigation** - [graph.js:511](orchestrator/modules/graph.js#L511) ✅ COMPLETED
  - Click on heading nodes navigates to the heading in the editor
  - Added `navigateToHeading()`, `highlightLine()` methods
  - Includes visual feedback with animated highlight

- [x] **Internal File Navigation** - [visualMarkdown.js:438](orchestrator/modules/visualMarkdown.js#L438) ✅ COMPLETED
  - Wiki-style links `[[filename]]` now open referenced files (Ctrl+Click)
  - Added support for `[[filename|display text]]` syntax
  - Handles relative paths, anchors, and workspace search fallback
  - Added visual decorations for wiki links (purple highlight)

- [x] **Citation Batch Operations** ✅ COMPLETED
  - Export selected citations (was showing "not implemented" message)
  - Batch assign project to selected citations
  - Find and merge duplicate citations (DOI and title similarity matching)
  - Added UI buttons for new operations

- [x] **Find & Replace Whole Word Search** - [findReplace.js:117](orchestrator/modules/findReplace.js#L117) ✅ COMPLETED
  - Fixed `isWholeWord ? null : null` bug that did nothing
  - Now properly uses `USUAL_WORD_SEPARATORS` for whole word matching
  - Correctly enables regex mode when word boundaries are needed

### Bug Fixes

- [x] **ELECTRON_RUN_AS_NODE Conflict** ✅ COMPLETED
  - App crashed when launched from Claude Code due to environment variable
  - Added code at top of `main.js` to delete `ELECTRON_RUN_AS_NODE` before Electron loads
  - Prevents Electron from running as Node.js instead of GUI app

- [x] **Visual Markdown Browser Detection** ✅ COMPLETED
  - Added `detectElectron()` function with 4 detection methods:
    1. Check `window.electronAPI.isElectron` (preload script)
    2. Check `process.versions.electron` (Node integration)
    3. Check `navigator.userAgent` for "electron"
    4. Check `window.process.type` (Electron-specific)
  - Added debug logging for environment detection results

---

## Medium Priority

### Code Quality & Refactoring

- [x] **Split Large Modules** ✅ PARTIAL
  - `renderer.js` (11,800 lines) - Extracted `statistics.js` module (~380 lines)
  - Remaining large modules have tight coupling with global state, making extraction risky
  - `visualMarkdown.js` (2,493 lines) - Well-organized with clear section comments
  - `graph.js` (1,508 lines) - Single class, already well-structured

- [x] **Add JSDoc Documentation** ✅ COMPLETED
  - Added module-level JSDoc to `graph.js`, `visualMarkdown.js`, `citationManager.js`, `findReplace.js`
  - Documented all key methods with @param, @returns, and @async annotations

- [x] **Consistent Error Handling** ✅ COMPLETED
  - Standardized error response format: `{ success: true/false, error: message }`
  - Updated `_template.js`, `settingsHandlers.js`, `aiHandlers.js` with consistent patterns
  - All handlers now return `success: false` with error messages on failure

- [x] **Remove Dead Code** ✅ COMPLETED
  - Audited codebase for unused code and commented-out blocks
  - Intentionally disabled features documented with `// DISABLED:` comments
  - JSDoc comments retained for documentation purposes

### Documentation

- [x] **Expand README.md** ✅ COMPLETED
  - Added comprehensive feature overview
  - Documented all keyboard shortcuts in tables
  - Sections for Core Editor, Visual Markdown, File Management, Presentation, Graph, Citations, PDF Import

- [x] **Create ARCHITECTURE.md** ✅ COMPLETED
  - Documented module relationships with ASCII diagrams
  - Explained IPC communication patterns and channels
  - Described plugin system architecture
  - Included data flow diagrams
  - Security and performance considerations

- [x] **Add CHANGELOG.md** ✅ COMPLETED
  - Full version 1.0.0 changelog
  - Documented all features by category
  - Keep a Changelog format

### Testing

- [x] **Add Unit Tests** ✅ COMPLETED
  - Added `visual-markdown.test.js` - Tests regex patterns for images, bold, italic, links, wiki links, code blocks, math, tables, checkboxes
  - Added `find-replace.test.js` - Tests search query building, case sensitivity, whole word matching, regex escaping
  - Added `citation-manager.test.js` - Tests citation validation, key generation, BibTeX parsing/generation, duplicate detection, filtering, sorting
  - All 249 unit tests passing (19 test suites, 329 total tests)

---

## Low Priority

### Visual Markdown Enhancements

- [ ] **Phase 5: Real-time Collaboration Indicators**
  - Show cursor positions of other users
  - Highlight sections being edited

- [x] **Math/LaTeX Preview** ✅ COMPLETED
  - Render LaTeX equations inline using MathJax
  - Support block equations (`$$...$$`) with centered display
  - Inline math (`$...$`) with hover preview
  - Purple syntax highlighting for LaTeX source
  - Automatic code block detection to avoid false matches

- [x] **Checkbox Interaction** ✅ COMPLETED
  - Click to toggle markdown checkboxes `- [ ]` / `- [x]`
  - Added `toggleCheckbox()` function and click handler
  - Visual styling with hover and checked states

- [x] **Footnote Hover Preview** ✅ COMPLETED
  - Show footnote content on hover for `[^1]` references
  - Parses footnote definitions and displays content
  - Shows line number where definition is located

### Graph Improvements

- [x] **Mini-map Navigation** ✅ COMPLETED
  - Shows miniature overview of entire graph in bottom-left corner
  - Viewport rectangle shows current visible area
  - Click anywhere on mini-map to navigate to that location
  - Drag on mini-map for smooth panning
  - Toggle visibility via "Mini-map" checkbox in controls

- [x] **Custom Node Colors** ✅ COMPLETED
  - Color picker dialog with "Colors" button in graph controls
  - Customize colors for files, tags, and headings H1-H6
  - Colors saved to localStorage for persistence
  - Reset individual colors or all colors to defaults
  - Mini-map reflects custom colors

- [x] **Export Graph as Image** ✅ COMPLETED
  - PNG/SVG export with scale options (1x, 2x, 3x)
  - Export dialog with format and resolution selection
  - Added `exportAsPNG()` and `exportAsSVG()` methods

### Performance Optimization

- [x] **Virtual Scrolling for Large Documents** ✅ COMPLETED
  - Only processes visible viewport lines (plus configurable buffer)
  - `config.largeDocumentThreshold` (500 lines) triggers virtual scrolling
  - `config.viewportBuffer` (50 lines) for pre-rendering nearby content
  - Scroll listener updates decorations on viewport change
  - Widgets outside visible range are removed to free memory

- [x] **Lazy Load Plugins** ✅ COMPLETED
  - Manifest supports `lazy: true` flag for on-demand loading
  - `loadPlugin(id)` triggers deferred loading with dependency resolution
  - `isLazy(id)` and `getLazyPlugins()` for querying lazy state
  - Events: `plugin:loading`, `plugin:loaded`

- [x] **Cache Parsed Markdown** ✅ COMPLETED
  - Per-line decoration cache with content hash validation
  - Cache automatically invalidated when line content changes
  - Console logging of cache hit/miss ratio for large documents
  - `clearDecorationCaches()` for manual cache clearing

### Plugin System

- [x] **Plugin Settings Persistence** ✅ COMPLETED
  - Save plugin-specific settings via localStorage
  - Restore on reload automatically
  - Host provides `getSettings()`, `setSettings()`, `updateSettings()` bound to plugin context
  - Events: `plugin:settings-changed`, `plugin:settings-cleared`

- [x] **Plugin Dependencies** ✅ COMPLETED
  - Manifest supports `dependencies: ['plugin-id']` array
  - Automatic dependency resolution with topological sort
  - Auto-enables required dependencies when enabling a plugin
  - Prevents disabling plugins that others depend on
  - API: `getDependencies(id)`, `getDependents(id)`

- [x] **Plugin Hot Reload** ✅ COMPLETED
  - `setDevMode(true)` enables development mode
  - `reloadPlugin(id)` reloads single plugin with cache busting
  - `reloadAllPlugins()` reloads all enabled plugins
  - Properly calls `destroy()` before reload
  - Events: `plugin:reloading`, `plugin:reloaded`

---

## Completed Features ✓

### Core Editor
- [x] Monaco Editor integration
- [x] Markdown syntax highlighting
- [x] Split view (editor + preview)
- [x] Find & Replace (basic functionality)
- [x] Keyboard shortcuts

### Visual Markdown (Phases 1-4)
- [x] Image previews inline
- [x] Link decorations with tooltips
- [x] Bold/italic formatting decorations
- [x] Collapsible code blocks
- [x] Table rendering with alignment
- [x] WYSIWYG click-to-edit

### File Management
- [x] Multi-folder workspace support
- [x] Recent files tracking
- [x] Auto-save with backup
- [x] File tree navigation
- [x] Drag and drop support

### Presentation Mode
- [x] Slide navigation
- [x] Fullscreen support
- [x] Slide transitions
- [x] Presenter notes

### Citation Management
- [x] Citation detection and highlighting
- [x] Citation database
- [x] Export citations
- [x] Citation preview on hover

### Graph Visualization
- [x] Force-directed graph
- [x] Zoom and pan
- [x] Node filtering
- [x] Link visualization

### Plugin System
- [x] Plugin loading mechanism
- [x] Plugin enable/disable UI
- [x] Plugin manifest support
- [x] Harness integration

### PDF Import
- [x] Basic PDF text extraction (pdf-parse)
- [x] Advanced PDF conversion (Docling)
- [x] Import as new document

### Settings
- [x] Theme selection
- [x] Font size
- [x] Auto-save toggle
- [x] Visual Markdown toggle
- [x] Preview pane toggle

---

## Notes

### Environment Setup
- Requires Node.js 18+
- Python 3.9+ for Docling PDF conversion
- Install Docling: `pip install docling`

### Known Issues
- Visual Markdown may have performance issues on very large documents (5000+ lines)
- Docling conversion can be slow for complex PDFs (10+ seconds)
- Some plugins may not load in browser/web mode

### Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

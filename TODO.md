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

- [x] **Phase 5: Real-time Collaboration Indicators** ✅ COMPLETED
  - Show cursor positions of other users with colored indicators and labels
  - Highlight sections being edited with user-colored backgrounds
  - Remote user selection visualization
  - `CollaborationIndicators` module with connection adapter interface
  - Demo mode for testing: `CollaborationIndicators.startDemo(2)`
  - Ready for WebSocket integration via `setConnectionAdapter()`

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

### Git Integration
- [x] Git status indicator in status bar
- [x] Publish to Git from folder context menu
- [x] Branch display with change counts
- [x] Commit and push dialog

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

## Future Enhancements

### Git Integration Roadmap
- [x] **Branch Switching** - ✅ Switch between branches, create new branches, filter/search
- [x] **Commit History View** - ✅ Lazy-loaded recent commits with file stats, click-through to diffs
- [x] **Dedicated Git Panel** - ✅ Full git panel in sidebar with:
  - Staged/unstaged changes view
  - Monaco diff viewer for each file (side-by-side + inline toggle)
  - Stage/unstage individual files
  - Discard changes option
  - Commit with message (Ctrl+Enter shortcut)
  - Push/pull buttons
- [x] **Git Stash Support** - ✅ Save, apply, pop, drop stashes
- [x] **Pull Changes** - ✅ Fetch + pull with auto-conflict detection
- [x] **Merge Conflict Resolution** - ✅ Visual merge editor with Accept Ours/Theirs/Both + Mark Resolved
- [x] **Git Blame** - ✅ Inline blame decorations via command palette
- [x] **Ahead/Behind Indicator** - ✅ Shows ↑N ↓N next to branch name
- [x] **Amend Commit** - ✅ Checkbox to amend previous commit, auto-fills last message
- [x] **File Tree Git Decorations** - ✅ Color-coded filenames by git status (M/A/D/U)
- [x] **Editor Gutter Change Indicators** - ✅ Green/blue/red bars for added/modified/deleted lines
- [x] **Hunk Staging** - ✅ Stage individual diff hunks from the diff viewer
- [x] **Cherry-pick** - ✅ Cherry-pick commits from history onto current branch
- [x] **Tag Management** - ✅ List/create/delete tags, push tags (annotated + lightweight)
- [x] **Remote Management** - ✅ List/add/remove remotes, push to specific remote with upstream tracking
- [x] **Graph Log** - ✅ Visual branch/merge graph with colored lines, ref badges, all-branch view

---

## Editor Improvements (2026-02)

### File Browser & Editor UX
- [x] **Breadcrumb Navigation** - ✅ Show current file's full path as clickable breadcrumbs in the editor header
  - Clickable folder segments to expand in file tree
  - Shows last 4 path segments with ellipsis for deep paths
  - Unsaved changes indicator (●) on current file breadcrumb
- [x] **Markdown Outline / Table of Contents** - ✅ ALREADY EXISTS (Structure pane with heading hierarchy, expand/collapse, click-to-navigate)
- [x] **Command Palette** - ✅ ALREADY EXISTS (Cmd+Shift+P, 60+ commands, fuzzy search, keyboard nav)
- [x] **Word Wrap Toggle** - ✅ Alt+Z shortcut and command palette entry added
- [x] **Minimap Toggle** - ✅ ALREADY EXISTS in command palette (View: Toggle Minimap)
- [x] **Distraction-Free / Zen Mode** - ✅ Cmd+Shift+Enter to toggle, Esc to exit
  - Hides sidebar, toolbar, preview, status bar, gamification
  - Restores previous layout state on exit

### Quality of Life
- [x] **Recent Files Quick-Open** - ✅ Cmd+P fuzzy file search with recent files and workspace files
  - Shows recent files first with badge, then workspace files
  - Fuzzy search by filename or path
  - Keyboard navigation (arrows, enter, escape)
- [x] **Session Restore** - ✅ ALREADY EXISTS (restores last opened file on launch)
- [x] **File Rename (F2)** - ✅ F2 shortcut triggers rename dialog for current file
- [x] **Workspace Folder Reordering** - ✅ Drag-and-drop to reorder workspace folders in sidebar
  - Drag root folders onto other roots to reorder
  - Persisted via new `reorder-workspace-folders` IPC handler
  - Visual drop indicator (top border) distinct from file move feedback

### Presentations
- [x] **Slide Preview Thumbnails** - ✅ Thumbnail strip above editor when document has slides
  - Auto-detects `---` slide separators, shows/hides strip dynamically
  - Miniature rendered HTML previews (864x486 scaled to 144x81)
  - Click to navigate to slide in editor
  - Active slide highlighted based on cursor position
- [x] **Speaker Notes View** - ✅ ALREADY EXISTS (speaker notes toggle and add commands)
- [x] **Export Slides to PDF/PowerPoint** - ✅ ALREADY EXISTS (PDF, HTML, PowerPoint export in command palette)

### AI Integration
- [x] **Inline AI Completions** - ✅ Ghost text / copilot-style suggestions in the editor
  - Monaco `InlineCompletionsProvider` with debounced AI requests
  - Uses existing AI service infrastructure (all providers supported)
  - Disabled by default — toggle via command palette "AI: Toggle Inline Ghost Text Completions"
  - Requests triggered after 800ms typing pause with 15 lines of context
- [x] **AI Summarize-on-Select** - ✅ ALREADY EXISTS (right-click context menu: Summarize to Speaker Notes, Extract Notes, Generate AI Heading)

### Citation / Academic
- [x] **Citation Autocomplete** - ✅ ALREADY EXISTS (type `[@` for suggestions from BibTeX, searches by key/title/author/year)
- [x] **Footnote Management Panel** - ✅ Sidebar panel to view/edit/reorder footnotes
  - New 📝 button in sidebar header opens footnote panel
  - Lists all footnotes with ID, definition preview, line number, reference count
  - Warns about undefined references and unused definitions
  - Click to navigate to footnote in editor

---

## Editor Power Features (2026-02)

### Implemented
- [x] **Split Editor** - ✅ Open a second file side-by-side with the primary editor
  - "Open in Split Editor" in file tree context menu
  - Resizable split pane with drag handle
  - Auto-save on changes with language detection
  - Toggle via command palette "View: Toggle Split Editor"
- [x] **Integrated Terminal** - ✅ Terminal panel at bottom of editor area
  - One-shot command execution or interactive shell mode
  - Dark themed with command history (arrow keys)
  - Ctrl+C interrupt, Kill button, Clear button
  - Resizable by dragging header, Ctrl+` shortcut to toggle
- [x] **Snippet / Template System** - ✅ User-defined text snippets with tab-stop placeholders
  - Monaco completion provider triggered by `/` prefix (e.g. `/heading`, `/table`, `/code`)
  - Tab-stop placeholders: `${1:placeholder}`, cursor position: `$0`
  - Variables: `$DATE`, `$TIME`, `$FILENAME`, `$SELECTION`
  - Management dialog to create/edit/delete snippets (saved in localStorage)
  - 9 built-in snippets: heading, link, image, table, footnote, code block, YAML front matter, citation, blockquote
- [x] **Multi-file Search & Replace** - ✅ ALREADY EXISTS (global search pane with replace-all)

---

## Future Enhancements Backlog

### Editor Experience
- [x] **Focus Mode** - ✅ Dim everything except the current paragraph, typewriter scrolling (keep cursor centered)
  - Monaco line decorations dim non-active paragraphs (opacity 0.25 with smooth transition)
  - Typewriter scrolling keeps cursor line centred in viewport
  - Toggle via Cmd+. or command palette "View: Toggle Focus Mode"
  - Separate toggle for typewriter scrolling via "View: Toggle Typewriter Scrolling"
  - Esc to exit (doesn't conflict with zen mode)
- [x] **Table Editor** - ✅ Visual table editing with floating toolbar
  - Floating toolbar auto-appears when cursor is inside a markdown table
  - Add/remove rows (above/below) and columns (left/right)
  - Cycle column alignment (left → center → right)
  - Sort column ascending/descending (auto-detects numeric vs string)
  - Tab/Shift+Tab to navigate between cells (auto-adds row at end)
  - Insert new table via command palette "Table: Insert New Table"
  - 6 command palette entries for all table operations
- [ ] **Spell Check / Grammar** - Integrated spell checking with red underlines, language selection, custom dictionary
- [x] **Local Version History** - ✅ Auto-checkpoint timeline independent of git
  - IndexedDB storage for file snapshots (up to 50 per file, auto-pruned)
  - Auto-checkpoint every 60 seconds when content changes
  - Sidebar panel (clock button) with timeline of checkpoints per file
  - Manual "Save Checkpoint" button for named snapshots
  - Diff viewer showing additions/deletions between checkpoint and current
  - Restore any checkpoint (auto-saves current state before restoring)
  - Delete individual checkpoints
- [ ] **Theming** - Custom theme editor, more built-in themes, per-document theme overrides

### Media & Content
- [ ] **Image Management** - Image gallery panel, paste-from-clipboard improvements, drag-resize in preview, optimization
- [ ] **Audio/Video Embedding** - Embed and preview audio/video clips inline in markdown

### Collaboration
- [ ] **Real-time Collaboration Backend** - WebSocket server for multi-user editing (indicators module is demo-only)
- [ ] **Comments / Annotations** - Inline document comments with threads, resolve/unresolve

### Export & Publishing
- [ ] **LaTeX Output** - Export markdown to LaTeX with template selection
- [ ] **EPUB Export** - Export to EPUB format for e-readers
- [ ] **Custom PDF Templates** - User-defined PDF export templates, print-ready formatting
- [ ] **Static Site Generation** - Export workspace as a static HTML site

### AI Enhancements
- [ ] **AI Writing Coach** - Style suggestions, readability analysis, tone detection
- [ ] **AI-powered Outline Generation** - Generate document structure from a topic/prompt
- [ ] **Smart Autocomplete Context** - Broader context window for inline completions (related files, citations)

### Performance & Infrastructure
- [x] **Startup Optimization** - ✅ Lazy-load non-critical modules with startup timing
  - Lazy loader (`lazy-loader.js`) defers ~28 secondary modules until after editor is interactive
  - Critical modules (12) load immediately: formatting, find-replace, autosave, settings, etc.
  - Secondary modules load in batches of 3 using `requestIdleCallback` to avoid UI jank
  - Startup timing instrumentation: logs paint times, editor-ready milestone, total load time
  - AI, gamification, flow detection, and collaboration modules all deferred
- [ ] **Large File Handling** - Streaming/chunked loading for files > 10MB
- [ ] **Plugin Marketplace** - Browse and install third-party plugins from a registry

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

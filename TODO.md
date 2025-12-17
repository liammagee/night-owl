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

- [ ] **ELECTRON_RUN_AS_NODE Conflict**
  - App crashes when launched from Claude Code due to environment variable
  - Need to explicitly unset this variable in startup scripts

- [ ] **Visual Markdown Browser Detection**
  - Currently checks `window.electronAPI.isElectron` which may not be reliable in all contexts
  - Consider more robust environment detection

---

## Medium Priority

### Code Quality & Refactoring

- [ ] **Split Large Modules**
  - `renderer.js` (2,500+ lines) - Split into focused modules
  - `visualMarkdown.js` (1,667 lines) - Consider separating table/WYSIWYG logic
  - `graph.js` (1,200+ lines) - Separate force simulation from rendering

- [ ] **Add JSDoc Documentation**
  - Many exported functions lack documentation
  - Priority modules: `visualMarkdown.js`, `graph.js`, `citationManager.js`

- [ ] **Consistent Error Handling**
  - Some IPC handlers use try/catch, others don't
  - Standardize error response format across handlers

- [ ] **Remove Dead Code**
  - Audit commented-out code blocks
  - Remove unused imports and variables

### Documentation

- [ ] **Expand README.md**
  - Add feature overview with screenshots
  - Document keyboard shortcuts
  - Add plugin development guide
  - Include troubleshooting section

- [ ] **Create ARCHITECTURE.md**
  - Document module relationships
  - Explain IPC communication patterns
  - Describe plugin system architecture

- [ ] **Add CHANGELOG.md**
  - Track version changes
  - Document breaking changes

### Testing

- [ ] **Add Unit Tests**
  - Priority: `visualMarkdown.js` parsing functions
  - Priority: `citationManager.js` citation operations
  - Priority: `findReplace.js` search logic

- [ ] **Add Integration Tests**
  - Test IPC handlers
  - Test file operations
  - Test plugin loading

---

## Low Priority

### Visual Markdown Enhancements

- [ ] **Phase 5: Real-time Collaboration Indicators**
  - Show cursor positions of other users
  - Highlight sections being edited

- [ ] **Math/LaTeX Preview**
  - Render LaTeX equations inline
  - Support block equations

- [ ] **Checkbox Interaction**
  - Click to toggle markdown checkboxes `- [ ]` / `- [x]`

- [ ] **Footnote Hover Preview**
  - Show footnote content on hover

### Graph Improvements

- [ ] **Mini-map Navigation**
  - Show document structure overview
  - Click to navigate

- [ ] **Custom Node Colors**
  - Allow users to set heading colors
  - Save color preferences

- [ ] **Export Graph as Image**
  - PNG/SVG export option
  - Include in presentations

### Performance Optimization

- [ ] **Virtual Scrolling for Large Documents**
  - Only render visible content
  - Improve performance for 10k+ line documents

- [ ] **Lazy Load Plugins**
  - Load plugins on-demand
  - Reduce initial startup time

- [ ] **Cache Parsed Markdown**
  - Avoid re-parsing unchanged sections
  - Improve update performance

### Plugin System

- [ ] **Plugin Settings Persistence**
  - Save plugin-specific settings
  - Restore on reload

- [ ] **Plugin Dependencies**
  - Allow plugins to depend on other plugins
  - Automatic dependency resolution

- [ ] **Plugin Hot Reload**
  - Reload plugins without app restart
  - Development mode feature

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

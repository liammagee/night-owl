# Changelog

All notable changes to NightOwl will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024

### Added

#### Core Editor
- Monaco Editor integration with Markdown syntax highlighting
- Split view mode (editor + preview)
- Find & Replace with regex, case sensitivity, and whole word matching
- Keyboard shortcuts for common operations (Ctrl+S, Ctrl+F, etc.)
- Auto-save with configurable interval

#### Visual Markdown (Phases 1-4)
- **Phase 1**: Inline image previews with configurable max dimensions
- **Phase 2**: Collapsible code blocks with syntax language indicators
- **Phase 3**: Table preview rendering with alignment support
- **Phase 4**: WYSIWYG click-to-edit for formatted elements
- Wiki-style internal links `[[filename]]` with Ctrl+Click navigation
- Bold, italic, strikethrough formatting decorations
- Link decorations with hover preview tooltips

#### File Management
- Multi-folder workspace support with visual differentiation
- Recent files tracking and quick access
- Drag and drop file support
- File tree navigation with expand/collapse
- Auto-backup on save

#### Presentation Mode
- Markdown-based slide presentations
- Slide navigation with keyboard shortcuts
- Fullscreen presentation support
- Slide transitions and animations
- Presenter notes support

#### Graph Visualization
- Force-directed graph showing document relationships
- Heading hierarchy visualization
- Tag extraction and display
- Internal link visualization
- Click-to-navigate to headings in the editor
- Zoom and pan controls
- Node filtering (headings, tags, labels)

#### Citation Management
- Citation database with SQLite backend
- Citation detection and highlighting in documents
- BibTeX import/export
- Citation preview on hover
- Batch operations:
  - Export selected citations
  - Assign project to selected citations
  - Find and merge duplicate citations (DOI/title matching)
- Advanced SQL query interface

#### PDF Import
- Basic PDF text extraction (pdf-parse)
- Advanced PDF-to-Markdown conversion (Docling)
- Import as new document with formatting preservation

#### Plugin System
- Techne plugin architecture for extensibility
- Plugin manifest support with metadata
- Plugin enable/disable UI
- Plugin settings persistence
- Harness testing environment for plugin development

#### Settings
- Theme selection (light/dark)
- Font size configuration
- Auto-save toggle
- Visual Markdown toggle
- Preview pane toggle

### Fixed
- Find & Replace whole word matching now works correctly
- Fixed `isWholeWord ? null : null` bug that disabled whole word search

### Technical
- Electron-based desktop application
- IPC communication between main and renderer processes
- Context-isolated preload script for security
- Jest unit testing framework
- Playwright end-to-end testing

---

## [Unreleased]

### Added
- JSDoc documentation for key modules (graph.js, findReplace.js, visualMarkdown.js, citationManager.js)
- CHANGELOG.md for version tracking

### Changed
- Improved code documentation throughout the codebase

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2024 | Initial release with full feature set |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and how to submit changes.

# Future Refactoring Plan

This plan tracks refactors that still matter after the AI chat and external
Techne plugin sync work were retired. The app direction is now local-first
NightOwl features, a terminal-first assistant pane, and small native modules
that can be ported elsewhere later if they prove durable.

## Current Priorities

### 1. Renderer Surface Decomposition

`orchestrator/renderer.js` is still the highest-risk file because it owns file
opening, preview routing, pane state, mode switching, and several shared
globals. Continue extracting behavior behind narrow modules before adding major
new features.

Immediate candidates:

- File tree orchestration and polling state.
- Preview routing for markdown, HTML, PDF, and source-reference views.
- Pane visibility and mode-switching state.
- Command registration and toolbar wiring.

### 2. Terminal Reliability

The assistant surface is now `orchestrator/modules/assistant-terminal.js`, backed
by `ipc/terminalHandlers.js`. Keep this path focused on launching `codex`,
`claude`, `gemini`, and the user's login shell.

Open refactors:

- Keep xterm sizing and theme changes isolated from pane state.
- Prefer PTY behavior; pipe fallback should remain a degraded path only.
- Add packaged-app smoke coverage for terminal spawn, resize, input, and shell
restart after exit.

### 3. Theme Coverage

Managed themes should cover legacy inline NightOwl chrome without each feature
inventing its own palette. Continue moving hardcoded panel/card colors into
classes and CSS variables, then cover those classes in
`css/techne-theme-adapter.css` and `tests/e2e/theme-consistency.spec.js`.

Immediate candidates:

- Statistics, settings, search, citation, and footnote panes.
- Toolbar separators, labels, tab bars, and modal empty/error states.
- Monaco-adjacent surfaces where CSS can cover the surrounding chrome.

### 4. Feature Modules Before New Abstractions

Avoid rebuilding a plugin marketplace for local app features. Use
`orchestrator/modules/feature-loader.js` for native optional features, and only
extract portable packages after a feature has stabilized in NightOwl.

Keep module boundaries practical:

- One module should own one user-facing workflow.
- Shared utilities should appear only after repeated behavior is real.
- Test the behavioral contract before moving code.

## Large Files To Watch

These files are still worth decomposing, but only when active work touches them:

- `orchestrator/renderer.js`
- `orchestrator/modules/gamification.js`
- `orchestrator/modules/gamification/world/LibraryExplorerView.js`
- `orchestrator/modules/settings.js`
- `orchestrator/modules/previewZoom.js`
- `orchestrator/modules/formatting.js`
- `orchestrator/modules/todo-gamification.js`
- `orchestrator/modules/assistant-terminal.js`

## Success Criteria

- Startup and packaged-app smoke tests catch regressions before manual use.
- Theme changes do not leave obvious off-palette legacy panels.
- Terminal input remains live after resize, theme change, process exit, and pane
  toggles.
- File tree changes are incremental and avoid full rescans unless structure
  actually changed.
- Roadmap items are represented as working native modules, not stale planning
  artifacts.

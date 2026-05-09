# NightOwl Quality Hardening TODO

Last updated: 2026-05-09

This is the persisted backlog for systematic UX and code-quality hardening. Keep it evidence-based: each completed item should have a linked fix and a regression test where practical.

## Current Baseline

- Full Jest suite currently passes after the latest hardening pass: 66 suites, 1,082 tests.
- The codebase is compact in file count but uneven in module size: 493 tracked source/test files, with `orchestrator/renderer.js` at about 16k lines and several modules above 3k lines.
- Known high-risk area: persisted workspace state can point at stale or overlapping directories. This has caused duplicate roots, git status noise, and wildcard search misses.
- Build artifacts, generated worktrees, PDF reading material, and `.DS_Store` are ignored in `.gitignore`, but local ignored files still exist and can confuse ad hoc scans unless excluded.

## P0: Correctness And Data Safety

- [x] Prevent duplicate/overlapping workspace roots at load time and add-time.
- [x] Use runtime workspace fallback for git status/panel when saved workspace path is stale.
- [x] Use runtime workspace fallback for global search when saved workspace path is stale.
- [x] Treat HTML files as editable source with rendered preview.
- [x] Disable script execution and duplicate iframe renders in HTML preview to prevent app freezes when opening script-heavy HTML files.
- [x] Audit save/autosave paths for cross-tab write corruption, especially around `window.currentFilePath`, active tab models, disk reload, and recovery restore.
- [x] Audit delete/move/rename flows for stale tab, preview, and file-tree state after filesystem mutations.

## P1: UX Reliability

- [x] Show separate source and preview word counts.
- [x] Add autoreload for externally changed current files.
- [x] Support Markdown bibliography frontmatter and rendered citations in preview.
- [x] Support wildcard file search such as `*.html`.
- [x] Add Electron-native GPU diagnostics and Chromium trace capture hooks without replacing Monaco or the DOM renderer.
- [x] Reduce file-tree DOM churn by rendering through fragments and hydrating Markdown tags after the initial paint.
- [x] Move bibliography refresh work off the synchronous preview render path.
- [x] Quiet touch-gesture logging behind an opt-in debug flag.
- [x] Persist quality metrics that quantify stability and performance changes against the pre-hardening baseline.
- [x] Replace file-tree destructive actions with app-native modal flows that show exact paths and consequences.
- [ ] Replace remaining non-file-tree `confirm()` flows in settings, git, citations, formatting, Kanban, and tab dirty-close paths.
- [x] Make no-results and stale-workspace states explicit in the UI rather than silently empty.
- [x] Review file tree density, icons, selection affordances, and tag layout against VS Code-style expectations.
- [x] Add browser-level smoke tests for the primary workflows: open folder, search wildcard, open HTML, edit Markdown, preview citations, save.
- [x] Capture and compare Chromium traces for large-file editing, large file-tree startup, Markdown preview, and graph/presentation views.

## P1: Code Quality

- [x] Remove duplicate top-level function declarations from `orchestrator/renderer.js`.
- [x] Add a regression test that rejects duplicate top-level function declarations in the renderer.
- [ ] Split `orchestrator/renderer.js` further into cohesive modules around editor open/render, preview, file tree, and settings state.
- [x] Reduce duplicated runtime-working-directory fallback logic by extracting a shared main-process helper for file, search, git, export, and AI handlers.
- [x] Replace ad hoc regex path rewriting in HTML preview with a base-URL injection and DOM-built iframe.
- [x] Add static checks for ignored/generated directories in local audits and test discovery.

## P2: Maintainability

- [x] Add an explicit lint/quality script to `package.json` once the current warnings are triaged.
- [x] Add focused integration tests for stale saved workspace settings across file tree, search, git, terminal, export, and AI context.
- [x] Inventory console logging and downgrade noisy success-path logs behind debug flags.
- [x] Audit bundled assets and generated images for whether they should live in the repo, app resources, or external user data.

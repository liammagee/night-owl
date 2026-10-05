---
id: "decompose-renderer-orchestrator"
title: "Decompose renderer.js around workflow coordinators"
status: "done"
type: "refactor"
priority: "P2"
area: "architecture"
owner: "codex"
source: "existing-plan"
evidence: "source-analysis"
created: "2026-08-07"
updated: "2026-08-08"
verification: "File opening, preview routing, file-tree orchestration, and pane transitions now use dependency-injected controllers. Local CI passed 91 suites / 1,188 tests and 7 required Electron workflows; a fresh ARM64 package passed all 3 packaged workflows."
tags: ["architecture", "renderer", "technical-debt"]
depends_on: ["reliable-editor-preview-transitions", "single-source-mode-and-pane-state"]
---

## Context

The existing refactoring plan correctly identifies `orchestrator/renderer.js` as
the highest-risk surface. It is now 16,643 lines and includes 248 console calls.
It owns file opening, editor models, previews, file-tree polling, PDF/HTML/image
routing, pane layout, dialogs, keyboard behavior, and broad global state. The
reported reliability issue crosses exactly these responsibilities.

## Proposed change

Extract stable behavioral seams after the P0 transition contract is tested:
`FileOpenCoordinator`, `PreviewRouter`, `FileTreeController`, and `PaneController`.
Use dependency injection for Electron IPC and DOM adapters so concurrency can be
tested without loading the whole renderer.

## Acceptance criteria

- [x] Extracted modules have no hidden dependency on ambient globals.
- [x] The file-transition state machine is testable with fake clocks and delayed promises.
- [x] Renderer startup remains backward compatible during incremental migration.
- [x] File size is treated as an indicator; ownership and coupling reductions are the real exit criteria.

## Implementation

- Added independent file-open, preview-router, file-tree, and pane controllers
  with Electron, DOM, timer, persistence, and logging dependencies injected by
  the renderer.
- Migrated latest-wins transitions, preview route selection, file-tree polling
  and coalescing, and pane persistence suppression out of renderer-owned state.
- Kept existing renderer entry points stable and exposed the frozen live
  controller set as `window.NightOwlWorkflows` for diagnostics and contract
  testing.
- Documented the new ownership boundaries in
  `docs/development/RENDERER_WORKFLOWS.md`.

## Verification

- `npm run ci:local`: 5/5 stages passed; 91 suites and 1,188 tests passed; all
  7 required Electron workflows passed.
- `npm run dist:dir -- --arm64`: fresh ARM64 app packaged and signed locally.
- `NIGHTOWL_PACKAGED_APP=dist/mac-arm64/NightOwl.app npm run test:e2e:packaged`:
  all 3 packaged workflows passed.

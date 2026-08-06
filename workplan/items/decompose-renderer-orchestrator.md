---
id: "decompose-renderer-orchestrator"
title: "Decompose renderer.js around workflow coordinators"
status: "triaged"
type: "refactor"
priority: "P2"
area: "architecture"
owner: "unassigned"
source: "existing-plan"
evidence: "opportunity"
created: "2026-08-07"
updated: "2026-08-07"
verification: "File opening, preview routing, file-tree orchestration, and pane transitions have independent modules with contract tests, while renderer.js no longer owns their mutable state."
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

- [ ] Extracted modules have no hidden dependency on ambient globals.
- [ ] The file-transition state machine is testable with fake clocks and delayed promises.
- [ ] Renderer startup remains backward compatible during incremental migration.
- [ ] File size is treated as an indicator; ownership and coupling reductions are the real exit criteria.

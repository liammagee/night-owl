# Refactoring guide and workplan status

The source of truth for live NightOwl engineering status is
[`workplan/BOARD.md`](../../workplan/BOARD.md). This document records the
architectural sequence established by the 2026 IDE review and explains how to
scope the next refactor. It does not create a parallel queue.

## Verified foundations

Each completed boundary below links to the authored workplan item that carries
its acceptance criteria, outcome, and verification evidence.

| Boundary | Workplan item | Durable contract |
| --- | --- | --- |
| File/preview ordering | [`reliable-editor-preview-transitions`](../../workplan/items/reliable-editor-preview-transitions.md) | Latest-wins transitions prevent stale editor and preview commits. |
| Presentation visibility | [`fit-presentation-slides-to-viewport`](../../workplan/items/fit-presentation-slides-to-viewport.md) | Delivery contains the complete current slide. |
| Presentation recovery | [`recover-presentation-load-failures`](../../workplan/items/recover-presentation-load-failures.md) | Failed loads expose retry, reset, and correlated diagnostics. |
| Canonical renderer state | [`single-source-mode-and-pane-state`](../../workplan/items/single-source-mode-and-pane-state.md) | One store projects mode, panes, and overlays. |
| Renderer workflow controllers | [`decompose-renderer-orchestrator`](../../workplan/items/decompose-renderer-orchestrator.md) | File, preview, tree, and pane policy live behind injected controllers. |
| Presentation sources/assets | [`consolidate-presentation-source-and-styles`](../../workplan/items/consolidate-presentation-source-and-styles.md) | JSX, generated runtime, and canonical CSS have explicit owners. |
| Dynamic resource disposal | [`resource-lifecycle-ownership`](../../workplan/items/resource-lifecycle-ownership.md) | Features and handlers deterministically release resources. |
| Recoverable diagnostics | [`renderer-error-telemetry-and-recovery`](../../workplan/items/renderer-error-telemetry-and-recovery.md) | Renderer failures are redacted, correlated, inspectable, and resettable. |
| Electron capability security | [`minimize-electron-privilege-surface`](../../workplan/items/minimize-electron-privilege-surface.md) | Preload exposes fixed, validated capability methods only. |
| Performance regression evidence | [`performance-and-large-document-budgets`](../../workplan/items/performance-and-large-document-budgets.md) | Semantic readiness and fixed fixtures report p50/p95 thresholds. |
| Reusable record tasks | [`schema-driven-record-workflows`](../../workplan/items/schema-driven-record-workflows.md) | JSONL/CSV task behavior is declarative, validated, and optional. |
| Architecture/build onboarding | [`refresh-architecture-and-build-docs`](../../workplan/items/refresh-architecture-and-build-docs.md) | Current ownership and the build/release chain are documented and tested. |
| Collaboration safety | [`collaboration-reliability-boundary`](../../workplan/items/collaboration-reliability-boundary.md) | Unsupported positional-edit sync is retired until a convergent protocol meets the explicit reintroduction contract. |

The board, not this table, determines whether an item is active or done.

## Rules for the next extraction

1. Start from a user-visible failure, measured bottleneck, ownership leak, or
   repeated maintenance cost.
2. Create a workplan item with evidence, priority, dependencies, acceptance
   criteria, and observable verification before calling the work scheduled.
3. Preserve the current public renderer entry point while moving one workflow's
   policy and mutable state behind an injected module.
4. Leave DOM work and Electron capabilities in adapters; keep the extracted
   policy runnable in Jest without Electron.
5. Add a required Electron workflow only when the behavior is release-critical;
   keep expensive diagnostics in explicit suites.
6. Record the result in the authored workplan item and regenerate the board.

## Observation areas, not scheduled work

These surfaces are worth watching when related product work touches them. They
are not approved backlog items until represented on the board:

- command registration, toolbar wiring, dialog orchestration, and context menus
  still coordinated by `orchestrator/renderer.js`;
- editor model/tab lifecycle spread across the renderer and `editor-tabs.js`;
- assistant terminal behavior across pane state, xterm, PTY, and degraded pipe
  fallback;
- remaining legacy inline colors not yet expressed through managed theme tokens;
- large feature modules such as settings, formatting, gamification, preview
  zoom, and TODO gamification; and
- file-tree scaling beyond the current request-coalescing and signature-polling
  contracts.

If one of these becomes active, add it with `node scripts/workplan.js add ...`
and link the new item from any focused design note. Do not convert this section
into unchecked task boxes.

## Success conditions for future refactors

- The behavior contract is tested before code moves.
- Main, preload, renderer, service, generated-asset, and resource ownership stay
  explicit.
- Startup, file/preview readiness, and packaged-app smoke remain green.
- No new ambient state store or string-based IPC escape hatch is introduced.
- The change leaves one authored status record in `workplan/items/`, not status
  fragments across architecture and planning documents.

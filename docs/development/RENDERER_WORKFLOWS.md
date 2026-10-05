# Renderer Workflow Boundaries

NightOwl keeps DOM rendering and Electron access in `orchestrator/renderer.js`,
but coordinates multi-step renderer workflows through small modules with
injected dependencies. This keeps asynchronous policy and mutable workflow
state testable without booting Electron.

## Ownership

| Workflow | Module | Owned state and policy | Renderer adapter |
| --- | --- | --- | --- |
| File opening | `file-open-controller.js` | Latest-wins file transitions, read/apply ordering, retry and terminal outcomes | IPC reads, editor model swap, status UI |
| Preview routing | `preview-router.js` | File classification, preview transitions, binary blocking, record/HTML/Markdown route selection | Source mirror and concrete renderers |
| File tree | `file-tree-controller.js` | Request coalescing, rendered/stale state, disk-signature polling and disposal | IPC requests, DOM rendering, visibility policy |
| Panes | `pane-controller.js` | Pane commands, restore-time persistence suppression, persisted layout projection | UI state store, layout IPC and pane-specific callbacks |

The controllers do not read ambient browser globals inside their factories.
Electron IPC, DOM work, timers, visibility checks, and logging are supplied as
constructor options. Their CommonJS exports support isolated unit tests; their
browser exports are loaded before `renderer.js` by `index.html`.

## Runtime Contract

The live controller instances are exposed as the frozen
`window.NightOwlWorkflows` object for diagnostics and Electron contract tests:

- `fileOpen`
- `preview`
- `fileTree`
- `panes`

This is an inspection surface, not an additional state store. File and preview
ordering still share `file-transition-coordinator.js`, and pane state still has
one canonical owner in `ui-state-store.js`.

## Testing

`tests/unit/renderer/workflow-controllers.test.js` uses delayed promises and
fake timers to cover latest-wins ordering, route selection, request coalescing,
poll disposal, retry, and persistence suppression. The required Electron suite
also verifies that all four instances load in the production renderer and that
a real file-open transition completes through the extracted contract.

When extracting another workflow, keep concrete DOM or IPC work injected,
move the workflow's mutable state with its policy, add a controller contract
test, and retain the existing renderer entry point until callers have migrated.

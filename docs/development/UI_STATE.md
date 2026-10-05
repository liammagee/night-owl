# UI state and transition contract

NightOwl owns application mode and editor-shell layout in one renderer store:
`window.NightOwlUIState`. Feature modules request transitions with `dispatch()`;
the store projects the resulting state into DOM classes. Shared mode and pane
elements must not be hidden, restored, or resized with feature-specific inline
style snapshots.

## State model

The store owns:

- application `mode` and `previousMode`;
- the base visibility of the sidebar, editor, and right pane;
- the selected right-pane view;
- preview fullscreen, source view, source file, and source sync state;
- structured-record focus/source state; and
- zen mode.

`window.currentMode` is a temporary live compatibility property. Its getter
always reads the store, and its setter requests a normal mode transition. It is
not a second state variable.

## Invariants

- The editor and right pane cannot both be hidden in the base layout.
- Switching modes does not mutate the base pane arrangement or selected right
  pane.
- Zen mode is an overlay: it temporarily shows only the editor and restores the
  unchanged base layout when closed.
- JSONL/CSV record mode is an overlay: focused records temporarily occupy the
  right pane; showing raw source temporarily reveals Monaco. Closing the file
  restores the base pane visibility and right-pane selection.
- Preview fullscreen, source view, and structured-record mode are mutually
  exclusive.
- Selecting a normal right-pane view makes the right pane visible; selecting a
  non-preview view exits preview fullscreen.

## Rendering and transition completion

`applyDOMState()` is the sole renderer for shared visibility. It derives mode,
pane, fullscreen, source, structured-record, and zen classes synchronously from
state. Feature-specific content updates may still occur after dispatch, but they
must not rewrite the shared layout.

Layout-dependent work uses `afterTransition()` or
`onTransitionComplete()`. The store coalesces a burst of transitions into one
animation-frame completion, calls Monaco `layout()`, and dispatches the
presentation resize event after the DOM state has settled. Arbitrary restoration
timeouts are not part of this contract.

## Adding a transition

1. Add the state field and reducer action in
   `orchestrator/modules/ui-state-store.js`.
2. Define interactions with every invariant above.
3. Project the state through stable classes in `applyDOMState()`.
4. Dispatch the action from the feature module; keep only feature-local content
   work there.
5. Add reducer, DOM-projection, and real Electron workflow coverage.

The unit contract lives in
`tests/unit/renderer/ui-state-store.test.js`; the required and packaged Electron
checks use the `@ui-state` tag.

---
id: "single-source-mode-and-pane-state"
title: "Use one state model for modes and pane visibility"
status: "done"
type: "refactor"
priority: "P1"
area: "architecture"
owner: "codex"
source: "systematic-review"
evidence: "reproduced"
created: "2026-08-07"
updated: "2026-08-08"
verification: "Reducer and Electron tests prove that mode, pane, fullscreen, source, zen, and structured-record transitions preserve one live state; local CI passed 90 suites/1,181 tests plus 6/6 source and 3/3 packaged Electron checks."
tags: ["mode-switching", "state", "ui"]
depends_on: ["reliable-editor-preview-transitions", "recover-presentation-load-failures"]
---

## Context

Mode state is split between a module-local `currentMode`, a one-time
`window.currentMode` assignment, body classes, `active` classes, localStorage,
and inline styles. `window.currentMode` is not updated when the local variable
changes. Returning from presentation removes several inline width, height,
display, and flex properties and schedules another layout refresh, which makes
restoration order-sensitive.

## Proposed change

Create an explicit UI state store and transition reducer. Views should derive
classes and visibility from state; feature modules should request transitions
instead of mutating shared DOM styles. Keep a temporary compatibility getter for
legacy `window.currentMode` consumers while extracting them.

## Implemented change

Added `NightOwlUIState`, a reducer-backed renderer store for modes, base pane
visibility, right-pane selection, fullscreen, source view, structured-record
focus, and zen mode. Mode buttons, panes, and overlays now derive stable CSS
classes from the store. `window.currentMode` is a live compatibility property,
so legacy readers cannot observe a stale copy.

Presentation return, pane toggles, preview fullscreen/source controls, JSONL/CSV
record focus, and the recognition panel now request state transitions instead of
capturing and restoring shared inline styles. Record and zen behavior are
overlays over the untouched base pane arrangement. Monaco layout and
presentation resize run once from a coalesced animation-frame completion hook.

The invariant and extension contract is documented in
`docs/development/UI_STATE.md`. Reducer/DOM integration tests exercise all
overlap rules, real required Electron coverage cycles modes and record focus,
and a fresh ARM64 packaged app repeats the mode/pane contract.

## Acceptance criteria

- [x] Mode, pane, fullscreen, source-view, and structured-record invariants are documented and tested.
- [x] `window.currentMode` is a live compatibility view or is removed with all consumers migrated.
- [x] Returning from every mode restores the prior pane arrangement deterministically.
- [x] Monaco layout and presentation resize are triggered from transition completion, not arbitrary timers.

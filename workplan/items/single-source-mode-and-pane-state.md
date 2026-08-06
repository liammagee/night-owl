---
id: "single-source-mode-and-pane-state"
title: "Use one state model for modes and pane visibility"
status: "triaged"
type: "refactor"
priority: "P1"
area: "architecture"
owner: "unassigned"
source: "systematic-review"
evidence: "source-analysis"
created: "2026-08-07"
updated: "2026-08-07"
verification: "Mode and pane transitions pass invariant tests without direct style cleanup, and every consumer observes the same current mode."
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

## Acceptance criteria

- [ ] Mode, pane, fullscreen, source-view, and structured-record invariants are documented and tested.
- [ ] `window.currentMode` is a live compatibility view or is removed with all consumers migrated.
- [ ] Returning from every mode restores the prior pane arrangement deterministically.
- [ ] Monaco layout and presentation resize are triggered from transition completion, not arbitrary timers.

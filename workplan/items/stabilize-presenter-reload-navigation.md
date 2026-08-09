---
id: "stabilize-presenter-reload-navigation"
title: "Keep presenter navigation stable after live deck reload"
status: "done"
type: "bug"
priority: "P0"
area: "presentation"
owner: "codex"
source: "test-failure"
evidence: "test-failure"
created: "2026-08-09"
updated: "2026-08-09"
verification: "After a live content reload in delivery mode, Next and Previous remain enabled for the committed slide and no delayed reconciliation can reset presenter state."
tags: ["presentation", "navigation", "reliability", "ci"]
depends_on: ["presentation-authoring-preflight", "fit-presentation-slides-to-viewport"]
---

## Context

The pull-request Electron run passed, but the canonical `main` rerun exposed a
presenter navigation race that had also appeared in the previous main run.
After a live deck reload, the presenter could move to slide two and observe its
title, then delayed overview reconciliation could return state to slide one.
The Previous control consequently became disabled and the workflow timed out.
This was a product state race, not merely a weak assertion.

## Implemented change

Delivery mode now clears pending content reconciliation without invoking the
overview-canvas navigation path. It also cannot schedule the initial overview
centering timer when content reload resets pan and zoom; that timer is now
cancelled whenever its effect becomes stale. The content update already commits
the bounded slide index to state and its synchronous ref. The required Electron
workflow verifies that slide two remains committed across three animation
frames and that Previous stays enabled before navigating back.

## Acceptance criteria

- [x] Live content reload preserves the current bounded slide in delivery mode.
- [x] A delayed overview reconciliation cannot overwrite a newer presenter action.
- [x] Next and Previous controls reflect the same committed slide as the presenter title.
- [x] Source and generated presentation bundles remain in sync.
- [x] Required Electron coverage exercises reload, forward navigation, stability, and return navigation.

## Verification

- Focused presentation and code-quality coverage passed (5 suites, 71 tests).
- The generated presentation runtime passes `npm run presentation:check`.
- All 122 Jest suites passed (1,324 tests), and all 30 workplan items validate.
- Local release CI passed 6/7 stages. The locked desktop prevented Electron
  from launching before test one; hosted macOS Electron remains the merge gate.
- Hosted Electron and post-merge `main` results are recorded in the pull request.

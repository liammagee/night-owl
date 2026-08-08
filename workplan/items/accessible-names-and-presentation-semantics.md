---
id: "accessible-names-and-presentation-semantics"
title: "Add accessible names and preserve presentation semantics"
status: "done"
type: "enhancement"
priority: "P2"
area: "accessibility"
owner: "codex"
source: "computer-use"
evidence: "reproduced"
created: "2026-08-07"
updated: "2026-08-08"
verification: "Axe and keyboard tests pass for editor and presentation controls, and every visible icon-only control has a stable accessible name."
tags: ["a11y", "keyboard", "presentation"]
depends_on: ["modernize-electron-e2e-harness"]
---

## Context

The live accessibility tree exposed icon-only controls without stable names.
Presentation source uses `title` on many buttons but does not consistently use
`aria-label`, and broad mobile CSS hides every SVG under `body.is-presenting`,
which includes meaningful diagrams and control icons as well as canvas
connection lines. The existing accessibility test samples only the first 20
visible buttons and is not a full control inventory.

## Proposed change

Give every control a programmatic name, visible focus behavior, and appropriate
pressed/expanded state. Narrow decorative-SVG selectors and mark decorative
graphics explicitly. Add slide region, current slide, notes, and navigation
semantics.

## Acceptance criteria

- [x] All visible controls in each primary mode have accessible names.
- [x] Presentation navigation works by keyboard without trapping focus.
- [x] Meaningful SVG diagrams remain visible and exposed; decorative graphics are hidden correctly.
- [x] Tests cover all controls, not an arbitrary first-20 sample.

## Outcome

- Added stable names, pressed states, focus-visible treatment, landmarks, slide
  semantics, and keyboard-operable speaker-notes resizing across the editor and
  presentation surfaces.
- Made the horizontally scrollable open-file toolbar focusable and exposed its
  file and close actions as named native buttons with arrow-key traversal.
- Reworked presentation delivery keyboard navigation and focus restoration so
  native controls remain operable and Escape returns focus to the launch control.
- Narrowed broad SVG-hiding rules to decorative connection lines and explicitly
  separated decorative graphics from meaningful slide diagrams.
- Corrected managed-theme contrast tokens and the presentation launch control,
  then promoted complete live Axe/control-inventory coverage into required CI.
- Isolated the optional Electron theme and performance probes so saved app state
  and unbounded app teardown no longer make that suite hang or start in the
  wrong mode.

## Verification

- `npm run test:e2e:optional` passed 12/12 accessibility, theme, and performance
  workflows, including zero Axe violations in editor, authoring, and delivery.
- `npm run ci:local:release` passed all 7 stages: 97 suites / 1,216 tests and
  11/11 required Electron workflows.
- A fresh ARM64 app directory built with `npm run dist:dir -- --mac --arm64`.
- `NIGHTOWL_PACKAGED_APP=dist/mac-arm64/NightOwl.app npm run test:e2e:packaged`
  passed all 3 packaged workflows.

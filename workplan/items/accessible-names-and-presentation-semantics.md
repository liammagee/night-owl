---
id: "accessible-names-and-presentation-semantics"
title: "Add accessible names and preserve presentation semantics"
status: "triaged"
type: "enhancement"
priority: "P2"
area: "accessibility"
owner: "unassigned"
source: "computer-use"
evidence: "reproduced"
created: "2026-08-07"
updated: "2026-08-07"
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

- [ ] All visible controls in each primary mode have accessible names.
- [ ] Presentation navigation works by keyboard without trapping focus.
- [ ] Meaningful SVG diagrams remain visible and exposed; decorative graphics are hidden correctly.
- [ ] Tests cover all controls, not an arbitrary first-20 sample.

---
id: "presentation-authoring-preflight"
title: "Add presentation authoring preflight and presenter tools"
status: "triaged"
type: "enhancement"
priority: "P1"
area: "presentation"
owner: "codex"
source: "systematic-review"
evidence: "opportunity"
created: "2026-08-09"
updated: "2026-08-09"
verification: "A presentation preflight reports overflow, missing assets, and basic accessibility failures for every slide, while the presenter view exposes current, next, notes, and timer state without clipping the delivered slide."
tags: ["presentation", "preflight", "presenter"]
depends_on: ["fit-presentation-slides-to-viewport", "recover-presentation-load-failures", "accessible-names-and-presentation-semantics"]
---

## Context

Presentation rendering now fits complete slides and recovers visibly from load
failures. Authors still discover overflow, missing assets, illegible text, or
export differences late, and the delivery surface lacks a focused console for
the current slide, next slide, notes, and elapsed time.

## Proposed change

Add deterministic slide preflight checks and a presenter console built on the
canonical presentation source and viewport geometry. Keep advisory checks
separate from rendering so a warning never prevents opening a deck.

## Acceptance criteria

- [ ] Preflight checks every slide for overflow and unresolved local assets.
- [ ] Basic contrast, heading, image-alternative, and minimum-text-size warnings are actionable and suppressible.
- [ ] Selecting a warning navigates to the corresponding slide and source location when available.
- [ ] Presenter view shows current slide, next slide, notes, timer, and navigation controls.
- [ ] Required Electron coverage proves preflight and presenter state survive reload and resize.

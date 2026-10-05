---
id: "presentation-authoring-preflight"
title: "Add presentation authoring preflight and presenter tools"
status: "done"
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

## Implemented change

A deterministic preflight engine now maps every slide to source lines and
combines Markdown checks, local-asset existence, and rendered geometry/styles.
Its advisory panel reports overflow, missing assets, headings, image
alternatives, minimum text size, and contrast; warning selection moves both the
canvas and editor cursor, while exact per-document suppressions leave source
untouched and can be restored. Delivery adds a current/next/notes/timer console
with its own navigation. The console participates in the canonical viewport
inset calculation, so opening it or resizing the window refits rather than
covering the delivered slide. Both tools are available through the shared
action registry.

## Acceptance criteria

- [x] Preflight checks every slide for overflow and unresolved local assets.
- [x] Basic contrast, heading, image-alternative, and minimum-text-size warnings are actionable and suppressible.
- [x] Selecting a warning navigates to the corresponding slide and source location when available.
- [x] Presenter view shows current slide, next slide, notes, timer, and navigation controls.
- [x] Required Electron coverage proves preflight and presenter state survive reload and resize.

## Verification

Pure renderer tests cover slide/source mapping, heading and image-alternative
checks, overflow, text size, WCAG contrast, asset resolution, deterministic
warning IDs, and suppressions. Presentation asset checks prove the canonical
JSX and generated runtime match. The hosted `@required @presentation-tools`
Electron workflow exercises a real two-slide deck, source navigation,
suppression, current/next/notes/timer state, content reload, viewport resize,
and complete-slide containment beside the console.

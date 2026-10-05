---
id: "fit-presentation-slides-to-viewport"
title: "Fit complete presentation slides inside the viewport"
status: "done"
type: "bug"
priority: "P0"
area: "presentation"
owner: "codex"
source: "computer-use"
evidence: "reproduced"
created: "2026-08-07"
updated: "2026-08-08"
verification: "At the minimum supported window and in Present mode, every edge of a 16:9 slide is visible without internal slide scrolling or adjacent-slide overlap."
tags: ["layout", "slides", "viewport"]
---

## Context

The packaged app reproduced the user report. A three-slide fixture with 18 list
items showed only the upper items, hid the footer, and exposed an internal slide
scrollbar. In Present mode the right edge extended outside the app window and an
adjacent slide remained visible beneath the current slide.

The component fixes slides at 864 by 486 pixels and applies pan/zoom without a
viewport-fit calculation. CSS then combines `overflow: hidden` on `.slide` with
`overflow: auto` on `.slide-content`, converting overflow into scrolling rather
than fitting the slide.

## Proposed change

Add a viewport-derived base scale (`min(availableWidth / 864,
availableHeight / 486)`) separate from the user's canvas zoom. In Present mode,
center exactly one current slide above the controls. Define explicit content
overflow policy: warn during authoring, but never silently require scrolling
during delivery.

## Implemented change

Present mode now derives its canvas scale and pan from the measured stage after
toolbar, navigation, and inline speaker-notes insets. It renders only the
current slide, suppresses connection lines, and keeps authoring zoom/pan
separate from delivery fitting. A dedicated fixed-size clip frame scales
overflowing content from its authored top-left without introducing nested
delivery scrollbars; authoring mode instead marks overflowing slides.

The checked-in presentation runtime loads a dependency-free viewport helper
before the component. Geometry tests cover four viewport sizes, reduced stages,
and tall, wide, image, and code dimensions. A Markdown fixture exercises the
same cases in Electron. Live isolated-app verification confirmed complete slide
edges, all 18 tall-text rows, the table's Status column, the oversized image,
the long code line, one-slide-only delivery, and refitting above the inline
speaker-notes panel.

The full local CI gate passed all four stages: 84 suites and 1,160 tests passed;
one loopback-dependent test was explicitly skipped because this worktree cannot
bind loopback sockets.

## Acceptance criteria

- [x] Fit-to-slide updates on window, toolbar, and speaker-notes resize.
- [x] Preview mode keeps canvas zoom/pan while Present mode fits one complete slide.
- [x] Tall text, wide tables, images, code, and notes controls have regression fixtures.
- [x] No adjacent slide or connection line is visible in Present mode.
- [x] A visual or geometry test checks the slide bounding box against the viewport.

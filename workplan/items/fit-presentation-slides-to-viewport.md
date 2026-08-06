---
id: "fit-presentation-slides-to-viewport"
title: "Fit complete presentation slides inside the viewport"
status: "triaged"
type: "bug"
priority: "P0"
area: "presentation"
owner: "unassigned"
source: "computer-use"
evidence: "reproduced"
created: "2026-08-07"
updated: "2026-08-07"
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

## Acceptance criteria

- [ ] Fit-to-slide updates on window, toolbar, and speaker-notes resize.
- [ ] Preview mode keeps canvas zoom/pan while Present mode fits one complete slide.
- [ ] Tall text, wide tables, images, code, and notes controls have regression fixtures.
- [ ] No adjacent slide or connection line is visible in Present mode.
- [ ] A visual or geometry test checks the slide bounding box against the viewport.

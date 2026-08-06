---
id: "consolidate-presentation-source-and-styles"
title: "Make presentation source, build output, and CSS ownership explicit"
status: "triaged"
type: "refactor"
priority: "P2"
area: "presentation"
owner: "unassigned"
source: "systematic-review"
evidence: "opportunity"
created: "2026-08-07"
updated: "2026-08-07"
verification: "One documented build command deterministically produces the shipped presentation asset, one canonical stylesheet owns slide layout, and CI rejects stale generated output."
tags: ["build", "css", "presentation"]
depends_on: ["fit-presentation-slides-to-viewport", "recover-presentation-load-failures"]
---

## Context

The shipped component is a 2,824-line generated `MarkdownPreziApp.js` beside a
2,725-line JSX source file, but the root package has no presentation build script
or stale-output check. Presentation CSS exists both under `css/` and the plugin,
with different hashes and overlapping selectors. Other exact duplicate assets
also exist (`unified-network.js` and `babel-maze.css`). This makes fixes easy to
apply to the wrong copy.

## Proposed change

Declare canonical sources and generated/delegating outputs. Add deterministic
build and check commands. Consolidate presentation layout into scoped plugin CSS
and document which compatibility copies can be removed.

## Acceptance criteria

- [ ] Editing JSX plus running one command updates the shipped JavaScript.
- [ ] CI detects stale compiled presentation assets.
- [ ] Slide layout selectors are scoped and have one owner.
- [ ] Exact duplicate assets are removed or generated with an explicit check.

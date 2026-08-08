---
id: "consolidate-presentation-source-and-styles"
title: "Make presentation source, build output, and CSS ownership explicit"
status: "done"
type: "refactor"
priority: "P2"
area: "presentation"
owner: "codex"
source: "systematic-review"
evidence: "source-analysis"
created: "2026-08-07"
updated: "2026-08-08"
verification: "The root presentation build/check deterministically reproduces MarkdownPreziApp.js; local CI passed 6/6 stages, 92 suites / 1,193 tests, and 7 required Electron workflows; a fresh ARM64 package passed 3/3 packaged workflows and ASAR inspection contained only canonical plugin assets."
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

- [x] Editing JSX plus running one command updates the shipped JavaScript.
- [x] CI detects stale compiled presentation assets.
- [x] Slide layout selectors are scoped and have one owner.
- [x] Exact duplicate assets are removed or generated with an explicit check.

## Implementation

- Added root `presentation:build` and `presentation:check` commands backed by a
  deterministic Babel build script; local CI and distribution readiness now
  reject stale generated runtime output.
- Made `plugins/techne-presentations/preview-presentation.css` the single owner
  for preview and slide layout, reused one link ID across startup and feature
  initialization, and scoped slide selectors below `#presentation-root`.
- Removed the shadow presentation and speaker-note stylesheets plus the exact
  duplicate Babel Maze stylesheet and network runtime.
- Removed the nested presentation lockfile and redirected plugin-local build
  commands to the root toolchain.
- Documented canonical source, generated output, styles, and feature assets in
  `docs/development/PRESENTATION_ASSETS.md`.

## Verification

- `npm run presentation:build` reported the shipped runtime current, and unit
  coverage proves check mode rejects a deliberately stale output.
- `npm run ci:local`: 6/6 stages passed; 92 suites and 1,193 tests passed; all
  7 required Electron workflows passed.
- A fresh `npm run dist:dir -- --arm64` passed the stale-output preflight, and
  all 3 packaged workflows passed against `dist/mac-arm64/NightOwl.app`.
- ASAR inspection found only the canonical presentation, Maze, and network
  assets; no removed compatibility paths were shipped.

---
id: "recover-presentation-load-failures"
title: "Make presentation loading fail visibly and recoverably"
status: "done"
type: "bug"
priority: "P1"
area: "presentation"
owner: "codex"
source: "systematic-review"
evidence: "source-analysis"
created: "2026-08-07"
updated: "2026-08-07"
verification: "Injected feature-loader, React-render, and content-parse failures each show an actionable error and Retry returns to a rendered deck without restarting NightOwl."
tags: ["error-boundary", "loading", "recovery"]
---

## Context

`js/mode-switcher.js` displays a Loading presentation message while feature
assets initialize. Timeout and missing-runtime paths replace it with an error,
but an exception from `renderPresentationComponent` is only logged. The loading
placeholder can therefore remain indefinitely, matching the wider report that
some views simply do not load.

## Implemented change

Presentation mounting now terminates in explicit loading, ready, failed, or
cancelled states. Feature, runtime, render, and content failures have stable
diagnostic identifiers plus Retry and Return to Editor actions. Retry unmounts
the old React root, repeats feature readiness, and creates a fresh root. An
AbortController removes readiness timers and listeners when the user leaves.

The presenter receives initial Markdown as a prop, eliminating the prior
mount-plus-event double parse, and reports parse failures through the recovery
controller. A React error boundary covers render and lifecycle failures. The
preview transition now calls the speaker-notes API through its exported window
scope, fixing the observed `updateSpeakerNotesDisplay is not defined` failure.

## Acceptance criteria

- [x] Every loading path terminates in ready, failed, or cancelled.
- [x] Retry re-runs feature readiness and remounts into a fresh root.
- [x] Leaving presentation cancels timers/listeners and cannot flash stale UI later.
- [x] The current Markdown content reaches a newly mounted component exactly once.

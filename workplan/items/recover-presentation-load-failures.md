---
id: "recover-presentation-load-failures"
title: "Make presentation loading fail visibly and recoverably"
status: "triaged"
type: "bug"
priority: "P1"
area: "presentation"
owner: "unassigned"
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

## Proposed change

Give presentation mounting a small state machine (`idle`, `loading`, `ready`,
`failed`) and an error boundary. Render errors with Retry, Return to Editor, and
a concise diagnostic identifier. Preserve the existing nonce cancellation so a
late load cannot remount after the user leaves the mode.

## Acceptance criteria

- [ ] Every loading path terminates in ready, failed, or cancelled.
- [ ] Retry re-runs feature readiness and remounts into a fresh root.
- [ ] Leaving presentation cancels timers/listeners and cannot flash stale UI later.
- [ ] The current Markdown content reaches a newly mounted component exactly once.

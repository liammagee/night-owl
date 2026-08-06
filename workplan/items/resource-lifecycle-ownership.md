---
id: "resource-lifecycle-ownership"
title: "Give timers, listeners, observers, and watchers explicit owners"
status: "triaged"
type: "maintenance"
priority: "P2"
area: "platform"
owner: "unassigned"
source: "systematic-review"
evidence: "source-analysis"
created: "2026-08-07"
updated: "2026-08-07"
verification: "Repeatedly opening and closing each feature leaves timer, listener, observer, filesystem watcher, and open-file counts at baseline."
tags: ["lifecycle", "resources", "watchers"]
---

## Context

The renderer/plugin surfaces contain 827 `addEventListener` sites but only 77
`removeEventListener` sites, plus many intervals and observers. Some are valid
app-lifetime listeners, but ownership is rarely expressed. Concrete examples
include an unstored daily prune interval in feed handlers and intervals started
by feature managers without a uniform dispose contract. A file-watcher unit test
also hit `EMFILE` during the review, which may be environmental but makes watcher
accounting worth measuring.

## Proposed change

Standardize `start()`/`dispose()` contracts and a small disposable registry for
features, dialogs, and mode mounts. Instrument active timers, listeners,
observers, PTYs, servers, and file watchers in development diagnostics.

## Acceptance criteria

- [ ] Feature teardown clears every owned resource and is idempotent.
- [ ] App-lifetime resources are explicitly documented as such.
- [ ] Feed start/stop owns both polling and prune timers.
- [ ] A stress test detects growth across repeated mode and workspace cycles.

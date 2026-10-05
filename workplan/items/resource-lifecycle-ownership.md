---
id: "resource-lifecycle-ownership"
title: "Give timers, listeners, observers, and watchers explicit owners"
status: "done"
type: "maintenance"
priority: "P2"
area: "platform"
owner: "codex"
source: "systematic-review"
evidence: "source-analysis"
created: "2026-08-07"
updated: "2026-08-08"
verification: "Repeated feature and mode cycles returned to the live timer/listener/observer/watcher baseline; local release CI passed 7/7 stages, 94 suites / 1,200 tests, and 8 required Electron workflows; a fresh ARM64 package passed 3/3 packaged workflows."
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

- [x] Feature teardown clears every owned resource and is idempotent.
- [x] App-lifetime resources are explicitly documented as such.
- [x] Feed start/stop owns both polling and prune timers.
- [x] A stress test detects growth across repeated mode and workspace cycles.

## Implementation

- Added a shared disposable registry for timers, listeners, observers, watchers,
  processes, servers, and custom resources, with aggregate diagnostics in both
  renderer and main processes.
- Gave every feature a scoped lifecycle through its host; disable, failed init,
  and bulk teardown now release owned resources idempotently.
- Made the feed poll, startup, and prune timers one lifecycle; made the current
  file watcher and terminal process map explicit IPC-registration owners; and
  invoked their cleanup from Electron `before-quit`.
- Documented scoped and intentional app-lifetime resources in
  `docs/development/RESOURCE_LIFECYCLES.md`.

## Verification

- Unit stress coverage repeated registry disposal 25 times, feature mounts 20
  times, current-file watcher replacement 11 times, and terminal cleanup twice.
- Required Electron coverage repeated 15 mode cycles and 15 feature cycles and
  compared live diagnostics with the pre-cycle baseline.
- `npm run ci:local:release`: 7/7 stages passed; 94 suites and 1,200 tests
  passed; all 8 required Electron workflows passed.
- `npm run dist:dir -- --mac --arm64` produced a fresh app, and
  `NIGHTOWL_PACKAGED_APP=dist/mac-arm64/NightOwl.app npm run test:e2e:packaged`
  passed all 3 packaged workflows, including resource diagnostics.

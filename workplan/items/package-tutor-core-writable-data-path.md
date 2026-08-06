---
id: "package-tutor-core-writable-data-path"
title: "Keep tutor-core runtime data outside app.asar"
status: "triaged"
type: "bug"
priority: "P1"
area: "packaging"
owner: "unassigned"
source: "computer-use"
evidence: "reproduced"
created: "2026-08-07"
updated: "2026-08-07"
verification: "A clean packaged launch initializes tutor-core using only app userData paths and emits no app.asar write or ENOTDIR error."
tags: ["asar", "packaged-app", "tutor-core"]
---

## Context

The isolated packaged app emitted:

`ENOTDIR: not a directory, mkdir '.../Resources/app.asar/node_modules/@machinespirits/tutor-core/data'`

The bridge then disabled tutor-core, which is NightOwl's primary AI backend.
Although the database path is passed under Electron `userData`, imported
tutor-core code still attempts to create its package-relative `data` directory.

## Proposed change

Make every tutor-core storage/cache/resource location injectable and configure
it before import-time side effects. Package immutable seed resources explicitly;
route all writable databases and caches to `app.getPath('userData')`.

## Acceptance criteria

- [ ] Packaged startup reports tutor-core available.
- [ ] No code attempts to write within `app.asar` or the application bundle.
- [ ] A packaged smoke test invokes one non-network tutor-core operation.
- [ ] Missing optional AI providers degrade separately from tutor-core initialization.

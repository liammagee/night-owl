---
id: "package-tutor-core-writable-data-path"
title: "Keep tutor-core runtime data outside app.asar"
status: "done"
type: "bug"
priority: "P1"
area: "packaging"
owner: "codex"
source: "computer-use"
evidence: "reproduced"
created: "2026-08-07"
updated: "2026-08-08"
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

## Implemented change

NightOwl now derives tutor-core database and log paths from Electron `userData`,
rejects destinations inside `app.asar` or an application bundle, and exports the
database and log environment variables before dynamically importing tutor-core.
This handles tutor-core's current import-time database consumer while retaining
the explicit `initDb` and `setLogDir` calls for later versions.

A provider-independent status IPC runs a local writing-pad read and reports core,
storage, and provider readiness separately. The packaged Playwright fixture
launches a freshly built app with an isolated profile and no external provider
keys, then verifies the database, log directory, and non-network storage probe.
The hosted macOS E2E workflow now builds and runs this packaged contract on the
runner's native architecture.

## Acceptance criteria

- [x] Packaged startup reports tutor-core available.
- [x] No code attempts to write within `app.asar` or the application bundle.
- [x] A packaged smoke test invokes one non-network tutor-core operation.
- [x] Missing optional AI providers degrade separately from tutor-core initialization.

## Verification

- `npm run dist:dir -- --mac --arm64`: produced a fresh unsigned
  `dist/mac-arm64/NightOwl.app`; only the expected local signing and notarization
  warnings were emitted.
- `NIGHTOWL_PACKAGED_APP=dist/mac-arm64/NightOwl.app npm run test:e2e:packaged`:
  one packaged Electron test executed and passed with zero skips.
- The packaged probe created `tutor-core.db` and the log directory below its
  isolated profile and successfully read the initialized local writing pad.
- `node scripts/local-ci.js`: 5/5 stages passed, including 87 Jest suites
  (1,177 tests) and all four required source-level Electron workflows.

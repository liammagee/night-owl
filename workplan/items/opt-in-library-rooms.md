---
id: "opt-in-library-rooms"
title: "Disable Library room generation by default"
status: "done"
type: "bug"
priority: "P1"
area: "performance"
owner: "codex"
source: "user-report"
evidence: "reproduced"
created: "2026-11-12"
updated: "2026-11-12"
verification: "Missing and false roomGeneration settings produce no room growth or architect work; explicit opt-in retains the feature."
tags: ["performance", "gamification", "reliability"]
---

## Context

User requests room generation off by default after a native renderer OOM during
localStorage writes. Document-switch reproduction credited 36,428 untyped words
and spawned 1,214 rooms. Work in stable checkout nightowl-rendering-demand on
codex/rendering-demand, starting from 2462574. Existing saved rooms are preserved.

## Acceptance criteria

- [x] Fresh and existing profiles without explicit opt-in do not initialize the world engine.
- [x] Disabled live writing, world events, room spawning and architect work do nothing.
- [x] Settings exposes explicit opt-in; disabling takes effect immediately.
- [x] Focused regression and installed bundle verification pass.

The underlying document-switch accounting bug remains a separate repair;
this change disables the expensive feature rather than claiming that bug fixed.

## Verification

Six focused tests pass on source and the staged archive code. The installed
archive matches the signed stage; all 12,448 unrelated archive files are
preserved. Native runtime and deep strict signature checks pass. Computer use
confirmed the new checkbox is off in the restored manuscript workspace and a
PREFACE.md -> MANUSCRIPT-v2.md switch remained responsive. Both previous profiles
were reopened with roomGeneration=false. Saved rooms were not deleted.

Receipts and rollback:
- /Users/lmagee/Dev/nightowl-artifacts/room-generation-off-20261112-v2/
- /Users/lmagee/Dev/nightowl-backups/before-rooms-off-20261112/NightOwl.app

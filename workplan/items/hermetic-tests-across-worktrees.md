---
id: "hermetic-tests-across-worktrees"
title: "Make unit and integration tests portable across worktrees"
status: "done"
type: "testing"
priority: "P2"
area: "testing"
owner: "codex"
source: "test-failure"
evidence: "test-failure"
created: "2026-08-07"
updated: "2026-08-07"
verification: "A fresh worktree with the documented dependency setup runs all unit and integration projects without hard-coded node_modules paths, port-policy failures, or leaked file watchers."
tags: ["hermetic", "jest", "worktrees"]
---

## Context

With dependencies resolved from the primary checkout, 1,116 of 1,127 Jest tests
passed. Eight spellcheck assertions still failed because the test constructs a
dictionary path under the current worktree's `node_modules` instead of resolving
the package. The citation capture bridge test could not bind localhost in the
restricted environment, and a watcher test hit `EMFILE`. The missing entitlement
failure is a real release defect tracked separately.

## Implemented change

Dictionary fixtures now use Node package resolution. The local CI runner probes
loopback support and explicitly skips only the server-binding test when that
capability is unavailable. The watcher test injects its watcher, uses fake
timers, and asserts cleanup. Shared worktree dependencies are discovered through
Git's common directory and rejected when lockfiles differ.

## Acceptance criteria

- [x] Tests do not infer dependency paths from the repository directory.
- [x] Loopback-dependent tests distinguish unavailable capability from assertion failure.
- [x] Watcher tests prove cleanup and avoid fixed timing where possible.
- [x] Test summaries clearly separate environment skips from application failures.

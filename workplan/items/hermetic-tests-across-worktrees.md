---
id: "hermetic-tests-across-worktrees"
title: "Make unit and integration tests portable across worktrees"
status: "triaged"
type: "testing"
priority: "P2"
area: "testing"
owner: "unassigned"
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

## Proposed change

Resolve fixtures through Node package resolution, make network tests injectable
or explicitly capability-gated, and ensure watcher tests close resources even
on failure. Document the supported worktree dependency model or provide a
bootstrap command.

## Acceptance criteria

- [ ] Tests do not infer dependency paths from the repository directory.
- [ ] Loopback-dependent tests distinguish unavailable capability from assertion failure.
- [ ] Watcher tests prove cleanup and avoid fixed timing where possible.
- [ ] Test summaries clearly separate environment skips from application failures.

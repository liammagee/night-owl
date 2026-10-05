---
id: "repository-owned-local-ci"
title: "Add a repository-owned local CI gate"
status: "done"
type: "testing"
priority: "P1"
area: "testing"
owner: "codex"
source: "user-report"
evidence: "source-analysis"
created: "2026-08-07"
updated: "2026-08-07"
verification: "npm run ci:local passes from this linked worktree, reports capability skips explicitly, and npm run ci:local:release validates packaging inputs."
tags: ["ci", "git-hooks", "worktrees"]
depends_on: ["hermetic-tests-across-worktrees"]
---

## Context

The repository had a tag-only build workflow but no repeatable local gate for
static policy, workplan integrity, Jest, or packaging preflight. A linked
worktree also had no local `node_modules`, so direct npm test commands could not
reuse a matching primary-checkout dependency installation safely.

## Implemented change

Added a dependency-free orchestrator with lockfile-checked worktree dependency
discovery, loopback capability probing, complete stage summaries, optional
release checks, and an opt-in tracked pre-push hook. The workflow is documented
and covered by unit tests.

## Acceptance criteria

- [x] The default command runs whitespace, static, workplan, and Jest gates.
- [x] Linked worktrees reuse dependencies only when lockfiles match.
- [x] Environment capability skips are visible and separate from failures.
- [x] Packaging preflight is available as an explicit release mode.
- [x] The pre-push hook is tracked, opt-in, and preserves custom hook paths.

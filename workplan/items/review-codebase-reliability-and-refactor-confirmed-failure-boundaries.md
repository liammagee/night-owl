---
id: "review-codebase-reliability-and-refactor-confirmed-failure-boundaries"
title: "Review codebase reliability and refactor confirmed failure boundaries"
status: "review"
type: "bug"
priority: "P1"
area: "platform"
owner: "codex"
source: "systematic-review"
evidence: "test-failure"
created: "2026-11-17"
updated: "2026-11-17"
verification: "Release gate, real IPC replacement test, editor regressions, and broader diagnostics; record all failures and exclusions."
tags: ["data-integrity", "search", "review"]
---

## Context

User requested an exhaustive codebase review, refactor, and bug fix. Work starts
from 4df02d8 on codex/nightowl-codebase-review-20261117 in the isolated local
~/Dev/machinespirits/nightowl-codebase-review-20261117 worktree. This is a broad
review pass, not proof that every feature or dependency is defect-free.

Baseline: 152 Jest suites / 1,583 tests passed. Required Electron: 26/27 passed;
spiral navigation intermittently advanced beyond the expected slide. An isolated
diagnostic rerun and the subsequent full required suite passed without a
presentation implementation change. Keep the original failure visible.

## Changes

- Extract shared guarded file-write and backup behavior without changing the
  editor save contract; global replacement now uses it.
- Separate replacement planning from filesystem/IPC adapters. Apply each
  selected match once, preserve captures/CRLF, reject stale lines, and enforce
  lexical and canonical workspace containment before replacement reads/writes.
- Repair renderer replacement request/preview/count/path contracts and escape
  filenames before HTML insertion.
- Keep regex searches out of filename-glob routing; honor fallback file filters.
- Restore scalar/array preference imports using the existing settings merge
  contract and preserve live workspace/session paths.
- Correct Markdown link/image and non-Latin vocabulary counts, project average
  word-length input, and valid two-dot filename containment.

## Acceptance criteria

- [x] Reproduce replacement, settings import, and statistics bugs before fixes.
- [x] Add focused regression coverage and syntax-check owned JavaScript sources.
- [x] Complete release gate and record broader diagnostic outcomes.
- [x] Record review boundaries and remaining risks in the review report.

## Outcome

See [review report](../../docs/development/CODEBASE_REVIEW_2026-11-17.md).
Final release gate: 8/8; Jest: 154 suites / 1,600 tests; required Electron: 28/28;
editor/session: 14/14; optional accessibility/theme/performance: 7/7.
The broad pass is ready for review. Exhaustive per-feature, cross-platform, and
external-service verification remains outside the evidence established here.

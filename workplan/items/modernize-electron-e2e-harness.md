---
id: "modernize-electron-e2e-harness"
title: "Replace stale browser-style E2E tests with reliable Electron workflows"
status: "done"
type: "testing"
priority: "P1"
area: "testing"
owner: "codex"
source: "systematic-review"
evidence: "source-analysis"
created: "2026-08-07"
updated: "2026-08-08"
verification: "The default E2E command runs a small deterministic Electron matrix on macOS and CI, reports real executions versus skips, and covers editor-preview and full-slide geometry."
tags: ["electron", "playwright", "regression"]
---

## Context

Playwright lists 181 tests across 15 files, but the suite mixes incompatible
models. Several files use a normal browser `page` and navigate to `app://` without
launching Electron. Older tests reference removed IDs such as
`show-presentation-btn` and `presentation-view`. Other suites define headless as
`!process.env.DISPLAY`, which silently skips them on macOS even when a desktop is
available. This produces a large test count without dependable coverage of the
reported workflows.

## Proposed change

Keep one Electron fixture with an isolated user-data directory and stubbed IPC
where appropriate. Quarantine or delete stale suites, tag tests by capability,
and publish executed/skipped counts. Start with a short required smoke matrix;
move expensive visual/accessibility cases to explicit jobs.

## Implemented change

The default Playwright config now selects four required workflows under a shared
Electron fixture. The fixture launches the actual main process and renderer with
an isolated user-data directory, supports dependency reuse from linked
worktrees, and rejects headless Linux runs rather than converting them into
skips. A required-suite reporter publishes planned, executed, passed, failed,
and skipped counts and fails empty or wholly skipped runs.

The default local CI pipeline runs this matrix after Jest, and a macOS GitHub
workflow runs it for pull requests and pushes to `main`. Accessibility,
performance, and theme tests have an explicit optional config; incompatible
legacy browser-style specs are documented as quarantined and are not selected
by an active config.

## Acceptance criteria

- [x] No active E2E test references absent production selectors.
- [x] macOS detection does not depend on X11 `DISPLAY`.
- [x] Each test either launches Electron or is explicitly a browser harness test with a server fixture.
- [x] Required smoke covers rapid file switching, preview readiness, mode recovery, and slide geometry.
- [x] CI fails when the required smoke suite is wholly skipped.

## Verification

- `node scripts/local-ci.js`: 5/5 stages passed, including 86 Jest suites
  (1,169 tests) and four executed Electron workflows.
- Required reporter summary: `planned=4 executed=4 passed=4 failed=0 skipped=0`.
- Active required and optional configs contain no references to the removed
  `show-presentation-btn` or `presentation-view` selectors.

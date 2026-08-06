---
id: "modernize-electron-e2e-harness"
title: "Replace stale browser-style E2E tests with reliable Electron workflows"
status: "triaged"
type: "testing"
priority: "P1"
area: "testing"
owner: "unassigned"
source: "systematic-review"
evidence: "source-analysis"
created: "2026-08-07"
updated: "2026-08-07"
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

## Acceptance criteria

- [ ] No active E2E test references absent production selectors.
- [ ] macOS detection does not depend on X11 `DISPLAY`.
- [ ] Each test either launches Electron or is explicitly a browser harness test with a server fixture.
- [ ] Required smoke covers rapid file switching, preview readiness, mode recovery, and slide geometry.
- [ ] CI fails when the required smoke suite is wholly skipped.

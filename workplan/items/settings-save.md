---
id: "settings-save"
title: "Preserve settings edits across categories and report save failures"
status: "review"
type: "bug"
priority: "P1"
area: "editor"
owner: "codex"
source: "user-report"
evidence: "source-analysis"
created: "2026-11-17"
updated: "2026-11-17"
verification: "Regression tests for category drafts, AI preservation and failure reporting."
tags: ["settings", "ai", "persistence"]
---

## Findings and scope

Category navigation replaced unsaved controls. Collecting a non-AI category
unconditionally reset assistant provider/model/temperature/token values. The
renderer ignored failed IPC responses and disk persistence swallowed failures.
Preserve the dialog draft, collect only mounted AI fields, retain saved models
while model lists load, and report disk failures without a false success toast.
Full settings saves restore the prior in-memory state after persistence failure.

## Verification

Eleven regression tests passed across the renderer and main-process suites.
Covered category navigation, save/reopen, cancelled drafts, AI preservation,
missing and loading model lists, runtime configuration updates, and disk-failure
reporting with in-memory rollback. JavaScript syntax, whitespace, and workplan
checks passed. Installed-app behavior has not been tested. Base 4df02d8; branch codex/settings-save-20261117.
No live model calls or installed application changes.

---
id: "typo-suggestions"
title: "Correct spelling directly from underlined words"
status: "review"
type: "enhancement"
priority: "P2"
area: "editor"
owner: "codex"
source: "user-report"
evidence: "source-analysis"
created: "2026-11-17"
updated: "2026-11-17"
verification: "Focused renderer tests for replacement, undo boundaries, stale suggestions and lifecycle cleanup."
tags: ["editor", "spelling"]
---

## Scope

Click a proofreader spelling underline to choose a correction or add the word to
the dictionary. Offer the same suggestions through Monaco's command palette and
context menu. Fetch missing suggestions on demand. Preserve undo and reject
results after edits, model changes, dismissal or deactivation. No AI calls.

## Verification

Six focused jsdom tests passed: correction with quote preservation and undo
boundaries, lazy suggestions, pending-suggestion cancellation on edits, model
switch safety, dictionary/Escape actions, and deactivation during checking.
JavaScript syntax and diff whitespace checks passed. No live app UI test or
installation performed. Built from 4df02d8 on codex/typo-suggestions-20261117.

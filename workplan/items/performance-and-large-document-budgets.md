---
id: "performance-and-large-document-budgets"
title: "Add budgets for startup, file switching, preview, and large documents"
status: "triaged"
type: "testing"
priority: "P2"
area: "performance"
owner: "unassigned"
source: "systematic-review"
evidence: "opportunity"
created: "2026-08-07"
updated: "2026-08-07"
verification: "CI or a documented benchmark job records p50 and p95 startup, file-switch, preview-ready, and presentation-ready timings against fixed small and large fixtures with regression thresholds."
tags: ["benchmark", "large-files", "performance"]
depends_on: ["modernize-electron-e2e-harness", "reliable-editor-preview-transitions"]
---

## Context

The repository has useful quality metrics and trace tooling, but current metrics
mostly count known code patterns and test declarations. They do not measure the
latency users feel when opening a file or waiting for a view. Preview work spans
settings, Kanban, links, citations, MathJax, Mermaid, and DOM replacement, so
latest-wins correctness and latency should be measured together.

## Proposed change

Create deterministic fixtures for small Markdown, large Markdown, many files,
JSONL/CSV records, diagrams, citations, PDF companions, and presentations.
Measure transition start through stable visible completion using performance
marks and Chromium traces.

## Acceptance criteria

- [ ] Benchmarks report actual document sizes and machine/build metadata.
- [ ] Required paths have explicit readiness marks rather than fixed sleeps.
- [ ] Thresholds distinguish correctness failures, regressions, and noisy warnings.
- [ ] Structured editors and presentation fitting are included in the matrix.

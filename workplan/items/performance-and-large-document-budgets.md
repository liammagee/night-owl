---
id: "performance-and-large-document-budgets"
title: "Add budgets for startup, file switching, preview, and large documents"
status: "done"
type: "testing"
priority: "P2"
area: "performance"
owner: "codex"
source: "systematic-review"
evidence: "opportunity"
created: "2026-08-07"
updated: "2026-08-09"
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

- [x] Benchmarks report actual document sizes and machine/build metadata.
- [x] Required paths have explicit readiness marks rather than fixed sleeps.
- [x] Thresholds distinguish correctness failures, regressions, and noisy warnings.
- [x] Structured editors and presentation fitting are included in the matrix.

## Outcome

- Added a shared, bounded readiness recorder for startup, file switching,
  preview rendering, presentation content, and complete-slide fitting.
- Added fixed small and large Markdown, JSONL, CSV, and presentation fixtures
  with a dedicated three-sample benchmark that reports actual sizes, machine
  and build metadata, p50, p95, and threshold classifications.
- Made fresh and reused presentation mounts signal completion only after React
  commits the current slide collection, and exposed an explicit fit-ready state
  after the delivery transform is applied.
- Documented warning versus regression budgets and kept correctness failures as
  a separate, always-failing result class.

## Verification

- `npm run benchmark:performance` passed all 10 scenarios. Observed p95 was
  546.4 ms startup, 706.7 ms large Markdown file switch, 616.1 ms large
  Markdown preview, 18.2 ms large presentation readiness, and 81.4 ms
  presentation fitting on the recorded Apple M3 Max run.
- The generated report recorded an 851,677-byte Markdown fixture, 1,200-record
  JSONL and CSV fixtures, and a 35-slide presentation with full runtime and
  machine metadata.
- Focused readiness, presentation recovery/build, and repository-policy suites
  passed before the full local release gate.

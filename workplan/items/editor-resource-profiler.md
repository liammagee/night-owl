---
id: "editor-resource-profiler"
title: "Profile app resources inside the editor"
status: "done"
type: "enhancement"
priority: "P2"
area: "performance"
owner: "codex"
source: "user-report"
evidence: "source-analysis"
created: "2026-11-11"
updated: "2026-11-11"
verification: "Real Electron profiling shows process metrics and a saved trace; automated checks cover sampling lifecycle, unavailable values, and renderer integration."
tags: ["performance", "diagnostics"]
---

## Context

Existing Chromium tracing and lifecycle diagnostics have no in-editor resource view.
User requested in-depth profiling and a visible editor surface. Work starts from
75ce863 on codex/resource-profiler in ~/Dev/machinespirits/nightowl-resource-profiler.
Two installed instances were already running; use an isolated test profile.

## Acceptance criteria

- [x] Live process CPU, memory, wakeups, main-process memory and event-loop activity.
- [x] Bounded renderer history, long tasks, sampling delay, readiness and lifecycle counts.
- [x] Editor entry point, pause/resume, report export and bounded Chromium trace capture.
- [x] Tests and real Electron measurements with explicit limitations.

## Outcome

Implemented the editor Resource Profiler and bounded tracing. Final verification:
18 focused tests, real Electron end-to-end trace capture, static checks and
workplan validation passed. See [profiling findings](../../docs/resource-profile-2026-11-11.md).
Installed instances were observed but not replaced.

The profiler was subsequently integrated, verified in the packaged app and
installed with the [idle CPU repair](demand-driven-rendering.md).

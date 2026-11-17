---
id: "investigate-intermittent-presentation-navigation"
title: "Explain intermittent extra slide advancement in required Electron test"
status: "triaged"
type: "bug"
priority: "P1"
area: "presentation"
owner: "unassigned"
source: "test-failure"
evidence: "test-failure"
created: "2026-11-17"
updated: "2026-11-17"
verification: "Capture input and navigation event causality, identify the failure mechanism, and demonstrate a focused regression."
tags: ["intermittent", "navigation"]
---

## Context

On the untouched 4df02d8 baseline, the required spiral-fitting test expected
slide index 1 after one Right Arrow but observed index 2 then 3. See the
[review report](../../docs/development/CODEBASE_REVIEW_2026-11-17.md).
Isolated and subsequent full-suite reruns passed with no navigation code change.
Five additional bounded repetitions also passed. A passing rerun does not establish a fix. Distinguish application event ownership,
test timing, and native input/focus interference before changing navigation.

## Acceptance criteria

- [ ] Capture an event trace that explains the unexpected slide transitions.
- [ ] Reproduce and fix the identified cause with a focused regression.

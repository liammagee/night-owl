---
id: "investigate-intermittent-presentation-navigation"
title: "Explain intermittent extra slide advancement in required Electron test"
status: "review"
type: "bug"
priority: "P1"
area: "presentation"
owner: "unassigned"
source: "test-failure"
evidence: "test-failure"
created: "2026-11-17"
updated: "2026-11-21"
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

- [x] Capture a controlled callback ordering that explains unexpected transitions (original native trace unavailable).
- [x] Reproduce and fix the identified cause with a focused regression.

## November 21 continuation

The held legacy target callback reproduced expected index 1 / received 3. Targets
now commit during entry and stale retries are invalidated. Re-entry also ignored
slide zero; the accessibility sequence reproduced and verifies that repair. Late
narration completion is covered by a separate real Electron regression. The
original November 17 native event trace is unavailable, so exact historical
attribution remains limited. See [continuation report](../../docs/development/CODEBASE_REVIEW_2026-11-21.md).

Content reconciliation now rejects obsolete navigation revisions; its same-frame
regression failed before repair. Separate notes use current parsed slides, with
a stale-cache regression and duplicate delayed writers removed. The focused
presentation matrix passed 12/12 over three repetitions, and the final required
suite passed 31/31 as part of the 8/8 release gate.

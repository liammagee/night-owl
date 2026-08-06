# NightOwl engineering workplan

This directory is the source-controlled triage system for bugs, refactors,
maintenance, and product enhancements. It follows the same authored-item plus
generated-board pattern as `machinespirits-eval`, with fields adapted for a
desktop IDE.

## Source of truth

- Edit `workplan/items/<id>.md`.
- Do not hand-edit `BOARD.md` or `board.json`; both are generated.
- Keep evidence honest: `reproduced` and `test-failure` require direct evidence;
  `source-analysis` means the failure mechanism is visible in code but has not
  necessarily been reproduced; `opportunity` is prospective work.
- A `done` item must satisfy its `verification` line and the acceptance criteria
  in its body.

## Lifecycle

`inbox -> triaged -> active -> review -> done -> archived`

Use `blocked` only with `blocked_by`. Use `dropped` when the work is deliberately
declined rather than completed.

## Priority

- `P0`: user-visible correctness or data-flow reliability; address first.
- `P1`: release, security, major reliability, or test-confidence gap.
- `P2`: structural quality, accessibility, performance, or maintainability.
- `P3`: useful polish with no near-term risk.

## Commands

```bash
npm run wp:list
npm run wp:list -- --priority P0
npm run wp:list -- --area presentation --json
node scripts/workplan.js show fit-presentation-slides-to-viewport
node scripts/workplan.js add --title "Describe the issue" --type bug --priority P1 --area editor
node scripts/workplan.js set <id> status active
npm run wp:validate
npm run wp:render
npm run wp:check
```

`WORKPLAN_DIR=/tmp/example node scripts/workplan.js check` supports hermetic
tooling tests. The frontmatter format intentionally uses only scalar values and
inline arrays so the CLI remains dependency-free.

## Item template

```markdown
---
id: "kebab-case-id"
title: "Short outcome-oriented title"
status: "triaged"
type: "bug"
priority: "P1"
area: "editor"
owner: "unassigned"
source: "systematic-review"
evidence: "source-analysis"
created: "2026-08-07"
updated: "2026-08-07"
verification: "One observable check that proves completion."
tags: ["reliability"]
---

## Context

State the evidence and user impact. Link to a deeper report instead of copying
large investigations into every card.

## Proposed change

Describe the intended boundary, not an implementation prescription that may go
stale.

## Acceptance criteria

- [ ] Add concrete checks.
```

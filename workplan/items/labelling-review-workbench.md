---
id: "labelling-review-workbench"
title: "Expand structured records into a labelling and review workbench"
status: "triaged"
type: "enhancement"
priority: "P1"
area: "editor"
owner: "codex"
source: "user-report"
evidence: "opportunity"
created: "2026-08-09"
updated: "2026-08-09"
verification: "A schema-backed JSONL or CSV task supports keyboard-first labelling, saved filters, bulk operations, resumable progress, and reviewer disagreement or adjudication while preserving the source format."
tags: ["csv", "jsonl", "labelling", "review"]
depends_on: ["schema-driven-record-workflows", "unify-command-and-shortcut-registry"]
---

## Context

Schema-driven record editing provides typed fields, validation, progress, and
export gating. Larger human-labelling jobs still need efficient queue
navigation, table-level comparison, repeatable filtering, bulk actions, review
state, and an auditable handoff between coders and adjudicators.

## Proposed change

Add a task-oriented list/grid alongside the existing source-preserving form.
Extend the schema contract with optional workflow roles and status fields while
leaving generic JSONL and CSV behavior unchanged.

## Acceptance criteria

- [ ] Grid and form views share one record selection and source-preserving edit history.
- [ ] Keyboard actions support label, save, and next-record workflows without trapping focus.
- [ ] Sorts, filters, facets, and saved views work across task fields and validation state.
- [ ] Bulk fill or clear operations preview their affected records and remain undoable.
- [ ] Optional coder, reviewer, disagreement, and adjudication views do not alter schema-free files.
- [ ] Resume and export metadata make incomplete or reviewed task state observable.

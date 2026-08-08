---
id: "labelling-review-workbench"
title: "Expand structured records into a labelling and review workbench"
status: "done"
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

## Implemented change

The optional `workflow` schema contract now declares keyboard label choices,
grid columns, facets, sorting, saved views, and coder/reviewer/adjudication
fields. The record surface adds a shared-selection grid, role-aware queues,
local saved views and resume state, source-free handoff metadata, and
preview-before-apply bulk fill or clear. Bulk changes are exact record
replacements submitted in one Monaco edit transaction so the entire batch is
one undo step. Schema-free files retain the original record list and form.

## Acceptance criteria

- [x] Grid and form views share one record selection and source-preserving edit history.
- [x] Keyboard actions support label, save, and next-record workflows without trapping focus.
- [x] Sorts, filters, facets, and saved views work across task fields and validation state.
- [x] Bulk fill or clear operations preview their affected records and remain undoable.
- [x] Optional coder, reviewer, disagreement, and adjudication views do not alter schema-free files.
- [x] Resume and export metadata make incomplete or reviewed task state observable.

---
id: "schema-driven-record-workflows"
title: "Make structured record editing schema-driven"
status: "triaged"
type: "enhancement"
priority: "P2"
area: "editor"
owner: "unassigned"
source: "systematic-review"
evidence: "opportunity"
created: "2026-08-07"
updated: "2026-08-07"
verification: "A workspace can attach a declarative schema to JSONL or CSV files and receive typed controls, required-field validation, completion progress, and export validation without changing NightOwl source."
tags: ["csv", "jsonl", "labelling", "schema"]
depends_on: ["reliable-editor-preview-transitions"]
---

## Context

The new structured-record mode is a strong foundation: it parses quoted and
multiline CSV, preserves source-level edits through Monaco, searches records,
coerces JSON types, and exposes specific selects for the current human-labelling
columns. Those field choices are hard-coded by column name, however, and the mode
does not yet express required fields, validation rules, coder progress, or task
completion.

## Proposed change

Support an optional sidecar or workspace schema that describes labels, field
order, help text, types, enumerations, required fields, read-only identity fields,
and record completion. Keep raw-source editing as the fallback and preserve the
underlying file format exactly where possible.

## Acceptance criteria

- [ ] Schemas can be selected automatically by filename pattern or explicitly by the user.
- [ ] Validation errors are attached to records and fields without hiding otherwise valid records.
- [ ] Progress shows complete, incomplete, invalid, and filtered counts.
- [ ] Export/check refuses incomplete required labels only when the task schema requests it.
- [ ] Generic JSONL and CSV files still work without a schema.

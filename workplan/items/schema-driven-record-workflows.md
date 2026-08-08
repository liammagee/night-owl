---
id: "schema-driven-record-workflows"
title: "Make structured record editing schema-driven"
status: "done"
type: "enhancement"
priority: "P2"
area: "editor"
owner: "codex"
source: "systematic-review"
evidence: "opportunity"
created: "2026-08-07"
updated: "2026-08-09"
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

- [x] Schemas can be selected automatically by filename pattern or explicitly by the user.
- [x] Validation errors are attached to records and fields without hiding otherwise valid records.
- [x] Progress shows complete, incomplete, invalid, and filtered counts.
- [x] Export/check refuses incomplete required labels only when the task schema requests it.
- [x] Generic JSONL and CSV files still work without a schema.

## Outcome

- Added an optional declarative schema contract for ordered labels, help text,
  typed and enumerated controls, required fields, read-only identifiers, ranges,
  lengths, patterns, and hidden additional fields.
- Added automatic `<file>.schema.json` and same-stem sidecars, workspace
  `.nightowl/record-schemas.json` manifests with glob matching, and an explicit
  **Choose schema…** workflow.
- Added per-field and per-record validation without filtering invalid records,
  plus complete, incomplete, invalid, and filtered progress counts.
- Added a **Check for export** contract that blocks incomplete or invalid tasks
  only when the selected schema opts into `completion.blockExport`.
- Removed the hard-coded human-labelling CSV column choices. Generic JSONL and
  CSV files continue to use inferred controls with no completion gate.
- Documented schema attachment, workspace patterns, the field contract, and a
  complete human-labelling example in `docs/structured-record-schemas.md`.

## Verification

- Schema and structured-record unit suites passed 20/20 tests, including
  sidecar candidates, filename-pattern selection, explicit selection, typed
  coercion, field validation, progress, export gating, and generic fallback.
- Required Electron `@record-schema` passed against the real renderer, covering
  rendered choices/help/read-only fields, record statuses, filtered progress,
  a blocked task check, and a second schema-free JSONL file.
- `npm run ci:local:release` passed all 7 stages: 99 suites / 1,228 tests and
  12/12 required Electron workflows.

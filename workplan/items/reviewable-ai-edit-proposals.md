---
id: "reviewable-ai-edit-proposals"
title: "Make AI document edits reviewable and attributable"
status: "done"
type: "enhancement"
priority: "P1"
area: "editor"
owner: "codex"
source: "systematic-review"
evidence: "opportunity"
created: "2026-08-09"
updated: "2026-08-09"
verification: "An AI editing action presents a deterministic proposed diff with disclosed context and provider provenance, and applies only explicitly accepted hunks through Monaco's undoable edit path."
tags: ["ai", "diff", "privacy", "provenance"]
depends_on: ["unify-command-and-shortcut-registry", "renderer-error-telemetry-and-recovery"]
---

## Context

NightOwl exposes multiple AI providers, assistants, summaries, notes, and inline
completions. Document-changing actions do not share one visible contract for
what context will leave the machine, which provider produced a change, or how
the author can accept only part of a proposed rewrite.

## Proposed change

Route AI document mutations through a proposal model containing source ranges,
replacement text, disclosed context, provider/model metadata, and usage. Render
the proposal as a diff and apply accepted hunks through the normal editor edit
and undo path.

## Implemented change

Added one shared AI edit contract for context disclosure, provider privacy,
request provenance, deterministic line hunks, review decisions, stale-revision
guards, and undo-bounded Monaco edits. The contract now covers selection
rewrites, presentation-note summaries, scholarly headings, outline insertion
or replacement, proofreader style suggestions, and writing-coach context.

The former outline `setValue` replacement and direct AI insertion paths have
been removed. Existing outline, proofreader, and writing-coach requests were
also corrected to use the fixed `message`/`response` preload contract. A new AI
setting can prohibit document context from reaching remote providers while
leaving `local`, `lmstudio`, and `ollama` available.

## Acceptance criteria

- [x] The user sees the exact document context selected for a remote or local provider before submission.
- [x] Suggestions produce a non-mutating diff with accept/reject controls per hunk and for the whole proposal.
- [x] Accepted changes are one undoable editor operation and reject stale source revisions safely.
- [x] Provider, model, prompt recipe, time, and available usage metadata remain attached to the proposal.
- [x] Privacy settings can disallow remote context while retaining explicitly configured local providers.

## Verification

- All 114 Jest suites passed (1,299 tests), including deterministic hunking,
  selective single-operation apply, stale-source rejection, review UI, and
  local-versus-remote privacy policy coverage.
- Required Electron coverage now proves the proposal is non-mutating before
  review, applies only the accepted hunk, retains provenance and disclosed
  context, and restores the full source with one undo.
- Local release CI passed 6/7 stages. Its Electron launch stage failed before
  the first test with the known locked-desktop `Process failed to launch`
  condition; the hosted macOS Electron run remains the merge gate.

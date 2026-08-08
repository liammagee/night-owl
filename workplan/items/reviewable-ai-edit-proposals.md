---
id: "reviewable-ai-edit-proposals"
title: "Make AI document edits reviewable and attributable"
status: "triaged"
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

## Acceptance criteria

- [ ] The user sees the exact document context selected for a remote or local provider before submission.
- [ ] Suggestions produce a non-mutating diff with accept/reject controls per hunk and for the whole proposal.
- [ ] Accepted changes are one undoable editor operation and reject stale source revisions safely.
- [ ] Provider, model, prompt recipe, time, and available usage metadata remain attached to the proposal.
- [ ] Privacy settings can disallow remote context while retaining explicitly configured local providers.

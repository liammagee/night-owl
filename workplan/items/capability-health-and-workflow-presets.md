---
id: "capability-health-and-workflow-presets"
title: "Add capability health and focused workflow presets"
status: "triaged"
type: "enhancement"
priority: "P2"
area: "platform"
owner: "codex"
source: "systematic-review"
evidence: "opportunity"
created: "2026-08-09"
updated: "2026-08-09"
verification: "NightOwl reports available, degraded, and missing capabilities with actionable checks, and Writing, Research, Presentation, and Labelling presets project a focused reversible UI without hiding user data or disabling required actions."
tags: ["onboarding", "health", "workflows", "discoverability"]
depends_on: ["unify-command-and-shortcut-registry"]
---

## Context

Features depend on optional providers and tools such as Pandoc, Docling,
LaTeX, Git, AI credentials, TTS engines, and terminal assistants. Failures are
currently discovered within individual dialogs. Meanwhile the activity rail,
mode bar, toolbar, and settings expose many unrelated controls at once.

## Proposed change

Add a capability-health model with safe probes and setup guidance. Build
reversible workflow presets on the canonical UI state and action registry so
the app can emphasize the tools relevant to writing, research, presentations,
or labelling without forking the interface.

## Acceptance criteria

- [ ] Capability checks distinguish available, degraded, missing, and unconfigured states without exposing secret values.
- [ ] Each missing dependency has an actionable explanation and a repeatable recheck.
- [ ] Workflow presets affect visible actions and panes through canonical state and can always return to the user's custom layout.
- [ ] First-run guidance uses capability state rather than claiming unavailable features work.
- [ ] Settings and diagnostics can export a redacted capability report.

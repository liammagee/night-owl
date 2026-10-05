---
id: "capability-health-and-workflow-presets"
title: "Add capability health and focused workflow presets"
status: "done"
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

## Implemented change

Added a fixed capability-health IPC contract backed by bounded, direct process
probes for Git, Pandoc, Docling, LaTeX, Codex, and Claude, plus provider and
speech configuration checks. Reports use four explicit states, include setup
guidance and viable fallbacks, and whitelist their exported fields so document
contents, credentials, command paths, and private filesystem paths cannot leak.
Capability health is available from Settings, Help commands, first-run guidance,
and the existing redacted diagnostics export.

Added Writing, Research, Presentation, and Labelling presets over the existing
UI state, pane controller, and action registry. A preset snapshots the exact
custom mode, pane selection, and visibility, projects a small contextual action
bar, and restores the snapshot without disabling or unregistering any action.

## Acceptance criteria

- [x] Capability checks distinguish available, degraded, missing, and unconfigured states without exposing secret values.
- [x] Each missing dependency has an actionable explanation and a repeatable recheck.
- [x] Workflow presets affect visible actions and panes through canonical state and can always return to the user's custom layout.
- [x] First-run guidance uses capability state rather than claiming unavailable features work.
- [x] Settings and diagnostics can export a redacted capability report.

## Verification

- All 118 Jest suites passed (1,308 tests), including executable classification,
  secret/path omission, fixed IPC exposure, renderer schema whitelisting,
  capability setup UI, state-driven first-run guidance, and exact preset restore.
- Required Electron coverage probes the live packaged environment, verifies all
  four reported states remain in contract, opens the setup UI, applies Writing,
  checks its focused actions, and restores the prior canonical layout.
- Local release CI passed 6/7 stages. The locked desktop prevented Electron from
  launching before test one; hosted macOS Electron remains the merge gate.

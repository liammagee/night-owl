---
id: "unify-command-and-shortcut-registry"
title: "Unify commands, menus, shortcuts, and feature actions"
status: "triaged"
type: "refactor"
priority: "P0"
area: "platform"
owner: "codex"
source: "systematic-review"
evidence: "source-analysis"
created: "2026-08-09"
updated: "2026-08-09"
verification: "One action registry drives the command palette and shortcut help, rejects conflicting active shortcuts, and exposes actions contributed by bundled feature modules in a required Electron workflow."
tags: ["commands", "discoverability", "shortcuts", "ui"]
depends_on: ["single-source-mode-and-pane-state"]
---

## Context

NightOwl currently has a command registry, two file-oriented palette surfaces,
menu accelerators maintained in the main process, and feature modules that still
attempt to append commands to an undefined legacy array. Several shortcuts are
assigned to more than one action, so the visible help, renderer behavior, and
native application menu can disagree.

## Proposed change

Introduce one renderer-facing action contract with stable IDs, labels,
categories, shortcuts, contextual enablement, and feature ownership. Project it
into the command palette, shortcut help, toolbar and native-menu descriptors
without creating a string-based IPC escape hatch. Keep Quick Open as a separate
file search surface with an unambiguous shortcut.

## Acceptance criteria

- [ ] Bundled modules register actions through one supported API; legacy command registration is removed.
- [ ] Command Palette and Quick Open have distinct names, behavior, and shortcuts.
- [ ] Active shortcut conflicts fail a deterministic contract test.
- [ ] Native menu accelerators and shortcut help are generated from or validated against the same action metadata.
- [ ] A required Electron workflow discovers and executes a feature-contributed action.

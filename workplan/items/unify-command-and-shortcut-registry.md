---
id: "unify-command-and-shortcut-registry"
title: "Unify commands, menus, shortcuts, and feature actions"
status: "done"
type: "refactor"
priority: "P0"
area: "platform"
owner: "codex"
source: "systematic-review"
evidence: "source-analysis"
created: "2026-08-09"
updated: "2026-08-09"
verification: "Unit contracts keep portable macOS/Windows shortcuts conflict-free, repository checks reject legacy registrations and hard-coded native accelerators, and the required @actions Electron workflow discovers and executes a bundled feature action."
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

## Implemented change

Added a shared action registry with stable IDs, searchable metadata, contextual
availability, portable shortcuts, execution, subscriptions, and deterministic
conflict reporting. Core actions now drive the command palette and generated
keyboard help, while native Electron menus derive accelerators from the same
catalog. Quick Open is a separate `Mod+P` file search and Command Palette is a
`Mod+Shift+P` action search.

Bundled feature modules now contribute through `window.registerCommand`; the
unused legacy array and duplicate static file palette were removed. Global
feature shortcut listeners for focus mode and the terminal were folded into the
registry. The contract and extension rules are documented in
`docs/development/ACTIONS.md`.

## Acceptance criteria

- [x] Bundled modules register actions through one supported API; legacy command registration is removed.
- [x] Command Palette and Quick Open have distinct names, behavior, and shortcuts.
- [x] Active shortcut conflicts fail a deterministic contract test.
- [x] Native menu accelerators and shortcut help are generated from or validated against the same action metadata.
- [x] A required Electron workflow discovers and executes a feature-contributed action.

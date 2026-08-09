# NightOwl documentation

Start with the operating guides below. Files with dates in their names are
historical snapshots; they remain useful evidence but are not current status or
backlogs.

## Architecture and contribution

- [Architecture](../ARCHITECTURE.md) — process boundaries, directory and
  workflow ownership, current IPC examples, and source/generated assets.
- [Build and release chain](development/BUILD_AND_RELEASE.md) — clean install,
  local/hosted gates, packaging, packaged smoke, signing, and tagged release.
- [Local CI](development/LOCAL_CI.md) — worktree dependency reuse, capability
  behavior, and the opt-in pre-push hook.
- [Renderer workflows](development/RENDERER_WORKFLOWS.md) — injected controller
  boundaries for file, preview, tree, and pane workflows.
- [Resource lifecycles](development/RESOURCE_LIFECYCLES.md) — deterministic
  ownership and diagnostics for timers, listeners, observers, and processes.
- [Workspace index](development/WORKSPACE_INDEX.md) — shared multi-format file
  discovery, search, link identities, rename planning, and bounded refreshes.
- [UI state](development/UI_STATE.md) — canonical mode, pane, fullscreen,
  source, and record-mode state.
- [Error diagnostics](development/ERROR_DIAGNOSTICS.md) — correlation,
  redaction, recovery actions, and diagnostic reports.
- [Refactoring guide](development/FUTURE_REFACTORING_PLAN.md) — verified
  foundations linked to workplan item IDs and rules for proposing new work.

## Security, performance, and data workflows

- [Electron security](development/ELECTRON_SECURITY.md) — context isolation,
  fixed preload capabilities, and packaged enforcement.
- [Content security](development/CONTENT_SECURITY.md) — shared trust policy for
  preview, presentation, and navigation.
- [Performance budgets and traces](performance-trace-runbook.md) — fixed
  benchmark matrix, threshold semantics, and Chromium trace comparison.
- [Structured record schemas](structured-record-schemas.md) — optional JSONL/CSV
  task schemas, validation, progress, and export checks.

## Presentation and distribution

- [Presentation asset ownership](development/PRESENTATION_ASSETS.md) — canonical
  JSX, generated runtime, and CSS ownership.
- [macOS distribution](setup/MAC_DISTRIBUTION.md) — hardened runtime,
  entitlements, signing, and notarization checks.
- [Speaker notes syntax](features/SPEAKER_NOTES_SYNTAX.md) and
  [sample presentation](samples/sample-presentation.md) — authoring references.

## Setup and feature references

- [App branding](setup/APP_BRANDING_GUIDE.md), [customization](setup/APP_CUSTOMIZATION_GUIDE.md),
  [name configuration](setup/APP_NAME_CONFIGURATION.md), and [icons](setup/ICON_SETUP.md).
- Implemented feature notes under [`features/`](features/).
- Example authoring files under [`samples/`](samples/).

## Engineering status

Use [`workplan/BOARD.md`](../workplan/BOARD.md) for live status. Edit authored
items under `workplan/items/`, run `npm run wp:render`, and do not add task
checkboxes to architecture guides.

When adding documentation, prefer one current operating guide per boundary.
Use a dated filename for an audit or inventory that is intentionally a snapshot,
and link any actionable result to a workplan item.

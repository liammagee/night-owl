---
id: "refresh-architecture-and-build-docs"
title: "Refresh architecture, ownership, and build documentation"
status: "done"
type: "docs"
priority: "P2"
area: "architecture"
owner: "codex"
source: "systematic-review"
evidence: "opportunity"
created: "2026-08-07"
updated: "2026-08-09"
verification: "Architecture and contributor docs match the current NightOwl directories, IPC names, feature loader, generated assets, workplan flow, and clean build procedure."
tags: ["architecture", "documentation", "onboarding"]
depends_on: ["consolidate-presentation-source-and-styles"]
---

## Context

`ARCHITECTURE.md` still names the root `hegel-pedagogy-ai`, describes
`renderer.js` as 2,500+ lines rather than 16,643, and lists old module/IPC
examples. The future refactoring plan is directionally useful but does not link
to executable work items. Presentation compilation, generated assets, local
file dependencies, and packaged smoke expectations are not documented as one
build chain.

## Proposed change

Document current process boundaries, workflow owners, canonical/generated files,
and build/test layers. Link architectural risks to workplan items so plans do
not become a second backlog.

## Acceptance criteria

- [x] Every top-level runtime directory has an owner and concise responsibility.
- [x] IPC examples use channels that exist today.
- [x] Source-versus-generated assets and release prerequisites are explicit.
- [x] The refactoring plan points to workplan item IDs for live status.

## Outcome

- Replaced the stale architecture guide with current main/preload/renderer
  boundaries, fixed capability IPC examples, workflow and feature ownership,
  an exhaustive top-level directory map, persistence rules, and test layers.
- Added one clean build-and-release chain covering canonical/generated inputs,
  local and hosted gates, native repair, performance budgets, distribution
  preflight, packaged smoke, platform artifacts, signing, and notarization.
- Reframed the future refactoring note as a guide linked directly to the
  authored workplan items that carry live status and verification.
- Refreshed the root README, contributor guide, documentation index, test guide,
  macOS distribution entry point, development assistant note, and release
  assessment to remove stale identities, commands, counts, and readiness claims.
- Added a documentation contract test that checks directory ownership, IPC
  allowlists, generated assets, package scripts, workplan links, and stale-text
  regressions against the repository itself.

## Verification

- Documentation and code-quality contract suites passed 49/49 tests.
- The full local release gate passed all 7 stages: 100 Jest suites / 1,234
  tests and 12/12 required Electron workflows.
- Every documented invoke/event channel is present in `preload-ipc-guard.js`,
  every documented build command is present in `package.json`, and every linked
  refactoring item exists under `workplan/items/`.

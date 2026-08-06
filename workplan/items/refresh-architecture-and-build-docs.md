---
id: "refresh-architecture-and-build-docs"
title: "Refresh architecture, ownership, and build documentation"
status: "triaged"
type: "docs"
priority: "P2"
area: "architecture"
owner: "unassigned"
source: "systematic-review"
evidence: "opportunity"
created: "2026-08-07"
updated: "2026-08-07"
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

- [ ] Every top-level runtime directory has an owner and concise responsibility.
- [ ] IPC examples use channels that exist today.
- [ ] Source-versus-generated assets and release prerequisites are explicit.
- [ ] The refactoring plan points to workplan item IDs for live status.

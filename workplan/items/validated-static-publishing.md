---
id: "validated-static-publishing"
title: "Turn static export into a validated publishing workflow"
status: "triaged"
type: "enhancement"
priority: "P2"
area: "preview"
owner: "codex"
source: "systematic-review"
evidence: "source-analysis"
created: "2026-08-09"
updated: "2026-08-09"
verification: "Static publication uses the same trusted Markdown semantics as preview, rewrites internal links and assets deterministically, provides a local site preview, and passes a no-network publication contract test."
tags: ["publishing", "static-site", "preview", "links"]
depends_on: ["multi-repo-publishing-profiles", "sanitize-rendered-markdown-and-navigation", "unified-workspace-index"]
---

## Context

The existing static-site generator performs its own regex-based Markdown
conversion and manual navigation construction. It is registered through the
legacy command path, does not guarantee parity with NightOwl preview semantics,
and offers little preflight evidence for links or assets.

## Proposed change

Use a shared trusted rendering pipeline for preview and static publication.
Add deterministic link and asset resolution, local preview, publication
manifest generation, and compatibility with workspace publishing profiles.

## Acceptance criteria

- [ ] Preview and published Markdown share the same parsing, sanitization, citation, and code-rendering contract.
- [ ] Internal links, anchors, images, and copied assets are validated before output is accepted.
- [ ] A local site preview reports broken routes and source-to-output mappings.
- [ ] Publication emits a manifest suitable for a downstream content repository or deploy stage.
- [ ] Existing simple folder export remains available as a profile-free fallback.

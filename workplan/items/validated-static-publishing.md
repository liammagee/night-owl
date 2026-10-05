---
id: "validated-static-publishing"
title: "Turn static export into a validated publishing workflow"
status: "done"
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

## Implemented change

Replaced the regex exporter with a trusted renderer contract shared by normal
Preview and publication. Markdown parsing, front matter, code blocks,
citations, internal-link preprocessing, and HTML sanitization now occur before
the fixed publishing IPC boundary. The main process independently rejects
untrusted renderer contracts and active markup, maps source paths to stable
routes, verifies heading anchors, fingerprints and copies workspace assets,
and refuses unresolved or out-of-workspace dependencies.

The publishing workbench runs preflight before enabling output, shows every
error, warning, source-to-output mapping, and a sandboxed no-network preview.
Successful output is assembled in a staging directory, never overwrites a
non-empty destination, and includes `nightowl-publication.json` with content
hashes and an optional publishing-profile handoff. The bundled Machine Spirits
profile can be attached to the manifest, after which the user can continue
directly into the existing content-repository and website workflow. A simple
profile-free folder export remains the default.

## Acceptance criteria

- [x] Preview and published Markdown share the same parsing, sanitization, citation, and code-rendering contract.
- [x] Internal links, anchors, images, and copied assets are validated before output is accepted.
- [x] A local site preview reports broken routes and source-to-output mappings.
- [x] Publication emits a manifest suitable for a downstream content repository or deploy stage.
- [x] Existing simple folder export remains available as a profile-free fallback.

## Verification

- All 121 Jest suites passed (1,319 tests), including route and anchor
  rewriting, content and asset hashing, atomic output staging, overwrite
  refusal, trusted-render parity, fixed IPC validation, profile handoff privacy,
  renderer workbench behavior, and an explicit no-network publication test.
- Required Electron coverage creates a real temporary Markdown workspace,
  renders two linked pages through the live Preview contract, verifies a local
  image and heading anchors, checks profile metadata and private-path omission,
  and proves a broken route blocks publication.
- Local release CI passed 6/7 stages. The locked desktop prevented Electron
  from launching before test one; hosted macOS Electron remains the merge gate.

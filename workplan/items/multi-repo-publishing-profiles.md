---
id: "multi-repo-publishing-profiles"
title: "Add safe workspace publishing profiles for multi-repository sites"
status: "triaged"
type: "enhancement"
priority: "P1"
area: "platform"
owner: "codex"
source: "user-report"
evidence: "opportunity"
created: "2026-08-09"
updated: "2026-08-09"
verification: "A declarative Machine Spirits profile can preflight and preview the IDE-to-brand-to-content-to-website handoff, then run an explicitly confirmed publish while reporting the exact content revision and verification stages."
tags: ["publishing", "workflow", "multi-repo", "machinespirits"]
depends_on: ["unify-command-and-shortcut-registry", "minimize-electron-privilege-surface"]
---

## Context

The Machine Spirits release path is intentionally split between the brand,
content-philosophy, and website repositories. Its contracts are strong, but the
human workflow still requires knowing which repository owns each step, locating
sibling checkouts, running multiple commands, reviewing generated content, and
following a dispatched deployment. NightOwl currently offers a generic Git
publish dialog and a simple static-site exporter but no representation of this
pipeline.

## Proposed change

Add declarative workspace publishing profiles with named repositories and
ordered preflight, preview, publish, deployment-status, and live-verification
stages. Read-only stages may run directly; committing, pushing, dispatching, or
deploying must remain visibly distinct and require explicit confirmation. Use
the Machine Spirits repositories as the reference profile while keeping the
contract reusable by other content sites.

## Acceptance criteria

- [ ] A workspace profile declares repository roles, checkout discovery, commands, artifacts, and stage authority without embedding secrets.
- [ ] The IDE reports missing tools, repositories, dirty inputs, and failed checks before offering publication.
- [ ] Preview shows generated or changed content and the exact downstream revision before mutation.
- [ ] Publish requires explicit confirmation and does not sweep unrelated staged or working-tree changes into a commit.
- [ ] The Machine Spirits case records brand render, content validation/push, website dispatch, deployed revision, and live smoke as separate observable stages.
- [ ] Hermetic tests exercise the orchestration without network access or production mutation.

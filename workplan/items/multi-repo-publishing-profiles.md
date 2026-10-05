---
id: "multi-repo-publishing-profiles"
title: "Add safe workspace publishing profiles for multi-repository sites"
status: "done"
type: "enhancement"
priority: "P1"
area: "platform"
owner: "codex"
source: "user-report"
evidence: "opportunity"
created: "2026-08-09"
updated: "2026-08-09"
verification: "Hermetic service, IPC, renderer, security, stale-plan, and staged-index tests cover discovery through confirmed execution; required Electron CI opens the real workflow through the shared action registry."
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

## Implemented change

Added versioned workspace publishing profiles at
`.nightowl/publishing.json`, plus a bundled Machine Spirits reference profile.
The main-process orchestrator discovers declared sibling repositories, verifies
their expected names and remotes, reports tools, branches, full SHAs, staged and
unstaged paths, and hashes the reviewed plan with current repository state.
Commands use direct executable/argument vectors; absolute executables,
portfolio traversal, embedded credential fields, concurrent runs, and stale
plans are rejected.

The new Publishing Workflows panel presents separate read-only, network-read,
and mutating stages. Mutation requires an app-native confirmation over the
exact paths and displayed commands, plus a release message where declared. The
Machine Spirits case models brand `./check`, dry-run handoff, the existing
scoped content publisher, website-owned deploy status, and live smoke against
the exact content revision. The schema and ownership boundary are documented in
`docs/development/PUBLISHING_PROFILES.md`.

## Acceptance criteria

- [x] A workspace profile declares repository roles, checkout discovery, commands, artifacts, and stage authority without embedding secrets.
- [x] The IDE reports missing tools, repositories, dirty inputs, and failed checks before offering publication.
- [x] Preview shows generated or changed content and the exact downstream revision before mutation.
- [x] Publish requires explicit confirmation and does not sweep unrelated staged or working-tree changes into a commit.
- [x] The Machine Spirits case records brand render, content validation/push, website dispatch/deployment status, deployed revision, and live smoke as separate observable stages.
- [x] Hermetic tests exercise the orchestration without network access or production mutation.

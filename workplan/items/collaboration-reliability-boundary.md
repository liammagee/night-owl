---
id: "collaboration-reliability-boundary"
title: "Replace or retire the prototype collaboration surface"
status: "triaged"
type: "enhancement"
priority: "P3"
area: "platform"
owner: "codex"
source: "systematic-review"
evidence: "source-analysis"
created: "2026-08-09"
updated: "2026-08-09"
verification: "The collaboration surface is either backed by tested convergent document synchronization, reconnect and identity semantics, or is removed from normal product discovery and explicitly labelled unsupported."
tags: ["collaboration", "sync", "experimental"]
depends_on: ["unify-command-and-shortcut-registry", "resource-lifecycle-ownership"]
---

## Context

The current local WebSocket prototype broadcasts positional Monaco edits and
cursors but has no convergence algorithm, version negotiation, document
identity handshake, reconnect resynchronization, authentication, or offline
reconciliation. Presenting it as normal real-time collaboration risks silent
document divergence.

## Proposed change

First gate the current surface as experimental and define a reproducible
two-client convergence test. Continue to a CRDT-backed implementation only if
the product value justifies its dependency and security cost; otherwise remove
the misleading UI while retaining documented extension points.

## Acceptance criteria

- [ ] The prototype cannot be enabled accidentally or represented as production-ready.
- [ ] A two-client test covers simultaneous edits, reconnect, document mismatch, and clean shutdown.
- [ ] Any retained collaboration transport has explicit session identity, permissions, and resynchronization behavior.
- [ ] Failure never overwrites a newer local document silently.
- [ ] The final workplan outcome records the harden-or-retire decision and evidence.

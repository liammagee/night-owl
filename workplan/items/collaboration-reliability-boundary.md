---
id: "collaboration-reliability-boundary"
title: "Replace or retire the prototype collaboration surface"
status: "done"
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

## Implemented change

Chose retirement rather than hardening the positional-edit prototype. Removed
the collaboration server and client modules, cursor/demo indicators, normal
command registrations, main-process handlers, preload methods, and event
channels. NightOwl therefore opens no collaboration listener and exposes no
normal product affordance that could imply real-time editing is supported.

Added a deliberately non-networked retirement boundary and engineering note.
The boundary records the decision, preserves immutable local document state,
and rejects join, edit, reconnect, and mismatched-document attempts with
explicit machine-readable outcomes. Reintroduction now requires a convergent
document model, session and document identity, authenticated permissions,
reconnect resynchronization, conflict-preserving recovery, bounded resource
ownership, and hermetic two-client evidence.

## Acceptance criteria

- [x] The prototype cannot be enabled accidentally or represented as production-ready.
- [x] A two-client test covers simultaneous edits, reconnect, document mismatch, and clean shutdown.
- [x] Any retained collaboration transport has explicit session identity, permissions, and resynchronization behavior. No transport was retained.
- [x] Failure never overwrites a newer local document silently.
- [x] The final workplan outcome records the harden-or-retire decision and evidence.

## Verification

- All 122 Jest suites passed (1,324 tests), including the retired boundary,
  fixed preload capability surface, and structural absence checks. The required
  Electron contract now also checks for absent collaboration capabilities and
  commands; hosted macOS executes that coverage before merge.
- The hermetic two-client test attempts divergent edits concurrently, confirms
  each local content and version remain unchanged, exercises matching-document
  reconnect rejection and explicit document mismatch, and proves idempotent
  clean shutdown.
- `docs/development/COLLABORATION_BOUNDARY.md` records the retire decision and
  the complete protocol, security, recovery, lifecycle, and testing threshold
  for any future reintroduction.
- Local release CI passed 6/7 stages. The locked desktop prevented Electron
  from launching before test one; hosted macOS Electron remains the merge gate.

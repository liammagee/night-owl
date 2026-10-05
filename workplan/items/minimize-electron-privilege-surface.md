---
id: "minimize-electron-privilege-surface"
title: "Minimize Electron preload and remote privilege surface"
status: "done"
type: "security"
priority: "P2"
area: "security"
owner: "codex"
source: "systematic-review"
evidence: "opportunity"
created: "2026-08-07"
updated: "2026-08-08"
verification: "NightOwl runs with no unused @electron/remote enablement, a smaller typed preload API, sender validation for privileged IPC, and an explicit documented reason for every sandbox exception."
tags: ["electron", "ipc", "preload"]
depends_on: ["sanitize-rendered-markdown-and-navigation"]
---

## Context

The main window correctly enables context isolation and disables Node integration,
and `preload-ipc-guard.js` allowlists channels. However, the allowlist exposes a
very broad generic invoke surface covering roughly 249 main-process handlers,
including filesystem, Git, terminal, collaboration, server, and credential
operations. The renderer sandbox is disabled because preload imports local
modules, and `@electron/remote` is initialized/enabled even though no renderer
consumer was found in this review.

## Proposed change

Remove unused remote support, group preload methods by capability with input
schemas, validate sender/frame origin for privileged handlers, and investigate a
sandbox-compatible preload bundle. Keep the existing path guards and add
contract tests at the bridge boundary.

## Acceptance criteria

- [x] No unused remote module is initialized or packaged.
- [x] Privileged IPC rejects malformed payloads and unexpected senders.
- [x] Renderer code cannot invoke arbitrary allowlisted strings through a generic escape hatch.
- [x] Sandbox exceptions and residual risk are documented and tested.

## Outcome

- Removed `@electron/remote` from startup and the packaged dependency graph.
- Replaced the renderer-visible string dispatcher with frozen, fixed capability
  groups for files, Git, terminals, settings, collaboration, and other app
  services, with unsubscribe ownership for main-to-renderer events.
- Added shared preload/main payload validation plus main-frame and known-window
  sender enforcement for every declared handler and one-way signal.
- Added exact contract-coverage checks, migrated production consumers and test
  fixtures, and repaired three previously dead call sites exposed by the audit.
- Documented why the current preload remains unsandboxed, the residual risk, and
  the bundled-preload prerequisite for safely enabling Electron sandboxing.

## Verification

- `npm run ci:local:release` passed all 7 stages: 97 suites / 1,215 tests and
  10/10 required Electron workflows, including the real context-bridge contract.
- A fresh ARM64 app directory built with `npm run dist:dir -- --mac --arm64`.
- `NIGHTOWL_PACKAGED_APP=dist/mac-arm64/NightOwl.app npm run test:e2e:packaged`
  passed all 3 packaged workflows against the restricted bridge.

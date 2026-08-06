---
id: "restore-release-entitlements"
title: "Restore tracked macOS entitlements and clean-build preflight"
status: "review"
type: "release"
priority: "P1"
area: "packaging"
owner: "codex"
source: "test-failure"
evidence: "test-failure"
created: "2026-08-07"
updated: "2026-08-07"
verification: "npm run dist:check and the hardened-runtime code-quality guard pass from a fresh clone before electron-builder starts."
tags: ["build", "macos", "release"]
---

## Context

`package.json` references `build/entitlements.mac.plist` for both app and inherited
entitlements, but the file is not tracked. `npm run dist:check` fails both checks,
and the corresponding code-quality test fails. A local build can be made only by
creating an untracked temporary entitlement file, so the committed release input
is incomplete.

## Implemented change

Restored a minimal entitlement containing only the JIT exception required by
Chromium's V8 runtime and documented the security boundary. Distribution
readiness is now part of local CI release mode and remains the `predist` gate.
Signing identity and notarization credentials remain expected warnings outside
release CI. A signed packaged-app smoke test is still required before closure.

## Acceptance criteria

- [x] Entitlements are tracked and contain no capability that NightOwl does not use.
- [x] Clean-checkout `dist:check` passes apart from documented local signing warnings.
- [x] Release CI fails before packaging when a required input is absent.
- [ ] The packaged app is smoke-tested after signing/assembly.

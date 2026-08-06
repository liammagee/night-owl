---
id: "restore-release-entitlements"
title: "Restore tracked macOS entitlements and clean-build preflight"
status: "triaged"
type: "release"
priority: "P1"
area: "packaging"
owner: "unassigned"
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

## Proposed change

Restore the minimal reviewed entitlements file, document which capabilities
require each entitlement, and run distribution readiness in release CI from a
clean checkout. Treat signing identity and notarization credentials as expected
environmental warnings outside release CI.

## Acceptance criteria

- [ ] Entitlements are tracked and contain no capability that NightOwl does not use.
- [ ] Clean-checkout `dist:check` passes apart from documented local signing warnings.
- [ ] Release CI fails before packaging when a required input is absent.
- [ ] The packaged app is smoke-tested after signing/assembly.

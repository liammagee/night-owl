# Build and release chain

This is the executable path from a clean NightOwl checkout to tested local and
hosted artifacts. Run commands from the repository root.

## Prerequisites

- Node.js 20 or newer. Hosted workflows use Node 20.
- `npm ci` from the committed `package-lock.json` for a normal checkout.
- A desktop session for Electron E2E. Linux requires `DISPLAY` or
  `WAYLAND_DISPLAY` (typically through `xvfb-run`).
- Platform-native build tools for native dependencies and packaging.
- For signed macOS release artifacts, a Developer ID Application identity and
  one supported notarization credential set.

Linked worktrees may reuse a matching primary checkout's `node_modules`; see
[`LOCAL_CI.md`](LOCAL_CI.md). Release artifacts should still be produced from a
clean checkout with `npm ci`.

## Canonical inputs and generated outputs

| Input | Generated output | Command and commit rule |
| --- | --- | --- |
| `plugins/techne-presentations/src/MarkdownPreziApp.jsx` plus `.babelrc` | `plugins/techne-presentations/MarkdownPreziApp.js` | `npm run presentation:build`; commit source and generated runtime together. |
| `workplan/items/*.md` | `workplan/BOARD.md`, `workplan/board.json` | `npm run wp:render`; commit all three when item state changes. |
| `package.json` | `package-lock.json` | Use npm; commit both when dependency resolution changes. |
| Source and tracked release inputs | `dist/` | electron-builder output is ignored and never committed. |
| Performance fixture code | `test-results/performance/nightowl-performance-report.json` | `npm run benchmark:performance`; report is machine-specific and ignored. |

`lib/` and `vs/` are checked-in vendored browser runtimes. They are not rebuilt
by routine CI. `build/icon.*` and `build/entitlements.mac.plist` are tracked
release inputs, despite living under the otherwise ignored `build/` directory.

## Development build loop

Install and launch:

```bash
npm ci
npm run electron-dev
```

The `preelectron-dev` hook repairs native module signatures before Electron
starts. If Node/Electron ABI changes make native dependencies unusable, run:

```bash
npm run native:repair
```

That rebuilds `sqlite3`, `better-sqlite3`, and `node-pty` for Electron, then
repairs local signatures. Do not commit `node_modules`.

## Pull-request gate

Run the repository-owned gate before pushing:

```bash
npm run ci:local
```

It executes, in order:

1. Git whitespace checks over the worktree.
2. Static repository policy.
3. Workplan validation and generated board freshness.
4. Presentation generated-runtime freshness.
5. All Jest main, renderer, integration, and behavioral projects.
6. The required real-Electron workflow matrix.

Use focused commands while iterating, but the local gate is the branch-level
contract. The opt-in tracked pre-push hook is installed with
`npm run ci:hook:install`.

Pull requests and pushes to `main` independently run
`.github/workflows/electron-e2e.yml` on `macos-latest`. That job installs with
`npm ci`, runs the required source Electron matrix, builds an unpacked macOS app,
and runs the packaged Electron matrix.

## Performance changes

Performance is a separate, deliberate gate because repeated fresh launches and
large fixtures are slower and hardware-sensitive:

```bash
npm run benchmark:performance
```

The report includes the Git SHA, runtime and machine metadata, exact fixture
sizes, samples, p50/p95 results, correctness failures, warnings, and regressions.
See [`../performance-trace-runbook.md`](../performance-trace-runbook.md).

## Distribution preflight

For packaging or release changes, run:

```bash
npm run ci:local:release
```

This adds `scripts/check-distribution-readiness.js` to the full local gate. The
preflight verifies:

- product/app identifiers and electron-builder configuration;
- required macOS icon and entitlements inputs;
- hardened-runtime settings and the minimal JIT entitlement;
- the pinned tutor-core dependency and runtime storage contract; and
- signing/notarization availability (warnings by default).

Make credential checks mandatory when preparing a signed macOS release:

```bash
NIGHTOWL_REQUIRE_SIGNING_IDENTITY=1 npm run dist:check
NIGHTOWL_REQUIRE_NOTARIZATION_CREDS=1 npm run dist:check
```

Supported notarization sets are:

- `APPLE_API_KEY`, `APPLE_API_ISSUER`, `APPLE_API_KEY_ID`; or
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

Never commit signing identities, API keys, app-specific passwords, or `.env`.

## Unpacked package and packaged smoke

Build a macOS application directory without creating an installer:

```bash
# Apple Silicon
npm run dist:dir -- --mac --arm64

# Intel
npm run dist:dir -- --mac --x64
```

Then point the packaged suite at the app:

```bash
NIGHTOWL_PACKAGED_APP=dist/mac-arm64/NightOwl.app npm run test:e2e:packaged
```

Use `dist/mac/NightOwl.app` for the x64 output. The packaged suite verifies:

- fixed preload capabilities and shared UI/resource state;
- the same content-security policy in preview and presentation; and
- tutor-core database/log storage in writable user data, outside the bundle and
  `app.asar`.

This step catches errors that source-mode Electron cannot reproduce.

## Distributable artifacts

Create local artifacts without publishing:

```bash
npm run dist
```

The `predist` hook runs `dist:check`, which includes presentation freshness and
distribution readiness. Configured targets are:

| Platform | Targets |
| --- | --- |
| macOS x64 and arm64 | DMG and ZIP |
| Windows x64 | NSIS installer |
| Linux x64 | AppImage and DEB |

Artifacts are written below `dist/` and remain untracked.

## Hosted release

`.github/workflows/release.yml` runs on a `v*` tag or manual dispatch. Its build
matrix uses macOS, Ubuntu, and Windows, installs with `npm ci`, runs `npm run
dist`, and uploads platform artifacts. Tag-triggered runs then create the GitHub
release from those artifacts.

Before creating a release tag:

1. Confirm `git status --short` is clean and the intended commit is on `main`.
2. Run `npm run ci:local:release`.
3. Run the relevant unpacked build and `test:e2e:packaged` locally or verify the
   same hosted main-branch job passed for that commit.
4. Confirm signing/notarization credentials are available for macOS and any
   platform-specific credentials required by the release environment.
5. Confirm `package.json` version and tag agree.
6. Tag the verified commit and monitor every matrix artifact before announcing
   the release.

The release workflow can build unsigned artifacts if signing credentials are
absent. A successful build is therefore not, by itself, evidence that macOS
artifacts are signed and notarized.

## Clean-build troubleshooting

- Stale presentation runtime: run `npm run presentation:build` and commit both
  presentation files.
- Workplan freshness failure: edit the authored item, then run `npm run
  wp:render`; do not edit generated board files directly.
- Native module ABI/signature error: run `npm run native:repair` with the same
  Node/Electron dependency tree.
- Linked-worktree dependency rejection: use a checkout whose lockfile matches or
  set `NIGHTOWL_NODE_MODULES` to a verified matching installation.
- Packaged tutor failure: inspect the reported data/log paths; no writable path
  may resolve inside `NightOwl.app` or `app.asar`.
- Local macOS warnings: use the `NIGHTOWL_REQUIRE_*` flags to distinguish an
  intentionally unsigned developer build from a release credential failure.

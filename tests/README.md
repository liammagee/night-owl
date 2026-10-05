# NightOwl test suites

NightOwl separates fast policy tests from real source and packaged Electron
workflows. Use Node.js 20 or newer and install the committed dependency tree with
`npm ci` in a normal checkout.

## Jest projects

`jest.config.js` defines four projects:

| Project | Location | Boundary |
| --- | --- | --- |
| Main | `tests/unit/main/` | Node services, IPC registration/contracts, packaging and tooling. |
| Renderer | `tests/unit/renderer/` | Browser modules and DOM behavior in jsdom. |
| Integration | `tests/integration/` | Filesystem and multi-module workflows. |
| Behavioral | `tests/behavioral/` | Cross-feature product behavior. |

Run all Jest projects:

```bash
npm test -- --runInBand
```

Focused alternatives remain available:

```bash
npm run test:unit
npm run test:integration
npm test -- --runInBand tests/unit/renderer/structured-record-schema.test.js
```

## Electron suites

All maintained Electron tests use Playwright's `_electron` launcher and isolated
temporary user-data profiles.

| Layer | Command | Purpose |
| --- | --- | --- |
| Required source | `npm run test:e2e` | Release-critical main/preload/renderer workflows. |
| Optional source | `npm run test:e2e:optional` | Slower theme and accessibility diagnostics. |
| Performance | `npm run benchmark:performance` | Repeated readiness samples and p50/p95 budgets. |
| Packaged | `NIGHTOWL_PACKAGED_APP=/path/to/NightOwl.app npm run test:e2e:packaged` | Bundle-only security, state/resource, and tutor storage checks. |

The required source matrix covers controller startup, fixed IPC capabilities,
resource disposal, latest-wins file/preview behavior, error recovery, canonical
UI state, schema-driven records, content security, accessibility, presentation
recovery, and complete-slide geometry.

Electron tests require a desktop session. Linux must provide `DISPLAY` or
`WAYLAND_DISPLAY`; use `xvfb-run` in headless CI. The required reporter fails if
tests are silently skipped and prints planned/executed/passed/failed/skipped
counts.

## Repository gate

Before pushing a branch, run:

```bash
npm run ci:local
```

For packaging or release changes:

```bash
npm run ci:local:release
```

These commands also verify static policy, workplan views, generated presentation
assets, and distribution inputs. See
[`docs/development/LOCAL_CI.md`](../docs/development/LOCAL_CI.md) and
[`docs/development/BUILD_AND_RELEASE.md`](../docs/development/BUILD_AND_RELEASE.md).

## Test-writing rules

- Put deterministic policy in a browser/CommonJS-compatible module and test it
  without Electron where possible.
- Use injected clocks, watchers, IPC adapters, and filesystem roots rather than
  ambient machine state.
- Use semantic readiness or visible state in Electron tests; do not add fixed
  sleeps.
- Add release-critical user workflows to `tests/e2e/required/`; keep expensive
  or hardware-sensitive probes explicit.
- Use temporary directories and isolated profiles. Never write tests against a
  developer's actual settings, workspace, database, or credentials.
- When changing canonical JSX, workplan items, or other generated contracts,
  update and verify their generated outputs in the same change.

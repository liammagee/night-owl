# Local CI

NightOwl has a repository-owned CI runner for checks that must pass before a
branch is pushed:

```bash
npm run ci:local
```

The default pipeline runs:

1. `git diff --check HEAD` across staged and unstaged tracked changes.
2. Static repository policy checks.
3. Workplan validation and generated-view freshness checks.
4. All Jest unit, integration, and behavioral projects in one process.
5. The required Playwright Electron smoke matrix.

Run release preflight as an additional stage when changing packaging:

```bash
npm run ci:local:release
```

Release mode validates committed packaging inputs and warns when local signing
or notarization credentials are absent. It does not build or sign distributable
artifacts.

## Worktrees and dependencies

In a normal checkout, install dependencies with `npm ci`. A linked Git worktree
may reuse `node_modules` from its primary checkout. The runner only does this
when both checkouts have identical `package-lock.json` files, then supplies that
directory through `NODE_PATH` so tests resolve packages normally.

To use another installation explicitly:

```bash
NIGHTOWL_NODE_MODULES=/absolute/path/to/node_modules npm run ci:local
```

The runner fails early if Jest is absent or the shared lockfile differs. It does
not install packages or mutate either checkout.

## Capability-aware tests

The runner probes whether its environment can bind a loopback server. If local
networking is blocked by a sandbox, the one citation-capture server test is
reported as skipped while all pure parsing tests still run. Set
`NIGHTOWL_TEST_LOOPBACK=1` to require the server test or `0` to disable it
explicitly. A failed assertion is never converted into a capability skip.

The current file-watcher unit test uses an injected watcher and fake timers, so
it tests event routing and resource cleanup without consuming an operating-system
watch descriptor.

The Electron stage launches the real main process and renderer with an isolated
temporary user-data directory. On macOS it uses the normal desktop session and
does not inspect X11's `DISPLAY`. Linux runners must provide `DISPLAY` or
`WAYLAND_DISPLAY` (for example with `xvfb-run`); the required suite fails instead
of silently skipping when neither is available. Its final summary distinguishes
planned, executed, passed, failed, and skipped tests.

Run only the required matrix with:

```bash
npm run test:e2e
```

Slower accessibility, performance, and theme diagnostics remain explicit:

```bash
npm run test:e2e:optional
```

## Optional pre-push hook

Enable the tracked hook for this clone:

```bash
npm run ci:hook:install
```

This sets the repository-local `core.hooksPath` to `.githooks`; every push then
runs the default local pipeline. The installer refuses to replace an existing
custom hooks path. Disable it with:

```bash
npm run ci:hook:uninstall
```

The hook is opt-in because Git does not activate tracked hooks automatically.

## Scope boundary

The required matrix is deliberately short: rapid file switching, committed
preview readiness, presentation-load recovery, and complete-slide geometry. It
does not replace the optional accessibility and performance diagnostics or the
distribution-readiness stage. Legacy browser-style specs remain quarantined
until they are rewritten against the shared Electron fixture.

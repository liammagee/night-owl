# Resource lifecycle ownership

NightOwl treats every timer, listener, observer, filesystem watcher, terminal
process, server, and similar handle as an owned resource. The owner must be able
to release it deterministically; garbage collection is not a teardown strategy.

## Shared registry

`services/resourceLifecycle.js` provides `createRegistry({ name, scope })` in
both the main and renderer processes. A registry owns resources registered with:

- `interval()` and `timeout()` for timers;
- `listen()` for DOM event listeners;
- `observe()` for `MutationObserver`, `ResizeObserver`, and similar observers;
- `track()` or `add()` for watchers, PTYs, servers, subscriptions, and custom
  disposers.

Calling `dispose()` releases resources in reverse registration order. Disposal
is idempotent, and completed one-shot timers remove themselves from the active
resource count.

Renderer features receive a scoped registry and the same helpers through their
feature host. Feature disable and failed initialization both dispose that
registry. A feature's `destroy(host)` hook should undo feature state and DOM
that is not represented by an owned resource; it does not need to repeat the
registry's timer, listener, or observer cleanup.

## Current process owners

| Resource | Owner | Lifetime | Teardown |
| --- | --- | --- | --- |
| Feature timers/listeners/observers | Feature registry | Feature mount | `disableFeature()` / `disposeAllFeatures()` |
| Research-feed poll/startup/prune timers | `feedHandlers` registry | App process | `stopPollLoop()` / IPC shutdown cleanup |
| Current-file watcher and debounce timer | `fileHandlers` registration | Active IPC registration | File replacement / IPC shutdown cleanup |
| Integrated terminal PTYs or child processes | `terminalHandlers` session map | Terminal session | `terminal-kill` / IPC shutdown cleanup |
| Citation capture bridge | `main.js` | App process | `before-quit` |
| Electron `nativeTheme` listener | `main.js` | App process | Electron process exit |
| Feature loader script/style caches | Feature loader | Renderer window | Renderer window destruction |

The last two entries are intentionally app-lifetime resources. They do not
accumulate across feature, mode, file, or workspace transitions and are released
when their owning Electron process or renderer window exits.

## Diagnostics

In a development console, inspect both processes with:

```js
await window.NightOwlPerformance.getResourceDiagnostics()
```

The response contains renderer registry totals plus main-process feed, file, and
terminal ownership counts. A repeated mount/unmount or workspace-switch test
should compare the aggregate baseline before and after the cycle, not assume
that all app-lifetime counts are zero.

When adding a dynamic resource, choose its owner before creating it. If no
existing owner matches its lifetime, create a scoped registry or an explicit,
idempotent module `cleanup()` contract and include the count in diagnostics.

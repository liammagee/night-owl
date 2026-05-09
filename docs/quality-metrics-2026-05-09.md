# NightOwl Quality Metrics

Measured on 2026-05-09 against baseline commit `1557354`, the last commit before the current hardening/performance pass.

Regenerate with:

```bash
node scripts/quality-metrics.js 1557354 WORKTREE
```

| Metric | Baseline | Current | Delta |
| --- | ---: | ---: | ---: |
| Duplicate top-level renderer functions | 4 | 0 | -4 |
| Synchronous file-tree tag hydration awaits | 2 | 0 | -2 |
| Synchronous preview bibliography awaits | 1 | 0 | -1 |
| File-tree fragment creation sites | 0 | 2 | +2 |
| File-tree fragment replacement sites | 0 | 2 | +2 |
| Touch gesture unconditional `console.log` calls | 42 | 0 | -42 |
| Tracked `.DS_Store` files | 1 | 0 | -1 |
| Renderer/unit/integration test files | 74 | 78 | +4 |
| Static test case declarations | 1347 | 1363 | +16 |

## Interpretation

- Initial file-tree painting now has 0 synchronous tag-hydration awaits in the render path, down from 2. Tag metadata is hydrated after paint and capped at 500 visible Markdown files per pass.
- Markdown preview rendering now has 0 synchronous bibliography-refresh awaits in the render path, down from 1. Bibliography changes rerender after the deferred refresh only when the active file and content still match.
- Touch gesture runtime logging is now opt-in: 0 unconditional `console.log` calls, down from 42. Enable with `localStorage.setItem('nightowl.debugTouchGestures', 'true')` when diagnosing mobile presentation issues.
- GPU diagnostics and Chromium trace capture are available through the performance IPC handlers.
- Full Jest currently passes with 63 suites and 1062 tests.

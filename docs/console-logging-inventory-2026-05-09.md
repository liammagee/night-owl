# Console Logging Inventory

Snapshot command:

```bash
for f in ipc/*.js orchestrator/modules/*.js orchestrator/renderer.js; do
  c=$(rg -c "console\\.(log|warn|error|debug)" "$f" 2>/dev/null || true)
  if [ -n "$c" ] && [ "$c" != "0" ]; then printf "%4s %s\n" "$c" "$f"; fi
done | sort -nr | head -n 40
```

Highest-volume files in the current snapshot:

| Count | File |
| ---: | --- |
| 240 | `orchestrator/renderer.js` |
| 172 | `ipc/fileHandlers.js` |
| 102 | `orchestrator/modules/citationManager.js` |
| 99 | `ipc/exportHandlers.js` |
| 77 | `orchestrator/modules/previewZoom.js` |
| 67 | `ipc/citationHandlers.js` |

Changes made in this pass:

- Added `ipc/logging.js` with `NIGHTOWL_DEBUG_LOGS` opt-in namespaces.
- Moved noisy git repo lookup messages behind `NIGHTOWL_DEBUG_LOGS=GitHandlers`.
- Moved global search success-path messages behind `NIGHTOWL_DEBUG_LOGS=SearchHandlers`.

Next logging candidates:

- `ipc/fileHandlers.js`: keep mutation failures visible, move routine tree/file scan success logs behind debug.
- `ipc/exportHandlers.js`: keep export failures visible, gate step-by-step pandoc/static-file logs.
- `orchestrator/renderer.js`: split remaining concerns first, then gate logs at module boundaries.

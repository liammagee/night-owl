---
name: research-feed
description: Manage and query the NightOwl research-feed plugin through its MCP tools — list/add/remove/enable sources (arxiv, reddit, bluesky, mastodon, googleSearch, googleScholar, chromeTabs), import open Chrome tabs (macOS), search adapters one-shot, browse cached items by relevance, save to citations, dismiss noise, prune. Use when the user wants to capture, organize, surface, or triage research material from these sources, or asks about "the feed" / "what I'm tracking" / "open tabs" / "recent papers" / "save this to citations".
---

This skill drives the `research-feed` MCP server (configured in `.mcp.json`). It exposes a small SQLite store of items pulled from research sources, plus an on-demand Chrome-tabs importer. Use the MCP tools directly; this skill encodes the workflow patterns and gotchas that aren't obvious from the tool descriptions alone.

## When to invoke vs other approaches

| User intent | Reach for |
|---|---|
| "Find recent papers on X" (one-shot, exploratory) | `feed_search` — does NOT persist |
| "Start tracking X going forward" | `feed_add_source` — sets up polling in the IDE |
| "What am I tracking?" | `feed_list_sources` |
| "What's new / what's relevant?" | `feed_list_items` (sort by `score` if user has IDE open scoring items, else `recent`) |
| "Capture my open Chrome tabs" | `feed_import_chrome_tabs` (macOS only) |
| "Save this", "keep this one" | `feed_save_item` |
| "Not interested", "hide this" | `feed_dismiss_item` |
| "Clean up old noise" | `feed_prune` |

If the user wants the rich panel UI (drag, click, AI relevance gating against current draft), tell them to open the IDE — `npm run dev`, then `Cmd+,` → 🧩 Plugins → toggle `techne-research-feed` → click the floating ⚲ button. The MCP tools cover the same data but without the AI gate.

## Storage gotcha — read this first

By default the IDE writes to `~/Library/Application Support/NightOwl/research-feed/` while the MCP server writes to `~/.machinespirits-research-feed-cli/research-feed/`. **Items added through MCP do not appear in the IDE panel by default**, and vice versa.

If the user asks "why isn't this showing up in the panel?" — that's the cause. The fix is to set `RF_USER_DATA` in `.mcp.json` to point at NightOwl's path:

```json
"env": { "RF_USER_DATA": "${HOME}/Library/Application Support/NightOwl" }
```

Don't make this change unprompted — it's reversible but requires a Claude Code restart to take effect.

## Recipes

### Capture open Chrome tabs

```
feed_import_chrome_tabs (no args, or {appName: "Brave Browser"} etc.)
```

Returns `{totalTabs, droppedByBlocklist, kept, newlyInserted}`. Note this surface has no AI gate — it relies on the deterministic blocklist alone (chrome://, gmail, calendar, social DMs, banking, x.com/messages, etc.). The IDE's 📑 button does add an AI relevance gate against the current draft.

After import, offer to triage: `feed_list_items({sourceId: "chrome-tabs", sort: "recent", limit: 20})` and walk the user through save/dismiss decisions.

First call may trigger a macOS Automation prompt for whichever app is controlling — usually the terminal Claude Code is running in. If denied, the tool returns a friendly error explaining how to grant it.

### Find recent research without subscribing

For ad-hoc lookups where the user doesn't want a polling source:

```
feed_search({type: "arxiv", config: {category: "cs.LO", maxResults: 10}})
feed_search({type: "bluesky", config: {query: "phenomenology", lang: "en", limit: 20}})
feed_search({type: "reddit", config: {subreddits: ["philosophy"], sort: "new", limit: 15}})
```

Results come back inline; nothing is written. Show titles + authors + URLs; offer to subscribe via `feed_add_source` if anything looks like a recurring interest.

### Start tracking a new topic

```
feed_add_source({
  id: "arxiv-cogsci",
  type: "arxiv",
  config: {category: "cs.AI", query: "embodied cognition", maxResults: 20}
})
```

Sensible defaults per type:
- **arxiv**: `{category: "cs.AI" | "cs.LG" | "cs.LO" | ..., query?: string, maxResults: 20}` — categories are arxiv subject codes
- **reddit**: `{subreddits: [...], sort: "new", limit: 20}` — User-Agent is set internally
- **bluesky**: `{query: "...", lang: "en", limit: 20}`
- **mastodon**: `{instances: ["mastodon.social", "scholar.social"], tags: ["..."], limit: 20}`
- **googleSearch**: `{query: "...", cx: "<user's CX>", dateRestrict: "w1"}` — costs ~$5/1000, requires API key in IDE
- **googleScholar**: `{query: "..."}` — paid SerpAPI, off by default

Default poll interval is 15 minutes. Pick descriptive IDs: `arxiv-philosophy-of-mind` not `src1`.

### Triage the feed

```
feed_list_items({sort: "score", limit: 20, dismissed: false})
```

Sort by `score` if items have AI scores from the IDE; sort by `recent` otherwise (MCP-added items have no scores). Show a numbered list. For items the user is unsure about, fetch detail with `feed_get_item({id: N})` before deciding. Batch save/dismiss in one go: e.g. user says "save 1, 3, 7, dismiss the rest" → fire the calls in parallel.

### Inspect or debug a source

If a source shows errors:
- `feed_list_sources` — find `lastError` for the source
- `feed_search` with the same `type` and `config` — reproduce out-of-band; the error message will be more direct than what's stored
- `feed_set_enabled({id, enabled: false})` to stop the poll loop from retrying while you investigate

For Chrome tabs returning unexpectedly few items, the deterministic blocklist may be hiding work tabs. Ask the user if they have research on, e.g., `github.com/notifications`, then suggest `extraBlocklist: []` plus a custom set, or `blocklist: [...]` to replace entirely.

## After-action behavior

- After `feed_import_chrome_tabs` or `feed_fetch`, proactively ask if the user wants to triage the new items. Don't just dump the count.
- After `feed_save_item`, mention that the IDE panel saves into the citations DB but the MCP path only marks `saved=true` in the feed store (citations integration is IDE-only). If the user expected a citation entry, they'll need to do that step from the panel.
- For destructive actions (`feed_remove_source`, `feed_prune`), confirm scope before firing. Removing a source deletes its cached items too.

## Quick reference — the 12 tools

```
feed_list_sources, feed_add_source, feed_remove_source, feed_set_enabled
feed_fetch, feed_search
feed_list_items, feed_get_item, feed_save_item, feed_dismiss_item, feed_prune
feed_import_chrome_tabs
```

For exact schemas, the MCP server publishes them on `tools/list` — Claude Code already has them loaded, no need to re-fetch.

# The Babel Maze — Library Gamification Redesign

This document proposes a Borges-inspired, MUD/text-adventure reframe of the Library section: a **maze you improve by building a coherent knowledge base**.

The tone target is **whimsical but adult**—literary, melancholic, nostalgic, and quietly magical realist. Think: the *Library of Babel*’s infinite shelves, the ache of almost-remembered catalogs, and the strange comfort of recurring corridors.

---

## 1) What We Have Today (Quick Audit)

### Current implementation (key pieces)
- `orchestrator/modules/gamification/world/LibraryExplorerView.js` mounts into `#library-mode-root` and renders a “Library Atlas” UI.
- It embeds a `UnifiedNetworkVisualization` graph as a “constellation” view, derived from the scanned markdown library and internal links.
- It also has an AI persona (“Ash”) for:
  - link hypotheses (“corridors”)
  - chat hints and narrative snippets
  - “maze rebalance” plans (separate world-layout concept)
- It can write links into notes via IPC: `library.append-internal-link` (`ipc/fileHandlers.js`).
- A parallel “world state” exists (`LibraryWorldEngine`, `DataPersistence`) with anchors/rooms/corridors/lore fragments (stored in localStorage).

### Why it “never worked well” (likely failure modes)
1) **Two overlapping worlds**: one graph from real notes/links, another “world state” of rooms/anchors/corridors. They don’t reliably map to each other, so progression feels abstract and disconnected from the actual library.
2) **Feedback loop breaks**: inserting a link updates the file on disk, but the graph view may not refresh immediately; users can’t tell if the action “worked”.
3) **Editor sync risk**: if the source note is open in Monaco and the game appends a link on disk, the in-editor buffer may not reflect it (and later saves could overwrite it).
4) **No strong onboarding**: the interface is visually rich but doesn’t teach a stable “game loop”.
5) **Reward surface is thin**: the current system gestures at lore/resources, but doesn’t yet reward *coherence work* in a way that feels meaningful.

---

## 2) Design Goals

### Primary goal
Make building a **dense, interlinked, coherent** knowledge base feel like **exploring and tending a living labyrinth**.

### Secondary goals
- Keep actions **productive** (every “game move” improves the library).
- Make the loop **fast** (small wins in <30 seconds) and **deep** (long arcs across weeks).
- Offer **AI as a diegetic companion**: a librarian/archivist/cartographer who speaks in Borges-adjacent magical realism, but still produces actionable suggestions.
- Provide **deterministic fallback** when AI is unavailable.

---

## 3) The Core Loop (Explore → Connect → Distill → Return)

1) **Explore**: roam rooms (notes) and corridors (links); discover “orphan stacks” (unlinked notes) and “echoes” (repeated concepts).
2) **Connect**: forge corridors by adding meaningful links; repair broken paths; create hub notes; merge duplicates.
3) **Distill**: add short abstracts, tags, and “catalog cards” (front-matter or inline metadata) so rooms are searchable and readable.
4) **Return**: the maze reconfigures—new districts appear, fog-of-war recedes, and the map becomes more legible because the library is more coherent.

Rewards should track *quality*: fewer orphan notes, healthier backlink ratios, more thematic clustering, clearer summaries.

---

## 4) World Model (How Notes Become a Maze)

### Rooms
- **A note file is a room** (optionally: headings become sub-rooms).
- **Subfolders are districts** (wings, stacks, annexes).
- **Tags are “sigils”** that color rooms and allow “teleport”/search spells.

### Corridors
- An internal link `[[target]]` is a corridor.
- Optional: `[[target#heading]]` becomes a corridor to a sub-room.

### Fog-of-war
- The player sees only nearby rooms until they “catalog” an area (e.g., add summaries/tags).

### Procedural “Babel” expansion
- Allow “empty rooms” that represent *unwritten notes*:
  - discovered via AI quests (“a missing corridor is implied here”)
  - or via graph gaps (concept appears in many notes but has no dedicated node)
  - creating the note “solidifies” the room.

### Stable coordinates
Map placement must feel stable:
- Derive a deterministic seed from file path + link neighborhood.
- Use a layout algorithm that doesn’t reshuffle the whole map on small edits.

---

## 5) MUD/Text-Adventure Interface (The Right UI for Borges)

### Commands (first slice)
- `look` — describe current room, exits, notable artifacts (links, tags, citations).
- `go <dir>` / `north|south|east|west` — traverse.
- `map` — show local map, fog-of-war edges, discovered districts.
- `open` — open the note in the editor.
- `examine <thing>` — read excerpt, summary, backlinks, tags.
- `link <target>` — create corridor (with preview + confirm).
- `quest` — list current quests (coherence tasks).
- `catalog` — add/update abstract + tags (AI-assisted).
- `recall <sigil|text>` — teleport/search.

### Presentation
- Split view: **Map panel** (grid/hex) + **Text log** + **Command input**.
- Optional “constellation” view remains as a secondary visualization, not the primary game.

---

## 6) AI as Diegetic Systems

### AI roles
- **Ash (Cartographer)**: suggests corridors and local navigation.
- **The Archivist (Quest-giver)**: proposes meaningful coherence tasks.
- **The Cataloger (Summarizer)**: writes short abstracts and tags.

### AI outputs should be structured
Use strict JSON envelopes for:
- link proposals (with rationales + confidence)
- quest proposals (objective, why it matters, acceptance criteria)
- room descriptions (tone + “facts” fields)

### Caching + fallbacks
- Cache per-room AI outputs keyed by file hash.
- If AI is off: generate quests heuristically (orphans, low backlinks, missing abstracts).

---

## 7) Rewards That Track Coherence (Not Just Activity)

### Metrics worth rewarding
- **Orphan reduction** (notes with 0 inbound links).
- **Bidirectional linkage** (creating backlinks or hub improvements).
- **Tag hygiene** (consistent vocab; merging synonyms).
- **Abstract coverage** (notes with missing 1–3 sentence summaries).
- **“Thread” completion** (a chain of linked notes that resolves a question).

### Rewards that feel Borges-like
- *Catalog Sigils*: minted for coherence work (links + summaries).
- *Keys*: unlock “district gates” (special search/teleport filters).
- *Lore Fragments*: melancholic micro-prose unlocked at milestones.

---

## 8) Implementation Roadmap (High-Level)

### Phase 0 — Reliability fixes (make today’s features trustworthy)
- Refresh graph view after writing links.
- Protect against editor-buffer mismatch after external file writes.
- Ensure Library + Network scan subfolders consistently (already in progress elsewhere).

### Phase 1 — Data layer
- A single canonical **LibraryGraph**:
  - nodes: notes (+ optional headings)
  - edges: internal links (+ direction metadata)
  - derived metrics: orphans, hubs, clusters

### Phase 2 — Game engine
- Command parser + state machine:
  - current room, discovered set, inventory, active quests
- Deterministic map placement + fog-of-war.

### Phase 3 — UI
- New `LibraryGameView`:
  - map pane + terminal pane + quest pane
  - keyboard-first navigation

### Phase 4 — AI integration
- Quest generator + corridor suggestions + descriptive prose.
- Guardrails: structured outputs + caching + rate limits.

### Phase 5 — Rewards + progression
- Achievements based on coherence metrics.
- Unlock cosmetics (themes, map styles) and tools (filters, teleports).

### Phase 6 — Polish
- Onboarding sequence (first 2 minutes).
- Audio/typography refinements; “Swiss grid” aesthetic; subtle textures.

---

## 9) Open Questions (Worth Deciding Early)
- Should a “room” be a file only, or file + headings?
- Preferred internal link syntax support (`[[path]]`, `[[path#heading]]`, aliases).
- Where should the app write new links (end of file vs “Links” section vs cursor)?
- What’s the canonical location for metadata (front-matter vs inline “catalog card”)?
- How deterministic should the map be vs “living reconfiguration”?

---

## 10) Detailed TODO (Milestone Checklist)

### A. Foundations
- [ ] Decide room granularity: `file` vs `file+headings` (and how to address rooms).
- [ ] Define canonical node ids (relative path, case rules, extension stripping rules).
- [ ] Standardize internal link grammar (aliases, heading targets, relative links).
- [ ] Add/confirm a single “library root” and verify subfolder scanning is consistent across Library + Network.

### B. LibraryGraph (single source of truth)
- [ ] Create `orchestrator/modules/library/LibraryGraph.js` (or similar) with:
  - node list (notes, optional headings)
  - edges (internal links; typed edges: reference / hierarchy / contains)
  - derived metrics (orphans, hubs, clusters, reciprocity)
- [ ] Add incremental rebuild strategy:
  - full scan on workingDirectory change
  - targeted updates on file save / file change events
- [ ] Add cache keyed by file path + mtime/hash so large libraries stay fast.
- [ ] Expose a small API for other modules:
  - `getNode(id)`, `getNeighbors(id)`, `getOrphans()`, `getSuggestedCorridors(id)`

### C. Safe write-paths (make corridor inscription trustworthy)
- [ ] Decide where links get inserted:
  - “Links” section (preferred) OR
  - inline at cursor OR
  - end-of-file fallback
- [ ] Implement a **single link insertion function** used by UI + game:
  - checks duplicates
  - respects alias labels
  - avoids overwriting editor buffer
- [ ] Add “preview + confirm” for any file write made from the game.
- [ ] After link insertion, refresh:
  - open editor buffer (if affected)
  - `UnifiedNetworkVisualization` / constellation snapshot
  - LibraryGraph metrics + quest progress

### D. Game engine (MUD core)
- [ ] Create `BabelGameEngine` with persisted state:
  - current room id
  - discovered rooms (fog-of-war)
  - inventory (keys/sigils)
  - active quests
  - narrative log
- [ ] Implement command parser:
  - tokenization + aliases (`n`, `north`, `go north`)
  - error messages that stay in tone but remain actionable
- [ ] Implement first command set:
  - `look`, `map`, `go`, `open`, `examine`, `link`, `quest`, `help`
- [ ] Hook engine actions into actual app actions:
  - open file in editor
  - insert link
  - create new note from “empty room”

### E. Map generation (maze that feels stable)
- [ ] Choose representation: grid vs hex (Borges-friendly: hex).
- [ ] Implement deterministic placement:
  - derive seed from path + neighborhood
  - local relaxation to reduce overlaps
  - preserve coordinates across small edits
- [ ] Add fog-of-war reveal rules:
  - reveal current + neighbors
  - reveal more when a note gets summarized/tagged/linked
- [ ] Support districts:
  - folder boundaries
  - tag constellations
  - “gates” unlocked by coherence metrics

### F. Quests (coherence as gameplay)
- [ ] Define quest types (non-AI heuristics first):
  - fix orphan note
  - add missing abstract
  - create backlink for a hub
  - consolidate duplicates
  - connect two clusters with a “bridge note”
- [ ] Implement quest scoring + completion criteria (objective, measurable).
- [ ] Add daily/weekly quest rotation and “streak” flavoring (melancholic, not chirpy).

### G. AI integration (Ash, Archivist, Cataloger)
- [ ] Add strict JSON prompt templates:
  - corridor proposals (3 max, each with rationale + confidence)
  - quest proposals (3–5, each with acceptance criteria)
  - room description (tone + factual fields)
- [ ] Add caching keyed by content hash so AI doesn’t re-run constantly.
- [ ] Add rate limiting + “AI offline” fallbacks.
- [ ] Add a “voice bible” (short style guide) for Borges-like melancholy without parody.

### H. UI (Swiss grid + terminal + map)
- [ ] Build a dedicated Library Game layout:
  - map pane with grid background
  - terminal pane (log + input)
  - quest pane (checklist + rewards)
- [ ] Keyboard-first UX:
  - up/down history in command input
  - tab-complete commands + room names
- [ ] Visual polish:
  - techne grid + trash-polka accents
  - subtle “paper/noise” texture, high contrast typography

### I. Rewards & progression
- [ ] Rebalance rewards around coherence metrics:
  - Sigils for links + summaries
  - Keys for restoring structure (removing orphans, adding hubs)
  - Lore fragments for meaningful milestones
- [ ] Add achievements that reflect scholarship:
  - “The Indexer”, “Thread Weaver”, “Palimpsest”, “Unorphaned”, “Cartographer”

### J. Testing + observability
- [ ] Unit tests:
  - link parsing + resolution
  - command parser
  - quest completion rules
- [ ] Smoke test script that builds a small fixture library and validates graph + map stability.
- [ ] Logging hooks for “game move” events (so failures are diagnosable).


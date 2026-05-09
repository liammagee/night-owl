#!/usr/bin/env node
// === Research Feed MCP server ===
// Exposes the same feedStore + adapters used by the IDE plugin and the
// feed-cli script as MCP tools, so Claude Code (or any MCP-aware client)
// can call them directly during a conversation.
//
// Transport: stdio, line-delimited JSON-RPC 2.0 (per MCP spec).
// Methods supported: initialize, notifications/initialized, tools/list, tools/call.
// Storage: defaults to ~/.machinespirits-research-feed-cli/ — same dir the CLI
// uses, so anything Claude adds is visible from `npm run feed-cli` and vice
// versa. Override with RF_USER_DATA.
// Credentials (Google / SerpAPI): env vars only, since safeStorage requires
// Electron. Set RF_GOOGLE_API_KEY, RF_GOOGLE_CX, RF_SERPAPI_KEY in .mcp.json.

// MCP servers may emit ONLY JSON-RPC messages on stdout. Redirect console.log
// and console.warn to stderr before requiring any module — feedStore and the
// adapters log progress via console.log, and a stray line corrupts the
// JSON-RPC stream and disconnects the client.
const util = require('util');
const _toStderr = (...args) => {
    const msg = args.map((a) => (typeof a === 'string' ? a : util.inspect(a))).join(' ');
    process.stderr.write(msg + '\n');
};
console.log = _toStderr;
console.info = _toStderr;
console.warn = _toStderr;
// console.error already targets stderr, leave it.

const path = require('path');
const os = require('os');
const fs = require('fs');
const readline = require('readline');

const { getFeedStore } = require('../services/feedStore');

const ADAPTERS = {
    arxiv: require('../services/feedSources/arxiv'),
    reddit: require('../services/feedSources/reddit'),
    bluesky: require('../services/feedSources/bluesky'),
    mastodon: require('../services/feedSources/mastodon'),
    googleSearch: require('../services/feedSources/googleSearch'),
    googleScholar: require('../services/feedSources/googleScholar'),
    chromeTabs: require('../services/feedSources/chromeTabs')
};

const CREDS_FOR_TYPE = {
    googleSearch: () => ({ apiKey: process.env.RF_GOOGLE_API_KEY, cx: process.env.RF_GOOGLE_CX }),
    googleScholar: () => ({ apiKey: process.env.RF_SERPAPI_KEY })
};

// Adapter types that should be skipped by the bulk `feed_fetch` loop. They
// require an explicit dedicated tool (e.g. feed_import_chrome_tabs) because
// they read live local state rather than a polling endpoint.
const ON_DEMAND_TYPES = new Set(['chromeTabs']);

const CHROME_TABS_SOURCE_ID = 'chrome-tabs';

const SERVER_INFO = { name: 'research-feed', version: '0.1.0' };
const PROTOCOL_VERSION = '2024-11-05';

// ---- store lifecycle ------------------------------------------------------

let storeRef = null;
async function ensureStore() {
    if (storeRef) return storeRef;
    const userData = process.env.RF_USER_DATA ||
        path.join(os.homedir(), '.machinespirits-research-feed-cli');
    if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true });
    const s = getFeedStore();
    if (!s.isInitialized) await s.initialize(userData);
    storeRef = s;
    return s;
}

// ---- tool catalogue -------------------------------------------------------

const TOOLS = [
    {
        name: 'feed_list_sources',
        description: 'List configured research feed sources (arxiv, reddit, bluesky, mastodon, googleSearch, googleScholar) with their enable state, polling interval, and last-fetch status. Returns JSON. Use this first when the user asks "what am I tracking?".',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false }
    },
    {
        name: 'feed_add_source',
        description: 'Add or update a research feed source. Use when the user asks to start tracking a new topic on one of the supported platforms. Config shape per type — arxiv: {category?, query?, maxResults?}; reddit: {subreddits: string[], sort?, limit?, query?}; bluesky: {query, lang?, limit?, sort?}; mastodon: {instances: string[], tags?: string[], query?, limit?}; googleSearch: {query, cx, dateRestrict?}; googleScholar: {query, asYlo?, asYhi?, num?}.',
        inputSchema: {
            type: 'object',
            required: ['id', 'type', 'config'],
            properties: {
                id: { type: 'string', description: 'Unique source ID, e.g. "arxiv-cogsci"' },
                type: {
                    type: 'string',
                    enum: ['arxiv', 'reddit', 'bluesky', 'mastodon', 'googleSearch', 'googleScholar']
                },
                config: { type: 'object', description: 'Source-specific configuration object' },
                enabled: { type: 'boolean', default: true },
                intervalMs: { type: 'integer', description: 'Poll interval in ms (default 900000)' }
            },
            additionalProperties: false
        }
    },
    {
        name: 'feed_remove_source',
        description: 'Delete a research feed source and all of its cached items. Use when the user wants to stop tracking a topic.',
        inputSchema: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' } },
            additionalProperties: false
        }
    },
    {
        name: 'feed_set_enabled',
        description: 'Enable or disable a source without deleting it. Useful for pausing a noisy feed.',
        inputSchema: {
            type: 'object',
            required: ['id', 'enabled'],
            properties: { id: { type: 'string' }, enabled: { type: 'boolean' } },
            additionalProperties: false
        }
    },
    {
        name: 'feed_fetch',
        description: 'Force-fetch one or all enabled sources, inserting any new items into the store. Returns a brief per-source report. Use when the user wants the freshest results right now.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'If omitted, fetch all enabled sources' }
            },
            additionalProperties: false
        }
    },
    {
        name: 'feed_search',
        description: 'Run an adapter live without persisting anything to the store — a one-shot search. Best for exploratory queries ("find recent arxiv papers on X") where the user does not necessarily want to start polling. Returns the items inline.',
        inputSchema: {
            type: 'object',
            required: ['type', 'config'],
            properties: {
                type: {
                    type: 'string',
                    enum: ['arxiv', 'reddit', 'bluesky', 'mastodon', 'googleSearch', 'googleScholar']
                },
                config: { type: 'object' }
            },
            additionalProperties: false
        }
    },
    {
        name: 'feed_list_items',
        description: 'List cached feed items, sortable by score or recency, filterable by source / saved / dismissed / minimum relevance. Returns JSON with title, author, url, summary, dates, and AI relevance score where available.',
        inputSchema: {
            type: 'object',
            properties: {
                sourceId: { type: 'string' },
                sort: { type: 'string', enum: ['score', 'recent'], default: 'recent' },
                limit: { type: 'integer', default: 25, minimum: 1, maximum: 200 },
                minScore: { type: 'number' },
                saved: { type: 'boolean' },
                dismissed: { type: 'boolean', default: false }
            },
            additionalProperties: false
        }
    },
    {
        name: 'feed_get_item',
        description: 'Fetch the full record (including raw API payload) for one item by its numeric ID. Use to inspect details before saving or to surface a specific paper to the user.',
        inputSchema: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'integer' } },
            additionalProperties: false
        }
    },
    {
        name: 'feed_save_item',
        description: 'Mark an item as saved (the analogous IDE flow eventually persists into the citations DB). Saved items are exempt from automatic pruning.',
        inputSchema: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'integer' } },
            additionalProperties: false
        }
    },
    {
        name: 'feed_dismiss_item',
        description: 'Hide an item from default listings. Use when the user explicitly says they are not interested in something so it stops cluttering future results.',
        inputSchema: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'integer' } },
            additionalProperties: false
        }
    },
    {
        name: 'feed_prune',
        description: 'Remove unsaved items older than N days (default 30). Saved items are preserved.',
        inputSchema: {
            type: 'object',
            properties: { days: { type: 'integer', default: 30, minimum: 0 } },
            additionalProperties: false
        }
    },
    {
        name: 'feed_import_chrome_tabs',
        description: 'Read the user\'s currently-open Chrome tabs (macOS only, via AppleScript) and import the non-personal/non-generic ones as feed items. Use when the user asks to capture or save what they have open in Chrome — e.g. "add my open tabs to the feed", "pull in my browser tabs", "what am I reading?". Default blocklist drops chrome:// URLs, gmail/calendar/messaging, social media DMs, banking, etc. Returns a summary of total / dropped / kept / inserted. The first call may trigger a macOS Automation permission prompt. Note: this surface lacks the IDE\'s AI relevance gate; relies on the deterministic blocklist alone — for AI gating use the IDE panel.',
        inputSchema: {
            type: 'object',
            properties: {
                appName: {
                    type: 'string',
                    description: 'Browser app name. Default "Google Chrome". Also "Brave Browser", "Arc", "Microsoft Edge".'
                },
                allowHomepages: {
                    type: 'boolean',
                    description: 'Include bare-domain tabs (e.g. https://example.com/). Default false.'
                },
                allowGenericTitles: {
                    type: 'boolean',
                    description: 'Include tabs with generic titles like "New Tab", "Google", "DuckDuckGo". Default false.'
                },
                extraBlocklist: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Regex patterns appended to the default blocklist.'
                },
                blocklist: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Regex patterns that REPLACE the default blocklist entirely.'
                }
            },
            additionalProperties: false
        }
    }
];

// ---- handler implementations ---------------------------------------------

function trimItem(it) {
    return {
        id: it.id,
        sourceId: it.sourceId,
        title: it.title,
        author: it.author,
        url: it.url,
        publishedAt: it.publishedAt,
        summary: it.summary ? it.summary.slice(0, 400) : null,
        tags: it.tags,
        relevance: it.relevance,
        saved: it.saved,
        dismissed: it.dismissed
    };
}

const HANDLERS = {
    async feed_list_sources() {
        const store = await ensureStore();
        const sources = await store.listSources();
        return JSON.stringify(sources, null, 2);
    },

    async feed_add_source({ id, type, config, enabled, intervalMs }) {
        if (!ADAPTERS[type]) throw new Error(`unknown type: ${type}`);
        const store = await ensureStore();
        const out = await store.upsertSource({
            id,
            type,
            config: config || {},
            enabled: enabled !== false,
            intervalMs
        });
        return `Saved source.\n${JSON.stringify(out, null, 2)}`;
    },

    async feed_remove_source({ id }) {
        const store = await ensureStore();
        await store.deleteSource(id);
        return `Removed source ${id} and its items.`;
    },

    async feed_set_enabled({ id, enabled }) {
        const store = await ensureStore();
        await store.setSourceEnabled(id, enabled);
        return `Source ${id} is now ${enabled ? 'enabled' : 'disabled'}.`;
    },

    async feed_fetch({ id } = {}) {
        const store = await ensureStore();
        let targets;
        if (id) {
            const s = await store.getSource(id);
            if (!s) throw new Error(`no such source: ${id}`);
            targets = [s];
        } else {
            targets = (await store.listSources())
                .filter((s) => s.enabled && !ON_DEMAND_TYPES.has(s.type));
        }
        if (!targets.length) return 'No enabled sources to fetch.';
        const report = [];
        let totalNew = 0;
        for (const src of targets) {
            const adapter = ADAPTERS[src.type];
            if (!adapter) {
                report.push(`${src.id}: skipped (adapter ${src.type} not available)`);
                continue;
            }
            const credentials = (CREDS_FOR_TYPE[src.type] || (() => ({})))();
            const t0 = Date.now();
            try {
                const result = await adapter.fetch({ config: src.config, credentials });
                const items = result.items || [];
                const ins = await store.insertItems(src.id, items);
                await store.recordSourceFetch(src.id, null);
                totalNew += ins.inserted;
                const skip = result.skipped ? ` skipped:${result.skipped}` : '';
                report.push(`${src.id} (${src.type}): fetched=${items.length} new=${ins.inserted} in ${Date.now() - t0}ms${skip}`);
            } catch (err) {
                await store.recordSourceFetch(src.id, err.message);
                report.push(`${src.id}: ERROR ${err.message}`);
            }
        }
        return `${totalNew} new item(s) inserted across ${targets.length} source(s).\n\n${report.join('\n')}`;
    },

    async feed_search({ type, config }) {
        if (!ADAPTERS[type]) throw new Error(`unknown adapter: ${type}`);
        const credentials = (CREDS_FOR_TYPE[type] || (() => ({})))();
        const result = await ADAPTERS[type].fetch({ config: config || {}, credentials });
        const items = (result.items || []).map((it) => ({
            title: it.title,
            author: it.author,
            url: it.url,
            publishedAt: it.publishedAt,
            summary: it.summary ? it.summary.slice(0, 400) : null,
            tags: it.tags
        }));
        const meta = result.skipped ? { skipped: result.skipped } : (result.meta || {});
        return JSON.stringify({ count: items.length, meta, items }, null, 2);
    },

    async feed_list_items({ sourceId, sort, limit, minScore, saved, dismissed } = {}) {
        const store = await ensureStore();
        const items = await store.listItems({
            sourceId,
            sort: sort === 'score' ? 'score' : 'recent',
            limit: limit || 25,
            minScore,
            saved: saved === true ? true : undefined,
            dismissed: !!dismissed
        });
        return JSON.stringify({ count: items.length, items: items.map(trimItem) }, null, 2);
    },

    async feed_get_item({ id }) {
        const store = await ensureStore();
        const item = await store.getItem(Number(id));
        if (!item) throw new Error(`no such item: ${id}`);
        return JSON.stringify(item, null, 2);
    },

    async feed_save_item({ id }) {
        const store = await ensureStore();
        await store.markSaved(Number(id), true);
        return `Saved item ${id}.`;
    },

    async feed_dismiss_item({ id }) {
        const store = await ensureStore();
        await store.dismissItem(Number(id), true);
        return `Dismissed item ${id}.`;
    },

    async feed_prune({ days } = {}) {
        const store = await ensureStore();
        const removed = await store.pruneOlderThan(days ?? 30);
        return `Pruned ${removed} item(s) older than ${days ?? 30} day(s).`;
    },

    async feed_import_chrome_tabs({ appName, allowHomepages, allowGenericTitles, extraBlocklist, blocklist } = {}) {
        if (process.platform !== 'darwin') {
            throw new Error(`feed_import_chrome_tabs is macOS-only (uses AppleScript). Got platform: ${process.platform}`);
        }
        const config = {
            appName: appName || 'Google Chrome',
            allowHomepages: !!allowHomepages,
            allowGenericTitles: !!allowGenericTitles
        };
        if (Array.isArray(blocklist) && blocklist.length) config.blocklist = blocklist;
        if (Array.isArray(extraBlocklist) && extraBlocklist.length) config.extraBlocklist = extraBlocklist;

        const store = await ensureStore();
        const existing = await store.getSource(CHROME_TABS_SOURCE_ID);
        if (!existing) {
            await store.upsertSource({
                id: CHROME_TABS_SOURCE_ID,
                type: 'chromeTabs',
                config,
                enabled: true,
                intervalMs: 365 * 24 * 60 * 60 * 1000
            });
        }

        const t0 = Date.now();
        const result = await ADAPTERS.chromeTabs.fetch({ config });
        const items = result.items || [];
        const ins = await store.insertItems(CHROME_TABS_SOURCE_ID, items);
        await store.recordSourceFetch(CHROME_TABS_SOURCE_ID, null);

        const meta = result.meta || {};
        const summary = {
            sourceId: CHROME_TABS_SOURCE_ID,
            totalTabs: meta.total ?? items.length,
            droppedByBlocklist: meta.dropped ?? 0,
            kept: meta.kept ?? items.length,
            newlyInserted: ins.inserted,
            elapsedMs: Date.now() - t0,
            note: 'AI relevance gate is IDE-only; this MCP surface uses the deterministic blocklist only.'
        };
        return JSON.stringify(summary, null, 2);
    }
};

// ---- JSON-RPC framing -----------------------------------------------------

function send(msg) {
    process.stdout.write(JSON.stringify(msg) + '\n');
}

function respond(id, result) {
    send({ jsonrpc: '2.0', id, result });
}

function respondError(id, code, message, data) {
    const err = { code, message };
    if (data !== undefined) err.data = data;
    send({ jsonrpc: '2.0', id, error: err });
}

async function handleMessage(msg) {
    const { method, id, params } = msg;
    if (method === 'initialize') {
        respond(id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO
        });
        return;
    }
    if (method === 'notifications/initialized' || method === 'initialized') {
        return; // notification, no response
    }
    if (method === 'tools/list') {
        respond(id, { tools: TOOLS });
        return;
    }
    if (method === 'tools/call') {
        const name = params?.name;
        const args = params?.arguments || {};
        const handler = HANDLERS[name];
        if (!handler) {
            respond(id, {
                isError: true,
                content: [{ type: 'text', text: `Unknown tool: ${name}` }]
            });
            return;
        }
        try {
            const text = await handler(args);
            respond(id, { content: [{ type: 'text', text }] });
        } catch (err) {
            respond(id, {
                isError: true,
                content: [{ type: 'text', text: `Error: ${err.message}` }]
            });
        }
        return;
    }
    if (method === 'ping') {
        respond(id, {});
        return;
    }
    // Unknown method
    if (id !== undefined) respondError(id, -32601, `Method not found: ${method}`);
}

// ---- main loop ------------------------------------------------------------

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try {
        msg = JSON.parse(trimmed);
    } catch (err) {
        process.stderr.write(`[research-feed mcp] parse error: ${err.message}\n`);
        return;
    }
    try {
        await handleMessage(msg);
    } catch (err) {
        process.stderr.write(`[research-feed mcp] handler error: ${err.message}\n`);
        if (msg.id !== undefined) respondError(msg.id, -32603, err.message);
    }
});

rl.on('close', () => {
    if (storeRef) storeRef.close();
    process.exit(0);
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

process.stderr.write(`[research-feed mcp] ready (server ${SERVER_INFO.name} ${SERVER_INFO.version})\n`);

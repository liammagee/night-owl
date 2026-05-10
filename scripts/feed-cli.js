#!/usr/bin/env node
// === Research Feed CLI ===
// Drives the same services/feedStore.js + services/feedSources/* used by the
// IDE plugin, but from plain node so adapters can be exercised without Electron.
//
// Defaults to a CLI-only user-data dir (~/.machinespirits-research-feed-cli)
// so it never touches the IDE's production DB. Pass --user-data to point
// somewhere else.
//
// Credentials normally live in safeStorage (Electron only). The CLI substitutes
// env vars: RF_GOOGLE_API_KEY, RF_GOOGLE_CX, RF_SERPAPI_KEY.
//
// xLoggedIn (x.com scraping) is intentionally excluded — it depends on
// Electron BrowserWindow + persistent cookies and only works inside the IDE.

const path = require('path');
const os = require('os');
const fs = require('fs');

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

// Adapters that should never run in the bulk `fetch` loop. They're triggered
// via dedicated commands only (e.g. `import-chrome-tabs`) because they read
// live local state rather than a polling endpoint.
const ON_DEMAND_TYPES = new Set(['chromeTabs']);

const CHROME_TABS_SOURCE_ID = 'chrome-tabs';

// ---- arg parsing ----------------------------------------------------------

function parseArgs(argv) {
    const out = { _: [], flags: {} };
    for (let i = 0; i < argv.length; i++) {
        const tok = argv[i];
        if (tok.startsWith('--')) {
            const key = tok.slice(2);
            const next = argv[i + 1];
            if (next === undefined || next.startsWith('--')) {
                out.flags[key] = true;
            } else {
                out.flags[key] = next;
                i++;
            }
        } else {
            out._.push(tok);
        }
    }
    return out;
}

function reqFlag(args, name) {
    if (args.flags[name] === undefined || args.flags[name] === true) {
        throw new Error(`missing --${name}`);
    }
    return args.flags[name];
}

function parseConfig(str) {
    try {
        return JSON.parse(str);
    } catch (e) {
        throw new Error(`--config must be valid JSON (use single quotes around it): ${e.message}`);
    }
}

// ---- pretty printing ------------------------------------------------------

const ttyOK = process.stdout.isTTY;
const C = {
    dim: (s) => ttyOK ? `\x1b[2m${s}\x1b[0m` : s,
    bold: (s) => ttyOK ? `\x1b[1m${s}\x1b[0m` : s,
    cyan: (s) => ttyOK ? `\x1b[36m${s}\x1b[0m` : s,
    yellow: (s) => ttyOK ? `\x1b[33m${s}\x1b[0m` : s,
    red: (s) => ttyOK ? `\x1b[31m${s}\x1b[0m` : s,
    green: (s) => ttyOK ? `\x1b[32m${s}\x1b[0m` : s
};

function trim(s, n) {
    if (!s) return '';
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function table(rows, columns) {
    if (!rows.length) return C.dim('(none)');
    const widths = columns.map((c) =>
        Math.max(c.header.length, ...rows.map((r) => String(r[c.key] ?? '').length)));
    const lines = [];
    lines.push(columns.map((c, i) => C.bold(c.header.padEnd(widths[i]))).join('  '));
    lines.push(columns.map((c, i) => '-'.repeat(widths[i])).join('  '));
    for (const r of rows) {
        lines.push(columns.map((c, i) => String(r[c.key] ?? '').padEnd(widths[i])).join('  '));
    }
    return lines.join('\n');
}

// ---- commands -------------------------------------------------------------

async function cmdListSources(args, store) {
    const sources = await store.listSources();
    if (!sources.length) {
        console.log(C.dim('No sources configured.'));
        console.log(C.dim('  Try: sources:add --id arxiv-ai --type arxiv --config \'{"category":"cs.AI","maxResults":10}\''));
        return;
    }
    const rows = sources.map((s) => ({
        id: s.id,
        type: s.type,
        enabled: s.enabled ? 'yes' : 'no',
        intervalMin: Math.round((s.intervalMs || 0) / 60000),
        lastFetched: s.lastFetchedAt ? s.lastFetchedAt.replace('T', ' ').slice(0, 19) : '-',
        error: trim(s.lastError || '-', 40)
    }));
    console.log(table(rows, [
        { key: 'id', header: 'ID' },
        { key: 'type', header: 'Type' },
        { key: 'enabled', header: 'On' },
        { key: 'intervalMin', header: 'Min' },
        { key: 'lastFetched', header: 'Last fetched' },
        { key: 'error', header: 'Last error' }
    ]));
}

async function cmdAddSource(args, store) {
    const id = reqFlag(args, 'id');
    const type = reqFlag(args, 'type');
    if (!ADAPTERS[type]) {
        throw new Error(`unknown type: ${type} (valid: ${Object.keys(ADAPTERS).join(', ')})`);
    }
    const config = parseConfig(reqFlag(args, 'config'));
    const enabled = !args.flags.disabled;
    const intervalMs = args.flags.interval ? Number(args.flags.interval) : undefined;
    const out = await store.upsertSource({ id, type, config, enabled, intervalMs });
    console.log(C.green(`✓ saved source ${id}`));
    console.log(JSON.stringify(out, null, 2));
}

async function cmdRemoveSource(args, store) {
    const id = args._[1];
    if (!id) throw new Error('usage: sources:remove <id>');
    await store.deleteSource(id);
    console.log(C.green(`✓ removed source ${id} (and its items)`));
}

async function cmdSetEnabled(args, store, enabled) {
    const id = args._[1];
    if (!id) throw new Error(`usage: sources:${enabled ? 'enable' : 'disable'} <id>`);
    await store.setSourceEnabled(id, enabled);
    console.log(C.green(`✓ ${enabled ? 'enabled' : 'disabled'} source ${id}`));
}

async function cmdFetch(args, store) {
    const id = args._[1];
    let targets;
    if (id) {
        const s = await store.getSource(id);
        if (!s) throw new Error(`no such source: ${id}`);
        targets = [s];
    } else {
        targets = (await store.listSources())
            .filter((s) => s.enabled && !ON_DEMAND_TYPES.has(s.type));
    }
    if (!targets.length) {
        console.log(C.dim('nothing to fetch'));
        return;
    }
    let totalNew = 0;
    for (const src of targets) {
        const adapter = ADAPTERS[src.type];
        if (!adapter) {
            console.warn(C.yellow(`! skipping ${src.id}: adapter ${src.type} not available in CLI`));
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
            const meta = result.skipped ? C.yellow(`  skipped:${result.skipped}`) : '';
            console.log(`${C.cyan(src.id.padEnd(20))} ${C.dim(src.type.padEnd(14))} fetched=${items.length}  new=${ins.inserted}  ${Date.now() - t0}ms${meta}`);
        } catch (err) {
            await store.recordSourceFetch(src.id, err.message);
            console.warn(C.red(`✗ ${src.id}: ${err.message}`));
        }
    }
    console.log(C.bold(`\n${totalNew} new item(s) inserted across ${targets.length} source(s).`));
}

async function cmdTestAdapter(args /* no store */) {
    const type = reqFlag(args, 'type');
    if (!ADAPTERS[type]) {
        throw new Error(`unknown adapter: ${type} (valid: ${Object.keys(ADAPTERS).join(', ')})`);
    }
    const config = parseConfig(reqFlag(args, 'config'));
    const credentials = (CREDS_FOR_TYPE[type] || (() => ({})))();
    const t0 = Date.now();
    const result = await ADAPTERS[type].fetch({ config, credentials });
    const items = result.items || [];
    const skipNote = result.skipped ? C.yellow(` skipped:${result.skipped}`) : '';
    console.log(`${C.cyan(type)}: ${items.length} item(s) in ${Date.now() - t0}ms${skipNote}`);
    if (result.meta) console.log(C.dim(`meta: ${JSON.stringify(result.meta)}`));
    items.slice(0, 5).forEach((it, i) => {
        console.log(`  ${i + 1}. ${C.bold(trim(it.title, 90))}`);
        console.log(`     ${C.dim(`${it.author || ''}${it.author && it.publishedAt ? '  ' : ''}${it.publishedAt || ''}`)}`);
        if (it.url) console.log(`     ${C.dim(it.url)}`);
    });
    if (items.length > 5) console.log(`  ${C.dim(`...and ${items.length - 5} more`)}`);
}

async function cmdListItems(args, store) {
    const sourceId = typeof args.flags.source === 'string' ? args.flags.source : undefined;
    const sort = args.flags.sort === 'score' ? 'score' : 'recent';
    const limit = Number(args.flags.limit || 25);
    const minScore = args.flags['min-score'] !== undefined ? Number(args.flags['min-score']) : undefined;
    const saved = args.flags.saved ? true : undefined;
    const dismissed = !!args.flags.dismissed;
    const items = await store.listItems({ sourceId, sort, limit, minScore, saved, dismissed });
    if (!items.length) {
        console.log(C.dim('(no items)'));
        return;
    }
    items.forEach((it) => {
        const score = it.relevance ? `[${Number(it.relevance.score).toFixed(1)}]` : '[—]';
        const flag = (it.saved ? '★' : ' ') + (it.dismissed ? '✗' : ' ');
        const date = (it.publishedAt || it.fetchedAt || '').slice(0, 10);
        console.log(`${C.dim(String(it.id).padStart(5))} ${flag} ${C.yellow(score.padStart(5))} ${C.cyan(it.sourceId.padEnd(18))} ${date}  ${C.bold(trim(it.title, 90))}`);
        if (it.author) console.log(`        ${C.dim(trim(it.author, 90))}`);
    });
    console.log(C.dim(`\n${items.length} item(s)`));
}

async function cmdShowItem(args, store) {
    const id = args._[1];
    if (!id) throw new Error('usage: show <id>');
    const item = await store.getItem(Number(id));
    if (!item) throw new Error(`no such item: ${id}`);
    console.log(JSON.stringify(item, null, 2));
}

async function cmdMark(args, store, kind) {
    const id = args._[1];
    if (!id) throw new Error(`usage: ${kind} <id>`);
    if (kind === 'dismiss') {
        await store.dismissItem(Number(id), true);
    } else {
        await store.markSaved(Number(id), true);
    }
    console.log(C.green(`✓ ${kind === 'dismiss' ? 'dismissed' : 'saved'} item ${id}`));
}

async function cmdPrune(args, store) {
    const days = Number(args.flags.days || 30);
    const removed = await store.pruneOlderThan(days);
    console.log(C.green(`✓ pruned ${removed} item(s) older than ${days} day(s)`));
}

function parseJsonArrayFlag(args, name) {
    if (!args.flags[name] || args.flags[name] === true) return undefined;
    try {
        const parsed = JSON.parse(args.flags[name]);
        if (!Array.isArray(parsed)) throw new Error('not a JSON array');
        return parsed;
    } catch (e) {
        throw new Error(`--${name} must be a JSON array of regex strings: ${e.message}`);
    }
}

async function cmdImportChromeTabs(args, store) {
    if (process.platform !== 'darwin') {
        throw new Error('import-chrome-tabs is macOS-only (uses AppleScript). Got platform: ' + process.platform);
    }
    const config = {
        appName: typeof args.flags.app === 'string' ? args.flags.app : 'Google Chrome',
        allowHomepages: !!args.flags['allow-homepages'],
        allowGenericTitles: !!args.flags['allow-generic-titles']
    };
    const blocklist = parseJsonArrayFlag(args, 'blocklist');
    const extraBlocklist = parseJsonArrayFlag(args, 'extra-blocklist');
    if (blocklist) config.blocklist = blocklist;
    if (extraBlocklist) config.extraBlocklist = extraBlocklist;

    // Lazy-create the source row so insertItems / recordSourceFetch have a
    // row to reference. Set a 1-year interval so anyone bolting on a polling
    // loop won't accidentally scrape Chrome on a schedule.
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
    console.log(C.bold('Chrome tabs import:'));
    console.log(`  total tabs:     ${meta.total ?? items.length}`);
    console.log(`  dropped:        ${meta.dropped ?? 0} ${C.dim('(blocklist / generic / homepage)')}`);
    console.log(`  kept:           ${meta.kept ?? items.length}`);
    console.log(`  newly inserted: ${C.green(ins.inserted)}`);
    console.log(`  took:           ${Date.now() - t0}ms`);
    console.log();
    console.log(C.dim('Note: CLI applies the deterministic blocklist only.'));
    console.log(C.dim('The IDE\'s "Import Chrome Tabs" runs an additional AI'));
    console.log(C.dim('relevance gate against your current draft.'));
}

function help() {
    console.log(`Research Feed CLI

Usage:
  node scripts/feed-cli.js <command> [args] [--user-data <path>]

Commands:
  sources                                     List configured sources
  sources:add --id ID --type TYPE
             --config '<json>' [--interval MS] [--disabled]
  sources:remove ID                           Delete source and its items
  sources:enable ID
  sources:disable ID
  fetch [ID]                                  Fetch one or all enabled sources, insert new items
  test --type TYPE --config '<json>'          Run an adapter without writing to the store
  items [--source ID] [--sort score|recent]
        [--limit N] [--min-score N]
        [--saved] [--dismissed]
  show ID                                     Print full item JSON
  dismiss ID
  save ID
  prune [--days N]                            Remove unsaved items older than N days (default 30)
  import-chrome-tabs                          (macOS only) read open Chrome tabs, blocklist filter, insert
        [--app NAME]                          app name (default "Google Chrome"; also "Brave Browser", "Arc")
        [--allow-homepages]                   include bare-domain tabs (https://example.com/)
        [--allow-generic-titles]              include "New Tab", "Google", etc.
        [--extra-blocklist '<json array>']    append regex patterns to the default blocklist
        [--blocklist '<json array>']          replace the default blocklist entirely
  help

Source types and config shape:
  arxiv          { category?, query?, maxResults? }
  reddit         { subreddits[], sort?, limit?, query? }
  bluesky        { query, lang?, limit?, sort? }
  mastodon       { instances[], tags?[], query?, limit? }
  googleSearch   { query, cx, dateRestrict? }     env: RF_GOOGLE_API_KEY (RF_GOOGLE_CX optional)
  googleScholar  { query, asYlo?, asYhi?, num? }  env: RF_SERPAPI_KEY
  chromeTabs     { appName?, allowHomepages?, allowGenericTitles?, extraBlocklist?[], blocklist?[] }
                 macOS only, on-demand. Use \`import-chrome-tabs\`; not run by bulk \`fetch\`.

Examples:
  node scripts/feed-cli.js test --type arxiv --config '{"category":"cs.AI","maxResults":3}'
  node scripts/feed-cli.js sources:add --id reddit-ml --type reddit --config '{"subreddits":["MachineLearning"],"sort":"new","limit":10}'
  node scripts/feed-cli.js fetch
  node scripts/feed-cli.js items --sort score --limit 10
  node scripts/feed-cli.js save 42
  node scripts/feed-cli.js import-chrome-tabs
  node scripts/feed-cli.js import-chrome-tabs --app "Brave Browser" --extra-blocklist '["mybank\\\\.com"]'

xLoggedIn (x.com) is not available in CLI — it requires Electron's BrowserWindow.
`);
}

const COMMANDS = {
    sources: cmdListSources,
    'sources:add': cmdAddSource,
    'sources:remove': cmdRemoveSource,
    'sources:enable': (a, s) => cmdSetEnabled(a, s, true),
    'sources:disable': (a, s) => cmdSetEnabled(a, s, false),
    fetch: cmdFetch,
    test: cmdTestAdapter,
    items: cmdListItems,
    show: cmdShowItem,
    dismiss: (a, s) => cmdMark(a, s, 'dismiss'),
    save: (a, s) => cmdMark(a, s, 'save'),
    prune: cmdPrune,
    'import-chrome-tabs': cmdImportChromeTabs,
    help: () => { help(); }
};

const NO_STORE_COMMANDS = new Set(['help', 'test']);

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const cmd = args._[0] || 'help';
    if (cmd === '-h' || cmd === '--help') {
        help();
        return;
    }
    const fn = COMMANDS[cmd];
    if (!fn) {
        console.error(C.red(`unknown command: ${cmd}\n`));
        help();
        process.exit(1);
    }

    let store = null;
    if (!NO_STORE_COMMANDS.has(cmd)) {
        const userData = args.flags['user-data'] ||
            path.join(os.homedir(), '.machinespirits-research-feed-cli');
        if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true });
        store = getFeedStore();
        if (!store.isInitialized) await store.initialize(userData);
    }

    try {
        await fn(args, store);
    } finally {
        if (store) store.close();
    }
}

main().catch((err) => {
    console.error(C.red(`ERROR: ${err.message}`));
    if (process.env.RF_DEBUG) console.error(err.stack);
    process.exit(1);
});

// === Research Feed IPC Handlers ===
// All polling, source dispatch, AI relevance scoring, and "save to citations"
// for the techne-research-feed plugin live here.

const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const { getFeedStore } = require('../services/feedStore');
const { getCredentialStore } = require('../services/credentialStore');
const CitationService = require('../services/citationService');
const { createRegistry } = require('../services/resourceLifecycle');
const { createDebugLogger } = require('./logging');

const debug = createDebugLogger('FeedHandlers');

const adapters = {
    arxiv: require('../services/feedSources/arxiv'),
    reddit: require('../services/feedSources/reddit'),
    bluesky: require('../services/feedSources/bluesky'),
    mastodon: require('../services/feedSources/mastodon'),
    googleSearch: require('../services/feedSources/googleSearch'),
    googleScholar: require('../services/feedSources/googleScholar'),
    xLoggedIn: require('../services/feedSources/xLoggedIn'),
    chromeTabs: require('../services/feedSources/chromeTabs')
};

const DEFAULT_INTERVALS_MS = {
    arxiv: 60 * 60 * 1000,
    reddit: 15 * 60 * 1000,
    bluesky: 15 * 60 * 1000,
    mastodon: 15 * 60 * 1000,
    googleSearch: 24 * 60 * 60 * 1000,
    googleScholar: 24 * 60 * 60 * 1000,
    xLoggedIn: 30 * 60 * 1000,
    // chromeTabs is on-demand. Set the interval high so the poll loop won't
    // scrape Chrome behind the user's back. Manual import via the
    // feed:import-chrome-tabs handler is the intended path.
    chromeTabs: 365 * 24 * 60 * 60 * 1000
};

const CHROME_TABS_SOURCE_ID = 'chrome-tabs';

let store = null;
let credentials = null;
let citationService = null;
let mainWindowRef = null;
let depsRef = null;
let pollTimer = null;
let pollLifecycle = null;
let scoringInFlight = false;
let registrationGeneration = 0;

const POLL_TICK_MS = 60 * 1000;

async function initializeServices(userDataPath) {
    if (!store) {
        store = getFeedStore();
        await store.initialize(userDataPath);
    }
    if (!credentials) {
        credentials = getCredentialStore();
        await credentials.initialize(userDataPath);
    }
    if (!citationService) {
        citationService = new CitationService();
        await citationService.initialize(userDataPath);
    }
}

function emit(channel, payload) {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        mainWindowRef.webContents.send(channel, payload);
    }
}

function getDefaultIntervalMs(type) {
    return DEFAULT_INTERVALS_MS[type] || 15 * 60 * 1000;
}

async function loadCredentials(sourceId) {
    if (!credentials) return {};
    const names = await credentials.list(sourceId);
    const result = {};
    for (const name of names) {
        result[name] = await credentials.get(sourceId, name);
    }
    return result;
}

function buildContextHash(text) {
    return crypto.createHash('sha1').update(text || '').digest('hex').slice(0, 16);
}

// ------------- Relevance scoring (uses tutor-bridge) -------------

const SCORING_SYSTEM_PROMPT = `You are a research-relevance scorer.
Given a "current draft" excerpt and a list of feed items, return a JSON array
[{"id": <item id>, "score": <0-10 integer>, "reason": "<<= 18 words>"}].
Score 0 = completely unrelated. Score 10 = directly cites or extends the draft.
Use 6 as the default threshold for "worth surfacing". Do not include any prose
outside the JSON array.`;

async function readDraftContext() {
    if (!depsRef) return null;
    const getCurrentFilePath = typeof depsRef.getCurrentFilePath === 'function'
        ? depsRef.getCurrentFilePath
        : () => depsRef.appSettings?.currentFile || null;
    const filePath = getCurrentFilePath();
    if (!filePath) return null;
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const trimmed = content.length > 4000 ? content.slice(0, 4000) : content;
        return { filePath, content: trimmed };
    } catch (_) {
        return null;
    }
}

async function scoreUnscoredBatch() {
    if (scoringInFlight) return { skipped: 'in-flight' };
    if (!depsRef?.tutorBridge?.getAvailableProviders ||
        depsRef.tutorBridge.getAvailableProviders().length === 0) {
        return { skipped: 'no-ai-provider' };
    }
    const draft = await readDraftContext();
    if (!draft) return { skipped: 'no-current-file' };
    const ctxHash = buildContextHash(draft.content);
    const items = await store.listUnscored({ contextHash: ctxHash, limit: 20 });
    if (items.length === 0) return { scored: 0 };

    const compactItems = items.map((i) => ({
        id: i.id,
        title: i.title,
        author: i.author,
        summary: (i.summary || '').slice(0, 300)
    }));

    const userMessage = [
        '=== CURRENT DRAFT (excerpt) ===',
        `File: ${path.basename(draft.filePath)}`,
        draft.content,
        '',
        '=== FEED ITEMS TO SCORE ===',
        JSON.stringify(compactItems, null, 2),
        '',
        'Return ONLY the JSON array described in the system prompt.'
    ].join('\n');

    scoringInFlight = true;
    try {
        const response = await depsRef.tutorBridge.sendMessage(userMessage, {
            systemPrompt: SCORING_SYSTEM_PROMPT,
            temperature: 0.2,
            maxTokens: 1500
        });
        const text = typeof response === 'string' ? response : (response?.content || response?.text || '');
        const match = text.match(/\[[\s\S]*\]/);
        if (!match) return { scored: 0, error: 'no-json-found' };
        const scored = JSON.parse(match[0]);
        let n = 0;
        for (const r of scored) {
            const id = Number(r.id);
            const s = Number(r.score);
            if (!Number.isFinite(id) || !Number.isFinite(s)) continue;
            await store.setRelevance(id, {
                score: Math.max(0, Math.min(10, s)),
                reason: r.reason || null,
                contextHash: ctxHash
            });
            n++;
        }
        emit('feed:scored', { count: n });
        return { scored: n };
    } catch (err) {
        debug('scoring failed:', err.message);
        return { scored: 0, error: err.message };
    } finally {
        scoringInFlight = false;
    }
}

// ------------- Polling -------------

async function fetchSource(source) {
    const adapter = adapters[source.type];
    if (!adapter) throw new Error(`unknown adapter: ${source.type}`);
    const creds = await loadCredentials(source.id);
    const result = await adapter.fetch({ config: source.config, credentials: creds });
    return result;
}

async function pollSource(source) {
    try {
        const { items } = await fetchSource(source);
        const { inserted } = await store.insertItems(source.id, items || []);
        await store.recordSourceFetch(source.id, null);
        if (inserted > 0) emit('feed:items', { sourceId: source.id, inserted });
        return { sourceId: source.id, inserted, total: (items || []).length };
    } catch (err) {
        const msg = err.code === 'X_NEEDS_LOGIN' ? 'x.com session not logged in' : err.message;
        await store.recordSourceFetch(source.id, msg);
        emit('feed:source-error', { sourceId: source.id, message: msg, code: err.code || null });
        return { sourceId: source.id, error: msg };
    }
}

async function pollDueSources() {
    const sources = await store.listSources();
    const now = Date.now();
    const due = sources.filter((s) => {
        if (!s.enabled) return false;
        if (!s.lastFetchedAt) return true;
        return now - new Date(s.lastFetchedAt).getTime() >= s.intervalMs;
    });
    if (due.length === 0) return;
    for (const source of due) {
        await pollSource(source);
    }
    // Kick off async relevance scoring (don't block).
    scoreUnscoredBatch().catch(() => {});
}

function startPollLoop() {
    if (pollTimer) return;
    pollLifecycle = createRegistry({
        name: 'main:research-feed',
        scope: 'app',
        onError: (error, resource) => debug(`cleanup failed (${resource.type}):`, error.message)
    });
    pollTimer = pollLifecycle.interval(() => {
        pollDueSources().catch((err) => debug('poll loop:', err.message));
    }, POLL_TICK_MS);
    // Run once shortly after startup so a fresh app has data quickly.
    pollLifecycle.timeout(() => pollDueSources().catch(() => {}), 5000);
    // Daily prune.
    pollLifecycle.interval(() => {
        store.pruneOlderThan(30).then((n) => {
            if (n > 0) debug(`pruned ${n} old items`);
        }).catch(() => {});
    }, 24 * 60 * 60 * 1000);
}

function stopPollLoop() {
    pollLifecycle?.dispose();
    pollLifecycle = null;
    pollTimer = null;
}

function getDiagnostics() {
    return pollLifecycle?.getSnapshot() || {
        name: 'main:research-feed',
        scope: 'app',
        disposed: true,
        active: 0,
        byType: {}
    };
}

// ------------- Chrome tabs import -------------

const TAB_GATE_SYSTEM_PROMPT = `You are a research-relevance gate for browser tabs.
Given a "current draft" excerpt and a list of open tabs (title + url), return a JSON
array [{"id": <tab id>, "score": <0-10 integer>, "reason": "<<= 14 words>"}]. Score
0 = personal/generic/unrelated (gmail, banking, shopping, social timelines, settings).
Score 10 = directly relevant to the draft. Use 5 as the cutoff for "research-worth-keeping".
Return ONLY the JSON array, no prose.`;

async function gateTabsAgainstDraft(items, threshold = 5) {
    if (!depsRef?.tutorBridge?.getAvailableProviders ||
        depsRef.tutorBridge.getAvailableProviders().length === 0) {
        return { gated: false, reason: 'no-ai-provider', kept: items, dropped: [] };
    }
    const draft = await readDraftContext();
    if (!draft) return { gated: false, reason: 'no-current-file', kept: items, dropped: [] };

    const compactItems = items.map((it, idx) => ({
        id: idx,
        title: it.title || it.url,
        url: it.url
    }));

    const userMessage = [
        '=== CURRENT DRAFT (excerpt) ===',
        `File: ${path.basename(draft.filePath)}`,
        draft.content,
        '',
        '=== OPEN BROWSER TABS ===',
        JSON.stringify(compactItems, null, 2),
        '',
        'Return ONLY the JSON array described in the system prompt.'
    ].join('\n');

    try {
        const response = await depsRef.tutorBridge.sendMessage(userMessage, {
            systemPrompt: TAB_GATE_SYSTEM_PROMPT,
            temperature: 0.2,
            maxTokens: 2000
        });
        const text = typeof response === 'string' ? response : (response?.content || response?.text || '');
        const match = text.match(/\[[\s\S]*\]/);
        if (!match) return { gated: false, reason: 'no-json-found', kept: items, dropped: [] };
        const scored = JSON.parse(match[0]);
        const scoreById = new Map();
        for (const r of scored) {
            const id = Number(r.id);
            const s = Number(r.score);
            if (Number.isFinite(id) && Number.isFinite(s)) {
                scoreById.set(id, { score: s, reason: r.reason || null });
            }
        }
        const kept = [];
        const dropped = [];
        items.forEach((it, idx) => {
            const sc = scoreById.get(idx);
            const annotated = sc
                ? { ...it, _aiScore: sc.score, _aiReason: sc.reason }
                : { ...it, _aiScore: null };
            if (!sc || sc.score >= threshold) kept.push(annotated);
            else dropped.push(annotated);
        });
        return { gated: true, threshold, kept, dropped };
    } catch (err) {
        debug('tab gate failed:', err.message);
        return { gated: false, reason: err.message, kept: items, dropped: [] };
    }
}

async function importChromeTabs({ aiGate = true, threshold = 5, blocklist, extraBlocklist, allowHomepages, allowGenericTitles, appName } = {}) {
    // Make sure we have a row in `sources` so item insertion (which keys on
    // source_id) succeeds, and so the user sees the chrome-tabs source in
    // the panel even before the first import.
    await store.upsertSource({
        id: CHROME_TABS_SOURCE_ID,
        type: 'chromeTabs',
        config: { },
        enabled: true,
        intervalMs: DEFAULT_INTERVALS_MS.chromeTabs
    });
    const adapter = adapters.chromeTabs;
    const { items, meta } = await adapter.fetch({
        config: { blocklist, extraBlocklist, allowHomepages, allowGenericTitles, appName }
    });
    const droppedByBlocklist = (meta?.dropped) ?? 0;
    const totalTabs = (meta?.total) ?? items.length + droppedByBlocklist;

    let toInsert = items;
    let aiResult = null;
    if (aiGate) {
        aiResult = await gateTabsAgainstDraft(items, threshold);
        toInsert = aiResult.kept;
    }
    const ins = await store.insertItems(CHROME_TABS_SOURCE_ID, toInsert);
    await store.recordSourceFetch(CHROME_TABS_SOURCE_ID, null);

    return {
        totalTabs,
        droppedByBlocklist,
        afterBlocklist: items.length,
        gated: !!aiResult?.gated,
        gateReason: aiResult?.gated ? null : (aiResult?.reason || (aiGate ? null : 'ai-gate-disabled')),
        droppedByAi: aiResult?.dropped?.length || 0,
        kept: toInsert.length,
        inserted: ins.inserted,
        droppedExamples: (aiResult?.dropped || []).slice(0, 5).map((d) => ({ title: d.title, url: d.url, score: d._aiScore, reason: d._aiReason }))
    };
}

// ------------- Save to citations -------------

function feedItemToCitation(item) {
    const citationType = item.sourceId.startsWith('arxiv') ? 'article'
        : item.sourceId.startsWith('reddit') ? 'webpage'
        : item.sourceId.startsWith('bluesky') || item.sourceId.startsWith('mastodon') || item.sourceId.startsWith('xLoggedIn') ? 'webpage'
        : 'webpage';
    let pubDate = null;
    let pubYear = null;
    if (item.publishedAt) {
        const m = item.publishedAt.match(/\d{4}-\d{2}-\d{2}/);
        if (m) pubDate = m[0];
        const y = item.publishedAt.match(/\b(19|20)\d{2}\b/);
        if (y) pubYear = parseInt(y[0], 10);
    }
    return {
        title: item.title || '(untitled)',
        authors: item.author || '',
        url: item.url || '',
        publication_date: pubDate,
        publication_year: pubYear,
        abstract: item.summary || '',
        citation_type: citationType,
        source: 'research-feed',
        tags: (item.tags || []).join(', '),
        notes: `Imported from ${item.sourceId} on ${new Date().toISOString().slice(0, 10)}`
    };
}

// ------------- IPC registration -------------

function register(deps) {
    const generation = ++registrationGeneration;
    depsRef = deps;
    mainWindowRef = deps.mainWindow;
    const userDataPath = deps.userDataPath;

    initializeServices(userDataPath).then(() => {
        if (generation !== registrationGeneration) return;
        startPollLoop();
        debug('services ready, polling started');
    }).catch((err) => {
        console.error('[FeedHandlers] init failed:', err);
    });

    ipcMain.handle('feed:list-sources', async () => {
        await initializeServices(userDataPath);
        return { success: true, sources: await store.listSources() };
    });

    ipcMain.handle('feed:upsert-source', async (_e, payload) => {
        await initializeServices(userDataPath);
        const { id, type, config, enabled, intervalMs } = payload || {};
        if (!id || !type) return { success: false, error: 'id and type are required' };
        if (!adapters[type]) return { success: false, error: `unknown adapter type: ${type}` };
        const finalInterval = intervalMs || getDefaultIntervalMs(type);
        const source = await store.upsertSource({ id, type, config, enabled: enabled !== false, intervalMs: finalInterval });
        return { success: true, source };
    });

    ipcMain.handle('feed:delete-source', async (_e, { id } = {}) => {
        await initializeServices(userDataPath);
        if (!id) return { success: false, error: 'id required' };
        await store.deleteSource(id);
        return { success: true };
    });

    ipcMain.handle('feed:set-source-enabled', async (_e, { id, enabled } = {}) => {
        await initializeServices(userDataPath);
        await store.setSourceEnabled(id, enabled);
        return { success: true };
    });

    ipcMain.handle('feed:list', async (_e, filter = {}) => {
        await initializeServices(userDataPath);
        const items = await store.listItems(filter);
        return { success: true, items };
    });

    ipcMain.handle('feed:refresh-now', async (_e, { sourceId } = {}) => {
        await initializeServices(userDataPath);
        if (sourceId) {
            const source = await store.getSource(sourceId);
            if (!source) return { success: false, error: 'source not found' };
            const result = await pollSource(source);
            scoreUnscoredBatch().catch(() => {});
            return { success: true, result };
        }
        const sources = (await store.listSources()).filter((s) => s.enabled);
        const results = [];
        for (const source of sources) results.push(await pollSource(source));
        scoreUnscoredBatch().catch(() => {});
        return { success: true, results };
    });

    ipcMain.handle('feed:dismiss', async (_e, { id, dismissed = true } = {}) => {
        await initializeServices(userDataPath);
        await store.dismissItem(id, dismissed);
        return { success: true };
    });

    ipcMain.handle('feed:save-to-citations', async (_e, { id } = {}) => {
        await initializeServices(userDataPath);
        const item = await store.getItem(id);
        if (!item) return { success: false, error: 'item not found' };
        try {
            const citationData = feedItemToCitation(item);
            const result = await citationService.addCitation(citationData);
            await store.markSaved(id, true);
            return { success: true, citationId: result?.id, alreadyExisted: result?._existing === true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('feed:score-now', async () => {
        await initializeServices(userDataPath);
        return scoreUnscoredBatch();
    });

    ipcMain.handle('feed:credential-info', async () => {
        await initializeServices(userDataPath);
        return { success: true, info: credentials.backendInfo() };
    });

    ipcMain.handle('feed:set-credential', async (_e, { sourceId, name, value } = {}) => {
        await initializeServices(userDataPath);
        if (!sourceId || !name) return { success: false, error: 'sourceId and name are required' };
        try {
            if (value == null || value === '') {
                await credentials.delete(sourceId, name);
            } else {
                await credentials.set(sourceId, name, value);
            }
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('feed:list-credentials', async (_e, { sourceId } = {}) => {
        await initializeServices(userDataPath);
        return { success: true, names: await credentials.list(sourceId) };
    });

    ipcMain.handle('feed:import-chrome-tabs', async (_e, opts = {}) => {
        await initializeServices(userDataPath);
        try {
            const result = await importChromeTabs(opts);
            if (result.inserted > 0) {
                emit('feed:items', { sourceId: CHROME_TABS_SOURCE_ID, inserted: result.inserted });
            }
            return { success: true, ...result };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('feed:test-source', async (_e, { sourceId } = {}) => {
        await initializeServices(userDataPath);
        const source = await store.getSource(sourceId);
        if (!source) return { success: false, error: 'source not found' };
        try {
            const result = await fetchSource(source);
            return { success: true, count: (result.items || []).length, meta: result.meta || null };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // x.com-specific helpers.
    ipcMain.handle('feed:x-open-login', async () => {
        try {
            await adapters.xLoggedIn.openLoginWindow();
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('feed:x-status', async () => {
        try {
            const status = await adapters.xLoggedIn.getStatus();
            return { success: true, ...status };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('feed:x-clear-session', async () => {
        try {
            await adapters.xLoggedIn.clearSession();
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    debug('registered');
}

function cleanup() {
    registrationGeneration += 1;
    stopPollLoop();
    if (store) store.close();
    if (citationService && typeof citationService.close === 'function') citationService.close();
    store = null;
    credentials = null;
    citationService = null;
    mainWindowRef = null;
    depsRef = null;
    scoringInFlight = false;
}

module.exports = {
    register,
    cleanup,
    getDiagnostics,
    __testHooks: {
        startPollLoop,
        stopPollLoop,
        setStore(value) {
            store = value;
        }
    }
};

// Quick smoke test of public-API adapters. Run: node scripts/smoke-test-feed.js
const path = require('path');
const os = require('os');
const fs = require('fs');

(async () => {
    const arxiv = require('../services/feedSources/arxiv');
    const reddit = require('../services/feedSources/reddit');
    const bluesky = require('../services/feedSources/bluesky');
    const mastodon = require('../services/feedSources/mastodon');

    console.log('--- arxiv ---');
    const a = await arxiv.fetch({ config: { category: 'cs.AI', maxResults: 3 } });
    console.log(`got ${a.items.length} items`);
    if (a.items.length) console.log('first:', a.items[0].title?.slice(0, 80), '|', a.items[0].author?.slice(0, 60));

    console.log('--- reddit ---');
    try {
        const r = await reddit.fetch({ config: { subreddits: ['MachineLearning'], sort: 'new', limit: 3 } });
        console.log(`got ${r.items.length} items`);
        if (r.items.length) console.log('first:', r.items[0].title?.slice(0, 80));
    } catch (e) { console.warn('reddit failed:', e.message); }

    console.log('--- bluesky ---');
    try {
        const b = await bluesky.fetch({ config: { query: 'embodied cognition', limit: 3 } });
        console.log(`got ${b.items.length} items`);
        if (b.items.length) console.log('first:', b.items[0].title?.slice(0, 80));
    } catch (e) { console.warn('bluesky failed:', e.message); }

    console.log('--- mastodon ---');
    try {
        const m = await mastodon.fetch({
            config: { instances: ['mastodon.social'], tags: ['philosophy'], limit: 3 }
        });
        console.log(`got ${m.items.length} items`);
        if (m.items.length) console.log('first:', m.items[0].title?.slice(0, 80));
    } catch (e) { console.warn('mastodon failed:', e.message); }

    // FeedStore round-trip (no Electron needed).
    console.log('--- feedStore ---');
    const tempDir = path.join(os.tmpdir(), `rf-smoke-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const { getFeedStore } = require('../services/feedStore');
    const store = getFeedStore();
    await store.initialize(tempDir);
    await store.upsertSource({ id: 'arxiv-test', type: 'arxiv', config: { category: 'cs.AI' } });
    if (a.items.length) {
        const inserted = await store.insertItems('arxiv-test', a.items);
        console.log(`inserted ${inserted.inserted} items`);
        const list = await store.listItems({ sourceId: 'arxiv-test', limit: 5 });
        console.log(`listed ${list.length}, first title: ${list[0]?.title?.slice(0, 60)}`);
    }
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('OK feedStore round-trip');
})().catch((err) => { console.error('SMOKE FAIL:', err); process.exit(1); });

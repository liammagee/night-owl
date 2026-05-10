// === Chrome tabs adapter ===
// Reads the user's currently-open Chrome tabs (macOS, AppleScript) and
// surfaces them as feed items. Unlike the polling adapters (arxiv etc.)
// this is intended for on-demand import, not a polling loop — so set
// intervalMs to a large number or leave the source disabled and trigger
// imports manually.
//
// Config: {
//   blocklist?: string[],         // overrides defaults entirely
//   extraBlocklist?: string[],    // appended to defaults
//   allowHomepages?: boolean,     // include `https://example.com/` etc.
//   allowGenericTitles?: boolean, // include "New Tab", "Google" etc.
//   appName?: string              // 'Google Chrome' (default), 'Brave Browser', 'Arc', ...
// }

const { listFilteredTabs } = require('../chromeTabs');

function urlToId(url) {
    // The store uniqueness is (source_id, external_id). Use the URL — same
    // tab the next day shouldn't insert a duplicate row.
    return url.length > 240 ? url.slice(0, 240) : url;
}

function normalize(tab, fetchedAt) {
    return {
        id: urlToId(tab.url),
        url: tab.url,
        title: tab.title || tab.url,
        author: null,
        summary: null,
        publishedAt: fetchedAt, // we don't know when the tab was opened; use import time
        tags: ['chrome-tab'],
        raw: { source: 'chrome-tab' }
    };
}

async function fetch({ config = {} } = {}) {
    const filterOpts = {
        blocklist: config.blocklist,
        extraBlocklist: config.extraBlocklist,
        allowHomepages: !!config.allowHomepages,
        allowGenericTitles: !!config.allowGenericTitles
    };
    const readerOpts = { appName: config.appName || 'Google Chrome' };
    const { tabs, total, dropped } = await listFilteredTabs(filterOpts, readerOpts);
    const fetchedAt = new Date().toISOString();
    const items = tabs.map((t) => normalize(t, fetchedAt));
    return { items, meta: { total, kept: items.length, dropped } };
}

module.exports = { fetch };

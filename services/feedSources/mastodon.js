// === Mastodon adapter ===
// Per-instance public search and tag timeline.
// Config: {
//   instances: ['mastodon.social', 'scholar.social', ...],
//   tags?: ['philosophy', 'cogsci'],   // each becomes a /api/v1/timelines/tag/<tag> call
//   query?: 'embodied cognition',       // /api/v2/search?type=statuses
//   limit?: number
// }
// No auth needed for public timelines; some instances may rate-limit anonymous traffic.

const axios = require('axios');

const TIMEOUT_MS = 15000;

function normalizeStatus(s, instance) {
    if (!s || !s.id) return null;
    const text = (s.content || '')
        .replace(/<br\s*\/?>(\s)?/g, '\n')
        .replace(/<\/p>\s*<p[^>]*>/g, '\n\n')
        .replace(/<[^>]+>/g, '')
        .trim();
    const tags = (s.tags || []).map((t) => `#${t.name}`);
    const handle = s.account?.acct || s.account?.username || 'unknown';
    return {
        id: `${instance}:${s.id}`,
        url: s.url || s.uri,
        title: text.slice(0, 140),
        author: s.account?.display_name ? `${s.account.display_name} (@${handle}@${instance})` : `@${handle}@${instance}`,
        summary: text.slice(0, 600),
        publishedAt: s.created_at,
        tags,
        raw: {
            instance,
            handle,
            replies: s.replies_count,
            reblogs: s.reblogs_count,
            favourites: s.favourites_count,
            sensitive: s.sensitive
        }
    };
}

async function fetchTagTimeline(instance, tag, limit) {
    const url = `https://${instance}/api/v1/timelines/tag/${encodeURIComponent(tag)}`;
    const res = await axios.get(url, { params: { limit }, timeout: TIMEOUT_MS });
    return (res.data || []).map((s) => normalizeStatus(s, instance)).filter(Boolean);
}

async function fetchSearch(instance, q, limit) {
    // v2 search supports unauthenticated requests on most instances for public statuses.
    const url = `https://${instance}/api/v2/search`;
    const res = await axios.get(url, {
        params: { q, type: 'statuses', limit, resolve: false },
        timeout: TIMEOUT_MS
    });
    return (res.data?.statuses || []).map((s) => normalizeStatus(s, instance)).filter(Boolean);
}

async function fetch({ config = {} } = {}) {
    const instances = (config.instances || ['mastodon.social']).filter(Boolean);
    const tags = (config.tags || []).filter(Boolean);
    const limit = Math.min(config.limit || 20, 40);
    const tasks = [];

    for (const instance of instances) {
        for (const tag of tags) {
            tasks.push(
                fetchTagTimeline(instance, tag, limit).catch((err) => {
                    console.warn(`[mastodon] ${instance}#${tag} failed:`, err.message);
                    return [];
                })
            );
        }
        if (config.query) {
            tasks.push(
                fetchSearch(instance, config.query, limit).catch((err) => {
                    console.warn(`[mastodon] ${instance} search failed:`, err.message);
                    return [];
                })
            );
        }
    }

    const lists = await Promise.all(tasks);
    return { items: lists.flat() };
}

module.exports = { fetch };

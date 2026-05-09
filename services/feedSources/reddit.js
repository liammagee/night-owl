// === reddit adapter ===
// https://www.reddit.com/r/<sub>/<sort>.json — public JSON, no auth.
// Reddit blocks default user agents; we identify ourselves explicitly.
// Config: { subreddits: string[], sort?: 'new'|'hot'|'top', limit?: number, query?: string }
// If `query` is set, uses /search.json across the listed subreddits instead of new/hot.

const axios = require('axios');

const USER_AGENT = 'machinespirits-ide:research-feed:v1 (by /u/anonymous)';
const TIMEOUT_MS = 15000;

async function fetchSubreddit(sub, sort, limit) {
    const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/${sort}.json`;
    const res = await axios.get(url, {
        params: { limit, raw_json: 1 },
        headers: { 'User-Agent': USER_AGENT },
        timeout: TIMEOUT_MS
    });
    return (res.data?.data?.children || []).map((c) => c.data);
}

async function searchSubreddits(subs, query, limit) {
    const restrict = subs.length === 1 ? `r/${subs[0]}` : null;
    const url = restrict
        ? `https://www.reddit.com/${restrict}/search.json`
        : 'https://www.reddit.com/search.json';
    const params = {
        q: query,
        sort: 'new',
        limit,
        raw_json: 1,
        restrict_sr: restrict ? 'on' : undefined
    };
    if (subs.length > 1) {
        // Reddit doesn't natively scope a multi-sub search; fold subreddit in.
        params.q = `${query} (${subs.map((s) => `subreddit:${s}`).join(' OR ')})`;
    }
    const res = await axios.get(url, {
        params,
        headers: { 'User-Agent': USER_AGENT },
        timeout: TIMEOUT_MS
    });
    return (res.data?.data?.children || []).map((c) => c.data);
}

function normalize(post) {
    if (!post || !post.id) return null;
    return {
        id: `t3_${post.id}`,
        url: `https://www.reddit.com${post.permalink}`,
        title: post.title,
        author: post.author ? `u/${post.author}` : null,
        summary: (post.selftext || '').slice(0, 600) || post.url || null,
        publishedAt: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
        tags: [post.subreddit ? `r/${post.subreddit}` : null, post.link_flair_text].filter(Boolean),
        raw: {
            subreddit: post.subreddit,
            score: post.score,
            num_comments: post.num_comments,
            external_url: post.url,
            domain: post.domain,
            over_18: post.over_18
        }
    };
}

async function fetch({ config = {} } = {}) {
    const subs = (config.subreddits || []).filter(Boolean);
    if (subs.length === 0) return { items: [] };
    const limit = Math.min(config.limit || 25, 100);
    const sort = config.sort || 'new';

    let raw = [];
    if (config.query) {
        raw = await searchSubreddits(subs, config.query, limit);
    } else {
        const lists = await Promise.all(subs.map((s) =>
            fetchSubreddit(s, sort, Math.ceil(limit / subs.length)).catch((err) => {
                console.warn(`[reddit] r/${s} failed:`, err.message);
                return [];
            })
        ));
        raw = lists.flat();
    }
    const items = raw.map(normalize).filter(Boolean);
    return { items };
}

module.exports = { fetch };

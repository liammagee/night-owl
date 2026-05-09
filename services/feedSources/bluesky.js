// === Bluesky / AT Protocol adapter ===
// https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts — public, no auth.
// Config: { query: string, lang?: string, limit?: number, sort?: 'top'|'latest' }

const axios = require('axios');

// Was public.api.bsky.app; that CDN now blocks anonymous traffic. api.bsky.app
// continues to serve unauthenticated read endpoints as of late 2025.
const ENDPOINT = 'https://api.bsky.app/xrpc/app.bsky.feed.searchPosts';
const TIMEOUT_MS = 15000;
const USER_AGENT = 'machinespirits-ide research-feed (+https://github.com/machinespirits)';

function postUri(uri, handle) {
    if (!uri) return null;
    const m = uri.match(/^at:\/\/[^/]+\/app\.bsky\.feed\.post\/([^/]+)$/);
    if (!m || !handle) return null;
    return `https://bsky.app/profile/${handle}/post/${m[1]}`;
}

function normalize(post) {
    if (!post || !post.uri) return null;
    const handle = post.author?.handle;
    const text = post.record?.text || '';
    const tags = (text.match(/#[A-Za-z0-9_]+/g) || []).slice(0, 8);
    return {
        id: post.uri,
        url: postUri(post.uri, handle),
        title: text.slice(0, 140),
        author: post.author?.displayName ? `${post.author.displayName} (@${handle})` : `@${handle}`,
        summary: text.slice(0, 600),
        publishedAt: post.record?.createdAt || post.indexedAt || null,
        tags,
        raw: {
            handle,
            replies: post.replyCount,
            reposts: post.repostCount,
            likes: post.likeCount,
            embed: post.embed?.$type || null
        }
    };
}

async function fetch({ config = {} } = {}) {
    const q = (config.query || '').trim();
    if (!q) return { items: [] };
    const params = {
        q,
        limit: Math.min(config.limit || 25, 100),
        sort: config.sort || 'latest'
    };
    if (config.lang) params.lang = config.lang;

    const res = await axios.get(ENDPOINT, {
        params,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        timeout: TIMEOUT_MS
    });
    const items = (res.data?.posts || []).map(normalize).filter(Boolean);
    return { items };
}

module.exports = { fetch };

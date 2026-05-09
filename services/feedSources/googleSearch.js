// === Google Programmable Search Engine (Custom Search JSON API) adapter ===
// https://developers.google.com/custom-search/v1/overview
// Requires: API key + Custom Search Engine ID (cx). Free quota 100/day, then ~$5/1000.
// Config: { query: string, cx: string, dateRestrict?: 'd1'|'w1'|'m1' }
// Credentials: store API key in credentialStore as `google-search:api-key`.

const axios = require('axios');

const ENDPOINT = 'https://www.googleapis.com/customsearch/v1';
const TIMEOUT_MS = 15000;

function normalize(item) {
    if (!item || !item.link) return null;
    return {
        id: item.link,
        url: item.link,
        title: item.title,
        author: item.displayLink || null,
        summary: item.snippet || null,
        publishedAt: item.pagemap?.metatags?.[0]?.['article:published_time'] ||
                     item.pagemap?.metatags?.[0]?.['og:updated_time'] ||
                     null,
        tags: [],
        raw: {
            displayLink: item.displayLink,
            mime: item.mime,
            fileFormat: item.fileFormat
        }
    };
}

async function fetch({ config = {}, credentials } = {}) {
    const apiKey = credentials?.apiKey;
    const cx = config.cx || credentials?.cx;
    const q = (config.query || '').trim();
    if (!apiKey || !cx || !q) {
        return { items: [], skipped: !apiKey ? 'no-api-key' : !cx ? 'no-cx' : 'no-query' };
    }
    const params = { key: apiKey, cx, q, num: Math.min(config.num || 10, 10) };
    if (config.dateRestrict) params.dateRestrict = config.dateRestrict;
    if (config.lr) params.lr = config.lr;

    const res = await axios.get(ENDPOINT, { params, timeout: TIMEOUT_MS });
    const items = (res.data?.items || []).map(normalize).filter(Boolean);
    return {
        items,
        meta: {
            totalResults: res.data?.searchInformation?.totalResults,
            quotaRemaining: res.headers?.['x-quota-remaining'] || null
        }
    };
}

module.exports = { fetch };

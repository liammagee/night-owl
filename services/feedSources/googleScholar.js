// === Google Scholar via SerpAPI ===
// Scholar has no official API. SerpAPI is the only reliable route; it costs.
// Disabled by default; user must opt in and provide a SerpAPI key.
//
// Config: { query: string, asYlo?: number, asYhi?: number, num?: number }
// Credentials: `google-scholar:serpapi-key`.

const axios = require('axios');

const ENDPOINT = 'https://serpapi.com/search';
const TIMEOUT_MS = 20000;

function normalize(r) {
    if (!r || !r.link) return null;
    const authors = (r.publication_info?.authors || []).map((a) => a.name).join(', ');
    return {
        id: r.result_id || r.link,
        url: r.link,
        title: r.title,
        author: authors || r.publication_info?.summary?.split(' - ')[0] || null,
        summary: r.snippet || null,
        publishedAt: r.publication_info?.summary?.match(/\b(19|20)\d{2}\b/)?.[0]
            ? `${r.publication_info.summary.match(/\b(19|20)\d{2}\b/)[0]}-01-01`
            : null,
        tags: r.publication_info?.summary ? [r.publication_info.summary.split(',')[0].trim()] : [],
        raw: {
            cited_by_count: r.inline_links?.cited_by?.total,
            related_link: r.inline_links?.related_pages_link,
            versions_count: r.inline_links?.versions?.total
        }
    };
}

async function fetch({ config = {}, credentials } = {}) {
    const apiKey = credentials?.apiKey;
    const q = (config.query || '').trim();
    if (!apiKey || !q) {
        return { items: [], skipped: !apiKey ? 'no-serpapi-key' : 'no-query' };
    }
    const params = {
        engine: 'google_scholar',
        q,
        api_key: apiKey,
        num: Math.min(config.num || 10, 20)
    };
    if (config.asYlo) params.as_ylo = config.asYlo;
    if (config.asYhi) params.as_yhi = config.asYhi;

    const res = await axios.get(ENDPOINT, { params, timeout: TIMEOUT_MS });
    const items = (res.data?.organic_results || []).map(normalize).filter(Boolean);
    return {
        items,
        meta: { searchInfo: res.data?.search_information || null }
    };
}

module.exports = { fetch };

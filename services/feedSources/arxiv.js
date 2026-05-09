// === arxiv adapter ===
// http://export.arxiv.org/api/query — public Atom XML, no auth.
// Config: { query: string, category?: string, maxResults?: number }
//   Either `query` (free text) or `category` (e.g. cs.AI). Combined with AND if both given.

const axios = require('axios');
const cheerio = require('cheerio');

const ENDPOINT = 'http://export.arxiv.org/api/query';
const USER_AGENT = 'machinespirits-ide research-feed (+https://github.com/machinespirits)';

function buildSearchExpr(config) {
    const parts = [];
    if (config.category) parts.push(`cat:${config.category}`);
    if (config.query) {
        const q = config.query.trim();
        if (q) parts.push(`all:${JSON.stringify(q).replace(/^"|"$/g, '"')}`);
    }
    return parts.join(' AND ') || 'all:*';
}

async function fetch({ config = {} } = {}) {
    const searchExpr = buildSearchExpr(config);
    const max = Math.min(config.maxResults || 25, 50);
    const params = {
        search_query: searchExpr,
        sortBy: 'submittedDate',
        sortOrder: 'descending',
        start: 0,
        max_results: max
    };

    const res = await axios.get(ENDPOINT, {
        params,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/atom+xml' },
        timeout: 20000,
        responseType: 'text'
    });

    const $ = cheerio.load(res.data, { xmlMode: true });
    const items = [];
    $('entry').each((_, el) => {
        const $e = $(el);
        const idUrl = $e.children('id').first().text().trim();
        const arxivId = idUrl.replace(/^https?:\/\/arxiv\.org\/abs\//, '');
        const title = $e.children('title').first().text().replace(/\s+/g, ' ').trim();
        const summary = $e.children('summary').first().text().replace(/\s+/g, ' ').trim();
        const published = $e.children('published').first().text().trim();
        const authors = [];
        $e.find('author > name').each((__, n) => authors.push($(n).text().trim()));
        const tags = [];
        $e.find('category').each((__, c) => {
            const term = $(c).attr('term');
            if (term) tags.push(term);
        });
        let pdfUrl = null;
        $e.find('link').each((__, l) => {
            const $l = $(l);
            if ($l.attr('title') === 'pdf' || $l.attr('type') === 'application/pdf') {
                pdfUrl = $l.attr('href');
            }
        });
        items.push({
            id: arxivId,
            url: idUrl,
            title,
            author: authors.join(', '),
            summary,
            publishedAt: published,
            tags,
            raw: {
                arxivId,
                authors,
                pdfUrl,
                primaryCategory: $e.find('arxiv\\:primary_category').attr('term') || null
            }
        });
    });
    return { items };
}

module.exports = { fetch, buildSearchExpr };

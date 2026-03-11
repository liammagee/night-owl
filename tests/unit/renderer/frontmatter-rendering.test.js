/**
 * Unit tests for YAML frontmatter parsing and rendering.
 * Tests the stripFrontmatter parser and renderFrontmatterHeader output.
 */

const escapeHtml = (value) =>
    String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

// Matches the plugin implementation of stripFrontmatter
function stripFrontmatter(content) {
    const str = typeof content === 'string' ? content : String(content || '');
    const match = str.match(/^(\uFEFF?\s*---\r?\n)([\s\S]*?\r?\n)(---\r?\n)/);
    if (!match) return { body: str, meta: null };

    const yaml = match[2];
    const body = str.slice(match[0].length);
    const meta = {};
    const lines = yaml.split(/\r?\n/);
    let currentKey = null;
    let currentBlock = null;

    const flushBlock = () => {
        if (currentKey && currentBlock === 'scalar' && Array.isArray(meta[currentKey])) {
            meta[currentKey] = meta[currentKey].join('\n').trim();
        }
        currentKey = null;
        currentBlock = null;
    };

    for (const line of lines) {
        const kv = line.match(/^(\w[\w-]*)\s*:\s*(.*)/);
        if (kv) {
            flushBlock();
            const key = kv[1].toLowerCase();
            let val = kv[2].trim();

            if (val === '|' || val === '>') {
                currentKey = key;
                currentBlock = 'scalar';
                meta[key] = [];
            } else if (val === '') {
                currentKey = key;
                currentBlock = 'list';
                meta[key] = [];
            } else if (val.startsWith('[') && val.endsWith(']')) {
                meta[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
            } else {
                meta[key] = val.replace(/^["']|["']$/g, '').trim();
            }
            continue;
        }

        if (currentKey && (line.startsWith('  ') || line.startsWith('\t'))) {
            const trimmed = line.replace(/^\s+/, '');
            if (currentBlock === 'list' && trimmed.startsWith('- ')) {
                const item = trimmed.slice(2).trim().replace(/^["']|["']$/g, '');
                if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
                meta[currentKey].push(item);
            } else if (currentBlock === 'scalar') {
                meta[currentKey].push(trimmed);
            } else if (currentBlock === 'list' && trimmed && !trimmed.startsWith('- ')) {
                if (Array.isArray(meta[currentKey]) && meta[currentKey].length === 0) {
                    currentBlock = 'scalar';
                }
                meta[currentKey].push(trimmed);
            }
            continue;
        }

        if (currentKey && line.trim() === '') {
            if (currentBlock === 'scalar') {
                meta[currentKey].push('');
            }
            continue;
        }

        flushBlock();
    }
    flushBlock();

    return { body, meta };
}

// Matches the plugin implementation of renderFrontmatterHeader
function renderFrontmatterHeader(meta) {
    if (!meta) return '';
    const parts = [];

    if (meta.title) {
        parts.push(`<h1 class="frontmatter-title">${escapeHtml(meta.title)}</h1>`);
    }
    if (meta.subtitle) {
        parts.push(`<p class="frontmatter-subtitle">${escapeHtml(meta.subtitle)}</p>`);
    }

    const authorStr = Array.isArray(meta.author)
        ? meta.author.map(a => typeof a === 'string' ? a : (a.name || '')).filter(Boolean).join(', ')
        : (meta.author || '');
    const sub = [authorStr, meta.date].filter(Boolean).map(escapeHtml).join(' — ');
    if (sub) {
        parts.push(`<p class="frontmatter-meta">${sub}</p>`);
    }

    if (meta.abstract) {
        const abstractText = Array.isArray(meta.abstract) ? meta.abstract.join(' ') : meta.abstract;
        parts.push(`<div class="frontmatter-abstract"><strong>Abstract:</strong> ${escapeHtml(abstractText)}</div>`);
    }

    if (meta.keywords) {
        const kws = Array.isArray(meta.keywords) ? meta.keywords : meta.keywords.split(',').map(s => s.trim());
        if (kws.length > 0) {
            const tags = kws.map(k => `<span class="frontmatter-keyword">${escapeHtml(k)}</span>`).join(' ');
            parts.push(`<div class="frontmatter-keywords">${tags}</div>`);
        }
    }

    if (parts.length) {
        parts.push('<hr class="frontmatter-separator">');
    }
    return parts.length ? `<header class="frontmatter-header">${parts.join('\n')}</header>` : '';
}


describe('stripFrontmatter', () => {
    test('parses simple key: value fields', () => {
        const md = '---\ntitle: My Paper\nauthor: Jane Smith\ndate: 2024-03-15\n---\nBody text.';
        const { body, meta } = stripFrontmatter(md);

        expect(meta.title).toBe('My Paper');
        expect(meta.author).toBe('Jane Smith');
        expect(meta.date).toBe('2024-03-15');
        expect(body).toBe('Body text.');
    });

    test('strips quotes from values', () => {
        const md = '---\ntitle: "Quoted Title"\nauthor: \'Single Quoted\'\n---\nBody.';
        const { meta } = stripFrontmatter(md);

        expect(meta.title).toBe('Quoted Title');
        expect(meta.author).toBe('Single Quoted');
    });

    test('parses inline arrays', () => {
        const md = '---\nkeywords: [philosophy, dialectics, pedagogy]\n---\nBody.';
        const { meta } = stripFrontmatter(md);

        expect(meta.keywords).toEqual(['philosophy', 'dialectics', 'pedagogy']);
    });

    test('parses inline arrays with quoted items', () => {
        const md = '---\nkeywords: ["digital humanities", \'AI\']\n---\nBody.';
        const { meta } = stripFrontmatter(md);

        expect(meta.keywords).toEqual(['digital humanities', 'AI']);
    });

    test('parses YAML list items', () => {
        const md = '---\nauthor:\n  - Jane Smith\n  - John Doe\n---\nBody.';
        const { meta } = stripFrontmatter(md);

        expect(meta.author).toEqual(['Jane Smith', 'John Doe']);
    });

    test('parses block scalar with pipe', () => {
        const md = '---\nabstract: |\n  This paper explores the relationship\n  between Hegel and digital pedagogy.\n---\nBody.';
        const { meta } = stripFrontmatter(md);

        expect(meta.abstract).toContain('This paper explores');
        expect(meta.abstract).toContain('between Hegel');
    });

    test('parses block scalar with >', () => {
        const md = '---\nabstract: >\n  Folded text that should\n  be joined together.\n---\nBody.';
        const { meta } = stripFrontmatter(md);

        expect(meta.abstract).toContain('Folded text');
        expect(meta.abstract).toContain('be joined');
    });

    test('handles subtitle field', () => {
        const md = '---\ntitle: Main Title\nsubtitle: A Subtitle\n---\nBody.';
        const { meta } = stripFrontmatter(md);

        expect(meta.subtitle).toBe('A Subtitle');
    });

    test('handles bibliography and csl fields', () => {
        const md = '---\nbibliography: references.bib\ncsl: chicago-author-date.csl\n---\nBody.';
        const { meta } = stripFrontmatter(md);

        expect(meta.bibliography).toBe('references.bib');
        expect(meta.csl).toBe('chicago-author-date.csl');
    });

    test('returns null meta when no frontmatter', () => {
        const md = 'Just regular text.';
        const { body, meta } = stripFrontmatter(md);

        expect(meta).toBeNull();
        expect(body).toBe('Just regular text.');
    });

    test('handles BOM at start of file', () => {
        const md = '\uFEFF---\ntitle: BOM Test\n---\nBody.';
        const { meta } = stripFrontmatter(md);

        expect(meta.title).toBe('BOM Test');
    });

    test('handles multiple fields in full academic frontmatter', () => {
        const md = `---
title: "Hegel and Digital Pedagogy"
subtitle: "A Phenomenological Approach"
author: Liam Magee
date: 2024-03-15
abstract: |
  This paper explores how Hegel's dialectical method
  can inform digital pedagogy practices.
keywords: [philosophy, dialectics, digital humanities]
bibliography: references.bib
---
# Introduction
Body text here.`;

        const { body, meta } = stripFrontmatter(md);

        expect(meta.title).toBe('Hegel and Digital Pedagogy');
        expect(meta.subtitle).toBe('A Phenomenological Approach');
        expect(meta.author).toBe('Liam Magee');
        expect(meta.date).toBe('2024-03-15');
        expect(meta.abstract).toContain("Hegel's dialectical method");
        expect(meta.keywords).toEqual(['philosophy', 'dialectics', 'digital humanities']);
        expect(meta.bibliography).toBe('references.bib');
        expect(body).toContain('# Introduction');
    });
});


describe('renderFrontmatterHeader', () => {
    test('renders title as h1', () => {
        const html = renderFrontmatterHeader({ title: 'Test Title' });
        expect(html).toContain('<h1 class="frontmatter-title">Test Title</h1>');
    });

    test('renders subtitle', () => {
        const html = renderFrontmatterHeader({ title: 'Title', subtitle: 'A Subtitle' });
        expect(html).toContain('<p class="frontmatter-subtitle">A Subtitle</p>');
    });

    test('renders author and date', () => {
        const html = renderFrontmatterHeader({ author: 'Jane Smith', date: '2024' });
        expect(html).toContain('Jane Smith');
        expect(html).toContain('2024');
        expect(html).toContain('frontmatter-meta');
    });

    test('renders author array as comma-separated', () => {
        const html = renderFrontmatterHeader({ author: ['Jane Smith', 'John Doe'] });
        expect(html).toContain('Jane Smith, John Doe');
    });

    test('renders abstract with label', () => {
        const html = renderFrontmatterHeader({ abstract: 'This paper explores...' });
        expect(html).toContain('frontmatter-abstract');
        expect(html).toContain('<strong>Abstract:</strong>');
        expect(html).toContain('This paper explores...');
    });

    test('renders keywords as tags', () => {
        const html = renderFrontmatterHeader({ keywords: ['philosophy', 'AI'] });
        expect(html).toContain('frontmatter-keywords');
        expect(html).toContain('<span class="frontmatter-keyword">philosophy</span>');
        expect(html).toContain('<span class="frontmatter-keyword">AI</span>');
    });

    test('renders keyword string as comma-separated tags', () => {
        const html = renderFrontmatterHeader({ keywords: 'philosophy, AI, pedagogy' });
        expect(html).toContain('<span class="frontmatter-keyword">philosophy</span>');
        expect(html).toContain('<span class="frontmatter-keyword">AI</span>');
        expect(html).toContain('<span class="frontmatter-keyword">pedagogy</span>');
    });

    test('wraps output in header element', () => {
        const html = renderFrontmatterHeader({ title: 'Test' });
        expect(html).toMatch(/^<header class="frontmatter-header">/);
        expect(html).toContain('</header>');
    });

    test('includes separator at end', () => {
        const html = renderFrontmatterHeader({ title: 'Test' });
        expect(html).toContain('<hr class="frontmatter-separator">');
    });

    test('returns empty string for null meta', () => {
        expect(renderFrontmatterHeader(null)).toBe('');
    });

    test('returns empty string for meta with no renderable fields', () => {
        expect(renderFrontmatterHeader({ bibliography: 'refs.bib' })).toBe('');
    });

    test('escapes HTML in values', () => {
        const html = renderFrontmatterHeader({ title: 'Test <script>alert("xss")</script>' });
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });

    test('renders full academic frontmatter', () => {
        const html = renderFrontmatterHeader({
            title: 'Hegel and Digital Pedagogy',
            subtitle: 'A Phenomenological Approach',
            author: 'Liam Magee',
            date: '2024-03-15',
            abstract: "This paper explores how Hegel's dialectical method can inform digital pedagogy.",
            keywords: ['philosophy', 'dialectics', 'digital humanities']
        });

        expect(html).toContain('Hegel and Digital Pedagogy');
        expect(html).toContain('A Phenomenological Approach');
        expect(html).toContain('Liam Magee');
        expect(html).toContain('2024-03-15');
        expect(html).toContain('Abstract:');
        expect(html).toContain('frontmatter-keyword');
    });
});

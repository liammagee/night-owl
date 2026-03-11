/**
 * Integration test: citation database → bibEntries → rendered preview pipeline.
 *
 * Constructs a short academic paper with citation references, loads citations
 * from a mock database, renders the paper, then verifies that updates to the
 * database propagate through to the rendered output.
 *
 * Pipeline under test:
 *   DB (mock IPC) → loadDatabaseCitations() → window.bibEntries
 *     → TechneCitationRenderer.renderCitations(html) → rendered HTML
 *     → invalidateCache() → re-render reflects DB changes
 */

// ─── Setup: load the real citation renderer IIFE ─────────────────

const fs = require('fs');
const path = require('path');

// Load and eval the citation renderer (an IIFE that attaches to window)
const citationRendererSource = fs.readFileSync(
  path.join(__dirname, '../../../plugins/techne-markdown-renderer/citationRenderer.js'),
  'utf8'
);

// ─── Mock database citations (simulates IPC responses) ───────────

const INITIAL_DB_CITATIONS = [
  {
    id: 1,
    citation_key: 'hegel1807phenomenology',
    citation_type: 'book',
    title: 'Phenomenology of Spirit',
    authors: 'Hegel, Georg Wilhelm Friedrich',
    publication_year: 1977,
    publisher: 'Oxford University Press',
    publisher_place: 'Oxford'
  },
  {
    id: 2,
    citation_key: 'kojeve1969introduction',
    citation_type: 'book',
    title: 'Introduction to the Reading of Hegel',
    authors: 'Kojève, Alexandre',
    publication_year: 1969,
    publisher: 'Basic Books',
    publisher_place: 'New York'
  },
  {
    id: 3,
    citation_key: 'pippin2011realizingfreedom',
    citation_type: 'book',
    title: 'Hegel on Self-Consciousness: Desire and Death in the Phenomenology of Spirit',
    authors: 'Pippin, Robert B.',
    publication_year: 2011,
    publisher: 'Princeton University Press'
  },
  {
    id: 4,
    citation_key: 'brandom2019spirittrust',
    citation_type: 'book',
    title: 'A Spirit of Trust: A Reading of Hegel\'s Phenomenology',
    authors: 'Brandom, Robert B.',
    publication_year: 2019,
    publisher: 'Harvard University Press',
    publisher_place: 'Cambridge, MA'
  }
];

// A short paper that references the citations above
const PAPER_MARKDOWN = `
# The Dialectic of Recognition

Hegel's account of self-consciousness unfolds through the dialectic of
recognition, in which two self-consciousnesses confront each other and
discover that selfhood requires mutual acknowledgment [@hegel1807phenomenology].

Kojève's influential reading reframes this encounter as a life-and-death
struggle for pure prestige [@kojeve1969introduction, pp. 3-30]. This
interpretation shaped a generation of French philosophy.

More recent scholarship has challenged Kojève's emphasis on struggle.
Pippin argues that recognition is better understood as a normative
achievement rather than a violent confrontation [@pippin2011realizingfreedom].
Brandom extends this line, reading recognition as a structure of reciprocal
authority and responsibility [@brandom2019spirittrust, ch. 8].

These readings suggest that the master-slave dialectic is not about
domination but about the social conditions of rational agency
[@hegel1807phenomenology; @pippin2011realizingfreedom; @brandom2019spirittrust].
`.trim();

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Simulate computeCitationKey from renderer.js — generates a lookup key
 * from a database citation record. Must match the real implementation.
 */
function computeCitationKey(citation) {
  if (citation.key && typeof citation.key === 'string') return citation.key;
  if (citation.citation_key && typeof citation.citation_key === 'string') return citation.citation_key;

  let key = '';
  if (citation.authors) {
    const authors = citation.authors.split(/\s+and\s+/i);
    const firstAuthor = (authors[0] || '').trim();
    const lastName = firstAuthor.includes(',')
      ? firstAuthor.split(',')[0].trim()
      : firstAuthor.split(/\s+/).pop() || firstAuthor;
    key += lastName.replace(/[^A-Za-z]/g, '');
  } else {
    key += 'Citation';
  }
  key += (citation.publication_year || new Date().getFullYear());
  if (citation.title) {
    const cleanedWords = citation.title.split(/\s+/)
      .map(w => w.replace(/[^A-Za-z]/g, '')).filter(Boolean);
    const significant = cleanedWords.filter(w => w.length > 3);
    const chosen = (significant.length > 0 ? significant : cleanedWords).slice(0, 2);
    if (chosen.length > 0) key += chosen.join('');
  }
  citation.key = key;
  return key;
}

/**
 * Simulate loadDatabaseCitations from renderer.js — converts DB records
 * to the bibEntry format the citation renderer expects.
 */
function loadDatabaseCitations(dbCitations) {
  return dbCitations.map(citation => ({
    key: computeCitationKey({ ...citation }),
    type: citation.citation_type || 'article',
    title: citation.title || 'Untitled',
    author: citation.authors || 'Unknown',
    year: citation.publication_year ? citation.publication_year.toString() : '',
    journal: citation.journal || '',
    doi: citation.doi || '',
    url: citation.url || '',
    source: 'database',
    sourceDetail: 'Citation Manager'
  }));
}

/**
 * Simulate the refresh pipeline: load DB → update bibEntries → invalidate cache.
 */
function refreshBibEntries(dbCitations) {
  const dbEntries = loadDatabaseCitations(dbCitations);
  const bibSourced = window.bibEntries.filter(e => e.source !== 'database');
  window.bibEntries.length = 0;
  window.bibEntries.push(...bibSourced, ...dbEntries);
  if (window.TechneCitationRenderer?.invalidateCache) {
    window.TechneCitationRenderer.invalidateCache();
  }
  return dbEntries;
}

/**
 * Convert markdown to simple HTML (mimics marked.parse for plain paragraphs).
 */
function markdownToHtml(md) {
  return md
    .split(/\n{2,}/)
    .map(block => {
      block = block.trim();
      if (!block) return '';
      if (block.startsWith('# ')) return `<h1>${block.slice(2)}</h1>`;
      if (block.startsWith('## ')) return `<h2>${block.slice(3)}</h2>`;
      return `<p>${block.replace(/\n/g, ' ')}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Citation DB → Preview Pipeline', () => {
  beforeEach(() => {
    // Fresh bibEntries for each test
    window.bibEntries = [];
    // Remove any prior renderer so the IIFE re-installs
    delete window.TechneCitationRenderer;
    // Eval the real citation renderer IIFE
    // eslint-disable-next-line no-eval
    eval(citationRendererSource);
  });

  test('citation renderer is installed after eval', () => {
    expect(window.TechneCitationRenderer).toBeDefined();
    expect(typeof window.TechneCitationRenderer.renderCitations).toBe('function');
    expect(typeof window.TechneCitationRenderer.invalidateCache).toBe('function');
  });

  test('initial render with empty DB shows unknown citations', () => {
    const html = markdownToHtml(PAPER_MARKDOWN);
    const rendered = window.TechneCitationRenderer.renderCitations(html, {
      includeBibliography: true
    });

    // All four citation keys should be marked as unknown
    expect(rendered).toContain('citation-unknown');
    expect(rendered).toContain('@hegel1807phenomenology');
    expect(rendered).toContain('@kojeve1969introduction');
    expect(rendered).toContain('@pippin2011realizingfreedom');
    expect(rendered).toContain('@brandom2019spirittrust');

    // No bibliography should be generated (no known citations)
    expect(rendered).not.toContain('bibliography-section');
  });

  test('after loading DB citations, render shows formatted references', () => {
    // Load citations from the "database"
    refreshBibEntries(INITIAL_DB_CITATIONS);

    const html = markdownToHtml(PAPER_MARKDOWN);
    const rendered = window.TechneCitationRenderer.renderCitations(html, {
      includeBibliography: true
    });

    // Inline citations should show author-year, not raw keys
    expect(rendered).not.toContain('citation-unknown');
    expect(rendered).toContain('Hegel');
    expect(rendered).toContain('1977');
    expect(rendered).toContain('Kojève');   // note: accented character
    expect(rendered).toContain('1969');
    expect(rendered).toContain('Pippin');
    expect(rendered).toContain('2011');
    expect(rendered).toContain('Brandom');
    expect(rendered).toContain('2019');

    // Suffixes should be preserved
    expect(rendered).toContain('pp. 3-30');
    expect(rendered).toContain('ch. 8');

    // Multi-citation group should render all three
    expect(rendered).toMatch(/Hegel.*Pippin.*Brandom|Brandom.*Pippin.*Hegel/s);

    // Bibliography section should exist
    expect(rendered).toContain('bibliography-section');
    expect(rendered).toContain('Phenomenology of Spirit');
    expect(rendered).toContain('Introduction to the Reading of Hegel');
    expect(rendered).toContain('Spirit of Trust');
  });

  test('updating a citation in the DB refreshes the rendered output', () => {
    // Initial load
    refreshBibEntries(INITIAL_DB_CITATIONS);

    const html = markdownToHtml(PAPER_MARKDOWN);
    const rendered1 = window.TechneCitationRenderer.renderCitations(html, {
      includeBibliography: true
    });

    // Verify initial state
    expect(rendered1).toContain('1977');
    expect(rendered1).not.toContain('2018');

    // Simulate updating Hegel's publication year in the DB
    const updatedCitations = INITIAL_DB_CITATIONS.map(c =>
      c.id === 1
        ? { ...c, publication_year: 2018, title: 'Phenomenology of Spirit (New Translation)' }
        : c
    );

    // Refresh pipeline: load updated DB → invalidate cache → re-render
    refreshBibEntries(updatedCitations);

    const rendered2 = window.TechneCitationRenderer.renderCitations(html, {
      includeBibliography: true
    });

    // The new year should appear in inline citations
    expect(rendered2).toContain('2018');
    // The old year should be gone from Hegel's inline citation
    // (other citations still have their years, so check the bibliography)
    expect(rendered2).toContain('Phenomenology of Spirit (New Translation)');
  });

  test('adding a new citation to the DB makes it available for rendering', () => {
    // Start with initial set
    refreshBibEntries(INITIAL_DB_CITATIONS);

    // Paper that references a citation not yet in the DB
    const paperWithNew = `
The linguistic turn in Hegel scholarship owes much to Brandom
[@brandom2019spirittrust] and also to Taylor [@taylor1975hegel].
`.trim();

    const html1 = markdownToHtml(paperWithNew);
    const rendered1 = window.TechneCitationRenderer.renderCitations(html1, {
      includeBibliography: true
    });

    // Taylor should be unknown
    expect(rendered1).toContain('citation-unknown');
    expect(rendered1).toContain('@taylor1975hegel');
    // But Brandom should be known
    expect(rendered1).toContain('Brandom');
    expect(rendered1).not.toContain('@brandom2019spirittrust');

    // Now add Taylor to the DB
    const expandedCitations = [
      ...INITIAL_DB_CITATIONS,
      {
        id: 5,
        citation_key: 'taylor1975hegel',
        citation_type: 'book',
        title: 'Hegel',
        authors: 'Taylor, Charles',
        publication_year: 1975,
        publisher: 'Cambridge University Press'
      }
    ];

    refreshBibEntries(expandedCitations);

    const rendered2 = window.TechneCitationRenderer.renderCitations(html1, {
      includeBibliography: true
    });

    // Now Taylor should render properly
    expect(rendered2).not.toContain('citation-unknown');
    expect(rendered2).toContain('Taylor');
    expect(rendered2).toContain('1975');
    // Bibliography should include both
    expect(rendered2).toContain('bibliography-section');
  });

  test('removing a citation from the DB makes it unknown again', () => {
    refreshBibEntries(INITIAL_DB_CITATIONS);

    const html = markdownToHtml('Kojève argues [@kojeve1969introduction] that recognition is struggle.');
    const rendered1 = window.TechneCitationRenderer.renderCitations(html, {
      includeBibliography: true
    });

    expect(rendered1).toContain('Kojève');
    expect(rendered1).toContain('1969');
    expect(rendered1).not.toContain('citation-unknown');

    // Remove Kojève from the DB
    const withoutKojeve = INITIAL_DB_CITATIONS.filter(c => c.id !== 2);
    refreshBibEntries(withoutKojeve);

    const rendered2 = window.TechneCitationRenderer.renderCitations(html, {
      includeBibliography: true
    });

    // Should now show as unknown
    expect(rendered2).toContain('citation-unknown');
    expect(rendered2).toContain('@kojeve1969introduction');
  });

  test('updating author names propagates to inline citations', () => {
    refreshBibEntries(INITIAL_DB_CITATIONS);

    const html = markdownToHtml(
      'See [@pippin2011realizingfreedom] for a normative reading.'
    );
    const rendered1 = window.TechneCitationRenderer.renderCitations(html);

    expect(rendered1).toContain('Pippin');

    // Simulate correcting the author field (e.g., adding a co-author)
    const updated = INITIAL_DB_CITATIONS.map(c =>
      c.id === 3
        ? { ...c, authors: 'Pippin, Robert B. and McDowell, John' }
        : c
    );
    refreshBibEntries(updated);

    const rendered2 = window.TechneCitationRenderer.renderCitations(html);

    // Two authors → "Pippin & McDowell"
    expect(rendered2).toContain('Pippin');
    expect(rendered2).toContain('McDowell');
  });

  test('cache invalidation forces re-render with fresh data', () => {
    refreshBibEntries(INITIAL_DB_CITATIONS);

    const html = markdownToHtml('[@hegel1807phenomenology]');

    // First render — gets cached
    const rendered1 = window.TechneCitationRenderer.renderCitations(html);
    expect(rendered1).toContain('Hegel');

    // Mutate bibEntries directly WITHOUT invalidating cache
    window.bibEntries.length = 0;
    const stale = window.TechneCitationRenderer.renderCitations(html);
    // Should return cached result (still shows Hegel)
    expect(stale).toContain('Hegel');

    // Now invalidate and re-render
    window.TechneCitationRenderer.invalidateCache();
    const fresh = window.TechneCitationRenderer.renderCitations(html);
    // bibEntries is empty, so citation should now be unknown
    expect(fresh).toContain('citation-unknown');
  });

  test('full paper renders complete bibliography in correct order', () => {
    refreshBibEntries(INITIAL_DB_CITATIONS);

    const html = markdownToHtml(PAPER_MARKDOWN);
    const rendered = window.TechneCitationRenderer.renderCitations(html, {
      includeBibliography: true
    });

    // Bibliography should contain all four cited works
    const bibSection = rendered.substring(rendered.indexOf('bibliography-section'));
    expect(bibSection).toContain('Brandom');
    expect(bibSection).toContain('Hegel');
    expect(bibSection).toContain('Kojève');
    expect(bibSection).toContain('Pippin');

    // Should be sorted alphabetically by author
    const brandomPos = bibSection.indexOf('Brandom');
    const hegelPos = bibSection.indexOf('Hegel');
    const kojevePos = bibSection.indexOf('Koj');
    const pippinPos = bibSection.indexOf('Pippin');

    expect(brandomPos).toBeLessThan(hegelPos);
    expect(hegelPos).toBeLessThan(kojevePos);
    expect(kojevePos).toBeLessThan(pippinPos);
  });
});

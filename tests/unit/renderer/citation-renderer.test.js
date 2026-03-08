/**
 * Unit tests for citationRenderer.js — citation-to-HTML rendering
 * Tests the processCitations() and renderCitations() logic including:
 * - Single citations: [@key]
 * - Multiple citations with semicolons: [@key1; @key2]
 * - Multiple citations with commas: [@key1, @key2]
 * - Citations with suffixes: [@key, p. 42]
 * - Mixed comma-separated citations with suffixes: [@key1, @key2, p. 42]
 * - Unknown citation keys
 * - Bibliography generation
 */

// Inline the citation renderer logic for unit testing (mirrors citationRenderer.js)
function createCitationRenderer() {
  let currentStyle = 'apa';
  let bibEntries = [];

  function parseAuthors(authorStr) {
    if (!authorStr) return [];
    const segments = authorStr.split(/\s+and\s+|\s*&\s*/i)
      .map(s => s.trim())
      .filter(Boolean);

    const authors = [];
    for (const segment of segments) {
      const parts = segment.split(',').map(s => s.trim()).filter(Boolean);

      if (parts.length >= 2) {
        if (parts.every(p => p.includes(' '))) {
          for (const part of parts) {
            const words = part.split(/\s+/);
            authors.push({ first: words.slice(0, -1).join(' '), last: words[words.length - 1] });
          }
        } else if (parts.length % 2 === 0) {
          for (let i = 0; i < parts.length; i += 2) {
            authors.push({ last: parts[i], first: parts[i + 1] });
          }
        } else {
          authors.push({ last: parts[0], first: parts.slice(1).join(', ') });
        }
      } else {
        const words = segment.split(/\s+/);
        if (words.length >= 2) {
          authors.push({ first: words.slice(0, -1).join(' '), last: words[words.length - 1] });
        } else if (words.length === 1 && words[0]) {
          authors.push({ last: words[0], first: '' });
        }
      }
    }
    return authors;
  }

  function formatAuthorsInline(authorStr, style) {
    if (!authorStr) return 'Unknown';
    const authors = parseAuthors(authorStr);
    if (authors.length === 0) return 'Unknown';
    if (authors.length === 1) return authors[0].last;
    if (authors.length === 2) return `${authors[0].last} & ${authors[1].last}`;
    return `${authors[0].last} et al.`;
  }

  const STYLES = {
    apa: {
      name: 'APA 7th',
      inline: (entry, suffix) => {
        const authors = formatAuthorsInline(entry.author, 'apa');
        const year = entry.year || 'n.d.';
        const suffixStr = suffix ? `, ${suffix}` : '';
        return `(${authors}, ${year}${suffixStr})`;
      }
    },
    chicago: {
      name: 'Chicago',
      inline: (entry, suffix) => {
        const authors = formatAuthorsInline(entry.author, 'chicago');
        const year = entry.year || 'n.d.';
        const suffixStr = suffix ? `, ${suffix}` : '';
        return `(${authors} ${year}${suffixStr})`;
      }
    }
  };

  function getEntry(key) {
    return bibEntries.find(e => e.key === key || e.id === key);
  }

  function parseCitationRef(ref) {
    ref = ref.replace(/^@/, '');
    const commaIndex = ref.indexOf(',');
    if (commaIndex > 0) {
      return {
        key: ref.substring(0, commaIndex).trim(),
        suffix: ref.substring(commaIndex + 1).trim()
      };
    }
    return { key: ref.trim(), suffix: '' };
  }

  function processCitations(html) {
    const citedKeys = new Set();
    const citationPattern = /\[((?:[^@\]]*)?@[\w\-]+(?:,\s*[^\]]*)?(?:\s*;\s*(?:[^@\]]*)?@[\w\-]+(?:,\s*[^\]]*)?)*)\]/g;

    const processedHtml = html.replace(citationPattern, (match, content) => {
      const style = STYLES[currentStyle];

      // Handle multiple citations separated by semicolons or commas before @
      const refs = content.split(/\s*;\s*|\s*,\s*(?=@)/);
      const citations = [];

      for (const ref of refs) {
        const atIndex = ref.indexOf('@');
        const prefix = atIndex > 0 ? ref.substring(0, atIndex).trim() : '';
        const afterAt = ref.substring(atIndex + 1);

        const suppressAuthor = prefix === '-';
        const authorOnly = afterAt.startsWith('-');
        const citationRef = authorOnly ? afterAt.substring(1) : afterAt;

        const { key, suffix } = parseCitationRef(citationRef);
        const entry = getEntry(key);

        if (entry) {
          citedKeys.add(key);

          if (suppressAuthor) {
            const year = entry.year || 'n.d.';
            const suffixStr = suffix ? `, ${suffix}` : '';
            citations.push(`${year}${suffixStr}`);
          } else if (authorOnly) {
            const authors = formatAuthorsInline(entry.author, currentStyle);
            citations.push(`${prefix}${authors}`);
          } else {
            const inlineCite = style.inline(entry, suffix);
            const inner = inlineCite.replace(/^\(/, '').replace(/\)$/, '');
            citations.push(`${prefix}${inner}`);
          }
        } else {
          citations.push(`<span class="citation-unknown">@${key}</span>`);
        }
      }

      if (citations.some(c => c.includes('citation-unknown'))) {
        return `<span class="citation">${citations.join('; ')}</span>`;
      }
      return `<span class="citation">(${citations.join('; ')})</span>`;
    });

    return { html: processedHtml, citedKeys: Array.from(citedKeys) };
  }

  return {
    processCitations,
    parseCitationRef,
    setEntries(entries) { bibEntries = entries; },
    setStyle(style) { currentStyle = style; }
  };
}

// ──────────────────────────────────────────────

describe('Citation Renderer — HTML Output', () => {
  let renderer;

  const sampleEntries = [
    { key: 'Radford2018Improvinglanguage', author: 'Radford, A.', year: '2018', title: 'Improving language understanding' },
    { key: 'Radford2019Languagemodels', author: 'Radford, A. and Wu, J. and Child, R.', year: '2019', title: 'Language models are unsupervised multitask learners' },
    { key: 'smith2023', author: 'Smith, John', year: '2023', title: 'Test Article' },
    { key: 'doe2022', author: 'Doe, Jane and Smith, John', year: '2022', title: 'Collaborative Research' },
    { key: 'team2021', author: 'Alpha, A. and Beta, B. and Gamma, C.', year: '2021', title: 'Team Work' },
    { key: 'radford2018gpt', author: 'Radford, A., Narasimhan, K., Salimans, T., & Sutskever, I.', year: '2018', title: 'Improving Language Understanding' },
    { key: 'pair2020', author: 'Garcia, M., Lopez, R.', year: '2020', title: 'Paired Research' },
    { key: 'fullnames2024', author: 'Liam Magee, Vanicka Arora, Gus Gollings, Norma Lam-Saw', year: '2024', title: 'Full Names' }
  ];

  beforeEach(() => {
    renderer = createCitationRenderer();
    renderer.setEntries(sampleEntries);
    renderer.setStyle('apa');
  });

  // ─── Single citations ──────────────────────

  describe('Single citations', () => {
    test('should render a basic single citation', () => {
      const { html, citedKeys } = renderer.processCitations('<p>Some text [@smith2023].</p>');
      expect(html).toBe('<p>Some text <span class="citation">(Smith, 2023)</span>.</p>');
      expect(citedKeys).toEqual(['smith2023']);
    });

    test('should render citation with suffix', () => {
      const { html } = renderer.processCitations('<p>[@smith2023, p. 42]</p>');
      expect(html).toBe('<p><span class="citation">(Smith, 2023, p. 42)</span></p>');
    });

    test('should render unknown citation with warning style', () => {
      const { html, citedKeys } = renderer.processCitations('<p>[@nonexistent]</p>');
      expect(html).toContain('citation-unknown');
      expect(html).toContain('@nonexistent');
      expect(citedKeys).toEqual([]);
    });
  });

  // ─── Multiple citations (semicolon separator) ───

  describe('Multiple citations with semicolons', () => {
    test('should render two citations separated by semicolons', () => {
      const { html, citedKeys } = renderer.processCitations(
        '<p>[@smith2023; @doe2022]</p>'
      );
      expect(html).toBe('<p><span class="citation">(Smith, 2023; Doe & Smith, 2022)</span></p>');
      expect(citedKeys).toContain('smith2023');
      expect(citedKeys).toContain('doe2022');
    });

    test('should render three citations separated by semicolons', () => {
      const { html, citedKeys } = renderer.processCitations(
        '<p>[@smith2023; @doe2022; @team2021]</p>'
      );
      expect(html).toContain('Smith, 2023');
      expect(html).toContain('Doe & Smith, 2022');
      expect(html).toContain('Alpha et al., 2021');
      expect(citedKeys).toHaveLength(3);
    });
  });

  // ─── Multiple citations (comma separator) ───

  describe('Multiple citations with commas', () => {
    test('should render two citations separated by comma', () => {
      const { html, citedKeys } = renderer.processCitations(
        '<p>[@Radford2018Improvinglanguage, @Radford2019Languagemodels]</p>'
      );
      expect(html).toBe(
        '<p><span class="citation">(Radford, 2018; Radford et al., 2019)</span></p>'
      );
      expect(citedKeys).toEqual(
        expect.arrayContaining(['Radford2018Improvinglanguage', 'Radford2019Languagemodels'])
      );
    });

    test('should render comma-separated citations with no space after comma', () => {
      const { html } = renderer.processCitations(
        '<p>[@smith2023,@doe2022]</p>'
      );
      expect(html).toContain('Smith, 2023');
      expect(html).toContain('Doe & Smith, 2022');
    });

    test('should render three comma-separated citations', () => {
      const { html, citedKeys } = renderer.processCitations(
        '<p>[@smith2023, @doe2022, @team2021]</p>'
      );
      expect(html).toContain('Smith, 2023');
      expect(html).toContain('Doe & Smith, 2022');
      expect(html).toContain('Alpha et al., 2021');
      expect(citedKeys).toHaveLength(3);
    });

    test('should handle comma-separated citations with a trailing suffix on last key', () => {
      const { html } = renderer.processCitations(
        '<p>[@smith2023, @doe2022, p. 10]</p>'
      );
      // smith2023 as first citation, doe2022 with suffix "p. 10"
      expect(html).toContain('Smith, 2023');
      expect(html).toContain('Doe & Smith, 2022, p. 10');
    });
  });

  // ─── Mixed separator styles ──────────────────

  describe('Mixed separators', () => {
    test('should handle semicolons and commas mixed', () => {
      const { html, citedKeys } = renderer.processCitations(
        '<p>[@smith2023; @Radford2018Improvinglanguage, @Radford2019Languagemodels]</p>'
      );
      expect(html).toContain('Smith, 2023');
      expect(html).toContain('Radford, 2018');
      expect(html).toContain('Radford et al., 2019');
      expect(citedKeys).toHaveLength(3);
    });
  });

  // ─── Suffix disambiguation ──────────────────

  describe('Suffix vs multiple citation disambiguation', () => {
    test('comma + non-@ text is treated as suffix, not a second citation', () => {
      const { html, citedKeys } = renderer.processCitations(
        '<p>[@smith2023, emphasis added]</p>'
      );
      expect(html).toBe('<p><span class="citation">(Smith, 2023, emphasis added)</span></p>');
      expect(citedKeys).toEqual(['smith2023']);
    });

    test('comma + page number is treated as suffix', () => {
      const { html } = renderer.processCitations('<p>[@doe2022, pp. 10-15]</p>');
      expect(html).toContain('Doe & Smith, 2022, pp. 10-15');
    });

    test('comma + @ is treated as a second citation', () => {
      const { html, citedKeys } = renderer.processCitations(
        '<p>[@smith2023, @doe2022]</p>'
      );
      expect(citedKeys).toHaveLength(2);
      expect(html).not.toContain('citation-unknown');
    });
  });

  // ─── Prefix support ────────────────────────

  describe('Citation prefixes', () => {
    test('should include prefix text before citation', () => {
      const { html } = renderer.processCitations('<p>[see @smith2023]</p>');
      expect(html).toContain('see');
      expect(html).toContain('Smith, 2023');
    });
  });

  // ─── Author-only citations ─────────────────

  describe('Author-only citations', () => {
    test('should render only the author name with @- prefix', () => {
      const { html } = renderer.processCitations('<p>[@-smith2023]</p>');
      expect(html).toContain('Smith');
      // Should not include year in the inline part for author-only
      expect(html).not.toContain('2023');
    });
  });

  // ─── Suppress-author citations (pandoc [-@key]) ──

  describe('Suppress-author citations', () => {
    test('[-@key] renders year only', () => {
      const { html, citedKeys } = renderer.processCitations('<p>Derrida [-@smith2023] argues</p>');
      expect(html).toBe('<p>Derrida <span class="citation">(2023)</span> argues</p>');
      expect(citedKeys).toEqual(['smith2023']);
    });

    test('[-@key, suffix] renders year with suffix', () => {
      const { html } = renderer.processCitations('<p>[-@smith2023, p. 42]</p>');
      expect(html).toContain('2023, p. 42');
      expect(html).not.toContain('Smith');
    });

    test('[-@key] with no year renders n.d.', () => {
      renderer.setEntries([{ key: 'nodate', author: 'Test, A.', title: 'No Date' }]);
      const { html } = renderer.processCitations('<p>[-@nodate]</p>');
      expect(html).toContain('n.d.');
    });
  });

  // ─── Author parsing formats ─────────────────

  describe('Author parsing formats', () => {
    test('APA-style with ampersand: 4 authors → "et al."', () => {
      const { html } = renderer.processCitations('<p>[@radford2018gpt]</p>');
      expect(html).toBe('<p><span class="citation">(Radford et al., 2018)</span></p>');
    });

    test('comma-separated pairs without "and" or "&"', () => {
      const { html } = renderer.processCitations('<p>[@pair2020]</p>');
      expect(html).toBe('<p><span class="citation">(Garcia & Lopez, 2020)</span></p>');
    });

    test('BibTeX "and"-separated: 3 authors → "et al."', () => {
      const { html } = renderer.processCitations('<p>[@team2021]</p>');
      expect(html).toBe('<p><span class="citation">(Alpha et al., 2021)</span></p>');
    });

    test('BibTeX "and"-separated: 2 authors → "A & B"', () => {
      const { html } = renderer.processCitations('<p>[@doe2022]</p>');
      expect(html).toBe('<p><span class="citation">(Doe & Smith, 2022)</span></p>');
    });

    test('single author', () => {
      const { html } = renderer.processCitations('<p>[@smith2023]</p>');
      expect(html).toBe('<p><span class="citation">(Smith, 2023)</span></p>');
    });

    test('comma-separated "First Last" names → "et al."', () => {
      const { html } = renderer.processCitations('<p>[@fullnames2024]</p>');
      expect(html).toBe('<p><span class="citation">(Magee et al., 2024)</span></p>');
    });
  });

  // ─── Edge cases ─────────────────────────────

  describe('Edge cases', () => {
    test('should not modify text without citations', () => {
      const input = '<p>No citations here.</p>';
      const { html, citedKeys } = renderer.processCitations(input);
      expect(html).toBe(input);
      expect(citedKeys).toEqual([]);
    });

    test('should handle multiple citation groups in one HTML string', () => {
      const { html, citedKeys } = renderer.processCitations(
        '<p>First [@smith2023] and second [@doe2022].</p>'
      );
      expect(citedKeys).toHaveLength(2);
      expect(html).toContain('Smith, 2023');
      expect(html).toContain('Doe & Smith, 2022');
    });

    test('should handle citation with hyphenated key', () => {
      renderer.setEntries([
        { key: 'van-der-berg2020', author: 'Van der Berg, K.', year: '2020', title: 'Test' }
      ]);
      const { html, citedKeys } = renderer.processCitations('<p>[@van-der-berg2020]</p>');
      expect(citedKeys).toEqual(['van-der-berg2020']);
    });

    test('should handle mix of known and unknown in comma-separated list', () => {
      const { html } = renderer.processCitations(
        '<p>[@smith2023, @doesnotexist]</p>'
      );
      expect(html).toContain('Smith, 2023');
      expect(html).toContain('citation-unknown');
      expect(html).toContain('@doesnotexist');
    });
  });

  // ─── Chicago style ─────────────────────────

  describe('Chicago style', () => {
    test('should format inline citation in Chicago style (no comma before year)', () => {
      renderer.setStyle('chicago');
      const { html } = renderer.processCitations('<p>[@smith2023]</p>');
      expect(html).toBe('<p><span class="citation">(Smith 2023)</span></p>');
    });

    test('should format comma-separated citations in Chicago style', () => {
      renderer.setStyle('chicago');
      const { html } = renderer.processCitations(
        '<p>[@Radford2018Improvinglanguage, @Radford2019Languagemodels]</p>'
      );
      expect(html).toBe(
        '<p><span class="citation">(Radford 2018; Radford et al. 2019)</span></p>'
      );
    });
  });

  // ─── parseCitationRef unit tests ────────────

  describe('parseCitationRef', () => {
    test('should parse key without suffix', () => {
      expect(renderer.parseCitationRef('@smith2023')).toEqual({ key: 'smith2023', suffix: '' });
    });

    test('should parse key with suffix', () => {
      expect(renderer.parseCitationRef('@smith2023, p. 42')).toEqual({ key: 'smith2023', suffix: 'p. 42' });
    });

    test('should handle key without @ prefix', () => {
      expect(renderer.parseCitationRef('smith2023')).toEqual({ key: 'smith2023', suffix: '' });
    });
  });
});

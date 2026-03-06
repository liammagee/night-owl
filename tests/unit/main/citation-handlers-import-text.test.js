jest.mock('../../../services/citationService', () => {
  return jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    addCitation: jest.fn(),
    getCitations: jest.fn(),
    getCitationById: jest.fn(),
    updateCitation: jest.fn(),
    deleteCitation: jest.fn(),
    close: jest.fn()
  }));
});

const { __testables } = require('../../../ipc/citationHandlers');

describe('Citation Handlers BibTeX Parsing Helpers', () => {
  test('splits multiple BibTeX entries from one payload', () => {
    const payload = `
@article{smith2024,
  title={Dialectics in Motion},
  author={Smith, Jane and Doe, John},
  year={2024}
}

@book{hegel1807,
  title={Phenomenology of Spirit},
  author={Hegel, G. W. F.},
  year={1807}
}`;

    const entries = __testables.splitBibTeXEntries(payload);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toContain('@article{smith2024');
    expect(entries[1]).toContain('@book{hegel1807');
  });

  test('parses BibTeX entry into citation data shape', () => {
    const entry = `@inproceedings{magee2025,
      title={Hermeneutic LLM Pipelines},
      author={Magee, Liam and Reader, Ada},
      booktitle={Proceedings of AI Humanities},
      year={2025},
      doi={10.1000/example-doi},
      url={https://example.org/paper}
    }`;

    const parsed = __testables.parseBibTeXEntry(entry);
    expect(parsed).toBeTruthy();
    expect(parsed.title).toBe('Hermeneutic LLM Pipelines');
    expect(parsed.authors).toBe('Magee, Liam and Reader, Ada');
    expect(parsed.publication_year).toBe(2025);
    expect(parsed.citation_type).toBe('conference');
    expect(parsed.journal).toBe('Proceedings of AI Humanities');
    expect(parsed.doi).toBe('10.1000/example-doi');
  });

  test('maps online and misc types to webpage citations', () => {
    expect(__testables.mapBibTeXType('online')).toBe('webpage');
    expect(__testables.mapBibTeXType('misc')).toBe('webpage');
    expect(__testables.mapBibTeXType('article')).toBe('article');
  });

  test('ignores BibTeX comment and preamble entries', () => {
    const payload = `
@comment{this should be ignored}
@preamble{"some preamble text"}
@string{J = "Journal of Philosophy"}
@article{valid2026,
  title={Valid Entry},
  author={Author, A},
  year={2026}
}`;

    const parsed = __testables.parseBibTeXEntries(payload);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe('Valid Entry');
    expect(parsed[0].publication_year).toBe(2026);
  });

  test('infers fallback title from freeform citation text', () => {
    const inferred = __testables.inferCitationTitleFromText(`
      A very practical guide to dialectical annotation systems.
      Journal of Useful Experiments, 2025.
    `);

    expect(inferred).toBe('A very practical guide to dialectical annotation systems.');
  });

  test('normalizes URLs for supported formats', () => {
    expect(__testables.sanitizeUrl('https://example.com')).toBe('https://example.com');
    expect(__testables.sanitizeUrl('www.example.com')).toBe('https://www.example.com');
    expect(__testables.sanitizeUrl('example.com')).toBeNull();
  });
});

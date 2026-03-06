/**
 * Unit tests for the .bib file -> DB sync functionality.
 * Tests that parseBibTeXEntries correctly processes entries which
 * can then be imported into the citation database.
 */

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
const { parseBibTeXEntries, parseBibTeXEntry, normalizeBibTeXAuthors } = __testables;

describe('BibTeX to DB sync pipeline', () => {
  describe('parseBibTeXEntries for DB import', () => {
    test('parses multiple entries ready for DB insertion', () => {
      const bibContent = `
@article{smith2024dialectics,
  title={Dialectics in Motion},
  author={Smith, Jane and Doe, John},
  year={2024},
  journal={Philosophy Today},
  volume={12},
  number={3},
  pages={100--120},
  doi={10.1234/dialectics}
}

@book{hegel1807pheno,
  title={Phenomenology of Spirit},
  author={Hegel, Georg Wilhelm Friedrich},
  year={1807},
  publisher={Bamberg and Wurzburg}
}

@inproceedings{team2025ai,
  title={AI and Hermeneutics},
  author={Magee, Liam and Reader, Ada and Writer, Bo},
  booktitle={ACIS Conference},
  year={2025}
}`;

      const entries = parseBibTeXEntries(bibContent);
      expect(entries).toHaveLength(3);

      // Article
      expect(entries[0].title).toBe('Dialectics in Motion');
      expect(entries[0].authors).toBe('Smith, Jane and Doe, John');
      expect(entries[0].publication_year).toBe(2024);
      expect(entries[0].journal).toBe('Philosophy Today');
      expect(entries[0].volume).toBe('12');
      expect(entries[0].issue).toBe('3');
      expect(entries[0].pages).toBe('100--120');
      expect(entries[0].doi).toBe('10.1234/dialectics');
      expect(entries[0].citation_type).toBe('article');
      expect(entries[0].source).toBe('bibtex');

      // Book
      expect(entries[1].title).toBe('Phenomenology of Spirit');
      expect(entries[1].authors).toBe('Hegel, Georg Wilhelm Friedrich');
      // extractYearFromString only matches 19xx/20xx, so 1807 returns null
      expect(entries[1].publication_year).toBeNull();
      // Publisher field preserves original value including "and"
      expect(entries[1].publisher).toContain('Bamberg');
      expect(entries[1].citation_type).toBe('book');

      // Conference
      expect(entries[2].title).toBe('AI and Hermeneutics');
      expect(entries[2].authors).toBe('Magee, Liam and Reader, Ada and Writer, Bo');
      expect(entries[2].citation_type).toBe('conference');
    });

    test('handles entries with URLs and abstracts', () => {
      const bibContent = `
@misc{karpathy2025,
  title={Animals vs Ghosts},
  author={Karpathy, Andrej},
  year={2025},
  url={https://karpathy.bearblog.dev/animals-vs-ghosts/},
  abstract={Today's frontier LLM research is about summoning ghosts.}
}`;

      const entries = parseBibTeXEntries(bibContent);
      expect(entries).toHaveLength(1);
      expect(entries[0].url).toBe('https://karpathy.bearblog.dev/animals-vs-ghosts/');
      expect(entries[0].abstract).toContain('summoning ghosts');
      expect(entries[0].citation_type).toBe('webpage');
    });

    test('handles entries with keywords as tags', () => {
      const bibContent = `
@article{test2024,
  title={Tagged Article},
  author={Author, Test},
  year={2024},
  keywords={ai; pedagogy; hermeneutics}
}`;

      const entries = parseBibTeXEntries(bibContent);
      expect(entries).toHaveLength(1);
      // Semicolons replaced with commas; whitespace preserved from original
      expect(entries[0].tags).toBe('ai,  pedagogy,  hermeneutics');
    });

    test('skips comment, string, and preamble entries', () => {
      const bibContent = `
@comment{This is a comment}
@string{j = "Journal"}
@preamble{"Some preamble"}
@article{real2024,
  title={Real Entry},
  author={Author, Real},
  year={2024}
}`;

      const entries = parseBibTeXEntries(bibContent);
      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe('Real Entry');
    });

    test('returns empty array for empty/invalid input', () => {
      expect(parseBibTeXEntries('')).toHaveLength(0);
      expect(parseBibTeXEntries(null)).toHaveLength(0);
      expect(parseBibTeXEntries('random text without bibtex')).toHaveLength(0);
    });
  });

  describe('author normalization preserves structure', () => {
    test('round-trip: BibTeX author → normalize → parseAuthors compatible', () => {
      const bibtexAuthor = 'Smith, John and Jones, Jane and Lee, Bob';
      const normalized = normalizeBibTeXAuthors(bibtexAuthor);

      // Should still be splittable by "and"
      const authors = normalized.split(/\s+and\s+/i);
      expect(authors).toHaveLength(3);
      expect(authors[0]).toBe('Smith, John');
      expect(authors[1]).toBe('Jones, Jane');
      expect(authors[2]).toBe('Lee, Bob');
    });

    test('single author passes through unchanged', () => {
      const normalized = normalizeBibTeXAuthors('Hegel, Georg Wilhelm Friedrich');
      expect(normalized).toBe('Hegel, Georg Wilhelm Friedrich');
    });

    test('handles mixed "First Last" and "Last, First" formats', () => {
      const normalized = normalizeBibTeXAuthors('Jane Smith and Doe, John');
      const authors = normalized.split(/\s+and\s+/i);
      expect(authors).toHaveLength(2);
      expect(authors[0]).toBe('Jane Smith');
      expect(authors[1]).toBe('Doe, John');
    });
  });
});

/**
 * Unit tests for multi-author handling across the citation pipeline:
 * - normalizeBibTeXAuthors (citationHandlers.js)
 * - generateCitationKey (citationHandlers.js)
 * - Key generation consistency
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
const {
  normalizeBibTeXAuthors,
  generateCitationKey,
  parseBibTeXEntry
} = __testables;

describe('normalizeBibTeXAuthors', () => {
  test('preserves "and" separator for single author', () => {
    expect(normalizeBibTeXAuthors('Smith, John')).toBe('Smith, John');
  });

  test('preserves "and" separator for two authors', () => {
    expect(normalizeBibTeXAuthors('Smith, John and Jones, Jane'))
      .toBe('Smith, John and Jones, Jane');
  });

  test('preserves "and" separator for three authors', () => {
    expect(normalizeBibTeXAuthors('Smith, John and Jones, Jane and Lee, Bob'))
      .toBe('Smith, John and Jones, Jane and Lee, Bob');
  });

  test('handles case-insensitive "AND"', () => {
    expect(normalizeBibTeXAuthors('Smith, John AND Jones, Jane'))
      .toBe('Smith, John and Jones, Jane');
  });

  test('trims whitespace around authors', () => {
    expect(normalizeBibTeXAuthors('  Smith, John   and   Jones, Jane  '))
      .toBe('Smith, John and Jones, Jane');
  });

  test('handles empty string', () => {
    expect(normalizeBibTeXAuthors('')).toBe('');
  });

  test('handles null/undefined', () => {
    expect(normalizeBibTeXAuthors(null)).toBe('');
    expect(normalizeBibTeXAuthors(undefined)).toBe('');
  });

  test('handles "First Last" format', () => {
    expect(normalizeBibTeXAuthors('John Smith and Jane Jones'))
      .toBe('John Smith and Jane Jones');
  });
});

describe('generateCitationKey with multi-author works', () => {
  test('uses first author last name from "Last, First and Last, First"', () => {
    const key = generateCitationKey({
      authors: 'Smith, John and Jones, Jane',
      publication_year: 2024,
      title: 'Joint Work'
    });
    expect(key).toMatch(/^Smith2024/);
  });

  test('uses first author last name from "First Last and First Last"', () => {
    const key = generateCitationKey({
      authors: 'John Smith and Jane Jones',
      publication_year: 2024,
      title: 'Joint Work'
    });
    expect(key).toMatch(/^Smith2024/);
  });

  test('handles three+ authors correctly', () => {
    const key = generateCitationKey({
      authors: 'Bender, Emily and Gebru, Timnit and McMillan-Major, Angelina',
      publication_year: 2021,
      title: 'On the Dangers of Stochastic Parrots'
    });
    expect(key).toMatch(/^Bender2021/);
  });

  test('returns existing key if present', () => {
    const key = generateCitationKey({
      key: 'custom_key',
      authors: 'Smith, John',
      publication_year: 2023,
      title: 'Ignored'
    });
    expect(key).toBe('custom_key');
  });

  test('returns citation_key if present', () => {
    const key = generateCitationKey({
      citation_key: 'custom_db_key',
      authors: 'Smith, John',
      publication_year: 2023,
      title: 'Ignored'
    });
    expect(key).toBe('custom_db_key');
  });
});

describe('parseBibTeXEntry author handling', () => {
  test('preserves "and" separators in parsed authors', () => {
    const entry = `@article{smith2024,
      author={Smith, John and Jones, Jane},
      title={Test},
      year={2024}
    }`;

    const parsed = parseBibTeXEntry(entry);
    expect(parsed.authors).toBe('Smith, John and Jones, Jane');
  });

  test('handles three authors', () => {
    const entry = `@article{team2025,
      author={Alice Author and Bob Writer and Carol Researcher},
      title={Team Paper},
      year={2025}
    }`;

    const parsed = parseBibTeXEntry(entry);
    expect(parsed.authors).toBe('Alice Author and Bob Writer and Carol Researcher');
  });

  test('handles editor field as fallback', () => {
    const entry = `@book{edited2024,
      editor={Editor, Chief and Editor, Second},
      title={Edited Volume},
      year={2024}
    }`;

    const parsed = parseBibTeXEntry(entry);
    expect(parsed.authors).toBe('Editor, Chief and Editor, Second');
  });
});

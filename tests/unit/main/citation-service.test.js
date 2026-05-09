/**
 * Unit tests for CitationService — database operations, key generation,
 * search (including citation_key), and multi-author handling.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// We need to require the real CitationService (not mocked)
const CitationService = require('../../../services/citationService');

describe('CitationService', () => {
  let service;
  let tmpDir;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'citation-test-'));
    service = new CitationService();
    await service.initialize(tmpDir);
  });

  afterEach(async () => {
    if (service) await service.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // === Key Generation ===

  describe('_generateCitationKey', () => {
    test('generates key from single author in "First Last" format', () => {
      const key = service._generateCitationKey({
        authors: 'John Smith',
        publication_year: 2023,
        title: 'Methods of Analysis'
      });
      expect(key).toBe('Smith2023MethodsAnalysis');
    });

    test('generates key from single author in "Last, First" format', () => {
      const key = service._generateCitationKey({
        authors: 'Smith, John',
        publication_year: 2023,
        title: 'Methods of Analysis'
      });
      expect(key).toBe('Smith2023MethodsAnalysis');
    });

    test('generates key from multiple "and"-separated authors', () => {
      const key = service._generateCitationKey({
        authors: 'Smith, John and Jones, Jane',
        publication_year: 2024,
        title: 'Collaborative Research'
      });
      // Should use first author's last name only
      expect(key).toBe('Smith2024CollaborativeResearch');
    });

    test('generates key from "First Last and First Last" format', () => {
      const key = service._generateCitationKey({
        authors: 'John Smith and Jane Jones and Bob Lee',
        publication_year: 2025,
        title: 'Team Paper'
      });
      expect(key).toBe('Smith2025TeamPaper');
    });

    test('handles missing authors gracefully', () => {
      const key = service._generateCitationKey({
        authors: '',
        publication_year: 2023,
        title: 'Orphan Work'
      });
      expect(key).toMatch(/^Citation2023/);
    });

    test('uses current year when publication_year is missing', () => {
      const key = service._generateCitationKey({
        authors: 'Smith, John',
        title: 'Timeless'
      });
      const currentYear = new Date().getFullYear();
      expect(key).toContain(String(currentYear));
    });

    test('picks significant title words (>3 chars)', () => {
      const key = service._generateCitationKey({
        authors: 'Doe, Jane',
        publication_year: 2020,
        title: 'On the Use of AI in Education'
      });
      // "On", "the", "of", "in" are <= 3 chars, so significant = ["Use", "Education"]
      // Wait — "Use" is 3 chars, not > 3. Significant = ["Education"]
      // Actually the filter is word.length > 3, so "Use" (3) is excluded
      // Significant words: "Education" (9 chars)
      // But there's also "AI" (2) excluded. So we get just "Education"
      expect(key).toBe('Doe2020Education');
    });
  });

  // === CRUD + Search ===

  describe('addCitation and getCitations', () => {
    test('adds citation and retrieves it', async () => {
      const result = await service.addCitation({
        title: 'Test Article',
        authors: 'Smith, John',
        publication_year: 2023,
        citation_type: 'article'
      });
      expect(result.id).toBeDefined();

      const citations = await service.getCitations({});
      expect(citations.length).toBe(1);
      expect(citations[0].title).toBe('Test Article');
      expect(citations[0].citation_key).toBeTruthy();
    });

    test('stores citation_key at insertion time', async () => {
      const result = await service.addCitation({
        title: 'Phenomenology of Spirit',
        authors: 'Hegel, Georg Wilhelm Friedrich',
        publication_year: 1807,
        citation_type: 'book'
      });

      const citation = await service.getCitationById(result.id);
      expect(citation.citation_key).toBe('Hegel1807PhenomenologySpirit');
    });

    test('preserves provided citation_key', async () => {
      const result = await service.addCitation({
        title: 'Custom Key Article',
        authors: 'Doe, Jane',
        publication_year: 2024,
        citation_type: 'article',
        citation_key: 'doe2024custom'
      });

      const citation = await service.getCitationById(result.id);
      expect(citation.citation_key).toBe('doe2024custom');
    });

    test('does not overwrite citation_key on update', async () => {
      const result = await service.addCitation({
        title: 'Original Title',
        authors: 'Smith, John',
        publication_year: 2023,
        citation_type: 'article'
      });

      const originalKey = (await service.getCitationById(result.id)).citation_key;

      await service.updateCitation(result.id, {
        title: 'Updated Title',
        citation_key: 'should_be_ignored'
      });

      const updated = await service.getCitationById(result.id);
      expect(updated.title).toBe('Updated Title');
      expect(updated.citation_key).toBe(originalKey);
    });
  });

  // === Search by citation_key ===

  describe('search by citation_key', () => {
    beforeEach(async () => {
      await service.addCitation({
        title: 'Dialectics in Motion',
        authors: 'Smith, Jane and Doe, John',
        publication_year: 2024,
        citation_type: 'article',
        citation_key: 'smith2024dialectics'
      });
      await service.addCitation({
        title: 'Hermeneutic Horizons',
        authors: 'Jones, Ada',
        publication_year: 2023,
        citation_type: 'book',
        citation_key: 'jones2023hermeneutic'
      });
    });

    test('finds citation by exact key with LIKE search', async () => {
      const results = await service.getCitations({
        search: 'smith2024dialectics',
        fuzzy: false
      });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Dialectics in Motion');
    });

    test('finds citation by partial key with LIKE search', async () => {
      const results = await service.getCitations({
        search: 'jones2023',
        fuzzy: false
      });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Hermeneutic Horizons');
    });

    test('finds citation by key with fuzzy search', async () => {
      const results = await service.getCitations({
        search: 'smith2024',
        fuzzy: true
      });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(c => c.citation_key === 'smith2024dialectics')).toBe(true);
    });

    test('finds citation by key with wildcard search', async () => {
      const results = await service.getCitations({
        search: '*dialectics*'
      });
      expect(results.length).toBe(1);
      expect(results[0].citation_key).toBe('smith2024dialectics');
    });
  });

  // === getCitationByKey ===

  describe('getCitationByKey', () => {
    test('returns citation matching the key', async () => {
      await service.addCitation({
        title: 'Being and Time',
        authors: 'Heidegger, Martin',
        publication_year: 1927,
        citation_type: 'book',
        citation_key: 'heidegger1927being'
      });

      const result = await service.getCitationByKey('heidegger1927being');
      expect(result).toBeTruthy();
      expect(result.title).toBe('Being and Time');
    });

    test('returns null for non-existent key', async () => {
      const result = await service.getCitationByKey('nonexistent_key');
      expect(result).toBeNull();
    });
  });

  // === Multi-author handling ===

  describe('multi-author storage', () => {
    test('stores "and"-separated authors from BibTeX', async () => {
      const result = await service.addCitation({
        title: 'Joint Work',
        authors: 'Smith, John and Jones, Jane and Lee, Bob',
        publication_year: 2025,
        citation_type: 'article'
      });

      const citation = await service.getCitationById(result.id);
      expect(citation.authors).toBe('Smith, John and Jones, Jane and Lee, Bob');
    });

    test('citation key uses only first author from multi-author work', async () => {
      const result = await service.addCitation({
        title: 'Collaborative Methods',
        authors: 'Bender, Emily and Gebru, Timnit and McMillan-Major, Angelina',
        publication_year: 2021,
        citation_type: 'conference'
      });

      const citation = await service.getCitationById(result.id);
      expect(citation.citation_key).toMatch(/^Bender2021/);
    });
  });

  // === Deduplication ===

  describe('deduplication', () => {
    test('does not create duplicate when adding same title', async () => {
      await service.addCitation({
        title: 'Unique Article',
        authors: 'Smith, John',
        publication_year: 2023,
        citation_type: 'article'
      });

      const duplicate = await service.addCitation({
        title: 'Unique Article',
        authors: 'Smith, John',
        publication_year: 2023,
        citation_type: 'article'
      });

      expect(duplicate._existing).toBe(true);
      const all = await service.getCitations({});
      expect(all.length).toBe(1);
    });

    test('updates metadata when re-importing with richer data', async () => {
      await service.addCitation({
        title: 'Sparse Entry',
        authors: 'Doe, Jane',
        citation_type: 'article'
      });

      const enriched = await service.addCitation({
        title: 'Sparse Entry',
        authors: 'Doe, Jane',
        publication_year: 2024,
        journal: 'Philosophy Today',
        doi: '10.1234/sparse',
        citation_type: 'article'
      });

      expect(enriched._existing).toBe(true);
      expect(enriched._updated).toBe(true);

      const updated = await service.getCitationById(enriched.id);
      expect(updated.publication_year).toBe(2024);
      expect(updated.journal).toBe('Philosophy Today');
    });
  });
});

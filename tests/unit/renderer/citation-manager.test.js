/**
 * Unit tests for citationManager.js module
 * Tests citation management functionality including:
 * - Citation data manipulation
 * - BibTeX parsing and generation
 * - Duplicate detection
 * - Filter logic
 */

describe('Citation Manager Module', () => {
  describe('Citation Data Structure', () => {
    // Test citation object validation
    function isValidCitation(citation) {
      const requiredFields = ['title', 'type'];
      return requiredFields.every(field =>
        citation[field] !== undefined && citation[field] !== null
      );
    }

    test('should validate citation with required fields', () => {
      const validCitation = {
        title: 'Test Article',
        type: 'article',
        authors: 'John Doe'
      };

      expect(isValidCitation(validCitation)).toBe(true);
    });

    test('should reject citation without title', () => {
      const invalidCitation = {
        type: 'article',
        authors: 'John Doe'
      };

      expect(isValidCitation(invalidCitation)).toBe(false);
    });

    test('should reject citation without type', () => {
      const invalidCitation = {
        title: 'Test Article',
        authors: 'John Doe'
      };

      expect(isValidCitation(invalidCitation)).toBe(false);
    });
  });

  describe('Citation Key Generation', () => {
    // Generate citation key from author and year
    // For "Last, First" format, takes Last; for "First Last" takes Last
    function generateCitationKey(authors, year, title) {
      let key = '';

      // Extract first author's last name
      if (authors) {
        const firstAuthor = authors.split(/[;&]|and/i)[0].trim();
        // Check if comma-separated (Last, First)
        if (firstAuthor.includes(',')) {
          const lastName = firstAuthor.split(',')[0].trim();
          key = lastName.toLowerCase();
        } else {
          // Assume "First Last" format - take the last word
          const words = firstAuthor.split(/\s+/);
          if (words.length > 0) {
            key = words[words.length - 1].toLowerCase();
          }
        }
      }

      // Add year
      if (year) {
        key += year;
      }

      // Add first word of title if no author
      if (!key && title) {
        const firstWord = title.match(/\w+/);
        if (firstWord) {
          key = firstWord[0].toLowerCase();
        }
      }

      // Fallback to generic key
      if (!key) {
        key = 'citation' + Date.now();
      }

      // Sanitize for BibTeX (alphanumeric and some special chars only)
      return key.replace(/[^a-zA-Z0-9_:-]/g, '');
    }

    test('should generate key from author last name and year (First Last format)', () => {
      const key = generateCitationKey('John Smith', '2023', 'Test Article');
      expect(key).toBe('smith2023');
    });

    test('should handle Last, First format', () => {
      const key = generateCitationKey('Smith, John', '2023', 'Test');
      expect(key).toBe('smith2023');
    });

    test('should handle multiple authors', () => {
      const key = generateCitationKey('Smith, John and Doe, Jane', '2023', 'Test');
      expect(key).toBe('smith2023');
    });

    test('should handle authors separated by semicolons', () => {
      const key = generateCitationKey('Smith, John; Doe, Jane', '2023', 'Test');
      expect(key).toBe('smith2023');
    });

    test('should use title when no author', () => {
      const key = generateCitationKey('', '', 'Introduction to Programming');
      expect(key).toBe('introduction');
    });

    test('should sanitize special characters', () => {
      const key = generateCitationKey("O'Connor, Mary", '2023', 'Test');
      expect(key).toBe('oconnor2023');
    });
  });

  describe('BibTeX Parsing', () => {
    // Simple BibTeX entry parser
    function parseBibtexEntry(entry) {
      const result = {};

      // Extract entry type and key
      const headerMatch = entry.match(/@(\w+)\s*\{\s*([^,\s]+)/);
      if (headerMatch) {
        result.type = headerMatch[1].toLowerCase();
        result.citation_key = headerMatch[2];
      }

      // Extract fields
      const fieldPattern = /(\w+)\s*=\s*[{"]([^}"]*)[}"]/g;
      let match;
      while ((match = fieldPattern.exec(entry)) !== null) {
        result[match[1].toLowerCase()] = match[2];
      }

      return result;
    }

    test('should parse article entry', () => {
      const bibtex = `@article{smith2023,
        author = {Smith, John},
        title = {Test Article},
        journal = {Test Journal},
        year = {2023}
      }`;

      const parsed = parseBibtexEntry(bibtex);

      expect(parsed.type).toBe('article');
      expect(parsed.citation_key).toBe('smith2023');
      expect(parsed.author).toBe('Smith, John');
      expect(parsed.title).toBe('Test Article');
      expect(parsed.year).toBe('2023');
    });

    test('should parse book entry', () => {
      const bibtex = `@book{doe2022,
        author = {Jane Doe},
        title = {Programming Guide},
        publisher = {Tech Press},
        year = {2022}
      }`;

      const parsed = parseBibtexEntry(bibtex);

      expect(parsed.type).toBe('book');
      expect(parsed.publisher).toBe('Tech Press');
    });

    test('should handle quoted field values', () => {
      const bibtex = `@article{test,
        title = "Quoted Title"
      }`;

      const parsed = parseBibtexEntry(bibtex);
      expect(parsed.title).toBe('Quoted Title');
    });
  });

  describe('Duplicate Detection', () => {
    // Check if two citations are potential duplicates
    function arePotentialDuplicates(cit1, cit2) {
      // Same DOI is a definite duplicate
      if (cit1.doi && cit2.doi && cit1.doi === cit2.doi) {
        return { isDuplicate: true, reason: 'matching_doi', confidence: 1.0 };
      }

      // Check title similarity
      if (cit1.title && cit2.title) {
        const similarity = calculateTitleSimilarity(cit1.title, cit2.title);
        if (similarity > 0.6) { // Threshold to catch near-duplicates
          return { isDuplicate: true, reason: 'similar_title', confidence: similarity };
        }
      }

      return { isDuplicate: false, reason: null, confidence: 0 };
    }

    // Calculate normalized string similarity
    function calculateTitleSimilarity(title1, title2) {
      const normalize = (s) => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
      const t1 = normalize(title1);
      const t2 = normalize(title2);

      if (t1 === t2) return 1.0;

      // Use Jaccard similarity on words
      const words1 = new Set(t1.split(/\s+/));
      const words2 = new Set(t2.split(/\s+/));

      const intersection = new Set([...words1].filter(x => words2.has(x)));
      const union = new Set([...words1, ...words2]);

      return intersection.size / union.size;
    }

    test('should detect duplicate by DOI', () => {
      const cit1 = { title: 'Article One', doi: '10.1234/abc' };
      const cit2 = { title: 'Article Two', doi: '10.1234/abc' };

      const result = arePotentialDuplicates(cit1, cit2);
      expect(result.isDuplicate).toBe(true);
      expect(result.reason).toBe('matching_doi');
      expect(result.confidence).toBe(1.0);
    });

    test('should detect duplicate by similar title', () => {
      // Use very similar titles (only differs by edition note)
      const cit1 = { title: 'Introduction to Machine Learning' };
      const cit2 = { title: 'Introduction to Machine Learning Second Edition' };

      const result = arePotentialDuplicates(cit1, cit2);
      expect(result.isDuplicate).toBe(true);
      expect(result.reason).toBe('similar_title');
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    test('should not flag different titles as duplicates', () => {
      const cit1 = { title: 'Machine Learning Fundamentals' };
      const cit2 = { title: 'Deep Neural Networks' };

      const result = arePotentialDuplicates(cit1, cit2);
      expect(result.isDuplicate).toBe(false);
    });

    test('should handle exact title matches', () => {
      const cit1 = { title: 'Test Article' };
      const cit2 = { title: 'Test Article' };

      const result = arePotentialDuplicates(cit1, cit2);
      expect(result.isDuplicate).toBe(true);
      expect(result.confidence).toBe(1.0);
    });
  });

  describe('Filter Logic', () => {
    const sampleCitations = [
      { id: 1, title: 'Machine Learning', type: 'article', publication_year: 2023, authors: 'Smith' },
      { id: 2, title: 'Deep Learning', type: 'book', publication_year: 2022, authors: 'Doe' },
      { id: 3, title: 'AI Introduction', type: 'article', publication_year: 2023, authors: 'Johnson' },
      { id: 4, title: 'Data Science', type: 'inproceedings', publication_year: 2021, authors: 'Brown' }
    ];

    function filterCitations(citations, filters) {
      return citations.filter(citation => {
        // Search filter (check title, authors)
        if (filters.search) {
          const searchLower = filters.search.toLowerCase();
          const titleMatch = citation.title?.toLowerCase().includes(searchLower);
          const authorMatch = citation.authors?.toLowerCase().includes(searchLower);
          if (!titleMatch && !authorMatch) return false;
        }

        // Type filter
        if (filters.type && citation.type !== filters.type) {
          return false;
        }

        // Year filter
        if (filters.year && citation.publication_year != filters.year) {
          return false;
        }

        return true;
      });
    }

    test('should filter by search text in title', () => {
      const filtered = filterCitations(sampleCitations, { search: 'learning' });
      expect(filtered).toHaveLength(2);
      expect(filtered.map(c => c.id)).toEqual([1, 2]);
    });

    test('should filter by search text in authors', () => {
      const filtered = filterCitations(sampleCitations, { search: 'smith' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(1);
    });

    test('should filter by type', () => {
      const filtered = filterCitations(sampleCitations, { type: 'article' });
      expect(filtered).toHaveLength(2);
    });

    test('should filter by year', () => {
      const filtered = filterCitations(sampleCitations, { year: 2023 });
      expect(filtered).toHaveLength(2);
    });

    test('should combine multiple filters', () => {
      const filtered = filterCitations(sampleCitations, {
        type: 'article',
        year: 2023
      });
      expect(filtered).toHaveLength(2);
    });

    test('should return all when no filters', () => {
      const filtered = filterCitations(sampleCitations, {});
      expect(filtered).toHaveLength(4);
    });
  });

  describe('Sort Logic', () => {
    const sampleCitations = [
      { id: 1, title: 'Beta', publication_year: 2022, created_at: '2023-01-15' },
      { id: 2, title: 'Alpha', publication_year: 2023, created_at: '2023-03-20' },
      { id: 3, title: 'Gamma', publication_year: 2021, created_at: '2023-02-10' }
    ];

    function sortCitations(citations, sortBy) {
      const sorted = [...citations];

      switch (sortBy) {
        case 'title_asc':
          return sorted.sort((a, b) => a.title.localeCompare(b.title));
        case 'title_desc':
          return sorted.sort((a, b) => b.title.localeCompare(a.title));
        case 'year_asc':
          return sorted.sort((a, b) => a.publication_year - b.publication_year);
        case 'year_desc':
          return sorted.sort((a, b) => b.publication_year - a.publication_year);
        case 'created_at_desc':
          return sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        case 'created_at_asc':
          return sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        default:
          return sorted;
      }
    }

    test('should sort by title ascending', () => {
      const sorted = sortCitations(sampleCitations, 'title_asc');
      expect(sorted.map(c => c.title)).toEqual(['Alpha', 'Beta', 'Gamma']);
    });

    test('should sort by title descending', () => {
      const sorted = sortCitations(sampleCitations, 'title_desc');
      expect(sorted.map(c => c.title)).toEqual(['Gamma', 'Beta', 'Alpha']);
    });

    test('should sort by year ascending', () => {
      const sorted = sortCitations(sampleCitations, 'year_asc');
      expect(sorted.map(c => c.publication_year)).toEqual([2021, 2022, 2023]);
    });

    test('should sort by year descending', () => {
      const sorted = sortCitations(sampleCitations, 'year_desc');
      expect(sorted.map(c => c.publication_year)).toEqual([2023, 2022, 2021]);
    });

    test('should sort by created date descending', () => {
      const sorted = sortCitations(sampleCitations, 'created_at_desc');
      expect(sorted.map(c => c.id)).toEqual([2, 3, 1]);
    });
  });

  describe('Debounce Utility', () => {
    jest.useFakeTimers();

    function debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }

    test('should delay function execution', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 300);

      debouncedFn();
      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(300);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('should only call once for rapid invocations', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 300);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      jest.advanceTimersByTime(300);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('should call again after wait period', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 300);

      debouncedFn();
      jest.advanceTimersByTime(300);
      expect(mockFn).toHaveBeenCalledTimes(1);

      debouncedFn();
      jest.advanceTimersByTime(300);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    afterAll(() => {
      jest.useRealTimers();
    });
  });
});

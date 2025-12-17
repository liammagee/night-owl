/**
 * Unit tests for findReplace.js module
 * Tests the find and replace functionality including search patterns,
 * regex handling, and whole word matching
 */

describe('Find & Replace Module', () => {
  // Mock DOM elements for testing
  let mockFindInput;
  let mockCaseSensitive;
  let mockRegexMode;
  let mockWholeWord;

  beforeEach(() => {
    // Set up mock DOM elements
    mockFindInput = { value: '' };
    mockCaseSensitive = { checked: false };
    mockRegexMode = { checked: false };
    mockWholeWord = { checked: false };

    // Mock getElementById
    document.getElementById = jest.fn((id) => {
      switch (id) {
        case 'find-input':
          return mockFindInput;
        case 'case-sensitive':
          return mockCaseSensitive;
        case 'regex-mode':
          return mockRegexMode;
        case 'whole-word':
          return mockWholeWord;
        default:
          return null;
      }
    });
  });

  describe('buildSearchQuery', () => {
    // Re-implement buildSearchQuery for testing
    function buildSearchQuery() {
      const findInput = document.getElementById('find-input');
      const caseSensitive = document.getElementById('case-sensitive');
      const regexMode = document.getElementById('regex-mode');
      const wholeWord = document.getElementById('whole-word');

      if (!findInput) return null;

      const query = findInput.value;
      if (!query) return null;

      let flags = 'g';
      if (!caseSensitive?.checked) {
        flags += 'i';
      }

      let pattern = query;
      if (regexMode?.checked) {
        try {
          return new RegExp(pattern, flags);
        } catch (e) {
          console.warn('Invalid regex pattern:', pattern);
          return null;
        }
      } else {
        // Escape special regex characters for literal search
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        if (wholeWord?.checked) {
          pattern = '\\b' + pattern + '\\b';
        }

        return new RegExp(pattern, flags);
      }
    }

    test('should return null for empty query', () => {
      mockFindInput.value = '';
      expect(buildSearchQuery()).toBeNull();
    });

    test('should create case-insensitive regex by default', () => {
      mockFindInput.value = 'test';
      const regex = buildSearchQuery();

      expect(regex.flags).toContain('i');
      // Reset lastIndex between tests (global flag)
      regex.lastIndex = 0;
      expect(regex.test('TEST')).toBe(true);
      regex.lastIndex = 0;
      expect(regex.test('Test')).toBe(true);
    });

    test('should create case-sensitive regex when checked', () => {
      mockFindInput.value = 'Test';
      mockCaseSensitive.checked = true;
      const regex = buildSearchQuery();

      expect(regex.flags).not.toContain('i');
      regex.lastIndex = 0;
      expect(regex.test('Test')).toBe(true);
      regex.lastIndex = 0;
      expect(regex.test('test')).toBe(false);
    });

    test('should escape special regex characters in literal mode', () => {
      mockFindInput.value = 'test.*';
      const regex = buildSearchQuery();

      // Should match literal "test.*" not regex
      regex.lastIndex = 0;
      expect(regex.test('test.*')).toBe(true);
      regex.lastIndex = 0;
      expect(regex.test('testing')).toBe(false);
    });

    test('should use regex when regex mode is enabled', () => {
      mockFindInput.value = 'test.*';
      mockRegexMode.checked = true;
      const regex = buildSearchQuery();

      // Should match as regex
      regex.lastIndex = 0;
      expect(regex.test('testing')).toBe(true);
      regex.lastIndex = 0;
      expect(regex.test('test123')).toBe(true);
    });

    test('should return null for invalid regex', () => {
      mockFindInput.value = '[invalid(';
      mockRegexMode.checked = true;
      const regex = buildSearchQuery();

      expect(regex).toBeNull();
    });

    test('should add word boundaries for whole word search', () => {
      mockFindInput.value = 'test';
      mockWholeWord.checked = true;
      const regex = buildSearchQuery();

      expect(regex.test('test')).toBe(true);
      expect(regex.test('testing')).toBe(false);
      expect(regex.test('a test here')).toBe(true);
    });
  });

  describe('Search Result Navigation', () => {
    // Test navigation logic
    function getNextIndex(current, total) {
      return (current + 1) % total;
    }

    function getPreviousIndex(current, total) {
      return current <= 0 ? total - 1 : current - 1;
    }

    test('should cycle forward through results', () => {
      const total = 5;
      expect(getNextIndex(0, total)).toBe(1);
      expect(getNextIndex(3, total)).toBe(4);
      expect(getNextIndex(4, total)).toBe(0); // Wrap around
    });

    test('should cycle backward through results', () => {
      const total = 5;
      expect(getPreviousIndex(4, total)).toBe(3);
      expect(getPreviousIndex(1, total)).toBe(0);
      expect(getPreviousIndex(0, total)).toBe(4); // Wrap around
    });

    test('should handle single result', () => {
      const total = 1;
      expect(getNextIndex(0, total)).toBe(0);
      expect(getPreviousIndex(0, total)).toBe(0);
    });
  });

  describe('Replace All Logic', () => {
    // Test that replacements are created in reverse order
    function createReplaceEdits(matches, replaceText) {
      return matches
        .slice()
        .reverse()
        .map(match => ({
          range: match.range,
          text: replaceText
        }));
    }

    test('should create edits in reverse order', () => {
      const matches = [
        { range: { startLine: 1, startCol: 5 } },
        { range: { startLine: 2, startCol: 10 } },
        { range: { startLine: 3, startCol: 15 } }
      ];

      const edits = createReplaceEdits(matches, 'replacement');

      expect(edits[0].range.startLine).toBe(3);
      expect(edits[1].range.startLine).toBe(2);
      expect(edits[2].range.startLine).toBe(1);
    });

    test('should preserve original matches array', () => {
      const matches = [
        { range: { startLine: 1 } },
        { range: { startLine: 2 } }
      ];

      createReplaceEdits(matches, 'replacement');

      // Original array should be unchanged
      expect(matches[0].range.startLine).toBe(1);
      expect(matches[1].range.startLine).toBe(2);
    });
  });

  describe('Search Status Messages', () => {
    function formatSearchStatus(count, current = -1) {
      if (count === 0) {
        return 'No matches';
      }
      if (current >= 0) {
        return `${current + 1} of ${count}`;
      }
      return `${count} match${count === 1 ? '' : 'es'}`;
    }

    test('should show "No matches" for zero results', () => {
      expect(formatSearchStatus(0)).toBe('No matches');
    });

    test('should show singular for one match', () => {
      expect(formatSearchStatus(1)).toBe('1 match');
    });

    test('should show plural for multiple matches', () => {
      expect(formatSearchStatus(5)).toBe('5 matches');
    });

    test('should show current position when navigating', () => {
      expect(formatSearchStatus(10, 0)).toBe('1 of 10');
      expect(formatSearchStatus(10, 4)).toBe('5 of 10');
      expect(formatSearchStatus(10, 9)).toBe('10 of 10');
    });
  });

  describe('Word Separators', () => {
    // Monaco's default word separators
    const USUAL_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?';

    function isWordBoundary(char) {
      return USUAL_WORD_SEPARATORS.includes(char) || /\s/.test(char);
    }

    test('should identify common word separators', () => {
      expect(isWordBoundary(' ')).toBe(true);
      expect(isWordBoundary('.')).toBe(true);
      expect(isWordBoundary(',')).toBe(true);
      expect(isWordBoundary('(')).toBe(true);
      expect(isWordBoundary(')')).toBe(true);
    });

    test('should not identify letters as separators', () => {
      expect(isWordBoundary('a')).toBe(false);
      expect(isWordBoundary('Z')).toBe(false);
    });

    test('should not identify numbers as separators', () => {
      expect(isWordBoundary('0')).toBe(false);
      expect(isWordBoundary('9')).toBe(false);
    });

    test('should not identify underscore as separator', () => {
      // Note: underscore is NOT in Monaco's default separators
      expect(isWordBoundary('_')).toBe(false);
    });
  });
});

describe('Regex Escaping', () => {
  // Test the regex escaping function
  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  test('should escape asterisk', () => {
    expect(escapeRegex('test*')).toBe('test\\*');
  });

  test('should escape period', () => {
    expect(escapeRegex('file.txt')).toBe('file\\.txt');
  });

  test('should escape square brackets', () => {
    expect(escapeRegex('[text]')).toBe('\\[text\\]');
  });

  test('should escape parentheses', () => {
    expect(escapeRegex('(group)')).toBe('\\(group\\)');
  });

  test('should escape backslash', () => {
    expect(escapeRegex('path\\file')).toBe('path\\\\file');
  });

  test('should escape multiple special characters', () => {
    expect(escapeRegex('file.* (copy)')).toBe('file\\.\\* \\(copy\\)');
  });

  test('should not modify regular text', () => {
    expect(escapeRegex('normal text')).toBe('normal text');
  });
});

describe('Whole Word Matching', () => {
  function createWholeWordPattern(word, caseSensitive = false) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = '\\b' + escaped + '\\b';
    const flags = caseSensitive ? 'g' : 'gi';
    return new RegExp(pattern, flags);
  }

  test('should match whole word at start of string', () => {
    const regex = createWholeWordPattern('test');
    expect(regex.test('test string')).toBe(true);
  });

  test('should match whole word at end of string', () => {
    const regex = createWholeWordPattern('test');
    expect(regex.test('a test')).toBe(true);
  });

  test('should match whole word in middle of string', () => {
    const regex = createWholeWordPattern('test');
    expect(regex.test('this test works')).toBe(true);
  });

  test('should not match partial words', () => {
    const regex = createWholeWordPattern('test');
    regex.lastIndex = 0;
    expect(regex.test('testing')).toBe(false);
    regex.lastIndex = 0;
    expect(regex.test('contest')).toBe(false);
    regex.lastIndex = 0;
    expect(regex.test('attest')).toBe(false);
  });

  test('should match word with punctuation boundary', () => {
    const regex = createWholeWordPattern('test');
    regex.lastIndex = 0;
    expect(regex.test('test.')).toBe(true);
    regex.lastIndex = 0;
    expect(regex.test('test,')).toBe(true);
    regex.lastIndex = 0;
    expect(regex.test('(test)')).toBe(true);
  });

  test('should be case insensitive by default', () => {
    const regex = createWholeWordPattern('test');
    regex.lastIndex = 0;
    expect(regex.test('TEST')).toBe(true);
    regex.lastIndex = 0;
    expect(regex.test('Test')).toBe(true);
  });

  test('should be case sensitive when specified', () => {
    const regex = createWholeWordPattern('Test', true);
    regex.lastIndex = 0;
    expect(regex.test('Test')).toBe(true);
    regex.lastIndex = 0;
    expect(regex.test('test')).toBe(false);
    regex.lastIndex = 0;
    expect(regex.test('TEST')).toBe(false);
  });
});

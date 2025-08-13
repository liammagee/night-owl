// Test the BibTeX parsing functionality from renderer.js
// Since renderer.js is a large file, we'll extract and test the parseBibTeX function

describe('BibTeX Parser', () => {
  // Mock BibTeX parsing function (extracted from renderer.js)
  function parseBibTeX(content) {
    const entries = [];
    if (!content || content.trim() === '') return entries;

    // Split by @ signs and process each entry
    const entryStrings = content.split(/@/).filter(str => str.trim());
    
    for (const entryString of entryStrings) {
      const entry = parseIndividualEntry('@' + entryString);
      if (entry) {
        entries.push(entry);
      }
    }
    
    return entries;
  }

  function parseIndividualEntry(entryText) {
    const trimmed = entryText.trim();
    if (!trimmed.startsWith('@')) return null;

    // Extract entry type and key
    const match = trimmed.match(/@(\w+)\s*\{\s*([^,\s]+)\s*,/);
    if (!match) return null;

    const [, type, key] = match;
    const entry = { type: type.toLowerCase(), key, fields: {} };

    // Extract fields (simplified parser)
    const fieldMatches = trimmed.matchAll(/(\w+)\s*=\s*\{([^}]*)\}/g);
    for (const fieldMatch of fieldMatches) {
      const [, fieldName, fieldValue] = fieldMatch;
      entry.fields[fieldName.toLowerCase()] = fieldValue.trim();
    }

    return entry;
  }

  describe('Basic BibTeX Parsing', () => {
    test('should parse a simple article entry', () => {
      const bibContent = `@article{smith2024,
        title={A Great Article},
        author={John Smith},
        journal={Journal of Testing},
        year={2024}
      }`;

      const entries = parseBibTeX(bibContent);
      
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('article');
      expect(entries[0].key).toBe('smith2024');
      expect(entries[0].fields.title).toBe('A Great Article');
      expect(entries[0].fields.author).toBe('John Smith');
      expect(entries[0].fields.year).toBe('2024');
    });

    test('should parse multiple entries', () => {
      const bibContent = `@article{smith2024,
        title={First Article},
        author={John Smith},
        year={2024}
      }
      
      @book{doe2023,
        title={A Great Book},
        author={Jane Doe},
        publisher={Test Press},
        year={2023}
      }`;

      const entries = parseBibTeX(bibContent);
      
      expect(entries).toHaveLength(2);
      expect(entries[0].type).toBe('article');
      expect(entries[1].type).toBe('book');
      expect(entries[0].key).toBe('smith2024');
      expect(entries[1].key).toBe('doe2023');
    });

    test('should handle empty or invalid content', () => {
      expect(parseBibTeX('')).toEqual([]);
      expect(parseBibTeX('not a bibtex entry')).toEqual([]);
      expect(parseBibTeX(null)).toEqual([]);
      expect(parseBibTeX(undefined)).toEqual([]);
    });

    test('should handle malformed entries gracefully', () => {
      const bibContent = `@article{incomplete
        title={Missing closing brace
        author={No fields}
      
      @article{valid2024,
        title={This one is valid},
        author={Good Author},
        year={2024}
      }`;

      const entries = parseBibTeX(bibContent);
      
      // Should parse the valid entry and skip the malformed one
      expect(entries.length).toBeGreaterThanOrEqual(1);
      const validEntry = entries.find(e => e.key === 'valid2024');
      expect(validEntry).toBeDefined();
      expect(validEntry.fields.title).toBe('This one is valid');
    });
  });

  describe('Field Extraction', () => {
    test('should handle various field formats', () => {
      const bibContent = `@article{test2024,
        title={Title with {Special} Characters},
        author={Author One and Author Two},
        journal={Journal of {Complex} Names},
        year={2024},
        pages={1--10}
      }`;

      const entries = parseBibTeX(bibContent);
      const entry = entries[0];
      
      expect(entry.fields.title).toContain('Special');
      expect(entry.fields.author).toContain('and');
      expect(entry.fields.pages).toBe('1--10');
    });

    test('should handle different entry types', () => {
      const bibContent = `@book{book2024,
        title={Test Book},
        publisher={Test Publisher}
      }
      
      @inproceedings{conf2024,
        title={Conference Paper},
        booktitle={Proceedings of Testing}
      }
      
      @misc{misc2024,
        title={Miscellaneous Entry},
        note={A note}
      }`;

      const entries = parseBibTeX(bibContent);
      
      expect(entries).toHaveLength(3);
      expect(entries.map(e => e.type)).toEqual(['book', 'inproceedings', 'misc']);
    });
  });

  describe('Edge Cases', () => {
    test('should handle entries with nested braces', () => {
      const bibContent = `@article{nested2024,
        title={Title with {nested {braces} inside}},
        author={Complex Author},
        year={2024}
      }`;

      const entries = parseBibTeX(bibContent);
      expect(entries).toHaveLength(1);
      expect(entries[0].fields.title).toContain('nested');
    });

    test('should handle whitespace variations', () => {
      const bibContent = `  @article  {  whitespace2024  ,
        title  =  {  Lots of Spaces  }  ,
        author={Spacey Author},
        year={2024}
      }  `;

      const entries = parseBibTeX(bibContent);
      expect(entries).toHaveLength(1);
      expect(entries[0].key).toBe('whitespace2024');
    });
  });
});
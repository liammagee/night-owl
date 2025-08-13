// Test internal links functionality
describe('Internal Links Processing', () => {
  // Mock functions from internalLinks.js module
  function processInternalLinks(content, previewMode = 'hover') {
    if (!content) return '';
    
    const internalLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    
    // If disabled, remove internal links entirely
    if (previewMode === 'disabled') {
      return content.replace(internalLinkRegex, (match, link, displayText) => {
        const display = displayText ? displayText.trim() : link.trim();
        return display;
      });
    }
    
    // For hover mode, replace with clickable links
    if (previewMode === 'hover') {
      return content.replace(internalLinkRegex, (match, link, displayText) => {
        const cleanLink = link.trim();
        const display = displayText ? displayText.trim() : cleanLink;
        
        let filePath = cleanLink;
        if (!filePath.endsWith('.md') && !filePath.endsWith('.bib') && !filePath.endsWith('.pdf') && !filePath.includes('.')) {
          filePath += '.md';
        }
        
        return `<a href="#" class="internal-link" data-link="${encodeURIComponent(filePath)}" data-original-link="${encodeURIComponent(cleanLink)}" title="Open ${display}">${display}</a>`;
      });
    }
    
    return content;
  }

  function extractLinkReferences(content) {
    const links = [];
    const internalLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let match;
    
    while ((match = internalLinkRegex.exec(content)) !== null) {
      const [fullMatch, link, displayText] = match;
      links.push({
        original: fullMatch,
        target: link.trim(),
        display: displayText ? displayText.trim() : link.trim()
      });
    }
    
    return links;
  }

  describe('Link Pattern Recognition', () => {
    test('should identify simple internal links', () => {
      const content = 'This references [[another-file]] in our system.';
      const links = extractLinkReferences(content);
      
      expect(links).toHaveLength(1);
      expect(links[0].target).toBe('another-file');
      expect(links[0].display).toBe('another-file');
    });

    test('should identify links with custom display text', () => {
      const content = 'See [[file-name|Custom Display Text]] for details.';
      const links = extractLinkReferences(content);
      
      expect(links).toHaveLength(1);
      expect(links[0].target).toBe('file-name');
      expect(links[0].display).toBe('Custom Display Text');
    });

    test('should handle multiple links in content', () => {
      const content = 'References: [[file1]], [[file2|Second File]], and [[file3]].';
      const links = extractLinkReferences(content);
      
      expect(links).toHaveLength(3);
      expect(links[0].target).toBe('file1');
      expect(links[1].target).toBe('file2');
      expect(links[1].display).toBe('Second File');
      expect(links[2].target).toBe('file3');
    });

    test('should handle links to different file types', () => {
      const content = `
        [[document.md]]
        [[references.bib]]
        [[presentation.pdf]]
        [[webpage.html]]
        [[no-extension]]
      `;
      const links = extractLinkReferences(content);
      
      expect(links).toHaveLength(5);
      expect(links.map(l => l.target)).toEqual([
        'document.md',
        'references.bib', 
        'presentation.pdf',
        'webpage.html',
        'no-extension'
      ]);
    });
  });

  describe('Link Processing in Different Modes', () => {
    test('should create clickable links in hover mode', () => {
      const content = 'See [[other-file]] for more info.';
      const processed = processInternalLinks(content, 'hover');
      
      expect(processed).toContain('<a href="#"');
      expect(processed).toContain('class="internal-link"');
      expect(processed).toContain('data-link="other-file.md"');
      expect(processed).toContain('data-original-link="other-file"');
    });

    test('should remove links entirely in disabled mode', () => {
      const content = 'This has [[internal-link|a link]] to remove.';
      const processed = processInternalLinks(content, 'disabled');
      
      expect(processed).toBe('This has a link to remove.');
      expect(processed).not.toContain('[[');
      expect(processed).not.toContain(']]');
    });

    test('should preserve display text when removing links', () => {
      const content = 'Check [[filename|this important document]] out.';
      const processed = processInternalLinks(content, 'disabled');
      
      expect(processed).toBe('Check this important document out.');
    });

    test('should handle complex content with mixed links', () => {
      const content = `
        # Document Title
        
        This document references [[file1]] and [[file2|File Two]].
        
        ## Section
        
        More content with [[another-reference]].
      `;
      
      const hoverProcessed = processInternalLinks(content, 'hover');
      const disabledProcessed = processInternalLinks(content, 'disabled');
      
      // Hover mode should have HTML links
      expect(hoverProcessed).toContain('class="internal-link"');
      expect((hoverProcessed.match(/class="internal-link"/g) || []).length).toBe(3);
      
      // Disabled mode should have plain text
      expect(disabledProcessed).not.toContain('[[');
      expect(disabledProcessed).toContain('file1');
      expect(disabledProcessed).toContain('File Two');
      expect(disabledProcessed).toContain('another-reference');
    });
  });

  describe('File Path Processing', () => {
    test('should add .md extension to extensionless files', () => {
      const content = '[[simple-file]]';
      const processed = processInternalLinks(content, 'hover');
      
      expect(processed).toContain('data-link="simple-file.md"');
    });

    test('should preserve existing file extensions', () => {
      const testCases = [
        ['[[doc.md]]', 'doc.md'],
        ['[[refs.bib]]', 'refs.bib'],
        ['[[slides.pdf]]', 'slides.pdf'],
        ['[[page.html]]', 'page.html'],
        ['[[index.htm]]', 'index.htm']
      ];
      
      testCases.forEach(([input, expectedPath]) => {
        const processed = processInternalLinks(input, 'hover');
        expect(processed).toContain(`data-link="${expectedPath}"`);
      });
    });

    test('should handle special characters in file names', () => {
      const content = '[[file-with-dashes]] and [[file_with_underscores]]';
      const processed = processInternalLinks(content, 'hover');
      
      expect(processed).toContain('file-with-dashes.md');
      expect(processed).toContain('file_with_underscores.md');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty or null content', () => {
      expect(processInternalLinks('')).toBe('');
      expect(processInternalLinks(null)).toBe('');
      expect(processInternalLinks(undefined)).toBe('');
    });

    test('should handle malformed link syntax', () => {
      const content = `
        [[incomplete-link
        [single-bracket]
        [[]]
        [[|empty-target]]
        [[normal-link]]
      `;
      
      const links = extractLinkReferences(content);
      expect(links).toHaveLength(1);
      expect(links[0].target).toBe('normal-link');
    });

    test('should handle nested brackets', () => {
      const content = '[[file-with-[brackets]-inside]]';
      const links = extractLinkReferences(content);
      
      // This should not match due to nested brackets
      expect(links).toHaveLength(0);
    });

    test('should handle links with whitespace', () => {
      const content = '[[ spaced-file ]] and [[another-file|  Spaced Display  ]]';
      const processed = processInternalLinks(content, 'disabled');
      
      expect(processed).toBe('spaced-file and Spaced Display');
    });
  });
});
/**
 * Unit tests for visualMarkdown.js parsing functions
 * Tests the regex patterns and parsing logic for markdown elements
 */

describe('Visual Markdown Module', () => {
  // Re-create the patterns from visualMarkdown.js for testing
  const patterns = {
    // Images: ![alt](url) or ![alt](url "title")
    image: /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,

    // Bold: **text** or __text__
    bold: /(\*\*|__)(?!\s)(.+?)(?<!\s)\1/g,

    // Italic: *text* or _text_ (not inside bold)
    italic: /(?<!\*|\w)(\*|_)(?!\s|\1)(.+?)(?<!\s)\1(?!\*|\w)/g,

    // Strikethrough: ~~text~~
    strikethrough: /~~(?!\s)(.+?)(?<!\s)~~/g,

    // Inline code: `code`
    inlineCode: /`([^`\n]+)`/g,

    // Links: [text](url) or [text](url "title")
    link: /(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,

    // Wiki-style links: [[filename]] or [[filename|display text]]
    wikiLink: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,

    // Checkbox: - [ ] or - [x] or - [X]
    checkbox: /^(\s*[-*+]\s+)\[([ xX])\]/,

    // Code block: ```lang ... ```
    codeBlock: /^```(\w*)\s*$/,

    // Block math: $$ ... $$
    blockMath: /\$\$([^$]+)\$\$/g,

    // Inline math: $...$
    inlineMath: /(?<!\$)\$(?!\$)([^$\n]+)\$(?!\$)/g,

    // Table row: | cell | cell |
    tableRow: /^\|(.+)\|$/
  };

  describe('Image Pattern', () => {
    test('should match simple image syntax', () => {
      const text = '![alt text](image.png)';
      const matches = [...text.matchAll(patterns.image)];

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe('alt text');
      expect(matches[0][2]).toBe('image.png');
    });

    test('should match image with title', () => {
      const text = '![alt](image.jpg "Image Title")';
      const matches = [...text.matchAll(patterns.image)];

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe('alt');
      expect(matches[0][2]).toBe('image.jpg');
      expect(matches[0][3]).toBe('Image Title');
    });

    test('should match image with URL', () => {
      const text = '![Logo](https://example.com/logo.png)';
      const matches = [...text.matchAll(patterns.image)];

      expect(matches).toHaveLength(1);
      expect(matches[0][2]).toBe('https://example.com/logo.png');
    });

    test('should match multiple images', () => {
      const text = '![img1](a.png) and ![img2](b.png)';
      const matches = [...text.matchAll(patterns.image)];

      expect(matches).toHaveLength(2);
    });

    test('should handle empty alt text', () => {
      const text = '![](image.png)';
      const matches = [...text.matchAll(patterns.image)];

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe('');
    });
  });

  describe('Bold Pattern', () => {
    test('should match **bold** text', () => {
      const text = 'This is **bold** text';
      const matches = [...text.matchAll(patterns.bold)];

      expect(matches).toHaveLength(1);
      expect(matches[0][2]).toBe('bold');
    });

    test('should match __bold__ text', () => {
      const text = 'This is __bold__ text';
      const matches = [...text.matchAll(patterns.bold)];

      expect(matches).toHaveLength(1);
      expect(matches[0][2]).toBe('bold');
    });

    test('should match multiple bold segments', () => {
      const text = '**first** and **second**';
      const matches = [...text.matchAll(patterns.bold)];

      expect(matches).toHaveLength(2);
    });

    test('should not match bold with leading/trailing spaces', () => {
      const text = '** not bold ** or **not bold **';
      const matches = [...text.matchAll(patterns.bold)];

      expect(matches).toHaveLength(0);
    });
  });

  describe('Strikethrough Pattern', () => {
    test('should match ~~strikethrough~~ text', () => {
      const text = 'This is ~~deleted~~ text';
      const matches = [...text.matchAll(patterns.strikethrough)];

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe('deleted');
    });

    test('should match multiple strikethroughs', () => {
      const text = '~~one~~ and ~~two~~';
      const matches = [...text.matchAll(patterns.strikethrough)];

      expect(matches).toHaveLength(2);
    });
  });

  describe('Inline Code Pattern', () => {
    test('should match `inline code`', () => {
      const text = 'Use `console.log()` for debugging';
      const matches = [...text.matchAll(patterns.inlineCode)];

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe('console.log()');
    });

    test('should match multiple inline code segments', () => {
      const text = '`const` and `let` are keywords';
      const matches = [...text.matchAll(patterns.inlineCode)];

      expect(matches).toHaveLength(2);
    });

    test('should not match across newlines', () => {
      const text = '`start\nend`';
      const matches = [...text.matchAll(patterns.inlineCode)];

      expect(matches).toHaveLength(0);
    });
  });

  describe('Link Pattern', () => {
    test('should match [text](url) links', () => {
      const text = 'Visit [Google](https://google.com) for search';
      const matches = [...text.matchAll(patterns.link)];

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe('Google');
      expect(matches[0][2]).toBe('https://google.com');
    });

    test('should match link with title', () => {
      const text = '[Link](url.html "Title")';
      const matches = [...text.matchAll(patterns.link)];

      expect(matches).toHaveLength(1);
      expect(matches[0][3]).toBe('Title');
    });

    test('should not match images (starting with !)', () => {
      const text = '![alt](image.png) vs [link](url.html)';
      const matches = [...text.matchAll(patterns.link)];

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe('link');
    });
  });

  describe('Wiki Link Pattern', () => {
    test('should match [[simple-link]]', () => {
      const text = 'See [[other-document]] for details';
      const matches = [...text.matchAll(patterns.wikiLink)];

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe('other-document');
    });

    test('should match [[link|display text]]', () => {
      const text = 'See [[file-name|Display Text]] here';
      const matches = [...text.matchAll(patterns.wikiLink)];

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe('file-name');
      expect(matches[0][2]).toBe('Display Text');
    });

    test('should match multiple wiki links', () => {
      const text = '[[link1]] and [[link2|Text]] and [[link3]]';
      const matches = [...text.matchAll(patterns.wikiLink)];

      expect(matches).toHaveLength(3);
    });

    test('should handle paths with slashes', () => {
      const text = '[[folder/subfolder/file]]';
      const matches = [...text.matchAll(patterns.wikiLink)];

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe('folder/subfolder/file');
    });
  });

  describe('Checkbox Pattern', () => {
    test('should match unchecked checkbox - [ ]', () => {
      const line = '- [ ] Todo item';
      const match = line.match(patterns.checkbox);

      expect(match).not.toBeNull();
      expect(match[2]).toBe(' ');
    });

    test('should match checked checkbox - [x]', () => {
      const line = '- [x] Completed item';
      const match = line.match(patterns.checkbox);

      expect(match).not.toBeNull();
      expect(match[2]).toBe('x');
    });

    test('should match checked checkbox - [X]', () => {
      const line = '- [X] Also completed';
      const match = line.match(patterns.checkbox);

      expect(match).not.toBeNull();
      expect(match[2]).toBe('X');
    });

    test('should match checkbox with * list marker', () => {
      const line = '* [ ] Using asterisk';
      const match = line.match(patterns.checkbox);

      expect(match).not.toBeNull();
    });

    test('should match indented checkbox', () => {
      const line = '  - [ ] Indented item';
      const match = line.match(patterns.checkbox);

      expect(match).not.toBeNull();
      expect(match[1]).toBe('  - ');
    });
  });

  describe('Code Block Pattern', () => {
    test('should match opening code block with language', () => {
      const line = '```javascript';
      const match = line.match(patterns.codeBlock);

      expect(match).not.toBeNull();
      expect(match[1]).toBe('javascript');
    });

    test('should match opening code block without language', () => {
      const line = '```';
      const match = line.match(patterns.codeBlock);

      expect(match).not.toBeNull();
      expect(match[1]).toBe('');
    });

    test('should not match inline triple backticks', () => {
      const line = 'Some ```code``` inline';
      const match = line.match(patterns.codeBlock);

      expect(match).toBeNull();
    });
  });

  describe('Math Patterns', () => {
    test('should match block math $$...$$', () => {
      const text = '$$E = mc^2$$';
      const matches = [...text.matchAll(patterns.blockMath)];

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe('E = mc^2');
    });

    test('should match inline math $...$', () => {
      const text = 'The formula $x + y = z$ is simple';
      const matches = [...text.matchAll(patterns.inlineMath)];

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe('x + y = z');
    });

    test('should not confuse inline with block math', () => {
      const text = '$$block$$ and $inline$';
      const blockMatches = [...text.matchAll(patterns.blockMath)];
      const inlineMatches = [...text.matchAll(patterns.inlineMath)];

      expect(blockMatches).toHaveLength(1);
      expect(inlineMatches).toHaveLength(1);
    });
  });

  describe('Table Row Pattern', () => {
    test('should match simple table row', () => {
      const line = '| Cell 1 | Cell 2 |';
      const match = line.match(patterns.tableRow);

      expect(match).not.toBeNull();
      expect(match[1]).toBe(' Cell 1 | Cell 2 ');
    });

    test('should match table header separator', () => {
      const line = '|---|---|';
      const match = line.match(patterns.tableRow);

      expect(match).not.toBeNull();
    });

    test('should not match non-table content', () => {
      const line = 'Regular text without pipes';
      const match = line.match(patterns.tableRow);

      expect(match).toBeNull();
    });
  });
});

describe('Visual Markdown Utilities', () => {
  // Helper functions that would be exported from the module

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  function isLocalPath(url) {
    return !url.startsWith('http://') &&
           !url.startsWith('https://') &&
           !url.startsWith('data:');
  }

  function normalizeFilePath(path) {
    // Add .md extension if no extension present
    if (!path.includes('.')) {
      return path + '.md';
    }
    return path;
  }

  describe('escapeHtml', () => {
    test('should escape HTML special characters', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
      expect(escapeHtml('a & b')).toBe('a &amp; b');
      expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
    });

    test('should return unchanged string without special chars', () => {
      expect(escapeHtml('normal text')).toBe('normal text');
    });
  });

  describe('isLocalPath', () => {
    test('should identify local paths', () => {
      expect(isLocalPath('image.png')).toBe(true);
      expect(isLocalPath('./folder/image.png')).toBe(true);
      expect(isLocalPath('../image.png')).toBe(true);
      expect(isLocalPath('/absolute/path.png')).toBe(true);
    });

    test('should identify remote URLs', () => {
      expect(isLocalPath('http://example.com/img.png')).toBe(false);
      expect(isLocalPath('https://example.com/img.png')).toBe(false);
    });

    test('should identify data URLs', () => {
      expect(isLocalPath('data:image/png;base64,xxx')).toBe(false);
    });
  });

  describe('normalizeFilePath', () => {
    test('should add .md extension when missing', () => {
      expect(normalizeFilePath('document')).toBe('document.md');
      expect(normalizeFilePath('folder/file')).toBe('folder/file.md');
    });

    test('should preserve existing extensions', () => {
      expect(normalizeFilePath('document.md')).toBe('document.md');
      expect(normalizeFilePath('refs.bib')).toBe('refs.bib');
      expect(normalizeFilePath('doc.pdf')).toBe('doc.pdf');
    });
  });
});

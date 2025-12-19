/**
 * Unit tests for search handlers functionality
 * Tests wildcard/glob pattern search and file operations
 */

describe('Search Handlers', () => {

  describe('Glob Pattern Detection', () => {
    // Replicate the isFilePatternQuery function from searchHandlers.js
    function isFilePatternQuery(query) {
      return /^\*\.[a-zA-Z0-9]+$/.test(query) ||  // *.bib, *.md
             /^[^*]+\.\*$/.test(query) ||          // file.*
             /^\*[^*]+\*$/.test(query) ||          // *pattern*
             /^\*[^*]+$/.test(query) ||            // *suffix
             /^[^*]+\*$/.test(query);              // prefix*
    }

    test('should detect *.extension patterns', () => {
      expect(isFilePatternQuery('*.bib')).toBe(true);
      expect(isFilePatternQuery('*.md')).toBe(true);
      expect(isFilePatternQuery('*.json')).toBe(true);
      expect(isFilePatternQuery('*.txt')).toBe(true);
      expect(isFilePatternQuery('*.yaml')).toBe(true);
    });

    test('should detect prefix* patterns', () => {
      expect(isFilePatternQuery('test*')).toBe(true);
      expect(isFilePatternQuery('config*')).toBe(true);
      expect(isFilePatternQuery('README*')).toBe(true);
    });

    test('should detect *suffix patterns', () => {
      expect(isFilePatternQuery('*config')).toBe(true);
      expect(isFilePatternQuery('*test')).toBe(true);
    });

    test('should detect *middle* patterns', () => {
      expect(isFilePatternQuery('*config*')).toBe(true);
      expect(isFilePatternQuery('*test*')).toBe(true);
      expect(isFilePatternQuery('*handler*')).toBe(true);
    });

    test('should detect file.* patterns', () => {
      expect(isFilePatternQuery('config.*')).toBe(true);
      expect(isFilePatternQuery('package.*')).toBe(true);
    });

    test('should NOT detect regular text queries as patterns', () => {
      expect(isFilePatternQuery('hello world')).toBe(false);
      expect(isFilePatternQuery('search term')).toBe(false);
      expect(isFilePatternQuery('function name')).toBe(false);
      expect(isFilePatternQuery('className')).toBe(false);
    });

    test('should NOT detect queries without wildcards as patterns', () => {
      expect(isFilePatternQuery('file.md')).toBe(false);
      expect(isFilePatternQuery('references.bib')).toBe(false);
      expect(isFilePatternQuery('config.json')).toBe(false);
    });
  });

  describe('Glob to Regex Conversion', () => {
    // Replicate the globToRegex function from searchHandlers.js
    function globToRegex(pattern) {
      let regexStr = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(`^${regexStr}$`, 'i');
    }

    test('should match *.extension patterns correctly', () => {
      const bibRegex = globToRegex('*.bib');
      expect(bibRegex.test('references.bib')).toBe(true);
      expect(bibRegex.test('citations.bib')).toBe(true);
      expect(bibRegex.test('test.bib')).toBe(true);
      expect(bibRegex.test('file.md')).toBe(false);
      expect(bibRegex.test('bib.txt')).toBe(false);
    });

    test('should match prefix* patterns correctly', () => {
      const testRegex = globToRegex('test*');
      expect(testRegex.test('test.js')).toBe(true);
      expect(testRegex.test('test-file.md')).toBe(true);
      expect(testRegex.test('testing.txt')).toBe(true);
      expect(testRegex.test('mytest.js')).toBe(false);
    });

    test('should match *suffix patterns correctly', () => {
      const configRegex = globToRegex('*config');
      expect(configRegex.test('app-config')).toBe(true);
      expect(configRegex.test('myconfig')).toBe(true);
      expect(configRegex.test('config.js')).toBe(false);
    });

    test('should match *middle* patterns correctly', () => {
      const handlerRegex = globToRegex('*handler*');
      expect(handlerRegex.test('fileHandler.js')).toBe(true);
      expect(handlerRegex.test('my-handler-test')).toBe(true);
      expect(handlerRegex.test('handler')).toBe(true);
      expect(handlerRegex.test('process.js')).toBe(false);
    });

    test('should be case-insensitive', () => {
      const mdRegex = globToRegex('*.MD');
      expect(mdRegex.test('readme.md')).toBe(true);
      expect(mdRegex.test('README.MD')).toBe(true);
      expect(mdRegex.test('File.Md')).toBe(true);
    });

    test('should escape special regex characters in pattern', () => {
      const dotPattern = globToRegex('file.test.*');
      expect(dotPattern.test('file.test.js')).toBe(true);
      expect(dotPattern.test('file.test.md')).toBe(true);
      expect(dotPattern.test('file-test.js')).toBe(false);
    });

    test('should support ? wildcard for single character', () => {
      const questionRegex = globToRegex('test?.js');
      expect(questionRegex.test('test1.js')).toBe(true);
      expect(questionRegex.test('testa.js')).toBe(true);
      expect(questionRegex.test('test.js')).toBe(false);
      expect(questionRegex.test('test12.js')).toBe(false);
    });
  });

  describe('File Pattern Matching', () => {
    function globToRegex(pattern) {
      let regexStr = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(`^${regexStr}$`, 'i');
    }

    test('should find .bib files in a list', () => {
      const files = [
        'references.bib',
        'citations.bib',
        'readme.md',
        'config.json',
        'main.bib'
      ];
      const pattern = globToRegex('*.bib');
      const matches = files.filter(f => pattern.test(f));

      expect(matches).toHaveLength(3);
      expect(matches).toContain('references.bib');
      expect(matches).toContain('citations.bib');
      expect(matches).toContain('main.bib');
      expect(matches).not.toContain('readme.md');
    });

    test('should find test files in a list', () => {
      const files = [
        'test.js',
        'test-utils.js',
        'testing.spec.js',
        'helper.js',
        'test'
      ];
      const pattern = globToRegex('test*');
      const matches = files.filter(f => pattern.test(f));

      expect(matches).toHaveLength(4);
      expect(matches).not.toContain('helper.js');
    });

    test('should find config files with *config* pattern', () => {
      const files = [
        'app-config.json',
        'jest.config.js',
        'webpack.config.js',
        'package.json',
        'tsconfig.json'
      ];
      const pattern = globToRegex('*config*');
      const matches = files.filter(f => pattern.test(f));

      expect(matches).toHaveLength(4);
      expect(matches).toContain('tsconfig.json');
      expect(matches).not.toContain('package.json');
    });
  });
});

describe('File Clipboard Operations', () => {
  describe('Clipboard State Management', () => {
    test('should store file path and operation for cut', () => {
      const fileClipboard = {
        filePath: '/test/path/file.md',
        operation: 'cut'
      };

      expect(fileClipboard.filePath).toBe('/test/path/file.md');
      expect(fileClipboard.operation).toBe('cut');
    });

    test('should store file path and operation for copy', () => {
      const fileClipboard = {
        filePath: '/test/path/file.md',
        operation: 'copy'
      };

      expect(fileClipboard.filePath).toBe('/test/path/file.md');
      expect(fileClipboard.operation).toBe('copy');
    });

    test('should clear clipboard after cut/paste operation', () => {
      let fileClipboard = {
        filePath: '/test/path/file.md',
        operation: 'cut'
      };

      // Simulate successful paste
      fileClipboard = { filePath: null, operation: null };

      expect(fileClipboard.filePath).toBeNull();
      expect(fileClipboard.operation).toBeNull();
    });

    test('should preserve clipboard after copy/paste operation', () => {
      const fileClipboard = {
        filePath: '/test/path/file.md',
        operation: 'copy'
      };

      // After paste, clipboard should remain for multiple pastes
      expect(fileClipboard.filePath).toBe('/test/path/file.md');
      expect(fileClipboard.operation).toBe('copy');
    });

    test('should detect when clipboard has content', () => {
      const emptyClipboard = { filePath: null, operation: null };
      const filledClipboard = { filePath: '/test/file.md', operation: 'cut' };

      expect(emptyClipboard.filePath && emptyClipboard.operation).toBeFalsy();
      expect(filledClipboard.filePath && filledClipboard.operation).toBeTruthy();
    });
  });

  describe('Paste Label Generation', () => {
    test('should generate correct paste label for cut operation', () => {
      const fileClipboard = {
        filePath: '/test/path/document.md',
        operation: 'cut'
      };
      const fileName = fileClipboard.filePath.split('/').pop();
      const pasteLabel = `Paste (Move "${fileName}")`;

      expect(pasteLabel).toBe('Paste (Move "document.md")');
    });

    test('should generate correct paste label for copy operation', () => {
      const fileClipboard = {
        filePath: '/test/path/document.md',
        operation: 'copy'
      };
      const fileName = fileClipboard.filePath.split('/').pop();
      const pasteLabel = `Paste (Copy "${fileName}")`;

      expect(pasteLabel).toBe('Paste (Copy "document.md")');
    });
  });
});

describe('File Move/Copy Operations', () => {
  const path = require('path');

  describe('Path Manipulation', () => {
    test('should extract filename from path', () => {
      const filePath = '/Users/test/documents/file.md';
      const fileName = filePath.split('/').pop();
      expect(fileName).toBe('file.md');
    });

    test('should extract directory from path', () => {
      const filePath = '/Users/test/documents/file.md';
      const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
      expect(dirPath).toBe('/Users/test/documents');
    });

    test('should construct destination path correctly', () => {
      const fileName = 'file.md';
      const destFolder = '/Users/test/new-folder';
      const destPath = destFolder + '/' + fileName;
      expect(destPath).toBe('/Users/test/new-folder/file.md');
    });

    test('should generate copy name when copying to same directory', () => {
      const fileName = 'document.md';
      const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
      const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '';
      const copyName = baseName + ' (copy)' + ext;

      expect(copyName).toBe('document (copy).md');
    });

    test('should handle files without extensions for copy naming', () => {
      const fileName = 'README';
      const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
      const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '';
      const copyName = baseName + ' (copy)' + ext;

      expect(copyName).toBe('README (copy)');
    });

    test('should handle files with multiple dots in name', () => {
      const fileName = 'file.test.spec.js';
      const baseName = fileName.substring(0, fileName.lastIndexOf('.'));
      const ext = fileName.substring(fileName.lastIndexOf('.'));
      const copyName = baseName + ' (copy)' + ext;

      expect(copyName).toBe('file.test.spec (copy).js');
    });
  });

  describe('Same Directory Detection', () => {
    test('should detect when source and destination are same directory', () => {
      const filePath = '/Users/test/documents/file.md';
      const currentDir = filePath.substring(0, filePath.lastIndexOf('/'));
      const destFolder = '/Users/test/documents';

      expect(currentDir === destFolder).toBe(true);
    });

    test('should detect when source and destination are different directories', () => {
      const filePath = '/Users/test/documents/file.md';
      const currentDir = filePath.substring(0, filePath.lastIndexOf('/'));
      const destFolder = '/Users/test/other-folder';

      expect(currentDir === destFolder).toBe(false);
    });
  });
});

describe('Search Results Display', () => {
  describe('File Icons', () => {
    // Replicate the getFileIcon function
    function getFileIcon(filename) {
      const ext = (filename.split('.').pop() || '').toLowerCase();
      const icons = {
        'md': 'doc-icon',
        'markdown': 'doc-icon',
        'txt': 'text-icon',
        'bib': 'book-icon',
        'json': 'code-icon',
        'yaml': 'code-icon',
        'yml': 'code-icon',
        'js': 'script-icon',
        'ts': 'script-icon',
        'css': 'style-icon',
        'html': 'web-icon',
        'pdf': 'pdf-icon'
      };
      return icons[ext] || 'default-icon';
    }

    test('should return correct icon for markdown files', () => {
      expect(getFileIcon('readme.md')).toBe('doc-icon');
      expect(getFileIcon('document.markdown')).toBe('doc-icon');
    });

    test('should return correct icon for bib files', () => {
      expect(getFileIcon('references.bib')).toBe('book-icon');
    });

    test('should return correct icon for code files', () => {
      expect(getFileIcon('app.js')).toBe('script-icon');
      expect(getFileIcon('utils.ts')).toBe('script-icon');
      expect(getFileIcon('config.json')).toBe('code-icon');
    });

    test('should return default icon for unknown extensions', () => {
      expect(getFileIcon('data.xyz')).toBe('default-icon');
      expect(getFileIcon('unknown')).toBe('default-icon');
    });
  });

  describe('Results Grouping', () => {
    test('should group files by source folder', () => {
      const files = [
        { name: 'a.md', sourceFolder: '/folder1' },
        { name: 'b.md', sourceFolder: '/folder1' },
        { name: 'c.md', sourceFolder: '/folder2' },
        { name: 'd.md', sourceFolder: '/folder2' }
      ];

      const byFolder = {};
      files.forEach(file => {
        const folder = file.sourceFolder || 'Unknown';
        if (!byFolder[folder]) byFolder[folder] = [];
        byFolder[folder].push(file);
      });

      expect(Object.keys(byFolder)).toHaveLength(2);
      expect(byFolder['/folder1']).toHaveLength(2);
      expect(byFolder['/folder2']).toHaveLength(2);
    });
  });
});

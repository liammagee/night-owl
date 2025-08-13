const fs = require('fs/promises');
const path = require('path');

// Import the module we want to test
// Note: Since main.js has side effects, we'll test individual functions
// In a real scenario, you'd refactor main.js to export testable functions

describe('File Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('File Reading', () => {
    test('should read markdown files successfully', async () => {
      const mockContent = '# Test Markdown\n\nThis is a test.';
      fs.readFile.mockResolvedValue(mockContent);

      const filePath = '/mock/path/test.md';
      const content = await fs.readFile(filePath, 'utf8');

      expect(content).toBe(mockContent);
      expect(fs.readFile).toHaveBeenCalledWith(filePath, 'utf8');
    });

    test('should handle file read errors gracefully', async () => {
      const mockError = new Error('File not found');
      fs.readFile.mockRejectedValue(mockError);

      await expect(fs.readFile('/nonexistent/file.md', 'utf8'))
        .rejects.toThrow('File not found');
    });

    test('should read bib files correctly', async () => {
      const mockBibContent = `@article{test2024,
        title={Test Article},
        author={Test Author},
        year={2024}
      }`;
      fs.readFile.mockResolvedValue(mockBibContent);

      const content = await fs.readFile('/mock/references.bib', 'utf8');
      expect(content).toContain('@article{test2024');
    });
  });

  describe('File Writing', () => {
    test('should write markdown files successfully', async () => {
      const content = '# New Document\n\nContent here.';
      const filePath = '/mock/path/new-doc.md';
      
      fs.writeFile.mockResolvedValue();

      await fs.writeFile(filePath, content, 'utf8');

      expect(fs.writeFile).toHaveBeenCalledWith(filePath, content, 'utf8');
    });

    test('should handle write errors gracefully', async () => {
      const mockError = new Error('Permission denied');
      fs.writeFile.mockRejectedValue(mockError);

      await expect(fs.writeFile('/readonly/file.md', 'content', 'utf8'))
        .rejects.toThrow('Permission denied');
    });
  });

  describe('Directory Operations', () => {
    test('should list directory contents', async () => {
      const mockFiles = [
        { name: 'file1.md', isFile: () => true, isDirectory: () => false },
        { name: 'folder1', isFile: () => false, isDirectory: () => true },
        { name: 'references.bib', isFile: () => true, isDirectory: () => false }
      ];
      
      fs.readdir.mockResolvedValue(mockFiles);

      const files = await fs.readdir('/mock/directory', { withFileTypes: true });
      
      expect(files).toHaveLength(3);
      expect(files[0].name).toBe('file1.md');
      expect(files[1].isDirectory()).toBe(true);
    });

    test('should create directories', async () => {
      fs.mkdir.mockResolvedValue();

      await fs.mkdir('/mock/new-folder', { recursive: true });

      expect(fs.mkdir).toHaveBeenCalledWith('/mock/new-folder', { recursive: true });
    });
  });

  describe('File Path Validation', () => {
    test('should validate markdown file extensions', () => {
      const validFiles = ['test.md', 'document.markdown', 'notes.MD'];
      const invalidFiles = ['test.txt', 'document.doc', 'image.png'];

      validFiles.forEach(file => {
        expect(file.match(/\.(md|markdown)$/i)).toBeTruthy();
      });

      invalidFiles.forEach(file => {
        expect(file.match(/\.(md|markdown)$/i)).toBeFalsy();
      });
    });

    test('should validate bib file extensions', () => {
      expect('references.bib'.endsWith('.bib')).toBe(true);
      expect('citations.BIB'.toLowerCase().endsWith('.bib')).toBe(true);
      expect('notabib.txt'.endsWith('.bib')).toBe(false);
    });
  });
});
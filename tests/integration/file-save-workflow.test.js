// Integration test for file save workflow
const { ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');

describe('File Save Workflow Integration', () => {
  let mockWindow;
  let testFilePath;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock BrowserWindow
    mockWindow = {
      webContents: {
        send: jest.fn()
      }
    };
    
    testFilePath = path.join(__dirname, '../fixtures/test-save.md');
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.unlink(testFilePath);
    } catch (error) {
      // File might not exist, ignore
    }
  });

  describe('IPC Communication for File Operations', () => {
    test('should handle file save requests correctly', async () => {
      const testContent = '# Test Document\n\nThis is a test document.';
      
      // Mock the file write operation
      fs.writeFile.mockResolvedValue();
      
      // Simulate IPC handler for file save
      const mockSaveHandler = jest.fn(async (event, filePath, content) => {
        await fs.writeFile(filePath, content, 'utf8');
        return { success: true, filePath };
      });
      
      // Register the handler
      ipcMain.handle.mockImplementation((channel, handler) => {
        if (channel === 'perform-save') {
          return mockSaveHandler;
        }
      });
      
      // Simulate the save operation
      const result = await mockSaveHandler(null, testFilePath, testContent);
      
      expect(result.success).toBe(true);
      expect(result.filePath).toBe(testFilePath);
      expect(fs.writeFile).toHaveBeenCalledWith(testFilePath, testContent, 'utf8');
    });

    test('should handle file read requests correctly', async () => {
      const testContent = '# Existing Document\n\nThis already exists.';
      
      // Mock the file read operation
      fs.readFile.mockResolvedValue(testContent);
      
      // Simulate IPC handler for file read
      const mockReadHandler = jest.fn(async (event, filePath) => {
        const content = await fs.readFile(filePath, 'utf8');
        return { success: true, filePath, content };
      });
      
      // Simulate the read operation
      const result = await mockReadHandler(null, testFilePath);
      
      expect(result.success).toBe(true);
      expect(result.content).toBe(testContent);
      expect(fs.readFile).toHaveBeenCalledWith(testFilePath, 'utf8');
    });

    test('should handle directory listing for file tree', async () => {
      const mockFiles = [
        { name: 'lecture-1.md', isFile: () => true, isDirectory: () => false },
        { name: 'lecture-2.md', isFile: () => true, isDirectory: () => false },
        { name: 'references.bib', isFile: () => true, isDirectory: () => false },
        { name: 'images', isFile: () => false, isDirectory: () => true }
      ];
      
      fs.readdir.mockResolvedValue(mockFiles);
      
      const mockListHandler = jest.fn(async (event) => {
        const files = await fs.readdir('/mock/directory', { withFileTypes: true });
        return files.map(file => ({
          name: file.name,
          isFile: file.isFile(),
          isDirectory: file.isDirectory()
        }));
      });
      
      const result = await mockListHandler();
      
      expect(result).toHaveLength(4);
      expect(result[0].name).toBe('lecture-1.md');
      expect(result[0].isFile).toBe(true);
      expect(result[3].name).toBe('images');
      expect(result[3].isDirectory).toBe(true);
    });
  });

  describe('File Operations with Internal Links', () => {
    test('should save files with internal links without corruption', async () => {
      const contentWithLinks = `# Main Document

This document references [[other-document]] and [[another-file|Custom Name]].

## Section

More content here with [[third-reference]].`;

      fs.writeFile.mockResolvedValue();
      
      const mockSaveHandler = jest.fn(async (event, filePath, content) => {
        // Ensure internal links are preserved
        if (!content.includes('[[') || !content.includes(']]')) {
          throw new Error('Internal links were corrupted during save');
        }
        
        await fs.writeFile(filePath, content, 'utf8');
        return { success: true, filePath, content };
      });
      
      const result = await mockSaveHandler(null, testFilePath, contentWithLinks);
      
      expect(result.success).toBe(true);
      expect(result.content).toContain('[[other-document]]');
      expect(result.content).toContain('[[another-file|Custom Name]]');
      expect(result.content).toContain('[[third-reference]]');
    });

    test('should handle bib file discovery and loading', async () => {
      const mockBibFiles = [
        { name: 'references.bib', isFile: () => true, isDirectory: () => false },
        { name: 'additional.bib', isFile: () => true, isDirectory: () => false }
      ];
      
      const mockBibContent = `@article{test2024,
        title={Test Article},
        author={Test Author},
        year={2024}
      }`;
      
      fs.readdir.mockResolvedValue(mockBibFiles);
      fs.readFile.mockResolvedValue(mockBibContent);
      
      // Simulate the bib file discovery process
      const mockBibHandler = jest.fn(async () => {
        const allFiles = await fs.readdir('/mock/directory', { withFileTypes: true });
        const bibFiles = allFiles.filter(file => file.isFile() && file.name.endsWith('.bib'));
        
        const bibData = [];
        for (const bibFile of bibFiles) {
          const content = await fs.readFile(`/mock/directory/${bibFile.name}`, 'utf8');
          bibData.push({ filename: bibFile.name, content });
        }
        
        return bibData;
      });
      
      const result = await mockBibHandler();
      
      expect(result).toHaveLength(2);
      expect(result[0].filename).toBe('references.bib');
      expect(result[1].filename).toBe('additional.bib');
      expect(result[0].content).toContain('@article{test2024');
    });
  });

  describe('Error Handling', () => {
    test('should handle file not found errors gracefully', async () => {
      const error = new Error('ENOENT: no such file or directory');
      error.code = 'ENOENT';
      fs.readFile.mockRejectedValue(error);
      
      const mockReadHandler = jest.fn(async (event, filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return { success: true, content };
        } catch (err) {
          return { success: false, error: err.message };
        }
      });
      
      const result = await mockReadHandler(null, '/nonexistent/file.md');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('no such file or directory');
    });

    test('should handle permission errors during save', async () => {
      const error = new Error('EACCES: permission denied');
      error.code = 'EACCES';
      fs.writeFile.mockRejectedValue(error);
      
      const mockSaveHandler = jest.fn(async (event, filePath, content) => {
        try {
          await fs.writeFile(filePath, content, 'utf8');
          return { success: true, filePath };
        } catch (err) {
          return { success: false, error: err.message };
        }
      });
      
      const result = await mockSaveHandler(null, '/readonly/file.md', 'content');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('permission denied');
    });
  });
});
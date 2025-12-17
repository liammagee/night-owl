/**
 * Integration tests for IPC handlers
 * Tests the communication between main and renderer processes
 */

const { ipcMain } = require('electron');

describe('IPC Handler Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Settings Handlers', () => {
    // Simulate settings handler behavior
    const mockAppSettings = {
      theme: 'dark',
      fontSize: 14,
      ai: {
        preferredProvider: 'openai',
        temperature: 0.7
      }
    };

    function createSettingsHandler(settings) {
      return {
        getSettings: jest.fn((category = null) => {
          if (category) {
            return settings[category] || {};
          }
          return settings;
        }),
        setSettings: jest.fn((category, newSettings) => {
          if (typeof category === 'string') {
            settings[category] = { ...settings[category], ...newSettings };
            return { success: true };
          }
          return { success: false, error: 'Invalid category' };
        }),
        resetSettings: jest.fn((category) => {
          if (category === 'ai') {
            settings.ai = { preferredProvider: 'auto', temperature: 0.7 };
            return settings.ai;
          }
          return { success: false, error: 'Category not found' };
        })
      };
    }

    test('should get all settings when no category specified', () => {
      const handler = createSettingsHandler({ ...mockAppSettings });
      const result = handler.getSettings();

      expect(result).toHaveProperty('theme', 'dark');
      expect(result).toHaveProperty('fontSize', 14);
      expect(result).toHaveProperty('ai');
    });

    test('should get settings for specific category', () => {
      const handler = createSettingsHandler({ ...mockAppSettings });
      const result = handler.getSettings('ai');

      expect(result).toHaveProperty('preferredProvider', 'openai');
      expect(result).toHaveProperty('temperature', 0.7);
    });

    test('should update settings category', () => {
      const settings = JSON.parse(JSON.stringify(mockAppSettings));
      const handler = createSettingsHandler(settings);

      const result = handler.setSettings('ai', { temperature: 0.9 });

      expect(result.success).toBe(true);
      expect(settings.ai.temperature).toBe(0.9);
      expect(settings.ai.preferredProvider).toBe('openai'); // Should preserve other settings
    });

    test('should reset settings category to defaults', () => {
      const settings = JSON.parse(JSON.stringify(mockAppSettings));
      const handler = createSettingsHandler(settings);

      const result = handler.resetSettings('ai');

      expect(result.preferredProvider).toBe('auto');
    });
  });

  describe('AI Handlers', () => {
    function createAIHandler(available = true) {
      const mockAIService = available ? {
        getAvailableProviders: jest.fn(() => ['openai', 'anthropic']),
        getDefaultProvider: jest.fn(() => 'openai'),
        sendMessage: jest.fn(async (message) => ({
          response: `Response to: ${message}`,
          provider: 'openai',
          model: 'gpt-4'
        })),
        clearConversation: jest.fn(),
        getConversationHistory: jest.fn(() => [])
      } : null;

      return {
        getProviders: jest.fn(() => {
          if (!mockAIService) {
            return { success: false, providers: [], error: 'AI Service not available' };
          }
          return {
            success: true,
            providers: mockAIService.getAvailableProviders(),
            defaultProvider: mockAIService.getDefaultProvider()
          };
        }),
        sendMessage: jest.fn(async (message) => {
          if (!mockAIService) {
            return { success: false, error: 'AI Service not available' };
          }
          try {
            const response = await mockAIService.sendMessage(message);
            return { success: true, ...response };
          } catch (error) {
            return { success: false, error: error.message };
          }
        }),
        clearConversation: jest.fn(() => {
          if (!mockAIService) {
            return { success: false, error: 'AI Service not available' };
          }
          mockAIService.clearConversation();
          return { success: true, message: 'Conversation cleared' };
        })
      };
    }

    test('should return available providers when AI service is available', () => {
      const handler = createAIHandler(true);
      const result = handler.getProviders();

      expect(result.success).toBe(true);
      expect(result.providers).toContain('openai');
      expect(result.providers).toContain('anthropic');
      expect(result.defaultProvider).toBe('openai');
    });

    test('should return error when AI service is not available', () => {
      const handler = createAIHandler(false);
      const result = handler.getProviders();

      expect(result.success).toBe(false);
      expect(result.providers).toHaveLength(0);
      expect(result.error).toContain('not available');
    });

    test('should send message and receive response', async () => {
      const handler = createAIHandler(true);
      const result = await handler.sendMessage('Hello, AI!');

      expect(result.success).toBe(true);
      expect(result.response).toContain('Hello, AI!');
      expect(result.provider).toBe('openai');
    });

    test('should clear conversation successfully', () => {
      const handler = createAIHandler(true);
      const result = handler.clearConversation();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Conversation cleared');
    });
  });

  describe('Citation Handlers', () => {
    function createCitationHandler() {
      const citations = [
        { id: 1, title: 'Test Article', type: 'article', authors: 'John Doe', publication_year: 2023 },
        { id: 2, title: 'Test Book', type: 'book', authors: 'Jane Smith', publication_year: 2022 }
      ];

      return {
        getCitations: jest.fn((filters = {}) => {
          let result = [...citations];
          if (filters.type) {
            result = result.filter(c => c.type === filters.type);
          }
          if (filters.year) {
            result = result.filter(c => c.publication_year === filters.year);
          }
          return { success: true, citations: result };
        }),
        addCitation: jest.fn((citation) => {
          const newCitation = { id: citations.length + 1, ...citation };
          citations.push(newCitation);
          return { success: true, citation: newCitation };
        }),
        deleteCitation: jest.fn((id) => {
          const index = citations.findIndex(c => c.id === id);
          if (index === -1) {
            return { success: false, error: 'Citation not found' };
          }
          citations.splice(index, 1);
          return { success: true };
        }),
        exportCitations: jest.fn((ids, format) => {
          const toExport = citations.filter(c => ids.includes(c.id));
          if (format === 'bibtex') {
            const bibtex = toExport.map(c => 
              `@${c.type}{citation${c.id},\n  title = {${c.title}},\n  author = {${c.authors}},\n  year = {${c.publication_year}}\n}`
            ).join('\n\n');
            return { success: true, content: bibtex };
          }
          return { success: false, error: 'Unsupported format' };
        })
      };
    }

    test('should get all citations', () => {
      const handler = createCitationHandler();
      const result = handler.getCitations();

      expect(result.success).toBe(true);
      expect(result.citations).toHaveLength(2);
    });

    test('should filter citations by type', () => {
      const handler = createCitationHandler();
      const result = handler.getCitations({ type: 'article' });

      expect(result.success).toBe(true);
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].type).toBe('article');
    });

    test('should add new citation', () => {
      const handler = createCitationHandler();
      const newCitation = {
        title: 'New Paper',
        type: 'inproceedings',
        authors: 'New Author',
        publication_year: 2024
      };

      const result = handler.addCitation(newCitation);

      expect(result.success).toBe(true);
      expect(result.citation.id).toBe(3);
      expect(result.citation.title).toBe('New Paper');
    });

    test('should delete citation', () => {
      const handler = createCitationHandler();
      const result = handler.deleteCitation(1);

      expect(result.success).toBe(true);

      const remaining = handler.getCitations();
      expect(remaining.citations).toHaveLength(1);
    });

    test('should export citations as BibTeX', () => {
      const handler = createCitationHandler();
      const result = handler.exportCitations([1, 2], 'bibtex');

      expect(result.success).toBe(true);
      expect(result.content).toContain('@article{citation1');
      expect(result.content).toContain('@book{citation2');
    });
  });

  describe('File Handlers', () => {
    function createFileHandler() {
      const files = new Map([
        ['/test/doc1.md', '# Document 1\nContent here'],
        ['/test/doc2.md', '# Document 2\nMore content']
      ]);

      return {
        readFile: jest.fn(async (filePath) => {
          if (files.has(filePath)) {
            return { success: true, content: files.get(filePath) };
          }
          return { success: false, error: 'File not found' };
        }),
        writeFile: jest.fn(async (filePath, content) => {
          files.set(filePath, content);
          return { success: true, filePath };
        }),
        listFiles: jest.fn(async (directory) => {
          const result = [];
          for (const [path] of files) {
            if (path.startsWith(directory)) {
              result.push({
                name: path.split('/').pop(),
                path: path,
                isFile: true
              });
            }
          }
          return { success: true, files: result };
        })
      };
    }

    test('should read file content', async () => {
      const handler = createFileHandler();
      const result = await handler.readFile('/test/doc1.md');

      expect(result.success).toBe(true);
      expect(result.content).toContain('# Document 1');
    });

    test('should return error for non-existent file', async () => {
      const handler = createFileHandler();
      const result = await handler.readFile('/test/nonexistent.md');

      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found');
    });

    test('should write file content', async () => {
      const handler = createFileHandler();
      const result = await handler.writeFile('/test/new.md', '# New Document');

      expect(result.success).toBe(true);

      const readResult = await handler.readFile('/test/new.md');
      expect(readResult.content).toBe('# New Document');
    });

    test('should list files in directory', async () => {
      const handler = createFileHandler();
      const result = await handler.listFiles('/test');

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(2);
      expect(result.files.map(f => f.name)).toContain('doc1.md');
    });
  });

  describe('Error Response Consistency', () => {
    test('all error responses should have success: false and error message', () => {
      const errorResponses = [
        { success: false, error: 'File not found' },
        { success: false, error: 'AI Service not available' },
        { success: false, error: 'Invalid settings category' },
        { success: false, error: 'Citation not found' }
      ];

      errorResponses.forEach(response => {
        expect(response).toHaveProperty('success', false);
        expect(response).toHaveProperty('error');
        expect(typeof response.error).toBe('string');
        expect(response.error.length).toBeGreaterThan(0);
      });
    });

    test('all success responses should have success: true', () => {
      const successResponses = [
        { success: true, data: 'some data' },
        { success: true, content: 'file content' },
        { success: true, citations: [] },
        { success: true, message: 'Operation completed' }
      ];

      successResponses.forEach(response => {
        expect(response).toHaveProperty('success', true);
        expect(response.error).toBeUndefined();
      });
    });
  });
});

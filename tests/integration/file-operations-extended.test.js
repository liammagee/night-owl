// Extended integration tests for file operations and export functionality

const fs = require('fs');
const path = require('path');
const os = require('os');

describe('File Operations and Export Integration', () => {
  let testDir, mockElectronAPI, mockSettings;

  beforeAll(async () => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hegel-test-'));
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Mock Electron API
    mockElectronAPI = {
      invoke: jest.fn(),
      send: jest.fn(),
      onFileOpened: jest.fn(),
      onFileSaved: jest.fn()
    };

    // Mock settings
    mockSettings = {
      workingDirectory: testDir,
      currentFile: null,
      defaultFileType: '.md',
      autoSave: {
        enabled: true,
        interval: 2000,
        createBackups: true,
        maxBackups: 5
      },
      export: {
        defaultFormat: 'pdf',
        includeReferences: true,
        pandoc: {
          pdfEngine: 'pdflatex',
          citationStyle: 'chicago-author-date'
        }
      }
    };

    global.window = {
      electronAPI: mockElectronAPI,
      settings: mockSettings,
      currentFilePath: null,
      hasUnsavedChanges: false,
      editor: {
        getValue: jest.fn(() => '# Test Content\n\nThis is test content.'),
        setValue: jest.fn(),
        onDidChangeModelContent: jest.fn()
      }
    };

    // Create test files
    fs.writeFileSync(path.join(testDir, 'test1.md'), '# Test File 1\n\nContent of test file 1.');
    fs.writeFileSync(path.join(testDir, 'test2.md'), '# Test File 2\n\nContent with [[internal-link]].');
    fs.writeFileSync(path.join(testDir, 'references.bib'), '@article{test2024,\n  title={Test Article},\n  author={Test Author}\n}');
    
    // Create subdirectory
    const subDir = path.join(testDir, 'subdirectory');
    if (!fs.existsSync(subDir)) {
      fs.mkdirSync(subDir);
    }
    fs.writeFileSync(path.join(subDir, 'nested.md'), '# Nested File\n\nThis is in a subdirectory.');

    // Reset all mocks
    jest.clearAllMocks();
  });

  // Mock file operation classes
  class FileManager {
    constructor(electronAPI, settings) {
      this.electronAPI = electronAPI;
      this.settings = settings;
      this.currentFile = null;
      this.autoSaveTimer = null;
    }

    async readFile(filePath) {
      try {
        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }
        
        const content = fs.readFileSync(filePath, 'utf8');
        const stats = fs.statSync(filePath);
        
        return {
          content,
          filePath,
          size: stats.size,
          modified: stats.mtime,
          encoding: 'utf8'
        };
      } catch (error) {
        throw new Error(`Failed to read file: ${error.message}`);
      }
    }

    async writeFile(filePath, content, options = {}) {
      try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Create backup if enabled
        if (this.settings.autoSave?.createBackups && fs.existsSync(filePath)) {
          await this.createBackup(filePath);
        }

        fs.writeFileSync(filePath, content, options.encoding || 'utf8');
        
        const stats = fs.statSync(filePath);
        
        return {
          filePath,
          size: stats.size,
          modified: stats.mtime,
          success: true
        };
      } catch (error) {
        throw new Error(`Failed to write file: ${error.message}`);
      }
    }

    async createBackup(filePath) {
      const backupDir = path.join(path.dirname(filePath), '.backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
      }

      const fileName = path.basename(filePath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `${fileName}.${timestamp}.bak`);
      
      fs.copyFileSync(filePath, backupPath);
      
      // Clean old backups
      await this.cleanOldBackups(backupDir, fileName);
      
      return backupPath;
    }

    async cleanOldBackups(backupDir, fileName) {
      const maxBackups = this.settings.autoSave?.maxBackups || 5;
      
      try {
        const files = fs.readdirSync(backupDir)
          .filter(file => file.startsWith(fileName))
          .map(file => ({
            name: file,
            path: path.join(backupDir, file),
            stats: fs.statSync(path.join(backupDir, file))
          }))
          .sort((a, b) => b.stats.mtime - a.stats.mtime);

        if (files.length > maxBackups) {
          const filesToDelete = files.slice(maxBackups);
          for (const file of filesToDelete) {
            fs.unlinkSync(file.path);
          }
        }
      } catch (error) {
        console.warn('Failed to clean old backups:', error.message);
      }
    }

    async openFile(filePath) {
      const fileData = await this.readFile(filePath);
      this.currentFile = filePath;
      
      if (window.editor) {
        window.editor.setValue(fileData.content);
      }
      
      window.currentFilePath = filePath;
      window.hasUnsavedChanges = false;
      
      return fileData;
    }

    async saveFile(filePath, content) {
      const result = await this.writeFile(filePath, content);
      
      this.currentFile = filePath;
      window.currentFilePath = filePath;
      window.hasUnsavedChanges = false;
      
      return result;
    }

    async saveCurrentFile() {
      if (!this.currentFile) {
        throw new Error('No file is currently open');
      }
      
      const content = window.editor ? window.editor.getValue() : '';
      return this.saveFile(this.currentFile, content);
    }

    async listFiles(directory = null) {
      const targetDir = directory || this.settings.workingDirectory;
      
      try {
        const items = fs.readdirSync(targetDir, { withFileTypes: true });
        
        return items.map(item => ({
          name: item.name,
          path: path.join(targetDir, item.name),
          isDirectory: item.isDirectory(),
          isFile: item.isFile(),
          extension: item.isFile() ? path.extname(item.name) : null,
          size: item.isFile() ? fs.statSync(path.join(targetDir, item.name)).size : null,
          modified: fs.statSync(path.join(targetDir, item.name)).mtime
        }));
      } catch (error) {
        throw new Error(`Failed to list files: ${error.message}`);
      }
    }

    async createFolder(folderPath) {
      try {
        fs.mkdirSync(folderPath, { recursive: true });
        return {
          path: folderPath,
          created: true
        };
      } catch (error) {
        throw new Error(`Failed to create folder: ${error.message}`);
      }
    }

    async deleteFile(filePath) {
      try {
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
          fs.rmSync(filePath, { recursive: true });
        } else {
          fs.unlinkSync(filePath);
        }
        
        return { deleted: true, path: filePath };
      } catch (error) {
        throw new Error(`Failed to delete file: ${error.message}`);
      }
    }

    async moveFile(sourcePath, targetPath) {
      try {
        fs.renameSync(sourcePath, targetPath);
        
        if (this.currentFile === sourcePath) {
          this.currentFile = targetPath;
          window.currentFilePath = targetPath;
        }
        
        return {
          success: true,
          oldPath: sourcePath,
          newPath: targetPath
        };
      } catch (error) {
        throw new Error(`Failed to move file: ${error.message}`);
      }
    }

    startAutoSave() {
      if (!this.settings.autoSave?.enabled) return;
      
      this.stopAutoSave();
      
      this.autoSaveTimer = setInterval(async () => {
        if (window.hasUnsavedChanges && this.currentFile) {
          try {
            await this.saveCurrentFile();
          } catch (error) {
            console.warn('Auto-save failed:', error.message);
          }
        }
      }, this.settings.autoSave.interval);
    }

    stopAutoSave() {
      if (this.autoSaveTimer) {
        clearInterval(this.autoSaveTimer);
        this.autoSaveTimer = null;
      }
    }
  }

  class ExportManager {
    constructor(electronAPI, settings) {
      this.electronAPI = electronAPI;
      this.settings = settings;
    }

    async exportToPDF(content, options = {}) {
      const exportOptions = {
        ...this.settings.export.pandoc,
        ...options,
        format: 'pdf'
      };

      try {
        // Mock PDF export process
        const result = await this.electronAPI.invoke('export-document', {
          content,
          format: 'pdf',
          options: exportOptions
        });

        return {
          success: true,
          outputPath: result.outputPath,
          format: 'pdf',
          size: result.size || 0
        };
      } catch (error) {
        throw new Error(`PDF export failed: ${error.message}`);
      }
    }

    async exportToHTML(content, options = {}) {
      const exportOptions = {
        ...this.settings.export.html,
        ...options,
        format: 'html'
      };

      try {
        const result = await this.electronAPI.invoke('export-document', {
          content,
          format: 'html',
          options: exportOptions
        });

        return {
          success: true,
          outputPath: result.outputPath,
          format: 'html',
          content: result.content
        };
      } catch (error) {
        throw new Error(`HTML export failed: ${error.message}`);
      }
    }

    async exportToDocx(content, options = {}) {
      try {
        const result = await this.electronAPI.invoke('export-document', {
          content,
          format: 'docx',
          options
        });

        return {
          success: true,
          outputPath: result.outputPath,
          format: 'docx'
        };
      } catch (error) {
        throw new Error(`DOCX export failed: ${error.message}`);
      }
    }

    async exportPresentation(content, options = {}) {
      const exportOptions = {
        layout: 'spiral',
        theme: 'minimal',
        ...options
      };

      try {
        const result = await this.electronAPI.invoke('export-presentation', {
          content,
          options: exportOptions
        });

        return {
          success: true,
          outputPath: result.outputPath,
          format: 'presentation',
          slides: result.slideCount
        };
      } catch (error) {
        throw new Error(`Presentation export failed: ${error.message}`);
      }
    }

    async processReferences(content, bibFilePath = null) {
      try {
        const bibliography = bibFilePath ? 
          await this.loadBibliography(bibFilePath) : 
          await this.findLocalBibliography();

        const result = await this.electronAPI.invoke('process-references', {
          content,
          bibliography,
          citationStyle: this.settings.export.pandoc.citationStyle
        });

        return {
          processedContent: result.content,
          references: result.references,
          citationCount: result.citationCount
        };
      } catch (error) {
        throw new Error(`Reference processing failed: ${error.message}`);
      }
    }

    async loadBibliography(bibFilePath) {
      try {
        return fs.readFileSync(bibFilePath, 'utf8');
      } catch (error) {
        throw new Error(`Failed to load bibliography: ${error.message}`);
      }
    }

    async findLocalBibliography() {
      const workingDir = this.settings.workingDirectory;
      const bibFiles = ['references.bib', 'bibliography.bib', 'refs.bib'];
      
      for (const bibFile of bibFiles) {
        const bibPath = path.join(workingDir, bibFile);
        if (fs.existsSync(bibPath)) {
          return this.loadBibliography(bibPath);
        }
      }
      
      return null;
    }
  }

  describe('File Reading and Writing', () => {
    let fileManager;

    beforeEach(() => {
      fileManager = new FileManager(mockElectronAPI, mockSettings);
    });

    test('should read existing file correctly', async () => {
      const filePath = path.join(testDir, 'test1.md');
      const result = await fileManager.readFile(filePath);

      expect(result.content).toBe('# Test File 1\n\nContent of test file 1.');
      expect(result.filePath).toBe(filePath);
      expect(result.size).toBeGreaterThan(0);
      expect(result.modified).toBeInstanceOf(Date);
    });

    test('should handle non-existent file', async () => {
      const filePath = path.join(testDir, 'nonexistent.md');
      
      await expect(fileManager.readFile(filePath)).rejects.toThrow('File not found');
    });

    test('should write file correctly', async () => {
      const filePath = path.join(testDir, 'new-file.md');
      const content = '# New File\n\nThis is new content.';
      
      const result = await fileManager.writeFile(filePath, content);
      
      expect(result.success).toBe(true);
      expect(result.filePath).toBe(filePath);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
    });

    test('should create directory structure when writing file', async () => {
      const filePath = path.join(testDir, 'new-folder', 'nested.md');
      const content = '# Nested File\n\nContent in new directory.';
      
      await fileManager.writeFile(filePath, content);
      
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.existsSync(path.dirname(filePath))).toBe(true);
    });

    test('should create backups when enabled', async () => {
      const filePath = path.join(testDir, 'test1.md');
      const newContent = '# Updated Content\n\nThis is updated.';
      
      await fileManager.writeFile(filePath, newContent);
      
      const backupDir = path.join(path.dirname(filePath), '.backups');
      expect(fs.existsSync(backupDir)).toBe(true);
      
      const backupFiles = fs.readdirSync(backupDir);
      expect(backupFiles.length).toBeGreaterThan(0);
      expect(backupFiles[0]).toContain('test1.md');
    });

    test('should limit number of backups', async () => {
      const filePath = path.join(testDir, 'backup-test.md');
      fs.writeFileSync(filePath, 'initial content');
      
      // Create multiple backups
      for (let i = 0; i < 8; i++) {
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay for different timestamps
        await fileManager.writeFile(filePath, `content ${i}`);
      }
      
      const backupDir = path.join(path.dirname(filePath), '.backups');
      const backupFiles = fs.readdirSync(backupDir);
      expect(backupFiles.length).toBeLessThanOrEqual(mockSettings.autoSave.maxBackups);
    });
  });

  describe('File Management Operations', () => {
    let fileManager;

    beforeEach(() => {
      fileManager = new FileManager(mockElectronAPI, mockSettings);
    });

    test('should list files in directory', async () => {
      const files = await fileManager.listFiles();
      
      expect(files.length).toBeGreaterThan(0);
      expect(files.some(f => f.name === 'test1.md')).toBe(true);
      expect(files.some(f => f.name === 'test2.md')).toBe(true);
      expect(files.some(f => f.name === 'references.bib')).toBe(true);
      expect(files.some(f => f.name === 'subdirectory' && f.isDirectory)).toBe(true);
    });

    test('should provide file metadata', async () => {
      const files = await fileManager.listFiles();
      const mdFile = files.find(f => f.name === 'test1.md');
      
      expect(mdFile.isFile).toBe(true);
      expect(mdFile.isDirectory).toBe(false);
      expect(mdFile.extension).toBe('.md');
      expect(mdFile.size).toBeGreaterThan(0);
      expect(mdFile.modified).toBeInstanceOf(Date);
    });

    test('should create new folder', async () => {
      const folderPath = path.join(testDir, 'new-folder');
      const result = await fileManager.createFolder(folderPath);
      
      expect(result.created).toBe(true);
      expect(fs.existsSync(folderPath)).toBe(true);
      expect(fs.statSync(folderPath).isDirectory()).toBe(true);
    });

    test('should create nested folder structure', async () => {
      const folderPath = path.join(testDir, 'deep', 'nested', 'folder');
      await fileManager.createFolder(folderPath);
      
      expect(fs.existsSync(folderPath)).toBe(true);
    });

    test('should delete file', async () => {
      const filePath = path.join(testDir, 'to-delete.md');
      fs.writeFileSync(filePath, 'content to delete');
      
      const result = await fileManager.deleteFile(filePath);
      
      expect(result.deleted).toBe(true);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    test('should delete directory recursively', async () => {
      const dirPath = path.join(testDir, 'to-delete-dir');
      fs.mkdirSync(dirPath);
      fs.writeFileSync(path.join(dirPath, 'file.md'), 'content');
      
      await fileManager.deleteFile(dirPath);
      
      expect(fs.existsSync(dirPath)).toBe(false);
    });

    test('should move/rename file', async () => {
      const sourcePath = path.join(testDir, 'source.md');
      const targetPath = path.join(testDir, 'target.md');
      fs.writeFileSync(sourcePath, 'content to move');
      
      const result = await fileManager.moveFile(sourcePath, targetPath);
      
      expect(result.success).toBe(true);
      expect(fs.existsSync(sourcePath)).toBe(false);
      expect(fs.existsSync(targetPath)).toBe(true);
    });

    test('should update current file path when moving open file', async () => {
      const sourcePath = path.join(testDir, 'current.md');
      const targetPath = path.join(testDir, 'moved-current.md');
      fs.writeFileSync(sourcePath, 'current file content');
      
      fileManager.currentFile = sourcePath;
      window.currentFilePath = sourcePath;
      
      await fileManager.moveFile(sourcePath, targetPath);
      
      expect(fileManager.currentFile).toBe(targetPath);
      expect(window.currentFilePath).toBe(targetPath);
    });
  });

  describe('File Opening and Saving', () => {
    let fileManager;

    beforeEach(() => {
      fileManager = new FileManager(mockElectronAPI, mockSettings);
    });

    test('should open file and set editor content', async () => {
      const filePath = path.join(testDir, 'test1.md');
      const result = await fileManager.openFile(filePath);
      
      expect(result.content).toBe('# Test File 1\n\nContent of test file 1.');
      expect(window.editor.setValue).toHaveBeenCalledWith(result.content);
      expect(window.currentFilePath).toBe(filePath);
      expect(window.hasUnsavedChanges).toBe(false);
    });

    test('should save current file content', async () => {
      const filePath = path.join(testDir, 'current.md');
      fileManager.currentFile = filePath;
      window.editor.getValue.mockReturnValue('# Updated Content\n\nThis was updated.');
      
      const result = await fileManager.saveCurrentFile();
      
      expect(result.success).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('# Updated Content\n\nThis was updated.');
      expect(window.hasUnsavedChanges).toBe(false);
    });

    test('should handle save without open file', async () => {
      fileManager.currentFile = null;
      
      await expect(fileManager.saveCurrentFile()).rejects.toThrow('No file is currently open');
    });

    test('should save file to new location', async () => {
      const filePath = path.join(testDir, 'new-save.md');
      const content = '# New Save\n\nSaving to new location.';
      
      const result = await fileManager.saveFile(filePath, content);
      
      expect(result.success).toBe(true);
      expect(fileManager.currentFile).toBe(filePath);
      expect(window.currentFilePath).toBe(filePath);
    });
  });

  describe('Auto-Save Functionality', () => {
    let fileManager;

    beforeEach(() => {
      fileManager = new FileManager(mockElectronAPI, { 
        ...mockSettings, 
        autoSave: { enabled: true, interval: 100 } 
      });
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should start auto-save timer', () => {
      fileManager.startAutoSave();
      
      expect(fileManager.autoSaveTimer).toBeTruthy();
    });

    test('should stop auto-save timer', () => {
      fileManager.startAutoSave();
      fileManager.stopAutoSave();
      
      expect(fileManager.autoSaveTimer).toBeNull();
    });

    test('should auto-save when changes exist', async () => {
      const filePath = path.join(testDir, 'auto-save-test.md');
      fileManager.currentFile = filePath;
      window.hasUnsavedChanges = true;
      
      const saveCurrentFileSpy = jest.spyOn(fileManager, 'saveCurrentFile').mockResolvedValue({ success: true });
      
      fileManager.startAutoSave();
      jest.advanceTimersByTime(100);
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(saveCurrentFileSpy).toHaveBeenCalled();
    });

    test('should not auto-save when no changes', async () => {
      const filePath = path.join(testDir, 'no-changes.md');
      fileManager.currentFile = filePath;
      window.hasUnsavedChanges = false;
      
      const saveCurrentFileSpy = jest.spyOn(fileManager, 'saveCurrentFile');
      
      fileManager.startAutoSave();
      jest.advanceTimersByTime(100);
      
      expect(saveCurrentFileSpy).not.toHaveBeenCalled();
    });
  });

  describe('Export Functionality', () => {
    let exportManager;

    beforeEach(() => {
      exportManager = new ExportManager(mockElectronAPI, mockSettings);
    });

    test('should export to PDF', async () => {
      const content = '# Test Document\n\nThis is test content for PDF export.';
      const mockResult = {
        outputPath: '/tmp/output.pdf',
        size: 1024
      };
      
      mockElectronAPI.invoke.mockResolvedValue(mockResult);
      
      const result = await exportManager.exportToPDF(content);
      
      expect(mockElectronAPI.invoke).toHaveBeenCalledWith('export-document', {
        content,
        format: 'pdf',
        options: expect.objectContaining({
          pdfEngine: 'pdflatex',
          citationStyle: 'chicago-author-date'
        })
      });
      
      expect(result.success).toBe(true);
      expect(result.format).toBe('pdf');
      expect(result.outputPath).toBe('/tmp/output.pdf');
    });

    test('should export to HTML', async () => {
      const content = '# Test Document\n\n**Bold text** and *italic*.';
      const mockResult = {
        outputPath: '/tmp/output.html',
        content: '<h1>Test Document</h1><p><strong>Bold text</strong> and <em>italic</em>.</p>'
      };
      
      mockElectronAPI.invoke.mockResolvedValue(mockResult);
      
      const result = await exportManager.exportToHTML(content);
      
      expect(result.success).toBe(true);
      expect(result.format).toBe('html');
      expect(result.content).toContain('<h1>Test Document</h1>');
    });

    test('should export to DOCX', async () => {
      const content = '# Test Document\n\nContent for Word export.';
      const mockResult = {
        outputPath: '/tmp/output.docx'
      };
      
      mockElectronAPI.invoke.mockResolvedValue(mockResult);
      
      const result = await exportManager.exportToDocx(content);
      
      expect(result.success).toBe(true);
      expect(result.format).toBe('docx');
    });

    test('should export presentation', async () => {
      const content = `# Slide 1

First slide content.

---

# Slide 2

Second slide content.`;

      const mockResult = {
        outputPath: '/tmp/presentation.html',
        slideCount: 2
      };
      
      mockElectronAPI.invoke.mockResolvedValue(mockResult);
      
      const result = await exportManager.exportPresentation(content);
      
      expect(result.success).toBe(true);
      expect(result.format).toBe('presentation');
      expect(result.slides).toBe(2);
    });

    test('should handle export errors gracefully', async () => {
      mockElectronAPI.invoke.mockRejectedValue(new Error('Export service unavailable'));
      
      await expect(exportManager.exportToPDF('content')).rejects.toThrow('PDF export failed: Export service unavailable');
    });
  });

  describe('Reference Processing', () => {
    let exportManager;

    beforeEach(() => {
      exportManager = new ExportManager(mockElectronAPI, mockSettings);
    });

    test('should load bibliography file', async () => {
      const bibPath = path.join(testDir, 'references.bib');
      const bibliography = await exportManager.loadBibliography(bibPath);
      
      expect(bibliography).toContain('@article{test2024');
      expect(bibliography).toContain('Test Article');
    });

    test('should find local bibliography automatically', async () => {
      const bibliography = await exportManager.findLocalBibliography();
      
      expect(bibliography).toBeTruthy();
      expect(bibliography).toContain('@article{test2024');
    });

    test('should process references with bibliography', async () => {
      const content = 'This cites [@test2024] in the text.';
      const mockResult = {
        content: 'This cites (Test Author 2024) in the text.',
        references: ['test2024'],
        citationCount: 1
      };
      
      mockElectronAPI.invoke.mockResolvedValue(mockResult);
      
      const result = await exportManager.processReferences(content);
      
      expect(mockElectronAPI.invoke).toHaveBeenCalledWith('process-references', {
        content,
        bibliography: expect.stringContaining('@article{test2024'),
        citationStyle: 'chicago-author-date'
      });
      
      expect(result.citationCount).toBe(1);
      expect(result.references).toContain('test2024');
    });

    test('should handle missing bibliography gracefully', async () => {
      // Remove bibliography file
      const bibPath = path.join(testDir, 'references.bib');
      fs.unlinkSync(bibPath);
      
      const bibliography = await exportManager.findLocalBibliography();
      expect(bibliography).toBeNull();
    });
  });

  describe('Error Handling', () => {
    let fileManager, exportManager;

    beforeEach(() => {
      fileManager = new FileManager(mockElectronAPI, mockSettings);
      exportManager = new ExportManager(mockElectronAPI, mockSettings);
    });

    test('should handle permission errors', async () => {
      // Mock permission error
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        const error = new Error('EACCES: permission denied');
        error.code = 'EACCES';
        throw error;
      });
      
      await expect(fileManager.writeFile('/root/test.md', 'content'))
        .rejects.toThrow('Failed to write file: EACCES: permission denied');
      
      fs.writeFileSync.mockRestore();
    });

    test('should handle disk full errors', async () => {
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        const error = new Error('ENOSPC: no space left on device');
        error.code = 'ENOSPC';
        throw error;
      });
      
      await expect(fileManager.writeFile(path.join(testDir, 'test.md'), 'content'))
        .rejects.toThrow('no space left on device');
      
      fs.writeFileSync.mockRestore();
    });

    test('should handle network/service unavailable errors in export', async () => {
      mockElectronAPI.invoke.mockRejectedValue(new Error('Service timeout'));
      
      await expect(exportManager.exportToPDF('content'))
        .rejects.toThrow('PDF export failed: Service timeout');
    });

    test('should handle corrupted file errors', async () => {
      // Create a file with invalid content
      const invalidPath = path.join(testDir, 'invalid.md');
      
      jest.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
        if (filePath === invalidPath) {
          throw new Error('File is corrupted');
        }
        return fs.readFileSync(filePath, 'utf8');
      });
      
      await expect(fileManager.readFile(invalidPath))
        .rejects.toThrow('Failed to read file: File is corrupted');
      
      fs.readFileSync.mockRestore();
    });
  });

  describe('Integration Workflows', () => {
    let fileManager, exportManager;

    beforeEach(() => {
      fileManager = new FileManager(mockElectronAPI, mockSettings);
      exportManager = new ExportManager(mockElectronAPI, mockSettings);
    });

    test('should handle complete file editing workflow', async () => {
      // Open file
      const filePath = path.join(testDir, 'workflow-test.md');
      fs.writeFileSync(filePath, '# Original Content');
      
      await fileManager.openFile(filePath);
      
      // Edit content
      window.editor.getValue.mockReturnValue('# Updated Content\n\nWith new information.');
      window.hasUnsavedChanges = true;
      
      // Save file
      await fileManager.saveCurrentFile();
      
      // Verify changes
      const savedContent = fs.readFileSync(filePath, 'utf8');
      expect(savedContent).toBe('# Updated Content\n\nWith new information.');
    });

    test('should handle export with references workflow', async () => {
      const content = `# Research Paper

This paper discusses important findings [@test2024].

## References`;

      // Mock export with references
      mockElectronAPI.invoke.mockImplementation((action, data) => {
        if (action === 'process-references') {
          return Promise.resolve({
            content: data.content.replace('[@test2024]', '(Test Author 2024)'),
            references: ['test2024'],
            citationCount: 1
          });
        }
        if (action === 'export-document') {
          return Promise.resolve({
            outputPath: '/tmp/paper.pdf',
            size: 2048
          });
        }
        return Promise.resolve({});
      });

      // Process references
      const processed = await exportManager.processReferences(content);
      expect(processed.citationCount).toBe(1);

      // Export to PDF
      const exported = await exportManager.exportToPDF(processed.processedContent);
      expect(exported.success).toBe(true);
    });

    test('should handle backup and recovery workflow', async () => {
      const filePath = path.join(testDir, 'backup-workflow.md');
      const originalContent = '# Original Content\n\nThis is the original.';
      const updatedContent = '# Updated Content\n\nThis is updated.';
      const corruptedContent = 'CORRUPTED DATA ###';
      
      // Create original file
      fs.writeFileSync(filePath, originalContent);
      
      // Update file (creates backup)
      await fileManager.writeFile(filePath, updatedContent);
      
      // Simulate corruption
      fs.writeFileSync(filePath, corruptedContent);
      
      // Find backup
      const backupDir = path.join(path.dirname(filePath), '.backups');
      const backupFiles = fs.readdirSync(backupDir);
      expect(backupFiles.length).toBeGreaterThan(0);
      
      // Restore from backup
      const backupPath = path.join(backupDir, backupFiles[0]);
      const backupContent = fs.readFileSync(backupPath, 'utf8');
      expect(backupContent).toBe(originalContent);
    });
  });
});
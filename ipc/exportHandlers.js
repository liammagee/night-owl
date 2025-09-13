// === Export IPC Handlers ===
// Handles all document export related IPC communication

const { ipcMain, dialog, app } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Import citation service for database citations
let CitationService;
try {
  CitationService = require('../services/citationService.js');
} catch (error) {
  console.warn('[ExportHandlers] Could not load CitationService:', error.message);
}

/**
 * Register all export IPC handlers
 * @param {Object} deps - Dependencies from main.js
 */
function register(deps) {
  const {
    mainWindow,
    getCurrentFilePath,
    currentWorkingDirectory
  } = deps;

  // Utility functions
  
  // Convert database citation to BibTeX format
  function citationToBibTeX(citation) {
    // Generate citation key (similar to renderer.js logic)
    const firstAuthor = citation.authors ? citation.authors.split(',')[0].trim().replace(/\s+/g, '').toLowerCase() : 'unknown';
    const year = citation.publication_year || new Date().getFullYear();
    const titleWords = citation.title ? citation.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).slice(0, 2).join('') : 'untitled';
    const key = `${firstAuthor}${year}${titleWords}`;
    
    // Convert to BibTeX format
    const type = citation.citation_type || 'article';
    let bibEntry = `@${type}{${key},\n`;
    
    if (citation.title) {
      bibEntry += `  title={${citation.title}},\n`;
    }
    if (citation.authors) {
      bibEntry += `  author={${citation.authors}},\n`;
    }
    if (citation.publication_year) {
      bibEntry += `  year={${citation.publication_year}},\n`;
    }
    if (citation.journal) {
      bibEntry += `  journal={${citation.journal}},\n`;
    }
    if (citation.volume) {
      bibEntry += `  volume={${citation.volume}},\n`;
    }
    if (citation.issue) {
      bibEntry += `  number={${citation.issue}},\n`;
    }
    if (citation.pages) {
      bibEntry += `  pages={${citation.pages}},\n`;
    }
    if (citation.publisher) {
      bibEntry += `  publisher={${citation.publisher}},\n`;
    }
    if (citation.doi) {
      bibEntry += `  doi={${citation.doi}},\n`;
    }
    if (citation.url) {
      bibEntry += `  url={${citation.url}},\n`;
    }
    
    // Remove trailing comma and close entry
    bibEntry = bibEntry.replace(/,\n$/, '\n');
    bibEntry += '}\n\n';
    
    return bibEntry;
  }
  
  // Generate temporary .bib file from database citations
  async function generateDatabaseBibFile() {
    try {
      if (!CitationService) {
        console.log('[ExportHandlers] CitationService not available, skipping database citations');
        return null;
      }
      
      // Initialize citation service
      const citationService = new CitationService();
      const userDataPath = app.getPath('userData');
      await citationService.initialize(userDataPath);
      
      // Get all citations from database
      const citations = await citationService.getCitations({});
      
      if (citations.length === 0) {
        console.log('[ExportHandlers] No database citations found');
        return null;
      }
      
      console.log(`[ExportHandlers] Converting ${citations.length} database citations to BibTeX format`);
      
      // Convert citations to BibTeX format
      let bibContent = '% Database Citations\n% Generated automatically from citation database\n\n';
      citations.forEach(citation => {
        bibContent += citationToBibTeX(citation);
      });
      
      // Write to temporary file
      const tempDir = os.tmpdir();
      const tempBibFile = path.join(tempDir, `database-citations-${Date.now()}.bib`);
      await fs.writeFile(tempBibFile, bibContent, 'utf8');
      
      console.log(`[ExportHandlers] Generated database citations file: ${tempBibFile}`);
      console.log(`[ExportHandlers] Database citations file contains ${citations.length} entries`);
      
      return tempBibFile;
    } catch (error) {
      console.error('[ExportHandlers] Error generating database citations file:', error);
      return null;
    }
  }
  
  // Clean up temporary database .bib files
  async function cleanupDatabaseBibFiles(bibFiles) {
    try {
      for (const bibFile of bibFiles) {
        if (bibFile.includes('database-citations-') && bibFile.includes(os.tmpdir())) {
          await fs.unlink(bibFile);
          console.log(`[ExportHandlers] Cleaned up temporary database citations file: ${path.basename(bibFile)}`);
        }
      }
    } catch (error) {
      console.warn('[ExportHandlers] Error cleaning up temporary files:', error.message);
    }
  }

  async function checkPandocAvailability() {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const pandoc = spawn('pandoc', ['--version']);
      
      let output = '';
      pandoc.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pandoc.on('close', (code) => {
        if (code === 0 && output.includes('pandoc')) {
          console.log('[ExportHandlers] Pandoc is available:', output.split('\n')[0]);
          resolve(true);
        } else {
          console.log('[ExportHandlers] Pandoc not found or not working');
          resolve(false);
        }
      });
      
      pandoc.on('error', () => {
        console.log('[ExportHandlers] Pandoc not available (command not found)');
        resolve(false);
      });
    });
  }

  async function findBibFiles() {
    try {
      const workingDir = currentWorkingDirectory || app.getPath('documents');
      
      console.log('\n=== BIBLIOGRAPHY DETECTION ===');
      console.log('[ExportHandlers] Looking for .bib files in:', workingDir);
      
      const items = await fs.readdir(workingDir, { withFileTypes: true });
      const bibFiles = [];
      const allFiles = [];
      
      for (const item of items) {
        if (item.isFile()) {
          allFiles.push(item.name);
          if (item.name.endsWith('.bib')) {
            const fullPath = path.join(workingDir, item.name);
            bibFiles.push(fullPath);
            
            // Check file size and contents preview
            try {
              const stats = await fs.stat(fullPath);
              const content = await fs.readFile(fullPath, 'utf8');
              const entryCount = (content.match(/@\w+\{/g) || []).length;
              console.log(`[ExportHandlers] Found .bib file: ${item.name}`);
              console.log(`  - Size: ${stats.size} bytes`);
              console.log(`  - Entries: ${entryCount}`);
              console.log(`  - Path: ${fullPath}`);
              if (content.length > 0) {
                const preview = content.substring(0, 200).replace(/\n/g, ' ');
                console.log(`  - Preview: ${preview}...`);
              }
            } catch (readError) {
              console.warn(`[ExportHandlers] Could not read .bib file ${fullPath}:`, readError.message);
            }
          }
        }
      }
      
      console.log(`[ExportHandlers] Directory contains ${allFiles.length} files total:`);
      console.log('[ExportHandlers] All files:', allFiles.slice(0, 10).join(', '), allFiles.length > 10 ? '...' : '');
      // Generate database citations .bib file
      const databaseBibFile = await generateDatabaseBibFile();
      if (databaseBibFile) {
        bibFiles.push(databaseBibFile);
        console.log('[ExportHandlers] Added database citations file to bibliography list');
      }
      
      console.log(`[ExportHandlers] Bibliography files found: ${bibFiles.length}`);
      bibFiles.forEach((file, index) => {
        const isDatabase = file.includes('database-citations-');
        console.log(`  [${index + 1}]: ${path.basename(file)} ${isDatabase ? '(from database)' : '(static file)'}`);
      });
      console.log('=== END BIBLIOGRAPHY DETECTION ===\n');
      
      return bibFiles;
    } catch (error) {
      console.warn('[ExportHandlers] Error looking for .bib files:', error.message);
      return [];
    }
  }

  async function getDefaultCSLStyle() {
    // Check if we can use a built-in style or need to download one
    // For now, let's try without a custom CSL style to use pandoc defaults
    console.log('[ExportHandlers] Using pandoc default citation style (no custom CSL)');
    return null; // Return null to skip CSL specification
  }

  async function runPandoc(args) {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      
      // Log the full pandoc command
      console.log('[ExportHandlers] Full pandoc command:');
      console.log(`pandoc ${args.map(arg => arg.includes(' ') ? `"${arg}"` : arg).join(' ')}`);
      
      const pandoc = spawn('pandoc', args);
      let output = '';
      let errorOutput = '';
      
      pandoc.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pandoc.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pandoc.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          const error = new Error(`Pandoc failed with exit code ${code}`);
          error.stderr = errorOutput;
          error.stdout = output;
          reject(error);
        }
      });
      
      pandoc.on('error', (error) => {
        reject(new Error(`Failed to start pandoc: ${error.message}`));
      });
    });
  }

  // Export handlers
  ipcMain.handle('perform-export-html', async (event, content, htmlContent, exportOptions) => {
    console.log('[ExportHandlers] *** REGULAR HTML EXPORT HANDLER CALLED ***');
    console.log('[ExportHandlers] Received perform-export-html with options:', exportOptions);
    try {
      const currentFilePath = getCurrentFilePath();
      const defaultPath = currentFilePath ? 
        currentFilePath.replace(/\.[^/.]+$/, '.html') : 
        'export.html';
      
      
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export as HTML',
        defaultPath: defaultPath,
        filters: [
          { name: 'HTML Files', extensions: ['html'] }
        ]
      });

      if (result.canceled) {
        return { success: false, cancelled: true };
      }

      // Try to use pandoc if available
      const hasPandoc = await checkPandocAvailability();
      let finalHtml = htmlContent;
      
      if (hasPandoc && exportOptions?.usePandoc !== false) {
        console.log('[ExportHandlers] Using pandoc for HTML export');
        
        // Find .bib files in current directory
        const bibFiles = await findBibFiles();
        
        // Create temporary markdown file
        const tempDir = os.tmpdir();
        const tempMdFile = path.join(tempDir, 'temp_export.md');
        await fs.writeFile(tempMdFile, content, 'utf8');
        
        try {
          const pandocArgs = [
            tempMdFile,
            '-f', 'markdown',
            '-t', 'html5',
            '--standalone',
            '--toc',
            '--toc-depth=3',
            '--number-sections'
          ];
          
          // Add bibliography support if .bib files found
          if (bibFiles.length > 0) {
            console.log(`[ExportHandlers] Found ${bibFiles.length} .bib file(s):`, bibFiles.map(f => path.basename(f)));
            pandocArgs.push('--citeproc');
            bibFiles.forEach(bibFile => {
              pandocArgs.push('--bibliography', bibFile);
            });
            // Add citation style
            const cslStyle = await getDefaultCSLStyle();
            if (cslStyle) {
              pandocArgs.push('--csl', cslStyle);
            }
          }
          
          // Add custom pandoc options if provided
          if (exportOptions?.pandocArgs) {
            pandocArgs.push(...exportOptions.pandocArgs);
          }
          
          finalHtml = await runPandoc(pandocArgs);
          console.log('[ExportHandlers] Pandoc HTML export completed successfully');
        } catch (pandocError) {
          console.warn('[ExportHandlers] Pandoc export failed, falling back to basic HTML:', pandocError.message);
          // Fall back to the original HTML content
        } finally {
          // Clean up temp file
          try {
            await fs.unlink(tempMdFile);
          } catch (e) {
            console.warn('[ExportHandlers] Could not clean up temp file:', e.message);
          }
        }
      } else if (!hasPandoc) {
        console.log('[ExportHandlers] Pandoc not available, using basic HTML export');
      }

      await fs.writeFile(result.filePath, finalHtml, 'utf8');
      console.log(`[ExportHandlers] HTML exported successfully to: ${result.filePath}`);
      
      // Check if the exported HTML file is currently being viewed in preview and refresh it
      console.log('[ExportHandlers] About to send IPC message, mainWindow exists:', !!mainWindow);
      if (mainWindow) {
        console.log('[ExportHandlers] Sending html-export-completed IPC message for:', result.filePath);
        mainWindow.webContents.send('html-export-completed', result.filePath);
        console.log('[ExportHandlers] IPC message sent successfully');
      } else {
        console.warn('[ExportHandlers] mainWindow is null/undefined, cannot send IPC message');
      }
      
      return { 
        success: true, 
        filePath: result.filePath, 
        usedPandoc: hasPandoc && exportOptions?.usePandoc !== false,
        bibFilesFound: hasPandoc ? (await findBibFiles()).length : 0
      };
    } catch (error) {
      console.error('[ExportHandlers] Error exporting HTML:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('perform-export-html-pandoc', async (event, content, htmlContent, exportOptions) => {
    console.log('[ExportHandlers] *** PANDOC HTML EXPORT HANDLER CALLED ***');
    console.log('[ExportHandlers] Received perform-export-html-pandoc with options:', exportOptions);
    try {
      const currentFilePath = getCurrentFilePath();
      const defaultPath = currentFilePath ? 
        currentFilePath.replace(/\.[^/.]+$/, '.html') : 
        'export.html';
      
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export as HTML (with References)',
        defaultPath: defaultPath,
        filters: [
          { name: 'HTML Files', extensions: ['html'] }
        ]
      });

      if (result.canceled) {
        return { success: false, cancelled: true };
      }

      console.log('[ExportHandlers] Using pandoc for HTML export with bibliography support');
      
      // Find .bib files for citations
      const bibFiles = await findBibFiles();
      
      // Create temporary markdown file
      const tempDir = os.tmpdir();
      const tempMdFile = path.join(tempDir, 'temp_html_pandoc_export.md');
      console.log('[ExportHandlers] Working directory:', currentWorkingDirectory);
      console.log('[ExportHandlers] Temp directory:', tempDir);
      console.log('[ExportHandlers] Temp markdown file:', tempMdFile);
      
      await fs.writeFile(tempMdFile, content);
      console.log('[ExportHandlers] Written markdown content to temp file');
      
      // Prepare pandoc args for HTML with bibliography
      const pandocArgs = [
        tempMdFile,
        '-t', 'html5',
        '--standalone',
        '--mathjax',
        '--highlight-style=pygments',
        '-o', result.filePath
      ];
      
      if (bibFiles.length > 0) {
        console.log('[ExportHandlers] Found .bib files:', bibFiles);
        pandocArgs.push('--citeproc');
        bibFiles.forEach(bibFile => {
          pandocArgs.push('--bibliography', bibFile);
        });
        const cslStyle = await getDefaultCSLStyle();
        if (cslStyle) {
          console.log('[ExportHandlers] Adding CSL style for HTML:', cslStyle);
          pandocArgs.push('--csl', cslStyle);
        }
      }
      
      // Change to the correct working directory before running pandoc
      const originalCwd = process.cwd();
      if (currentWorkingDirectory && currentWorkingDirectory !== originalCwd) {
        console.log('[ExportHandlers] Changing working directory from', originalCwd, 'to', currentWorkingDirectory);
        process.chdir(currentWorkingDirectory);
      }
      
      try {
        console.log('[ExportHandlers] Running pandoc with args:', pandocArgs);
        
        // Add custom pandoc options if provided
        if (exportOptions?.pandocArgs) {
          console.log('[ExportHandlers] Adding custom pandoc args:', exportOptions.pandocArgs);
          pandocArgs.push(...exportOptions.pandocArgs);
        }
        
        await runPandoc(pandocArgs);
        
        console.log('[ExportHandlers] Pandoc HTML export completed successfully');
        
        return {
          success: true,
          filePath: result.filePath,
          usedPandoc: true,
          bibFilesFound: bibFiles.length
        };
        
      } finally {
        // Check if the exported HTML file is currently being viewed in preview and refresh it
        console.log('[ExportHandlers] (Pandoc) About to send IPC message, mainWindow exists:', !!mainWindow);
        if (mainWindow && result && result.filePath) {
          console.log('[ExportHandlers] (Pandoc) Sending html-export-completed IPC message for:', result.filePath);
          mainWindow.webContents.send('html-export-completed', result.filePath);
          console.log('[ExportHandlers] (Pandoc) IPC message sent successfully');
        } else {
          console.warn('[ExportHandlers] (Pandoc) mainWindow is null/undefined or no result, cannot send IPC message');
        }
        // Restore original working directory
        if (currentWorkingDirectory && currentWorkingDirectory !== originalCwd) {
          console.log('[ExportHandlers] Restoring working directory to', originalCwd);
          process.chdir(originalCwd);
        }
        
        // Clean up temp file
        try {
          await fs.unlink(tempMdFile);
        } catch (e) {
          console.warn('[ExportHandlers] Could not clean up temp file:', e.message);
        }
      }
    } catch (error) {
      console.error('[ExportHandlers] Error exporting HTML with pandoc:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('perform-export-pdf', async (event, content, htmlContent, exportOptions) => {
    console.log('[ExportHandlers] Received perform-export-pdf with options:', exportOptions);
    try {
      const currentFilePath = getCurrentFilePath();
      const defaultPath = currentFilePath ? 
        currentFilePath.replace(/\.[^/.]+$/, '.pdf') : 
        'export.pdf';
      
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export as PDF',
        defaultPath: defaultPath,
        filters: [
          { name: 'PDF Files', extensions: ['pdf'] }
        ]
      });

      if (result.canceled) {
        return { success: false, cancelled: true };
      }

      // Try to use pandoc if available
      const hasPandoc = await checkPandocAvailability();
      
      if (hasPandoc) {
        console.log('[ExportHandlers] Using pandoc for PDF export');
        
        // Find .bib files for citations
        const bibFiles = await findBibFiles();
        
        // Create temporary markdown file
        const tempDir = os.tmpdir();
        const tempMdFile = path.join(tempDir, 'temp_pdf_export.md');
        await fs.writeFile(tempMdFile, content);
        
        // Change to the correct working directory before running pandoc
        const originalCwd = process.cwd();
        if (currentWorkingDirectory && currentWorkingDirectory !== originalCwd) {
          console.log('[ExportHandlers] Changing working directory from', originalCwd, 'to', currentWorkingDirectory);
          process.chdir(currentWorkingDirectory);
        }
        
        try {
          // Prepare pandoc args for PDF
          const pandocArgs = [
            tempMdFile,
            '-o', result.filePath,
            '--pdf-engine=xelatex',
            '-V', 'geometry:margin=1in',
            '--highlight-style=pygments'
          ];
          
          // Add bibliography support if .bib files found
          if (bibFiles.length > 0) {
            console.log(`[ExportHandlers] Found ${bibFiles.length} .bib file(s):`, bibFiles.map(f => path.basename(f)));
            pandocArgs.push('--citeproc');
            bibFiles.forEach(bibFile => {
              pandocArgs.push('--bibliography', bibFile);
            });
            // Add citation style
            const cslStyle = await getDefaultCSLStyle();
            if (cslStyle) {
              pandocArgs.push('--csl', cslStyle);
            }
          }
          
          // Add custom pandoc options if provided
          if (exportOptions?.pandocArgs) {
            pandocArgs.push(...exportOptions.pandocArgs);
          }
          
          console.log('[ExportHandlers] Running pandoc with args:', pandocArgs);
          await runPandoc(pandocArgs);
          
          console.log('[ExportHandlers] Pandoc PDF export completed successfully');
          
          return {
            success: true,
            filePath: result.filePath,
            usedPandoc: true,
            bibFilesFound: bibFiles.length
          };
          
        } finally {
          // Restore original working directory
          if (currentWorkingDirectory && currentWorkingDirectory !== originalCwd) {
            console.log('[ExportHandlers] Restoring working directory to', originalCwd);
            process.chdir(originalCwd);
          }
          
          // Clean up temp file
          try {
            await fs.unlink(tempMdFile);
          } catch (e) {
            console.warn('[ExportHandlers] Could not clean up temp file:', e.message);
          }
        }
      } else {
        console.log('[ExportHandlers] Pandoc not available for PDF export');
        return { success: false, error: 'PDF export requires pandoc to be installed' };
      }
    } catch (error) {
      console.error('[ExportHandlers] Error exporting PDF:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('perform-export-pptx', async (event, content, exportOptions) => {
    console.log('[ExportHandlers] Received perform-export-pptx with options:', exportOptions);
    try {
      const currentFilePath = getCurrentFilePath();
      const defaultPath = currentFilePath ? 
        currentFilePath.replace(/\.[^/.]+$/, '.pptx') : 
        'export.pptx';
      
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export as PowerPoint',
        defaultPath: defaultPath,
        filters: [
          { name: 'PowerPoint Files', extensions: ['pptx'] }
        ]
      });

      if (result.canceled) {
        return { success: false, cancelled: true };
      }

      // Check if pandoc is available
      const hasPandoc = await checkPandocAvailability();
      
      if (!hasPandoc) {
        return { 
          success: false, 
          error: 'Pandoc is required for PowerPoint export. Please install pandoc from https://pandoc.org/' 
        };
      }

      console.log('[ExportHandlers] Using pandoc for PowerPoint export');
      
      // Find .bib files for citations
      const bibFiles = await findBibFiles();
      
      // Create temporary markdown file
      const tempDir = os.tmpdir();
      const tempMdFile = path.join(tempDir, 'temp_powerpoint_export.md');
      
      await fs.writeFile(tempMdFile, content, 'utf8');
      
      try {
        const pandocArgs = [
          tempMdFile,
          '-f', 'markdown',
          '-t', 'pptx',
          '--slide-level=2', // H2 headers create new slides
          '--mathjax', // Math rendering support
          '-o', result.filePath
        ];
        
        // Add bibliography support if .bib files found
        if (bibFiles.length > 0) {
          console.log(`[ExportHandlers] Found ${bibFiles.length} .bib file(s) for PowerPoint:`, bibFiles.map(f => path.basename(f)));
          pandocArgs.push('--citeproc');
          bibFiles.forEach(bibFile => {
            pandocArgs.push('--bibliography', bibFile);
          });
        }
        
        // Add PowerPoint-specific options
        if (exportOptions?.pandocArgs) {
          pandocArgs.push(...exportOptions.pandocArgs);
        }
        
        await runPandoc(pandocArgs);
        console.log('[ExportHandlers] PowerPoint export completed successfully');
        
        return { 
          success: true, 
          filePath: result.filePath,
          usedPandoc: true,
          bibFilesFound: bibFiles.length
        };
        
      } finally {
        // Clean up temp file
        try {
          await fs.unlink(tempMdFile);
        } catch (e) {
          console.warn('[ExportHandlers] Could not clean up temp file:', e.message);
        }
      }
    } catch (error) {
      console.error('[ExportHandlers] Error exporting PowerPoint:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('trigger-export', async (event, exportType) => {
    console.log('[ExportHandlers] Export trigger received for type:', exportType);
    try {
      // This is a utility handler to trigger exports from the UI
      // The actual export logic is handled by the specific export handlers above
      return { success: true, exportType };
    } catch (error) {
      console.error('[ExportHandlers] Error in export trigger:', error);
      return { success: false, error: error.message };
    }
  });

  console.log('[ExportHandlers] Registered export handlers');
}

module.exports = {
  register
};
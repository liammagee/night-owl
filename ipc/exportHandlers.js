// === Export IPC Handlers ===
// Handles all document export related IPC communication

const { ipcMain, dialog, app } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { createRuntimeWorkspaceResolver } = require('./runtimeWorkspace');
const { createDebugLogger } = require('./logging');

const debug = createDebugLogger('ExportHandlers');

// Import citation service for database citations
let CitationService;
try {
  CitationService = require('../services/citationService.js');
} catch (error) {
  console.warn('[ExportHandlers] Could not load CitationService:', error.message);
}

function normalizeBibTeXValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).replace(/\s+/g, ' ').trim();
}

/**
 * Normalize an author string for BibTeX output.
 * BibTeX requires "and" to separate multiple authors — commas within the
 * author field mean "Last, First" for a single author.  Database entries
 * may store authors in various formats:
 *   - "First Last, First Last" (comma-separated full names)
 *   - "Last, F., Last, F., & Last, F." (APA with ampersand)
 *   - "Last, First and Last, First" (already valid BibTeX)
 *
 * This function parses the author string and re-emits it in canonical
 * BibTeX format: "Last, First and Last, First and ...".
 */
function normalizeAuthorsForBibTeX(authorStr) {
  if (!authorStr) return '';
  const str = authorStr.trim();

  // Already uses "and" separator (but not "&") — valid BibTeX, leave as-is
  if (/\band\b/i.test(str) && !/\s*&\s*/.test(str)) return str;

  // Parse into structured authors using same heuristics as citationRenderer
  const segments = str.split(/\s+and\s+|\s*&\s*/i)
    .map(s => s.trim()).filter(Boolean);

  const authors = [];
  for (const segment of segments) {
    const parts = segment.split(',').map(s => s.trim()).filter(Boolean);

    if (parts.length >= 2) {
      if (parts.every(p => p.includes(' '))) {
        // "First Last, First Last" — each part is a full name
        for (const part of parts) {
          const words = part.split(/\s+/);
          authors.push({ first: words.slice(0, -1).join(' '), last: words[words.length - 1] });
        }
      } else if (parts.length % 2 === 0) {
        // "Last, First" pairs: "Radford, A., Narasimhan, K."
        for (let i = 0; i < parts.length; i += 2) {
          authors.push({ last: parts[i], first: parts[i + 1] });
        }
      } else {
        // Odd count — single author with complex name
        authors.push({ last: parts[0], first: parts.slice(1).join(', ') });
      }
    } else {
      // No commas: "First Last"
      const words = segment.split(/\s+/);
      if (words.length >= 2) {
        authors.push({ first: words.slice(0, -1).join(' '), last: words[words.length - 1] });
      } else if (words.length === 1 && words[0]) {
        authors.push({ last: words[0], first: '' });
      }
    }
  }

  if (authors.length === 0) return str;

  // Re-emit in canonical BibTeX format: "Last, First and Last, First"
  return authors
    .map(a => a.first ? `${a.last}, ${a.first}` : a.last)
    .join(' and ');
}

function getCitationType(type) {
  const normalizedType = normalizeBibTeXValue(type).toLowerCase().replace(/[^a-z]/g, '');
  return normalizedType || 'article';
}

/**
 * Extract all citation keys referenced in a markdown string.
 * Matches @key in Pandoc citation syntax: [@key], [@key1; @key2], [see @key, p. 42]
 */
function extractCitationKeysFromMarkdown(markdown) {
  const keys = new Set();
  if (!markdown) return keys;
  // Match @key where key is the citation identifier (alphanumeric, underscore, hyphen, colon)
  const re = /@([a-zA-Z0-9_][a-zA-Z0-9_:.\-]*)/g;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

/**
 * Extract the first author's last name from an author string.
 */
function getFirstAuthorLastName(authors) {
  if (!authors) return '';
  const str = authors.trim();
  // Split by "and" or "&" to get first author segment
  const first = str.split(/\s+and\s+|\s*&\s*/i)[0].trim();
  if (!first) return '';
  // "Last, First" format
  if (first.includes(',')) return first.split(',')[0].trim();
  // "First Last" format — last word is the last name
  const words = first.split(/\s+/);
  return words[words.length - 1];
}

/**
 * Get significant title words (>3 chars, lowercased) for matching.
 */
function getTitleSignificantWords(title) {
  if (!title) return [];
  return title
    .split(/\s+/)
    .map(w => w.replace(/[^A-Za-z]/g, ''))
    .filter(w => w.length > 3)
    .map(w => w.toLowerCase());
}

/**
 * Fuzzy-match a markdown citation key to a database citation.
 * Scores candidates by author name, year, and title word overlap.
 * Returns the best-matching citation or null if no confident match.
 */
function fuzzyMatchCitation(markdownKey, dbCitations) {
  // Parse components from the markdown key
  const yearMatch = markdownKey.match(/(\d{4})/);
  const keyYear = yearMatch ? parseInt(yearMatch[1]) : null;
  const keyLower = markdownKey.toLowerCase().replace(/[^a-z0-9]/g, '');

  let bestMatch = null;
  let bestScore = 0;

  for (const citation of dbCitations) {
    let score = 0;
    const authorLast = getFirstAuthorLastName(citation.authors);
    const titleWords = getTitleSignificantWords(citation.title);

    // Author match: does the key start with or contain the first author's last name?
    if (authorLast) {
      const authorLower = authorLast.toLowerCase();
      if (keyLower.startsWith(authorLower)) {
        score += 10;
      } else if (keyLower.includes(authorLower)) {
        score += 5;
      }
    }

    // Year match (exact or close)
    if (keyYear && citation.publication_year) {
      if (keyYear === citation.publication_year) {
        score += 5;
      } else if (Math.abs(keyYear - citation.publication_year) <= 3) {
        score += 2;
      }
    }

    // Title word overlap
    if (titleWords.length > 0) {
      const matchedWords = titleWords.filter(w => keyLower.includes(w));
      score += matchedWords.length * 3;
    }

    // Require a minimum confidence: at least author + one other signal
    if (score > bestScore && score >= 10) {
      bestScore = score;
      bestMatch = citation;
    }
  }

  return bestMatch;
}

function generateCitationKey(citation) {
  if (citation.key && typeof citation.key === 'string') {
    return citation.key;
  }
  if (citation.citation_key && typeof citation.citation_key === 'string') {
    return citation.citation_key;
  }

  let key = '';
  const authors = normalizeBibTeXValue(citation.authors);
  const title = normalizeBibTeXValue(citation.title);

  if (authors) {
    const authorList = authors.split(/\s+and\s+/i);
    const firstAuthor = (authorList[0] || '').trim();
    const lastName = firstAuthor.includes(',')
      ? firstAuthor.split(',')[0].trim()
      : firstAuthor.split(/\s+/).pop() || firstAuthor;
    key += lastName.replace(/[^A-Za-z]/g, '');
  } else {
    key += 'Citation';
  }

  key += (citation.publication_year || new Date().getFullYear());

  if (title) {
    const cleanedWords = title
      .split(/\s+/)
      .map(word => word.replace(/[^A-Za-z]/g, ''))
      .filter(Boolean);
    const significant = cleanedWords.filter(word => word.length > 3);
    const chosen = (significant.length > 0 ? significant : cleanedWords).slice(0, 2);
    if (chosen.length > 0) {
      key += chosen.join('');
    }
  }

  if (!key) {
    key = `Citation${citation.id || Date.now()}`;
  }

  citation.key = key;
  return key;
}

function addBibTeXField(lines, field, value) {
  const normalizedValue = normalizeBibTeXValue(value);
  if (!normalizedValue) {
    return false;
  }

  lines.push(`  ${field}={${normalizedValue}}`);
  return true;
}

/**
 * Protect title capitalization for BibTeX/citeproc.
 * APA and other styles apply sentence-case to titles, lowercasing words
 * after the first. BibTeX uses {braces} to protect words that must stay
 * capitalized (proper nouns, acronyms, etc.).
 *
 * Strategy: wrap any word containing an uppercase letter (after the first
 * word and any leading punctuation) in braces, unless it's already braced.
 * This preserves "AI", "Hegel", "LLM", "GPT-3", etc.
 */
function protectTitleCase(title) {
  if (!title) return title;
  const words = title.split(/\s+/);
  if (words.length === 0) return title;

  const result = [words[0]]; // first word is never lowercased by citeproc
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    // Skip already-braced words
    if (word.startsWith('{') && word.endsWith('}')) {
      result.push(word);
    // Protect words with uppercase letters (proper nouns, acronyms)
    } else if (/[A-Z]/.test(word)) {
      result.push(`{${word}}`);
    } else {
      result.push(word);
    }
  }
  return result.join(' ');
}

function citationToBibTeX(citation) {
  const key = generateCitationKey(citation);
  const type = getCitationType(citation.citation_type);
  const fields = [];

  addBibTeXField(fields, 'title', protectTitleCase(citation.title));
  addBibTeXField(fields, 'author', normalizeAuthorsForBibTeX(citation.authors));
  addBibTeXField(fields, 'year', citation.publication_year);
  addBibTeXField(fields, 'journal', citation.journal);
  addBibTeXField(fields, 'volume', citation.volume);
  addBibTeXField(fields, 'number', citation.issue);
  addBibTeXField(fields, 'pages', citation.pages);
  addBibTeXField(fields, 'publisher', citation.publisher);
  addBibTeXField(fields, 'address', citation.publisher_place);
  addBibTeXField(fields, 'doi', citation.doi);
  addBibTeXField(fields, 'url', citation.url);

  if (fields.length === 0) {
    return null;
  }

  return `@${type}{${key},\n${fields.join(',\n')}\n}\n\n`;
}

function formatPandocErrorMessage(code, stderr, stdout) {
  const detail = normalizeBibTeXValue(stderr || stdout);
  return detail ? `Pandoc failed with exit code ${code}: ${detail}` : `Pandoc failed with exit code ${code}`;
}

/**
 * Normalize citation syntax for pandoc compatibility.
 * The preview renderer accepts both comma-separated ([@key1, @key2]) and
 * semicolon-separated ([@key1; @key2]) multiple citations, but pandoc's
 * citeproc only recognizes semicolons as citation separators.
 * This converts ", @" to "; @" within citation brackets.
 */
function normalizeCitationsForPandoc(markdown) {
  // Match citation brackets: [...@key...] and replace ", @" with "; @" inside them
  return markdown.replace(/\[([^\]]*@[^\]]*)\]/g, (match, inner) => {
    const normalized = inner.replace(/,\s*@/g, '; @');
    return `[${normalized}]`;
  });
}

function resolveExportBaseDirectory(currentFilePath, workingDirectory, fallbackDirectory) {
  if (currentFilePath) {
    return path.dirname(currentFilePath);
  }

  if (workingDirectory) {
    return workingDirectory;
  }

  return fallbackDirectory;
}

/**
 * Register all export IPC handlers
 * @param {Object} deps - Dependencies from main.js
 */
function register(deps) {
  const {
    mainWindow,
    appSettings,
    getCurrentFilePath,
    currentWorkingDirectory,
    getCurrentWorkingDirectory
  } = deps;

  const getWorkingDirectory = createRuntimeWorkspaceResolver({
    appSettings,
    currentWorkingDirectory,
    getCurrentWorkingDirectory
  });

  function getExportBaseDirectory() {
    return resolveExportBaseDirectory(
      getCurrentFilePath(),
      getWorkingDirectory(),
      app.getPath('documents')
    );
  }
  
  // Generate temporary .bib file from database citations.
  // When markdownContent is provided, also emits alias BibTeX entries for
  // citation keys in the markdown that don't directly match a DB citation_key
  // but can be fuzzy-matched to one (e.g. multi-author keys, Zotero-style keys).
  async function generateDatabaseBibFile(markdownContent) {
    try {
      if (!CitationService) {
        debug('[ExportHandlers] CitationService not available, skipping database citations');
        return null;
      }

      // Initialize citation service
      const citationService = new CitationService();
      const userDataPath = app.getPath('userData');
      await citationService.initialize(userDataPath);

      // Get all citations from database
      const citations = await citationService.getCitations({});

      if (citations.length === 0) {
        debug('[ExportHandlers] No database citations found');
        return null;
      }

      debug(`[ExportHandlers] Converting ${citations.length} database citations to BibTeX format`);

      const bibEntries = citations
        .map(citationToBibTeX)
        .filter(Boolean);

      if (bibEntries.length === 0) {
        debug('[ExportHandlers] Database citations were empty after sanitization');
        return null;
      }

      const skippedEntries = citations.length - bibEntries.length;
      let bibContent = '% Database Citations\n% Generated automatically from citation database\n\n';
      bibContent += bibEntries.join('');

      // ── Alias resolution: emit duplicate entries for unmatched markdown keys ──
      if (markdownContent) {
        const markdownKeys = extractCitationKeysFromMarkdown(markdownContent);
        const dbKeySet = new Set(citations.map(c => c.citation_key).filter(Boolean));

        let aliasCount = 0;
        const aliasEntries = [];

        for (const mdKey of markdownKeys) {
          // Skip keys that already have a direct match in the DB
          if (dbKeySet.has(mdKey)) continue;

          const matched = fuzzyMatchCitation(mdKey, citations);
          if (matched) {
            // Emit the same citation under the markdown's key
            const aliasCitation = { ...matched, citation_key: mdKey, key: mdKey };
            const aliasEntry = citationToBibTeX(aliasCitation);
            if (aliasEntry) {
              aliasEntries.push(aliasEntry);
              aliasCount++;
              debug(`[ExportHandlers] Citation alias: ${mdKey} → ${matched.citation_key}`);
            }
          }
        }

        if (aliasEntries.length > 0) {
          bibContent += '\n% ── Citation key aliases (fuzzy-matched from markdown) ──\n\n';
          bibContent += aliasEntries.join('');
          debug(`[ExportHandlers] Generated ${aliasCount} citation key alias(es)`);
        }
      }

      // Write to temporary file
      const tempDir = os.tmpdir();
      const tempBibFile = path.join(tempDir, `database-citations-${Date.now()}.bib`);
      await fs.writeFile(tempBibFile, bibContent, 'utf8');

      debug(`[ExportHandlers] Generated database citations file: ${tempBibFile}`);
      debug(`[ExportHandlers] Database citations file contains ${bibEntries.length} entries`);
      if (skippedEntries > 0) {
        debug(`[ExportHandlers] Skipped ${skippedEntries} invalid citation entr${skippedEntries === 1 ? 'y' : 'ies'} during BibTeX generation`);
      }

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
          debug(`[ExportHandlers] Cleaned up temporary database citations file: ${path.basename(bibFile)}`);
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
          debug('[ExportHandlers] Pandoc is available:', output.split('\n')[0]);
          resolve(true);
        } else {
          debug('[ExportHandlers] Pandoc not found or not working');
          resolve(false);
        }
      });
      
      pandoc.on('error', () => {
        debug('[ExportHandlers] Pandoc not available (command not found)');
        resolve(false);
      });
    });
  }

  async function findBibFiles(baseDirectory = getExportBaseDirectory(), markdownContent = null) {
    try {
      const workingDir = baseDirectory;
      
      debug('\n=== BIBLIOGRAPHY DETECTION ===');
      debug('[ExportHandlers] Looking for .bib files in:', workingDir);
      
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
              debug(`[ExportHandlers] Found .bib file: ${item.name}`);
              debug(`  - Size: ${stats.size} bytes`);
              debug(`  - Entries: ${entryCount}`);
              debug(`  - Path: ${fullPath}`);
              if (content.length > 0) {
                const preview = content.substring(0, 200).replace(/\n/g, ' ');
                debug(`  - Preview: ${preview}...`);
              }
            } catch (readError) {
              console.warn(`[ExportHandlers] Could not read .bib file ${fullPath}:`, readError.message);
            }
          }
        }
      }
      
      debug(`[ExportHandlers] Directory contains ${allFiles.length} files total:`);
      debug('[ExportHandlers] All files:', allFiles.slice(0, 10).join(', '), allFiles.length > 10 ? '...' : '');
      // Generate database citations .bib file (authoritative source)
      const databaseBibFile = await generateDatabaseBibFile(markdownContent);
      if (databaseBibFile) {
        // Exclude citations.bib from static files — it's a stale DB export artifact.
        // The fresh DB-generated file is the authoritative source for DB citations.
        const staleIndex = bibFiles.findIndex(f => path.basename(f) === 'citations.bib');
        if (staleIndex !== -1) {
          debug('[ExportHandlers] Excluding stale citations.bib in favour of fresh database export');
          bibFiles.splice(staleIndex, 1);
        }
        // Add DB file LAST so citeproc gives it priority over static .bib files
        bibFiles.push(databaseBibFile);
        debug('[ExportHandlers] Added database citations file to bibliography list');
      }
      
      debug(`[ExportHandlers] Bibliography files found: ${bibFiles.length}`);
      bibFiles.forEach((file, index) => {
        const isDatabase = file.includes('database-citations-');
        debug(`  [${index + 1}]: ${path.basename(file)} ${isDatabase ? '(from database)' : '(static file)'}`);
      });
      debug('=== END BIBLIOGRAPHY DETECTION ===\n');
      
      return bibFiles;
    } catch (error) {
      console.warn('[ExportHandlers] Error looking for .bib files:', error.message);
      return [];
    }
  }

  async function getDefaultCSLStyle() {
    // Use APA 7th edition CSL — lists all authors up to 20 in bibliography
    // (Pandoc's built-in Chicago style truncates at 7)
    const apaPath = path.join(__dirname, '..', 'templates', 'apa.csl');
    try {
      await fs.access(apaPath);
      debug('[ExportHandlers] Using APA 7th CSL style:', apaPath);
      return apaPath;
    } catch {
      debug('[ExportHandlers] APA CSL not found, using pandoc default');
      return null;
    }
  }

  async function runPandoc(args, options = {}) {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');

      // Log the full pandoc command
      debug('[ExportHandlers] Full pandoc command:');
      debug(`pandoc ${args.map(arg => arg.includes(' ') ? `"${arg}"` : arg).join(' ')}`);
      if (options.cwd) debug(`[ExportHandlers] Working directory: ${options.cwd}`);

      const spawnOpts = {};
      if (options.cwd) spawnOpts.cwd = options.cwd;

      const pandoc = spawn('pandoc', args, spawnOpts);
      let output = '';
      let errorOutput = '';

      pandoc.stdout.on('data', (data) => {
        output += data.toString();
      });

      pandoc.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pandoc.on('close', (code) => {
        // Always log stderr — Pandoc emits citation warnings even on success
        if (errorOutput.trim()) {
          const level = code === 0 ? 'warn' : 'error';
          console[level](`[ExportHandlers] Pandoc stderr:\n${errorOutput.trim()}`);
        }
        if (code === 0) {
          resolve(output);
        } else {
          const error = new Error(formatPandocErrorMessage(code, errorOutput, output));
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
    debug('[ExportHandlers] *** REGULAR HTML EXPORT HANDLER CALLED ***');
    debug('[ExportHandlers] Received perform-export-html with options:', exportOptions);
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
      let bibFiles = [];
      
      if (hasPandoc && exportOptions?.usePandoc !== false) {
        debug('[ExportHandlers] Using pandoc for HTML export');
        const exportBaseDirectory = getExportBaseDirectory();
        
        // Find .bib files in current directory
        bibFiles = await findBibFiles(exportBaseDirectory, content);
        
        // Create temporary markdown file
        const tempDir = os.tmpdir();
        const tempMdFile = path.join(tempDir, 'temp_export.md');
        await fs.writeFile(tempMdFile, normalizeCitationsForPandoc(content), 'utf8');

        try {
          const pandocArgs = [
            tempMdFile,
            '-f', 'markdown',
            '-t', 'html5',
            '--standalone',
            '--toc',
            '--toc-depth=3',
            '--number-sections',
            '--resource-path',
            exportBaseDirectory
          ];
          
          // Add bibliography support if .bib files found
          if (bibFiles.length > 0) {
            debug(`[ExportHandlers] Found ${bibFiles.length} .bib file(s):`, bibFiles.map(f => path.basename(f)));
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
          debug('[ExportHandlers] Pandoc HTML export completed successfully');
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
          await cleanupDatabaseBibFiles(bibFiles);
        }
      } else if (!hasPandoc) {
        debug('[ExportHandlers] Pandoc not available, using basic HTML export');
      }

      await fs.writeFile(result.filePath, finalHtml, 'utf8');
      debug(`[ExportHandlers] HTML exported successfully to: ${result.filePath}`);
      
      // Check if the exported HTML file is currently being viewed in preview and refresh it
      debug('[ExportHandlers] About to send IPC message, mainWindow exists:', !!mainWindow);
      if (mainWindow) {
        debug('[ExportHandlers] Sending html-export-completed IPC message for:', result.filePath);
        mainWindow.webContents.send('html-export-completed', result.filePath);
        debug('[ExportHandlers] IPC message sent successfully');
      } else {
        console.warn('[ExportHandlers] mainWindow is null/undefined, cannot send IPC message');
      }
      
      return { 
        success: true, 
        filePath: result.filePath, 
        usedPandoc: hasPandoc && exportOptions?.usePandoc !== false,
        bibFilesFound: hasPandoc ? bibFiles.length : 0
      };
    } catch (error) {
      console.error('[ExportHandlers] Error exporting HTML:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('perform-export-html-pandoc', async (event, content, htmlContent, exportOptions) => {
    debug('[ExportHandlers] *** PANDOC HTML EXPORT HANDLER CALLED ***');
    debug('[ExportHandlers] Received perform-export-html-pandoc with options:', exportOptions);
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

      debug('[ExportHandlers] Using pandoc for HTML export with bibliography support');
      const exportBaseDirectory = getExportBaseDirectory();
      
      // Find .bib files for citations
      const bibFiles = await findBibFiles(exportBaseDirectory, content);
      
      // Create temporary markdown file
      const tempDir = os.tmpdir();
      const tempMdFile = path.join(tempDir, 'temp_html_pandoc_export.md');
      debug('[ExportHandlers] Working directory:', exportBaseDirectory);
      debug('[ExportHandlers] Temp directory:', tempDir);
      debug('[ExportHandlers] Temp markdown file:', tempMdFile);
      
      await fs.writeFile(tempMdFile, normalizeCitationsForPandoc(content));
      debug('[ExportHandlers] Written markdown content to temp file');
      
      // Prepare pandoc args for HTML with bibliography
      const pandocArgs = [
        tempMdFile,
        '-t', 'html5',
        '--standalone',
        '--mathjax',
        '--highlight-style=pygments',
        '--resource-path',
        exportBaseDirectory,
        '-o', result.filePath
      ];
      
      if (bibFiles.length > 0) {
        debug('[ExportHandlers] Found .bib files:', bibFiles);
        pandocArgs.push('--citeproc');
        bibFiles.forEach(bibFile => {
          pandocArgs.push('--bibliography', bibFile);
        });
        const cslStyle = await getDefaultCSLStyle();
        if (cslStyle) {
          debug('[ExportHandlers] Adding CSL style for HTML:', cslStyle);
          pandocArgs.push('--csl', cslStyle);
        }
      }
      
      try {
        debug('[ExportHandlers] Running pandoc with args:', pandocArgs);

        // Add custom pandoc options if provided
        if (exportOptions?.pandocArgs) {
          debug('[ExportHandlers] Adding custom pandoc args:', exportOptions.pandocArgs);
          pandocArgs.push(...exportOptions.pandocArgs);
        }

        await runPandoc(pandocArgs, { cwd: exportBaseDirectory });

        debug('[ExportHandlers] Pandoc HTML export completed successfully');

        return {
          success: true,
          filePath: result.filePath,
          usedPandoc: true,
          bibFilesFound: bibFiles.length
        };

      } finally {
        // Check if the exported HTML file is currently being viewed in preview and refresh it
        debug('[ExportHandlers] (Pandoc) About to send IPC message, mainWindow exists:', !!mainWindow);
        if (mainWindow && result && result.filePath) {
          debug('[ExportHandlers] (Pandoc) Sending html-export-completed IPC message for:', result.filePath);
          mainWindow.webContents.send('html-export-completed', result.filePath);
          debug('[ExportHandlers] (Pandoc) IPC message sent successfully');
        } else {
          console.warn('[ExportHandlers] (Pandoc) mainWindow is null/undefined or no result, cannot send IPC message');
        }

        // Clean up temp file
        try {
          await fs.unlink(tempMdFile);
        } catch (e) {
          console.warn('[ExportHandlers] Could not clean up temp file:', e.message);
        }
        await cleanupDatabaseBibFiles(bibFiles);
      }
    } catch (error) {
      console.error('[ExportHandlers] Error exporting HTML with pandoc:', error);
      return { success: false, error: error.message };
    }
  });

  async function exportPdfWithPandoc(content, exportOptions = {}, dialogTitle = 'Export as PDF') {
    debug(`[ExportHandlers] Received ${dialogTitle} request with options:`, exportOptions);
    try {
      const currentFilePath = getCurrentFilePath();
      const exportBaseDirectory = getExportBaseDirectory();
      const defaultPath = currentFilePath ? 
        currentFilePath.replace(/\.[^/.]+$/, '.pdf') : 
        path.join(exportBaseDirectory, 'document.pdf');
      
      const result = await dialog.showSaveDialog(mainWindow, {
        title: dialogTitle,
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
        debug('[ExportHandlers] Using pandoc for PDF export');
        
        // Find .bib files for citations
        const bibFiles = await findBibFiles(exportBaseDirectory, content);
        
        // Create uniquely-named temporary markdown file
        const tempDir = os.tmpdir();
        const tempMdFile = path.join(tempDir, `temp_pdf_export_${Date.now()}.md`);
        await fs.writeFile(tempMdFile, normalizeCitationsForPandoc(content));

        try {
          // Prepare pandoc args for PDF
          const pandocArgs = [
            tempMdFile,
            '-o', result.filePath,
            '--pdf-engine=xelatex',
            '-V', 'geometry:margin=1in',
            '--highlight-style=pygments',
            '--resource-path',
            exportBaseDirectory
          ];

          // Add bibliography support if .bib files found
          if (bibFiles.length > 0) {
            debug(`[ExportHandlers] Found ${bibFiles.length} .bib file(s):`, bibFiles.map(f => path.basename(f)));
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
          if (exportOptions.pandocArgs) {
            pandocArgs.push(...exportOptions.pandocArgs);
          }

          debug('[ExportHandlers] Running pandoc with args:', pandocArgs);
          await runPandoc(pandocArgs, { cwd: exportBaseDirectory });

          debug('[ExportHandlers] Pandoc PDF export completed successfully');

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
          await cleanupDatabaseBibFiles(bibFiles);
        }
      } else {
        debug('[ExportHandlers] Pandoc not available for PDF export');
        return { success: false, error: 'PDF export requires pandoc to be installed' };
      }
    } catch (error) {
      console.error('[ExportHandlers] Error exporting PDF:', error);
      return { success: false, error: error.message };
    }
  }

  ipcMain.handle('perform-export-pdf', async (event, content, htmlContent, exportOptions) => {
    return exportPdfWithPandoc(content, exportOptions, 'Export as PDF');
  });

  ipcMain.handle('perform-export-pdf-pandoc', async (event, content, exportOptions) => {
    return exportPdfWithPandoc(content, exportOptions, 'Export as PDF (with References)');
  });

  ipcMain.handle('perform-export-pptx', async (event, content, exportOptions) => {
    debug('[ExportHandlers] Received perform-export-pptx with options:', exportOptions);
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

      debug('[ExportHandlers] Using pandoc for PowerPoint export');
      
      // Find .bib files for citations
      const workingDir = getExportBaseDirectory();
      const bibFiles = await findBibFiles(workingDir, content);
      
      // Create temporary markdown file
      const tempDir = os.tmpdir();
      const tempMdFile = path.join(tempDir, 'temp_powerpoint_export.md');
      
      await fs.writeFile(tempMdFile, normalizeCitationsForPandoc(content), 'utf8');

      try {
        // Set resource path to help Pandoc find images
        debug('[ExportHandlers] *** UPDATED CODE IS RUNNING - VERSION 2.0 ***');
        debug('[ExportHandlers] Working directory for resources:', workingDir);

        const pandocArgs = [
          tempMdFile,
          '-f', 'markdown',
          '-t', 'pptx',
          '--slide-level=2' // H2 headers create new slides
        ];

        // Add reference template for better margins and styling
        const referencePath = path.join(__dirname, '..', 'templates', 'reference.pptx');
        if (await fs.access(referencePath).then(() => true).catch(() => false)) {
          pandocArgs.push('--reference-doc', referencePath);
          debug('[ExportHandlers] Using reference template:', referencePath);
        }

        // Add resource path BEFORE output file
        pandocArgs.push('--resource-path', workingDir);

        // Add output file
        pandocArgs.push('-o', result.filePath);

        // Add bibliography support if .bib files found
        if (bibFiles.length > 0) {
          debug(`[ExportHandlers] Found ${bibFiles.length} .bib file(s) for PowerPoint:`, bibFiles.map(f => path.basename(f)));
          pandocArgs.push('--citeproc');
          bibFiles.forEach(bibFile => {
            pandocArgs.push('--bibliography', bibFile);
          });
        }

        // Add PowerPoint-specific options (filter out --mathjax as it's not supported for pptx)
        if (exportOptions?.pandocArgs) {
          const filteredArgs = exportOptions.pandocArgs.filter(arg => arg !== '--mathjax');
          if (filteredArgs.length > 0) {
            debug(`[ExportHandlers] Adding filtered pandoc args (removed --mathjax):`, filteredArgs);
            pandocArgs.push(...filteredArgs);
          }
        }

        debug('[ExportHandlers] Final pandoc args before execution:', pandocArgs);
        await runPandoc(pandocArgs);
        debug('[ExportHandlers] PowerPoint export completed successfully');
        
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
        await cleanupDatabaseBibFiles(bibFiles);
      }
    } catch (error) {
      console.error('[ExportHandlers] Error exporting PowerPoint:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('perform-export-docx', async (event, content, exportOptions = {}) => {
    debug('[ExportHandlers] Received perform-export-docx with options:', exportOptions);
    try {
      const currentFilePath = getCurrentFilePath();
      const exportBaseDirectory = getExportBaseDirectory();
      const defaultPath = currentFilePath ?
        currentFilePath.replace(/\.[^/.]+$/, '.docx') :
        'export.docx';

      const result = await dialog.showSaveDialog(mainWindow, {
        title: exportOptions.withReferences ? 'Export as Word (with References)' : 'Export as Word',
        defaultPath: defaultPath,
        filters: [
          { name: 'Word Documents', extensions: ['docx'] }
        ]
      });

      if (result.canceled) {
        return { success: false, cancelled: true };
      }

      const hasPandoc = await checkPandocAvailability();
      if (!hasPandoc) {
        return {
          success: false,
          error: 'Pandoc is required for Word export. Please install pandoc from https://pandoc.org/'
        };
      }

      debug('[ExportHandlers] Using pandoc for Word export');

      const bibFiles = await findBibFiles(exportBaseDirectory, content);

      // Create uniquely-named temporary markdown file (prevents race conditions)
      const tempDir = os.tmpdir();
      const tempMdFile = path.join(tempDir, `temp_docx_export_${Date.now()}.md`);
      await fs.writeFile(tempMdFile, normalizeCitationsForPandoc(content), 'utf8');

      try {
        const pandocArgs = [
          tempMdFile,
          '-f', 'markdown',
          '-t', 'docx',
          '--resource-path', exportBaseDirectory,
          '--toc',
          '--toc-depth=3',
          '--highlight-style=pygments'
        ];

        // Use a reference document for styling if available
        const referencePath = path.join(__dirname, '..', 'templates', 'reference.docx');
        if (await fs.access(referencePath).then(() => true).catch(() => false)) {
          pandocArgs.push('--reference-doc', referencePath);
          debug('[ExportHandlers] Using reference template:', referencePath);
        }

        // Add bibliography support if .bib files found and references requested (or always if bib files exist)
        if (bibFiles.length > 0) {
          debug(`[ExportHandlers] Found ${bibFiles.length} .bib file(s) for Word:`, bibFiles.map(f => path.basename(f)));
          pandocArgs.push('--citeproc');
          bibFiles.forEach(bibFile => {
            pandocArgs.push('--bibliography', bibFile);
          });
          const cslStyle = await getDefaultCSLStyle();
          if (cslStyle) {
            pandocArgs.push('--csl', cslStyle);
          }
        }

        // Add custom pandoc options if provided (filter out unsupported args)
        if (exportOptions.pandocArgs) {
          const filteredArgs = exportOptions.pandocArgs.filter(arg => arg !== '--mathjax');
          if (filteredArgs.length > 0) {
            pandocArgs.push(...filteredArgs);
          }
        }

        // Output file
        pandocArgs.push('-o', result.filePath);

        debug('[ExportHandlers] Running pandoc for Word export with args:', pandocArgs);
        // Use cwd option instead of process.chdir (avoids race conditions with concurrent exports)
        await runPandoc(pandocArgs, { cwd: exportBaseDirectory });
        debug('[ExportHandlers] Word export completed successfully');

        return {
          success: true,
          filePath: result.filePath,
          usedPandoc: true,
          bibFilesFound: bibFiles.length
        };

      } finally {
        try {
          await fs.unlink(tempMdFile);
        } catch (e) {
          console.warn('[ExportHandlers] Could not clean up temp file:', e.message);
        }
        await cleanupDatabaseBibFiles(bibFiles);
      }
    } catch (error) {
      console.error('[ExportHandlers] Error exporting Word:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('trigger-export', async (event, exportType) => {
    debug('[ExportHandlers] Export trigger received for type:', exportType);
    try {
      // Forward the export request back to the renderer as an event.
      // The renderer has on('trigger-export-<type>') listeners that
      // gather content and call the perform-export-* handlers.
      const channel = `trigger-export-${exportType}`;
      if (mainWindow) {
        mainWindow.webContents.send(channel);
      }
      return { success: true, exportType };
    } catch (error) {
      console.error('[ExportHandlers] Error in export trigger:', error);
      return { success: false, error: error.message };
    }
  });

  debug('[ExportHandlers] Registered export handlers');
}

module.exports = {
  register,
  __test__: {
    citationToBibTeX,
    normalizeAuthorsForBibTeX,
    generateCitationKey,
    formatPandocErrorMessage,
    resolveExportBaseDirectory,
    normalizeCitationsForPandoc,
    extractCitationKeysFromMarkdown,
    fuzzyMatchCitation,
    protectTitleCase
  }
};

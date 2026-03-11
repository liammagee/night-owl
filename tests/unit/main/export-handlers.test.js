const mockMainWindow = {
  webContents: {
    send: jest.fn()
  }
};

describe('Export Handlers', () => {
  beforeEach(() => {
    jest.resetModules();

    const { ipcMain, dialog } = require('electron');
    ipcMain.handle.mockClear();
    dialog.showSaveDialog.mockReset();
    mockMainWindow.webContents.send.mockClear();
  });

  test('registers the PDF with references IPC handler', () => {
    const { ipcMain } = require('electron');
    const exportHandlers = require('../../../ipc/exportHandlers');

    exportHandlers.register({
      mainWindow: mockMainWindow,
      getCurrentFilePath: jest.fn(() => '/mock/documents/test.md'),
      currentWorkingDirectory: '/mock/documents'
    });

    const registeredChannels = ipcMain.handle.mock.calls.map(([channel]) => channel);

    expect(registeredChannels).toContain('perform-export-pdf');
    expect(registeredChannels).toContain('perform-export-pdf-pandoc');
  });

  test('uses the references PDF dialog title for the pandoc handler', async () => {
    const { ipcMain, dialog } = require('electron');
    const exportHandlers = require('../../../ipc/exportHandlers');

    exportHandlers.register({
      mainWindow: mockMainWindow,
      getCurrentFilePath: jest.fn(() => '/mock/documents/test.md'),
      currentWorkingDirectory: '/mock/documents'
    });

    dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true });

    const handlerCall = ipcMain.handle.mock.calls.find(
      ([channel]) => channel === 'perform-export-pdf-pandoc'
    );

    expect(handlerCall).toBeDefined();

    const [, handler] = handlerCall;
    const result = await handler({}, '# Test Document', { pandocArgs: ['--toc'] });

    expect(dialog.showSaveDialog).toHaveBeenCalledWith(
      mockMainWindow,
      expect.objectContaining({
        title: 'Export as PDF (with References)',
        defaultPath: '/mock/documents/test.pdf'
      })
    );
    expect(result).toEqual({ success: false, cancelled: true });
  });

  test('skips empty citations when generating BibTeX', () => {
    const exportHandlers = require('../../../ipc/exportHandlers');

    expect(exportHandlers.__test__.citationToBibTeX({
      id: 205,
      citation_type: 'article',
      title: '',
      authors: null,
      journal: null,
      url: null
    })).toBeNull();
  });

  test('prefers the current file directory for export resources', () => {
    const exportHandlers = require('../../../ipc/exportHandlers');

    const exportBaseDirectory = exportHandlers.__test__.resolveExportBaseDirectory(
      '/Users/lmagee/Dev/machinespirits-content-philosophy/articles/ai-tutor/full-paper-2026-01-28.md',
      '/Users/lmagee/Dev/hegel-pedagogy-ai',
      '/mock/documents'
    );

    expect(exportBaseDirectory).toBe(
      '/Users/lmagee/Dev/machinespirits-content-philosophy/articles/ai-tutor'
    );
  });

  test('includes stderr details in pandoc error messages', () => {
    const exportHandlers = require('../../../ipc/exportHandlers');

    expect(
      exportHandlers.__test__.formatPandocErrorMessage(
        25,
        'Error reading bibliography file test.bib',
        ''
      )
    ).toBe('Pandoc failed with exit code 25: Error reading bibliography file test.bib');
  });

  describe('normalizeCitationsForPandoc', () => {
    let normalize;

    beforeEach(() => {
      const exportHandlers = require('../../../ipc/exportHandlers');
      normalize = exportHandlers.__test__.normalizeCitationsForPandoc;
    });

    test('converts comma-separated citations to semicolons', () => {
      expect(normalize('[@Gullett2025, @Bertina2025]'))
        .toBe('[@Gullett2025; @Bertina2025]');
    });

    test('leaves semicolon-separated citations unchanged', () => {
      expect(normalize('[@hegel2025; @kojeve1980]'))
        .toBe('[@hegel2025; @kojeve1980]');
    });

    test('preserves suffix commas (not followed by @)', () => {
      expect(normalize('[@smith2023, p. 42]'))
        .toBe('[@smith2023, p. 42]');
    });

    test('handles mixed comma and semicolon separators', () => {
      expect(normalize('[@a, @b; @c, @d]'))
        .toBe('[@a; @b; @c; @d]');
    });

    test('handles single citations unchanged', () => {
      expect(normalize('[@hegel1807]'))
        .toBe('[@hegel1807]');
    });

    test('handles text without citations unchanged', () => {
      const text = 'This is a paragraph with no citations.';
      expect(normalize(text)).toBe(text);
    });

    test('handles multiple citation groups in same text', () => {
      expect(normalize('See [@a, @b] and also [@c, @d].'))
        .toBe('See [@a; @b] and also [@c; @d].');
    });
  });

  // ─── DB priority: citationToBibTeX uses current DB data ───

  describe('citationToBibTeX — DB data produces clean BibTeX', () => {
    let citationToBibTeX;

    beforeEach(() => {
      const exportHandlers = require('../../../ipc/exportHandlers');
      citationToBibTeX = exportHandlers.__test__.citationToBibTeX;
    });

    test('uses current DB author/year, not stale citation_key values', () => {
      // Scenario: citation_key was generated from old garbled data,
      // but DB fields have since been corrected
      const bib = citationToBibTeX({
        citation_key: 'Freuds2022Negation',  // stale key
        citation_type: 'article',
        title: 'Negation',
        authors: 'Freud, Sigmund',            // corrected
        publication_year: 1952,                // corrected
        journal: 'The Psychoanalytic Quarterly',
        volume: '11',
        pages: '235-239'
      });

      // The BibTeX entry should use the corrected DB fields
      expect(bib).toContain('author={Freud, Sigmund}');
      expect(bib).toContain('year={1952}');
      // Key is preserved for reference stability
      expect(bib).toContain('@article{Freuds2022Negation,');
      // Must NOT contain garbled data in fields (key may retain old name)
      expect(bib).not.toContain("Freud's");
      expect(bib).not.toContain('Standard Edition');
      // year field must be 1952, not the old 2022
      expect(bib).toMatch(/year=\{1952\}/);
    });

    test('normalizes comma-separated "First Last" authors for Pandoc', () => {
      const bib = citationToBibTeX({
        citation_key: 'Huttunen2012Discourse',
        citation_type: 'article',
        title: 'Discourse and Recognition',
        authors: 'Rauno Huttunen, Mark Murphy',
        publication_year: 2012
      });

      // Must use "and" separator for BibTeX, not commas
      expect(bib).toContain('author={Huttunen, Rauno and Murphy, Mark}');
    });

    test('normalizes APA &-separated authors for Pandoc', () => {
      const bib = citationToBibTeX({
        citation_key: 'Radford2018GPT',
        citation_type: 'article',
        title: 'Improving Language Understanding',
        authors: 'Radford, A., Narasimhan, K., Salimans, T., & Sutskever, I.',
        publication_year: 2018
      });

      expect(bib).toContain('author={Radford, A. and Narasimhan, K. and Salimans, T. and Sutskever, I.}');
    });

    test('preserves valid BibTeX "and"-separated authors unchanged', () => {
      const bib = citationToBibTeX({
        citation_key: 'Shapira2026RLHF',
        citation_type: 'article',
        title: 'How RLHF Amplifies Sycophancy',
        authors: 'Shapira, Itai and Benade, Gerdus and Procaccia, Ariel D.',
        publication_year: 2026
      });

      expect(bib).toContain('author={Shapira, Itai and Benade, Gerdus and Procaccia, Ariel D.}');
    });
  });

  // ─── Citation key alias resolution ───

  describe('extractCitationKeysFromMarkdown', () => {
    let extractKeys;

    beforeEach(() => {
      const exportHandlers = require('../../../ipc/exportHandlers');
      extractKeys = exportHandlers.__test__.extractCitationKeysFromMarkdown;
    });

    test('extracts single citation key', () => {
      const keys = extractKeys('See [@hegel1807].');
      expect(keys).toContain('hegel1807');
      expect(keys.size).toBe(1);
    });

    test('extracts multiple keys from semicolon-separated group', () => {
      const keys = extractKeys('[@key1; @key2; @key3]');
      expect(keys).toEqual(new Set(['key1', 'key2', 'key3']));
    });

    test('extracts keys with hyphens and underscores', () => {
      const keys = extractKeys('[@andrej_karpathy_how_2025]');
      expect(keys).toContain('andrej_karpathy_how_2025');
    });

    test('returns empty set for text without citations', () => {
      const keys = extractKeys('No citations here.');
      expect(keys.size).toBe(0);
    });

    test('deduplicates repeated keys', () => {
      const keys = extractKeys('[@hegel1807] and later [@hegel1807].');
      expect(keys.size).toBe(1);
    });
  });

  describe('fuzzyMatchCitation', () => {
    let fuzzyMatch;

    const dbCitations = [
      {
        citation_key: 'Magee2026DramaMachine',
        authors: 'Magee, Liam and Arora, S. and Gollings, T. and Lam, K. and Saw, J.',
        title: 'The Drama Machine: Simulating Character Development',
        publication_year: 2026
      },
      {
        citation_key: 'Karpathy2025BuildingGPT',
        authors: 'Karpathy, Andrej',
        title: 'How to Build a GPT from Scratch',
        publication_year: 2025
      },
      {
        citation_key: 'Vaswani2017Attention',
        authors: 'Vaswani, Ashish and Shazeer, Noam and Parmar, Niki',
        title: 'Attention Is All You Need',
        publication_year: 2017
      },
      {
        citation_key: 'Gullett2025TeachingDialectic',
        authors: 'Gullett, David',
        title: 'Teaching Dialectic in the Digital Age',
        publication_year: 2025
      }
    ];

    beforeEach(() => {
      const exportHandlers = require('../../../ipc/exportHandlers');
      fuzzyMatch = exportHandlers.__test__.fuzzyMatchCitation;
    });

    test('matches multi-author key to first-author DB entry', () => {
      const match = fuzzyMatch('MageeAroraGollingsLamSaw2024DramaMachine', dbCitations);
      expect(match).not.toBeNull();
      expect(match.citation_key).toBe('Magee2026DramaMachine');
    });

    test('matches Zotero-style underscore key', () => {
      const match = fuzzyMatch('andrej_karpathy_how_2025', dbCitations);
      expect(match).not.toBeNull();
      expect(match.citation_key).toBe('Karpathy2025BuildingGPT');
    });

    test('matches lowercase mashed author+title key', () => {
      const match = fuzzyMatch('ashishvaswani2017attentionis', dbCitations);
      expect(match).not.toBeNull();
      expect(match.citation_key).toBe('Vaswani2017Attention');
    });

    test('matches key with incomplete title suffix', () => {
      const match = fuzzyMatch('Gullett2025teaching', dbCitations);
      expect(match).not.toBeNull();
      expect(match.citation_key).toBe('Gullett2025TeachingDialectic');
    });

    test('returns null for a completely unrecognizable key', () => {
      const match = fuzzyMatch('unknownkey9999', dbCitations);
      expect(match).toBeNull();
    });

    test('does not match when only the year matches', () => {
      const match = fuzzyMatch('somebody2025something', dbCitations);
      // Should not match: year alone is not enough (score < 10)
      expect(match).toBeNull();
    });
  });
});

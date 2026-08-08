/**
 * Smart Autocomplete
 * Provides context-aware word and phrase completions from document content,
 * including headings, bibliography entries, cross-references, and recently typed words.
 *
 * @module smart-autocomplete
 */

(function () {
  'use strict';

  const MIN_WORD_LENGTH = 3;
  const MAX_SUGGESTIONS = 12;
  let registered = false;

  function registerProvider() {
    if (registered || typeof monaco === 'undefined') return;
    registered = true;

    monaco.languages.registerCompletionItemProvider('markdown', {
      triggerCharacters: ['@', '[', '#', '\\'],
      provideCompletionItems(model, position) {
        const textUntilPos = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        });

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        };

        const suggestions = [];

        // Cross-reference completions: [[
        if (textUntilPos.endsWith('[[') || textUntilPos.match(/\[\[[^\]]*$/)) {
          const headings = extractHeadings(model);
          headings.forEach(h => {
            suggestions.push({
              label: h.text,
              kind: monaco.languages.CompletionItemKind.Reference,
              insertText: h.text + ']]',
              detail: `H${h.level} heading`,
              range
            });
          });
          return { suggestions };
        }

        // Citation completions: [@
        if (textUntilPos.endsWith('[@') || textUntilPos.match(/@[\w-]*$/)) {
          const citations = extractCitationKeys(model);
          citations.forEach(key => {
            suggestions.push({
              label: key,
              kind: monaco.languages.CompletionItemKind.Value,
              insertText: key,
              detail: 'Citation key',
              range
            });
          });
          if (suggestions.length > 0) return { suggestions };
        }

        // Footnote completions: [^
        if (textUntilPos.match(/\[\^[\w]*$/)) {
          const footnotes = extractFootnoteIds(model);
          footnotes.forEach(id => {
            suggestions.push({
              label: id,
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: id + ']',
              detail: 'Footnote',
              range
            });
          });
          if (suggestions.length > 0) return { suggestions };
        }

        // Context-aware word completions
        if (word.word.length >= MIN_WORD_LENGTH) {
          const prefix = word.word.toLowerCase();
          const contextWords = extractContextWords(model, position, prefix);
          contextWords.forEach(w => {
            suggestions.push({
              label: w.word,
              kind: monaco.languages.CompletionItemKind.Text,
              insertText: w.word,
              detail: w.source,
              sortText: String(w.distance).padStart(5, '0'),
              range
            });
          });
        }

        return { suggestions };
      }
    });
  }

  /**
   * Extract all headings from the document.
   */
  function extractHeadings(model) {
    const headings = [];
    const lineCount = model.getLineCount();
    for (let i = 1; i <= lineCount; i++) {
      const line = model.getLineContent(i);
      const match = line.match(/^(#{1,6})\s+(.+)/);
      if (match) {
        headings.push({ level: match[1].length, text: match[2].trim(), line: i });
      }
    }
    return headings;
  }

  /**
   * Extract citation keys from bibliography blocks or inline citations.
   */
  function extractCitationKeys(model) {
    const text = model.getValue();
    const keys = new Set();

    // BibTeX keys: @article{key, ...
    const bibtexRe = /@\w+\{([^,\s]+)/g;
    let m;
    while ((m = bibtexRe.exec(text)) !== null) {
      keys.add(m[1]);
    }

    // Inline citation keys: [@key] or @key
    const citeRe = /(?:\[)?@([\w][\w:.#$%&\-+?<>~/]*)/g;
    while ((m = citeRe.exec(text)) !== null) {
      if (m[1].length > 1) keys.add(m[1]);
    }

    return Array.from(keys);
  }

  /**
   * Extract footnote IDs from [^id]: definitions.
   */
  function extractFootnoteIds(model) {
    const ids = new Set();
    const lineCount = model.getLineCount();
    for (let i = 1; i <= lineCount; i++) {
      const line = model.getLineContent(i);
      const match = line.match(/^\[\^(\w+)\]:/);
      if (match) ids.add(match[1]);
    }
    return Array.from(ids);
  }

  /**
   * Extract context-aware word completions, favoring nearby words.
   */
  function extractContextWords(model, position, prefix) {
    const seen = new Set();
    const results = [];
    const text = model.getValue();
    const currentLine = position.lineNumber;

    // Extract all words
    const wordRe = /\b([a-zA-Z][\w'-]{2,})\b/g;
    let match;
    const allWords = [];
    let charIndex = 0;
    const lines = text.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const lineText = lines[lineNum];
      while ((match = wordRe.exec(lineText)) !== null) {
        allWords.push({
          word: match[1],
          line: lineNum + 1,
          distance: Math.abs(lineNum + 1 - currentLine)
        });
      }
      wordRe.lastIndex = 0;
    }

    // Filter by prefix and sort by proximity
    allWords
      .filter(w => w.word.toLowerCase().startsWith(prefix) && w.word.toLowerCase() !== prefix)
      .sort((a, b) => a.distance - b.distance)
      .forEach(w => {
        const lower = w.word.toLowerCase();
        if (!seen.has(lower) && results.length < MAX_SUGGESTIONS) {
          seen.add(lower);
          results.push({
            word: w.word,
            distance: w.distance,
            source: w.distance === 0 ? 'current line' : `${w.distance} line${w.distance > 1 ? 's' : ''} away`
          });
        }
      });

    return results;
  }

  function init() {
    // Wait for Monaco to be available
    const check = setInterval(() => {
      if (typeof monaco !== 'undefined') {
        clearInterval(check);
        registerProvider();
      }
    }, 500);
    setTimeout(() => clearInterval(check), 15000);

    if (typeof window.registerCommand === 'function') {
      window.registerCommand(
        'autocomplete.info',
        'Smart Autocomplete: Info',
        () => {
          if (window.showNotification) {
            window.showNotification('Smart autocomplete active: headings, citations, footnotes, and context words', 'info');
          }
        }
      );
    }
  }

  window.smartAutocomplete = { registerProvider };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }
})();

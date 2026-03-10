/**
 * Proofreader Module
 * Unified spell checking, grammar checking, and AI-powered style analysis.
 *
 * Three tiers of checking:
 * 1. Spelling — nspell (Hunspell) via IPC, red squiggly underline
 * 2. Grammar — write-good via IPC, yellow squiggly underline
 * 3. AI Style — LLM analysis via ai-chat IPC, blue dotted underline
 *
 * Toggle: command palette "Proofreader: Toggle"
 *
 * @module proofreader
 */

(function () {
  'use strict';

  // ── State ──

  let enabled = false;
  let spellDecoIds = [];
  let grammarDecoIds = [];
  let styleDecoIds = [];
  let changeListener = null;
  let checkTimer = null;
  let checkGeneration = 0;          // incremented each check; stale results discarded
  let customDictionary = new Set();       // flat set of lowercase words (legacy compat)
  let categorizedDict = {};               // { authors: Set, acronyms: Set, terms: Set, general: Set }
  let knownCorrect = new Set();           // cache of words confirmed correct by nspell
  let currentIssues = { spelling: [], grammar: [], style: [] };
  let issuesPanelEl = null;
  let aiStyleRunning = false;

  const STORAGE_KEY = 'nightowl-custom-dictionary';
  const CAT_DICT_KEY = 'nightowl-categorized-dictionary';
  const PREFS_KEY = 'nightowl-proofreader-prefs';
  const CHECK_DELAY = 1500; // ms after last edit
  const WORD_RE = /[a-zA-Z'\u2019]{2,}/; // source-only pattern; always use new RegExp(WORD_RE.source, 'g')

  // Tokens to skip during spell check (code, markdown syntax, tech terms)
  const SKIP_PATTERNS = /^(https?|www|github|npm|src|const|let|var|function|return|import|export|async|await|true|false|null|undefined|class|extends|constructor|typeof|instanceof|console|window|document|Math|JSON|Array|Object|String|Number|Boolean|Date|Error|Promise|Map|Set|RegExp|jsx|tsx|css|html|svg|png|jpg|gif|pdf|json|yaml|toml|xml|sql|py|rb|rs|cpp|hpp|java|php|sh|zsh|bash|git|diff|merge|rebase|commit|push|pull|fetch|clone|init|reset|stash|README|TODO|CHANGELOG|LICENSE|Makefile|Dockerfile|eslint|prettier|webpack|babel|jest|mocha|react|vue|angular|svelte|redux|graphql|oauth|jwt|csrf|cors|api|sdk|cli|url|dom|rgb|rgba|hsl|hex|rem|px|em|vw|vh|cpu|gpu|ram|ssd|macos|linux|ubuntu|posix|ascii|utf|ieee|ecma|localhost|nspell|hunspell|IPC|ipcMain|ipcRenderer|ctx|req|res|btn|img|svg|npm|npx|Ctrl|Cmd|Shift|Alt|Fn|Tab|Esc)$/i;

  /**
   * Detect whether a word is an all-caps acronym (e.g., UNESCO, NATO, AI, LLM).
   * Requires 2+ uppercase letters, optionally with digits (HTTP2, H264).
   */
  function isAcronym(word) {
    return /^[A-Z][A-Z0-9]{1,}$/.test(word);
  }

  /**
   * Detect whether a word looks like a proper noun / name.
   * Capitalized first letter, rest lowercase, at least 3 chars.
   * Won't match sentence-start words — caller should check position.
   */
  function looksLikeProperNoun(word) {
    return /^[A-Z][a-z]{2,}$/.test(word);
  }

  // ── Preferences ──

  function loadPrefs() {
    try {
      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) { /* ignore */ }
    return { spellEnabled: true, grammarEnabled: true, styleEnabled: false };
  }

  function savePrefs(prefs) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
  }

  let prefs = loadPrefs();

  // ── Custom Dictionary ──

  function loadCustomDictionary() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) customDictionary = new Set(JSON.parse(stored));
    } catch (e) { /* ignore */ }
  }

  function saveCustomDictionary() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...customDictionary]));
    } catch (e) { /* ignore */ }
  }

  // ── Citation / footnote exclusion ──

  /**
   * Patterns that mark "citation zones" — character ranges on a line
   * where no spell/grammar checking should occur.
   *
   * Covers Pandoc citations, footnote refs, inline footnotes, BibTeX keys,
   * bare @-keys, footnote definitions, and DOIs.
   */
  const CITATION_PATTERNS = [
    /\[(?:[^\]]*)?@[\w\-]+(?:[,;][^\]]*)*\]/g,   // [@key], [@k1; @k2], [see @k, p. 42], [-@k]
    /\[\^[^\]]+\](?::.*)?/g,                       // [^1], [^note], [^id]: definition...
    /\^\[(?:[^\[\]]*|\[[^\]]*\])*\]/g,             // ^[inline footnote]
    /@[\w][\w\-]*/g,                               // bare @citation-key anywhere
    /\b10\.\d{4,}\/[^\s]+/g,                       // DOIs (10.1234/...)
    /\{[^}]*\}/g,                                  // BibTeX field values {like this}
  ];

  /**
   * Build a sorted list of [start, end) exclusion ranges for a line.
   * Any word whose position falls inside an exclusion range is skipped.
   */
  function getCitationExclusions(line) {
    const zones = [];
    for (const pattern of CITATION_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      let m;
      while ((m = re.exec(line)) !== null) {
        zones.push([m.index, m.index + m[0].length]);
      }
    }
    // Sort by start offset (for binary-search later, though linear is fine for typical line lengths)
    zones.sort((a, b) => a[0] - b[0]);
    return zones;
  }

  function isInsideExclusion(pos, zones) {
    for (const [start, end] of zones) {
      if (pos >= start && pos < end) return true;
      if (start > pos) break; // sorted, no need to check further
    }
    return false;
  }

  // ── Single-pass document extraction ──

  /**
   * Parse the document once, producing:
   *  - wordPositions: Map<word, [{startLine, startCol, endLine, endCol}]>
   *  - grammarText: combined prose string for write-good
   *  - grammarLineStarts: offset→line mapping for grammar results
   *
   * Both spell and grammar checking consume this shared result.
   */
  function parseDocument(model) {
    const totalLines = model.getLineCount();
    const wordPositions = new Map();
    let inCodeBlock = false;
    let inFrontMatter = false;
    let inFootnoteDef = false; // multi-line footnote definitions

    // Grammar: offset-preserving prose + line mapping
    let grammarText = '';
    const grammarLineStarts = [];

    for (let lineNum = 1; lineNum <= totalLines; lineNum++) {
      const line = model.getLineContent(lineNum);
      const trimmed = line.trim();

      // Front matter
      if (lineNum === 1 && trimmed === '---') { inFrontMatter = true; continue; }
      if (inFrontMatter) { if (trimmed === '---') inFrontMatter = false; continue; }

      // Code blocks
      if (/^```/.test(trimmed)) { inCodeBlock = !inCodeBlock; continue; }
      if (inCodeBlock) continue;

      // Footnote definitions: [^id]: ... (may span multiple indented lines)
      if (/^\[\^[^\]]+\]:/.test(trimmed)) { inFootnoteDef = true; continue; }
      if (inFootnoteDef) {
        // Continuation lines are indented (4 spaces or 1 tab)
        if (/^(\s{4}|\t)/.test(line) && trimmed.length > 0) continue;
        inFootnoteDef = false;
      }

      // Tables
      if (/^\|.*\|$/.test(trimmed)) continue;

      // Build citation exclusion zones for this line
      const citationZones = getCitationExclusions(line);

      // ── Spell: extract words + positions from original line ──
      const re = new RegExp(WORD_RE.source, 'g');
      let m;
      while ((m = re.exec(line)) !== null) {
        const raw = m[0].replace(/^['\u2019]+|['\u2019]+$/g, '');
        if (raw.length < 2 || SKIP_PATTERNS.test(raw) || isAcronym(raw)) continue;

        // Skip words inside citation/footnote zones
        if (citationZones.length > 0 && isInsideExclusion(m.index, citationZones)) continue;

        // Skip words inside inline code spans
        const before = line.slice(0, m.index);
        if ((before.match(/`/g) || []).length % 2 === 1) continue;

        if (!wordPositions.has(raw)) wordPositions.set(raw, []);
        wordPositions.get(raw).push({
          startLine: lineNum,
          startCol: m.index + 1,
          endLine: lineNum,
          endCol: m.index + 1 + m[0].length
        });
      }

      // ── Grammar: offset-preserving cleaned line ──
      if (trimmed.length >= 8) {
        // Replace citations/footnotes with spaces (preserve offsets)
        let cleaned = line;
        for (const pattern of CITATION_PATTERNS) {
          cleaned = cleaned.replace(new RegExp(pattern.source, pattern.flags), s => ' '.repeat(s.length));
        }
        cleaned = cleaned
          .replace(/`[^`]+`/g, s => ' '.repeat(s.length))
          .replace(/\[([^\]]*)\]\([^)]*\)/g, (s, label) => label + ' '.repeat(s.length - label.length))
          .replace(/!\[([^\]]*)\]\([^)]*\)/g, s => ' '.repeat(s.length))
          .replace(/https?:\/\/\S+/g, s => ' '.repeat(s.length))
          .replace(/<[^>]+>/g, s => ' '.repeat(s.length))
          .replace(/^#+\s*/g, s => ' '.repeat(s.length))
          .replace(/\*\*|__|~~|\*|_/g, s => ' '.repeat(s.length));

        grammarLineStarts.push({ offset: grammarText.length, lineNum, original: line });
        grammarText += cleaned + '\n';
      }
    }

    return { wordPositions, grammarText, grammarLineStarts };
  }

  // ── Spell Check ──

  /**
   * Run spell check. Uses pre-parsed wordPositions so no re-scanning.
   * Only sends unknown words to IPC; cached correct words are skipped.
   * Suggestions are fetched lazily (not in the batch call).
   */
  async function runSpellCheck(wordPositions) {
    if (!window.electronAPI) return [];

    // Build list of unique words that need checking
    const toCheck = [];
    for (const word of wordPositions.keys()) {
      if (isInCustomDictionary(word)) continue;
      if (knownCorrect.has(word.toLowerCase())) continue;
      toCheck.push(word);
    }

    if (toCheck.length === 0) return [];

    try {
      // IPC: only calls correct(), NOT suggest() — fast batch
      const result = await window.electronAPI.invoke('spell-check-words', { words: toCheck });
      if (!result.success) return [];

      // Cache newly confirmed-correct words
      for (const word of toCheck) {
        if (!result.misspelled.includes(word)) {
          knownCorrect.add(word.toLowerCase());
        }
      }

      const issues = [];
      for (const word of result.misspelled) {
        if (isInCustomDictionary(word)) continue;
        const suggestions = result.results[word] || [];
        const positions = wordPositions.get(word) || [];
        for (const pos of positions) {
          issues.push({
            type: 'spelling',
            word,
            suggestions,
            message: `Misspelled: "${word}"`,
            ...pos
          });
        }
      }
      return issues;
    } catch (e) {
      console.warn('[Proofreader] Spell check IPC error:', e.message);
      return [];
    }
  }

  // ── Grammar Check ──

  /**
   * Run grammar check on pre-parsed grammarText. Single IPC call.
   */
  async function runGrammarCheck(grammarText, grammarLineStarts) {
    if (!window.electronAPI || !grammarText || grammarText.length < 10) return [];

    try {
      const result = await window.electronAPI.invoke('grammar-check-text', { text: grammarText });
      if (!result.success || !result.suggestions) return [];

      const issues = [];
      for (const suggestion of result.suggestions) {
        const absStart = suggestion.index;

        // Binary search for the line this offset falls on
        let lo = 0, hi = grammarLineStarts.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (grammarLineStarts[mid].offset <= absStart) lo = mid;
          else hi = mid - 1;
        }
        const targetLine = grammarLineStarts[lo];

        const localCol = absStart - targetLine.offset;
        const problemText = grammarText.substring(absStart, absStart + suggestion.offset);

        if (localCol + suggestion.offset > (targetLine.original.length + 1)) continue;

        issues.push({
          type: 'grammar',
          word: problemText.replace(/\n/g, ' ').trim(),
          message: suggestion.reason,
          suggestions: [],
          startLine: targetLine.lineNum,
          startCol: localCol + 1,
          endLine: targetLine.lineNum,
          endCol: Math.min(localCol + 1 + suggestion.offset, targetLine.original.length + 1)
        });
      }

      return issues;
    } catch (e) {
      console.warn('[Proofreader] Grammar check IPC error:', e.message);
      return [];
    }
  }

  // ── AI Style Check ──

  /**
   * Run AI-powered style analysis on the document.
   * Returns issues with line numbers and suggestions.
   */
  async function runAIStyleCheck() {
    if (!window.editor || !window.electronAPI) return [];
    if (aiStyleRunning) return [];

    const model = window.editor.getModel();
    if (!model) return [];

    const text = model.getValue();
    if (text.trim().length < 50) return [];

    aiStyleRunning = true;

    // Truncate very long documents for the AI
    const excerpt = text.length > 6000 ? text.slice(0, 6000) + '\n...[truncated]' : text;

    try {
      const result = await window.electronAPI.invoke('ai-chat', {
        messages: [{
          role: 'user',
          content: `You are a precise writing style analyzer. Analyze the following markdown text and identify specific style issues.

For each issue, output EXACTLY one line in this format:
LINE:<number>|TEXT:<exact problematic text>|ISSUE:<brief description>|FIX:<suggested improvement>

Categories to check:
- Passive voice constructions
- Unnecessarily complex words (use simpler alternatives)
- Redundant phrases
- Vague or weak language
- Overly long sentences (>35 words)
- Inconsistent tone or register
- Clichés and overused expressions
- Nominalizations (verb→noun conversions that reduce clarity)

Rules:
- Only report genuine issues, not stylistic preferences
- Maximum 15 issues
- LINE numbers must match the actual text
- TEXT must be an exact substring from that line
- Keep FIX suggestions concise (the rewritten phrase only)
- Skip code blocks, front matter, and URLs

Text to analyze:
${excerpt}`
        }],
        systemMessage: 'You are a writing style analyzer. Output only the issue lines in the specified format. No preamble, no summary.'
      });

      if (!result || !result.content) return [];

      const issues = [];
      const responseLines = result.content.split('\n');

      for (const rline of responseLines) {
        const match = rline.match(/^LINE:(\d+)\|TEXT:(.+?)\|ISSUE:(.+?)\|FIX:(.+)$/);
        if (!match) continue;

        const lineNum = parseInt(match[1], 10);
        const problemText = match[2].trim();
        const issue = match[3].trim();
        const fix = match[4].trim();

        if (lineNum < 1 || lineNum > model.getLineCount()) continue;

        // Find the text on the specified line
        const lineContent = model.getLineContent(lineNum);
        const colIdx = lineContent.indexOf(problemText);
        if (colIdx === -1) continue; // AI hallucinated the text — skip

        issues.push({
          type: 'style',
          word: problemText,
          message: issue,
          suggestions: [fix],
          startLine: lineNum,
          startCol: colIdx + 1,
          endLine: lineNum,
          endCol: colIdx + 1 + problemText.length
        });
      }

      return issues;
    } catch (e) {
      console.warn('[Proofreader] AI style check failed:', e.message);
      return [];
    } finally {
      aiStyleRunning = false;
    }
  }

  // ── Monaco Decorations ──

  function applyDecorations(issues, type) {
    if (!window.editor) return [];

    const classMap = {
      spelling: 'proofread-spelling',
      grammar: 'proofread-grammar',
      style: 'proofread-style'
    };

    const decos = issues.map(issue => ({
      range: new monaco.Range(issue.startLine, issue.startCol, issue.endLine, issue.endCol),
      options: {
        inlineClassName: classMap[type] || classMap.spelling,
        hoverMessage: {
          value: buildHoverMessage(issue)
        },
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      }
    }));

    return decos;
  }

  function buildHoverMessage(issue) {
    const icons = { spelling: '🔤', grammar: '📝', style: '✨' };
    const icon = icons[issue.type] || '📝';
    let msg = `${icon} **${issue.type.charAt(0).toUpperCase() + issue.type.slice(1)}**: ${issue.message}`;

    if (issue.suggestions && issue.suggestions.length > 0) {
      msg += `\n\nSuggestions: ${issue.suggestions.slice(0, 5).map(s => `\`${s}\``).join(', ')}`;
    }

    return msg;
  }

  // ── Main Check Orchestration ──

  async function runFullCheck() {
    if (!enabled || !window.editor) return;

    const gen = ++checkGeneration;
    const model = window.editor.getModel();
    if (!model) return;

    // Single-pass document parse (shared by spell + grammar)
    const { wordPositions, grammarText, grammarLineStarts } = parseDocument(model);

    // Run spell + grammar in parallel over the shared parse result
    const [spellIssues, grammarIssues] = await Promise.all([
      prefs.spellEnabled ? runSpellCheck(wordPositions) : Promise.resolve([]),
      prefs.grammarEnabled ? runGrammarCheck(grammarText, grammarLineStarts) : Promise.resolve([])
    ]);

    // Discard if a newer check was started while we awaited IPC
    if (gen !== checkGeneration) return;

    currentIssues.spelling = spellIssues;
    currentIssues.grammar = grammarIssues;

    // Apply decorations
    const spellDecos = applyDecorations(spellIssues, 'spelling');
    const grammarDecos = applyDecorations(grammarIssues, 'grammar');

    spellDecoIds = window.editor.deltaDecorations(spellDecoIds, spellDecos);
    grammarDecoIds = window.editor.deltaDecorations(grammarDecoIds, grammarDecos);

    // Update issues panel if open
    updateIssuesPanel();
  }

  async function runStyleCheck() {
    if (!enabled || !window.editor) return;

    const gen = checkGeneration;
    const styleIssues = await runAIStyleCheck();

    // Discard if document changed while AI was running
    if (gen !== checkGeneration) return;

    currentIssues.style = styleIssues;

    const styleDecos = applyDecorations(styleIssues, 'style');
    styleDecoIds = window.editor.deltaDecorations(styleDecoIds, styleDecos);

    updateIssuesPanel();
  }

  // ── Issues Panel ──

  function showIssuesPanel() {
    if (issuesPanelEl) { removeIssuesPanel(); return; }

    issuesPanelEl = document.createElement('div');
    issuesPanelEl.id = 'proofreader-panel';
    issuesPanelEl.innerHTML = buildPanelHTML();

    document.body.appendChild(issuesPanelEl);
    bindPanelEvents();
  }

  function removeIssuesPanel() {
    if (issuesPanelEl) {
      issuesPanelEl.remove();
      issuesPanelEl = null;
    }
  }

  function updateIssuesPanel() {
    if (!issuesPanelEl) return;
    const content = issuesPanelEl.querySelector('.proofread-panel-content');
    if (content) content.innerHTML = buildIssuesListHTML();
    bindIssueClickHandlers();
  }

  function buildPanelHTML() {
    const total = currentIssues.spelling.length + currentIssues.grammar.length + currentIssues.style.length;

    return `
      <div class="proofread-panel-header">
        <div class="proofread-panel-title">
          <span>Proofreader</span>
          <span class="proofread-badge">${total}</span>
        </div>
        <div class="proofread-panel-actions">
          <button class="proofread-btn proofread-btn-ai" title="Run AI Style Analysis">AI Style</button>
          <button class="proofread-btn proofread-btn-recheck" title="Recheck Document">Recheck</button>
          <button class="proofread-btn proofread-btn-settings" title="Settings">Settings</button>
          <button class="proofread-btn proofread-btn-close" title="Close">&times;</button>
        </div>
      </div>
      <div class="proofread-panel-toggles">
        <label><input type="checkbox" id="proofread-toggle-spell" ${prefs.spellEnabled ? 'checked' : ''}> Spelling</label>
        <label><input type="checkbox" id="proofread-toggle-grammar" ${prefs.grammarEnabled ? 'checked' : ''}> Grammar</label>
        <label><input type="checkbox" id="proofread-toggle-style" ${prefs.styleEnabled ? 'checked' : ''}> AI Style</label>
      </div>
      <div class="proofread-panel-content">
        ${buildIssuesListHTML()}
      </div>
    `;
  }

  function buildIssuesListHTML() {
    const allIssues = [
      ...currentIssues.spelling.map(i => ({ ...i, _type: 'spelling' })),
      ...currentIssues.grammar.map(i => ({ ...i, _type: 'grammar' })),
      ...currentIssues.style.map(i => ({ ...i, _type: 'style' }))
    ].sort((a, b) => a.startLine - b.startLine || a.startCol - b.startCol);

    if (allIssues.length === 0) {
      return '<div class="proofread-empty">No issues found.</div>';
    }

    return allIssues.map((issue, idx) => {
      const icons = { spelling: '🔤', grammar: '📝', style: '✨' };
      const icon = icons[issue._type] || '📝';
      const suggestions = issue.suggestions || [];
      const topSuggestion = suggestions[0];
      const altSuggestions = suggestions.slice(1, 5);

      return `
        <div class="proofread-issue proofread-issue-${issue._type}"
             data-idx="${idx}" data-line="${issue.startLine}" data-col="${issue.startCol}"
             data-end-line="${issue.endLine}" data-end-col="${issue.endCol}"
             data-word="${esc(issue.word)}" data-type="${issue._type}">
          <div class="proofread-issue-header">
            <span class="proofread-issue-icon">${icon}</span>
            <span class="proofread-issue-word">${esc(issue.word)}</span>
            <span class="proofread-issue-location">L${issue.startLine}</span>
            ${issue._type === 'spelling' ? `
              <button class="proofread-btn-add-dict" data-word="${esc(issue.word)}" data-cat="${detectCategory(issue.word)}" title="Add to ${DICT_CATEGORIES[detectCategory(issue.word)].label}">+${DICT_CATEGORIES[detectCategory(issue.word)].icon}</button>
            ` : ''}
          </div>
          <div class="proofread-issue-message">${esc(issue.message)}</div>
          ${topSuggestion ? `
            <div class="proofread-issue-fix-row">
              <button class="proofread-fix-btn"
                      data-line="${issue.startLine}" data-col="${issue.startCol}"
                      data-end-line="${issue.endLine}" data-end-col="${issue.endCol}"
                      data-replacement="${esc(topSuggestion)}">Fix: <strong>${esc(topSuggestion)}</strong></button>
              ${altSuggestions.map(s =>
                `<button class="proofread-suggestion-btn"
                         data-line="${issue.startLine}" data-col="${issue.startCol}"
                         data-end-line="${issue.endLine}" data-end-col="${issue.endCol}"
                         data-replacement="${esc(s)}">${esc(s)}</button>`
              ).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  function bindPanelEvents() {
    if (!issuesPanelEl) return;

    issuesPanelEl.querySelector('.proofread-btn-close').addEventListener('click', removeIssuesPanel);
    issuesPanelEl.querySelector('.proofread-btn-recheck').addEventListener('click', () => runFullCheck());
    issuesPanelEl.querySelector('.proofread-btn-ai').addEventListener('click', async () => {
      const btn = issuesPanelEl.querySelector('.proofread-btn-ai');
      btn.textContent = 'Analyzing...';
      btn.disabled = true;
      await runStyleCheck();
      btn.textContent = 'AI Style';
      btn.disabled = false;
    });

    // Toggle checkboxes
    const toggleSpell = issuesPanelEl.querySelector('#proofread-toggle-spell');
    const toggleGrammar = issuesPanelEl.querySelector('#proofread-toggle-grammar');
    const toggleStyle = issuesPanelEl.querySelector('#proofread-toggle-style');

    if (toggleSpell) toggleSpell.addEventListener('change', (e) => {
      prefs.spellEnabled = e.target.checked;
      savePrefs(prefs);
      if (!prefs.spellEnabled) {
        currentIssues.spelling = [];
        spellDecoIds = window.editor.deltaDecorations(spellDecoIds, []);
      }
      runFullCheck();
    });
    if (toggleGrammar) toggleGrammar.addEventListener('change', (e) => {
      prefs.grammarEnabled = e.target.checked;
      savePrefs(prefs);
      if (!prefs.grammarEnabled) {
        currentIssues.grammar = [];
        grammarDecoIds = window.editor.deltaDecorations(grammarDecoIds, []);
      }
      runFullCheck();
    });
    if (toggleStyle) toggleStyle.addEventListener('change', (e) => {
      prefs.styleEnabled = e.target.checked;
      savePrefs(prefs);
      if (!prefs.styleEnabled) {
        currentIssues.style = [];
        styleDecoIds = window.editor.deltaDecorations(styleDecoIds, []);
      }
    });

    bindIssueClickHandlers();
  }

  function bindIssueClickHandlers() {
    if (!issuesPanelEl) return;

    // Click issue to navigate to it
    issuesPanelEl.querySelectorAll('.proofread-issue').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.proofread-fix-btn') || e.target.closest('.proofread-suggestion-btn') || e.target.closest('.proofread-btn-add-dict')) return;
        const line = parseInt(el.dataset.line, 10);
        const col = parseInt(el.dataset.col, 10);
        if (window.editor && line) {
          window.editor.revealLineInCenter(line);
          window.editor.setPosition({ lineNumber: line, column: col });
          window.editor.focus();
        }
      });
    });

    // Click "Fix" or alternative suggestion to apply replacement
    issuesPanelEl.querySelectorAll('.proofread-fix-btn, .proofread-suggestion-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const line = parseInt(btn.dataset.line, 10);
        const col = parseInt(btn.dataset.col, 10);
        const endLine = parseInt(btn.dataset.endLine, 10);
        const endCol = parseInt(btn.dataset.endCol, 10);
        const replacement = btn.dataset.replacement;
        applyReplacement(line, col, endLine, endCol, replacement);
      });
    });

    // Add to dictionary (with auto-detected category)
    issuesPanelEl.querySelectorAll('.proofread-btn-add-dict').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const word = btn.dataset.word;
        const cat = btn.dataset.cat || undefined;
        if (word) addToDictionary(word, cat);
      });
    });
  }

  function applyReplacement(startLine, startCol, endLine, endCol, replacement) {
    if (!window.editor) return;

    const range = new monaco.Range(startLine, startCol, endLine, endCol);
    window.editor.executeEdits('proofreader', [{
      range,
      text: replacement
    }]);
    window.editor.focus();

    // Recheck after a short delay
    scheduleCheck();
  }

  // ── Categorized Custom Dictionary ──

  const DICT_CATEGORIES = {
    authors:  { label: 'Authors & Names',     icon: '👤', placeholder: 'e.g., Heidegger, Kierkegaard' },
    acronyms: { label: 'Acronyms',            icon: '🔠', placeholder: 'e.g., UNESCO, DARPA, LLM' },
    terms:    { label: 'Neologisms & Terms',   icon: '📖', placeholder: 'e.g., dialectical, affordance' },
    general:  { label: 'General',             icon: '📝', placeholder: 'e.g., miscellaneous words' }
  };

  function initCategorizedDict() {
    for (const cat of Object.keys(DICT_CATEGORIES)) {
      if (!categorizedDict[cat]) categorizedDict[cat] = new Set();
    }
  }

  function loadCategorizedDict() {
    initCategorizedDict();
    try {
      const stored = localStorage.getItem(CAT_DICT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [cat, words] of Object.entries(parsed)) {
          if (categorizedDict[cat]) {
            categorizedDict[cat] = new Set(words);
          }
        }
      }
    } catch (e) { /* ignore */ }
  }

  function saveCategorizedDict() {
    try {
      const serialized = {};
      for (const [cat, wordSet] of Object.entries(categorizedDict)) {
        serialized[cat] = [...wordSet];
      }
      localStorage.setItem(CAT_DICT_KEY, JSON.stringify(serialized));
    } catch (e) { /* ignore */ }
  }

  /**
   * Check if a word is in any custom dictionary (flat legacy + all categories).
   */
  function isInCustomDictionary(word) {
    const lower = word.toLowerCase();
    if (customDictionary.has(lower)) return true;
    for (const wordSet of Object.values(categorizedDict)) {
      if (wordSet.has(lower) || wordSet.has(word)) return true;
    }
    return false;
  }

  /**
   * Auto-detect the best category for a word based on its shape.
   */
  function detectCategory(word) {
    if (isAcronym(word)) return 'acronyms';
    if (looksLikeProperNoun(word)) return 'authors';
    return 'terms';
  }

  function addToDictionary(word, category) {
    if (!word) return;
    initCategorizedDict();

    const cat = category || detectCategory(word);

    // Store with original casing for names, lowercase for general
    const stored = (cat === 'authors' || cat === 'acronyms') ? word : word.toLowerCase();
    categorizedDict[cat].add(stored);
    saveCategorizedDict();

    // Also add to flat legacy set + nspell backend
    customDictionary.add(word.toLowerCase());
    saveCustomDictionary();
    if (window.electronAPI) {
      window.electronAPI.invoke('spell-add-word', { word: word.toLowerCase() });
    }

    // Instant local update: remove issues for this word without full recheck
    if (enabled) {
      removeIssuesForWord(word);
    }

    if (window.showNotification) {
      window.showNotification(`"${word}" added to ${DICT_CATEGORIES[cat].label}`, 'info');
    }
  }

  /**
   * Remove all spelling issues for a specific word instantly (no IPC recheck).
   * Filters the issues list and refreshes decorations from the filtered list.
   */
  function removeIssuesForWord(word) {
    const lower = word.toLowerCase();
    currentIssues.spelling = currentIssues.spelling.filter(
      i => i.word.toLowerCase() !== lower
    );

    // Rebuild spell decorations from the filtered list
    if (window.editor) {
      const decos = applyDecorations(currentIssues.spelling, 'spelling');
      spellDecoIds = window.editor.deltaDecorations(spellDecoIds, decos);
    }

    updateIssuesPanel();
  }

  function removeFromDictionary(word, category) {
    if (!word) return;
    if (category && categorizedDict[category]) {
      categorizedDict[category].delete(word);
      categorizedDict[category].delete(word.toLowerCase());
    }
    customDictionary.delete(word.toLowerCase());
    knownCorrect.delete(word.toLowerCase()); // must recheck this word
    saveCustomDictionary();
    saveCategorizedDict();
    if (window.electronAPI) {
      window.electronAPI.invoke('spell-remove-word', { word: word.toLowerCase() });
    }
    if (enabled) scheduleCheck();
  }

  function showDictionaryManager() {
    const existing = document.getElementById('proofread-dict-dialog');
    if (existing) existing.remove();

    initCategorizedDict();
    loadCategorizedDict();

    const overlay = document.createElement('div');
    overlay.id = 'proofread-dict-dialog';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--bg-color,#1e1e1e);color:var(--text-color,#d4d4d4);border-radius:8px;padding:20px;width:500px;max-height:75vh;overflow-y:auto;font-family:system-ui,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.5);';

    const totalWords = Object.values(categorizedDict).reduce((s, set) => s + set.size, 0) + customDictionary.size;

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 style="margin:0;font-size:16px;">Custom Dictionary</h3>
        <button id="proofread-dict-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:18px;">&times;</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <input id="proofread-dict-input" type="text" placeholder="Add a word..." style="flex:1;background:var(--bg-secondary,#252526);border:1px solid #555;color:#d4d4d4;padding:6px 10px;border-radius:4px;font-size:13px;">
        <select id="proofread-dict-cat" style="background:var(--bg-secondary,#252526);border:1px solid #555;color:#d4d4d4;padding:6px 8px;border-radius:4px;font-size:12px;">
          ${Object.entries(DICT_CATEGORIES).map(([key, meta]) => `<option value="${key}">${meta.icon} ${meta.label}</option>`).join('')}
        </select>
        <button id="proofread-dict-add" style="background:#569cd6;color:#fff;border:none;border-radius:4px;padding:6px 14px;cursor:pointer;font-size:13px;">Add</button>
      </div>
    `;

    // Render each category
    for (const [cat, meta] of Object.entries(DICT_CATEGORIES)) {
      const words = categorizedDict[cat] ? [...categorizedDict[cat]].sort() : [];
      html += `
        <div style="margin-bottom:12px;">
          <div style="font-size:12px;font-weight:600;color:#888;margin-bottom:4px;">${meta.icon} ${meta.label} (${words.length})</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;min-height:24px;">
            ${words.length === 0 ? `<span style="color:#555;font-size:11px;font-style:italic;">${meta.placeholder}</span>` :
              words.map(w =>
                `<span class="proofread-dict-tag" data-word="${esc(w)}" data-cat="${cat}" style="display:inline-flex;align-items:center;gap:3px;background:var(--bg-secondary,#252526);border:1px solid #444;border-radius:3px;padding:2px 6px;font-size:12px;cursor:default;">
                  ${esc(w)}
                  <button class="proofread-dict-remove" data-word="${esc(w)}" data-cat="${cat}" style="background:none;border:none;color:#f48771;cursor:pointer;font-size:10px;padding:0 2px;" title="Remove">&times;</button>
                </span>`
              ).join('')}
          </div>
        </div>
      `;
    }

    // Show orphaned words from legacy flat dictionary that aren't in any category
    const allCatWords = new Set();
    for (const wordSet of Object.values(categorizedDict)) {
      for (const w of wordSet) allCatWords.add(w.toLowerCase());
    }
    const orphaned = [...customDictionary].filter(w => !allCatWords.has(w)).sort();
    if (orphaned.length > 0) {
      html += `
        <div style="margin-bottom:12px;">
          <div style="font-size:12px;font-weight:600;color:#888;margin-bottom:4px;">📋 Uncategorized (${orphaned.length})</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${orphaned.map(w =>
              `<span class="proofread-dict-tag" data-word="${esc(w)}" data-cat="" style="display:inline-flex;align-items:center;gap:3px;background:var(--bg-secondary,#252526);border:1px solid #333;border-radius:3px;padding:2px 6px;font-size:12px;">
                ${esc(w)}
                <button class="proofread-dict-remove" data-word="${esc(w)}" data-cat="" style="background:none;border:none;color:#f48771;cursor:pointer;font-size:10px;padding:0 2px;">&times;</button>
              </span>`
            ).join('')}
          </div>
        </div>
      `;
    }

    dialog.innerHTML = html;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Events
    document.getElementById('proofread-dict-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const input = document.getElementById('proofread-dict-input');
    const catSelect = document.getElementById('proofread-dict-cat');
    const addBtn = document.getElementById('proofread-dict-add');

    // Auto-detect category as user types
    input.addEventListener('input', () => {
      const val = input.value.trim();
      if (val) catSelect.value = detectCategory(val);
    });

    function refreshDialogContent() {
      // Rebuild dialog body without closing/reopening
      overlay.remove();
      showDictionaryManager();
    }

    function doAdd() {
      const word = input.value.trim();
      if (!word) return;
      addToDictionary(word, catSelect.value);
      input.value = '';
      input.focus();
      // Refresh inline — append tag to the right category section
      refreshDialogContent();
    }

    addBtn.addEventListener('click', doAdd);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });

    // Remove buttons
    dialog.querySelectorAll('.proofread-dict-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFromDictionary(btn.dataset.word, btn.dataset.cat || undefined);
        // Remove the tag element instantly
        const tag = btn.closest('.proofread-dict-tag');
        if (tag) tag.remove();
      });
    });

    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
    });

    setTimeout(() => input.focus(), 50);
  }

  // ── Scheduling ──

  function scheduleCheck() {
    if (checkTimer) clearTimeout(checkTimer);
    checkTimer = setTimeout(runFullCheck, CHECK_DELAY);
  }

  /**
   * Called on every content change BEFORE the debounced full recheck.
   * Instantly removes spelling decorations for words the user just fixed,
   * so squiggly lines disappear as soon as the word is corrected.
   */
  function onContentChange(event) {
    // Quick local pass: for each changed range, check if words at that
    // position are now different from the flagged word → remove that issue.
    if (currentIssues.spelling.length > 0 && window.editor) {
      const model = window.editor.getModel();
      if (model) {
        let changed = false;
        currentIssues.spelling = currentIssues.spelling.filter(issue => {
          // Read the current text at this issue's range
          try {
            const currentText = model.getValueInRange(
              new monaco.Range(issue.startLine, issue.startCol, issue.endLine, issue.endCol)
            );
            // If the text at this position no longer matches the flagged word, remove the issue
            if (currentText !== issue.word) {
              changed = true;
              return false;
            }
          } catch (e) {
            // Range may be invalid after edits — remove it
            changed = true;
            return false;
          }
          return true;
        });

        if (changed) {
          const decos = applyDecorations(currentIssues.spelling, 'spelling');
          spellDecoIds = window.editor.deltaDecorations(spellDecoIds, decos);
          updateIssuesPanel();
        }
      }
    }

    // Invalidate the correct-word cache so new/changed words get checked.
    // We don't clear the whole cache on every keystroke — only on full recheck.
    // Schedule the full recheck (debounced)
    scheduleCheck();
  }

  // ── Activation / Deactivation ──

  function activate() {
    if (enabled) return;
    enabled = true;

    loadCustomDictionary();
    loadCategorizedDict();

    if (window.editor) {
      changeListener = window.editor.onDidChangeModelContent(onContentChange);
      runFullCheck();
    }

    if (window.showNotification) {
      window.showNotification('Proofreader enabled', 'info');
    }
  }

  function deactivate() {
    if (!enabled) return;
    enabled = false;

    if (checkTimer) { clearTimeout(checkTimer); checkTimer = null; }
    if (changeListener) { changeListener.dispose(); changeListener = null; }

    if (window.editor) {
      spellDecoIds = window.editor.deltaDecorations(spellDecoIds, []);
      grammarDecoIds = window.editor.deltaDecorations(grammarDecoIds, []);
      styleDecoIds = window.editor.deltaDecorations(styleDecoIds, []);
    }

    currentIssues = { spelling: [], grammar: [], style: [] };
    removeIssuesPanel();

    if (window.showNotification) {
      window.showNotification('Proofreader disabled', 'info');
    }
  }

  function toggle() {
    if (enabled) deactivate(); else activate();
  }

  // ── Utilities ──

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Status Bar ──

  function getStatusText() {
    if (!enabled) return '';
    const total = currentIssues.spelling.length + currentIssues.grammar.length + currentIssues.style.length;
    if (total === 0) return 'Proofread: OK';
    return `Proofread: ${total} issue${total !== 1 ? 's' : ''}`;
  }

  // ── Init ──

  function init() {
    console.log('[Proofreader] init() called, registerCommand available:', typeof window.registerCommand === 'function');

    // Register with the command palette (uses registerCommand from commandPalette.js)
    function doRegister() {
      if (typeof window.registerCommand !== 'function') {
        console.warn('[Proofreader] registerCommand not available, retrying in 500ms...');
        setTimeout(doRegister, 500);
        return;
      }
      window.registerCommand('proofread.toggle', 'Proofreader: Toggle', toggle);
      window.registerCommand('proofread.panel', 'Proofreader: Show Issues Panel', () => {
        if (!enabled) activate();
        showIssuesPanel();
      });
      window.registerCommand('proofread.aiStyle', 'Proofreader: Run AI Style Check', () => {
        if (!enabled) activate();
        runStyleCheck();
      });
      window.registerCommand('proofread.recheck', 'Proofreader: Recheck Document', () => {
        if (enabled) runFullCheck();
      });
      window.registerCommand('proofread.dictionary', 'Proofreader: Manage Dictionary', showDictionaryManager);
      window.registerCommand('proofread.addWord', 'Proofreader: Add Word Under Cursor to Dictionary', () => {
        if (!window.editor) return;
        const pos = window.editor.getPosition();
        const model = window.editor.getModel();
        if (!pos || !model) return;
        const wordAtPos = model.getWordAtPosition(pos);
        if (wordAtPos) addToDictionary(wordAtPos.word);
      });
      console.log('[Proofreader] 6 commands registered with command palette');
    }

    doRegister();

    // Register Monaco context menu actions
    function registerEditorActions() {
      if (!window.editor) {
        setTimeout(registerEditorActions, 500);
        return;
      }

      window.editor.addAction({
        id: 'proofreader-add-to-dict',
        label: '📖 Add to Dictionary',
        contextMenuGroupId: 'proofreader',
        contextMenuOrder: 1,
        run: () => {
          const pos = window.editor.getPosition();
          const model = window.editor.getModel();
          if (!pos || !model) return;
          const wordAtPos = model.getWordAtPosition(pos);
          if (wordAtPos) addToDictionary(wordAtPos.word);
        }
      });

      window.editor.addAction({
        id: 'proofreader-show-panel',
        label: '📋 Show Proofreader Panel',
        contextMenuGroupId: 'proofreader',
        contextMenuOrder: 2,
        run: () => {
          if (!enabled) activate();
          showIssuesPanel();
        }
      });
    }

    registerEditorActions();
  }

  // ── Public API ──

  window.proofreader = {
    toggle,
    activate,
    deactivate,
    isEnabled: () => enabled,
    showPanel: showIssuesPanel,
    runStyleCheck,
    recheck: runFullCheck,
    addToDictionary,       // addToDictionary(word, category?) — auto-detects category
    removeFromDictionary,
    showDictionaryManager,
    getIssues: () => currentIssues,
    getStatusText,
    getCategorizedDict: () => categorizedDict,
    DICT_CATEGORIES
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 150);
  }
})();

// === Spell Check & Grammar IPC Handlers ===
// Uses nspell (Hunspell-compatible) for spelling + write-good for grammar

const { ipcMain, session } = require('electron');
const nspell = require('nspell');
const fs = require('fs');
const path = require('path');

let spellChecker = null;
let spellReady = false;
let writeGood = null;

/**
 * Initialize nspell with the English dictionary.
 * Tries dynamic import first (ESM), falls back to reading .aff/.dic files directly.
 */
async function initSpellChecker() {
  if (spellChecker) return;

  try {
    const dictModule = await import('dictionary-en');
    const dict = dictModule.default;
    spellChecker = nspell(dict);
    spellReady = true;
    console.log('[SpellcheckHandlers] nspell initialized with en dictionary (ESM)');
  } catch (esmError) {
    // Fallback: load .aff/.dic files directly
    try {
      const dictDir = path.join(__dirname, '..', 'node_modules', 'dictionary-en');
      const aff = fs.readFileSync(path.join(dictDir, 'index.aff'));
      const dic = fs.readFileSync(path.join(dictDir, 'index.dic'));
      spellChecker = nspell({ aff, dic });
      spellReady = true;
      console.log('[SpellcheckHandlers] nspell initialized with en dictionary (fallback)');
    } catch (fallbackError) {
      console.error('[SpellcheckHandlers] Failed to init nspell:', esmError.message, fallbackError.message);
    }
  }
}

/**
 * Lazy-load write-good (CommonJS).
 */
function getWriteGood() {
  if (!writeGood) {
    try {
      writeGood = require('write-good');
    } catch (e) {
      console.warn('[SpellcheckHandlers] write-good not available:', e.message);
    }
  }
  return writeGood;
}

function register(deps) {
  console.log('[SpellcheckHandlers] Registering spell check & grammar handlers...');

  // Start loading dictionary in background
  initSpellChecker();

  // ── Prefix / suffix / compound handling ──

  const KNOWN_PREFIXES = [
    'pre', 'post', 'non', 'anti', 'co', 're', 'un', 'multi', 'sub',
    'meta', 'inter', 'intra', 'over', 'under', 'semi', 'pseudo', 'quasi',
    'neo', 'self', 'cross', 'counter', 'super', 'ultra', 'mega', 'micro',
    'macro', 'mini', 'para', 'proto', 'trans', 'extra', 'hyper', 'auto',
    'bi', 'tri', 'poly', 'mono', 'omni', 'pan',
  ];

  // Ordinal suffixes attached to numbers: 1st, 2nd, 3rd, 4th, 21st, 100th, etc.
  const ORDINAL_RE = /^\d+(st|nd|rd|th)$/i;

  /**
   * Extended correctness check: tries the word as-is, then falls back to
   * splitting hyphenated compounds and stripping known prefixes.
   */
  function isCorrectExtended(word) {
    // Direct check
    if (spellChecker.correct(word)) return true;

    // Ordinals (19th, 3rd, 21st)
    if (ORDINAL_RE.test(word)) return true;

    // Hyphenated compound: check each part independently
    // Accept known prefixes (pre-, neo-, etc.) as valid parts
    if (word.includes('-')) {
      const parts = word.split('-');
      if (parts.every(p =>
        p.length === 0 ||
        spellChecker.correct(p) ||
        ORDINAL_RE.test(p) ||
        KNOWN_PREFIXES.includes(p.toLowerCase())
      )) {
        return true;
      }
    }

    // Try stripping a known prefix (closed-form: "multimodal" → "modal")
    const lower = word.toLowerCase();
    for (const prefix of KNOWN_PREFIXES) {
      if (lower.startsWith(prefix) && lower.length > prefix.length + 2) {
        const stem = word.slice(prefix.length);
        if (spellChecker.correct(stem) || spellChecker.correct(stem.toLowerCase())) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check an array of words and return the misspelled ones.
   * Suggestions are included only for the first N misspelled words
   * to keep the batch fast. Use 'spell-get-suggestions' for the rest.
   */
  ipcMain.handle('spell-check-words', async (event, { words }) => {
    try {
      if (!spellReady || !spellChecker) {
        await initSpellChecker();
        if (!spellReady) return { success: true, misspelled: [], results: {} };
      }

      const results = {};
      const misspelled = [];
      const SUGGEST_LIMIT = 20;

      for (const word of words) {
        if (!word || word.length < 2) continue;
        if (/^\d+$/.test(word) || /^[^a-zA-Z]/.test(word)) continue;

        if (!isCorrectExtended(word)) {
          misspelled.push(word);
          if (misspelled.length <= SUGGEST_LIMIT) {
            results[word] = spellChecker.suggest(word).slice(0, 5);
          }
        }
      }

      return { success: true, misspelled, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get spelling suggestions for a single word.
   */
  ipcMain.handle('spell-get-suggestions', async (event, { word }) => {
    try {
      if (!spellReady || !spellChecker) {
        return { success: true, suggestions: [] };
      }
      const suggestions = spellChecker.suggest(word).slice(0, 10);
      return { success: true, suggestions };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Run grammar check on text using write-good.
   * Returns an array of { index, offset, reason } objects.
   */
  ipcMain.handle('grammar-check-text', async (event, { text, options }) => {
    try {
      const wg = getWriteGood();
      if (!wg) {
        return { success: false, error: 'write-good not available' };
      }

      const suggestions = wg(text, options || {});
      return { success: true, suggestions };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Add a word to the custom dictionary (both nspell and Electron session).
   */
  ipcMain.handle('spell-add-word', async (event, { word }) => {
    try {
      if (spellChecker) {
        spellChecker.add(word);
      }
      const ses = session.defaultSession;
      ses.addWordToSpellCheckerDictionary(word);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Remove a word from the custom dictionary.
   */
  ipcMain.handle('spell-remove-word', async (event, { word }) => {
    try {
      if (spellChecker) {
        spellChecker.remove(word);
      }
      const ses = session.defaultSession;
      ses.removeWordFromSpellCheckerDictionary(word);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Set spell checker languages.
   */
  ipcMain.handle('spell-set-languages', async (event, { languages }) => {
    try {
      const ses = session.defaultSession;
      ses.setSpellCheckerLanguages(languages);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get available spell checker languages.
   */
  ipcMain.handle('spell-get-languages', async (event) => {
    try {
      const ses = session.defaultSession;
      const available = ses.availableSpellCheckerLanguages;
      const current = ses.getSpellCheckerLanguages();
      return { success: true, available, current };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  /**
   * Get custom dictionary words.
   */
  ipcMain.handle('spell-get-dictionary', async (event) => {
    try {
      const ses = session.defaultSession;
      const words = await ses.listWordsInSpellCheckerDictionary();
      return { success: true, words };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Set default language
  try {
    const ses = session.defaultSession;
    ses.setSpellCheckerLanguages(['en-US']);
  } catch (e) {
    console.warn('[SpellcheckHandlers] Could not set default language:', e.message);
  }

  console.log('[SpellcheckHandlers] Registered spell check & grammar handlers');
}

module.exports = { register };

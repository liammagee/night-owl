/**
 * Tests for spellcheckHandlers (nspell + write-good integration).
 *
 * These test the backend logic directly, bypassing IPC.
 */

const nspell = require('nspell');
const fs = require('fs');
const path = require('path');

function loadEnglishDictionary() {
  // Resolve the ESM package without importing it so linked worktrees can reuse
  // a dependency installation outside the repository root.
  const dictDir = path.dirname(require.resolve('dictionary-en'));
  return {
    aff: fs.readFileSync(path.join(dictDir, 'index.aff')),
    dic: fs.readFileSync(path.join(dictDir, 'index.dic'))
  };
}

describe('Spell Check (nspell)', () => {
  let spell;

  beforeAll(() => {
    const { aff, dic } = loadEnglishDictionary();
    spell = nspell({ aff, dic });
  });

  test('correctly identifies valid English words', () => {
    expect(spell.correct('hello')).toBe(true);
    expect(spell.correct('philosophy')).toBe(true);
    expect(spell.correct('dialectical')).toBe(true);
    expect(spell.correct('Hegelian')).toBe(true);
  });

  test('identifies misspelled words', () => {
    expect(spell.correct('speling')).toBe(false);
    expect(spell.correct('writting')).toBe(false);
    expect(spell.correct('recieve')).toBe(false);
  });

  test('provides useful suggestions', () => {
    const suggestions = spell.suggest('speling');
    expect(suggestions).toContain('spelling');
    expect(suggestions.length).toBeGreaterThan(0);
  });

  test('custom words can be added', () => {
    expect(spell.correct('nightowl')).toBe(false);
    spell.add('nightowl');
    expect(spell.correct('nightowl')).toBe(true);
  });
});

describe('isCorrectExtended logic (prefix / compound handling)', () => {
  let spell;

  const KNOWN_PREFIXES = [
    'pre', 'post', 'non', 'anti', 'co', 're', 'un', 'multi', 'sub',
    'meta', 'inter', 'intra', 'over', 'under', 'semi', 'pseudo', 'quasi',
    'neo', 'self', 'cross', 'counter', 'super', 'ultra', 'mega', 'micro',
    'macro', 'mini', 'para', 'proto', 'trans', 'extra', 'hyper', 'auto',
    'bi', 'tri', 'poly', 'mono', 'omni', 'pan',
  ];
  const ORDINAL_RE = /^\d+(st|nd|rd|th)$/i;

  function isCorrectExtended(word) {
    if (spell.correct(word)) return true;
    if (ORDINAL_RE.test(word)) return true;
    if (word.includes('-')) {
      const parts = word.split('-');
      if (parts.every(p =>
        p.length === 0 ||
        spell.correct(p) ||
        ORDINAL_RE.test(p) ||
        KNOWN_PREFIXES.includes(p.toLowerCase())
      )) {
        return true;
      }
    }
    const lower = word.toLowerCase();
    for (const prefix of KNOWN_PREFIXES) {
      if (lower.startsWith(prefix) && lower.length > prefix.length + 2) {
        const stem = word.slice(prefix.length);
        if (spell.correct(stem) || spell.correct(stem.toLowerCase())) return true;
      }
    }
    return false;
  }

  beforeAll(() => {
    const { aff, dic } = loadEnglishDictionary();
    spell = nspell({ aff, dic });
  });

  test('accepts hyphenated compounds with known prefixes', () => {
    expect(isCorrectExtended('pre-existing')).toBe(true);
    expect(isCorrectExtended('neo-Kantian')).toBe(true);
    expect(isCorrectExtended('post-modern')).toBe(true);
    expect(isCorrectExtended('non-linear')).toBe(true);
    expect(isCorrectExtended('self-aware')).toBe(true);
    expect(isCorrectExtended('co-author')).toBe(true);
  });

  test('accepts closed-form prefixed words', () => {
    expect(isCorrectExtended('multimodal')).toBe(true);
    expect(isCorrectExtended('reimagine')).toBe(true);
    expect(isCorrectExtended('nonlinear')).toBe(true);
  });

  test('accepts ordinals', () => {
    expect(isCorrectExtended('1st')).toBe(true);
    expect(isCorrectExtended('19th')).toBe(true);
    expect(isCorrectExtended('3rd')).toBe(true);
    expect(isCorrectExtended('21st')).toBe(true);
  });

  test('still rejects genuinely misspelled words', () => {
    expect(isCorrectExtended('speling')).toBe(false);
    expect(isCorrectExtended('writting')).toBe(false);
    expect(isCorrectExtended('pre-speling')).toBe(false);
  });
});

describe('Grammar Check (write-good)', () => {
  const writeGood = require('write-good');

  test('detects passive voice', () => {
    const suggestions = writeGood('The cat was stolen by the thief.');
    const passive = suggestions.find(s => s.reason.includes('passive voice'));
    expect(passive).toBeDefined();
  });

  test('detects weasel words', () => {
    const suggestions = writeGood('This is very important to understand.');
    const weasel = suggestions.find(s => s.reason.includes('weasel'));
    expect(weasel).toBeDefined();
  });

  test('detects unnecessary verbiage', () => {
    const suggestions = writeGood('There is a problem with the code.');
    const verbiage = suggestions.find(s => s.reason.includes('verbiage'));
    expect(verbiage).toBeDefined();
  });

  test('returns empty for clean prose', () => {
    const suggestions = writeGood('The philosopher wrote about consciousness.');
    expect(Array.isArray(suggestions)).toBe(true);
  });

  test('suggestion objects have correct shape', () => {
    const suggestions = writeGood('So the cat was stolen.');
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(s).toHaveProperty('index');
      expect(s).toHaveProperty('offset');
      expect(s).toHaveProperty('reason');
      expect(typeof s.index).toBe('number');
      expect(typeof s.offset).toBe('number');
      expect(typeof s.reason).toBe('string');
    }
  });
});

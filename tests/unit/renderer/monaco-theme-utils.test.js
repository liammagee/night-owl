const {
  normalizeHexColor,
  buildMonacoThemeDefinition
} = require('../../../orchestrator/utils/monaco-theme-utils.js');

function mockStyles(vars) {
  return {
    getPropertyValue(name) {
      return vars[name] || '';
    }
  };
}

describe('Monaco Theme Utils Regression', () => {
  test('prefers surface/editor tokens over presentation bg-color token', () => {
    const styles = mockStyles({
      '--bg-color': '#d1fae5', // presentation template green
      '--surface': '#f3eee2',
      '--panel-bg': '#f3eee2',
      '--surface-variant': '#ebe6dc',
      '--text': '#1f2937',
      '--text-muted': '#6b7280',
      '--primary': '#2563eb',
      '--border': '#d1d5db'
    });

    const theme = buildMonacoThemeDefinition('markdown', false, styles);
    expect(theme.colors['editor.background']).toBe('#f3eee2');
    expect(theme.colors['editor.background']).not.toBe('#d1fae5');
  });

  test('uses bg-color as final fallback when surface tokens are missing', () => {
    const styles = mockStyles({
      '--bg-color': '#d1fae5',
      '--text-color': '#111827',
      '--text-muted': '#6b7280',
      '--primary': '#2563eb',
      '--border-color': '#d1d5db'
    });

    const theme = buildMonacoThemeDefinition('markdown', false, styles);
    expect(theme.colors['editor.background']).toBe('#d1fae5');
  });

  test('maps accent token to markdown link color', () => {
    const styles = mockStyles({
      '--surface': '#ffffff',
      '--surface-variant': '#f8fafc',
      '--text': '#0f172a',
      '--text-muted': '#64748b',
      '--primary': '#dc2626',
      '--border': '#e2e8f0'
    });

    const theme = buildMonacoThemeDefinition('markdown', false, styles);
    const linkRule = theme.rules.find((rule) => rule.token === 'string.link');
    expect(linkRule).toBeDefined();
    expect(linkRule.foreground).toBe('dc2626');
  });

  test('uses bibtex-specific token rules for bibtex language', () => {
    const styles = mockStyles({
      '--surface': '#ffffff',
      '--surface-variant': '#f8fafc',
      '--text': '#0f172a',
      '--text-muted': '#64748b',
      '--primary': '#7c3aed',
      '--border': '#e2e8f0'
    });

    const theme = buildMonacoThemeDefinition('bibtex', false, styles);
    const keywordRule = theme.rules.find((rule) => rule.token === 'keyword');
    expect(keywordRule).toBeDefined();
    expect(keywordRule.foreground).toBe('7c3aed');
    expect(keywordRule.fontStyle).toBe('bold');
  });

  test('normalizes shorthand and rgb colors', () => {
    expect(normalizeHexColor('#abc', '#000000')).toBe('#aabbcc');
    expect(normalizeHexColor('rgb(255, 0, 34)', '#000000')).toBe('#ff0022');
  });
});

const contract = require('../../../plugins/techne-theme-manager/theme-contract');
const themes = require('../../../plugins/techne-theme-manager/themes');

describe('Techne theme contract', () => {
  test('all built-in themes pass the versioned semantic and contrast contract', () => {
    const report = contract.validateAll(themes);

    expect(report.themeCount).toBe(12);
    expect(report.failureCount).toBe(0);
    expect(report.results.map(result => result.id)).toEqual(Object.keys(themes));
    expect(report.results.every(result => result.valid)).toBe(true);
  });

  test('reports contrast and accent-family failures with actionable evidence', () => {
    const invalid = {
      ...themes.light,
      name: 'Invalid',
      description: 'Fixture',
      tokens: {
        '--techne-text-muted': '#eeeeee',
        '--techne-accent': '#ff0000',
        '--techne-accent-hover': '#00ff00'
      }
    };

    const result = contract.validateTheme('invalid-theme', invalid);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'contrast', foreground: '--techne-text-muted' }),
      expect.objectContaining({ code: 'accent-family' })
    ]));
  });

  test('normalizes legacy custom themes into a complete current contract', () => {
    const normalized = contract.normalizeCustomTheme({
      name: 'Legacy',
      base: 'dark',
      vars: {
        '--techne-text-inverted': '#101010',
        '--techne-accent': '#99ccff'
      }
    });
    const result = contract.validateTheme('custom-legacy', {
      ...normalized,
      tokens: normalized.vars
    });

    expect(normalized.contractVersion).toBe(contract.VERSION);
    expect(normalized.colorScheme).toBe('dark');
    expect(normalized.vars['--techne-text-on-accent']).toBe('#101010');
    expect(result.valid).toBe(true);
  });

  test('alpha-composites colors before measuring WCAG contrast', () => {
    expect(contract.contrastRatio('rgba(255, 255, 255, 0.5)', '#000000')).toBeCloseTo(5.28, 1);
    expect(contract.contrastRatio('#ffffff', '#000000')).toBe(21);
  });
});

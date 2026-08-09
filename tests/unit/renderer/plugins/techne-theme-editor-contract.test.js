const path = require('path');
const contract = require('../../../../plugins/techne-theme-manager/theme-contract');

const editorPath = path.resolve(__dirname, '../../../../plugins/techne-theme-manager/theme-editor.js');

describe('Techne custom theme contract', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    window.TechneThemeContract = contract;
    window.techneThemeManager = { applyTheme: jest.fn(() => true) };
    delete window.techneThemeEditor;
    require(editorPath);
  });

  afterEach(() => {
    delete window.techneThemeEditor;
    delete window.TechneThemeContract;
    delete window.techneThemeManager;
  });

  test('normalizes legacy custom themes to contract v1', () => {
    localStorage.setItem('techne-theme-custom-themes', JSON.stringify({
      'custom-legacy': {
        name: 'Legacy',
        base: 'dark',
        vars: { '--techne-text-inverted': '#18181b' }
      }
    }));

    const theme = window.techneThemeEditor.loadCustomThemes()['custom-legacy'];
    expect(theme.contractVersion).toBe(1);
    expect(theme.colorScheme).toBe('dark');
    expect(theme.vars['--techne-text-on-accent']).toBe('#18181b');
    expect(contract.REQUIRED_TOKENS.every(token => theme.vars[token])).toBe(true);
  });

  test('rejects inaccessible custom themes without overwriting storage', () => {
    const result = window.techneThemeEditor.saveCustomThemes({
      'custom-invalid': {
        name: 'Invalid',
        base: 'light',
        vars: {
          '--techne-bg': '#ffffff',
          '--techne-text': '#ffffff'
        }
      }
    });

    expect(result.valid).toBe(false);
    expect(result.invalid[0].issues.some(issue => issue.code === 'contrast')).toBe(true);
    expect(localStorage.getItem('techne-theme-custom-themes')).toBeNull();
  });

  test('persists and applies a conformant custom theme', () => {
    const normalized = contract.normalizeCustomTheme({ name: 'Good', base: 'light' });
    const saved = window.techneThemeEditor.saveCustomThemes({ 'custom-good': normalized });

    expect(saved.valid).toBe(true);
    expect(window.techneThemeEditor.applyCustomTheme('custom-good')).toBe(true);
    expect(window.techneThemeManager.applyTheme).toHaveBeenCalledWith('light');
  });
});

const path = require('path');
const fs = require('fs');

const themesPath = path.resolve(__dirname, '../../../../plugins/techne-theme-manager/themes.js');
const themeManagerPath = path.resolve(__dirname, '../../../../plugins/techne-theme-manager/theme-manager.js');
const themeTokensPath = path.resolve(__dirname, '../../../../plugins/techne-theme-manager/techne-tokens.css');

describe('Techne theme manager defaults', () => {
  function createHost() {
    return {
      getSetting: jest.fn(() => null),
      setSetting: jest.fn(),
      emit: jest.fn()
    };
  }

  beforeEach(() => {
    jest.resetModules();
    window.localStorage.clear();
    document.body.className = '';
    document.body.removeAttribute('data-techne-theme');
    document.documentElement.style.cssText = '';

    delete window.appSettings;
    delete window._TECHNE_THEMES;
    delete window.techneThemeManager;

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: jest.fn(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      }))
    });

    require(themesPath);
    require(themeManagerPath);
  });

  afterEach(() => {
    window.techneThemeManager?._destroy?.();
    delete window.appSettings;
    delete window._TECHNE_THEMES;
    delete window.techneThemeManager;
  });

  test('uses the app theme preference when no saved plugin theme exists', () => {
    const host = createHost();
    window.appSettings = { theme: 'solarized-light' };

    window.techneThemeManager._init(host);

    expect(window.techneThemeManager.getActiveTheme()).toBe('solarized-light');
    expect(document.body.getAttribute('data-techne-theme')).toBe('solarized-light');
    expect(document.documentElement.style.getPropertyValue('--techne-bg')).toBe('#fdf6e3');
    expect(host.setSetting).toHaveBeenCalledWith('activeTheme', 'solarized-light');
  });

  test('falls back to solarized light when no saved or app theme exists', () => {
    const host = createHost();

    window.techneThemeManager._init(host);

    expect(window.techneThemeManager.getActiveTheme()).toBe('solarized-light');
    expect(document.body.getAttribute('data-techne-theme')).toBe('solarized-light');
    expect(document.documentElement.style.getPropertyValue('--techne-surface')).toBe('#eee8d5');
  });

  test('built-in themes only override declared canonical tokens and include stable metadata', () => {
    const tokenSource = fs.readFileSync(themeTokensPath, 'utf8');
    const declaredTokens = new Set(
      Array.from(tokenSource.matchAll(/(--techne-[a-z0-9-]+)\s*:/g), match => match[1])
    );
    const themes = window._TECHNE_THEMES;

    expect(Object.keys(themes).length).toBeGreaterThan(0);
    for (const [themeId, theme] of Object.entries(themes)) {
      expect(themeId).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(theme.name).toEqual(expect.any(String));
      expect(theme.name.trim()).not.toBe('');
      expect(theme.description).toEqual(expect.any(String));
      expect(theme.description.trim()).not.toBe('');
      expect(['', 'techne-dark']).toContain(theme.bodyClass);

      const overrideNames = Object.keys(theme.tokens || {});
      expect({
        themeId,
        undeclaredTokens: overrideNames.filter(tokenName => !declaredTokens.has(tokenName))
      }).toEqual({ themeId, undeclaredTokens: [] });
      expect({
        themeId,
        legacyAliases: overrideNames.filter(tokenName => !tokenName.startsWith('--techne-'))
      }).toEqual({ themeId, legacyAliases: [] });
    }
  });
});

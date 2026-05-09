const path = require('path');

const themesPath = path.resolve(__dirname, '../../../../plugins/techne-theme-manager/themes.js');
const themeManagerPath = path.resolve(__dirname, '../../../../plugins/techne-theme-manager/theme-manager.js');

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
});

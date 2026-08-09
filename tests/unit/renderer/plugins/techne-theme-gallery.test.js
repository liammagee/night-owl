const path = require('path');
const contract = require('../../../../plugins/techne-theme-manager/theme-contract');
const themes = require('../../../../plugins/techne-theme-manager/themes');

const galleryPath = path.resolve(__dirname, '../../../../plugins/techne-theme-manager/theme-gallery.js');

describe('Techne theme conformance gallery', () => {
  let activeTheme;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    activeTheme = 'light';
    window.TechneThemeContract = contract;
    window.techneThemeManager = {
      getThemes: jest.fn(() => themes),
      getActiveTheme: jest.fn(() => activeTheme),
      getConformanceReport: jest.fn(() => contract.validateAll(themes)),
      applyTheme: jest.fn(themeId => {
        activeTheme = themeId;
        return true;
      })
    };
    window.registerCommand = jest.fn();
    delete window.TechneThemeGallery;
    require(galleryPath);
  });

  afterEach(() => {
    window.TechneThemeGallery?.close?.({ restore: false });
    delete window.TechneThemeGallery;
    delete window.TechneThemeContract;
    delete window.techneThemeManager;
    delete window.registerCommand;
  });

  test('renders every built-in theme and the required component-state cards', () => {
    expect(window.TechneThemeGallery.open()).toBe(true);

    const gallery = document.querySelector('#techne-theme-conformance-gallery');
    expect(gallery).not.toBeNull();
    expect(gallery.querySelectorAll('.techne-gallery-theme-button')).toHaveLength(12);
    expect(gallery.querySelectorAll('.techne-gallery-theme-result[data-valid="true"]')).toHaveLength(12);
    expect(gallery.querySelectorAll('.techne-gallery-card')).toHaveLength(6);
    expect(gallery.querySelectorAll('.techne-gallery-status')).toHaveLength(4);
    expect(gallery.querySelector('[data-contract-version="1"]')).not.toBeNull();
  });

  test('previews another theme and restores the original theme when canceled', () => {
    window.TechneThemeGallery.open();
    window.TechneThemeGallery.select('dracula');

    expect(activeTheme).toBe('dracula');
    window.TechneThemeGallery.close();
    expect(activeTheme).toBe('light');
  });

  test('keeps the selected theme when the user applies it', () => {
    window.TechneThemeGallery.open();
    window.TechneThemeGallery.select('nord');
    document.querySelector('.techne-gallery-apply').click();

    expect(activeTheme).toBe('nord');
    expect(document.querySelector('#techne-theme-conformance-gallery')).toBeNull();
  });
});

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MonacoThemeUtils = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizeHexColor(rawColor, fallback) {
    const value = String(rawColor || '').trim();
    if (!value) return fallback;

    const hexMatch = value.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
    if (hexMatch) {
      const hex = hexMatch[1];
      if (hex.length === 3) {
        return '#' + hex.split('').map((ch) => ch + ch).join('');
      }
      return '#' + hex.slice(0, 6);
    }

    const rgbMatch = value.match(
      /^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|0?\.\d+|1))?\)$/i
    );
    if (rgbMatch) {
      const clamp = (n) => Math.max(0, Math.min(255, Number(n)));
      const toHex = (n) => clamp(n).toString(16).padStart(2, '0');
      return '#' + toHex(rgbMatch[1]) + toHex(rgbMatch[2]) + toHex(rgbMatch[3]);
    }

    return fallback;
  }

  function applyHexAlpha(rawColor, alphaHex, fallback) {
    const base = normalizeHexColor(rawColor, fallback).replace('#', '').slice(0, 6);
    const alpha = String(alphaHex || '40').replace('#', '').slice(0, 2).padEnd(2, '0');
    return '#' + base + alpha;
  }

  function toMonacoTokenColor(rawColor, fallback) {
    return normalizeHexColor(rawColor, fallback).replace('#', '').slice(0, 6);
  }

  function readThemeVar(styles, names, fallback) {
    if (!styles || !Array.isArray(names)) return fallback;
    for (const name of names) {
      const value = String(styles.getPropertyValue(name) || '').trim();
      if (value) return value;
    }
    return fallback;
  }

  function buildMonacoThemeDefinition(language, isDark, styles) {
    const background = normalizeHexColor(
      readThemeVar(styles, ['--editor-bg', '--surface', '--panel-bg', '--surface-variant', '--bg-secondary', '--bg-color'], isDark ? '#1e1e1e' : '#ffffff'),
      isDark ? '#1e1e1e' : '#ffffff'
    );
    const surface = normalizeHexColor(
      readThemeVar(styles, ['--surface-variant', '--surface-hover', '--bg-secondary', '--toolbar-bg', '--panel-bg', '--bg-color'], isDark ? '#252526' : '#f8fafc'),
      isDark ? '#252526' : '#f8fafc'
    );
    const foreground = normalizeHexColor(
      readThemeVar(styles, ['--text', '--menu-text-color', '--text-secondary', '--text-color'], isDark ? '#d4d4d4' : '#1e293b'),
      isDark ? '#d4d4d4' : '#1e293b'
    );
    const muted = normalizeHexColor(
      readThemeVar(styles, ['--text-muted', '--text-secondary', '--text-color'], isDark ? '#6b6b6b' : '#94a3b8'),
      isDark ? '#6b6b6b' : '#94a3b8'
    );
    const accent = normalizeHexColor(
      readThemeVar(styles, ['--primary', '--primary-500', '--accent-color'], isDark ? '#818cf8' : '#6366f1'),
      isDark ? '#818cf8' : '#6366f1'
    );
    const border = normalizeHexColor(
      readThemeVar(styles, ['--border', '--toolbar-border', '--button-border', '--border-color'], isDark ? '#3c3c3c' : '#e2e8f0'),
      isDark ? '#3c3c3c' : '#e2e8f0'
    );

    const accentToken = toMonacoTokenColor(accent, isDark ? '#93c5fd' : '#2563eb');
    const textToken = toMonacoTokenColor(foreground, isDark ? '#d4d4d4' : '#1e293b');
    const mutedToken = toMonacoTokenColor(muted, isDark ? '#6b6b6b' : '#94a3b8');

    const markdownRules = [
      { token: 'string.link', foreground: accentToken },
      { token: 'string.target', foreground: accentToken },
      { token: 'markup.underline.link', foreground: accentToken },
      { token: 'markup.underline', foreground: accentToken }
    ];

    const bibtexRules = [
      { token: 'keyword', foreground: accentToken, fontStyle: 'bold' },
      { token: 'entity.name.function', foreground: textToken },
      { token: 'attribute.name', foreground: accentToken },
      { token: 'string', foreground: textToken },
      { token: 'number', foreground: accentToken },
      { token: 'comment', foreground: mutedToken, fontStyle: 'italic' },
      { token: 'bracket', foreground: textToken },
      { token: 'delimiter', foreground: textToken }
    ];

    return {
      base: isDark ? 'vs-dark' : 'vs',
      inherit: true,
      rules: language === 'bibtex' ? bibtexRules : markdownRules,
      colors: {
        'editor.background': background,
        'editor.foreground': foreground,
        'editor.lineHighlightBackground': surface,
        'editorLineNumber.foreground': muted,
        'editorLineNumber.activeForeground': foreground,
        'editorCursor.foreground': accent,
        'editor.selectionBackground': applyHexAlpha(accent, '40', '#6366f1'),
        'editor.inactiveSelectionBackground': applyHexAlpha(accent, '24', '#6366f1'),
        'editorLink.activeForeground': '#' + accentToken,
        'editorIndentGuide.background': applyHexAlpha(border, '66', '#3c3c3c'),
        'editorIndentGuide.activeBackground': applyHexAlpha(muted, '88', '#6b6b6b'),
        'editorWidget.background': surface,
        'editorWidget.border': border,
        'editorGutter.background': background,
        'minimap.background': background,
        'scrollbarSlider.background': applyHexAlpha(border, '88', '#3c3c3c'),
        'scrollbarSlider.hoverBackground': applyHexAlpha(muted, '99', '#6b6b6b')
      }
    };
  }

  return {
    normalizeHexColor,
    applyHexAlpha,
    toMonacoTokenColor,
    readThemeVar,
    buildMonacoThemeDefinition
  };
}));

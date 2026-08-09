/* Techne theme contract
   Shared by NightOwl runtime, custom-theme editor, tests, and CI.
*/

(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.TechneThemeContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = 1;
    const REQUIRED_TOKENS = Object.freeze([
        '--techne-bg',
        '--techne-surface',
        '--techne-surface-elevated',
        '--techne-text',
        '--techne-text-muted',
        '--techne-text-on-accent',
        '--techne-accent',
        '--techne-accent-hover',
        '--techne-accent-active',
        '--techne-border',
        '--techne-border-subtle',
        '--techne-focus-ring',
        '--techne-selection-bg',
        '--techne-link',
        '--techne-success',
        '--techne-success-surface',
        '--techne-warning',
        '--techne-warning-surface',
        '--techne-error',
        '--techne-error-surface',
        '--techne-info',
        '--techne-info-surface'
    ]);
    const OPTIONAL_TOKENS = Object.freeze([
        '--techne-glass-bg',
        '--techne-glass-border',
        '--techne-text-inverted'
    ]);
    const ALLOWED_TOKENS = new Set([...REQUIRED_TOKENS, ...OPTIONAL_TOKENS]);

    const DEFAULTS = Object.freeze({
        light: Object.freeze({
            '--techne-bg': '#ffffff',
            '--techne-surface': '#f7f7f8',
            '--techne-surface-elevated': '#ffffff',
            '--techne-text': '#18181b',
            '--techne-text-muted': '#52525b',
            '--techne-text-on-accent': '#ffffff',
            '--techne-accent': '#b42336',
            '--techne-accent-hover': '#991b2e',
            '--techne-accent-active': '#7f1726',
            '--techne-border': '#a1a1aa',
            '--techne-border-subtle': '#d4d4d8',
            '--techne-focus-ring': '#075eb5',
            '--techne-selection-bg': '#dbeafe',
            '--techne-link': '#075eb5',
            '--techne-success': '#146c43',
            '--techne-success-surface': '#e7f5ed',
            '--techne-warning': '#744700',
            '--techne-warning-surface': '#fff1cc',
            '--techne-error': '#a61b1b',
            '--techne-error-surface': '#fde8e8',
            '--techne-info': '#1756a9',
            '--techne-info-surface': '#e8f1ff',
            '--techne-glass-bg': 'rgba(255, 255, 255, 0.88)',
            '--techne-glass-border': 'rgba(24, 24, 27, 0.18)',
            '--techne-text-inverted': '#ffffff'
        }),
        dark: Object.freeze({
            '--techne-bg': '#18181b',
            '--techne-surface': '#242428',
            '--techne-surface-elevated': '#303036',
            '--techne-text': '#f4f4f5',
            '--techne-text-muted': '#b8b8c0',
            '--techne-text-on-accent': '#18181b',
            '--techne-accent': '#ff7a86',
            '--techne-accent-hover': '#ff98a1',
            '--techne-accent-active': '#e95765',
            '--techne-border': '#71717a',
            '--techne-border-subtle': '#46464f',
            '--techne-focus-ring': '#a9caff',
            '--techne-selection-bg': '#294d73',
            '--techne-link': '#9bc7ff',
            '--techne-success': '#79d8a5',
            '--techne-success-surface': '#153727',
            '--techne-warning': '#ffd278',
            '--techne-warning-surface': '#3b2d0b',
            '--techne-error': '#ff9a92',
            '--techne-error-surface': '#481d1d',
            '--techne-info': '#a9caff',
            '--techne-info-surface': '#183356',
            '--techne-glass-bg': 'rgba(24, 24, 27, 0.88)',
            '--techne-glass-border': 'rgba(244, 244, 245, 0.16)',
            '--techne-text-inverted': '#18181b'
        })
    });

    function clampByte(value) {
        return Math.min(255, Math.max(0, Number(value)));
    }

    function parseColor(value) {
        if (typeof value !== 'string') return null;
        const input = value.trim();
        const hex = input.match(/^#([0-9a-f]{3,8})$/i);
        if (hex) {
            let digits = hex[1];
            if (digits.length === 3 || digits.length === 4) {
                digits = digits.split('').map(char => char + char).join('');
            }
            if (digits.length !== 6 && digits.length !== 8) return null;
            return {
                r: parseInt(digits.slice(0, 2), 16),
                g: parseInt(digits.slice(2, 4), 16),
                b: parseInt(digits.slice(4, 6), 16),
                a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1
            };
        }

        const rgb = input.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+)%?)?\s*\)$/i);
        if (!rgb) return null;
        let alpha = rgb[4] == null ? 1 : Number(rgb[4]);
        if (rgb[4] && input.includes('%')) alpha /= 100;
        return {
            r: clampByte(rgb[1]),
            g: clampByte(rgb[2]),
            b: clampByte(rgb[3]),
            a: Math.min(1, Math.max(0, alpha))
        };
    }

    function composite(foreground, background) {
        const fg = typeof foreground === 'string' ? parseColor(foreground) : foreground;
        const bg = typeof background === 'string' ? parseColor(background) : background;
        if (!fg || !bg) return null;
        const alpha = fg.a + bg.a * (1 - fg.a);
        if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
        return {
            r: ((fg.r * fg.a) + (bg.r * bg.a * (1 - fg.a))) / alpha,
            g: ((fg.g * fg.a) + (bg.g * bg.a * (1 - fg.a))) / alpha,
            b: ((fg.b * fg.a) + (bg.b * bg.a * (1 - fg.a))) / alpha,
            a: alpha
        };
    }

    function opaqueColor(value, background) {
        const color = typeof value === 'string' ? parseColor(value) : value;
        if (!color) return null;
        if (color.a >= 1) return color;
        return composite(color, background);
    }

    function channelLuminance(value) {
        const normalized = value / 255;
        return normalized <= 0.04045
            ? normalized / 12.92
            : Math.pow((normalized + 0.055) / 1.055, 2.4);
    }

    function luminance(value, background = '#ffffff') {
        const color = opaqueColor(value, background);
        if (!color) return null;
        return (0.2126 * channelLuminance(color.r)) +
            (0.7152 * channelLuminance(color.g)) +
            (0.0722 * channelLuminance(color.b));
    }

    function contrastRatio(foreground, background) {
        const bg = opaqueColor(background, '#ffffff');
        const fg = opaqueColor(foreground, bg);
        if (!fg || !bg) return null;
        const first = luminance(fg);
        const second = luminance(bg);
        const lighter = Math.max(first, second);
        const darker = Math.min(first, second);
        return (lighter + 0.05) / (darker + 0.05);
    }

    function hue(value) {
        const color = parseColor(value);
        if (!color) return null;
        const r = color.r / 255;
        const g = color.g / 255;
        const b = color.b / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        if (delta < 0.05) return null;
        let result;
        if (max === r) result = 60 * (((g - b) / delta) % 6);
        else if (max === g) result = 60 * (((b - r) / delta) + 2);
        else result = 60 * (((r - g) / delta) + 4);
        return (result + 360) % 360;
    }

    function hueDistance(first, second) {
        const firstHue = hue(first);
        const secondHue = hue(second);
        if (firstHue == null || secondHue == null) return 0;
        const distance = Math.abs(firstHue - secondHue);
        return Math.min(distance, 360 - distance);
    }

    function mixColor(value, target, weight) {
        const sourceColor = parseColor(value);
        const targetColor = parseColor(target);
        if (!sourceColor || !targetColor) return value;
        const amount = Math.min(1, Math.max(0, weight));
        const channel = key => Math.round(sourceColor[key] * (1 - amount) + targetColor[key] * amount)
            .toString(16)
            .padStart(2, '0');
        return `#${channel('r')}${channel('g')}${channel('b')}`;
    }

    function resolveTheme(theme = {}) {
        const colorScheme = theme.colorScheme === 'dark' || theme.bodyClass === 'techne-dark'
            ? 'dark'
            : 'light';
        const resolved = {
            ...DEFAULTS[colorScheme],
            ...(theme.tokens || theme.vars || {})
        };
        if (!resolved['--techne-text-on-accent'] && resolved['--techne-text-inverted']) {
            resolved['--techne-text-on-accent'] = resolved['--techne-text-inverted'];
        }
        resolved['--techne-text-inverted'] = resolved['--techne-text-on-accent'];
        return resolved;
    }

    function addContrastIssue(issues, tokens, foreground, background, minimum, label) {
        const ratio = contrastRatio(tokens[foreground], tokens[background]);
        if (ratio == null || ratio + 0.0001 < minimum) {
            issues.push({
                code: 'contrast',
                label,
                foreground,
                background,
                ratio: ratio == null ? null : Number(ratio.toFixed(2)),
                minimum
            });
        }
    }

    function validateTheme(themeId, theme = {}, options = {}) {
        const issues = [];
        const requireMetadata = options.requireMetadata !== false;
        if (requireMetadata) {
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(themeId || '')) {
                issues.push({ code: 'metadata', label: 'Theme ID must be stable kebab-case' });
            }
            if (typeof theme.name !== 'string' || !theme.name.trim()) {
                issues.push({ code: 'metadata', label: 'Theme name is required' });
            }
            if (typeof theme.description !== 'string' || !theme.description.trim()) {
                issues.push({ code: 'metadata', label: 'Theme description is required' });
            }
            if (!['light', 'dark'].includes(theme.colorScheme)) {
                issues.push({ code: 'metadata', label: 'Theme colorScheme must be light or dark' });
            }
            if (theme.contractVersion !== VERSION) {
                issues.push({ code: 'metadata', label: `Theme contractVersion must be ${VERSION}` });
            }
        }

        const supplied = theme.tokens || theme.vars || {};
        for (const tokenName of Object.keys(supplied)) {
            if (!ALLOWED_TOKENS.has(tokenName)) {
                issues.push({ code: 'unknown-token', label: `Unknown token ${tokenName}`, token: tokenName });
            }
        }

        const tokens = resolveTheme(theme);
        for (const tokenName of REQUIRED_TOKENS) {
            if (!tokens[tokenName]) {
                issues.push({ code: 'missing-token', label: `Missing ${tokenName}`, token: tokenName });
            } else if (!parseColor(tokens[tokenName])) {
                issues.push({ code: 'invalid-color', label: `Invalid color for ${tokenName}`, token: tokenName });
            }
        }

        const surfaces = ['--techne-bg', '--techne-surface', '--techne-surface-elevated'];
        for (const surface of surfaces) {
            addContrastIssue(issues, tokens, '--techne-text', surface, 4.5, `Primary text on ${surface}`);
            addContrastIssue(issues, tokens, '--techne-text-muted', surface, 4.5, `Muted text on ${surface}`);
            addContrastIssue(issues, tokens, '--techne-link', surface, 4.5, `Link on ${surface}`);
            addContrastIssue(issues, tokens, '--techne-focus-ring', surface, 3, `Focus ring on ${surface}`);
            addContrastIssue(issues, tokens, '--techne-accent', surface, 3, `Accent on ${surface}`);
        }
        for (const accent of ['--techne-accent', '--techne-accent-hover', '--techne-accent-active']) {
            addContrastIssue(issues, tokens, '--techne-text-on-accent', accent, 4.5, `Text on ${accent}`);
        }
        addContrastIssue(issues, tokens, '--techne-text', '--techne-selection-bg', 4.5, 'Text on selection');
        for (const status of ['success', 'warning', 'error', 'info']) {
            addContrastIssue(
                issues,
                tokens,
                `--techne-${status}`,
                `--techne-${status}-surface`,
                4.5,
                `${status} foreground on surface`
            );
        }

        const accentValues = [
            tokens['--techne-accent'],
            tokens['--techne-accent-hover'],
            tokens['--techne-accent-active']
        ];
        for (let index = 1; index < accentValues.length; index += 1) {
            const distance = hueDistance(accentValues[0], accentValues[index]);
            if (distance > 35) {
                issues.push({
                    code: 'accent-family',
                    label: 'Accent interaction states must retain one hue family',
                    distance: Number(distance.toFixed(1))
                });
            }
        }

        const statusValues = ['success', 'warning', 'error', 'info']
            .map(status => ({ status, value: tokens[`--techne-${status}`] }));
        for (let first = 0; first < statusValues.length; first += 1) {
            for (let second = first + 1; second < statusValues.length; second += 1) {
                const distance = hueDistance(statusValues[first].value, statusValues[second].value);
                if (distance < 28) {
                    issues.push({
                        code: 'status-identity',
                        label: `${statusValues[first].status} and ${statusValues[second].status} are not distinct`,
                        distance: Number(distance.toFixed(1))
                    });
                }
            }
        }

        return {
            id: themeId,
            valid: issues.length === 0,
            contractVersion: VERSION,
            colorScheme: theme.colorScheme || (theme.bodyClass === 'techne-dark' ? 'dark' : 'light'),
            tokens,
            issues
        };
    }

    function validateAll(themes = {}) {
        const results = Object.entries(themes).map(([themeId, theme]) => validateTheme(themeId, theme));
        return {
            valid: results.every(result => result.valid),
            themeCount: results.length,
            failureCount: results.filter(result => !result.valid).length,
            results
        };
    }

    function normalizeCustomTheme(theme = {}) {
        const colorScheme = theme.colorScheme || theme.base || 'light';
        const vars = { ...(theme.vars || theme.tokens || {}) };
        if (!vars['--techne-text-on-accent'] && vars['--techne-text-inverted']) {
            vars['--techne-text-on-accent'] = vars['--techne-text-inverted'];
        }
        if (vars['--techne-accent']) {
            if (!vars['--techne-accent-hover']) {
                vars['--techne-accent-hover'] = mixColor(vars['--techne-accent'], '#ffffff', 0.18);
            }
            if (!vars['--techne-accent-active']) {
                vars['--techne-accent-active'] = mixColor(vars['--techne-accent'], '#000000', 0.18);
            }
        }
        const normalized = {
            name: theme.name || 'Custom Theme',
            description: theme.description || 'Custom NightOwl theme',
            colorScheme: colorScheme === 'dark' ? 'dark' : 'light',
            bodyClass: colorScheme === 'dark' ? 'techne-dark' : '',
            contractVersion: VERSION,
            vars: {
                ...DEFAULTS[colorScheme === 'dark' ? 'dark' : 'light'],
                ...vars
            }
        };
        normalized.vars['--techne-text-inverted'] = normalized.vars['--techne-text-on-accent'];
        return normalized;
    }

    return Object.freeze({
        VERSION,
        REQUIRED_TOKENS,
        OPTIONAL_TOKENS,
        DEFAULTS,
        parseColor,
        composite,
        luminance,
        contrastRatio,
        hueDistance,
        mixColor,
        resolveTheme,
        validateTheme,
        validateAll,
        normalizeCustomTheme
    });
});

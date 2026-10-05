/* Built-in Techne themes. Values override the versioned semantic contract. */

(function (root, factory) {
    const themes = factory();
    if (typeof module === 'object' && module.exports) module.exports = themes;
    if (root) root._TECHNE_THEMES = themes;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = 1;

    function theme(name, description, colorScheme, tokens = {}) {
        return {
            name,
            description,
            colorScheme,
            contractVersion: VERSION,
            bodyClass: colorScheme === 'dark' ? 'techne-dark' : '',
            tokens
        };
    }

    return {
        light: theme('Light', 'Clean light theme with red accents', 'light'),

        dark: theme('Dark', 'Dark theme with red accents', 'dark'),

        'techne-red-light': theme('Red Light', 'Light theme with bold red accent', 'light', {
            '--techne-accent': '#b42336',
            '--techne-accent-hover': '#991b2e',
            '--techne-accent-active': '#7f1726'
        }),

        'techne-red-dark': theme('Red Dark', 'Dark theme with bold red accent', 'dark', {
            '--techne-accent': '#ff7a86',
            '--techne-accent-hover': '#ff98a1',
            '--techne-accent-active': '#e95765'
        }),

        'techne-orange-light': theme('Orange Light', 'Light theme with warm orange accent', 'light', {
            '--techne-accent': '#a94300',
            '--techne-accent-hover': '#8d3700',
            '--techne-accent-active': '#722c00'
        }),

        'techne-orange-dark': theme('Orange Dark', 'Dark theme with warm orange accent', 'dark', {
            '--techne-accent': '#ff9f5a',
            '--techne-accent-hover': '#ffb47c',
            '--techne-accent-active': '#dc782f'
        }),

        'solarized-light': theme('Solarized Light', 'Warm light theme with blue accent', 'light', {
            '--techne-bg': '#fdf6e3',
            '--techne-surface': '#eee8d5',
            '--techne-surface-elevated': '#fffaf0',
            '--techne-text': '#364b52',
            '--techne-text-muted': '#52666d',
            '--techne-text-on-accent': '#ffffff',
            '--techne-accent': '#0b67a3',
            '--techne-accent-hover': '#095787',
            '--techne-accent-active': '#07466d',
            '--techne-border': '#8d9b9d',
            '--techne-border-subtle': '#c9c3b3',
            '--techne-focus-ring': '#075eb5',
            '--techne-selection-bg': '#d7e8ed',
            '--techne-link': '#075e96',
            '--techne-glass-bg': 'rgba(253, 246, 227, 0.9)',
            '--techne-glass-border': 'rgba(82, 102, 109, 0.28)'
        }),

        'solarized-dark': theme('Solarized Dark', 'Warm dark theme with blue accent', 'dark', {
            '--techne-bg': '#002b36',
            '--techne-surface': '#073642',
            '--techne-surface-elevated': '#114752',
            '--techne-text': '#e1eeee',
            '--techne-text-muted': '#b4c5c5',
            '--techne-text-on-accent': '#002b36',
            '--techne-accent': '#76c5f0',
            '--techne-accent-hover': '#98d5f5',
            '--techne-accent-active': '#45a5dc',
            '--techne-border': '#71898c',
            '--techne-border-subtle': '#355b64',
            '--techne-focus-ring': '#a9dcfa',
            '--techne-selection-bg': '#1d5364',
            '--techne-link': '#9bd8f7',
            '--techne-glass-bg': 'rgba(0, 43, 54, 0.9)',
            '--techne-glass-border': 'rgba(180, 197, 197, 0.22)'
        }),

        nord: theme('Nord', 'Arctic-inspired dark theme', 'dark', {
            '--techne-bg': '#2e3440',
            '--techne-surface': '#3b4252',
            '--techne-surface-elevated': '#465064',
            '--techne-text': '#f4f6fa',
            '--techne-text-muted': '#d8dee9',
            '--techne-text-on-accent': '#202630',
            '--techne-accent': '#9bd0dc',
            '--techne-accent-hover': '#b3dce5',
            '--techne-accent-active': '#77adbd',
            '--techne-border': '#7d879a',
            '--techne-border-subtle': '#566074',
            '--techne-focus-ring': '#b8d9ff',
            '--techne-selection-bg': '#4b6078',
            '--techne-link': '#add8ff',
            '--techne-glass-bg': 'rgba(46, 52, 64, 0.9)',
            '--techne-glass-border': 'rgba(216, 222, 233, 0.2)'
        }),

        dracula: theme('Dracula', 'Dark theme with purple accent', 'dark', {
            '--techne-bg': '#282a36',
            '--techne-surface': '#373a49',
            '--techne-surface-elevated': '#44475a',
            '--techne-text': '#f8f8f2',
            '--techne-text-muted': '#c8cada',
            '--techne-text-on-accent': '#282a36',
            '--techne-accent': '#c7a2fa',
            '--techne-accent-hover': '#d5bafd',
            '--techne-accent-active': '#af86df',
            '--techne-border': '#848799',
            '--techne-border-subtle': '#585b70',
            '--techne-focus-ring': '#b9d5ff',
            '--techne-selection-bg': '#514c70',
            '--techne-link': '#b9d5ff',
            '--techne-glass-bg': 'rgba(40, 42, 54, 0.9)',
            '--techne-glass-border': 'rgba(248, 248, 242, 0.18)'
        }),

        monokai: theme('Monokai', 'Classic dark theme with green accent', 'dark', {
            '--techne-bg': '#272822',
            '--techne-surface': '#37382f',
            '--techne-surface-elevated': '#49483e',
            '--techne-text': '#f8f8f2',
            '--techne-text-muted': '#cfcdc3',
            '--techne-text-on-accent': '#20211c',
            '--techne-accent': '#b5e853',
            '--techne-accent-hover': '#c7f078',
            '--techne-accent-active': '#92c52f',
            '--techne-border': '#898a80',
            '--techne-border-subtle': '#57584e',
            '--techne-focus-ring': '#b9d8ff',
            '--techne-selection-bg': '#4c583c',
            '--techne-link': '#b9d8ff',
            '--techne-glass-bg': 'rgba(39, 40, 34, 0.9)',
            '--techne-glass-border': 'rgba(248, 248, 242, 0.18)'
        }),

        sepia: theme('Sepia', 'Warm reading theme', 'light', {
            '--techne-bg': '#f4ecd8',
            '--techne-surface': '#e9dfc8',
            '--techne-surface-elevated': '#fbf5e7',
            '--techne-text': '#49382b',
            '--techne-text-muted': '#68523e',
            '--techne-text-on-accent': '#fffaf0',
            '--techne-accent': '#78380b',
            '--techne-accent-hover': '#622d08',
            '--techne-accent-active': '#4f2406',
            '--techne-border': '#9b8267',
            '--techne-border-subtle': '#cbbca6',
            '--techne-focus-ring': '#075eb5',
            '--techne-selection-bg': '#dfd0b6',
            '--techne-link': '#71400f',
            '--techne-glass-bg': 'rgba(244, 236, 216, 0.9)',
            '--techne-glass-border': 'rgba(73, 56, 43, 0.2)'
        })
    };
});

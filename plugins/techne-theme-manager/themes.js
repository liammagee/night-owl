/* Techne Theme Definitions
   Each theme has: name, description, bodyClass (applied to <body>),
   and tokens (override map for --techne-* vars beyond the CSS defaults).
*/

(function () {
    'use strict';

    const THEMES = {
        light: {
            name: 'Light',
            description: 'Clean light theme with red accents',
            bodyClass: '',           // no extra class — :root defaults
            tokens: {}               // all defaults from techne-tokens.css
        },

        dark: {
            name: 'Dark',
            description: 'Dark theme with red accents',
            bodyClass: 'techne-dark',
            tokens: {}               // overrides handled by body.techne-dark in CSS
        },

        'techne-red': {
            name: 'Techne Red',
            description: 'Swiss-grid dark theme with bold red accent',
            bodyClass: 'techne-dark',
            tokens: {
                '--techne-accent': '#E63946',
                '--techne-accent-hover': '#c1121f',
                '--techne-accent-active': '#a30f19',
                '--techne-bg': '#0a0a0a',
                '--techne-surface': '#111111',
                '--techne-surface-elevated': '#1a1a1a'
            }
        },

        'techne-orange': {
            name: 'Techne Orange',
            description: 'Swiss-grid dark theme with orange accent',
            bodyClass: 'techne-dark',
            tokens: {
                '--techne-accent': '#ff7a1a',
                '--techne-accent-hover': '#d45a00',
                '--techne-accent-active': '#b34900',
                '--techne-bg': '#0a0a0a',
                '--techne-surface': '#111111',
                '--techne-surface-elevated': '#1a1a1a'
            }
        }
    };

    // Expose for theme-manager.js (loaded next)
    window._TECHNE_THEMES = THEMES;
})();

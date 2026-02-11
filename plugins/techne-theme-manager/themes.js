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
            tokens: {
                '--techne-bg': '#0a0a0a',
                '--techne-surface': '#111111',
                '--techne-surface-elevated': '#1a1a1a',
                '--techne-text': '#e0e0e0',
                '--techne-text-muted': 'rgba(224, 224, 224, 0.55)',
                '--techne-text-inverted': '#0a0a0a',
                '--techne-border': 'rgba(255, 255, 255, 0.18)',
                '--techne-border-subtle': 'rgba(255, 255, 255, 0.08)',
                '--techne-glass-bg': 'rgba(10, 10, 10, 0.85)',
                '--techne-glass-border': 'rgba(255, 255, 255, 0.08)'
            }
        },

        'techne-red-light': {
            name: 'Red Light',
            description: 'Light theme with bold red accent',
            bodyClass: '',
            tokens: {
                '--techne-accent': '#E63946',
                '--techne-accent-hover': '#c1121f',
                '--techne-accent-active': '#a30f19',
                '--techne-bg': '#ffffff',
                '--techne-surface': '#fafafa',
                '--techne-surface-elevated': '#ffffff',
                '--techne-text': '#0a0a0a',
                '--techne-text-muted': 'rgba(10, 10, 10, 0.55)',
                '--techne-text-inverted': '#ffffff',
                '--techne-border': 'rgba(10, 10, 10, 0.22)',
                '--techne-border-subtle': 'rgba(10, 10, 10, 0.10)',
                '--techne-glass-bg': 'rgba(255, 255, 255, 0.85)',
                '--techne-glass-border': 'rgba(255, 255, 255, 0.18)'
            }
        },

        'techne-red-dark': {
            name: 'Red Dark',
            description: 'Dark theme with bold red accent',
            bodyClass: 'techne-dark',
            tokens: {
                '--techne-accent': '#E63946',
                '--techne-accent-hover': '#c1121f',
                '--techne-accent-active': '#a30f19',
                '--techne-bg': '#0a0a0a',
                '--techne-surface': '#111111',
                '--techne-surface-elevated': '#1a1a1a',
                '--techne-text': '#e0e0e0',
                '--techne-text-muted': 'rgba(224, 224, 224, 0.55)',
                '--techne-text-inverted': '#0a0a0a',
                '--techne-border': 'rgba(255, 255, 255, 0.18)',
                '--techne-border-subtle': 'rgba(255, 255, 255, 0.08)',
                '--techne-glass-bg': 'rgba(10, 10, 10, 0.85)',
                '--techne-glass-border': 'rgba(255, 255, 255, 0.08)'
            }
        },

        'techne-orange-light': {
            name: 'Orange Light',
            description: 'Light theme with orange accent',
            bodyClass: '',
            tokens: {
                '--techne-accent': '#ff7a1a',
                '--techne-accent-hover': '#d45a00',
                '--techne-accent-active': '#b34900',
                '--techne-bg': '#ffffff',
                '--techne-surface': '#fafafa',
                '--techne-surface-elevated': '#ffffff',
                '--techne-text': '#0a0a0a',
                '--techne-text-muted': 'rgba(10, 10, 10, 0.55)',
                '--techne-text-inverted': '#ffffff',
                '--techne-border': 'rgba(10, 10, 10, 0.22)',
                '--techne-border-subtle': 'rgba(10, 10, 10, 0.10)',
                '--techne-glass-bg': 'rgba(255, 255, 255, 0.85)',
                '--techne-glass-border': 'rgba(255, 255, 255, 0.18)'
            }
        },

        'techne-orange-dark': {
            name: 'Orange Dark',
            description: 'Dark theme with orange accent',
            bodyClass: 'techne-dark',
            tokens: {
                '--techne-accent': '#ff7a1a',
                '--techne-accent-hover': '#d45a00',
                '--techne-accent-active': '#b34900',
                '--techne-bg': '#0a0a0a',
                '--techne-surface': '#111111',
                '--techne-surface-elevated': '#1a1a1a',
                '--techne-text': '#e0e0e0',
                '--techne-text-muted': 'rgba(224, 224, 224, 0.55)',
                '--techne-text-inverted': '#0a0a0a',
                '--techne-border': 'rgba(255, 255, 255, 0.18)',
                '--techne-border-subtle': 'rgba(255, 255, 255, 0.08)',
                '--techne-glass-bg': 'rgba(10, 10, 10, 0.85)',
                '--techne-glass-border': 'rgba(255, 255, 255, 0.08)'
            }
        },

        'solarized-light': {
            name: 'Solarized Light',
            description: 'Warm light theme with blue accent',
            bodyClass: '',
            tokens: {
                '--techne-bg': '#fdf6e3',
                '--techne-surface': '#eee8d5',
                '--techne-surface-elevated': '#fdf6e3',
                '--techne-text': '#657b83',
                '--techne-text-muted': '#93a1a1',
                '--techne-text-inverted': '#fdf6e3',
                '--techne-accent': '#268bd2',
                '--techne-accent-hover': '#2176b5',
                '--techne-accent-active': '#1a5e94',
                '--techne-border': '#d5cec0',
                '--techne-border-subtle': '#e0daca',
                '--techne-glass-bg': 'rgba(253, 246, 227, 0.85)',
                '--techne-glass-border': 'rgba(238, 232, 213, 0.18)'
            }
        },

        'solarized-dark': {
            name: 'Solarized Dark',
            description: 'Cool dark theme with blue accent',
            bodyClass: 'techne-dark',
            tokens: {
                '--techne-bg': '#002b36',
                '--techne-surface': '#073642',
                '--techne-surface-elevated': '#0a4050',
                '--techne-text': '#839496',
                '--techne-text-muted': '#586e75',
                '--techne-text-inverted': '#002b36',
                '--techne-accent': '#268bd2',
                '--techne-accent-hover': '#2176b5',
                '--techne-accent-active': '#1a5e94',
                '--techne-border': '#0a4050',
                '--techne-border-subtle': '#073642',
                '--techne-glass-bg': 'rgba(0, 43, 54, 0.85)',
                '--techne-glass-border': 'rgba(7, 54, 66, 0.18)'
            }
        }
    };

    // Expose for theme-manager.js (loaded next)
    window._TECHNE_THEMES = THEMES;
})();

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
                '--techne-accent': '#268bd2',
                '--techne-accent-hover': '#1a6da0',
                '--techne-accent-active': '#155a85',
                '--techne-bg': '#fdf6e3',
                '--techne-surface': '#eee8d5',
                '--techne-surface-elevated': '#fdf6e3',
                '--techne-text': '#657b83',
                '--techne-text-muted': '#93a1a1',
                '--techne-text-inverted': '#fdf6e3',
                '--techne-border': 'rgba(101, 123, 131, 0.25)',
                '--techne-border-subtle': 'rgba(101, 123, 131, 0.12)',
                '--techne-glass-bg': 'rgba(253, 246, 227, 0.85)',
                '--techne-glass-border': 'rgba(238, 232, 213, 0.40)'
            }
        },

        'solarized-dark': {
            name: 'Solarized Dark',
            description: 'Warm dark theme with blue accent',
            bodyClass: 'techne-dark',
            tokens: {
                '--techne-accent': '#268bd2',
                '--techne-accent-hover': '#2aa0f0',
                '--techne-accent-active': '#1a6da0',
                '--techne-bg': '#002b36',
                '--techne-surface': '#073642',
                '--techne-surface-elevated': '#0a4050',
                '--techne-text': '#839496',
                '--techne-text-muted': '#586e75',
                '--techne-text-inverted': '#002b36',
                '--techne-border': 'rgba(131, 148, 150, 0.25)',
                '--techne-border-subtle': 'rgba(131, 148, 150, 0.12)',
                '--techne-glass-bg': 'rgba(0, 43, 54, 0.85)',
                '--techne-glass-border': 'rgba(7, 54, 66, 0.40)'
            }
        },

        'nord': {
            name: 'Nord',
            description: 'Arctic-inspired dark theme',
            bodyClass: 'techne-dark',
            tokens: {
                '--techne-accent': '#88c0d0',
                '--techne-accent-hover': '#81a1c1',
                '--techne-accent-active': '#5e81ac',
                '--techne-bg': '#2e3440',
                '--techne-surface': '#3b4252',
                '--techne-surface-elevated': '#434c5e',
                '--techne-text': '#eceff4',
                '--techne-text-muted': '#d8dee9',
                '--techne-text-inverted': '#2e3440',
                '--techne-border': 'rgba(236, 239, 244, 0.18)',
                '--techne-border-subtle': 'rgba(236, 239, 244, 0.08)',
                '--techne-glass-bg': 'rgba(46, 52, 64, 0.85)',
                '--techne-glass-border': 'rgba(59, 66, 82, 0.40)'
            }
        },

        'dracula': {
            name: 'Dracula',
            description: 'Dark theme with purple accent',
            bodyClass: 'techne-dark',
            tokens: {
                '--techne-accent': '#bd93f9',
                '--techne-accent-hover': '#ff79c6',
                '--techne-accent-active': '#8b6fc0',
                '--techne-bg': '#282a36',
                '--techne-surface': '#44475a',
                '--techne-surface-elevated': '#4d5066',
                '--techne-text': '#f8f8f2',
                '--techne-text-muted': '#6272a4',
                '--techne-text-inverted': '#282a36',
                '--techne-border': 'rgba(248, 248, 242, 0.18)',
                '--techne-border-subtle': 'rgba(248, 248, 242, 0.08)',
                '--techne-glass-bg': 'rgba(40, 42, 54, 0.85)',
                '--techne-glass-border': 'rgba(68, 71, 90, 0.40)'
            }
        },

        'monokai': {
            name: 'Monokai',
            description: 'Classic dark theme with green accent',
            bodyClass: 'techne-dark',
            tokens: {
                '--techne-accent': '#a6e22e',
                '--techne-accent-hover': '#f92672',
                '--techne-accent-active': '#8bc218',
                '--techne-bg': '#272822',
                '--techne-surface': '#3e3d32',
                '--techne-surface-elevated': '#49483e',
                '--techne-text': '#f8f8f2',
                '--techne-text-muted': '#75715e',
                '--techne-text-inverted': '#272822',
                '--techne-border': 'rgba(248, 248, 242, 0.18)',
                '--techne-border-subtle': 'rgba(248, 248, 242, 0.08)',
                '--techne-glass-bg': 'rgba(39, 40, 34, 0.85)',
                '--techne-glass-border': 'rgba(62, 61, 50, 0.40)'
            }
        },

        'sepia': {
            name: 'Sepia',
            description: 'Warm reading theme',
            bodyClass: '',
            tokens: {
                '--techne-accent': '#8b4513',
                '--techne-accent-hover': '#a0522d',
                '--techne-accent-active': '#6b3410',
                '--techne-bg': '#f4ecd8',
                '--techne-surface': '#ece4d0',
                '--techne-surface-elevated': '#f4ecd8',
                '--techne-text': '#5b4636',
                '--techne-text-muted': '#8b7355',
                '--techne-text-inverted': '#f4ecd8',
                '--techne-border': 'rgba(91, 70, 54, 0.22)',
                '--techne-border-subtle': 'rgba(91, 70, 54, 0.10)',
                '--techne-glass-bg': 'rgba(244, 236, 216, 0.85)',
                '--techne-glass-border': 'rgba(236, 228, 208, 0.40)'
            }
        },
    };

    // Expose for theme-manager.js (loaded next)
    window._TECHNE_THEMES = THEMES;
})();

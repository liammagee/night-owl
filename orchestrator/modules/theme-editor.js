/**
 * Theme Editor
 * Built-in theme presets and a visual editor for customizing CSS variables.
 * Custom themes are saved to localStorage.
 *
 * @module theme-editor
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'nightowl-custom-themes';
  const ACTIVE_KEY = 'nightowl-active-custom-theme';

  // ── Built-in theme presets ──

  const PRESETS = {
    solarized_light: {
      name: 'Solarized Light',
      base: 'light',
      vars: {
        '--bg-color': '#fdf6e3',
        '--bg-secondary': '#eee8d5',
        '--bg-tertiary': '#e0daca',
        '--text-color': '#657b83',
        '--text-secondary': '#586e75',
        '--text-muted': '#93a1a1',
        '--border-color': '#d5cec0',
        '--primary': '#268bd2',
        '--primary-hover': '#2176b5',
        '--primary-light': 'rgba(38,139,210,0.15)',
        '--surface': '#fdf6e3',
        '--surface-variant': '#eee8d5',
        '--panel-bg': '#fdf6e3',
        '--app-bg': '#eee8d5',
        '--preview-bg': '#fdf6e3',
        '--code-bg': '#eee8d5'
      }
    },
    solarized_dark: {
      name: 'Solarized Dark',
      base: 'dark',
      vars: {
        '--bg-color': '#002b36',
        '--bg-secondary': '#073642',
        '--bg-tertiary': '#0a4050',
        '--text-color': '#839496',
        '--text-secondary': '#93a1a1',
        '--text-muted': '#586e75',
        '--border-color': '#0a4050',
        '--primary': '#268bd2',
        '--primary-hover': '#2176b5',
        '--primary-light': 'rgba(38,139,210,0.2)',
        '--surface': '#073642',
        '--surface-variant': '#002b36',
        '--panel-bg': '#002b36',
        '--app-bg': '#00212b',
        '--preview-bg': '#073642',
        '--code-bg': '#073642'
      }
    },
    nord: {
      name: 'Nord',
      base: 'dark',
      vars: {
        '--bg-color': '#2e3440',
        '--bg-secondary': '#3b4252',
        '--bg-tertiary': '#434c5e',
        '--text-color': '#d8dee9',
        '--text-secondary': '#e5e9f0',
        '--text-muted': '#4c566a',
        '--border-color': '#4c566a',
        '--primary': '#88c0d0',
        '--primary-hover': '#81a1c1',
        '--primary-light': 'rgba(136,192,208,0.15)',
        '--surface': '#3b4252',
        '--surface-variant': '#2e3440',
        '--panel-bg': '#2e3440',
        '--app-bg': '#242933',
        '--preview-bg': '#3b4252',
        '--code-bg': '#3b4252'
      }
    },
    monokai: {
      name: 'Monokai',
      base: 'dark',
      vars: {
        '--bg-color': '#272822',
        '--bg-secondary': '#3e3d32',
        '--bg-tertiary': '#49483e',
        '--text-color': '#f8f8f2',
        '--text-secondary': '#cfcfc2',
        '--text-muted': '#75715e',
        '--border-color': '#49483e',
        '--primary': '#a6e22e',
        '--primary-hover': '#8dc820',
        '--primary-light': 'rgba(166,226,46,0.15)',
        '--surface': '#3e3d32',
        '--surface-variant': '#272822',
        '--panel-bg': '#272822',
        '--app-bg': '#1e1f1a',
        '--preview-bg': '#3e3d32',
        '--code-bg': '#3e3d32'
      }
    },
    sepia: {
      name: 'Sepia',
      base: 'light',
      vars: {
        '--bg-color': '#f5f0e8',
        '--bg-secondary': '#ebe4d8',
        '--bg-tertiary': '#e0d8c8',
        '--text-color': '#5b4636',
        '--text-secondary': '#7a6652',
        '--text-muted': '#a08c78',
        '--border-color': '#d5c8b8',
        '--primary': '#8b6914',
        '--primary-hover': '#755810',
        '--primary-light': 'rgba(139,105,20,0.15)',
        '--surface': '#f5f0e8',
        '--surface-variant': '#ebe4d8',
        '--panel-bg': '#f5f0e8',
        '--app-bg': '#ebe4d8',
        '--preview-bg': '#f5f0e8',
        '--preview-text': '#5b4636',
        '--code-bg': '#ebe4d8'
      }
    },
    dracula: {
      name: 'Dracula',
      base: 'dark',
      vars: {
        '--bg-color': '#282a36',
        '--bg-secondary': '#343746',
        '--bg-tertiary': '#44475a',
        '--text-color': '#f8f8f2',
        '--text-secondary': '#bfbfbf',
        '--text-muted': '#6272a4',
        '--border-color': '#44475a',
        '--primary': '#bd93f9',
        '--primary-hover': '#a070e0',
        '--primary-light': 'rgba(189,147,249,0.15)',
        '--surface': '#343746',
        '--surface-variant': '#282a36',
        '--panel-bg': '#282a36',
        '--app-bg': '#21222c',
        '--preview-bg': '#343746',
        '--code-bg': '#343746'
      }
    },
    github_light: {
      name: 'GitHub Light',
      base: 'light',
      vars: {
        '--bg-color': '#ffffff',
        '--bg-secondary': '#f6f8fa',
        '--bg-tertiary': '#ebeef1',
        '--text-color': '#1f2328',
        '--text-secondary': '#656d76',
        '--text-muted': '#8b949e',
        '--border-color': '#d0d7de',
        '--primary': '#0969da',
        '--primary-hover': '#0550ae',
        '--primary-light': 'rgba(9,105,218,0.1)',
        '--surface': '#ffffff',
        '--surface-variant': '#f6f8fa',
        '--panel-bg': '#ffffff',
        '--app-bg': '#f6f8fa',
        '--preview-bg': '#ffffff',
        '--code-bg': '#f6f8fa'
      }
    }
  };

  // Editable variable groups
  const VAR_GROUPS = [
    {
      label: 'Background',
      vars: ['--bg-color', '--bg-secondary', '--bg-tertiary', '--app-bg', '--panel-bg', '--preview-bg']
    },
    {
      label: 'Text',
      vars: ['--text-color', '--text-secondary', '--text-muted']
    },
    {
      label: 'Accent',
      vars: ['--primary', '--primary-hover', '--primary-light']
    },
    {
      label: 'Borders',
      vars: ['--border-color', '--border-strong']
    },
    {
      label: 'Surfaces',
      vars: ['--surface', '--surface-variant', '--surface-hover', '--surface-active']
    },
    {
      label: 'Code',
      vars: ['--code-bg', '--code-text']
    }
  ];

  // ── Storage ──

  function loadCustomThemes() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (e) { return {}; }
  }

  function saveCustomThemes(themes) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
    } catch (e) { /* ignore */ }
  }

  function getActiveCustomTheme() {
    try { return localStorage.getItem(ACTIVE_KEY) || null; } catch (e) { return null; }
  }

  function setActiveCustomTheme(id) {
    try {
      if (id) localStorage.setItem(ACTIVE_KEY, id);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch (e) { /* ignore */ }
  }

  // ── Apply theme ──

  function applyThemeVars(vars) {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  }

  function clearThemeVars() {
    const root = document.documentElement;
    for (const group of VAR_GROUPS) {
      for (const v of group.vars) {
        root.style.removeProperty(v);
      }
    }
    // Also clear any extra vars from presets
    const allVars = new Set();
    for (const preset of Object.values(PRESETS)) {
      Object.keys(preset.vars).forEach(v => allVars.add(v));
    }
    allVars.forEach(v => root.style.removeProperty(v));
  }

  function applyPreset(presetId) {
    const preset = PRESETS[presetId];
    if (!preset) return;

    clearThemeVars();

    // Set the base mode (light/dark)
    const body = document.body;
    body.classList.remove('dark-mode', 'light-mode', 'techne-theme');
    body.classList.add(preset.base === 'dark' ? 'dark-mode' : 'light-mode');

    // Apply custom vars on top
    applyThemeVars(preset.vars);

    // Sync Monaco
    if (window.monaco && monaco.editor) {
      monaco.editor.setTheme(preset.base === 'dark' ? 'markdown-dark' : 'markdown-light');
    }

    setActiveCustomTheme('preset:' + presetId);
    window.currentTheme = presetId;
  }

  function applyCustomTheme(themeId) {
    const themes = loadCustomThemes();
    const theme = themes[themeId];
    if (!theme) return;

    clearThemeVars();

    const body = document.body;
    body.classList.remove('dark-mode', 'light-mode', 'techne-theme');
    body.classList.add(theme.base === 'dark' ? 'dark-mode' : 'light-mode');

    applyThemeVars(theme.vars);

    if (window.monaco && monaco.editor) {
      monaco.editor.setTheme(theme.base === 'dark' ? 'markdown-dark' : 'markdown-light');
    }

    setActiveCustomTheme('custom:' + themeId);
    window.currentTheme = themeId;
  }

  function resetToDefault() {
    clearThemeVars();
    setActiveCustomTheme(null);
    // Re-apply the system theme preference
    if (window.applyThemePreference) {
      window.applyThemePreference(window.appSettings?.ui?.theme || 'system');
    }
  }

  // ── UI ──

  function showThemeEditor() {
    const existing = document.getElementById('theme-editor-dialog');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'theme-editor-dialog';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--bg-color,#1e1e1e);color:var(--text-color,#d4d4d4);border-radius:8px;padding:20px;width:550px;max-height:80vh;overflow-y:auto;font-family:system-ui,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.5);';

    function render(editingId) {
      const customThemes = loadCustomThemes();
      const activeTheme = getActiveCustomTheme();

      let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="margin:0;font-size:16px;">Theme Editor</h3>
          <div style="display:flex;gap:8px;">
            <button id="te-reset" style="background:transparent;color:#888;border:1px solid #555;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:12px;">Reset Default</button>
            <button id="te-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:18px;">✕</button>
          </div>
        </div>

        <div style="margin-bottom:16px;">
          <div style="font-size:12px;color:#888;margin-bottom:8px;font-weight:600;">Built-in Themes</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
      `;

      for (const [id, preset] of Object.entries(PRESETS)) {
        const isActive = activeTheme === 'preset:' + id;
        const bgColor = preset.vars['--bg-color'] || '#222';
        const textColor = preset.vars['--text-color'] || '#ddd';
        const accent = preset.vars['--primary'] || '#66f';

        html += `
          <button class="te-preset-btn" data-preset="${id}" style="
            display:flex;flex-direction:column;align-items:center;gap:3px;
            padding:8px 12px;border-radius:6px;cursor:pointer;font-size:11px;
            border:2px solid ${isActive ? accent : 'transparent'};
            background:${bgColor};color:${textColor};
            min-width:70px;
          ">
            <div style="width:40px;height:20px;border-radius:3px;background:${accent};"></div>
            <span>${preset.name}</span>
          </button>
        `;
      }

      html += '</div></div>';

      // Custom themes
      const customIds = Object.keys(customThemes);
      if (customIds.length > 0) {
        html += '<div style="margin-bottom:16px;"><div style="font-size:12px;color:#888;margin-bottom:8px;font-weight:600;">Custom Themes</div><div style="display:flex;flex-wrap:wrap;gap:6px;">';
        for (const id of customIds) {
          const theme = customThemes[id];
          const isActive = activeTheme === 'custom:' + id;
          const bgColor = theme.vars['--bg-color'] || '#222';
          const textColor = theme.vars['--text-color'] || '#ddd';
          const accent = theme.vars['--primary'] || '#66f';
          html += `
            <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
              <button class="te-custom-btn" data-custom="${id}" style="
                display:flex;flex-direction:column;align-items:center;gap:3px;
                padding:8px 12px;border-radius:6px;cursor:pointer;font-size:11px;
                border:2px solid ${isActive ? accent : 'transparent'};
                background:${bgColor};color:${textColor};min-width:70px;
              ">
                <div style="width:40px;height:20px;border-radius:3px;background:${accent};"></div>
                <span>${theme.name}</span>
              </button>
              <div style="display:flex;gap:4px;">
                <button class="te-edit-custom" data-id="${id}" style="background:none;border:none;color:#569cd6;cursor:pointer;font-size:10px;">Edit</button>
                <button class="te-del-custom" data-id="${id}" style="background:none;border:none;color:#f48771;cursor:pointer;font-size:10px;">Delete</button>
              </div>
            </div>
          `;
        }
        html += '</div></div>';
      }

      // Color editor
      if (editingId) {
        const isPreset = editingId.startsWith('preset:');
        const sourceId = editingId.replace(/^(preset|custom):/, '');
        const source = isPreset ? PRESETS[sourceId] : customThemes[sourceId];
        if (source) {
          html += `
            <div style="border-top:1px solid #444;padding-top:12px;margin-top:8px;">
              <div style="font-size:12px;color:#888;margin-bottom:8px;font-weight:600;">Customize: ${source.name}</div>
              <div style="display:flex;gap:8px;margin-bottom:8px;">
                <input id="te-save-name" value="${source.name}" placeholder="Theme name" style="flex:1;background:var(--bg-secondary,#252526);border:1px solid #555;color:var(--text-color,#d4d4d4);padding:6px 8px;border-radius:4px;font-size:12px;">
                <select id="te-base-mode" style="background:var(--bg-secondary,#252526);border:1px solid #555;color:var(--text-color,#d4d4d4);padding:6px 8px;border-radius:4px;font-size:12px;">
                  <option value="light" ${source.base === 'light' ? 'selected' : ''}>Light</option>
                  <option value="dark" ${source.base === 'dark' ? 'selected' : ''}>Dark</option>
                </select>
              </div>
          `;

          const computed = getComputedStyle(document.documentElement);
          for (const group of VAR_GROUPS) {
            html += `<div style="margin-bottom:8px;"><div style="font-size:11px;color:#888;margin-bottom:4px;">${group.label}</div><div style="display:flex;flex-wrap:wrap;gap:6px;">`;
            for (const varName of group.vars) {
              const currentVal = source.vars[varName] || computed.getPropertyValue(varName).trim() || '#000000';
              // Normalize to hex if possible
              html += `
                <label style="display:flex;align-items:center;gap:4px;font-size:11px;">
                  <input type="color" class="te-color-input" data-var="${varName}" value="${toHex(currentVal)}" style="width:24px;height:24px;border:none;cursor:pointer;background:none;padding:0;">
                  <span style="opacity:0.6;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${varName}">${varName.replace('--', '')}</span>
                </label>
              `;
            }
            html += '</div></div>';
          }

          html += `
              <div style="display:flex;gap:8px;margin-top:12px;">
                <button id="te-save-custom" style="background:#569cd6;color:#fff;border:none;border-radius:4px;padding:6px 16px;cursor:pointer;font-size:12px;">Save as Custom Theme</button>
                <button id="te-preview" style="background:transparent;color:#888;border:1px solid #555;border-radius:4px;padding:6px 16px;cursor:pointer;font-size:12px;">Preview</button>
              </div>
            </div>
          `;
        }
      } else {
        html += `
          <div style="border-top:1px solid #444;padding-top:12px;margin-top:8px;">
            <button id="te-new-custom" style="background:transparent;color:#569cd6;border:1px solid #569cd6;border-radius:4px;padding:6px 16px;cursor:pointer;font-size:12px;width:100%;">+ Create Custom Theme from Current</button>
          </div>
        `;
      }

      dialog.innerHTML = html;

      // Wire events
      dialog.querySelector('#te-close').addEventListener('click', () => overlay.remove());
      dialog.querySelector('#te-reset').addEventListener('click', () => { resetToDefault(); render(null); });

      dialog.querySelectorAll('.te-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => { applyPreset(btn.dataset.preset); render(null); });
      });

      dialog.querySelectorAll('.te-custom-btn').forEach(btn => {
        btn.addEventListener('click', () => { applyCustomTheme(btn.dataset.custom); render(null); });
      });

      dialog.querySelectorAll('.te-edit-custom').forEach(btn => {
        btn.addEventListener('click', () => render('custom:' + btn.dataset.id));
      });

      dialog.querySelectorAll('.te-del-custom').forEach(btn => {
        btn.addEventListener('click', () => {
          const themes = loadCustomThemes();
          delete themes[btn.dataset.id];
          saveCustomThemes(themes);
          if (getActiveCustomTheme() === 'custom:' + btn.dataset.id) resetToDefault();
          render(null);
        });
      });

      const newBtn = dialog.querySelector('#te-new-custom');
      if (newBtn) {
        newBtn.addEventListener('click', () => {
          // Capture current computed values
          const computed = getComputedStyle(document.documentElement);
          const vars = {};
          for (const group of VAR_GROUPS) {
            for (const v of group.vars) {
              vars[v] = computed.getPropertyValue(v).trim();
            }
          }
          const isDark = document.body.classList.contains('dark-mode');
          const id = 'custom-' + Date.now();
          const themes = loadCustomThemes();
          themes[id] = { name: 'My Theme', base: isDark ? 'dark' : 'light', vars };
          saveCustomThemes(themes);
          render('custom:' + id);
        });
      }

      // Color editor events
      dialog.querySelectorAll('.te-color-input').forEach(input => {
        input.addEventListener('input', () => {
          document.documentElement.style.setProperty(input.dataset.var, input.value);
        });
      });

      const previewBtn = dialog.querySelector('#te-preview');
      if (previewBtn) {
        previewBtn.addEventListener('click', () => {
          dialog.querySelectorAll('.te-color-input').forEach(input => {
            document.documentElement.style.setProperty(input.dataset.var, input.value);
          });
          const baseMode = dialog.querySelector('#te-base-mode')?.value || 'dark';
          document.body.classList.remove('dark-mode', 'light-mode');
          document.body.classList.add(baseMode === 'dark' ? 'dark-mode' : 'light-mode');
          if (window.monaco && monaco.editor) {
            monaco.editor.setTheme(baseMode === 'dark' ? 'markdown-dark' : 'markdown-light');
          }
        });
      }

      const saveBtn = dialog.querySelector('#te-save-custom');
      if (saveBtn && editingId) {
        saveBtn.addEventListener('click', () => {
          const name = dialog.querySelector('#te-save-name')?.value || 'Custom Theme';
          const base = dialog.querySelector('#te-base-mode')?.value || 'dark';
          const vars = {};
          dialog.querySelectorAll('.te-color-input').forEach(input => {
            vars[input.dataset.var] = input.value;
          });

          const themes = loadCustomThemes();
          const id = editingId.startsWith('custom:') ? editingId.replace('custom:', '') : 'custom-' + Date.now();
          themes[id] = { name, base, vars };
          saveCustomThemes(themes);
          applyCustomTheme(id);
          render(null);

          if (window.showNotification) window.showNotification(`Theme "${name}" saved`, 'success');
        });
      }
    }

    render(null);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
    });
  }

  function toHex(color) {
    if (!color || color === 'transparent') return '#000000';
    if (color.startsWith('#')) {
      if (color.length === 4) {
        return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
      }
      return color.slice(0, 7);
    }
    // Try to parse rgb/rgba
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const r = parseInt(match[1]).toString(16).padStart(2, '0');
      const g = parseInt(match[2]).toString(16).padStart(2, '0');
      const b = parseInt(match[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
    return '#000000';
  }

  // ── Restore on load ──

  function restoreTheme() {
    const active = getActiveCustomTheme();
    if (!active) return;

    if (active.startsWith('preset:')) {
      const id = active.replace('preset:', '');
      if (PRESETS[id]) {
        setTimeout(() => applyPreset(id), 300);
      }
    } else if (active.startsWith('custom:')) {
      const id = active.replace('custom:', '');
      setTimeout(() => applyCustomTheme(id), 300);
    }
  }

  // ── Init ──

  function init() {
    restoreTheme();

    if (window.commandPaletteCommands) {
      window.commandPaletteCommands.push({
        name: 'View: Open Theme Editor',
        action: showThemeEditor
      });

      // Quick-apply presets from command palette
      for (const [id, preset] of Object.entries(PRESETS)) {
        window.commandPaletteCommands.push({
          name: `Theme: Apply ${preset.name}`,
          action: () => applyPreset(id)
        });
      }

      window.commandPaletteCommands.push({
        name: 'Theme: Reset to Default',
        action: resetToDefault
      });
    }
  }

  // ── Delegate to plugin when available ──

  const pluginEditor = window.techneThemeEditor;
  const pluginUI     = window.techneThemeEditorUI;

  window.themeEditor = {
    showEditor: pluginUI ? pluginUI.show : showThemeEditor,
    applyPreset: pluginEditor ? pluginEditor.applyPreset : applyPreset,
    resetToDefault: pluginEditor ? pluginEditor.resetToDefault : resetToDefault,
    getPresets: pluginEditor ? pluginEditor.getPresets : () => ({ ...PRESETS }),
    getCustomThemes: pluginEditor ? pluginEditor.loadCustomThemes : loadCustomThemes
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }
})();

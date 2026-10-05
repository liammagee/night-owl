/* Techne Theme Editor UI
   Portable vanilla JS dialog for browsing/editing themes.
   Works in both browser (website) and Electron (NightOwl).
   Depends on theme-editor.js (window.techneThemeEditor).
*/

(function () {
    'use strict';

    const DIALOG_ID = 'techne-theme-editor-dialog';

    function showThemeEditor() {
        const editor = window.techneThemeEditor;
        if (!editor) {
            console.warn('[techne-theme-editor-ui] theme-editor.js not loaded');
            return;
        }

        // Remove existing dialog
        const existing = document.getElementById(DIALOG_ID);
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = DIALOG_ID;
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Theme Editor');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;';

        const dialog = document.createElement('div');
        dialog.setAttribute('tabindex', '-1');
        dialog.style.cssText = 'background:var(--techne-bg);color:var(--techne-text);border-radius:8px;padding:20px;width:550px;max-width:90vw;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.5);';

        function render(editingId) {
            const PRESETS = editor.getPresets();
            const VAR_GROUPS = editor.getVarGroups();
            const customThemes = editor.loadCustomThemes();
            const activeTheme = editor.getActiveCustomTheme();

            let html = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h3 style="margin:0;font-size:16px;">Theme Editor</h3>
                    <div style="display:flex;gap:8px;">
                        <button type="button" id="te-reset" style="background:transparent;color:var(--techne-text-muted);border:1px solid var(--techne-border);border-radius:4px;padding:4px 12px;cursor:pointer;font-size:12px;">Reset Default</button>
                        <button type="button" id="te-close" style="background:none;border:none;color:var(--techne-text-muted);cursor:pointer;font-size:18px;" aria-label="Close theme editor">&#x2715;</button>
                    </div>
                </div>

                <div style="margin-bottom:16px;">
                    <div style="font-size:12px;color:var(--techne-text-muted);margin-bottom:8px;font-weight:600;">Built-in Themes</div>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;">
            `;

            // Built-in theme buttons
            const themeManager = window.techneThemeManager;
            const builtInThemes = themeManager ? themeManager.getThemes() : {};
            for (const [id, theme] of Object.entries(builtInThemes)) {
                const isActive = themeManager && themeManager.getActiveTheme() === id;
                const resolved = window.TechneThemeContract.resolveTheme(theme);
                const accent = resolved['--techne-accent'];
                const bg = resolved['--techne-bg'];
                const text = resolved['--techne-text'];

                html += `
                    <button type="button" class="te-builtin-btn" data-theme="${id}" style="
                        display:flex;flex-direction:column;align-items:center;gap:3px;
                        padding:8px 12px;border-radius:6px;cursor:pointer;font-size:11px;
                        border:2px solid ${isActive ? accent : 'transparent'};
                        background:${bg};color:${text};min-width:70px;
                    ">
                        <div style="width:40px;height:20px;border-radius:3px;background:${accent};"></div>
                        <span>${theme.name}</span>
                    </button>
                `;
            }

            html += '</div></div>';

            // Preset theme buttons
            html += `
                <div style="margin-bottom:16px;">
                    <div style="font-size:12px;color:var(--techne-text-muted);margin-bottom:8px;font-weight:600;">Color Presets</div>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;">
            `;

            for (const [id, preset] of Object.entries(PRESETS)) {
                const isActive = activeTheme === 'preset:' + id;
                const resolved = window.TechneThemeContract.resolveTheme({ colorScheme: preset.base, vars: preset.vars });
                const bgColor = resolved['--techne-bg'];
                const textColor = resolved['--techne-text'];
                const accent = resolved['--techne-accent'];

                html += `
                    <button type="button" class="te-preset-btn" data-preset="${id}" style="
                        display:flex;flex-direction:column;align-items:center;gap:3px;
                        padding:8px 12px;border-radius:6px;cursor:pointer;font-size:11px;
                        border:2px solid ${isActive ? accent : 'transparent'};
                        background:${bgColor};color:${textColor};min-width:70px;
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
                html += '<div style="margin-bottom:16px;"><div style="font-size:12px;color:var(--techne-text-muted);margin-bottom:8px;font-weight:600;">Custom Themes</div><div style="display:flex;flex-wrap:wrap;gap:6px;">';
                for (const id of customIds) {
                    const theme = customThemes[id];
                    const isActive = activeTheme === 'custom:' + id;
                    const bgColor = theme.vars['--techne-bg'];
                    const textColor = theme.vars['--techne-text'];
                    const accent = theme.vars['--techne-accent'];
                    html += `
                        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                            <button type="button" class="te-custom-btn" data-custom="${id}" style="
                                display:flex;flex-direction:column;align-items:center;gap:3px;
                                padding:8px 12px;border-radius:6px;cursor:pointer;font-size:11px;
                                border:2px solid ${isActive ? accent : 'transparent'};
                                background:${bgColor};color:${textColor};min-width:70px;
                            ">
                                <div style="width:40px;height:20px;border-radius:3px;background:${accent};"></div>
                                <span>${theme.name}</span>
                            </button>
                            <div style="display:flex;gap:4px;">
                                <button type="button" class="te-edit-custom" data-id="${id}" style="background:none;border:none;color:var(--techne-link);cursor:pointer;font-size:10px;">Edit</button>
                                <button type="button" class="te-del-custom" data-id="${id}" style="background:none;border:none;color:var(--techne-error);cursor:pointer;font-size:10px;">Delete</button>
                            </div>
                        </div>
                    `;
                }
                html += '</div></div>';
            }

            // Color editor section
            if (editingId) {
                const isPreset = editingId.startsWith('preset:');
                const sourceId = editingId.replace(/^(preset|custom):/, '');
                const source = isPreset ? PRESETS[sourceId] : customThemes[sourceId];
                if (source) {
                    html += `
                        <div style="border-top:1px solid var(--techne-border);padding-top:12px;margin-top:8px;">
                            <div style="font-size:12px;color:var(--techne-text-muted);margin-bottom:8px;font-weight:600;">Customize: ${source.name}</div>
                            <div style="display:flex;gap:8px;margin-bottom:8px;">
                                <input id="te-save-name" value="${source.name}" placeholder="Theme name" style="flex:1;background:var(--techne-surface);border:1px solid var(--techne-border);color:var(--techne-text);padding:6px 8px;border-radius:4px;font-size:12px;">
                                <select id="te-base-mode" style="background:var(--techne-surface);border:1px solid var(--techne-border);color:var(--techne-text);padding:6px 8px;border-radius:4px;font-size:12px;">
                                    <option value="light" ${source.base === 'light' ? 'selected' : ''}>Light</option>
                                    <option value="dark" ${source.base === 'dark' ? 'selected' : ''}>Dark</option>
                                </select>
                            </div>
                    `;

                    const computed = getComputedStyle(document.documentElement);
                    for (const group of VAR_GROUPS) {
                        html += `<div style="margin-bottom:8px;"><div style="font-size:11px;color:var(--techne-text-muted);margin-bottom:4px;">${group.label}</div><div style="display:flex;flex-wrap:wrap;gap:6px;">`;
                        for (const varName of group.vars) {
                            const currentVal = source.vars[varName] || computed.getPropertyValue(varName).trim() || '#000000';
                            html += `
                                <label style="display:flex;align-items:center;gap:4px;font-size:11px;">
                                    <input type="color" class="te-color-input" data-var="${varName}" value="${editor.toHex(currentVal)}" style="width:24px;height:24px;border:none;cursor:pointer;background:none;padding:0;">
                                    <span style="opacity:0.6;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${varName}">${varName.replace('--techne-', '')}</span>
                                </label>
                            `;
                        }
                        html += '</div></div>';
                    }

                    html += `
                            <div id="te-validation" role="status" aria-live="polite" style="margin-top:10px;padding:8px;border-radius:4px;background:var(--techne-info-surface);color:var(--techne-info);font-size:11px;"></div>
                            <div style="display:flex;gap:8px;margin-top:12px;">
                                <button type="button" id="te-save-custom" style="background:var(--techne-accent);color:var(--techne-text-on-accent);border:none;border-radius:4px;padding:6px 16px;cursor:pointer;font-size:12px;">Save as Custom Theme</button>
                                <button type="button" id="te-preview" style="background:transparent;color:var(--techne-text-muted);border:1px solid var(--techne-border);border-radius:4px;padding:6px 16px;cursor:pointer;font-size:12px;">Preview</button>
                            </div>
                        </div>
                    `;
                }
            } else {
                html += `
                    <div style="border-top:1px solid var(--techne-border);padding-top:12px;margin-top:8px;">
                        <button type="button" id="te-new-custom" style="background:transparent;color:var(--techne-link);border:1px solid var(--techne-border);border-radius:4px;padding:6px 16px;cursor:pointer;font-size:12px;width:100%;">+ Create Custom Theme from Current</button>
                    </div>
                `;
            }

            // Export / Import
            html += `
                <div style="border-top:1px solid var(--techne-border);padding-top:12px;margin-top:12px;display:flex;gap:8px;">
                    <button type="button" id="te-export" style="background:transparent;color:var(--techne-text-muted);border:1px solid var(--techne-border);border-radius:4px;padding:4px 12px;cursor:pointer;font-size:11px;">Export Themes</button>
                    <label style="background:transparent;color:var(--techne-text-muted);border:1px solid var(--techne-border);border-radius:4px;padding:4px 12px;cursor:pointer;font-size:11px;">
                        Import Themes
                        <input type="file" id="te-import" accept=".json" style="display:none;">
                    </label>
                </div>
            `;

            dialog.innerHTML = html;

            function collectEditingTheme() {
                if (!editingId) return null;
                const vars = {};
                dialog.querySelectorAll('.te-color-input').forEach(input => {
                    vars[input.dataset.var] = input.value;
                });
                return {
                    name: dialog.querySelector('#te-save-name')?.value || 'Custom Theme',
                    description: 'Custom NightOwl theme',
                    base: dialog.querySelector('#te-base-mode')?.value || 'dark',
                    vars
                };
            }

            function updateValidation() {
                const region = dialog.querySelector('#te-validation');
                const save = dialog.querySelector('#te-save-custom');
                if (!region || !editingId) return null;
                const validationId = editingId.startsWith('custom:')
                    ? editingId.replace('custom:', '')
                    : 'custom-preview';
                const report = editor.validateCustomTheme(validationId, collectEditingTheme());
                region.textContent = report.valid
                    ? `Passes theme contract v${window.TechneThemeContract?.VERSION || 1}.`
                    : report.issues.map(issue => issue.ratio == null
                        ? issue.label
                        : `${issue.label}: ${issue.ratio}:1 (needs ${issue.minimum}:1)`).join(' · ');
                region.style.background = report.valid ? 'var(--techne-success-surface)' : 'var(--techne-error-surface)';
                region.style.color = report.valid ? 'var(--techne-success)' : 'var(--techne-error)';
                if (save) save.disabled = !report.valid;
                return report;
            }

            // ── Wire events ──

            dialog.querySelector('#te-close').addEventListener('click', () => overlay.remove());
            dialog.querySelector('#te-reset').addEventListener('click', () => { editor.resetToDefault(); render(null); });

            // Built-in theme buttons
            dialog.querySelectorAll('.te-builtin-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (window.techneThemeManager) {
                        editor.clearThemeVars();
                        editor.setActiveCustomTheme(null);
                        window.techneThemeManager.applyTheme(btn.dataset.theme);
                    }
                    render(null);
                });
            });

            // Preset buttons
            dialog.querySelectorAll('.te-preset-btn').forEach(btn => {
                btn.addEventListener('click', () => { editor.applyPreset(btn.dataset.preset); render(null); });
            });

            // Custom theme buttons
            dialog.querySelectorAll('.te-custom-btn').forEach(btn => {
                btn.addEventListener('click', () => { editor.applyCustomTheme(btn.dataset.custom); render(null); });
            });

            dialog.querySelectorAll('.te-edit-custom').forEach(btn => {
                btn.addEventListener('click', () => render('custom:' + btn.dataset.id));
            });

            dialog.querySelectorAll('.te-del-custom').forEach(btn => {
                btn.addEventListener('click', () => {
                    const themes = editor.loadCustomThemes();
                    delete themes[btn.dataset.id];
                    editor.saveCustomThemes(themes);
                    if (editor.getActiveCustomTheme() === 'custom:' + btn.dataset.id) editor.resetToDefault();
                    render(null);
                });
            });

            // New custom theme
            const newBtn = dialog.querySelector('#te-new-custom');
            if (newBtn) {
                newBtn.addEventListener('click', () => {
                    const computed = getComputedStyle(document.documentElement);
                    const vars = {};
                    for (const group of VAR_GROUPS) {
                        for (const v of group.vars) {
                            vars[v] = computed.getPropertyValue(v).trim();
                        }
                    }
                    const isDark = document.body.classList.contains('techne-dark') ||
                                   document.body.classList.contains('dark-mode');
                    const id = 'custom-' + Date.now();
                    const themes = editor.loadCustomThemes();
                    themes[id] = { name: 'My Theme', base: isDark ? 'dark' : 'light', vars };
                    editor.saveCustomThemes(themes);
                    render('custom:' + id);
                });
            }

            // Live color editing
            dialog.querySelectorAll('.te-color-input').forEach(input => {
                input.addEventListener('input', () => {
                    document.documentElement.style.setProperty(input.dataset.var, input.value);
                    updateValidation();
                });
            });
            dialog.querySelector('#te-base-mode')?.addEventListener('change', updateValidation);
            dialog.querySelector('#te-save-name')?.addEventListener('input', updateValidation);
            updateValidation();

            // Preview button
            const previewBtn = dialog.querySelector('#te-preview');
            if (previewBtn) {
                previewBtn.addEventListener('click', () => {
                    const vars = {};
                    dialog.querySelectorAll('.te-color-input').forEach(input => {
                        vars[input.dataset.var] = input.value;
                    });
                    editor.applyThemeVars(vars);

                    const baseMode = dialog.querySelector('#te-base-mode')?.value || 'dark';
                    if (window.techneThemeManager) {
                        window.techneThemeManager.applyTheme(baseMode === 'dark' ? 'dark' : 'light');
                    }
                    editor.applyThemeVars(vars);
                });
            }

            // Save button
            const saveBtn = dialog.querySelector('#te-save-custom');
            if (saveBtn && editingId) {
                saveBtn.addEventListener('click', () => {
                    const themes = editor.loadCustomThemes();
                    const id = editingId.startsWith('custom:') ? editingId.replace('custom:', '') : 'custom-' + Date.now();
                    themes[id] = collectEditingTheme();
                    const result = editor.saveCustomThemes(themes);
                    if (!result.valid) {
                        updateValidation();
                        return;
                    }
                    editor.applyCustomTheme(id);
                    render(null);
                });
            }

            // Export
            const exportBtn = dialog.querySelector('#te-export');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => {
                    const data = {
                        version: window.TechneThemeContract?.VERSION || 1,
                        customThemes: editor.loadCustomThemes(),
                        activeCustomTheme: editor.getActiveCustomTheme()
                    };
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'techne-themes.json';
                    a.click();
                    URL.revokeObjectURL(url);
                });
            }

            // Import
            const importInput = dialog.querySelector('#te-import');
            if (importInput) {
                importInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        try {
                            const data = JSON.parse(ev.target.result);
                            const supportedVersion = window.TechneThemeContract?.VERSION || 1;
                            if (data.version && data.version > supportedVersion) {
                                throw new Error(`Theme contract v${data.version} is newer than supported v${supportedVersion}`);
                            }
                            if (data.customThemes && typeof data.customThemes === 'object') {
                                const existing = editor.loadCustomThemes();
                                const merged = { ...existing, ...data.customThemes };
                                const result = editor.saveCustomThemes(merged);
                                if (!result.valid) throw new Error('One or more imported themes do not conform');
                                render(null);
                            }
                        } catch (error) {
                            console.warn('[techne-theme-editor-ui] Invalid theme file', error);
                            window.showNotification?.(error.message || 'Invalid theme file', 'error');
                        }
                    };
                    reader.readAsText(file);
                });
            }
        }

        render(null);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Focus the dialog for keyboard accessibility
        const previousActiveElement = document.activeElement;
        dialog.focus();

        // Close on overlay click or Escape, and trap focus within dialog
        overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); previousActiveElement?.focus(); } });
        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Escape') {
                overlay.remove();
                previousActiveElement?.focus();
                document.removeEventListener('keydown', handler);
            }
            // Focus trap: cycle focus within dialog
            if (e.key === 'Tab') {
                const focusable = dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                if (focusable.length === 0) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        });
    }

    // ── Register NightOwl actions ──
    if (typeof window.registerCommand === 'function') {
        window.registerCommand('theme.open', 'View: Open Theme Editor', showThemeEditor);

        const editor = window.techneThemeEditor;
        if (editor) {
            const presets = editor.getPresets();
            for (const [id, preset] of Object.entries(presets)) {
                window.registerCommand(
                    `theme.apply.${id}`,
                    `Theme: Apply ${preset.name}`,
                    () => editor.applyPreset(id)
                );
            }
        }

        window.registerCommand('theme.reset', 'Theme: Reset to Default', () => {
            window.techneThemeEditor?.resetToDefault();
        });
    }

    // ── Public API ──
    window.techneThemeEditorUI = {
        show: showThemeEditor
    };
})();

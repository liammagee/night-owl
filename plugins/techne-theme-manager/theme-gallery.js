/* Accessible all-theme component gallery and deterministic review surface. */

(function () {
    'use strict';

    const GALLERY_ID = 'techne-theme-conformance-gallery';
    let previousThemeId = null;
    let selectedThemeId = null;
    let committed = false;

    function escapeHTML(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getState() {
        const manager = window.techneThemeManager;
        const themes = manager?.getThemes?.() || {};
        const report = manager?.getConformanceReport?.() || window.TechneThemeContract?.validateAll(themes);
        return { manager, themes, report };
    }

    function componentMarkup(themeName) {
        return `
            <div class="techne-gallery-grid" data-theme-name="${escapeHTML(themeName)}">
                <section class="techne-gallery-card techne-gallery-card-raised">
                    <h3>Surface hierarchy</h3>
                    <div class="techne-gallery-surface-strip">
                        <span>Canvas</span><span>Panel</span><span>Raised</span>
                    </div>
                </section>
                <section class="techne-gallery-card">
                    <h3>Typography and links</h3>
                    <p>Primary text remains readable across the product.</p>
                    <p class="techne-gallery-muted">Muted text still conveys useful metadata.</p>
                    <a class="techne-gallery-link" href="#theme-gallery-link">Accessible link</a>
                </section>
                <section class="techne-gallery-card">
                    <h3>Button states</h3>
                    <div class="techne-gallery-control-row">
                        <button class="techne-gallery-button techne-gallery-button-primary">Default</button>
                        <button class="techne-gallery-button" data-state="hover">Hover</button>
                        <button class="techne-gallery-button" data-state="active">Active</button>
                        <button class="techne-gallery-button" disabled>Disabled</button>
                    </div>
                </section>
                <section class="techne-gallery-card techne-gallery-card-raised">
                    <h3>Inputs and focus</h3>
                    <div class="techne-gallery-control-row">
                        <input class="techne-gallery-input" placeholder="Readable placeholder" aria-label="Example input">
                        <input class="techne-gallery-input" value="Invalid value" aria-invalid="true" aria-label="Invalid example input">
                    </div>
                </section>
                <section class="techne-gallery-card">
                    <h3>Lists and selection</h3>
                    <div class="techne-gallery-list">
                        <div class="techne-gallery-list-row">Default item</div>
                        <div class="techne-gallery-list-row" data-state="hover">Hover item</div>
                        <div class="techne-gallery-list-row" data-state="selected">Selected item</div>
                    </div>
                </section>
                <section class="techne-gallery-card techne-gallery-card-raised">
                    <h3>Semantic status</h3>
                    <div class="techne-gallery-status-row">
                        <span class="techne-gallery-status techne-gallery-status-success">Success</span>
                        <span class="techne-gallery-status techne-gallery-status-warning">Warning</span>
                        <span class="techne-gallery-status techne-gallery-status-error">Error</span>
                        <span class="techne-gallery-status techne-gallery-status-info">Information</span>
                    </div>
                </section>
            </div>
        `;
    }

    function renderThemeButtons(themes, report) {
        const results = new Map((report?.results || []).map(result => [result.id, result]));
        return Object.entries(themes).map(([themeId, theme]) => {
            const result = results.get(themeId);
            const accent = window.TechneThemeContract?.resolveTheme(theme)?.['--techne-accent'] || 'transparent';
            return `
                <button class="techne-gallery-theme-button" data-theme-id="${escapeHTML(themeId)}"
                    aria-pressed="${themeId === selectedThemeId}">
                    <span class="techne-gallery-theme-swatch" style="--theme-swatch:${escapeHTML(accent)}"></span>
                    <span>${escapeHTML(theme.name)}</span>
                    <span class="techne-gallery-theme-result" data-valid="${Boolean(result?.valid)}"
                        aria-label="${result?.valid ? 'Conformant' : 'Non-conformant'}">${result?.valid ? 'PASS' : 'FAIL'}</span>
                </button>
            `;
        }).join('');
    }

    function refreshGallery() {
        const gallery = document.querySelector(`#${GALLERY_ID}`);
        if (!gallery) return;
        const { themes, report } = getState();
        gallery.querySelector('.techne-gallery-themes').innerHTML = renderThemeButtons(themes, report);
        gallery.querySelector('.techne-gallery-canvas').innerHTML = componentMarkup(themes[selectedThemeId]?.name || selectedThemeId);
        gallery.querySelectorAll('.techne-gallery-theme-button').forEach(button => {
            button.addEventListener('click', () => selectTheme(button.dataset.themeId));
        });
    }

    function selectTheme(themeId) {
        const { manager, themes } = getState();
        if (!themes[themeId]) return false;
        if (manager?.applyTheme?.(themeId) === false) return false;
        selectedThemeId = themeId;
        refreshGallery();
        return true;
    }

    function closeGallery(options = {}) {
        const gallery = document.querySelector(`#${GALLERY_ID}`);
        if (!gallery) return;
        if (!committed && options.restore !== false && previousThemeId) {
            window.techneThemeManager?.applyTheme?.(previousThemeId);
        }
        gallery.remove();
        previousThemeId = null;
        selectedThemeId = null;
        committed = false;
    }

    function openGallery(themeId) {
        closeGallery();
        const { manager, themes, report } = getState();
        if (!manager || Object.keys(themes).length === 0) return false;

        previousThemeId = manager.getActiveTheme?.() || Object.keys(themes)[0];
        selectedThemeId = themes[themeId] ? themeId : previousThemeId;
        committed = false;

        const overlay = document.createElement('div');
        overlay.id = GALLERY_ID;
        overlay.className = 'techne-theme-gallery-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'techne-theme-gallery-heading');
        overlay.innerHTML = `
            <div class="techne-theme-gallery" data-contract-version="${window.TechneThemeContract?.VERSION || ''}">
                <header class="techne-theme-gallery-header">
                    <div class="techne-theme-gallery-title">
                        <h2 id="techne-theme-gallery-heading">Theme conformance gallery</h2>
                        <p>${report?.themeCount || 0} built-in themes · contract v${window.TechneThemeContract?.VERSION || ''}</p>
                    </div>
                    <div class="techne-theme-gallery-actions">
                        <button class="techne-gallery-button techne-gallery-apply">Use this theme</button>
                        <button class="techne-gallery-button techne-gallery-close" aria-label="Close theme gallery">Close</button>
                    </div>
                </header>
                <div class="techne-gallery-body">
                    <nav class="techne-gallery-themes" aria-label="Built-in themes"></nav>
                    <section class="techne-gallery-canvas" aria-label="Theme component preview"></section>
                </div>
            </div>
        `;
        overlay.addEventListener('click', event => {
            if (event.target === overlay) closeGallery();
        });
        overlay.querySelector('.techne-gallery-close').addEventListener('click', () => closeGallery());
        overlay.querySelector('.techne-gallery-apply').addEventListener('click', () => {
            committed = true;
            closeGallery({ restore: false });
        });
        overlay.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeGallery();
            }
        });
        document.body.appendChild(overlay);
        selectTheme(selectedThemeId);
        overlay.querySelector('.techne-gallery-close').focus();
        return true;
    }

    window.TechneThemeGallery = Object.freeze({
        open: openGallery,
        close: closeGallery,
        select: selectTheme,
        getSelectedTheme: () => selectedThemeId
    });

    if (typeof window.registerCommand === 'function') {
        window.registerCommand('theme.gallery', 'View: Open Theme Conformance Gallery', () => openGallery());
    }
})();

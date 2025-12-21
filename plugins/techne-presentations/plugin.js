(function () {
    const PLUGIN_ID = 'techne-presentations';
    const BASE = 'plugins/techne-presentations';

    const ensureSpeakerNotesPanel = () => {
        if (document.getElementById('speaker-notes-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'speaker-notes-panel';
        panel.style.display = 'none';

        panel.innerHTML = `
            <div id="speaker-notes-resize-handle" style="position: absolute; top: 0; left: 0; right: 0; height: 8px; cursor: ns-resize;"></div>
            <div style="margin: 16px 16px 8px 16px; padding-top: 8px;">
                <h4 style="margin: 0; font-size: 14px;">📝 Speaker Notes</h4>
            </div>
            <div id="current-slide-notes" style="font-size: 13px; line-height: 1.4; padding: 0 16px 16px 16px; overflow-y: auto; height: calc(100% - 60px);">
                <em>No speaker notes for this slide.</em>
            </div>
        `;

        document.body.appendChild(panel);
    };

    const register = () => {
        if (!window.TechnePlugins?.register) return;

        window.TechnePlugins.register({
            id: PLUGIN_ID,
            init: async (host) => {
                ensureSpeakerNotesPanel();

                await host.loadCSS(`${BASE}/preview-presentation.css`, { id: `${PLUGIN_ID}-preview-css` });
                await host.loadCSS(`${BASE}/speaker-notes.css`, { id: `${PLUGIN_ID}-notes-css` });

                const scripts = [
                    `${BASE}/ttsService.js`,
                    `${BASE}/videoRecordingService.js`,
                    `${BASE}/speaker-notes.js`,
                    `${BASE}/touch-gestures.js`
                ];

                const hasGlobalReact = Boolean(window.React && window.ReactDOM);
                if (hasGlobalReact && !window.MarkdownPreziApp) {
                    scripts.push(`${BASE}/MarkdownPreziApp.js`);
                }

                await host.loadScriptsSequential(scripts);
                if (typeof window.setupSpeakerNotesResize === 'function') {
                    try {
                        window.setupSpeakerNotesResize();
                    } catch (error) {
                        host.warn('setupSpeakerNotesResize failed:', error);
                    }
                }
                host.emit('presentations:ready', { id: PLUGIN_ID });
            }
        });
    };

    register();
})();

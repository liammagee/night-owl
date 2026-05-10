(function () {
    const PLUGIN_ID = 'techne-presentations';
    const BASE = 'plugins/techne-presentations';
    const VERSION = '20251222g'; // Bump this to bust cache
    const reactRoots = new WeakMap();

    const cacheBust = (url) => `${url}?v=${VERSION}`;

    const getReactRuntime = () => {
        const react = window.React;
        const reactDOM = window.ReactDOM;
        const canCreateElement = typeof react?.createElement === 'function';
        const canCreateRoot = typeof reactDOM?.createRoot === 'function';
        const canLegacyRender = typeof reactDOM?.render === 'function';

        if (!canCreateElement || (!canCreateRoot && !canLegacyRender)) {
            return null;
        }

        return { react, reactDOM, canCreateRoot, canLegacyRender };
    };

    const renderPresentation = (container, props = {}) => {
        const runtime = getReactRuntime();
        if (!runtime || !window.MarkdownPreziApp) {
            throw new Error('Presentation runtime missing');
        }

        const element = runtime.react.createElement(window.MarkdownPreziApp, props);
        if (runtime.canCreateRoot) {
            let root = reactRoots.get(container);
            if (!root) {
                root = runtime.reactDOM.createRoot(container);
                reactRoots.set(container, root);
            }
            root.render(element);
            return {
                unmount: () => {
                    root.unmount();
                    reactRoots.delete(container);
                }
            };
        }

        runtime.reactDOM.render(element, container);
        return {
            unmount: () => {
                runtime.reactDOM.unmountComponentAtNode?.(container);
            }
        };
    };

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

                await host.loadCSS(cacheBust(`${BASE}/preview-presentation.css`), { id: `${PLUGIN_ID}-preview-css` });
                await host.loadCSS(cacheBust(`${BASE}/speaker-notes.css`), { id: `${PLUGIN_ID}-notes-css` });

                const scripts = [
                    cacheBust(`${BASE}/ttsService.js`),
                    cacheBust(`${BASE}/videoRecordingService.js`),
                    cacheBust(`${BASE}/speaker-notes.js`),
                    cacheBust(`${BASE}/touch-gestures.js`)
                ];

                const hasGlobalReact = Boolean(getReactRuntime());
                if (hasGlobalReact && !window.MarkdownPreziApp) {
                    scripts.push(cacheBust(`${BASE}/MarkdownPreziApp.js`));
                }

                await host.loadScriptsSequential(scripts);
                if (typeof window.setupSpeakerNotesResize === 'function') {
                    try {
                        window.setupSpeakerNotesResize();
                    } catch (error) {
                        host.warn?.('setupSpeakerNotesResize failed:', error);
                    }
                }

                // Emit mode:available if MarkdownPreziApp is loaded
                if (window.MarkdownPreziApp) {
                    host.log?.(`[${PLUGIN_ID}] MarkdownPreziApp loaded, registering mode`);
                    host.emit('mode:available', {
                        id: 'presentations',
                        title: 'Presentations',
                        icon: '🎭',
                        mount: async (container, options = {}) => {
                            const content = options.content || '# Slide 1\n\nContent here\n\n---\n\n# Slide 2\n\nMore content';
                            const root = renderPresentation(container, {
                                markdown: content,
                                onClose: options.onClose || (() => {})
                            });
                            return { root, container };
                        },
                        unmount: (view) => {
                            if (view && view.root) {
                                view.root.unmount();
                            }
                        }
                    });
                }

                host.emit('presentations:ready', { id: PLUGIN_ID });
            }
        });
    };

    register();
})();

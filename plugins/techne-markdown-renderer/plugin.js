(function () {
    const PLUGIN_ID = 'techne-markdown-renderer';
    const BASE = 'plugins/techne-markdown-renderer';
    const VERSION = '20260124a'; // Cache bust version

    const register = () => {
        if (!window.TechnePlugins?.register) return;

        window.TechnePlugins.register({
            id: PLUGIN_ID,
            init: async (host) => {
                await host.loadCSS(`${BASE}/techne-markdown-renderer.css?v=${VERSION}`, { id: `${PLUGIN_ID}-css` });

                const scripts = [];
                if (!window.previewZoom) scripts.push(`${BASE}/previewZoom.js?v=${VERSION}`);
                if (!window.TechneBibtexParser) scripts.push(`${BASE}/bibtexParser.js?v=${VERSION}`);
                if (!window.TechneCitationRenderer) scripts.push(`${BASE}/citationRenderer.js?v=${VERSION}`);
                if (!window.TechneMarkdownRenderer) scripts.push(`${BASE}/techne-markdown-renderer.js?v=${VERSION}`);

                if (scripts.length) {
                    await host.loadScriptsSequential(scripts);
                }

                // Inject citation renderer CSS
                if (window.TechneCitationRenderer?.getCSS) {
                    const style = document.createElement('style');
                    style.id = `${PLUGIN_ID}-citation-css`;
                    style.textContent = window.TechneCitationRenderer.getCSS();
                    document.head.appendChild(style);
                }

                // Auto-load bibliography files
                if (window.TechneBibtexParser && !window.bibEntries?.length) {
                    const resolveBibPath = async (filename) => {
                        if (!window.electronAPI?.invoke) {
                            return filename;
                        }

                        const workingDir = window.appSettings?.workingDirectory || '';
                        const baseName = workingDir.split(/[\/]/).pop();
                        const candidateDirs = [''];
                        if (baseName) {
                            if (baseName !== 'lectures') candidateDirs.push('lectures');
                            if (baseName !== 'markdown') candidateDirs.push('markdown');
                        } else {
                            candidateDirs.push('lectures', 'markdown');
                        }

                        for (const dir of candidateDirs) {
                            try {
                                const files = await window.electronAPI.invoke('list-directory-files', dir);
                                if (files?.some(file => file.isFile && file.name === filename)) {
                                    return dir ? `${dir}/${filename}` : filename;
                                }
                            } catch (error) {
                                // Ignore missing directories or list errors for optional files.
                            }
                        }

                        return null;
                    };

                    try {
                        const referencesPath = await resolveBibPath('references.bib');
                        if (referencesPath) {
                            await window.TechneBibtexParser.loadAndSetGlobal(referencesPath);
                            console.log(`[${PLUGIN_ID}] Loaded ${referencesPath}`);
                        }

                        const exportedPath = await resolveBibPath('exported_items.bib');
                        if (exportedPath) {
                            const exported = await window.TechneBibtexParser.loadFromFile(exportedPath);
                            if (exported?.length) {
                                window.TechneBibtexParser.addEntries(exported);
                                console.log(`[${PLUGIN_ID}] Added ${exported.length} entries from ${exportedPath}`);
                            }
                        }

                        if (window.bibEntries?.length) {
                            console.log(`[${PLUGIN_ID}] Bibliography loaded: ${window.bibEntries.length} entries`);
                            host.emit('bibliography:loaded', { count: window.bibEntries.length });
                        }
                    } catch (err) {
                        console.warn(`[${PLUGIN_ID}] Failed to load bibliography:`, err);
                    }
                }

                host.emit('markdown-renderer:ready', { id: PLUGIN_ID });
            }
        });
    };

    register();
})();

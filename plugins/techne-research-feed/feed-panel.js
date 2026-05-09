/* Research Feed Panel — UI for the techne-research-feed plugin.
   Owns the sidebar pane DOM, the floating toggle button, and the settings
   modal. All networking is delegated to /ipc/feedHandlers via electronAPI.
*/

(function () {
    'use strict';

    const SETTINGS_KEY = 'techne-research-feed';
    const DEFAULT_SOURCES_HINT = [
        { id: 'arxiv-cs-AI', type: 'arxiv', config: { category: 'cs.AI', maxResults: 20 } },
        { id: 'reddit-ml', type: 'reddit', config: { subreddits: ['MachineLearning'], sort: 'new', limit: 20 } }
    ];
    const SOURCE_TYPES = ['arxiv', 'reddit', 'bluesky', 'mastodon', 'googleSearch', 'googleScholar', 'xLoggedIn'];

    function el(tag, attrs, children) {
        const node = document.createElement(tag);
        if (attrs) {
            for (const [k, v] of Object.entries(attrs)) {
                if (k === 'class') node.className = v;
                else if (k === 'style') node.style.cssText = v;
                else if (k === 'dataset') Object.assign(node.dataset, v);
                else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
                else if (v != null) node.setAttribute(k, v);
            }
        }
        if (children != null) {
            const arr = Array.isArray(children) ? children : [children];
            for (const c of arr) {
                if (c == null) continue;
                if (typeof c === 'string') node.appendChild(document.createTextNode(c));
                else node.appendChild(c);
            }
        }
        return node;
    }

    function escHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function formatTime(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        const now = Date.now();
        const diffMs = now - d.getTime();
        const min = Math.floor(diffMs / 60000);
        if (min < 1) return 'just now';
        if (min < 60) return `${min}m ago`;
        const h = Math.floor(min / 60);
        if (h < 24) return `${h}h ago`;
        const days = Math.floor(h / 24);
        if (days < 7) return `${days}d ago`;
        return d.toLocaleDateString();
    }

    function dayKey(iso) {
        if (!iso) return 'undated';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return 'undated';
        return d.toISOString().slice(0, 10);
    }

    function dayLabel(key) {
        if (key === 'undated') return 'No date';
        const today = new Date().toISOString().slice(0, 10);
        if (key === today) return 'Today';
        const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        if (key === y) return 'Yesterday';
        return new Date(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    }

    class ResearchFeedPanel {
        constructor(host) {
            this.host = host;
            this.api = host.electronAPI;
            this.paneEl = null;
            this.fabEl = null;
            this.listEl = null;
            this.filtersEl = null;
            this.thresholdEl = null;
            this.sources = [];
            this.items = [];
            this.activeFilter = { sourceId: null, minScore: 0, sort: 'score' };
            this.unreadDelta = 0;
            this.settings = { panelOpen: false, threshold: 6, sortMode: 'score' };
            this.unsubscribers = [];
        }

        async mount() {
            const stored = this.host.getSettings();
            this.settings = Object.assign({ panelOpen: false, threshold: 6, sortMode: 'score' }, stored || {});
            this.activeFilter.minScore = this.settings.threshold;
            this.activeFilter.sort = this.settings.sortMode;

            this.createPane();
            this.createFab();
            this.wireIpcListeners();

            await this.refreshSources();
            await this.refreshItems();

            if (this.settings.panelOpen) this.open();
        }

        // ------------- DOM construction -------------

        createPane() {
            let pane = document.getElementById('research-feed-pane');
            if (!pane) {
                pane = el('div', {
                    id: 'research-feed-pane',
                    class: 'content-pane',
                    style: 'display:none;height:100%;flex-direction:column;overflow:hidden;'
                });
                const after = document.getElementById('image-manager-pane')
                    || document.getElementById('git-pane')
                    || document.getElementById('search-pane');
                if (after && after.parentNode) {
                    after.parentNode.insertBefore(pane, after.nextSibling);
                } else {
                    document.body.appendChild(pane);
                }
            }
            this.paneEl = pane;
            this.renderShell();
        }

        renderShell() {
            this.paneEl.innerHTML = '';
            const header = el('div', { class: 'rf-header' }, [
                el('h3', null, 'Research Feed'),
                el('div', { class: 'rf-header-actions' }, [
                    el('button', { class: 'rf-btn', title: 'Refresh now', onclick: () => this.refreshNow() }, '↻'),
                    el('button', { class: 'rf-btn', title: 'Configure sources', onclick: () => this.openSettingsModal() }, '⚙'),
                    el('button', { class: 'rf-btn', title: 'Close', onclick: () => this.close() }, '×')
                ])
            ]);

            this.filtersEl = el('div', { class: 'rf-filters' });
            const thresholdRow = el('div', { class: 'rf-threshold-row' }, [
                el('span', null, 'Min relevance:'),
                el('input', {
                    type: 'range', min: '0', max: '10', step: '1',
                    value: String(this.activeFilter.minScore),
                    oninput: (e) => this.setMinScore(Number(e.target.value))
                }),
                (this.thresholdLabel = el('span', null, String(this.activeFilter.minScore))),
                el('select', {
                    style: 'margin-left:8px;background:transparent;color:inherit;border:1px solid #444;border-radius:3px;font-size:11px;',
                    onchange: (e) => this.setSort(e.target.value)
                }, [
                    (() => { const o = el('option', { value: 'score' }, 'by relevance'); if (this.activeFilter.sort === 'score') o.selected = true; return o; })(),
                    (() => { const o = el('option', { value: 'recent' }, 'by recency'); if (this.activeFilter.sort === 'recent') o.selected = true; return o; })()
                ])
            ]);

            this.listEl = el('div', { class: 'rf-list' });

            this.paneEl.appendChild(header);
            this.paneEl.appendChild(this.filtersEl);
            this.paneEl.appendChild(thresholdRow);
            this.paneEl.appendChild(this.listEl);
        }

        createFab() {
            const fab = el('button', {
                class: 'rf-toggle-fab',
                title: 'Research Feed',
                onclick: () => this.toggle()
            });
            fab.innerHTML = '⚲';
            this.badgeEl = el('span', { class: 'rf-badge' }, '0');
            fab.appendChild(this.badgeEl);
            document.body.appendChild(fab);
            this.fabEl = fab;
        }

        // ------------- Open/close -------------

        toggle() {
            if (this.paneEl.style.display === 'none' || !this.paneEl.style.display) this.open();
            else this.close();
        }

        open() {
            // Stash whichever sibling pane is currently visible so we can restore.
            const parent = this.paneEl.parentNode;
            if (parent) {
                this._previouslyVisible = [];
                parent.querySelectorAll('.content-pane').forEach((p) => {
                    if (p !== this.paneEl && p.style.display !== 'none') {
                        this._previouslyVisible.push(p);
                        p.style.display = 'none';
                    }
                });
            }
            this.paneEl.style.display = 'flex';
            this.settings.panelOpen = true;
            this.host.setSettings(this.settings);
            this.unreadDelta = 0;
            this.updateBadge();
            this.refreshItems();
        }

        close() {
            this.paneEl.style.display = 'none';
            (this._previouslyVisible || []).forEach((p) => { p.style.display = ''; });
            this._previouslyVisible = null;
            this.settings.panelOpen = false;
            this.host.setSettings(this.settings);
        }

        // ------------- IPC wiring -------------

        wireIpcListeners() {
            const u1 = this.api.on('feed:items', ({ sourceId, inserted } = {}) => {
                this.unreadDelta += inserted || 0;
                this.updateBadge();
                if (this.paneEl.style.display !== 'none') this.refreshItems();
            });
            const u2 = this.api.on('feed:scored', () => {
                if (this.paneEl.style.display !== 'none') this.refreshItems();
            });
            const u3 = this.api.on('feed:source-error', ({ sourceId, message }) => {
                console.warn(`[research-feed] source ${sourceId} error: ${message}`);
                this.flashHeader(`${sourceId}: ${message}`);
            });
            this.unsubscribers.push(u1, u2, u3);
        }

        flashHeader(msg) {
            const header = this.paneEl.querySelector('.rf-header h3');
            if (!header) return;
            const original = header.textContent;
            header.textContent = msg.slice(0, 40);
            header.style.color = '#d83b3b';
            setTimeout(() => {
                header.textContent = original;
                header.style.color = '';
            }, 4000);
        }

        // ------------- Data flow -------------

        async refreshSources() {
            try {
                const r = await this.api.invoke('feed:list-sources');
                this.sources = r.success ? r.sources : [];
            } catch (_) { this.sources = []; }
            this.renderFilters();
        }

        async refreshItems() {
            try {
                const r = await this.api.invoke('feed:list', {
                    sourceId: this.activeFilter.sourceId || undefined,
                    minScore: this.activeFilter.minScore || undefined,
                    sort: this.activeFilter.sort,
                    limit: 200
                });
                this.items = r.success ? r.items : [];
            } catch (_) { this.items = []; }
            this.renderList();
        }

        async refreshNow() {
            this.flashHeader('refreshing…');
            try { await this.api.invoke('feed:refresh-now'); } catch (_) {}
            await this.refreshItems();
        }

        // ------------- Filters -------------

        renderFilters() {
            this.filtersEl.innerHTML = '';
            const allChip = el('span', {
                class: 'rf-chip' + (this.activeFilter.sourceId === null ? ' active' : ''),
                onclick: () => { this.activeFilter.sourceId = null; this.renderFilters(); this.refreshItems(); }
            }, 'All');
            this.filtersEl.appendChild(allChip);
            for (const s of this.sources) {
                const isActive = this.activeFilter.sourceId === s.id;
                const chip = el('span', {
                    class: 'rf-chip' + (isActive ? ' active' : '') + (s.enabled ? '' : ' disabled'),
                    title: s.lastError ? `error: ${s.lastError}` : `last: ${s.lastFetchedAt || 'never'}`,
                    onclick: () => { this.activeFilter.sourceId = isActive ? null : s.id; this.renderFilters(); this.refreshItems(); }
                }, s.id);
                if (s.lastError) chip.style.borderColor = '#d83b3b';
                this.filtersEl.appendChild(chip);
            }
        }

        setMinScore(v) {
            this.activeFilter.minScore = v;
            if (this.thresholdLabel) this.thresholdLabel.textContent = String(v);
            this.settings.threshold = v;
            this.host.setSettings(this.settings);
            this.refreshItems();
        }

        setSort(mode) {
            this.activeFilter.sort = mode;
            this.settings.sortMode = mode;
            this.host.setSettings(this.settings);
            this.refreshItems();
        }

        // ------------- List rendering -------------

        renderList() {
            this.listEl.innerHTML = '';
            if (this.items.length === 0) {
                this.listEl.appendChild(el('div', { class: 'rf-empty' },
                    this.sources.length === 0
                        ? 'No feed sources configured yet. Click ⚙ to add one.'
                        : 'No items match the current filter. Try lowering the relevance threshold or refreshing.'));
                return;
            }

            // Group by day for the recency sort; for score sort show flat.
            if (this.activeFilter.sort === 'recent') {
                const groups = new Map();
                for (const it of this.items) {
                    const k = dayKey(it.publishedAt);
                    if (!groups.has(k)) groups.set(k, []);
                    groups.get(k).push(it);
                }
                for (const [k, list] of groups) {
                    this.listEl.appendChild(el('div', { class: 'rf-day-divider' }, dayLabel(k)));
                    for (const it of list) this.listEl.appendChild(this.renderItem(it));
                }
            } else {
                for (const it of this.items) this.listEl.appendChild(this.renderItem(it));
            }
        }

        renderItem(it) {
            const score = it.relevance?.score;
            const scoreClass = score == null ? 'unscored' : (score >= 6 ? '' : 'low');
            const scoreText = score == null ? '—' : `${Math.round(score)}/10`;
            const scoreTitle = it.relevance?.reason || (score == null ? 'not yet scored' : '');

            const wrap = el('div', {
                class: 'rf-item' + (it.dismissed ? ' dismissed' : ''),
                onclick: (e) => {
                    if (e.target.closest('.rf-item-actions') || e.target.closest('button')) return;
                    this.openItem(it);
                }
            }, [
                el('div', { class: 'rf-item-header' }, [
                    el('span', { class: `rf-source-badge ${it.sourceId.split('-')[0]}` }, it.sourceId),
                    el('span', { class: `rf-relevance ${scoreClass}`, title: scoreTitle }, ['★ ', scoreText])
                ]),
                el('div', { class: 'rf-item-title' }, it.title || '(untitled)'),
                el('div', { class: 'rf-item-meta' }, [
                    it.author ? el('span', null, it.author) : null,
                    el('span', null, formatTime(it.publishedAt))
                ].filter(Boolean)),
                it.summary ? el('div', { class: 'rf-item-summary' }, it.summary) : null,
                el('div', { class: 'rf-item-actions' }, [
                    el('button', { onclick: (e) => { e.stopPropagation(); this.openItem(it); } }, 'Open'),
                    el('button', { onclick: (e) => { e.stopPropagation(); this.saveToCitations(it); } }, 'Save'),
                    el('button', { onclick: (e) => { e.stopPropagation(); this.dismissItem(it); } }, 'Dismiss')
                ])
            ]);
            return wrap;
        }

        openItem(it) {
            if (!it.url) return;
            // Open in external browser via shell.
            if (window.electronAPI?.invoke) {
                window.open(it.url, '_blank');
            } else {
                window.open(it.url, '_blank');
            }
        }

        async saveToCitations(it) {
            const r = await this.api.invoke('feed:save-to-citations', { id: it.id });
            if (r.success) this.flashHeader(r.alreadyExisted ? 'Already in citations' : 'Saved ✓');
            else this.flashHeader('Save failed: ' + (r.error || 'unknown'));
            this.refreshItems();
        }

        async dismissItem(it) {
            await this.api.invoke('feed:dismiss', { id: it.id, dismissed: !it.dismissed });
            this.refreshItems();
        }

        // ------------- Badge -------------

        updateBadge() {
            if (!this.badgeEl) return;
            if (this.unreadDelta > 0) {
                this.badgeEl.textContent = String(this.unreadDelta);
                this.badgeEl.classList.add('visible');
            } else {
                this.badgeEl.classList.remove('visible');
            }
        }

        // ------------- Settings modal -------------

        async openSettingsModal() {
            const credInfo = await this.api.invoke('feed:credential-info');
            const backdrop = el('div', { class: 'rf-modal-backdrop', onclick: (e) => { if (e.target === backdrop) backdrop.remove(); } });
            const modal = el('div', { class: 'rf-modal' });

            modal.appendChild(el('h2', null, 'Research Feed — Sources'));
            if (credInfo?.info && !credInfo.info.protected) {
                modal.appendChild(el('div', { class: 'rf-warn' },
                    `Secret storage backend is "${credInfo.info.backend}" — not OS-protected. Avoid storing real production keys here.`));
            } else if (credInfo?.info) {
                modal.appendChild(el('div', { class: 'rf-info' },
                    `Secrets are encrypted via ${credInfo.info.backend}.`));
            }

            const sourcesContainer = el('div');
            const renderSourcesList = async () => {
                sourcesContainer.innerHTML = '';
                const r = await this.api.invoke('feed:list-sources');
                const list = r.success ? r.sources : [];
                if (list.length === 0) {
                    sourcesContainer.appendChild(el('div', { class: 'rf-empty', style: 'padding:14px;' }, 'No sources yet. Add one below.'));
                }
                for (const s of list) {
                    sourcesContainer.appendChild(this.renderSourceCard(s, renderSourcesList));
                }
            };
            modal.appendChild(el('h3', null, 'Configured sources'));
            modal.appendChild(sourcesContainer);

            modal.appendChild(el('h3', null, 'Add a source'));
            const addForm = this.renderAddForm(async () => { await renderSourcesList(); await this.refreshSources(); });
            modal.appendChild(addForm);

            modal.appendChild(el('div', { class: 'rf-modal-footer' }, [
                el('button', { class: 'rf-btn', onclick: () => backdrop.remove() }, 'Close')
            ]));

            backdrop.appendChild(modal);
            document.body.appendChild(backdrop);
            await renderSourcesList();
        }

        renderSourceCard(source, onChange) {
            const card = el('div', { class: 'rf-source-card' });
            const header = el('div', { class: 'rf-source-card-header' }, [
                el('span', { class: 'name' }, `${source.id} (${source.type})`),
                el('div', null, [
                    el('button', {
                        class: 'rf-btn',
                        onclick: async () => {
                            await this.api.invoke('feed:set-source-enabled', { id: source.id, enabled: !source.enabled });
                            await onChange();
                        }
                    }, source.enabled ? 'Disable' : 'Enable'),
                    el('button', {
                        class: 'rf-btn',
                        onclick: async () => {
                            const r = await this.api.invoke('feed:test-source', { sourceId: source.id });
                            alert(r.success ? `Fetched ${r.count} items` : `Error: ${r.error}`);
                        }
                    }, 'Test'),
                    el('button', {
                        class: 'rf-btn danger',
                        onclick: async () => {
                            if (!confirm(`Delete source ${source.id}?`)) return;
                            await this.api.invoke('feed:delete-source', { id: source.id });
                            await onChange();
                        }
                    }, 'Delete')
                ])
            ]);
            card.appendChild(header);
            const meta = el('div', { style: 'font-size:11px;color:#888;' }, [
                `interval ${Math.round(source.intervalMs / 60000)} min`,
                ' · ',
                `last fetch: ${source.lastFetchedAt || 'never'}`
            ]);
            card.appendChild(meta);
            if (source.lastError) {
                card.appendChild(el('div', { class: 'rf-error' }, `last error: ${source.lastError}`));
            }
            const cfg = el('details');
            cfg.appendChild(el('summary', { style: 'cursor:pointer;font-size:11px;color:#888;margin-top:6px;' }, 'config'));
            cfg.appendChild(el('pre', { style: 'font-size:10px;background:#111;padding:6px;border-radius:3px;overflow-x:auto;' },
                JSON.stringify(source.config, null, 2)));
            card.appendChild(cfg);

            // Per-source extras.
            if (source.type === 'googleSearch') {
                card.appendChild(this.renderCredentialField(source.id, 'apiKey', 'Google API key'));
            }
            if (source.type === 'googleScholar') {
                card.appendChild(this.renderCredentialField(source.id, 'apiKey', 'SerpAPI key'));
            }
            if (source.type === 'xLoggedIn') {
                card.appendChild(this.renderXSessionControls(source.id, onChange));
            }
            return card;
        }

        renderCredentialField(sourceId, name, label) {
            const input = el('input', { type: 'password', placeholder: '(unchanged)' });
            const row = el('div', { class: 'rf-row' }, [
                el('label', null, label),
                input,
                el('button', {
                    class: 'rf-btn primary',
                    onclick: async () => {
                        if (!input.value) return;
                        const r = await this.api.invoke('feed:set-credential', { sourceId, name, value: input.value });
                        input.value = '';
                        alert(r.success ? 'Saved' : 'Failed: ' + r.error);
                    }
                }, 'Save'),
                el('button', {
                    class: 'rf-btn',
                    onclick: async () => {
                        await this.api.invoke('feed:set-credential', { sourceId, name, value: '' });
                        alert('Cleared');
                    }
                }, 'Clear')
            ]);
            return row;
        }

        renderXSessionControls(sourceId, onChange) {
            const status = el('span', { style: 'font-size:11px;color:#888;' }, '(checking…)');
            const refreshStatus = async () => {
                const r = await this.api.invoke('feed:x-status');
                status.textContent = r.success ? `state: ${r.state}` : `error: ${r.error}`;
            };
            refreshStatus();
            return el('div', { class: 'rf-row' }, [
                el('label', null, 'x.com session'),
                status,
                el('button', {
                    class: 'rf-btn primary',
                    onclick: async () => { await this.api.invoke('feed:x-open-login'); refreshStatus(); }
                }, 'Connect / re-login'),
                el('button', {
                    class: 'rf-btn danger',
                    onclick: async () => {
                        if (!confirm('Clear x.com session cookies?')) return;
                        await this.api.invoke('feed:x-clear-session');
                        refreshStatus();
                    }
                }, 'Clear')
            ]);
        }

        renderAddForm(onAdded) {
            const form = el('div', { class: 'rf-source-card' });
            const idInput = el('input', { type: 'text', placeholder: 'unique id e.g. arxiv-philosophy' });
            const typeSelect = el('select', null, SOURCE_TYPES.map((t) => el('option', { value: t }, t)));
            const configTextarea = el('textarea', { placeholder: '{ "category": "cs.AI", "query": "embodied cognition" }' });
            const intervalInput = el('input', { type: 'number', value: '15', min: '1' });

            const setExample = () => {
                const ex = {
                    arxiv: '{ "category": "cs.AI", "query": "embodied cognition" }',
                    reddit: '{ "subreddits": ["MachineLearning", "philosophy"], "sort": "new" }',
                    bluesky: '{ "query": "philosophy of mind", "lang": "en" }',
                    mastodon: '{ "instances": ["mastodon.social", "scholar.social"], "tags": ["philosophy"] }',
                    googleSearch: '{ "query": "embodied cognition", "cx": "<your CX>", "dateRestrict": "w1" }',
                    googleScholar: '{ "query": "embodied cognition" }',
                    xLoggedIn: '{}'
                };
                configTextarea.placeholder = ex[typeSelect.value] || '{}';
            };
            typeSelect.addEventListener('change', setExample);
            setExample();

            const addBtn = el('button', {
                class: 'rf-btn primary',
                onclick: async () => {
                    let config = {};
                    if (configTextarea.value.trim()) {
                        try { config = JSON.parse(configTextarea.value); }
                        catch (e) { alert('Invalid JSON config'); return; }
                    }
                    const id = idInput.value.trim();
                    if (!id) { alert('Need an id'); return; }
                    const intervalMs = Math.max(1, Number(intervalInput.value) || 15) * 60000;
                    const r = await this.api.invoke('feed:upsert-source', {
                        id, type: typeSelect.value, config, enabled: true, intervalMs
                    });
                    if (!r.success) { alert('Failed: ' + r.error); return; }
                    idInput.value = '';
                    configTextarea.value = '';
                    await onAdded();
                }
            }, 'Add source');

            form.appendChild(el('div', { class: 'rf-row' }, [el('label', null, 'id'), idInput]));
            form.appendChild(el('div', { class: 'rf-row' }, [el('label', null, 'type'), typeSelect]));
            form.appendChild(el('div', { class: 'rf-row' }, [el('label', null, 'config (JSON)'), configTextarea]));
            form.appendChild(el('div', { class: 'rf-row' }, [el('label', null, 'interval (min)'), intervalInput]));
            form.appendChild(el('div', { class: 'rf-row', style: 'justify-content:flex-end;' }, [addBtn]));
            return form;
        }
    }

    window.ResearchFeedPanel = ResearchFeedPanel;
})();

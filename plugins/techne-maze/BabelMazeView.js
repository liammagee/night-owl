// === Babel Maze View ===
// A Borges-inspired MUD interface for building an interlinked knowledge base.
// Plugin-compatible version with host adapter support.

class BabelMazeView {
    constructor(host, options = {}) {
        // Host adapter for plugin system
        this.host = host;
        this.gamification = options.gamification || null;

        this.storageKey = 'babel_maze_state_v1';
        this.layoutVersion = 2;
        this.mazeSparsityFactor = 3.25;
        this.mazeMaxCells = 2600;

        this.container = null;
        this.lastRenderAt = 0;
        this.renderThrottleMs = 250;

        this.graph = null;
        this.graphReady = false;
        this.graphRefreshInFlight = false;
        this.graphLastBuiltAt = null;

        this.savedMazeLayout = null;
        this.maze = null;

        this.currentRoomId = null;
        this.discovered = new Set();
        this.inventory = new Set();
        this.travelHistory = [];
        this.maxTravelHistory = 80;

        this.log = [];
        this.commandHistory = [];
        this.commandHistoryIndex = -1;
        this.pendingAI = false;
        this.bootstrapped = false;
        this.wasLibraryActive = false;

        this.mapViewBox = null;
        this.mapUserHasPanned = false;
        this.mapPointerState = null;

        this.elements = {
            status: null,
            mapSvg: null,
            log: null,
            input: null,
            hintbar: null,
            mapTitle: null,
            ledger: null
        };

        this.defaultHintHTML = null;
        this.linkAutocomplete = {
            active: false,
            query: '',
            items: [],
            index: 0
        };

        this.boundHandlers = null;

        this.loadState();
    }

    // Initialize the maze into a provided container element
    async initialize(container) {
        if (!container) {
            throw new Error('BabelMazeView requires a container element');
        }

        // Store reference to the mount container
        this._mountContainer = container;

        // Ensure the container has the expected ID for ensureContainer()
        // The maze looks for #library-mode-root
        if (!container.id) {
            container.id = 'library-mode-root';
        }

        // If the container isn't library-mode-root, wrap or adapt
        if (container.id !== 'library-mode-root') {
            // Create the expected structure inside the container
            let libraryRoot = document.getElementById('library-mode-root');
            if (!libraryRoot) {
                libraryRoot = document.createElement('div');
                libraryRoot.id = 'library-mode-root';
                libraryRoot.style.width = '100%';
                libraryRoot.style.height = '100%';
                container.appendChild(libraryRoot);
            }
        }

        // Set up the container DOM
        this.ensureContainer();

        // Use refreshGraph which handles full initialization:
        // - builds graph
        // - chooses initial room
        // - creates maze layout
        // - renders the map
        await this.refreshGraph({ announce: false });

        return this;
    }

    // === Host Adapter Methods ===
    // These provide abstraction between the maze and the host environment

    async _getFiles() {
        if (this.host?.getFiles) {
            return this.host.getFiles();
        }
        if (window.getFilteredVisualizationFiles) {
            return window.getFilteredVisualizationFiles();
        }
        return { files: [] };
    }

    async _readFileContent(filePath) {
        if (this.host?.readFile) {
            const result = await this.host.readFile(filePath);
            return result ? { success: true, content: result.content } : { success: false };
        }
        if (window.electronAPI?.invoke) {
            return window.electronAPI.invoke('read-file-content-only', filePath);
        }
        return { success: false, error: 'No file reader available' };
    }

    async _openFile(filePath) {
        if (this.host?.openFile) {
            return this.host.openFile(filePath);
        }
        if (window.electronAPI?.invoke) {
            return window.electronAPI.invoke('open-file-path', filePath);
        }
        return { success: false, error: 'No file opener available' };
    }

    async _appendLink(sourcePath, targetId, targetLabel) {
        if (this.host?.appendLink) {
            return this.host.appendLink(sourcePath, targetId, targetLabel);
        }
        if (window.electronAPI?.invoke) {
            return window.electronAPI.invoke('library.append-internal-link', {
                sourcePath, targetId, targetLabel
            });
        }
        return { success: false, error: 'No link appender available' };
    }

    async _saveFile(filePath, content) {
        if (this.host?.saveFile) {
            return this.host.saveFile(filePath, content);
        }
        if (window.electronAPI?.invoke) {
            return window.electronAPI.invoke('perform-save-with-path', content, filePath);
        }
        return { success: false, error: 'No file saver available' };
    }

    _getCurrentFilePath() {
        if (this.host?.getCurrentFile) {
            return this.host.getCurrentFile();
        }
        return window.currentFilePath || null;
    }

    _switchToEditorMode() {
        if (this.host?.switchMode) {
            return this.host.switchMode('editor');
        }
        if (window.switchToMode) {
            return window.switchToMode('editor');
        }
    }

    async _openFileInEditor(filePath, content) {
        if (this.host?.openFileInEditor) {
            return this.host.openFileInEditor(filePath, content);
        }
        if (window.openFileInEditor) {
            return window.openFileInEditor(filePath, content);
        }
    }

    _getEditor() {
        if (this.host?.getEditor) {
            return this.host.getEditor();
        }
        return window.editor || (typeof editor !== 'undefined' ? editor : null);
    }

    _log(...args) {
        if (this.host?.log) {
            this.host.log('[BabelMaze]', ...args);
        } else {
            console.log('[BabelMaze]', ...args);
        }
    }

    _markContentAsSaved() {
        if (this.host?.markContentAsSaved) {
            return this.host.markContentAsSaved();
        }
        if (window.markContentAsSaved) {
            return window.markContentAsSaved();
        }
    }

    _getAICompanion() {
        if (this.host?.getAICompanion) {
            return this.host.getAICompanion();
        }
        return this.gamification?.aiCompanion || window.aiCompanion || window.aiCompanionManager || null;
    }

    // === End Host Adapter Methods ===

    isVoidRoomId(roomId) {
        return typeof roomId === 'string' && roomId.startsWith('__void:');
    }

    revealAround(roomId, radius = 1) {
        if (!roomId || !this.maze?.roomOrder?.length || !this.maze?.indexByRoomId) return;
        const index = this.maze.indexByRoomId.get(roomId);
        if (index == null) return;
        const width = this.maze.width || 1;
        const count = this.maze.roomOrder.length;
        const x0 = index % width;
        const y0 = Math.floor(index / width);

        const r = Math.max(0, Math.min(6, Number(radius) || 0));
        for (let dy = -r; dy <= r; dy += 1) {
            for (let dx = -r; dx <= r; dx += 1) {
                if (Math.abs(dx) + Math.abs(dy) > r) continue;
                const x = x0 + dx;
                const y = y0 + dy;
                if (x < 0 || y < 0) continue;
                const idx = y * width + x;
                if (idx < 0 || idx >= count) continue;
                const id = this.maze.roomOrder[idx];
                if (id) this.discovered.add(id);
            }
        }
    }

    loadState() {
        try {
            const raw = window?.localStorage?.getItem?.(this.storageKey);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                if (typeof parsed.currentRoomId === 'string') {
                    this.currentRoomId = parsed.currentRoomId;
                }
                if (Array.isArray(parsed.discovered)) {
                    this.discovered = new Set(parsed.discovered.filter(Boolean));
                }
                if (Array.isArray(parsed.inventory)) {
                    this.inventory = new Set(parsed.inventory.filter(Boolean));
                }
                if (Array.isArray(parsed.travelHistory)) {
                    this.travelHistory = parsed.travelHistory.filter(v => typeof v === 'string').slice(-this.maxTravelHistory);
                }
                if (parsed.mazeLayout && typeof parsed.mazeLayout === 'object') {
                    this.savedMazeLayout = parsed.mazeLayout;
                }
            }
        } catch (error) {
            console.warn('[BabelMazeView] Failed to load state:', error);
        }
    }

    saveState() {
        try {
            if (!window?.localStorage?.setItem) return;
            const payload = {
                currentRoomId: this.currentRoomId,
                discovered: Array.from(this.discovered || []),
                inventory: Array.from(this.inventory || []),
                travelHistory: Array.from(this.travelHistory || []).slice(-this.maxTravelHistory),
                mazeLayout: this.savedMazeLayout || null
            };
            window.localStorage.setItem(this.storageKey, JSON.stringify(payload));
        } catch (error) {
            console.warn('[BabelMazeView] Failed to save state:', error);
        }
    }

    ensureContainer() {
        const libraryRoot = document.getElementById('library-mode-root');
        if (!libraryRoot) return null;

        if (!this.container) {
            const panel = document.createElement('div');
            panel.className = 'babel-maze';
            panel.innerHTML = this.getSkeletonMarkup();
            this.container = panel;
        }

        if (!libraryRoot.contains(this.container)) {
            libraryRoot.replaceChildren(this.container);
        }

        this.container.style.width = '100%';
        this.container.style.height = '100%';

        this.captureElements();
        this.attachEventHandlers();

        if (!this.bootstrapped) {
            this.bootstrapped = true;
            this.appendLog('system', 'You arrive in the Babel Maze: a map you repair by linking your notes.');
            this.appendLog('system', 'Type "help" to see commands. Start with "look". (Arrow keys/WASD move; scroll zooms the map; drag pans.)');
        }

        return this.container;
    }

    getSkeletonMarkup() {
        return `
            <header class="bm-header">
                <div>
                    <div class="bm-title">
                        <span>📚 Babel Maze</span>
                        <span class="bm-subtitle">Coherence as Cartography</span>
                    </div>
                    <div class="bm-status" id="bm-status">Mapping the stacks…</div>
                </div>
                <div class="bm-controls">
                    <button type="button" class="btn btn-sm" id="bm-refresh-btn" title="Refresh maze graph">Refresh</button>
                    <button type="button" class="btn btn-sm btn-primary" id="bm-help-btn" title="Show commands">Help</button>
                </div>
            </header>

            <div class="bm-body">
                <section class="bm-panel">
                    <div class="bm-panel-header">
                        <div class="bm-panel-title">Maze Map</div>
                        <div class="bm-panel-actions">
                            <div class="bm-panel-title" id="bm-map-title">—</div>
                            <div class="bm-map-tools" role="group" aria-label="Map controls">
                                <button type="button" class="btn btn-sm" id="bm-map-big-btn" title="What has the maze revealed so far?">Big</button>
                                <button type="button" class="btn btn-sm" id="bm-map-center-btn" title="Center on current room">Center</button>
                                <button type="button" class="btn btn-sm" id="bm-map-fit-btn" title="Fit whole maze">Fit</button>
                                <button type="button" class="btn btn-sm" id="bm-map-zoom-out-btn" title="Zoom out">−</button>
                                <button type="button" class="btn btn-sm" id="bm-map-zoom-in-btn" title="Zoom in">+</button>
                            </div>
                        </div>
                    </div>
                    <div class="bm-map">
                        <svg class="bm-map-svg" id="bm-map-svg" tabindex="0" aria-label="Babel Maze map"></svg>
                    </div>
                </section>

                <section class="bm-side">
                    <section class="bm-panel">
                        <div class="bm-panel-header">
                            <div class="bm-panel-title">Terminal</div>
                            <div class="bm-panel-title" id="bm-ledger">—</div>
                        </div>
                        <div class="bm-terminal">
                            <div class="bm-log" id="bm-log"></div>
                            <div class="bm-input-row">
                                <div class="bm-prompt">you&gt;</div>
                                <input class="bm-input" id="bm-input" type="text" autocomplete="off" spellcheck="false" placeholder="Try: look, exits, go north, open, edit, inventory, link <name>, search <text>…" />
                            </div>
                        </div>
                    </section>

                    <div class="bm-hintbar" id="bm-hintbar">Tip: type <strong>help</strong>. Move with arrows/WASD. <strong>Enter</strong> looks. <strong>Space</strong> unseals. <strong>Tab</strong> toggles focus. Links become sigil-doors you can click (or space on) to jump.</div>
                </section>
            </div>
        `;
    }

    captureElements() {
        if (!this.container) return;
        this.elements.status = this.container.querySelector('#bm-status');
        this.elements.mapSvg = this.container.querySelector('#bm-map-svg');
        this.elements.log = this.container.querySelector('#bm-log');
        this.elements.input = this.container.querySelector('#bm-input');
        this.elements.hintbar = this.container.querySelector('#bm-hintbar');
        this.elements.mapTitle = this.container.querySelector('#bm-map-title');
        this.elements.ledger = this.container.querySelector('#bm-ledger');
        if (this.elements.hintbar && this.defaultHintHTML == null) {
            this.defaultHintHTML = this.elements.hintbar.innerHTML;
        }
    }

    attachEventHandlers() {
        if (!this.container || this.container.dataset.handlersAttached === 'true') return;
        this.container.dataset.handlersAttached = 'true';

        const refreshBtn = this.container.querySelector('#bm-refresh-btn');
        refreshBtn?.addEventListener('click', () => this.refreshGraph({ announce: true }));

        const helpBtn = this.container.querySelector('#bm-help-btn');
        helpBtn?.addEventListener('click', () => this.runCommand('help'));

        this.elements.input?.addEventListener('keydown', (event) => {
            if (event.key === 'Tab') {
                if (event.shiftKey) return;
                const ctx = this.getLinkAutocompleteContext();
                if (ctx.open) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation?.();
                    this.linkAutocomplete.active = true;
                    const maxIndex = Math.max(0, ctx.items.length - 1);
                    this.linkAutocomplete.index = Math.max(0, Math.min(this.linkAutocomplete.index || 0, maxIndex));
                    this.updateHintbar();
                    return;
                }
                return;
            }

            if (this.linkAutocomplete.active) {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation?.();
                    this.linkAutocomplete.active = false;
                    this.updateHintbar();
                    return;
                }
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    const ctx = this.getLinkAutocompleteContext();
                    if (ctx.open) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation?.();
                        if (!ctx.items.length) {
                            this.updateHintbar();
                            return;
                        }
                        const delta = event.key === 'ArrowDown' ? 1 : -1;
                        const next = (this.linkAutocomplete.index + delta + ctx.items.length) % ctx.items.length;
                        this.linkAutocomplete.index = next;
                        this.updateHintbar();
                        return;
                    }
                }
                if (event.key === 'Enter') {
                    const ctx = this.getLinkAutocompleteContext();
                    const pick = ctx.items[this.linkAutocomplete.index];
                    if (ctx.open && pick) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation?.();
                        const command = `link ${pick.id}`;
                        this.linkAutocomplete.active = false;
                        this.elements.input.value = '';
                        this.updateHintbar();
                        this.pushHistory(command);
                        this.appendLog('you', command);
                        this.executeCommand(command);
                        return;
                    }
                }

                // Any other key returns to regular typing/history mode.
                const looksLikeTyping =
                    event.key.length === 1 ||
                    event.key === 'Backspace' ||
                    event.key === 'Delete' ||
                    event.key === 'Home' ||
                    event.key === 'End';
                if (looksLikeTyping) {
                    this.linkAutocomplete.active = false;
                }
            }

            if (event.key === 'Enter') {
                const value = (this.elements.input.value || '').trim();
                if (!value) return;
                this.elements.input.value = '';
                this.pushHistory(value);
                this.appendLog('you', value);
                this.executeCommand(value);
                return;
            }

            if (event.key === 'ArrowUp') {
                event.preventDefault();
                this.navigateHistory(-1);
                return;
            }
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                this.navigateHistory(1);
                return;
            }
        });

        this.elements.input?.addEventListener('input', () => {
            this.updateHintbar();
        });

        this.elements.hintbar?.addEventListener('click', (event) => {
            const button = event.target?.closest?.('[data-link-id][data-link-index]');
            if (!button) return;
            const linkId = button.getAttribute('data-link-id');
            if (!linkId) return;
            const index = Number(button.getAttribute('data-link-index')) || 0;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();

            this.linkAutocomplete.active = false;
            this.linkAutocomplete.index = index;
            if (this.elements.input) this.elements.input.value = '';
            this.updateHintbar();

            const command = `link ${linkId}`;
            this.pushHistory(command);
            this.appendLog('you', command);
            this.executeCommand(command);

            queueMicrotask(() => this.elements.input?.focus?.());
        });

        const centerBtn = this.container.querySelector('#bm-map-center-btn');
        centerBtn?.addEventListener('click', () => this.centerMapOnRoom(this.currentRoomId, { user: true }));

        const bigBtn = this.container.querySelector('#bm-map-big-btn');
        bigBtn?.addEventListener('click', () => this.executeCommand('big'));

        const fitBtn = this.container.querySelector('#bm-map-fit-btn');
        fitBtn?.addEventListener('click', () => this.fitMapToMaze({ user: true }));

        const zoomOutBtn = this.container.querySelector('#bm-map-zoom-out-btn');
        zoomOutBtn?.addEventListener('click', () => this.zoomMap(1.12, { user: true }));

        const zoomInBtn = this.container.querySelector('#bm-map-zoom-in-btn');
        zoomInBtn?.addEventListener('click', () => this.zoomMap(1 / 1.12, { user: true }));

        this.elements.mapSvg?.addEventListener('click', (event) => {
            if (this.mapPointerState?.moved) return;
            const target = event.target?.closest?.('[data-room-id]');
            const roomId = target?.getAttribute?.('data-room-id');
            if (!roomId) {
                this.elements.mapSvg?.focus?.();
                return;
            }
            this.activateMapRoom(roomId, { source: 'click' });
        });

        this.elements.mapSvg?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
            const target = event.target?.closest?.('[data-room-id]');
            const roomId = target?.getAttribute?.('data-room-id');
            event.preventDefault();

            if (event.key === 'Enter') {
                this.executeCommand('look');
                return;
            }

            if (!roomId) {
                this.executeCommand('open');
                return;
            }

            if (roomId === this.currentRoomId) {
                this.executeCommand('open');
                return;
            }

            this.activateMapRoom(roomId, { source: 'keyboard' });
        });

        this.elements.mapSvg?.addEventListener(
            'wheel',
            (event) => this.handleMapWheel(event),
            { passive: false }
        );

        this.elements.mapSvg?.addEventListener('pointerdown', (event) => this.handleMapPointerDown(event));
        this.elements.mapSvg?.addEventListener('pointermove', (event) => this.handleMapPointerMove(event));
        this.elements.mapSvg?.addEventListener('pointerup', (event) => this.handleMapPointerUp(event));
        this.elements.mapSvg?.addEventListener('pointercancel', (event) => this.handleMapPointerUp(event));

        this.ensureGlobalKeyHandlers();
    }

    updateHintbar() {
        const hintbar = this.elements.hintbar;
        if (!hintbar) return;
        const ctx = this.getLinkAutocompleteContext();
        if (!ctx.open) {
            if (this.defaultHintHTML != null) hintbar.innerHTML = this.defaultHintHTML;
            return;
        }

        const { query, items } = ctx;
        this.linkAutocomplete.query = query;
        this.linkAutocomplete.items = items;
        if (this.linkAutocomplete.index >= items.length) this.linkAutocomplete.index = Math.max(0, items.length - 1);
        if (this.linkAutocomplete.index < 0) this.linkAutocomplete.index = 0;

        if (!items.length) {
            const source = this.getRoom(this.currentRoomId);
            if (!this.graphReady) {
                hintbar.innerHTML = 'The catalog is still being indexed…';
                return;
            }
            if (!source || source.isVoid || !source.path) {
                hintbar.innerHTML = 'No ink here. Stand on a book-room to scribe links.';
                return;
            }
            if (!this.inventory.has(source.id)) {
                hintbar.innerHTML = 'The folio is sealed. Unseal it with <strong>Space</strong> (or <strong>open</strong>) to reveal link candidates.';
                return;
            }
            hintbar.innerHTML = 'No corridors suggest themselves.';
            return;
        }

        const selected = items[this.linkAutocomplete.index] || items[0];
        const room = this.getRoom(selected.id) || this.graph?.nodes?.get?.(selected.id) || null;
        const desc = this.getSuggestionDescription(room);

        const visibleCount = 9;
        const windowStart = Math.max(0, Math.min(this.linkAutocomplete.index - 3, Math.max(0, items.length - visibleCount)));
        const windowItems = items.slice(windowStart, windowStart + visibleCount);
        const list = windowItems
            .map((item, offset) => {
                const absoluteIndex = windowStart + offset;
                const selectedClass = absoluteIndex === this.linkAutocomplete.index ? ' bm-suggest-item-selected' : '';
                const prefix = absoluteIndex === this.linkAutocomplete.index ? '→ ' : '';
                return `<button type="button" class="bm-suggest-item${selectedClass}" data-link-index="${absoluteIndex}" data-link-id="${this.escapeHTMLAttr(item.id)}" role="option" aria-selected="${absoluteIndex === this.linkAutocomplete.index ? 'true' : 'false'}">${prefix}${this.escapeHTML(item.name)}</button>`;
            })
            .join('');

        const nav = this.linkAutocomplete.active
            ? 'Use ↑/↓, Enter to inscribe, Esc to cancel.'
            : 'Tab to select, then ↑/↓. Click to inscribe.';

        hintbar.innerHTML = `
            <div class="bm-suggest">
                <div class="bm-suggest-title">Link candidates</div>
                <div class="bm-suggest-items">${list}</div>
                <div class="bm-suggest-desc">${this.escapeHTML(desc)}</div>
                <div class="bm-suggest-nav">${this.escapeHTML(nav)}</div>
            </div>
        `;
    }

    getLinkAutocompleteContext() {
        const raw = String(this.elements.input?.value || '').trim();
        if (!raw) return { open: false, query: '', items: [] };
        if (!/^link\b/i.test(raw)) return { open: false, query: '', items: [] };

        const query = raw.replace(/^link\b/i, '').trim();
        const items = this.getLinkCandidates(query, { limit: 12 });
        return { open: true, query, items };
    }

    getSuggestionDescription(room) {
        if (!room) return '—';
        const district = room.dir || 'root';
        const parts = [];
        parts.push(`District: ${district}`);
        if (room.wordCount) parts.push(`Words: ${room.wordCount}`);
        const excerpt = String(room.excerpt || '').replace(/\s+/g, ' ').trim();
        if (excerpt) {
            const clipped = excerpt.length > 120 ? `${excerpt.slice(0, 117)}…` : excerpt;
            parts.push(clipped);
        } else if (Array.isArray(room.headings) && room.headings.length) {
            parts.push(`Headings: ${room.headings.slice(0, 3).join(' · ')}`);
        }
        return parts.join(' • ');
    }

    computeQueryAffinity(query, node) {
        const q = String(query || '').trim().toLowerCase();
        if (!q || !node) return 0;
        const name = String(node.name || '').toLowerCase();
        const id = String(node.id || '').toLowerCase();
        const base = String(node.basenameNoExt || '').toLowerCase();

        if (id === q || name === q || base === q) return 100;
        if (name.startsWith(q) || base.startsWith(q)) return 75;
        if (id.startsWith(q)) return 70;
        if (name.includes(q) || base.includes(q)) return 55;
        if (id.includes(q)) return 50;
        return 0;
    }

    getLinkCandidates(query, { limit = 12 } = {}) {
        const q = String(query || '').trim();
        if (!this.graphReady || !this.graph?.nodes?.size) return [];

        const source = this.getRoom(this.currentRoomId);
        if (!source || source.isVoid || !source.path) return [];

        const all = Array.from(this.graph.nodes.values());
        const candidates = q
            ? this.findRoomMatches(q, all, { limit: 30 })
            : all;

        const sourceTokens = this.buildTokenSetForRoom(source);
        const outbound = this.graph.outbound?.get(source.id) || new Set();
        const adjacent = this.graph.adjacency?.get(source.id) || new Set();
        const inbound = this.graph.inbound?.get(source.id) || new Set();

        const scored = [];
        for (const node of candidates) {
            if (!node?.id || node.id === source.id) continue;
            if (!node.path) continue;
            if (outbound.has(node.id) || adjacent.has(node.id)) continue;

            const queryScore = q ? this.computeQueryAffinity(q, node) : 0;
            const targetTokens = this.buildTokenSetForRoom(node);
            let overlap = 0;
            for (const token of sourceTokens) {
                if (targetTokens.has(token)) overlap += 1;
            }

            const sameDir = source.dir && node.dir && source.dir === node.dir ? 1 : 0;
            const reciprocates = inbound.has(node.id) ? 1 : 0;
            const orphanBonus = (this.graph.inboundCount?.get?.(node.id) || 0) === 0 ? 1 : 0;

            const semantic = overlap * 1.0 + sameDir * 1.25 + reciprocates * 1.75 + orphanBonus * 0.35;
            const score = q ? queryScore * 2.2 + semantic : semantic;
            if (score <= 0) continue;
            scored.push({ id: node.id, name: node.name || node.id, score });
        }

        scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
        const out = scored.slice(0, Math.max(1, Math.min(40, Number(limit) || 12)));

        // If query is present but nothing matched, fall back to heuristic suggestions.
        if (q && !out.length) {
            return this.getLinkSuggestions({ limit });
        }
        return out;
    }

    tokenizeForSimilarity(text) {
        const raw = String(text || '').toLowerCase();
        const tokens = raw
            .split(/[^a-z0-9]+/g)
            .map(t => t.trim())
            .filter(Boolean);

        const stop = new Set([
            'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'as', 'at', 'by', 'from',
            'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'this', 'that', 'these', 'those',
            'into', 'over', 'under', 'between', 'about', 'through', 'not', 'no', 'yes', 'but', 'if', 'then',
            'i', 'you', 'we', 'they', 'he', 'she', 'them', 'his', 'her', 'their', 'our'
        ]);

        const out = [];
        for (const t of tokens) {
            if (t.length < 3) continue;
            if (stop.has(t)) continue;
            out.push(t);
        }
        return out;
    }

    buildTokenSetForRoom(room) {
        if (!room) return new Set();
        const parts = [
            room.name,
            room.id,
            room.dir,
            room.excerpt,
            Array.isArray(room.headings) ? room.headings.slice(0, 8).join(' ') : ''
        ].filter(Boolean).join(' ');
        return new Set(this.tokenizeForSimilarity(parts));
    }

    getLinkSuggestions({ limit = 12 } = {}) {
        const source = this.getRoom(this.currentRoomId);
        if (!source || source.isVoid || !this.graphReady || !this.graph?.nodes?.size) return [];
        if (!source.path) return [];

        const sourceTokens = this.buildTokenSetForRoom(source);
        const outbound = this.graph.outbound?.get(source.id) || new Set();
        const adjacent = this.graph.adjacency?.get(source.id) || new Set();
        const inbound = this.graph.inbound?.get(source.id) || new Set();

        const candidates = [];
        for (const node of this.graph.nodes.values()) {
            if (!node?.id || node.id === source.id) continue;
            if (outbound.has(node.id) || adjacent.has(node.id)) continue;
            if (!node.path) continue;

            const targetTokens = this.buildTokenSetForRoom(node);
            let overlap = 0;
            for (const token of sourceTokens) {
                if (targetTokens.has(token)) overlap += 1;
            }

            const sameDir = source.dir && node.dir && source.dir === node.dir ? 1 : 0;
            const reciprocates = inbound.has(node.id) ? 1 : 0;
            const orphanBonus = (this.graph.inboundCount?.get?.(node.id) || 0) === 0 ? 1 : 0;

            const score = overlap * 1.0 + sameDir * 1.25 + reciprocates * 1.75 + orphanBonus * 0.35;
            if (score <= 0) continue;
            candidates.push({ id: node.id, name: node.name || node.id, score });
        }

        candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
        return candidates.slice(0, Math.max(1, Math.min(40, Number(limit) || 12)));
    }

    activateMapRoom(roomId, { source = 'map' } = {}) {
        if (!roomId) return;
        if (!this.graphReady) return;
        if (!this.maze) this.ensureMazeLayout(this.graph);
        if (!this.maze?.indexByRoomId?.has(roomId)) return;

        if (roomId === this.currentRoomId) {
            this.executeCommand('open');
            return;
        }

        const dirMap = this.getPhysicalDirectionMap(this.currentRoomId);
        const canWalk = dirMap && ['north', 'east', 'south', 'west'].some(dir => dirMap?.[dir] === roomId);
        if (canWalk) {
            this.moveToRoom(roomId, { source: source === 'click' ? 'click' : 'keyboard' });
            return;
        }

        if (this.graph?.outbound?.get(this.currentRoomId)?.has?.(roomId)) {
            this.moveToRoom(roomId, { source: 'portal' });
            return;
        }

        this.appendLog('system', 'Too far. Only stone corridors and sigil-doors answer.');
    }

    ensureGlobalKeyHandlers() {
        if (this.boundHandlers?.globalKeyDown) return;
        const handler = (event) => this.handleGlobalKeyDown(event);
        this.boundHandlers = { ...(this.boundHandlers || {}), globalKeyDown: handler };
        window.addEventListener('keydown', handler, { passive: false });
    }

    handleGlobalKeyDown(event) {
        const libraryActive = document.getElementById('library-content')?.classList?.contains('active');
        if (!libraryActive) return;
        if (!this.container || !this.graphReady) return;

        const target = event.target;
        const active = document.activeElement;
        const isTextEntry = (node) => {
            if (!node) return false;
            if (node === this.elements.input) return true;
            if (node?.isContentEditable) return true;
            const tag = String(node?.tagName || '').toLowerCase();
            return tag === 'input' || tag === 'textarea' || tag === 'select';
        };
        const keyRaw = String(event.key || '');
        const key = keyRaw.toLowerCase();

        if (this.linkAutocomplete?.active) {
            const ctx = this.getLinkAutocompleteContext();
            if (keyRaw === 'Escape') {
                event.preventDefault();
                this.linkAutocomplete.active = false;
                this.updateHintbar();
                return;
            }

            if (keyRaw.startsWith('Arrow') && ctx.open) {
                event.preventDefault();
                if (keyRaw === 'ArrowDown' || keyRaw === 'ArrowUp') {
                    if (!ctx.items.length) {
                        this.updateHintbar();
                        return;
                    }
                    const delta = keyRaw === 'ArrowDown' ? 1 : -1;
                    const next = (this.linkAutocomplete.index + delta + ctx.items.length) % ctx.items.length;
                    this.linkAutocomplete.index = next;
                    this.updateHintbar();
                    return;
                }
                return;
            }

            if (keyRaw === 'Enter' && ctx.open && ctx.items.length) {
                event.preventDefault();
                const pick = ctx.items[this.linkAutocomplete.index];
                if (pick) {
                    const command = `link ${pick.id}`;
                    this.linkAutocomplete.active = false;
                    if (this.elements.input) this.elements.input.value = '';
                    this.updateHintbar();
                    this.pushHistory(command);
                    this.appendLog('you', command);
                    this.executeCommand(command);
                }
                return;
            }

            // Allow shift+tab to escape selection and fall through to focus toggle.
            if (keyRaw === 'Tab' && event.shiftKey) {
                this.linkAutocomplete.active = false;
                this.updateHintbar();
            }
        }

        if (keyRaw === 'Tab') {
            if (!event.shiftKey && active === this.elements.input) {
                const ctx = this.getLinkAutocompleteContext();
                if (ctx.open) {
                    return;
                }
            }
            event.preventDefault();
            const mapHasFocus = Boolean(active && this.elements.mapSvg && (active === this.elements.mapSvg || this.elements.mapSvg.contains(active)));
            if (active === this.elements.input) {
                this.elements.mapSvg?.focus?.();
            } else if (mapHasFocus) {
                this.elements.input?.focus?.();
            } else {
                this.elements.mapSvg?.focus?.();
            }
            return;
        }

        if (isTextEntry(target) || isTextEntry(active)) return;
        if (event.defaultPrevented) return;

        const moveKeys = {
            arrowup: 'north',
            arrowright: 'east',
            arrowdown: 'south',
            arrowleft: 'west',
            w: 'north',
            d: 'east',
            s: 'south',
            a: 'west',
            k: 'north',
            l: 'east',
            j: 'south',
            h: 'west'
        };

        const direction = moveKeys[key];
        if (direction) {
            event.preventDefault();
            this.moveByDirection(direction, { source: 'keyboard' });
            return;
        }

        if (key === 'escape') {
            event.preventDefault();
            this.elements.input?.focus?.();
            return;
        }

        if (key === 'enter') {
            event.preventDefault();
            this.executeCommand('look');
            return;
        }

        if (key === ' ' || key === 'spacebar') {
            event.preventDefault();
            this.executeCommand('open');
            return;
        }

        if (key === '+' || key === '=' ) {
            event.preventDefault();
            this.zoomMap(1 / 1.12, { user: true });
            return;
        }

        if (key === '-' || key === '_' ) {
            event.preventDefault();
            this.zoomMap(1.12, { user: true });
            return;
        }

        if (key === '0') {
            event.preventDefault();
            this.fitMapToMaze({ user: true });
            return;
        }

        if (key === 'c') {
            event.preventDefault();
            this.centerMapOnRoom(this.currentRoomId, { user: true, preserveZoom: true });
        }
    }

    setStatus(text) {
        if (this.elements.status) {
            this.elements.status.textContent = text || '';
        }
    }

    setLedgerSummary(ledger = {}) {
        if (!this.elements.ledger) return;
        const shards = ledger?.lexiconShards ?? 0;
        const sigils = ledger?.catalogueSigils ?? 0;
        const tokens = ledger?.architectTokens ?? 0;
        const books = this.inventory?.size ?? 0;
        this.elements.ledger.textContent = `Shards ${shards} • Sigils ${sigils} • Tokens ${tokens} • Books ${books}`;
    }

    appendLog(author, text, options = {}) {
        const entry = {
            id: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            author: author || 'system',
            text: String(text ?? ''),
            tone: options.tone || null,
            createdAt: new Date().toISOString()
        };
        this.log.push(entry);
        while (this.log.length > 200) this.log.shift();
        this.renderLog();
    }

    renderLog() {
        if (!this.elements.log) return;
        const html = this.log
            .map(entry => {
                const klass = entry.author === 'ash'
                    ? 'bm-line bm-ash'
                    : entry.author === 'system'
                        ? 'bm-line bm-system'
                        : 'bm-line';
                const label = entry.author === 'you' ? 'you' : entry.author === 'ash' ? 'ash' : 'system';
                return `<div class="${klass}"><strong>${this.escapeHTML(label)}:</strong> ${this.escapeHTML(entry.text)}</div>`;
            })
            .join('');
        this.elements.log.innerHTML = html;
        this.elements.log.scrollTop = this.elements.log.scrollHeight;
    }

    escapeHTML(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    escapeHTMLAttr(str) {
        return this.escapeHTML(str);
    }

    pushHistory(cmd) {
        if (!cmd) return;
        const trimmed = String(cmd).trim();
        if (!trimmed) return;
        const last = this.commandHistory[this.commandHistory.length - 1];
        if (last !== trimmed) {
            this.commandHistory.push(trimmed);
            while (this.commandHistory.length > 60) this.commandHistory.shift();
        }
        this.commandHistoryIndex = this.commandHistory.length;
    }

    navigateHistory(delta) {
        if (!this.elements.input) return;
        if (!this.commandHistory.length) return;
        const nextIndex = Math.max(0, Math.min(this.commandHistory.length, this.commandHistoryIndex + delta));
        this.commandHistoryIndex = nextIndex;
        if (nextIndex === this.commandHistory.length) {
            this.elements.input.value = '';
        } else {
            this.elements.input.value = this.commandHistory[nextIndex] || '';
        }
        queueMicrotask(() => {
            this.elements.input?.setSelectionRange?.(this.elements.input.value.length, this.elements.input.value.length);
        });
    }

    render(worldState = {}, ledger = {}, options = {}) {
        const now = Date.now();
        if (!options.force && now - this.lastRenderAt < this.renderThrottleMs) return;
        this.lastRenderAt = now;

        const container = this.ensureContainer();
        if (!container) return;

        this.setLedgerSummary(ledger);

        const libraryActive = document.getElementById('library-content')?.classList?.contains('active');
        if (libraryActive && !this.wasLibraryActive) {
            setTimeout(() => {
                this.elements.input?.focus?.();
            }, 0);
        }
        this.wasLibraryActive = Boolean(libraryActive);

        if (!this.graphReady && !this.graphRefreshInFlight) {
            this.refreshGraph({ announce: false });
        }

        this.syncCurrentRoomFromEditor({ passive: true });
        this.renderMap();
        this.updateHintbar();
    }

    syncCurrentRoomFromEditor({ passive = false } = {}) {
        if (!this.graphReady || !this.graph?.nodes?.size) return;
        const currentPath = this._getCurrentFilePath();
        if (!currentPath || typeof currentPath !== 'string') return;

        const normalized = currentPath.replace(/\\/g, '/');
        const found = Array.from(this.graph.nodes.values()).find(node => (node.path || '').replace(/\\/g, '/') === normalized);
        if (!found) return;

        if (!this.currentRoomId || this.currentRoomId !== found.id) {
            this.currentRoomId = found.id;
            this.discovered.add(found.id);
            this.revealAround(found.id, 1);
            this.saveState();
            if (!passive) {
                this.appendLog('system', `You return to ${found.name}.`);
            }
            this.centerMapOnRoom(found.id, { user: false, preserveZoom: true });
            this.renderMap();
        }
    }

    async refreshGraph({ announce = true } = {}) {
        if (this.graphRefreshInFlight) return;
        this.graphRefreshInFlight = true;
        this.graphReady = false;

        this.setStatus('Mapping the stacks…');
        if (announce) {
            this.appendLog('system', 'I shuffle the index cards. The corridors rearrange themselves.');
        }

        try {
            const graph = await this.buildGraph();
            this.graph = graph;
            this.graphReady = true;
            this.graphLastBuiltAt = new Date().toISOString();

            if (this.currentRoomId && !graph.nodes.has(this.currentRoomId)) {
                this.currentRoomId = null;
            }

            this.syncCurrentRoomFromEditor({ passive: true });

            if (!this.currentRoomId) {
                const initial = this.chooseInitialRoom(graph);
                if (initial) {
                    this.currentRoomId = initial;
                    this.discovered.add(initial);
                }
            }

            this.ensureMazeLayout(graph);
            this.saveState();

            const roomName = this.getRoomLabel(this.currentRoomId) || 'the stacks';
            this.setStatus(`Mapped ${graph.nodes.size} rooms • ${graph.edgeCount} link-pairs • You are in ${roomName}.`);
            if (announce) {
                this.appendLog('system', `The map settles. You are in ${roomName}.`);
            }
            this.renderMap();
        } catch (error) {
            console.error('[BabelMazeView] Failed to refresh graph:', error);
            this.setStatus('The catalog is smudged. Refresh failed.');
            this.appendLog('system', 'The catalog is smudged. I cannot map the stacks right now.');
        } finally {
            this.graphRefreshInFlight = false;
        }
    }

    chooseInitialRoom(graph) {
        if (!graph?.nodes?.size) return null;
        const currentPath = this._getCurrentFilePath();
        if (currentPath) {
            const normalized = String(currentPath).replace(/\\/g, '/');
            for (const node of graph.nodes.values()) {
                if ((node.path || '').replace(/\\/g, '/') === normalized) return node.id;
            }
        }
        const ids = Array.from(graph.nodes.keys()).sort((a, b) => a.localeCompare(b));
        return ids[0] || null;
    }

    // === Maze layout (physical labyrinth over all rooms) ===

    fnv1a32(input) {
        const text = String(input ?? '');
        let hash = 0x811c9dc5;
        for (let i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return hash >>> 0;
    }

    mulberry32(seed) {
        let t = seed >>> 0;
        return () => {
            t += 0x6d2b79f5;
            let x = t;
            x = Math.imul(x ^ (x >>> 15), x | 1);
            x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
            return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
    }

    computeMazeSignature(roomOrder, width) {
        const payload = `${Number(width) || 0}\n${Number(roomOrder?.cellCount) || 0}\n${Array.isArray(roomOrder?.noteOrder) ? roomOrder.noteOrder.join('\n') : ''}`;
        return `${this.layoutVersion}:${this.fnv1a32(payload).toString(16)}:${Number(roomOrder?.cellCount) || 0}:${Array.isArray(roomOrder?.noteOrder) ? roomOrder.noteOrder.length : 0}`;
    }

    isValidSavedMazeLayout(layout) {
        if (!layout || typeof layout !== 'object') return false;
        if (layout.version !== this.layoutVersion) return false;
        if (typeof layout.signature !== 'string') return false;
        if (!Number.isInteger(layout.width) || layout.width <= 0) return false;
        if (!Number.isInteger(layout.cellCount) || layout.cellCount <= 0) return false;
        if (!Array.isArray(layout.noteOrder) || !layout.noteOrder.every(v => typeof v === 'string' && v)) return false;
        if (!Array.isArray(layout.basePassages) || layout.basePassages.length !== layout.cellCount) return false;
        if (!layout.basePassages.every(v => Number.isInteger(v) && v >= 0 && v <= 15)) return false;
        return true;
    }

    ensureMazeLayout(graph = this.graph) {
        if (!graph?.nodes?.size) {
            this.maze = null;
            return;
        }

        const graphRoomIds = Array.from(graph.nodes.keys());
        const graphRoomSet = new Set(graphRoomIds);

        const saved = this.isValidSavedMazeLayout(this.savedMazeLayout) ? this.savedMazeLayout : null;

        let noteOrder = [];
        if (saved?.noteOrder?.length) {
            noteOrder = saved.noteOrder.filter(id => graphRoomSet.has(id));
        }
        if (!noteOrder.length) {
            noteOrder = graphRoomIds.slice().sort((a, b) => a.localeCompare(b));
        } else {
            const seen = new Set(noteOrder);
            const newIds = graphRoomIds.filter(id => !seen.has(id)).sort((a, b) => a.localeCompare(b));
            if (newIds.length) noteOrder = noteOrder.concat(newIds);
        }

        const noteCount = noteOrder.length;
        if (!noteCount) {
            this.maze = null;
            return;
        }

        const desired = Math.max(noteCount, Math.ceil(noteCount * this.mazeSparsityFactor));
        const cellCount = Math.max(noteCount, Math.min(this.mazeMaxCells, Math.max(saved?.cellCount || 0, desired)));

        const minimumWidth = cellCount === 1 ? 1 : 2;
        const defaultWidth = Math.ceil(Math.sqrt(cellCount));
        let width = saved?.width || defaultWidth;
        if (!Number.isInteger(width) || width <= 0) width = defaultWidth;
        width = Math.max(minimumWidth, Math.min(width, Math.max(minimumWidth, cellCount)));
        const height = Math.max(1, Math.ceil(cellCount / width));

        const signature = this.computeMazeSignature({ noteOrder, cellCount }, width);
        const reuse = Boolean(saved && saved.signature === signature && Array.isArray(saved.basePassages) && saved.basePassages.length === cellCount);

        const seed = this.fnv1a32(signature);
        const basePassages = reuse
            ? saved.basePassages.slice()
            : this.generateMazePassages(cellCount, width, height, seed);

        const cellRoomIds = new Array(cellCount);
        for (let i = 0; i < cellCount; i += 1) {
            cellRoomIds[i] = `__void:${i}`;
        }

        const indices = new Array(cellCount);
        for (let i = 0; i < cellCount; i += 1) indices[i] = i;
        const placementRng = this.mulberry32(this.fnv1a32(`${signature}:placement`));
        for (let i = indices.length - 1; i > 0; i -= 1) {
            const j = Math.floor(placementRng() * (i + 1));
            const tmp = indices[i];
            indices[i] = indices[j];
            indices[j] = tmp;
        }

        for (let i = 0; i < noteCount; i += 1) {
            const idx = indices[i];
            if (idx == null) break;
            cellRoomIds[idx] = noteOrder[i];
        }

        const maze = {
            version: this.layoutVersion,
            signature,
            width,
            height,
            roomOrder: cellRoomIds,
            basePassages,
            linkOpenMask: new Array(cellCount).fill(0),
            indexByRoomId: new Map(),
            coordByRoomId: new Map()
        };

        for (let index = 0; index < cellRoomIds.length; index += 1) {
            const roomId = cellRoomIds[index];
            maze.indexByRoomId.set(roomId, index);
            maze.coordByRoomId.set(roomId, {
                index,
                x: index % width,
                y: Math.floor(index / width)
            });
        }

        this.maze = maze;
        this.savedMazeLayout = {
            version: this.layoutVersion,
            signature,
            width,
            cellCount,
            noteOrder,
            basePassages
        };

        this.updateMazeLinkOpenings(graph);
    }

    generateMazePassages(count, width, height, seed) {
        const DIR_N = 1;
        const DIR_E = 2;
        const DIR_S = 4;
        const DIR_W = 8;

        const passages = new Array(count).fill(0);
        if (count <= 1) return passages;

        const rng = this.mulberry32(seed);
        const visited = new Array(count).fill(false);
        const stack = [0];
        visited[0] = true;

        const neighborsOf = (index) => {
            const x = index % width;
            const y = Math.floor(index / width);
            const candidates = [];

            if (y > 0) {
                const n = (y - 1) * width + x;
                if (n >= 0 && n < count) candidates.push({ index: n, dir: DIR_N });
            }
            if (x < width - 1) {
                const e = y * width + (x + 1);
                if (e >= 0 && e < count) candidates.push({ index: e, dir: DIR_E });
            }
            if (y < height - 1) {
                const s = (y + 1) * width + x;
                if (s >= 0 && s < count) candidates.push({ index: s, dir: DIR_S });
            }
            if (x > 0) {
                const w = y * width + (x - 1);
                if (w >= 0 && w < count) candidates.push({ index: w, dir: DIR_W });
            }

            return candidates;
        };

        const opposite = (dir) => {
            switch (dir) {
                case DIR_N:
                    return DIR_S;
                case DIR_E:
                    return DIR_W;
                case DIR_S:
                    return DIR_N;
                case DIR_W:
                    return DIR_E;
                default:
                    return 0;
            }
        };

        while (stack.length) {
            const current = stack[stack.length - 1];
            const options = neighborsOf(current).filter(entry => !visited[entry.index]);
            if (!options.length) {
                stack.pop();
                continue;
            }

            const pick = options[Math.floor(rng() * options.length)];
            visited[pick.index] = true;
            passages[current] |= pick.dir;
            passages[pick.index] |= opposite(pick.dir);
            stack.push(pick.index);
        }

        // Add a few extra loops to increase navigable complexity.
        const loopChance = Math.min(0.025, 8 / Math.max(1, count));
        for (let index = 0; index < count; index += 1) {
            const x = index % width;
            const y = Math.floor(index / width);
            if (x < width - 1) {
                const e = y * width + (x + 1);
                if (e < count && !(passages[index] & DIR_E) && rng() < loopChance) {
                    passages[index] |= DIR_E;
                    passages[e] |= DIR_W;
                }
            }
            if (y < height - 1) {
                const s = (y + 1) * width + x;
                if (s < count && !(passages[index] & DIR_S) && rng() < loopChance) {
                    passages[index] |= DIR_S;
                    passages[s] |= DIR_N;
                }
            }
        }

        return passages;
    }

    updateMazeLinkOpenings(graph = this.graph) {
        if (!this.maze || !graph?.outbound) return;
        const maze = this.maze;
        const count = maze.roomOrder.length;
        const mask = new Array(count).fill(0);

        const DIR_N = 1;
        const DIR_E = 2;
        const DIR_S = 4;
        const DIR_W = 8;

        const openBetween = (a, b, dir) => {
            switch (dir) {
                case DIR_N:
                    mask[a] |= DIR_N;
                    mask[b] |= DIR_S;
                    return;
                case DIR_E:
                    mask[a] |= DIR_E;
                    mask[b] |= DIR_W;
                    return;
                case DIR_S:
                    mask[a] |= DIR_S;
                    mask[b] |= DIR_N;
                    return;
                case DIR_W:
                    mask[a] |= DIR_W;
                    mask[b] |= DIR_E;
                    return;
                default:
                    return;
            }
        };

        for (const [fromId, targets] of graph.outbound.entries()) {
            const fromIndex = maze.indexByRoomId.get(fromId);
            if (fromIndex == null) continue;
            const fromX = fromIndex % maze.width;
            const fromY = Math.floor(fromIndex / maze.width);

            for (const toId of targets) {
                const toIndex = maze.indexByRoomId.get(toId);
                if (toIndex == null) continue;
                const toX = toIndex % maze.width;
                const toY = Math.floor(toIndex / maze.width);

                const dx = toX - fromX;
                const dy = toY - fromY;
                if (dx === 0 && dy === -1) openBetween(fromIndex, toIndex, DIR_N);
                else if (dx === 1 && dy === 0) openBetween(fromIndex, toIndex, DIR_E);
                else if (dx === 0 && dy === 1) openBetween(fromIndex, toIndex, DIR_S);
                else if (dx === -1 && dy === 0) openBetween(fromIndex, toIndex, DIR_W);
            }
        }

        maze.linkOpenMask = mask;
    }

    getRoom(roomId) {
        if (!roomId) return null;
        if (this.graph?.nodes?.has?.(roomId)) return this.graph.nodes.get(roomId) || null;
        if (this.isVoidRoomId(roomId)) {
            return {
                id: roomId,
                name: 'Empty alcove',
                dir: 'void',
                path: null,
                excerpt: '',
                headings: [],
                wordCount: 0,
                isVoid: true
            };
        }
        return null;
    }

    getRoomLabel(roomId) {
        const room = this.getRoom(roomId);
        if (!room) return '';
        if (room.isVoid) return room.name || 'Empty alcove';
        if (this.graph?.nodes?.has?.(roomId) && !this.inventory.has(roomId)) return 'Sealed folio';
        return room.name || room.id || '';
    }

    getPhysicalDirectionMap(roomId) {
        if (!roomId || !this.maze?.indexByRoomId) {
            return { north: null, east: null, south: null, west: null, openedByLink: {} };
        }

        const index = this.maze.indexByRoomId.get(roomId);
        if (index == null) {
            return { north: null, east: null, south: null, west: null, openedByLink: {} };
        }

        const DIR_N = 1;
        const DIR_E = 2;
        const DIR_S = 4;
        const DIR_W = 8;

        const count = this.maze.roomOrder.length;
        const width = this.maze.width;
        const x = index % width;
        const y = Math.floor(index / width);

        const base = this.maze.basePassages[index] || 0;
        const link = this.maze.linkOpenMask[index] || 0;
        const mask = base | link;

        const openedByLink = {
            north: Boolean((link & DIR_N) && !(base & DIR_N)),
            east: Boolean((link & DIR_E) && !(base & DIR_E)),
            south: Boolean((link & DIR_S) && !(base & DIR_S)),
            west: Boolean((link & DIR_W) && !(base & DIR_W))
        };

        const north = y > 0 && (mask & DIR_N) ? this.maze.roomOrder[index - width] : null;
        const east = x < width - 1 && (mask & DIR_E) ? this.maze.roomOrder[index + 1] : null;
        const south = (mask & DIR_S) ? this.maze.roomOrder[index + width] : null;
        const west = x > 0 && (mask & DIR_W) ? this.maze.roomOrder[index - 1] : null;

        return {
            north: north || null,
            east: east || null,
            south: (index + width < count) ? (south || null) : null,
            west: west || null,
            openedByLink
        };
    }

    moveByDirection(direction, options = {}) {
        if (!this.graphReady) return;
        if (!this.maze) this.ensureMazeLayout(this.graph);
        if (!this.maze) return;

        const dir = String(direction || '').toLowerCase();
        const map = this.getPhysicalDirectionMap(this.currentRoomId);
        const target = map?.[dir] || null;
        if (target) {
            this.moveToRoom(target, { ...options, source: options.source || 'move' });
            return;
        }
        if ((this.maze.roomOrder?.length || 0) <= 1) {
            this.appendLog('system', 'The maze is a single room. Write more pages to grow it.');
            return;
        }
        this.appendLog('system', 'You press your palm to the wall. No passage yields.');
    }

    getNeighbors(roomId) {
        if (!roomId || !this.graph?.adjacency) return [];
        const set = this.graph.adjacency.get(roomId);
        if (!set) return [];
        return Array.from(set);
    }

    computeDirectionMap(roomId) {
        const neighbors = this.getNeighbors(roomId)
            .map(id => this.getRoom(id))
            .filter(Boolean)
            .sort((a, b) => {
                const scoreA = this.graph.inboundCount.get(a.id) || 0;
                const scoreB = this.graph.inboundCount.get(b.id) || 0;
                if (scoreA !== scoreB) return scoreB - scoreA;
                return (a.name || a.id).localeCompare(b.name || b.id);
            });

        const primary = neighbors.slice(0, 4);
        const extras = neighbors.slice(4);

        return {
            north: primary[0]?.id || null,
            east: primary[1]?.id || null,
            south: primary[2]?.id || null,
            west: primary[3]?.id || null,
            extras: extras.map(n => n.id)
        };
    }

    // === Map rendering + interaction (SVG pan/zoom) ===

    getMapGeometry() {
        const cellSize = 340;
        const padding = 240;
        const mazeWidth = Math.max(1, this.maze?.width || 1);
        const mazeHeight = Math.max(1, this.maze?.height || 1);
        const mazeW = padding * 2 + Math.max(0, mazeWidth - 1) * cellSize;
        const mazeH = padding * 2 + Math.max(0, mazeHeight - 1) * cellSize;
        return { cellSize, padding, mazeW, mazeH };
    }

    applyMapViewBox() {
        const svg = this.elements.mapSvg;
        if (!svg || !this.mapViewBox) return;
        const { x, y, width, height } = this.mapViewBox;
        svg.setAttribute('viewBox', `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}`);
    }

    clampMapViewBox(box) {
        const geom = this.getMapGeometry();
        const bounds = { x: 0, y: 0, width: geom.mazeW, height: geom.mazeH };
        const safe = {
            x: Number.isFinite(box?.x) ? box.x : bounds.x,
            y: Number.isFinite(box?.y) ? box.y : bounds.y,
            width: Number.isFinite(box?.width) ? box.width : bounds.width,
            height: Number.isFinite(box?.height) ? box.height : bounds.height
        };

        const minW = Math.min(bounds.width, Math.max(geom.cellSize * 1.8, 240));
        const minH = Math.min(bounds.height, Math.max(geom.cellSize * 1.4, 200));
        safe.width = Math.max(minW, Math.min(safe.width, bounds.width));
        safe.height = Math.max(minH, Math.min(safe.height, bounds.height));

        safe.x = Math.max(bounds.x, Math.min(safe.x, bounds.x + bounds.width - safe.width));
        safe.y = Math.max(bounds.y, Math.min(safe.y, bounds.y + bounds.height - safe.height));

        return safe;
    }

    setMapViewBox(box, { user = false } = {}) {
        if (!this.maze) return;
        const signature = this.maze.signature;
        const clamped = this.clampMapViewBox(box);
        this.mapViewBox = { ...clamped, signature };
        if (user) this.mapUserHasPanned = true;
        this.applyMapViewBox();
    }

    getRoomMapPoint(roomId) {
        if (!this.maze?.coordByRoomId) return null;
        const coord = this.maze.coordByRoomId.get(roomId);
        if (!coord) return null;
        const geom = this.getMapGeometry();
        return {
            x: geom.padding + coord.x * geom.cellSize,
            y: geom.padding + coord.y * geom.cellSize
        };
    }

    fitMapToMaze({ user = false } = {}) {
        if (!this.maze) return;
        const geom = this.getMapGeometry();
        this.setMapViewBox(
            {
                x: 0,
                y: 0,
                width: geom.mazeW,
                height: geom.mazeH
            },
            { user }
        );
    }

    centerMapOnRoom(roomId, { user = false, preserveZoom = true } = {}) {
        if (!this.maze || !roomId) return;
        const pt = this.getRoomMapPoint(roomId);
        if (!pt) return;

        const svg = this.elements.mapSvg;
        const ratio = svg?.clientWidth && svg?.clientHeight ? svg.clientWidth / svg.clientHeight : 1.6;
        const geom = this.getMapGeometry();

        let width = preserveZoom && this.mapViewBox?.signature === this.maze.signature
            ? this.mapViewBox.width
            : Math.min(geom.mazeW, geom.cellSize * 10);
        let height = width / ratio;
        if (height > geom.mazeH) {
            height = Math.min(geom.mazeH, geom.cellSize * 8);
            width = height * ratio;
        }

        this.setMapViewBox(
            {
                x: pt.x - width / 2,
                y: pt.y - height / 2,
                width,
                height
            },
            { user }
        );
    }

    zoomMap(factor, { user = false, about = null } = {}) {
        if (!this.maze) return;
        if (!this.mapViewBox || this.mapViewBox.signature !== this.maze.signature) {
            this.centerMapOnRoom(this.currentRoomId, { user: false, preserveZoom: false });
        }
        if (!this.mapViewBox) return;

        const vb = this.mapViewBox;
        const point = about && Number.isFinite(about.x) && Number.isFinite(about.y)
            ? about
            : { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2 };

        const relX = vb.width ? (point.x - vb.x) / vb.width : 0.5;
        const relY = vb.height ? (point.y - vb.y) / vb.height : 0.5;

        const nextW = vb.width * factor;
        const nextH = vb.height * factor;

        this.setMapViewBox(
            {
                x: point.x - relX * nextW,
                y: point.y - relY * nextH,
                width: nextW,
                height: nextH
            },
            { user }
        );
    }

    handleMapWheel(event) {
        if (!this.maze) return;
        event.preventDefault();

        const svg = this.elements.mapSvg;
        if (!svg) return;
        if (!this.mapViewBox || this.mapViewBox.signature !== this.maze.signature) {
            this.centerMapOnRoom(this.currentRoomId, { user: false, preserveZoom: false });
        }
        if (!this.mapViewBox) return;

        const rect = svg.getBoundingClientRect();
        const nx = rect.width ? (event.clientX - rect.left) / rect.width : 0.5;
        const ny = rect.height ? (event.clientY - rect.top) / rect.height : 0.5;

        const vb = this.mapViewBox;
        const about = {
            x: vb.x + nx * vb.width,
            y: vb.y + ny * vb.height
        };

        const base = event.ctrlKey ? 1.12 : 1.08;
        const factor = event.deltaY < 0 ? 1 / base : base;
        this.zoomMap(factor, { user: true, about });
    }

    handleMapPointerDown(event) {
        if (!this.maze) return;
        if (event.button !== 0) return;
        const svg = this.elements.mapSvg;
        if (!svg) return;

        const clickedNode = event.target?.closest?.('[data-room-id]');
        if (clickedNode) return;

        if (!this.mapViewBox || this.mapViewBox.signature !== this.maze.signature) {
            this.centerMapOnRoom(this.currentRoomId, { user: false, preserveZoom: false });
        }
        if (!this.mapViewBox) return;

        svg.setPointerCapture?.(event.pointerId);
        this.mapPointerState = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startViewBox: { ...this.mapViewBox },
            moved: false
        };
        event.preventDefault();
    }

    handleMapPointerMove(event) {
        const state = this.mapPointerState;
        const svg = this.elements.mapSvg;
        if (!state || !svg) return;
        if (state.pointerId !== event.pointerId) return;

        const dx = event.clientX - state.startClientX;
        const dy = event.clientY - state.startClientY;
        if (!state.moved && Math.hypot(dx, dy) > 3) state.moved = true;

        const rect = svg.getBoundingClientRect();
        const scaleX = rect.width ? state.startViewBox.width / rect.width : 1;
        const scaleY = rect.height ? state.startViewBox.height / rect.height : 1;

        this.setMapViewBox(
            {
                x: state.startViewBox.x - dx * scaleX,
                y: state.startViewBox.y - dy * scaleY,
                width: state.startViewBox.width,
                height: state.startViewBox.height
            },
            { user: true }
        );
    }

    handleMapPointerUp(event) {
        const state = this.mapPointerState;
        const svg = this.elements.mapSvg;
        if (!state || !svg) return;
        if (state.pointerId !== event.pointerId) return;

        svg.releasePointerCapture?.(event.pointerId);
        const moved = Boolean(state.moved);
        this.mapPointerState = { moved };
        setTimeout(() => {
            if (this.mapPointerState?.moved === moved) this.mapPointerState = null;
        }, 0);
    }

    renderMap() {
        const svg = this.elements.mapSvg;
        if (!svg) return;

        if (!this.graphReady || !this.graph?.nodes?.size) {
            svg.innerHTML = '';
            svg.setAttribute('viewBox', '0 0 100 100');
            svg.innerHTML = `<text x="50" y="52" text-anchor="middle" class="bm-map-placeholder">unmapped</text>`;
            if (this.elements.mapTitle) this.elements.mapTitle.textContent = '—';
            return;
        }

        if (!this.maze) this.ensureMazeLayout(this.graph);
        if (!this.maze) return;

        const current = this.getRoom(this.currentRoomId);
        if (!current) return;

        if (this.elements.mapTitle) {
            const dir = current.dir ? `${current.dir}/` : '';
            this.elements.mapTitle.textContent = `${dir}${current.basenameNoExt || current.name || current.id}`;
        }

        if (!this.mapViewBox || this.mapViewBox.signature !== this.maze.signature) {
            this.mapUserHasPanned = false;
            this.mapViewBox = null;
            this.centerMapOnRoom(this.currentRoomId, { user: false, preserveZoom: false });
        } else if (!this.mapUserHasPanned) {
            this.centerMapOnRoom(this.currentRoomId, { user: false, preserveZoom: true });
        } else {
            this.applyMapViewBox();
        }

        const DIR_N = 1;
        const DIR_E = 2;
        const DIR_S = 4;
        const DIR_W = 8;

        const geom = this.getMapGeometry();
        const count = this.maze.roomOrder.length;
        const positions = new Array(count);
        const maxInset = Math.max(10, geom.cellSize / 2 - 16);
        const nodeInset = Math.min(92, maxInset);

        for (let index = 0; index < count; index += 1) {
            const x = index % this.maze.width;
            const y = Math.floor(index / this.maze.width);
            positions[index] = {
                x,
                y,
                cx: geom.padding + x * geom.cellSize,
                cy: geom.padding + y * geom.cellSize
            };
        }

        const effectiveMaskAt = (index) => (this.maze.basePassages[index] || 0) | (this.maze.linkOpenMask[index] || 0);

        const edges = [];
        const walls = [];
        const currentIndex = this.maze.indexByRoomId.get(current.id);
        for (let index = 0; index < count; index += 1) {
            const pos = positions[index];
            const baseMask = this.maze.basePassages[index] || 0;
            const linkMask = this.maze.linkOpenMask[index] || 0;
            const mask = effectiveMaskAt(index);

            // Walls: draw each cell's top/left boundary once, and right/bottom boundary from this cell.
            const half = geom.cellSize / 2;
            const leftX = pos.cx - half;
            const rightX = pos.cx + half;
            const topY = pos.cy - half;
            const bottomY = pos.cy + half;

            if (pos.x === 0) {
                walls.push(
                    `<line class="bm-map-wall" vector-effect="non-scaling-stroke" x1="${leftX}" y1="${topY}" x2="${leftX}" y2="${bottomY}" />`
                );
            }
            if (pos.y === 0) {
                walls.push(
                    `<line class="bm-map-wall" vector-effect="non-scaling-stroke" x1="${leftX}" y1="${topY}" x2="${rightX}" y2="${topY}" />`
                );
            }

            const eastIndex = index + 1;
            const southIndex = index + this.maze.width;
            const hasEastCell = pos.x < this.maze.width - 1 && eastIndex < count;
            const hasSouthCell = southIndex < count;

            if (!hasEastCell || !(mask & DIR_E)) {
                walls.push(
                    `<line class="bm-map-wall" vector-effect="non-scaling-stroke" x1="${rightX}" y1="${topY}" x2="${rightX}" y2="${bottomY}" />`
                );
            }
            if (!hasSouthCell || !(mask & DIR_S)) {
                walls.push(
                    `<line class="bm-map-wall" vector-effect="non-scaling-stroke" x1="${leftX}" y1="${bottomY}" x2="${rightX}" y2="${bottomY}" />`
                );
            }

            if (pos.x < this.maze.width - 1) {
                const east = index + 1;
                if (east < count && (mask & DIR_E)) {
                    const isLink = !(baseMask & DIR_E) && (linkMask & DIR_E);
                    const isActive = currentIndex != null && (index === currentIndex || east === currentIndex);
                    edges.push(
                        `<line class="bm-map-edge${isLink ? ' bm-map-edge-link' : ''}${isActive ? ' bm-map-edge-active' : ''}" vector-effect="non-scaling-stroke" x1="${pos.cx + nodeInset}" y1="${pos.cy}" x2="${positions[east].cx - nodeInset}" y2="${positions[east].cy}" />`
                    );
                }
            }

            const south = index + this.maze.width;
            if (south < count && (mask & DIR_S)) {
                const isLink = !(baseMask & DIR_S) && (linkMask & DIR_S);
                const isActive = currentIndex != null && (index === currentIndex || south === currentIndex);
                edges.push(
                    `<line class="bm-map-edge${isLink ? ' bm-map-edge-link' : ''}${isActive ? ' bm-map-edge-active' : ''}" vector-effect="non-scaling-stroke" x1="${pos.cx}" y1="${pos.cy + nodeInset}" x2="${positions[south].cx}" y2="${positions[south].cy - nodeInset}" />`
                );
            }
        }

        const inboundIds = Array.from(this.graph?.inbound?.get(current.id) || []).filter(Boolean);
        const inboundSet = new Set(inboundIds);

        const secret = [];
        let outbound = [];
        let outboundSet = new Set();
        if (currentIndex != null) {
            outbound = Array.from(this.graph.outbound.get(current.id) || [])
                .filter(id => this.maze.indexByRoomId.has(id))
                .sort((a, b) => this.getRoomLabel(a).localeCompare(this.getRoomLabel(b)))
                .slice(0, 18);
            outboundSet = new Set(outbound);

            const from = positions[currentIndex];
            outbound.forEach((targetId, idx) => {
                const toIndex = this.maze.indexByRoomId.get(targetId);
                if (toIndex == null) return;
                const to = positions[toIndex];

                const dx = to.cx - from.cx;
                const dy = to.cy - from.cy;
                const len = Math.hypot(dx, dy) || 1;

                const inset = nodeInset;
                const startX = from.cx + (dx / len) * inset;
                const startY = from.cy + (dy / len) * inset;
                const endX = to.cx - (dx / len) * inset;
                const endY = to.cy - (dy / len) * inset;

                const midX = (startX + endX) / 2;
                const midY = (startY + endY) / 2;
                const bump = (16 + (idx % 5) * 6) * (idx % 2 === 0 ? 1 : -1);
                const ox = (-dy / len) * bump;
                const oy = (dx / len) * bump;
                const curveX = midX + ox;
                const curveY = midY + oy;

                secret.push(
                    `<path class="bm-map-secret bm-map-secret-glow" vector-effect="non-scaling-stroke" d="M ${startX} ${startY} Q ${curveX} ${curveY} ${endX} ${endY}" />` +
                    `<path class="bm-map-secret bm-map-secret-core" vector-effect="non-scaling-stroke" marker-end="url(#bm-portal-arrow)" d="M ${startX} ${startY} Q ${curveX} ${curveY} ${endX} ${endY}" />`
                );
            });
        }

        const nodes = [];
        for (let index = 0; index < count; index += 1) {
            const roomId = this.maze.roomOrder[index];
            const room = this.getRoom(roomId);
            if (!room) continue;
            const pos = positions[index];

            const discovered = this.discovered.has(roomId);
            const isCurrent = roomId === current.id;
            const isPortalOut = outboundSet.has(roomId);
            const isPortalIn = inboundSet.has(roomId);
            const isVoid = Boolean(room.isVoid);
            const isNote = !isVoid && this.graph?.nodes?.has?.(roomId);
            const isOpened = isNote && this.inventory.has(roomId);
            const isSecret = isNote && !isOpened;

            const rawLabel = isVoid ? '' : isOpened ? (room.basenameNoExt || room.name || room.id) : 'sealed';
            const label = rawLabel.length > 18 ? `${rawLabel.slice(0, 16)}…` : rawLabel;
            const title = isVoid ? room.id : isOpened ? room.id : 'Sealed folio';

            nodes.push(
                `<g class="bm-map-room" role="button" tabindex="0" data-room-id="${this.escapeHTML(roomId)}" data-kind="${isVoid ? 'void' : 'note'}" data-secret="${isSecret ? 'true' : 'false'}" data-discovered="${discovered ? 'true' : 'false'}" data-current="${isCurrent ? 'true' : 'false'}" data-portal-out="${isPortalOut ? 'true' : 'false'}" data-portal-in="${isPortalIn ? 'true' : 'false'}" transform="translate(${pos.cx} ${pos.cy})">` +
                `<rect class="bm-map-node-portal" vector-effect="non-scaling-stroke" x="-62" y="-30" width="124" height="60" />` +
                `<rect class="bm-map-node" vector-effect="non-scaling-stroke" x="-55" y="-26" width="110" height="52" />` +
                (label ? `<text class="bm-map-label" text-anchor="middle" dominant-baseline="middle" y="2">${this.escapeHTML(label)}</text>` : '') +
                `<title>${this.escapeHTML(title)}</title>` +
                `</g>`
            );
        }

        const currentPos = currentIndex != null ? positions[currentIndex] : null;
        const spotlightRadius = geom.cellSize * 1.35;
        const spotlightHardRadius = geom.cellSize * 0.62;
        const exploredRadius = geom.cellSize * 0.75;
        const blur = Math.max(10, geom.cellSize * 0.14);

        const defs = `
            <defs>
                <marker id="bm-portal-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path class="bm-map-secret-arrow" d="M 0 0 L 10 5 L 0 10 z"></path>
                </marker>
                <filter id="bm-spotlight-blur" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="${blur.toFixed(1)}"></feGaussianBlur>
                </filter>
                <mask id="bm-spotlight-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${geom.mazeW}" height="${geom.mazeH}">
                    <rect x="0" y="0" width="${geom.mazeW}" height="${geom.mazeH}" fill="white"></rect>
                    <g ${this.discovered?.size ? `filter="url(#bm-spotlight-blur)"` : ''}>
                        ${Array.from(this.discovered || [])
                            .slice(0, 4000)
                            .map((id) => {
                                const idx = this.maze?.indexByRoomId?.get?.(id);
                                if (idx == null) return '';
                                const pt = positions[idx];
                                if (!pt) return '';
                                return `<circle cx="${pt.cx}" cy="${pt.cy}" r="${exploredRadius}" fill="black"></circle>`;
                            })
                            .join('')}
                        ${currentPos ? `<circle cx="${currentPos.cx}" cy="${currentPos.cy}" r="${spotlightRadius}" fill="black"></circle>` : ''}
                    </g>
                    ${currentPos ? `<circle cx="${currentPos.cx}" cy="${currentPos.cy}" r="${spotlightHardRadius}" fill="black"></circle>` : ''}
                </mask>
            </defs>
        `;

        const ambient = currentPos
            ? `<g class="bm-map-ambient"><circle class="bm-map-illumination" cx="${currentPos.cx}" cy="${currentPos.cy}" r="${spotlightRadius}"></circle></g>`
            : '';

        const overlay = currentPos
            ? `<g class="bm-map-overlay"><rect class="bm-map-dim" x="0" y="0" width="${geom.mazeW}" height="${geom.mazeH}" mask="url(#bm-spotlight-mask)"></rect></g>`
            : '';

        svg.innerHTML = `${defs}${ambient}<g class="bm-map-walls">${walls.join('')}</g><g class="bm-map-edges">${edges.join('')}</g><g class="bm-map-secrets">${secret.join('')}</g><g class="bm-map-nodes">${nodes.join('')}</g>${overlay}`;
    }

    moveToRoom(roomId, options = {}) {
        if (!roomId || !this.graphReady) return;
        if (!this.graph?.nodes?.has?.(roomId) && !this.isVoidRoomId(roomId)) return;

        const previous = this.currentRoomId;
        if (options.recordHistory !== false && previous && previous !== roomId) {
            const last = this.travelHistory[this.travelHistory.length - 1];
            if (last !== previous) {
                this.travelHistory.push(previous);
                while (this.travelHistory.length > this.maxTravelHistory) this.travelHistory.shift();
            }
        }
        this.currentRoomId = roomId;
        this.discovered.add(roomId);
        this.revealAround(roomId, 1);
        this.saveState();

        const label = this.getRoomLabel(roomId);
        const verb = options.source === 'portal'
            ? 'A sigil-door folds. You arrive in'
            : options.source === 'click'
                ? 'You step into'
                : 'You drift into';
        if (previous !== roomId) {
            this.appendLog('system', `${verb} ${label}.`);
        }

        this.setStatus(`You are in ${label}.`);
        if (!this.maze) this.ensureMazeLayout(this.graph);
        this.centerMapOnRoom(roomId, { user: false, preserveZoom: true });
        this.renderMap();
    }

    executeCommand(raw) {
        this.runCommand(raw).catch(error => {
            console.error('[BabelMazeView] Command failed:', error);
            this.appendLog('system', 'A corridor collapses mid-sentence. (Command failed.)');
        });
    }

    async runCommand(raw) {
        const input = String(raw || '').trim();
        if (!input) return;

        const [head, ...rest] = input.split(/\s+/);
        const cmd = (head || '').toLowerCase();
        const args = rest.join(' ').trim();

        if (!this.graphReady && cmd !== 'help' && cmd !== 'refresh') {
            await this.refreshGraph({ announce: false });
        }

        switch (cmd) {
            case 'help':
            case '?':
                return this.cmdHelp();
            case 'refresh':
            case 'rebuild':
                return this.refreshGraph({ announce: true });
            case 'look':
            case 'l':
                return this.cmdLook();
            case 'map':
            case 'm':
                return this.cmdMap();
            case 'examine':
            case 'read':
            case 'x':
                return this.cmdExamine(args);
            case 'back':
            case 'return':
            case 'b':
                return this.cmdBack();
            case 'path':
            case 'route':
                return this.cmdPath(args);
            case 'quest':
            case 'quests':
                return this.cmdQuests();
            case 'stats':
                return this.cmdStats();
            case 'big':
            case 'picture':
            case 'reveal':
            case 'progress':
                return this.cmdBigPicture();
            case 'exits':
            case 'exit':
                return this.cmdExits();
            case 'go':
            case 'walk':
            case 'move':
                return this.cmdGo(args);
            case 'north':
            case 'n':
                return this.cmdGo('north');
            case 'east':
            case 'e':
                return this.cmdGo('east');
            case 'south':
            case 's':
                return this.cmdGo('south');
            case 'west':
            case 'w':
                return this.cmdGo('west');
            case 'open':
                return this.cmdOpen();
            case 'edit':
                return this.cmdEdit();
            case 'where':
            case 'here':
                return this.cmdWhere();
            case 'inventory':
            case 'inv':
            case 'i':
                return this.cmdInventory();
            case 'search':
            case 'find':
                return this.cmdSearch(args);
            case 'teleport':
            case 'recall':
                return this.cmdTeleport(args);
            case 'link':
                return this.cmdLink(args);
            case 'whisper':
            case 'ask':
                return this.cmdWhisper(args);
            default:
                this.appendLog('system', `Unknown command: ${cmd}. Try "help".`);
        }
    }

    cmdHelp() {
        this.appendLog(
            'system',
            [
                'Commands:',
                '  look                 Describe the current room',
                '  examine [room]        Read headings/excerpt + link context',
                '  map                  Map controls + current coordinates',
                '  exits                List stone exits + secret doors',
                '  go <north|east|...>   Traverse a stone corridor',
                '  go <room>             Traverse a secret door (must be linked)',
                '  back                 Return to the previous room',
                '  path <room>           Show a route (stone vs secret)',
                '  open                 Unseal the current note (adds to inventory)',
                '  edit                 Open the current note in the editor',
                '  inventory             Show collected notes',
                '  search <text>         Find rooms by name/path',
                '  teleport <room>       Jump to a room (by name or path)',
                '  link <room>           Inscribe a corridor (adds a [[link]])',
                '  quests               Show coherence quests (heuristics)',
                '  stats                Show maze statistics',
                '  big                  Big picture: what you have revealed',
                '  whisper <question>    Ask Ash for guidance (AI, optional)',
                '  refresh               Rebuild the maze index',
                '',
                'Keyboard:',
                '  arrows / WASD         Move through stone corridors',
                '  enter                Look around',
                '  space                Unseal (open) current room',
                '  tab                  Toggle focus map/input',
                '  scroll               Zoom map • drag to pan • 0 fit'
            ].join('\n')
        );
    }

    cmdWhere() {
        const room = this.getRoom(this.currentRoomId);
        if (!room) return this.appendLog('system', 'You are nowhere in particular.');
        this.appendLog('system', `${this.getRoomLabel(room.id)} (${room.id})`);
    }

    cmdLook() {
        const room = this.getRoom(this.currentRoomId);
        if (!room) return this.appendLog('system', 'There is only fog.');

        if (!this.maze) this.ensureMazeLayout(this.graph);
        const coord = this.maze?.coordByRoomId?.get(room.id) || null;

        const isNote = this.graph?.nodes?.has?.(room.id) === true;
        const opened = isNote && this.inventory.has(room.id);

        const inboundSources = Array.from(this.graph?.inbound?.get(room.id) || []);
        const outboundTargets = Array.from(this.graph?.outbound?.get(room.id) || []);
        const inbound = inboundSources.length;
        const outbound = outboundTargets.length;

        const dirMap = this.getPhysicalDirectionMap(room.id);
        const physicalLines = ['north', 'east', 'south', 'west']
            .map(dir => {
                const targetId = dirMap?.[dir];
                if (!targetId) return null;
                const breach = dirMap?.openedByLink?.[dir] ? ' (breach)' : '';
                return `${dir} → ${this.getRoomLabel(targetId)}${breach}`;
            })
            .filter(Boolean);

        const secretLines = outboundTargets
            .slice()
            .sort((a, b) => this.getRoomLabel(a).localeCompare(this.getRoomLabel(b)))
            .slice(0, 10)
            .map(id => `  • ${this.getRoomLabel(id)}`);

        this.appendLog(
            'system',
            [
                `${this.getRoomLabel(room.id)}`,
                opened ? `Path: ${room.id}` : `Path: ${room.isVoid ? room.id : '(sealed)'}`,
                `District: ${room.dir || 'root'}${coord ? ` • Cell: ${coord.x},${coord.y}` : ''}${opened && room.wordCount ? ` • Words: ${room.wordCount}` : ''}`,
                room.isVoid ? 'The shelves are bare. Dust settles into the grid.' : opened ? (room.excerpt ? `Excerpt: ${room.excerpt}` : 'Excerpt: (no text yet)') : 'A sealed folio hums behind glass. Press Enter/Space (or type "open") to unseal it.',
                opened && Array.isArray(room.headings) && room.headings.length ? `Headings: ${room.headings.slice(0, 4).join(' | ')}` : '',
                '',
                'Stone exits:',
                physicalLines.length ? physicalLines.map(line => `  ${line}`).join('\n') : '  (none)',
                isNote ? `Secret doors (links out): ${outbound}` : 'Secret doors (links out): none',
                opened ? (secretLines.length ? secretLines.join('\n') : '  (none)') : outbound ? '  (names obscured until unsealed)' : '  (none)',
                isNote ? `Echoes (links in): ${inbound}` : 'Echoes (links in): none',
                opened ? (inboundSources.length ? inboundSources.slice(0, 8).map(id => `  • ${this.getRoomLabel(id)}`).join('\n') : '  (none)') : inbound ? '  (names obscured until unsealed)' : '  (none)',
                opened && inbound === 0 ? '\nThis room is orphaned. Forge an inbound corridor to it from a related note with `link <room>`.' : ''
            ].filter(Boolean).join('\n')
        );
    }

    cmdMap() {
        const room = this.getRoom(this.currentRoomId);
        if (!room) return this.appendLog('system', 'There is only fog.');
        if (!this.maze) this.ensureMazeLayout(this.graph);
        const coord = this.maze?.coordByRoomId?.get(room.id) || null;
        const dims = this.maze ? `${this.maze.width}×${this.maze.height}` : '—';
        const cells = this.maze?.roomOrder?.length || 0;
        const notes = this.graph?.nodes?.size || 0;

        this.appendLog('system', [
            'Map:',
            `  Cells: ${cells} • Notes: ${notes}${this.maze ? ` • Grid: ${dims}` : ''}`,
            coord ? `  Current cell: (${coord.x}, ${coord.y})` : '',
            '  Controls: drag to pan • scroll to zoom • 0 fit • c center',
            '  Tip: click a sigil-ring to jump along a link.'
        ].filter(Boolean).join('\n'));
    }

    cmdExamine(rawTarget) {
        if (!this.graphReady || !this.graph?.nodes?.size) return;

        const query = String(rawTarget || '').trim();
        let room = null;

        if (!query) {
            room = this.getRoom(this.currentRoomId);
            if (!room) return this.appendLog('system', 'There is only fog.');
        } else {
            const matches = this.findRoomMatches(query, Array.from(this.graph.nodes.values()), { limit: 8 });
            if (!matches.length) {
                this.appendLog('system', `No room matches "${query}". Try "search ${query}".`);
                return;
            }
            if (matches.length > 1) {
                this.appendLog('system', `Too many rooms answer. Be more specific:\n${matches.map(n => `• ${n.name} (${n.id})`).join('\n')}`);
                return;
            }
            room = matches[0];
        }

        if (room?.isVoid) {
            this.appendLog('system', 'Nothing here to read. Only empty shelving.');
            return;
        }

        if (!this.inventory.has(room.id)) {
            this.appendLog('system', 'The folio is still sealed. Find it in the maze and "open" it first.');
            return;
        }

        if (!this.maze) this.ensureMazeLayout(this.graph);
        const coord = this.maze?.coordByRoomId?.get(room.id) || null;

        const inboundSources = Array.from(this.graph?.inbound?.get(room.id) || [])
            .slice()
            .sort((a, b) => this.getRoomLabel(a).localeCompare(this.getRoomLabel(b)));
        const outboundTargets = Array.from(this.graph?.outbound?.get(room.id) || [])
            .slice()
            .sort((a, b) => this.getRoomLabel(a).localeCompare(this.getRoomLabel(b)));

        const headings = Array.isArray(room.headings) ? room.headings.slice(0, 10) : [];

        const lines = [
            `${room.name}`,
            `Path: ${room.id}`,
            `District: ${room.dir || 'root'}${coord ? ` • Cell: ${coord.x},${coord.y}` : ''}${room.wordCount ? ` • Words: ${room.wordCount}` : ''}`,
            room.excerpt ? `Excerpt: ${room.excerpt}` : 'Excerpt: (no text yet)',
            headings.length ? `Headings:\n${headings.map(h => `  • ${h}`).join('\n')}` : '',
            '',
            `Links out: ${outboundTargets.length}${outboundTargets.length ? `\n${outboundTargets.slice(0, 12).map(id => `  • ${this.getRoomLabel(id)}`).join('\n')}` : ''}`,
            `Links in: ${inboundSources.length}${inboundSources.length ? `\n${inboundSources.slice(0, 12).map(id => `  • ${this.getRoomLabel(id)}`).join('\n')}` : ''}`
        ].filter(Boolean);

        this.appendLog('system', lines.join('\n'));
    }

    cmdBack() {
        if (!this.travelHistory.length) {
            this.appendLog('system', 'Your footprints are smudged. There is nowhere to return.');
            return;
        }

        let destination = this.travelHistory.pop();
        while (destination && !this.graph?.nodes?.has(destination) && this.travelHistory.length) {
            destination = this.travelHistory.pop();
        }

        if (!destination || !this.graph?.nodes?.has(destination)) {
            this.appendLog('system', 'The corridor behind you has been rebuilt. (No valid previous room.)');
            return;
        }

        this.moveToRoom(destination, { source: 'back', recordHistory: false });
    }

    cmdPath(rawTarget) {
        const query = String(rawTarget || '').trim();
        if (!query) {
            this.appendLog('system', 'Path to where? Try: path <room>.');
            return;
        }
        if (!this.graphReady || !this.graph?.nodes?.size) return;
        if (!this.maze) this.ensureMazeLayout(this.graph);
        if (!this.maze) return;

        const matches = this.findRoomMatches(query, Array.from(this.graph.nodes.values()), { limit: 8 });
        if (!matches.length) {
            this.appendLog('system', `No room matches "${query}". Try "search ${query}".`);
            return;
        }
        if (matches.length > 1) {
            this.appendLog('system', `Too many rooms answer. Be more specific:\n${matches.map(n => `• ${n.name} (${n.id})`).join('\n')}`);
            return;
        }

        const target = matches[0];
        if (target.id === this.currentRoomId) {
            this.appendLog('system', 'You are already there.');
            return;
        }

        const stone = this.findMazePath(this.currentRoomId, target.id, { includeSecrets: false });
        const mixed = this.findMazePath(this.currentRoomId, target.id, { includeSecrets: true });

        const formatSteps = (result) => {
            if (!result?.edges?.length) return '(unreachable)';
            const parts = result.edges.map(edge => {
                if (edge.type === 'physical') return edge.dir;
                return `sigil→${this.getRoomLabel(edge.to)}`;
            });
            const limit = 18;
            if (parts.length <= limit) return parts.join(' ');
            const head = parts.slice(0, 10).join(' ');
            const tail = parts.slice(-4).join(' ');
            return `${head} … (${parts.length - 14} more) … ${tail}`;
        };

        const stoneSteps = stone?.edges?.length ?? 0;
        const mixedSteps = mixed?.edges?.length ?? 0;

        this.appendLog(
            'system',
            [
                `Route to ${target.name}:`,
                stone ? `  Stone: ${stoneSteps} step${stoneSteps === 1 ? '' : 's'} • ${formatSteps(stone)}` : '  Stone: (unreachable)',
                mixed ? `  With sigils: ${mixedSteps} hop${mixedSteps === 1 ? '' : 's'} • ${formatSteps(mixed)}` : '  With sigils: (unreachable)',
                '',
                'Tip: create links to punch sigil-doors through long stone routes.'
            ].filter(Boolean).join('\n')
        );
    }

    cmdStats() {
        if (!this.graphReady || !this.graph) return;
        const nodes = this.graph.nodes.size;
        const linkPairs = this.graph.edgeCount || 0;

        let directedLinks = 0;
        for (const targets of this.graph.outbound?.values?.() || []) {
            directedLinks += targets?.size || 0;
        }

        if (!this.maze) this.ensureMazeLayout(this.graph);
        const bitCount4 = (mask) => ((mask & 1) ? 1 : 0) + ((mask & 2) ? 1 : 0) + ((mask & 4) ? 1 : 0) + ((mask & 8) ? 1 : 0);
        let stoneCorridors = 0;
        let breachCorridors = 0;
        if (this.maze?.basePassages?.length) {
            let stoneSum = 0;
            let breachSum = 0;
            for (let i = 0; i < this.maze.basePassages.length; i += 1) {
                const base = this.maze.basePassages[i] || 0;
                const link = this.maze.linkOpenMask?.[i] || 0;
                stoneSum += bitCount4(base);
                breachSum += bitCount4(link & ~base);
            }
            stoneCorridors = Math.floor(stoneSum / 2);
            breachCorridors = Math.floor(breachSum / 2);
        }

        let orphanCount = 0;
        let deadEndCount = 0;
        let totalDegree = 0;

        for (const [id, neighbors] of this.graph.adjacency.entries()) {
            const degree = neighbors?.size || 0;
            totalDegree += degree;
            if ((this.graph.inboundCount.get(id) || 0) === 0) orphanCount += 1;
            if (degree <= 1) deadEndCount += 1;
        }

        const avgDegree = nodes ? (totalDegree / nodes) : 0;
        this.appendLog(
            'system',
            [
                `Rooms: ${nodes}`,
                `Stone corridors: ${stoneCorridors}${breachCorridors ? ` (+${breachCorridors} breached)` : ''}`,
                `Link pairs (undirected): ${linkPairs}`,
                `Links out (directed): ${directedLinks}`,
                `Orphans (no incoming links): ${orphanCount}`,
                `Link dead ends (≤1 linked neighbor): ${deadEndCount}`,
                `Avg linked degree: ${avgDegree.toFixed(2)}`
            ].join('\n')
        );
    }

    cmdInventory() {
        if (!this.graphReady || !this.graph) return;
        const items = Array.from(this.inventory || [])
            .filter(id => this.graph.nodes.has(id))
            .map(id => this.getRoom(id))
            .filter(Boolean)
            .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

        const total = this.graph.nodes.size;
        const count = items.length;

        if (!count) {
            this.appendLog('system', `Inventory: empty. (0/${total})\nTip: stand on a sealed folio and press Enter/Space, or type "open".`);
            return;
        }

        const lines = items.slice(0, 24).map(room => `• ${room.name} (${room.id})`);
        const more = count > 24 ? `\n… and ${count - 24} more.` : '';
        this.appendLog('system', `Inventory: ${count}/${total}\n${lines.join('\n')}${more}`);
    }

    cmdBigPicture() {
        if (!this.graphReady || !this.graph) return;
        if (!this.maze) this.ensureMazeLayout(this.graph);

        const totalCells = this.maze?.roomOrder?.length || 0;
        const discoveredCells = this.discovered?.size || 0;

        const totalNotes = this.graph.nodes.size;
        let discoveredNotes = 0;
        const districts = new Map();

        for (const id of this.discovered || []) {
            if (!this.graph.nodes.has(id)) continue;
            discoveredNotes += 1;
            const room = this.graph.nodes.get(id);
            const dir = room?.dir || 'root';
            districts.set(dir, (districts.get(dir) || 0) + 1);
        }

        const books = this.inventory?.size || 0;
        const percentCells = totalCells ? Math.round((discoveredCells / totalCells) * 100) : 0;
        const percentNotes = totalNotes ? Math.round((discoveredNotes / totalNotes) * 100) : 0;
        const percentBooks = totalNotes ? Math.round((books / totalNotes) * 100) : 0;

        const topDistricts = Array.from(districts.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 6)
            .map(([dir, count]) => `  • ${dir}: ${count}`);

        this.appendLog(
            'system',
            [
                'Big picture:',
                `  Cells revealed: ${Math.min(discoveredCells, totalCells)}/${totalCells} (${percentCells}%)`,
                `  Notes glimpsed: ${discoveredNotes}/${totalNotes} (${percentNotes}%)`,
                `  Folios unsealed (inventory): ${books}/${totalNotes} (${percentBooks}%)`,
                districts.size ? '  Districts glimpsed:' : '',
                districts.size ? topDistricts.join('\n') : '',
                '',
                'The map does not reveal meaning; it only reveals where you have been.',
                'Tip: unseal a few more folios, then use `link` to stitch a path of necessity.'
            ].filter(Boolean).join('\n')
        );

        this.fitMapToMaze({ user: true });
    }

    cmdQuests() {
        if (!this.graphReady || !this.graph) return;

        const orphans = [];
        const deadEnds = [];

        for (const node of this.graph.nodes.values()) {
            const inbound = this.graph.inboundCount.get(node.id) || 0;
            const degree = this.graph.adjacency.get(node.id)?.size || 0;
            if (inbound === 0) orphans.push(node);
            if (degree <= 1) deadEnds.push(node);
        }

        const formatList = (items) => items
            .slice(0, 6)
            .map(n => `• ${n.name} (${n.id})`)
            .join('\n');

        this.appendLog(
            'system',
            [
                'Quests (heuristic):',
                orphans.length ? `\nOrphans to connect (${orphans.length}):\n${formatList(orphans.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)))}` : '\nOrphans to connect: none',
                deadEnds.length ? `\nDead ends to enrich (${deadEnds.length}):\n${formatList(deadEnds.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)))}` : '\nDead ends to enrich: none',
                '\nSuggested next move: pick one item, open it, then add 1–3 meaningful corridors with `link <room>`.'
            ].join('')
        );
    }

    cmdExits() {
        const room = this.getRoom(this.currentRoomId);
        if (!room) return this.appendLog('system', 'There are no corridors here.');
        if (!this.maze) this.ensureMazeLayout(this.graph);

        const physical = this.getPhysicalDirectionMap(room.id);
        const physicalLines = ['north', 'east', 'south', 'west']
            .map(dir => {
                const targetId = physical?.[dir];
                if (!targetId) return null;
                const breach = physical?.openedByLink?.[dir] ? ' (breach)' : '';
                return `  ${dir} → ${this.getRoomLabel(targetId)}${breach}`;
            })
            .filter(Boolean);

        const outbound = Array.from(this.graph?.outbound?.get(room.id) || [])
            .slice()
            .sort((a, b) => this.getRoomLabel(a).localeCompare(this.getRoomLabel(b)))
            .slice(0, 14)
            .map(id => `  • ${this.getRoomLabel(id)}`);

        this.appendLog(
            'system',
            [
                'Stone exits:',
                physicalLines.length ? physicalLines.join('\n') : '  (none)',
                '',
                `Secret doors (links out): ${outbound.length ? '' : 'none'}`.trimEnd(),
                outbound.length ? outbound.join('\n') : '  (none)'
            ].join('\n')
        );
    }

    cmdGo(arg) {
        const room = this.getRoom(this.currentRoomId);
        if (!room) return;
        const value = String(arg || '').trim().toLowerCase();
        if (!value) {
            this.appendLog('system', 'Go where? Try: go north.');
            return;
        }

        const byDirection = {
            north: 'north',
            n: 'north',
            up: 'north',
            east: 'east',
            e: 'east',
            right: 'east',
            south: 'south',
            s: 'south',
            down: 'south',
            west: 'west',
            w: 'west',
            left: 'west'
        };
        const dir = byDirection[value];
        if (dir) {
            this.moveByDirection(dir, { source: 'command' });
            return;
        }

        // Allow "go <substring>" for *secret doors* (outgoing links only).
        const doorIds = Array.from(this.graph?.outbound?.get(room.id) || []);
        const doors = doorIds.map(id => this.getRoom(id)).filter(Boolean);
        const matches = this.findRoomMatches(value, doors, { limit: 6 });
        if (matches.length === 1) {
            this.moveToRoom(matches[0].id, { source: 'secret' });
            return;
        }
        if (matches.length > 1) {
            this.appendLog('system', `That door is ambiguous. Did you mean:\n${matches.map(n => `• ${n.name} (${n.id})`).join('\n')}`);
            return;
        }

        this.appendLog('system', 'No passage answers. Try "exits", or "teleport <room>" if you want to cheat the stone.');
    }

    cmdOpen() {
        const room = this.getRoom(this.currentRoomId);
        if (!room) return this.appendLog('system', 'There is only fog.');
        if (room.isVoid) return this.appendLog('system', 'Only dust and blank catalog cards.');
        if (!this.graph?.nodes?.has?.(room.id)) return this.appendLog('system', 'This shelf has no title.');

        if (this.inventory.has(room.id)) {
            this.appendLog('system', 'Already catalogued. It rests in your satchel.');
            return;
        }

        this.inventory.add(room.id);
        this.saveState();
        this.appendLog('system', `You unseal the folio: ${room.name}. (Added to inventory.)`);
        this.renderMap();
    }

    async cmdEdit() {
        const room = this.getRoom(this.currentRoomId);
        if (!room?.path) return this.appendLog('system', 'This room has no door into the editor.');

        if (!this.inventory.has(room.id)) {
            this.cmdOpen();
        }

        try {
            this._switchToEditorMode();
            const result = await this._openFile(room.path);
            if (!result?.success) {
                this.appendLog('system', result?.error || 'Failed to open the file.');
                return;
            }
            await this._openFileInEditor(result.filePath, result.content);
            this.appendLog('system', 'The page opens. Ink lifts from the paper.');
        } catch (error) {
            this._log('Edit failed:', error);
            this.appendLog('system', 'The lock turns, but the door does not open.');
        }
    }

    cmdSearch(query) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return this.appendLog('system', 'Search for what?');
        if (!this.graphReady) return;

        const results = this.findRoomMatches(q, Array.from(this.graph.nodes.values()), { limit: 14 });

        if (!results.length) {
            this.appendLog('system', 'Nothing answers from the shelves.');
            return;
        }

        this.appendLog('system', results.map(n => `• ${n.name} (${n.id})`).join('\n'));
    }

    cmdTeleport(rawTarget) {
        const targetQuery = String(rawTarget || '').trim();
        if (!targetQuery) {
            this.appendLog('system', 'Teleport where? Try: teleport <room name>.');
            return;
        }
        if (!this.graphReady) return;

        const matches = this.findRoomMatches(targetQuery, Array.from(this.graph.nodes.values()), { limit: 8 });
        if (!matches.length) {
            this.appendLog('system', `No room matches "${targetQuery}". Try "search ${targetQuery}".`);
            return;
        }
        if (matches.length > 1) {
            this.appendLog('system', `Too many rooms answer. Be more specific:\n${matches.map(n => `• ${n.name} (${n.id})`).join('\n')}`);
            return;
        }

        this.moveToRoom(matches[0].id, { source: 'command' });
    }

    async cmdLink(rawTarget) {
        const targetQuery = String(rawTarget || '').trim();
        if (!this.graphReady || !this.graph?.nodes?.size) {
            this.appendLog('system', 'The catalog is still being indexed. Try again in a moment.');
            return;
        }
        if (!targetQuery) {
            const source = this.getRoom(this.currentRoomId);
            if (!source || source.isVoid || !source.path) {
                this.appendLog('system', 'This room cannot be scribed directly.');
                return;
            }
            if (!this.inventory.has(source.id)) {
                this.cmdOpen();
            }

            const suggestions = this.getLinkSuggestions({ limit: 12 });
            if (!suggestions.length) {
                this.appendLog('system', 'No obvious corridors suggest themselves. Try `search <text>` first.');
                return;
            }

            this.appendLog(
                'system',
                `Likely corridors:\n${suggestions.map((s, idx) => `${idx + 1}. ${s.name}`).join('\n')}\n\nTip: type \`link <name>\` (or copy one line).`
            );
            return;
        }

        const source = this.getRoom(this.currentRoomId);
        if (!source?.path) {
            this.appendLog('system', 'This room cannot be scribed directly.');
            return;
        }

        if (!this.inventory.has(source.id)) {
            this.cmdOpen();
        }

        const target = this.resolveRoomByQueryOrId(targetQuery, { limit: 8 });
        if (!target) return;

        if (target.id === source.id) {
            this.appendLog('system', 'A corridor to yourself is only a mirror.');
            return;
        }

        if (!window?.electronAPI?.invoke) {
            this.appendLog('system', 'File bridge unavailable in this environment.');
            return;
        }

        this.appendLog('system', `Scribing a corridor to ${target.name}…`);

        try {
            const editorOutcome = await this.tryInsertLinkInOpenEditor(source.path, target);

            if (editorOutcome?.handled) {
                if (editorOutcome.alreadyExists) {
                    return;
                }
                if (editorOutcome.saved === false) {
                    this.appendLog('system', 'The corridor is in your editor buffer, but ink has not yet dried on disk.');
                }
            } else {
                const payload = {
                    sourcePath: source.path,
                    targetId: target.id,
                    targetLabel: target.name
                };

                const result = await this._appendLink(source.path, target.id, target.name);
                if (!result?.success && !result?.alreadyExists) {
                    this.appendLog('system', result?.error || 'Failed to inscribe corridor.');
                    return;
                }

                if (result.alreadyExists) {
                    this.appendLog('system', 'That corridor is already etched into the stacks.');
                    return;
                }
            }

            this.appendLog('ash', `A thin red thread binds "${source.name}" to "${target.name}".`);

            // Update in-memory graph immediately (best effort).
            this.applyEdgeInMemory(source.id, target.id);
            this.renderMap();

            // Rebuild from disk if we successfully wrote to disk (or used IPC).
            if (!editorOutcome?.handled || editorOutcome.saved !== false) {
                this.refreshGraph({ announce: false });
            }
        } catch (error) {
            this._log('Link failed:', error);
            this.appendLog('system', 'The corridor tries to form, then collapses into paper dust.');
        }
    }

    normalizeAbsPath(value) {
        return String(value || '').replace(/\\/g, '/').trim();
    }

    escapeRegex(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    async tryInsertLinkInOpenEditor(sourcePath, targetNode) {
        const editorInstance = this._getEditor();
        if (!editorInstance || typeof editorInstance.getValue !== 'function') {
            return { handled: false };
        }

        const currentPath = this.normalizeAbsPath(this._getCurrentFilePath() || '');
        const sourceAbs = this.normalizeAbsPath(sourcePath);
        if (!currentPath || !sourceAbs || currentPath !== sourceAbs) {
            return { handled: false };
        }

        const model = editorInstance.getModel?.();
        const content = editorInstance.getValue() || '';

        const baseTarget = this.stripExtension(targetNode?.id || '');
        if (!baseTarget) return { handled: false };

        const sanitizedLabel = String(targetNode?.name || '')
            .replace(/[\r\n]+/g, ' ')
            .trim();

        const escapedTarget = this.escapeRegex(baseTarget);
        const existingPattern = new RegExp(`\\[\\[${escapedTarget}(?:\\.md)?(?:\\|[^\\]]+)?\\]\\]`, 'i');
        if (existingPattern.test(content)) {
            this.appendLog('system', 'That corridor is already etched into the stacks.');
            return { handled: true, alreadyExists: true, inserted: false, saved: true };
        }

        const labelSegment = sanitizedLabel && sanitizedLabel.toLowerCase() !== baseTarget.split('/').pop().toLowerCase()
            ? `|${sanitizedLabel}`
            : '';
        const linkToken = `[[${baseTarget}${labelSegment}]]`;
        const commentToken = '<!-- AUTOMATICALLY INSERTED LINK -->';

        let insertText = '';
        if (content.length > 0 && !content.endsWith('\n')) insertText += '\n';
        insertText += `${commentToken}\n${linkToken}\n`;

        if (model && typeof monaco !== 'undefined' && typeof monaco.Range === 'function') {
            const lastLine = model.getLineCount();
            const lastCol = model.getLineMaxColumn(lastLine);
            const range = new monaco.Range(lastLine, lastCol, lastLine, lastCol);
            editorInstance.executeEdits('babel-maze-link', [{ range, text: insertText }]);
        } else if (typeof editorInstance.setValue === 'function') {
            editorInstance.setValue(content + insertText);
        } else {
            return { handled: false };
        }

        const newContent = editorInstance.getValue() || '';
        const saveResult = await this._saveFile(sourceAbs, newContent);
        if (!saveResult?.success) {
            this.appendLog('system', saveResult?.error || 'Saved link into the editor buffer, but failed to write to disk.');
            return { handled: true, alreadyExists: false, inserted: true, saved: false };
        }

        this._markContentAsSaved();
        return { handled: true, alreadyExists: false, inserted: true, saved: true };
    }

    applyEdgeInMemory(fromId, toId) {
        if (!this.graphReady || !this.graph?.adjacency) return;
        const a = this.graph.adjacency.get(fromId) || new Set();
        const b = this.graph.adjacency.get(toId) || new Set();

        const hadUndirected = a.has(toId);
        a.add(toId);
        b.add(fromId);
        this.graph.adjacency.set(fromId, a);
        this.graph.adjacency.set(toId, b);

        if (!hadUndirected) {
            this.graph.edgeCount = (this.graph.edgeCount || 0) + 1;
        }

        if (!this.graph.outbound) {
            this.graph.outbound = new Map();
        }
        const outSet = this.graph.outbound.get(fromId) || new Set();
        const before = outSet.size;
        outSet.add(toId);
        this.graph.outbound.set(fromId, outSet);

        if (outSet.size !== before) {
            this.graph.outboundCount.set(fromId, outSet.size);
            this.graph.inboundCount.set(toId, (this.graph.inboundCount.get(toId) || 0) + 1);

            if (!this.graph.inbound) {
                this.graph.inbound = new Map();
            }
            const inSet = this.graph.inbound.get(toId) || new Set();
            inSet.add(fromId);
            this.graph.inbound.set(toId, inSet);

            if (this.maze) this.updateMazeLinkOpenings(this.graph);
        }
    }

    findRoomMatches(query, candidates = [], { limit = 10 } = {}) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return [];
        const items = Array.isArray(candidates) ? candidates : [];

        const scored = [];
        for (const node of items) {
            if (!node) continue;
            const name = String(node.name || '').toLowerCase();
            const id = String(node.id || '').toLowerCase();
            const base = String(node.basenameNoExt || '').toLowerCase();

            let score = 0;
            if (id === q || name === q || base === q) score = 100;
            else if (name.startsWith(q) || base.startsWith(q)) score = 75;
            else if (id.startsWith(q)) score = 70;
            else if (name.includes(q) || base.includes(q)) score = 55;
            else if (id.includes(q)) score = 50;
            else continue;

            scored.push({ node, score });
        }

        scored.sort((a, b) => {
            if (a.score !== b.score) return b.score - a.score;
            return (a.node.name || a.node.id).localeCompare(b.node.name || b.node.id);
        });

        const out = [];
        const seen = new Set();
        for (const entry of scored) {
            if (!entry?.node?.id) continue;
            if (seen.has(entry.node.id)) continue;
            seen.add(entry.node.id);
            out.push(entry.node);
            if (out.length >= limit) break;
        }
        return out;
    }

    resolveRoomByQueryOrId(targetQuery, { limit = 8 } = {}) {
        const q = String(targetQuery || '').trim();
        if (!q) return null;
        if (!this.graphReady || !this.graph?.nodes?.size) return null;

        const direct = this.graph.nodes.get(q) || this.graph.nodes.get(`${q}.md`);
        if (direct) return direct;

        const qLower = q.toLowerCase();
        for (const node of this.graph.nodes.values()) {
            if (!node?.id) continue;
            if (String(node.id).toLowerCase() === qLower) return node;
        }

        const matches = this.findRoomMatches(q, Array.from(this.graph.nodes.values()), { limit });
        if (!matches.length) {
            this.appendLog('system', `No room matches "${q}". Try "search ${q}".`);
            return null;
        }
        if (matches.length > 1) {
            this.appendLog('system', `Too many rooms answer. Be more specific:\n${matches.map(n => `• ${n.name} (${n.id})`).join('\n')}`);
            return null;
        }
        return matches[0];
    }

    getMazeNeighborEdges(roomId, { includeSecrets = false } = {}) {
        if (!roomId) return [];
        if (!this.maze) this.ensureMazeLayout(this.graph);
        if (!this.maze) return [];

        const edges = [];
        const dirMap = this.getPhysicalDirectionMap(roomId);
        for (const dir of ['north', 'east', 'south', 'west']) {
            const to = dirMap?.[dir];
            if (!to) continue;
            edges.push({ type: 'physical', dir, to });
        }

        if (includeSecrets && this.graph?.outbound) {
            const targets = this.graph.outbound.get(roomId);
            if (targets && targets.size) {
                for (const to of targets) {
                    if (!to || to === roomId) continue;
                    edges.push({ type: 'secret', to });
                }
            }
        }

        return edges;
    }

    findMazePath(fromId, toId, { includeSecrets = false } = {}) {
        if (!fromId || !toId) return null;
        if (fromId === toId) return { rooms: [fromId], edges: [] };
        if (!this.graphReady) return null;

        const queue = [fromId];
        let queueIndex = 0;
        const seen = new Set([fromId]);
        const prev = new Map();

        while (queueIndex < queue.length) {
            const current = queue[queueIndex++];
            if (current === toId) break;

            const neighbors = this.getMazeNeighborEdges(current, { includeSecrets });
            for (const edge of neighbors) {
                const next = edge?.to;
                if (!next || seen.has(next)) continue;
                seen.add(next);
                prev.set(next, { from: current, edge });
                queue.push(next);
            }
        }

        if (!seen.has(toId)) return null;

        const rooms = [toId];
        const edges = [];
        let cursor = toId;
        while (cursor !== fromId) {
            const info = prev.get(cursor);
            if (!info) break;
            edges.push({ ...info.edge, from: info.from });
            rooms.push(info.from);
            cursor = info.from;
        }

        rooms.reverse();
        edges.reverse();
        return { rooms, edges };
    }

    async cmdWhisper(question) {
        const q = String(question || '').trim();
        if (!q) {
            this.appendLog('system', 'Whisper what? Try: whisper how do I connect these ideas?');
            return;
        }

        const companion = this._getAICompanion();
        if (!companion || typeof companion.callAIService !== 'function') {
            this.appendLog('system', 'Ash is offline. (AI companion not available.)');
            return;
        }

        if (this.pendingAI) {
            this.appendLog('system', 'Ash is still shaping the last whisper. Hold a beat.');
            return;
        }

        const room = this.getRoom(this.currentRoomId);
        const neighbors = this.getNeighbors(this.currentRoomId)
            .slice(0, 10)
            .map(id => this.getRoomLabel(id))
            .filter(Boolean);

        const prompt = `
You are Ash: a wistful, precise librarian-cartographer speaking in adult, literary, melancholic magical realism.

Current room: ${room?.name || room?.id || 'unknown'}
Path: ${room?.id || 'unknown'}
Nearby rooms: ${neighbors.length ? neighbors.join(' | ') : 'none'}

User whisper: ${q}

Respond in 2–5 sentences: atmospheric but actionable. Suggest 1 concrete next move (e.g., link X to Y, write a 2-sentence abstract, rename a note, create a hub note).
        `.trim();

        this.pendingAI = true;
        this.appendLog('ash', 'The shelves listen. A reply gathers in the dust…');

        try {
            const response = await companion.callAIService(prompt, {
                context: 'babel_maze.whisper',
                temperature: 0.55,
                newConversation: true
            });
            const message = this.extractCompanionMessage(response) || 'Static crackles; no words arrive.';
            this.appendLog('ash', message);
        } catch (error) {
            console.warn('[BabelMazeView] Whisper failed:', error);
            this.appendLog('system', 'The channel crackles—Ash cannot reach you right now.');
        } finally {
            this.pendingAI = false;
        }
    }

    extractCompanionMessage(response) {
        if (!response) return '';
        if (typeof response === 'string') return response;
        if (typeof response.message === 'string') return response.message;
        if (typeof response.response === 'string') return response.response;
        if (typeof response.text === 'string') return response.text;
        return '';
    }

    // === Graph building ===

    normalizePath(value) {
        return String(value || '')
            .replace(/\\/g, '/')
            .replace(/^\.\/+/, '')
            .replace(/^\/+/, '')
            .replace(/\/{2,}/g, '/')
            .trim();
    }

    stripExtension(value) {
        return String(value || '').replace(/\.(md|markdown)$/i, '');
    }

    joinRelative(baseDir, relPath) {
        const base = this.normalizePath(baseDir);
        const rel = this.normalizePath(relPath);
        const combined = base ? `${base}/${rel}` : rel;
        const parts = combined.split('/').filter(Boolean);
        const out = [];
        for (const part of parts) {
            if (part === '.') continue;
            if (part === '..') {
                out.pop();
                continue;
            }
            out.push(part);
        }
        return out.join('/');
    }

    parseInternalLinks(content) {
        if (!content) return [];
        const text = String(content);
        const regex = /\[\[([^\]]+)\]\]/g;
        const targets = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            const raw = (match[1] || '').trim();
            if (!raw) continue;
            targets.push(raw);
        }
        return targets;
    }

    async buildGraph() {
        // Check if we have file access via host adapter or window globals
        const hasHostFiles = this.host?.getFiles || this.host?.readFile;
        const hasWindowFiles = window?.getFilteredVisualizationFiles || window?.electronAPI?.invoke;
        if (!hasHostFiles && !hasWindowFiles) {
            throw new Error('Visualization file loader unavailable.');
        }

        const result = await this._getFiles();
        const files = result?.files || [];

        const normalizePath = (value) => String(value || '')
            .replace(/\\/g, '/')
            .replace(/^\.\/+/, '')
            .replace(/^\/+/, '')
            .replace(/\/{2,}/g, '/')
            .trim();

        const records = files
            .map(fileItem => {
                const filePath = fileItem?.path || fileItem?.filePath || fileItem?.absolutePath || fileItem;
                if (!filePath) return null;
                const relativePath = typeof fileItem?.relativePath === 'string' ? normalizePath(fileItem.relativePath) : null;
                const id = normalizePath(relativePath || filePath);
                const basename = String(fileItem?.name || filePath.split(/[\\/]/).pop() || id);
                const basenameNoExt = this.stripExtension(basename);
                const dir = id.includes('/') ? id.split('/').slice(0, -1).join('/') : '';
                return {
                    id,
                    path: String(filePath),
                    relativePath,
                    basename,
                    basenameLower: basename.toLowerCase(),
                    basenameNoExt,
                    basenameNoExtLower: basenameNoExt.toLowerCase(),
                    dir
                };
            })
            .filter(Boolean);

        const nodes = new Map();
        const idByLower = new Map();
        const idsByBasename = new Map();
        const idsByBasenameNoExt = new Map();

        const addToMultiMap = (map, key, value) => {
            if (!key) return;
            const existing = map.get(key);
            if (existing) existing.push(value);
            else map.set(key, [value]);
        };

        const titleCounts = new Map();
        records.forEach(record => {
            titleCounts.set(record.basenameNoExtLower, (titleCounts.get(record.basenameNoExtLower) || 0) + 1);
        });

        records.forEach(record => {
            const lower = record.id.toLowerCase();
            if (!idByLower.has(lower)) idByLower.set(lower, record.id);
            addToMultiMap(idsByBasename, record.basenameLower, record.id);
            addToMultiMap(idsByBasenameNoExt, record.basenameNoExtLower, record.id);

            const duplicate = (titleCounts.get(record.basenameNoExtLower) || 0) > 1;
            const displayName = duplicate
                ? this.stripExtension(record.relativePath || record.id)
                : record.basenameNoExt;

            nodes.set(record.id, {
                id: record.id,
                name: displayName,
                path: record.path,
                relativePath: record.relativePath,
                dir: record.dir,
                basenameNoExt: record.basenameNoExt
            });
        });

        const resolveFileTarget = (rawTarget, sourceId) => {
            if (!rawTarget) return null;
            let target = String(rawTarget).trim();
            if (!target) return null;

            if (target.includes('|')) target = target.split('|')[0].trim();
            if (target.includes('#')) target = target.split('#')[0].trim();

            target = target.replace(/^[.][\\/]/, '');
            const hasSeparator = target.includes('/') || target.includes('\\');
            let normalizedTarget = normalizePath(target);
            if (!normalizedTarget) return null;

            const hasMarkdownExt = /\.(md|markdown)$/i.test(normalizedTarget);
            if (!hasMarkdownExt) normalizedTarget = `${normalizedTarget}.md`;

            const sourceDir = sourceId && String(sourceId).includes('/')
                ? String(sourceId).split('/').slice(0, -1).join('/')
                : '';

            const tryExact = (candidate) => {
                const normalized = normalizePath(candidate);
                if (!normalized) return null;
                const found = idByLower.get(normalized.toLowerCase());
                return found || null;
            };

            if (hasSeparator) {
                const fromSameDir = sourceDir ? this.joinRelative(sourceDir, normalizedTarget) : normalizedTarget;
                return tryExact(fromSameDir) || tryExact(normalizedTarget);
            }

            if (sourceDir) {
                const fromSameDir = tryExact(`${sourceDir}/${normalizedTarget}`);
                if (fromSameDir) return fromSameDir;
            }

            const baseLower = normalizedTarget.split('/').pop().toLowerCase();
            const candidates = idsByBasename.get(baseLower) || [];
            if (candidates.length === 1) return candidates[0];
            if (candidates.length > 1 && sourceDir) {
                const preferred = candidates.find(id => id.toLowerCase() === `${sourceDir}/${baseLower}`);
                if (preferred) return preferred;
                return null;
            }

            const baseNoExtLower = this.stripExtension(baseLower);
            const candidatesNoExt = idsByBasenameNoExt.get(baseNoExtLower) || [];
            if (candidatesNoExt.length === 1) return candidatesNoExt[0];
            if (candidatesNoExt.length > 1 && sourceDir) {
                const preferred = candidatesNoExt.find(id => this.stripExtension(id.toLowerCase()) === `${sourceDir}/${baseNoExtLower}`);
                if (preferred) return preferred;
            }

            return null;
        };

        const adjacency = new Map();
        const outbound = new Map();
        const inbound = new Map();

        const ensureNode = (id) => {
            if (!adjacency.has(id)) adjacency.set(id, new Set());
            if (!outbound.has(id)) outbound.set(id, new Set());
            if (!inbound.has(id)) inbound.set(id, new Set());
        };

        nodes.forEach((_node, id) => ensureNode(id));

        const extractPreview = (content) => {
            const text = String(content || '');
            const withoutFrontmatter = text.replace(/^---\s*[\s\S]*?\s---\s*/m, '');
            const lines = withoutFrontmatter.split(/\r?\n/);

            const headings = [];
            let excerpt = '';
            let inCode = false;

            for (const rawLine of lines) {
                const line = String(rawLine || '');
                const trimmed = line.trim();

                if (trimmed.startsWith('```')) {
                    inCode = !inCode;
                    continue;
                }
                if (inCode) continue;

                if (!trimmed) continue;

                const headingMatch = /^#{1,6}\s+(.*)$/.exec(trimmed);
                if (headingMatch) {
                    if (headings.length < 8) {
                        headings.push(String(headingMatch[1] || '').trim().slice(0, 120));
                    }
                    continue;
                }

                if (!excerpt) {
                    if (/^\[\[[^\]]+\]\]$/.test(trimmed)) continue;
                    if (/^[-*]\s+\[\[[^\]]+\]\]$/.test(trimmed)) continue;
                    excerpt = trimmed.replace(/\s+/g, ' ').slice(0, 240);
                }

                if (excerpt && headings.length >= 6) break;
            }

            const wordCount = withoutFrontmatter
                .replace(/```[\s\S]*?```/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .split(' ')
                .filter(Boolean).length;

            return { headings, excerpt, wordCount };
        };

        for (const record of records) {
            const contentResult = await this._readFileContent(record.path);
            if (!contentResult?.success || typeof contentResult.content !== 'string') continue;

            const preview = extractPreview(contentResult.content);
            const node = nodes.get(record.id);
            if (node) {
                node.headings = preview.headings;
                node.excerpt = preview.excerpt;
                node.wordCount = preview.wordCount;
            }

            const links = this.parseInternalLinks(contentResult.content);
            if (node) node.rawLinkCount = links.length;
            if (!links.length) continue;

            for (const rawTarget of links) {
                const resolved = resolveFileTarget(rawTarget, record.id);
                if (!resolved) continue;
                if (!nodes.has(resolved)) continue;
                if (resolved === record.id) continue;

                ensureNode(record.id);
                ensureNode(resolved);

                // Directed edge (unique per source)
                outbound.get(record.id).add(resolved);
                inbound.get(resolved).add(record.id);

                // Undirected connectivity for link analytics / neighbor listing
                adjacency.get(record.id).add(resolved);
                adjacency.get(resolved).add(record.id);
            }
        }

        const outboundCount = new Map();
        const inboundCount = new Map();

        nodes.forEach((_node, id) => {
            outboundCount.set(id, outbound.get(id)?.size || 0);
            inboundCount.set(id, 0);
        });

        for (const [_from, targets] of outbound.entries()) {
            for (const to of targets) {
                inboundCount.set(to, (inboundCount.get(to) || 0) + 1);
            }
        }

        let edgeSum = 0;
        for (const neighbors of adjacency.values()) {
            edgeSum += neighbors.size;
        }
        const edgeCount = Math.floor(edgeSum / 2);

        return {
            nodes,
            adjacency,
            outbound,
            inbound,
            idByLower,
            idsByBasename,
            idsByBasenameNoExt,
            outboundCount,
            inboundCount,
            edgeCount
        };
    }
}

window.BabelMazeView = BabelMazeView;

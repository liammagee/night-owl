// === Library Explorer View ===
// Lightweight UI surface that visualizes the evolving library world

class LibraryExplorerView {
    constructor(gamificationInstance) {
        this.gamification = gamificationInstance;
        this.container = null;
        this.lastRender = 0;
        this.renderThrottle = 750;
        this.baseStatus = 'Awaiting whispers';
        this.transientActive = false;
        this.transientTimeout = null;
        this.typingTimeout = null;
        this.nodeOrder = [];
        this.nodeMap = new Map();
        this.adjacency = new Map();
        this.positions = new Map();
        this.selectedNodeId = null;
        this.lastNeighborId = null;
        this.currentWorldState = {};
        this.keyboardBound = false;
        this.ensureRetryScheduled = false;
        this.wrapper = null;
        this.resizer = null;
        this.worldModal = null;
        this.rebalanceInFlight = false;
        this.zoomLevel = 1;
        this.minZoom = 0.6;
        this.maxZoom = 2.4;
        this.zoomStep = 0.12;
        this.zoomPan = { x: 0, y: 0 };
        this.lastCanvasElement = null;
        this.clusterSpacing = 2.6;
        this.navGraph = new Map();
        this.clusterLookup = new Map();
        this.clusterMembers = new Map();
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.panOrigin = { x: 0, y: 0 };
        this.lastCorridorTarget = null;
        this.lastCorridorDirection = null;
        this.lastDirectionVector = null;
        this.lastDirectionKey = null;
        this.directionDotThreshold = 0.22;
        this.orientationNeighbors = [];
        this.orientationIndex = -1;
        this.orientationVector = { x: 0, y: -1 };
        this.forwardNeighborId = null;
        this.followAshInFlight = false;
        this.ashChatLog = [];
        this.ashChatInFlight = false;
        this.ashChatHistoryLimit = 60;
        this.ashChatPendingId = null;
        this.ashChatInitialized = false;
        this.ashLinkSuggestionCache = new Map();
        this.ashLinkTimer = null;
        this.ashLinkInFlight = false;
        this.lastLinkSuggestionAt = 0;
        this.ashLinkCooldown = 32000;
        this.linkSuggestionState = {
            nodeId: null,
            status: 'idle',
            items: [],
            message: ''
        };
        this.lastLinkNarratedNode = null;
        this.axialDirections = [
            { q: 1, r: 0 },
            { q: 1, r: -1 },
            { q: 0, r: -1 },
            { q: -1, r: 0 },
            { q: -1, r: 1 },
            { q: 0, r: 1 }
        ];

        // Unified network integration
        this.networkInstance = null;
        this.networkInitializing = false;
        this.networkReady = false;
        this.networkCanvas = null;
        this.networkSelectionHandler = null;
        this.networkTickHandler = null;
        this.networkSyncTimeout = null;
        this.libraryWorldNodeIndex = new Map();
        this.worldMetadataIndex = null;
        this.lastVisitedNodeId = null;
        this.narrativeEntries = [];
        this.nodeLoreCache = new Map();
        this.ashNarrativeTimer = null;
        this.ashNarrativeInFlight = false;
        this.lastAshNarrativeAt = 0;
        this.ashNarrativeCooldown = 25000;
    }

    ensureContainer() {
        if (this.container && document.body.contains(this.container)) {
            const libraryRoot = document.getElementById('library-mode-root');
            if (libraryRoot) {
                if (!libraryRoot.contains(this.container)) {
                    libraryRoot.replaceChildren(this.container);
                }
                this.container.classList.add('library-explorer-panel-full');
                this.container.style.width = '100%';
                this.container.style.height = '100%';
                this.container.style.maxHeight = 'none';
            } else {
                this.container.classList.remove('library-explorer-panel-full');
            }
            this.updateOrientationIndicator();
            return this.container;
        }

        const libraryRoot = document.getElementById('library-mode-root');
        if (libraryRoot) {
            if (!this.container) {
                const panel = document.createElement('div');
                panel.id = 'library-explorer-panel';
                panel.className = 'library-explorer-panel';
                panel.innerHTML = this.getSkeletonMarkup();
                this.container = panel;
            }

            libraryRoot.replaceChildren(this.container);
            this.container.classList.add('library-explorer-panel-full');
            this.container.style.width = '100%';
            this.container.style.height = '100%';
            this.container.style.maxHeight = 'none';
            this.wrapper = null;
            this.resizer = null;
            this.ensureRetryScheduled = false;

            this.attachEventHandlers();
            this.injectStyles();
            this.attachKeyboardAndMouse();
            this.updateOrientationIndicator();

            requestAnimationFrame(() => {
                if (this.container) {
                    this.container.style.height = '100%';
                }
            });

            return this.container;
        }

        const target =
            document.getElementById('editor-toolbar') ||
            document.querySelector('.toolbar') ||
            document.querySelector('#main-toolbar') ||
            document.querySelector('.header-toolbar');

        if (!target) {
            if (!this.ensureRetryScheduled) {
                this.ensureRetryScheduled = true;
                setTimeout(() => {
                    this.ensureRetryScheduled = false;
                    this.ensureContainer();
                }, 500);
            }
            if (!this.container) {
                console.warn('[LibraryExplorerView] Toolbar not found. Delaying UI mount.');
            }
            return null;
        }

        const panel = document.createElement('div');
        panel.id = 'library-explorer-panel';
        panel.className = 'library-explorer-panel';
        panel.innerHTML = this.getSkeletonMarkup();
        this.container = panel;
        this.container.classList.remove('library-explorer-panel-full');
        this.container.style.width = '100%';

        let wrapper = this.wrapper;
        if (!wrapper || !document.body.contains(wrapper)) {
            wrapper = document.createElement('div');
            wrapper.className = 'library-explorer-wrapper';
            target.insertAdjacentElement('afterend', wrapper);
            this.wrapper = wrapper;
        } else if (target.nextElementSibling !== wrapper) {
            target.insertAdjacentElement('afterend', wrapper);
        }

        if (this.resizer && wrapper.contains(this.resizer)) {
            wrapper.insertBefore(panel, this.resizer);
        } else {
            wrapper.appendChild(panel);
        }

        if (!this.resizer || !wrapper.contains(this.resizer)) {
            const resizer = document.createElement('div');
            resizer.className = 'library-explorer-resizer';
            wrapper.appendChild(resizer);
            this.attachResizerHandlers(resizer);
            this.resizer = resizer;
        }

        this.ensureRetryScheduled = false;
        console.log('[LibraryExplorerView] Explorer panel mounted after toolbar.');

        this.attachEventHandlers();
        this.injectStyles();
        this.attachKeyboardAndMouse();
        this.updateOrientationIndicator();

        requestAnimationFrame(() => {
            if (this.container && !this.container.style.height) {
                const rect = this.container.getBoundingClientRect();
                this.container.style.height = `${Math.max(260, rect.height)}px`;
            }
        });

        return this.container;
    }

    getSkeletonMarkup() {
        return `
            <div class="le-header">
                <div>
                    <span class="le-icon">📚</span>
                    <span class="le-title">Library Atlas</span>
                </div>
                <div class="le-actions">
                    <button id="le-request-blueprint" class="le-btn primary">Summon Architect</button>
                    <button id="le-world-btn" class="le-btn secondary">World JSON</button>
                    <span class="le-status" id="le-status-indicator">Awaiting whispers</span>
                </div>
            </div>
            <div class="le-content">
                <div class="le-layout">
                    <div class="le-constellation">
                        <div class="le-maze" id="le-maze">
                            <div class="maze-header">
                                <div class="maze-header-top">
                                    <span class="maze-title">Library Constellation</span>
                                    <span class="maze-help">Drag to pan • Scroll to zoom • Arrows traverse • Space rotates heading</span>
                                </div>
                                <div class="maze-actions">
                                    <span class="maze-orientation" id="le-orientation-indicator">Forward: North</span>
                                </div>
                            </div>
                            <div class="maze-canvas" tabindex="0"></div>
                            <div class="maze-empty">Write to awaken the constellation.</div>
                        </div>
                        <div class="le-companion-strip">
                            <section class="le-pulse companion-pane" id="le-pulse">
                                <div class="pulse-header">Live Scribing</div>
                                <div class="pulse-count">Next shard in 30 words</div>
                                <div class="pulse-snippet">
                                    <div class="pulse-subtitle">Latest prose</div>
                                    <div class="pulse-snippet-text">Begin typing to awaken the stacks.</div>
                                </div>
                                <div class="pulse-node">
                                    <div class="pulse-subtitle">Selected node</div>
                                    <div class="pulse-node-title">No node selected</div>
                                    <div class="pulse-node-body">Use arrow keys or click the constellation to explore manuscripts.</div>
                                </div>
                            </section>
                            <section class="le-digest companion-pane" id="le-digest">
                                <h4 class="digest-title">Stacks Digest</h4>
                                <div class="digest-section" id="le-anchors">
                                    <h5>Anchors</h5>
                                    <div class="list"></div>
                                </div>
                                <div class="digest-section" id="le-rooms">
                                    <h5>Recent Rooms</h5>
                                    <div class="list"></div>
                                </div>
                                <div class="digest-section" id="le-lore">
                                    <h5>Lore Fragments</h5>
                                    <div class="list"></div>
                                </div>
                            </section>
                            <section class="le-links companion-pane" id="le-links">
                                <h4 class="links-title">Ash's Link Hypotheses</h4>
                                <div class="links-list">
                                    <div class="links-placeholder">Select a node to let Ash propose new corridors.</div>
                                </div>
                            </section>
                        </div>
                    </div>
                    <div class="le-side">
                        <div class="le-companion-card">
                            <div class="companion-header">
                                <div class="companion-title">Stacks Companion</div>
                                <div class="companion-subtitle">Ash keeps vigil while you cross the shelves.</div>
                            </div>
                            <div class="companion-body">
                                <section class="le-narrative companion-pane" id="le-narrative">
                                    <div class="companion-actions">
                                        <button class="companion-btn primary" id="le-ash-link-btn">Inscribe Ash's Link</button>
                                        <button class="companion-btn" id="le-orientation-btn">Cycle Forward Edge</button>
                                        <button class="companion-btn" id="le-recenter-btn">Recenter View</button>
                                    </div>
                                    <div class="narrative-log" id="le-narrative-log" aria-live="polite" aria-label="Constellation Log">
                                        <div class="narrative-line muted">Awaiting first steps…</div>
                                    </div>
                                    <div class="chat-log" id="le-chat-log" aria-live="polite"></div>
                                    <div class="chat-input-wrap">
                                        <textarea id="le-chat-input" placeholder="Describe your next move or ask Ash for a hint…"></textarea>
                                        <div class="chat-actions">
                                            <button type="button" id="le-chat-send-btn">Send Whisper</button>
                                            <button type="button" id="le-chat-help-btn">Command Lore</button>
                                        </div>
                                    </div>
                                    <div class="chat-hints">Press Enter to send • Shift+Enter for a new line • Commands: north • south • east • west • rotate • go to &lt;node&gt;.</div>
                                </section>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    attachEventHandlers() {
        if (!this.container) return;

        const requestBtn = this.container.querySelector('#le-request-blueprint');
        if (requestBtn) {
            requestBtn.addEventListener('click', async () => {
                this.setStatus('Consulting the architect…', { temporary: true, duration: 2200 });
                try {
                    const pending = this.gamification?.worldEngine?.peekArchitectQueue?.() || [];
                    const blueprint = await this.gamification.requestLibraryBlueprint({
                        context: {
                            forcePoetic: true,
                            pendingPrompts: pending.map(entry => entry.context?.event || entry)
                        }
                    });
                    if (blueprint?.parsed) {
                        const applied = this.gamification.applyLibraryBlueprint(blueprint.parsed);
                        if (applied && Array.isArray(pending) && pending.length > 0) {
                            const ids = pending.map(entry => entry.id);
                            this.gamification.worldEngine?.consumeArchitectQueue?.(ids);
                        }
                        this.setStatus('New corridors unfurled.', { temporary: true, duration: 3000 });
                    } else {
                        this.setStatus('The architect was silent.', { temporary: true, duration: 2400 });
                    }
                } catch (error) {
                    console.error('[LibraryExplorerView] Blueprint request failed:', error);
                    this.setStatus('Architectural resonance failed.', { temporary: true, duration: 2600 });
                }
            });
        }

        const worldBtn = this.container.querySelector('#le-world-btn');
        if (worldBtn) {
            worldBtn.addEventListener('click', () => {
                this.openWorldModal();
            });
        }

        const followAshBtn = this.container.querySelector('#le-ash-link-btn');
        if (followAshBtn) {
            followAshBtn.addEventListener('click', () => {
                this.handleFollowAshLink();
            });
        }

        const rotateForwardBtn = this.container.querySelector('#le-orientation-btn');
        if (rotateForwardBtn) {
            rotateForwardBtn.addEventListener('click', () => {
                this.rotateDirectionBasis(1);
            });
        }

        const recenterBtn = this.container.querySelector('#le-recenter-btn');
        if (recenterBtn) {
            recenterBtn.addEventListener('click', () => {
                this.handleRecenterView();
            });
        }

        const linksList = this.container.querySelector('#le-links .links-list');
        if (linksList && linksList.dataset.bound !== 'true') {
            linksList.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-link-target]');
                if (!button) return;
                const targetId = button.getAttribute('data-link-target');
                if (!targetId) return;
                const nodeExists = this.nodeMap?.has(targetId);
                if (nodeExists) {
                    this.selectNode(targetId, { center: true, source: 'ash-link', immediate: false });
                } else {
                    const label = button.getAttribute('data-link-label') || targetId;
                    this.setStatus(`Uncharted corridor: ${label}`, { temporary: true, duration: 2200 });
                }
            });
            linksList.dataset.bound = 'true';
        }

        this.bindChatInterface();
    }

    injectStyles() {
        if (document.getElementById('library-explorer-styles')) return;

        const style = document.createElement('style');
        style.id = 'library-explorer-styles';
        style.textContent = `
            .library-explorer-wrapper { display: flex; flex-direction: column; width: 100%; }
            .library-explorer-panel { margin: 0; padding: 18px 20px 20px; background: rgba(9,12,19,0.85); border: 1px solid rgba(94,234,212,0.2); border-radius: 14px; color: #f9fafb; backdrop-filter: blur(12px); box-sizing: border-box; overflow: hidden; min-height: 200px; max-height: 80vh; display: flex; flex-direction: column; gap: 18px; }
            .library-explorer-panel.library-explorer-panel-full { max-height: none; height: 100%; flex: 1; }
            .library-explorer-panel .le-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 6px; border-bottom: 1px solid rgba(94,234,212,0.14); }
            .library-explorer-panel .le-icon { font-size: 20px; margin-right: 6px; }
            .library-explorer-panel .le-title { font-size: 18px; font-weight: 600; }
            .library-explorer-panel .le-actions { display: flex; align-items: center; gap: 10px; font-size: 13px; }
            .library-explorer-panel .le-btn { padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(94,234,212,0.4); background: rgba(94,234,212,0.12); color: #d1fae5; cursor: pointer; transition: background 0.2s, transform 0.2s; font-size: 13px; }
            .library-explorer-panel .le-btn.secondary { border-color: rgba(125,211,252,0.4); background: rgba(125,211,252,0.12); color: #bfdbfe; }
            .library-explorer-panel .le-btn:hover { background: rgba(94,234,212,0.2); transform: translateY(-1px); }
            .library-explorer-panel .le-btn.secondary:hover { background: rgba(125,211,252,0.2); }
            .library-explorer-panel .le-content { display: flex; flex-direction: column; gap: 24px; overflow: auto; flex: 1; padding-top: 6px; }
            .library-explorer-panel .le-layout { display: grid; grid-template-columns: minmax(0, 2.75fr) minmax(0, 1.1fr); gap: 32px; align-items: stretch; }
            .library-explorer-panel.library-explorer-panel-full .le-layout { grid-template-columns: minmax(0, 3fr) minmax(0, 1.1fr); }
            .library-explorer-panel.le-hidden { display: none !important; }
            .library-explorer-panel.le-typing { box-shadow: 0 0 20px rgba(56,189,248,0.2); }
            .library-explorer-panel .le-status.pulsing { color: #38bdf8; }
            .library-explorer-resizer { height: 8px; width: 100%; cursor: ns-resize; border-radius: 999px; background: linear-gradient(90deg, rgba(94,234,212,0.2), rgba(125,211,252,0.65), rgba(94,234,212,0.2)); opacity: 0.65; transition: opacity 0.2s ease, box-shadow 0.2s ease; margin: 8px 0; }
            .library-explorer-resizer:hover, .library-explorer-resizer.active { opacity: 1; box-shadow: 0 0 14px rgba(94,234,212,0.45); }
            .library-explorer-panel .le-constellation { display: flex; flex-direction: column; gap: 22px; }
            .library-explorer-panel .le-companion-strip { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
            .library-explorer-panel .le-side { display: flex; flex-direction: column; gap: 24px; position: relative; padding-top: 4px; min-height: 0; }
            .library-explorer-panel .le-companion-card { position: relative; border: 1px solid rgba(94,234,212,0.2); border-radius: 16px; padding: 20px; background: linear-gradient(180deg, rgba(15,23,42,0.82) 0%, rgba(11,15,25,0.9) 60%, rgba(8,12,18,0.94) 100%); box-shadow: 0 14px 36px rgba(8,12,18,0.45); display: flex; flex-direction: column; gap: 20px; overflow-x: hidden; overflow-y: auto; max-height: clamp(520px, 70vh, 880px); }
            .library-explorer-panel .le-companion-card::-webkit-scrollbar { width: 6px; }
            .library-explorer-panel .le-companion-card::-webkit-scrollbar-thumb { background: rgba(56,189,248,0.35); border-radius: 999px; }
            .library-explorer-panel .le-companion-card::after { content: ''; position: absolute; inset: auto -40% -42%; height: 220px; background: radial-gradient(circle at top, rgba(94,234,212,0.18) 0%, rgba(14,23,42,0) 65%); pointer-events: none; opacity: 0.7; }
            .library-explorer-panel .companion-header { position: relative; display: flex; flex-direction: column; gap: 4px; }
            .library-explorer-panel .companion-title { font-size: 14px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(191,219,254,0.88); }
            .library-explorer-panel .companion-subtitle { font-size: 12px; color: rgba(226,232,240,0.72); max-width: 240px; }
            .library-explorer-panel .companion-body { position: relative; display: grid; gap: 16px; grid-auto-rows: minmax(0, auto); }
            .library-explorer-panel .companion-pane { border: 1px solid rgba(148,163,184,0.16); border-radius: 12px; padding: 16px; background: rgba(8,12,18,0.58); backdrop-filter: blur(4px); display: flex; flex-direction: column; gap: 12px; position: relative; z-index: 1; }
            .library-explorer-panel .le-digest { gap: 16px; }
            .library-explorer-panel .le-digest .digest-title { margin: 0 0 2px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(191,219,254,0.75); }
            .library-explorer-panel .le-digest .digest-section { display: flex; flex-direction: column; gap: 10px; }
            .library-explorer-panel .le-digest .digest-section h5 { margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(226,232,240,0.68); }
            .library-explorer-panel .le-digest .digest-section .list { max-height: 184px; overflow-y: auto; padding-right: 6px; font-size: 12px; color: rgba(226,232,240,0.85); display: flex; flex-direction: column; gap: 10px; }
            .library-explorer-panel .le-digest .digest-section .list .list-item { padding: 10px 12px; border: 1px solid rgba(148,163,184,0.18); margin: 0; background: rgba(12,20,32,0.54); border-radius: 10px; transition: border 0.2s ease, background 0.2s ease; }
            .library-explorer-panel .le-digest .digest-section .list .list-item:last-child { margin-bottom: 0; }
            .library-explorer-panel .list-item { padding: 10px 12px; margin-bottom: 10px; border-radius: 10px; background: rgba(148,163,184,0.08); border: 1px solid rgba(148,163,184,0.18); }
            .library-explorer-panel .list-item .item-title { font-weight: 600; font-size: 13px; }
            .library-explorer-panel .list-item .item-meta { font-size: 12px; color: rgba(226,232,240,0.65); margin-top: 4px; }
            .library-explorer-panel .list-item .item-tags { font-size: 11px; margin-top: 6px; color: rgba(94,234,212,0.8); }
            .library-explorer-panel .list-item.selected { background: rgba(253,230,138,0.1); border-color: rgba(253,230,138,0.45); color: rgba(253,230,138,0.92); }
            .library-explorer-panel .le-digest .digest-section .list .list-item.selected { background: rgba(253,230,138,0.12); border-bottom: 1px solid rgba(253,230,138,0.45); }
            .library-explorer-panel .le-links { gap: 10px; }
            .library-explorer-panel .le-links .links-title { margin: 0; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(226,232,240,0.68); }
            .library-explorer-panel .le-links .links-list { display: flex; flex-direction: column; gap: 8px; max-height: 180px; overflow-y: auto; padding-right: 4px; }
            .library-explorer-panel .le-links .links-list { display: flex; flex-direction: column; gap: 12px; }
            .library-explorer-panel .le-links .links-item { border: 1px solid rgba(148,163,184,0.16); border-radius: 10px; padding: 10px 12px; background: rgba(11,18,30,0.62); display: flex; flex-direction: column; gap: 8px; }
            .library-explorer-panel .le-links .links-item[data-missing="true"] { opacity: 0.75; }
            .library-explorer-panel .le-links .links-item .link-target { font-weight: 600; font-size: 13px; color: rgba(248,250,252,0.95); display: flex; align-items: center; justify-content: space-between; gap: 8px; }
            .library-explorer-panel .le-links .links-item .link-relation { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(94,234,212,0.68); }
            .library-explorer-panel .le-links .links-item .link-confidence { font-size: 11px; color: rgba(147,197,253,0.7); }
            .library-explorer-panel .le-links .links-item .link-rationale { font-size: 12px; color: rgba(226,232,240,0.82); line-height: 1.44; }
            .library-explorer-panel .le-links .links-item .link-actions { display: flex; gap: 6px; }
            .library-explorer-panel .le-links .links-item button { padding: 4px 8px; font-size: 11px; border-radius: 8px; border: 1px solid rgba(125,211,252,0.35); background: rgba(125,211,252,0.16); color: #e0f2fe; cursor: pointer; transition: background 0.2s ease; }
            .library-explorer-panel .le-links .links-item button:hover { background: rgba(125,211,252,0.28); }
            .library-explorer-panel .le-links .links-placeholder { font-size: 12px; color: rgba(148,163,184,0.78); }
            .library-explorer-panel .le-maze { border: 1px solid rgba(94,234,212,0.18); border-radius: 16px; padding: 18px 18px 20px; background: rgba(15,23,42,0.7); display: flex; flex-direction: column; gap: 16px; }
            .library-explorer-panel .maze-header { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
            .library-explorer-panel .maze-header-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; flex-wrap: wrap; }
            .library-explorer-panel .maze-title { font-size: 14px; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(248,230,171,0.96); text-shadow: 0 0 10px rgba(0,0,0,0.55); }
            .library-explorer-panel .maze-help { font-size: 11px; letter-spacing: 0.06em; color: rgba(191,219,254,0.88); text-shadow: 0 0 6px rgba(6,12,24,0.85); }
            .library-explorer-panel .maze-actions { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; padding-bottom: 6px; border-bottom: 1px solid rgba(148,163,184,0.14); }
            .library-explorer-panel .maze-actions-buttons { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
            .library-explorer-panel .maze-btn { padding: 7px 14px; border-radius: 10px; border: 1px solid rgba(94,234,212,0.28); background: rgba(8,24,40,0.72); color: rgba(226,232,240,0.92); font-size: 11px; text-transform: uppercase; letter-spacing: 0.09em; cursor: pointer; transition: background 0.2s ease, border 0.2s ease, transform 0.2s ease; }
            .library-explorer-panel .maze-btn:hover { background: rgba(14,34,52,0.92); border-color: rgba(125,211,252,0.45); transform: translateY(-1px); }
            .library-explorer-panel .maze-btn.primary { border-color: rgba(250,204,21,0.55); background: rgba(250,204,21,0.24); color: rgba(253,244,191,0.96); }
            .library-explorer-panel .maze-btn.primary:hover { background: rgba(250,204,21,0.32); }
            .library-explorer-panel .maze-orientation { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(226,232,240,0.92); text-shadow: 0 0 6px rgba(9,17,31,0.9); }
            .library-explorer-panel .maze-canvas { position: relative; width: 100%; height: clamp(460px, 56vh, 720px); min-height: 460px; overflow: hidden; transition: box-shadow 0.3s ease, border 0.3s ease; border-radius: 14px; border: 1px solid rgba(30,41,59,0.85); box-shadow: inset 0 0 36px rgba(0,0,0,0.85), 0 0 24px rgba(8,12,22,0.65); background-color: #050814 !important; background-image: radial-gradient(circle at 28% 18%, rgba(36,52,78,0.55) 0%, rgba(12,18,32,0.94) 58%, rgba(3,6,12,0.99) 100%); color-scheme: dark; }
            .library-explorer-panel .maze-canvas::before { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0; background-image: radial-gradient(circle at 68% 12%, rgba(40,56,84,0.32), transparent 52%), radial-gradient(circle at 22% 78%, rgba(22,32,54,0.28), transparent 60%), repeating-linear-gradient(90deg, rgba(24,36,52,0.2) 0px, rgba(24,36,52,0.2) 1px, transparent 1px, transparent 120px), repeating-linear-gradient(0deg, rgba(24,36,52,0.2) 0px, rgba(24,36,52,0.2) 1px, transparent 1px, transparent 120px); opacity: 0.45; }
            .library-explorer-panel .maze-canvas:focus { outline: 1px solid rgba(250,204,21,0.4); outline-offset: 2px; }
            .library-explorer-panel .maze-canvas svg { position: relative; z-index: 1; width: 100%; height: 100%; overflow: visible; transform-origin: 50% 50%; transition: transform 0.16s ease; background: transparent; }
            .library-explorer-panel .maze-grid line { stroke: rgba(46,60,85,0.45); stroke-width: 1; }
            .library-explorer-panel .maze-node-rect { rx: 12; ry: 12; transition: fill 0.2s ease, stroke 0.2s ease; fill: rgba(28,34,48,0.78); stroke: rgba(253,224,71,0.28); stroke-width: 1.6; }
            .library-explorer-panel .maze-node-rect.anchor { fill: rgba(63,47,26,0.88); stroke: rgba(250,204,21,0.55); stroke-width: 1.8; }
            .library-explorer-panel .maze-node-rect.room { fill: rgba(24,36,56,0.8); stroke: rgba(96,165,250,0.45); stroke-width: 1.6; }
            .library-explorer-panel .maze-node-pill { fill: rgba(245,158,11,0.82); stroke: rgba(253,230,138,0.62); stroke-width: 1.4; }
            .library-explorer-panel .maze-node-pill.anchor { fill: rgba(251,191,36,0.9); stroke: rgba(253,230,138,0.6); }
            .library-explorer-panel .maze-node { cursor: pointer; }
            .library-explorer-panel .maze-node.selected .maze-node-rect { stroke: rgba(251,191,36,0.95); fill: rgba(251,191,36,0.14); }
            .library-explorer-panel .maze-node-label { fill: rgba(248,244,219,0.92); font-size: 12px; letter-spacing: 0.03em; pointer-events: none; text-shadow: 0 0 10px rgba(8,12,18,0.65); text-transform: uppercase; }
            .library-explorer-panel .maze-connection { stroke: rgba(148,197,253,0.42); stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; opacity: 0.85; }
            .library-explorer-panel .maze-canvas .network-node { transition: stroke 0.2s ease, fill 0.2s ease, r 0.2s ease; }
            .library-explorer-panel .maze-canvas .network-node.selected { stroke: rgba(251,191,36,0.92); stroke-width: 3; fill: rgba(253,230,138,0.32); filter: drop-shadow(0 0 10px rgba(253,230,138,0.55)); }
            .library-explorer-panel .maze-canvas .network-node.previous { stroke-dasharray: 4 2; opacity: 0.78; }
            .library-explorer-panel .maze-canvas .network-label { fill: rgba(244,244,245,0.94); text-shadow: 0 0 8px rgba(6,10,19,0.85); paint-order: stroke fill; stroke: rgba(3,7,15,0.7); stroke-width: 0.6px; }
            .library-explorer-panel .maze-canvas .network-label.selected { font-weight: 600; fill: rgba(253,244,191,0.98); text-shadow: 0 0 10px rgba(251,191,36,0.55); }
            .library-explorer-panel .maze-canvas .network-label.previous { opacity: 0.78; }
            .library-explorer-panel .maze-canvas .network-link.active { stroke: rgba(253,230,138,0.85); stroke-width: 2.4; opacity: 0.9; }
            .library-explorer-panel .maze-canvas .network-link.trail { stroke: rgba(253,230,138,0.9); stroke-width: 3; opacity: 0.95; }
            .library-explorer-panel .maze-canvas .network-link.orientation { stroke: rgba(14,165,233,0.92); stroke-width: 3.4; opacity: 0.98; filter: drop-shadow(0 0 10px rgba(56,189,248,0.55)); }
            .library-explorer-panel .maze-canvas .network-node.orientation-forward { stroke: rgba(14,165,233,0.95); stroke-width: 3.6; filter: drop-shadow(0 0 12px rgba(14,165,233,0.6)); }
            .library-explorer-panel .maze-canvas .network-label.orientation-forward { fill: rgba(186,230,253,0.98); text-shadow: 0 0 12px rgba(14,165,233,0.6); font-weight: 600; }
            .library-explorer-panel .maze-canvas.maze-pulse { box-shadow: 0 0 22px rgba(94,234,212,0.35); }
            .library-explorer-panel .maze-empty { font-size: 12px; color: rgba(226,232,240,0.55); margin-top: 8px; }
            .library-explorer-panel .le-narrative { border: 1px solid rgba(148,163,184,0.18); border-radius: 14px; padding: 18px 18px 20px; background: linear-gradient(180deg, rgba(15,23,42,0.68) 0%, rgba(10,16,28,0.92) 60%, rgba(8,12,18,0.96) 100%); display: flex; flex-direction: column; gap: 16px; position: relative; overflow: hidden; min-height: 320px; }
            .library-explorer-panel .le-narrative::after { content: ''; position: absolute; inset: auto -35% -55% 40%; height: 240px; background: radial-gradient(circle at top, rgba(56,189,248,0.18) 0%, rgba(8,12,18,0) 70%); opacity: 0.55; pointer-events: none; }
            .library-explorer-panel .le-narrative .companion-actions { position: relative; z-index: 1; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
            .library-explorer-panel .le-narrative .companion-btn { padding: 8px 16px; border-radius: 999px; border: 1px solid rgba(94,234,212,0.4); background: rgba(15,118,110,0.26); color: rgba(191,219,254,0.94); font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; cursor: pointer; transition: transform 0.2s ease, background 0.2s ease, border 0.2s ease; }
            .library-explorer-panel .le-narrative .companion-btn.primary { border-color: rgba(250,204,21,0.5); background: rgba(250,204,21,0.24); color: rgba(253,244,191,0.96); }
            .library-explorer-panel .le-narrative .companion-btn:hover { transform: translateY(-1px); background: rgba(56,189,248,0.25); border-color: rgba(125,211,252,0.5); }
            .library-explorer-panel .le-narrative .companion-btn:disabled { opacity: 0.6; cursor: wait; transform: none; }
            .library-explorer-panel .le-narrative .narrative-log { font-size: 12px; line-height: 1.55; color: rgba(226,232,240,0.9); overflow-y: auto; padding-right: 6px; display: flex; flex-direction: column; gap: 6px; max-height: 140px; position: relative; z-index: 1; }
            .library-explorer-panel .le-narrative .narrative-log .narrative-line { margin: 0; }
            .library-explorer-panel .le-narrative .narrative-log .narrative-line:last-child { color: rgba(248,250,252,0.95); }
            .library-explorer-panel .le-narrative .narrative-log .narrative-line.muted { color: rgba(148,163,184,0.7); }
            .library-explorer-panel .le-narrative .narrative-log .narrative-line.ash-line { font-style: italic; color: rgba(236,233,216,0.92); position: relative; padding-left: 18px; }
            .library-explorer-panel .le-narrative .narrative-log .narrative-line.ash-line::before { content: '✶'; position: absolute; left: 0; top: 2px; font-size: 11px; color: rgba(253,230,138,0.75); opacity: 0.4; animation: ashPulse 6s ease-in-out infinite; }
            .library-explorer-panel .le-narrative .chat-log { position: relative; z-index: 1; min-height: 160px; max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; padding-right: 10px; font-family: 'IBM Plex Mono','Fira Code','Courier New',monospace; font-size: 13px; line-height: 1.55; color: rgba(226,232,240,0.9); background: rgba(8,16,26,0.48); border: 1px solid rgba(56,189,248,0.14); border-radius: 12px; box-shadow: inset 0 0 18px rgba(2,12,20,0.65); }
            .library-explorer-panel .le-narrative .chat-log .chat-line { display: flex; gap: 10px; align-items: flex-start; }
            .library-explorer-panel .le-narrative .chat-log .chat-line.you .label { color: rgba(253,230,138,0.92); }
            .library-explorer-panel .le-narrative .chat-log .chat-line.ash .label { color: rgba(56,189,248,0.88); }
            .library-explorer-panel .le-narrative .chat-log .chat-line.system .label { color: rgba(148,163,184,0.78); }
            .library-explorer-panel .le-narrative .chat-log .chat-line .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; padding-top: 3px; }
            .library-explorer-panel .le-narrative .chat-log .chat-line .content { flex: 1; white-space: pre-line; }
            .library-explorer-panel .le-narrative .chat-log .chat-line .content em { font-style: normal; color: rgba(253,230,138,0.9); }
            .library-explorer-panel .le-narrative .chat-log .chat-line.pending .content { opacity: 0.7; font-style: italic; }
            .library-explorer-panel .le-narrative .chat-input-wrap { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 10px; }
            .library-explorer-panel .le-narrative textarea { resize: vertical; min-height: 72px; max-height: 160px; border-radius: 12px; border: 1px solid rgba(56,189,248,0.22); background: rgba(4,10,18,0.85); color: rgba(226,232,240,0.96); font-family: 'IBM Plex Mono','Fira Code','Courier New',monospace; font-size: 13px; line-height: 1.5; padding: 12px 14px; box-shadow: inset 0 0 14px rgba(2,12,20,0.55); }
            .library-explorer-panel .le-narrative textarea:focus { outline: none; border-color: rgba(94,234,212,0.45); box-shadow: 0 0 0 2px rgba(94,234,212,0.2); }
            .library-explorer-panel .le-narrative .chat-actions { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
            .library-explorer-panel .le-narrative .chat-actions button { padding: 8px 16px; border-radius: 999px; border: 1px solid rgba(94,234,212,0.4); background: rgba(15,118,110,0.26); color: rgba(191,219,254,0.94); font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; cursor: pointer; transition: transform 0.2s ease, background 0.2s ease, border 0.2s ease; }
            .library-explorer-panel .le-narrative .chat-actions button:hover { transform: translateY(-1px); background: rgba(56,189,248,0.25); border-color: rgba(125,211,252,0.5); }
            .library-explorer-panel .le-narrative .chat-actions button:disabled { opacity: 0.5; cursor: wait; transform: none; }
            .library-explorer-panel .le-narrative .chat-hints { font-size: 11px; letter-spacing: 0.05em; color: rgba(148,163,184,0.75); text-transform: uppercase; position: relative; z-index: 1; }
            .library-explorer-panel .le-narrative .chat-log .chat-placeholder { color: rgba(148,163,184,0.72); font-style: italic; }
            @keyframes ashPulse { 0% { opacity: 0.35; transform: translateY(0); } 45% { opacity: 0.88; transform: translateY(-1px); } 100% { opacity: 0.35; transform: translateY(0); } }
            .library-explorer-panel .le-pulse { border: 1px solid rgba(148,163,184,0.18); border-radius: 14px; padding: 16px; background: rgba(21,33,52,0.68); display: flex; flex-direction: column; gap: 12px; min-height: 200px; transition: box-shadow 0.25s ease, border 0.25s ease; }
            .library-explorer-panel .le-pulse.pulse-active { box-shadow: 0 0 22px rgba(96,165,250,0.35); border-color: rgba(125,211,252,0.45); }
            .library-explorer-panel .pulse-header { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(191,219,254,0.82); }
            .library-explorer-panel .pulse-count { font-size: 12px; color: rgba(147,197,253,0.85); }
            .library-explorer-panel .pulse-subtitle { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(191,219,254,0.6); margin-bottom: 4px; }
            .library-explorer-panel .pulse-snippet, .library-explorer-panel .pulse-node { background: rgba(10,16,28,0.6); border: 1px solid rgba(148,163,184,0.14); border-radius: 10px; padding: 10px 12px; }
            .library-explorer-panel .pulse-snippet-text, .library-explorer-panel .pulse-node-body { font-size: 13px; line-height: 1.4; color: rgba(226,232,240,0.9); white-space: pre-line; }
            .library-explorer-panel .pulse-node-title { font-size: 14px; font-weight: 600; color: rgba(248,250,252,0.95); margin-bottom: 4px; }
            .library-world-modal-overlay { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(8,12,18,0.65); backdrop-filter: blur(16px); z-index: 10000; padding: 24px; }
            .library-world-modal { width: min(720px,92vw); max-height: 82vh; background: rgba(15,23,42,0.92); border: 1px solid rgba(94,234,212,0.25); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 16px; box-shadow: 0 24px 60px rgba(8,12,18,0.45); color: #e2e8f0; }
            .library-world-modal header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
            .library-world-modal header h3 { margin: 0; font-size: 18px; font-weight: 600; color: #bae6fd; letter-spacing: 0.06em; }
            .library-world-modal header button { background: transparent; border: 1px solid rgba(94,234,212,0.35); color: #bae6fd; border-radius: 8px; cursor: pointer; padding: 4px 10px; transition: background 0.2s ease; }
            .library-world-modal header button:hover { background: rgba(94,234,212,0.18); }
            .library-world-modal textarea { width: 100%; flex: 1; min-height: 220px; max-height: 48vh; background: rgba(8,12,18,0.8); border: 1px solid rgba(94,234,212,0.3); border-radius: 10px; color: #e2e8f0; font-family: 'Fira Code','Courier New',monospace; font-size: 13px; padding: 14px; resize: vertical; line-height: 1.45; }
            .library-world-modal textarea:focus { outline: none; box-shadow: 0 0 0 2px rgba(94,234,212,0.35); }
            .library-world-modal .modal-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
            .library-world-modal .modal-actions button { padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(125,211,252,0.4); background: rgba(125,211,252,0.12); color: #bfdbfe; cursor: pointer; transition: background 0.2s ease, transform 0.2s ease; }
            .library-world-modal .modal-actions button.primary { border-color: rgba(94,234,212,0.5); background: rgba(94,234,212,0.18); color: #bbf7d0; }
            .library-world-modal .modal-actions button.danger { border-color: rgba(248,113,113,0.4); background: rgba(248,113,113,0.12); color: #fecaca; }
            .library-world-modal .modal-actions button:hover { background: rgba(125,211,252,0.22); transform: translateY(-1px); }
            .library-world-modal .modal-actions button.danger:hover { background: rgba(248,113,113,0.2); }
            .library-world-modal .modal-status { font-size: 12px; min-height: 18px; color: rgba(148,163,184,0.9); }
            .library-world-modal .modal-status.error { color: #fecaca; }
            .library-world-modal .modal-status.success { color: #bbf7d0; }
            @media (max-width: 1200px) {
                .library-explorer-panel .le-layout { grid-template-columns: 1fr; gap: 24px; }
                .library-explorer-panel .le-digest .digest-section .list { max-height: 140px; }
            }
        `;

        document.head.appendChild(style);
    }

    renderMaze(worldState = {}) {
        if (!this.container) return;
        const mazeSection = this.container.querySelector('#le-maze');
        if (!mazeSection) return;

        const canvas = mazeSection.querySelector('.maze-canvas');
        const placeholder = mazeSection.querySelector('.maze-empty');
        if (!canvas) return;

        this.currentWorldState = worldState || {};

        if (placeholder) {
            placeholder.textContent = 'Mapping the library constellation…';
        }

        if (typeof window.UnifiedNetworkVisualization === 'undefined') {
            console.warn('[LibraryExplorerView] UnifiedNetworkVisualization unavailable.');
            canvas.innerHTML = '';
            if (placeholder) {
                placeholder.style.display = 'block';
                placeholder.textContent = 'Constellation module not loaded.';
            }
            return;
        }

        if (placeholder) {
            placeholder.style.display = 'none';
        }

        if (this.networkCanvas !== canvas) {
            this.disposeNetwork();
            this.networkCanvas = canvas;
        }

        if (!this.networkInstance && !this.networkInitializing) {
            this.networkInitializing = true;
            this.initializeNetworkVisualization(canvas)
                .catch(error => {
                    console.error('[LibraryExplorerView] Failed to initialize constellation view:', error);
                    if (placeholder) {
                        placeholder.style.display = 'block';
                        placeholder.textContent = 'Constellation failed to awaken.';
                    }
                })
                .finally(() => {
                    this.networkInitializing = false;
                });
            return;
        }

        if (this.networkInstance && this.networkReady) {
            this.scheduleNetworkSync();
        }

        this.renderNarrativeLog();
        this.attachKeyboardAndMouse();
    }

    render(worldState = {}, ledger = {}, options = {}) {
        const { force = false } = options;
        const now = Date.now();
        if (!force && now - this.lastRender < this.renderThrottle) return;
        this.lastRender = now;

        const container = this.ensureContainer();
        if (!container) return;

        this.renderMaze(worldState);
        this.renderAnchors(worldState?.anchors || {});
        this.renderRooms(worldState?.rooms || {});
        this.renderLore(worldState?.loreFragments || {});
        this.renderLinkSuggestions();

        if (ledger) {
            const summary = `Shards ${ledger.lexiconShards || 0} • Sigils ${ledger.catalogueSigils || 0} • Tokens ${ledger.architectTokens || 0}`;
            this.setStatus(summary);
        }

        this.renderPulse(options?.snippet || '', options?.pulse || {});
        this.attachKeyboardAndMouse();

        if (!this.nodeOrder?.length) {
            this.selectedNodeId = null;
            this.clearNodeDetails();
        } else if (!this.selectedNodeId || !this.nodeMap?.has(this.selectedNodeId)) {
            this.selectNode(this.nodeOrder[0].id, { silent: true, center: true, immediate: true, source: 'system' });
        } else {
            this.highlightSelection();
            this.renderNodeDetails();
        }

        if (options?.force && this.container) {
            this.container.classList.remove('pulse-active');
        }
    }

    async initializeNetworkVisualization(canvas) {
        if (!canvas) return;

        try {
            this.disposeNetwork();
            this.networkCanvas = canvas;

            const config = {
                showControls: false,
                enableSelection: true,
                openFileOnClick: true,
                focusScale: 0.85,
                initialScale: 0.64,
                preserveScaleOnFocus: true,
                vizId: 'library-constellation-viz',
                visualizationOptions: {
                    includeHeadings: false,
                    includeSubheadings: false,
                    theme: 'dark',
                    showLabels: true,
                    nodeSize: 'normal'
                }
            };

            this.networkInstance = new window.UnifiedNetworkVisualization();
            await this.networkInstance.initialize(canvas, config);
            this.networkReady = true;
            this.registerNetworkHooks();
            this.scheduleNetworkSync({ immediate: true });
        } catch (error) {
            console.error('[LibraryExplorerView] Constellation initialization failed:', error);
            this.disposeNetwork();
            throw error;
        }
    }

    registerNetworkHooks() {
        if (!this.networkInstance) return;

        if (this.networkSelectionHandler) {
            this.networkInstance.removeSelectionListener?.(this.networkSelectionHandler);
        }
        if (this.networkTickHandler) {
            this.networkInstance.removeTickListener?.(this.networkTickHandler);
        }

        this.networkSelectionHandler = (node, options = {}) => {
            if (!node || options?.source === 'library') return;
            const nodeId = node.id || node?.nodeId;
            if (!nodeId || this.selectedNodeId === nodeId) return;
            const incomingSource = options.source || 'network';
            const shouldNarrate = incomingSource === 'click';
            this.selectNode(nodeId, {
                silent: !shouldNarrate,
                skipNetwork: true,
                center: shouldNarrate,
                source: incomingSource
            });
        };

        this.networkTickHandler = (snapshot = []) => {
            this.updatePositionsFromSnapshot(snapshot);
        };

        this.networkInstance.addSelectionListener?.(this.networkSelectionHandler);
        this.networkInstance.addTickListener?.(this.networkTickHandler);

        if (this.selectedNodeId) {
            this.networkInstance.setSelectedNode(this.selectedNodeId, {
                source: 'library',
                center: false,
                immediate: true
            });
        }
    }

    scheduleNetworkSync(options = {}) {
        if (this.networkSyncTimeout) {
            clearTimeout(this.networkSyncTimeout);
            this.networkSyncTimeout = null;
        }

        const delay = options.immediate ? 0 : 120;
        this.networkSyncTimeout = setTimeout(() => {
            this.networkSyncTimeout = null;
            this.syncNetworkNodes();
        }, delay);
    }

    syncNetworkNodes() {
        if (!this.networkInstance) return;

        const nodes = this.networkInstance.getNodes?.() || [];
        const links = this.networkInstance.getLinks?.() || [];

        if (!nodes.length) {
            this.handleEmptyNetwork();
            return;
        }

        const placeholder = this.container?.querySelector('#le-maze .maze-empty');
        if (placeholder) {
            placeholder.style.display = 'none';
        }

        this.nodeMap = new Map(nodes.map(node => [node.id, node]));
        this.decorateNodesWithLibraryMeta(nodes);

        const getPriority = (node) => {
            if (node.libraryMeta?.role === 'anchor') return 0;
            if (node.libraryMeta?.role === 'room') return 1;
            const weight = { file: 2, heading: 3, subheading: 4 };
            return weight[node.type] ?? 5;
        };

        this.nodeOrder = nodes
            .slice()
            .sort((a, b) => {
                const priorityA = getPriority(a);
                const priorityB = getPriority(b);
                if (priorityA !== priorityB) return priorityA - priorityB;
                return (a.name || a.id || '').localeCompare(b.name || b.id || '');
            });

        const positions = new Map();
        nodes.forEach(node => {
            if (typeof node.x === 'number' && typeof node.y === 'number') {
                positions.set(node.id, { x: node.x, y: node.y });
            }
        });
        this.positions = positions;

        const corridors = [];
        links.forEach(link => {
            const from = typeof link.source === 'object' ? link.source.id : link.source;
            const to = typeof link.target === 'object' ? link.target.id : link.target;
            if (!from || !to) return;
            corridors.push({ from, to });
        });

        const worldCorridors = Array.isArray(this.currentWorldState?.corridors) ? this.currentWorldState.corridors : [];
        worldCorridors.forEach(corridor => {
            const fromNodeId = this.libraryWorldNodeIndex.get(corridor.from);
            const toNodeId = this.libraryWorldNodeIndex.get(corridor.to);
            if (!fromNodeId || !toNodeId) return;
            corridors.push({ from: fromNodeId, to: toNodeId, world: true });
        });
        this.buildAdjacency(corridors);
        this.navGraph = this.adjacency;

        this.clusterLookup = new Map();
        this.clusterMembers = new Map();

        const chooseConnected = !this.selectedNodeId || !this.nodeMap.has(this.selectedNodeId);
        if (chooseConnected) {
            const defaultNode = this.chooseDefaultNetworkNode(nodes, corridors);
            if (defaultNode) {
                this.selectNode(defaultNode.id, { silent: true, center: true, source: 'system', immediate: true });
            }
        }

        if (this.selectedNodeId && this.networkInstance?.setSelectedNode) {
            this.networkInstance.setSelectedNode(this.selectedNodeId, {
                source: 'library',
                center: true,
                preserveScale: true,
                immediate: true
            });
        }

        if (!chooseConnected) {
            this.highlightSelection();
            this.renderNodeDetails();
        }

        if (this.selectedNodeId) {
            this.configureOrientationForNode(this.selectedNodeId, this.lastVisitedNodeId, {
                preserveForward: true,
                fallbackVector: this.orientationVector
            });
        } else {
            this.updateOrientationIndicator();
        }
    }

    updatePositionsFromSnapshot(snapshot = []) {
        if (!Array.isArray(snapshot) || !snapshot.length) return;
        if (!this.positions) {
            this.positions = new Map();
        }

        snapshot.forEach(entry => {
            if (!entry || !entry.id) return;
            if (typeof entry.x !== 'number' || typeof entry.y !== 'number') return;
            this.positions.set(entry.id, { x: entry.x, y: entry.y });
        });
    }

    decorateNodesWithLibraryMeta(nodes = []) {
        this.libraryWorldNodeIndex = new Map();
        const worldState = this.currentWorldState || {};
        const { keyIndex, idIndex } = this.buildWorldMetadataIndex(worldState);
        this.worldMetadataIndex = { keyIndex, idIndex };

        const pendingParentAssignments = [];

        nodes.forEach(node => {
            let matchedEntry = null;
            const keys = this.collectNodeKeys(node);
            for (const key of keys) {
                if (!key) continue;
                const candidate = keyIndex.get(key);
                if (candidate) {
                    matchedEntry = candidate;
                    break;
                }
            }

            if (matchedEntry) {
                node.libraryMeta = {
                    role: matchedEntry.role,
                    worldId: matchedEntry.worldId,
                    label: matchedEntry.label,
                    description: matchedEntry.description,
                    unlocked: matchedEntry.unlocked,
                    anchor: matchedEntry.anchor,
                    tags: matchedEntry.tags,
                    world: matchedEntry.worldData,
                    inherited: false
                };
                this.libraryWorldNodeIndex.set(matchedEntry.worldId, node.id);
            } else {
                node.libraryMeta = null;
                if (node.parent) {
                    pendingParentAssignments.push(node);
                }
            }
        });

        pendingParentAssignments.forEach(node => {
            if (!node.parent) return;
            const parentNode = this.nodeMap?.get(node.parent);
            if (!parentNode?.libraryMeta) return;
            node.libraryMeta = {
                ...parentNode.libraryMeta,
                inherited: true
            };
        });
    }

    buildWorldMetadataIndex(worldState = {}) {
        const anchors = worldState?.anchors || {};
        const rooms = worldState?.rooms || {};
        const keyIndex = new Map();
        const idIndex = new Map();

        const registerEntry = (entry, keys = []) => {
            idIndex.set(entry.worldId, entry);
            keys.forEach(key => {
                if (!key) return;
                const existing = keyIndex.get(key);
                if (!existing || entry.priority < existing.priority) {
                    keyIndex.set(key, entry);
                }
            });
        };

        Object.entries(anchors).forEach(([id, anchor]) => {
            const entry = {
                role: 'anchor',
                worldId: id,
                label: anchor?.label || id,
                description: anchor?.description || '',
                unlocked: anchor?.unlocked !== false,
                anchor: id,
                tags: Array.isArray(anchor?.tags) ? anchor.tags : [],
                worldData: anchor,
                priority: 0
            };
            const keys = [
                this.normalizeKey(id),
                this.normalizeKey(anchor?.label),
                this.normalizeKey(anchor?.slug)
            ];
            registerEntry(entry, keys);
        });

        Object.entries(rooms).forEach(([id, room]) => {
            const entry = {
                role: 'room',
                worldId: id,
                label: room?.title || id,
                description: room?.description || room?.summary || '',
                unlocked: true,
                anchor: room?.anchor || null,
                tags: Array.isArray(room?.thematicTags) ? room.thematicTags : [],
                worldData: room,
                priority: 1
            };
            const keys = [
                this.normalizeKey(id),
                this.normalizeKey(room?.title),
                this.normalizeKey(room?.slug),
                this.normalizeKey(room?.id)
            ];
            if (room?.fileName) {
                keys.push(this.normalizeKey(room.fileName));
            }
            registerEntry(entry, keys);
        });

        return { keyIndex, idIndex };
    }

    collectNodeKeys(node = {}) {
        const keys = new Set();
        if (node.id) {
            keys.add(this.normalizeKey(node.id));
            if (typeof node.id === 'string' && node.id.endsWith('.md')) {
                keys.add(this.normalizeKey(node.id.replace(/\.md$/i, '')));
            }
        }
        if (node.name) {
            keys.add(this.normalizeKey(node.name));
        }
        if (node.path) {
            const pathFragment = node.path.split(/[/\\]/).pop();
            if (pathFragment) {
                keys.add(this.normalizeKey(pathFragment));
                keys.add(this.normalizeKey(pathFragment.replace(/\.md$/i, '')));
            }
        }
        if (node.meta && node.meta.slug) {
            keys.add(this.normalizeKey(node.meta.slug));
        }
        return Array.from(keys).filter(Boolean);
    }

    chooseDefaultNetworkNode(nodes = [], corridors = []) {
        if (!Array.isArray(nodes) || !nodes.length) return null;
        if (!Array.isArray(corridors) || !corridors.length) {
            const fileNode = nodes.find(node => node.type === 'file');
            if (fileNode) return fileNode;
            return nodes[0];
        }

        const adjacency = new Map();
        corridors.forEach(corridor => {
            const from = corridor?.from;
            const to = corridor?.to;
            if (!from || !to) return;
            if (!adjacency.has(from)) adjacency.set(from, new Set());
            if (!adjacency.has(to)) adjacency.set(to, new Set());
            adjacency.get(from).add(to);
            adjacency.get(to).add(from);
        });

        if (!adjacency.size) {
            const fileNode = nodes.find(node => node.type === 'file');
            if (fileNode) return fileNode;
            return nodes[0];
        }

        const visited = new Set();
        let bestComponent = { size: 0, nodes: [], edges: 0 };

        const bfs = (startId) => {
            const queue = [startId];
            const componentNodes = [];
            let edgeCount = 0;
            visited.add(startId);

            while (queue.length) {
                const currentId = queue.shift();
                componentNodes.push(currentId);
                const neighbors = adjacency.get(currentId) || new Set();
                edgeCount += neighbors.size;
                neighbors.forEach(neighborId => {
                    if (!visited.has(neighborId)) {
                        visited.add(neighborId);
                        queue.push(neighborId);
                    }
                });
            }

            return {
                size: componentNodes.length,
                nodes: componentNodes,
                edges: edgeCount / 2
            };
        };

        adjacency.forEach((_neighbors, nodeId) => {
            if (!visited.has(nodeId)) {
                const component = bfs(nodeId);
                if (
                    component.size > bestComponent.size ||
                    (component.size === bestComponent.size && component.edges > bestComponent.edges)
                ) {
                    bestComponent = component;
                }
            }
        });

        if (bestComponent.size > 0) {
            const centerCandidate = bestComponent.nodes
                .map(id => this.nodeMap?.get(id))
                .filter(Boolean)
                .map(node => {
                    const neighbors = adjacency.get(node.id) || new Set();
                    const distanceSum = bestComponent.nodes.reduce((sum, otherId) => {
                        if (otherId === node.id) return sum;
                        const path = this.shortestPathLength(node.id, otherId, adjacency);
                        return sum + (Number.isFinite(path) ? path : 0);
                    }, 0);
                    return {
                        node,
                        degree: neighbors.size,
                        distanceSum
                    };
                })
                .sort((a, b) => {
                    if (b.degree !== a.degree) return b.degree - a.degree;
                    if (a.distanceSum !== b.distanceSum) return a.distanceSum - b.distanceSum;
                    const scoreA = (a.node.type === 'file' ? 0 : 1);
                    const scoreB = (b.node.type === 'file' ? 0 : 1);
                    if (scoreA !== scoreB) return scoreA - scoreB;
                    return (a.node.name || a.node.id || '').localeCompare(b.node.name || b.node.id || '');
                });

            if (centerCandidate.length) {
                return centerCandidate[0].node;
            }
        }

        const fileNode = nodes.find(node => node.type === 'file');
        if (fileNode) return fileNode;
        return nodes[0];
    }

    shortestPathLength(startId, targetId, adjacency) {
        if (startId === targetId) return 0;
        if (!adjacency.has(startId) || !adjacency.has(targetId)) return Infinity;
        const visited = new Set([startId]);
        let frontier = [startId];
        let distance = 0;
        while (frontier.length) {
            distance += 1;
            const nextFrontier = [];
            for (const nodeId of frontier) {
                const neighbors = adjacency.get(nodeId) || new Set();
                for (const neighbor of neighbors) {
                    if (neighbor === targetId) return distance;
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        nextFrontier.push(neighbor);
                    }
                }
            }
            frontier = nextFrontier;
        }
        return Infinity;
    }

    disposeNetwork() {
        if (this.networkSyncTimeout) {
            clearTimeout(this.networkSyncTimeout);
            this.networkSyncTimeout = null;
        }

        if (this.networkInstance) {
            try {
                if (this.networkSelectionHandler) {
                    this.networkInstance.removeSelectionListener?.(this.networkSelectionHandler);
                }
                if (this.networkTickHandler) {
                    this.networkInstance.removeTickListener?.(this.networkTickHandler);
                }
                this.networkInstance.destroy?.();
            } catch (error) {
                console.warn('[LibraryExplorerView] Error disposing constellation:', error);
            }
        }

        this.networkInstance = null;
        this.networkReady = false;
        this.networkCanvas = null;
        this.networkSelectionHandler = null;
        this.networkTickHandler = null;
        this.libraryWorldNodeIndex = new Map();
        this.worldMetadataIndex = null;
        this.lastVisitedNodeId = null;
        this.narrativeEntries = [];
        this.nodeLoreCache = new Map();
        this.ashNarrativeInFlight = false;
        this.lastAshNarrativeAt = 0;
        if (this.ashNarrativeTimer) {
            clearTimeout(this.ashNarrativeTimer);
            this.ashNarrativeTimer = null;
        }
        this.ashLinkSuggestionCache = new Map();
        this.ashLinkInFlight = false;
        this.lastLinkSuggestionAt = 0;
        this.linkSuggestionState = {
            nodeId: null,
            status: 'idle',
            items: [],
            message: ''
        };
        if (this.ashLinkTimer) {
            clearTimeout(this.ashLinkTimer);
            this.ashLinkTimer = null;
        }
        this.lastLinkNarratedNode = null;
        this.lastDirectionVector = null;
        this.lastDirectionKey = null;
        this.orientationNeighbors = [];
        this.orientationIndex = -1;
        this.orientationVector = { x: 0, y: -1 };
        this.forwardNeighborId = null;
        this.networkInstance?.setOrientationHighlight?.(null, null);
        this.updateOrientationIndicator();
        this.renderNarrativeLog();
        this.ashChatInFlight = false;
        this.ashChatPendingId = null;
        this.ashChatInitialized = false;
        this.ashChatLog = [];
        this.refreshChatLog();
    }

    handleEmptyNetwork() {
        this.nodeOrder = [];
        this.nodeMap = new Map();
        this.positions = new Map();
        this.adjacency = new Map();
        this.navGraph = new Map();
        this.clusterLookup = new Map();
        this.clusterMembers = new Map();
        this.libraryWorldNodeIndex = new Map();
        this.worldMetadataIndex = null;
        this.lastVisitedNodeId = null;
        this.narrativeEntries = [];
        this.nodeLoreCache = new Map();
        this.ashNarrativeInFlight = false;
        this.lastAshNarrativeAt = 0;
        if (this.ashNarrativeTimer) {
            clearTimeout(this.ashNarrativeTimer);
            this.ashNarrativeTimer = null;
        }
        this.ashLinkSuggestionCache = new Map();
        this.ashLinkInFlight = false;
        this.lastLinkSuggestionAt = 0;
        this.linkSuggestionState = {
            nodeId: null,
            status: 'idle',
            items: [],
            message: ''
        };
        if (this.ashLinkTimer) {
            clearTimeout(this.ashLinkTimer);
            this.ashLinkTimer = null;
        }
        this.lastLinkNarratedNode = null;
        this.orientationNeighbors = [];
        this.orientationIndex = -1;
        this.orientationVector = { x: 0, y: -1 };
        this.forwardNeighborId = null;
        this.networkInstance?.setOrientationHighlight?.(null, null);
        this.updateOrientationIndicator();
        this.clearNodeDetails();

        this.ashChatInFlight = false;
        this.ashChatPendingId = null;
        this.ashChatInitialized = false;
        this.ashChatLog = [];

        const placeholder = this.container?.querySelector('#le-maze .maze-empty');
        const canvas = this.container?.querySelector('#le-maze .maze-canvas');
        if (canvas) {
            canvas.innerHTML = '';
        }
        if (placeholder) {
            placeholder.style.display = 'block';
            placeholder.textContent = 'Constellation dormant — write to summon new nodes.';
        }
        this.renderNarrativeLog();
        this.refreshChatLog();
    }

    activateSelection() {
        if (!this.selectedNodeId) return false;
        const node = this.nodeMap?.get(this.selectedNodeId);
        if (!node) return false;

        if (node.type === 'file' && node.path && typeof window.openFile === 'function') {
            window.openFile(node.path);
            return true;
        }

        if (node.type !== 'file' && node.parent && typeof window.openFile === 'function') {
            const parentNode = this.nodeMap?.get(node.parent);
            if (parentNode?.path) {
                window.openFile(parentNode.path);
                return true;
            }
        }

        if (this.networkInstance?.focusOnNode) {
            this.networkInstance.focusOnNode(node.id, { scale: 1.35 });
            return true;
        }

        return false;
    }

    renderAnchors(anchors) {
        const anchorList = this.container?.querySelector('#le-anchors .list');
        if (!anchorList) return;

        const entries = Object.entries(anchors);
        if (!entries.length) {
            anchorList.innerHTML = '<div class="list-item">No anchors charted yet.</div>';
            return;
        }

        anchorList.innerHTML = entries.map(([id, anchor]) => {
            const status = anchor.unlocked ? 'unlocked' : 'sealed';
            const isSelected = this.selectedNodeId === id;
            const classes = ['list-item'];
            if (isSelected) classes.push('selected');
            return `
                <div class="${classes.join(' ')}">
                    <div class="item-title">${anchor.label || id}</div>
                    <div class="item-meta">${anchor.description || ''}</div>
                    <div class="item-meta">Status: ${status}</div>
                </div>
            `;
        }).join('');
    }

    renderRooms(rooms) {
        const roomList = this.container?.querySelector('#le-rooms .list');
        if (!roomList) return;

        const toTime = (value) => value ? new Date(value).getTime() : 0;
        const roomArray = Object.values(rooms)
            .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))
            .slice(0, 5);

        if (!roomArray.length) {
            roomList.innerHTML = '<div class="list-item">The stacks await their first chambers.</div>';
            return;
        }

        roomList.innerHTML = roomArray.map(room => `
            <div class="list-item${this.selectedNodeId === room.id ? ' selected' : ''}">
                <div class="item-title">${room.title || room.id}</div>
                <div class="item-meta">${room.description || 'Unnamed chamber.'}</div>
                ${room.thematicTags ? `<div class="item-tags">${room.thematicTags.join(', ')}</div>` : ''}
            </div>
        `).join('');
    }

    renderLore(loreFragments) {
        const loreList = this.container?.querySelector('#le-lore .list');
        if (!loreList) return;

        const toTime = (value) => value ? new Date(value).getTime() : 0;
        const loreArray = Object.values(loreFragments)
            .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))
            .slice(0, 5);

        if (!loreArray.length) {
            loreList.innerHTML = '<div class="list-item">No lore has been inscribed yet.</div>';
            return;
        }

        loreList.innerHTML = loreArray.map(fragment => `
            <div class="list-item${this.selectedNodeId === fragment.id ? ' selected' : ''}">
                <div class="item-title">${fragment.title || fragment.id}</div>
                <div class="item-meta">${fragment.prose || fragment.summary || ''}</div>
            </div>
        `).join('');
    }

    _renderMazeLegacy(worldState = {}) {
        if (!this.container) return;
        const mazeSection = this.container.querySelector('#le-maze');
        if (!mazeSection) return;

        const canvas = mazeSection.querySelector('.maze-canvas');
        const placeholder = mazeSection.querySelector('.maze-empty');
        if (!canvas) return;

        const anchors = Object.entries(worldState.anchors || {}).map(([id, anchor]) => ({
            id,
            title: anchor.label || id,
            type: 'anchor',
            meta: anchor || {}
        }));

        const rooms = Object.entries(worldState.rooms || {}).map(([id, room]) => ({
            id,
            title: room.title || id,
            type: 'room',
            meta: room || {}
        }));

        const nodes = [...anchors, ...rooms];
        this.currentWorldState = worldState;

        if (!nodes.length) {
            canvas.innerHTML = '';
            if (placeholder) placeholder.style.display = 'block';
            this.nodeOrder = [];
            this.nodeMap = new Map();
            this.positions = new Map();
            this.adjacency = new Map();
            this.navGraph = new Map();
            this.clusterLookup = new Map();
            this.clusterMembers = new Map();
            this.lastCanvasElement = canvas;
            this.resetZoom();
            this.updateProgressStatus('Constellation dormant — keep typing to reveal new nodes');
            return;
        }

        if (placeholder) placeholder.style.display = 'none';

        const corridors = Array.isArray(worldState.corridors) ? worldState.corridors : [];

        const layout = this.buildGridLayout(anchors, rooms);
        const orderedNodes = [...anchors, ...rooms];
        this.nodeOrder = orderedNodes;
        this.nodeMap = new Map(orderedNodes.map(node => [node.id, node]));
        this.positions = layout.positions;
        this.navGraph = layout.navGraph;
        this.clusterLookup = new Map();
        this.clusterMembers = new Map();
        this.buildAdjacency(corridors);

        const gridMarkup = layout.gridLines
            .map(line => `<line x1="${line.x1.toFixed(2)}" y1="${line.y1.toFixed(2)}" x2="${line.x2.toFixed(2)}" y2="${line.y2.toFixed(2)}"></line>`)
            .join('');

        const connections = corridors
            .map(corridor => {
                const from = layout.positions.get(corridor.from);
                const to = layout.positions.get(corridor.to);
                if (!from || !to) return '';
                return `<path class="maze-connection" d="M ${from.x.toFixed(2)} ${from.y.toFixed(2)} L ${to.x.toFixed(2)} ${to.y.toFixed(2)}" />`;
            })
            .join('');

        const nodeMarkup = orderedNodes
            .map(node => {
                const pos = layout.positions.get(node.id);
                if (!pos) return '';
                const isAnchor = node.type === 'anchor';
                const rawLabel = (node.title || node.id || '').toString();
                const truncated = rawLabel.length > 22 ? `${rawLabel.slice(0, 19)}…` : rawLabel;
                const label = this.escapeHTML(truncated);
                const tooltip = this.escapeHTML(rawLabel);
                const rectX = (pos.x - layout.rect.width / 2).toFixed(2);
                const rectY = (pos.y - layout.rect.height / 2).toFixed(2);
                const pillCX = pos.x.toFixed(2);
                const pillCY = (pos.y - layout.rect.height / 2 + 16).toFixed(2);
                const labelY = (pos.y + layout.rect.height / 2 - 12).toFixed(2);
                return `
                    <g class="maze-node" data-node-id="${node.id}" title="${tooltip}">
                        <rect class="maze-node-rect ${isAnchor ? 'anchor' : 'room'}" x="${rectX}" y="${rectY}" width="${layout.rect.width}" height="${layout.rect.height}"></rect>
                        <circle class="maze-node-pill ${isAnchor ? 'anchor' : 'room'}" cx="${pillCX}" cy="${pillCY}" r="${layout.pillRadius}"></circle>
                        <text class="maze-node-label" x="${pos.x.toFixed(2)}" y="${labelY}" text-anchor="middle">${label}</text>
                    </g>
                `;
            })
            .join('');

        canvas.innerHTML = `
            <svg class="maze-view grid" viewBox="${layout.viewBox}" preserveAspectRatio="xMidYMid meet">
                <g class="maze-grid">
                    ${gridMarkup}
                </g>
                <g class="maze-corridors">
                    ${connections}
                </g>
                ${nodeMarkup}
            </svg>
        `;

        this.attachMazeInteraction(canvas);
        this.attachZoomHandlers(canvas);
        this.lastCanvasElement = canvas;
        this.applyZoomTransform();
        this.attachKeyboardAndMouse();

        const progressEl = document.getElementById('progress-status');
        if (progressEl) {
            const existing = progressEl.textContent || '';
        if (!existing || /Constellation dormant|Next shard: 30 words/.test(existing)) {
                this.updateProgressStatus('Labyrinth active — use arrow keys or click to explore');
            }
        }

    }

    buildGridLayout(anchors = [], rooms = []) {
        const anchorNodes = Array.isArray(anchors) ? anchors : [];
        const roomNodes = Array.isArray(rooms) ? rooms : [];
        const allNodes = [...anchorNodes, ...roomNodes];

        const positions = new Map();
        const navGraph = new Map();
        const rectWidth = 132;
        const rectHeight = 88;
        const pillRadius = 10;
        const columnSpacing = 190;
        const rowSpacing = 140;

        const desiredColumns = Math.max(anchorNodes.length || 1, Math.ceil(Math.sqrt(Math.max(allNodes.length, 1))));
        const columns = Math.max(3, desiredColumns);

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        let maxRow = 0;
        let maxCol = 0;

        const registerNode = (id) => {
            if (!navGraph.has(id)) {
                navGraph.set(id, new Set());
            }
        };

        const placeNode = (node, col, row) => {
            const x = col * columnSpacing;
            const y = row * rowSpacing;
            positions.set(node.id, { x, y, col, row });
            registerNode(node.id);

            const left = x - rectWidth / 2;
            const right = x + rectWidth / 2;
            const top = y - rectHeight / 2;
            const bottom = y + rectHeight / 2;

            if (left < minX) minX = left;
            if (right > maxX) maxX = right;
            if (top < minY) minY = top;
            if (bottom > maxY) maxY = bottom;
            if (row > maxRow) maxRow = row;
            if (col > maxCol) maxCol = col;
        };

        anchorNodes.forEach((node, index) => {
            placeNode(node, index, 0);
        });

        roomNodes.forEach((node, index) => {
            const row = Math.floor(index / columns) + 1;
            const col = index % columns;
            placeNode(node, col, row);
        });

        positions.forEach((posA, idA) => {
            positions.forEach((posB, idB) => {
                if (idA === idB) return;
                const horizontalNeighbor = posA.row === posB.row && Math.abs(posA.col - posB.col) === 1;
                const verticalNeighbor = posA.col === posB.col && Math.abs(posA.row - posB.row) === 1;
                if (horizontalNeighbor || verticalNeighbor) {
                    navGraph.get(idA).add(idB);
                }
            });
        });

        const gridLines = [];
        for (let c = 0; c <= maxCol + 1; c += 1) {
            const x = c * columnSpacing;
            gridLines.push({
                x1: x,
                y1: -rowSpacing * 0.6,
                x2: x,
                y2: (maxRow + 1) * rowSpacing + rowSpacing * 0.6
            });
        }
        for (let r = 0; r <= maxRow + 1; r += 1) {
            const y = r * rowSpacing;
            gridLines.push({
                x1: -columnSpacing * 0.6,
                y1: y,
                x2: (maxCol + 1) * columnSpacing + columnSpacing * 0.6,
                y2: y
            });
        }

        const margin = 120;
        const width = Math.max(240, (maxX - minX) + margin * 2);
        const height = Math.max(240, (maxY - minY) + margin * 2);
        const viewBox = `${(minX - margin).toFixed(2)} ${(minY - margin).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}`;

        return {
            positions,
            navGraph,
            gridLines,
            viewBox,
            rect: { width: rectWidth, height: rectHeight },
            pillRadius,
            columnSpacing,
            rowSpacing
        };
    }

    prepareLayoutState(worldState = {}) {
        const engine = this.gamification?.worldEngine;
        const layoutFromEngine = engine?.getMazeLayoutState?.();
        const layoutState = layoutFromEngine
            ? this.cloneLayoutState(layoutFromEngine)
            : this.cloneLayoutState(this.createLocalDefaultLayout());

        if (worldState && typeof worldState === 'object') {
            worldState.mazeLayout = this.cloneLayoutState(layoutState);
        }

        return { layoutState };
    }

    createLocalDefaultLayout() {
        return {
            assignments: {},
            slots: {},
            branchState: {},
            lastLayoutAt: null,
            lastLayoutNodeCount: 0,
            lastRebalancedAt: null,
            lastRebalancedNodeCount: 0,
            lastRebalanceAttemptAt: null,
            lastAshResponse: null,
            rebalanceHistory: [],
            pendingArrangement: null,
            lastArrangement: null,
            layoutSeed: 1
        };
    }

    cloneLayoutState(layout = {}) {
        try {
            return JSON.parse(JSON.stringify(layout));
        } catch (error) {
            console.warn('[LibraryExplorerView] Failed to clone maze layout state, using default.', error);
            return JSON.parse(JSON.stringify(this.createLocalDefaultLayout()));
        }
    }

    prioritizeNodesForLayout(nodes = [], worldState = {}) {
        if (!Array.isArray(nodes)) return [];
        const anchorMeta = worldState.anchors || {};
        const roomMeta = worldState.rooms || {};

        const anchors = nodes
            .filter(node => node.type === 'anchor')
            .map(node => ({
                ...node,
                meta: { ...(anchorMeta[node.id] || {}), ...(node.meta || {}) }
            }))
            .sort((a, b) => {
                const unlockedA = a.meta?.unlocked ? 1 : 0;
                const unlockedB = b.meta?.unlocked ? 1 : 0;
                if (unlockedA !== unlockedB) return unlockedB - unlockedA;
                return (a.title || a.id || '').localeCompare(b.title || b.id || '');
            });

        const rooms = nodes
            .filter(node => node.type === 'room')
            .map(node => ({
                ...node,
                meta: { ...(roomMeta[node.id] || {}), ...(node.meta || {}) }
            }))
            .sort((a, b) => {
                const timeA = new Date(a.meta?.createdAt || a.meta?.updatedAt || 0).getTime();
                const timeB = new Date(b.meta?.createdAt || b.meta?.updatedAt || 0).getTime();
                if (timeA && timeB && timeA !== timeB) return timeA - timeB;
                return (a.title || a.id || '').localeCompare(b.title || b.id || '');
            });

        return [...anchors, ...rooms];
    }

    resolveMazeArrangement(prioritizedNodes = [], layoutState = {}) {
        const fallbackArrangement = this.buildDefaultArrangement(prioritizedNodes);
        const result = {
            arrangement: fallbackArrangement,
            meta: {
                appliedPending: false,
                planSummary: null
            }
        };

        if (!prioritizedNodes.length) {
            return result;
        }

        const consumed = this.consumeArrangementPlan(layoutState, prioritizedNodes);
        if (consumed?.arrangement) {
            result.arrangement = consumed.arrangement;
            result.meta.appliedPending = consumed.appliedPending;
            result.meta.planSummary = consumed.summary;
        } else if (layoutState?.lastArrangement) {
            const normalized = this.normalizeArrangementPlan(layoutState.lastArrangement, prioritizedNodes);
            if (normalized) {
                result.arrangement = normalized;
            }
        }

        result.arrangement = this.fillArrangementGaps(result.arrangement, prioritizedNodes);
        return result;
    }

    buildDefaultArrangement(prioritizedNodes = []) {
        const nodeIds = prioritizedNodes.map(node => node.id);
        const coreCount = Math.min(6, nodeIds.length);
        const core = nodeIds.slice(0, coreCount);
        const branches = [];
        let index = coreCount;
        let branchCounter = 0;

        while (index < nodeIds.length) {
            const slice = nodeIds.slice(index, index + 6);
            branches.push({
                nodeIds: slice,
                connectTo: core.length ? core[branchCounter % core.length] : null,
                theme: null,
                label: null,
                source: 'auto',
                key: slice[0] || `branch-${branchCounter}`
            });
            index += 6;
            branchCounter += 1;
        }

        return { core, branches };
    }

    consumeArrangementPlan(layoutState = {}, prioritizedNodes = []) {
        if (!layoutState) return null;
        const plan = layoutState.pendingArrangement || null;
        if (!plan) return null;

        const normalized = this.normalizeArrangementPlan(plan, prioritizedNodes);
        layoutState.pendingArrangement = null;

        if (!normalized) {
            return null;
        }

        return {
            arrangement: normalized,
            appliedPending: true,
            summary: {
                summary: plan.summary || plan.notes || '',
                id: plan.id || null,
                generatedAt: plan.generatedAt || new Date().toISOString()
            }
        };
    }

    normalizeArrangementPlan(plan, prioritizedNodes = []) {
        if (!plan || typeof plan !== 'object') return null;
        const nodeIds = prioritizedNodes.map(node => node.id);
        const nodeSet = new Set(nodeIds);
        const seen = new Set();

        const core = [];
        const coreSource = Array.isArray(plan.core) ? plan.core : [];
        coreSource.forEach(value => {
            const id = String(value);
            if (nodeSet.has(id) && !seen.has(id) && core.length < Math.min(6, nodeIds.length)) {
                core.push(id);
                seen.add(id);
            }
        });

        const branches = [];
        const branchSource = Array.isArray(plan.branches) ? plan.branches : [];
        branchSource.forEach((entry, idx) => {
            const branchEntry = Array.isArray(entry) ? { nodeIds: entry } : entry || {};
            const nodeList = this.sanitizePlanArray(branchEntry.nodeIds);
            const filtered = [];
            nodeList.forEach(value => {
                const id = String(value);
                if (!nodeSet.has(id) || seen.has(id) || filtered.length >= 6) return;
                filtered.push(id);
                seen.add(id);
            });
            if (!filtered.length) return;
            const connectTo = branchEntry.connectTo && nodeSet.has(branchEntry.connectTo) ? branchEntry.connectTo : null;
            branches.push({
                nodeIds: filtered,
                connectTo,
                theme: branchEntry.theme || null,
                label: branchEntry.label || branchEntry.theme || null,
                source: branchEntry.source || 'plan',
                key: branchEntry.label || connectTo || filtered[0] || `branch-${idx}`
            });
        });

        return { core, branches };
    }

    sanitizePlanArray(value) {
        if (!Array.isArray(value)) return [];
        return value
            .map(item => {
                if (typeof item === 'number' || typeof item === 'string') {
                    return String(item);
                }
                return null;
            })
            .filter(Boolean);
    }

    fillArrangementGaps(arrangement = { core: [], branches: [] }, prioritizedNodes = []) {
        const nodeIds = prioritizedNodes.map(node => node.id);
        const nodeSet = new Set(nodeIds);
        const seen = new Set();

        const sanitizedCore = [];
        (arrangement.core || []).forEach(id => {
            if (nodeSet.has(id) && !seen.has(id) && sanitizedCore.length < Math.min(6, nodeIds.length)) {
                sanitizedCore.push(id);
                seen.add(id);
            }
        });

        nodeIds.forEach(id => {
            if (sanitizedCore.length >= Math.min(6, nodeIds.length)) return;
            if (seen.has(id)) return;
            sanitizedCore.push(id);
            seen.add(id);
        });

        const branches = [];
        (arrangement.branches || []).forEach((branch, idx) => {
            const nodeIdsList = Array.isArray(branch.nodeIds) ? branch.nodeIds : [];
            const filtered = [];
            nodeIdsList.forEach(id => {
                if (!nodeSet.has(id) || seen.has(id) || filtered.length >= 6) return;
                filtered.push(id);
                seen.add(id);
            });
            if (!filtered.length) return;
            branches.push({
                nodeIds: filtered,
                connectTo: branch.connectTo && nodeSet.has(branch.connectTo) ? branch.connectTo : null,
                theme: branch.theme || null,
                label: branch.label || null,
                source: branch.source || 'plan',
                key: branch.key || branch.label || branch.connectTo || filtered[0] || `branch-${idx}`
            });
        });

        const remainingQueue = nodeIds.filter(id => !seen.has(id));

        branches.forEach(branch => {
            while (branch.nodeIds.length < 6 && remainingQueue.length) {
                const id = remainingQueue.shift();
                branch.nodeIds.push(id);
                seen.add(id);
            }
        });

        let branchIndex = branches.length;
        let connectionIndex = 0;
        while (remainingQueue.length) {
            const slice = remainingQueue.splice(0, 6);
            branches.push({
                nodeIds: slice,
                connectTo: sanitizedCore.length ? sanitizedCore[connectionIndex % sanitizedCore.length] : null,
                theme: null,
                label: null,
                source: 'auto',
                key: slice[0] || `branch-${branchIndex}`
            });
            branchIndex += 1;
            connectionIndex += 1;
        }

        branches.forEach((branch, idx) => {
            branch.nodeIds = branch.nodeIds.slice(0, 6);
            branch.key = branch.key || branch.label || branch.connectTo || branch.nodeIds[0] || `branch-${idx}`;
        });

        return {
            core: sanitizedCore,
            branches
        };
    }

    calculateHexSize(totalNodes = 0) {
        if (totalNodes > 160) return 32;
        if (totalNodes > 120) return 36;
        if (totalNodes > 80) return 42;
        if (totalNodes > 48) return 48;
        if (totalNodes > 24) return 54;
        if (totalNodes > 12) return 60;
        return 66;
    }

    generateSlotDefinitionsFromArrangement(arrangement, layoutState, hexSize) {
        const slots = [];
        const sequence = [];
        const navigationGraph = new Map();
        const clusterNodeRecords = new Map();
        const clusterLookup = new Map();
        const clusterMembers = new Map();
        const nodeClusterMap = this.buildNodeClusterKeyMap(arrangement);
        const clusterMap = this.assignClusterCoordinates(arrangement, layoutState, nodeClusterMap);

        const addNavEdge = (a, b) => {
            if (!a || !b || a === b) return;
            if (!navigationGraph.has(a)) navigationGraph.set(a, new Set());
            if (!navigationGraph.has(b)) navigationGraph.set(b, new Set());
            navigationGraph.get(a).add(b);
            navigationGraph.get(b).add(a);
        };

        const addClusterSlots = (clusterKey, nodeIds, group, groupIndex) => {
            const clusterInfo = clusterMap.get(clusterKey);
            if (!clusterInfo) return;

            const rotated = this.rotateDirections(this.axialDirections, clusterInfo.orientation || 0);
            const nodeRecords = [];

            nodeIds.forEach((nodeId, idx) => {
                const dir = rotated[idx % rotated.length];
                const axial = {
                    q: clusterInfo.q + dir.q,
                    r: clusterInfo.r + dir.r
                };
                const slotId = `${clusterKey}-q${axial.q}-r${axial.r}`;
                slots.push({
                    id: slotId,
                    q: axial.q,
                    r: axial.r,
                    group,
                    groupIndex,
                    order: idx,
                    clusterKey,
                    orientation: clusterInfo.orientation || 0,
                    key: clusterKey
                });
                sequence.push({
                    slotId,
                    nodeId,
                    group,
                    groupIndex,
                    order: idx
                });
                if (!navigationGraph.has(nodeId)) {
                    navigationGraph.set(nodeId, new Set());
                }
                nodeRecords.push(nodeId);
            });

            const memberList = nodeRecords.slice();
            memberList.forEach((nodeId, index) => {
                clusterLookup.set(nodeId, {
                    clusterKey,
                    index,
                    size: memberList.length,
                    orientation: clusterInfo.orientation || 0
                });
            });

            clusterMembers.set(clusterKey, memberList);
            clusterNodeRecords.set(clusterKey, memberList);
        };

        addClusterSlots('core', arrangement.core, 'core', 0);
        arrangement.branches.forEach((branch, branchIdx) => {
            const key = branch.key || `branch-${branchIdx}`;
            addClusterSlots(key, branch.nodeIds, 'branch', branchIdx + 1);
        });

        // intra-cluster adjacency (ring neighbours)
        clusterNodeRecords.forEach(nodes => {
            const len = nodes.length;
            if (len <= 1) return;
            nodes.forEach((currentId, idx) => {
                const prevId = nodes[(idx - 1 + len) % len];
                const nextId = nodes[(idx + 1) % len];
                if (prevId) addNavEdge(currentId, prevId);
                if (nextId) addNavEdge(currentId, nextId);
            });
        });

        // Connect branches to their anchor point
        arrangement.branches.forEach((branch, branchIdx) => {
            const key = branch.key || `branch-${branchIdx}`;
            const nodes = clusterNodeRecords.get(key) || [];
            const entryNode = nodes[0];
            if (entryNode && branch.connectTo) {
                if (!navigationGraph.has(branch.connectTo)) {
                    navigationGraph.set(branch.connectTo, new Set());
                }
                addNavEdge(entryNode, branch.connectTo);
            }
        });

        return { slots, sequence, clusterMap, navigationGraph, clusterLookup, clusterMembers };
    }

    buildNodeClusterKeyMap(arrangement) {
        const map = new Map();
        arrangement.core.forEach(id => map.set(id, 'core'));
        arrangement.branches.forEach((branch, idx) => {
            const key = branch.key || `branch-${idx}`;
            branch.key = key;
            branch.nodeIds.forEach(id => map.set(id, key));
        });
        return map;
    }

    assignClusterCoordinates(arrangement, layoutState, nodeClusterMap) {
        const clusterSpacing = this.clusterSpacing || 1.6;
        const storedState = layoutState?.branchState || {};
        const clusterMap = new Map();
        const used = new Set();

        const normaliseOrientation = (value) => {
            if (typeof value !== 'number' || Number.isNaN(value)) return 0;
            const mod = value % this.axialDirections.length;
            return mod < 0 ? mod + this.axialDirections.length : mod;
        };

        const registerCluster = (key, rawQ, rawR, orientation = 0) => {
            const id = `${rawQ},${rawR}`;
            used.add(id);
            clusterMap.set(key, {
                rawQ,
                rawR,
                q: rawQ * clusterSpacing,
                r: rawR * clusterSpacing,
                orientation: normaliseOrientation(orientation)
            });
        };

        const coreStored = storedState.core || {};
        const coreRawQ = typeof coreStored.q === 'number' ? coreStored.q : 0;
        const coreRawR = typeof coreStored.r === 'number' ? coreStored.r : 0;
        registerCluster('core', coreRawQ, coreRawR, coreStored.orientation || 0);

        const totalClusters = arrangement.branches.length + 12;
        const spiral = this.generateHexSpiralCoordinates
            ? this.generateHexSpiralCoordinates(totalClusters)
            : this.generateAxialSpiral(totalClusters);
        let spiralIndex = 1;

        const acquireCoordinate = () => {
            while (spiralIndex < spiral.length) {
                const candidate = spiral[spiralIndex++];
                const id = `${candidate.q},${candidate.r}`;
                if (!used.has(id) && !(candidate.q === 0 && candidate.r === 0)) {
                    return candidate;
                }
            }
            const fallback = { q: spiralIndex, r: 0 };
            spiralIndex += 1;
            return fallback;
        };

        arrangement.branches.forEach((branch, idx) => {
            const key = branch.key || `branch-${idx}`;
            const stored = storedState[key] || {};
            let rawQ = typeof stored.q === 'number' ? stored.q : null;
            let rawR = typeof stored.r === 'number' ? stored.r : null;

            if (rawQ === null || rawR === null || used.has(`${rawQ},${rawR}`)) {
                const coord = acquireCoordinate();
                rawQ = coord.q;
                rawR = coord.r;
            } else {
                used.add(`${rawQ},${rawR}`);
            }

            let orientation = typeof stored.orientation === 'number' ? stored.orientation : null;
            if (orientation === null) {
                orientation = this.deriveClusterOrientation(branch, rawQ, rawR, clusterMap, nodeClusterMap);
            }

            registerCluster(key, rawQ, rawR, orientation);
        });

        return clusterMap;
    }

    generateAxialSpiral(count) {
        if (!count || count <= 0) return [];
        const coords = [{ q: 0, r: 0 }];
        if (count === 1) return coords;

        let q = 0;
        let r = 0;
        let radius = 1;
        let directionIndex = 0;

        while (coords.length < count) {
            q += 1;
            coords.push({ q, r });
            if (coords.length >= count) break;

            for (let side = 0; side < 6 && coords.length < count; side++) {
                const dir = this.axialDirections[directionIndex % this.axialDirections.length];
                const steps = side === 0 ? radius - 1 : radius;
                for (let step = 0; step < steps && coords.length < count; step++) {
                    q += dir.q;
                    r += dir.r;
                    coords.push({ q, r });
                }
                directionIndex += 1;
            }

            radius += 1;
        }

        return coords.slice(0, count);
    }

    deriveClusterOrientation(branch, rawQ, rawR, clusterMap, nodeClusterMap) {
        const connectId = branch.connectTo;
        if (!connectId) return 0;
        const clusterKey = nodeClusterMap.get(connectId) || 'core';
        const connectCluster = clusterMap.get(clusterKey);
        if (!connectCluster) return 0;
        const dq = rawQ - connectCluster.rawQ;
        const dr = rawR - connectCluster.rawR;
        if (dq === 0 && dr === 0) return 0;
        return this.directionIndexFromVector(dq, dr);
    }

    rotateDirections(directions, steps = 0) {
        if (!Array.isArray(directions) || !directions.length) return directions || [];
        const len = directions.length;
        const offset = ((steps % len) + len) % len;
        return directions.map((_, idx) => directions[(idx + offset) % len]);
    }

    directionIndexFromVector(q, r) {
        let bestIndex = 0;
        let bestScore = -Infinity;
        this.axialDirections.forEach((dir, idx) => {
            const score = dir.q * q + dir.r * r;
            if (score > bestScore) {
                bestScore = score;
                bestIndex = idx;
            }
        });
        return bestIndex;
    }
    assignNodesToSlots(arrangement, sequence, layoutState) {
        const assignments = new Map();
        const usedSlots = new Set();
        const availableSlots = sequence.map(entry => entry.slotId);
        const availableSet = new Set(availableSlots);
        const existingAssignments = layoutState?.assignments || {};

        Object.entries(existingAssignments).forEach(([nodeId, slotId]) => {
            if (availableSet.has(slotId)) {
                assignments.set(nodeId, slotId);
                usedSlots.add(slotId);
                availableSet.delete(slotId);
            }
        });

        let sequenceIndex = 0;
        const orderedNodeIds = [
            ...arrangement.core,
            ...arrangement.branches.flatMap(branch => branch.nodeIds)
        ];

        orderedNodeIds.forEach(nodeId => {
            if (assignments.has(nodeId)) return;
            while (sequenceIndex < sequence.length) {
                const entry = sequence[sequenceIndex++];
                if (usedSlots.has(entry.slotId)) continue;
                assignments.set(nodeId, entry.slotId);
                usedSlots.add(entry.slotId);
                availableSet.delete(entry.slotId);
                break;
            }
        });

        return assignments;
    }

    computeMazeLayout(assignments, slots, hexSize) {
        const slotLookup = new Map(slots.map(slot => [slot.id, slot]));
        const positions = new Map();

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        let maxRadius = 0;

        assignments.forEach((slotId, nodeId) => {
            const slot = slotLookup.get(slotId);
            if (!slot) return;
            const { x, y } = this.axialToPixel(slot.q, slot.r, hexSize);
            positions.set(nodeId, {
                x,
                y,
                q: slot.q,
                r: slot.r,
                slotId,
                clusterKey: slot.clusterKey || null,
                orientation: slot.orientation ?? 0
            });
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            const radius = this.hexDistance({ q: slot.q, r: slot.r });
            if (radius > maxRadius) maxRadius = radius;
        });

        if (!positions.size) {
            return {
                positions,
                viewBox: '0 0 10 10',
                bounds: null,
                hexSize
            };
        }

        const margin = hexSize * 2.8;
        const width = Math.max(hexSize, (maxX - minX) + margin * 2);
        const height = Math.max(hexSize, (maxY - minY) + margin * 2);
        const viewBox = `${(minX - margin).toFixed(2)} ${(minY - margin).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}`;

        return {
            positions,
            viewBox,
            bounds: { minX, maxX, minY, maxY, margin, maxRadius },
            hexSize
        };
    }

    // Project the maze arrangement into a pseudo-isometric walkway that reads more linearly.
    computeIsometricLayout(arrangement, assignments, slots, orderedNodes, hexSize) {
        const slotLookup = new Map(slots.map(slot => [slot.id, slot]));
        const positions = new Map();
        const gridMap = new Map();

        const tileWidth = Math.max(48, hexSize * 1.25);
        const tileHeight = Math.max(28, hexSize * 0.78);
        const elevation = tileHeight * 0.58;
        const isoScaleX = tileWidth * 0.62;
        const isoScaleY = tileHeight * 0.48;
        const columnSpacing = 2;
        const metrics = { tileWidth, tileHeight, elevation, isoScaleX, isoScaleY };

        const coreNodes = Array.isArray(arrangement?.core) ? arrangement.core : [];
        const gridAssignments = new Map();

        coreNodes.forEach((nodeId, index) => {
            gridAssignments.set(nodeId, {
                col: index * columnSpacing,
                row: 0,
                layer: 'core',
                order: index
            });
        });

        let branchLaneIndex = 0;
        const branchOffsets = new Map();
        const acquireBranchRow = () => {
            const tier = Math.floor(branchLaneIndex / 2) + 1;
            const sign = branchLaneIndex % 2 === 0 ? 1 : -1;
            branchLaneIndex += 1;
            return tier * sign;
        };

        (arrangement?.branches || []).forEach((branch, branchIdx) => {
            if (!branch?.nodeIds?.length) return;
            const branchRow = acquireBranchRow();
            const connectAssignment = branch.connectTo ? gridAssignments.get(branch.connectTo) : null;
            const anchorCol = connectAssignment ? connectAssignment.col : null;
            const offsetKey = anchorCol != null ? `anchor-${branch.connectTo}` : 'floating';
            const offsetIndex = branchOffsets.get(offsetKey) || 0;
            branchOffsets.set(offsetKey, offsetIndex + 1);
            const baseCol = anchorCol != null
                ? anchorCol + 1 + offsetIndex * columnSpacing
                : (coreNodes.length * columnSpacing) + (branchIdx + offsetIndex) * columnSpacing;

            branch.nodeIds.forEach((nodeId, nodeIdx) => {
                gridAssignments.set(nodeId, {
                    col: baseCol + nodeIdx,
                    row: branchRow,
                    layer: 'branch',
                    branchIdx,
                    branchOrder: nodeIdx
                });
            });
        });

        let fallbackColStart = -Infinity;
        gridAssignments.forEach(({ col }) => {
            if (col > fallbackColStart) fallbackColStart = col;
        });
        if (!Number.isFinite(fallbackColStart)) fallbackColStart = 0;
        fallbackColStart += columnSpacing;
        orderedNodes.forEach((node, idx) => {
            if (!node || gridAssignments.has(node.id)) return;
            const row = ((idx % 2) ? -1 : 1) * (Math.floor(idx / 6) + 1);
            gridAssignments.set(node.id, {
                col: fallbackColStart + idx * columnSpacing,
                row,
                layer: 'fallback'
            });
        });

        if (!gridAssignments.size) {
            return {
                positions,
                viewBox: '0 0 10 10',
                bounds: null,
                metrics: { tileWidth, tileHeight, elevation, isoScaleX, isoScaleY },
                grid: gridMap
            };
        }

        let minCol = Infinity;
        let maxCol = -Infinity;
        gridAssignments.forEach(({ col }) => {
            if (col < minCol) minCol = col;
            if (col > maxCol) maxCol = col;
        });
        const colOffset = (minCol + maxCol) / 2;

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        let maxRowMagnitude = 0;

        orderedNodes.forEach(node => {
            if (!node) return;
            const assignment = gridAssignments.get(node.id);
            if (!assignment) return;
            const normalizedCol = assignment.col - colOffset;
            const normalizedRow = assignment.row;
            const coords = this.projectIsometricCoordinates(normalizedCol, normalizedRow, metrics);
            const slotId = assignments.get(node.id);
            const slot = slotId ? slotLookup.get(slotId) : null;
            positions.set(node.id, {
                x: coords.x,
                y: coords.y,
                gridX: assignment.col,
                gridY: assignment.row,
                slotId: slotId || null,
                clusterKey: slot?.clusterKey || null,
                orientation: slot?.orientation ?? 0
            });
            gridMap.set(node.id, { col: assignment.col, row: assignment.row });

            if (coords.x < minX) minX = coords.x;
            if (coords.x > maxX) maxX = coords.x;
            if (coords.y < minY) minY = coords.y;
            if (coords.y > maxY) maxY = coords.y;
            const rowMagnitude = Math.abs(assignment.row);
            if (rowMagnitude > maxRowMagnitude) maxRowMagnitude = rowMagnitude;
        });

        if (!positions.size) {
            return {
                positions,
                viewBox: '0 0 10 10',
                bounds: null,
                metrics,
                grid: gridMap
            };
        }

        const marginX = tileWidth * 2.8;
        const marginY = tileHeight * (2.4 + maxRowMagnitude * 1.1);
        const width = Math.max(tileWidth * 6, (maxX - minX) + marginX * 2);
        const height = Math.max(tileHeight * 6, (maxY - minY) + marginY * 2);
        const viewBox = `${(minX - marginX).toFixed(2)} ${(minY - marginY).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}`;

        return {
            positions,
            viewBox,
            bounds: { minX, maxX, minY, maxY, marginX, marginY },
            metrics,
            grid: gridMap
        };
    }

    projectIsometricCoordinates(col, row, metrics) {
        const isoX = (col - row) * metrics.isoScaleX;
        const isoY = (col + row) * metrics.isoScaleY;
        return { x: isoX, y: isoY };
    }

    buildIsometricDefs() {
        return `
            <defs>
                <linearGradient id="mazeIsoFloorGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="rgba(15, 118, 110, 0.32)"></stop>
                    <stop offset="60%" stop-color="rgba(13, 148, 136, 0.18)"></stop>
                    <stop offset="100%" stop-color="rgba(30, 64, 175, 0.24)"></stop>
                </linearGradient>
                <linearGradient id="mazeIsoStructural" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="rgba(125, 211, 252, 0.55)"></stop>
                    <stop offset="100%" stop-color="rgba(94, 234, 212, 0.32)"></stop>
                </linearGradient>
            </defs>
        `;
    }

    buildIsometricFloor(bounds, metrics) {
        if (!bounds) {
            return `<rect x="-120" y="-120" width="240" height="240" fill="url(#mazeIsoFloorGradient)" opacity="0.45"></rect>`;
        }
        const width = (bounds.maxX - bounds.minX) + bounds.marginX * 2;
        const height = (bounds.maxY - bounds.minY) + bounds.marginY * 1.65;
        const x = bounds.minX - bounds.marginX;
        const y = bounds.minY - bounds.marginY * 0.85;
        const overlayY = y + height * 0.45;
        const overlayHeight = height * 0.65;

        return `
            <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" fill="url(#mazeIsoFloorGradient)" opacity="0.45"></rect>
            <rect x="${x.toFixed(2)}" y="${overlayY.toFixed(2)}" width="${width.toFixed(2)}" height="${overlayHeight.toFixed(2)}" fill="rgba(15, 23, 42, 0.35)"></rect>
        `;
    }

    buildIsometricConnection(from, to, metrics, options = {}) {
        if (!from || !to) return '';
        const startX = Number(from.x.toFixed(2));
        const endX = Number(to.x.toFixed(2));
        const baseYOffset = metrics.tileHeight * 0.55;
        const startY = Number((from.y + baseYOffset).toFixed(2));
        const endY = Number((to.y + baseYOffset).toFixed(2));
        const classes = ['maze-connection', 'isometric'];
        if (options.variant) classes.push(options.variant);
        const className = classes.join(' ');

        if (options.arcLift === 0) {
            return `<path class="${className}" d="M ${startX} ${startY} L ${endX} ${endY}" />`;
        }

        const arcLift = options.arcLift != null ? options.arcLift : 0.32;
        const controlY = Math.min(startY, endY) - metrics.tileHeight * arcLift;
        const midX = Number(((startX + endX) / 2).toFixed(2));
        return `<path class="${className}" d="M ${startX} ${startY} Q ${midX} ${controlY.toFixed(2)} ${endX} ${endY}" />`;
    }

    buildIsometricStructuralConnections(arrangement, positions, metrics) {
        const segments = [];
        const core = arrangement?.core || [];
        for (let i = 0; i < core.length - 1; i += 1) {
            const from = positions.get(core[i]);
            const to = positions.get(core[i + 1]);
            if (!from || !to) continue;
            segments.push(this.buildIsometricConnection(from, to, metrics, { variant: 'structural', arcLift: 0.18 }));
        }

        (arrangement?.branches || []).forEach(branch => {
            if (!branch?.nodeIds?.length) return;
            const branchNodes = branch.nodeIds;
            for (let i = 0; i < branchNodes.length - 1; i += 1) {
                const from = positions.get(branchNodes[i]);
                const to = positions.get(branchNodes[i + 1]);
                if (!from || !to) continue;
                segments.push(this.buildIsometricConnection(from, to, metrics, { variant: 'branch', arcLift: 0 }));
            }

            const entry = positions.get(branchNodes[0]);
            const anchor = branch.connectTo ? positions.get(branch.connectTo) : null;
            if (entry && anchor) {
                segments.push(this.buildIsometricConnection(anchor, entry, metrics, { variant: 'structural', arcLift: 0.28 }));
            }
        });

        return segments.join('');
    }

    // Render stacked isometric tiles (sorted back-to-front) so the 2.5D view layers correctly.
    buildIsometricNodes(orderedNodes, positions, metrics, nodeLookup) {
        if (!positions?.size || !orderedNodes?.length) return '';

        const sorted = [...orderedNodes].sort((a, b) => {
            const posA = positions.get(a.id);
            const posB = positions.get(b.id);
            return (posA?.y || 0) - (posB?.y || 0);
        });

        return sorted
            .map(node => {
                const pos = positions.get(node.id);
                if (!pos) return '';
                const meta = nodeLookup.get(node.id)?.meta || {};
                const isAnchor = node.type === 'anchor';
                const tile = this.buildIsometricTile(pos.x, pos.y, metrics);
                const rawLabel = (node.title || node.id || '').toString();
                const truncated = rawLabel.length > 20 ? `${rawLabel.slice(0, 17)}…` : rawLabel;
                const label = this.escapeHTML(truncated);
                const tooltipParts = [this.escapeHTML(rawLabel)];
                if (meta?.description) tooltipParts.push(this.escapeHTML(meta.description));
                const tooltip = tooltipParts.filter(Boolean).join(' — ');
                const labelY = Number((pos.y + metrics.tileHeight + metrics.elevation * 0.82).toFixed(2));
                const labelFontSize = Math.max(11, Math.min(16, metrics.tileHeight * 0.32));
                const glyphRadius = Math.max(6, Math.min(18, metrics.tileWidth * (isAnchor ? 0.13 : 0.11)));
                const glyphY = Number((pos.y - metrics.tileHeight * 0.18).toFixed(2));
                const glyphClass = isAnchor ? 'anchor' : 'room';

                return `
                    <g class="maze-node isometric ${glyphClass}" data-node-id="${node.id}" title="${tooltip}">
                        <polygon class="maze-node-iso-side maze-node-iso-side-left" points="${tile.left}"></polygon>
                        <polygon class="maze-node-iso-side maze-node-iso-side-right" points="${tile.right}"></polygon>
                        <polygon class="maze-node-iso-top ${glyphClass}" points="${tile.top}"></polygon>
                        <circle class="maze-node-iso-glyph ${glyphClass}" cx="${pos.x.toFixed(2)}" cy="${glyphY}" r="${glyphRadius.toFixed(2)}"></circle>
                        <text class="maze-node-label isometric" x="${pos.x.toFixed(2)}" y="${labelY}" font-size="${labelFontSize.toFixed(1)}" text-anchor="middle">${label}</text>
                    </g>
                `;
            })
            .join('');
    }

    buildIsometricTile(cx, cy, metrics) {
        const halfWidth = metrics.tileWidth / 2;
        const halfHeight = metrics.tileHeight / 2;
        const depth = metrics.elevation;

        const top = [
            [cx, cy - halfHeight],
            [cx + halfWidth, cy],
            [cx, cy + halfHeight],
            [cx - halfWidth, cy]
        ];

        const right = [
            [cx + halfWidth, cy],
            [cx, cy + halfHeight],
            [cx, cy + halfHeight + depth],
            [cx + halfWidth, cy + depth]
        ];

        const left = [
            [cx - halfWidth, cy],
            [cx, cy + halfHeight],
            [cx, cy + halfHeight + depth],
            [cx - halfWidth, cy + depth]
        ];

        return {
            top: this.pointsToString(top),
            right: this.pointsToString(right),
            left: this.pointsToString(left)
        };
    }

    pointsToString(points = []) {
        return points
            .map(point => {
                const [x, y] = point;
                return `${Number(x).toFixed(2)},${Number(y).toFixed(2)}`;
            })
            .join(' ');
    }

    persistMazeLayout(assignments, slots, arrangement, layoutState, meta = {}, clusterMap = new Map()) {
        const engine = this.gamification?.worldEngine;
        if (!engine?.updateMazeLayout) return;

        const assignmentsObj = {};
        assignments.forEach((slotId, nodeId) => {
            assignmentsObj[nodeId] = slotId;
        });

        const slotsObj = {};
        slots.forEach(slot => {
            slotsObj[slot.id] = {
                q: slot.q,
                r: slot.r,
                group: slot.group,
                groupIndex: slot.groupIndex,
                order: slot.order,
                clusterKey: slot.clusterKey || null,
                orientation: slot.orientation ?? 0,
                key: slot.clusterKey || null
            };
        });

        const existingAssignments = layoutState?.assignments || {};
        const existingSlots = layoutState?.slots || {};
        const existingBranchState = layoutState?.branchState || {};

        const branchState = {};
        const coreInfo = clusterMap.get('core');
        if (coreInfo) {
            branchState.core = {
                q: coreInfo.rawQ,
                r: coreInfo.rawR,
                orientation: coreInfo.orientation || 0,
                size: arrangement.core.length
            };
        } else if (existingBranchState.core) {
            branchState.core = { ...existingBranchState.core };
        }

        arrangement.branches.forEach((branch, idx) => {
            const key = branch.key || `branch-${idx}`;
            const info = clusterMap.get(key);
            branchState[key] = {
                q: info ? info.rawQ : idx + 1,
                r: info ? info.rawR : 0,
                orientation: info ? info.orientation || 0 : 0,
                size: branch.nodeIds.length,
                connectTo: branch.connectTo || null,
                theme: branch.theme || null,
                label: branch.label || null
            };
        });
        const assignmentsChanged = JSON.stringify(assignmentsObj) !== JSON.stringify(existingAssignments);
        const slotsChanged = JSON.stringify(slotsObj) !== JSON.stringify(existingSlots);
        const branchStateChanged = JSON.stringify(branchState) !== JSON.stringify(existingBranchState);
        const metaChanged = !!(meta.appliedPending || meta.pendingSummary);

        if (!assignmentsChanged && !slotsChanged && !branchStateChanged && !metaChanged) {
            return;
        }

        const payload = {
            assignments: assignmentsObj,
            slots: slotsObj,
            branchState,
            lastArrangement: {
                generatedAt: new Date().toISOString(),
                core: arrangement.core,
                branches: arrangement.branches.map(branch => ({
                    nodeIds: branch.nodeIds,
                    connectTo: branch.connectTo || null,
                    theme: branch.theme || null,
                    label: branch.label || null
                })),
                clusters: Array.from(clusterMap.entries()).map(([key, info]) => ({
                    key,
                    q: info.rawQ,
                    r: info.rawR,
                    orientation: info.orientation || 0
                }))
            },
            lastLayoutNodeCount: meta.totalNodes || arrangement.core.length + arrangement.branches.reduce((sum, branch) => sum + branch.nodeIds.length, 0),
            lastLayoutAt: new Date().toISOString()
        };

        if (meta.appliedPending) {
            payload.pendingArrangement = null;
        }

        if (meta.pendingSummary) {
            payload.lastAshResponse = {
                summary: meta.pendingSummary.summary || '',
                arrangementId: meta.pendingSummary.id || null,
                generatedAt: meta.pendingSummary.generatedAt || new Date().toISOString()
            };
        }

        engine.updateMazeLayout(payload);

        if (meta.pendingSummary && typeof engine.recordMazeRebalance === 'function') {
            engine.recordMazeRebalance({
                summary: meta.pendingSummary.summary || '',
                nodeCount: payload.lastLayoutNodeCount,
                arrangement: payload.lastArrangement,
                lastAshResponse: payload.lastAshResponse || null
            });
        }

        if (layoutState) {
            layoutState.assignments = assignmentsObj;
            layoutState.slots = slotsObj;
            layoutState.branchState = branchState;
            layoutState.lastArrangement = payload.lastArrangement;
            layoutState.lastLayoutNodeCount = payload.lastLayoutNodeCount;
            layoutState.lastLayoutAt = payload.lastLayoutAt;
            if (meta.appliedPending) {
                layoutState.pendingArrangement = null;
            }
            if (meta.pendingSummary) {
                layoutState.lastAshResponse = payload.lastAshResponse;
                layoutState.lastRebalancedAt = payload.lastArrangement.generatedAt;
                layoutState.lastRebalancedNodeCount = payload.lastLayoutNodeCount;
            }
        }
    }

    maybeTriggerMazeRebalance(worldState, nodes, layoutState) {
        const companion = this.gamification?.aiCompanion;
        if (!companion || typeof companion.callAIService !== 'function') return;
        if (this.rebalanceInFlight) return;

        const totalNodes = Array.isArray(nodes) ? nodes.length : 0;
        if (totalNodes < 12) return;

        const now = Date.now();
        const lastAttempt = layoutState?.lastRebalanceAttemptAt ? Date.parse(layoutState.lastRebalanceAttemptAt) : 0;
        if (now - lastAttempt < 1000 * 60 * 15) return;

        const lastRebalancedAt = layoutState?.lastRebalancedAt ? Date.parse(layoutState.lastRebalancedAt) : 0;
        const nodesSince = Math.max(0, totalNodes - (layoutState?.lastRebalancedNodeCount || 0));

        let shouldAttempt = false;
        if (!lastRebalancedAt) {
            shouldAttempt = totalNodes >= 12;
        } else if (now - lastRebalancedAt > 1000 * 60 * 60 * 12) {
            shouldAttempt = true;
        } else if (nodesSince >= 6) {
            shouldAttempt = true;
        } else if (nodesSince >= 3 && now - lastAttempt > 1000 * 60 * 60 * 4) {
            shouldAttempt = Math.random() < 0.25;
        }

        if (!shouldAttempt) return;

        this.rebalanceInFlight = true;
        const attemptStamp = new Date().toISOString();
        this.gamification?.worldEngine?.updateMazeLayout?.({
            lastRebalanceAttemptAt: attemptStamp
        });
        if (layoutState) {
            layoutState.lastRebalanceAttemptAt = attemptStamp;
        }

        setTimeout(() => {
            this.requestMazeRebalance(worldState, nodes, layoutState)
                .catch(error => console.error('[LibraryExplorerView] Maze rebalance failed:', error))
                .finally(() => {
                    this.rebalanceInFlight = false;
                });
        }, 20);
    }

    buildMazeSnapshot(worldState, nodes, layoutState) {
        const anchors = worldState.anchors || {};
        const rooms = worldState.rooms || {};
        const corridors = Array.isArray(worldState.corridors) ? worldState.corridors : [];

        const nodeDetails = nodes.map(node => {
            const meta = node.type === 'anchor' ? anchors[node.id] || {} : rooms[node.id] || {};
            return {
                id: node.id,
                title: node.title || node.id,
                type: node.type,
                description: meta.description || '',
                tags: Array.isArray(meta.thematicTags) ? meta.thematicTags : [],
                anchor: meta.anchor || null,
                unlocked: !!meta.unlocked,
                createdAt: meta.createdAt || null,
                updatedAt: meta.updatedAt || null
            };
        });

        const adjacency = {};
        corridors.forEach(({ from, to }) => {
            if (!adjacency[from]) adjacency[from] = [];
            if (!adjacency[to]) adjacency[to] = [];
            adjacency[from].push(to);
            adjacency[to].push(from);
        });

        return {
            generatedAt: new Date().toISOString(),
            nodes: nodeDetails,
            corridors,
            adjacency,
            layout: {
                assignments: layoutState?.assignments || {},
                slots: layoutState?.slots || {},
                lastArrangement: layoutState?.lastArrangement || null,
                branchState: layoutState?.branchState || {}
            }
        };
    }

    async requestMazeRebalance(worldState, nodes, layoutState) {
        const companion = this.gamification?.aiCompanion;
        if (!companion || typeof companion.callAIService !== 'function') return;

        const snapshot = this.buildMazeSnapshot(worldState, nodes, layoutState);

        const prompt = `
You are Ash, an adaptive curator responsible for arranging a hexagonal maze of anchors and rooms.
Each hexagon contains up to six nodes. The first hexagon (the core) should hold the six most foundational nodes.
Additional hexagons branch outward from core nodes. When a branch hexagon is full, the next branch should start from the next core node.
Group rooms by semantic proximity and ensure the traversal feels coherent.

Current maze snapshot (JSON):
${JSON.stringify(snapshot, null, 2)}

Produce a rebalance plan in strict JSON with the following shape:
{
  "summary": "short sentence about the new grouping",
  "core": ["nodeId1", "nodeId2", "... up to 6"],
  "branches": [
    {
      "connectTo": "nodeId already assigned in an earlier group or null",
      "theme": "optional short phrase for the branch",
      "nodeIds": ["nodeId", "... up to 6"]
    }
  ]
}

window.LibraryExplorerView = LibraryExplorerView;

Rules:
- Use only node ids that appear in the snapshot.
- Do not duplicate node ids.
- Branch lists may contain fewer than six ids if insufficient nodes remain.
- Prefer keeping anchors in the core when possible.
- Respond with JSON only (no extra commentary).
        `.trim();

        const response = await companion.callAIService(prompt, {
            context: 'maze_rebalance',
            newConversation: true
        });

        if (!response?.message) {
            console.warn('[LibraryExplorerView] Ash returned no message for maze rebalance.');
            return;
        }

        const plan = this.parseRebalancePlan(response.message);
        if (!plan) {
            console.warn('[LibraryExplorerView] Failed to parse Ash maze rebalance response.');
            return;
        }

        const normalized = this.normalizeRebalancePlan(plan, nodes);
        if (!normalized) {
            console.warn('[LibraryExplorerView] Normalized maze rebalance plan was empty.');
            return;
        }

        const pendingArrangement = {
            core: normalized.core,
            branches: normalized.branches,
            summary: plan.summary || '',
            id: plan.id || null,
            generatedAt: new Date().toISOString()
        };

        this.gamification?.worldEngine?.updateMazeLayout?.({
            pendingArrangement,
            lastRebalancedNodeCount: nodes.length,
            lastAshResponse: {
                summary: plan.summary || '',
                arrangementId: plan.id || null,
                generatedAt: pendingArrangement.generatedAt
            }
        });

        this.signalActivity('maze');

        if (layoutState) {
            layoutState.pendingArrangement = pendingArrangement;
            layoutState.lastRebalancedNodeCount = nodes.length;
            layoutState.lastAshResponse = {
                summary: plan.summary || '',
                arrangementId: plan.id || null,
                generatedAt: pendingArrangement.generatedAt
            };
        }

        this.setStatus('Ash is reweaving the labyrinth…', { temporary: true, duration: 2600 });
    }

    parseRebalancePlan(message) {
        try {
            const trimmed = String(message || '').trim();
            const start = trimmed.indexOf('{');
            const end = trimmed.lastIndexOf('}');
            if (start === -1 || end === -1) return null;
            const json = trimmed.slice(start, end + 1);
            return JSON.parse(json);
        } catch (error) {
            console.error('[LibraryExplorerView] Failed to parse maze rebalance JSON:', error);
            return null;
        }
    }

    normalizeRebalancePlan(plan, nodes) {
        const normalized = this.normalizeArrangementPlan(plan, nodes);
        if (!normalized) return null;
        return this.fillArrangementGaps(normalized, nodes);
    }

    computeAxialAngle(coord = { q: 0, r: 0 }) {
        const { x, y } = this.axialToPixel(coord.q, coord.r, 1);
        return Math.atan2(y, x);
    }

    axialToPixel(q, r, hexSize) {
        const x = Math.sqrt(3) * hexSize * (q + r / 2);
        const y = 1.5 * hexSize * r;
        return { x, y };
    }

    buildHexBackdrop(bounds, hexSize) {
        if (!bounds) return '';
        const { maxRadius } = bounds;
        if (!maxRadius || maxRadius < 1) return '';

        const rings = [];
        const ringCount = Math.ceil(maxRadius) + 1;
        for (let radius = 1; radius <= ringCount; radius++) {
            const radiusSize = hexSize * radius * 1.08;
            const points = this.buildHexPoints(0, 0, radiusSize);
            rings.push(`<polygon points="${points}"></polygon>`);
        }

        return rings.join('');
    }

    buildMazePath(from, to, hexSize, corridor) {
        if (!from || !to) return '';
        const x1 = Number(from.x.toFixed(2));
        const y1 = Number(from.y.toFixed(2));
        const x2 = Number(to.x.toFixed(2));
        const y2 = Number(to.y.toFixed(2));

        if (x1 === x2 && y1 === y2) return '';

        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.hypot(dx, dy) || 1;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const normX = dx / length;
        const normY = dy / length;
        const perpX = -normY;
        const perpY = normX;
        const key = corridor?.id || `${corridor?.from || ''}-${corridor?.to || ''}`;
        const hash = key.split('').reduce((acc, char) => (acc * 33 + char.charCodeAt(0)) % 97, 7);
        const direction = hash % 2 === 0 ? 1 : -1;
        const offset = hexSize * (0.35 + (hash % 11) / 100);
        const controlX = midX + perpX * offset * direction;
        const controlY = midY + perpY * offset * direction;

        return `M ${x1} ${y1} Q ${controlX.toFixed(2)} ${controlY.toFixed(2)} ${x2} ${y2}`;
    }

    buildHexPoints(cx, cy, radius) {
        const points = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 180) * (60 * i - 30);
            const x = cx + radius * Math.cos(angle);
            const y = cy + radius * Math.sin(angle);
            points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
        }
        return points.join(' ');
    }

    hexDistance(coord, origin = { q: 0, r: 0 }) {
        const aq = coord?.q ?? 0;
        const ar = coord?.r ?? 0;
        const as = -aq - ar;
        const bq = origin?.q ?? 0;
        const br = origin?.r ?? 0;
        const bs = -bq - br;
        return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
    }

    setStatus(message, options = {}) {
        const { temporary = false, duration = 1800 } = options;
        this.baseStatus = temporary ? this.baseStatus : message;

        if (!this.container) return;
        const statusEl = this.container.querySelector('#le-status-indicator');
        if (!statusEl) return;

        if (temporary) {
            this.transientActive = true;
            statusEl.textContent = message;
            statusEl.classList.add('pulsing');
            clearTimeout(this.transientTimeout);
            this.transientTimeout = setTimeout(() => {
                statusEl.classList.remove('pulsing');
                this.transientActive = false;
                statusEl.textContent = this.baseStatus;
            }, duration);
        } else if (!this.transientActive) {
            statusEl.textContent = message;
        }
    }

    toggleVisibility() {
        const container = this.ensureContainer();
        if (!container) return false;
        container.classList.toggle('le-hidden');
        return !container.classList.contains('le-hidden');
    }

    signalActivity(type, detail) {
        const container = this.ensureContainer();
        if (!container) return;

        const mazeCanvas = container.querySelector('.maze-canvas');
        const pulseCard = container.querySelector('.le-pulse');

        const applyTemporaryStatus = (message, duration) => {
            this.setStatus(message, { temporary: true, duration });
        };

        switch (type) {
            case 'typing':
                container.classList.add('le-typing');
                applyTemporaryStatus('Scribing new fragments…', 900);
                clearTimeout(this.typingTimeout);
                this.typingTimeout = setTimeout(() => {
                    container.classList.remove('le-typing');
                }, 950);
                if (pulseCard) {
                    pulseCard.classList.add('pulse-active');
                    setTimeout(() => pulseCard.classList.remove('pulse-active'), 600);
                }
                break;
            case 'event':
                if (mazeCanvas) {
                    mazeCanvas.classList.add('maze-pulse');
                    setTimeout(() => mazeCanvas.classList.remove('maze-pulse'), 1200);
                }
                applyTemporaryStatus(this.describeEvent(detail), 1800);
                if (pulseCard) {
                    pulseCard.classList.add('pulse-active');
                    setTimeout(() => pulseCard.classList.remove('pulse-active'), 1200);
                }
                break;
            case 'maze':
                applyTemporaryStatus('The labyrinth rearranges itself…', 2200);
                if (mazeCanvas) {
                    mazeCanvas.classList.add('maze-pulse');
                    setTimeout(() => mazeCanvas.classList.remove('maze-pulse'), 1600);
                }
                if (pulseCard) {
                    pulseCard.classList.add('pulse-active');
                    setTimeout(() => pulseCard.classList.remove('pulse-active'), 1400);
                }
                break;
            default:
                break;
        }
    }

    describeEvent(event) {
        if (!event || !event.type) return 'The stacks whisper.';
        switch (event.type) {
            case 'session.started':
                return 'A new vigil begins in the stacks.';
            case 'session.completed':
                return 'Session etched into the ledger.';
            case 'session.discarded':
                return 'A fleeting attempt fades.';
            case 'flow.entered':
                return 'The Atrium hums with flow.';
            case 'flow.completed':
                return 'Flow echoes settle in the halls.';
            case 'focus.started':
                return 'Focus lanterns ignite.';
            case 'focus.completed':
                return 'Focus ritual concluded.';
            case 'resource.minted':
                return 'Resources resonate through the archive.';
            case 'world.architectureApplied':
                return 'New corridors unfurl.';
            default:
                return 'The archive stirs.';
        }
    }

    renderPulse(snippet, pulse = {}) {
        const pulseCard = this.container?.querySelector('#le-pulse');
        if (!pulseCard) return;

        const { wordsRemaining = 0, shardInterval = 30, shardsPerInterval = 12, lastMilestoneAt = null } = pulse;
        const countEl = pulseCard.querySelector('.pulse-count');
        const snippetEl = pulseCard.querySelector('.pulse-snippet-text');

        if (countEl) {
            const remaining = Math.max(wordsRemaining, 0);
            const justHarvested = lastMilestoneAt && (Date.now() - lastMilestoneAt < 1800);
            const message = justHarvested
                ? `Shard harvested! (+${shardsPerInterval})`
                : `${remaining} words to next shard (+${shardsPerInterval})`;
            countEl.textContent = message;
            this.updateProgressStatus(
                justHarvested ? `Shard harvested! (+${shardsPerInterval})` : `Next shard in ${remaining} words`,
                { notify: !!justHarvested }
            );
        }

        if (snippetEl) {
            const displaySnippet = snippet ? this.escapeHTML(snippet).replace(/\n+/g, '\n') : 'Begin typing to awaken the stacks.';
            snippetEl.innerHTML = displaySnippet;
        }

        if (lastMilestoneAt && Date.now() - lastMilestoneAt < 2000) {
            pulseCard.classList.add('pulse-active');
            setTimeout(() => pulseCard.classList.remove('pulse-active'), 1600);
        }
    }

    setLinkSuggestionState(update = {}) {
        const prev = this.linkSuggestionState || { nodeId: null, status: 'idle', items: [], message: '' };
        const hasNodeId = Object.prototype.hasOwnProperty.call(update, 'nodeId');
        const nodeId = hasNodeId ? update.nodeId : prev.nodeId;
        let items;
        if (Object.prototype.hasOwnProperty.call(update, 'items')) {
            items = Array.isArray(update.items) ? update.items : [];
        } else if (nodeId !== prev.nodeId) {
            items = [];
        } else {
            items = Array.isArray(prev.items) ? prev.items : [];
        }
        const status = update.status || (nodeId === prev.nodeId ? prev.status : 'idle');
        const message = Object.prototype.hasOwnProperty.call(update, 'message')
            ? (update.message || '')
            : (nodeId === prev.nodeId ? prev.message || '' : '');
        this.linkSuggestionState = { nodeId, status, items, message };
        this.renderLinkSuggestions();
    }

    renderLinkSuggestions() {
        const listEl = this.container?.querySelector('#le-links .links-list');
        if (!listEl) return;

        if (!this.selectedNodeId) {
            listEl.innerHTML = '<div class="links-placeholder">Select a node to let Ash propose new corridors.</div>';
            return;
        }

        const state = this.linkSuggestionState || {};
        if (state.nodeId !== this.selectedNodeId) {
            listEl.innerHTML = '<div class="links-placeholder">Ash is aligning new constellations…</div>';
            return;
        }

        const status = state.status || 'idle';
        if (status === 'loading') {
            listEl.innerHTML = '<div class="links-placeholder">Ash studies the stacks for untethered echoes…</div>';
            return;
        }
        if (status === 'error') {
            const message = state.message || 'Ash could not surface any corridors.';
            listEl.innerHTML = `<div class="links-placeholder">${this.escapeHTML(message)}</div>`;
            return;
        }
        if (status === 'empty' || !Array.isArray(state.items) || !state.items.length) {
            listEl.innerHTML = '<div class="links-placeholder">No new corridors revealed yet.</div>';
            return;
        }

        const markup = state.items
            .map(entry => {
                const targetId = entry.targetId || entry.id || '';
                const label = this.escapeHTML(entry.targetLabel || targetId);
                const rationale = this.escapeHTML(entry.rationale || 'Ash hinted without elaboration.');
                const relation = entry.relation ? `<span class="link-relation">${this.escapeHTML(entry.relation)}</span>` : '';
                const confidence = entry.confidence ? `<span class="link-confidence">${this.escapeHTML(entry.confidence)}</span>` : '';
                const badges = [relation, confidence].filter(Boolean).join(' ');
                const actionLabel = entry.available ? 'Traverse' : 'Open';
                const attrs = entry.available ? '' : ' data-missing="true"';
                return `
                    <div class="links-item"${attrs}>
                        <div class="link-target">
                            <span>${label}</span>
                            ${badges}
                        </div>
                        <div class="link-rationale">${rationale}</div>
                        <div class="link-actions">
                            <button type="button" data-link-target="${this.escapeHTML(targetId)}" data-link-label="${label}">${actionLabel}</button>
                        </div>
                    </div>
                `;
            })
            .join('');

        listEl.innerHTML = markup;
    }

    async handleFollowAshLink() {
        if (this.followAshInFlight) return;
        if (!this.selectedNodeId) {
            this.setStatus('Select a node to follow Ash.', { temporary: true, duration: 1800 });
            return;
        }

        const state = this.linkSuggestionState || {};
        if (state.nodeId !== this.selectedNodeId || !Array.isArray(state.items) || !state.items.length) {
            this.setStatus('Ash offers no corridor here yet.', { temporary: true, duration: 2000 });
            return;
        }

        const suggestion = state.items[0];
        const currentNode = this.nodeMap?.get(this.selectedNodeId);
        if (!currentNode || !currentNode.path) {
            this.setStatus('Current node cannot be scribed directly.', { temporary: true, duration: 2000 });
            return;
        }

        const sourcePath = currentNode.path;
        const targetId = suggestion.targetId || suggestion.id;
        if (!targetId) {
            this.setStatus('Ash did not name the destination.', { temporary: true, duration: 2000 });
            return;
        }

        const targetNode = this.nodeMap?.get(targetId);
        const rawLabel = suggestion.targetLabel || this.getNodeDisplayLabel(targetNode) || targetId;
        const targetLabel = rawLabel ? rawLabel.replace(/\s+/g, ' ').trim() : targetId;

        if (!window?.electronAPI?.invoke) {
            this.setStatus('File bridge unavailable in this environment.', { temporary: true, duration: 2200 });
            return;
        }

        const payload = {
            sourcePath,
            targetId,
            targetLabel
        };

        this.followAshInFlight = true;
        this.setStatus('Scribing Ash’s corridor…', { temporary: true, duration: 2000 });

        try {
            const result = await window.electronAPI.invoke('library.append-internal-link', payload);
            if (!result?.success && !result?.alreadyExists) {
                const message = result?.error || 'Failed to inscribe corridor.';
                this.setStatus(message, { temporary: true, duration: 2200 });
                return;
            }

            if (result.alreadyExists) {
                this.setStatus('Corridor already etched into the stacks.', { temporary: true, duration: 2200 });
            } else {
                const sourceLabel = this.getNodeDisplayLabel(currentNode) || currentNode.name || currentNode.id;
                this.pushNarrativeEntry(`Ash inscribes a link from ${sourceLabel} to ${targetLabel}.`, { source: 'ash' });
                this.setStatus('Corridor inscribed.', { temporary: true, duration: 2000 });
            }

            this.ashLinkSuggestionCache.delete(this.selectedNodeId);
            this.setLinkSuggestionState({
                nodeId: this.selectedNodeId,
                status: 'idle',
                items: [],
                message: ''
            });

            const currentGraphNode = this.nodeMap?.get(this.selectedNodeId);
            if (currentGraphNode) {
                this.scheduleAshLinkSuggestions(currentGraphNode, { source: 'ash-link' });
            }
            this.scheduleNetworkSync({ immediate: true });
            this.configureOrientationForNode(this.selectedNodeId, this.lastVisitedNodeId, {
                preserveForward: true,
                fallbackVector: this.orientationVector
            });
        } catch (error) {
            console.error('[LibraryExplorerView] Failed to follow Ash link:', error);
            this.setStatus('Ash’s corridor failed to materialize.', { temporary: true, duration: 2200 });
        } finally {
            this.followAshInFlight = false;
        }
    }

    handleRecenterView() {
        if (this.selectedNodeId && this.networkInstance?.requestFocusOnNode) {
            this.networkInstance.requestFocusOnNode(this.selectedNodeId, { preserveScale: false, immediate: false });
            this.setStatus('Constellation recentred.', { temporary: true, duration: 1500 });
        } else if (this.networkInstance?.centerView) {
            this.networkInstance.centerView();
        }
    }

    scheduleAshLinkSuggestions(currentNode, context = {}) {
        if (!currentNode || !currentNode.id) return;
        const nodeId = currentNode.id;

        if (this.ashLinkSuggestionCache?.has(nodeId)) {
            const cached = this.ashLinkSuggestionCache.get(nodeId) || [];
            this.updateLinkSuggestions(nodeId, cached, { fromCache: true });
            return;
        }

        const companion = this.gamification?.aiCompanion || window.aiCompanion;
        if (!companion || typeof companion.callAIService !== 'function') {
            this.setLinkSuggestionState({
                nodeId,
                status: 'error',
                items: [],
                message: 'Ash is offline, unable to map new corridors.'
            });
            return;
        }

        if (this.ashLinkInFlight && this.linkSuggestionState?.nodeId === nodeId) {
            this.setLinkSuggestionState({
                nodeId,
                status: 'loading',
                items: [],
                message: ''
            });
            return;
        }

        if (this.ashLinkTimer) {
            clearTimeout(this.ashLinkTimer);
            this.ashLinkTimer = null;
        }

        const now = Date.now();
        let delay = 600;
        if (this.lastLinkSuggestionAt) {
            const elapsed = now - this.lastLinkSuggestionAt;
            if (elapsed < this.ashLinkCooldown) {
                delay = this.ashLinkCooldown - elapsed + 300;
            }
        }

        this.setLinkSuggestionState({
            nodeId,
            status: 'loading',
            items: [],
            message: ''
        });

        this.ashLinkTimer = setTimeout(() => {
            this.ashLinkTimer = null;
            this.requestAshLinkSuggestions(currentNode, context);
        }, delay);
    }

    async requestAshLinkSuggestions(currentNode, context = {}) {
        if (!currentNode || !currentNode.id) return;
        const nodeId = currentNode.id;
        const companion = this.gamification?.aiCompanion || window.aiCompanion;
        if (!companion || typeof companion.callAIService !== 'function') {
            this.setLinkSuggestionState({
                nodeId,
                status: 'error',
                items: [],
                message: 'Ash is offline, unable to map new corridors.'
            });
            return;
        }

        if (this.ashLinkInFlight) {
            if (this.ashLinkTimer) {
                clearTimeout(this.ashLinkTimer);
                this.ashLinkTimer = null;
            }
            this.ashLinkTimer = setTimeout(() => {
                this.requestAshLinkSuggestions(currentNode, context);
            }, 600);
            return;
        }

        const prompt = this.buildAshLinkPrompt(currentNode);
        if (!prompt) {
            this.setLinkSuggestionState({
                nodeId,
                status: 'empty',
                items: [],
                message: 'No unmapped candidates surround this node.'
            });
            return;
        }

        this.ashLinkInFlight = true;
        try {
            const response = await companion.callAIService(prompt, {
                context: 'library.constellation-links',
                temperature: 0.45
            });

            const suggestions = this.extractAshLinkSuggestions(response, nodeId);
            if (suggestions == null) {
                this.setLinkSuggestionState({
                    nodeId,
                    status: 'error',
                    items: [],
                    message: 'Ash returned an unreadable corridor map.'
                });
            } else if (suggestions.length) {
                this.ashLinkSuggestionCache.set(nodeId, suggestions);
                this.lastLinkSuggestionAt = Date.now();
                this.updateLinkSuggestions(nodeId, suggestions, { fromCache: false });
            } else {
                this.setLinkSuggestionState({
                    nodeId,
                    status: 'empty',
                    items: [],
                    message: 'Ash found no convincing corridors.'
                });
            }
        } catch (error) {
            console.warn('[LibraryExplorerView] Ash link suggestion request failed:', error);
            this.setLinkSuggestionState({
                nodeId,
                status: 'error',
                items: [],
                message: 'Ash could not trace new corridors just now.'
            });
        } finally {
            this.ashLinkInFlight = false;
        }
    }

    buildAshLinkPrompt(currentNode) {
        if (!currentNode) return '';

        const currentLabel = this.getNodeDisplayLabel(currentNode);
        const role = currentNode.libraryMeta?.role || currentNode.type || 'node';
        const description = this.truncateNarrativeText(
            currentNode.libraryMeta?.description ||
            currentNode.libraryMeta?.summary ||
            currentNode.description ||
            currentNode.summary ||
            '',
            220
        ) || 'No direct description.';

        const tags = Array.isArray(currentNode.libraryMeta?.tags) && currentNode.libraryMeta.tags.length
            ? currentNode.libraryMeta.tags.join(', ')
            : 'none';

        const neighborIds = Array.from(this.adjacency?.get(currentNode.id) || []);
        const neighborSummaries = neighborIds
            .map(id => {
                const node = this.nodeMap?.get(id);
                if (!node) return null;
                const label = this.getNodeDisplayLabel(node);
                const relation = node.libraryMeta?.role || node.type || 'node';
                return `${label} (${relation})`;
            })
            .filter(Boolean);

        const candidatePool = this.collectLinkCandidates(currentNode, neighborIds);
        if (!candidatePool.length) return '';

        const candidateList = candidatePool
            .slice(0, 12)
            .map((entry, index) => {
                const parts = [
                    `${index + 1}. ${entry.label} (id: ${entry.id})`,
                    `role: ${entry.role}`,
                    `tags: ${entry.tags || 'none'}`,
                    `distance: ${entry.distance || 'unknown'}`
                ];
                const summary = entry.description ? `summary: ${entry.description}` : '';
                if (summary) parts.push(summary);
                return parts.join('; ');
            })
            .join('\n');

        const liveSnippet = this.truncateNarrativeText(this.gamification?.liveProgress?.recentSnippet || '', 160);
        const ledger = this.gamification?.resourceLedger || {};
        const ledgerSummary = `Shards ${ledger.lexiconShards ?? 0}, Sigils ${ledger.catalogueSigils ?? 0}, Tokens ${ledger.architectTokens ?? 0}`;

        return `You are Ash, spectral cartographer of the library.
Current node: ${currentLabel} (id: ${currentNode.id}, role: ${role})
Description: ${description}
Tags: ${tags}
Existing neighbors: ${neighborSummaries.length ? neighborSummaries.join('; ') : 'none'}

Candidate nodes (id, metadata):
${candidateList}

Recent writing fragment: ${liveSnippet || 'No fresh fragment available.'}
Resource ledger: ${ledgerSummary}

Task: propose up to three new corridors from the current node to nodes in the candidate list that are not already directly linked. Prefer thematically rich, non-trivial connections that could deepen the writer's navigation.

Respond with JSON only, following this shape:
{
  "suggestions": [
    {
      "targetId": "candidate-node-id",
      "targetLabel": "Readable name",
      "relation": "short phrase for the connection (e.g. thematic, supporting evidence)",
      "rationale": "One sentence explaining why this corridor matters.",
      "confidence": "optional brief confidence note"
    }
  ]
}

Only reference node ids from the candidate list, avoid duplicates, and do not restate existing neighbors. Keep rationales under 45 words.`;
    }

    collectLinkCandidates(currentNode, neighborIds = []) {
        const candidates = [];
        if (!this.nodeMap?.size) return candidates;

        const currentPos = this.positions?.get(currentNode.id) || null;
        const neighborSet = new Set(neighborIds);

        const considerNode = (node, connected = false) => {
            if (!node || node.id === currentNode.id) return;
            const alreadyNeighbor = neighborSet.has(node.id);
            if (!connected && alreadyNeighbor) return;
            const label = this.getNodeDisplayLabel(node);
            if (!label) return;

            const meta = node.libraryMeta || {};
            const description = this.truncateNarrativeText(
                meta.description ||
                meta.summary ||
                node.description ||
                node.summary ||
                '',
                160
            );
            const tags = Array.isArray(meta.tags) && meta.tags.length
                ? meta.tags.slice(0, 5).join(', ')
                : (Array.isArray(node.tags) && node.tags.length ? node.tags.slice(0, 5).join(', ') : '');

            let distance = null;
            if (currentPos) {
                const otherPos = this.positions?.get(node.id);
                if (otherPos) {
                    const raw = Math.hypot(otherPos.x - currentPos.x, otherPos.y - currentPos.y);
                    if (Number.isFinite(raw)) {
                        distance = `${Math.round(raw)} units`;
                    }
                }
            }

            candidates.push({
                id: node.id,
                label,
                role: meta.role || node.type || 'node',
                tags,
                description,
                distance,
                connected: alreadyNeighbor
            });
        };

        this.nodeOrder?.forEach(node => {
            considerNode(node, false);
        });

        if (candidates.length < 4) {
            this.nodeOrder?.forEach(node => {
                if (neighborSet.has(node.id)) {
                    considerNode(node, true);
                }
            });
        }

        candidates.sort((a, b) => {
            if (a.connected !== b.connected) return a.connected ? 1 : -1;
            if (a.distance && b.distance) {
                const aValue = parseInt(a.distance, 10);
                const bValue = parseInt(b.distance, 10);
                if (!Number.isNaN(aValue) && !Number.isNaN(bValue) && aValue !== bValue) {
                    return aValue - bValue;
                }
            }
            return a.label.localeCompare(b.label);
        });

        return candidates;
    }

    getNodeDisplayLabel(node) {
        if (!node) return '';
        const meta = node.libraryMeta || {};
        return meta.label || node.name || node.id || '';
    }

    extractAshLinkSuggestions(response, nodeId) {
        if (!response) return null;
        let text = this.extractAshNarrative(response) || '';
        if (!text) return null;
        text = text.trim();
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fenced) {
            text = fenced[1].trim();
        }
        const braceMatch = text.match(/\{[\s\S]*\}/);
        if (braceMatch) {
            text = braceMatch[0];
        }

        let parsed = null;
        try {
            parsed = JSON.parse(text);
        } catch (error) {
            const repaired = this.repairAshJSON(text);
            if (repaired && repaired !== text) {
                try {
                    parsed = JSON.parse(repaired);
                } catch (innerError) {
                    console.warn('[LibraryExplorerView] Failed to parse Ash link suggestions JSON after repair:', repaired);
                    return null;
                }
            } else {
                console.warn('[LibraryExplorerView] Failed to parse Ash link suggestions JSON:', text);
                return null;
            }
        }

        const suggestionsArray = Array.isArray(parsed?.suggestions) ? parsed.suggestions :
            (Array.isArray(parsed) ? parsed : null);
        if (!Array.isArray(suggestionsArray)) return [];

        const uniqueIds = new Set();
        return suggestionsArray
            .map(entry => {
                const targetId = (entry?.targetId || entry?.id || entry?.nodeId || '').trim();
                if (!targetId) return null;
                if (uniqueIds.has(targetId)) return null;
                uniqueIds.add(targetId);
                const node = this.nodeMap?.get(targetId);
                const label = (entry?.targetLabel || entry?.label || this.getNodeDisplayLabel(node) || targetId).trim();
                const rationale = (entry?.rationale || entry?.reason || '').trim();
                const relation = (entry?.relation || entry?.linkType || '').trim();
                const confidence = (entry?.confidence || '').trim();
                return {
                    targetId,
                    targetLabel: label,
                    rationale,
                    relation,
                    confidence,
                    available: Boolean(node)
                };
            })
            .filter(Boolean);
    }

    repairAshJSON(text) {
        if (!text || typeof text !== 'string') return text;
        let str = text.trim();
        if (!str) return str;
        str = str.replace(/,\s*([}\]])/g, '$1');
        const openBrackets = (str.match(/\[/g) || []).length;
        const closeBrackets = (str.match(/\]/g) || []).length;
        if (openBrackets > closeBrackets) {
            str += ']'.repeat(openBrackets - closeBrackets);
        }
        const openBraces = (str.match(/\{/g) || []).length;
        const closeBraces = (str.match(/\}/g) || []).length;
        if (openBraces > closeBraces) {
            str += '}'.repeat(openBraces - closeBraces);
        }
        return str;
    }

    updateLinkSuggestions(nodeId, suggestions = [], options = {}) {
        const enriched = Array.isArray(suggestions)
            ? suggestions.map(entry => {
                const targetNode = entry && entry.targetId ? this.nodeMap?.get(entry.targetId) : null;
                const label = entry?.targetLabel || this.getNodeDisplayLabel(targetNode) || entry?.targetId || '';
                return {
                    ...entry,
                    targetLabel: label,
                    available: entry?.available ?? Boolean(targetNode)
                };
            })
            : [];

        if (enriched.length === 0) {
            this.setLinkSuggestionState({
                nodeId,
                status: 'empty',
                items: [],
                message: 'Ash found no convincing corridors.'
            });
        } else {
            this.setLinkSuggestionState({
                nodeId,
                status: 'ready',
                items: enriched,
                message: ''
            });
            if (!options.fromCache && this.lastLinkNarratedNode !== nodeId) {
                const highlight = enriched
                    .slice(0, 2)
                    .map(item => item.targetLabel || item.targetId)
                    .filter(Boolean)
                    .join(', ');
                if (highlight) {
                    this.pushNarrativeEntry(`Ash sketches corridors toward ${highlight}.`, { source: 'ash', tone: 'muted' });
                }
                enriched.forEach(entry => {
                    const label = entry.targetLabel || entry.targetId;
                    if (!label) return;
                    const rationale = this.truncateNarrativeText(entry.rationale || '', 120);
                    const relation = entry.relation ? `${entry.relation}. ` : '';
                    const whisper = `${relation}${rationale || 'Ash senses a resonance there.'}`;
                    this.pushNarrativeEntry(`Ash advises: forge a link to ${label}. ${whisper}`, { source: 'ash', tone: 'muted' });
                });
                this.lastLinkNarratedNode = nodeId;
            }
        }
    }

    attachMazeInteraction(canvas) {
        const svg = canvas.querySelector('svg');
        if (!svg) return;

        svg.querySelectorAll('.maze-node').forEach(nodeEl => {
            nodeEl.addEventListener('click', () => {
                const nodeId = nodeEl.getAttribute('data-node-id');
                if (nodeId) {
                    this.selectNode(nodeId, { center: true, source: 'mouse' });
                }
                canvas.focus();
            });
        });
    }

    attachZoomHandlers(canvas) {
        if (!canvas || canvas.dataset.zoomBound === 'true') return;

        this.zoomWheelHandler = this.zoomWheelHandler || ((event) => {
            if (!this.lastCanvasElement) return;
            event.preventDefault();
            const delta = event.deltaY || 0;
            if (!delta) return;
            const direction = delta > 0 ? -1 : 1;
            this.setZoomLevel(this.zoomLevel + direction * this.zoomStep);
        });

        this.zoomResetHandler = this.zoomResetHandler || (() => {
            this.resetZoom();
        });

        canvas.addEventListener('wheel', this.zoomWheelHandler, { passive: false });
        canvas.addEventListener('dblclick', this.zoomResetHandler, { passive: false });

        const startPan = (event) => {
            const isTouch = event.type === 'touchstart';
            if (!isTouch && event.button !== undefined && event.button !== 0) return;
            if (!isTouch && event.target.closest('.maze-node')) return;

            const point = this.getPointerPosition(event);
            if (!point) return;

            event.preventDefault();
            this.isPanning = true;
            canvas.style.cursor = 'grabbing';
            this.panStart = point;
            this.panOrigin = { x: this.zoomPan.x || 0, y: this.zoomPan.y || 0 };

            const moveEvent = isTouch ? 'touchmove' : window.PointerEvent ? 'pointermove' : 'mousemove';
            const endEvent = isTouch ? 'touchend' : window.PointerEvent ? 'pointerup' : 'mouseup';

            const listenerOptions = { passive: false };

            const handlePanMove = (moveEventObj) => {
                if (!this.isPanning) return;
                const currentPoint = this.getPointerPosition(moveEventObj);
                if (!currentPoint) return;
                moveEventObj.preventDefault();
                const dx = currentPoint.x - this.panStart.x;
                const dy = currentPoint.y - this.panStart.y;
                this.zoomPan = {
                    x: this.panOrigin.x + dx,
                    y: this.panOrigin.y + dy
                };
                this.applyZoomTransform();
            };

            const endPan = () => {
                if (!this.isPanning) return;
                this.isPanning = false;
                canvas.style.cursor = 'grab';
                window.removeEventListener(moveEvent, handlePanMove, listenerOptions);
                window.removeEventListener(endEvent, endPan, listenerOptions);
            };

            window.addEventListener(moveEvent, handlePanMove, listenerOptions);
            window.addEventListener(endEvent, endPan, listenerOptions);
        };

        if (window.PointerEvent) {
            canvas.addEventListener('pointerdown', startPan, { passive: false });
        } else {
            canvas.addEventListener('mousedown', startPan, { passive: false });
            canvas.addEventListener('touchstart', startPan, { passive: false });
        }

        canvas.dataset.zoomBound = 'true';
        canvas.style.cursor = 'grab';
    }

    setZoomLevel(level) {
        const clamped = Math.max(this.minZoom, Math.min(this.maxZoom, level));
        if (Math.abs(clamped - this.zoomLevel) < 0.0001) return;
        this.zoomLevel = clamped;
        this.applyZoomTransform();
    }

    resetZoom() {
        this.zoomLevel = 1;
        this.zoomPan = { x: 0, y: 0 };
        this.applyZoomTransform();
    }

    applyZoomTransform() {
        const canvas = this.lastCanvasElement;
        if (!canvas) return;
        const svg = canvas.querySelector('svg');
        if (!svg) return;
        const scale = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel || 1));
        this.zoomLevel = scale;
        const translateX = this.zoomPan?.x || 0;
        const translateY = this.zoomPan?.y || 0;
        svg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }

    getPointerPosition(event) {
        if (event.touches && event.touches.length) {
            return {
                x: event.touches[0].clientX,
                y: event.touches[0].clientY
            };
        }
        if (event.changedTouches && event.changedTouches.length) {
            return {
                x: event.changedTouches[0].clientX,
                y: event.changedTouches[0].clientY
            };
        }
        if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
            return { x: event.clientX, y: event.clientY };
        }
        return null;
    }

    attachKeyboardAndMouse() {
        if (this.keyboardBound) return;
        this.keyboardBound = true;

        this.handleKeyDown = (event) => {
            if (!this.container || this.container.classList.contains('le-hidden')) return;
            const activeElement = document.activeElement;
            const isWithinExplorer = activeElement && this.container.contains(activeElement);
            const allowNavigation = !activeElement || activeElement === document.body || isWithinExplorer;
            if (!allowNavigation) return;

            switch (event.key) {
                case 'ArrowLeft':
                case 'ArrowRight':
                case 'ArrowUp':
                case 'ArrowDown':
                    this.moveSelectionDirectional(event.key);
                    event.preventDefault();
                    break;
                case ' ':
                case 'Spacebar':
                    if (activeElement && ['INPUT','TEXTAREA','SELECT','BUTTON'].includes(activeElement.tagName)) {
                        return;
                    }
                    this.rotateDirectionBasis(1);
                    event.preventDefault();
                    break;
                case 'Enter':
                    if (this.activateSelection()) {
                        event.preventDefault();
                    } else if (this.stepAlongCorridor('next')) {
                        event.preventDefault();
                    }
                    break;
                default:
                    break;
            }
        };

        document.addEventListener('keydown', this.handleKeyDown);

        const mazeCanvas = this.container.querySelector('.maze-canvas');
        if (mazeCanvas) {
            mazeCanvas.addEventListener('click', () => {
                mazeCanvas.focus();
            });
        }
    }

    bindChatInterface() {
        if (!this.container) return;
        const input = this.container.querySelector('#le-chat-input');
        if (!input || input.dataset.bound === 'true') {
            if (this.ashChatInitialized) {
                this.refreshChatLog();
            }
            return;
        }

        const sendBtn = this.container.querySelector('#le-chat-send-btn');
        const helpBtn = this.container.querySelector('#le-chat-help-btn');

        const submit = () => {
            const value = input.value.trim();
            if (!value) return;
            input.value = '';
            this.handleAshChatSubmit(value);
        };

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey) {
                event.preventDefault();
                submit();
            } else if ((event.key === 'Enter') && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
                event.preventDefault();
                submit();
            }
        });

        if (sendBtn && sendBtn.dataset.bound !== 'true') {
            sendBtn.addEventListener('click', submit);
            sendBtn.dataset.bound = 'true';
        }

        if (helpBtn && helpBtn.dataset.bound !== 'true') {
            helpBtn.addEventListener('click', () => this.showChatHelp());
            helpBtn.dataset.bound = 'true';
        }

        input.dataset.bound = 'true';

        if (!this.ashChatInitialized) {
            this.ashChatInitialized = true;
            this.appendChatMessage('system', 'Whisper directions like "north" or ask Ash for guidance. Use "go to <node>" to jump corridors.');
        } else {
            this.refreshChatLog();
        }
    }

    setChatBusyState(isBusy) {
        if (!this.container) return;
        const input = this.container.querySelector('#le-chat-input');
        const sendBtn = this.container.querySelector('#le-chat-send-btn');
        if (input) input.disabled = isBusy;
        if (sendBtn) sendBtn.disabled = isBusy;
    }

    handleAshChatSubmit(rawValue) {
        const message = (rawValue || '').trim();
        if (!message) return;

        this.appendChatMessage('you', message);
        const handled = this.processChatCommand(message);
        if (!handled) {
            this.requestAshChatResponse(message);
        }
    }

    processChatCommand(message = '') {
        const clean = message.trim();
        if (!clean) return false;
        const lower = clean.toLowerCase();

        if (lower === '/help' || lower === 'help' || lower === 'commands' || lower === 'command lore') {
            this.showChatHelp();
            return true;
        }

        const directionAliases = {
            north: 'ArrowUp',
            up: 'ArrowUp',
            forward: 'ArrowUp',
            south: 'ArrowDown',
            down: 'ArrowDown',
            back: 'ArrowDown',
            backward: 'ArrowDown',
            east: 'ArrowRight',
            right: 'ArrowRight',
            west: 'ArrowLeft',
            left: 'ArrowLeft'
        };

        const resolveDirectionMove = (keyword) => {
            const key = directionAliases[keyword];
            if (!key) return false;
            const before = this.selectedNodeId;
            this.moveSelectionDirectional(key);
            const after = this.selectedNodeId;
            const moved = before !== after;
            const pretty = keyword.replace(/^(?:go|move|walk|step)\s+/, '');
            this.appendChatMessage('system', moved ? `You slip ${pretty} through the stacks.` : `No mapped corridor stretches ${pretty}.`);
            return true;
        };

        if (directionAliases[lower]) {
            return resolveDirectionMove(lower);
        }

        const goMatch = lower.match(/^(?:go|step|walk|move|head|travel)(?:\s+(?:to|toward|into|through))?\s+(.+)/);
        if (goMatch && goMatch[1]) {
            const target = goMatch[1].trim();
            if (directionAliases[target]) {
                return resolveDirectionMove(target);
            }
            const node = this.resolveNodeFromQuery(target);
            if (node) {
                this.selectNode(node.id, { center: true, source: 'chat', immediate: false });
                const label = this.getNodeDisplayLabel(node) || node.name || node.id;
                this.appendChatMessage('system', `You drift toward ${label}.`);
            } else {
                this.appendChatMessage('system', `Ash cannot locate a chamber matching "${target}".`);
            }
            return true;
        }

        if (/(?:recenter|center|recentre|reset map|focus map)/.test(lower)) {
            this.handleRecenterView();
            this.appendChatMessage('system', 'The map recentres around your current footing.');
            return true;
        }

        if (/^(?:rotate|spin|twist)\b/.test(lower)) {
            const step = /\b(left|counter|anti|widdershins)\b/.test(lower) ? -1 : 1;
            this.rotateDirectionBasis(step);
            this.appendChatMessage('system', step === 1 ? 'You pivot the forward arrow clockwise.' : 'You pivot the forward arrow counter-clockwise.');
            return true;
        }

        return false;
    }

    resolveNodeFromQuery(query = '') {
        const target = query.trim().toLowerCase();
        if (!target || !this.nodeMap) return null;

        let bestNode = null;
        let bestScore = -Infinity;

        const scoreCandidate = (value) => {
            if (!value) return -Infinity;
            const lower = value.toLowerCase();
            if (lower === target) return 120;
            if (lower.startsWith(target)) return 90;
            if (lower.includes(target)) return 75;

            const parts = target.split(/\s+/).filter(Boolean);
            if (parts.length > 1 && parts.every(part => lower.includes(part))) {
                return 60;
            }
            return -Infinity;
        };

        this.nodeMap.forEach((node) => {
            if (!node) return;
            const label = this.getNodeDisplayLabel(node);
            const id = node.id || '';
            const name = node.name || '';
            const candidates = [label, id, name].filter(Boolean);
            let nodeScore = -Infinity;
            candidates.forEach(candidate => {
                const score = scoreCandidate(candidate);
                if (score > nodeScore) nodeScore = score;
            });

            if (nodeScore > bestScore) {
                bestScore = nodeScore;
                bestNode = node;
            }
        });

        if (bestScore >= 60) {
            return bestNode;
        }
        return null;
    }

    appendChatMessage(author, text, options = {}) {
        const entry = {
            id: `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            author,
            text,
            pending: Boolean(options.pending),
            timestamp: Date.now()
        };

        this.ashChatLog.push(entry);
        while (this.ashChatLog.length > this.ashChatHistoryLimit) {
            this.ashChatLog.shift();
        }

        this.refreshChatLog();
        return entry.id;
    }

    updateChatMessage(messageId, updates = {}) {
        if (!messageId) return;
        const entry = this.ashChatLog.find(item => item.id === messageId);
        if (!entry) return;
        Object.assign(entry, updates);
        this.refreshChatLog();
    }

    refreshChatLog() {
        const logEl = this.container?.querySelector('#le-chat-log');
        if (!logEl) return;

        if (!this.ashChatLog.length) {
            logEl.innerHTML = `<div class="chat-placeholder">The signal room hums softly, awaiting your whisper.</div>`;
            return;
        }

        const markup = this.ashChatLog
            .map(entry => {
                const classes = ['chat-line', entry.author || 'system'];
                if (entry.pending) classes.push('pending');
                const labelMap = {
                    you: 'you',
                    ash: 'ash',
                    system: 'glyphs'
                };
                const label = labelMap[entry.author] || 'glyphs';
                const safeText = this.escapeHTML(entry.text || '').replace(/\n+/g, '<br>');
                return `<div class="${classes.join(' ')}"><span class="label">${label}</span><span class="content">${safeText || '…'}</span></div>`;
            })
            .join('');

        logEl.innerHTML = markup;
        logEl.scrollTop = logEl.scrollHeight;
    }

    showChatHelp() {
        const tips = [
            'north / south / east / west — move through mapped corridors',
            'go to <node name> — jump directly to a chamber',
            'rotate / rotate left — spin the forward arrow',
            'center map — recentre the constellation view',
            'Ask Ash anything to receive atmospheric guidance.'
        ];
        this.appendChatMessage('system', `Command lexicon:\n• ${tips.join('\n• ')}`);
    }

    async requestAshChatResponse(message) {
        const companion = this.gamification?.aiCompanion || window.aiCompanion;
        if (!companion || typeof companion.callAIService !== 'function') {
            this.appendChatMessage('system', 'The signal to Ash is down. Try again after a moment.');
            return;
        }

        if (this.ashChatInFlight) {
            this.appendChatMessage('system', 'Ash is still shaping the last whisper. Hold a beat.');
            return;
        }

        this.ashChatInFlight = true;
        this.setChatBusyState(true);

        const pendingId = this.appendChatMessage('ash', 'Ash is tuning to your frequency…', { pending: true });
        this.ashChatPendingId = pendingId;

        try {
            const prompt = this.buildAshChatPrompt(message);
            const response = await companion.callAIService(prompt, {
                context: 'library.constellation-chat',
                temperature: 0.55
            });

            const reply = this.extractAshNarrative(response) || 'Static flickers; no words arrive.';
            this.updateChatMessage(pendingId, { text: reply, author: 'ash', pending: false });
            this.pushNarrativeEntry(`Ash transmits: ${reply}`, { source: 'ash', tone: 'muted' });
        } catch (error) {
            console.warn('[LibraryExplorerView] Ash chat request failed:', error);
            this.updateChatMessage(pendingId, { text: 'The channel crackles—Ash cannot reach you right now.', author: 'system', pending: false });
        } finally {
            this.ashChatInFlight = false;
            this.ashChatPendingId = null;
            this.setChatBusyState(false);
            const input = this.container?.querySelector('#le-chat-input');
            if (input && !input.disabled) {
                input.focus();
            }
        }
    }

    buildAshChatPrompt(message) {
        const selectedNode = this.selectedNodeId ? this.nodeMap?.get(this.selectedNodeId) : null;
        const nodeLabel = selectedNode ? (this.getNodeDisplayLabel(selectedNode) || selectedNode.name || selectedNode.id) : 'no node selected';
        const nodeRole = selectedNode?.libraryMeta?.role || selectedNode?.type || 'node';
        const nodeDescription = this.truncateNarrativeText(
            selectedNode?.libraryMeta?.description ||
            selectedNode?.description ||
            '',
            180
        ) || 'No description recorded.';

        const neighbors = selectedNode
            ? Array.from(this.adjacency?.get(selectedNode.id) || [])
                .map(id => this.nodeMap?.get(id))
                .filter(Boolean)
                .map(node => `${this.getNodeDisplayLabel(node) || node.name || node.id} (${node.libraryMeta?.role || node.type || 'node'})`)
            : [];

        const orientation = this.describeOrientationVector(this.orientationVector);
        const forwardNeighbor = this.forwardNeighborId ? (this.getNodeDisplayLabel(this.nodeMap?.get(this.forwardNeighborId)) || this.forwardNeighborId) : 'none';

        const recentChat = this.ashChatLog
            .slice(-6)
            .map(entry => `${entry.author}: ${entry.text}`)
            .join('\n');

        const liveSnippet = this.truncateNarrativeText(this.gamification?.liveProgress?.recentSnippet || '', 140);

        return `You are Ash, spectral cartographer and companion. Respond to the traveller's latest whisper in 2-3 sentences (under 80 words) with a game-like tone—mystical but encouraging.
Current node: ${nodeLabel} (role: ${nodeRole})
Description: ${nodeDescription}
Forward heading: ${orientation}
Forward neighbour: ${forwardNeighbor}
Nearby nodes: ${neighbors.length ? neighbors.join('; ') : 'none'}
Recent writing fragment: ${liveSnippet || 'No fresh fragment'}
Recent chat history:
${recentChat || 'None yet.'}

Traveller message: "${message}"

Offer atmospheric guidance, optionally suggest a direction (north/south/east/west) or a node label to explore. Reference available directions only if relevant. Reply as Ash, without markdown formatting.`;
    }

    moveSelectionDirectional(key) {
        if (!this.selectedNodeId && this.nodeOrder?.length) {
            this.selectNode(this.nodeOrder[0].id, { center: true, source: 'keyboard', immediate: true });
        }

        if (!this.selectedNodeId) return;

        this.configureOrientationForNode(this.selectedNodeId, this.lastVisitedNodeId, {
            preserveForward: true,
            fallbackVector: this.orientationVector
        });

        const directionInfo = this.getDirectionVector(key);
        const previousNodeId = this.selectedNodeId;

        let moved = false;
        if (directionInfo) {
            if (this.selectNeighborInDirection(directionInfo)) {
                if (this.selectedNodeId !== previousNodeId) {
                    this.lastDirectionVector = directionInfo.vector;
                    this.lastDirectionKey = key;
                }
                return;
            }
        }

        if (key === 'ArrowLeft' || key === 'ArrowRight') {
            const step = key === 'ArrowLeft' ? -1 : 1;
            moved = this.rotateWithinCluster(step);
            this.lastDirectionVector = null;
            this.lastDirectionKey = null;
        } else if (key === 'ArrowUp') {
            if (this.stepAlongCorridor('up')) {
                if (this.selectedNodeId !== previousNodeId && directionInfo) {
                    this.lastDirectionVector = directionInfo.vector;
                    this.lastDirectionKey = key;
                }
                return;
            }
            moved = this.rotateWithinCluster(-1);
            this.lastDirectionVector = null;
            this.lastDirectionKey = null;
        } else if (key === 'ArrowDown') {
            if (this.stepAlongCorridor('down')) {
                if (this.selectedNodeId !== previousNodeId && directionInfo) {
                    this.lastDirectionVector = directionInfo.vector;
                    this.lastDirectionKey = key;
                }
                return;
            }
            moved = this.rotateWithinCluster(1);
            this.lastDirectionVector = null;
            this.lastDirectionKey = null;
        }

        if (!moved) {
            this.setStatus('No mapped corridor in that direction.', { temporary: true, duration: 1600 });
        }
    }

    rotateDirectionBasis(step = 1) {
        if (this.selectedNodeId) {
            this.configureOrientationForNode(this.selectedNodeId, null, {
                preserveForward: true,
                fallbackVector: this.orientationVector
            });
        }

        const neighbors = this.orientationNeighbors || [];
        if (!neighbors.length) {
            this.setStatus('No corridors to align.', { temporary: true, duration: 1800 });
            return;
        }

        const len = neighbors.length;
        if (this.orientationIndex < 0) {
            this.orientationIndex = 0;
        }
        this.orientationIndex = (this.orientationIndex + step + len) % len;
        const entry = neighbors[this.orientationIndex];
        if (entry) {
            this.orientationVector = { ...entry.vector };
            this.forwardNeighborId = entry.id;
            this.networkInstance?.setOrientationHighlight?.(this.selectedNodeId, entry.id);
        }
        this.lastDirectionVector = null;
        this.lastDirectionKey = null;
        this.updateOrientationIndicator();
        if (entry) {
            const targetLabel = entry.label || entry.id;
            this.setStatus(`Forward arrow aligned toward ${targetLabel}.`, { temporary: true, duration: 1700 });
        }
    }

    updateOrientationIndicator() {
        const indicator = this.container?.querySelector('#le-orientation-indicator');
        if (!indicator) return;
        const neighbors = this.orientationNeighbors || [];
        let entry = null;
        if (this.forwardNeighborId) {
            entry = neighbors.find(item => item.id === this.forwardNeighborId) || null;
        }
        if (!entry && this.orientationIndex >= 0 && neighbors.length) {
            entry = neighbors[this.orientationIndex] || neighbors[0];
        }
        if (!entry) {
            indicator.textContent = 'Forward: None';
            return;
        }
        const heading = this.describeOrientationVector(entry.vector);
        const label = entry.label || entry.id;
        indicator.textContent = `Forward: ${heading} → ${label}`;
    }

    getDirectionVector(key) {
        const forward = this.normalizeVector(this.orientationVector);
        const right = this.normalizeVector({ x: forward.y, y: -forward.x });
        const left = this.normalizeVector({ x: -forward.y, y: forward.x });
        const backward = this.normalizeVector({ x: -forward.x, y: -forward.y });
        switch (key) {
            case 'ArrowUp': {
                const entry = this.findClosestNeighbor(forward);
                return {
                    key,
                    vector: forward,
                    preferredId: entry ? entry.id : null
                };
            }
            case 'ArrowDown': {
                const target = this.findClosestNeighbor(backward) || this.findNeighborById(this.lastVisitedNodeId);
                return {
                    key,
                    vector: backward,
                    preferredId: target ? target.id : null
                };
            }
            case 'ArrowRight': {
                const entry = this.findClosestNeighbor(right);
                return {
                    key,
                    vector: right,
                    preferredId: entry ? entry.id : null
                };
            }
            case 'ArrowLeft': {
                const entry = this.findClosestNeighbor(left);
                return {
                    key,
                    vector: left,
                    preferredId: entry ? entry.id : null
                };
            }
            default:
                return null;
        }
    }

    findNeighborById(nodeId) {
        if (!nodeId) return null;
        return (this.orientationNeighbors || []).find(entry => entry.id === nodeId) || null;
    }

    findClosestNeighbor(vector) {
        const normalized = this.normalizeVector(vector);
        let best = null;
        (this.orientationNeighbors || []).forEach(entry => {
            const dot = entry.vector.x * normalized.x + entry.vector.y * normalized.y;
            if (!best || dot > best.dot) {
                best = { entry, dot };
            }
        });
        return best ? best.entry : null;
    }

    normalizeVector(vector = { x: 0, y: 0 }) {
        const x = Number.isFinite(vector?.x) ? vector.x : 0;
        const y = Number.isFinite(vector?.y) ? vector.y : 0;
        const length = Math.hypot(x, y);
        if (!length) return { x: 0, y: 0 };
        return { x: x / length, y: y / length };
    }

    normalizeAngle(angle = 0) {
        const twoPi = Math.PI * 2;
        return ((angle + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
    }

    describeOrientationVector(vector = { x: 0, y: -1 }) {
        const { x, y } = this.normalizeVector(vector);
        const angle = this.normalizeAngle(Math.atan2(y, x));
        const deg = angle * (180 / Math.PI);
        if (deg >= -45 && deg < 45) return 'East';
        if (deg >= 45 && deg < 135) return 'South';
        if (deg <= -45 && deg > -135) return 'North';
        return 'West';
    }

    computeOrientationEntries(nodeId) {
        if (!nodeId) return [];
        const currentPos = this.positions?.get(nodeId);
        if (!currentPos) return [];
        const neighbors = Array.from(this.adjacency?.get(nodeId) || []);
        if (!neighbors.length) return [];

        const entries = neighbors.map(id => {
            const neighborPos = this.positions?.get(id);
            if (!neighborPos) return null;
            const dx = neighborPos.x - currentPos.x;
            const dy = neighborPos.y - currentPos.y;
            const distance = Math.hypot(dx, dy);
            if (!distance) return null;
            const vector = { x: dx / distance, y: dy / distance };
            const angle = Math.atan2(vector.y, vector.x);
            return {
                id,
                vector,
                angle,
                distance,
                label: this.getNodeDisplayLabel(this.nodeMap?.get(id)) || id
            };
        }).filter(Boolean);

        entries.sort((a, b) => a.angle - b.angle);
        return entries;
    }

    applyOrientationEntries(nodeId, entries, options = {}) {
        if (!Array.isArray(entries) || !entries.length) {
            this.orientationNeighbors = [];
            this.orientationIndex = -1;
            this.orientationVector = { x: 0, y: -1 };
            this.forwardNeighborId = null;
            if (nodeId) {
                this.networkInstance?.setOrientationHighlight?.(nodeId, null);
            } else {
                this.networkInstance?.setOrientationHighlight?.(null, null);
            }
            this.updateOrientationIndicator();
            return null;
        }

        const { preferredId, preferredVector, fallbackVector, excludeId } = options;
        let index = -1;

        if (preferredId) {
            index = entries.findIndex(entry => entry.id === preferredId);
        }

        if (index === -1 && preferredVector) {
            index = this.findClosestIndex(entries, preferredVector, excludeId);
        }

        if (index === -1 && fallbackVector) {
            index = this.findClosestIndex(entries, fallbackVector, excludeId);
        }

        if (index === -1) {
            index = this.findClosestIndex(entries, { x: 0, y: -1 });
        }

        if (index === -1 && entries.length) {
            index = 0;
        }

        this.orientationNeighbors = entries;
        this.orientationIndex = index;
        const activeEntry = index >= 0 ? entries[index] : null;
        this.orientationVector = activeEntry ? { ...activeEntry.vector } : { x: 0, y: -1 };
        this.forwardNeighborId = activeEntry ? activeEntry.id : null;
        if (nodeId) {
            this.networkInstance?.setOrientationHighlight?.(nodeId, this.forwardNeighborId);
        } else {
            this.networkInstance?.setOrientationHighlight?.(null, null);
        }
        this.updateOrientationIndicator();
        return activeEntry;
    }

    configureOrientationForNode(nodeId, previousNodeId = null, options = {}) {
        if (!nodeId) {
            this.applyOrientationEntries(null, []);
            return;
        }

        const entries = this.computeOrientationEntries(nodeId);
        if (!entries.length) {
            this.applyOrientationEntries(nodeId, []);
            return;
        }

        const preserveForward = Boolean(options?.preserveForward);
        let preferredId = null;
        if (preserveForward && this.forwardNeighborId) {
            const exists = entries.some(entry => entry.id === this.forwardNeighborId);
            if (exists) {
                preferredId = this.forwardNeighborId;
            }
        }

        let preferredVector = null;
        if (!preferredId && previousNodeId) {
            const currentPos = this.positions?.get(nodeId);
            const previousPos = this.positions?.get(previousNodeId);
            if (currentPos && previousPos) {
                preferredVector = this.normalizeVector({
                    x: currentPos.x - previousPos.x,
                    y: currentPos.y - previousPos.y
                });
            }
        }

        if (!preferredVector && options?.preferredVector) {
            preferredVector = this.normalizeVector(options.preferredVector);
        }

        const fallbackVector = options?.fallbackVector
            ? this.normalizeVector(options.fallbackVector)
            : this.orientationVector;

        const entry = this.applyOrientationEntries(nodeId, entries, {
            preferredId,
            preferredVector,
            fallbackVector,
            excludeId: previousNodeId || null
        });

        if (!entry && entries.length) {
            this.applyOrientationEntries(nodeId, entries, {});
        }
    }

    findClosestIndex(entries, vector, excludeId = null) {
        const normalized = this.normalizeVector(vector);
        let bestIndex = -1;
        let bestDot = -Infinity;
        entries.forEach((entry, idx) => {
            if (excludeId && entry.id === excludeId) return;
            const dot = entry.vector.x * normalized.x + entry.vector.y * normalized.y;
            if (dot > bestDot) {
                bestDot = dot;
                bestIndex = idx;
            }
        });
        if (bestIndex === -1 && excludeId) {
            const fallbackIndex = entries.findIndex(entry => entry.id === excludeId);
            if (fallbackIndex !== -1) return fallbackIndex;
        }
        return bestIndex;
    }

    rotateWithinCluster(step = 1) {
        if (!this.selectedNodeId) return false;
        const info = this.clusterLookup?.get(this.selectedNodeId);
        if (!info) return false;
        const members = this.getClusterNodes(info.clusterKey);
        if (!members.length) return false;
        if (members.length === 1) return false;

        let currentIndex = info.index;
        if (currentIndex == null || currentIndex < 0 || currentIndex >= members.length) {
            currentIndex = members.indexOf(this.selectedNodeId);
            if (currentIndex === -1) currentIndex = 0;
            info.index = currentIndex;
            info.size = members.length;
            this.clusterLookup?.set(this.selectedNodeId, info);
        }

        const nextIndex = (currentIndex + step + members.length) % members.length;
        const targetId = members[nextIndex];
        if (!targetId || targetId === this.selectedNodeId) return false;
        const neighbors = this.adjacency?.get(this.selectedNodeId);
        if (!neighbors || !neighbors.has(targetId)) return false;

        this.selectNode(targetId, { center: true, source: 'keyboard', immediate: true });
        this.lastCorridorTarget = null;
        this.lastCorridorDirection = null;
        return true;
    }

    selectNeighborInDirection(directionInfo) {
        if (!directionInfo || !directionInfo.vector) return false;
        if (!this.selectedNodeId) return false;
        const current = this.positions.get(this.selectedNodeId);
        if (!current) return false;

        const normalizedDirection = this.normalizeVector(directionInfo.vector);
        const preferredId = directionInfo.preferredId || null;
        const dotThreshold = this.directionDotThreshold ?? 0.25;

        const corridorNeighbors = Array.from(this.adjacency?.get(this.selectedNodeId) || []);
        if (!corridorNeighbors.length) return false;

        const candidates = corridorNeighbors.map(nodeId => {
            const pos = this.positions.get(nodeId);
            if (!pos) return null;
            const dx = pos.x - current.x;
            const dy = pos.y - current.y;
            const distance = Math.hypot(dx, dy);
            if (!distance) return null;
            const unitX = dx / distance;
            const unitY = dy / distance;
            const dot = unitX * normalizedDirection.x + unitY * normalizedDirection.y;
            return {
                id: nodeId,
                distance,
                dot
            };
        }).filter(Boolean);

        if (!candidates.length) return false;

        let best = null;
        candidates.forEach(candidate => {
            let score = candidate.dot;
            if (preferredId && candidate.id === preferredId) {
                score += 0.4;
            }
            if (score < dotThreshold && candidate.id !== preferredId) return;
            const distancePenalty = Math.min(0.4, candidate.distance / 1800);
            score -= distancePenalty;
            if (!best || score > best.score || (Math.abs(score - best.score) < 0.0001 && candidate.distance < best.distance)) {
                best = { ...candidate, score };
            }
        });

        if (!best && preferredId) {
            const fallback = candidates.find(candidate => candidate.id === preferredId);
            if (fallback) {
                best = { ...fallback, score: fallback.dot };
            }
        }

        if (!best || best.id === this.selectedNodeId) return false;

        this.selectNode(best.id, { center: true, source: 'keyboard', immediate: true });
        this.lastNeighborId = best.id;
        this.lastCorridorTarget = best.id;
        this.lastCorridorDirection = directionInfo.key || 'directional';
        this.orientationIndex = this.orientationNeighbors.findIndex(entry => entry.id === best.id);
        if (this.orientationIndex === -1 && this.orientationNeighbors.length) {
            this.orientationIndex = 0;
        }
        if (this.orientationIndex >= 0) {
            const entry = this.orientationNeighbors[this.orientationIndex];
            this.orientationVector = { ...entry.vector };
            this.forwardNeighborId = entry.id;
            this.networkInstance?.setOrientationHighlight?.(this.selectedNodeId, entry.id);
            this.updateOrientationIndicator();
        }
        return true;
    }

    updateProgressStatus(message, options = {}) {
        const el = document.getElementById('progress-status');
        if (el) {
            el.textContent = message;
        }

        if (options?.notify && typeof window.showNotification === 'function') {
            window.showNotification(message, 'success', 2400);
        }
    }

    attachResizerHandlers(resizer) {
        if (!resizer || resizer.dataset.bound === 'true') return;

        const handleStart = (event) => {
            if (!this.container) return;
            const isTouch = event.type.startsWith('touch');
            event.preventDefault();

            const startY = isTouch ? event.touches[0].clientY : event.clientY;
            const startHeight = this.container.getBoundingClientRect().height;

            const handleMove = (moveEvent) => {
                const currentY = moveEvent.type.startsWith('touch')
                    ? moveEvent.touches[0].clientY
                    : moveEvent.clientY;
                const delta = currentY - startY;
                const newHeight = Math.max(220, startHeight + delta);
                this.container.style.height = `${newHeight}px`;
            };

            const handleEnd = () => {
                const moveEventName = isTouch ? 'touchmove' : window.PointerEvent ? 'pointermove' : 'mousemove';
                const endEventName = isTouch ? 'touchend' : window.PointerEvent ? 'pointerup' : 'mouseup';
                window.removeEventListener(moveEventName, handleMove);
                window.removeEventListener(endEventName, handleEnd);
                resizer.classList.remove('active');
            };

            const moveEventName = isTouch ? 'touchmove' : window.PointerEvent ? 'pointermove' : 'mousemove';
            const endEventName = isTouch ? 'touchend' : window.PointerEvent ? 'pointerup' : 'mouseup';

            resizer.classList.add('active');
            window.addEventListener(moveEventName, handleMove, { passive: false });
            window.addEventListener(endEventName, handleEnd, { passive: false });
        };

        if (window.PointerEvent) {
            resizer.addEventListener('pointerdown', handleStart, { passive: false });
        } else {
            resizer.addEventListener('mousedown', handleStart, { passive: false });
            resizer.addEventListener('touchstart', handleStart, { passive: false });
        }

        resizer.dataset.bound = 'true';
    }

    getWorldModalElements() {
        if (this.worldModal && document.body.contains(this.worldModal.overlay)) {
            return this.worldModal;
        }

        const overlay = document.createElement('div');
        overlay.className = 'library-world-modal-overlay';
        overlay.style.display = 'none';

        const modal = document.createElement('div');
        modal.className = 'library-world-modal';

        const header = document.createElement('header');
        const title = document.createElement('h3');
        title.textContent = 'Library Constellation JSON';
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        header.appendChild(title);
        header.appendChild(closeBtn);

        const textarea = document.createElement('textarea');
        textarea.className = 'world-json-input';

        const status = document.createElement('div');
        status.className = 'modal-status';

        const actions = document.createElement('div');
        actions.className = 'modal-actions';

        const copyBtn = document.createElement('button');
        copyBtn.textContent = 'Copy JSON';

        const loadBtn = document.createElement('button');
        loadBtn.textContent = 'Load File';

        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = 'Download JSON';

        const applyBtn = document.createElement('button');
        applyBtn.textContent = 'Apply Changes';
        applyBtn.classList.add('primary');

        const resetBtn = document.createElement('button');
        resetBtn.textContent = 'Reset Constellation';
        resetBtn.classList.add('danger');

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'application/json';
        fileInput.style.display = 'none';

        actions.append(copyBtn, loadBtn, downloadBtn, resetBtn, applyBtn);
        modal.append(header, textarea, status, actions, fileInput);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const closeModal = () => {
            overlay.style.display = 'none';
        };

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeModal();
        });
        closeBtn.addEventListener('click', closeModal);

        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(textarea.value);
                status.textContent = 'Copied to clipboard';
                status.classList.remove('error');
                status.classList.add('success');
            } catch (error) {
                status.textContent = 'Copy failed: ' + error.message;
                status.classList.remove('success');
                status.classList.add('error');
            }
        });

        loadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                textarea.value = text;
                status.textContent = `Loaded ${file.name}`;
                status.classList.remove('error');
                status.classList.add('success');
            } catch (error) {
                status.textContent = 'Failed to load file: ' + error.message;
                status.classList.remove('success');
                status.classList.add('error');
            } finally {
                fileInput.value = '';
            }
        });

        downloadBtn.addEventListener('click', () => {
            const blob = new Blob([textarea.value], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `library-world-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            status.textContent = 'Download started';
            status.classList.remove('error');
            status.classList.add('success');
        });

        applyBtn.addEventListener('click', () => {
            try {
                this.gamification?.importLibraryWorld(textarea.value);
                status.textContent = 'Library updated';
                status.classList.remove('error');
                status.classList.add('success');
                setTimeout(() => closeModal(), 600);
            } catch (error) {
                status.textContent = 'Import failed: ' + error.message;
                status.classList.remove('success');
                status.classList.add('error');
            }
        });

        resetBtn.addEventListener('click', () => {
            if (!window.confirm('Reset the constellation to its default seed?')) {
                return;
            }
            try {
                this.gamification?.resetLibraryWorld();
                const latest = this.gamification?.exportLibraryWorld({ pretty: true }) || '{}';
                textarea.value = latest;
                status.textContent = 'Constellation reset to default.';
                status.classList.remove('error');
                status.classList.add('success');
            } catch (error) {
                status.textContent = 'Reset failed: ' + error.message;
                status.classList.remove('success');
                status.classList.add('error');
            }
        });

        this.worldModal = {
            overlay,
            modal,
            textarea,
            status,
            close: closeModal
        };

        return this.worldModal;
    }

    openWorldModal() {
        const modal = this.getWorldModalElements();
        if (!modal) return;

        let payload = '{}';
        try {
            payload = this.gamification?.exportLibraryWorld?.({ pretty: true }) || '{}';
        } catch (error) {
            console.error('[LibraryExplorerView] Failed to export world JSON:', error);
        }

        modal.textarea.value = payload;
        modal.status.textContent = '';
        modal.status.classList.remove('success', 'error');
        modal.overlay.style.display = 'flex';
        requestAnimationFrame(() => {
            modal.textarea.focus({ preventScroll: false });
            modal.textarea.setSelectionRange(0, 0);
        });
    }

    closeWorldModal() {
        if (this.worldModal?.overlay) {
            this.worldModal.overlay.style.display = 'none';
        }
    }


    buildAdjacency(corridors) {
        this.adjacency = new Map();
        corridors.forEach(corridor => {
            const { from, to } = corridor;
            if (!from || !to) return;
            if (!this.adjacency.has(from)) this.adjacency.set(from, new Set());
            if (!this.adjacency.has(to)) this.adjacency.set(to, new Set());
            this.adjacency.get(from).add(to);
            this.adjacency.get(to).add(from);
        });
    }

    stepSelection(direction = 1) {
        if (!this.nodeOrder?.length) return;
        if (!this.selectedNodeId) {
            this.selectNode(this.nodeOrder[0].id, { center: true, source: 'keyboard', immediate: true });
            return;
        }

        const currentIndex = this.nodeOrder.findIndex(node => node.id === this.selectedNodeId);
        if (currentIndex === -1) {
            this.selectNode(this.nodeOrder[0].id, { center: true, source: 'keyboard', immediate: true });
            return;
        }

        const nextIndex = (currentIndex + direction + this.nodeOrder.length) % this.nodeOrder.length;
        this.selectNode(this.nodeOrder[nextIndex].id, { center: true, source: 'keyboard', immediate: true });
    }

    stepAlongCorridor(direction = 'next') {
        if (!this.selectedNodeId) {
            if (this.nodeOrder?.length) {
                this.selectNode(this.nodeOrder[0].id, { center: true, source: 'keyboard', immediate: true });
                return true;
            }
            return false;
        }

        const neighbors = Array.from(this.adjacency?.get(this.selectedNodeId) || []);
        if (!neighbors.length) return false;

        const currentPos = this.positions.get(this.selectedNodeId);
        if (!currentPos) return false;

        const filtered = neighbors
            .map(id => ({
                id,
                pos: this.positions.get(id)
            }))
            .filter(item => item.pos);

        if (!filtered.length) return false;

        let candidates = filtered;
        if (direction === 'up') {
            candidates = filtered.filter(item => item.pos.y < currentPos.y - 1);
        } else if (direction === 'down') {
            candidates = filtered.filter(item => item.pos.y > currentPos.y + 1);
        }

        if (!candidates.length) candidates = filtered;

        let nextId = null;

        if (!nextId) {
            if (direction === 'up') {
                candidates.sort((a, b) => a.pos.y - b.pos.y || Math.abs(a.pos.x - currentPos.x) - Math.abs(b.pos.x - currentPos.x));
            } else if (direction === 'down') {
                candidates.sort((a, b) => b.pos.y - a.pos.y || Math.abs(a.pos.x - currentPos.x) - Math.abs(b.pos.x - currentPos.x));
            } else {
                candidates.sort((a, b) => {
                    const aDist = Math.hypot(a.pos.x - currentPos.x, a.pos.y - currentPos.y);
                    const bDist = Math.hypot(b.pos.x - currentPos.x, b.pos.y - currentPos.y);
                    return aDist - bDist;
                });
            }

            if (direction === 'next') {
                if (this.lastCorridorTarget) {
                    const idx = candidates.findIndex(item => item.id === this.lastCorridorTarget);
                    if (idx !== -1) {
                        nextId = candidates[(idx + 1) % candidates.length].id;
                    }
                }
            }
        }

        if (!nextId) {
            nextId = candidates[0].id;
        }

        if (!nextId || nextId === this.selectedNodeId) return false;

        this.selectNode(nextId, { silent: direction === 'next', center: true, source: 'keyboard', immediate: true });
        this.lastNeighborId = nextId;
        this.lastCorridorTarget = nextId;
        this.lastCorridorDirection = direction;
        return true;
    }

    getClusterNodes(clusterKey) {
        if (!clusterKey) return [];
        let members = this.clusterMembers?.get(clusterKey);
        if (members && members.length) return members;

        members = [];
        if (this.clusterLookup) {
            this.clusterLookup.forEach((info, nodeId) => {
                if (info.clusterKey === clusterKey) {
                    if (typeof info.index === 'number') {
                        members[info.index] = nodeId;
                    } else {
                        members.push(nodeId);
                    }
                }
            });
        }

        members = members.filter(Boolean);
        if (!this.clusterMembers) this.clusterMembers = new Map();
        this.clusterMembers.set(clusterKey, members);
        if (this.clusterLookup) {
            members.forEach((nodeId, idx) => {
                const info = this.clusterLookup.get(nodeId) || {};
                info.clusterKey = clusterKey;
                info.index = idx;
                info.size = members.length;
                if (info.orientation == null) info.orientation = 0;
                this.clusterLookup.set(nodeId, info);
            });
        }
        return members;
    }

    selectNode(nodeId, options = {}) {
        if (!nodeId || !this.nodeMap?.has(nodeId)) return;
        const previousNodeId = this.selectedNodeId;
        const source = options.source || 'system';
        const changed = previousNodeId !== nodeId;
        if (source !== 'keyboard') {
            this.lastDirectionVector = null;
            this.lastDirectionKey = null;
        }
        this.selectedNodeId = nodeId;
        this.lastNeighborId = null;
        this.lastCorridorTarget = null;
        this.lastCorridorDirection = null;
        const mazeCanvas = this.container?.querySelector('.maze-canvas');

        if (!options.skipNetwork && this.networkInstance?.setSelectedNode) {
            this.networkInstance.setSelectedNode(nodeId, {
                center: Boolean(options.center),
                preserveScale: true,
                source: 'library',
                immediate: Boolean(options.immediate)
            });
        }

        this.highlightSelection();
        this.renderNodeDetails();

        if (changed) {
            const previousNode = previousNodeId ? this.nodeMap?.get(previousNodeId) : null;
            const currentNode = this.nodeMap?.get(nodeId);
            if (currentNode) {
                this.updateNarrative(previousNode, currentNode, { source });
                this.scheduleAshNarrative(previousNode, currentNode, { source });
                this.scheduleAshLinkSuggestions(currentNode, { source });
            }
            this.lastVisitedNodeId = previousNodeId || null;
        } else if (!previousNodeId) {
            this.lastVisitedNodeId = null;
        }

        this.configureOrientationForNode(nodeId, changed ? previousNodeId : null, {
            preserveForward: !changed,
            fallbackVector: this.orientationVector
        });

        if (mazeCanvas && document.activeElement !== mazeCanvas) {
            try {
                mazeCanvas.focus({ preventScroll: true });
            } catch (_error) {
                mazeCanvas.focus();
            }
        }

        if (!options.silent && changed && source !== 'keyboard') {
            if (mazeCanvas) {
                mazeCanvas.classList.add('pulse-active');
                setTimeout(() => mazeCanvas.classList.remove('pulse-active'), 500);
            }
        }

        if (changed) {
            this.renderAnchors(this.currentWorldState?.anchors || {});
            this.renderRooms(this.currentWorldState?.rooms || {});
            this.renderLore(this.currentWorldState?.loreFragments || {});
            this.focusDigestSelection();
        }
    }

    highlightSelection() {
        const canvas = this.container?.querySelector('.maze-canvas');
        if (!canvas) return;
        if (this.selectedNodeId) {
            canvas.setAttribute('data-selected-node', this.selectedNodeId);
        } else {
            canvas.removeAttribute('data-selected-node');
        }
    }

    renderNodeDetails() {
        const pulseCard = this.container?.querySelector('#le-pulse');
        if (!pulseCard) return;

        const titleEl = pulseCard.querySelector('.pulse-node-title');
        const bodyEl = pulseCard.querySelector('.pulse-node-body');
        if (!titleEl || !bodyEl) return;

        if (!this.selectedNodeId || !this.currentWorldState) {
            titleEl.textContent = 'No node selected';
            bodyEl.textContent = 'Use arrow keys or click the constellation to explore manuscripts.';
            return;
        }

        const node = this.nodeMap?.get(this.selectedNodeId);
        if (!node) {
            titleEl.textContent = 'Unknown node';
            bodyEl.textContent = 'Lost within unmapped connections.';
            return;
        }

        const neighbors = Array.from(this.adjacency?.get(node.id) || []);
        const neighborNames = neighbors
            .map(id => this.nodeMap?.get(id)?.name || this.nodeMap?.get(id)?.libraryMeta?.label || this.nodeMap?.get(id)?.id || id)
            .filter(Boolean)
            .slice(0, 4);

        const lines = [];
        const meta = node.libraryMeta;

        if (meta) {
            titleEl.textContent = meta.label || node.name || node.id;
            if (meta.description) {
                lines.push(meta.description);
            } else if (meta.role === 'anchor') {
                lines.push('Anchor node in the constellation.');
            } else if (meta.role === 'room') {
                lines.push('Chamber awaiting its next inscription.');
            }

            if (meta.role === 'anchor') {
                lines.push(`Status: ${meta.unlocked ? 'Unlocked' : 'Sealed'}`);
                const rooms = Object.values(this.currentWorldState.rooms || {})
                    .filter(room => room.anchor === meta.worldId);
                if (rooms.length) {
                    lines.push(`Linked rooms: ${rooms.length}`);
                }
            } else if (meta.role === 'room') {
                if (meta.anchor) {
                    const anchorNodeId = this.libraryWorldNodeIndex.get(meta.anchor);
                    const anchorNode = anchorNodeId ? this.nodeMap?.get(anchorNodeId) : null;
                    const anchorLabel = anchorNode?.libraryMeta?.label || anchorNode?.name || meta.anchor;
                    lines.push(`Anchor: ${anchorLabel}`);
                }
                if (meta.tags?.length) {
                    lines.push(`Tags: ${meta.tags.join(', ')}`);
                }
                const inscribed = meta.world?.createdAt || meta.world?.updatedAt;
                if (inscribed) {
                    try {
                        const formatted = new Date(inscribed).toLocaleString();
                        lines.push(`Inscribed: ${formatted}`);
                    } catch (error) {
                        // ignore formatting issues
                    }
                }
            } else {
                lines.push('Constellation node awaiting classification.');
            }
        } else {
            titleEl.textContent = node.name || node.id;

            if (node.type === 'file') {
                lines.push('Manuscript node in the constellation.');
            } else if (node.type === 'heading' || node.type === 'subheading') {
                lines.push(node.type === 'heading' ? 'Chapter marker within the manuscript.' : 'Subchapter thread within the manuscript.');
                if (node.parent) {
                    const parentNode = this.nodeMap?.get(node.parent);
                    const parentLabel = parentNode?.name || parentNode?.id || node.parent;
                    lines.push(`Parent manuscript: ${parentLabel}`);
                }
            } else {
                lines.push('Constellation node awaiting classification.');
            }

            const fallbackRoom = this.currentWorldState.rooms?.[node.id];
            if (fallbackRoom?.description) {
                lines.push(`Lore echo: ${fallbackRoom.description}`);
            }
        }

        if (node.path) {
            lines.push(`File: ${node.path}`);
        }

        if (neighborNames.length) {
            const suffix = neighbors.length > neighborNames.length ? '…' : '';
            lines.push(`Nearby echoes: ${neighborNames.join(', ')}${suffix}`);
        }

        lines.push(`Connections mapped: ${neighbors.length}`);

        bodyEl.textContent = lines.join('\n');
    }

    clearNodeDetails() {
        const pulseCard = this.container?.querySelector('#le-pulse');
        if (!pulseCard) return;
        const titleEl = pulseCard.querySelector('.pulse-node-title');
        const bodyEl = pulseCard.querySelector('.pulse-node-body');
        if (titleEl) titleEl.textContent = 'No node selected';
        if (bodyEl) bodyEl.textContent = 'Use arrow keys or click the constellation to explore manuscripts.';
        this.selectedNodeId = null;
        this.lastNeighborId = null;
        this.renderAnchors(this.currentWorldState?.anchors || {});
        this.renderRooms(this.currentWorldState?.rooms || {});
        this.renderLore(this.currentWorldState?.loreFragments || {});
        this.setLinkSuggestionState({
            nodeId: null,
            status: 'idle',
            items: [],
            message: ''
        });
        this.orientationNeighbors = [];
        this.orientationIndex = -1;
        this.orientationVector = { x: 0, y: -1 };
        this.forwardNeighborId = null;
        this.networkInstance?.setOrientationHighlight?.(null, null);
        this.updateOrientationIndicator();
    }

    focusDigestSelection() {
        const lists = ['le-anchors', 'le-rooms', 'le-lore'];
        lists.forEach(id => {
            const listEl = this.container?.querySelector(`#${id} .list`);
            const selected = listEl?.querySelector('.list-item.selected');
            if (selected && typeof selected.scrollIntoView === 'function') {
                selected.scrollIntoView({ block: 'nearest' });
            }
        });
    }

    pushNarrativeEntry(text, options = {}) {
        const trimmed = (text || '').trim();
        if (!trimmed) return;

        const source = options.source || 'system';
        const tone = options.tone || null;
        const last = this.narrativeEntries[this.narrativeEntries.length - 1];
        if (last && last.text === trimmed && last.source === source) {
            return;
        }

        this.narrativeEntries.push({
            text: trimmed,
            source,
            tone,
            timestamp: Date.now()
        });

        const maxEntries = 18;
        if (this.narrativeEntries.length > maxEntries) {
            this.narrativeEntries.splice(0, this.narrativeEntries.length - maxEntries);
        }

        this.renderNarrativeLog();
    }

    updateNarrative(prevNode, nextNode, context = {}) {
        const allowedSources = ['keyboard', 'mouse', 'click'];
        if (!nextNode || (context.source && !allowedSources.includes(context.source))) return;

        const line = this.composeNarrativeLine(prevNode, nextNode, context);
        if (line) {
            this.pushNarrativeEntry(line, { source: 'journey' });
        }
    }

    renderNarrativeLog() {
        const logEl = this.container?.querySelector('#le-narrative-log');
        if (!logEl) return;

        if (!Array.isArray(this.narrativeEntries) || !this.narrativeEntries.length) {
            logEl.innerHTML = '<div class="narrative-line muted">Awaiting first steps…</div>';
            return;
        }

        const markup = this.narrativeEntries
            .map((entry, index) => {
                const text = typeof entry === 'string' ? entry : entry?.text || '';
                const source = typeof entry === 'string' ? 'system' : entry?.source || 'system';
                const tone = typeof entry === 'string' ? null : entry?.tone || null;
                const classes = ['narrative-line'];
                if (index === this.narrativeEntries.length - 1) classes.push('latest');
                if (tone === 'muted') classes.push('muted');
                if (source === 'ash') classes.push('ash-line');
                const safeText = this.escapeHTML(text).replace(/\n+/g, '<br>');
                return `<div class="${classes.join(' ')}">${safeText}</div>`;
            })
            .join('');

        logEl.innerHTML = markup;
        logEl.scrollTop = logEl.scrollHeight;
    }

    scheduleAshNarrative(prevNode, nextNode, context = {}) {
        if (!nextNode || !nextNode.id) return;
        const nodeId = nextNode.id;

        if (this.nodeLoreCache?.has(nodeId)) {
            const cached = this.nodeLoreCache.get(nodeId);
            if (cached) {
                this.pushNarrativeEntry(cached, { source: 'ash' });
            }
            return;
        }

        const companion = this.gamification?.aiCompanion || window.aiCompanion;
        if (!companion || typeof companion.callAIService !== 'function') return;

        if (this.ashNarrativeInFlight) return;

        if (this.ashNarrativeTimer) {
            clearTimeout(this.ashNarrativeTimer);
        }

        const now = Date.now();
        let delay = 400;
        if (this.lastAshNarrativeAt) {
            const elapsed = now - this.lastAshNarrativeAt;
            if (elapsed < this.ashNarrativeCooldown) {
                delay = this.ashNarrativeCooldown - elapsed + 250;
            }
        }

        this.ashNarrativeTimer = setTimeout(() => {
            this.ashNarrativeTimer = null;
            this.requestAshNarrative(prevNode, nextNode, context);
        }, delay);
    }

    async requestAshNarrative(prevNode, nextNode, context = {}) {
        if (!nextNode || !nextNode.id) return;
        const companion = this.gamification?.aiCompanion || window.aiCompanion;
        if (!companion || typeof companion.callAIService !== 'function') return;

        this.ashNarrativeInFlight = true;

        try {
            const prompt = this.buildAshNarrativePrompt(prevNode, nextNode, context);
            if (!prompt) return;

            const response = await companion.callAIService(prompt, {
                context: 'library.constellation-narrative',
                temperature: 0.7
            });

            const narrative = this.extractAshNarrative(response);
            if (narrative) {
                const framed = narrative.trim().startsWith('Ash') ? narrative.trim() : `Ash whispers: ${narrative.trim()}`;
                this.nodeLoreCache.set(nextNode.id, framed);
                this.lastAshNarrativeAt = Date.now();
                this.pushNarrativeEntry(framed, { source: 'ash' });
            }
        } catch (error) {
            console.warn('[LibraryExplorerView] Ash narrative request failed:', error);
        } finally {
            this.ashNarrativeInFlight = false;
        }
    }

    buildAshNarrativePrompt(prevNode, nextNode, context = {}) {
        if (!nextNode) return '';

        const currentMeta = nextNode.libraryMeta || {};
        const currentName = currentMeta.label || nextNode.name || nextNode.id || 'an unnamed chamber';
        const currentRole = currentMeta.role || nextNode.type || 'node';
        const description = this.truncateNarrativeText(currentMeta.description || '', 200) || 'No direct description.';
        const tags = Array.isArray(currentMeta.tags) && currentMeta.tags.length ? currentMeta.tags.slice(0, 5).join(', ') : 'none';

        const prevMeta = prevNode?.libraryMeta || {};
        const prevName = prevNode ? (prevMeta.label || prevNode.name || prevNode.id || 'a forgotten corridor') : 'the outer stacks';

        const neighbors = Array.from(this.adjacency?.get(nextNode.id) || [])
            .map(id => this.nodeMap?.get(id)?.libraryMeta?.label || this.nodeMap?.get(id)?.name || id)
            .filter(Boolean)
            .slice(0, 5);
        const neighborList = neighbors.length ? neighbors.join(', ') : 'unmapped corridors';

        const snippet = this.truncateNarrativeText(this.gamification?.liveProgress?.recentSnippet || '', 160);
        const ledger = this.gamification?.resourceLedger || {};
        const ledgerSummary = `Shards ${ledger.lexiconShards ?? 0}, Sigils ${ledger.catalogueSigils ?? 0}, Tokens ${ledger.architectTokens ?? 0}`;

        return `You are Ash, the spectral cartographer of an endless library. Craft a brief vignette (no more than 3 sentences, under 85 words) with the tone of Borges woven with Kafka.
- Traveller departs from: ${prevName}.
- They arrive at: ${currentName} (role: ${currentRole}).
- Node impression: ${description}.
- Tags or motifs: ${tags}.
- Nearby chambers: ${neighborList}.
- Latest journal fragment: ${snippet || 'The writer left no fresh words.'}
- Resource ledger: ${ledgerSummary}.

Write in second-person, hinting at labyrinthine wonder and gentle dread. Avoid overt exposition; favor evocative imagery. Reply with plain text only.`;
    }

    extractAshNarrative(response) {
        if (!response) return '';
        const message = typeof response === 'string' ? response : response.message || response.content || response.text;
        if (Array.isArray(message)) {
            return message.map(item => this.extractAshNarrative(item)).filter(Boolean).join(' ').trim();
        }
        if (Array.isArray(response?.choices) && response.choices.length) {
            const choiceText = response.choices
                .map(choice => this.extractAshNarrative(choice.message?.content || choice.text || choice.value || ''))
                .find(Boolean);
            if (choiceText) return choiceText;
        }
        if (typeof message === 'object' && message) {
            return this.extractAshNarrative(message.message || message.content || message.text || message.value || '');
        }
        if (typeof message === 'string') {
            return message.trim();
        }
        return '';
    }

    composeNarrativeLine(prevNode, nextNode, context = {}) {
        if (!nextNode) return '';
        const meta = nextNode.libraryMeta;
        const name = meta?.label || nextNode.name || nextNode.id;
        if (!name) return '';

        const prevMeta = prevNode?.libraryMeta;
        const prevName = prevMeta?.label || prevNode?.name || prevNode?.id;

        if (!prevNode) {
            if (meta?.role === 'anchor') {
                return `You arrive beneath the anchor ${name}.`;
            }
            if (meta?.role === 'room') {
                return `You step into the chamber ${name}.`;
            }
            return `You awaken within ${name}.`;
        }

        const direction = this.getDirectionLabel(prevNode, nextNode);
        const distance = this.getDistanceDescriptor(prevNode, nextNode);
        const corridorSet = this.adjacency?.get(prevNode.id);
        const corridorWord = corridorSet?.has(nextNode.id) ? 'corridor' : 'trail';
        const verb = context.source === 'keyboard'
            ? 'You chart'
            : (context.source === 'mouse' || context.source === 'click')
                ? 'You drift'
                : 'You move';

        let line = `${verb} ${direction}${distance ? ` ${distance}` : ''} along the ${corridorWord} from ${prevName} to ${name}.`;

        if (meta?.role === 'anchor') {
            line += ' The anchor hums with steady resonance.';
        } else if (meta?.role === 'room') {
            if (meta.tags?.length) {
                const tags = meta.tags.slice(0, 3).join(', ');
                line += ` Fragments of ${tags} glimmer here.`;
            } else if (meta.description) {
                const snippet = this.truncateNarrativeText(meta.description);
                if (snippet) {
                    line += ` ${snippet}`;
                }
            }
        } else if (nextNode.type === 'heading' || nextNode.type === 'subheading') {
            line += ' A chapter marker flickers at your periphery.';
        }

        return line;
    }

    getDirectionLabel(prevNode, nextNode) {
        if (!prevNode || !nextNode) return 'forward';
        const prevPos = this.positions?.get(prevNode.id);
        const nextPos = this.positions?.get(nextNode.id);
        if (!prevPos || !nextPos) return 'forward';

        const dx = nextPos.x - prevPos.x;
        const dy = nextPos.y - prevPos.y;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return 'forward';

        return this.directionFromDelta(dx, dy);
    }

    directionFromDelta(dx, dy) {
        if (!dx && !dy) return 'forward';
        const angle = Math.atan2(-dy, dx); // invert y to match compass directions
        const rawOctant = Math.round(angle / (Math.PI / 4));
        const index = ((rawOctant % 8) + 8) % 8;
        const directions = ['eastward', 'north-east', 'northward', 'north-west', 'westward', 'south-west', 'southward', 'south-east'];
        return directions[index] || 'forward';
    }

    getDistanceDescriptor(prevNode, nextNode) {
        if (!prevNode || !nextNode) return '';
        const prevPos = this.positions?.get(prevNode.id);
        const nextPos = this.positions?.get(nextNode.id);
        if (!prevPos || !nextPos) return '';
        const distance = Math.hypot(nextPos.x - prevPos.x, nextPos.y - prevPos.y);
        if (!Number.isFinite(distance)) return '';
        if (distance < 45) return 'a short distance';
        if (distance < 120) return 'across a winding span';
        return 'through a long stretch';
    }

    truncateNarrativeText(text, maxLength = 140) {
        if (!text) return '';
        const cleaned = text.replace(/\s+/g, ' ').trim();
        if (!cleaned) return '';
        if (cleaned.length <= maxLength) return cleaned;
        return `${cleaned.slice(0, maxLength - 1).trim()}…`;
    }

    normalizeKey(value) {
        if (value == null) return '';
        return value
            .toString()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '');
    }

    escapeHTML(str) {
        return str.replace(/[&<>"']/g, (char) => {
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };
            return map[char] || char;
        });
    }
}

window.LibraryExplorerView = LibraryExplorerView;

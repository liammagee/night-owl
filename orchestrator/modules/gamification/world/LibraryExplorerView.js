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
    }

    ensureContainer() {
        if (this.container && document.body.contains(this.container)) {
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
                <div class="le-top">
                    <div class="le-maze" id="le-maze">
                        <div class="maze-header">
                            <span class="maze-title">Maze Overview</span>
                        </div>
                        <div class="maze-canvas" tabindex="0"></div>
                        <div class="maze-empty">Write to awaken the corridors.</div>
                    </div>
                    <div class="le-pulse" id="le-pulse">
                        <div class="pulse-header">Live Scribing</div>
                        <div class="pulse-count">Next shard in 30 words</div>
                        <div class="pulse-snippet">
                            <div class="pulse-subtitle">Latest prose</div>
                            <div class="pulse-snippet-text">Begin typing to awaken the stacks.</div>
                        </div>
                        <div class="pulse-node">
                            <div class="pulse-subtitle">Selected chamber</div>
                            <div class="pulse-node-title">No chamber selected</div>
                            <div class="pulse-node-body">Use arrow keys or click the maze to explore rooms.</div>
                        </div>
                    </div>
                </div>
                <div class="le-grid">
                    <div class="le-column" id="le-anchors">
                        <h4>Anchors</h4>
                        <div class="le-scroll list"></div>
                    </div>
                    <div class="le-column" id="le-rooms">
                        <h4>Recent Rooms</h4>
                        <div class="le-scroll list"></div>
                    </div>
                    <div class="le-column" id="le-lore">
                        <h4>Lore Fragments</h4>
                        <div class="le-scroll list"></div>
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
    }

    injectStyles() {
        if (document.getElementById('library-explorer-styles')) return;

        const style = document.createElement('style');
        style.id = 'library-explorer-styles';
        style.textContent = `
            .library-explorer-wrapper {
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                gap: 0;
                width: 100%;
            }
            .library-explorer-panel {
                margin: 0;
                padding: 16px;
                background: rgba(9, 12, 19, 0.85);
                border: 1px solid rgba(94, 234, 212, 0.2);
                border-radius: 12px;
                color: #f9fafb;
                backdrop-filter: blur(12px);
                transition: box-shadow 0.25s ease;
                box-sizing: border-box;
                overflow: hidden;
                min-height: 200px;
                max-height: 80vh;
                position: relative;
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            .library-explorer-panel .le-content {
                overflow: auto;
                flex: 1;
            }
            .library-explorer-panel .le-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 12px;
            }
            .library-explorer-panel .le-icon {
                font-size: 20px;
                margin-right: 6px;
            }
            .library-explorer-panel .le-title {
                font-size: 18px;
                font-weight: 600;
            }
            .library-explorer-panel .le-actions {
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 13px;
            }
            .library-explorer-panel .le-btn {
                padding: 6px 12px;
                border-radius: 8px;
                border: 1px solid rgba(94, 234, 212, 0.4);
                background: rgba(94, 234, 212, 0.12);
                color: #d1fae5;
                cursor: pointer;
                transition: background 0.2s, transform 0.2s;
                font-size: 13px;
            }
            .library-explorer-panel .le-btn:hover {
                background: rgba(94, 234, 212, 0.2);
                transform: translateY(-1px);
            }
            .library-explorer-panel .le-btn.secondary {
                border: 1px solid rgba(125, 211, 252, 0.4);
                background: rgba(125, 211, 252, 0.12);
                color: #bfdbfe;
            }
            .library-explorer-panel .le-btn.secondary:hover {
                background: rgba(125, 211, 252, 0.2);
            }
            .library-explorer-panel .le-content {
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            .library-explorer-panel .le-top {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                gap: 16px;
            }
            .library-explorer-resizer {
                height: 8px;
                width: 100%;
                cursor: ns-resize;
                border-radius: 999px;
                background: linear-gradient(90deg, rgba(94, 234, 212, 0.2), rgba(125, 211, 252, 0.65), rgba(94, 234, 212, 0.2));
                opacity: 0.6;
                transition: opacity 0.2s ease, box-shadow 0.2s ease;
                margin: 8px 0;
                align-self: stretch;
            }
            .library-explorer-resizer:hover,
            .library-explorer-resizer.active {
                opacity: 1;
                box-shadow: 0 0 14px rgba(94, 234, 212, 0.45);
            }
            .library-explorer-panel .le-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 16px;
            }
            .library-explorer-panel .le-column h4 {
                margin-bottom: 8px;
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: rgba(244, 244, 245, 0.8);
            }
            .library-explorer-panel .le-scroll {
                max-height: 160px;
                overflow-y: auto;
                padding-right: 4px;
            }
            .library-explorer-panel .list-item {
                padding: 8px;
                margin-bottom: 8px;
                border-radius: 8px;
                background: rgba(148, 163, 184, 0.08);
                border: 1px solid rgba(148, 163, 184, 0.18);
            }
            .library-explorer-panel .list-item .item-title {
                font-weight: 600;
                font-size: 13px;
            }
            .library-explorer-panel .list-item .item-meta {
                font-size: 12px;
                color: rgba(226, 232, 240, 0.65);
                margin-top: 4px;
            }
            .library-explorer-panel .list-item .item-tags {
                font-size: 11px;
                margin-top: 6px;
                color: rgba(94, 234, 212, 0.8);
            }
            .library-explorer-panel.le-hidden {
                display: none !important;
            }
            .library-explorer-panel.le-typing {
                box-shadow: 0 0 20px rgba(56, 189, 248, 0.2);
            }
            .library-explorer-panel .le-status.pulsing {
                color: #38bdf8;
            }
            .library-explorer-panel .le-maze {
                border: 1px solid rgba(94, 234, 212, 0.18);
                border-radius: 10px;
                padding: 12px;
                background: rgba(15, 23, 42, 0.65);
            }
            .library-explorer-panel .maze-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
                font-size: 13px;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: rgba(244, 244, 245, 0.72);
            }
            .library-explorer-panel .maze-canvas {
                position: relative;
                width: 100%;
                height: 180px;
                transition: box-shadow 0.3s ease;
            }
            .library-explorer-panel .maze-canvas {
                outline: none;
            }
            .library-explorer-panel .maze-canvas svg {
                width: 100%;
                height: 100%;
                overflow: visible;
            }
            .library-explorer-panel .maze-canvas.maze-pulse {
                box-shadow: 0 0 22px rgba(94, 234, 212, 0.35);
            }
            .library-explorer-panel .maze-empty {
                font-size: 12px;
                color: rgba(226, 232, 240, 0.55);
                margin-top: 8px;
            }
            .library-explorer-panel .maze-node-anchor {
                fill: rgba(244, 114, 182, 0.85);
                stroke: rgba(244, 114, 182, 0.55);
            }
            .library-explorer-panel .maze-node-room {
                fill: rgba(94, 234, 212, 0.85);
                stroke: rgba(94, 234, 212, 0.45);
            }
            .library-explorer-panel .maze-node {
                cursor: pointer;
            }
            .library-explorer-panel .maze-node.selected circle {
                stroke-width: 3;
                stroke: rgba(250, 204, 21, 0.95);
                filter: drop-shadow(0 0 6px rgba(250, 204, 21, 0.45));
            }
            .library-explorer-panel .maze-node .maze-node-ring {
                fill: none;
                stroke: rgba(250, 204, 21, 0.35);
                stroke-width: 1.5;
                opacity: 0;
                transition: opacity 0.2s ease;
            }
            .library-explorer-panel .maze-node.selected .maze-node-ring {
                opacity: 1;
            }
            .library-explorer-panel .maze-connection {
                stroke: rgba(226, 232, 240, 0.4);
                stroke-width: 1.6;
            }
            .library-explorer-panel .le-pulse {
                border: 1px solid rgba(147, 197, 253, 0.2);
                border-radius: 10px;
                padding: 14px;
                background: rgba(30, 41, 59, 0.65);
                display: flex;
                flex-direction: column;
                gap: 8px;
                min-height: 180px;
                transition: box-shadow 0.25s ease;
            }
            .library-explorer-panel .le-pulse.pulse-active {
                box-shadow: 0 0 18px rgba(96, 165, 250, 0.35);
            }
            .library-explorer-panel .pulse-header {
                font-size: 13px;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: rgba(191, 219, 254, 0.82);
            }
            .library-explorer-panel .pulse-count {
                font-size: 12px;
                color: rgba(147, 197, 253, 0.85);
            }
            .library-explorer-panel .pulse-subtitle {
                font-size: 11px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: rgba(191, 219, 254, 0.6);
                margin-bottom: 4px;
            }
            .library-explorer-panel .pulse-snippet,
            .library-explorer-panel .pulse-node {
                background: rgba(15, 23, 42, 0.55);
                border: 1px solid rgba(148, 163, 184, 0.15);
                border-radius: 8px;
                padding: 8px 10px;
            }
            .library-explorer-panel .pulse-snippet-text,
            .library-explorer-panel .pulse-node-body {
                font-size: 13px;
                line-height: 1.4;
                color: rgba(226, 232, 240, 0.9);
                white-space: pre-line;
            }
            .library-explorer-panel .pulse-node-title {
                font-size: 14px;
                font-weight: 600;
                color: rgba(248, 250, 252, 0.95);
                margin-bottom: 4px;
            }
            .library-world-modal-overlay {
                position: fixed;
                inset: 0;
                display: none;
                align-items: center;
                justify-content: center;
                background: rgba(8, 12, 18, 0.65);
                backdrop-filter: blur(16px);
                z-index: 10000;
                padding: 24px;
            }
            .library-world-modal {
                width: min(720px, 92vw);
                max-height: 82vh;
                background: rgba(15, 23, 42, 0.92);
                border: 1px solid rgba(94, 234, 212, 0.25);
                border-radius: 14px;
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 16px;
                box-shadow: 0 24px 60px rgba(8, 12, 18, 0.45);
                color: #e2e8f0;
            }
            .library-world-modal header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
            }
            .library-world-modal header h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
                color: #bae6fd;
                letter-spacing: 0.06em;
            }
            .library-world-modal header button {
                background: transparent;
                border: 1px solid rgba(94, 234, 212, 0.35);
                color: #bae6fd;
                border-radius: 8px;
                cursor: pointer;
                padding: 4px 10px;
                transition: background 0.2s ease;
            }
            .library-world-modal header button:hover {
                background: rgba(94, 234, 212, 0.18);
            }
            .library-world-modal textarea {
                width: 100%;
                flex: 1;
                min-height: 220px;
                max-height: 48vh;
                background: rgba(8, 12, 18, 0.8);
                border: 1px solid rgba(94, 234, 212, 0.3);
                border-radius: 10px;
                color: #e2e8f0;
                font-family: 'Fira Code', 'Courier New', monospace;
                font-size: 13px;
                padding: 14px;
                resize: vertical;
                line-height: 1.45;
            }
            .library-world-modal textarea:focus {
                outline: none;
                box-shadow: 0 0 0 2px rgba(94, 234, 212, 0.35);
            }
            .library-world-modal .modal-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                justify-content: flex-end;
            }
            .library-world-modal .modal-actions button {
                padding: 8px 14px;
                border-radius: 10px;
                border: 1px solid rgba(125, 211, 252, 0.4);
                background: rgba(125, 211, 252, 0.12);
                color: #bfdbfe;
                cursor: pointer;
                transition: background 0.2s ease, transform 0.2s ease;
            }
            .library-world-modal .modal-actions button:hover {
                background: rgba(125, 211, 252, 0.22);
                transform: translateY(-1px);
            }
            .library-world-modal .modal-actions button.primary {
                border-color: rgba(94, 234, 212, 0.5);
                background: rgba(94, 234, 212, 0.18);
                color: #bbf7d0;
            }
            .library-world-modal .modal-actions button.danger {
                border-color: rgba(248, 113, 113, 0.4);
                background: rgba(248, 113, 113, 0.12);
                color: #fecaca;
            }
            .library-world-modal .modal-actions button.danger:hover {
                background: rgba(248, 113, 113, 0.2);
            }
            .library-world-modal .modal-status {
                font-size: 12px;
                min-height: 18px;
                color: rgba(148, 163, 184, 0.9);
            }
            .library-world-modal .modal-status.error {
                color: #fecaca;
            }
            .library-world-modal .modal-status.success {
                color: #bbf7d0;
            }
            `;

        document.head.appendChild(style);
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
            this.selectNode(this.nodeOrder[0].id, { silent: true });
        } else {
            this.highlightSelection();
            this.renderNodeDetails();
        }

        if (options?.force && this.container) {
            this.container.classList.remove('pulse-active');
        }
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
            return `
                <div class="list-item">
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
            <div class="list-item">
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
            <div class="list-item">
                <div class="item-title">${fragment.title || fragment.id}</div>
                <div class="item-meta">${fragment.prose || fragment.summary || ''}</div>
            </div>
        `).join('');
    }

    renderMaze(worldState = {}) {
        if (!this.container) return;
        const mazeSection = this.container.querySelector('#le-maze');
        if (!mazeSection) return;

        const canvas = mazeSection.querySelector('.maze-canvas');
        const placeholder = mazeSection.querySelector('.maze-empty');
        if (!canvas) return;

        const anchors = Object.entries(worldState.anchors || {}).map(([id, anchor]) => ({
            id,
            title: anchor.label || id,
            type: 'anchor'
        }));

        const rooms = Object.entries(worldState.rooms || {}).map(([id, room]) => ({
            id,
            title: room.title || id,
            type: 'room'
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
            return;
        }

        if (placeholder) placeholder.style.display = 'none';

        const size = 240;
        const center = size / 2;
        const radius = Math.max(60, Math.min(110, (size / 2) - 20));

        const positions = new Map();
        nodes.forEach((node, index) => {
            const angle = ((2 * Math.PI) / nodes.length) * index - Math.PI / 2;
            const x = center + radius * Math.cos(angle);
            const y = center + radius * Math.sin(angle);
            positions.set(node.id, { x, y, node });
        });

        const corridors = Array.isArray(worldState.corridors) ? worldState.corridors : [];
        this.nodeOrder = nodes;
        this.positions = positions;
        this.nodeMap = new Map(nodes.map(node => [node.id, node]));
        this.buildAdjacency(corridors);

        const lines = corridors
            .map(corridor => {
                const from = positions.get(corridor.from);
                const to = positions.get(corridor.to);
                if (!from || !to) return '';
                return `<line class="maze-connection" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`;
            })
            .join('');

        const nodeMarkup = nodes
            .map(node => {
                const pos = positions.get(node.id);
                if (!pos) return '';
                const cls = node.type === 'anchor' ? 'maze-node-anchor' : 'maze-node-room';
                const radiusSize = node.type === 'anchor' ? 8 : 6;
                return `
                    <g class="maze-node" data-node-id="${node.id}">
                        <circle class="${cls}" cx="${pos.x}" cy="${pos.y}" r="${radiusSize}"></circle>
                        <circle class="maze-node-ring" cx="${pos.x}" cy="${pos.y}" r="${radiusSize + 4}"></circle>
                        <text x="${pos.x}" y="${pos.y + 18}" font-size="10" text-anchor="middle" fill="rgba(226,232,240,0.8)">${node.title}</text>
                    </g>
                `;
            })
            .join('');

        canvas.innerHTML = `
            <svg viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet">
                ${lines}
                ${nodeMarkup}
            </svg>
        `;

        this.attachMazeInteraction(canvas);
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

    attachMazeInteraction(canvas) {
        const svg = canvas.querySelector('svg');
        if (!svg) return;

        svg.querySelectorAll('.maze-node').forEach(nodeEl => {
            nodeEl.addEventListener('click', () => {
                const nodeId = nodeEl.getAttribute('data-node-id');
                if (nodeId) {
                    this.selectNode(nodeId);
                }
                canvas.focus();
            });
        });
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
                    this.stepSelection(-1);
                    event.preventDefault();
                    break;
                case 'ArrowRight':
                    this.stepSelection(1);
                    event.preventDefault();
                    break;
                case 'ArrowUp':
                    this.stepAlongCorridor(1);
                    event.preventDefault();
                    break;
                case 'ArrowDown':
                    this.stepAlongCorridor(-1);
                    event.preventDefault();
                    break;
                case 'Enter':
                    this.stepAlongCorridor(1);
                    event.preventDefault();
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
        title.textContent = 'Library Maze JSON';
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
        resetBtn.textContent = 'Reset Maze';
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
            if (!window.confirm('Reset the maze to its default seed?')) {
                return;
            }
            try {
                this.gamification?.resetLibraryWorld();
                const latest = this.gamification?.exportLibraryWorld({ pretty: true }) || '{}';
                textarea.value = latest;
                status.textContent = 'Maze reset to default.';
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
            this.selectNode(this.nodeOrder[0].id);
            return;
        }

        const currentIndex = this.nodeOrder.findIndex(node => node.id === this.selectedNodeId);
        if (currentIndex === -1) {
            this.selectNode(this.nodeOrder[0].id);
            return;
        }

        const nextIndex = (currentIndex + direction + this.nodeOrder.length) % this.nodeOrder.length;
        this.selectNode(this.nodeOrder[nextIndex].id);
    }

    stepAlongCorridor(direction = 1) {
        if (!this.selectedNodeId) {
            if (this.nodeOrder?.length) this.selectNode(this.nodeOrder[0].id);
            return;
        }

        const neighbors = Array.from(this.adjacency?.get(this.selectedNodeId) || []);
        if (!neighbors.length) {
            this.stepSelection(direction);
            return;
        }

        neighbors.sort();
        const currentIdx = Math.max(0, neighbors.indexOf(this.lastNeighborId ?? neighbors[0]));
        const nextIdx = (currentIdx + direction + neighbors.length) % neighbors.length;
        this.lastNeighborId = neighbors[nextIdx];
        this.selectNode(this.lastNeighborId);
    }

    selectNode(nodeId, options = {}) {
        if (!nodeId || !this.nodeMap?.has(nodeId)) return;
        this.selectedNodeId = nodeId;
        this.lastNeighborId = null;
        this.highlightSelection();
        this.renderNodeDetails();

        if (!options.silent) {
            const mazeCanvas = this.container?.querySelector('.maze-canvas');
            if (mazeCanvas) {
                mazeCanvas.classList.add('pulse-active');
                setTimeout(() => mazeCanvas.classList.remove('pulse-active'), 500);
            }
        }
    }

    highlightSelection() {
        const svg = this.container?.querySelector('.maze-canvas svg');
        if (!svg) return;

        svg.querySelectorAll('.maze-node').forEach(nodeEl => {
            nodeEl.classList.remove('selected');
        });

        if (!this.selectedNodeId) return;
        const selected = svg.querySelector(`.maze-node[data-node-id="${this.selectedNodeId}"]`);
        if (selected) selected.classList.add('selected');
    }

    renderNodeDetails() {
        const pulseCard = this.container?.querySelector('#le-pulse');
        if (!pulseCard) return;

        const titleEl = pulseCard.querySelector('.pulse-node-title');
        const bodyEl = pulseCard.querySelector('.pulse-node-body');
        if (!titleEl || !bodyEl) return;

        if (!this.selectedNodeId || !this.currentWorldState) {
            titleEl.textContent = 'No chamber selected';
            bodyEl.textContent = 'Use arrow keys or click the maze to explore rooms.';
            return;
        }

        const node = this.nodeMap?.get(this.selectedNodeId);
        if (!node) {
            titleEl.textContent = 'Unknown chamber';
            bodyEl.textContent = 'Lost within unmapped corridors.';
            return;
        }

        if (node.type === 'anchor') {
            const anchor = this.currentWorldState.anchors?.[node.id];
            titleEl.textContent = anchor?.label || node.id;
            const status = anchor?.unlocked ? 'Unlocked' : 'Sealed';
            bodyEl.textContent = `${anchor?.description || 'No description available.'}\nStatus: ${status}`;
        } else {
            const room = this.currentWorldState.rooms?.[node.id];
            titleEl.textContent = room?.title || node.id;
            const tags = room?.thematicTags?.length ? `Tags: ${room.thematicTags.join(', ')}` : '';
            const desc = room?.description || 'Awaiting catalogue entry.';
            bodyEl.textContent = `${desc}${tags ? `\n${tags}` : ''}`;
        }
    }

    clearNodeDetails() {
        const pulseCard = this.container?.querySelector('#le-pulse');
        if (!pulseCard) return;
        const titleEl = pulseCard.querySelector('.pulse-node-title');
        const bodyEl = pulseCard.querySelector('.pulse-node-body');
        if (titleEl) titleEl.textContent = 'No chamber selected';
        if (bodyEl) bodyEl.textContent = 'Use arrow keys or click the maze to explore rooms.';
        this.selectedNodeId = null;
        this.lastNeighborId = null;
    }

    escapeHTML(str) {
        return str.replace(/[&<>"']/g, (char) => {
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };
            return map[char] || char;
        });
    }
}

window.LibraryExplorerView = LibraryExplorerView;

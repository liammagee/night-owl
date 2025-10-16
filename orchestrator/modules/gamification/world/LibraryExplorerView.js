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
    }

    ensureContainer() {
        if (this.container && document.body.contains(this.container)) {
            return this.container;
        }

        const target = document.getElementById('editor-toolbar') || document.querySelector('.toolbar');
        if (!target) {
            console.warn('[LibraryExplorerView] Toolbar not found. Delaying UI mount.');
            return null;
        }

        const panel = document.createElement('div');
        panel.id = 'library-explorer-panel';
        panel.className = 'library-explorer-panel';
        panel.innerHTML = this.getSkeletonMarkup();

        target.insertAdjacentElement('afterend', panel);
        this.container = panel;

        this.attachEventHandlers();
        this.injectStyles();

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
                    <span class="le-status" id="le-status-indicator">Awaiting whispers</span>
                </div>
            </div>
            <div class="le-content">
                <div class="le-top">
                    <div class="le-maze" id="le-maze">
                        <div class="maze-header">
                            <span class="maze-title">Maze Overview</span>
                        </div>
                        <div class="maze-canvas"></div>
                        <div class="maze-empty">Write to awaken the corridors.</div>
                    </div>
                    <div class="le-pulse" id="le-pulse">
                        <div class="pulse-header">Live Scribing</div>
                        <div class="pulse-count">Next shard in 30 words</div>
                        <div class="pulse-text">Begin typing to awaken the stacks.</div>
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
    }

    injectStyles() {
        if (document.getElementById('library-explorer-styles')) return;

        const style = document.createElement('style');
        style.id = 'library-explorer-styles';
        style.textContent = `
            .library-explorer-panel {
                margin: 12px 24px;
                padding: 16px;
                background: rgba(9, 12, 19, 0.85);
                border: 1px solid rgba(94, 234, 212, 0.2);
                border-radius: 12px;
                color: #f9fafb;
                backdrop-filter: blur(12px);
                transition: box-shadow 0.25s ease;
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
                gap: 12px;
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
            }
            .library-explorer-panel .le-btn:hover {
                background: rgba(94, 234, 212, 0.2);
                transform: translateY(-1px);
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
            .library-explorer-panel .pulse-text {
                flex: 1;
                font-size: 13px;
                line-height: 1.4;
                color: rgba(226, 232, 240, 0.9);
                white-space: pre-line;
                position: relative;
            }
            .library-explorer-panel .pulse-text::after {
                content: '';
                position: absolute;
                inset: 0;
                background: linear-gradient(to top, rgba(15, 23, 42, 0.85), rgba(15,23,42,0));
                opacity: 0;
                transition: opacity 0.4s ease;
            }
            .library-explorer-panel .le-pulse.recent .pulse-text::after {
                opacity: 1;
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

        if (!nodes.length) {
            canvas.innerHTML = '';
            if (placeholder) placeholder.style.display = 'block';
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
        const lines = corridors
            .map(corridor => {
                const from = positions.get(corridor.from);
                const to = positions.get(corridor.to);
                if (!from || !to) return '';
                return `<line class="maze-connection" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`;
            })
            .join('');

        const circles = nodes
            .map(node => {
                const pos = positions.get(node.id);
                if (!pos) return '';
                const cls = node.type === 'anchor' ? 'maze-node-anchor' : 'maze-node-room';
                const radiusSize = node.type === 'anchor' ? 8 : 6;
                return `
                    <g>
                        <circle class="${cls}" cx="${pos.x}" cy="${pos.y}" r="${radiusSize}"></circle>
                        <text x="${pos.x}" y="${pos.y + 18}" font-size="10" text-anchor="middle" fill="rgba(226,232,240,0.8)">${node.title}</text>
                    </g>
                `;
            })
            .join('');

        canvas.innerHTML = `
            <svg viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet">
                ${lines}
                ${circles}
            </svg>
        `;
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
                    pulseCard.classList.add('pulse-active', 'recent');
                    setTimeout(() => pulseCard.classList.remove('pulse-active'), 600);
                    setTimeout(() => pulseCard.classList.remove('recent'), 1400);
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
        const textEl = pulseCard.querySelector('.pulse-text');

        if (countEl) {
            const remaining = Math.max(wordsRemaining, 0);
            const justHarvested = lastMilestoneAt && (Date.now() - lastMilestoneAt < 1800);
            const message = justHarvested
                ? `Shard harvested! (+${shardsPerInterval})`
                : `${remaining} words to next shard (+${shardsPerInterval})`;
            countEl.textContent = message;
        }

        if (textEl) {
            const displaySnippet = snippet ? this.escapeHTML(snippet).replace(/\n+/g, '\n') : 'Begin typing to awaken the stacks.';
            textEl.innerHTML = displaySnippet;
        }

        if (lastMilestoneAt && Date.now() - lastMilestoneAt < 2000) {
            pulseCard.classList.add('pulse-active');
            setTimeout(() => pulseCard.classList.remove('pulse-active'), 1600);
        }
    }

    escapeHTML(str) {
        return str.replace(/[&<>"']/g, (char) => {
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };
            return map[char] || char;
        });
    }
}

window.LibraryExplorerView = LibraryExplorerView;

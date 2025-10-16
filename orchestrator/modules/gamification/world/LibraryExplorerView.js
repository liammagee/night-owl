// === Library Explorer View ===
// Lightweight UI surface that visualizes the evolving library world

class LibraryExplorerView {
    constructor(gamificationInstance) {
        this.gamification = gamificationInstance;
        this.container = null;
        this.lastRender = 0;
        this.renderThrottle = 2000;
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
        `;
    }

    attachEventHandlers() {
        if (!this.container) return;

        const requestBtn = this.container.querySelector('#le-request-blueprint');
        if (requestBtn) {
            requestBtn.addEventListener('click', async () => {
                this.setStatus('Consulting the architect…');
                try {
                    const blueprint = await this.gamification.requestLibraryBlueprint({ context: { forcePoetic: true } });
                    if (blueprint?.parsed) {
                        this.gamification.applyLibraryBlueprint(blueprint.parsed);
                        this.setStatus('New corridors unfurled.');
                    } else {
                        this.setStatus('The architect was silent.');
                    }
                } catch (error) {
                    console.error('[LibraryExplorerView] Blueprint request failed:', error);
                    this.setStatus('Architectural resonance failed.');
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
        `;

        document.head.appendChild(style);
    }

    render(worldState, ledger) {
        const now = Date.now();
        if (now - this.lastRender < this.renderThrottle) return;
        this.lastRender = now;

        const container = this.ensureContainer();
        if (!container) return;

        this.renderAnchors(worldState?.anchors || {});
        this.renderRooms(worldState?.rooms || {});
        this.renderLore(worldState?.loreFragments || {});

        const statusEl = container.querySelector('#le-status-indicator');
        if (statusEl && ledger) {
            statusEl.textContent = `Shards ${ledger.lexiconShards || 0} • Sigils ${ledger.catalogueSigils || 0} • Tokens ${ledger.architectTokens || 0}`;
        }
    }

    renderAnchors(anchors) {
        const anchorList = this.container.querySelector('#le-anchors .list');
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
        const roomList = this.container.querySelector('#le-rooms .list');
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
        const loreList = this.container.querySelector('#le-lore .list');
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

    setStatus(message) {
        if (!this.container) return;
        const statusEl = this.container.querySelector('#le-status-indicator');
        if (statusEl) {
            statusEl.textContent = message;
        }
    }

    toggleVisibility() {
        const container = this.ensureContainer();
        if (!container) return false;
        container.classList.toggle('le-hidden');
        return !container.classList.contains('le-hidden');
    }
}

window.LibraryExplorerView = LibraryExplorerView;

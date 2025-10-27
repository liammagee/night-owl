// === Library World Engine ===
// Maintains the spatial Library of Babel progression state

class LibraryWorldEngine {
    constructor(gamificationInstance) {
        this.gamification = gamificationInstance;
        this.dataPersistence = gamificationInstance?.dataPersistence;

        this.worldState = this.loadWorldState();
        this.pendingEvents = [];
        this.architectQueue = [];

        this.ensureBaselineAnchors();
    }

    loadWorldState() {
        if (!this.dataPersistence?.loadWorldState) {
            console.warn('[LibraryWorldEngine] DataPersistence missing world state loader. Using fallback state.');
            return this.getDefaultState();
        }

        const stored = this.dataPersistence.loadWorldState();
        return this.normalizeWorldState(stored);
    }

    getDefaultState() {
        const timestamp = new Date().toISOString();
        return {
            version: 1,
            anchors: {},
            corridors: [],
            rooms: {},
            loreFragments: {},
            architectDecisions: [],
            mazeLayout: this.createDefaultMazeLayout(),
            lastUpdated: timestamp
        };
    }

    normalizeWorldState(state) {
        if (!state || typeof state !== 'object') {
            return this.getDefaultState();
        }

        const defaults = this.createDefaultMazeLayout();
        const layout = state.mazeLayout && typeof state.mazeLayout === 'object' ? state.mazeLayout : {};

        const normalized = {
            version: state.version || 1,
            anchors: state.anchors || {},
            corridors: Array.isArray(state.corridors) ? state.corridors : [],
            rooms: state.rooms || {},
            loreFragments: state.loreFragments || {},
            architectDecisions: Array.isArray(state.architectDecisions) ? state.architectDecisions : [],
            mazeLayout: {
                ...defaults,
                ...layout,
                assignments: { ...defaults.assignments, ...(layout.assignments || {}) },
                slots: { ...defaults.slots, ...(layout.slots || {}) },
                branchState: { ...defaults.branchState, ...(layout.branchState || {}) },
                rebalanceHistory: Array.isArray(layout.rebalanceHistory) ? layout.rebalanceHistory : defaults.rebalanceHistory
            },
            lastUpdated: state.lastUpdated || new Date().toISOString()
        };

        return normalized;
    }

    ensureBaselineAnchors() {
        const defaultAnchors = {
            scriptorium: {
                label: 'The Scriptorium',
                description: 'Where drafts gather in fragile stacks before they become lore.',
                unlocked: true,
                createdAt: this.worldState.lastUpdated
            },
            flowAtrium: {
                label: 'Atrium of Flow',
                description: 'A quiet hall that resonates with the cadence of sustained writing.',
                unlocked: false
            },
            revisionVault: {
                label: 'Vault of Revisions',
                description: 'Shelves for rewritten passages and their echoes.',
                unlocked: false
            }
        };

        Object.entries(defaultAnchors).forEach(([key, value]) => {
            if (!this.worldState.anchors[key]) {
                this.worldState.anchors[key] = value;
            }
        });

        this.saveWorldState();
    }

    createDefaultMazeLayout() {
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

    recordProgressEvent(event) {
        if (!event || typeof event !== 'object') return;

        const enrichedEvent = {
            id: event.id || `event-${Date.now()}`,
            type: event.type || 'unknown',
            payload: event.payload || {},
            createdAt: event.createdAt || new Date().toISOString()
        };

        this.pendingEvents.push(enrichedEvent);

        if (this.pendingEvents.length > 50) {
            this.pendingEvents.shift();
        }
    }

    queueArchitectPrompt(context) {
        const entry = {
            id: `architect-${Date.now()}`,
            context,
            createdAt: new Date().toISOString(),
            status: 'pending'
        };

        this.architectQueue.push(entry);
        return entry;
    }

    registerArchitectDecision(decision, options = {}) {
        const { apply = true } = options;
        if (!decision || typeof decision !== 'object') return;

        const enrichedDecision = {
            id: decision.id || `decision-${Date.now()}`,
            rooms: decision.rooms || [],
            corridors: decision.corridors || [],
            loreFragments: decision.loreFragments || [],
            summary: decision.summary || '',
            createdAt: decision.createdAt || new Date().toISOString()
        };

        this.worldState.architectDecisions.push(enrichedDecision);
        if (apply) {
            this.applyDecision(enrichedDecision);
        }
        this.saveWorldState();
    }

    applyDecision(decision) {
        decision.rooms.forEach(room => this.addRoom(room));
        decision.corridors.forEach(corridor => this.addCorridor(corridor));
        decision.loreFragments.forEach(fragment => this.addLoreFragment(fragment));
    }

    addRoom(room) {
        if (!room || !room.id) return;

        this.worldState.rooms[room.id] = {
            ...room,
            createdAt: room.createdAt || new Date().toISOString()
        };

        this.worldState.lastUpdated = new Date().toISOString();
        this.saveWorldState();
    }

    addCorridor(corridor) {
        if (!corridor || !corridor.from || !corridor.to) return;

        const exists = this.worldState.corridors.some(existing =>
            existing.from === corridor.from && existing.to === corridor.to
        );

        if (!exists) {
            this.worldState.corridors.push({
                ...corridor,
                createdAt: corridor.createdAt || new Date().toISOString()
            });

            this.worldState.lastUpdated = new Date().toISOString();
            this.saveWorldState();
        }
    }

    addLoreFragment(fragment) {
        if (!fragment || !fragment.id) return;

        this.worldState.loreFragments[fragment.id] = {
            ...fragment,
            createdAt: fragment.createdAt || new Date().toISOString()
        };

        this.worldState.lastUpdated = new Date().toISOString();
        this.saveWorldState();
    }

    unlockAnchor(anchorId, metadata = {}) {
        if (!anchorId || !this.worldState.anchors[anchorId]) return;

        const anchor = this.worldState.anchors[anchorId];

        this.worldState.anchors[anchorId] = {
            ...anchor,
            ...metadata,
            unlocked: true,
            unlockedAt: metadata.unlockedAt || new Date().toISOString()
        };

        this.worldState.lastUpdated = new Date().toISOString();
        this.saveWorldState();
    }

    getWorldState() {
        return { ...this.worldState };
    }

    getMazeLayoutState() {
        if (!this.worldState.mazeLayout || typeof this.worldState.mazeLayout !== 'object') {
            this.worldState.mazeLayout = this.createDefaultMazeLayout();
        } else {
            const defaults = this.createDefaultMazeLayout();
            const current = this.worldState.mazeLayout;
            this.worldState.mazeLayout = {
                ...defaults,
                ...current,
                assignments: { ...defaults.assignments, ...(current.assignments || {}) },
                slots: { ...defaults.slots, ...(current.slots || {}) },
                branchState: { ...defaults.branchState, ...(current.branchState || {}) },
                rebalanceHistory: Array.isArray(current.rebalanceHistory) ? current.rebalanceHistory : defaults.rebalanceHistory
            };
        }
        return this.worldState.mazeLayout;
    }

    updateMazeLayout(partial = {}) {
        if (!partial || typeof partial !== 'object') {
            return this.getMazeLayoutState();
        }

        const current = this.getMazeLayoutState();
        const merged = {
            ...current,
            ...partial
        };

        if (partial.assignments === null) {
            merged.assignments = {};
        } else if (partial.assignments) {
            merged.assignments = { ...partial.assignments };
        } else {
            merged.assignments = { ...current.assignments };
        }

        if (partial.slots === null) {
            merged.slots = {};
        } else if (partial.slots) {
            merged.slots = { ...partial.slots };
        } else {
            merged.slots = { ...current.slots };
        }

        if (partial.branchState === null) {
            merged.branchState = {};
        } else if (partial.branchState) {
            merged.branchState = { ...current.branchState, ...partial.branchState };
        } else {
            merged.branchState = { ...current.branchState };
        }

        if (Array.isArray(partial.rebalanceHistory)) {
            merged.rebalanceHistory = partial.rebalanceHistory;
        }

        if (partial.pendingArrangement === null) {
            merged.pendingArrangement = null;
        } else if (partial.pendingArrangement) {
            merged.pendingArrangement = partial.pendingArrangement;
        }

        if (partial.lastArrangement === null) {
            merged.lastArrangement = null;
        } else if (partial.lastArrangement) {
            merged.lastArrangement = partial.lastArrangement;
        }

        if (partial.lastRebalancedAt) {
            merged.lastRebalancedAt = partial.lastRebalancedAt;
        }

        if (typeof partial.lastRebalancedNodeCount === 'number') {
            merged.lastRebalancedNodeCount = partial.lastRebalancedNodeCount;
        }

        if (partial.lastRebalanceAttemptAt) {
            merged.lastRebalanceAttemptAt = partial.lastRebalanceAttemptAt;
        }

        if (partial.lastAshResponse === null) {
            merged.lastAshResponse = null;
        } else if (partial.lastAshResponse) {
            merged.lastAshResponse = partial.lastAshResponse;
        }

        merged.lastLayoutAt = partial.lastLayoutAt || merged.lastLayoutAt || new Date().toISOString();
        merged.lastLayoutNodeCount = typeof partial.lastLayoutNodeCount === 'number'
            ? partial.lastLayoutNodeCount
            : merged.lastLayoutNodeCount || 0;

        this.worldState.mazeLayout = merged;
        this.worldState.lastUpdated = new Date().toISOString();
        this.saveWorldState();
        return this.worldState.mazeLayout;
    }

    recordMazeRebalance(entry = {}) {
        const layout = this.getMazeLayoutState();
        const history = Array.isArray(layout.rebalanceHistory) ? [...layout.rebalanceHistory] : [];

        const normalized = {
            id: entry.id || `rebalance-${Date.now()}`,
            summary: entry.summary || '',
            arrangement: entry.arrangement || null,
            notes: entry.notes || '',
            createdAt: entry.createdAt || new Date().toISOString(),
            nodeCount: entry.nodeCount || layout.lastRebalancedNodeCount || 0
        };

        history.push(normalized);
        while (history.length > 12) {
            history.shift();
        }

        return this.updateMazeLayout({
            lastRebalancedAt: normalized.createdAt,
            lastRebalancedNodeCount: normalized.nodeCount,
            rebalanceHistory: history,
            lastAshResponse: entry.lastAshResponse || layout.lastAshResponse || null
        });
    }

    exportWorldState(pretty = false) {
        const state = this.getWorldState();
        return pretty ? JSON.stringify(state, null, 2) : JSON.stringify(state);
    }

    replaceWorldState(newState, { recordEvent = true } = {}) {
        if (!newState || typeof newState !== 'object') {
            throw new Error('[LibraryWorldEngine] Invalid world state supplied');
        }

        const normalized = this.normalizeWorldState(newState);
        this.worldState = normalized;
        this.ensureBaselineAnchors();
        this.saveWorldState();

        if (recordEvent && this.gamification?.recordWorldEvent) {
            this.gamification.recordWorldEvent({
                type: 'world.reloaded',
                payload: {
                    anchors: Object.keys(this.worldState.anchors || {}),
                    rooms: Object.keys(this.worldState.rooms || {}),
                    corridors: (this.worldState.corridors || []).length
                }
            });
        }
    }

    consumeArchitectQueue(ids = null) {
        if (!ids || ids.length === 0) {
            const queue = [...this.architectQueue];
            this.architectQueue = [];
            return queue;
        }

        const idSet = new Set(ids);
        const consumed = this.architectQueue.filter(entry => idSet.has(entry.id));
        this.architectQueue = this.architectQueue.filter(entry => !idSet.has(entry.id));
        return consumed;
    }

    peekArchitectQueue() {
        return [...this.architectQueue];
    }

    saveWorldState() {
        if (!this.dataPersistence?.saveWorldState) return;
        this.dataPersistence.saveWorldState(this.worldState);
    }
}

window.LibraryWorldEngine = LibraryWorldEngine;

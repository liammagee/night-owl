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
            lastUpdated: timestamp
        };
    }

    normalizeWorldState(state) {
        if (!state || typeof state !== 'object') {
            return this.getDefaultState();
        }

        const normalized = {
            version: state.version || 1,
            anchors: state.anchors || {},
            corridors: Array.isArray(state.corridors) ? state.corridors : [],
            rooms: state.rooms || {},
            loreFragments: state.loreFragments || {},
            architectDecisions: Array.isArray(state.architectDecisions) ? state.architectDecisions : [],
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

    consumeArchitectQueue() {
        const queue = [...this.architectQueue];
        this.architectQueue = [];
        return queue;
    }

    saveWorldState() {
        if (!this.dataPersistence?.saveWorldState) return;
        this.dataPersistence.saveWorldState(this.worldState);
    }
}

window.LibraryWorldEngine = LibraryWorldEngine;

// === Library World Engine ===
// Maintains the spatial Library of Babel progression state
// Rooms, anchors, and corridors are now grounded in recognition theory:
//   Anchors map to memory layers (conscious, preconscious, unconscious)
//   Rooms spawn from recognition moments and memory consolidation
//   Corridors represent transitions between layers

class LibraryWorldEngine {
    constructor(gamificationInstance) {
        this.gamification = gamificationInstance;
        this.dataPersistence = gamificationInstance?.dataPersistence;
        this.tutorBridge = null; // Lazy-initialized from window.TutorBridge

        this.worldState = this.loadWorldState();
        this.pendingEvents = [];
        this.architectQueue = [];

        this.ensureBaselineAnchors();
    }

    /**
     * Get the tutor bridge reference (lazy init from window).
     * @returns {object|null}
     */
    _getTutorBridge() {
        if (this.tutorBridge) return this.tutorBridge;
        if (typeof window !== 'undefined' && window.TutorBridge && window.TutorBridge.isAvailable()) {
            this.tutorBridge = window.TutorBridge;
        }
        return this.tutorBridge;
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
        // Anchors map to the three-layer memory model from recognition theory:
        //   Conscious  (ephemeral, active working space)
        //   Preconscious (patterns crystallizing, not yet permanent)
        //   Unconscious (permanent traces, deep understanding)
        const defaultAnchors = {
            scriptorium: {
                label: 'The Scriptorium',
                description: 'Where drafts gather in fragile stacks before they become lore.',
                memoryLayer: 'conscious',
                unlocked: true,
                createdAt: this.worldState.lastUpdated
            },
            flowAtrium: {
                label: 'Atrium of Flow',
                description: 'A quiet hall where emerging patterns crystallize into understanding.',
                memoryLayer: 'preconscious',
                unlocked: false
            },
            revisionVault: {
                label: 'Vault of Revisions',
                description: 'Deep shelves where permanent traces of understanding are inscribed.',
                memoryLayer: 'unconscious',
                unlocked: false
            }
        };

        Object.entries(defaultAnchors).forEach(([key, value]) => {
            if (!this.worldState.anchors[key]) {
                this.worldState.anchors[key] = value;
            } else if (!this.worldState.anchors[key].memoryLayer) {
                // Backfill memoryLayer for existing anchors
                this.worldState.anchors[key].memoryLayer = value.memoryLayer;
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

        // Handle recognition-specific events
        if (event.type === 'recognition.consolidated') {
            this.spawnRoomFromConsolidation(event.payload);
        } else if (event.type === 'recognition.milestone') {
            this.handleRecognitionMilestone(event.payload);
        }
    }

    /**
     * Spawn a room from a recognition moment that has been consolidated
     * to the unconscious (permanent memory) layer.
     *
     * @param {object} payload
     * @param {string} [payload.synthesis] - The synthesis resolution text.
     * @param {string} [payload.momentId] - The recognition moment ID.
     * @param {string} [payload.layer] - The target memory layer.
     */
    spawnRoomFromConsolidation(payload = {}) {
        const now = Date.now();
        const layer = payload.layer || 'unconscious';

        // Map memory layer to anchor
        const anchorMap = {
            conscious: 'scriptorium',
            preconscious: 'flowAtrium',
            unconscious: 'revisionVault'
        };
        const anchorId = anchorMap[layer] || 'scriptorium';

        // Auto-unlock the target anchor if it is still locked
        if (this.worldState.anchors[anchorId] && !this.worldState.anchors[anchorId].unlocked) {
            this.unlockAnchor(anchorId, {
                unlockedBy: 'recognition_consolidation',
                momentId: payload.momentId
            });
            console.log(`[LibraryWorldEngine] Anchor '${anchorId}' unlocked by memory consolidation`);
        }

        const roomId = `recognition-${now}-${Math.floor(Math.random() * 1000)}`;
        const synthesis = payload.synthesis || '';
        const words = synthesis.split(/\s+/).filter(Boolean);
        const title = words.slice(0, 4).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') || `Trace ${new Date(now).toLocaleTimeString()}`;

        const room = {
            id: roomId,
            title,
            description: synthesis ? `Consolidated insight: ${synthesis.slice(0, 200)}` : 'A permanent trace of understanding.',
            anchor: anchorId,
            memoryLayer: layer,
            recognitionMomentId: payload.momentId || null,
            unlockCost: { lexiconShards: 0, catalogueSigils: 0, architectTokens: 0 },
            thematicTags: words.filter(w => w.length > 4).slice(-4).map(w => w.toLowerCase())
        };

        const corridor = {
            from: anchorId,
            to: roomId,
            description: `A corridor formed from ${layer} consolidation.`,
            transitionType: layer === 'unconscious' ? 'consolidation' : 'promotion'
        };

        const loreFragment = {
            id: `lore-${roomId}`,
            roomId,
            prose: synthesis || 'A trace of understanding, permanently inscribed.'
        };

        this.addRoom(room);
        this.addCorridor(corridor);
        this.addLoreFragment(loreFragment);
    }

    /**
     * Handle a recognition milestone achievement (e.g. first_negation, productive_resistance).
     *
     * @param {object} payload
     * @param {string} payload.milestoneKey - The milestone key.
     * @param {string} [payload.title] - The milestone title.
     * @param {string} [payload.description] - The milestone description.
     */
    handleRecognitionMilestone(payload = {}) {
        if (!payload.milestoneKey) return;

        // Queue an architect prompt with the milestone data
        this.queueArchitectPrompt({
            event: {
                type: 'recognition.milestone',
                milestone: payload.milestoneKey,
                title: payload.title,
                description: payload.description
            }
        });

        console.log(`[LibraryWorldEngine] Recognition milestone '${payload.milestoneKey}' queued for architect review`);
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

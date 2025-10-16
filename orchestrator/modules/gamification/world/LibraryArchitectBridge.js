// === Library Architect Bridge ===
// Prepares world context and collaborates with the AI companion to expand the library

class LibraryArchitectBridge {
    constructor(gamificationInstance) {
        this.gamification = gamificationInstance;
        this.worldEngine = gamificationInstance.worldEngine;
        this.inFlight = false;
        this.lastBlueprint = null;
        this.lastRequest = null;
    }

    getActiveCompanion() {
        return this.gamification.aiCompanion || window.aiCompanion || null;
    }

    canRequestBlueprint() {
        const companion = this.getActiveCompanion();
        return !!(companion && typeof companion.callAIService === 'function');
    }

    buildPrompt(context = {}) {
        const worldState = this.worldEngine?.getWorldState?.() || {};
        const recentEvents = (this.worldEngine?.pendingEvents || []).slice(-10);
        const ledger = this.gamification?.resourceLedger || {};
        const stats = this.gamification?.getStats?.() || {};

        return `
You are the Library Architect, tasked with extending a Library-of-Babel style world that reflects a writer's ongoing practice.

World snapshot (JSON):
${JSON.stringify(worldState, null, 2)}

Recent writing events (latest first):
${recentEvents.map(event => `- ${event.type}: ${JSON.stringify(event.payload)}`).join('\n')}

Resource ledger:
${JSON.stringify(ledger, null, 2)}

Writing analytics summary:
${JSON.stringify({
    flowMetrics: stats.flowMetrics,
    daily: stats.dailyStats,
    achievements: stats.achievements
}, null, 2)}

Your task:
1. Propose zero or more new rooms, corridors, and lore fragments that resonate with these events.
2. Each room must include: id, title, description, anchor (existing or new), unlockCost (lexiconShards, catalogueSigils, architectTokens), and thematicTags.
3. Corridors must connect two room ids.
4. Lore fragments are brief narratives tied to a room id.
5. When appropriate, mark existing anchors for unlock with conditions.

Output strict JSON with shape:
{
  "summary": "Short poetic overview of changes",
  "rooms": [ { ... } ],
  "corridors": [ { from, to, description } ],
  "loreFragments": [ { id, roomId, prose } ],
  "anchorsToUnlock": [ { anchorId, rationale } ],
  "resourceRecommendations": {
     "lexiconShards": number,
     "catalogueSigils": number,
     "architectTokens": number
  }
}

Do not include any additional commentary outside JSON.
${context.forcePoetic ? '\nLean into dreamlike metaphors but keep JSON valid.\n' : ''}
        `.trim();
    }

    async requestBlueprint(options = {}) {
        if (!this.canRequestBlueprint()) {
            console.warn('[LibraryArchitectBridge] AI companion not ready for blueprint generation.');
            return null;
        }

        if (this.inFlight && !options.force) {
            console.warn('[LibraryArchitectBridge] Blueprint request already in flight.');
            return null;
        }

        this.inFlight = true;
        this.lastRequest = {
            initiatedAt: Date.now(),
            options
        };

        const companion = this.getActiveCompanion();
        const prompt = this.buildPrompt(options.context);

        try {
            const response = await companion.callAIService(prompt, {
                context: 'library_architect',
                newConversation: true
            });

            if (!response?.message) {
                console.warn('[LibraryArchitectBridge] No response from AI architect.');
                return null;
            }

            const blueprint = this.parseBlueprint(response.message);
            this.lastBlueprint = {
                raw: response.message,
                parsed: blueprint,
                receivedAt: Date.now()
            };

            return this.lastBlueprint;
        } catch (error) {
            console.error('[LibraryArchitectBridge] Blueprint request failed:', error);
            return null;
        } finally {
            this.inFlight = false;
        }
    }

    parseBlueprint(message) {
        try {
            const trimmed = message.trim();
            const jsonStart = trimmed.indexOf('{');
            const jsonEnd = trimmed.lastIndexOf('}');

            if (jsonStart === -1 || jsonEnd === -1) {
                throw new Error('No JSON object detected in response.');
            }

            const jsonString = trimmed.slice(jsonStart, jsonEnd + 1);
            return JSON.parse(jsonString);
        } catch (error) {
            console.error('[LibraryArchitectBridge] Failed to parse blueprint JSON:', error);
            return null;
        }
    }

    applyBlueprint(blueprint) {
        if (!blueprint || !this.worldEngine) return false;

        const { rooms = [], corridors = [], loreFragments = [], anchorsToUnlock = [] } = blueprint;

        rooms.forEach(room => this.worldEngine.addRoom(room));
        corridors.forEach(corridor => this.worldEngine.addCorridor(corridor));
        loreFragments.forEach(fragment => this.worldEngine.addLoreFragment(fragment));
        anchorsToUnlock.forEach(anchor => this.worldEngine.unlockAnchor(anchor.anchorId, anchor));

        this.worldEngine.registerArchitectDecision({
            summary: blueprint.summary || '',
            rooms,
            corridors,
            loreFragments
        }, { apply: false });

        this.gamification.recordWorldEvent({
            type: 'world.architectureApplied',
            payload: {
                roomCount: rooms.length,
                corridorCount: corridors.length,
                loreCount: loreFragments.length,
                summary: blueprint.summary || ''
            }
        });

        return true;
    }
}

window.LibraryArchitectBridge = LibraryArchitectBridge;

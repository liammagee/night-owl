// === Tutor Bridge ===
// Bridges @machinespirits/tutor-core into NightOwl's Electron environment.
// Uses dynamic import() since tutor-core is an ES module and NightOwl is CommonJS.

let tutorCore = null;
let bridgeState = {
    initialized: false,
    learnerId: 'local-writer',
    initError: null
};

/**
 * Dynamically load tutor-core ES module from CommonJS context.
 * @returns {object|null} The tutor-core module namespace, or null on failure.
 */
async function loadTutorCore() {
    if (tutorCore) return tutorCore;

    try {
        tutorCore = await import('@machinespirits/tutor-core');
        console.log('[TutorBridge] tutor-core loaded successfully');
        return tutorCore;
    } catch (error) {
        console.warn('[TutorBridge] Could not load tutor-core:', error.message);
        return null;
    }
}

/**
 * Initialize the tutor bridge for the local user.
 * Sets up the database, writing pad, and verifies tutor-core availability.
 *
 * @param {object} [options]
 * @param {string} [options.learnerId] - Override default learner ID.
 * @param {string} [options.dbPath] - Database path for tutor-core storage.
 * @returns {object} Bridge status.
 */
async function initTutorBridge(options = {}) {
    if (bridgeState.initialized) {
        return { ok: true, learnerId: bridgeState.learnerId };
    }

    const learnerId = options.learnerId || bridgeState.learnerId;
    bridgeState.learnerId = learnerId;

    const core = await loadTutorCore();
    if (!core) {
        bridgeState.initError = 'tutor-core not available';
        console.warn('[TutorBridge] Initialization skipped - tutor-core not available. Falling back to native NightOwl behaviour.');
        return { ok: false, error: bridgeState.initError };
    }

    try {
        // Configure database path before first use
        if (options.dbPath && core.initDb) {
            try {
                core.initDb({ dbPath: options.dbPath });
                console.log(`[TutorBridge] Database configured at: ${options.dbPath}`);
            } catch (dbErr) {
                // initDb throws if already initialized - that's fine
                console.log(`[TutorBridge] Database already initialized: ${dbErr.message}`);
            }
        }

        // Initialize writing pad for the local writer
        if (core.writingPadService && core.writingPadService.initializeWritingPad) {
            core.writingPadService.initializeWritingPad(learnerId);
            console.log(`[TutorBridge] Writing pad initialized for learner: ${learnerId}`);
        }

        // Run initial maintenance cycle
        if (core.recognitionOrchestrator) {
            const maintenance = core.recognitionOrchestrator.runMaintenance(learnerId);
            console.log(`[TutorBridge] Initial maintenance completed:`, maintenance.tasks);
        }

        bridgeState.initialized = true;
        bridgeState.initError = null;
        console.log('[TutorBridge] Bridge initialized successfully');
        return { ok: true, learnerId };
    } catch (error) {
        bridgeState.initError = error.message;
        console.error('[TutorBridge] Initialization failed:', error.message);
        return { ok: false, error: error.message };
    }
}

/**
 * Route an AI dialogue request through tutor-core's Ego/Superego engine.
 *
 * @param {object} context
 * @param {string} context.message - The learner's message or query.
 * @param {string} [context.profile] - Tutor profile name (e.g. 'budget', 'experimental').
 * @param {object} [context.sessionState] - NightOwl session state for context building.
 * @returns {object|null} Dialogue result, or null if tutor-core unavailable.
 */
async function routeDialogue(context = {}) {
    const core = await loadTutorCore();
    if (!core || !core.tutorDialogueEngine) {
        return null;
    }

    try {
        const learnerContext = buildLearnerContext(context.sessionState);

        const result = await core.tutorDialogueEngine.runDialogue({
            learnerMessage: context.message,
            learnerContext,
            profile: context.profile || 'budget',
        });

        return result;
    } catch (error) {
        console.error('[TutorBridge] Dialogue routing failed:', error.message);
        return null;
    }
}

// ============================================================================
// Recognition Pipeline (via orchestrator)
// ============================================================================

/**
 * Process a dialogue result through the full recognition pipeline.
 *
 * Call this after routeDialogue() returns. Chains all 5 recognition phases:
 * Phase 1 (WritingPad) → Phase 2 (DialecticalEngine) → Phase 3 (LearnerIntegration)
 *    → Phase 4 (MemoryDynamics) → Phase 5 (RecognitionGamification)
 *
 * @param {object} dialogueResult - Result from routeDialogue() or tutorDialogueEngine.runDialogue()
 * @param {object} [learnerResponse] - How the learner responded to the suggestion
 * @param {object} [options] - Additional options (e.g. { sessionId })
 * @returns {object|null} Pipeline result with enriched recognition state, or null if unavailable.
 */
async function processDialogueResult(dialogueResult, learnerResponse = null, options = {}) {
    const core = await loadTutorCore();
    if (!core || !core.recognitionOrchestrator) return null;

    try {
        return core.recognitionOrchestrator.processDialogueResult(
            bridgeState.learnerId,
            dialogueResult,
            learnerResponse,
            options
        );
    } catch (error) {
        console.error('[TutorBridge] processDialogueResult failed:', error.message);
        return null;
    }
}

/**
 * Process a writing event through the full recognition pipeline.
 *
 * Replaces the old per-event-type logic with the orchestrated pipeline.
 *
 * @param {object} event
 * @param {string} event.type - Event type: 'analysis_complete', 'feedback_response', 'flow_change'.
 * @param {object} [event.data] - Event-specific payload.
 * @param {object} [options] - Additional options (e.g. { sessionId })
 * @returns {object|null} Pipeline result with recognition state, or null if unavailable.
 */
async function processWritingEvent(event = {}, options = {}) {
    const core = await loadTutorCore();
    if (!core || !core.recognitionOrchestrator) return null;

    try {
        return core.recognitionOrchestrator.processWritingEvent(
            bridgeState.learnerId,
            event,
            options
        );
    } catch (error) {
        console.error('[TutorBridge] processWritingEvent failed:', error.message);
        return null;
    }
}

/**
 * Record a writing event and translate it into recognition primitives.
 *
 * BACKWARD COMPATIBLE: Delegates to processWritingEvent() for full pipeline execution.
 *
 * @param {object} event
 * @param {string} event.type - Event type: 'analysis_complete', 'feedback_response', 'flow_change'.
 * @param {object} [event.data] - Event-specific payload.
 */
async function recordWritingEvent(event = {}) {
    return processWritingEvent(event);
}

/**
 * Get the full recognition state across all 5 phases.
 *
 * Returns writing pad state, dialectical history, learner patterns,
 * memory state, and gamification profile.
 *
 * @returns {object|null} Full recognition state, or null if unavailable.
 */
async function getFullRecognitionState() {
    const core = await loadTutorCore();
    if (!core || !core.recognitionOrchestrator) return null;

    try {
        return core.recognitionOrchestrator.getFullRecognitionState(bridgeState.learnerId);
    } catch (error) {
        console.error('[TutorBridge] getFullRecognitionState failed:', error.message);
        return null;
    }
}

/**
 * Get the current recognition state (Phase 5 gamification only).
 *
 * BACKWARD COMPATIBLE: Returns just the gamification profile.
 * For full pipeline state, use getFullRecognitionState() instead.
 *
 * @returns {object|null} Recognition profile, or null if tutor-core unavailable.
 */
async function getRecognitionState() {
    const core = await loadTutorCore();
    if (!core || !core.recognitionGamificationService) {
        return null;
    }

    try {
        const profile = core.recognitionGamificationService.getLearnerRecognitionProfile(bridgeState.learnerId);
        return profile;
    } catch (error) {
        console.error('[TutorBridge] Failed to get recognition state:', error.message);
        return null;
    }
}

/**
 * Get dialectical history (recent recognition moments with ego/superego traces).
 *
 * @param {object} [options] - { limit: number }
 * @returns {Array} Recognition moments, or empty array if unavailable.
 */
async function getDialecticalHistory(options = {}) {
    const core = await loadTutorCore();
    if (!core || !core.recognitionOrchestrator) return [];

    try {
        return core.recognitionOrchestrator.getDialecticalHistory(bridgeState.learnerId, options);
    } catch (error) {
        console.error('[TutorBridge] getDialecticalHistory failed:', error.message);
        return [];
    }
}

/**
 * Get memory state across Freud's 3 layers (conscious/preconscious/unconscious).
 *
 * @returns {object|null} Memory state, or null if unavailable.
 */
async function getMemoryState() {
    const core = await loadTutorCore();
    if (!core || !core.recognitionOrchestrator) return null;

    try {
        return core.recognitionOrchestrator.getMemoryState(bridgeState.learnerId);
    } catch (error) {
        console.error('[TutorBridge] getMemoryState failed:', error.message);
        return null;
    }
}

/**
 * Get learner pattern analysis (resistance, breakthrough, demand distributions).
 *
 * @returns {object|null} Learner patterns, or null if unavailable.
 */
async function getLearnerPatterns() {
    const core = await loadTutorCore();
    if (!core || !core.recognitionOrchestrator) return null;

    try {
        return core.recognitionOrchestrator.getLearnerPatterns(bridgeState.learnerId);
    } catch (error) {
        console.error('[TutorBridge] getLearnerPatterns failed:', error.message);
        return null;
    }
}

/**
 * Run periodic maintenance tasks (memory consolidation, archetype evolution).
 *
 * Should be called on session start and periodically (~30 minutes).
 *
 * @returns {object|null} Maintenance results, or null if unavailable.
 */
async function runMaintenance() {
    const core = await loadTutorCore();
    if (!core || !core.recognitionOrchestrator) return null;

    try {
        return core.recognitionOrchestrator.runMaintenance(bridgeState.learnerId);
    } catch (error) {
        console.error('[TutorBridge] runMaintenance failed:', error.message);
        return null;
    }
}

/**
 * Switch the active tutor profile.
 *
 * @param {string} profileName - Profile to switch to (e.g. 'budget', 'experimental').
 * @returns {object|null} Active profile configuration, or null if unavailable.
 */
async function switchProfile(profileName) {
    const core = await loadTutorCore();
    if (!core || !core.tutorConfigLoader) return null;

    try {
        const config = core.tutorConfigLoader.loadConfig();
        const profiles = config?.profiles || {};
        if (!profiles[profileName]) {
            return { error: `Profile '${profileName}' not found` };
        }
        return { name: profileName, config: profiles[profileName] };
    } catch (error) {
        console.error('[TutorBridge] switchProfile failed:', error.message);
        return null;
    }
}

/**
 * List available tutor profiles.
 *
 * @returns {Array} Profile names, or empty array if unavailable.
 */
async function listProfiles() {
    const core = await loadTutorCore();
    if (!core || !core.tutorConfigLoader) return [];

    try {
        return core.tutorConfigLoader.listProfiles();
    } catch (error) {
        console.error('[TutorBridge] listProfiles failed:', error.message);
        return [];
    }
}

/**
 * Get monitoring metrics from tutor-core's monitoring service.
 *
 * @returns {object|null} Monitoring metrics, or null if unavailable.
 */
async function getMonitoringMetrics() {
    const core = await loadTutorCore();
    if (!core || !core.monitoringService) return null;

    try {
        return core.monitoringService.getMetrics();
    } catch (error) {
        console.error('[TutorBridge] getMonitoringMetrics failed:', error.message);
        return null;
    }
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Build learner context from NightOwl's session state for tutor-core dialogue.
 *
 * @param {object} [sessionState] - NightOwl session state.
 * @returns {object} Learner context compatible with tutor-core.
 */
function buildLearnerContext(sessionState = {}) {
    return {
        learnerId: bridgeState.learnerId,
        currentContent: sessionState.currentText || '',
        recentActivity: sessionState.recentActivity || '',
        flowState: sessionState.flowState || 'unknown',
        sessionDuration: sessionState.sessionDuration || 0,
        wordCount: sessionState.wordCount || 0,
        source: 'nightowl',
    };
}

/**
 * Check whether the bridge is available and initialized.
 * @returns {boolean}
 */
function isAvailable() {
    return bridgeState.initialized && tutorCore !== null;
}

// Export for CommonJS consumption
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        // Original functions (backward compatible)
        initTutorBridge,
        routeDialogue,
        recordWritingEvent,
        getRecognitionState,
        isAvailable,
        // Recognition pipeline (new)
        processDialogueResult,
        processWritingEvent,
        getFullRecognitionState,
        getDialecticalHistory,
        getMemoryState,
        getLearnerPatterns,
        runMaintenance,
        // Profile management (new)
        switchProfile,
        listProfiles,
        // Monitoring (new)
        getMonitoringMetrics,
    };
}

// Also expose on window for renderer process access
if (typeof window !== 'undefined') {
    window.TutorBridge = {
        // Original functions (backward compatible)
        initTutorBridge,
        routeDialogue,
        recordWritingEvent,
        getRecognitionState,
        isAvailable,
        // Recognition pipeline (new)
        processDialogueResult,
        processWritingEvent,
        getFullRecognitionState,
        getDialecticalHistory,
        getMemoryState,
        getLearnerPatterns,
        runMaintenance,
        // Profile management (new)
        switchProfile,
        listProfiles,
        // Monitoring (new)
        getMonitoringMetrics,
    };
}

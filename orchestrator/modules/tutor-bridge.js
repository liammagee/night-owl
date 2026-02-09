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
 * Sets up the writing pad and verifies tutor-core availability.
 *
 * @param {object} [options]
 * @param {string} [options.learnerId] - Override default learner ID.
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
        // Initialize writing pad for the local writer
        if (core.writingPadService && core.writingPadService.initializeWritingPad) {
            core.writingPadService.initializeWritingPad(learnerId);
            console.log(`[TutorBridge] Writing pad initialized for learner: ${learnerId}`);
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

/**
 * Record a writing event and translate it into recognition primitives.
 *
 * @param {object} event
 * @param {string} event.type - Event type: 'analysis_complete', 'feedback_response', 'flow_change'.
 * @param {object} [event.data] - Event-specific payload.
 */
async function recordWritingEvent(event = {}) {
    const core = await loadTutorCore();
    if (!core) return;

    const learnerId = bridgeState.learnerId;

    try {
        switch (event.type) {
            case 'analysis_complete': {
                // Text analysis completed - record as conscious layer activity
                if (core.writingPadService && core.writingPadService.addWorkingThought) {
                    core.writingPadService.addWorkingThought(learnerId, {
                        content: event.data?.summary || 'Writing analysis completed',
                        source: 'nightowl_analysis',
                        metadata: {
                            wordCount: event.data?.wordCount,
                            flowState: event.data?.flowState,
                        },
                    });
                }
                break;
            }

            case 'feedback_response': {
                // User responded to feedback - detect resistance/breakthrough
                if (core.learnerIntegrationService && core.learnerIntegrationService.detectResistance) {
                    const resistance = core.learnerIntegrationService.detectResistance({
                        learnerId,
                        tutorSuggestion: event.data?.suggestion,
                        learnerAction: event.data?.action,
                        timeSinceSuggestion: event.data?.timeSinceSuggestion || 5000,
                        context: { source: 'nightowl' },
                    });

                    if (resistance) {
                        console.log(`[TutorBridge] Resistance detected: ${resistance.type} (${resistance.interpretation})`);
                    }
                }

                if (event.data?.isBreakthrough && core.learnerIntegrationService && core.learnerIntegrationService.detectBreakthrough) {
                    core.learnerIntegrationService.detectBreakthrough({
                        learnerId,
                        signal: event.data?.signal || 'user_acknowledged',
                        context: { source: 'nightowl' },
                    });
                }
                break;
            }

            case 'flow_change': {
                // Flow state changed - update conscious layer
                if (core.writingPadService && core.writingPadService.addWorkingThought) {
                    core.writingPadService.addWorkingThought(learnerId, {
                        content: `Flow state: ${event.data?.state || 'unknown'}`,
                        source: 'nightowl_flow',
                        metadata: {
                            flowScore: event.data?.score,
                            state: event.data?.state,
                        },
                    });
                }
                break;
            }

            default:
                console.log(`[TutorBridge] Unknown event type: ${event.type}`);
        }
    } catch (error) {
        console.error('[TutorBridge] Failed to record writing event:', error.message);
    }
}

/**
 * Get the current recognition state for the local learner.
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
        initTutorBridge,
        routeDialogue,
        recordWritingEvent,
        getRecognitionState,
        isAvailable,
    };
}

// Also expose on window for renderer process access
if (typeof window !== 'undefined') {
    window.TutorBridge = {
        initTutorBridge,
        routeDialogue,
        recordWritingEvent,
        getRecognitionState,
        isAvailable,
    };
}

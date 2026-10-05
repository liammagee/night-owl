// === Tutor Bridge ===
// Bridges @machinespirits/tutor-core into NightOwl's Electron environment.
// Uses dynamic import() since tutor-core is an ES module and NightOwl is CommonJS.
//
// Since v0.5.0 this bridge also serves as the PRIMARY AI service for NightOwl,
// replacing the old services/aiService.js. It wraps tutor-core's
// unifiedAIProvider.call() / callStream() with conversation history management.

const path = require('path');
const cliAIProvider = require(path.join(__dirname, '..', '..', 'services', 'cliAIProvider'));

function isDebugLoggingEnabled(namespace) {
    const raw = typeof process !== 'undefined' && process.env
        ? process.env.NIGHTOWL_DEBUG_LOGS || ''
        : '';
    if (!raw) return false;
    const enabled = raw.split(',').map(value => value.trim()).filter(Boolean);
    return enabled.includes('*') || enabled.includes(namespace);
}

function debug(...args) {
    if (isDebugLoggingEnabled('TutorBridge')) {
        console.log('[TutorBridge]', ...args);
    }
}
let tutorCore = null;
let bridgeState = {
    initialized: false,
    learnerId: 'local-writer',
    initError: null,
    runtimePaths: null
};

// ============================================================================
// Conversation History (replaces aiService.conversationHistory)
// ============================================================================

const MAX_HISTORY = 40;
let conversationHistory = [];
let currentSystemMessage = null;
let defaultProvider = null; // Override from NightOwl settings
let routingPreferences = {
    providerPriority: [...cliAIProvider.DEFAULT_PRIORITY],
    // Retain legacy behaviour until main.js applies the saved NightOwl policy.
    allowApiFallback: true,
    subscriptionOnly: true
};

function runTutorCoreQuietly(fn) {
    if (isDebugLoggingEnabled('TutorBridge') || isDebugLoggingEnabled('TutorCore')) {
        return fn();
    }

    const originalLog = console.log;
    try {
        console.log = () => {};
        return fn();
    } finally {
        console.log = originalLog;
    }
}

/**
 * Dynamically load tutor-core ES module from CommonJS context.
 * @returns {object|null} The tutor-core module namespace, or null on failure.
 */
async function loadTutorCore() {
    if (tutorCore) return tutorCore;

    try {
        tutorCore = await import('@machinespirits/tutor-core');
        debug('[TutorBridge] tutor-core loaded successfully');
        return tutorCore;
    } catch (error) {
        console.warn('[TutorBridge] Could not load tutor-core:', error.message);
        return null;
    }
}

function isImmutableApplicationPath(targetPath) {
    if (!targetPath) return false;
    const normalized = path.resolve(targetPath);
    const segments = normalized.split(path.sep).filter(Boolean);
    if (segments.some(segment => segment.endsWith('.asar'))) return true;
    const appIndex = segments.findIndex(segment => segment.endsWith('.app'));
    return appIndex >= 0 && segments[appIndex + 1] === 'Contents';
}

function configureTutorCoreRuntime(options = {}) {
    const dbPath = options.dbPath || (options.dataDir ? path.join(options.dataDir, 'tutor-core.db') : null);
    const dataDir = options.dataDir || (dbPath ? path.dirname(dbPath) : null);
    const logDir = options.logDir || (dataDir ? path.join(dataDir, 'logs') : null);
    const runtimePaths = { dataDir, dbPath, logDir };

    for (const [name, targetPath] of Object.entries(runtimePaths)) {
        if (!targetPath) continue;
        if (!path.isAbsolute(targetPath)) {
            throw new Error(`Tutor-core ${name} must be an absolute path`);
        }
        if (isImmutableApplicationPath(targetPath)) {
            throw new Error(`Tutor-core ${name} must not be inside app.asar or an application bundle`);
        }
    }

    const runtimeEnv = typeof process !== 'undefined' ? process.env : null;
    if (runtimeEnv && dbPath) runtimeEnv.AUTH_DB_PATH = dbPath;
    if (runtimeEnv && logDir) runtimeEnv.TUTOR_CORE_LOG_DIR = logDir;
    bridgeState.runtimePaths = runtimePaths;
    return runtimePaths;
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

    if (options.aiRuntimeDir) {
        cliAIProvider.setRuntimeDirectory(options.aiRuntimeDir);
    }
    if (options.enableCliProviders) {
        await cliAIProvider.refreshAvailability({ env: process.env });
    }

    let runtimePaths;
    try {
        // tutor-core currently has one import-time database consumer. These
        // environment variables therefore have to be set before import(), not
        // merely passed to initDb() afterwards.
        runtimePaths = configureTutorCoreRuntime(options);
    } catch (error) {
        bridgeState.initError = error.message;
        return { ok: false, error: error.message };
    }

    const core = await loadTutorCore();
    if (!core) {
        bridgeState.initError = 'tutor-core not available';
        console.warn('[TutorBridge] Initialization skipped - tutor-core not available.');
        return { ok: false, error: bridgeState.initError };
    }

    try {
        // Configure database path before first use
        if (options.dbPath && core.initDb) {
            try {
                runTutorCoreQuietly(() => core.initDb({ dbPath: options.dbPath }));
                debug(`[TutorBridge] Database configured at: ${options.dbPath}`);
            } catch (dbErr) {
                // initDb throws if already initialized - that's fine
                debug(`[TutorBridge] Database already initialized: ${dbErr.message}`);
            }
        }

        if (runtimePaths.logDir && core.setLogDir) {
            runTutorCoreQuietly(() => core.setLogDir(runtimePaths.logDir));
        }

        // Initialize writing pad for the local writer
        if (core.writingPadService && core.writingPadService.initializeWritingPad) {
            runTutorCoreQuietly(() => core.writingPadService.initializeWritingPad(learnerId));
            debug(`[TutorBridge] Writing pad initialized for learner: ${learnerId}`);
        }

        // Run initial maintenance cycle
        if (core.recognitionOrchestrator) {
            const maintenance = runTutorCoreQuietly(() => core.recognitionOrchestrator.runMaintenance(learnerId));
            debug(`[TutorBridge] Initial maintenance completed:`, maintenance.tasks);
        }

        bridgeState.initialized = true;
        bridgeState.initError = null;
        debug('[TutorBridge] Bridge initialized successfully');
        return { ok: true, learnerId };
    } catch (error) {
        bridgeState.initError = error.message;
        console.error('[TutorBridge] Initialization failed:', error.message);
        return { ok: false, error: error.message };
    }
}

// ============================================================================
// AI service bridge (replaces aiService.sendMessage / getAvailableProviders etc.)
// ============================================================================

/**
 * Resolve a NightOwl provider name to a tutor-core provider ID.
 * NightOwl uses 'auto', 'default', 'lmstudio', etc. that need normalization.
 * @private
 */
function resolveProvider(providerName) {
    if (!providerName || providerName === 'auto' || providerName === 'default') {
        return defaultProvider || undefined; // let tutor-core auto-detect
    }
    // Map NightOwl aliases
    const aliases = {
        lmstudio: 'local',
        claude: 'anthropic',
        google: 'gemini',
    };
    return aliases[providerName] || providerName;
}

function configureAIRouting(settings = {}) {
    routingPreferences = {
        providerPriority: cliAIProvider.normalizePriority(settings.providerPriority),
        allowApiFallback: settings.allowApiFallback === true,
        subscriptionOnly: settings.subscriptionOnly !== false
    };
    return { ...routingPreferences, providerPriority: [...routingPreferences.providerPriority] };
}

function selectProvider(providerName, options = {}) {
    const requested = (!providerName || providerName === 'auto' || providerName === 'default')
        ? defaultProvider
        : providerName;
    if (requested) {
        return { provider: requested, transport: requested.endsWith('-cli') ? 'cli' : 'api' };
    }

    const priority = options.providerPriority || routingPreferences.providerPriority;
    const cliProvider = cliAIProvider.getPreferredProvider(priority);
    if (cliProvider) return { provider: cliProvider, transport: 'cli' };

    const allowApiFallback = options.allowApiFallback == null
        ? routingPreferences.allowApiFallback
        : options.allowApiFallback === true;
    if (allowApiFallback) return { provider: undefined, transport: 'api' };

    throw new Error('No preferred CLI AI provider is available. Install and sign in to Codex or Claude, select an API provider explicitly, or enable API fallback in AI settings.');
}

async function callProvider({ providerName, systemMessage, messages, options = {} }) {
    const selection = selectProvider(providerName, options);
    const model = (options.model && options.model !== 'auto' && options.model !== 'default')
        ? options.model : undefined;

    if (selection.transport === 'cli') {
        return cliAIProvider.call({
            provider: selection.provider,
            model,
            systemPrompt: systemMessage,
            messages,
            maxTokens: options.maxTokens,
            subscriptionOnly: options.subscriptionOnly == null
                ? routingPreferences.subscriptionOnly
                : options.subscriptionOnly !== false
        });
    }

    const core = await loadTutorCore();
    if (!core || !core.unifiedAIProvider) {
        throw new Error('tutor-core not available — API providers cannot be used.');
    }
    return core.unifiedAIProvider.call({
        provider: resolveProvider(selection.provider),
        model,
        systemPrompt: systemMessage,
        messages,
        preset: options.preset || 'direct',
        config: {
            temperature: options.temperature,
            maxTokens: options.maxTokens,
        },
    });
}

/**
 * Add a message to conversation history (auto-trimmed).
 * @private
 */
function addToHistory(role, content) {
    conversationHistory.push({ role, content });
    if (conversationHistory.length > MAX_HISTORY) {
        conversationHistory = conversationHistory.slice(-MAX_HISTORY);
    }
}

/**
 * Send a non-streaming chat message via tutor-core's unifiedAIProvider.
 *
 * Drop-in replacement for NightOwl's aiService.sendMessage().
 * Manages conversation history internally.
 *
 * @param {string} message - User message text
 * @param {object} [options]
 * @param {string} [options.provider] - Provider ID
 * @param {string} [options.model] - Model ID
 * @param {string} [options.systemMessage] - System prompt
 * @param {number} [options.temperature] - Temperature override
 * @param {number} [options.maxTokens] - Max tokens override
 * @param {boolean} [options.newConversation] - Start fresh conversation
 * @param {string} [options.preset] - tutor-core preset name
 * @returns {Promise<{response: string, provider: string, model: string, usage: object}>}
 */
async function sendMessage(message, options = {}) {
    const systemMessage = options.systemMessage || options.systemPrompt ||
        'You are a helpful assistant integrated into a Markdown editor for Hegelian philosophy and pedagogy. Provide thoughtful, educational responses.';

    // Handle conversation state
    if (options.newConversation || currentSystemMessage !== systemMessage) {
        conversationHistory = [];
        currentSystemMessage = systemMessage;
    }

    // Add user message to history
    addToHistory('user', message);

    try {
        const result = await callProvider({
            providerName: options.provider,
            systemMessage,
            messages: [...conversationHistory],
            options
        });

        // Add assistant response to history
        addToHistory('assistant', result.content);

        return {
            response: result.content,
            content: result.content, // alias used by some handlers
            provider: result.provider,
            model: result.model,
            usage: result.usage,
            latencyMs: result.latencyMs,
        };
    } catch (error) {
        // Remove the user message we just added since the call failed
        conversationHistory.pop();
        throw error;
    }
}

/**
 * Stream a chat message via tutor-core's callStream().
 * Returns an async generator yielding normalized chunks.
 *
 * @param {string} message - User message text
 * @param {object} [options] - Same as sendMessage options
 * @yields {{type: string, content: string, ...}}
 */
async function* streamMessage(message, options = {}) {
    const systemMessage = options.systemMessage || options.systemPrompt ||
        'You are a helpful assistant integrated into a Markdown editor for Hegelian philosophy and pedagogy. Provide thoughtful, educational responses.';

    if (options.newConversation || currentSystemMessage !== systemMessage) {
        conversationHistory = [];
        currentSystemMessage = systemMessage;
    }

    addToHistory('user', message);

    try {
        const selection = selectProvider(options.provider, options);
        if (selection.transport === 'cli') {
            const result = await callProvider({
                providerName: selection.provider,
                systemMessage,
                messages: [...conversationHistory],
                options
            });
            yield { type: 'text_delta', content: result.content, provider: result.provider, model: result.model };
            addToHistory('assistant', result.content);
            yield { type: 'done', content: result.content, provider: result.provider, model: result.model, usage: result.usage };
            return;
        }

        const core = await loadTutorCore();
        if (!core || !core.unifiedAIProvider || !core.unifiedAIProvider.callStream) {
            throw new Error('tutor-core streaming not available.');
        }
        const model = (options.model && options.model !== 'auto' && options.model !== 'default')
            ? options.model : undefined;
        const stream = core.unifiedAIProvider.callStream({
            provider: resolveProvider(selection.provider),
            model,
            systemPrompt: systemMessage,
            messages: [...conversationHistory],
            preset: options.preset || 'direct',
            config: {
                temperature: options.temperature,
                maxTokens: options.maxTokens,
            },
        });

        for await (const chunk of stream) {
            yield chunk;
            // Capture full text from 'done' chunk for conversation history
            if (chunk.type === 'done') {
                addToHistory('assistant', chunk.content);
            }
        }
    } catch (error) {
        conversationHistory.pop();
        throw error;
    }
}

/**
 * Simple text generation (single prompt, no conversation history).
 * Drop-in for aiService.sendMessage() used for summarization etc.
 *
 * @param {string} prompt - The prompt text
 * @param {object} [options] - provider, model, temperature, maxTokens, systemMessage
 * @returns {Promise<{response: string, content: string, provider: string, model: string, usage: object}>}
 */
async function generateText(prompt, options = {}) {
    const result = await callProvider({
        providerName: options.provider,
        systemMessage: options.systemMessage || options.systemPrompt || '',
        messages: [{ role: 'user', content: prompt }],
        options
    });

    return {
        response: result.content,
        content: result.content,
        provider: result.provider,
        model: result.model,
        usage: result.usage,
        latencyMs: result.latencyMs,
    };
}

// ============================================================================
// Provider Management (replaces aiService provider methods)
// ============================================================================

/**
 * Get list of available (configured) provider IDs.
 * @returns {string[]}
 */
function getAvailableProviders() {
    const available = cliAIProvider.getAvailableProviders(routingPreferences.providerPriority);
    if (tutorCore && tutorCore.unifiedAIProvider) {
        const status = tutorCore.unifiedAIProvider.getProviderStatus();
        for (const [id, info] of Object.entries(status)) {
            if (info.configured && !available.includes(id)) available.push(id);
        }
    }
    return available;
}

/**
 * Get the current default provider.
 * @returns {string|null}
 */
function getDefaultProvider() {
    if (defaultProvider) return defaultProvider;
    const cliProvider = cliAIProvider.getPreferredProvider(routingPreferences.providerPriority);
    if (cliProvider) return cliProvider;
    if (routingPreferences.allowApiFallback && tutorCore && tutorCore.unifiedAIProvider) {
        return tutorCore.unifiedAIProvider.getAvailableProvider();
    }
    return null;
}

/**
 * Set the default provider.
 * @param {string} providerId
 */
function setDefaultProvider(providerId) {
    if (providerId === 'auto' || providerId === 'default') {
        defaultProvider = null;
    } else {
        defaultProvider = providerId;
    }
    debug(`[TutorBridge] Default provider set to: ${defaultProvider || 'auto'}`);
}

/**
 * Get available models for a provider.
 * @param {string} providerId
 * @returns {string[]}
 */
function getProviderModels(providerId) {
    // Return hardcoded lists matching what providers.yaml defines
    const modelLists = {
        openrouter: [
            'nvidia/nemotron-3-nano-30b-a3b:free',
            'z-ai/glm-4.7',
            'moonshotai/kimi-k2-thinking',
            'deepseek/deepseek-v3.2',
            'anthropic/claude-haiku-4.5',
            'anthropic/claude-sonnet-4.5',
            'openai/gpt-5-mini',
            'openai/gpt-5.2',
        ],
        openai: ['gpt-5', 'gpt-5-mini', 'gpt-5.2', 'gpt-4o', 'gpt-4o-mini'],
        anthropic: ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-5'],
        claude: ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-5'],
        gemini: ['gemini-3-flash-preview', 'gemini-3-pro-preview'],
        local: ['local-model'],
        'codex-cli': [],
        'claude-cli': [],
    };
    return modelLists[providerId] || [];
}

/**
 * Get current AI configuration state (for the get-current-ai-config handler).
 * @returns {object}
 */
function getCurrentConfiguration() {
    const providers = getAvailableProviders();
    const provider = getDefaultProvider();
    return {
        provider,
        model: null, // Will be resolved by tutor-core at call time
        availableProviders: providers,
    };
}

/**
 * Clear conversation history.
 */
function clearConversation() {
    conversationHistory = [];
    currentSystemMessage = null;
    debug('[TutorBridge] Conversation cleared');
}

/**
 * Get conversation history.
 * @returns {Array<{role: string, content: string}>}
 */
function getConversationHistory() {
    return [...conversationHistory];
}

/**
 * Update the local AI base URL (called when user changes settings).
 * @param {string} url
 */
function updateLocalAIUrl(url) {
    if (url) {
        process.env.LOCAL_AI_URL = url;
        debug(`[TutorBridge] LOCAL_AI_URL updated to: ${url}`);
    }
}

// ============================================================================
// Ego/Superego Dialogue (existing)
// ============================================================================

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

/** Backward-compatible alias for processWritingEvent. */
async function recordWritingEvent(event = {}) {
    return processWritingEvent(event);
}

/** Get the full recognition state across all 5 phases. */
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

/** Get the current recognition state (Phase 5 gamification only). */
async function getRecognitionState() {
    const core = await loadTutorCore();
    if (!core || !core.recognitionGamificationService) return null;

    try {
        return core.recognitionGamificationService.getLearnerRecognitionProfile(bridgeState.learnerId);
    } catch (error) {
        console.error('[TutorBridge] Failed to get recognition state:', error.message);
        return null;
    }
}

/** Get dialectical history. */
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

/** Get memory state across Freud's 3 layers. */
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

/** Get learner pattern analysis. */
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

/** Run periodic maintenance tasks. */
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

/** Switch the active tutor profile. */
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

/** List available tutor profiles. */
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

/** Get monitoring metrics. */
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

function isAvailable() {
    return bridgeState.initialized && tutorCore !== null;
}

function getRuntimeStatus() {
    const providers = getAvailableProviders();
    return {
        coreAvailable: isAvailable(),
        providerConfigured: providers.length > 0,
        providers,
        cliProviders: cliAIProvider.getAvailability(),
        learnerId: bridgeState.learnerId,
        runtimePaths: bridgeState.runtimePaths ? { ...bridgeState.runtimePaths } : null,
        error: bridgeState.initError
    };
}

async function probeLocalRuntime() {
    if (!isAvailable()) {
        return {
            ok: false,
            storageReady: false,
            ...getRuntimeStatus()
        };
    }

    try {
        const writingPad = tutorCore.writingPadService?.getWritingPad
            ? tutorCore.writingPadService.getWritingPad(bridgeState.learnerId)
            : null;
        return {
            ok: true,
            storageReady: Boolean(writingPad),
            ...getRuntimeStatus()
        };
    } catch (error) {
        return {
            ok: false,
            storageReady: false,
            ...getRuntimeStatus(),
            error: error.message
        };
    }
}

// Export for CommonJS consumption
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        // Initialization
        initTutorBridge,
        isAvailable,
        getRuntimeStatus,
        probeLocalRuntime,
        // AI service interface (replaces aiService)
        sendMessage,
        streamMessage,
        generateText,
        // Provider management
        getAvailableProviders,
        getDefaultProvider,
        setDefaultProvider,
        configureAIRouting,
        getProviderModels,
        getCurrentConfiguration,
        updateLocalAIUrl,
        // Conversation management
        clearConversation,
        getConversationHistory,
        // Ego/Superego dialogue
        routeDialogue,
        // Recognition pipeline
        recordWritingEvent,
        getRecognitionState,
        processDialogueResult,
        processWritingEvent,
        getFullRecognitionState,
        getDialecticalHistory,
        getMemoryState,
        getLearnerPatterns,
        runMaintenance,
        // Profile management
        switchProfile,
        listProfiles,
        // Monitoring
        getMonitoringMetrics,
    };
}

// Also expose on window for renderer process access
if (typeof window !== 'undefined') {
    window.TutorBridge = {
        initTutorBridge,
        isAvailable,
        getRuntimeStatus,
        probeLocalRuntime,
        sendMessage,
        streamMessage,
        generateText,
        getAvailableProviders,
        getDefaultProvider,
        setDefaultProvider,
        configureAIRouting,
        getProviderModels,
        getCurrentConfiguration,
        updateLocalAIUrl,
        clearConversation,
        getConversationHistory,
        routeDialogue,
        recordWritingEvent,
        getRecognitionState,
        processDialogueResult,
        processWritingEvent,
        getFullRecognitionState,
        getDialecticalHistory,
        getMemoryState,
        getLearnerPatterns,
        runMaintenance,
        switchProfile,
        listProfiles,
        getMonitoringMetrics,
    };
}

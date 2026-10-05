// Unit tests for orchestrator/modules/tutor-bridge.js
// Tests the bridge that connects NightOwl (CommonJS) to tutor-core (ES modules)
//
// Challenge: tutor-bridge uses `await import('@machinespirits/tutor-core')` which
// bypasses Jest's require-based mocking. We solve this by injecting a mock tutor-core
// module into the bridge's closure via a test helper that patches the private
// `loadTutorCore` function result.

const mockWritingPadService = {
  initializeWritingPad: jest.fn(),
  getWritingPad: jest.fn(() => ({ id: 'pad-local-writer', learnerId: 'local-writer' })),
  addWorkingThought: jest.fn(),
};

const mockLearnerIntegrationService = {
  detectResistance: jest.fn(),
  detectBreakthrough: jest.fn(),
};

const mockTutorDialogueEngine = {
  runDialogue: jest.fn(),
};

const mockRecognitionGamificationService = {
  getLearnerRecognitionProfile: jest.fn(),
};

const mockRecognitionOrchestrator = {
  processDialogueResult: jest.fn(),
  processWritingEvent: jest.fn(),
  getFullRecognitionState: jest.fn(),
  getDialecticalHistory: jest.fn(),
  getMemoryState: jest.fn(),
  getLearnerPatterns: jest.fn(),
  runMaintenance: jest.fn(() => ({ learnerId: 'local-writer', tasks: {} })),
};

const mockTutorConfigLoader = {
  loadConfig: jest.fn(),
  listProfiles: jest.fn(),
};

const mockMonitoringService = {
  getMetrics: jest.fn(),
};

const mockTutorCore = {
  writingPadService: mockWritingPadService,
  learnerIntegrationService: mockLearnerIntegrationService,
  tutorDialogueEngine: mockTutorDialogueEngine,
  recognitionGamificationService: mockRecognitionGamificationService,
  recognitionOrchestrator: mockRecognitionOrchestrator,
  tutorConfigLoader: mockTutorConfigLoader,
  monitoringService: mockMonitoringService,
  initDb: jest.fn(),
};

/**
 * Helper: Create a bridge module with tutor-core pre-loaded.
 * Since `await import()` can't be mocked by Jest for CommonJS,
 * we create a wrapper that evaluates the bridge source with a
 * patched `import` function.
 */
function createBridgeWithMock(tutorCoreModule, options = {}) {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');

  const bridgePath = path.resolve(__dirname, '../../../orchestrator/modules/tutor-bridge.js');
  const source = fs.readFileSync(bridgePath, 'utf8');

  // Create a sandbox with mocked import()
  const mockModule = { exports: {} };
  const runtimeEnv = {};
  const sandbox = {
    __dirname: path.dirname(bridgePath),
    module: mockModule,
    exports: mockModule.exports,
    require: require,
    process: { env: runtimeEnv },
    console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    window: undefined,
    setTimeout: setTimeout,
    setInterval: jest.fn(() => 123), // Return fake interval ID
    clearInterval: jest.fn(),
    // Override the dynamic import to return our mock
    __importDynamic: tutorCoreModule
      ? () => {
          options.onImport?.(runtimeEnv);
          return Promise.resolve(tutorCoreModule);
        }
      : () => Promise.reject(new Error('Module not found')),
  };

  // Replace `await import(...)` with our mock function
  const patchedSource = source.replace(
    /await import\(['"]@machinespirits\/tutor-core['"]\)/g,
    'await __importDynamic()'
  );

  // Remove the window check at the end to avoid ReferenceError
  const cleanedSource = patchedSource.replace(
    /if \(typeof window !== 'undefined'\)[\s\S]*$/,
    ''
  );

  const script = new vm.Script(cleanedSource, { filename: 'tutor-bridge.js' });
  const context = vm.createContext(sandbox);
  script.runInContext(context);

  return mockModule.exports;
}

describe('tutor-bridge', () => {
  describe('with tutor-core available', () => {
    let bridge;

    beforeEach(() => {
      jest.clearAllMocks();
      bridge = createBridgeWithMock(mockTutorCore);
    });

    describe('initTutorBridge()', () => {
      test('returns ok:true when tutor-core loads successfully', async () => {
        const result = await bridge.initTutorBridge();
        expect(result).toEqual({ ok: true, learnerId: 'local-writer' });
      });

      test('initializes writing pad for default learner', async () => {
        await bridge.initTutorBridge();
        expect(mockWritingPadService.initializeWritingPad).toHaveBeenCalledWith('local-writer');
      });

      test('accepts custom learnerId option', async () => {
        const result = await bridge.initTutorBridge({ learnerId: 'custom-user' });
        expect(result).toEqual({ ok: true, learnerId: 'custom-user' });
        expect(mockWritingPadService.initializeWritingPad).toHaveBeenCalledWith('custom-user');
      });

      test('accepts dbPath option and calls initDb', async () => {
        await bridge.initTutorBridge({
          dataDir: '/tmp/tutor-core',
          dbPath: '/tmp/tutor-core/test.db',
          logDir: '/tmp/tutor-core/logs'
        });
        expect(mockTutorCore.initDb).toHaveBeenCalledWith({ dbPath: '/tmp/tutor-core/test.db' });
        expect(bridge.getRuntimeStatus().runtimePaths).toEqual({
          dataDir: '/tmp/tutor-core',
          dbPath: '/tmp/tutor-core/test.db',
          logDir: '/tmp/tutor-core/logs'
        });
      });

      test('sets mutable storage environment before importing tutor-core', async () => {
        let environmentAtImport = null;
        const importAwareBridge = createBridgeWithMock(mockTutorCore, {
          onImport: runtimeEnv => {
            environmentAtImport = { ...runtimeEnv };
          }
        });

        await importAwareBridge.initTutorBridge({
          dbPath: '/tmp/nightowl-profile/tutor-core/tutor-core.db',
          logDir: '/tmp/nightowl-profile/tutor-core/logs'
        });

        expect(environmentAtImport).toMatchObject({
          AUTH_DB_PATH: '/tmp/nightowl-profile/tutor-core/tutor-core.db',
          TUTOR_CORE_LOG_DIR: '/tmp/nightowl-profile/tutor-core/logs'
        });
      });

      test('rejects mutable paths inside app.asar before loading tutor-core', async () => {
        const result = await bridge.initTutorBridge({
          dbPath: '/Applications/NightOwl.app/Contents/Resources/app.asar/data/tutor.db'
        });

        expect(result).toEqual({
          ok: false,
          error: 'Tutor-core dataDir must not be inside app.asar or an application bundle'
        });
        expect(mockTutorCore.initDb).not.toHaveBeenCalled();
      });

      test('probes local storage independently from optional AI providers', async () => {
        await bridge.initTutorBridge({ dbPath: '/tmp/tutor-core/test.db' });

        await expect(bridge.probeLocalRuntime()).resolves.toMatchObject({
          ok: true,
          coreAvailable: true,
          providerConfigured: false,
          providers: [],
          storageReady: true,
          learnerId: 'local-writer'
        });
      });

      test('skips re-initialization on second call', async () => {
        const first = await bridge.initTutorBridge();
        const second = await bridge.initTutorBridge();
        expect(first).toEqual({ ok: true, learnerId: 'local-writer' });
        expect(second).toEqual({ ok: true, learnerId: 'local-writer' });
        expect(mockWritingPadService.initializeWritingPad).toHaveBeenCalledTimes(1);
      });

      test('runs initial maintenance on init', async () => {
        await bridge.initTutorBridge();
        expect(mockRecognitionOrchestrator.runMaintenance).toHaveBeenCalledWith('local-writer');
      });

      test('returns ok:false when initializeWritingPad throws', async () => {
        mockWritingPadService.initializeWritingPad.mockImplementationOnce(() => {
          throw new Error('DB connection failed');
        });
        const result = await bridge.initTutorBridge();
        expect(result).toEqual({ ok: false, error: 'DB connection failed' });
      });
    });

    describe('routeDialogue()', () => {
      test('calls tutorDialogueEngine.runDialogue with correct params', async () => {
        const mockResult = { response: 'Hello learner', rounds: 1 };
        mockTutorDialogueEngine.runDialogue.mockResolvedValueOnce(mockResult);

        const result = await bridge.routeDialogue({
          message: 'Help me understand Hegel',
          profile: 'experimental',
          sessionState: {
            currentText: 'Some writing',
            flowState: 'focused',
            wordCount: 150,
          },
        });

        expect(result).toEqual(mockResult);
        expect(mockTutorDialogueEngine.runDialogue).toHaveBeenCalledWith({
          learnerMessage: 'Help me understand Hegel',
          learnerContext: expect.objectContaining({
            learnerId: 'local-writer',
            currentContent: 'Some writing',
            flowState: 'focused',
            wordCount: 150,
            source: 'nightowl',
          }),
          profile: 'experimental',
        });
      });

      test('uses budget profile by default', async () => {
        mockTutorDialogueEngine.runDialogue.mockResolvedValueOnce({});
        await bridge.routeDialogue({ message: 'test' });

        expect(mockTutorDialogueEngine.runDialogue).toHaveBeenCalledWith(
          expect.objectContaining({ profile: 'budget' })
        );
      });

      test('returns null on dialogue error', async () => {
        mockTutorDialogueEngine.runDialogue.mockRejectedValueOnce(
          new Error('API timeout')
        );
        const result = await bridge.routeDialogue({ message: 'test' });
        expect(result).toBeNull();
      });
    });

    // ========================================================================
    // Recognition pipeline functions (new)
    // ========================================================================

    describe('processDialogueResult()', () => {
      test('delegates to orchestrator with learnerId', async () => {
        const mockPipelineResult = { learnerId: 'local-writer', phases: {} };
        mockRecognitionOrchestrator.processDialogueResult.mockReturnValueOnce(mockPipelineResult);

        const dialogueResult = { type: 'dialogue', suggestion: 'Try this' };
        const learnerResponse = { type: 'navigate', target: 'chapter-2' };

        const result = await bridge.processDialogueResult(dialogueResult, learnerResponse, { sessionId: 's1' });

        expect(result).toEqual(mockPipelineResult);
        expect(mockRecognitionOrchestrator.processDialogueResult).toHaveBeenCalledWith(
          'local-writer', dialogueResult, learnerResponse, { sessionId: 's1' }
        );
      });

      test('returns null on error', async () => {
        mockRecognitionOrchestrator.processDialogueResult.mockImplementationOnce(() => {
          throw new Error('Pipeline error');
        });
        const result = await bridge.processDialogueResult({});
        expect(result).toBeNull();
      });
    });

    describe('processWritingEvent()', () => {
      test('delegates to orchestrator', async () => {
        const mockResult = { learnerId: 'local-writer', phases: { conscious: { recorded: true } } };
        mockRecognitionOrchestrator.processWritingEvent.mockReturnValueOnce(mockResult);

        const event = { type: 'analysis_complete', data: { wordCount: 500 } };
        const result = await bridge.processWritingEvent(event);

        expect(result).toEqual(mockResult);
        expect(mockRecognitionOrchestrator.processWritingEvent).toHaveBeenCalledWith(
          'local-writer', event, {}
        );
      });
    });

    describe('recordWritingEvent() (backward compatible)', () => {
      test('delegates to processWritingEvent via orchestrator', async () => {
        mockRecognitionOrchestrator.processWritingEvent.mockReturnValueOnce({ ok: true });

        await bridge.recordWritingEvent({ type: 'flow_change', data: { state: 'focused' } });

        expect(mockRecognitionOrchestrator.processWritingEvent).toHaveBeenCalledWith(
          'local-writer',
          { type: 'flow_change', data: { state: 'focused' } },
          {}
        );
      });
    });

    describe('getFullRecognitionState()', () => {
      test('returns full state from orchestrator', async () => {
        const mockState = {
          learnerId: 'local-writer',
          initialized: true,
          writingPad: {},
          memoryState: {},
          learnerPatterns: {},
          recognitionProfile: {},
          dialecticalHistory: [],
        };
        mockRecognitionOrchestrator.getFullRecognitionState.mockReturnValueOnce(mockState);

        const result = await bridge.getFullRecognitionState();
        expect(result).toEqual(mockState);
        expect(mockRecognitionOrchestrator.getFullRecognitionState).toHaveBeenCalledWith('local-writer');
      });
    });

    describe('getRecognitionState() (backward compatible)', () => {
      test('returns recognition profile from gamification service', async () => {
        const mockProfile = {
          depth: { compositeDepth: 0.7 },
          milestones: ['first_negation'],
          flowScore: 0.6,
        };
        mockRecognitionGamificationService.getLearnerRecognitionProfile.mockReturnValueOnce(mockProfile);

        const result = await bridge.getRecognitionState();
        expect(result).toEqual(mockProfile);
        expect(mockRecognitionGamificationService.getLearnerRecognitionProfile).toHaveBeenCalledWith('local-writer');
      });

      test('returns null on error', async () => {
        mockRecognitionGamificationService.getLearnerRecognitionProfile.mockImplementationOnce(() => {
          throw new Error('DB error');
        });
        const result = await bridge.getRecognitionState();
        expect(result).toBeNull();
      });
    });

    describe('getDialecticalHistory()', () => {
      test('returns history from orchestrator', async () => {
        const mockHistory = [{ id: 'm1', strategy: 'synthesis' }];
        mockRecognitionOrchestrator.getDialecticalHistory.mockReturnValueOnce(mockHistory);

        const result = await bridge.getDialecticalHistory({ limit: 10 });
        expect(result).toEqual(mockHistory);
        expect(mockRecognitionOrchestrator.getDialecticalHistory).toHaveBeenCalledWith('local-writer', { limit: 10 });
      });

      test('returns empty array on error', async () => {
        mockRecognitionOrchestrator.getDialecticalHistory.mockImplementationOnce(() => {
          throw new Error('error');
        });
        expect(await bridge.getDialecticalHistory()).toEqual([]);
      });
    });

    describe('getMemoryState()', () => {
      test('returns memory state from orchestrator', async () => {
        const mockState = { conscious: {}, preconscious: {}, unconscious: {} };
        mockRecognitionOrchestrator.getMemoryState.mockReturnValueOnce(mockState);

        const result = await bridge.getMemoryState();
        expect(result).toEqual(mockState);
      });
    });

    describe('getLearnerPatterns()', () => {
      test('returns patterns from orchestrator', async () => {
        const mockPatterns = { totalEvents: 5, resistanceRate: 0.4 };
        mockRecognitionOrchestrator.getLearnerPatterns.mockReturnValueOnce(mockPatterns);

        const result = await bridge.getLearnerPatterns();
        expect(result).toEqual(mockPatterns);
      });
    });

    describe('runMaintenance()', () => {
      test('delegates to orchestrator', async () => {
        const mockResult = { learnerId: 'local-writer', tasks: { memoryMaintenance: {} } };
        mockRecognitionOrchestrator.runMaintenance.mockReturnValueOnce(mockResult);

        const result = await bridge.runMaintenance();
        expect(result).toEqual(mockResult);
        expect(mockRecognitionOrchestrator.runMaintenance).toHaveBeenCalledWith('local-writer');
      });
    });

    describe('listProfiles()', () => {
      test('returns profiles from config loader', async () => {
        mockTutorConfigLoader.listProfiles.mockReturnValueOnce(['budget', 'experimental']);
        const result = await bridge.listProfiles();
        expect(result).toEqual(['budget', 'experimental']);
      });
    });

    describe('switchProfile()', () => {
      test('returns profile config when found', async () => {
        mockTutorConfigLoader.loadConfig.mockReturnValueOnce({
          profiles: { budget: { maxRounds: 0 }, experimental: { maxRounds: 3 } },
        });
        const result = await bridge.switchProfile('experimental');
        expect(result).toEqual({ name: 'experimental', config: { maxRounds: 3 } });
      });

      test('returns error when profile not found', async () => {
        mockTutorConfigLoader.loadConfig.mockReturnValueOnce({ profiles: {} });
        const result = await bridge.switchProfile('nonexistent');
        expect(result).toEqual({ error: "Profile 'nonexistent' not found" });
      });
    });

    describe('getMonitoringMetrics()', () => {
      test('returns metrics from monitoring service', async () => {
        const mockMetrics = { totalDialogues: 42 };
        mockMonitoringService.getMetrics.mockReturnValueOnce(mockMetrics);
        const result = await bridge.getMonitoringMetrics();
        expect(result).toEqual(mockMetrics);
      });
    });

    describe('isAvailable()', () => {
      test('returns false before initialization', () => {
        expect(bridge.isAvailable()).toBe(false);
      });

      test('returns true after successful initialization', async () => {
        await bridge.initTutorBridge();
        expect(bridge.isAvailable()).toBe(true);
      });
    });
  });

  describe('with tutor-core unavailable', () => {
    let bridge;

    beforeEach(() => {
      jest.clearAllMocks();
      bridge = createBridgeWithMock(null);
    });

    test('initTutorBridge returns ok:false', async () => {
      const result = await bridge.initTutorBridge();
      expect(result).toEqual({ ok: false, error: 'tutor-core not available' });
    });

    test('local runtime probe reports core unavailability separately', async () => {
      await bridge.initTutorBridge();
      await expect(bridge.probeLocalRuntime()).resolves.toMatchObject({
        ok: false,
        coreAvailable: false,
        providerConfigured: false,
        storageReady: false,
        error: 'tutor-core not available'
      });
    });

    test('routeDialogue returns null', async () => {
      const result = await bridge.routeDialogue({ message: 'test' });
      expect(result).toBeNull();
    });

    test('processDialogueResult returns null', async () => {
      const result = await bridge.processDialogueResult({});
      expect(result).toBeNull();
    });

    test('processWritingEvent returns null', async () => {
      const result = await bridge.processWritingEvent({ type: 'test' });
      expect(result).toBeNull();
    });

    test('getFullRecognitionState returns null', async () => {
      const result = await bridge.getFullRecognitionState();
      expect(result).toBeNull();
    });

    test('getDialecticalHistory returns empty array', async () => {
      const result = await bridge.getDialecticalHistory();
      expect(result).toEqual([]);
    });

    test('getMemoryState returns null', async () => {
      const result = await bridge.getMemoryState();
      expect(result).toBeNull();
    });

    test('getLearnerPatterns returns null', async () => {
      const result = await bridge.getLearnerPatterns();
      expect(result).toBeNull();
    });

    test('runMaintenance returns null', async () => {
      const result = await bridge.runMaintenance();
      expect(result).toBeNull();
    });

    test('listProfiles returns empty array', async () => {
      const result = await bridge.listProfiles();
      expect(result).toEqual([]);
    });

    test('getRecognitionState returns null', async () => {
      const result = await bridge.getRecognitionState();
      expect(result).toBeNull();
    });

    test('isAvailable returns false after failed init', async () => {
      await bridge.initTutorBridge();
      expect(bridge.isAvailable()).toBe(false);
    });
  });
});

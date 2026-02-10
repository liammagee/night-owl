// Unit tests for orchestrator/modules/tutor-bridge.js
// Tests the bridge that connects NightOwl (CommonJS) to tutor-core (ES modules)
//
// Challenge: tutor-bridge uses `await import('@machinespirits/tutor-core')` which
// bypasses Jest's require-based mocking. We solve this by injecting a mock tutor-core
// module into the bridge's closure via a test helper that patches the private
// `loadTutorCore` function result.

const mockWritingPadService = {
  initializeWritingPad: jest.fn(),
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

const mockTutorCore = {
  writingPadService: mockWritingPadService,
  learnerIntegrationService: mockLearnerIntegrationService,
  tutorDialogueEngine: mockTutorDialogueEngine,
  recognitionGamificationService: mockRecognitionGamificationService,
};

/**
 * Helper: Create a bridge module with tutor-core pre-loaded.
 * Since `await import()` can't be mocked by Jest for CommonJS,
 * we create a wrapper that evaluates the bridge source with a
 * patched `import` function.
 */
function createBridgeWithMock(tutorCoreModule) {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');

  const bridgePath = path.resolve(__dirname, '../../../orchestrator/modules/tutor-bridge.js');
  const source = fs.readFileSync(bridgePath, 'utf8');

  // Create a sandbox with mocked import()
  const mockModule = { exports: {} };
  const sandbox = {
    module: mockModule,
    exports: mockModule.exports,
    require: require,
    console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    window: undefined,
    // Override the dynamic import to return our mock
    __importDynamic: tutorCoreModule
      ? () => Promise.resolve(tutorCoreModule)
      : () => Promise.reject(new Error('Module not found')),
  };

  // Replace `await import(...)` with our mock function
  // The bridge source has: `tutorCore = await import('@machinespirits/tutor-core');`
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

      test('skips re-initialization on second call', async () => {
        const first = await bridge.initTutorBridge();
        const second = await bridge.initTutorBridge();
        expect(first).toEqual({ ok: true, learnerId: 'local-writer' });
        expect(second).toEqual({ ok: true, learnerId: 'local-writer' });
        expect(mockWritingPadService.initializeWritingPad).toHaveBeenCalledTimes(1);
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

      test('builds learner context from session state with defaults', async () => {
        mockTutorDialogueEngine.runDialogue.mockResolvedValueOnce({});
        await bridge.routeDialogue({ message: 'test', sessionState: {} });

        expect(mockTutorDialogueEngine.runDialogue).toHaveBeenCalledWith(
          expect.objectContaining({
            learnerContext: expect.objectContaining({
              currentContent: '',
              recentActivity: '',
              flowState: 'unknown',
              sessionDuration: 0,
              wordCount: 0,
            }),
          })
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

    describe('recordWritingEvent()', () => {
      test('analysis_complete calls addWorkingThought with correct content', async () => {
        await bridge.recordWritingEvent({
          type: 'analysis_complete',
          data: {
            summary: 'Text analysis done',
            wordCount: 200,
            flowState: 'focused',
          },
        });

        expect(mockWritingPadService.addWorkingThought).toHaveBeenCalledWith(
          'local-writer',
          {
            content: 'Text analysis done',
            source: 'nightowl_analysis',
            metadata: {
              wordCount: 200,
              flowState: 'focused',
            },
          }
        );
      });

      test('analysis_complete uses default summary when data.summary missing', async () => {
        await bridge.recordWritingEvent({
          type: 'analysis_complete',
          data: {},
        });

        expect(mockWritingPadService.addWorkingThought).toHaveBeenCalledWith(
          'local-writer',
          expect.objectContaining({
            content: 'Writing analysis completed',
          })
        );
      });

      test('feedback_response calls detectResistance', async () => {
        await bridge.recordWritingEvent({
          type: 'feedback_response',
          data: {
            suggestion: 'Try restructuring your argument',
            action: 'dismissed',
            timeSinceSuggestion: 3000,
          },
        });

        expect(mockLearnerIntegrationService.detectResistance).toHaveBeenCalledWith({
          learnerId: 'local-writer',
          tutorSuggestion: 'Try restructuring your argument',
          learnerAction: 'dismissed',
          timeSinceSuggestion: 3000,
          context: { source: 'nightowl' },
        });
      });

      test('feedback_response with isBreakthrough calls detectBreakthrough', async () => {
        await bridge.recordWritingEvent({
          type: 'feedback_response',
          data: {
            suggestion: 'Consider the dialectical tension',
            action: 'accepted',
            isBreakthrough: true,
            signal: 'explicit_understanding',
          },
        });

        expect(mockLearnerIntegrationService.detectBreakthrough).toHaveBeenCalledWith({
          learnerId: 'local-writer',
          signal: 'explicit_understanding',
          context: { source: 'nightowl' },
        });
      });

      test('feedback_response without isBreakthrough does not call detectBreakthrough', async () => {
        await bridge.recordWritingEvent({
          type: 'feedback_response',
          data: {
            suggestion: 'test',
            action: 'ignored',
          },
        });

        expect(mockLearnerIntegrationService.detectBreakthrough).not.toHaveBeenCalled();
      });

      test('flow_change calls addWorkingThought with flow state content', async () => {
        await bridge.recordWritingEvent({
          type: 'flow_change',
          data: { state: 'deep_focus', score: 0.9 },
        });

        expect(mockWritingPadService.addWorkingThought).toHaveBeenCalledWith(
          'local-writer',
          {
            content: 'Flow state: deep_focus',
            source: 'nightowl_flow',
            metadata: {
              flowScore: 0.9,
              state: 'deep_focus',
            },
          }
        );
      });

      test('unknown event type does not throw', async () => {
        await expect(
          bridge.recordWritingEvent({ type: 'unknown_event' })
        ).resolves.toBeUndefined();
      });
    });

    describe('getRecognitionState()', () => {
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

    test('routeDialogue returns null', async () => {
      const result = await bridge.routeDialogue({ message: 'test' });
      expect(result).toBeNull();
    });

    test('recordWritingEvent does nothing', async () => {
      await expect(
        bridge.recordWritingEvent({ type: 'analysis_complete', data: {} })
      ).resolves.toBeUndefined();
      expect(mockWritingPadService.addWorkingThought).not.toHaveBeenCalled();
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

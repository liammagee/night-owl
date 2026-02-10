// Behavioral tests for recognition-grounded gamification integration
// Tests how recognition engine states translate into gamification behaviors

describe('Recognition-Grounded Gamification Behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Mock class simulating how NightOwl's gamification system integrates
  // with tutor-core's recognition engine outputs
  class MockRecognitionGamification {
    constructor() {
      this.recognitionState = {
        depth: { compositeDepth: 0, trend: 'none' },
        milestones: [],
        flowScore: 0,
        flowState: 'none',
      };
      this.typingFlowScore = 0;
      this.xpMultiplier = 1.0;
      this.level = 1;
      this.spawnedRooms = [];
    }

    updateRecognitionState(state) {
      this.recognitionState = { ...this.recognitionState, ...state };
      this.recalculate();
    }

    recalculate() {
      // Recognition quality multiplier: up to 1.5x based on depth
      const depth = this.recognitionState.depth.compositeDepth;
      this.xpMultiplier = 1.0 + (Math.min(depth, 1.0) * 0.5);

      // Level from memory layer progression
      if (this.recognitionState.memoryLayer === 'unconscious') this.level = 3;
      else if (this.recognitionState.memoryLayer === 'preconscious') this.level = 2;
      else this.level = 1;
    }

    getBlendedFlow() {
      // Flow blending: typing flow (local) weighted with recognition flow (tutor-core)
      return (this.typingFlowScore * 0.6) + (this.recognitionState.flowScore * 0.4);
    }

    checkMemoryConsolidation() {
      // Library room spawn triggered by memory consolidation milestone
      if (this.recognitionState.milestones.includes('memory_consolidation') &&
          !this.spawnedRooms.includes('library')) {
        this.spawnedRooms.push('library');
        return true;
      }
      return false;
    }

    getFlowFeatures() {
      return {
        recognitionQuality: this.recognitionState.depth.compositeDepth,
        dialecticalEngagement: this.recognitionState.flowScore,
        blendedFlow: this.getBlendedFlow(),
      };
    }
  }

  describe('XP multiplier from recognition quality', () => {
    test('starts at 1.0 with no recognition', () => {
      const system = new MockRecognitionGamification();
      expect(system.xpMultiplier).toBe(1.0);
    });

    test('scales linearly with composite depth up to 1.5x', () => {
      const system = new MockRecognitionGamification();

      system.updateRecognitionState({ depth: { compositeDepth: 0.5, trend: 'rising' } });
      expect(system.xpMultiplier).toBe(1.25);

      system.updateRecognitionState({ depth: { compositeDepth: 0.8, trend: 'rising' } });
      expect(system.xpMultiplier).toBe(1.4);

      system.updateRecognitionState({ depth: { compositeDepth: 1.0, trend: 'rising' } });
      expect(system.xpMultiplier).toBe(1.5);
    });

    test('caps at 1.5x even when depth exceeds 1.0', () => {
      const system = new MockRecognitionGamification();
      system.updateRecognitionState({ depth: { compositeDepth: 1.5, trend: 'rising' } });
      expect(system.xpMultiplier).toBe(1.5);
    });
  });

  describe('level calculation from memory layer progression', () => {
    test('level 1 by default (conscious layer)', () => {
      const system = new MockRecognitionGamification();
      expect(system.level).toBe(1);
    });

    test('level 2 for preconscious layer', () => {
      const system = new MockRecognitionGamification();
      system.updateRecognitionState({ memoryLayer: 'preconscious' });
      expect(system.level).toBe(2);
    });

    test('level 3 for unconscious layer', () => {
      const system = new MockRecognitionGamification();
      system.updateRecognitionState({ memoryLayer: 'unconscious' });
      expect(system.level).toBe(3);
    });

    test('level resets when layer changes back', () => {
      const system = new MockRecognitionGamification();
      system.updateRecognitionState({ memoryLayer: 'unconscious' });
      expect(system.level).toBe(3);

      system.updateRecognitionState({ memoryLayer: 'conscious' });
      expect(system.level).toBe(1);
    });
  });

  describe('library room spawn from memory consolidation', () => {
    test('no spawn without memory_consolidation milestone', () => {
      const system = new MockRecognitionGamification();
      expect(system.checkMemoryConsolidation()).toBe(false);
      expect(system.spawnedRooms).toHaveLength(0);
    });

    test('spawns library room on memory_consolidation milestone', () => {
      const system = new MockRecognitionGamification();
      system.updateRecognitionState({ milestones: ['memory_consolidation'] });
      expect(system.checkMemoryConsolidation()).toBe(true);
      expect(system.spawnedRooms).toContain('library');
    });

    test('does not spawn library room twice', () => {
      const system = new MockRecognitionGamification();
      system.updateRecognitionState({ milestones: ['memory_consolidation'] });
      expect(system.checkMemoryConsolidation()).toBe(true);
      expect(system.checkMemoryConsolidation()).toBe(false);
      expect(system.spawnedRooms).toHaveLength(1);
    });

    test('handles multiple milestones including memory_consolidation', () => {
      const system = new MockRecognitionGamification();
      system.updateRecognitionState({
        milestones: ['first_negation', 'productive_resistance', 'memory_consolidation'],
      });
      expect(system.checkMemoryConsolidation()).toBe(true);
      expect(system.spawnedRooms).toContain('library');
    });
  });

  describe('flow blending formula', () => {
    test('blends typing flow (60%) with recognition flow (40%)', () => {
      const system = new MockRecognitionGamification();
      system.typingFlowScore = 0.8;
      system.updateRecognitionState({ flowScore: 0.6 });

      const blended = system.getBlendedFlow();
      expect(blended).toBeCloseTo(0.72, 2); // 0.8*0.6 + 0.6*0.4
    });

    test('returns 0 when both flow scores are 0', () => {
      const system = new MockRecognitionGamification();
      expect(system.getBlendedFlow()).toBe(0);
    });

    test('handles high typing flow with low recognition flow', () => {
      const system = new MockRecognitionGamification();
      system.typingFlowScore = 1.0;
      system.updateRecognitionState({ flowScore: 0.0 });
      expect(system.getBlendedFlow()).toBeCloseTo(0.6, 2);
    });

    test('handles low typing flow with high recognition flow', () => {
      const system = new MockRecognitionGamification();
      system.typingFlowScore = 0.0;
      system.updateRecognitionState({ flowScore: 1.0 });
      expect(system.getBlendedFlow()).toBeCloseTo(0.4, 2);
    });
  });

  describe('flow features output', () => {
    test('includes recognitionQuality and dialecticalEngagement', () => {
      const system = new MockRecognitionGamification();
      system.typingFlowScore = 0.7;
      system.updateRecognitionState({
        depth: { compositeDepth: 0.65, trend: 'stable' },
        flowScore: 0.5,
      });

      const features = system.getFlowFeatures();
      expect(features).toHaveProperty('recognitionQuality', 0.65);
      expect(features).toHaveProperty('dialecticalEngagement', 0.5);
      expect(features).toHaveProperty('blendedFlow');
      expect(features.blendedFlow).toBeCloseTo(0.62, 2); // 0.7*0.6 + 0.5*0.4
    });

    test('returns zeroed features for fresh system', () => {
      const system = new MockRecognitionGamification();
      const features = system.getFlowFeatures();
      expect(features.recognitionQuality).toBe(0);
      expect(features.dialecticalEngagement).toBe(0);
      expect(features.blendedFlow).toBe(0);
    });
  });
});

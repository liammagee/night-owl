const {
  DEFAULT_BUDGETS,
  createReadinessTracker,
  percentile,
  summarizeSamples
} = require('../../../orchestrator/modules/performance-budgets');

describe('performance budgets', () => {
  test('uses nearest-rank percentiles for fixed samples', () => {
    expect(percentile([50, 10, 30, 20, 40], 50)).toBe(30);
    expect(percentile([50, 10, 30, 20, 40], 95)).toBe(50);
    expect(percentile([], 95)).toBeNull();
  });

  test('distinguishes passing samples, noisy warnings, and regressions', () => {
    const budget = { warningMs: 100, regressionMs: 300 };

    expect(summarizeSamples([40, 50, 60], budget).status).toBe('pass');
    expect(summarizeSamples([40, 50, 150], budget).status).toBe('warning');
    expect(summarizeSamples([40, 50, 350], budget).status).toBe('regression');
    expect(summarizeSamples([], budget).status).toBe('correctness-failure');
  });

  test('records semantic readiness with marks and bounded history', () => {
    let currentTime = 10;
    const performanceApi = {
      now: jest.fn(() => currentTime),
      mark: jest.fn(),
      measure: jest.fn()
    };
    const tracker = createReadinessTracker({ performanceApi, maxRecords: 10 });
    const token = tracker.begin('preview-ready', { filePath: '/notes.md' });
    currentTime = 42;
    const record = tracker.complete(token, { renderer: 'markdown' });

    expect(record).toEqual(expect.objectContaining({
      name: 'preview-ready',
      status: 'ready',
      durationMs: 32,
      metadata: {
        filePath: '/notes.md',
        renderer: 'markdown'
      }
    }));
    expect(performanceApi.mark).toHaveBeenCalledTimes(2);
    expect(performanceApi.measure).toHaveBeenCalledWith(
      'nightowl:preview-ready',
      expect.stringMatching(/:start$/),
      expect.stringMatching(/:end$/)
    );
    expect(tracker.getActive()).toEqual([]);
    expect(tracker.getRecords('preview-ready')).toHaveLength(1);
  });

  test('records failures separately from latency threshold outcomes', () => {
    const tracker = createReadinessTracker({
      performanceApi: { now: () => 1, mark: () => {}, measure: () => {} }
    });
    tracker.fail(tracker.begin('file-switch'), new Error('editor unavailable'));

    expect(tracker.getRecords()).toEqual([
      expect.objectContaining({
        status: 'failed',
        metadata: { error: 'editor unavailable' }
      })
    ]);
    expect(DEFAULT_BUDGETS['presentation-fit.large'].regressionMs)
      .toBeGreaterThan(DEFAULT_BUDGETS['presentation-fit.large'].warningMs);
  });
});

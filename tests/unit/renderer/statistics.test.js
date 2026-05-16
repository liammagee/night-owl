const modulePath = '../../../orchestrator/modules/statistics.js';
const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);

describe('statistics module', () => {
  beforeEach(() => {
    jest.resetModules();
    document.getElementById = nativeGetElementById;
    document.body.innerHTML = '';
    require(modulePath);
  });

  afterEach(() => {
    delete window.switchStatsScope;
    delete window.updateStatisticsPane;
    delete window.calculateBasicStatistics;
    delete window.calculateProjectStatistics;
    delete window.getStatsScope;
  });

  test('calculates readability and vocabulary metrics for document statistics', () => {
    const stats = window.calculateBasicStatistics(`
# Short Draft

This is a clear sentence. This second sentence uses simple words.

This final sentence is intentionally much longer than the others because it needs to exercise the long sentence counter for the statistics panel and prove that complexity is visible across a dense academic paragraph with several additional words.
`);

    expect(stats.wordCount).toBeGreaterThan(20);
    expect(stats.uniqueWordCount).toBeGreaterThan(15);
    expect(stats.syllableCount).toBeGreaterThan(stats.wordCount);
    expect(stats.readingEase).toBeGreaterThan(0);
    expect(stats.gradeLevel).toBeGreaterThan(0);
    expect(stats.longSentenceCount).toBe(1);
  });

  test('renders themed statistics cards without hardcoded pastel card markup', async () => {
    document.body.innerHTML = '<div id="statistics-content"></div>';
    window.editor = {
      getValue: () => '# Title\n\nReadable prose belongs here. It has two sentences.'
    };

    await window.updateStatisticsPane();

    const content = document.getElementById('statistics-content');
    expect(content.querySelector('.statistics-card-readability')).toBeTruthy();
    expect(content.textContent).toContain('Flesch Ease');
    expect(content.textContent).toContain('Unique Words');
    expect(content.innerHTML).not.toContain('background: #fff0f5');
  });
});

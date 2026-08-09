const path = require('path');

const modulePath = path.resolve(
  __dirname,
  '../../../../plugins/techne-presentations/presentation-preflight.js'
);

describe('presentation preflight', () => {
  let preflight;

  beforeEach(() => {
    jest.resetModules();
    document.getElementById = Object.getPrototypeOf(document).getElementById.bind(document);
    delete window.NightOwlPresentationPreflight;
    document.body.innerHTML = '';
    preflight = require(modulePath);
  });

  test('maps every non-empty slide to deterministic source lines', () => {
    const slides = preflight.splitSlides([
      '',
      '# Opening',
      'Content',
      '',
      '---',
      '',
      'Second slide',
      '',
      '---',
      '# Closing'
    ].join('\n'));

    expect(slides).toEqual([
      expect.objectContaining({ index: 0, startLine: 2, endLine: 3, title: 'Opening' }),
      expect.objectContaining({ index: 1, startLine: 7, endLine: 7, title: 'Slide 2' }),
      expect.objectContaining({ index: 2, startLine: 10, endLine: 10, title: 'Closing' })
    ]);
  });

  test('excludes YAML front matter and recognizes CommonMark thematic slide breaks', () => {
    const slides = preflight.splitSlides([
      '---',
      'title: The deck title',
      'course: 479',
      '---',
      '',
      '# Opening',
      'First slide',
      '',
      '* * *',
      '',
      '## Second',
      'A fenced thematic break stays in this slide:',
      '```text',
      '***',
      '```',
      '',
      '___',
      '# Third'
    ].join('\n'));

    expect(slides).toEqual([
      expect.objectContaining({ index: 0, startLine: 6, endLine: 7, title: 'Opening' }),
      expect.objectContaining({ index: 1, startLine: 11, endLine: 15, title: 'Second' }),
      expect.objectContaining({ index: 2, startLine: 18, endLine: 18, title: 'Third' })
    ]);
    expect(slides[1].markdown).toContain('\n***\n');
  });

  test('does not mistake an opening separator without YAML keys for front matter', () => {
    const slides = preflight.splitSlides('---\n# First\n---\n# Second');
    expect(slides.map(slide => slide.title)).toEqual(['First', 'Second']);
  });

  test('reports source-actionable headings and image alternatives', () => {
    const slides = preflight.splitSlides('# Good\n\n![](diagram.png)\n\n---\n\nNo heading');
    const warnings = preflight.analyzeMarkdownSlides(slides);

    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'image-alt', slideIndex: 0, sourceLine: 3, subject: 'diagram.png' }),
      expect.objectContaining({ code: 'missing-heading', slideIndex: 1, sourceLine: 7 })
    ]));
    expect(new Set(warnings.map(item => item.id)).size).toBe(warnings.length);
  });

  test('checks rendered overflow, minimum text size, and contrast for each slide', () => {
    document.body.innerHTML = `
      <div id="root">
        <section class="slide" data-slide-index="0" data-content-overflow="true">
          <div class="slide-content" data-background="light"><p data-kind="small">Small text</p></div>
        </section>
        <section class="slide" data-slide-index="1">
          <div class="slide-content" data-background="light" data-content-scale="1"><p data-kind="low">Low contrast</p></div>
        </section>
      </div>`;
    const styles = element => {
      if (element.dataset.kind === 'small') {
        return { display: 'block', visibility: 'visible', fontSize: '12px', fontWeight: '400', color: 'rgb(0, 0, 0)', backgroundColor: 'transparent' };
      }
      if (element.dataset.kind === 'low') {
        return { display: 'block', visibility: 'visible', fontSize: '20px', fontWeight: '400', color: 'rgb(119, 119, 119)', backgroundColor: 'transparent' };
      }
      return { display: 'block', visibility: 'visible', fontSize: '20px', fontWeight: '400', color: 'rgb(0, 0, 0)', backgroundColor: 'rgb(255, 255, 255)' };
    };
    const slides = preflight.splitSlides('# One\n\n---\n\n# Two');
    expect(slides).toHaveLength(2);
    expect(document.getElementById('root').querySelectorAll('.slide[data-slide-index]')).toHaveLength(2);
    const warnings = preflight.analyzeRenderedSlides(document.getElementById('root'), slides, {
      getComputedStyle: styles
    });

    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'overflow', slideIndex: 0, severity: 'error' }),
      expect.objectContaining({ code: 'minimum-text-size', slideIndex: 0 }),
      expect.objectContaining({ code: 'contrast', slideIndex: 1 })
    ]));
  });

  test('resolves local assets, reports missing files, and honors exact suppressions', async () => {
    const markdown = '# Assets\n\n![Diagram](../images/missing.png)\n\n---\n\n# Remote\n\n![Remote](https://example.com/image.png)';
    const root = document.createElement('div');
    const first = await preflight.run({
      markdown,
      root,
      baseDir: '/workspace/slides',
      assetExists: async filePath => ({ exists: !filePath.endsWith('missing.png') })
    });

    expect(preflight.resolveLocalAsset('../images/missing.png', '/workspace/slides'))
      .toBe('/workspace/images/missing.png');
    expect(first.warnings).toEqual([
      expect.objectContaining({
        code: 'missing-asset',
        slideIndex: 0,
        sourceLine: 3,
        detail: expect.stringContaining('/workspace/images/missing.png')
      })
    ]);

    const second = await preflight.run({
      markdown,
      root,
      baseDir: '/workspace/slides',
      assetExists: async () => ({ exists: false }),
      suppressions: [first.warnings[0].id]
    });
    expect(second.warningCount).toBe(0);
    expect(second.suppressedCount).toBe(1);
  });

  test('calculates WCAG contrast ratios from CSS colors', () => {
    expect(preflight.contrastRatio(
      preflight.parseColor('#000'),
      preflight.parseColor('rgb(255, 255, 255)')
    )).toBeCloseTo(21, 2);
    expect(preflight.contrastRatio(
      preflight.parseColor('#777'),
      preflight.parseColor('#fff')
    )).toBeLessThan(4.5);
  });
});

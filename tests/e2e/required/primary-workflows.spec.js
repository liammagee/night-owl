'use strict';

const { test, expect } = require('../fixtures/electron-app');

const DECK = `# First slide

The complete first slide must remain visible.

---

# Second slide

The second slide proves that parsing completed.`;

async function openMarkdown(page, filePath, content) {
  return page.evaluate(
    ({ path, markdown }) => window.openFileInEditor(path, markdown, { source: 'required-e2e' }),
    { path: filePath, markdown: content }
  );
}

async function enterPresentation(page, content = DECK) {
  await page.evaluate(() => window.switchToMode('editor'));
  await openMarkdown(page, '/virtual-workspace/deck.md', content);
  await page.evaluate(() => window.switchToMode('presentation'));
  await expect(page.locator('#presentation-root')).toHaveAttribute('data-presentation-load-state', 'ready');
  await expect(page.locator('#presentation-root [data-slide-index]')).toHaveCount(2);
}

test.describe.configure({ mode: 'serial' });

test('@required @file-switch rapid file switching keeps the newest editor and preview state', async ({ appPage }) => {
  await appPage.evaluate(() => {
    const renderer = window.TechneMarkdownRenderer;
    if (!renderer?.renderPreview) throw new Error('Techne markdown renderer is unavailable');
    const originalRender = renderer.renderPreview.bind(renderer);
    window.__nightOwlOriginalRenderPreview = originalRender;
    window.__nightOwlSlowPreviewStarted = false;
    window.__nightOwlSlowPreviewGate = new Promise(resolve => {
      window.__nightOwlReleaseSlowPreview = resolve;
    });
    renderer.renderPreview = async options => {
      if (options.markdownContent.includes('Slow document')) {
        window.__nightOwlSlowPreviewStarted = true;
        await window.__nightOwlSlowPreviewGate;
      }
      return originalRender(options);
    };
    window.__nightOwlSlowOpen = window.openFileInEditor(
      '/virtual-workspace/slow.md',
      '# Slow document\n\nThis render is intentionally delayed.',
      { source: 'required-e2e' }
    );
  });

  await expect.poll(() => appPage.evaluate(() => window.__nightOwlSlowPreviewStarted)).toBe(true);
  await openMarkdown(
    appPage,
    '/virtual-workspace/fast.md',
    '# Fast document\n\nThis content must win the transition.'
  );
  await appPage.evaluate(async () => {
    window.__nightOwlReleaseSlowPreview();
    await window.__nightOwlSlowOpen;
    window.TechneMarkdownRenderer.renderPreview = window.__nightOwlOriginalRenderPreview;
  });

  await expect.poll(() => appPage.evaluate(() => window.currentFilePath)).toBe('/virtual-workspace/fast.md');
  await expect.poll(() => appPage.evaluate(() => window.editor.getValue())).toContain('Fast document');
  await expect(appPage.locator('#preview-content')).toContainText('This content must win the transition.');
  await expect(appPage.locator('#preview-content')).not.toContainText('intentionally delayed');
});

test('@required @preview preview readiness exposes committed content rather than a blank pane', async ({ appPage }) => {
  const result = await openMarkdown(
    appPage,
    '/virtual-workspace/preview-ready.md',
    '# Preview ready\n\nA deterministic preview contract.'
  );

  expect(result).toMatchObject({ status: 'committed' });
  await expect(appPage.locator('#preview-content h1')).toContainText('Preview ready');
  await expect(appPage.locator('#preview-content')).toContainText('A deterministic preview contract.');
  await expect(appPage.locator('.preview-transition-error')).toHaveCount(0);
});

test('@required @mode-recovery presentation failure offers recovery and retry remounts the deck', async ({ appPage }) => {
  await enterPresentation(appPage);
  await appPage.evaluate(() => {
    window.switchToMode('editor');
    window.__nightOwlWorkingPresentation = window.MarkdownPreziApp;
    window.MarkdownPreziApp = function BrokenPresentation() {
      throw new Error('required E2E injected presentation failure');
    };
    document.getElementById('presentation-root').dataset.presentationLoadState = 'cancelled';
    window.switchToMode('presentation');
  });

  await expect(appPage.locator('#presentation-root')).toHaveAttribute('data-presentation-load-state', 'failed');
  await expect(appPage.locator('.presentation-load-diagnostic')).toContainText('NO-PRES-RENDER');

  await appPage.evaluate(() => {
    window.MarkdownPreziApp = window.__nightOwlWorkingPresentation;
  });
  await appPage.locator('.presentation-load-retry').click();

  await expect(appPage.locator('#presentation-root')).toHaveAttribute('data-presentation-load-state', 'ready');
  await expect(appPage.locator('#presentation-root [data-slide-index]')).toHaveCount(2);
  await expect(appPage.locator('#presentation-root')).toContainText('First slide');
});

test('@required @slide-geometry delivery mode contains the complete current slide', async ({ appPage }) => {
  await enterPresentation(appPage);
  await appPage.locator('.presentation-present-btn').click();
  await expect(appPage.locator('.presentation-shell')).toHaveAttribute('data-presentation-mode', 'delivery');
  await expect(appPage.locator('.presentation-stage')).toHaveAttribute('data-fit-mode', 'contain');
  await expect(appPage.locator('.presentation-current-slide')).toHaveCount(1);

  await expect.poll(async () => appPage.evaluate(() => {
    const root = document.getElementById('presentation-root').getBoundingClientRect();
    const stage = document.querySelector('.presentation-stage').getBoundingClientRect();
    const slide = document.querySelector('.presentation-current-slide').getBoundingClientRect();
    return {
      hasSize: slide.width > 0 && slide.height > 0,
      withinStage:
        slide.left >= stage.left - 1 &&
        slide.top >= stage.top - 1 &&
        slide.right <= stage.right + 1 &&
        slide.bottom <= stage.bottom + 1,
      stageWithinRoot:
        stage.left >= root.left - 1 &&
        stage.top >= root.top - 1 &&
        stage.right <= root.right + 1 &&
        stage.bottom <= root.bottom + 1,
      hasSlideRatio: Math.abs((slide.width / slide.height) - (16 / 9)) < 0.01
    };
  })).toEqual({
    hasSize: true,
    withinStage: true,
    stageWithinRoot: true,
    hasSlideRatio: true
  });

  const snapshot = await appPage.evaluate(() => {
    const rect = selector => {
      const value = document.querySelector(selector).getBoundingClientRect();
      return {
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height
      };
    };
    return {
      root: rect('#presentation-root'),
      stage: rect('.presentation-stage'),
      slide: rect('.presentation-current-slide')
    };
  });

  expect(snapshot.slide.width).toBeGreaterThan(0);
  expect(snapshot.slide.height).toBeGreaterThan(0);
  expect(snapshot.slide.left).toBeGreaterThanOrEqual(snapshot.stage.left - 1);
  expect(snapshot.slide.top).toBeGreaterThanOrEqual(snapshot.stage.top - 1);
  expect(snapshot.slide.right).toBeLessThanOrEqual(snapshot.stage.right + 1);
  expect(snapshot.slide.bottom).toBeLessThanOrEqual(snapshot.stage.bottom + 1);
  expect(snapshot.stage.left).toBeGreaterThanOrEqual(snapshot.root.left - 1);
  expect(snapshot.stage.top).toBeGreaterThanOrEqual(snapshot.root.top - 1);
  expect(snapshot.stage.right).toBeLessThanOrEqual(snapshot.root.right + 1);
  expect(snapshot.stage.bottom).toBeLessThanOrEqual(snapshot.root.bottom + 1);
  expect(snapshot.slide.width / snapshot.slide.height).toBeCloseTo(16 / 9, 2);
});

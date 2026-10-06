'use strict';
const { test, expect } = require('../fixtures/electron-app');

const shortSlide = '# Short slide\n\n| Topic | Point |\n| --- | --- |\n| Layout | A nested cell |';
const denseSlide = '# Dense slide\n\n' + Array.from({ length: 25 }, (_, i) => `- Point ${i + 1}: content that must remain visible.`).join('\n');
const wideSlide = '# Wide code\n\n```text\n' + 'wide-content '.repeat(40) + '\n```';
const deck = [shortSlide, denseSlide, wideSlide, ...Array(9).fill(shortSlide)].join('\n\n---\n\n');

test('@required spiral slides stay separated and fit content across templates', async ({ appPage }, testInfo) => {
  await appPage.evaluate(async markdown => {
    await window.openFileInEditor('/virtual-workspace/spiral-fitting.md', markdown, { refreshExistingTabContent: true });
    window.switchToMode('presentation');
  }, deck);
  const slides = appPage.locator('#presentation-root .slide');
  await expect(slides).toHaveCount(12);
  const overlaps = await slides.evaluateAll(elements => {
    const boxes = elements.map(e => ({ x: parseFloat(e.style.left), y: parseFloat(e.style.top), w: e.offsetWidth, h: e.offsetHeight }));
    return boxes.flatMap((a, i) => boxes.slice(i + 1).filter(b => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 100 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 100));
  });
  expect(overlaps).toEqual([]);

  for (const template of ['default', 'academic', 'dark', 'minimal', 'techne-red', 'techne-orange']) {
    await appPage.evaluate(name => window.styleManager.applyPresentationTemplate(name), template);
    await expect.poll(() => slides.first().locator('.slide-content').getAttribute('data-content-scale')).toBe('1.0000');
    await expect(slides.first()).toHaveAttribute('data-content-overflow', 'false');
    await expect.poll(() => slides.nth(1).locator('.slide-content').getAttribute('data-content-scale')).not.toBe('1.0000');
    await expect.poll(() => slides.evaluateAll(elements => elements.flatMap((slide, index) => {
      const frame = slide.querySelector('.slide-content-frame').getBoundingClientRect();
      return Array.from(slide.querySelectorAll('.slide-content h1, .slide-content li, .slide-content td, .slide-content pre')).flatMap(child => {
        const bounds = child.getBoundingClientRect();
        return bounds.bottom > frame.bottom + 1 || bounds.right > frame.right + 1
          ? [{ index, tag: child.tagName, bottom: bounds.bottom - frame.bottom, right: bounds.right - frame.right }] : [];
      });
    })), { message: `All content fits in ${template}` }).toEqual([]);
    // No repeated warnings in the overview; dense slides remain in preflight.
    await expect(appPage.locator('.slide-density-hint:visible')).toHaveCount(0);
  }

  await appPage.getByRole('button', { name: 'Start presentation', exact: true }).click();
  await expect(appPage.locator('.presentation-shell')).toHaveAttribute('data-presentation-mode', 'delivery');
  await appPage.keyboard.press('ArrowRight');
  await expect(appPage.locator('.presentation-current-slide')).toHaveAttribute('data-slide-index', '1');
  await expect.poll(() => appPage.locator('.presentation-current-slide').evaluate(slide => {
    const frame = slide.querySelector('.slide-content-frame').getBoundingClientRect();
    const last = slide.querySelector('li:last-child').getBoundingClientRect();
    return last.bottom <= frame.bottom + 1;
  })).toBe(true);
  await appPage.keyboard.press('Escape');
  const hint = appPage.locator('.slide-density-hint:visible');
  await expect(hint).toHaveCount(1);
  expect(await hint.evaluate(e => e.clientWidth > 150 && e.clientHeight < 35)).toBe(true);
  await appPage.getByRole('button', { name: 'Reset presentation view', exact: true }).click();
  for (let i = 0; i < 8; i += 1) await appPage.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await appPage.screenshot({ path: testInfo.outputPath('spiral-overview.png'), animations: 'disabled' });
});

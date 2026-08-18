'use strict';

const { test, expect } = require('../fixtures/packaged-electron-app');

test('@packaged @microfiche packaged long-document preview scans and restores content', async ({ appPage }) => {
  await appPage.waitForFunction(() => (
    Boolean(window.editor?.getValue) &&
    typeof window.openFileInEditor === 'function' &&
    Boolean(window.previewMicrofiche)
  ), undefined, { timeout: 30 * 1000 });
  await appPage.evaluate(() => window.switchToMode('editor'));

  const filePath = '/virtual-workspace/packaged-microfiche.md';
  const markdown = Array.from({ length: 9 }, (_, index) => (
    `## Packaged section ${index + 1}\n\n${`Packaged preview paragraph ${index + 1}. `.repeat(28)}`
  )).join('\n\n');
  const outcome = await appPage.evaluate(
    ({ filePath, markdown }) => window.openFileInEditor(filePath, markdown, { source: 'packaged-microfiche' }),
    { filePath, markdown }
  );
  expect(outcome).toMatchObject({ status: 'committed', filePath });

  await appPage.getByRole('button', { name: 'Show microfiche overview' }).click();
  await expect(appPage.locator('.microfiche-frame')).toHaveCount(9);
  await expect(appPage.locator('#preview-content')).toHaveClass(/microfiche-active/);
  await expect.poll(() => appPage.evaluate(() => (
    Array.from(document.querySelectorAll('.microfiche-frame')).every(frame => (
      frame.dataset.contentComplete === 'true'
    ))
  ))).toBe(true);
  const initialScale = await appPage.evaluate(() => window.previewMicrofiche.getViewState().scale);
  const initialView = await appPage.evaluate(() => window.previewMicrofiche.getViewState());
  const viewport = appPage.getByRole('region', { name: 'Pannable and zoomable microfiche canvas' });
  const viewportBox = await viewport.boundingBox();
  expect(viewportBox).not.toBeNull();
  await appPage.mouse.move(viewportBox.x + viewportBox.width / 2, viewportBox.y + viewportBox.height / 2);
  await appPage.mouse.down();
  await appPage.mouse.move(
    viewportBox.x + viewportBox.width / 2 - 70,
    viewportBox.y + viewportBox.height / 2 - 55,
    { steps: 5 }
  );
  await appPage.mouse.up();
  const draggedView = await appPage.evaluate(() => window.previewMicrofiche.getViewState());
  expect(draggedView.fitMode).toBe(false);
  expect(draggedView.translateX).not.toBeCloseTo(initialView.translateX, 1);
  expect(draggedView.translateY).not.toBeCloseTo(initialView.translateY, 1);
  await appPage.getByRole('button', { name: 'Fit all frames', exact: true }).click();
  await appPage.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(() => appPage.evaluate(() => window.previewMicrofiche.getViewState().scale))
    .toBeGreaterThan(initialScale);
  await appPage.getByRole('button', { name: 'Fit all frames', exact: true }).click();
  await expect.poll(() => appPage.evaluate(() => window.previewMicrofiche.getViewState().fitMode)).toBe(true);

  await appPage.locator('.microfiche-frame').nth(4).click();
  await expect(appPage.locator('#preview-content')).not.toHaveClass(/microfiche-active/);
  await expect(appPage.locator('#preview-content')).toContainText('Packaged section 5');
});

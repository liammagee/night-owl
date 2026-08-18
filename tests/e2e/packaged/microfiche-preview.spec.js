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

  await appPage.locator('.microfiche-frame').nth(4).click();
  await expect(appPage.locator('#preview-content')).not.toHaveClass(/microfiche-active/);
  await expect(appPage.locator('#preview-content')).toContainText('Packaged section 5');
});

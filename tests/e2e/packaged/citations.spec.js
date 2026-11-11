'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('../fixtures/packaged-electron-app');

test('@packaged @citations searches a sibling bibliography as the user types and formats its references', async ({
  appPage,
  packagedProfile
}) => {
  const workspace = path.join(packagedProfile, 'citations');
  const paperDir = path.join(workspace, 'paper');
  const paper = path.join(paperDir, 'paper.md');
  const key = 'magee2026geistarxiv';
  const source = '# Paper\n\nSee [@' + key + '].\n\n';
  await fs.mkdir(paperDir, { recursive: true });
  await fs.writeFile(paper, source);
  await fs.writeFile(path.join(paperDir, 'references.bib'), [
    ...Array.from({ length: 70 }, (_, index) =>
      '@misc{aa' + String(index).padStart(2, '0') + ', title={A reference}}'),
    '@misc{' + key + ', author={Magee, Liam}, year={2026}, ' +
      'title={\\emph{{Geist}} in the Machine: {AI}-Mediated Teaching}, ' +
      'url={https://arxiv.org/abs/2603.10450v2}}'
  ].join('\n'));

  await appPage.waitForFunction(() => window.editor && window.TechneCitationRenderer);
  const outcome = await appPage.evaluate(async ({ workspace, paper }) => {
    const switched = await window.electronAPI.workspace.switchWorkspace(workspace);
    if (!switched.success) throw new Error(switched.error);
    const opened = await window.openFilePathInEditor(paper, { source: 'packaged-citation-e2e' });
    await window.refreshCitationAutocompleteData();
    return opened;
  }, { workspace, paper });
  expect(outcome).toMatchObject({ status: 'committed', filePath: paper });

  const reference = appPage.locator('#preview-content .bibliography-item[data-key="' + key + '"]');
  await expect(reference.locator('em')).toHaveText('Geist');
  await expect(reference).toContainText('Geist in the Machine: AI-Mediated Teaching.');
  await expect(reference).not.toContainText('. .');
  await expect(reference.getByRole('link')).toHaveAttribute('href', 'https://arxiv.org/abs/2603.10450v2');

  try {
    await appPage.evaluate(() => {
      const editor = window.editor;
      const model = editor.getModel();
      const lastLine = model.getLineCount();
      editor.focus();
      editor.setPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) });
    });
    await appPage.keyboard.type('[@');
    const suggestions = appPage.locator('.suggest-widget.visible');
    await expect(suggestions.getByText('aa00', { exact: true }).first()).toBeVisible();
    await appPage.keyboard.type('magee2026geist');
    await expect(suggestions.getByText(key, { exact: true }).first()).toBeVisible();
    await appPage.keyboard.press('Enter');
    await expect.poll(() => appPage.evaluate(() => window.editor.getValue())).toBe(source + '[@' + key + ']');
  } finally {
    await appPage.evaluate(text => window.editor.setValue(text), source);
  }
});

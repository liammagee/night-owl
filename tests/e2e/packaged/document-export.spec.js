'use strict';
const fs = require('fs/promises');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { listPackage } = require('@electron/asar');
const { test, expect } = require('../fixtures/packaged-electron-app');

test('@packaged template PDF exports a separate document and closes its print window', async ({ electronApp, appPage, packagedProfile }) => {
  const archive = await electronApp.evaluate(({ app }) => app.getAppPath());
  const assets = listPackage(archive);
  expect(assets).toEqual(expect.arrayContaining(['/templates/apa.csl', '/templates/reference.pptx']));
  const output = path.join(packagedProfile, 'template-export.pdf');
  const windowsBefore = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  await electronApp.evaluate(({ dialog }, destination) => {
    global.__originalExportDialog = dialog.showSaveDialog;
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination });
  }, output);
  try {
    const result = await appPage.evaluate(() => window.electronAPI.documents.exportPdfWithTemplate({
      htmlContent: '<h1>Exported research document</h1><p>A single page of selected content.</p>', template: 'letter'
    }));
    expect(result).toMatchObject({ success: true, filePath: output });
    const document = await PDFDocument.load(await fs.readFile(output));
    expect(document.getPageCount()).toBe(1);
    expect(document.getPage(0).getWidth()).toBeCloseTo(612, 0);
    expect(document.getPage(0).getHeight()).toBeCloseTo(792, 0);
    await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(windowsBefore);
  } finally {
    await electronApp.evaluate(({ dialog }) => {
      dialog.showSaveDialog = global.__originalExportDialog;
      delete global.__originalExportDialog;
    });
  }
});

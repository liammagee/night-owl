'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../fixtures/packaged-electron-app');

test('@packaged @pdf-research bundled annotations persist and create provenance notes', async ({
  appPage,
  packagedProfile
}) => {
  const workspaceRoot = path.join(packagedProfile, 'pdf-workspace');
  const pdfPath = path.join(workspaceRoot, 'packaged-source.pdf');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.writeFileSync(pdfPath, '%PDF-1.4\nPackaged PDF research fixture\n%%EOF\n');

  await appPage.waitForFunction(() => window.NightOwlPdfResearch?.assetLoaded === true, undefined, {
    timeout: 30 * 1000
  });

  const result = await appPage.evaluate(async ({ workspaceRoot, pdfPath }) => {
    const switched = await window.electronAPI.workspace.switchWorkspace(workspaceRoot);
    if (!switched.success) throw new Error(switched.error || 'Could not switch packaged PDF workspace');
    const initial = await window.electronAPI.pdfResearch.loadAnnotations({ filePath: pdfPath });
    const annotation = {
      id: 'annotation-packaged',
      pageNumber: 5,
      text: 'Packaged PDF research fixture',
      annotation: 'Packaged application assets use the fixed research store.',
      citationId: 42,
      citationKey: 'Packaged2026Research',
      citationTitle: 'Packaged PDF research fixture'
    };
    const saved = await window.electronAPI.pdfResearch.saveAnnotations({
      filePath: pdfPath,
      highlights: [],
      annotations: [annotation]
    });
    const loaded = await window.electronAPI.pdfResearch.loadAnnotations({ filePath: pdfPath });
    const note = await window.electronAPI.pdfResearch.createNote({
      filePath: pdfPath,
      annotation: loaded.annotations[0],
      citation: { id: 42, citation_key: 'Packaged2026Research', title: 'Packaged source' }
    });
    return {
      assetLoaded: window.NightOwlPdfResearch.assetLoaded,
      capabilityMethods: ['loadAnnotations', 'saveAnnotations', 'createNote']
        .filter(method => typeof window.electronAPI.pdfResearch?.[method] === 'function'),
      initial,
      saved,
      loaded,
      note
    };
  }, { workspaceRoot, pdfPath });

  expect(result.assetLoaded).toBe(true);
  expect(result.capabilityMethods).toEqual(['loadAnnotations', 'saveAnnotations', 'createNote']);
  expect(result.initial).toMatchObject({ success: true, found: false });
  expect(result.saved).toMatchObject({ success: true, annotationCount: 1 });
  expect(result.loaded.annotations[0]).toMatchObject({
    pageNumber: 5,
    citationKey: 'Packaged2026Research'
  });
  expect(result.note.success).toBe(true);
  expect(result.note.filePath.startsWith(`${workspaceRoot}${path.sep}`)).toBe(true);
  const note = fs.readFileSync(result.note.filePath, 'utf8');
  expect(note).toContain('source_page: 5');
  expect(note).toContain('Citation: [@Packaged2026Research]');
});

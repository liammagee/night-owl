'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('packaged PDF research assets', () => {
  test('loads annotations from the application bundle before the main renderer', () => {
    const html = read('index.html');
    const annotationAsset = '<script src="orchestrator/pdfAnnotations.js"></script>';
    const rendererAsset = '<script src="orchestrator/renderer.js"></script>';

    expect(html).toContain(annotationAsset);
    expect(html.indexOf(annotationAsset)).toBeLessThan(html.indexOf(rendererAsset));
    expect(JSON.parse(read('package.json')).build.files).toContain('orchestrator/**/*');
  });

  test('does not read executable annotation source through the open workspace', () => {
    const renderer = read('orchestrator/renderer.js');
    const annotations = read('orchestrator/pdfAnnotations.js');

    expect(renderer).not.toContain('loadPDFAnnotationsModule');
    expect(renderer).not.toContain("readFile('./orchestrator/pdfAnnotations.js')");
    expect(renderer).not.toContain('window.savePDFAnnotations = function() {}');
    expect(annotations).toContain('window.electronAPI.pdfResearch.saveAnnotations');
    expect(annotations).toContain('window.electronAPI.pdfResearch.loadAnnotations');
    expect(annotations).toContain('window.NightOwlPdfResearch');
  });

  test('degrades missing extraction and storage capabilities visibly', () => {
    const renderer = read('orchestrator/renderer.js');
    const annotations = read('orchestrator/pdfAnnotations.js');

    expect(renderer).toContain('No selectable text was found');
    expect(renderer).toContain('Packaged PDF annotation tools are unavailable');
    expect(annotations).toContain('PDF research storage is unavailable');
    expect(renderer).toContain('id="pdf-research-status"');
  });
});

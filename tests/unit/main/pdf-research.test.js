'use strict';

const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { createPdfResearchService } = require('../../../services/pdfResearch');

describe('PDF research service', () => {
  let tempRoot;
  let userDataPath;
  let workspaceRoot;
  let pdfPath;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nightowl-pdf-research-'));
    userDataPath = path.join(tempRoot, 'user-data');
    workspaceRoot = path.join(tempRoot, 'workspace');
    pdfPath = path.join(workspaceRoot, 'Source Paper.pdf');
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(pdfPath, '%PDF-1.4\ncontent-stable-across-rename\n%%EOF\n');
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  test('persists page-addressed annotations outside the workspace', async () => {
    const service = createPdfResearchService({ userDataPath });
    const initial = await service.loadAnnotations(pdfPath);
    expect(initial).toMatchObject({ success: true, found: false, annotations: [], highlights: [] });

    const saved = await service.saveAnnotations({
      filePath: pdfPath,
      highlights: [{
        id: 'highlight-1',
        pageNumber: 2,
        bounds: { left: 1, top: 2, right: 20, bottom: 10 },
        text: 'Quoted argument',
        type: 'annotation',
        annotationId: 'annotation-1'
      }],
      annotations: [{
        id: 'annotation-1',
        pageNumber: 2,
        text: 'Quoted argument',
        annotation: 'This is the key claim.',
        x: 1,
        y: 2,
        width: 19,
        height: 8,
        citationId: 7,
        citationKey: 'Magee2026Claim',
        citationTitle: 'Source Paper'
      }]
    });

    expect(saved).toMatchObject({ success: true, pageCount: 1, annotationCount: 1, highlightCount: 1 });
    await expect(fs.access(path.join(workspaceRoot, 'Source Paper.annotations'))).rejects.toMatchObject({ code: 'ENOENT' });

    const loaded = await service.loadAnnotations(pdfPath);
    expect(loaded.documentId).toBe(initial.documentId);
    expect(loaded.annotations[0]).toMatchObject({
      id: 'annotation-1',
      pageNumber: 2,
      citationId: 7,
      citationKey: 'Magee2026Claim'
    });
    expect(loaded.highlights[0]).toMatchObject({ pageNumber: 2, annotationId: 'annotation-1' });
  });

  test('content identity survives rename and a new service instance', async () => {
    const firstService = createPdfResearchService({ userDataPath });
    const saved = await firstService.saveAnnotations({
      filePath: pdfPath,
      highlights: [],
      annotations: [{ id: 'annotation-rename', pageNumber: 4, text: 'Evidence', annotation: 'Keep this.' }]
    });
    const renamedPath = path.join(workspaceRoot, 'Renamed Paper.pdf');
    await fs.rename(pdfPath, renamedPath);

    const restartedService = createPdfResearchService({ userDataPath });
    const loaded = await restartedService.loadAnnotations(renamedPath);

    expect(loaded.documentId).toBe(saved.documentId);
    expect(loaded.annotations).toEqual([expect.objectContaining({ id: 'annotation-rename', pageNumber: 4 })]);
    expect(loaded.source.aliases).toEqual(expect.arrayContaining([pdfPath, renamedPath]));
    expect(loaded.source.lastKnownPath).toBe(renamedPath);
  });

  test('creates a Markdown note with document, page, quotation, and citation provenance', async () => {
    const service = createPdfResearchService({ userDataPath });
    const result = await service.createResearchNote(workspaceRoot, {
      filePath: pdfPath,
      annotation: {
        id: 'annotation-note',
        pageNumber: 3,
        text: 'The quoted passage.',
        annotation: 'Connect this to the evaluation design.',
        timestamp: '2026-08-09T00:00:00.000Z'
      },
      citation: { id: 12, citation_key: 'Magee2026Paper', title: 'Source Paper' }
    });

    expect(result.success).toBe(true);
    expect(result.filePath).toMatch(/research-notes[\\/]source-paper-p3-[a-z0-9-]+\.md$/);
    const note = await fs.readFile(result.filePath, 'utf8');
    expect(note).toContain('source_document: "Source Paper.pdf"');
    expect(note).toContain('source_page: 3');
    expect(note).toContain('> The quoted passage.');
    expect(note).toContain('Citation: [@Magee2026Paper]');
    expect(note).toContain(savedIdentityPrefix(await service.identifyDocument(pdfPath)));
  });

  test('rejects note destinations outside the live workspace', async () => {
    const service = createPdfResearchService({ userDataPath });
    await expect(service.createResearchNote(workspaceRoot, {
      filePath: pdfPath,
      destinationPath: path.join(tempRoot, 'escaped.md'),
      annotation: { id: 'annotation-escape', pageNumber: 1, text: 'Quote', annotation: 'Note' }
    })).rejects.toThrow('must stay inside a workspace folder');
  });
});

function savedIdentityPrefix(document) {
  return `source_document_id: "${document.documentId}"`;
}

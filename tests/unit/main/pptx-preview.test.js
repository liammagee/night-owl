'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { renderPptxPreview } = require('../../../services/pptxPreview');

describe('PowerPoint preview service', () => {
  let root;
  let deckPath;
  let cacheRoot;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-pptx-preview-'));
    deckPath = path.join(root, 'deck.pptx');
    cacheRoot = path.join(root, 'cache');
    fs.writeFileSync(deckPath, 'pptx fixture');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('renders and caches the complete Quick Look HTML preview', async () => {
    const execFile = jest.fn((_command, args, _options, callback) => {
      const outputDirectory = args[2];
      const previewDirectory = path.join(outputDirectory, 'deck.pptx.qlpreview');
      fs.mkdirSync(previewDirectory, { recursive: true });
      fs.writeFileSync(
        path.join(previewDirectory, 'Preview.html'),
        '<html><body><div class="slide">One</div><div class="slide">Two</div></body></html>'
      );
      callback(null, 'preview generated', '');
    });

    const first = await renderPptxPreview(deckPath, {
      platform: 'darwin', cacheRoot, execFile
    });
    const second = await renderPptxPreview(deckPath, {
      platform: 'darwin', cacheRoot, execFile
    });

    expect(first).toMatchObject({
      success: true,
      renderer: 'html',
      engine: 'macos-quick-look',
      cacheHit: false
    });
    expect(first.html).toContain('class="slide">Two');
    expect(first.baseUrl).toMatch(/^file:/);
    expect(second).toMatchObject({ success: true, cacheHit: true });
    expect(execFile).toHaveBeenCalledTimes(1);
  });

  test('returns an external-open fallback off macOS', async () => {
    await expect(renderPptxPreview(deckPath, {
      platform: 'win32', cacheRoot
    })).resolves.toMatchObject({
      success: false,
      code: 'PPTX_PREVIEW_UNAVAILABLE'
    });
  });

  test('rejects non-PPTX inputs', async () => {
    const pdfPath = path.join(root, 'deck.pdf');
    fs.writeFileSync(pdfPath, 'pdf');
    await expect(renderPptxPreview(pdfPath, {
      platform: 'darwin', cacheRoot
    })).resolves.toMatchObject({
      success: false,
      code: 'PPTX_PREVIEW_UNSUPPORTED_TYPE'
    });
  });
});

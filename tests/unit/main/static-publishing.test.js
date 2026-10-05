const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const {
  MANIFEST_FILE,
  RENDER_CONTRACT,
  createStaticPublishingService
} = require('../../../services/staticPublishing');

describe('validated static publishing service', () => {
  let workspace;
  let service;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-static-publishing-'));
    fs.mkdirSync(path.join(workspace, 'images'));
    fs.writeFileSync(path.join(workspace, 'images', 'diagram.png'), Buffer.from('valid-local-image'));
    service = createStaticPublishingService({ now: () => new Date('2026-08-09T00:00:00.000Z') });
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  function request(files) {
    return {
      files,
      options: {
        title: 'Machine Spirits notes',
        profile: {
          id: 'machinespirits-public-site',
          title: 'Machine Spirits public site',
          contentRepository: { remote: 'liammagee/machinespirits-content-philosophy', revision: 'abc123' }
        }
      }
    };
  }

  test('rewrites routes and anchors, fingerprints copied assets, and emits a path-private manifest', async () => {
    const indexPath = path.join(workspace, 'index.md');
    const guidePath = path.join(workspace, 'guide.md');
    fs.writeFileSync(indexPath, '# Home');
    fs.writeFileSync(guidePath, '# Guide');
    const result = await service.preflight(workspace, request([
      {
        sourcePath: indexPath,
        title: 'Home',
        contract: RENDER_CONTRACT,
        html: `<h1 id="heading-home">Home</h1><a href="#" class="internal-link" data-link="guide.md#Details">Guide</a><img src="${pathToFileURL(path.join(workspace, 'images', 'diagram.png')).href}" alt="Diagram">`
      },
      {
        sourcePath: guidePath,
        title: 'Guide',
        contract: RENDER_CONTRACT,
        html: '<h1 id="heading-guide">Guide</h1><h2 id="heading-details">Details</h2><a href="index.md#Home">Home</a>'
      }
    ]));

    expect(result.ready).toBe(true);
    expect(result.report.summary).toMatchObject({ pages: 2, assets: 1, internalLinks: 2, errors: 0 });
    expect(result.report.mappings.pages).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'index.md', output: 'index.html' }),
      expect.objectContaining({ source: 'guide.md', output: 'guide.html' })
    ]));
    const index = result.documents.find(document => document.output === 'index.html');
    expect(index.html).toContain('href="guide.html#heading-details"');
    expect(index.html).toMatch(/src="_assets\/[a-f0-9]{12}-diagram.png"/);
    expect(index.previewHtml).toContain("default-src 'none'");
    expect(index.previewHtml).toContain(pathToFileURL(fs.realpathSync(path.join(workspace, 'images', 'diagram.png'))).href);
    expect(JSON.stringify(result.manifest)).not.toContain(workspace);
    expect(result.manifest).toMatchObject({
      schemaVersion: 1,
      rendererContract: RENDER_CONTRACT,
      handoff: { id: 'machinespirits-public-site' }
    });
  });

  test('stages a complete site only after validation and never overwrites an existing folder', async () => {
    const indexPath = path.join(workspace, 'index.md');
    fs.writeFileSync(indexPath, '# Home');
    const publication = request([{
      sourcePath: indexPath,
      title: 'Home',
      contract: RENDER_CONTRACT,
      html: '<h1 id="heading-home">Home</h1>'
    }]);
    const output = path.join(workspace, 'published-site');

    const result = await service.publish(workspace, publication, output);
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(output, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(output, 'style.css'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(output, MANIFEST_FILE), 'utf8'))).toMatchObject({
      title: 'Machine Spirits notes',
      publicationDigest: expect.stringMatching(/^[a-f0-9]{64}$/)
    });

    const second = await service.publish(workspace, publication, output);
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/will not overwrite/i);
  });

  test('blocks broken routes, missing anchors, unsafe markup, and sources outside the workspace', async () => {
    const pagePath = path.join(workspace, 'page.md');
    fs.writeFileSync(pagePath, '# Page');
    const result = await service.preflight(workspace, request([
      {
        sourcePath: pagePath,
        title: 'Page',
        contract: RENDER_CONTRACT,
        html: '<script>alert(1)</script><h1 id="heading-page">Page</h1><a href="missing.md">Missing</a><a href="#absent">Absent</a>'
      },
      {
        sourcePath: path.join(os.tmpdir(), 'outside.md'),
        title: 'Outside',
        contract: RENDER_CONTRACT,
        html: '<h1>Outside</h1>'
      }
    ]));

    expect(result.ready).toBe(false);
    expect(result.report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'unsafe-markup', 'broken-route', 'broken-anchor', 'source-outside-workspace'
    ]));
  });

  test('preflight has an explicit no-network contract and reports remote dependencies without fetching them', async () => {
    const pagePath = path.join(workspace, 'page.md');
    fs.writeFileSync(pagePath, '# Page');
    const fetchBefore = global.fetch;
    global.fetch = jest.fn(() => { throw new Error('network must not be used'); });
    try {
      const result = await service.preflight(workspace, request([{
        sourcePath: pagePath,
        title: 'Page',
        contract: RENDER_CONTRACT,
        html: '<h1 id="heading-page">Page</h1><img src="https://example.test/image.png" alt="Remote">'
      }]));
      expect(result.ready).toBe(true);
      expect(result.report.issues).toContainEqual(expect.objectContaining({ code: 'external-asset', severity: 'warning' }));
      expect(global.fetch).not.toHaveBeenCalled();
      expect(result.documents[0].previewHtml).not.toContain('src="https://example.test/image.png"');
    } finally {
      global.fetch = fetchBefore;
    }
  });
});

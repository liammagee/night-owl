const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  WorkspaceIndex,
  classifyFile,
  extractTextMetadata
} = require('../../../services/workspaceIndex');

describe('WorkspaceIndex', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-index-'));
    fs.mkdirSync(path.join(root, 'notes'), { recursive: true });
    fs.mkdirSync(path.join(root, 'node_modules', 'ignored'), { recursive: true });
    fs.writeFileSync(path.join(root, 'notes', 'alpha.md'), [
      '---',
      'title: Alpha note',
      'tags: [research, review]',
      'bibliography: ../references.bib',
      '---',
      '# Alpha',
      'Links to [[beta]] and [labels](../labels.csv).',
      'See [@Smith2024] and #inline-tag.',
      'Missing [[nowhere]].'
    ].join('\n'));
    fs.writeFileSync(path.join(root, 'notes', 'beta.md'), '# Beta\nBack to [[alpha]].\n');
    fs.writeFileSync(path.join(root, 'labels.csv'), 'item_id,label\na,accept\nb,reject\n');
    fs.writeFileSync(path.join(root, 'items.jsonl'), '{"id":"a","text":"needle in jsonl"}\n{"id":"b"}\n');
    fs.writeFileSync(path.join(root, 'references.bib'), '@article{Smith2024, title={Indexed evidence}}\n');
    fs.writeFileSync(path.join(root, 'paper.pdf'), Buffer.from('%PDF test'));
    fs.writeFileSync(path.join(root, 'node_modules', 'ignored', 'hidden.md'), '# Do not index');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('classifies supported text, structured records, and bounded binary metadata', () => {
    expect(classifyFile('/a/file.jsonl')).toMatchObject({ supported: true, searchable: true, format: 'jsonl' });
    expect(classifyFile('/a/file.csv')).toMatchObject({ supported: true, searchable: true, format: 'csv' });
    expect(classifyFile('/a/file.pdf')).toMatchObject({ supported: true, searchable: false, format: 'pdf' });
    expect(classifyFile('/a/file.exe').supported).toBe(false);

    const metadata = extractTextMetadata('# Heading\nSee [[Note]] [@Key2026] #topic', classifyFile('a.md'));
    expect(metadata.headings[0]).toMatchObject({ text: 'Heading', level: 1, slug: 'heading' });
    expect(metadata.links[0]).toMatchObject({ kind: 'wiki', target: 'Note' });
    expect(metadata.citations).toEqual(['Key2026']);
    expect(metadata.tags).toEqual(['topic']);

    const bibMetadata = extractTextMetadata('@article{Key2026, title={Evidence}}', classifyFile('references.bib'));
    expect(bibMetadata.citations).toEqual([]);
    expect(bibMetadata.definedCitations).toEqual(['Key2026']);
  });

  test('indexes all supported formats once and reuses unchanged extraction work', async () => {
    const index = new WorkspaceIndex({ yieldEvery: 2 });
    index.setRoots([root]);
    const first = await index.refresh();

    expect(first.success).toBe(true);
    expect(first.status).toMatchObject({ indexed: 6, parsed: 5, reused: 0, state: 'ready' });
    const listed = await index.list();
    expect(listed.files.map(file => file.relativePath)).toEqual([
      'items.jsonl',
      'labels.csv',
      'notes/alpha.md',
      'notes/beta.md',
      'paper.pdf',
      'references.bib'
    ]);
    expect(listed.files.find(file => file.relativePath === 'items.jsonl').structured).toMatchObject({
      recordCount: 2,
      invalidRecords: 0
    });
    expect(listed.files.find(file => file.relativePath === 'labels.csv').structured).toMatchObject({
      headers: ['item_id', 'label'],
      recordCount: 2
    });
    expect(listed.files.some(file => file.relativePath.includes('node_modules'))).toBe(false);

    index.invalidate('test-no-op');
    const second = await index.refresh();
    expect(second.status).toMatchObject({ indexed: 6, reused: 6, parsed: 0, bytesRead: 0 });
  });

  test('updates changed, renamed, deleted, and newly ignored paths deterministically', async () => {
    const index = new WorkspaceIndex();
    index.setRoots([root]);
    await index.refresh();

    fs.writeFileSync(path.join(root, 'items.jsonl'), '{"id":"changed","text":"fresh result"}\n');
    fs.renameSync(path.join(root, 'notes', 'beta.md'), path.join(root, 'notes', 'gamma.md'));
    fs.unlinkSync(path.join(root, 'paper.pdf'));
    index.invalidate('filesystem-change');
    const refreshed = await index.refresh();

    expect(refreshed.status.indexed).toBe(5);
    expect(refreshed.status.reused).toBe(3);
    const listed = await index.list();
    expect(listed.files.map(file => file.relativePath)).toEqual([
      'items.jsonl', 'labels.csv', 'notes/alpha.md', 'notes/gamma.md', 'references.bib'
    ]);
    const search = await index.search('fresh result');
    expect(search.results).toHaveLength(1);
    expect(search.results[0]).toMatchObject({ fileName: 'items.jsonl', line: 1 });
  });

  test('shares identities across links, backlinks, unresolved links, tags, citations, and graph data', async () => {
    const index = new WorkspaceIndex();
    index.setRoots([root]);
    await index.refresh();
    const alphaPath = path.join(root, 'notes', 'alpha.md');
    const betaPath = path.join(root, 'notes', 'beta.md');

    const alphaLinks = await index.getLinks({ filePath: alphaPath });
    expect(alphaLinks.outgoing.find(link => link.target === 'beta')).toMatchObject({ resolvedPath: betaPath });
    expect(alphaLinks.outgoing.find(link => link.target === 'nowhere')).toMatchObject({ targetId: null, ambiguous: false });
    const betaLinks = await index.getLinks({ filePath: betaPath });
    expect(betaLinks.backlinks.map(link => link.sourcePath)).toContain(alphaPath);
    expect(betaLinks.unresolved).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourcePath: alphaPath, target: 'nowhere' })
    ]));

    const graph = await index.graph();
    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `file:${alphaPath}`, type: 'file' }),
      expect.objectContaining({ id: 'tag:research', type: 'tag' }),
      expect.objectContaining({ id: 'citation:Smith2024', type: 'citation' })
    ]));
    expect(graph.edges).toEqual(expect.arrayContaining([
      { source: `file:${alphaPath}`, target: `file:${betaPath}`, type: 'reference' },
      { source: `file:${alphaPath}`, target: 'citation:Smith2024', type: 'citation' },
      { source: `file:${path.join(root, 'references.bib')}`, target: 'citation:Smith2024', type: 'defines-citation' }
    ]));
  });

  test('searches markdown, CSV, JSONL, and BibTeX through the same scoped index', async () => {
    const index = new WorkspaceIndex();
    index.setRoots([root]);
    await index.refresh();

    expect((await index.search('accept')).results[0].fileName).toBe('labels.csv');
    expect((await index.search('needle in jsonl')).results[0].fileName).toBe('items.jsonl');
    expect((await index.search('Indexed evidence')).results[0].fileName).toBe('references.bib');
    expect((await index.search('Beta', { paths: [path.join(root, 'notes', 'beta.md')] })).results)
      .toHaveLength(1);
    expect((await index.list({ query: 'paper' })).files[0]).toMatchObject({ format: 'pdf', searchable: false });
  });

  test('plans every affected reference before rename without mutating source', async () => {
    const index = new WorkspaceIndex();
    index.setRoots([root]);
    await index.refresh();
    const betaPath = path.join(root, 'notes', 'beta.md');
    const renamedPath = path.join(root, 'notes', 'reviewed.md');
    const before = fs.readFileSync(path.join(root, 'notes', 'alpha.md'), 'utf8');

    const plan = await index.planRename(betaPath, renamedPath);
    expect(plan).toMatchObject({ success: true, affectedFiles: 1, referenceCount: 1 });
    expect(plan.references[0]).toMatchObject({
      sourceRelativePath: 'notes/alpha.md',
      kind: 'wiki',
      originalTarget: 'beta',
      replacement: './reviewed'
    });
    expect(fs.readFileSync(path.join(root, 'notes', 'alpha.md'), 'utf8')).toBe(before);
  });

  test('exposes budgets and cancellation while retaining the last complete index', async () => {
    let index;
    let shouldCancel = false;
    index = new WorkspaceIndex({
      yieldEvery: 1,
      maxFiles: 100,
      maxContentBytes: 64,
      yieldControl: async () => {
        if (shouldCancel) index.cancel();
      }
    });
    index.setRoots([root]);
    await index.refresh();
    const completeCount = (await index.list()).files.length;

    index.invalidate('cancel-test');
    shouldCancel = true;
    const cancelled = await index.refresh();
    expect(cancelled).toMatchObject({ success: false, cancelled: true });
    expect(cancelled.status).toMatchObject({
      state: 'cancelled',
      dirty: true,
      budget: { maxFiles: 100, maxContentBytes: 64, yieldEvery: 1 }
    });
    expect(index.entries.size).toBe(completeCount);
  });
});

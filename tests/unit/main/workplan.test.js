const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '../../..');
const workplanCli = path.join(repoRoot, 'scripts', 'workplan.js');
const schemaSource = path.join(repoRoot, 'workplan', 'schema', 'item.schema.json');
const { parseDoc, serializeDoc } = require(workplanCli);

function runCli(directory, ...args) {
  return spawnSync(process.execPath, [workplanCli, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, WORKPLAN_DIR: directory, WORKPLAN_RENDERED_AT: '2026-08-07T00:00:00.000Z' }
  });
}

describe('workplan CLI', () => {
  let directory;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nightowl-workplan-'));
    fs.mkdirSync(path.join(directory, 'items'), { recursive: true });
    fs.mkdirSync(path.join(directory, 'schema'), { recursive: true });
    fs.copyFileSync(schemaSource, path.join(directory, 'schema', 'item.schema.json'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('round-trips the supported frontmatter subset', () => {
    const original = {
      id: 'preview-race',
      title: 'Fix preview race',
      tags: ['preview', 'reliability'],
      owner: 'unassigned'
    };
    const parsed = parseDoc(serializeDoc(original, '## Context\n\nBody.\n'));
    expect(parsed.fm).toEqual(original);
    expect(parsed.body).toContain('## Context');
  });

  test('validates, renders, and checks authored items', () => {
    const item = `---\nid: "preview-race"\ntitle: "Fix preview race"\nstatus: "triaged"\ntype: "bug"\npriority: "P0"\narea: "preview"\nowner: "unassigned"\nsource: "systematic-review"\nevidence: "source-analysis"\ncreated: "2026-08-07"\nupdated: "2026-08-07"\nverification: "A latest-wins regression test passes."\ntags: ["preview", "reliability"]\n---\n\n## Context\n\nAn asynchronous render can finish late.\n`;
    fs.writeFileSync(path.join(directory, 'items', 'preview-race.md'), item);

    expect(runCli(directory, 'validate').status).toBe(0);
    expect(runCli(directory, 'render').status).toBe(0);
    const check = runCli(directory, 'check');
    expect(check.status).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(directory, 'board.json'), 'utf8')).counts.total).toBe(1);
    expect(fs.readFileSync(path.join(directory, 'BOARD.md'), 'utf8')).toContain('preview-race');
  });

  test('rejects unknown dependencies and stale generated views', () => {
    const itemPath = path.join(directory, 'items', 'preview-race.md');
    fs.writeFileSync(itemPath, `---\nid: "preview-race"\ntitle: "Fix preview race"\nstatus: "triaged"\ntype: "bug"\npriority: "P0"\narea: "preview"\nowner: "unassigned"\nsource: "systematic-review"\nevidence: "source-analysis"\ncreated: "2026-08-07"\nupdated: "2026-08-07"\nverification: "A regression test passes."\ndepends_on: ["missing-item"]\n---\n\nContext.\n`);
    expect(runCli(directory, 'validate').status).toBe(1);

    fs.writeFileSync(itemPath, fs.readFileSync(itemPath, 'utf8').replace('depends_on: ["missing-item"]\n', ''));
    expect(runCli(directory, 'render').status).toBe(0);
    fs.appendFileSync(itemPath, '\nChanged after render.\n');
    // Body-only edits intentionally do not stale the board; frontmatter edits do.
    fs.writeFileSync(itemPath, fs.readFileSync(itemPath, 'utf8').replace('priority: "P0"', 'priority: "P1"'));
    expect(runCli(directory, 'check').status).toBe(1);
  });
});

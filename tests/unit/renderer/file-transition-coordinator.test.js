const path = require('path');

const modulePath = path.resolve(
  __dirname,
  '../../../orchestrator/modules/file-transition-coordinator.js'
);

function deferred() {
  let resolve;
  const promise = new Promise(next => { resolve = next; });
  return { promise, resolve };
}

describe('file transition coordinator', () => {
  let createCoordinator;

  beforeEach(() => {
    jest.resetModules();
    delete window.NightOwlFileTransitions;
    ({ createCoordinator } = require(modulePath));
  });

  test('starting a new transition explicitly supersedes the previous token', async () => {
    const coordinator = createCoordinator();
    const first = coordinator.begin('file', '/workspace/a.md');
    const second = coordinator.begin('file', '/workspace/b.md');

    await expect(first.done).resolves.toMatchObject({
      status: 'superseded',
      reason: 'newer-transition'
    });
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  test('rapid A-B-A interleavings only commit the final request', async () => {
    const coordinator = createCoordinator();
    const commits = [];
    const gates = [deferred(), deferred(), deferred()];

    const run = async (filePath, content, gate) => {
      const token = coordinator.begin('file', filePath, { content });
      await gate.promise;
      const result = token.commit(() => commits.push({ filePath, content }));
      if (result.committed) coordinator.complete(token, { content });
      return token.done;
    };

    const firstA = run('/workspace/a.md', 'old A', gates[0]);
    const b = run('/workspace/b.md', 'B', gates[1]);
    const finalA = run('/workspace/a.md', 'final A', gates[2]);

    gates[1].resolve();
    gates[0].resolve();
    gates[2].resolve();

    await expect(firstA).resolves.toMatchObject({ status: 'superseded' });
    await expect(b).resolves.toMatchObject({ status: 'superseded' });
    await expect(finalA).resolves.toMatchObject({ status: 'committed', content: 'final A' });
    expect(commits).toEqual([{ filePath: '/workspace/a.md', content: 'final A' }]);
  });

  test('same-file reloads keep only the newest content', async () => {
    const coordinator = createCoordinator();
    const first = coordinator.begin('file', '/workspace/a.md', { content: 'v1' });
    const second = coordinator.begin('file', '/workspace/a.md', { content: 'v2' });

    expect(first.commit(() => 'stale')).toMatchObject({ committed: false });
    expect(second.commit(() => 'v2')).toMatchObject({ committed: true, value: 'v2' });
    expect(coordinator.complete(second, { content: 'v2' })).toMatchObject({
      status: 'committed',
      content: 'v2'
    });
  });

  test('file and preview channels can be invalidated independently', () => {
    const coordinator = createCoordinator();
    const file = coordinator.begin('file', '/workspace/a.md');
    const preview = coordinator.begin('preview', '/workspace/a.md');

    coordinator.supersede('preview', 'editor-content-changed');

    expect(file.isCurrent()).toBe(true);
    expect(preview.status).toBe('superseded');
    expect(preview.outcome.reason).toBe('editor-content-changed');
  });

  test('completed work remains latest only until the next request is announced', () => {
    const coordinator = createCoordinator();
    const first = coordinator.begin('preview', '/workspace/a.md');

    coordinator.complete(first);
    expect(first.isLatest()).toBe(true);

    coordinator.supersede('preview', 'editor-content-changed');
    expect(first.isLatest()).toBe(false);
  });

  test('mixed file formats share one latest-wins commit boundary', async () => {
    const coordinator = createCoordinator();
    const commits = [];
    const paths = [
      '/workspace/a.md',
      '/workspace/labels.jsonl',
      '/workspace/table.csv',
      '/workspace/page.html',
      '/workspace/diagram.png',
      '/workspace/slides.pdf'
    ];
    const requests = paths.map(filePath => ({
      filePath,
      token: coordinator.begin('file', filePath)
    }));

    for (const request of requests.slice().reverse()) {
      const committed = request.token.commit(() => commits.push(request.filePath));
      if (committed.committed) coordinator.complete(request.token);
    }

    await expect(Promise.all(requests.map(request => request.token.done))).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: '/workspace/slides.pdf', status: 'committed' })
      ])
    );
    expect(commits).toEqual(['/workspace/slides.pdf']);
  });

  test('failures settle with an inspectable outcome', async () => {
    const coordinator = createCoordinator();
    const token = coordinator.begin('file', '/workspace/broken.md');

    coordinator.fail(token, new Error('render failed'));

    await expect(token.done).resolves.toMatchObject({
      status: 'failed',
      error: 'render failed'
    });
  });
});

const path = require('path');

const transitionsPath = path.resolve(__dirname, '../../../orchestrator/modules/file-transition-coordinator.js');
const fileOpenPath = path.resolve(__dirname, '../../../orchestrator/modules/file-open-controller.js');
const previewRouterPath = path.resolve(__dirname, '../../../orchestrator/modules/preview-router.js');
const fileTreePath = path.resolve(__dirname, '../../../orchestrator/modules/file-tree-controller.js');
const panePath = path.resolve(__dirname, '../../../orchestrator/modules/pane-controller.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('renderer workflow controllers', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('file-open controller keeps only the newest delayed request current', async () => {
    const { createCoordinator } = require(transitionsPath);
    const { createFileOpenController } = require(fileOpenPath);
    const transitions = createCoordinator();
    const gates = { a: deferred(), b: deferred() };
    const applied = [];
    const completed = [];
    const controller = createFileOpenController({
      transitions,
      readPath: jest.fn(),
      applyContent: async (filePath, content, options) => {
        await gates[content].promise;
        options.transition.commit(() => applied.push(filePath));
      },
      onComplete: ({ filePath }) => completed.push(filePath)
    });

    const first = controller.openContent('/workspace/a.md', 'a');
    const second = controller.openContent('/workspace/b.md', 'b');
    gates.a.resolve();
    gates.b.resolve();

    await expect(first).resolves.toMatchObject({ status: 'superseded' });
    await expect(second).resolves.toMatchObject({ status: 'committed', filePath: '/workspace/b.md' });
    expect(applied).toEqual(['/workspace/b.md']);
    expect(completed).toEqual(['/workspace/b.md']);
    expect(controller.getActive()).toBeNull();
  });

  test('file-open path failures are terminal and expose an injected retry', async () => {
    const { createCoordinator } = require(transitionsPath);
    const { createFileOpenController } = require(fileOpenPath);
    let failure;
    const controller = createFileOpenController({
      transitions: createCoordinator(),
      readPath: jest.fn(async () => ({ success: false, error: 'read failed' })),
      applyContent: jest.fn(),
      onFailure: detail => { failure = detail; }
    });

    await expect(controller.openPath('/workspace/missing.md')).resolves.toMatchObject({
      status: 'failed',
      error: 'read failed',
      correlationId: expect.stringMatching(/^NO-FILE-/),
      requestId: expect.stringMatching(/^NO-FILE-/)
    });
    expect(failure.error.message).toBe('read failed');
    expect(failure.transition.correlationId).toMatch(/^NO-FILE-/);
    expect(typeof failure.retry).toBe('function');
  });

  test('preview router classifies formats and prevents delayed stale commits', async () => {
    const { createCoordinator } = require(transitionsPath);
    const { classifyFilePath, createPreviewRouter } = require(previewRouterPath);
    expect(classifyFilePath('/workspace/a.pdf')).toMatchObject({ kind: 'pdf', isBinaryPreview: true });
    expect(classifyFilePath('/workspace/slides.pptx')).toMatchObject({
      kind: 'pptx', isPPTX: true, isBinaryPreview: true, isEditable: false
    });
    expect(classifyFilePath('/workspace/a.JSONL')).toMatchObject({ kind: 'jsonl', isStructuredRecord: true });
    expect(classifyFilePath('/workspace/a.markdown')).toMatchObject({ kind: 'markdown', isEditable: true });

    const transitions = createCoordinator();
    const gates = { a: deferred(), b: deferred() };
    const commits = [];
    const router = createPreviewRouter({
      transitions,
      getCurrentFilePath: () => '',
      renderMarkdown: async ({ filePath, content, isCurrent }) => {
        await gates[content].promise;
        if (isCurrent()) commits.push(filePath);
        return 'markdown';
      }
    });

    const first = router.render('a', { filePath: '/workspace/a.md', allowPathMismatch: true });
    const second = router.render('b', { filePath: '/workspace/b.md', allowPathMismatch: true });
    gates.a.resolve();
    gates.b.resolve();

    await expect(first).resolves.toMatchObject({ status: 'superseded' });
    await expect(second).resolves.toMatchObject({ status: 'committed', renderer: 'markdown' });
    expect(commits).toEqual(['/workspace/b.md']);
  });

  test('preview failures keep the parent file correlation and expose content-free retry context', async () => {
    const { createCoordinator } = require(transitionsPath);
    const { createPreviewRouter } = require(previewRouterPath);
    const transitions = createCoordinator();
    const fileTransition = transitions.begin('file', '/workspace/private.md');
    let failure;
    const router = createPreviewRouter({
      transitions,
      getCurrentFilePath: () => '/workspace/private.md',
      isFileTransitionCurrent: () => true,
      renderMarkdown: jest.fn(async () => {
        throw new Error('render failed');
      }),
      onError: detail => { failure = detail; }
    });

    await expect(router.render('PRIVATE_MARKDOWN', {
      filePath: '/workspace/private.md',
      fileTransition
    })).resolves.toMatchObject({
      status: 'failed',
      correlationId: fileTransition.correlationId,
      error: 'render failed'
    });
    expect(failure.transition.correlationId).toBe(fileTransition.correlationId);
    expect(failure).not.toHaveProperty('content');
    expect(typeof failure.retry).toBe('function');
  });

  test('preview router owns binary, record, and HTML route selection', async () => {
    const { createCoordinator } = require(transitionsPath);
    const { createPreviewRouter } = require(previewRouterPath);
    const calls = [];
    const router = createPreviewRouter({
      transitions: createCoordinator(),
      getCurrentFilePath: () => '',
      renderRecord: filePath => calls.push(['record', filePath]) > 0,
      renderHTML: filePath => calls.push(['html', filePath]),
      renderMarkdown: async ({ filePath }) => {
        calls.push(['markdown', filePath]);
        return 'markdown';
      },
      onBlocked: ({ filePath }) => calls.push(['blocked', filePath])
    });

    await expect(router.render('', { filePath: '/workspace/image.png', allowPathMismatch: true }))
      .resolves.toMatchObject({ status: 'superseded', reason: 'file-scoped-preview-policy' });
    await expect(router.render('{}', { filePath: '/workspace/data.jsonl', allowPathMismatch: true }))
      .resolves.toMatchObject({ status: 'committed', renderer: 'records' });
    await expect(router.render('<h1>x</h1>', { filePath: '/workspace/page.html', allowPathMismatch: true }))
      .resolves.toMatchObject({ status: 'committed', renderer: 'html' });
    expect(calls).toEqual([
      ['blocked', '/workspace/image.png'],
      ['record', '/workspace/data.jsonl'],
      ['html', '/workspace/page.html']
    ]);
  });

  test('file-tree controller coalesces rendering and owns polling disposal', async () => {
    jest.useFakeTimers();
    const { createFileTreeController } = require(fileTreePath);
    const firstTree = deferred();
    const requestTree = jest.fn()
      .mockImplementationOnce(() => firstTree.promise)
      .mockResolvedValue({ signature: 's1', children: ['second'] });
    const renderTree = jest.fn();
    const signatureChanged = jest.fn();
    const controller = createFileTreeController({
      requestTree,
      renderTree,
      requestSignature: jest.fn(async () => ({ success: true, signature: 's2' })),
      shouldPoll: () => true,
      onSignatureChanged: signatureChanged,
      pollMs: 100,
      setInterval,
      clearInterval,
      setTimeout
    });

    const initial = controller.render();
    await expect(controller.render()).resolves.toMatchObject({ status: 'queued' });
    firstTree.resolve({ signature: 's1', children: ['first'] });
    await expect(initial).resolves.toMatchObject({ status: 'rendered' });
    await flushPromises();
    expect(requestTree).toHaveBeenCalledTimes(2);
    expect(renderTree).toHaveBeenCalledTimes(2);

    expect(controller.startPolling()).toBe(true);
    jest.advanceTimersByTime(0);
    await flushPromises();
    expect(signatureChanged).toHaveBeenCalledWith({ previousSignature: 's1', signature: 's2' });
    expect(controller.getSnapshot()).toMatchObject({ rendered: false, pollActive: true });

    controller.dispose();
    expect(controller.getSnapshot().pollActive).toBe(false);
    jest.useRealTimers();
  });

  test('pane controller hydrates without persistence and centralizes pane commands', () => {
    const { createPaneController } = require(panePath);
    let state = {
      panes: { sidebar: true, editor: true, right: true },
      activeRightPane: 'preview'
    };
    const store = {
      getState: () => state,
      dispatch: jest.fn(action => {
        if (action.type === 'HYDRATE_PANES') state = { ...state, panes: { ...action.panes } };
        if (action.type === 'TOGGLE_PANE') {
          state = { ...state, panes: { ...state.panes, [action.pane]: !state.panes[action.pane] } };
        }
        if (action.type === 'SET_PANE_VISIBILITY') {
          state = { ...state, panes: { ...state.panes, [action.pane]: action.visible } };
        }
        if (action.type === 'SHOW_RIGHT_PANE') {
          state = { ...state, activeRightPane: action.pane, panes: { ...state.panes, right: true } };
        }
        return state;
      })
    };
    const persist = jest.fn();
    const onSearch = jest.fn();
    const onShown = jest.fn();
    const controller = createPaneController({ store, persist, onSearch, onShown });

    controller.hydrate({ sidebar: false, editor: true, right: true });
    expect(persist).not.toHaveBeenCalled();
    controller.toggle('sidebar');
    expect(persist).toHaveBeenLastCalledWith({
      sidebarVisible: true,
      editorVisible: true,
      previewVisible: true
    });
    controller.show('chat');
    expect(onShown).toHaveBeenCalledWith('chat', expect.objectContaining({ activeRightPane: 'chat' }));
    controller.show('search');
    expect(onSearch).toHaveBeenCalledTimes(1);
  });
});

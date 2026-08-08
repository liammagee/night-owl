const path = require('path');

const modeSwitcherPath = path.resolve(__dirname, '../../../js/mode-switcher.js');
const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);

function createReactRuntime(renderImplementation = () => {}) {
  class Component {
    constructor(props) {
      this.props = props;
      this.state = {};
    }
  }

  const createElement = jest.fn((type, props, ...children) => ({
    type,
    props: {
      ...(props || {}),
      ...(children.length ? { children: children.length === 1 ? children[0] : children } : {})
    }
  }));
  const roots = [];
  const createRoot = jest.fn(() => {
    const root = {
      render: jest.fn(renderImplementation),
      unmount: jest.fn()
    };
    roots.push(root);
    return root;
  });

  window.React = { Component, createElement };
  window.ReactDOM = { createRoot };
  return { createElement, createRoot, roots };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('presentation load recovery', () => {
  let diagnosticsLogger;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    document.getElementById = nativeGetElementById;
    document.body.innerHTML = `
      <div id="editor-content" class="content-view"></div>
      <div id="presentation-content" class="content-view">
        <div id="presentation-root"></div>
      </div>
      <button id="editor-mode-btn" class="mode-btn"></button>
      <button id="presentation-mode-btn" class="mode-btn"></button>
    `;

    delete window.React;
    delete window.ReactDOM;
    delete window.MarkdownPreziApp;
    delete window.NightOwlFeatures;
    delete window.pendingPresentationContent;
    delete window.showSpeakerNotesPanel;
    delete window.hideSpeakerNotesPanel;
    delete window.syncContentToPresentationImmediate;
    delete window.editor;
    delete window.electronAPI;
    diagnosticsLogger = {
      error: jest.fn((code, error, _context, options) => ({
        id: options.correlationId,
        correlationId: options.correlationId,
        code,
        state: options.state,
        message: error.message
      })),
      warn: jest.fn()
    };
    window.NightOwlDiagnostics = {
      createCorrelationId: jest.fn(() => 'NO-PRESENTATION-TEST-1'),
      logger: jest.fn(() => diagnosticsLogger),
      copyReport: jest.fn(async () => ({ success: true })),
      open: jest.fn(async () => {})
    };
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    delete window.NightOwlDiagnostics;
  });

  test('feature timeout shows actions and Retry performs a fresh successful mount', async () => {
    const unsubscribe = jest.fn();
    window.NightOwlFeatures = {
      on: jest.fn(() => unsubscribe),
      start: jest.fn(async () => {})
    };
    window.editor = { getValue: jest.fn(() => '# Recovered deck') };

    const modeSwitcher = require(modeSwitcherPath);
    modeSwitcher.switchToMode('presentation');
    await jest.advanceTimersByTimeAsync(8000);
    await flushPromises();

    const root = document.getElementById('presentation-root');
    expect(root.dataset.presentationLoadState).toBe('failed');
    expect(root.textContent).toContain('NO-PRES-FEATURE');
    expect(root.querySelector('.presentation-load-retry')).toBeTruthy();
    expect(root.querySelector('.presentation-load-return')).toBeTruthy();
    expect(unsubscribe).toHaveBeenCalled();

    const runtime = createReactRuntime();
    window.MarkdownPreziApp = function MarkdownPreziApp() {};
    window.showSpeakerNotesPanel = jest.fn();
    window.hideSpeakerNotesPanel = jest.fn();
    root.querySelector('.presentation-load-retry').click();
    await flushPromises();

    expect(root.dataset.presentationLoadState).toBe('ready');
    expect(runtime.createRoot).toHaveBeenCalledTimes(1);
  });

  test('a synchronous React mount failure becomes recoverable and Retry creates a fresh root', async () => {
    let shouldThrow = true;
    const runtime = createReactRuntime(() => {
      if (shouldThrow) throw new Error('injected render failure');
    });
    window.MarkdownPreziApp = function MarkdownPreziApp() {};
    window.showSpeakerNotesPanel = jest.fn();
    window.hideSpeakerNotesPanel = jest.fn();
    window.editor = { getValue: jest.fn(() => '# Render retry') };

    const modeSwitcher = require(modeSwitcherPath);
    modeSwitcher.switchToMode('presentation');
    await flushPromises();

    const root = document.getElementById('presentation-root');
    expect(root.dataset.presentationLoadState).toBe('failed');
    expect(root.dataset.viewState).toBe('failed');
    expect(root.dataset.correlationId).toBe('NO-PRESENTATION-TEST-1');
    expect(root.textContent).toContain('NO-PRES-RENDER');
    expect(root.textContent).toContain('NO-PRESENTATION-TEST-1');
    expect(diagnosticsLogger.error).toHaveBeenCalledWith(
      'NO-PRES-RENDER',
      expect.any(Error),
      expect.objectContaining({ diagnosticId: 'NO-PRES-RENDER' }),
      { correlationId: 'NO-PRESENTATION-TEST-1', state: 'failed' }
    );
    expect(runtime.roots[0].unmount).toHaveBeenCalledTimes(1);

    shouldThrow = false;
    root.querySelector('.presentation-load-retry').click();
    await flushPromises();

    expect(root.dataset.presentationLoadState).toBe('ready');
    expect(runtime.createRoot).toHaveBeenCalledTimes(2);
    expect(runtime.roots[1].render).toHaveBeenCalledTimes(1);
  });

  test('Reset View returns to a clean editor state without restarting', async () => {
    const runtime = createReactRuntime(() => {
      throw new Error('reset this renderer');
    });
    window.MarkdownPreziApp = function MarkdownPreziApp() {};
    window.showSpeakerNotesPanel = jest.fn();
    window.hideSpeakerNotesPanel = jest.fn();
    window.editor = { getValue: jest.fn(() => '# Resettable deck') };

    const modeSwitcher = require(modeSwitcherPath);
    modeSwitcher.switchToMode('presentation');
    await flushPromises();

    const root = document.getElementById('presentation-root');
    root.querySelector('.presentation-load-reset').click();

    expect(window.currentMode).toBe('editor');
    expect(root.dataset.presentationLoadState).toBe('cancelled');
    expect(root.dataset.viewState).toBe('cancelled');
    expect(root.dataset.correlationId).toBeUndefined();
    expect(runtime.roots[0].unmount).toHaveBeenCalledTimes(1);
  });

  test('an injected content-parse failure reports its diagnostic and can be retried', async () => {
    const runtime = createReactRuntime();
    window.MarkdownPreziApp = function MarkdownPreziApp() {};
    window.showSpeakerNotesPanel = jest.fn();
    window.hideSpeakerNotesPanel = jest.fn();
    window.editor = { getValue: jest.fn(() => '# Invalid then valid') };

    const modeSwitcher = require(modeSwitcherPath);
    modeSwitcher.switchToMode('presentation');
    await flushPromises();

    const componentCall = runtime.createElement.mock.calls.find(
      ([component]) => component === window.MarkdownPreziApp
    );
    componentCall[1].onPresentationError(new Error('injected parse failure'));
    await flushPromises();

    const root = document.getElementById('presentation-root');
    expect(root.dataset.presentationLoadState).toBe('failed');
    expect(root.textContent).toContain('NO-PRES-CONTENT');

    root.querySelector('.presentation-load-retry').click();
    await flushPromises();
    expect(root.dataset.presentationLoadState).toBe('ready');
    expect(runtime.createRoot).toHaveBeenCalledTimes(2);
  });

  test('leaving presentation aborts readiness listeners and prevents a stale mount', async () => {
    const unsubscribe = jest.fn();
    window.NightOwlFeatures = {
      on: jest.fn(() => unsubscribe),
      start: jest.fn(async () => {})
    };
    const runtime = createReactRuntime();
    window.editor = { getValue: jest.fn(() => '# Cancelled deck') };

    const modeSwitcher = require(modeSwitcherPath);
    modeSwitcher.switchToMode('presentation');
    modeSwitcher.switchToMode('editor');
    await flushPromises();

    const root = document.getElementById('presentation-root');
    expect(root.dataset.presentationLoadState).toBe('cancelled');
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    window.MarkdownPreziApp = function MarkdownPreziApp() {};
    window.showSpeakerNotesPanel = jest.fn();
    window.hideSpeakerNotesPanel = jest.fn();
    await jest.advanceTimersByTimeAsync(8000);
    await flushPromises();

    expect(root.dataset.presentationLoadState).toBe('cancelled');
    expect(runtime.createRoot).not.toHaveBeenCalled();
  });

  test('a fresh mount receives current Markdown once without also dispatching an update', async () => {
    const runtime = createReactRuntime();
    window.MarkdownPreziApp = function MarkdownPreziApp() {};
    window.showSpeakerNotesPanel = jest.fn();
    window.hideSpeakerNotesPanel = jest.fn();
    window.syncContentToPresentationImmediate = jest.fn();
    window.editor = { getValue: jest.fn(() => '# Exactly once') };

    const modeSwitcher = require(modeSwitcherPath);
    modeSwitcher.switchToMode('presentation');
    await flushPromises();

    const componentCalls = runtime.createElement.mock.calls.filter(
      ([component]) => component === window.MarkdownPreziApp
    );
    expect(componentCalls).toHaveLength(1);
    expect(componentCalls[0][1]).toEqual(expect.objectContaining({ markdown: '# Exactly once' }));
    expect(window.syncContentToPresentationImmediate).not.toHaveBeenCalled();
  });
});

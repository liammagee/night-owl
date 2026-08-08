const path = require('path');

const storePath = path.resolve(__dirname, '../../../orchestrator/modules/ui-state-store.js');
const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);

function installDOM() {
  document.body.innerHTML = `
    <div id="mode-switcher"></div>
    <div id="editor-toolbar"></div>
    <div id="editor-status-bar"></div>
    <div id="left-sidebar"></div>
    <div id="sidebar-resizer"></div>
    <div id="editor-pane"></div>
    <div id="resizer"></div>
    <div id="right-pane"></div>
    <div id="editor-content" class="content-view active"></div>
    <div id="presentation-content" class="content-view"></div>
    <div id="network-content" class="content-view"></div>
    <button id="editor-mode-btn" class="mode-btn active"></button>
    <button id="presentation-mode-btn" class="mode-btn"></button>
    <button id="network-mode-btn" class="mode-btn"></button>
    <div id="preview-pane" class="content-pane"></div>
    <div id="chat-pane" class="content-pane"></div>
    <div id="recognition-pane" class="content-pane"></div>
    <div id="preview-content"></div>
    <pre id="preview-source"></pre>
    <div id="preview-source-toolbar"></div>
    <button id="preview-source-btn"></button>
    <button id="preview-source-sync-toggle"></button>
    <button id="preview-fullscreen-btn"></button>
    <button id="preview-scroll-sync-btn"></button>
    <section id="jsonl-record-mode"></section>
  `;
}

describe('NightOwl UI state store', () => {
  let api;
  let frames;
  let store;

  beforeEach(() => {
    jest.resetModules();
    document.getElementById = nativeGetElementById;
    installDOM();
    frames = [];
    window.requestAnimationFrame = callback => {
      frames.push(callback);
      return frames.length;
    };
    window.editor = { layout: jest.fn() };
    api = require(storePath);
    store = api.createUIStateStore({ root: window, document });
  });

  test('never allows both workspace panes to be hidden', () => {
    store.dispatch({ type: 'SET_PANE_VISIBILITY', pane: 'editor', visible: false });
    store.dispatch({ type: 'SET_PANE_VISIBILITY', pane: 'right', visible: false });

    expect(store.getState().panes).toMatchObject({ editor: true, right: false });
    expect(store.getEffectivePanes()).toMatchObject({ editor: true, right: false });
  });

  test('fullscreen, source view, and record mode are mutually exclusive', () => {
    store.dispatch({ type: 'SET_PREVIEW_FULLSCREEN', fullscreen: true });
    expect(store.getState().preview).toMatchObject({ fullscreen: true, sourceView: false });

    store.dispatch({ type: 'SET_SOURCE_VIEW', enabled: true });
    expect(store.getState().preview).toMatchObject({ fullscreen: false, sourceView: true });

    store.dispatch({ type: 'SET_STRUCTURED_RECORD', active: true, sourceVisible: false });
    expect(store.getState().preview).toMatchObject({ fullscreen: false, sourceView: false });
    store.dispatch({ type: 'SET_PREVIEW_FULLSCREEN', fullscreen: true });
    store.dispatch({ type: 'SET_SOURCE_VIEW', enabled: true });
    expect(store.getState().preview).toMatchObject({ fullscreen: false, sourceView: false });
  });

  test('record and zen overlays restore the untouched base pane arrangement', () => {
    store.dispatch({ type: 'HYDRATE_PANES', panes: { sidebar: false, editor: false, right: true } });
    store.dispatch({ type: 'SHOW_RIGHT_PANE', pane: 'chat' });
    const base = { ...store.getState().panes };

    store.dispatch({ type: 'SET_STRUCTURED_RECORD', active: true, sourceVisible: false });
    expect(store.getEffectivePanes()).toEqual({ sidebar: false, editor: false, right: true });
    store.dispatch({ type: 'SET_RECORD_SOURCE_VISIBLE', visible: true });
    expect(store.getEffectivePanes()).toEqual({ sidebar: false, editor: true, right: true });
    store.dispatch({ type: 'SET_STRUCTURED_RECORD', active: false });
    expect(store.getState().panes).toEqual(base);
    expect(store.getState().activeRightPane).toBe('chat');
    expect(store.getEffectivePanes()).toEqual(base);

    store.dispatch({ type: 'SET_ZEN_MODE', active: true });
    expect(store.getEffectivePanes()).toEqual({ sidebar: false, editor: true, right: false });
    store.dispatch({ type: 'SET_ZEN_MODE', active: false });
    expect(store.getEffectivePanes()).toEqual(base);
  });

  test('DOM classes are a projection of mode, pane, source, and record state', () => {
    store.dispatch({ type: 'SET_MODE', mode: 'network' });
    store.dispatch({ type: 'SHOW_RIGHT_PANE', pane: 'chat' });
    expect(document.body.dataset.nightowlMode).toBe('network');
    expect(document.getElementById('network-content').classList.contains('active')).toBe(true);
    expect(document.getElementById('chat-pane').classList.contains('ui-pane-active')).toBe(true);
    expect(document.getElementById('preview-pane').classList.contains('pane-hidden')).toBe(true);

    store.dispatch({ type: 'SET_MODE', mode: 'editor' });
    store.dispatch({ type: 'SET_SOURCE_VIEW', enabled: true });
    expect(document.getElementById('preview-content').classList.contains('nightowl-ui-hidden')).toBe(true);
    expect(document.getElementById('preview-source').classList.contains('nightowl-ui-hidden')).toBe(false);

    store.dispatch({ type: 'SET_STRUCTURED_RECORD', active: true, sourceVisible: false });
    expect(document.body.classList.contains('jsonl-record-mode-active')).toBe(true);
    expect(document.getElementById('jsonl-record-mode').classList.contains('nightowl-ui-hidden')).toBe(false);
    expect(document.getElementById('right-pane').classList.contains('ui-record-focus')).toBe(true);
  });

  test('completion coalesces Monaco layout and dispatches presentation resize after the frame', () => {
    const completion = jest.fn();
    const resize = jest.fn();
    store.onTransitionComplete(completion);
    window.addEventListener('resize', resize, { once: true });

    store.dispatch({ type: 'SET_MODE', mode: 'presentation' });
    store.dispatch({ type: 'SET_PANE_VISIBILITY', pane: 'sidebar', visible: false });
    expect(window.editor.layout).not.toHaveBeenCalled();
    expect(resize).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);

    frames.shift()();
    expect(window.editor.layout).toHaveBeenCalledTimes(1);
    expect(completion).toHaveBeenCalledTimes(1);
    expect(resize).toHaveBeenCalledTimes(1);
  });
});

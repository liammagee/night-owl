const path = require('path');

const modeSwitcherPath = path.resolve(__dirname, '../../../js/mode-switcher.js');
const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);

function installDOM() {
  document.body.innerHTML = `
    <div id="mode-switcher"></div>
    <div id="left-sidebar"></div>
    <div id="sidebar-resizer"></div>
    <div id="editor-pane"></div>
    <div id="resizer"></div>
    <div id="right-pane"><div>
      <div id="preview-pane" class="content-pane"></div>
      <div id="chat-pane" class="content-pane"></div>
      <div id="speaker-notes-pane" class="content-pane"></div>
      <div id="wholepart-pane" class="content-pane"></div>
    </div></div>
    <div id="editor-content" class="content-view active"></div>
    <div id="presentation-content" class="content-view"><div id="presentation-root"></div></div>
    <div id="network-content" class="content-view"></div>
    <div id="circle-content" class="content-view"><div id="circle-visualization"></div></div>
    <div id="library-content" class="content-view"></div>
    <button id="editor-mode-btn" class="mode-btn active"></button>
    <button id="presentation-mode-btn" class="mode-btn"></button>
    <button id="network-mode-btn" class="mode-btn"></button>
    <button id="circle-mode-btn" class="mode-btn"></button>
    <button id="library-mode-btn" class="mode-btn"></button>
  `;
}

describe('mode switcher shared-state integration', () => {
  let frames;

  beforeEach(() => {
    jest.resetModules();
    document.getElementById = nativeGetElementById;
    installDOM();
    delete window.NightOwlUIState;
    delete window.currentMode;
    delete window.electronAPI;
    delete window.NightOwlFeatures;
    delete window.UnifiedNetworkVisualization;
    delete window.initializeCircleVisualization;
    frames = [];
    window.requestAnimationFrame = callback => {
      frames.push(callback);
      return frames.length;
    };
    window.editor = {
      getValue: jest.fn(() => '# State test'),
      getPosition: jest.fn(() => ({ lineNumber: 1, column: 1 })),
      layout: jest.fn(),
      focus: jest.fn()
    };
    window.hideSpeakerNotesPanel = jest.fn();
  });

  test('window.currentMode remains a live compatibility view of the store', () => {
    const modeSwitcher = require(modeSwitcherPath);

    expect(window.currentMode).toBe('editor');
    expect(modeSwitcher.switchToMode('network')).toBe(true);
    expect(window.currentMode).toBe('network');
    expect(window.NightOwlUIState.getState().mode).toBe('network');
    expect(document.getElementById('network-content').classList.contains('active')).toBe(true);
    expect(document.getElementById('network-mode-btn').classList.contains('active')).toBe(true);
    expect(document.getElementById('editor-content').classList.contains('active')).toBe(false);
  });

  test('mode cycles preserve the exact base pane arrangement and selection', () => {
    const modeSwitcher = require(modeSwitcherPath);
    const store = window.NightOwlUIState;
    store.dispatch({ type: 'SET_PANE_VISIBILITY', pane: 'sidebar', visible: false });
    store.dispatch({ type: 'SHOW_RIGHT_PANE', pane: 'chat' });
    const before = store.getState();

    modeSwitcher.switchToMode('network');
    modeSwitcher.switchToMode('circle');
    modeSwitcher.switchToMode('editor');

    expect(store.getState().panes).toEqual(before.panes);
    expect(store.getState().activeRightPane).toBe('chat');
    expect(document.getElementById('left-sidebar').classList.contains('nightowl-ui-hidden')).toBe(true);
    expect(document.getElementById('chat-pane').classList.contains('ui-pane-active')).toBe(true);
    expect(document.getElementById('preview-pane').classList.contains('pane-hidden')).toBe(true);
  });

  test('layout runs at coalesced transition completion without a restoration timer', () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const modeSwitcher = require(modeSwitcherPath);

    modeSwitcher.switchToMode('network');
    modeSwitcher.switchToMode('editor');
    expect(window.editor.layout).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 100);

    expect(frames).toHaveLength(1);
    frames.shift()();
    expect(window.editor.layout).toHaveBeenCalledTimes(1);
    expect(window.editor.focus).toHaveBeenCalledTimes(1);
    setTimeoutSpy.mockRestore();
  });

  test('invalid modes are rejected without changing state or DOM', () => {
    const modeSwitcher = require(modeSwitcherPath);

    expect(modeSwitcher.switchToMode('graph')).toBe(false);
    expect(window.currentMode).toBe('editor');
    expect(document.getElementById('editor-content').classList.contains('active')).toBe(true);
  });
});

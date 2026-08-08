const path = require('path');

const pluginPath = path.resolve(__dirname, '../../../../plugins/techne-presentations/plugin.js');

describe('nightowl-presentations plugin', () => {
  let registered = null;
  let nativeGetElementById = null;

  beforeEach(() => {
    jest.resetModules();

    nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);
    document.getElementById = nativeGetElementById;

    registered = null;
    document.head.innerHTML = '';
    document.body.innerHTML = '';

    delete window.React;
    delete window.ReactDOM;
    delete window.MarkdownPreziApp;

    window.NightOwlFeatures = {
      register: (plugin) => {
        registered = plugin;
      }
    };
  });

  test('registers itself with NightOwlFeatures', () => {
    require(pluginPath);
    expect(registered).toBeTruthy();
    expect(registered.id).toBe('nightowl-presentations');
    expect(typeof registered.init).toBe('function');
  });

  test('loads core assets and injects speaker notes panel', async () => {
    require(pluginPath);

    const host = {
      loadCSS: jest.fn(async () => true),
      loadScriptsSequential: jest.fn(async () => true),
      emit: jest.fn()
    };

    await registered.init(host);

    // CSS loaded (with optional cache-busting query params)
    const cssArgs = host.loadCSS.mock.calls.map(c => c[0]);
    expect(cssArgs.some(url => url.includes('preview-presentation.css'))).toBe(true);
    expect(cssArgs.some(url => url.includes('speaker-notes.css'))).toBe(true);
    expect(host.loadCSS).toHaveBeenCalledWith(
      expect.stringContaining('preview-presentation.css'),
      { id: 'nightowl-presentations-preview-css' }
    );

    const scriptsArg = host.loadScriptsSequential.mock.calls[0][0];
    // Scripts loaded (with optional cache-busting query params)
    expect(scriptsArg.some(url => url.includes('presentation-viewport.js'))).toBe(true);
    expect(scriptsArg.findIndex(url => url.includes('presentation-viewport.js')))
      .toBeLessThan(scriptsArg.findIndex(url => url.includes('touch-gestures.js')));
    expect(scriptsArg.some(url => url.includes('ttsService.js'))).toBe(true);
    expect(scriptsArg.some(url => url.includes('videoRecordingService.js'))).toBe(true);
    expect(scriptsArg.some(url => url.includes('speaker-notes.js'))).toBe(true);
    expect(scriptsArg.some(url => url.includes('touch-gestures.js'))).toBe(true);

    expect(document.body.querySelector('#speaker-notes-panel')).toBeTruthy();
    expect(host.emit).toHaveBeenCalledWith('presentations:ready', { id: 'nightowl-presentations' });
  });

  test('includes presenter bundle when React globals exist', async () => {
    window.React = {
      createElement: jest.fn()
    };
    window.ReactDOM = {
      createRoot: jest.fn()
    };

    require(pluginPath);

    const host = {
      loadCSS: jest.fn(async () => true),
      loadScriptsSequential: jest.fn(async () => true),
      emit: jest.fn()
    };

    await registered.init(host);

    const scriptsArg = host.loadScriptsSequential.mock.calls[0][0];
    expect(scriptsArg.some(url => url.includes('MarkdownPreziApp.js'))).toBe(true);
  });

  test('mounts presentation mode with createRoot when available', async () => {
    const render = jest.fn();
    const unmount = jest.fn();
    window.React = {
      createElement: jest.fn((component, props) => ({ component, props }))
    };
    window.ReactDOM = {
      createRoot: jest.fn(() => ({ render, unmount }))
    };
    window.MarkdownPreziApp = function MarkdownPreziApp() {};

    require(pluginPath);

    const host = {
      loadCSS: jest.fn(async () => true),
      loadScriptsSequential: jest.fn(async () => true),
      emit: jest.fn()
    };

    await registered.init(host);

    const modeEvent = host.emit.mock.calls.find(call => call[0] === 'mode:available');
    expect(modeEvent).toBeTruthy();

    const container = document.createElement('div');
    const view = await modeEvent[1].mount(container, { content: '# Test' });
    expect(window.ReactDOM.createRoot).toHaveBeenCalledWith(container);
    expect(render).toHaveBeenCalledWith({
      component: window.MarkdownPreziApp,
      props: expect.objectContaining({ markdown: '# Test' })
    });

    modeEvent[1].unmount(view);
    expect(unmount).toHaveBeenCalled();
  });

  test('mounts presentation mode with legacy ReactDOM.render fallback', async () => {
    window.React = {
      createElement: jest.fn((component, props) => ({ component, props }))
    };
    window.ReactDOM = {
      render: jest.fn(),
      unmountComponentAtNode: jest.fn()
    };
    window.MarkdownPreziApp = function MarkdownPreziApp() {};

    require(pluginPath);

    const host = {
      loadCSS: jest.fn(async () => true),
      loadScriptsSequential: jest.fn(async () => true),
      emit: jest.fn()
    };

    await registered.init(host);

    const modeEvent = host.emit.mock.calls.find(call => call[0] === 'mode:available');
    const container = document.createElement('div');
    const view = await modeEvent[1].mount(container, { content: '# Legacy' });

    expect(window.ReactDOM.render).toHaveBeenCalledWith({
      component: window.MarkdownPreziApp,
      props: expect.objectContaining({ markdown: '# Legacy' })
    }, container);

    modeEvent[1].unmount(view);
    expect(window.ReactDOM.unmountComponentAtNode).toHaveBeenCalledWith(container);
  });

  test('does not include presenter bundle when React globals are missing', async () => {
    require(pluginPath);

    const host = {
      loadCSS: jest.fn(async () => true),
      loadScriptsSequential: jest.fn(async () => true),
      emit: jest.fn()
    };

    await registered.init(host);

    const scriptsArg = host.loadScriptsSequential.mock.calls[0][0];
    expect(scriptsArg.some(url => url.includes('MarkdownPreziApp.js'))).toBe(false);
  });
});

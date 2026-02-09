const path = require('path');

const pluginPath = path.resolve(__dirname, '../../../../plugins/techne-presentations/plugin.js');

describe('techne-presentations plugin', () => {
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

    window.TechnePlugins = {
      register: (plugin) => {
        registered = plugin;
      }
    };
  });

  test('registers itself with TechnePlugins', () => {
    require(pluginPath);
    expect(registered).toBeTruthy();
    expect(registered.id).toBe('techne-presentations');
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

    const scriptsArg = host.loadScriptsSequential.mock.calls[0][0];
    // Scripts loaded (with optional cache-busting query params)
    expect(scriptsArg.some(url => url.includes('ttsService.js'))).toBe(true);
    expect(scriptsArg.some(url => url.includes('videoRecordingService.js'))).toBe(true);
    expect(scriptsArg.some(url => url.includes('speaker-notes.js'))).toBe(true);
    expect(scriptsArg.some(url => url.includes('touch-gestures.js'))).toBe(true);

    expect(document.body.querySelector('#speaker-notes-panel')).toBeTruthy();
    expect(host.emit).toHaveBeenCalledWith('presentations:ready', { id: 'techne-presentations' });
  });

  test('includes presenter bundle when React globals exist', async () => {
    window.React = {};
    window.ReactDOM = {};

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


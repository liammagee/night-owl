const path = require('path');

const modulePath = path.resolve(__dirname, '../../../orchestrator/modules/assistant-terminal.js');
const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);

describe('Assistant terminal', () => {
  let listeners;

  async function flushAsync(times = 6) {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
  }

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    document.getElementById = nativeGetElementById;
    listeners = {};

    document.body.innerHTML = `
      <div id="chat-pane" style="display: none;">
        <span id="assistant-terminal-context"></span>
        <button id="assistant-launch-codex"></button>
        <button id="assistant-launch-claude"></button>
        <button id="assistant-launch-gemini"></button>
        <button id="assistant-launch-shell"></button>
        <button id="assistant-terminal-clear"></button>
        <button id="assistant-terminal-kill"></button>
        <div id="assistant-terminal-output"></div>
        <input id="assistant-terminal-input" />
      </div>
    `;

    window.appSettings = { workingDirectory: '/tmp/nightowl-workspace' };
    window.electronAPI = {
      invoke: jest.fn(async (channel, payload) => {
        if (channel === 'terminal-spawn') {
          return { success: true, pid: 42, sessionId: payload.sessionId || 'default' };
        }
        if (channel === 'terminal-exec') {
          return { success: true, output: 'ok\n' };
        }
        return { success: true };
      }),
      on: jest.fn((channel, handler) => {
        listeners[channel] = handler;
        return jest.fn();
      })
    };

    require(modulePath);
    jest.runOnlyPendingTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete window.appSettings;
    delete window.electronAPI;
    delete window.assistantTerminal;
  });

  test('launches Codex through the assistant terminal session', async () => {
    document.getElementById('assistant-launch-codex').click();
    await flushAsync();

    expect(window.electronAPI.invoke).toHaveBeenCalledWith('terminal-kill', { sessionId: 'assistant' });
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('terminal-spawn', expect.objectContaining({
      sessionId: 'assistant',
      cwd: '/tmp/nightowl-workspace',
      command: 'codex',
      cols: 120,
      rows: 30
    }));
    expect(document.getElementById('assistant-terminal-output').textContent).toContain('Launching Codex');
  });

  test('runs a one-shot shell command when no assistant process is active', async () => {
    const input = document.getElementById('assistant-terminal-input');
    input.value = 'pwd';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flushAsync();

    expect(window.electronAPI.invoke).toHaveBeenCalledWith('terminal-exec', {
      command: 'pwd',
      cwd: '/tmp/nightowl-workspace'
    });
    expect(document.getElementById('assistant-terminal-output').textContent).toContain('ok');
  });

  test('filters terminal output by session', async () => {
    document.getElementById('assistant-launch-shell').click();
    await flushAsync();

    listeners['terminal-output']({ sessionId: 'default', data: 'wrong', stream: 'stdout' });
    listeners['terminal-output']({ sessionId: 'assistant', data: 'right', stream: 'stdout' });

    const output = document.getElementById('assistant-terminal-output').textContent;
    expect(output).toContain('right');
    expect(output).not.toContain('wrong');
  });

  test('ignores stale exit events from replaced PTYs', async () => {
    document.getElementById('assistant-launch-shell').click();
    await flushAsync();

    listeners['terminal-output']({
      sessionId: 'assistant',
      pid: 1,
      data: '\n[Process exited with code 0]\n',
      stream: 'exit'
    });

    await window.assistantTerminal.runCommand('echo still-active');

    expect(document.getElementById('assistant-terminal-output').textContent).not.toContain('Process exited');
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('terminal-write', {
      sessionId: 'assistant',
      data: 'echo still-active\n'
    });
  });

  test('loads xterm UMD globals without Monaco AMD capture', async () => {
    const previousDefine = window.define;
    const appendChild = document.head.appendChild.bind(document.head);
    const appendSpy = jest.spyOn(document.head, 'appendChild');
    const observedAmdValues = [];
    const monacoAmd = { loader: 'monaco' };
    const TerminalMock = jest.fn(function TerminalMock() {
      this.cols = 100;
      this.rows = 28;
      this.clear = jest.fn();
      this.dispose = jest.fn();
      this.focus = jest.fn();
      this.loadAddon = jest.fn();
      this.onData = jest.fn();
      this.onResize = jest.fn();
      this.open = jest.fn();
      this.write = jest.fn();
    });
    const FitAddonMock = jest.fn(function FitAddonMock() {
      this.fit = jest.fn();
    });

    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Electron'
    });
    window.define = function define() {};
    window.define.amd = monacoAmd;

    appendSpy.mockImplementation((node) => {
      const result = appendChild(node);
      if (node.tagName === 'SCRIPT') {
        observedAmdValues.push(window.define?.amd);
        const src = node.getAttribute('src') || '';
        if (src.includes('xterm.js')) {
          window.Terminal = TerminalMock;
        }
        if (src.includes('addon-fit.js')) {
          window.FitAddon = { FitAddon: FitAddonMock };
        }
        node.dispatchEvent(new Event('load'));
      }
      return result;
    });

    try {
      await window.assistantTerminal.launchShell();
      jest.runOnlyPendingTimers();
      await flushAsync();

      expect(observedAmdValues).toEqual([undefined, undefined]);
      expect(window.define.amd).toBe(monacoAmd);
      expect(TerminalMock).toHaveBeenCalled();
      expect(FitAddonMock).toHaveBeenCalled();
      expect(document.getElementById('chat-pane').classList.contains('terminal-emulator-ready')).toBe(true);
      expect(window.electronAPI.invoke).toHaveBeenCalledWith('terminal-spawn', expect.objectContaining({
        sessionId: 'assistant',
        cols: 100,
        rows: 28
      }));
    } finally {
      appendSpy.mockRestore();
      delete window.Terminal;
      delete window.FitAddon;
      if (previousDefine) {
        window.define = previousDefine;
      } else {
        delete window.define;
      }
      delete window.navigator.userAgent;
    }
  });
});

const path = require('path');

const modulePath = path.resolve(__dirname, '../../../orchestrator/modules/assistant-terminal.js');
const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);

describe('Assistant terminal', () => {
  let listeners;

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
    await Promise.resolve();
    await Promise.resolve();

    expect(window.electronAPI.invoke).toHaveBeenCalledWith('terminal-kill', { sessionId: 'assistant' });
    expect(window.electronAPI.invoke).toHaveBeenCalledWith('terminal-spawn', {
      sessionId: 'assistant',
      cwd: '/tmp/nightowl-workspace',
      command: 'codex'
    });
    expect(document.getElementById('assistant-terminal-output').textContent).toContain('Launching Codex');
  });

  test('runs a one-shot shell command when no assistant process is active', async () => {
    const input = document.getElementById('assistant-terminal-input');
    input.value = 'pwd';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await Promise.resolve();
    await Promise.resolve();

    expect(window.electronAPI.invoke).toHaveBeenCalledWith('terminal-exec', {
      command: 'pwd',
      cwd: '/tmp/nightowl-workspace'
    });
    expect(document.getElementById('assistant-terminal-output').textContent).toContain('ok');
  });

  test('filters terminal output by session', async () => {
    document.getElementById('assistant-launch-shell').click();
    await Promise.resolve();
    await Promise.resolve();

    listeners['terminal-output']({ sessionId: 'default', data: 'wrong', stream: 'stdout' });
    listeners['terminal-output']({ sessionId: 'assistant', data: 'right', stream: 'stdout' });

    const output = document.getElementById('assistant-terminal-output').textContent;
    expect(output).toContain('right');
    expect(output).not.toContain('wrong');
  });
});

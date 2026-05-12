/**
 * Assistant Terminal
 *
 * Replaces the old bespoke AI chat pane with a workspace terminal focused on
 * launching CLI assistants such as codex, claude, and gemini.
 */
(function () {
  'use strict';

  const SESSION_ID = 'assistant';
  const ASSISTANTS = {
    codex: { command: 'codex', label: 'Codex' },
    claude: { command: 'claude', label: 'Claude' },
    gemini: { command: 'gemini', label: 'Gemini' }
  };

  let outputEl = null;
  let inputEl = null;
  let cleanupListener = null;
  let activeProcess = false;
  const commandHistory = [];
  let historyIndex = -1;

  function getWorkspaceCwd() {
    return window.appSettings?.workingDirectory || undefined;
  }

  function appendOutput(text, type = 'stdout') {
    if (!outputEl || typeof text !== 'string') return;

    const span = document.createElement('span');
    span.textContent = text;
    span.className = `assistant-terminal-line assistant-terminal-${type}`;
    outputEl.appendChild(span);
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  function clearOutput() {
    if (outputEl) outputEl.textContent = '';
  }

  function focusInput() {
    if (inputEl) inputEl.focus();
  }

  function disposeTerminalListener() {
    if (cleanupListener) {
      cleanupListener();
      cleanupListener = null;
    }
  }

  function ensureTerminalListener() {
    if (!window.electronAPI?.on || cleanupListener) return;

    cleanupListener = window.electronAPI.on('terminal-output', (message = {}) => {
      if (message.sessionId && message.sessionId !== SESSION_ID) return;
      if (!message.sessionId && activeProcess === false) return;

      if (message.data) {
        appendOutput(message.data, message.stream || 'stdout');
      }
      if (message.stream === 'exit' || message.stream === 'error') {
        activeProcess = false;
      }
    });
  }

  async function killProcess({ quiet = false } = {}) {
    if (!window.electronAPI?.invoke) return { success: false, error: 'Terminal IPC unavailable' };

    const result = await window.electronAPI.invoke('terminal-kill', { sessionId: SESSION_ID });
    activeProcess = false;
    if (!quiet) appendOutput('\n[assistant terminal process stopped]\n', 'info');
    return result;
  }

  async function spawnTerminal(options = {}) {
    if (!window.electronAPI?.invoke) {
      appendOutput('[terminal unavailable]\n', 'error');
      return { success: false, error: 'Terminal IPC unavailable' };
    }

    ensureTerminalListener();

    const result = await window.electronAPI.invoke('terminal-spawn', {
      sessionId: SESSION_ID,
      cwd: getWorkspaceCwd(),
      ...options
    });

    if (result?.success) {
      activeProcess = true;
      const label = options.command
        ? [options.command, ...(options.args || [])].join(' ')
        : 'shell';
      appendOutput(`$ ${label}\n`, 'command');
      appendOutput(`[started pid ${result.pid}]\n`, 'info');
    } else {
      activeProcess = false;
      appendOutput(`[failed to start: ${result?.error || 'unknown error'}]\n`, 'error');
    }

    focusInput();
    return result;
  }

  async function launchAssistant(name) {
    const assistant = ASSISTANTS[name];
    if (!assistant) return;

    await killProcess({ quiet: true });
    appendOutput(`\n# Launching ${assistant.label} in ${getWorkspaceCwd() || 'workspace'}\n`, 'info');
    await spawnTerminal({ command: assistant.command });
  }

  async function launchShell() {
    await killProcess({ quiet: true });
    appendOutput(`\n# Starting workspace shell in ${getWorkspaceCwd() || 'workspace'}\n`, 'info');
    await spawnTerminal();
  }

  async function runOneShot(command) {
    if (!window.electronAPI?.invoke) {
      appendOutput('[terminal unavailable]\n', 'error');
      return;
    }

    appendOutput(`$ ${command}\n`, 'command');
    const result = await window.electronAPI.invoke('terminal-exec', {
      command,
      cwd: getWorkspaceCwd()
    });

    if (result?.output) appendOutput(result.output, 'stdout');
    if (result?.error) appendOutput(result.error, 'stderr');
    if (!result?.output && !result?.error) appendOutput('\n', 'stdout');
  }

  async function handleCommand(command) {
    const trimmed = command.trim();
    if (!trimmed) return;

    commandHistory.push(trimmed);
    historyIndex = commandHistory.length;

    if (trimmed === 'clear') {
      clearOutput();
      return;
    }
    if (trimmed === 'shell') {
      await launchShell();
      return;
    }
    if (trimmed === 'kill' || trimmed === 'exit') {
      await killProcess();
      return;
    }
    if (ASSISTANTS[trimmed]) {
      await launchAssistant(trimmed);
      return;
    }

    if (activeProcess) {
      appendOutput(`${trimmed}\n`, 'stdin');
      await window.electronAPI.invoke('terminal-write', {
        sessionId: SESSION_ID,
        data: `${command}\n`
      });
      return;
    }

    await runOneShot(command);
  }

  function handleHistory(delta) {
    if (!inputEl || commandHistory.length === 0) return;

    historyIndex = Math.max(0, Math.min(commandHistory.length, historyIndex + delta));
    inputEl.value = historyIndex === commandHistory.length ? '' : commandHistory[historyIndex];
  }

  function wireInput() {
    if (!inputEl) return;

    inputEl.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const command = inputEl.value;
        inputEl.value = '';
        await handleCommand(command);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        handleHistory(-1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        handleHistory(1);
      } else if (event.key === 'c' && event.ctrlKey && activeProcess) {
        event.preventDefault();
        await window.electronAPI.invoke('terminal-write', {
          sessionId: SESSION_ID,
          data: '\x03'
        });
      }
    });
  }

  function updateContext() {
    const contextEl = document.getElementById('assistant-terminal-context');
    if (!contextEl) return;

    const cwd = getWorkspaceCwd();
    const currentFile = window.currentFilePath || window.editorFileName;
    const fileName = currentFile ? String(currentFile).split(/[\\/]/).pop() : null;
    contextEl.textContent = fileName
      ? `Assistant terminal • ${fileName}`
      : `Assistant terminal • ${cwd || 'Workspace shell'}`;
  }

  function observePaneVisibility(pane) {
    const Observer = window.MutationObserver;
    if (!pane || typeof Observer !== 'function') return;

    try {
      new Observer(() => {
        if (pane.style.display !== 'none') {
          updateContext();
          focusInput();
        }
      }).observe(pane, { attributes: true, attributeFilter: ['style', 'class'] });
    } catch (error) {
      // Some test/embedded hosts expose a partial DOM without observable nodes.
    }
  }

  function init() {
    outputEl = document.getElementById('assistant-terminal-output');
    inputEl = document.getElementById('assistant-terminal-input');
    if (!outputEl || !inputEl) return;

    document.getElementById('assistant-launch-codex')?.addEventListener('click', () => launchAssistant('codex'));
    document.getElementById('assistant-launch-claude')?.addEventListener('click', () => launchAssistant('claude'));
    document.getElementById('assistant-launch-gemini')?.addEventListener('click', () => launchAssistant('gemini'));
    document.getElementById('assistant-launch-shell')?.addEventListener('click', launchShell);
    document.getElementById('assistant-terminal-clear')?.addEventListener('click', clearOutput);
    document.getElementById('assistant-terminal-kill')?.addEventListener('click', () => killProcess());

    wireInput();
    updateContext();
    appendOutput('Assistant terminal ready. Launch codex, claude, gemini, or type a shell command.\n', 'info');

    const pane = document.getElementById('chat-pane');
    observePaneVisibility(pane);
  }

  window.assistantTerminal = {
    launchAssistant,
    launchShell,
    killProcess,
    clearOutput,
    runCommand: handleCommand,
    isActive: () => activeProcess
  };

  window.addEventListener('beforeunload', disposeTerminalListener);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }
})();

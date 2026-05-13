/**
 * Assistant Terminal
 *
 * Replaces the old bespoke AI chat pane with a workspace terminal focused on
 * launching CLI assistants such as codex, claude, and gemini.
 */
(function () {
  'use strict';

  const SESSION_ID = 'assistant';
  const XTERM_CSS = 'node_modules/@xterm/xterm/css/xterm.css';
  const XTERM_SCRIPT = 'node_modules/@xterm/xterm/lib/xterm.js';
  const FIT_SCRIPT = 'node_modules/@xterm/addon-fit/lib/addon-fit.js';
  const ASSISTANTS = {
    codex: { command: 'codex', label: 'Codex' },
    claude: { command: 'claude', label: 'Claude' },
    gemini: { command: 'gemini', label: 'Gemini' }
  };

  let outputEl = null;
  let inputEl = null;
  let paneEl = null;
  let terminal = null;
  let fitAddon = null;
  let resizeObserver = null;
  let cleanupListener = null;
  let emulatorLoadPromise = null;
  let activeProcess = false;
  let activePid = null;
  let autoShellStarted = false;
  let terminalOutputQueue = [];
  let terminalOutputFlushHandle = null;
  let terminalPreloadScheduled = false;
  const commandHistory = [];
  let historyIndex = -1;

  function getWorkspaceCwd() {
    return window.appSettings?.workingDirectory || undefined;
  }

  function isJsdomHost() {
    return /jsdom/i.test(window.navigator?.userAgent || '');
  }

  function readCssVar(name, fallback) {
    const value = window.getComputedStyle?.(document.body)?.getPropertyValue(name)?.trim();
    return value || fallback;
  }

  function isDarkTheme() {
    if (document.body?.classList?.contains('dark-mode')) return true;
    if (document.body?.classList?.contains('light-mode')) return false;
    const background = readCssVar('--bg-primary', '#ffffff').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(background)) return false;
    const red = parseInt(background.slice(0, 2), 16);
    const green = parseInt(background.slice(2, 4), 16);
    const blue = parseInt(background.slice(4, 6), 16);
    return (red * 299 + green * 587 + blue * 114) / 1000 < 128;
  }

  function getTerminalTheme() {
    const dark = isDarkTheme();
    return {
      background: readCssVar('--terminal-background', dark ? '#101216' : '#fdf6e3'),
      foreground: readCssVar('--terminal-foreground', readCssVar('--text-color', dark ? '#d6deeb' : '#586e75')),
      cursor: readCssVar('--primary', '#268bd2'),
      cursorAccent: dark ? '#101216' : '#fdf6e3',
      selectionBackground: dark ? 'rgba(87, 166, 255, 0.35)' : 'rgba(38, 139, 210, 0.24)',
      black: dark ? '#1f2430' : '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: dark ? '#d6deeb' : '#eee8d5',
      brightBlack: '#657b83',
      brightRed: '#cb4b16',
      brightGreen: '#586e75',
      brightYellow: '#657b83',
      brightBlue: '#839496',
      brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',
      brightWhite: dark ? '#ffffff' : '#fdf6e3'
    };
  }

  function appendFallbackOutput(text, type = 'stdout') {
    if (!outputEl || typeof text !== 'string') return;

    const span = document.createElement('span');
    span.textContent = text;
    span.className = `assistant-terminal-line assistant-terminal-${type}`;
    outputEl.appendChild(span);
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  function writeOutput(text, type = 'stdout') {
    if (typeof text !== 'string') return;
    if (terminal) {
      terminal.write(text);
      return;
    }
    appendFallbackOutput(text, type);
  }

  function writeStatus(text, type = 'info') {
    const terminalText = terminal ? text.replace(/\n/g, '\r\n') : text;
    writeOutput(terminalText, type);
  }

  function flushQueuedTerminalOutput() {
    terminalOutputFlushHandle = null;
    if (!terminalOutputQueue.length) return;

    const queued = terminalOutputQueue;
    terminalOutputQueue = [];

    if (terminal) {
      terminal.write(queued.map((entry) => entry.text).join(''));
      return;
    }

    for (const entry of queued) {
      appendFallbackOutput(entry.text, entry.type);
    }
  }

  function queueTerminalOutput(text, type = 'stdout') {
    if (typeof text !== 'string' || text.length === 0) return;
    if (!terminal) {
      appendFallbackOutput(text, type);
      return;
    }
    terminalOutputQueue.push({ text, type });

    if (terminalOutputFlushHandle) return;
    const schedule = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame.bind(window)
      : (callback) => setTimeout(callback, 16);
    terminalOutputFlushHandle = schedule(flushQueuedTerminalOutput);
  }

  function clearOutput() {
    terminalOutputQueue = [];
    if (terminal) {
      terminal.clear();
      return;
    }
    if (outputEl) outputEl.textContent = '';
  }

  function focusInput() {
    if (terminal) {
      terminal.focus();
      return;
    }
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
      if (message.pid && activePid && message.pid !== activePid) return;

      if (message.data) {
        queueTerminalOutput(message.data, message.stream || 'stdout');
      }
      if (message.stream === 'exit' || message.stream === 'error') {
        flushQueuedTerminalOutput();
        activeProcess = false;
        activePid = null;
      }
    });
  }

  function loadStylesheetOnce(href) {
    if (!document.head || document.querySelector(`link[data-nightowl-terminal="${href}"]`)) {
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.nightowlTerminal = href;
    document.head.appendChild(link);
  }

  function disableAmdForUmdScript() {
    const defineFn = window.define;
    if (typeof defineFn !== 'function' || !defineFn.amd) {
      return () => {};
    }

    try {
      window.define = undefined;
      return () => {
        window.define = defineFn;
      };
    } catch (error) {
      // Fall back to masking only the AMD marker below.
    }

    const previousAmd = defineFn.amd;
    try {
      defineFn.amd = undefined;
    } catch (error) {
      return () => {};
    }

    return () => {
      try {
        defineFn.amd = previousAmd;
      } catch (error) {
        // Monaco may have already replaced its loader; in that case there is
        // nothing useful to restore.
      }
    };
  }

  function getTerminalConstructor() {
    if (typeof window.Terminal === 'function') return window.Terminal;
    if (typeof window.Terminal?.Terminal === 'function') return window.Terminal.Terminal;
    return null;
  }

  function getFitAddonConstructor() {
    if (typeof window.FitAddon === 'function') return window.FitAddon;
    if (typeof window.FitAddon?.FitAddon === 'function') return window.FitAddon.FitAddon;
    return null;
  }

  function loadScriptOnce(src, isReady) {
    if (isReady()) return Promise.resolve();

    const existing = document.querySelector(`script[data-nightowl-terminal="${src}"]`);
    if (existing) {
      if (existing.dataset.nightowlTerminalLoaded === 'true' && !isReady()) {
        existing.remove();
      } else {
        return new Promise((resolve, reject) => {
          existing.addEventListener('load', () => {
            if (isReady()) {
              resolve();
            } else {
              reject(new Error(`${src} loaded without exposing the expected terminal API`));
            }
          }, { once: true });
          existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
        });
      }
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.nightowlTerminal = src;
      const restoreAmd = disableAmdForUmdScript();
      script.addEventListener('load', () => {
        restoreAmd();
        script.dataset.nightowlTerminalLoaded = 'true';
        if (isReady()) {
          resolve();
        } else {
          reject(new Error(`${src} loaded without exposing the expected terminal API`));
        }
      }, { once: true });
      script.addEventListener('error', () => {
        restoreAmd();
        reject(new Error(`Failed to load ${src}`));
      }, { once: true });
      document.head.appendChild(script);
    });
  }

  function fitTerminal() {
    if (!terminal || !outputEl) return;
    try {
      fitAddon?.fit();
      resizeActiveTerminal();
    } catch (error) {
      // Fit can fail while the pane is hidden; the next visibility/resize pass retries.
    }
  }

  function getTerminalDimensions() {
    return {
      cols: terminal?.cols || 120,
      rows: terminal?.rows || 30
    };
  }

  async function resizeActiveTerminal() {
    if (!activeProcess || !window.electronAPI?.invoke || !terminal) return;
    const { cols, rows } = getTerminalDimensions();
    await window.electronAPI.invoke('terminal-resize', {
      sessionId: SESSION_ID,
      cols,
      rows
    });
  }

  function observeTerminalSize() {
    if (!outputEl) return;

    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => fitTerminal());
      resizeObserver.observe(outputEl);
    } else {
      window.addEventListener('resize', fitTerminal);
    }
  }

  async function prepareTerminalEmulator() {
    if (terminal) return true;
    if (isJsdomHost() || !document.head || !outputEl) return false;
    if (emulatorLoadPromise) return emulatorLoadPromise;

    emulatorLoadPromise = (async () => {
      try {
        loadStylesheetOnce(XTERM_CSS);
        await loadScriptOnce(XTERM_SCRIPT, () => typeof getTerminalConstructor() === 'function');
        await loadScriptOnce(FIT_SCRIPT, () => typeof getFitAddonConstructor() === 'function');

        const TerminalCtor = getTerminalConstructor();
        const FitAddonCtor = getFitAddonConstructor();
        if (typeof TerminalCtor !== 'function') {
          throw new Error('xterm did not expose a Terminal constructor');
        }
        terminal = new TerminalCtor({
          allowTransparency: false,
          convertEol: false,
          cursorBlink: true,
          cursorStyle: 'block',
          drawBoldTextInBrightColors: true,
          fontFamily: '"SF Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
          fontSize: 13,
          letterSpacing: 0,
          lineHeight: 1.22,
          macOptionIsMeta: true,
          scrollback: 10000,
          tabStopWidth: 4,
          theme: getTerminalTheme()
        });

        fitAddon = FitAddonCtor ? new FitAddonCtor() : null;
        if (fitAddon) terminal.loadAddon(fitAddon);

        outputEl.textContent = '';
        outputEl.classList.add('xterm-host');
        paneEl?.classList?.add('terminal-emulator-ready');
        terminal.open(outputEl);
        terminal.onData(async (data) => {
          if (!activeProcess || !window.electronAPI?.invoke) return;
          await window.electronAPI.invoke('terminal-write', {
            sessionId: SESSION_ID,
            data
          });
        });
        terminal.onResize(() => resizeActiveTerminal());
        observeTerminalSize();
        setTimeout(fitTerminal, 0);
        return true;
      } catch (error) {
        terminal = null;
        fitAddon = null;
        appendFallbackOutput(`[terminal emulator unavailable: ${error.message}]\n`, 'error');
        return false;
      }
    })();

    return emulatorLoadPromise;
  }

  function scheduleTerminalPreload() {
    if (terminalPreloadScheduled || isJsdomHost()) return;
    terminalPreloadScheduled = true;

    const preload = () => {
      if (!outputEl || terminal || emulatorLoadPromise) return;
      prepareTerminalEmulator();
    };

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(preload, { timeout: 2000 });
    } else {
      setTimeout(preload, 1200);
    }
  }

  async function killProcess({ quiet = false } = {}) {
    if (!window.electronAPI?.invoke) return { success: false, error: 'Terminal IPC unavailable' };

    const result = await window.electronAPI.invoke('terminal-kill', { sessionId: SESSION_ID });
    activeProcess = false;
    activePid = null;
    if (!quiet) writeStatus('\n[assistant terminal process stopped]\n', 'info');
    return result;
  }

  async function spawnTerminal(options = {}) {
    if (!window.electronAPI?.invoke) {
      writeStatus('[terminal unavailable]\n', 'error');
      return { success: false, error: 'Terminal IPC unavailable' };
    }

    ensureTerminalListener();
    await prepareTerminalEmulator();
    fitTerminal();

    const { cols, rows } = getTerminalDimensions();
    const result = await window.electronAPI.invoke('terminal-spawn', {
      sessionId: SESSION_ID,
      cwd: getWorkspaceCwd(),
      cols,
      rows,
      ...options
    });

    if (result?.success) {
      activeProcess = true;
      activePid = result.pid || null;
      if (!terminal) {
        const label = options.command
          ? [options.command, ...(options.args || [])].join(' ')
          : 'shell';
        appendFallbackOutput(`$ ${label}\n`, 'command');
        appendFallbackOutput(`[started pid ${result.pid}]\n`, 'info');
      }
    } else {
      activeProcess = false;
      writeStatus(`[failed to start: ${result?.error || 'unknown error'}]\n`, 'error');
    }

    focusInput();
    return result;
  }

  async function launchAssistant(name) {
    const assistant = ASSISTANTS[name];
    if (!assistant) return;

    await killProcess({ quiet: true });
    clearOutput();
    autoShellStarted = true;
    writeStatus(`Launching ${assistant.label} in ${getWorkspaceCwd() || 'workspace'}\n`, 'info');
    await spawnTerminal({ command: assistant.command });
  }

  async function launchShell({ quiet = false } = {}) {
    await killProcess({ quiet: true });
    if (!quiet) {
      clearOutput();
      writeStatus(`Starting login shell in ${getWorkspaceCwd() || 'workspace'}\n`, 'info');
    }
    await spawnTerminal();
  }

  async function ensureShellForVisibleTerminal() {
    if (autoShellStarted || activeProcess) return;
    const ready = await prepareTerminalEmulator();
    if (!ready) return;
    autoShellStarted = true;
    await launchShell({ quiet: true });
  }

  async function runOneShot(command) {
    if (!window.electronAPI?.invoke) {
      writeStatus('[terminal unavailable]\n', 'error');
      return;
    }

    writeStatus(`$ ${command}\n`, 'command');
    const result = await window.electronAPI.invoke('terminal-exec', {
      command,
      cwd: getWorkspaceCwd()
    });

    if (result?.output) writeOutput(result.output, 'stdout');
    if (result?.error) writeOutput(result.error, 'stderr');
    if (!result?.output && !result?.error) writeOutput('\n', 'stdout');
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
      autoShellStarted = true;
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
      appendFallbackOutput(`${trimmed}\n`, 'stdin');
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
      ? `Assistant terminal - ${fileName}`
      : `Assistant terminal - ${cwd || 'Workspace shell'}`;
  }

  async function activatePane() {
    updateContext();
    await prepareTerminalEmulator();
    fitTerminal();
    focusInput();
    await ensureShellForVisibleTerminal();
  }

  function observePaneVisibility(pane) {
    const Observer = window.MutationObserver;
    if (!pane || typeof Observer !== 'function') return;

    try {
      new Observer(() => {
        if (pane.style.display !== 'none') {
          activatePane();
        }
      }).observe(pane, { attributes: true, attributeFilter: ['style', 'class'] });
    } catch (error) {
      // Some test/embedded hosts expose a partial DOM without observable nodes.
    }
  }

  function init() {
    outputEl = document.getElementById('assistant-terminal-output');
    inputEl = document.getElementById('assistant-terminal-input');
    paneEl = document.getElementById('chat-pane');
    if (!outputEl || !inputEl) return;

    document.getElementById('assistant-launch-codex')?.addEventListener('click', () => launchAssistant('codex'));
    document.getElementById('assistant-launch-claude')?.addEventListener('click', () => launchAssistant('claude'));
    document.getElementById('assistant-launch-gemini')?.addEventListener('click', () => launchAssistant('gemini'));
    document.getElementById('assistant-launch-shell')?.addEventListener('click', () => {
      autoShellStarted = true;
      launchShell();
    });
    document.getElementById('assistant-terminal-clear')?.addEventListener('click', clearOutput);
    document.getElementById('assistant-terminal-kill')?.addEventListener('click', () => killProcess());

    wireInput();
    updateContext();
    appendFallbackOutput('Assistant terminal ready. Launch codex, claude, gemini, or type a shell command.\n', 'info');
    scheduleTerminalPreload();

    observePaneVisibility(paneEl);
    if (paneEl && paneEl.style.display !== 'none') {
      activatePane();
    }
  }

  window.assistantTerminal = {
    launchAssistant,
    launchShell,
    killProcess,
    clearOutput,
    runCommand: handleCommand,
    isActive: () => activeProcess
  };

  window.addEventListener('beforeunload', () => {
    disposeTerminalListener();
    resizeObserver?.disconnect?.();
    terminal?.dispose?.();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }
})();

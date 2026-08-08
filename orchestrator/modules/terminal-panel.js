/**
 * Terminal Panel Module
 * Integrated terminal at the bottom of the editor area.
 *
 * @module terminal-panel
 */

(function () {
  'use strict';

  let terminalOpen = false;
  let terminalSpawned = false;
  let outputEl = null;
  let inputEl = null;
  let panelEl = null;
  let cleanupListener = null;

  function getOrCreatePanel() {
    if (panelEl) return panelEl;

    panelEl = document.createElement('div');
    panelEl.id = 'integrated-terminal';
    panelEl.style.cssText = 'display: none; flex-direction: column; border-top: 2px solid var(--neutral-300, #ccc); background: #1e1e1e; color: #d4d4d4; font-family: "SF Mono", "Fira Code", "Consolas", monospace; font-size: 12px; min-height: 120px; height: 200px; flex-shrink: 0; position: relative;';

    panelEl.innerHTML = `
      <div id="terminal-panel-header" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 8px; background: #252526; flex-shrink: 0; user-select: none;">
        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7;">Terminal</span>
        <div style="display: flex; gap: 4px; align-items: center;">
          <button id="terminal-clear-btn" style="background:none;border:none;color:#d4d4d4;cursor:pointer;font-size:12px;padding:2px 6px;opacity:0.7;" title="Clear">Clear</button>
          <button id="terminal-kill-btn" style="background:none;border:none;color:#d4d4d4;cursor:pointer;font-size:12px;padding:2px 6px;opacity:0.7;" title="Kill Process">Kill</button>
          <button id="terminal-close-btn" style="background:none;border:none;color:#d4d4d4;cursor:pointer;font-size:18px;padding:0 4px;opacity:0.7;" title="Close Terminal">✕</button>
        </div>
      </div>
      <div id="terminal-output" style="flex: 1; overflow-y: auto; padding: 4px 8px; white-space: pre-wrap; word-break: break-all; line-height: 1.4;"></div>
      <div id="terminal-input-row" style="display: flex; align-items: center; padding: 2px 8px; border-top: 1px solid #333; flex-shrink: 0;">
        <span style="color: #569cd6; margin-right: 4px;">$</span>
        <input type="text" id="terminal-input" style="flex: 1; background: transparent; border: none; color: #d4d4d4; font-family: inherit; font-size: 12px; outline: none; padding: 4px 0;" placeholder="Type a command..." autocomplete="off" spellcheck="false">
      </div>
    `;

    // Insert before status bar or at end of editor-content
    const editorContent = document.getElementById('editor-content');
    const statusBar = document.getElementById('editor-status-bar');
    if (statusBar && editorContent) {
      editorContent.insertBefore(panelEl, statusBar);
    } else if (editorContent) {
      editorContent.appendChild(panelEl);
    }

    outputEl = document.getElementById('terminal-output');
    inputEl = document.getElementById('terminal-input');

    // Wire up events
    document.getElementById('terminal-close-btn').addEventListener('click', hide);
    document.getElementById('terminal-clear-btn').addEventListener('click', clearOutput);
    document.getElementById('terminal-kill-btn').addEventListener('click', killProcess);

    inputEl.addEventListener('keydown', handleInput);

    // Resizer for terminal height
    initTerminalResizer(panelEl);

    return panelEl;
  }

  const commandHistory = [];
  let historyIndex = -1;

  function handleInput(e) {
    if (e.key === 'Enter') {
      const cmd = inputEl.value;
      inputEl.value = '';

      if (cmd.trim()) {
        commandHistory.push(cmd);
        historyIndex = commandHistory.length;
      }

      if (terminalSpawned) {
        // Interactive mode: send to running shell
        window.electronAPI.terminal.write({ data: cmd + '\n' });
      } else {
        // One-shot mode: run command and show output
        appendOutput(`$ ${cmd}\n`, 'command');
        runCommand(cmd);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        inputEl.value = commandHistory[historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        historyIndex++;
        inputEl.value = commandHistory[historyIndex];
      } else {
        historyIndex = commandHistory.length;
        inputEl.value = '';
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      if (terminalSpawned) {
        window.electronAPI.terminal.write({ data: '\x03' });
      }
    }
  }

  async function runCommand(cmd) {
    if (!window.electronAPI) return;

    const cwd = window.appSettings?.workingDirectory || undefined;
    const result = await window.electronAPI.terminal.exec({ command: cmd, cwd });

    if (result.output) {
      appendOutput(result.output, 'stdout');
    }
    if (result.error) {
      appendOutput(result.error, 'stderr');
    }
  }

  async function spawnShell() {
    if (!window.electronAPI || terminalSpawned) return;

    const cwd = window.appSettings?.workingDirectory || undefined;
    const result = await window.electronAPI.terminal.spawn({ cwd });

    if (result.success) {
      terminalSpawned = true;
      appendOutput(`[Shell started, PID: ${result.pid}]\n`, 'info');

      // Listen for output
      cleanupListener = window.electronAPI.events.terminalOutput((msg) => {
        if (msg.sessionId && msg.sessionId !== 'default') return;
        if (msg.data) {
          appendOutput(msg.data, msg.stream);
        }
      });
    }
  }

  async function killProcess() {
    if (window.electronAPI) {
      await window.electronAPI.terminal.kill();
    }
    terminalSpawned = false;
    if (cleanupListener) {
      cleanupListener();
      cleanupListener = null;
    }
    appendOutput('\n[Process killed]\n', 'info');
  }

  function appendOutput(text, type) {
    if (!outputEl) return;

    const span = document.createElement('span');
    span.textContent = text;

    if (type === 'stderr' || type === 'error') {
      span.style.color = '#f48771';
    } else if (type === 'info' || type === 'exit') {
      span.style.color = '#569cd6';
    } else if (type === 'command') {
      span.style.color = '#dcdcaa';
    }

    outputEl.appendChild(span);
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  function clearOutput() {
    if (outputEl) outputEl.innerHTML = '';
  }

  function show() {
    const panel = getOrCreatePanel();
    panel.style.display = 'flex';
    terminalOpen = true;
    if (inputEl) inputEl.focus();

    // Re-layout editor
    if (window.editor && window.editor.layout) {
      setTimeout(() => window.editor.layout(), 50);
    }
  }

  function hide() {
    if (panelEl) panelEl.style.display = 'none';
    terminalOpen = false;

    // Re-layout editor
    if (window.editor && window.editor.layout) {
      setTimeout(() => window.editor.layout(), 50);
    }
  }

  function toggle() {
    if (terminalOpen) {
      hide();
    } else {
      show();
    }
  }

  function initTerminalResizer(panel) {
    const header = panel.querySelector('#terminal-panel-header');
    if (!header) return;

    let startY, startHeight;

    function onMouseDown(e) {
      if (e.target.tagName === 'BUTTON') return;
      startY = e.clientY;
      startHeight = panel.getBoundingClientRect().height;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    }

    function onMouseMove(e) {
      const dy = startY - e.clientY;
      const newHeight = Math.max(80, Math.min(startHeight + dy, window.innerHeight * 0.6));
      panel.style.height = newHeight + 'px';
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (window.editor) window.editor.layout();
    }

    header.addEventListener('mousedown', onMouseDown);
    header.style.cursor = 'ns-resize';
  }

  // Register terminal actions. The shared registry owns the shortcut.
  function init() {
    if (typeof window.registerCommand === 'function') {
      window.registerCommand('terminal.toggle', 'Terminal: Toggle Integrated Terminal', toggle);
      window.registerCommand(
        'terminal.spawnShell',
        'Terminal: Spawn Interactive Shell',
        () => {
          show();
          spawnShell();
        }
      );
    }
  }

  window.terminalPanel = {
    show,
    hide,
    toggle,
    spawnShell,
    killProcess,
    isOpen: () => terminalOpen
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }
})();

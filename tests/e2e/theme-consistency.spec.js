const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const adapterCss = fs.readFileSync(
  path.join(__dirname, '../../css/techne-theme-adapter.css'),
  'utf8'
);

const TOKENS = {
  'solarized-light': {
    '--techne-accent': '#268bd2',
    '--techne-accent-hover': '#1a6da0',
    '--techne-accent-active': '#155a85',
    '--techne-bg': '#fdf6e3',
    '--techne-surface': '#eee8d5',
    '--techne-surface-elevated': '#fdf6e3',
    '--techne-text': '#43565d',
    '--techne-text-muted': '#52666d',
    '--techne-text-inverted': '#fdf6e3',
    '--techne-border': 'rgba(101, 123, 131, 0.25)',
    '--techne-border-subtle': 'rgba(101, 123, 131, 0.12)'
  },
  'solarized-dark': {
    '--techne-accent': '#268bd2',
    '--techne-accent-hover': '#2aa0f0',
    '--techne-accent-active': '#1a6da0',
    '--techne-bg': '#002b36',
    '--techne-surface': '#073642',
    '--techne-surface-elevated': '#0a4050',
    '--techne-text': '#b4c5c5',
    '--techne-text-muted': '#9aabad',
    '--techne-text-inverted': '#ffffff',
    '--techne-border': 'rgba(131, 148, 150, 0.25)',
    '--techne-border-subtle': 'rgba(131, 148, 150, 0.12)'
  }
};

async function renderChrome(page, themeId) {
  const tokenCss = Object.entries(TOKENS[themeId])
    .map(([key, value]) => `${key}: ${value};`)
    .join('\n');

  await page.setContent(`
    <!doctype html>
    <html>
      <head>
        <style>
          body { ${tokenCss} }
          .mode-btn.active,
          #editor-mode-btn.active,
          #show-preview-btn.active,
          #show-chat-btn.active {
            background: rgb(25, 135, 84);
            border-color: rgb(25, 135, 84);
            color: white;
          }
          .flow-indicator.flow-struggling,
          .ai-flow-indicator.flow-struggling {
            background: linear-gradient(135deg, #ff8a80, #ffc107);
            border: 1px solid #ffc107;
            color: white;
          }
          .file-tree-item.current-file { background: rgba(25, 135, 84, 0.35); }
          #editor-status-bar { background: #ffffff; color: #111111; }
          body.light-mode .terminal-chat { background-color: #f6f8fa; color: #24292f; }
          body.light-mode .terminal-output { background-color: #ffffff; border-color: #d0d7de; }
          body.light-mode .terminal-input-area { background-color: #f6f8fa; border-color: #d0d7de; }
          #assistant-terminal-output { background: #ffffff; color: #111111; }
          #integrated-terminal {
            background: #1e1e1e;
            border-top: 2px solid #333333;
            color: #d4d4d4;
          }
          #terminal-panel-header { background: #252526; color: #d4d4d4; }
          #terminal-output { background: #1e1e1e; color: #d4d4d4; }
        </style>
        <style>${adapterCss}</style>
      </head>
      <body class="light-mode" data-techne-theme="${themeId}">
        <div id="mode-switcher">
          <button id="editor-mode-btn" class="mode-btn active">Editor</button>
          <span id="pane-label">Panes:</span>
        </div>
        <div id="editor-toolbar">
          <button class="toolbar-btn">B</button>
          <div class="toolbar-separator"></div>
          <span>Format</span>
        </div>
        <div id="right-pane">
          <div id="chat-pane" class="content-pane">
            <div class="terminal-chat">
              <div class="assistant-terminal-pane">
                <div class="assistant-terminal-header">Assistant terminal</div>
                <div id="assistant-terminal-output" class="assistant-terminal-output xterm-host">
                  <div class="xterm"><div class="xterm-viewport"><div class="xterm-screen">ready</div></div></div>
                </div>
                <div class="assistant-terminal-input-area">
                  <input id="assistant-terminal-input" placeholder="Type a command">
                </div>
              </div>
              <div class="terminal-output">legacy terminal output</div>
              <div class="terminal-input-area">
                <input id="terminal-input" class="terminal-input" placeholder="Type a command">
              </div>
            </div>
            <div id="statistics-pane" class="content-pane">
              <div class="statistics-header">
                <h3>Statistics</h3>
                <div class="statistics-scope-toggle">
                  <button class="stats-scope-btn active">Document</button>
                </div>
              </div>
              <div id="statistics-content">
                <p class="statistics-empty-state">No document content to analyze.</p>
                <div class="statistics-card statistics-card-readability">
                  <h4>Readability</h4>
                  <div class="statistics-row"><span>Flesch Ease:</span><strong>72.4</strong></div>
                </div>
              </div>
            </div>
            <div id="integrated-terminal">
              <div id="terminal-panel-header">Terminal</div>
              <div id="terminal-output">shell</div>
              <div id="terminal-input-row"><span class="terminal-dollar">$</span></div>
            </div>
          </div>
          <div class="toggle-buttons">
            <button id="show-preview-btn" class="pane-toggle-button active">Preview</button>
            <button id="show-chat-btn" class="pane-toggle-button active">Terminal</button>
          </div>
        </div>
        <div id="file-tree-view">
          <div class="file-tree-item current-file">MANIFESTO.md</div>
        </div>
        <div id="editor-status-bar">Ln 1, Col 1</div>
        <div id="flow-indicator" class="flow-indicator flow-struggling">Finding Rhythm</div>
        <div class="ai-flow-indicator flow-struggling">Finding Rhythm</div>
      </body>
    </html>
  `);
}

for (const [themeId, expected] of Object.entries({
  'solarized-light': {
    active: 'rgb(21, 90, 133)',
    flow: 'rgb(253, 246, 227)',
    status: 'rgb(238, 232, 213)',
    terminal: 'rgb(253, 246, 227)',
    terminalInput: 'rgb(238, 232, 213)',
    separator: 'rgba(101, 123, 131, 0.25)'
  },
  'solarized-dark': {
    active: 'rgb(26, 109, 160)',
    flow: 'rgb(10, 64, 80)',
    status: 'rgb(7, 54, 66)',
    terminal: 'rgb(0, 43, 54)',
    terminalInput: 'rgb(7, 54, 66)',
    separator: 'rgba(131, 148, 150, 0.25)'
  }
})) {
  test(`managed ${themeId} overrides legacy active, flow, tree, terminal, and status chrome`, async ({ page }) => {
    await renderChrome(page, themeId);

    const styles = await page.evaluate(() => {
      const read = (selector) => {
        const style = getComputedStyle(document.querySelector(selector));
        return {
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          color: style.color
        };
      };
      return {
        editorMode: read('#editor-mode-btn'),
        previewToggle: read('#show-preview-btn'),
        flow: read('#flow-indicator'),
        aiFlow: read('.ai-flow-indicator'),
        fileTree: read('.file-tree-item.current-file'),
        status: read('#editor-status-bar'),
        terminalChat: read('.terminal-chat'),
        terminalOutput: read('#assistant-terminal-output'),
        terminalInput: read('.assistant-terminal-input-area'),
        integratedTerminal: read('#integrated-terminal'),
        integratedTerminalHeader: read('#terminal-panel-header'),
        integratedTerminalOutput: read('#terminal-output'),
        toolbarSeparator: read('.toolbar-separator'),
        toolbarLabel: read('#editor-toolbar span'),
        statisticsPane: read('#statistics-pane'),
        statisticsCard: read('.statistics-card-readability'),
        statisticsActive: read('.stats-scope-btn.active')
      };
    });

    expect(styles.editorMode.backgroundColor).toBe(expected.active);
    expect(styles.previewToggle.backgroundColor).toBe(expected.active);
    expect(styles.flow.backgroundColor).toBe(expected.flow);
    expect(styles.flow.backgroundImage).toBe('none');
    expect(styles.aiFlow.backgroundImage).toBe('none');
    expect(styles.fileTree.backgroundColor).not.toBe('rgba(25, 135, 84, 0.35)');
    expect(styles.status.backgroundColor).toBe(expected.status);
    expect(styles.terminalChat.backgroundColor).toBe(expected.terminal);
    expect(styles.terminalOutput.backgroundColor).toBe(expected.terminal);
    expect(styles.terminalInput.backgroundColor).toBe(expected.terminalInput);
    expect(styles.integratedTerminal.backgroundColor).toBe(expected.terminal);
    expect(styles.integratedTerminalHeader.backgroundColor).toBe(expected.terminalInput);
    expect(styles.integratedTerminalOutput.backgroundColor).toBe(expected.terminal);
    expect(styles.toolbarSeparator.backgroundColor).toBe(expected.separator);
    expect(styles.toolbarLabel.color).not.toBe('rgb(17, 17, 17)');
    expect(styles.statisticsPane.backgroundColor).toBe(expected.terminalInput);
    expect(styles.statisticsCard.backgroundColor).toBe(expected.terminal);
    expect(styles.statisticsActive.backgroundColor).toBe(expected.active);
  });
}

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
    '--techne-text': '#657b83',
    '--techne-text-muted': '#93a1a1',
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
    '--techne-text': '#839496',
    '--techne-text-muted': '#586e75',
    '--techne-text-inverted': '#002b36',
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
        </style>
        <style>${adapterCss}</style>
      </head>
      <body data-techne-theme="${themeId}">
        <div id="mode-switcher">
          <button id="editor-mode-btn" class="mode-btn active">Editor</button>
        </div>
        <div id="right-pane">
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
    status: 'rgb(238, 232, 213)'
  },
  'solarized-dark': {
    active: 'rgb(26, 109, 160)',
    flow: 'rgb(10, 64, 80)',
    status: 'rgb(7, 54, 66)'
  }
})) {
  test(`managed ${themeId} overrides legacy active, flow, tree, and status chrome`, async ({ page }) => {
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
        status: read('#editor-status-bar')
      };
    });

    expect(styles.editorMode.backgroundColor).toBe(expected.active);
    expect(styles.previewToggle.backgroundColor).toBe(expected.active);
    expect(styles.flow.backgroundColor).toBe(expected.flow);
    expect(styles.flow.backgroundImage).toBe('none');
    expect(styles.aiFlow.backgroundImage).toBe('none');
    expect(styles.fileTree.backgroundColor).not.toBe('rgba(25, 135, 84, 0.35)');
    expect(styles.status.backgroundColor).toBe(expected.status);
  });
}

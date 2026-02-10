/**
 * Snippet / Template System
 * User-defined text snippets with tab-stop placeholders, insertable via
 * Monaco completion (triggered by `/` prefix) or command palette.
 *
 * @module snippets
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'nightowl-snippets';

  // Built-in starter snippets
  const DEFAULT_SNIPPETS = [
    {
      prefix: '/heading',
      label: 'Section Heading',
      body: '## ${1:Section Title}\n\n${0}',
      description: 'Insert a markdown section heading'
    },
    {
      prefix: '/link',
      label: 'Markdown Link',
      body: '[${1:text}](${2:url})${0}',
      description: 'Insert a markdown link'
    },
    {
      prefix: '/img',
      label: 'Markdown Image',
      body: '![${1:alt text}](${2:path})${0}',
      description: 'Insert a markdown image'
    },
    {
      prefix: '/table',
      label: 'Markdown Table',
      body: '| ${1:Header 1} | ${2:Header 2} | ${3:Header 3} |\n|---|---|---|\n| ${4:cell} | ${5:cell} | ${6:cell} |\n${0}',
      description: 'Insert a markdown table'
    },
    {
      prefix: '/footnote',
      label: 'Footnote',
      body: '[^${1:label}]: ${2:Footnote text.}\n${0}',
      description: 'Insert a footnote definition'
    },
    {
      prefix: '/code',
      label: 'Code Block',
      body: '```${1:language}\n${2:code}\n```\n${0}',
      description: 'Insert a fenced code block'
    },
    {
      prefix: '/meta',
      label: 'YAML Front Matter',
      body: '---\ntitle: ${1:Title}\nauthor: ${2:Author}\ndate: $DATE\n---\n\n${0}',
      description: 'Insert YAML front matter'
    },
    {
      prefix: '/cite',
      label: 'Citation',
      body: '[@${1:key}]${0}',
      description: 'Insert a citation reference'
    },
    {
      prefix: '/blockquote',
      label: 'Block Quote',
      body: '> ${1:Quote text}\n>\n> — ${2:Author}\n${0}',
      description: 'Insert a block quote with attribution'
    }
  ];

  function loadSnippets() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) { /* ignore */ }
    return null;
  }

  function saveSnippets(snippets) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
    } catch (e) { /* ignore */ }
  }

  function getSnippets() {
    return loadSnippets() || [...DEFAULT_SNIPPETS];
  }

  /**
   * Expand variable placeholders in snippet body.
   */
  function expandVariables(body) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');

    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    let filename = 'untitled';
    try {
      const path = window.currentFilePath || window.appSettings?.currentFile || '';
      if (path) {
        const parts = path.replace(/\\/g, '/').split('/');
        filename = parts[parts.length - 1] || filename;
      }
    } catch (e) { /* ignore */ }

    let selection = '';
    try {
      if (window.editor) {
        const sel = window.editor.getSelection();
        if (sel) selection = window.editor.getModel().getValueInRange(sel) || '';
      }
    } catch (e) { /* ignore */ }

    return body
      .replace(/\$DATE/g, dateStr)
      .replace(/\$TIME/g, timeStr)
      .replace(/\$DATETIME/g, `${dateStr} ${timeStr}`)
      .replace(/\$FILENAME/g, filename)
      .replace(/\$SELECTION/g, selection);
  }

  /**
   * Register Monaco completion provider for snippets.
   */
  function registerCompletionProvider() {
    if (typeof monaco === 'undefined') return;

    monaco.languages.registerCompletionItemProvider('markdown', {
      triggerCharacters: ['/'],
      provideCompletionItems: function (model, position) {
        const line = model.getLineContent(position.lineNumber);
        const textBefore = line.substring(0, position.column - 1);

        // Only trigger when / is at start of word boundary
        const match = textBefore.match(/(^|\s)(\/[a-zA-Z]*)$/);
        if (!match) return { suggestions: [] };

        const prefix = match[2]; // the /word part
        const startCol = position.column - prefix.length;
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: startCol,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        };

        const snippets = getSnippets();
        const suggestions = snippets
          .filter(s => s.prefix.startsWith(prefix))
          .map((s, i) => ({
            label: s.prefix,
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: s.description || '',
            detail: s.label || s.prefix,
            insertText: expandVariables(s.body),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range,
            sortText: String(i).padStart(4, '0')
          }));

        return { suggestions };
      }
    });
  }

  /**
   * Show snippet management dialog.
   */
  function showSnippetManager() {
    // Remove existing dialog
    const existing = document.getElementById('snippet-manager-dialog');
    if (existing) existing.remove();

    const snippets = getSnippets();

    const overlay = document.createElement('div');
    overlay.id = 'snippet-manager-dialog';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--bg-primary,#1e1e1e);color:var(--text-primary,#d4d4d4);border-radius:8px;padding:20px;width:600px;max-height:80vh;overflow-y:auto;font-family:system-ui,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.5);';

    function render() {
      const currentSnippets = getSnippets();
      dialog.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="margin:0;font-size:16px;">Snippets</h3>
          <div style="display:flex;gap:8px;">
            <button id="snippet-add-btn" style="background:#569cd6;color:#fff;border:none;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:13px;">+ New</button>
            <button id="snippet-reset-btn" style="background:transparent;color:#888;border:1px solid #555;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:13px;">Reset</button>
            <button id="snippet-close-btn" style="background:transparent;color:#888;border:none;cursor:pointer;font-size:18px;padding:0 4px;">✕</button>
          </div>
        </div>
        <div style="font-size:12px;color:#888;margin-bottom:12px;">
          Type a prefix (e.g. <code>/heading</code>) in the editor to insert a snippet. Variables: <code>$DATE</code>, <code>$TIME</code>, <code>$FILENAME</code>, <code>$SELECTION</code>. Tab stops: <code>\${1:placeholder}</code>.
        </div>
        <div id="snippet-list">
          ${currentSnippets.map((s, i) => `
            <div class="snippet-item" style="border:1px solid #333;border-radius:4px;padding:10px;margin-bottom:8px;background:#252526;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <div>
                  <code style="color:#dcdcaa;font-size:13px;">${escapeHtml(s.prefix)}</code>
                  <span style="color:#888;font-size:12px;margin-left:8px;">${escapeHtml(s.label || '')}</span>
                </div>
                <div style="display:flex;gap:4px;">
                  <button data-edit="${i}" style="background:none;border:none;color:#569cd6;cursor:pointer;font-size:12px;">Edit</button>
                  <button data-delete="${i}" style="background:none;border:none;color:#f48771;cursor:pointer;font-size:12px;">Delete</button>
                </div>
              </div>
              <div style="font-size:11px;color:#888;margin-bottom:4px;">${escapeHtml(s.description || '')}</div>
              <pre style="background:#1e1e1e;padding:6px;border-radius:3px;font-size:11px;margin:0;white-space:pre-wrap;max-height:60px;overflow:hidden;">${escapeHtml(s.body)}</pre>
            </div>
          `).join('')}
        </div>
      `;

      // Wire events
      dialog.querySelector('#snippet-close-btn').addEventListener('click', () => overlay.remove());
      dialog.querySelector('#snippet-add-btn').addEventListener('click', () => showEditForm(-1));
      dialog.querySelector('#snippet-reset-btn').addEventListener('click', () => {
        saveSnippets(null);
        localStorage.removeItem(STORAGE_KEY);
        render();
      });

      dialog.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => showEditForm(parseInt(btn.dataset.edit)));
      });
      dialog.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.delete);
          const snippets = getSnippets();
          snippets.splice(idx, 1);
          saveSnippets(snippets);
          render();
        });
      });
    }

    function showEditForm(index) {
      const snippets = getSnippets();
      const isNew = index < 0;
      const s = isNew ? { prefix: '/', label: '', body: '', description: '' } : snippets[index];

      dialog.innerHTML = `
        <h3 style="margin:0 0 16px;font-size:16px;">${isNew ? 'New Snippet' : 'Edit Snippet'}</h3>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div>
            <label style="font-size:12px;color:#888;display:block;margin-bottom:2px;">Prefix (trigger)</label>
            <input id="snip-prefix" value="${escapeAttr(s.prefix)}" style="width:100%;background:#1e1e1e;border:1px solid #555;color:#d4d4d4;padding:6px 8px;border-radius:4px;font-size:13px;box-sizing:border-box;" placeholder="/mysnippet">
          </div>
          <div>
            <label style="font-size:12px;color:#888;display:block;margin-bottom:2px;">Label</label>
            <input id="snip-label" value="${escapeAttr(s.label)}" style="width:100%;background:#1e1e1e;border:1px solid #555;color:#d4d4d4;padding:6px 8px;border-radius:4px;font-size:13px;box-sizing:border-box;" placeholder="My Snippet">
          </div>
          <div>
            <label style="font-size:12px;color:#888;display:block;margin-bottom:2px;">Description</label>
            <input id="snip-desc" value="${escapeAttr(s.description || '')}" style="width:100%;background:#1e1e1e;border:1px solid #555;color:#d4d4d4;padding:6px 8px;border-radius:4px;font-size:13px;box-sizing:border-box;" placeholder="What this snippet does">
          </div>
          <div>
            <label style="font-size:12px;color:#888;display:block;margin-bottom:2px;">Body (supports tab stops and variables)</label>
            <textarea id="snip-body" rows="6" style="width:100%;background:#1e1e1e;border:1px solid #555;color:#d4d4d4;padding:6px 8px;border-radius:4px;font-family:'SF Mono','Fira Code','Consolas',monospace;font-size:12px;resize:vertical;box-sizing:border-box;">${escapeHtml(s.body)}</textarea>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button id="snip-cancel" style="background:transparent;color:#888;border:1px solid #555;border-radius:4px;padding:6px 16px;cursor:pointer;font-size:13px;">Cancel</button>
            <button id="snip-save" style="background:#569cd6;color:#fff;border:none;border-radius:4px;padding:6px 16px;cursor:pointer;font-size:13px;">Save</button>
          </div>
        </div>
      `;

      dialog.querySelector('#snip-cancel').addEventListener('click', render);
      dialog.querySelector('#snip-save').addEventListener('click', () => {
        const updated = {
          prefix: dialog.querySelector('#snip-prefix').value.trim(),
          label: dialog.querySelector('#snip-label').value.trim(),
          body: dialog.querySelector('#snip-body').value,
          description: dialog.querySelector('#snip-desc').value.trim()
        };

        if (!updated.prefix.startsWith('/')) updated.prefix = '/' + updated.prefix;

        const allSnippets = getSnippets();
        if (isNew) {
          allSnippets.push(updated);
        } else {
          allSnippets[index] = updated;
        }
        saveSnippets(allSnippets);
        render();
      });
    }

    render();
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Close on Escape
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Insert a snippet by prefix (for command palette usage).
   */
  function insertSnippetByPrefix(prefix) {
    if (!window.editor) return;

    const snippets = getSnippets();
    const snippet = snippets.find(s => s.prefix === prefix);
    if (!snippet) return;

    const body = expandVariables(snippet.body);
    const selection = window.editor.getSelection();

    // Use Monaco's snippet controller for tab stop support
    const contribution = window.editor.getContribution('snippetController2');
    if (contribution) {
      contribution.insert(body);
    } else {
      // Fallback: strip tab stops and insert as plain text
      const plain = body
        .replace(/\$\{(\d+):([^}]*)\}/g, '$2')
        .replace(/\$\d+/g, '')
        .replace(/\$0/g, '');
      window.editor.executeEdits('snippets', [{
        range: selection,
        text: plain
      }]);
    }
  }

  // Initialization
  function init() {
    // Register completion provider once Monaco is available
    if (typeof monaco !== 'undefined') {
      registerCompletionProvider();
    } else {
      // Wait for Monaco
      const interval = setInterval(() => {
        if (typeof monaco !== 'undefined') {
          clearInterval(interval);
          registerCompletionProvider();
        }
      }, 500);
      // Give up after 30s
      setTimeout(() => clearInterval(interval), 30000);
    }

    // Command palette commands
    if (window.commandPaletteCommands) {
      window.commandPaletteCommands.push({
        name: 'Snippets: Manage Snippets',
        action: showSnippetManager
      });

      // Add each default snippet as a command too
      const snippets = getSnippets();
      snippets.forEach(s => {
        window.commandPaletteCommands.push({
          name: `Insert Snippet: ${s.label || s.prefix}`,
          action: () => insertSnippetByPrefix(s.prefix)
        });
      });
    }
  }

  // Public API
  window.snippetSystem = {
    getSnippets,
    saveSnippets,
    showManager: showSnippetManager,
    insertByPrefix: insertSnippetByPrefix,
    expandVariables
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }
})();

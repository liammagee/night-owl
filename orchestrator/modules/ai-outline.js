/**
 * AI Outline Generator
 * Generate document outlines and expand sections using AI.
 *
 * @module ai-outline
 */

(function () {
  'use strict';

  async function generateOutline() {
    if (!window.electronAPI || !window.editor) return;

    const model = window.editor.getModel();
    if (!model) return;

    const text = model.getValue().trim();
    const topic = text.length > 0 ? text.slice(0, 1500) : '';

    showOutlineDialog(topic);
  }

  function showOutlineDialog(existingContent) {
    const existing = document.getElementById('outline-dialog');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'outline-dialog';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:10000;display:flex;align-items:center;justify-content:center;';

    const dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--bg-color,#1e1e1e);color:var(--text-color,#d4d4d4);border-radius:8px;padding:16px;width:500px;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:system-ui,sans-serif;';

    const hasContent = existingContent && existingContent.length > 20;

    dialog.innerHTML = `
      <h3 style="margin:0 0 12px;font-size:14px;">AI Outline Generator</h3>
      <label style="font-size:12px;display:block;margin-bottom:4px;">${hasContent ? 'Topic / additional instructions:' : 'What would you like to write about?'}</label>
      <textarea id="outline-topic" rows="3" style="width:100%;background:var(--bg-secondary,#252526);border:1px solid #555;color:var(--text-color,#d4d4d4);border-radius:4px;padding:8px;font-size:13px;resize:vertical;box-sizing:border-box;" placeholder="${hasContent ? 'Optional: add instructions for the outline...' : 'e.g., An essay on Hegel\'s dialectical method...'}">${hasContent ? '' : ''}</textarea>
      ${hasContent ? '<div style="font-size:11px;color:#888;margin-top:4px;">Existing document content will be used as context.</div>' : ''}
      <div style="margin-top:8px;">
        <label style="font-size:12px;">Outline depth:</label>
        <select id="outline-depth" style="background:var(--bg-secondary,#252526);border:1px solid #555;color:var(--text-color,#d4d4d4);border-radius:4px;padding:4px 8px;font-size:12px;margin-left:8px;">
          <option value="brief">Brief (main sections)</option>
          <option value="detailed" selected>Detailed (sections + subsections)</option>
          <option value="comprehensive">Comprehensive (full structure)</option>
        </select>
      </div>
      <div id="outline-result" style="display:none;margin-top:12px;"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
        <button id="outline-cancel" style="background:transparent;border:1px solid #555;color:#888;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;">Cancel</button>
        <button id="outline-generate" style="background:#569cd6;color:#fff;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;">Generate Outline</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    document.getElementById('outline-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    document.getElementById('outline-generate').addEventListener('click', async () => {
      const topic = document.getElementById('outline-topic').value.trim();
      const depth = document.getElementById('outline-depth').value;
      const btn = document.getElementById('outline-generate');

      if (!topic && !existingContent) {
        if (window.showNotification) window.showNotification('Please enter a topic', 'info');
        return;
      }

      btn.textContent = 'Generating...';
      btn.disabled = true;

      const depthInstruction = {
        brief: 'Create a brief outline with 3-5 main sections (## headings only).',
        detailed: 'Create a detailed outline with main sections (## headings) and subsections (### headings).',
        comprehensive: 'Create a comprehensive outline with sections, subsections, and key points as bullet lists under each.'
      }[depth];

      let prompt = `Generate a markdown outline for a document. ${depthInstruction}
Output ONLY the markdown outline (headings and optional bullet points), no other text.`;

      if (existingContent) {
        prompt += `\n\nExisting content for context:\n${existingContent.slice(0, 1500)}`;
      }
      if (topic) {
        prompt += `\n\nTopic/instructions: ${topic}`;
      }

      try {
        const proposalAPI = window.NightOwlAIEditProposals;
        if (!proposalAPI) throw new Error('Reviewable AI edits are unavailable');
        const model = window.editor?.getModel?.();
        const cursor = window.editor?.getPosition?.();
        if (!model || !cursor) throw new Error('The editor is unavailable');
        const insertRange = {
          startLineNumber: cursor.lineNumber,
          startColumn: cursor.column,
          endLineNumber: cursor.lineNumber,
          endColumn: cursor.column
        };
        const capturedInsert = proposalAPI.captureEditorSource(window.editor, insertRange);
        const capturedDocument = proposalAPI.captureEditorSource(window.editor, model.getFullModelRange());
        const disclosedContext = [
          existingContent ? `Existing content:\n${existingContent.slice(0, 1500)}` : '',
          topic ? `Topic/instructions:\n${topic}` : ''
        ].filter(Boolean).join('\n\n');
        const result = await proposalAPI.request({
          prompt,
          contextLabel: existingContent ? 'Outline source and instructions' : 'Outline instructions',
          contextText: disclosedContext,
          recipe: `markdown-outline-${depth}-v1`,
          requestOptions: { newConversation: true, temperature: 0.25 }
        });

        if (!result) {
          btn.textContent = 'Generate Outline';
          btn.disabled = false;
          return;
        }

        if (result.text) {
          const resultDiv = document.getElementById('outline-result');
          resultDiv.style.display = 'block';
          resultDiv.innerHTML = `
            <div style="font-size:12px;font-weight:bold;margin-bottom:6px;">Generated Outline:</div>
            <pre style="background:var(--bg-secondary,#252526);border-radius:6px;padding:12px;font-size:12px;white-space:pre-wrap;max-height:300px;overflow-y:auto;">${esc(result.text)}</pre>
            <div style="display:flex;gap:6px;margin-top:8px;">
              <button id="outline-insert" style="background:#4ec9b0;color:#fff;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;">Review Insertion</button>
              <button id="outline-replace" style="background:#ce9178;color:#fff;border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font-size:12px;">Review Replacement</button>
            </div>
          `;

          document.getElementById('outline-insert').addEventListener('click', () => {
            overlay.remove();
            proposalAPI.reviewEditorEdit({
              editor: window.editor,
              range: insertRange,
              capturedSource: capturedInsert,
              replacementText: `${result.text}\n`,
              title: 'Review AI outline insertion',
              provenance: result.provenance,
              context: result.context
            });
          });

          document.getElementById('outline-replace').addEventListener('click', () => {
            overlay.remove();
            proposalAPI.reviewEditorEdit({
              editor: window.editor,
              range: capturedDocument.range,
              capturedSource: capturedDocument,
              replacementText: result.text,
              title: 'Review AI outline replacement',
              provenance: result.provenance,
              context: result.context
            });
          });

          btn.textContent = 'Regenerate';
          btn.disabled = false;
        } else {
          btn.textContent = 'Generate Outline';
          btn.disabled = false;
          if (window.showNotification) window.showNotification('AI unavailable. Check settings.', 'error');
        }
      } catch (e) {
        btn.textContent = 'Generate Outline';
        btn.disabled = false;
        if (window.showNotification) window.showNotification('Error: ' + e.message, 'error');
      }
    });

    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
    });
  }

  function esc(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function init() {
    if (typeof window.registerCommand === 'function') {
      window.registerCommand('ai.generate-outline', 'AI: Generate Document Outline', generateOutline);
    }
  }

  window.aiOutline = { generate: generateOutline };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }
})();

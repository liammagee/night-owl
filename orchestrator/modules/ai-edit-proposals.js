/*
 * Reviewable AI edit proposals.
 *
 * AI features may ask this module to disclose document context, run a model
 * request, and present the resulting text as an attributed, non-mutating diff.
 * Only explicitly accepted hunks are applied, together, through Monaco's
 * undoable edit path.
 */
(function initAIEditProposals(root, factory) {
  const api = factory(root && root.document ? root : null);

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root || !root.document) return;

  root.NightOwlAIEditProposals = api;
  api.initialize();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAIEditProposals(root) {
  'use strict';

  const LOCAL_PROVIDERS = new Set(['local', 'lmstudio', 'ollama']);
  const DEFAULT_REWRITE_INSTRUCTION = 'Improve clarity and concision while preserving meaning and Markdown structure.';
  const MAX_DIFF_CELLS = 250000;

  function hashText(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function tokenizeLines(text) {
    const source = String(text || '');
    const lines = [];
    let start = 0;
    while (start < source.length) {
      const newline = source.indexOf('\n', start);
      if (newline === -1) {
        lines.push(source.slice(start));
        break;
      }
      lines.push(source.slice(start, newline + 1));
      start = newline + 1;
    }
    return lines;
  }

  function singleHunk(sourceText, replacementText) {
    if (sourceText === replacementText) return [];
    return [{
      id: 'hunk-1',
      sourceStart: 0,
      sourceEnd: sourceText.length,
      sourceLine: 1,
      original: sourceText,
      replacement: replacementText
    }];
  }

  function createDiffHunks(sourceValue, replacementValue) {
    const sourceText = String(sourceValue ?? '');
    const replacementText = String(replacementValue ?? '');
    if (sourceText === replacementText) return [];

    const sourceLines = tokenizeLines(sourceText);
    const replacementLines = tokenizeLines(replacementText);
    if (!sourceLines.length || !replacementLines.length ||
        sourceLines.length * replacementLines.length > MAX_DIFF_CELLS) {
      return singleHunk(sourceText, replacementText);
    }

    const width = replacementLines.length + 1;
    const table = new Uint32Array((sourceLines.length + 1) * width);
    for (let sourceIndex = sourceLines.length - 1; sourceIndex >= 0; sourceIndex -= 1) {
      for (let replacementIndex = replacementLines.length - 1; replacementIndex >= 0; replacementIndex -= 1) {
        const cell = sourceIndex * width + replacementIndex;
        table[cell] = sourceLines[sourceIndex] === replacementLines[replacementIndex]
          ? table[(sourceIndex + 1) * width + replacementIndex + 1] + 1
          : Math.max(
            table[(sourceIndex + 1) * width + replacementIndex],
            table[sourceIndex * width + replacementIndex + 1]
          );
      }
    }

    const operations = [];
    let sourceIndex = 0;
    let replacementIndex = 0;
    while (sourceIndex < sourceLines.length && replacementIndex < replacementLines.length) {
      if (sourceLines[sourceIndex] === replacementLines[replacementIndex]) {
        operations.push({ type: 'equal', text: sourceLines[sourceIndex] });
        sourceIndex += 1;
        replacementIndex += 1;
      } else if (table[(sourceIndex + 1) * width + replacementIndex] >=
                 table[sourceIndex * width + replacementIndex + 1]) {
        operations.push({ type: 'delete', text: sourceLines[sourceIndex] });
        sourceIndex += 1;
      } else {
        operations.push({ type: 'insert', text: replacementLines[replacementIndex] });
        replacementIndex += 1;
      }
    }
    while (sourceIndex < sourceLines.length) {
      operations.push({ type: 'delete', text: sourceLines[sourceIndex++] });
    }
    while (replacementIndex < replacementLines.length) {
      operations.push({ type: 'insert', text: replacementLines[replacementIndex++] });
    }

    const hunks = [];
    let sourceOffset = 0;
    let sourceLine = 1;
    let current = null;
    const finish = () => {
      if (!current) return;
      current.id = `hunk-${hunks.length + 1}`;
      hunks.push(current);
      current = null;
    };

    for (const operation of operations) {
      if (operation.type === 'equal') {
        finish();
        sourceOffset += operation.text.length;
        sourceLine += (operation.text.match(/\n/g) || []).length;
        continue;
      }
      if (!current) {
        current = {
          sourceStart: sourceOffset,
          sourceEnd: sourceOffset,
          sourceLine,
          original: '',
          replacement: ''
        };
      }
      if (operation.type === 'delete') {
        current.original += operation.text;
        sourceOffset += operation.text.length;
        sourceLine += (operation.text.match(/\n/g) || []).length;
        current.sourceEnd = sourceOffset;
      } else {
        current.replacement += operation.text;
      }
    }
    finish();
    return hunks;
  }

  function normalizeRange(range) {
    if (!range) throw new Error('An editor range is required for an AI edit proposal');
    return {
      startLineNumber: Number(range.startLineNumber),
      startColumn: Number(range.startColumn),
      endLineNumber: Number(range.endLineNumber),
      endColumn: Number(range.endColumn)
    };
  }

  function createProposal(input = {}) {
    const sourceText = String(input.sourceText ?? '');
    const replacementText = String(input.replacementText ?? '');
    const hunks = createDiffHunks(sourceText, replacementText);
    const provenance = {
      provider: input.provenance?.provider || 'unknown',
      model: input.provenance?.model || 'unknown',
      recipe: input.provenance?.recipe || 'unspecified',
      createdAt: input.provenance?.createdAt || new Date().toISOString(),
      usage: input.provenance?.usage || null,
      remote: Boolean(input.provenance?.remote)
    };
    const digest = hashText(`${sourceText}\u0000${replacementText}\u0000${provenance.recipe}`);
    return Object.freeze({
      id: input.id || `ai-edit-${digest}`,
      title: input.title || 'AI edit proposal',
      source: Object.freeze({
        range: Object.freeze(normalizeRange(input.range)),
        startOffset: Number(input.startOffset),
        endOffset: Number(input.endOffset),
        versionId: Number(input.versionId),
        text: sourceText,
        digest: hashText(sourceText)
      }),
      replacementText,
      hunks: Object.freeze(hunks.map(hunk => Object.freeze({ ...hunk }))),
      context: Object.freeze({
        label: input.context?.label || 'Selected document context',
        text: String(input.context?.text ?? sourceText),
        digest: hashText(input.context?.text ?? sourceText)
      }),
      provenance: Object.freeze(provenance)
    });
  }

  function isLocalProvider(provider) {
    return LOCAL_PROVIDERS.has(String(provider || '').trim().toLowerCase());
  }

  function canSendContext({ provider, allowRemoteDocumentContext = true } = {}) {
    return Boolean(allowRemoteDocumentContext || isLocalProvider(provider));
  }

  function captureEditorSource(editor, rangeValue) {
    if (!editor?.getModel) throw new Error('The editor is not available');
    const model = editor.getModel();
    if (!model) throw new Error('The editor model is not available');
    const range = normalizeRange(rangeValue);
    const start = { lineNumber: range.startLineNumber, column: range.startColumn };
    const end = { lineNumber: range.endLineNumber, column: range.endColumn };
    return {
      range,
      startOffset: model.getOffsetAt(start),
      endOffset: model.getOffsetAt(end),
      versionId: model.getVersionId(),
      sourceText: model.getValueInRange(range)
    };
  }

  function applyProposal(proposal, editor, acceptedHunkIds) {
    if (!proposal || !editor?.getModel) return { success: false, error: 'The proposal or editor is unavailable' };
    const model = editor.getModel();
    if (!model) return { success: false, error: 'The editor model is unavailable' };
    if (model.getVersionId() !== proposal.source.versionId) {
      return { success: false, stale: true, error: 'The document changed after this proposal was created. Generate a fresh proposal.' };
    }
    if (model.getValueInRange(proposal.source.range) !== proposal.source.text) {
      return { success: false, stale: true, error: 'The proposed source text no longer matches the document.' };
    }

    const accepted = acceptedHunkIds instanceof Set ? acceptedHunkIds : new Set(acceptedHunkIds || []);
    const hunks = proposal.hunks.filter(hunk => accepted.has(hunk.id));
    if (!hunks.length) return { success: false, error: 'Accept at least one hunk before applying the proposal.' };

    const edits = hunks.map(hunk => {
      const start = model.getPositionAt(proposal.source.startOffset + hunk.sourceStart);
      const end = model.getPositionAt(proposal.source.startOffset + hunk.sourceEnd);
      return {
        range: {
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column
        },
        text: hunk.replacement
      };
    });

    editor.pushUndoStop?.();
    const applied = editor.executeEdits('ai-edit-proposal', edits);
    editor.pushUndoStop?.();
    editor.focus?.();
    if (applied === false) return { success: false, error: 'Monaco rejected the proposed edits.' };
    return { success: true, appliedHunks: hunks.length, proposalId: proposal.id };
  }

  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function usageLabel(usage) {
    if (!usage || typeof usage !== 'object') return 'Not reported';
    const entries = Object.entries(usage)
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .slice(0, 8);
    return entries.length ? entries.map(([key, value]) => `${key}: ${value}`).join(' · ') : 'Not reported';
  }

  function ensureStyles() {
    if (!root?.document || root.document.getElementById('ai-edit-proposal-styles')) return;
    const style = root.document.createElement('style');
    style.id = 'ai-edit-proposal-styles';
    style.textContent = `
      .ai-edit-overlay{position:fixed;inset:0;z-index:12000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.62);padding:24px;box-sizing:border-box}
      .ai-edit-dialog{width:min(900px,96vw);max-height:90vh;overflow:auto;background:var(--bg-color,#1e1e1e);color:var(--text-color,#ddd);border:1px solid var(--border-color,#555);border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.48);font:13px/1.45 system-ui,sans-serif}
      .ai-edit-header,.ai-edit-footer{position:sticky;z-index:2;background:inherit;padding:14px 16px;display:flex;align-items:center;gap:10px}.ai-edit-header{top:0;border-bottom:1px solid var(--border-color,#444)}.ai-edit-footer{bottom:0;justify-content:flex-end;border-top:1px solid var(--border-color,#444)}
      .ai-edit-header h2{font-size:16px;margin:0;flex:1}.ai-edit-body{padding:16px}.ai-edit-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:12px}.ai-edit-meta div{background:var(--bg-secondary,#292929);border-radius:6px;padding:8px}.ai-edit-meta strong{display:block;font-size:11px;color:var(--text-muted,#aaa);text-transform:uppercase;letter-spacing:.04em}
      .ai-edit-context{margin:10px 0;border:1px solid var(--border-color,#444);border-radius:6px}.ai-edit-context summary{cursor:pointer;padding:9px;font-weight:600}.ai-edit-context pre,.ai-edit-diff pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;padding:10px;background:#171717;color:#ddd;max-height:260px;overflow:auto}
      .ai-edit-hunk{border:1px solid var(--border-color,#444);border-radius:7px;margin:10px 0;overflow:hidden}.ai-edit-hunk[data-decision="accept"]{border-color:#4e9c77}.ai-edit-hunk[data-decision="reject"]{opacity:.65}.ai-edit-hunk-head{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-secondary,#292929)}.ai-edit-hunk-head strong{flex:1}.ai-edit-decisions{display:flex;gap:5px}.ai-edit-decisions button[aria-pressed="true"]{outline:2px solid currentColor;outline-offset:1px}.ai-edit-diff{display:grid;grid-template-columns:1fr 1fr}.ai-edit-old{border-right:1px solid #444}.ai-edit-old h4,.ai-edit-new h4{padding:7px 10px;margin:0;font-size:11px;text-transform:uppercase}.ai-edit-old h4{color:#f28b82}.ai-edit-new h4{color:#81c995}
      .ai-edit-btn{border:1px solid #666;border-radius:5px;background:transparent;color:inherit;padding:7px 11px;cursor:pointer}.ai-edit-btn:hover:not(:disabled){background:rgba(255,255,255,.08)}.ai-edit-btn:disabled{opacity:.45;cursor:not-allowed}.ai-edit-btn-primary{background:#3478c7;border-color:#3478c7;color:#fff}.ai-edit-btn-danger{color:#f28b82}.ai-edit-status{margin-right:auto;color:#f6c177}.ai-edit-provider-local{color:#81c995}.ai-edit-provider-remote{color:#f6c177}.ai-edit-field{display:block;margin:10px 0}.ai-edit-field span{display:block;margin-bottom:5px;font-weight:600}.ai-edit-field textarea{box-sizing:border-box;width:100%;min-height:88px;padding:9px;background:var(--bg-secondary,#252526);border:1px solid #666;border-radius:5px;color:inherit;font:inherit;resize:vertical}.ai-edit-privacy-block{padding:9px;border:1px solid #b45f5f;background:rgba(180,95,95,.12);border-radius:6px;color:#ffb4ab}
      @media(max-width:650px){.ai-edit-diff{grid-template-columns:1fr}.ai-edit-old{border-right:0;border-bottom:1px solid #444}.ai-edit-overlay{padding:8px}}
    `;
    root.document.head.appendChild(style);
  }

  function closeOverlay(overlay) {
    if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
  }

  function showDisclosure({ contextLabel, contextText, provider, model, recipe, allowRemoteDocumentContext }) {
    if (!root?.document) return Promise.resolve(false);
    ensureStyles();
    closeOverlay(root.document.getElementById('ai-edit-disclosure'));
    const local = isLocalProvider(provider);
    const allowed = canSendContext({ provider, allowRemoteDocumentContext });
    const overlay = root.document.createElement('div');
    overlay.id = 'ai-edit-disclosure';
    overlay.className = 'ai-edit-overlay';
    overlay.innerHTML = `
      <section class="ai-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-edit-disclosure-title">
        <header class="ai-edit-header"><h2 id="ai-edit-disclosure-title">Review AI context before sending</h2></header>
        <div class="ai-edit-body">
          <div class="ai-edit-meta">
            <div><strong>Provider</strong><span class="${local ? 'ai-edit-provider-local' : 'ai-edit-provider-remote'}">${escapeHTML(provider || 'automatic')} · ${local ? 'local' : 'remote'}</span></div>
            <div><strong>Model</strong>${escapeHTML(model || 'automatic')}</div>
            <div><strong>Prompt recipe</strong>${escapeHTML(recipe || 'unspecified')}</div>
            <div><strong>Context size</strong>${String(contextText || '').length.toLocaleString()} characters</div>
          </div>
          <p>The exact document context below will be sent to the selected provider. Instructions and the named prompt recipe are sent with it.</p>
          ${allowed ? '' : '<p class="ai-edit-privacy-block" role="alert">Remote document context is disabled in AI settings. Choose an explicitly configured local provider or enable remote context to continue.</p>'}
          <details class="ai-edit-context" open>
            <summary>${escapeHTML(contextLabel || 'Document context')}</summary>
            <pre data-ai-edit-context>${escapeHTML(contextText)}</pre>
          </details>
        </div>
        <footer class="ai-edit-footer">
          <button class="ai-edit-btn" type="button" data-ai-edit-cancel>Cancel</button>
          <button class="ai-edit-btn ai-edit-btn-primary" type="button" data-ai-edit-send ${allowed ? '' : 'disabled'}>Send context</button>
        </footer>
      </section>`;
    root.document.body.appendChild(overlay);

    return new Promise(resolve => {
      const settle = value => { closeOverlay(overlay); resolve(value); };
      overlay.querySelector('[data-ai-edit-cancel]').addEventListener('click', () => settle(false));
      overlay.querySelector('[data-ai-edit-send]').addEventListener('click', () => settle(true));
      overlay.addEventListener('click', event => { if (event.target === overlay) settle(false); });
      overlay.addEventListener('keydown', event => { if (event.key === 'Escape') settle(false); });
      overlay.querySelector('[data-ai-edit-cancel]').focus();
    });
  }

  async function getRuntimeConfig() {
    const fallback = {
      provider: 'automatic',
      model: 'automatic',
      settings: { allowRemoteDocumentContext: true }
    };
    try {
      const result = await root?.electronAPI?.ai?.getCurrentAiConfig?.();
      return result?.success ? { ...fallback, ...result, settings: { ...fallback.settings, ...result.settings } } : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  async function requestAI(options = {}) {
    if (!root?.electronAPI?.ai?.aiChat) throw new Error('AI service is unavailable');
    const config = await getRuntimeConfig();
    const provider = options.provider || config.provider || 'automatic';
    const model = options.model || config.model || 'automatic';
    const allowRemoteDocumentContext = config.settings?.allowRemoteDocumentContext !== false;
    const approved = await showDisclosure({
      contextLabel: options.contextLabel,
      contextText: options.contextText,
      provider,
      model,
      recipe: options.recipe,
      allowRemoteDocumentContext
    });
    if (!approved) return null;

    const response = await root.electronAPI.ai.aiChat({
      message: String(options.prompt || ''),
      options: {
        ...(options.requestOptions || {}),
        ...(options.provider ? { provider: options.provider } : {}),
        ...(options.model ? { model: options.model } : {})
      }
    });
    if (response?.error) throw new Error(response.error);
    const text = response?.response ?? response?.content;
    if (typeof text !== 'string') throw new Error('The AI provider returned no editable text');
    const actualProvider = response.provider || provider;
    return {
      text,
      provenance: {
        provider: actualProvider,
        model: response.model || model,
        recipe: options.recipe || 'unspecified',
        createdAt: new Date().toISOString(),
        usage: response.usage || null,
        remote: !isLocalProvider(actualProvider)
      },
      context: {
        label: options.contextLabel || 'Selected document context',
        text: String(options.contextText ?? '')
      }
    };
  }

  function showReview(proposal, editor = root?.editor) {
    if (!root?.document) return Promise.resolve({ status: 'unavailable' });
    ensureStyles();
    closeOverlay(root.document.getElementById('ai-edit-review'));
    const accepted = new Set(proposal.hunks.map(hunk => hunk.id));
    const overlay = root.document.createElement('div');
    overlay.id = 'ai-edit-review';
    overlay.className = 'ai-edit-overlay';
    const providerClass = proposal.provenance.remote ? 'ai-edit-provider-remote' : 'ai-edit-provider-local';
    overlay.innerHTML = `
      <section class="ai-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-edit-review-title">
        <header class="ai-edit-header"><h2 id="ai-edit-review-title">${escapeHTML(proposal.title)}</h2><span>${proposal.hunks.length} hunk${proposal.hunks.length === 1 ? '' : 's'}</span></header>
        <div class="ai-edit-body">
          <div class="ai-edit-meta">
            <div><strong>Provider</strong><span class="${providerClass}">${escapeHTML(proposal.provenance.provider)}</span></div>
            <div><strong>Model</strong>${escapeHTML(proposal.provenance.model)}</div>
            <div><strong>Prompt recipe</strong>${escapeHTML(proposal.provenance.recipe)}</div>
            <div><strong>Created</strong>${escapeHTML(proposal.provenance.createdAt)}</div>
          </div>
          <div class="ai-edit-meta"><div><strong>Usage</strong>${escapeHTML(usageLabel(proposal.provenance.usage))}</div><div><strong>Source revision</strong>${escapeHTML(proposal.source.versionId)} · ${escapeHTML(proposal.source.digest)}</div></div>
          <details class="ai-edit-context"><summary>Disclosed context · ${escapeHTML(proposal.context.label)}</summary><pre>${escapeHTML(proposal.context.text)}</pre></details>
          <div data-ai-edit-hunks>${proposal.hunks.map(hunk => `
            <article class="ai-edit-hunk" data-hunk-id="${escapeHTML(hunk.id)}" data-decision="accept">
              <div class="ai-edit-hunk-head"><strong>Hunk ${escapeHTML(hunk.id.replace('hunk-', ''))} · source line ${hunk.sourceLine}</strong>
                <div class="ai-edit-decisions" role="group" aria-label="Decision for ${escapeHTML(hunk.id)}">
                  <button class="ai-edit-btn" type="button" data-ai-edit-decision="accept" aria-pressed="true">Accept</button>
                  <button class="ai-edit-btn ai-edit-btn-danger" type="button" data-ai-edit-decision="reject" aria-pressed="false">Reject</button>
                </div>
              </div>
              <div class="ai-edit-diff"><section class="ai-edit-old"><h4>Original</h4><pre>${escapeHTML(hunk.original || '∅')}</pre></section><section class="ai-edit-new"><h4>Proposed</h4><pre>${escapeHTML(hunk.replacement || '∅')}</pre></section></div>
            </article>`).join('')}</div>
          ${proposal.hunks.length ? '' : '<p role="status">The provider returned text identical to the source. There is nothing to apply.</p>'}
        </div>
        <footer class="ai-edit-footer">
          <span class="ai-edit-status" role="status" aria-live="polite"></span>
          <button class="ai-edit-btn" type="button" data-ai-edit-reject-all>Reject proposal</button>
          <button class="ai-edit-btn" type="button" data-ai-edit-accept-all ${proposal.hunks.length ? '' : 'disabled'}>Accept all</button>
          <button class="ai-edit-btn ai-edit-btn-primary" type="button" data-ai-edit-apply ${proposal.hunks.length ? '' : 'disabled'}>Apply accepted</button>
        </footer>
      </section>`;
    root.document.body.appendChild(overlay);

    return new Promise(resolve => {
      const status = overlay.querySelector('.ai-edit-status');
      const applyButton = overlay.querySelector('[data-ai-edit-apply]');
      const updateHunk = article => {
        const id = article.dataset.hunkId;
        const included = accepted.has(id);
        article.dataset.decision = included ? 'accept' : 'reject';
        article.querySelector('[data-ai-edit-decision="accept"]').setAttribute('aria-pressed', String(included));
        article.querySelector('[data-ai-edit-decision="reject"]').setAttribute('aria-pressed', String(!included));
        applyButton.disabled = accepted.size === 0;
      };
      overlay.querySelectorAll('.ai-edit-hunk').forEach(article => {
        article.querySelectorAll('[data-ai-edit-decision]').forEach(button => {
          button.addEventListener('click', () => {
            if (button.dataset.aiEditDecision === 'accept') accepted.add(article.dataset.hunkId);
            else accepted.delete(article.dataset.hunkId);
            updateHunk(article);
          });
        });
      });
      overlay.querySelector('[data-ai-edit-accept-all]').addEventListener('click', () => {
        proposal.hunks.forEach(hunk => accepted.add(hunk.id));
        overlay.querySelectorAll('.ai-edit-hunk').forEach(updateHunk);
      });
      overlay.querySelector('[data-ai-edit-reject-all]').addEventListener('click', () => {
        closeOverlay(overlay);
        resolve({ status: 'rejected', proposalId: proposal.id });
      });
      applyButton.addEventListener('click', () => {
        const result = applyProposal(proposal, editor, accepted);
        if (!result.success) {
          status.textContent = result.error;
          if (result.stale) overlay.dataset.stale = 'true';
          return;
        }
        closeOverlay(overlay);
        root.showNotification?.(`Applied ${result.appliedHunks} AI edit hunk${result.appliedHunks === 1 ? '' : 's'}`, 'success');
        resolve({ status: 'applied', ...result });
      });
      overlay.addEventListener('click', event => {
        if (event.target === overlay) {
          closeOverlay(overlay);
          resolve({ status: 'rejected', proposalId: proposal.id });
        }
      });
      overlay.querySelector('[data-ai-edit-reject-all]').focus();
    });
  }

  function reviewEditorEdit(options = {}) {
    const editor = options.editor || root?.editor;
    const captured = options.capturedSource || captureEditorSource(editor, options.range);
    const proposal = createProposal({
      ...captured,
      replacementText: options.replacementText,
      title: options.title,
      provenance: options.provenance,
      context: options.context
    });
    showReview(proposal, editor);
    return proposal;
  }

  function showInstructionDialog() {
    if (!root?.document) return Promise.resolve(null);
    ensureStyles();
    const overlay = root.document.createElement('div');
    overlay.id = 'ai-edit-instruction';
    overlay.className = 'ai-edit-overlay';
    overlay.innerHTML = `
      <section class="ai-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-edit-instruction-title">
        <header class="ai-edit-header"><h2 id="ai-edit-instruction-title">Propose an AI rewrite</h2></header>
        <div class="ai-edit-body"><label class="ai-edit-field"><span>Rewrite instruction</span><textarea data-ai-edit-instruction>${escapeHTML(DEFAULT_REWRITE_INSTRUCTION)}</textarea></label><p>The selected text is disclosed for approval before any request leaves the app. The result opens as a non-mutating diff.</p></div>
        <footer class="ai-edit-footer"><button class="ai-edit-btn" data-ai-edit-cancel type="button">Cancel</button><button class="ai-edit-btn ai-edit-btn-primary" data-ai-edit-continue type="button">Review context</button></footer>
      </section>`;
    root.document.body.appendChild(overlay);
    return new Promise(resolve => {
      const textarea = overlay.querySelector('[data-ai-edit-instruction]');
      const settle = value => { closeOverlay(overlay); resolve(value); };
      overlay.querySelector('[data-ai-edit-cancel]').addEventListener('click', () => settle(null));
      overlay.querySelector('[data-ai-edit-continue]').addEventListener('click', () => settle(textarea.value.trim() || DEFAULT_REWRITE_INSTRUCTION));
      overlay.addEventListener('click', event => { if (event.target === overlay) settle(null); });
      textarea.focus();
      textarea.select();
    });
  }

  async function rewriteSelection() {
    const editor = root?.editor;
    const model = editor?.getModel?.();
    const selection = editor?.getSelection?.();
    if (!model || !selection || selection.isEmpty?.()) {
      root?.showNotification?.('Select text to propose an AI rewrite', 'info');
      return null;
    }
    const instruction = await showInstructionDialog();
    if (!instruction) return null;
    const sourceText = model.getValueInRange(selection);
    const prompt = `Rewrite the selected Markdown according to this instruction:\n${instruction}\n\nReturn only the replacement Markdown, without a preamble or code fence.\n\n<selected_markdown>\n${sourceText}\n</selected_markdown>`;
    try {
      const response = await requestAI({
        prompt,
        contextLabel: 'Selected Markdown',
        contextText: sourceText,
        recipe: 'selection-rewrite-v1',
        requestOptions: { newConversation: true, temperature: 0.25 }
      });
      if (!response) return null;
      return reviewEditorEdit({
        editor,
        range: selection,
        replacementText: response.text,
        title: 'Review AI selection rewrite',
        provenance: response.provenance,
        context: response.context
      });
    } catch (error) {
      root?.showNotification?.(`AI rewrite failed: ${error.message}`, 'error');
      return null;
    }
  }

  let initialized = false;
  function initialize() {
    if (initialized || !root?.document) return;
    initialized = true;
    ensureStyles();
    const register = () => {
      if (typeof root.registerCommand === 'function' && !root.NightOwlActions?.get?.('ai.rewriteSelection')) {
        root.registerCommand('ai.rewriteSelection', 'AI: Propose Rewrite of Selection', rewriteSelection, null, {
          category: 'AI', keywords: ['review', 'diff', 'rewrite', 'selection']
        });
      }
    };
    const registerEditorAction = () => {
      if (!root.editor?.addAction) return false;
      root.editor.addAction({
        id: 'ai-propose-selection-rewrite',
        label: 'AI: Propose Rewrite of Selection',
        contextMenuGroupId: 'modification',
        contextMenuOrder: 1.8,
        precondition: 'editorHasSelection',
        run: rewriteSelection
      });
      return true;
    };
    const start = () => {
      register();
      if (registerEditorAction()) return;
      const timer = root.setInterval(() => { if (registerEditorAction()) root.clearInterval(timer); }, 250);
      root.setTimeout(() => root.clearInterval(timer), 15000);
    };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }

  return Object.freeze({
    applyProposal,
    canSendContext,
    captureEditorSource,
    createDiffHunks,
    createProposal,
    hashText,
    initialize,
    isLocalProvider,
    request: requestAI,
    reviewEditorEdit,
    rewriteSelection,
    showDisclosure,
    showReview,
    tokenizeLines
  });
});

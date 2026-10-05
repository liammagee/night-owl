/** Validated static publication workbench. */
(function initStaticSite(root, factory) {
  const api = factory(root);
  if (root) root.NightOwlStaticSite = root.staticSite = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.initialize();
})(typeof window !== 'undefined' ? window : null, function createStaticSite(root) {
  'use strict';

  const state = {
    overlay: null,
    files: [],
    profiles: [],
    request: null,
    preflight: null,
    running: false,
    initialized: false
  };

  function make(tag, className, text) {
    const element = root.document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function dirname(filePath) {
    return String(filePath || '').replace(/[\\/][^\\/]*$/, '');
  }

  function flattenTree(nodes, output = []) {
    for (const node of Array.isArray(nodes) ? nodes : []) {
      if (node?.type === 'file' && /\.(?:md|markdown)$/i.test(node.name || node.path || '')) output.push(node);
      if (node?.children) flattenTree(node.children, output);
    }
    return output;
  }

  function linkifyWikiLinks(html) {
    return String(html || '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, link, label) => {
      const target = String(link || '').trim();
      const display = String(label || target).trim()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const hashAt = target.indexOf('#');
      const targetPath = hashAt >= 0 ? target.slice(0, hashAt) : target;
      const fragment = hashAt >= 0 ? target.slice(hashAt) : '';
      const withExtension = `${/\.[a-z0-9]+$/i.test(targetPath) ? targetPath : `${targetPath}.md`}${fragment}`;
      return `<a href="#" class="internal-link" data-link="${encodeURIComponent(withExtension)}">${display}</a>`;
    });
  }

  async function collectMarkdownFiles() {
    const byPath = new Map();
    const currentPath = String(root.currentFilePath || '');
    if (/\.(?:md|markdown)$/i.test(currentPath) && root.editor?.getModel?.()) {
      byPath.set(currentPath, {
        sourcePath: currentPath,
        title: currentPath.split(/[\\/]/).pop(),
        content: root.editor.getValue(),
        sourceState: 'editor'
      });
    }
    const nodes = flattenTree(root.fileTreeData || []);
    for (const node of nodes) {
      const sourcePath = String(node.path || '');
      if (!sourcePath || byPath.has(sourcePath)) continue;
      try {
        const result = await root.electronAPI?.files?.readFile?.(sourcePath);
        if (result?.success !== false && typeof result?.content === 'string') {
          byPath.set(sourcePath, {
            sourcePath,
            title: String(node.name || sourcePath.split(/[\\/]/).pop()),
            content: result.content,
            sourceState: 'disk'
          });
        }
      } catch (_error) {
        // Failed reads are omitted here and remain visible in the normal file tree.
      }
    }
    return Array.from(byPath.values()).sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
  }

  async function renderFiles(files) {
    const renderer = root.TechneMarkdownRenderer;
    if (!renderer?.renderTrustedHtml) throw new Error('The trusted Markdown renderer is not ready.');
    const rendered = [];
    for (const file of files) {
      const result = await renderer.renderTrustedHtml({
        markdownContent: file.content,
        filePath: file.sourcePath,
        baseDir: dirname(file.sourcePath),
        processInternalLinksHTML: linkifyWikiLinks,
        previewZoom: null,
        speakerNotesSink: () => {}
      });
      rendered.push({
        sourcePath: file.sourcePath,
        title: file.title,
        html: result.html,
        contract: result.contract
      });
    }
    return rendered;
  }

  function profilePayload(profileId) {
    const profile = state.profiles.find(candidate => candidate.id === profileId);
    if (!profile) return null;
    const contentRepository = (profile.repositories || []).find(repository => repository.id === 'content');
    return {
      id: profile.id,
      title: profile.title,
      contentRepository: contentRepository ? {
        remote: contentRepository.remote || null,
        revision: contentRepository.revision || null
      } : null
    };
  }

  async function preparePublication(files, options = {}) {
    const rendered = await renderFiles(files);
    return {
      files: rendered,
      options: {
        title: String(options.title || 'My Writing').trim() || 'My Writing',
        profile: options.profile || null
      }
    };
  }

  async function inspectProfiles() {
    try {
      const inspection = await root.electronAPI?.publishing?.inspect?.();
      state.profiles = Array.isArray(inspection?.profiles) ? inspection.profiles : [];
    } catch (_error) {
      state.profiles = [];
    }
    return state.profiles;
  }

  function selectedFiles() {
    if (!state.overlay) return state.files;
    const indices = Array.from(state.overlay.querySelectorAll('[data-static-source]:checked'))
      .map(input => Number(input.dataset.staticSource));
    return indices.map(index => state.files[index]).filter(Boolean);
  }

  function selectedOptions() {
    const title = state.overlay?.querySelector('#static-publishing-title')?.value || 'My Writing';
    const profileId = state.overlay?.querySelector('#static-publishing-profile')?.value || '';
    return { title, profile: profilePayload(profileId) };
  }

  function setBusy(busy, message = '') {
    state.running = busy;
    if (!state.overlay) return;
    state.overlay.querySelectorAll('button,input,select').forEach(control => {
      control.disabled = busy;
    });
    const status = state.overlay.querySelector('[data-static-status]');
    if (status && message) status.textContent = message;
  }

  function renderReport(result) {
    if (!state.overlay) return;
    const report = result?.report;
    const status = state.overlay.querySelector('[data-static-status]');
    const exportButton = state.overlay.querySelector('[data-static-export]');
    const summary = report?.summary;
    if (!report || !summary) {
      status.textContent = result?.error || 'Preflight did not return a report.';
      exportButton.disabled = true;
      return;
    }
    status.textContent = report.ready
      ? `${summary.pages} pages · ${summary.assets} copied assets · ${summary.internalLinks} internal links · ready`
      : `${summary.errors} errors and ${summary.warnings} warnings must be reviewed`;
    status.dataset.ready = String(report.ready);
    exportButton.disabled = !report.ready;

    const issues = state.overlay.querySelector('[data-static-issues]');
    issues.replaceChildren();
    if (!report.issues.length) {
      issues.appendChild(make('p', 'static-publishing-ok', 'No broken routes, anchors, local images, or copied assets.'));
    } else {
      for (const issue of report.issues) {
        const entry = make('article', `static-publishing-issue ${issue.severity}`);
        entry.append(
          make('strong', '', `${issue.severity === 'error' ? 'Error' : 'Warning'} · ${issue.code}`),
          make('span', '', issue.message),
          make('code', '', [issue.source, issue.target].filter(Boolean).join(' → '))
        );
        issues.appendChild(entry);
      }
    }

    const mappings = state.overlay.querySelector('[data-static-mappings]');
    mappings.replaceChildren();
    for (const mapping of report.mappings.pages) {
      const row = make('tr');
      row.append(make('td', '', mapping.source), make('td', '', mapping.output));
      mappings.appendChild(row);
    }

    const selector = state.overlay.querySelector('[data-static-preview-page]');
    selector.replaceChildren();
    for (const [index, document] of (result.documents || []).entries()) {
      const option = make('option', '', `${document.output} — ${document.title}`);
      option.value = String(index);
      selector.appendChild(option);
    }
    const showPreview = () => {
      const document = result.documents?.[Number(selector.value) || 0];
      const frame = state.overlay.querySelector('[data-static-preview-frame]');
      if (frame) frame.srcdoc = document?.previewHtml || '<p>Preview unavailable.</p>';
    };
    selector.onchange = showPreview;
    showPreview();
  }

  async function runPreflight() {
    if (!state.overlay || state.running) return null;
    setBusy(true, 'Rendering with the trusted Preview pipeline…');
    try {
      state.request = await preparePublication(selectedFiles(), selectedOptions());
      const result = await root.electronAPI?.publishing?.preview?.(state.request);
      state.preflight = result;
      renderReport(result);
      return result;
    } catch (error) {
      state.preflight = null;
      renderReport({ error: error.message || String(error) });
      return null;
    } finally {
      setBusy(false);
      const exportButton = state.overlay?.querySelector('[data-static-export]');
      if (exportButton) exportButton.disabled = !state.preflight?.ready;
    }
  }

  function close() {
    state.overlay?.remove();
    state.overlay = null;
    root.document?.removeEventListener('keydown', handleEscape);
  }

  function handleEscape(event) {
    if (event.key === 'Escape' && !state.running) close();
  }

  async function exportPublication() {
    if (!state.preflight?.ready || !state.request || state.running) return;
    setBusy(true, 'Writing validated publication…');
    try {
      const result = await root.electronAPI?.publishing?.generate?.(state.request);
      if (result?.cancelled) {
        const status = state.overlay?.querySelector('[data-static-status]');
        if (status) status.textContent = 'Export cancelled; no files were written.';
        return;
      }
      if (!result?.success) {
        renderReport(result || { error: 'Publication failed.' });
        return;
      }
      const status = state.overlay?.querySelector('[data-static-status]');
      if (status) status.textContent = `Published ${result.pageCount} HTML files with ${result.manifestFile} to ${result.filePath}`;
      root.showNotification?.(`Validated site exported: ${result.pageCount} HTML files`, 'success');
      const continueButton = state.overlay?.querySelector('[data-static-continue]');
      if (continueButton) continueButton.hidden = !state.request.options.profile;
    } catch (error) {
      renderReport({ error: error.message || String(error) });
    } finally {
      setBusy(false);
    }
  }

  function buildDialog() {
    const overlay = make('div', 'static-publishing-overlay');
    overlay.id = 'static-site-dialog';
    const dialog = make('section', 'static-publishing-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'static-publishing-heading');

    const header = make('header', 'static-publishing-header');
    const headingGroup = make('div');
    const heading = make('h2', '', 'Validated static publishing');
    heading.id = 'static-publishing-heading';
    headingGroup.append(heading, make('p', '', 'Render once with Preview semantics, verify every local route and asset, then emit a downstream handoff manifest.'));
    const closeButton = make('button', 'btn btn-secondary', 'Close');
    closeButton.type = 'button';
    closeButton.dataset.staticClose = '';
    closeButton.addEventListener('click', close);
    header.append(headingGroup, closeButton);

    const body = make('div', 'static-publishing-body');
    const controls = make('aside', 'static-publishing-controls');
    const titleLabel = make('label', '', 'Site title');
    const titleInput = make('input');
    titleInput.id = 'static-publishing-title';
    titleInput.value = 'My Writing';
    titleInput.addEventListener('change', runPreflight);
    titleLabel.appendChild(titleInput);
    const profileLabel = make('label', '', 'Publishing handoff');
    const profileSelect = make('select');
    profileSelect.id = 'static-publishing-profile';
    profileSelect.addEventListener('change', runPreflight);
    const fallback = make('option', '', 'Simple folder export');
    fallback.value = '';
    profileSelect.appendChild(fallback);
    for (const profile of state.profiles) {
      const option = make('option', '', profile.title);
      option.value = profile.id;
      profileSelect.appendChild(option);
    }
    profileLabel.appendChild(profileSelect);
    const sourceHeading = make('h3', '', `Sources (${state.files.length})`);
    const sourceList = make('div', 'static-publishing-source-list');
    state.files.forEach((file, index) => {
      const label = make('label', 'static-publishing-source');
      const checkbox = make('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.dataset.staticSource = String(index);
      checkbox.addEventListener('change', runPreflight);
      label.append(checkbox, make('span', '', file.sourcePath));
      sourceList.appendChild(label);
    });
    const refresh = make('button', 'btn btn-secondary', 'Refresh preflight');
    refresh.type = 'button';
    refresh.addEventListener('click', runPreflight);
    controls.append(titleLabel, profileLabel, sourceHeading, sourceList, refresh);

    const evidence = make('div', 'static-publishing-evidence');
    const status = make('p', 'static-publishing-status', 'Preparing preflight…');
    status.dataset.staticStatus = '';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const tabs = make('div', 'static-publishing-evidence-grid');
    const reportPanel = make('section', 'static-publishing-report');
    reportPanel.append(make('h3', '', 'Validation report'));
    const issues = make('div', 'static-publishing-issues');
    issues.dataset.staticIssues = '';
    const details = make('details', 'static-publishing-mapping-details');
    const summary = make('summary', '', 'Source → output mappings');
    const table = make('table');
    const head = make('thead');
    const headRow = make('tr');
    headRow.append(make('th', '', 'Source'), make('th', '', 'Output'));
    head.appendChild(headRow);
    const mappings = make('tbody');
    mappings.dataset.staticMappings = '';
    table.append(head, mappings);
    details.append(summary, table);
    reportPanel.append(issues, details);

    const previewPanel = make('section', 'static-publishing-preview');
    previewPanel.append(make('h3', '', 'Local no-network preview'));
    const pageSelect = make('select');
    pageSelect.dataset.staticPreviewPage = '';
    pageSelect.setAttribute('aria-label', 'Preview page');
    const frame = make('iframe');
    frame.dataset.staticPreviewFrame = '';
    frame.title = 'Static publication preview';
    frame.setAttribute('sandbox', '');
    previewPanel.append(pageSelect, frame);
    tabs.append(reportPanel, previewPanel);
    evidence.append(status, tabs);
    body.append(controls, evidence);

    const footer = make('footer', 'static-publishing-footer');
    footer.append(make('span', '', 'Output is written only after preflight passes. Existing folders are never overwritten.'));
    const footerActions = make('div');
    const continueButton = make('button', 'btn btn-secondary', 'Continue to repository workflow');
    continueButton.type = 'button';
    continueButton.hidden = true;
    continueButton.dataset.staticContinue = '';
    continueButton.addEventListener('click', () => {
      close();
      root.NightOwlActions?.execute?.('publishing.openWorkflows');
    });
    const exportButton = make('button', 'btn btn-primary', 'Publish to folder…');
    exportButton.type = 'button';
    exportButton.disabled = true;
    exportButton.dataset.staticExport = '';
    exportButton.addEventListener('click', exportPublication);
    footerActions.append(continueButton, exportButton);
    footer.appendChild(footerActions);
    dialog.append(header, body, footer);
    overlay.appendChild(dialog);
    overlay.addEventListener('mousedown', event => { if (event.target === overlay && !state.running) close(); });
    return overlay;
  }

  async function generate() {
    if (!root?.document?.body || state.running) return null;
    close();
    state.files = await collectMarkdownFiles();
    if (!state.files.length) {
      root.showNotification?.('No Markdown content is available to publish.', 'info');
      return null;
    }
    await inspectProfiles();
    state.preflight = null;
    state.request = null;
    state.overlay = buildDialog();
    root.document.body.appendChild(state.overlay);
    root.document.addEventListener('keydown', handleEscape);
    state.overlay.querySelector('[data-static-close]')?.focus();
    await runPreflight();
    return state.overlay;
  }

  function initialize() {
    if (state.initialized || !root?.document) return;
    state.initialized = true;
    const register = () => {
      if (typeof root.registerCommand === 'function' && !root.NightOwlActions?.get?.('export.staticSite')) {
        root.registerCommand('export.staticSite', 'Export: Validated Static Site', generate, null, {
          category: 'Export', keywords: ['publish', 'website', 'manifest', 'preflight']
        });
      }
    };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', register, { once: true });
    else register();
  }

  return Object.freeze({
    close,
    collectMarkdownFiles,
    flattenTree,
    generate,
    initialize,
    linkifyWikiLinks,
    preparePublication,
    renderFiles,
    runPreflight,
    state
  });
});

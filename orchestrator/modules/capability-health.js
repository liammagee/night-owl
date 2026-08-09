/* Capability health UI and privacy-safe renderer report model. */
(function initCapabilityHealth(root, factory) {
  const api = factory(root);
  if (root) root.NightOwlCapabilities = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.initialize();
})(typeof window !== 'undefined' ? window : null, function createCapabilityHealth(root) {
  'use strict';

  const VALID_STATUSES = new Set(['available', 'degraded', 'missing', 'unconfigured']);
  const STATUS_LABELS = Object.freeze({
    available: 'Available', degraded: 'Degraded', missing: 'Missing', unconfigured: 'Not configured'
  });
  const GUIDANCE_KEY = 'nightowl-capability-guidance-v1';
  let snapshot = null;
  let inFlight = null;
  let initialized = false;

  function safeText(value, max = 500) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
  }

  function normalizeSetup(setup) {
    if (!setup || typeof setup !== 'object') return null;
    const url = /^https:\/\//i.test(String(setup.url || '')) ? String(setup.url).slice(0, 1000) : null;
    const section = ['ai', 'tts', 'export', 'advanced'].includes(setup.section) ? setup.section : null;
    return {
      label: safeText(setup.label || 'Setup guidance', 120),
      command: setup.command ? safeText(setup.command, 300) : null,
      url,
      section
    };
  }

  function normalizeReport(input = {}) {
    const capabilities = (Array.isArray(input.capabilities) ? input.capabilities : [])
      .filter(item => item && typeof item.id === 'string')
      .map(item => ({
        id: safeText(item.id, 80).replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
        label: safeText(item.label || item.id, 120),
        status: VALID_STATUSES.has(item.status) ? item.status : 'degraded',
        summary: safeText(item.summary || 'No details reported.', 600),
        version: item.version ? safeText(item.version, 180) : null,
        setup: normalizeSetup(item.setup),
        alternatives: (Array.isArray(item.alternatives) ? item.alternatives : []).slice(0, 8).map(value => safeText(value, 180)),
        checkedAt: safeText(item.checkedAt || input.generatedAt || new Date().toISOString(), 80)
      }));

    const browserSpeech = Boolean(root?.speechSynthesis && root?.SpeechSynthesisUtterance);
    const speech = capabilities.find(item => item.id === 'tts');
    if (speech && browserSpeech && speech.status === 'unconfigured') {
      speech.status = 'degraded';
      speech.summary = 'Browser speech is available; optional Lemonfox speech is not configured.';
      if (!speech.alternatives.includes('Browser Web Speech')) speech.alternatives.unshift('Browser Web Speech');
    }

    const counts = { available: 0, degraded: 0, missing: 0, unconfigured: 0 };
    capabilities.forEach(item => { counts[item.status] += 1; });
    return Object.freeze({
      success: input.success !== false,
      schemaVersion: 1,
      generatedAt: safeText(input.generatedAt || new Date().toISOString(), 80),
      privacy: 'No credential values, document contents, command paths, or private filesystem paths are included.',
      summary: Object.freeze({ counts: Object.freeze(counts), total: capabilities.length }),
      capabilities: Object.freeze(capabilities.map(item => Object.freeze(item)))
    });
  }

  function fallbackReport(error) {
    return normalizeReport({
      success: false,
      capabilities: [{
        id: 'health-service',
        label: 'Capability checks',
        status: 'degraded',
        summary: `Capability checks could not run: ${safeText(error?.message || error || 'unknown error', 240)}`
      }]
    });
  }

  async function check(options = {}) {
    if (snapshot && !options.force) return snapshot;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const result = await root?.electronAPI?.capabilityHealth?.check?.();
        snapshot = normalizeReport(result || { success: false, capabilities: [] });
      } catch (error) {
        snapshot = fallbackReport(error);
      } finally {
        inFlight = null;
      }
      root?.dispatchEvent?.(new root.CustomEvent('nightowl-capability-health-changed', { detail: snapshot }));
      return snapshot;
    })();
    return inFlight;
  }

  function getSnapshot() {
    return snapshot;
  }

  function statusSummary(report) {
    const counts = report?.summary?.counts || {};
    const needsAttention = (counts.degraded || 0) + (counts.missing || 0) + (counts.unconfigured || 0);
    return needsAttention
      ? `${counts.available || 0} ready · ${needsAttention} optional capabilities need attention`
      : `${counts.available || 0} capabilities ready`;
  }

  async function copyText(text) {
    if (root?.navigator?.clipboard?.writeText) {
      await root.navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = root?.document?.createElement('textarea');
    if (!textarea) return false;
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    root.document.body.appendChild(textarea);
    textarea.select();
    const copied = Boolean(root.document.execCommand?.('copy'));
    textarea.remove();
    return copied;
  }

  function close() {
    root?.document?.getElementById('capability-health-overlay')?.remove();
  }

  function makeButton(label, className = '') {
    const button = root.document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    return button;
  }

  function renderCapabilityCard(item) {
    const card = root.document.createElement('article');
    card.className = 'capability-health-card';
    card.dataset.capabilityId = item.id;
    card.dataset.capabilityStatus = item.status;

    const header = root.document.createElement('header');
    const title = root.document.createElement('h3');
    title.textContent = item.label;
    const badge = root.document.createElement('span');
    badge.className = `capability-status capability-status-${item.status}`;
    badge.textContent = STATUS_LABELS[item.status];
    header.append(title, badge);

    const summary = root.document.createElement('p');
    summary.textContent = item.summary;
    card.append(header, summary);
    if (item.version) {
      const version = root.document.createElement('code');
      version.textContent = item.version;
      card.appendChild(version);
    }
    if (item.alternatives.length) {
      const alternatives = root.document.createElement('p');
      alternatives.className = 'capability-alternatives';
      alternatives.textContent = `Still available: ${item.alternatives.join(', ')}`;
      card.appendChild(alternatives);
    }
    if (item.setup) {
      const actions = root.document.createElement('div');
      actions.className = 'capability-card-actions';
      if (item.setup.command) {
        const copy = makeButton(`Copy: ${item.setup.command}`, 'capability-secondary-button');
        copy.addEventListener('click', async () => {
          await copyText(item.setup.command);
          copy.textContent = 'Copied setup command';
        });
        actions.appendChild(copy);
      }
      if (item.setup.url) {
        const learn = makeButton(item.setup.label, 'capability-secondary-button');
        learn.addEventListener('click', () => root.electronAPI?.navigation?.openExternal?.(item.setup.url));
        actions.appendChild(learn);
      }
      if (item.setup.section) {
        const configure = makeButton(item.setup.label, 'capability-secondary-button');
        configure.addEventListener('click', () => {
          close();
          root.openSettingsDialog?.(item.setup.section);
        });
        actions.appendChild(configure);
      }
      card.appendChild(actions);
    }
    return card;
  }

  function render(report) {
    if (!root?.document?.body) return null;
    close();
    const overlay = root.document.createElement('div');
    overlay.id = 'capability-health-overlay';
    overlay.className = 'capability-health-overlay';
    const panel = root.document.createElement('section');
    panel.className = 'capability-health-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'capability-health-title');

    const header = root.document.createElement('header');
    header.className = 'capability-health-header';
    const headingBlock = root.document.createElement('div');
    const heading = root.document.createElement('h2');
    heading.id = 'capability-health-title';
    heading.textContent = 'Capability health';
    const subtitle = root.document.createElement('p');
    subtitle.textContent = statusSummary(report);
    headingBlock.append(heading, subtitle);
    const closeButton = makeButton('Close', 'capability-secondary-button');
    closeButton.addEventListener('click', close);
    header.append(headingBlock, closeButton);

    const privacy = root.document.createElement('p');
    privacy.className = 'capability-health-privacy';
    privacy.textContent = report.privacy;
    const grid = root.document.createElement('div');
    grid.className = 'capability-health-grid';
    report.capabilities.forEach(item => grid.appendChild(renderCapabilityCard(item)));
    const status = root.document.createElement('span');
    status.className = 'capability-health-action-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const footer = root.document.createElement('footer');
    footer.className = 'capability-health-actions';
    const copy = makeButton('Copy redacted capability report', 'capability-secondary-button');
    copy.addEventListener('click', async () => {
      const copied = await copyText(JSON.stringify(report, null, 2));
      status.textContent = copied ? 'Copied.' : 'Clipboard unavailable.';
    });
    const recheck = makeButton('Recheck capabilities', 'capability-primary-button');
    recheck.addEventListener('click', async () => {
      recheck.disabled = true;
      recheck.textContent = 'Checking…';
      render(await check({ force: true }));
    });
    footer.append(status, copy, recheck);
    panel.append(header, privacy, grid, footer);
    overlay.appendChild(panel);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    root.document.body.appendChild(overlay);
    closeButton.focus();
    return overlay;
  }

  async function open() {
    if (!root?.document?.body) return null;
    return render(await check());
  }

  function dismissGuidance() {
    root?.document?.getElementById('capability-first-run-guidance')?.remove();
    try { root?.localStorage?.setItem(GUIDANCE_KEY, 'dismissed'); } catch (_error) { /* unavailable */ }
  }

  function showFirstRunGuidance(report) {
    if (!root?.document?.body || root.document.getElementById('capability-first-run-guidance')) return null;
    try { if (root.localStorage?.getItem(GUIDANCE_KEY)) return null; } catch (_error) { /* unavailable */ }
    const needsAttention = report.capabilities.filter(item => item.status !== 'available');
    if (!needsAttention.length) return null;
    const banner = root.document.createElement('aside');
    banner.id = 'capability-first-run-guidance';
    banner.className = 'capability-first-run-guidance';
    banner.setAttribute('aria-label', 'Setup guidance');
    const text = root.document.createElement('span');
    text.textContent = `${statusSummary(report)}. NightOwl will keep unavailable features marked honestly.`;
    const review = makeButton('Review setup', 'capability-primary-button');
    review.addEventListener('click', () => { dismissGuidance(); open(); });
    const dismiss = makeButton('Dismiss', 'capability-secondary-button');
    dismiss.addEventListener('click', dismissGuidance);
    banner.append(text, review, dismiss);
    root.document.body.appendChild(banner);
    return banner;
  }

  function initialize() {
    if (initialized || !root?.document) return;
    initialized = true;
    const start = () => {
      if (typeof root.registerCommand === 'function' && !root.NightOwlActions?.get?.('help.capabilityHealth')) {
        root.registerCommand('help.capabilityHealth', 'Help: Check Capability Health', open, null, {
          category: 'Help', keywords: ['setup', 'dependencies', 'pandoc', 'git', 'AI']
        });
      }
      root.setTimeout(() => check().then(showFirstRunGuidance), 800);
    };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }

  const api = Object.freeze({
    check,
    close,
    getSnapshot,
    initialize,
    normalizeReport,
    open,
    render,
    showFirstRunGuidance,
    statusSummary
  });
  return api;
});

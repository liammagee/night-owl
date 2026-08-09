/**
 * Privacy-safe renderer incident telemetry and diagnostics UI.
 * Raw document contents and credentials must never cross this boundary.
 */
(function (root, factory) {
  const api = factory(root);
  if (root) root.NightOwlDiagnostics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function createDiagnostics(root) {
  'use strict';

  const MAX_INCIDENTS = 100;
  const MAX_STRING_LENGTH = 2000;
  const incidents = [];
  let sequence = 0;
  let globalLifecycle = null;
  let globalHandlersInstalled = false;

  const SENSITIVE_KEY_RE = /^(?:content|markdown|document|body|text|credentials?|api[_-]?key|token|password|secret|authorization|cookie)$/i;
  const PATH_KEY_RE = /^(?:path|paths|filePath|filePaths|directory|directories|cwd|workspace|root)$/i;

  function normalizeDomain(value) {
    return String(value || 'renderer').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'renderer';
  }

  function createCorrelationId(domain = 'renderer') {
    const prefix = normalizeDomain(domain).toUpperCase().slice(0, 20);
    const time = Date.now().toString(36).toUpperCase();
    const ordinal = (++sequence).toString(36).toUpperCase();
    return `NO-${prefix}-${time}-${ordinal}`;
  }

  function summarizePath(value) {
    const source = String(value || '').replace(/\\/g, '/').replace(/\/+$/, '');
    const name = source.split('/').filter(Boolean).pop() || 'path';
    return `<private-path>/${name}`;
  }

  function redactString(value) {
    let result = String(value == null ? '' : value);
    result = result.replace(
      /\b(api[_-]?key|token|password|secret|authorization)\b\s*[:=]\s*[^\s,;]+/gi,
      '$1=[redacted]'
    );
    result = result.replace(
      /(?:file:\/\/)?\/(?:Users|home|private|var|tmp)\/[^\s"'<>]+/g,
      match => summarizePath(match)
    );
    result = result.replace(
      /[A-Za-z]:\\Users\\[^\s"'<>]+/g,
      match => summarizePath(match)
    );
    result = result.replace(
      /(^|[\s(])\/(?:[^/\s"'<>]+\/)+[^\s"'<>]+/g,
      (_match, prefix) => `${prefix}${summarizePath(_match.slice(prefix.length))}`
    );
    return result.length > MAX_STRING_LENGTH
      ? `${result.slice(0, MAX_STRING_LENGTH)}…[truncated]`
      : result;
  }

  function sanitize(value, key = '', depth = 0, seen = new WeakSet()) {
    if (SENSITIVE_KEY_RE.test(String(key))) return '[redacted]';
    if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') {
      return PATH_KEY_RE.test(String(key)) ? summarizePath(value) : redactString(value);
    }
    if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`;
    if (depth >= 6) return '[max-depth]';

    if (value instanceof Error) {
      return {
        name: redactString(value.name || 'Error'),
        message: redactString(value.message || String(value)),
        stack: redactString(value.stack || '').split('\n').slice(0, 10).join('\n')
      };
    }

    if (typeof value !== 'object') return redactString(value);
    if (seen.has(value)) return '[circular]';
    seen.add(value);

    if (Array.isArray(value)) {
      return value.slice(0, 100).map(item => sanitize(item, key, depth + 1, seen));
    }

    const result = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      result[childKey] = sanitize(childValue, childKey, depth + 1, seen);
    }
    return result;
  }

  function report(input = {}) {
    const error = input.error instanceof Error ? input.error : null;
    const correlationId = String(input.correlationId || createCorrelationId(input.domain));
    const incident = {
      id: correlationId,
      correlationId,
      requestId: correlationId,
      timestamp: new Date().toISOString(),
      level: ['error', 'warn', 'info', 'debug'].includes(input.level) ? input.level : 'error',
      domain: normalizeDomain(input.domain),
      code: redactString(input.code || 'NO-RENDERER-ERROR'),
      state: redactString(input.state || 'failed'),
      message: redactString(input.message || error?.message || String(input.error || 'Unknown renderer error')),
      error: error ? sanitize(error) : null,
      context: sanitize(input.context || {})
    };

    incidents.push(incident);
    if (incidents.length > MAX_INCIDENTS) incidents.splice(0, incidents.length - MAX_INCIDENTS);
    return { ...incident, context: sanitize(incident.context), error: sanitize(incident.error) };
  }

  function log(level, domain, code, errorOrMessage, context = {}, options = {}) {
    const error = errorOrMessage instanceof Error ? errorOrMessage : null;
    const shouldRecord = options.record !== false && (level === 'error' || level === 'warn' || options.record === true);
    const incident = shouldRecord
      ? report({
          level,
          domain,
          code,
          error,
          message: error ? error.message : errorOrMessage,
          context,
          correlationId: options.correlationId,
          state: options.state
        })
      : null;
    const requestId = incident?.correlationId || options.correlationId || '-';
    const message = redactString(error ? error.message : errorOrMessage);
    const safeContext = sanitize(context);
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'info' ? 'info' : 'log';
    console[method]?.(`[NightOwl][${normalizeDomain(domain)}][${requestId}] ${code}: ${message}`, safeContext);
    return incident;
  }

  function logger(domain) {
    return {
      error: (code, error, context, options) => log('error', domain, code, error, context, options),
      warn: (code, error, context, options) => log('warn', domain, code, error, context, options),
      info: (code, message, context, options = {}) => log('info', domain, code, message, context, { ...options, record: options.record ?? false }),
      debug: (code, message, context, options = {}) => log('debug', domain, code, message, context, { ...options, record: options.record ?? false })
    };
  }

  function getIncidents(options = {}) {
    const values = options.incidentId
      ? incidents.filter(incident => incident.id === options.incidentId)
      : incidents.slice(-(options.limit || 25));
    return sanitize(values);
  }

  function clearIncidents() {
    incidents.splice(0, incidents.length);
  }

  function getReadinessSnapshot() {
    if (!root) return {};
    const presentationRoot = root.document?.getElementById('presentation-root');
    const previewContent = root.document?.getElementById('preview-content');
    const fileStatus = root.document?.getElementById('file-transition-status');
    const features = root.NightOwlFeatures;
    const enabled = features?.getEnabled?.() || [];
    const registered = features?.listFeatures?.() || [];
    const currentFile = String(root.currentFilePath || '');
    const extensionMatch = currentFile.match(/\.([a-z0-9]+)$/i);
    return {
      mode: String(root.currentMode || 'editor'),
      fileType: extensionMatch ? extensionMatch[1].toLowerCase() : (currentFile ? 'unknown' : 'none'),
      views: {
        file: fileStatus?.classList.contains('is-error') ? 'failed' : 'ready',
        preview: previewContent?.querySelector('.preview-transition-error') ? 'failed' : 'ready',
        presentation: presentationRoot?.dataset.presentationLoadState || 'idle'
      },
      features: {
        enabled: [...enabled].sort(),
        registered: [...registered].sort(),
        missingEnabled: enabled.filter(id => !registered.includes(id)).sort()
      }
    };
  }

  async function getReport(options = {}) {
    let runtime = { success: false, error: 'Runtime diagnostics unavailable' };
    let capabilities = null;
    try {
      runtime = await root?.NightOwlPerformance?.getResourceDiagnostics?.() || runtime;
    } catch (error) {
      runtime = { success: false, error: redactString(error.message) };
    }
    try {
      capabilities = await root?.NightOwlCapabilities?.check?.() || null;
    } catch (error) {
      capabilities = { success: false, error: redactString(error.message), capabilities: [] };
    }
    return sanitize({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      privacy: 'Document contents, credentials, and full private paths are omitted by default.',
      runtime,
      capabilities,
      readiness: getReadinessSnapshot(),
      incidents: getIncidents(options)
    });
  }

  async function writeClipboard(text) {
    if (root?.navigator?.clipboard?.writeText) {
      await root.navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = root?.document?.createElement('textarea');
    if (!textarea) return false;
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    root.document.body.appendChild(textarea);
    textarea.select();
    const copied = Boolean(root.document.execCommand?.('copy'));
    textarea.remove();
    return copied;
  }

  async function copyReport(options = {}) {
    const diagnosticReport = await getReport(options);
    const text = JSON.stringify(diagnosticReport, null, 2);
    const success = await writeClipboard(text);
    return { success, report: diagnosticReport, text };
  }

  function close() {
    root?.document?.getElementById('nightowl-diagnostics-overlay')?.remove();
  }

  function makeElement(tag, className, text) {
    const element = root.document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function renderPanel(reportData, options = {}) {
    close();
    const overlay = makeElement('div', 'nightowl-diagnostics-overlay');
    overlay.id = 'nightowl-diagnostics-overlay';
    const panel = makeElement('section', 'nightowl-diagnostics-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'nightowl-diagnostics-title');

    const header = makeElement('header', 'nightowl-diagnostics-header');
    const heading = makeElement('h2', '', 'NightOwl diagnostics');
    heading.id = 'nightowl-diagnostics-title';
    const closeButton = makeElement('button', 'nightowl-diagnostics-close', 'Close');
    closeButton.type = 'button';
    closeButton.addEventListener('click', close);
    header.append(heading, closeButton);

    const privacy = makeElement('p', 'nightowl-diagnostics-privacy', reportData.privacy);
    const runtime = reportData.runtime || {};
    const app = runtime.app || {};
    const summary = makeElement('dl', 'nightowl-diagnostics-summary');
    for (const [label, value] of [
      ['Version', app.version || 'unknown'],
      ['Packaged', typeof app.isPackaged === 'boolean' ? (app.isPackaged ? 'yes' : 'no') : 'unknown'],
      ['Architecture', app.arch || 'unknown'],
      ['Current mode', reportData.readiness?.mode || 'unknown'],
      ['Capabilities ready', reportData.capabilities?.summary?.counts?.available ?? 'unknown'],
      ['Recent incidents', reportData.incidents?.length || 0]
    ]) {
      summary.append(makeElement('dt', '', label), makeElement('dd', '', String(value)));
    }

    const preview = makeElement('pre', 'nightowl-diagnostics-report-preview');
    preview.textContent = JSON.stringify(reportData, null, 2);

    const status = makeElement('span', 'nightowl-diagnostics-copy-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const actions = makeElement('footer', 'nightowl-diagnostics-actions');
    const copyButton = makeElement('button', 'nightowl-diagnostics-copy', 'Copy redacted diagnostics');
    copyButton.type = 'button';
    copyButton.addEventListener('click', async () => {
      try {
        const copied = await copyReport(options);
        status.textContent = copied.success ? 'Copied.' : 'Clipboard unavailable.';
      } catch (error) {
        status.textContent = `Copy failed: ${redactString(error.message)}`;
      }
    });
    const clearButton = makeElement('button', 'nightowl-diagnostics-clear', 'Clear incidents');
    clearButton.type = 'button';
    clearButton.addEventListener('click', async () => {
      clearIncidents();
      renderPanel(await getReport(), {});
    });
    const capabilitiesButton = makeElement('button', 'nightowl-diagnostics-capabilities', 'Capability health');
    capabilitiesButton.type = 'button';
    capabilitiesButton.addEventListener('click', () => root?.NightOwlCapabilities?.open?.());
    actions.append(copyButton, capabilitiesButton, clearButton, status);
    panel.append(header, privacy, summary, preview, actions);
    overlay.appendChild(panel);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
    root.document.body.appendChild(overlay);
    closeButton.focus();
    return overlay;
  }

  async function open(options = {}) {
    if (!root?.document?.body) return null;
    return renderPanel(await getReport(options), options);
  }

  function installGlobalHandlers() {
    if (!root?.addEventListener || globalHandlersInstalled) return false;
    globalHandlersInstalled = true;
    const onError = event => {
      logger('renderer').error('NO-RENDERER-UNCAUGHT', event.error || event.message, {
        source: event.filename,
        line: event.lineno,
        column: event.colno
      });
    };
    const onUnhandledRejection = event => {
      const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason || 'Unhandled rejection'));
      logger('renderer').error('NO-RENDERER-REJECTION', reason, {});
    };

    if (root.NightOwlResourceLifecycle?.createRegistry) {
      globalLifecycle = root.NightOwlResourceLifecycle.createRegistry({
        name: 'renderer:diagnostics',
        scope: 'window'
      });
      globalLifecycle.listen(root, 'error', onError);
      globalLifecycle.listen(root, 'unhandledrejection', onUnhandledRejection);
    } else {
      root.addEventListener('error', onError);
      root.addEventListener('unhandledrejection', onUnhandledRejection);
      globalLifecycle = {
        dispose() {
          root.removeEventListener('error', onError);
          root.removeEventListener('unhandledrejection', onUnhandledRejection);
        }
      };
    }
    return true;
  }

  function dispose() {
    close();
    globalLifecycle?.dispose?.();
    globalLifecycle = null;
    globalHandlersInstalled = false;
  }

  const api = {
    clearIncidents,
    close,
    copyReport,
    createCorrelationId,
    dispose,
    getIncidents,
    getReadinessSnapshot,
    getReport,
    installGlobalHandlers,
    log,
    logger,
    open,
    redactString,
    report,
    sanitize
  };
  installGlobalHandlers();
  return api;
});

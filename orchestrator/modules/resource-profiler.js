/* On-demand resource profiling. History contains counters, never document text. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NightOwlResourceProfiler = api; api.initialize(); }
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';
  const INTERVAL = 2000;
  const LIMIT = 120;
  const longTasksSupported = Boolean(root?.PerformanceObserver?.supportedEntryTypes?.includes('longtask'));
  let panel, timer, observer, generation = 0, paused = false, pending = false;
  let history = [], longTasks = [], gpu = null, traceBusy = false, returnFocus;
  const number = value => Number.isFinite(value) ? value.toFixed(1) : '—';
  const mib = value => Number.isFinite(value) ? `${number(value / 1048576)} MiB` : '—';
  const sum = values => values.length && values.every(Number.isFinite) ? values.reduce((a, b) => a + b, 0) : null;
  function counters(value) {
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
      if (typeof item === 'number' || typeof item === 'boolean') return [[key, item]];
      if (item && typeof item === 'object' && !Array.isArray(item)) return [[key, counters(item)]];
      return [];
    }));
  }
  function node(tag, text, className) {
    const el = root.document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function button(label, action, id) {
    const el = node('button', label); el.type = 'button';
    if (id) el.id = id;
    el.addEventListener('click', action); return el;
  }
  function status(text) { if (panel) panel.querySelector('[role="status"]').textContent = text; }
  function active() { return Boolean(panel && !paused && !root.document.hidden); }
  function stopSampling() {
    generation++;
    root.clearTimeout(timer); timer = null;
    observer?.disconnect(); observer = null;
  }
  function startSampling() {
    stopSampling();
    if (!active()) return;
    if (longTasksSupported) {
      observer = new root.PerformanceObserver(list => {
        longTasks.push(...list.getEntries().map(item => ({ startTime: item.startTime, durationMs: item.duration })));
        longTasks = longTasks.slice(-LIMIT);
      });
      observer.observe({ type: 'longtask', buffered: false });
    }
    sample(generation, null, true);
  }
  async function sample(token, expected, warming = false) {
    if (!active() || token !== generation) return;
    if (pending) {
      timer = root.setTimeout(() => sample(token, null, true), INTERVAL);
      return;
    }
    pending = true;
    const started = root.performance.now();
    try {
      const diagnostics = await root.NightOwlPerformance?.getResourceDiagnostics();
      if (!active() || token !== generation) return;
      if (!diagnostics?.success || !diagnostics.resources?.available) throw new Error(diagnostics?.error || 'Process metrics unavailable in this build.');
      const resources = diagnostics.resources;
      // Resume/visibility gaps are not a two-second CPU measurement.
      if (warming) resources.processes.forEach(item => { item.cpuPercent = null; item.wakeupsPerSecond = null; });
      const heap = root.performance.memory;
      const entry = {
        sampledAt: resources.sampledAt,
        app: diagnostics.app,
        logicalCPUs: resources.logicalCPUs,
        cpuScale: 'percent of total logical CPU capacity (Electron 32)',
        intervalMs: warming ? null : resources.intervalMs,
        processes: resources.processes,
        main: resources.main,
        cpuPercent: sum(resources.processes.map(item => item.cpuPercent)),
        workingSetBytes: sum(resources.processes.map(item => item.workingSetBytes)),
        renderer: {
          heapUsedBytes: heap?.usedJSHeapSize ?? null,
          heapLimitBytes: heap?.jsHeapSizeLimit ?? null,
          samplingDelayMs: expected === null ? null : Math.max(0, started - expected),
          longTasksSupported, longTasks: longTasks.slice(),
          visualWork: root.nightowlRendererActivity?.getDiagnostics?.() || null,
          lifecycle: counters(diagnostics.renderer)
        },
        lifecycle: counters(diagnostics.lifecycle), handlers: counters(diagnostics.handlers),
        readiness: (root.NightOwlPerformance?.getReadinessRecords?.() || []).slice(-30)
          .map(({ name, status, durationMs }) => ({ name, status, durationMs })),
        trace: resources.trace
      };
      history.push(entry); history = history.slice(-LIMIT);
      render(entry);
      status(warming ? 'Warming up CPU counters…' : `Live · ${history.length} samples · ${new Date(entry.sampledAt).toLocaleTimeString()}`);
    } catch (error) { if (token === generation) status(`Profiling unavailable: ${error.message}`); }
    finally {
      pending = false;
      if (active() && token === generation) {
        const next = root.performance.now() + INTERVAL;
        timer = root.setTimeout(() => sample(token, next), INTERVAL);
      }
    }
  }
  function chart(key, label, format) {
    const box = node('div', undefined, 'resource-chart');
    const values = history.map(item => item[key]);
    const valid = values.filter(Number.isFinite);
    const peak = valid.length ? Math.max(...valid) : null;
    box.append(node('span', `${label} · peak ${format(peak)}`));
    const svg = root.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 440 55'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${label}, last ${history.length} samples, peak ${format(peak)}`);
    const line = root.document.createElementNS(svg.namespaceURI, 'path');
    let connected = false;
    line.setAttribute('d', values.map((value, index) => {
      if (!Number.isFinite(value)) { connected = false; return ''; }
      const command = connected ? 'L' : 'M'; connected = true;
      return `${command}${(index / Math.max(1, values.length - 1)) * 440},${53 - value / Math.max(peak || 1, 1) * 50}`;
    }).join(' '));
    svg.append(line); box.append(svg); return box;
  }
  function render(entry) {
    if (!panel) return;
    const summary = panel.querySelector('.resource-summary');
    summary.replaceChildren();
    for (const [label, value] of [
      ['App CPU (% machine)', `${number(entry.cpuPercent)}%`], ['Summed working sets', mib(entry.workingSetBytes)],
      ['Renderer JS heap (approx.)', mib(entry.renderer.heapUsedBytes)],
      ['Main event loop busy', `${number(entry.main.eventLoopUtilization === null ? null : entry.main.eventLoopUtilization * 100)}%`],
      ['Sampling delay', `${number(entry.renderer.samplingDelayMs)} ms`],
      ['Observed long tasks', entry.renderer.longTasksSupported ? String(entry.renderer.longTasks.length) : '—']
    ]) { const card = node('div'); card.append(node('span', label), node('strong', value)); summary.append(card); }
    panel.querySelector('.resource-charts').replaceChildren(
      chart('cpuPercent', 'CPU history', value => `${number(value)}%`), chart('workingSetBytes', 'Memory history', mib));
    const tbody = panel.querySelector('tbody'); tbody.replaceChildren();
    entry.processes.slice().sort((a, b) => (b.cpuPercent || 0) - (a.cpuPercent || 0)).forEach(item => {
      const row = node('tr');
      [item.name, item.pid, `${number(item.cpuPercent)}%`, mib(item.workingSetBytes), mib(item.peakWorkingSetBytes), number(item.wakeupsPerSecond)]
        .forEach(value => row.append(node('td', value)));
      tbody.append(row);
    });
    panel.querySelector('.resource-details').textContent = JSON.stringify({
      mainMemory: entry.main.memory, mainHeap: entry.main.heap,
      lifecycle: { main: entry.lifecycle, renderer: entry.renderer.lifecycle },
      handlers: entry.handlers, recentReadiness: entry.readiness,
      visualWork: entry.renderer.visualWork,
      longTasks: entry.renderer.longTasks, gpuFeatures: gpu?.featureStatus || 'Unavailable'
    }, null, 2);
    renderTrace(entry.trace);
  }
  function renderTrace(state) {
    if (!panel) return;
    const trace = panel.querySelector('#resource-trace');
    trace.textContent = state.active ? 'Stop trace' : 'Record 30s trace';
    trace.disabled = traceBusy || state.busy;
    const result = state.last;
    panel.querySelector('.resource-trace-status').textContent = state.active
      ? 'Chromium trace recording; stops automatically after 30 seconds.'
      : result ? (result.success ? `Trace saved: ${result.path}` : `Trace failed: ${result.error}`) : '';
  }
  async function toggleTrace() {
    if (traceBusy) return;
    traceBusy = true;
    const control = panel?.querySelector('#resource-trace'); if (control) control.disabled = true;
    try {
      const current = await root.NightOwlPerformance.getResourceDiagnostics();
      const result = current.resources.trace.active
        ? await root.NightOwlPerformance.stopTrace() : await root.NightOwlPerformance.startTrace();
      if (!result?.success) throw new Error(result?.error || 'Trace unavailable');
      const updated = await root.NightOwlPerformance.getResourceDiagnostics();
      renderTrace(updated.resources.trace);
      status(result.path ? `Trace saved: ${result.path}` : 'Trace started; automatic stop in 30 seconds.');
    } catch (error) { status(`Trace failed: ${error.message}`); }
    finally { traceBusy = false; if (control) control.disabled = false; }
  }
  function getReport() {
    return JSON.parse(JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(),
      scope: 'This NightOwl instance; external terminal processes and other app instances are not included.',
      notes: 'CPU is Electron 32 interval usage normalized across logical CPUs. Working-set totals may count shared pages more than once. Renderer heap is approximate. Long tasks are observed only while sampling. Trace files may include local paths.',
      intervalTargetMs: INTERVAL, capacity: LIMIT, gpuFeatures: gpu?.featureStatus || null, samples: history }));
  }
  function exportReport() {
    const blob = new root.Blob([JSON.stringify(getReport(), null, 2)], { type: 'application/json' });
    const url = root.URL.createObjectURL(blob);
    const link = node('a'); link.href = url; link.download = `nightowl-resources-${Date.now()}.json`;
    link.click(); root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
    status('Resource report exported.');
  }
  function close() {
    stopSampling(); panel?.remove(); panel = null;
    root.document.getElementById('resource-profiler-toggle')?.setAttribute('aria-expanded', 'false');
    if (returnFocus?.isConnected) returnFocus.focus();
  }
  function open() {
    if (panel) { panel.querySelector('button').focus(); return; }
    const anchor = root.document.getElementById('editor-status-bar');
    if (!anchor) return;
    returnFocus = root.document.activeElement;
    panel = node('section'); panel.id = 'resource-profiler';
    panel.setAttribute('role', 'region'); panel.setAttribute('aria-labelledby', 'resource-profiler-title');
    const header = node('header'); const title = node('h2', 'Resource Profiler'); title.id = 'resource-profiler-title';
    const pause = button(paused ? 'Resume' : 'Pause', () => {
      paused = !paused; pause.textContent = paused ? 'Resume' : 'Pause';
      startSampling(); if (paused) status('Paused · history retained');
    }, 'resource-pause');
    header.append(title, pause, button('Clear history', () => { history = []; longTasks = []; status('History cleared');
      panel.querySelector('.resource-charts').replaceChildren();
    }), button('Export JSON', exportReport), button('Record 30s trace', toggleTrace, 'resource-trace'), button('Close', close));
    const live = node('span', 'Starting…'); live.setAttribute('role', 'status');
    const summary = node('div', undefined, 'resource-summary');
    const charts = node('div', undefined, 'resource-charts');
    const table = node('table'); table.setAttribute('aria-label', 'App processes');
    const head = node('thead'), row = node('tr');
    ['Process', 'PID', 'CPU (% machine)', 'Working set', 'Peak working set', 'Wakeups/s'].forEach(label => { const th = node('th', label); th.scope = 'col'; row.append(th); });
    head.append(row); table.append(head, node('tbody'));
    const detail = node('details'); detail.append(node('summary', 'Runtime, lifecycle, GPU and recent workflow timings'), node('pre', '', 'resource-details'));
    panel.append(header, live, summary, charts, table,
      node('p', 'This app instance only. CPU is interval usage normalized across logical CPUs; GPU row measures the GPU process CPU, not GPU utilization. Memory sums may double-count shared pages. “—” means warming up or unavailable. Sampling stops while hidden or closed; trace capture continues up to 30s. Trace files can include local paths.', 'resource-note'),
      node('p', '', 'resource-trace-status'), detail);
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    anchor.before(panel);
    root.document.getElementById('resource-profiler-toggle')?.setAttribute('aria-expanded', 'true');
    gpu = root.NightOwlPerformance?.lastGPUDiagnostics || null;
    if (history.length) render(history[history.length - 1]);
    startSampling(); if (paused) status('Paused · history retained'); pause.focus();
  }
  function toggle() { if (panel) close(); else open(); }
  function initialize() {
    const setup = () => {
      root.document.getElementById('resource-profiler-toggle')?.addEventListener('click', toggle);
      root.registerCommand?.('view.resourceProfiler', 'View: Toggle Resource Profiler', toggle, null,
        { category: 'View', keywords: ['performance', 'CPU', 'memory', 'trace', 'resources'] });
      root.document.addEventListener('visibilitychange', () => { startSampling(); if (root.document.hidden) status('Suspended while hidden'); });
      root.addEventListener('pagehide', stopSampling);
    };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', setup, { once: true });
    else setup();
  }
  return { initialize, open, close, toggle, getReport, counters };
});

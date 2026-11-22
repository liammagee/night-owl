const path = require('path');
const { performance } = require('perf_hooks');
const v8 = require('v8');
const os = require('os');
const { app, contentTracing, ipcMain } = require('electron');
const { createDebugLogger } = require('./logging');

const debug = createDebugLogger('PerformanceHandlers');

const DEFAULT_TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'v8',
  'blink',
  'cc',
  'gpu'
];

let tracingActive = false;
let traceOperation = null;
let traceTimer = null;
let lastTrace = null;

const finite = value => Number.isFinite(value) && value >= 0 ? value : null;

// Demand-driven: no background timer or process inspection while the panel is closed.
function createResourceSampler(electronApp = app) {
  let previous = new Set();
  let lastTime = null;
  let lastLoop = performance.eventLoopUtilization();
  return function sample() {
    const now = performance.now();
    const metrics = electronApp.getAppMetrics?.();
    const processes = (metrics || []).map(item => {
      const key = `${item.pid}:${item.creationTime}`;
      return {
        pid: item.pid, type: item.type, name: item.name || item.type,
        creationTime: item.creationTime,
        cpuPercent: previous.has(key) ? finite(item.cpu?.percentCPUUsage) : null,
        wakeupsPerSecond: process.platform === 'win32' || !previous.has(key)
          ? null : finite(item.cpu?.idleWakeupsPerSecond),
        workingSetBytes: finite(item.memory?.workingSetSize) === null ? null : item.memory.workingSetSize * 1024,
        peakWorkingSetBytes: finite(item.memory?.peakWorkingSetSize) === null ? null : item.memory.peakWorkingSetSize * 1024
      };
    });
    const loop = performance.eventLoopUtilization();
    const delta = performance.eventLoopUtilization(loop, lastLoop);
    const result = {
      sampledAt: new Date().toISOString(), intervalMs: lastTime === null ? null : now - lastTime,
      available: Array.isArray(metrics), processes,
      logicalCPUs: os.cpus().length,
      main: { memory: process.memoryUsage(), heap: v8.getHeapStatistics(), eventLoopUtilization: lastTime === null ? null : delta.utilization },
      trace: { active: tracingActive, busy: Boolean(traceOperation), last: lastTrace }
    };
    previous = new Set((metrics || []).map(item => `${item.pid}:${item.creationTime}`));
    lastTime = now;
    lastLoop = loop;
    return result;
  };
}

async function collectGpuDiagnostics(electronApp = app) {
  const featureStatus = typeof electronApp.getGPUFeatureStatus === 'function'
    ? electronApp.getGPUFeatureStatus()
    : {};
  const gpuInfo = typeof electronApp.getGPUInfo === 'function'
    ? await electronApp.getGPUInfo('basic')
    : null;

  return {
    success: true,
    featureStatus,
    gpuInfo,
    hardwareAccelerationDisabled: Boolean(
      electronApp.commandLine?.hasSwitch?.('disable-gpu') ||
      electronApp.commandLine?.hasSwitch?.('disable-software-rasterizer')
    )
  };
}

function collectResourceDiagnostics(getResourceDiagnostics) {
  try {
    return {
      success: true,
      ...(typeof getResourceDiagnostics === 'function' ? getResourceDiagnostics() : {})
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function collectAppDiagnostics(electronApp = app) {
  return {
    version: typeof electronApp.getVersion === 'function' ? electronApp.getVersion() : 'unknown',
    isPackaged: Boolean(electronApp.isPackaged),
    packageMode: electronApp.isPackaged ? 'asar' : 'source',
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron || 'unknown',
    chromeVersion: process.versions.chrome || 'unknown',
    nodeVersion: process.versions.node || 'unknown'
  };
}

function getTracePath(electronApp = app) {
  const userDataPath = electronApp.getPath ? electronApp.getPath('userData') : process.cwd();
  return path.join(userDataPath, `nightowl-performance-${Date.now()}.pftrace`);
}

async function startPerformanceTrace(options = {}) {
  if (!contentTracing || typeof contentTracing.startRecording !== 'function') {
    return { success: false, error: 'Electron contentTracing is not available' };
  }

  if (traceOperation) return { success: false, error: 'A trace operation is in progress' };
  if (tracingActive) {
    return { success: true, alreadyRunning: true };
  }

  const includedCategories = Array.isArray(options.includedCategories) && options.includedCategories.length
    ? options.includedCategories
    : DEFAULT_TRACE_CATEGORIES;

  traceOperation = contentTracing.startRecording({
    included_categories: includedCategories,
    excluded_categories: options.excludedCategories || []
  });
  try { await traceOperation; } finally { traceOperation = null; }
  tracingActive = true;
  lastTrace = null;
  // Keep capture bounded even if the panel closes or its renderer disappears.
  traceTimer = setTimeout(() => {
    stopPerformanceTrace().catch(error => { lastTrace = { success: false, error: error.message }; });
  }, 30000);
  traceTimer.unref?.();
  return { success: true, includedCategories };
}

async function stopPerformanceTrace(electronApp = app) {
  if (!contentTracing || typeof contentTracing.stopRecording !== 'function') {
    return { success: false, error: 'Electron contentTracing is not available' };
  }

  if (traceOperation) return { success: false, error: 'A trace operation is in progress' };
  if (!tracingActive) {
    return { success: false, error: 'No performance trace is currently running' };
  }

  const tracePath = getTracePath(electronApp);
  clearTimeout(traceTimer);
  traceTimer = null;
  traceOperation = contentTracing.stopRecording(tracePath);
  try {
    const savedPath = await traceOperation;
    tracingActive = false;
    lastTrace = { success: true, path: savedPath || tracePath };
    return lastTrace;
  } finally { traceOperation = null; }
}

function register(dependencies = {}) {
  const electronApp = dependencies.app || app;
  const sampleResources = createResourceSampler(electronApp);

  ipcMain.handle('performance:get-gpu-diagnostics', async () => (
    collectGpuDiagnostics(electronApp)
  ));

  ipcMain.handle('performance:get-resource-diagnostics', async () => (
    {
      ...collectResourceDiagnostics(dependencies.getResourceDiagnostics),
      app: collectAppDiagnostics(electronApp),
      resources: sampleResources()
    }
  ));

  ipcMain.handle('performance:start-trace', async (_event, options = {}) => (
    startPerformanceTrace(options)
  ));

  ipcMain.handle('performance:stop-trace', async () => (
    stopPerformanceTrace(electronApp)
  ));

  debug('Registered performance handlers');
}

module.exports = {
  createResourceSampler,
  collectAppDiagnostics,
  collectGpuDiagnostics,
  collectResourceDiagnostics,
  register,
  startPerformanceTrace,
  stopPerformanceTrace
};

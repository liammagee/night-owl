const path = require('path');
const { app, contentTracing, ipcMain } = require('electron');

const DEFAULT_TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'v8',
  'blink',
  'cc',
  'gpu'
];

let tracingActive = false;

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

function getTracePath(electronApp = app) {
  const userDataPath = electronApp.getPath ? electronApp.getPath('userData') : process.cwd();
  return path.join(userDataPath, `nightowl-performance-${Date.now()}.json`);
}

async function startPerformanceTrace(options = {}) {
  if (!contentTracing || typeof contentTracing.startRecording !== 'function') {
    return { success: false, error: 'Electron contentTracing is not available' };
  }

  if (tracingActive) {
    return { success: true, alreadyRunning: true };
  }

  const includedCategories = Array.isArray(options.includedCategories) && options.includedCategories.length
    ? options.includedCategories
    : DEFAULT_TRACE_CATEGORIES;

  await contentTracing.startRecording({
    included_categories: includedCategories,
    excluded_categories: options.excludedCategories || []
  });

  tracingActive = true;
  return { success: true, includedCategories };
}

async function stopPerformanceTrace(electronApp = app) {
  if (!contentTracing || typeof contentTracing.stopRecording !== 'function') {
    return { success: false, error: 'Electron contentTracing is not available' };
  }

  if (!tracingActive) {
    return { success: false, error: 'No performance trace is currently running' };
  }

  const tracePath = getTracePath(electronApp);
  const savedPath = await contentTracing.stopRecording(tracePath);
  tracingActive = false;
  return { success: true, path: savedPath || tracePath };
}

function register(dependencies = {}) {
  const electronApp = dependencies.app || app;

  ipcMain.handle('performance:get-gpu-diagnostics', async () => (
    collectGpuDiagnostics(electronApp)
  ));

  ipcMain.handle('performance:start-trace', async (_event, options = {}) => (
    startPerformanceTrace(options)
  ));

  ipcMain.handle('performance:stop-trace', async () => (
    stopPerformanceTrace(electronApp)
  ));

  console.log('[PerformanceHandlers] Registered performance handlers');
}

module.exports = {
  collectGpuDiagnostics,
  register,
  startPerformanceTrace,
  stopPerformanceTrace
};

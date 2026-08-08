'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { test: base, expect, _electron: electron } = require('@playwright/test');

const APP_PATH = path.resolve(__dirname, '../../..');
const BOOTSTRAP_PATH = path.join(__dirname, 'electron-bootstrap');

function resolveNodeModulesPath() {
  if (process.env.NIGHTOWL_NODE_MODULES) {
    return path.resolve(process.env.NIGHTOWL_NODE_MODULES);
  }
  return path.dirname(path.dirname(require.resolve('electron/package.json')));
}

async function closeElectronApp(app, timeoutMs = 10 * 1000) {
  let timeoutId;
  try {
    await Promise.race([
      app.close(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Electron close timed out')), timeoutMs);
      })
    ]);
  } catch (_error) {
    app.process()?.kill('SIGKILL');
  } finally {
    clearTimeout(timeoutId);
  }
}

const test = base.extend({
  electronApp: [async ({}, use) => {
    if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
      throw new Error(
        'Required Electron E2E smoke needs a Linux display. Run it with xvfb-run; the suite will not silently skip.'
      );
    }

    const profilePath = await fs.mkdtemp(path.join(os.tmpdir(), 'nightowl-e2e-profile-'));
    const { ELECTRON_RUN_AS_NODE, NODE_OPTIONS, ...cleanEnv } = process.env;
    const app = await electron.launch({
      executablePath: require('electron'),
      args: [BOOTSTRAP_PATH],
      env: {
        ...cleanEnv,
        NODE_ENV: 'test',
        NIGHTOWL_DISABLE_SINGLE_INSTANCE: '1',
        NIGHTOWL_E2E_APP_PATH: APP_PATH,
        NIGHTOWL_NODE_MODULES: resolveNodeModulesPath(),
        NIGHTOWL_WORKSPACE_USER_DATA_DIR: profilePath
      },
      timeout: 30 * 1000
    });

    try {
      await use(app);
    } finally {
      await closeElectronApp(app);
      await fs.rm(profilePath, { recursive: true, force: true });
    }
  }, { scope: 'worker' }],

  appPage: [async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => (
      Boolean(window.editor?.getValue) &&
      typeof window.openFileInEditor === 'function' &&
      typeof window.updatePreviewAndStructure === 'function' &&
      typeof window.switchToMode === 'function'
    ), undefined, { timeout: 30 * 1000 });

    await page.evaluate(() => {
      window.appSettings = {
        ...(window.appSettings || {}),
        workingDirectory: '/virtual-workspace'
      };

      if (!window.electronAPI?.invoke || window.__nightOwlE2EIPCInstalled) return;
      const originalInvoke = window.electronAPI.invoke.bind(window.electronAPI);
      window.electronAPI.invoke = async (channel, payload) => {
        if (channel === 'get-working-directory') return '/virtual-workspace';
        if (channel === 'get-settings') return window.appSettings;
        if (channel === 'set-current-file') return { success: true };
        if (channel === 'save-file' || channel === 'perform-save-with-path') {
          return { success: true, filePath: payload?.filePath || window.currentFilePath };
        }
        return originalInvoke(channel, payload);
      };
      window.__nightOwlE2EIPCInstalled = true;
    });

    await use(page);
  }, { scope: 'worker' }]
});

module.exports = { test, expect };

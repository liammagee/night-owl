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

async function launchIsolatedElectronApp(options = {}) {
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    throw new Error(
      'Electron E2E needs a Linux display. Run it with xvfb-run; the suite will not silently skip.'
    );
  }

  const profilePath = await fs.mkdtemp(path.join(
    os.tmpdir(),
    options.profilePrefix || 'nightowl-e2e-profile-'
  ));
  const { ELECTRON_RUN_AS_NODE, NODE_OPTIONS, ...cleanEnv } = process.env;
  let app;
  try {
    app = await electron.launch({
      executablePath: require('electron'),
      args: [BOOTSTRAP_PATH],
      env: {
        ...cleanEnv,
        NODE_ENV: 'test',
        NIGHTOWL_DISABLE_SINGLE_INSTANCE: '1',
        NIGHTOWL_E2E_APP_PATH: APP_PATH,
        NIGHTOWL_NODE_MODULES: resolveNodeModulesPath(),
        NIGHTOWL_WORKSPACE_USER_DATA_DIR: profilePath,
        ...(options.env || {})
      },
      timeout: options.timeoutMs || 30 * 1000
    });
  } catch (error) {
    await fs.rm(profilePath, { recursive: true, force: true });
    throw error;
  }

  return {
    app,
    profilePath,
    async close() {
      await closeElectronApp(app, options.closeTimeoutMs);
      await fs.rm(profilePath, { recursive: true, force: true });
    }
  };
}

const test = base.extend({
  electronApp: [async ({}, use) => {
    const launched = await launchIsolatedElectronApp();

    try {
      await use(launched.app);
    } finally {
      await launched.close();
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

      window.__nightOwlE2EIPCInstalled = Boolean(window.electronAPI?.files?.openFilePath);
    });

    await use(page);
  }, { scope: 'worker' }]
});

module.exports = {
  APP_PATH,
  closeElectronApp,
  launchIsolatedElectronApp,
  test,
  expect
};

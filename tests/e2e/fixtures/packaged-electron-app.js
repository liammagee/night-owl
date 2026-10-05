'use strict';

const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');
const { test: base, expect, _electron: electron } = require('@playwright/test');

function resolvePackagedExecutable(appPath) {
  const resolved = path.resolve(appPath);
  if (process.platform === 'darwin' && resolved.endsWith('.app')) {
    return path.join(resolved, 'Contents', 'MacOS', 'NightOwl');
  }
  return resolved;
}

async function closeElectronApp(app, timeoutMs = 10 * 1000) {
  let timeoutId;
  try {
    await Promise.race([
      app.close(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Packaged Electron close timed out')), timeoutMs);
      })
    ]);
  } catch (_error) {
    app.process()?.kill('SIGKILL');
  } finally {
    clearTimeout(timeoutId);
  }
}

const test = base.extend({
  packagedProfile: [async ({}, use) => {
    const profilePath = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'nightowl-packaged-profile-'));
    try {
      await use(profilePath);
    } finally {
      await fsPromises.rm(profilePath, { recursive: true, force: true });
    }
  }, { scope: 'worker' }],

  electronApp: [async ({ packagedProfile }, use) => {
    const configuredAppPath = process.env.NIGHTOWL_PACKAGED_APP;
    if (!configuredAppPath) {
      throw new Error('NIGHTOWL_PACKAGED_APP must point to a packaged NightOwl app or executable');
    }
    const executablePath = resolvePackagedExecutable(configuredAppPath);
    if (!fs.existsSync(executablePath)) {
      throw new Error(`Packaged NightOwl executable not found: ${executablePath}`);
    }

    const {
      ELECTRON_RUN_AS_NODE,
      NODE_OPTIONS,
      ANTHROPIC_API_KEY,
      CLAUDE_API_KEY,
      GEMINI_API_KEY,
      GOOGLE_API_KEY,
      GROQ_API_KEY,
      OPENAI_API_KEY,
      OPENROUTER_API_KEY,
      ...cleanEnv
    } = process.env;
    const app = await electron.launch({
      executablePath,
      cwd: packagedProfile,
      env: {
        ...cleanEnv,
        NODE_ENV: 'test',
        NIGHTOWL_DISABLE_SINGLE_INSTANCE: '1',
        NIGHTOWL_DEBUG_LOGS: 'Main,TutorBridge',
        NIGHTOWL_WORKSPACE_USER_DATA_DIR: packagedProfile
      },
      timeout: 30 * 1000
    });

    try {
      await use(app);
    } finally {
      await closeElectronApp(app);
    }
  }, { scope: 'worker' }],

  appPage: [async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => Boolean(window.electronAPI?.files?.readFile), undefined, {
      timeout: 30 * 1000
    });
    await use(page);
  }, { scope: 'worker' }]
});

module.exports = { test, expect, resolvePackagedExecutable };

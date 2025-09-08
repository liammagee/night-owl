const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  // Point directly to the E2E test directory. This is the most crucial change.
  testDir: './tests/e2e',
  timeout: 60 * 1000, // Increased timeout for potentially slow Electron startup
  expect: {
    timeout: 10000 // Increased expect timeout
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Electron tests should run serially.
  workers: 1,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  // No need for a separate 'projects' configuration for a single Electron setup.
  // The testDir and testMatch at the top level are sufficient.
  testMatch: /.*.(spec|e2e)\.js/,
});
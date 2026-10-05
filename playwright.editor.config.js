const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: [
    'editor-stability.e2e.js',
    'session-restore.e2e.js',
    'presentation-templates.e2e.js'
  ],
  timeout: 90 * 1000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'line',
  outputDir: 'test-results/editor-regressions',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' }
});

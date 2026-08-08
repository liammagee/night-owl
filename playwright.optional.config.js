const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: [
    'accessibility.e2e.js',
    'editor-theme-inheritance.e2e.js',
    'performance.e2e.js',
    'theme-consistency.spec.js'
  ],
  timeout: 90 * 1000,
  expect: {
    timeout: 15 * 1000
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'line',
  outputDir: 'test-results/optional-electron',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
});

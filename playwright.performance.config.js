const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: 'performance.e2e.js',
  timeout: 6 * 60 * 1000,
  expect: {
    timeout: 30 * 1000
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'line',
  outputDir: 'test-results/performance/playwright',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
});

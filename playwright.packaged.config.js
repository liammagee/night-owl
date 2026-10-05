const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e/packaged',
  testMatch: '**/*.spec.js',
  timeout: 60 * 1000,
  expect: {
    timeout: 20 * 1000
  },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ['line'],
    ['./tests/e2e/reporters/required-smoke-reporter.js']
  ],
  outputDir: 'test-results/packaged-electron',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [{ name: 'electron-packaged' }]
});

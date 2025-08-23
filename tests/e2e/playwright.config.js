// playwright.config.js
module.exports = {
  // Test directory
  testDir: './tests/e2e',
  
  // Test match pattern
  testMatch: '**/*.e2e.js',
  
  // Timeout for each test
  timeout: 30000,
  
  // Number of workers
  workers: 1, // Electron apps should run sequentially
  
  // Reporter
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  
  // Global setup
  use: {
    // Electron specific settings
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  
  // Projects for different test scenarios
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.e2e.js'
    }
  ]
};
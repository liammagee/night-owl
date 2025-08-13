module.exports = {
  testTimeout: 30000,
  projects: [
    {
      displayName: 'Main Process',
      testMatch: ['<rootDir>/tests/unit/main/**/*.test.js'],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup/main.setup.js']
    },
    {
      displayName: 'Renderer Process',
      testMatch: ['<rootDir>/tests/unit/renderer/**/*.test.js'],
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/tests/setup/renderer.setup.js']
    },
    {
      displayName: 'Integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup/integration.setup.js']
    }
  ],
  collectCoverageFrom: [
    'main.js',
    'orchestrator/**/*.js',
    'services/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html']
};
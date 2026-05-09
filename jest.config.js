const ignoredPaths = [
  '<rootDir>/.claude/',
  '<rootDir>/playwright-report/',
  '<rootDir>/test-results/'
];

module.exports = {
  testTimeout: 30000,
  modulePathIgnorePatterns: ignoredPaths,
  testPathIgnorePatterns: ignoredPaths,
  watchPathIgnorePatterns: ignoredPaths,
  projects: [
    {
      displayName: 'Main Process',
      testMatch: ['<rootDir>/tests/unit/main/**/*.test.js'],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup/main.setup.js'],
      modulePaths: ['<rootDir>/tests/__mocks__'],
      modulePathIgnorePatterns: ignoredPaths,
      testPathIgnorePatterns: ignoredPaths,
      watchPathIgnorePatterns: ignoredPaths
    },
    {
      displayName: 'Renderer Process',
      testMatch: ['<rootDir>/tests/unit/renderer/**/*.test.js'],
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/tests/setup/renderer.setup.js'],
      modulePathIgnorePatterns: ignoredPaths,
      testPathIgnorePatterns: ignoredPaths,
      watchPathIgnorePatterns: ignoredPaths
    },
    {
      displayName: 'Integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup/integration.setup.js'],
      modulePathIgnorePatterns: ignoredPaths,
      testPathIgnorePatterns: ignoredPaths,
      watchPathIgnorePatterns: ignoredPaths
    },
    {
      displayName: 'Behavioral',
      testMatch: ['<rootDir>/tests/behavioral/**/*.test.js'],
      testEnvironment: 'jsdom',
      modulePathIgnorePatterns: ignoredPaths,
      testPathIgnorePatterns: ignoredPaths,
      watchPathIgnorePatterns: ignoredPaths
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

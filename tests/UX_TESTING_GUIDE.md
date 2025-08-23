# UX Testing Guide

## Overview

This guide covers the automated browser-based UX testing setup for the Hegel Pedagogy AI application. We use multiple testing frameworks to ensure comprehensive coverage of functionality, accessibility, performance, and visual consistency.

## Testing Stack

### Primary Frameworks

1. **Playwright** - E2E testing for Electron apps
2. **Jest** - Unit and integration testing
3. **axe-core** - Accessibility testing
4. **Visual Regression** - Screenshot comparison

## Test Categories

### 1. Unit Tests (`tests/unit/`)
- **Purpose**: Test individual components and functions
- **Framework**: Jest + jsdom
- **Coverage**: 11 test suites, 174 tests
- **Run**: `npm run test:unit`

### 2. Integration Tests (`tests/integration/`)
- **Purpose**: Test component interactions and workflows
- **Framework**: Jest
- **Coverage**: File operations, save workflows
- **Run**: `npm run test:integration`

### 3. E2E Workflow Tests (`tests/e2e/app-workflow.e2e.js`)
- **Purpose**: Test complete user workflows
- **Coverage**:
  - App launch and initialization
  - File tree navigation
  - Editor operations
  - AI chat interactions
  - Presentation mode
  - Settings management
  - Search functionality
- **Run**: `npx playwright test app-workflow.e2e.js`

### 4. Accessibility Tests (`tests/e2e/accessibility.e2e.js`)
- **Purpose**: Ensure WCAG compliance
- **Coverage**:
  - ARIA landmarks
  - Keyboard navigation
  - Color contrast
  - Screen reader support
  - Focus indicators
  - Form labels
  - Heading hierarchy
- **Run**: `npx playwright test accessibility.e2e.js`

### 5. Performance Tests (`tests/e2e/performance.e2e.js`)
- **Purpose**: Monitor app performance
- **Metrics**:
  - Load time (< 5 seconds)
  - File tree render (< 1 second)
  - Large file handling (< 2 seconds)
  - Memory usage (< 50MB increase)
  - Frame rate (> 50 fps)
  - Network optimization
- **Run**: `npx playwright test performance.e2e.js`

### 6. Visual Regression Tests (`tests/e2e/visual-regression.e2e.js`)
- **Purpose**: Detect unintended visual changes
- **Coverage**:
  - Main window layout
  - Theme switching
  - Component appearance
  - Responsive layouts
  - Error states
  - Loading states
- **Run**: `npx playwright test visual-regression.e2e.js`

## Installation

### Prerequisites
```bash
# Install required dependencies
npm install --save-dev @playwright/test playwright axe-playwright

# Install Playwright browsers
npx playwright install
```

### Quick Setup
```bash
# Run the automated setup and all tests
node tests/e2e/run-all-ux-tests.js
```

## Running Tests

### Run All Tests
```bash
# Run complete test suite
npm run test:all

# Or use the comprehensive runner
node tests/e2e/run-all-ux-tests.js
```

### Run Specific Test Categories
```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e

# Specific E2E test file
npx playwright test performance.e2e.js
```

### Run with Options
```bash
# Run tests in headed mode (see browser)
npx playwright test --headed

# Run tests in debug mode
npx playwright test --debug

# Update visual snapshots
npx playwright test visual-regression.e2e.js --update-snapshots

# Run specific test
npx playwright test -g "app launches"
```

## Configuration

### Playwright Configuration (`tests/e2e/playwright.config.js`)
```javascript
module.exports = {
  testDir: './tests/e2e',
  timeout: 30000,
  workers: 1,
  use: {
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
};
```

### Test Data Attributes
Add data-testid attributes to elements for reliable test selection:
```html
<button data-testid="save-button">Save</button>
<div data-testid="file-tree" id="file-tree-view">...</div>
```

## Writing New Tests

### E2E Test Template
```javascript
const { test, expect, _electron: electron } = require('@playwright/test');

test.describe('Feature Name', () => {
  let app, window;

  test.beforeEach(async () => {
    app = await electron.launch({ args: ['.'] });
    window = await app.firstWindow();
  });

  test.afterEach(async () => {
    await app.close();
  });

  test('should do something', async () => {
    // Your test here
    await window.click('button[data-testid="my-button"]');
    await expect(window.locator('#result')).toBeVisible();
  });
});
```

### Accessibility Test Template
```javascript
test('component is accessible', async () => {
  await injectAxe(window);
  await checkA11y(window, '#my-component', {
    detailedReport: true
  });
});
```

### Performance Test Template
```javascript
test('operation completes quickly', async () => {
  const startTime = Date.now();
  await window.click('#slow-operation');
  await window.waitForSelector('#complete');
  const duration = Date.now() - startTime;
  expect(duration).toBeLessThan(1000);
});
```

## Test Reports

### View Results

1. **Console Output**: Immediate feedback in terminal
2. **HTML Report**: `npx playwright show-report`
3. **JSON Report**: `test-reports/ux-test-report-*.json`
4. **Screenshots**: `test-results/*/screenshots/`
5. **Videos**: `test-results/*/videos/`

### Coverage Report
```bash
# Generate coverage report
npm run test -- --coverage

# View HTML coverage
open coverage/lcov-report/index.html
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: UX Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npx playwright install
      - run: xvfb-run -a npm run test:e2e
      - uses: actions/upload-artifact@v2
        if: always()
        with:
          name: test-results
          path: |
            test-results/
            playwright-report/
```

## Best Practices

### 1. Test Organization
- Group related tests in describe blocks
- Use clear, descriptive test names
- Keep tests independent and atomic
- Clean up after each test

### 2. Selectors
- Prefer data-testid attributes
- Avoid brittle CSS selectors
- Use accessible role selectors when appropriate
- Create helper functions for common selections

### 3. Assertions
- Use specific assertions (toBeVisible vs toBeTruthy)
- Wait for elements before asserting
- Test both positive and negative cases
- Include meaningful error messages

### 4. Performance
- Run tests in parallel when possible
- Use test.skip() for flaky tests
- Minimize waits and timeouts
- Mock external dependencies

### 5. Maintenance
- Update visual snapshots regularly
- Review failed tests immediately
- Document complex test scenarios
- Keep tests in sync with features

## Troubleshooting

### Common Issues

1. **Tests timing out**
   - Increase timeout in playwright.config.js
   - Check for missing await statements
   - Verify selectors are correct

2. **Visual tests failing**
   - Update snapshots: `--update-snapshots`
   - Check for OS-specific rendering differences
   - Ensure consistent viewport size

3. **Electron not launching**
   - Check electron path in package.json
   - Verify main.js path is correct
   - Check for port conflicts

4. **Accessibility violations**
   - Review axe-core documentation
   - Some violations may be false positives
   - Configure rules as needed

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Jest Documentation](https://jestjs.io)
- [axe-core Rules](https://dequeuniversity.com/rules/axe/)
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Electron Testing Guide](https://www.electronjs.org/docs/latest/tutorial/testing)

## Next Steps

1. **Expand test coverage** to remaining UI components
2. **Add API testing** for backend endpoints
3. **Implement load testing** for concurrent users
4. **Set up continuous monitoring** in production
5. **Create test data fixtures** for consistent testing
6. **Add mutation testing** for test quality
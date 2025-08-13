# Test Suite for Hegel Pedagogy AI

This directory contains a comprehensive test suite for the Hegel Pedagogy AI Electron application, designed to prevent regressions and ensure reliable functionality.

## Test Architecture

The testing strategy follows Electron best practices by separating concerns across different test types:

### 1. Unit Tests (`/unit/`)
- **Main Process Tests** (`/unit/main/`): Test Node.js backend functionality, file operations, and IPC handlers
- **Renderer Process Tests** (`/unit/renderer/`): Test frontend JavaScript, UI components, and browser-side logic

### 2. Integration Tests (`/integration/`)
- Test IPC communication between main and renderer processes
- Test file system operations with real file I/O
- Test workflow integrations (e.g., save → read → display cycles)

### 3. End-to-End Tests (`/e2e/`)
- Test complete user workflows using Playwright
- Test critical regression scenarios
- Test UI interactions and application behavior

## Technology Stack

- **Jest**: Unit and integration testing framework
- **Playwright**: End-to-end testing framework (replaces deprecated Spectron)
- **jsdom**: DOM environment for renderer process tests
- **Node environment**: For main process tests

## Getting Started

### Prerequisites
```bash
npm install
```

### Running Tests

```bash
# Run all tests
npm run test:all

# Run only unit tests
npm run test:unit

# Run only integration tests  
npm run test:integration

# Run only E2E tests
npm run test:e2e

# Run tests in watch mode
npm run test:watch

# Run specific test file
npx jest tests/unit/renderer/internal-links.test.js

# Run E2E tests with headed browser
npx playwright test --headed
```

### Test Coverage
```bash
npm test -- --coverage
```

## Test Structure

### Unit Tests

#### Main Process Tests (`/unit/main/`)
Focus on testing:
- File operations (read, write, directory listing)
- IPC handler implementations
- Electron main process APIs
- Error handling

Example:
```javascript
// tests/unit/main/file-operations.test.js
describe('File Operations', () => {
  test('should read markdown files successfully', async () => {
    // Test implementation
  });
});
```

#### Renderer Process Tests (`/unit/renderer/`)
Focus on testing:
- JavaScript functions and modules
- DOM manipulation
- Markdown processing
- Internal links functionality
- BibTeX parsing

Example:
```javascript
// tests/unit/renderer/internal-links.test.js
describe('Internal Links Processing', () => {
  test('should identify simple internal links', () => {
    // Test implementation
  });
});
```

### Integration Tests (`/integration/`)
Focus on testing:
- Complete save/load workflows
- IPC communication patterns
- File system integration
- Cross-process data flow

Example:
```javascript
// tests/integration/file-save-workflow.test.js
describe('File Save Workflow Integration', () => {
  test('should handle file save requests correctly', async () => {
    // Test implementation
  });
});
```

### E2E Tests (`/e2e/`)
Focus on testing:
- User interactions and workflows
- UI state changes
- Application startup and shutdown
- Critical regression scenarios

Example:
```javascript
// tests/e2e/basic-functionality.spec.js
test('should load the application successfully', async ({ page }) => {
  await expect(page.locator('#editor')).toBeVisible();
});
```

## Critical Regression Tests

The test suite includes specific tests for previously identified critical bugs:

### 1. Internal Links Save Bug
**Issue**: Saving files with internal links would overwrite the wrong file.
**Test**: `tests/e2e/basic-functionality.spec.js` - "should save file content without corrupting internal links"

### 2. Monaco Editor Initialization
**Issue**: Editor not loading due to function name conflicts.
**Test**: Multiple unit tests for editor initialization and content setting.

### 3. File Path Corruption
**Issue**: `currentFilePath` changed during internal link previews.
**Test**: "should not change currentFilePath when previewing internal links"

## Test Configuration

### Jest Configuration (`jest.config.js`)
- Separates main and renderer process test environments
- Configures coverage reporting
- Sets up test timeouts and patterns

### Playwright Configuration (`playwright.config.js`)
- Configures Electron testing
- Sets up screenshot and trace capture
- Configures test timeouts and retries

## Test Utilities

### Test Helpers (`/utils/test-helpers.js`)
Provides common utilities:
- Mock Electron APIs
- Mock Monaco Editor instances
- Mock file tree structures
- Wait conditions and timing helpers
- Sample content generators

### Test Fixtures (`/fixtures/`)
Contains sample data:
- `sample-content.md`: Markdown with various features
- `sample-bibliography.bib`: BibTeX entries for testing
- Other test data files

### Setup Files (`/setup/`)
Environment-specific setup:
- `main.setup.js`: Mocks for main process tests
- `renderer.setup.js`: Mocks for renderer process tests  
- `integration.setup.js`: Helpers for integration tests

## Writing New Tests

### Unit Test Guidelines

1. **Isolate functionality**: Test individual functions or modules
2. **Mock dependencies**: Use Jest mocks for external dependencies
3. **Test edge cases**: Include error conditions and boundary cases
4. **Clear assertions**: Use descriptive expect statements

```javascript
describe('Feature Name', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should handle normal case', () => {
    // Arrange
    const input = 'test input';
    
    // Act
    const result = functionUnderTest(input);
    
    // Assert
    expect(result).toBe('expected output');
  });

  test('should handle error case', () => {
    expect(() => functionUnderTest(null)).toThrow('Expected error');
  });
});
```

### Integration Test Guidelines

1. **Test realistic workflows**: Use actual file paths and operations
2. **Clean up resources**: Remove test files after tests
3. **Test error scenarios**: Include permission errors, missing files, etc.
4. **Verify side effects**: Check that operations have expected results

### E2E Test Guidelines

1. **Test user workflows**: Focus on what users actually do
2. **Wait for conditions**: Use proper waiting strategies
3. **Keep tests focused**: Each test should verify one primary workflow
4. **Include regression tests**: Add tests for previously fixed bugs

## Continuous Integration

The test suite is designed to run in CI environments:

- All tests use headless mode by default
- Screenshots and traces are captured on failures
- Tests have appropriate timeouts for CI environments
- No external dependencies required

## Debugging Tests

### Failed Unit Tests
```bash
# Run specific test with verbose output
npx jest tests/unit/renderer/internal-links.test.js --verbose

# Run with debugging
node --inspect-brk node_modules/.bin/jest tests/unit/specific-test.js
```

### Failed E2E Tests
```bash
# Run with headed browser
npx playwright test --headed

# Run with debugging
npx playwright test --debug

# View test reports
npx playwright show-report
```

### Common Issues

1. **Monaco Editor not loading**: Check that global mocks are properly set up
2. **File operations failing**: Ensure test fixtures exist and permissions are correct
3. **E2E timeouts**: Increase timeouts for slower CI environments
4. **Mock conflicts**: Clear mocks between tests using `jest.clearAllMocks()`

## Test Maintenance

### Regular Tasks
- Update test dependencies when Electron is upgraded
- Add regression tests for new bugs found
- Review and update mock implementations
- Monitor test performance and optimize slow tests

### When Adding New Features
1. Add unit tests for new functions
2. Add integration tests for new workflows
3. Add E2E tests for new user-facing features
4. Update test fixtures if needed

## Performance Considerations

- Unit tests should complete in < 1 second
- Integration tests should complete in < 10 seconds  
- E2E tests should complete in < 30 seconds
- Full test suite should complete in < 5 minutes

This comprehensive testing approach ensures the reliability and stability of the Hegel Pedagogy AI application while preventing regressions in critical functionality.
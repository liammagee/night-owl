# Test Setup Quick Start

## Installation and First Test

1. **Install dependencies:**
```bash
npm install
```

2. **Run basic tests first to verify setup:**
```bash
npm run test:basic
```

3. **If basic tests pass, run all unit tests:**
```bash
npm run test:unit
```

## Troubleshooting Common Issues

### Issue: `Cannot use import statement outside a module`
**Solution**: The setup has been fixed to use CommonJS syntax. This should no longer occur.

### Issue: `Module not found` errors
**Solution**: Run `npm install` to ensure all testing dependencies are installed:
- jest
- jest-environment-jsdom
- jest-environment-node
- @babel/core
- babel-jest
- identity-obj-proxy

### Issue: `electronAPI is not defined`
**Solution**: This is expected in unit tests. The mock is set up in `tests/setup/renderer.setup.js`.

### Issue: Tests timing out
**Solution**: Integration tests have a 30-second timeout. For longer operations, increase the timeout in `jest.config.js`.

## Test Structure Verification

After running `npm run test:basic`, you should see:
- ✅ Main Process tests passing (Node.js environment)
- ✅ Renderer Process tests passing (JSDOM environment)
- ✅ Electron API mocks working
- ✅ Monaco editor mocks working

## Next Steps

Once basic tests pass:

1. **Run unit tests**: `npm run test:unit`
2. **Run integration tests**: `npm run test:integration`
3. **Install Playwright**: `npx playwright install`
4. **Run E2E tests**: `npm run test:e2e`

## Configuration Files

- `jest.config.js` - Jest configuration with separate environments
- `babel.config.js` - Babel configuration for modern JavaScript
- `playwright.config.js` - Playwright configuration for E2E tests
- `tests/setup/*.js` - Environment-specific setup files

## Debugging

If tests fail:

1. **Check console output** for specific error messages
2. **Run single test file**:
   ```bash
   npx jest tests/unit/main/basic.test.js
   ```
3. **Enable verbose output**:
   ```bash
   npx jest --verbose
   ```
4. **Check mock setup** in setup files if Electron APIs are undefined
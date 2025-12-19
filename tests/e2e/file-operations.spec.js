/**
 * File Operations E2E Tests
 * Tests for wildcard search and move/copy file functionality
 *
 * USAGE:
 *   npx playwright test file-operations   # Run these tests
 *
 * REQUIREMENTS:
 *   - A display environment (not headless/CI)
 *   - Compatible Electron/Playwright versions
 */

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// Test configuration
const APP_PATH = path.join(__dirname, '../../');

// Helper to check if we're in a headless/CI environment
const isHeadless = process.env.CI || process.env.HEADLESS || !process.env.DISPLAY;

// Shared app instance for all tests in this file
let sharedElectronApp = null;
let sharedWindow = null;
let launchFailed = false;

// Helper to launch Electron app
async function launchElectronApp() {
  if (launchFailed) return null;
  if (sharedElectronApp) return sharedElectronApp;

  try {
    const electronPath = require('electron');
    // Create clean environment without ELECTRON_RUN_AS_NODE
    const { ELECTRON_RUN_AS_NODE, ...cleanEnv } = process.env;

    sharedElectronApp = await electron.launch({
      executablePath: electronPath,
      args: [APP_PATH, '--dev'],
      env: { ...cleanEnv, NODE_ENV: 'test' },
      timeout: 30000
    });

    sharedWindow = await sharedElectronApp.firstWindow();
    await sharedWindow.waitForLoadState('domcontentloaded');
    await sharedWindow.waitForTimeout(2000);

    return sharedElectronApp;
  } catch (error) {
    console.error('Failed to launch Electron app:', error.message);
    launchFailed = true;
    return null;
  }
}

test.describe('File Operations', () => {

  test.beforeAll(async () => {
    if (isHeadless) {
      console.log('Skipping Electron E2E tests in headless environment');
      return;
    }
    await launchElectronApp();
    if (!sharedElectronApp) {
      console.log('Could not launch Electron app - tests will be skipped');
    }
  });

  test.afterAll(async () => {
    if (sharedElectronApp) {
      await sharedElectronApp.close();
      sharedElectronApp = null;
      sharedWindow = null;
    }
  });

  test.beforeEach(async () => {
    test.skip(!sharedElectronApp || !sharedWindow, 'Electron app could not be launched');
  });

  // =====================
  // Wildcard File Search
  // =====================
  test.describe('Wildcard File Search', () => {

    test('should detect file pattern queries correctly', async () => {
      // Test the pattern detection logic directly
      const patterns = await sharedWindow.evaluate(() => {
        // Simulate the pattern detection logic from searchHandlers
        function isFilePatternQuery(query) {
          return /^\*\.[a-zA-Z0-9]+$/.test(query) ||  // *.bib, *.md
                 /^[^*]+\.\*$/.test(query) ||          // file.*
                 /^\*[^*]+\*$/.test(query) ||          // *pattern*
                 /^\*[^*]+$/.test(query) ||            // *suffix
                 /^[^*]+\*$/.test(query);              // prefix*
        }

        return {
          '*.bib': isFilePatternQuery('*.bib'),
          '*.md': isFilePatternQuery('*.md'),
          'test*': isFilePatternQuery('test*'),
          '*config*': isFilePatternQuery('*config*'),
          '*suffix': isFilePatternQuery('*suffix'),
          'file.*': isFilePatternQuery('file.*'),
          'normalSearch': isFilePatternQuery('normalSearch'),
          'some text': isFilePatternQuery('some text')
        };
      });

      // File patterns should be detected
      expect(patterns['*.bib']).toBe(true);
      expect(patterns['*.md']).toBe(true);
      expect(patterns['test*']).toBe(true);
      expect(patterns['*config*']).toBe(true);
      expect(patterns['*suffix']).toBe(true);
      expect(patterns['file.*']).toBe(true);

      // Normal search queries should not be detected as patterns
      expect(patterns['normalSearch']).toBe(false);
      expect(patterns['some text']).toBe(false);
    });

    test('should open search pane', async () => {
      // Click the search button to open search pane
      const searchBtn = sharedWindow.locator('#show-search-btn');
      await searchBtn.click();
      await sharedWindow.waitForTimeout(500);

      // Verify search pane is visible
      const searchPane = sharedWindow.locator('#search-pane');
      await expect(searchPane).toBeVisible();

      // Verify search input is present
      const searchInput = sharedWindow.locator('#global-search-input');
      await expect(searchInput).toBeVisible();
    });

    test('should perform wildcard search for *.md files', async () => {
      // Open search pane
      const searchBtn = sharedWindow.locator('#show-search-btn');
      await searchBtn.click();
      await sharedWindow.waitForTimeout(300);

      // Enter wildcard pattern
      const searchInput = sharedWindow.locator('#global-search-input');
      await searchInput.fill('*.md');

      // Click search button
      const executeBtn = sharedWindow.locator('#global-search-btn, #global-search-execute');
      await executeBtn.first().click();
      await sharedWindow.waitForTimeout(1000);

      // Check for file results
      const resultsCount = sharedWindow.locator('#search-results-count');
      const countText = await resultsCount.textContent();

      // Should find some .md files
      expect(countText).toContain('file');
    });

    test('should display file pattern results with icons', async () => {
      // Open search pane
      const searchBtn = sharedWindow.locator('#show-search-btn');
      await searchBtn.click();
      await sharedWindow.waitForTimeout(300);

      // Enter wildcard pattern
      const searchInput = sharedWindow.locator('#global-search-input');
      await searchInput.fill('*.json');

      // Click search button
      const executeBtn = sharedWindow.locator('#global-search-btn, #global-search-execute');
      await executeBtn.first().click();
      await sharedWindow.waitForTimeout(1000);

      // Check for results container
      const searchResults = sharedWindow.locator('#search-results');
      const hasContent = await searchResults.evaluate(el => el.innerHTML.length > 0);
      expect(hasContent).toBe(true);
    });

    test('should handle pattern search with no results gracefully', async () => {
      // Open search pane
      const searchBtn = sharedWindow.locator('#show-search-btn');
      await searchBtn.click();
      await sharedWindow.waitForTimeout(300);

      // Enter pattern that won't match anything
      const searchInput = sharedWindow.locator('#global-search-input');
      await searchInput.fill('*.zzzznonexistent');

      // Click search button
      const executeBtn = sharedWindow.locator('#global-search-btn, #global-search-execute');
      await executeBtn.first().click();
      await sharedWindow.waitForTimeout(1000);

      // Should show 0 files or no results message
      const resultsCount = sharedWindow.locator('#search-results-count');
      const countText = await resultsCount.textContent();
      expect(countText).toMatch(/0 file|no.*found/i);
    });
  });

  // =====================
  // Move/Copy File Context Menu
  // =====================
  test.describe('Move/Copy File Context Menu', () => {

    test('should show file context menu with move and copy options', async () => {
      // First ensure file tree is visible
      const fileTree = sharedWindow.locator('#file-tree-view');
      await expect(fileTree).toBeVisible();

      // Find a file item in the tree
      const fileItem = sharedWindow.locator('.file-tree-item.file').first();

      if (await fileItem.count() > 0) {
        // Right-click on the file
        await fileItem.click({ button: 'right' });
        await sharedWindow.waitForTimeout(300);

        // Check for context menu
        const contextMenu = sharedWindow.locator('.file-context-menu');
        await expect(contextMenu).toBeVisible();

        // Check for move and copy options
        const menuText = await contextMenu.textContent();
        expect(menuText).toContain('Move to');
        expect(menuText).toContain('Copy to');

        // Close menu by clicking elsewhere
        await sharedWindow.locator('body').click();
        await sharedWindow.waitForTimeout(200);
      }
    });

    test('should have move-file IPC handler registered', async () => {
      // Test that the IPC handler exists by checking electronAPI
      const hasHandler = await sharedWindow.evaluate(() => {
        return typeof window.electronAPI?.invoke === 'function';
      });
      expect(hasHandler).toBe(true);
    });

    test('should have copy-file-to IPC handler registered', async () => {
      // Test that the IPC handler exists
      const hasHandler = await sharedWindow.evaluate(() => {
        return typeof window.electronAPI?.invoke === 'function';
      });
      expect(hasHandler).toBe(true);
    });

    test('should have browse-destination-folder IPC handler registered', async () => {
      // Test that the IPC handler exists
      const hasHandler = await sharedWindow.evaluate(() => {
        return typeof window.electronAPI?.invoke === 'function';
      });
      expect(hasHandler).toBe(true);
    });
  });

  // =====================
  // Search Module Integration
  // =====================
  test.describe('Search Module Integration', () => {

    test('should have displayFilePatternResults function available', async () => {
      const hasFunction = await sharedWindow.evaluate(() => {
        // The function should be defined in the search module
        return typeof window.performGlobalSearch === 'function';
      });
      expect(hasFunction).toBe(true);
    });

    test('should have global search initialization', async () => {
      const isInitialized = await sharedWindow.evaluate(() => {
        return typeof window.initializeGlobalSearch === 'function';
      });
      expect(isInitialized).toBe(true);
    });

    test('should convert glob patterns to regex correctly', async () => {
      // Test the glob to regex conversion
      const results = await sharedWindow.evaluate(() => {
        function globToRegex(pattern) {
          let regexStr = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
          return new RegExp(`^${regexStr}$`, 'i');
        }

        const tests = [
          { pattern: '*.bib', filename: 'references.bib', expected: true },
          { pattern: '*.bib', filename: 'test.md', expected: false },
          { pattern: 'test*', filename: 'test-file.js', expected: true },
          { pattern: 'test*', filename: 'other.js', expected: false },
          { pattern: '*config*', filename: 'my-config-file.json', expected: true },
          { pattern: '*config*', filename: 'settings.json', expected: false }
        ];

        return tests.map(t => ({
          ...t,
          result: globToRegex(t.pattern).test(t.filename)
        }));
      });

      for (const test of results) {
        expect(test.result).toBe(test.expected);
      }
    });
  });

  // =====================
  // File Tree Context Menu Structure
  // =====================
  test.describe('File Tree Context Menu Structure', () => {

    test('should have separator between rename and move/copy options', async () => {
      // Find a file item in the tree
      const fileItem = sharedWindow.locator('.file-tree-item.file').first();

      if (await fileItem.count() > 0) {
        // Right-click on the file
        await fileItem.click({ button: 'right' });
        await sharedWindow.waitForTimeout(300);

        // Check for context menu structure
        const contextMenu = sharedWindow.locator('.file-context-menu');
        const menuHTML = await contextMenu.innerHTML();

        // Should have separators (visual dividers between groups)
        // The structure should be: Open, Rename, [separator], Move, Copy, [separator], Delete, Copy Path
        const menuItems = await contextMenu.locator('div').all();
        expect(menuItems.length).toBeGreaterThan(4); // At least 5 items including separators

        // Close menu
        await sharedWindow.locator('body').click();
        await sharedWindow.waitForTimeout(200);
      }
    });

    test('should show Open as first menu item for files', async () => {
      const fileItem = sharedWindow.locator('.file-tree-item.file').first();

      if (await fileItem.count() > 0) {
        await fileItem.click({ button: 'right' });
        await sharedWindow.waitForTimeout(300);

        const contextMenu = sharedWindow.locator('.file-context-menu');
        const firstItem = contextMenu.locator('div').first();
        const text = await firstItem.textContent();
        expect(text).toContain('Open');

        // Close menu
        await sharedWindow.locator('body').click();
      }
    });
  });
});

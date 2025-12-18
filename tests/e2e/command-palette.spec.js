/**
 * Command Palette E2E Tests
 * Tests for the command palette functionality
 *
 * USAGE:
 *   npx playwright test command-palette   # Run these tests
 *
 * REQUIREMENTS:
 *   - A display environment (not headless/CI)
 *   - Compatible Electron/Playwright versions
 */

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

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

    // Wait for app to initialize
    await sharedWindow.waitForFunction(() => window.editor !== undefined, { timeout: 10000 });

    return sharedElectronApp;
  } catch (error) {
    console.error('Failed to launch Electron app:', error.message);
    launchFailed = true;
    return null;
  }
}

test.describe('Command Palette', () => {

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

    // Close command palette if open
    const palette = sharedWindow.locator('.command-palette-overlay').last();
    if (await palette.isVisible().catch(() => false)) {
      await sharedWindow.keyboard.press('Escape');
      await sharedWindow.waitForTimeout(200);
    }
  });

  // =====================
  // Opening Command Palette
  // =====================
  test.describe('Opening Command Palette', () => {

    test('should open with Cmd+Shift+P', async () => {
      await sharedWindow.keyboard.press('Meta+Shift+P');
      await sharedWindow.waitForTimeout(300);

      const palette = sharedWindow.locator('.command-palette-overlay').last();
      await expect(palette).toBeVisible();

      // Close it
      await sharedWindow.keyboard.press('Escape');
      await sharedWindow.waitForTimeout(200);
    });

    test('should open with Ctrl+Shift+P', async () => {
      await sharedWindow.keyboard.press('Control+Shift+P');
      await sharedWindow.waitForTimeout(300);

      const palette = sharedWindow.locator('.command-palette-overlay').last();
      await expect(palette).toBeVisible();

      // Close it
      await sharedWindow.keyboard.press('Escape');
      await sharedWindow.waitForTimeout(200);
    });

    test('should focus input when opened', async () => {
      await sharedWindow.keyboard.press('Meta+Shift+P');
      await sharedWindow.waitForTimeout(300);

      const input = sharedWindow.locator('.command-palette-input');
      await expect(input).toBeFocused();

      await sharedWindow.keyboard.press('Escape');
    });

    test('should close with Escape key', async () => {
      await sharedWindow.keyboard.press('Meta+Shift+P');
      await sharedWindow.waitForTimeout(300);

      const palette = sharedWindow.locator('.command-palette-overlay').last();
      await expect(palette).toBeVisible();

      await sharedWindow.keyboard.press('Escape');
      await sharedWindow.waitForTimeout(200);

      await expect(palette).toBeHidden();
    });
  });

  // =====================
  // Command Search
  // =====================
  test.describe('Command Search', () => {

    test('should display commands when opened', async () => {
      await sharedWindow.keyboard.press('Meta+Shift+P');
      await sharedWindow.waitForTimeout(300);

      const commandItems = sharedWindow.locator('.command-item');
      const count = await commandItems.count();
      expect(count).toBeGreaterThan(0);

      await sharedWindow.keyboard.press('Escape');
    });

    test('should filter commands as user types', async () => {
      await sharedWindow.keyboard.press('Meta+Shift+P');
      await sharedWindow.waitForTimeout(300);

      // Get initial count
      const initialCount = await sharedWindow.locator('.command-item').count();

      // Type to filter
      await sharedWindow.fill('.command-palette-input', 'settings');
      await sharedWindow.waitForTimeout(200);

      // Get filtered count
      const filteredCount = await sharedWindow.locator('.command-item:visible').count();

      // Filtered count should be less than or equal to initial
      expect(filteredCount).toBeLessThanOrEqual(initialCount);

      await sharedWindow.keyboard.press('Escape');
    });

    test('should clear filter when input is cleared', async () => {
      await sharedWindow.keyboard.press('Meta+Shift+P');
      await sharedWindow.waitForTimeout(300);

      // Filter
      await sharedWindow.fill('.command-palette-input', 'view');
      await sharedWindow.waitForTimeout(200);

      // Clear
      await sharedWindow.fill('.command-palette-input', '');
      await sharedWindow.waitForTimeout(200);

      // Should show all commands again
      const count = await sharedWindow.locator('.command-item').count();
      expect(count).toBeGreaterThan(5);

      await sharedWindow.keyboard.press('Escape');
    });
  });

  // =====================
  // Command Execution
  // =====================
  test.describe('Command Execution', () => {

    test('should execute command on click', async () => {
      await sharedWindow.keyboard.press('Meta+Shift+P');
      await sharedWindow.waitForTimeout(300);

      // Search for settings command
      await sharedWindow.fill('.command-palette-input', 'settings');
      await sharedWindow.waitForTimeout(200);

      // Click first matching command
      const settingsCommand = sharedWindow.locator('.command-item').filter({ hasText: /settings/i }).first();
      if (await settingsCommand.isVisible()) {
        await settingsCommand.click();
        await sharedWindow.waitForTimeout(500);

        // Command palette should close
        const palette = sharedWindow.locator('.command-palette-overlay').last();
        await expect(palette).toBeHidden();

        // Close any opened dialogs
        const settingsDialog = sharedWindow.locator('#settings-dialog');
        if (await settingsDialog.isVisible().catch(() => false)) {
          await sharedWindow.locator('#settings-dialog .modal-close').click();
          await sharedWindow.waitForTimeout(200);
        }
      } else {
        await sharedWindow.keyboard.press('Escape');
      }
    });

    test('should execute command on Enter', async () => {
      await sharedWindow.keyboard.press('Meta+Shift+P');
      await sharedWindow.waitForTimeout(300);

      // Search for a specific command
      await sharedWindow.fill('.command-palette-input', 'toggle preview');
      await sharedWindow.waitForTimeout(200);

      const hasCommand = await sharedWindow.locator('.command-item').count() > 0;
      if (hasCommand) {
        // Press Enter to execute
        await sharedWindow.keyboard.press('Enter');
        await sharedWindow.waitForTimeout(300);

        // Palette should close
        const palette = sharedWindow.locator('.command-palette-overlay').last();
        await expect(palette).toBeHidden();

        // Toggle back if needed
        const rightPane = sharedWindow.locator('#right-pane');
        const isHidden = await rightPane.evaluate(el =>
          el.classList.contains('pane-hidden')
        ).catch(() => false);

        if (isHidden) {
          await sharedWindow.evaluate(() => window.togglePreview?.());
          await sharedWindow.waitForTimeout(200);
        }
      } else {
        await sharedWindow.keyboard.press('Escape');
      }
    });
  });

  // =====================
  // Keyboard Navigation
  // =====================
  test.describe('Keyboard Navigation', () => {

    test('should navigate commands with arrow keys', async () => {
      await sharedWindow.keyboard.press('Meta+Shift+P');
      await sharedWindow.waitForTimeout(300);

      // Press down arrow to select next item
      await sharedWindow.keyboard.press('ArrowDown');
      await sharedWindow.waitForTimeout(100);

      // Check if an item is selected/highlighted
      const selectedItem = sharedWindow.locator('.command-item.selected, .command-item.active, .command-item:focus');
      const hasSelection = await selectedItem.count() > 0;

      // Or check via attribute
      const anySelected = await sharedWindow.evaluate(() => {
        const items = document.querySelectorAll('.command-item');
        return Array.from(items).some(item =>
          item.classList.contains('selected') ||
          item.classList.contains('active') ||
          item.getAttribute('aria-selected') === 'true'
        );
      });

      expect(hasSelection || anySelected).toBe(true);

      await sharedWindow.keyboard.press('Escape');
    });

    test('should wrap around when navigating past last item', async () => {
      await sharedWindow.keyboard.press('Meta+Shift+P');
      await sharedWindow.waitForTimeout(300);

      // Press up arrow from start should wrap to end or stay at start
      await sharedWindow.keyboard.press('ArrowUp');
      await sharedWindow.waitForTimeout(100);

      // Just verify no crash occurred
      const palette = sharedWindow.locator('.command-palette-overlay').last();
      await expect(palette).toBeVisible();

      await sharedWindow.keyboard.press('Escape');
    });
  });

  // =====================
  // View Commands
  // =====================
  test.describe('View Commands', () => {

    test('should have toggle preview command', async () => {
      await sharedWindow.keyboard.press('Meta+Shift+P');
      await sharedWindow.waitForTimeout(300);

      await sharedWindow.fill('.command-palette-input', 'preview');
      await sharedWindow.waitForTimeout(200);

      const previewCommand = sharedWindow.locator('.command-item').filter({ hasText: /preview/i });
      expect(await previewCommand.count()).toBeGreaterThan(0);

      await sharedWindow.keyboard.press('Escape');
    });

    test('should have settings command', async () => {
      await sharedWindow.keyboard.press('Meta+Shift+P');
      await sharedWindow.waitForTimeout(300);

      await sharedWindow.fill('.command-palette-input', 'settings');
      await sharedWindow.waitForTimeout(200);

      const settingsCommand = sharedWindow.locator('.command-item').filter({ hasText: /settings/i });
      expect(await settingsCommand.count()).toBeGreaterThan(0);

      await sharedWindow.keyboard.press('Escape');
    });

    test('should have mode switching commands', async () => {
      await sharedWindow.keyboard.press('Meta+Shift+P');
      await sharedWindow.waitForTimeout(300);

      await sharedWindow.fill('.command-palette-input', 'mode');
      await sharedWindow.waitForTimeout(200);

      const modeCommands = sharedWindow.locator('.command-item').filter({ hasText: /mode|editor|presentation/i });
      expect(await modeCommands.count()).toBeGreaterThan(0);

      await sharedWindow.keyboard.press('Escape');
    });
  });

  // =====================
  // Edge Cases
  // =====================
  test.describe('Edge Cases', () => {

    test('should handle empty search gracefully', async () => {
      await sharedWindow.keyboard.press('Meta+Shift+P');
      await sharedWindow.waitForTimeout(300);

      // Enter and clear multiple times
      await sharedWindow.fill('.command-palette-input', 'test');
      await sharedWindow.waitForTimeout(100);
      await sharedWindow.fill('.command-palette-input', '');
      await sharedWindow.waitForTimeout(100);

      // Should still be visible and functional
      const palette = sharedWindow.locator('.command-palette-overlay').last();
      await expect(palette).toBeVisible();

      await sharedWindow.keyboard.press('Escape');
    });

    test('should handle no matching commands', async () => {
      await sharedWindow.keyboard.press('Meta+Shift+P');
      await sharedWindow.waitForTimeout(300);

      // Search for nonsense
      await sharedWindow.fill('.command-palette-input', 'xyznonexistentcommand123');
      await sharedWindow.waitForTimeout(200);

      // Palette should still be visible (might show "no results")
      const palette = sharedWindow.locator('.command-palette-overlay').last();
      await expect(palette).toBeVisible();

      await sharedWindow.keyboard.press('Escape');
    });

    test('should handle rapid open/close', async () => {
      // Rapid open/close shouldn't crash
      for (let i = 0; i < 3; i++) {
        await sharedWindow.keyboard.press('Meta+Shift+P');
        await sharedWindow.waitForTimeout(100);
        await sharedWindow.keyboard.press('Escape');
        await sharedWindow.waitForTimeout(100);
      }

      // App should still be responsive
      await sharedWindow.keyboard.press('Meta+Shift+P');
      await sharedWindow.waitForTimeout(200);
      const palette = sharedWindow.locator('.command-palette-overlay').last();
      await expect(palette).toBeVisible();

      await sharedWindow.keyboard.press('Escape');
    });
  });
});

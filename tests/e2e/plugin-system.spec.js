/**
 * Plugin System E2E Tests
 * Tests for plugin enabling/disabling and the Maze plugin functionality
 *
 * USAGE:
 *   npx playwright test plugin-system   # Run these tests
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

    // Wait for plugin system to initialize
    await sharedWindow.waitForFunction(() => window.TechnePlugins !== undefined, { timeout: 10000 });

    return sharedElectronApp;
  } catch (error) {
    console.error('Failed to launch Electron app:', error.message);
    launchFailed = true;
    return null;
  }
}

test.describe('Plugin System', () => {

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
  // Plugin Toggle in Settings
  // =====================
  test.describe('Plugin Toggle in Settings', () => {

    test('should open settings dialog', async () => {
      // Open settings dialog directly via evaluate
      await sharedWindow.evaluate(() => window.openSettingsDialog?.('plugins'));

      // Wait for settings dialog
      await sharedWindow.waitForSelector('#settings-dialog.active', { state: 'visible', timeout: 5000 });

      // Verify dialog is visible
      await expect(sharedWindow.locator('#settings-dialog')).toBeVisible();

      // Close dialog
      await sharedWindow.locator('#settings-dialog .modal-close').click();
      await sharedWindow.waitForTimeout(300);
    });

    test('should display plugins category in settings', async () => {
      // Open settings dialog directly
      await sharedWindow.evaluate(() => window.openSettingsDialog?.('plugins'));

      // Wait for settings dialog
      await sharedWindow.waitForSelector('#settings-dialog.active', { state: 'visible', timeout: 5000 });

      // Click on Plugins category in sidebar
      const pluginsNavItem = sharedWindow.locator('#settings-sidebar').locator('text=Plugins');
      await pluginsNavItem.click();

      // Wait for plugins content to load
      await sharedWindow.waitForTimeout(500);

      // Check for plugin list
      const pluginRows = sharedWindow.locator('.plugin-row');
      const count = await pluginRows.count();
      expect(count).toBeGreaterThan(0);

      // Close dialog
      await sharedWindow.locator('#settings-dialog .modal-close').click();
      await sharedWindow.waitForTimeout(300);
    });

    test('should toggle maze plugin enabled state', async () => {
      // Open settings dialog to plugins category
      await sharedWindow.evaluate(() => window.openSettingsDialog?.('plugins'));
      await sharedWindow.waitForSelector('#settings-dialog.active', { state: 'visible', timeout: 5000 });

      // Navigate to plugins category
      const pluginsNavItem = sharedWindow.locator('#settings-sidebar').locator('text=Plugins');
      await pluginsNavItem.click();
      await sharedWindow.waitForTimeout(500);

      // Find the maze plugin toggle
      const mazeToggle = sharedWindow.locator('.plugin-enabled-toggle[data-plugin-id="techne-maze"]');

      // Check if maze toggle exists
      if (await mazeToggle.count() > 0) {
        // Get current state
        const wasChecked = await mazeToggle.isChecked();

        // Toggle the plugin
        await mazeToggle.click();
        await sharedWindow.waitForTimeout(500);

        // Verify state changed
        const isNowChecked = await mazeToggle.isChecked();
        expect(isNowChecked).toBe(!wasChecked);

        // Toggle back to original state
        await mazeToggle.click();
        await sharedWindow.waitForTimeout(500);

        // Verify restored to original
        expect(await mazeToggle.isChecked()).toBe(wasChecked);
      }

      // Close dialog
      await sharedWindow.locator('#settings-dialog .modal-close').click();
      await sharedWindow.waitForTimeout(300);
    });

    test('should update mode button visibility when plugin is toggled', async () => {
      // Get initial visibility of maze mode button
      const mazeButton = sharedWindow.locator('#library-mode-btn');

      // Open settings and toggle maze plugin
      await sharedWindow.evaluate(() => window.openSettingsDialog?.('plugins'));
      await sharedWindow.waitForSelector('#settings-dialog.active', { state: 'visible', timeout: 5000 });

      const pluginsNavItem = sharedWindow.locator('#settings-sidebar').locator('text=Plugins');
      await pluginsNavItem.click();
      await sharedWindow.waitForTimeout(500);

      const mazeToggle = sharedWindow.locator('.plugin-enabled-toggle[data-plugin-id="techne-maze"]');

      if (await mazeToggle.count() > 0) {
        const wasEnabled = await mazeToggle.isChecked();

        // If already enabled, disable it first to test enabling
        if (!wasEnabled) {
          await mazeToggle.click();
          await sharedWindow.waitForTimeout(800);
        }

        // Close settings
        await sharedWindow.locator('#settings-dialog .modal-close').click();
        await sharedWindow.waitForTimeout(300);

        // Check mode button is visible when enabled
        const isVisible = await mazeButton.isVisible().catch(() => false);
        expect(isVisible).toBe(true);

        // Now disable it
        await sharedWindow.evaluate(() => window.openSettingsDialog?.('plugins'));
        await sharedWindow.waitForSelector('#settings-dialog.active', { state: 'visible', timeout: 5000 });
        await pluginsNavItem.click();
        await sharedWindow.waitForTimeout(500);

        const mazeToggle2 = sharedWindow.locator('.plugin-enabled-toggle[data-plugin-id="techne-maze"]');
        await mazeToggle2.click();
        await sharedWindow.waitForTimeout(800);

        // Close settings
        await sharedWindow.locator('#settings-dialog .modal-close').click();
        await sharedWindow.waitForTimeout(300);

        // Check mode button is hidden when disabled
        const isHiddenNow = !(await mazeButton.isVisible().catch(() => false));
        expect(isHiddenNow).toBe(true);

        // Restore original state if needed
        if (wasEnabled) {
          await sharedWindow.evaluate(() => window.openSettingsDialog?.('plugins'));
          await sharedWindow.waitForSelector('#settings-dialog.active', { state: 'visible', timeout: 5000 });
          await pluginsNavItem.click();
          await sharedWindow.waitForTimeout(500);
          await sharedWindow.locator('.plugin-enabled-toggle[data-plugin-id="techne-maze"]').click();
          await sharedWindow.waitForTimeout(500);
          await sharedWindow.locator('#settings-dialog .modal-close').click();
        }
      } else {
        // Close dialog
        await sharedWindow.locator('#settings-dialog .modal-close').click();
        await sharedWindow.waitForTimeout(300);
      }
    });

    test('should persist plugin settings across dialog reopens', async () => {
      // Open settings
      await sharedWindow.evaluate(() => window.openSettingsDialog?.('plugins'));
      await sharedWindow.waitForSelector('#settings-dialog.active', { state: 'visible', timeout: 5000 });

      const pluginsNavItem = sharedWindow.locator('#settings-sidebar').locator('text=Plugins');
      await pluginsNavItem.click();
      await sharedWindow.waitForTimeout(500);

      const mazeToggle = sharedWindow.locator('.plugin-enabled-toggle[data-plugin-id="techne-maze"]');

      if (await mazeToggle.count() > 0) {
        // Toggle plugin
        const initialState = await mazeToggle.isChecked();
        await mazeToggle.click();
        await sharedWindow.waitForTimeout(500);

        const newState = await mazeToggle.isChecked();
        expect(newState).toBe(!initialState);

        // Close dialog
        await sharedWindow.locator('#settings-dialog .modal-close').click();
        await sharedWindow.waitForTimeout(300);

        // Reopen dialog
        await sharedWindow.evaluate(() => window.openSettingsDialog?.('plugins'));
        await sharedWindow.waitForSelector('#settings-dialog.active', { state: 'visible', timeout: 5000 });
        await pluginsNavItem.click();
        await sharedWindow.waitForTimeout(500);

        // Verify state persisted
        const persistedState = await sharedWindow.locator('.plugin-enabled-toggle[data-plugin-id="techne-maze"]').isChecked();
        expect(persistedState).toBe(newState);

        // Restore original state
        if (persistedState !== initialState) {
          await sharedWindow.locator('.plugin-enabled-toggle[data-plugin-id="techne-maze"]').click();
          await sharedWindow.waitForTimeout(500);
        }
      }

      // Close dialog
      await sharedWindow.locator('#settings-dialog .modal-close').click();
      await sharedWindow.waitForTimeout(300);
    });
  });

  // =====================
  // Maze Plugin Functionality
  // =====================
  test.describe('Maze Plugin Functionality', () => {

    test.beforeEach(async () => {
      test.skip(!sharedElectronApp || !sharedWindow, 'Electron app could not be launched');

      // Ensure maze plugin is enabled
      const isMazeEnabled = await sharedWindow.evaluate(() => {
        return window.TechnePlugins?.isPluginEnabled?.('techne-maze') ?? false;
      });

      if (!isMazeEnabled) {
        // Enable the maze plugin
        await sharedWindow.evaluate(async () => {
          await window.TechnePlugins?.enablePlugin?.('techne-maze');
        });
        await sharedWindow.waitForTimeout(1000);

        // Update mode button visibility
        await sharedWindow.evaluate(() => {
          window.updateModeButtonVisibility?.();
        });
        await sharedWindow.waitForTimeout(500);
      }
    });

    test('should show maze mode button when plugin is enabled', async () => {
      // Check if maze button is visible
      const mazeButton = sharedWindow.locator('#library-mode-btn');

      // Wait for potential visibility update
      await sharedWindow.waitForTimeout(500);

      // Update mode button visibility
      await sharedWindow.evaluate(() => {
        window.updateModeButtonVisibility?.();
      });
      await sharedWindow.waitForTimeout(300);

      await expect(mazeButton).toBeVisible();
    });

    test('should switch to maze mode when button is clicked', async () => {
      // Ensure button is visible
      await sharedWindow.evaluate(() => window.updateModeButtonVisibility?.());
      await sharedWindow.waitForTimeout(300);

      const mazeButton = sharedWindow.locator('#library-mode-btn');

      if (await mazeButton.isVisible()) {
        // Click the maze mode button
        await mazeButton.click();
        await sharedWindow.waitForTimeout(1000);

        // Check if button has active class
        const buttonIsActive = await mazeButton.evaluate(el => el.classList.contains('active'));
        expect(buttonIsActive).toBe(true);

        // Return to editor mode
        await sharedWindow.locator('#editor-mode-btn').click();
        await sharedWindow.waitForTimeout(500);
      }
    });

    test('should display maze interface when active', async () => {
      // Switch to maze mode
      await sharedWindow.evaluate(() => window.updateModeButtonVisibility?.());
      await sharedWindow.waitForTimeout(300);

      const mazeButton = sharedWindow.locator('#library-mode-btn');

      if (await mazeButton.isVisible()) {
        await mazeButton.click();
        await sharedWindow.waitForTimeout(1500);

        // Check for maze/library content area
        const mazeContainer = sharedWindow.locator('#library-content, .babel-maze-view');
        const isVisible = await mazeContainer.isVisible().catch(() => false);

        // At minimum, the maze container should exist
        expect(isVisible).toBe(true);

        // Return to editor mode
        await sharedWindow.locator('#editor-mode-btn').click();
        await sharedWindow.waitForTimeout(500);
      }
    });

    test('should return to editor mode from maze', async () => {
      // First go to maze mode
      await sharedWindow.evaluate(() => window.updateModeButtonVisibility?.());
      await sharedWindow.waitForTimeout(300);

      const mazeButton = sharedWindow.locator('#library-mode-btn');
      const editorButton = sharedWindow.locator('#editor-mode-btn');

      if (await mazeButton.isVisible()) {
        // Go to maze
        await mazeButton.click();
        await sharedWindow.waitForTimeout(1000);

        // Verify maze is active
        const mazeIsActive = await mazeButton.evaluate(el => el.classList.contains('active'));
        expect(mazeIsActive).toBe(true);

        // Return to editor
        await editorButton.click();
        await sharedWindow.waitForTimeout(500);

        // Verify editor is active
        const editorIsActive = await editorButton.evaluate(el => el.classList.contains('active'));
        expect(editorIsActive).toBe(true);

        // Editor pane should be visible
        await expect(sharedWindow.locator('#editor-pane')).toBeVisible();
      }
    });
  });

  // =====================
  // Preview Pane Toggle
  // =====================
  test.describe('Preview Pane Toggle', () => {

    test.beforeEach(async () => {
      test.skip(!sharedElectronApp || !sharedWindow, 'Electron app could not be launched');

      // Ensure preview pane is visible before each test (reset state)
      const rightPane = sharedWindow.locator('#right-pane');
      const isCurrentlyHidden = await rightPane.evaluate(el =>
        el.classList.contains('pane-hidden') ||
        window.getComputedStyle(el).display === 'none'
      );

      if (isCurrentlyHidden) {
        await sharedWindow.locator('#toggle-preview-btn').click();
        await sharedWindow.waitForTimeout(300);
      }
    });

    test('should toggle preview pane visibility', async () => {
      // Check initial state - right pane should be visible
      const rightPane = sharedWindow.locator('#right-pane');
      await expect(rightPane).toBeVisible();

      // Find and click the Preview pane toggle button
      const previewToggleBtn = sharedWindow.locator('#toggle-preview-btn');
      await expect(previewToggleBtn).toBeVisible();

      // Click to hide preview pane
      await previewToggleBtn.click();
      await sharedWindow.waitForTimeout(300);

      // Right pane should be hidden (have pane-hidden class)
      const isHidden = await rightPane.evaluate(el =>
        el.classList.contains('pane-hidden') ||
        window.getComputedStyle(el).display === 'none'
      );
      expect(isHidden).toBe(true);

      // Click again to show preview pane
      await previewToggleBtn.click();
      await sharedWindow.waitForTimeout(300);

      // Right pane should be visible again
      const isVisible = await rightPane.evaluate(el =>
        !el.classList.contains('pane-hidden') &&
        window.getComputedStyle(el).display !== 'none'
      );
      expect(isVisible).toBe(true);
    });

    test('should update toggle button state when toggled', async () => {
      const previewToggleBtn = sharedWindow.locator('#toggle-preview-btn');

      // Get initial button state (should be visible = no toggle-off class)
      const initialHasToggleOff = await previewToggleBtn.evaluate(el =>
        el.classList.contains('toggle-off')
      );
      expect(initialHasToggleOff).toBe(false); // Initially visible, so no toggle-off

      // Click to hide
      await previewToggleBtn.click();
      await sharedWindow.waitForTimeout(300);

      // Button should have toggle-off class
      const hasToggleOff = await previewToggleBtn.evaluate(el =>
        el.classList.contains('toggle-off')
      );
      expect(hasToggleOff).toBe(true);

      // Click to show
      await previewToggleBtn.click();
      await sharedWindow.waitForTimeout(300);

      // Button should not have toggle-off class
      const finalHasToggleOff = await previewToggleBtn.evaluate(el =>
        el.classList.contains('toggle-off')
      );
      expect(finalHasToggleOff).toBe(false);
    });

    test('should expand editor when preview is hidden', async () => {
      const previewToggleBtn = sharedWindow.locator('#toggle-preview-btn');

      // Hide preview
      await previewToggleBtn.click();
      await sharedWindow.waitForTimeout(500);

      // Trigger layout refresh
      await sharedWindow.evaluate(() => window.dispatchEvent(new Event('resize')));
      await sharedWindow.waitForTimeout(300);

      // Right pane should be hidden
      const rightPane = sharedWindow.locator('#right-pane');
      const isHidden = await rightPane.evaluate(el =>
        el.classList.contains('pane-hidden') ||
        window.getComputedStyle(el).display === 'none'
      );
      expect(isHidden).toBe(true);

      // Restore preview
      await previewToggleBtn.click();
      await sharedWindow.waitForTimeout(300);

      // Right pane should be visible
      const isVisible = await rightPane.evaluate(el =>
        !el.classList.contains('pane-hidden') &&
        window.getComputedStyle(el).display !== 'none'
      );
      expect(isVisible).toBe(true);
    });

    test('should work via global togglePreview function', async () => {
      const rightPane = sharedWindow.locator('#right-pane');

      // Initial state should be visible
      await expect(rightPane).toBeVisible();

      // Call togglePreview directly
      await sharedWindow.evaluate(() => window.togglePreview?.());
      await sharedWindow.waitForTimeout(300);

      // Should be hidden
      const isHidden = await rightPane.evaluate(el =>
        el.classList.contains('pane-hidden') ||
        window.getComputedStyle(el).display === 'none'
      );
      expect(isHidden).toBe(true);

      // Toggle back
      await sharedWindow.evaluate(() => window.togglePreview?.());
      await sharedWindow.waitForTimeout(300);

      // Should be visible
      const isVisible = await rightPane.evaluate(el =>
        !el.classList.contains('pane-hidden') &&
        window.getComputedStyle(el).display !== 'none'
      );
      expect(isVisible).toBe(true);
    });
  });

  // =====================
  // Plugin System Integration
  // =====================
  test.describe('Plugin System Integration', () => {

    test('should have TechnePlugins available globally', async () => {
      const hasPluginSystem = await sharedWindow.evaluate(() => {
        return typeof window.TechnePlugins === 'object' &&
               typeof window.TechnePlugins.register === 'function' &&
               typeof window.TechnePlugins.enablePlugin === 'function' &&
               typeof window.TechnePlugins.disablePlugin === 'function';
      });

      expect(hasPluginSystem).toBe(true);
    });

    test('should have mode registry available', async () => {
      const hasRegistry = await sharedWindow.evaluate(() => {
        return typeof window.__techneAvailableModes === 'object';
      });

      expect(hasRegistry).toBe(true);
    });

    test('should register maze mode when plugin is enabled', async () => {
      // First ensure maze is enabled
      await sharedWindow.evaluate(async () => {
        if (!window.TechnePlugins?.isPluginEnabled?.('techne-maze')) {
          await window.TechnePlugins?.enablePlugin?.('techne-maze');
        }
      });
      await sharedWindow.waitForTimeout(1000);

      // Check if maze mode is registered
      const hasMazeMode = await sharedWindow.evaluate(() => {
        return window.__techneAvailableModes?.['maze'] !== undefined ||
               window.__techneAvailableModes?.['library'] !== undefined;
      });

      expect(hasMazeMode).toBe(true);
    });
  });
});

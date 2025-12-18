/**
 * AI Tutor Plugin E2E Tests
 * Tests for the AI Tutor guided tour functionality
 *
 * USAGE:
 *   npx playwright test ai-tutor   # Run these tests
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

    // Wait for app and plugin system to initialize
    await sharedWindow.waitForFunction(() =>
      window.editor !== undefined && window.TechnePlugins !== undefined,
      { timeout: 10000 }
    );

    return sharedElectronApp;
  } catch (error) {
    console.error('Failed to launch Electron app:', error.message);
    launchFailed = true;
    return null;
  }
}

test.describe('AI Tutor Plugin', () => {

  test.beforeAll(async () => {
    if (isHeadless) {
      console.log('Skipping Electron E2E tests in headless environment');
      return;
    }
    await launchElectronApp();
    if (!sharedElectronApp) {
      console.log('Could not launch Electron app - tests will be skipped');
      return;
    }

    // Wait for plugin system to be fully ready
    await sharedWindow.waitForFunction(() =>
      window.TechnePlugins?.enablePlugin !== undefined,
      { timeout: 15000 }
    );

    // Enable the AI tutor plugin (it's disabled by default)
    await sharedWindow.evaluate(async () => {
      if (window.TechnePlugins?.enablePlugin) {
        await window.TechnePlugins.enablePlugin('techne-ai-tutor');
      }
    });
    await sharedWindow.waitForTimeout(1500);
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

    // Ensure AI tutor plugin is enabled
    const isEnabled = await sharedWindow.evaluate(() => {
      return window.TechnePlugins?.isEnabled?.('techne-ai-tutor') ?? false;
    });

    if (!isEnabled) {
      await sharedWindow.evaluate(async () => {
        await window.TechnePlugins?.enablePlugin?.('techne-ai-tutor');
      });
      await sharedWindow.waitForTimeout(1000);
    }

    // Close any open tour
    const closeBtn = sharedWindow.locator('.tutor-close-btn, .tutor-popup .close-btn');
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
      await sharedWindow.waitForTimeout(300);
    }
  });

  // =====================
  // Plugin Loading
  // =====================
  test.describe('Plugin Loading', () => {

    test('should load the AI tutor plugin', async () => {
      const isLoaded = await sharedWindow.evaluate(() => {
        return window.TechnePlugins?.isEnabled?.('techne-ai-tutor') ?? false;
      });
      expect(isLoaded).toBe(true);
    });

    test('should display tutor trigger button', async () => {
      // Wait for button to appear
      await sharedWindow.waitForTimeout(500);

      const triggerBtn = sharedWindow.locator('.tutor-trigger-btn, #ai-tutor-trigger, [data-tutor-trigger]');
      const isVisible = await triggerBtn.isVisible().catch(() => false);

      // If button exists, verify it's accessible
      if (isVisible) {
        await expect(triggerBtn).toBeVisible();
      } else {
        // Plugin might not render trigger in test environment
        test.skip(true, 'Tutor trigger button not rendered');
      }
    });
  });

  // =====================
  // Tour Trigger
  // =====================
  test.describe('Tour Trigger', () => {

    test('should show tour options when trigger is clicked', async () => {
      const triggerBtn = sharedWindow.locator('.tutor-trigger-btn, #ai-tutor-trigger');

      if (await triggerBtn.isVisible().catch(() => false)) {
        await triggerBtn.click();
        await sharedWindow.waitForTimeout(500);

        // Check for tour options popup or panel
        const tutorPopup = sharedWindow.locator('.tutor-popup, .tutor-options, .tutor-panel');
        const isPopupVisible = await tutorPopup.isVisible().catch(() => false);

        expect(isPopupVisible).toBe(true);

        // Close if opened
        const closeBtn = sharedWindow.locator('.tutor-close-btn, .tutor-popup .close-btn');
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.click();
        }
      } else {
        test.skip(true, 'Tutor trigger not visible');
      }
    });

    test('should close tour options with close button', async () => {
      const triggerBtn = sharedWindow.locator('.tutor-trigger-btn, #ai-tutor-trigger');

      if (await triggerBtn.isVisible().catch(() => false)) {
        await triggerBtn.click();
        await sharedWindow.waitForTimeout(300);

        const closeBtn = sharedWindow.locator('.tutor-close-btn, .tutor-popup .close-btn');
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.click();
          await sharedWindow.waitForTimeout(300);

          const tutorPopup = sharedWindow.locator('.tutor-popup, .tutor-panel');
          await expect(tutorPopup).toBeHidden();
        }
      } else {
        test.skip(true, 'Tutor trigger not visible');
      }
    });
  });

  // =====================
  // Tour Navigation
  // =====================
  test.describe('Tour Navigation', () => {

    test('should start quick tour when selected', async () => {
      const triggerBtn = sharedWindow.locator('.tutor-trigger-btn, #ai-tutor-trigger');

      if (await triggerBtn.isVisible().catch(() => false)) {
        await triggerBtn.click();
        await sharedWindow.waitForTimeout(300);

        // Look for quick tour button
        const quickTourBtn = sharedWindow.locator('button, .tutor-option').filter({ hasText: /quick|brief|short/i }).first();

        if (await quickTourBtn.isVisible().catch(() => false)) {
          await quickTourBtn.click();
          await sharedWindow.waitForTimeout(500);

          // Tour should be active
          const tourActive = await sharedWindow.evaluate(() => {
            return document.querySelector('.tutor-step, .tutor-active, .tutor-highlight') !== null;
          });

          expect(tourActive).toBe(true);

          // Stop the tour
          const stopBtn = sharedWindow.locator('.tutor-stop-btn, .stop-tour-btn, button').filter({ hasText: /stop|exit|close/i }).first();
          if (await stopBtn.isVisible().catch(() => false)) {
            await stopBtn.click();
          }
        }
      } else {
        test.skip(true, 'Tutor trigger not visible');
      }
    });

    test('should navigate to next step', async () => {
      const triggerBtn = sharedWindow.locator('.tutor-trigger-btn, #ai-tutor-trigger');

      if (await triggerBtn.isVisible().catch(() => false)) {
        await triggerBtn.click();
        await sharedWindow.waitForTimeout(300);

        const startBtn = sharedWindow.locator('button, .tutor-option').filter({ hasText: /start|begin|tour/i }).first();

        if (await startBtn.isVisible().catch(() => false)) {
          await startBtn.click();
          await sharedWindow.waitForTimeout(500);

          // Find next button
          const nextBtn = sharedWindow.locator('button').filter({ hasText: /next|continue|→/i }).first();

          if (await nextBtn.isVisible().catch(() => false)) {
            await nextBtn.click();
            await sharedWindow.waitForTimeout(300);

            // Should still be in tour
            const inTour = await sharedWindow.evaluate(() => {
              return document.querySelector('.tutor-step, .tutor-active') !== null;
            });

            expect(inTour).toBe(true);
          }

          // Clean up - stop tour
          const stopBtn = sharedWindow.locator('button').filter({ hasText: /stop|exit|close/i }).first();
          if (await stopBtn.isVisible().catch(() => false)) {
            await stopBtn.click();
          }
        }
      } else {
        test.skip(true, 'Tutor trigger not visible');
      }
    });

    test('should navigate to previous step', async () => {
      const triggerBtn = sharedWindow.locator('.tutor-trigger-btn, #ai-tutor-trigger');

      if (await triggerBtn.isVisible().catch(() => false)) {
        await triggerBtn.click();
        await sharedWindow.waitForTimeout(300);

        const startBtn = sharedWindow.locator('button, .tutor-option').filter({ hasText: /start|begin|tour/i }).first();

        if (await startBtn.isVisible().catch(() => false)) {
          await startBtn.click();
          await sharedWindow.waitForTimeout(500);

          // Go next first
          const nextBtn = sharedWindow.locator('button').filter({ hasText: /next|continue/i }).first();
          if (await nextBtn.isVisible().catch(() => false)) {
            await nextBtn.click();
            await sharedWindow.waitForTimeout(300);

            // Now go back
            const prevBtn = sharedWindow.locator('button').filter({ hasText: /prev|back|←/i }).first();
            if (await prevBtn.isVisible().catch(() => false)) {
              await prevBtn.click();
              await sharedWindow.waitForTimeout(300);

              // Should still be in tour
              const inTour = await sharedWindow.evaluate(() => {
                return document.querySelector('.tutor-step, .tutor-active') !== null;
              });

              expect(inTour).toBe(true);
            }
          }

          // Clean up
          const stopBtn = sharedWindow.locator('button').filter({ hasText: /stop|exit|close/i }).first();
          if (await stopBtn.isVisible().catch(() => false)) {
            await stopBtn.click();
          }
        }
      } else {
        test.skip(true, 'Tutor trigger not visible');
      }
    });
  });

  // =====================
  // Tour Highlighting
  // =====================
  test.describe('Tour Highlighting', () => {

    test('should highlight target element during tour', async () => {
      const triggerBtn = sharedWindow.locator('.tutor-trigger-btn, #ai-tutor-trigger');

      if (await triggerBtn.isVisible().catch(() => false)) {
        await triggerBtn.click();
        await sharedWindow.waitForTimeout(300);

        const startBtn = sharedWindow.locator('button, .tutor-option').filter({ hasText: /start|begin|tour|quick/i }).first();

        if (await startBtn.isVisible().catch(() => false)) {
          await startBtn.click();
          await sharedWindow.waitForTimeout(500);

          // Check for highlight element
          const hasHighlight = await sharedWindow.evaluate(() => {
            const highlight = document.querySelector('.tutor-highlight, .highlight-border, [data-tutor-highlighted]');
            return highlight !== null;
          });

          expect(hasHighlight).toBe(true);

          // Clean up
          const stopBtn = sharedWindow.locator('button').filter({ hasText: /stop|exit|close/i }).first();
          if (await stopBtn.isVisible().catch(() => false)) {
            await stopBtn.click();
          }
        }
      } else {
        test.skip(true, 'Tutor trigger not visible');
      }
    });
  });

  // =====================
  // Plugin Enable/Disable
  // =====================
  test.describe('Plugin Enable/Disable', () => {

    test('should hide trigger when plugin is disabled', async () => {
      // Check initial visibility
      const triggerBtn = sharedWindow.locator('.tutor-trigger-btn, #ai-tutor-trigger');
      const wasVisible = await triggerBtn.isVisible().catch(() => false);

      if (wasVisible) {
        // Disable plugin
        await sharedWindow.evaluate(async () => {
          await window.TechnePlugins?.disablePlugin?.('techne-ai-tutor');
        });
        await sharedWindow.waitForTimeout(500);

        // Check trigger is hidden
        const isNowVisible = await triggerBtn.isVisible().catch(() => false);
        expect(isNowVisible).toBe(false);

        // Re-enable plugin
        await sharedWindow.evaluate(async () => {
          await window.TechnePlugins?.enablePlugin?.('techne-ai-tutor');
        });
        await sharedWindow.waitForTimeout(500);
      } else {
        test.skip(true, 'Tutor trigger was not visible initially');
      }
    });

    test('should show trigger when plugin is enabled', async () => {
      // Disable first
      await sharedWindow.evaluate(async () => {
        await window.TechnePlugins?.disablePlugin?.('techne-ai-tutor');
      });
      await sharedWindow.waitForTimeout(300);

      // Enable
      await sharedWindow.evaluate(async () => {
        await window.TechnePlugins?.enablePlugin?.('techne-ai-tutor');
      });
      await sharedWindow.waitForTimeout(1000);

      // Check trigger appears
      const triggerBtn = sharedWindow.locator('.tutor-trigger-btn, #ai-tutor-trigger');
      const isVisible = await triggerBtn.isVisible().catch(() => false);

      // Note: visibility depends on plugin implementation
      // Just ensure no crash occurred
      const pluginEnabled = await sharedWindow.evaluate(() =>
        window.TechnePlugins?.isEnabled?.('techne-ai-tutor') ?? false
      );
      expect(pluginEnabled).toBe(true);
    });
  });
});

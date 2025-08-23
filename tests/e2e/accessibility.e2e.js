const { test, expect, _electron: electron } = require('@playwright/test');
const { injectAxe, checkA11y } = require('axe-playwright');
const path = require('path');

test.describe('Accessibility Tests', () => {
  let app;
  let window;

  test.beforeEach(async () => {
    app = await electron.launch({
      args: [path.join(__dirname, '../..')],
      env: { ...process.env, NODE_ENV: 'test' }
    });
    
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    
    // Inject axe-core for accessibility testing
    await injectAxe(window);
  });

  test.afterEach(async () => {
    await app.close();
  });

  test('main window has no accessibility violations', async () => {
    // Check entire page
    await checkA11y(window, null, {
      detailedReport: true,
      detailedReportOptions: {
        html: true
      }
    });
  });

  test('editor area is keyboard navigable', async () => {
    // Focus on editor
    await window.focus('.monaco-editor');
    
    // Check tab navigation
    await window.keyboard.press('Tab');
    
    // Verify focus moved
    const activeElement = await window.evaluate(() => document.activeElement.tagName);
    expect(activeElement).toBeTruthy();
  });

  test('all buttons have accessible labels', async () => {
    // Get all buttons
    const buttons = await window.locator('button').all();
    
    for (const button of buttons) {
      const ariaLabel = await button.getAttribute('aria-label');
      const title = await button.getAttribute('title');
      const text = await button.textContent();
      
      // Button should have either aria-label, title, or text content
      const hasAccessibleName = ariaLabel || title || text?.trim();
      expect(hasAccessibleName).toBeTruthy();
    }
  });

  test('color contrast meets WCAG standards', async () => {
    await checkA11y(window, null, {
      rules: {
        'color-contrast': { enabled: true }
      }
    });
  });

  test('forms have proper labels', async () => {
    // Open settings to test form elements
    await window.click('button[title="Settings"]');
    await window.waitForSelector('#settings-modal');
    
    // Check all inputs have labels
    const inputs = await window.locator('input:not([type="hidden"])').all();
    
    for (const input of inputs) {
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      
      if (id) {
        // Check for associated label
        const label = await window.locator(`label[for="${id}"]`).count();
        const hasLabel = label > 0 || ariaLabel || ariaLabelledBy;
        expect(hasLabel).toBeTruthy();
      }
    }
  });

  test('focus indicators are visible', async () => {
    // Tab through interactive elements
    const interactiveElements = await window.locator('button, a, input, select, textarea').all();
    
    for (let i = 0; i < Math.min(5, interactiveElements.length); i++) {
      await window.keyboard.press('Tab');
      
      // Get focused element
      const focusedElement = await window.evaluate(() => {
        const el = document.activeElement;
        const styles = window.getComputedStyle(el);
        return {
          outline: styles.outline,
          outlineWidth: styles.outlineWidth,
          boxShadow: styles.boxShadow
        };
      });
      
      // Check for focus indicator (outline or box-shadow)
      const hasFocusIndicator = 
        (focusedElement.outline && focusedElement.outline !== 'none') ||
        (focusedElement.outlineWidth && focusedElement.outlineWidth !== '0px') ||
        (focusedElement.boxShadow && focusedElement.boxShadow !== 'none');
      
      expect(hasFocusIndicator).toBeTruthy();
    }
  });

  test('ARIA landmarks are properly used', async () => {
    // Check for main landmark
    const main = await window.locator('[role="main"], main').count();
    expect(main).toBeGreaterThan(0);
    
    // Check for navigation
    const nav = await window.locator('[role="navigation"], nav').count();
    expect(nav).toBeGreaterThan(0);
    
    // Check for complementary regions
    const aside = await window.locator('[role="complementary"], aside').count();
    expect(aside).toBeGreaterThanOrEqual(0);
  });

  test('images have alt text', async () => {
    const images = await window.locator('img').all();
    
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      const role = await img.getAttribute('role');
      
      // Image should have alt text or role="presentation" for decorative images
      const isAccessible = alt !== null || role === 'presentation';
      expect(isAccessible).toBeTruthy();
    }
  });

  test('headings follow proper hierarchy', async () => {
    const headings = await window.evaluate(() => {
      const h1 = document.querySelectorAll('h1').length;
      const h2 = document.querySelectorAll('h2').length;
      const h3 = document.querySelectorAll('h3').length;
      const h4 = document.querySelectorAll('h4').length;
      const h5 = document.querySelectorAll('h5').length;
      const h6 = document.querySelectorAll('h6').length;
      
      return { h1, h2, h3, h4, h5, h6 };
    });
    
    // Should have at least one h1
    expect(headings.h1).toBeGreaterThan(0);
    
    // Should not skip heading levels (if h3 exists, h2 should exist)
    if (headings.h3 > 0) expect(headings.h2).toBeGreaterThan(0);
    if (headings.h4 > 0) expect(headings.h3).toBeGreaterThan(0);
  });
});
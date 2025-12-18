const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

test.describe('Visual Regression Tests', () => {
  let app;
  let window;

  test.beforeEach(async () => {
    // Create clean environment without ELECTRON_RUN_AS_NODE (conflicts with Electron GUI mode)
    const { ELECTRON_RUN_AS_NODE, ...cleanEnv } = process.env;
    app = await electron.launch({
      args: [path.join(__dirname, '../..')],
      env: { ...cleanEnv, NODE_ENV: 'test' }
    });
    
    window = await app.firstWindow();
    
    // Set consistent viewport size for visual tests
    await window.setViewportSize({ width: 1280, height: 720 });
    
    // Wait for app to fully load
    await window.waitForLoadState('networkidle');
    await window.waitForSelector('.monaco-editor');
  });

  test.afterEach(async () => {
    await app.close();
  });

  test('main window layout', async () => {
    // Take screenshot of main window
    await expect(window).toHaveScreenshot('main-window.png', {
      fullPage: true,
      animations: 'disabled'
    });
  });

  test('file tree appearance', async () => {
    // Open file tree
    await window.click('text=Files');
    await window.waitForSelector('#file-tree-view');
    await window.waitForTimeout(500); // Wait for tree to fully render
    
    const fileTree = await window.locator('#structure-pane');
    await expect(fileTree).toHaveScreenshot('file-tree.png');
  });

  test('editor with content', async () => {
    // Add some content to editor
    await window.evaluate(() => {
      if (window.editor && window.editor.setValue) {
        window.editor.setValue(`# Hegel Pedagogy AI

## Introduction
This is a test document for visual regression testing.

### Features
- Markdown support
- Syntax highlighting
- Auto-completion

\`\`\`javascript
function helloWorld() {
  console.log("Hello, World!");
}
\`\`\`

### Philosophy
The dialectical method...`);
      }
    });
    
    await window.waitForTimeout(500); // Wait for syntax highlighting
    
    const editor = await window.locator('.monaco-editor');
    await expect(editor).toHaveScreenshot('editor-with-content.png');
  });

  test('dark theme', async () => {
    // Switch to dark theme
    await window.click('button[title="Settings"]');
    await window.waitForSelector('#settings-modal');
    
    const themeSelect = await window.locator('#theme-select');
    if (await themeSelect.count() > 0) {
      await themeSelect.selectOption('dark');
      await window.click('button:has-text("Save")');
      await window.waitForTimeout(500); // Wait for theme to apply
    }
    
    await expect(window).toHaveScreenshot('dark-theme.png', {
      fullPage: true,
      animations: 'disabled'
    });
  });

  test('settings modal', async () => {
    await window.click('button[title="Settings"]');
    await window.waitForSelector('#settings-modal');
    await window.waitForTimeout(300); // Wait for modal animation
    
    const modal = await window.locator('#settings-modal');
    await expect(modal).toHaveScreenshot('settings-modal.png');
  });

  test('AI chat panel', async () => {
    await window.click('button[title="AI Chat"]');
    await window.waitForSelector('#ai-chat-panel');
    await window.waitForTimeout(300);
    
    const chatPanel = await window.locator('#ai-chat-panel');
    await expect(chatPanel).toHaveScreenshot('ai-chat-panel.png');
  });

  test('gamification menu', async () => {
    const gamificationMenu = await window.locator('#gamification-menu');
    
    if (await gamificationMenu.count() > 0) {
      // Make sure it's visible
      const isVisible = await gamificationMenu.isVisible();
      if (!isVisible) {
        await window.click('#gamification-toggle');
        await window.waitForTimeout(300); // Wait for animation
      }
      
      await expect(gamificationMenu).toHaveScreenshot('gamification-menu.png');
    }
  });

  test('presentation mode', async () => {
    // Enter presentation mode
    await window.click('button[title="Presentation Mode"]');
    
    const presentationView = await window.locator('#presentation-view');
    if (await presentationView.count() > 0) {
      await window.waitForTimeout(500); // Wait for presentation to render
      await expect(presentationView).toHaveScreenshot('presentation-mode.png');
    }
  });

  test('search interface', async () => {
    await window.keyboard.press('Control+F');
    await window.waitForSelector('#search-input');
    await window.waitForTimeout(200);
    
    // Type search term
    const searchInput = await window.locator('#search-input');
    await searchInput.fill('Hegel');
    
    // Take screenshot of search UI
    const searchContainer = await window.locator('#search-container, .search-box');
    if (await searchContainer.count() > 0) {
      await expect(searchContainer).toHaveScreenshot('search-interface.png');
    }
  });

  test('toolbar appearance', async () => {
    const toolbar = await window.locator('#toolbar, .toolbar');
    if (await toolbar.count() > 0) {
      await expect(toolbar).toHaveScreenshot('toolbar.png');
    }
  });

  test('status bar', async () => {
    const statusBar = await window.locator('#status-bar, .status-bar');
    if (await statusBar.count() > 0) {
      await expect(statusBar).toHaveScreenshot('status-bar.png');
    }
  });

  test('responsive layout - narrow', async () => {
    // Test narrow viewport
    await window.setViewportSize({ width: 768, height: 1024 });
    await window.waitForTimeout(500); // Wait for layout adjustment
    
    await expect(window).toHaveScreenshot('layout-narrow.png', {
      fullPage: false
    });
  });

  test('responsive layout - wide', async () => {
    // Test wide viewport
    await window.setViewportSize({ width: 1920, height: 1080 });
    await window.waitForTimeout(500); // Wait for layout adjustment
    
    await expect(window).toHaveScreenshot('layout-wide.png', {
      fullPage: false
    });
  });

  test('error states', async () => {
    // Trigger an error state (example: try to open non-existent file)
    await window.evaluate(() => {
      // Simulate error notification
      if (window.showNotification) {
        window.showNotification('Failed to load file: File not found', 'error');
      }
    });
    
    await window.waitForTimeout(300);
    
    const notification = await window.locator('.notification-error, .error-message');
    if (await notification.count() > 0) {
      await expect(notification).toHaveScreenshot('error-notification.png');
    }
  });

  test('loading states', async () => {
    // Capture loading spinner if visible
    const loadingSpinner = await window.locator('.loading, .spinner, [role="progressbar"]');
    if (await loadingSpinner.count() > 0 && await loadingSpinner.isVisible()) {
      await expect(loadingSpinner).toHaveScreenshot('loading-state.png');
    }
  });
});
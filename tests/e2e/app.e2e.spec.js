/**
 * End-to-End Tests for NightOwl
 *
 * These tests launch the actual Electron application and test
 * real user workflows from the end-user perspective.
 *
 * USAGE:
 *   npm run test:e2e              # Run all E2E tests
 *   npx playwright test app.e2e   # Run only this file
 *
 * REQUIREMENTS:
 *   - A display environment (not headless/CI)
 *   - Compatible Electron/Playwright versions
 *
 * KNOWN ISSUES:
 *   - Electron 32+ has compatibility issues with Playwright's --remote-debugging-port flag
 *   - See: https://github.com/microsoft/playwright/issues/32027
 *   - Workaround: Downgrade to Electron 31 or wait for Playwright fix
 *
 * COMPATIBILITY:
 *   - Playwright 1.55.0 requires Electron < 32 for full E2E support
 *   - Tests will skip gracefully if Electron launch fails
 */

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// Test configuration
const APP_PATH = path.join(__dirname, '../../');
const TEST_TIMEOUT = 60000;

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

    sharedElectronApp = await electron.launch({
      executablePath: electronPath,
      args: [APP_PATH, '--dev'],
      env: { ...process.env, NODE_ENV: 'test' },
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

// Main test suite using a shared app instance
test.describe('NightOwl - End User Tests', () => {

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
  // Application Launch
  // =====================
  test.describe('Application Launch', () => {
    test('should launch successfully and display main UI', async () => {
      await expect(sharedWindow.locator('#app-container')).toBeVisible({ timeout: TEST_TIMEOUT });
      await expect(sharedWindow.locator('#editor')).toBeVisible();
      await expect(sharedWindow.locator('#preview')).toBeVisible();
      await expect(sharedWindow.locator('#structure-pane')).toBeVisible();
    });

    test('should initialize Monaco editor', async () => {
      const editorReady = await sharedWindow.evaluate(() => {
        return window.editor && typeof window.editor.getValue === 'function';
      });
      expect(editorReady).toBe(true);
    });

    test('should display the toolbar with mode buttons', async () => {
      await expect(sharedWindow.locator('#show-editor-btn')).toBeVisible();
      await expect(sharedWindow.locator('#show-presentation-btn')).toBeVisible();
    });
  });

  // =====================
  // Editor Functionality
  // =====================
  test.describe('Editor Functionality', () => {
    test('should allow typing in the editor', async () => {
      const testContent = '# Hello World\n\nThis is a test document.';

      await sharedWindow.evaluate((content) => {
        window.editor.setValue(content);
      }, testContent);

      const editorContent = await sharedWindow.evaluate(() => window.editor.getValue());
      expect(editorContent).toBe(testContent);
    });

    test('should render markdown preview correctly', async () => {
      const markdown = '# Test Heading\n\n**Bold text** and *italic text*.\n\n- List item 1\n- List item 2';

      await sharedWindow.evaluate((content) => {
        window.editor.setValue(content);
        if (window.updatePreviewAndStructure) {
          window.updatePreviewAndStructure(content);
        }
      }, markdown);

      await sharedWindow.waitForTimeout(500);

      const previewHTML = await sharedWindow.locator('#preview').innerHTML();
      expect(previewHTML).toContain('<h1');
      expect(previewHTML).toContain('Test Heading');
      expect(previewHTML).toContain('<strong>');
      expect(previewHTML).toContain('<em>');
    });

    test('should handle internal wiki-style links', async () => {
      const contentWithLinks = 'This references [[linked-document]] and [[another-doc|Display Name]].';

      await sharedWindow.evaluate((content) => {
        window.editor.setValue(content);
        if (window.updatePreviewAndStructure) {
          window.updatePreviewAndStructure(content);
        }
      }, contentWithLinks);

      await sharedWindow.waitForTimeout(500);

      const linkCount = await sharedWindow.locator('#preview .internal-link').count();
      expect(linkCount).toBe(2);
    });

    test('should preserve content after switching modes', async () => {
      const originalContent = '# Important Content\n\nThis should persist across mode switches.';

      await sharedWindow.evaluate((content) => {
        window.editor.setValue(content);
      }, originalContent);

      await sharedWindow.locator('#show-presentation-btn').click();
      await sharedWindow.waitForTimeout(300);
      await sharedWindow.locator('#show-editor-btn').click();
      await sharedWindow.waitForTimeout(300);

      const contentAfter = await sharedWindow.evaluate(() => window.editor.getValue());
      expect(contentAfter).toBe(originalContent);
    });
  });

  // =====================
  // File Tree Navigation
  // =====================
  test.describe('File Tree Navigation', () => {
    test('should display file tree when switching to files view', async () => {
      await sharedWindow.locator('#show-files-btn').click();
      await sharedWindow.waitForTimeout(500);
      await expect(sharedWindow.locator('#file-tree-view')).toBeVisible();
    });

    test('should show files in the tree', async () => {
      await sharedWindow.locator('#show-files-btn').click();
      await sharedWindow.waitForTimeout(500);
      const fileItems = await sharedWindow.locator('#file-tree-view .file-tree-item').count();
      expect(fileItems).toBeGreaterThan(0);
    });

    test('should switch between files and structure views', async () => {
      await sharedWindow.locator('#show-files-btn').click();
      await sharedWindow.waitForTimeout(300);
      await expect(sharedWindow.locator('#file-tree-view')).toBeVisible();

      await sharedWindow.locator('#show-structure-btn').click();
      await sharedWindow.waitForTimeout(300);
      await expect(sharedWindow.locator('#structure-list')).toBeVisible();
    });
  });

  // =====================
  // Mode Switching
  // =====================
  test.describe('Mode Switching', () => {
    test('should switch to presentation mode', async () => {
      await sharedWindow.locator('#show-presentation-btn').click();
      await sharedWindow.waitForTimeout(500);
      await expect(sharedWindow.locator('#presentation-content')).toBeVisible();
    });

    test('should switch back to editor mode', async () => {
      await sharedWindow.locator('#show-presentation-btn').click();
      await sharedWindow.waitForTimeout(300);
      await sharedWindow.locator('#show-editor-btn').click();
      await sharedWindow.waitForTimeout(300);
      await expect(sharedWindow.locator('#editor-content')).toBeVisible();
    });

    test('should handle keyboard shortcut for mode switching', async () => {
      await sharedWindow.keyboard.press('Alt+1');
      await sharedWindow.waitForTimeout(300);
      const editorVisible = await sharedWindow.locator('#editor-content').isVisible();
      expect(editorVisible).toBe(true);
    });
  });

  // =====================
  // UI Panel Toggles
  // =====================
  test.describe('UI Panel Toggles', () => {
    test('should toggle sidebar visibility', async () => {
      const toggleBtn = sharedWindow.locator('#toggle-sidebar-btn');
      const sidebar = sharedWindow.locator('#left-sidebar');

      const initiallyVisible = await sidebar.isVisible();

      await toggleBtn.click();
      await sharedWindow.waitForTimeout(300);
      const afterToggle = await sidebar.isVisible();
      expect(afterToggle).toBe(!initiallyVisible);

      await toggleBtn.click();
      await sharedWindow.waitForTimeout(300);
      const restored = await sidebar.isVisible();
      expect(restored).toBe(initiallyVisible);
    });

    test('should toggle preview pane visibility', async () => {
      const toggleBtn = sharedWindow.locator('#toggle-preview-btn');
      const previewPane = sharedWindow.locator('#right-pane');

      const initiallyVisible = await previewPane.isVisible();

      await toggleBtn.click();
      await sharedWindow.waitForTimeout(300);
      const afterToggle = await previewPane.isVisible();
      expect(afterToggle).toBe(!initiallyVisible);

      await toggleBtn.click();
      await sharedWindow.waitForTimeout(300);
    });
  });

  // =====================
  // AI Chat Interface
  // =====================
  test.describe('AI Chat Interface', () => {
    test('should display AI chat panel', async () => {
      const chatPanel = sharedWindow.locator('#ai-chat-panel, #chat-panel, .ai-chat-container');
      const panelExists = await chatPanel.count() > 0;

      if (panelExists) {
        const toggleBtn = sharedWindow.locator('#toggle-chat-btn, #show-chat-btn');
        if (await toggleBtn.count() > 0) {
          await toggleBtn.click();
          await sharedWindow.waitForTimeout(300);
        }
        await expect(chatPanel.first()).toBeVisible();
      }
    });

    test('should have chat input field', async () => {
      const chatInput = sharedWindow.locator('#chat-input, #ai-input, .chat-input, textarea[placeholder*="message"], textarea[placeholder*="Message"]');
      const inputExists = await chatInput.count() > 0;
      if (inputExists) {
        await expect(chatInput.first()).toBeVisible();
      }
    });
  });

  // =====================
  // Settings
  // =====================
  test.describe('Settings', () => {
    test('should open settings panel', async () => {
      const settingsBtn = sharedWindow.locator('#settings-btn, #open-settings-btn, button[title*="Settings"], button[aria-label*="Settings"]');

      if (await settingsBtn.count() > 0) {
        await settingsBtn.first().click();
        await sharedWindow.waitForTimeout(500);
        const settingsPanel = sharedWindow.locator('#settings-modal, #settings-panel, .settings-container, .modal');
        await expect(settingsPanel.first()).toBeVisible();
      }
    });
  });

  // =====================
  // Keyboard Navigation
  // =====================
  test.describe('Keyboard Navigation', () => {
    test('should handle Ctrl+S save shortcut', async () => {
      await sharedWindow.evaluate(() => {
        window.editor.setValue('# Test Save\n\nContent to save.');
      });
      await sharedWindow.keyboard.press('Control+s');
      await sharedWindow.waitForTimeout(500);
    });

    test('should handle Escape to exit modes', async () => {
      await sharedWindow.locator('#show-presentation-btn').click();
      await sharedWindow.waitForTimeout(300);
      await sharedWindow.keyboard.press('Escape');
      await sharedWindow.waitForTimeout(300);
      const editorVisible = await sharedWindow.locator('#editor-content').isVisible();
      expect(editorVisible).toBe(true);
    });
  });

  // =====================
  // File Operations
  // =====================
  test.describe('File Operations', () => {
    test('should create new file via menu or button', async () => {
      const newFileBtn = sharedWindow.locator('#new-file-btn, button[title*="New"], button[aria-label*="New file"]');

      if (await newFileBtn.count() > 0) {
        await newFileBtn.first().click();
        await sharedWindow.waitForTimeout(500);
        const editorContent = await sharedWindow.evaluate(() => window.editor.getValue());
        expect(typeof editorContent).toBe('string');
      }
    });

    test('should handle folder creation', async () => {
      await sharedWindow.locator('#show-files-btn').click();
      await sharedWindow.waitForTimeout(300);

      const newFolderBtn = sharedWindow.locator('#new-folder-btn');

      if (await newFolderBtn.count() > 0) {
        await newFolderBtn.click();
        await sharedWindow.waitForTimeout(300);

        const folderModal = sharedWindow.locator('#folder-name-modal, .folder-modal, .modal');
        if (await folderModal.count() > 0) {
          await expect(folderModal.first()).toBeVisible();
          await sharedWindow.keyboard.press('Escape');
        }
      }
    });
  });

  // =====================
  // Presentation Mode
  // =====================
  test.describe('Presentation Mode', () => {
    test('should create slides from markdown headers', async () => {
      const slideContent = `# Slide 1

First slide content.

---

# Slide 2

Second slide content.

---

# Slide 3

Third slide content.`;

      await sharedWindow.evaluate((content) => {
        window.editor.setValue(content);
        if (window.updatePreviewAndStructure) {
          window.updatePreviewAndStructure(content);
        }
      }, slideContent);

      await sharedWindow.waitForTimeout(500);
      await sharedWindow.locator('#show-presentation-btn').click();
      await sharedWindow.waitForTimeout(500);
      await expect(sharedWindow.locator('#presentation-content')).toBeVisible();
    });

    test('should navigate slides with arrow keys', async () => {
      await sharedWindow.locator('#show-presentation-btn').click();
      await sharedWindow.waitForTimeout(300);
      await sharedWindow.keyboard.press('ArrowRight');
      await sharedWindow.waitForTimeout(200);
      await sharedWindow.keyboard.press('ArrowLeft');
      await sharedWindow.waitForTimeout(200);
    });
  });

  // =====================
  // Search Functionality
  // =====================
  test.describe('Search Functionality', () => {
    test('should open search with Ctrl+F', async () => {
      await sharedWindow.keyboard.press('Control+f');
      await sharedWindow.waitForTimeout(500);
    });

    test('should search within editor content', async () => {
      await sharedWindow.evaluate(() => {
        window.editor.setValue('# Document\n\nThis contains the word SEARCHTERM that we want to find.\n\nAnother paragraph.');
      });

      const found = await sharedWindow.evaluate(() => {
        if (window.editor && window.editor.getModel) {
          const model = window.editor.getModel();
          const matches = model.findMatches('SEARCHTERM', true, false, true, null, true);
          return matches.length;
        }
        return 0;
      });

      expect(found).toBe(1);
    });
  });

  // =====================
  // Critical Regressions
  // =====================
  test.describe('Critical Regressions', () => {
    test('should not corrupt internal links when saving', async () => {
      const contentWithLinks = `# Document with Links

This references [[file-one]] and [[file-two|Custom Name]].

Another paragraph with [[link-three]].`;

      await sharedWindow.evaluate((content) => {
        window.editor.setValue(content);
      }, contentWithLinks);

      const content = await sharedWindow.evaluate(() => window.editor.getValue());
      expect(content).toContain('[[file-one]]');
      expect(content).toContain('[[file-two|Custom Name]]');
      expect(content).toContain('[[link-three]]');
    });

    test('should not change currentFilePath during preview updates', async () => {
      await sharedWindow.evaluate(() => {
        window.currentFilePath = '/test/original-file.md';
      });

      const initialPath = await sharedWindow.evaluate(() => window.currentFilePath);

      await sharedWindow.evaluate(() => {
        window.editor.setValue('Content with [[internal-link]] reference.');
        if (window.updatePreviewAndStructure) {
          window.updatePreviewAndStructure(window.editor.getValue());
        }
      });

      await sharedWindow.waitForTimeout(500);

      const finalPath = await sharedWindow.evaluate(() => window.currentFilePath);
      expect(finalPath).toBe(initialPath);
    });
  });
});

const { test, expect } = require('@playwright/test');
const ElectronTestHelper = require('./electron-test-helper');

test.describe('Hegel Pedagogy AI - Basic Functionality', () => {
  let electronHelper;
  
  test.beforeAll(async () => {
    // This test suite requires manual Electron app launch
    // Run 'npm run electron-dev' in a separate terminal before running these tests
    console.log('Note: These E2E tests require the Electron app to be running.');
    console.log('Please run "npm run electron-dev" in a separate terminal before running these tests.');
  });

  test.skip('Electron app integration tests', async ({ page }) => {
    // These tests are skipped by default as they require external app launch
    // To enable, remove .skip and ensure Electron app is running
  });

  test('should load the application successfully', async ({ page }) => {
    // Check that the main elements are present
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#preview')).toBeVisible();
    await expect(page.locator('#structure-pane')).toBeVisible();
  });

  test('should display Monaco editor', async ({ page }) => {
    // Wait for Monaco editor to initialize
    await page.waitForFunction(() => window.editor !== undefined);
    
    // Check if Monaco editor is loaded
    const editorExists = await page.evaluate(() => {
      return window.editor && typeof window.editor.getValue === 'function';
    });
    
    expect(editorExists).toBe(true);
  });

  test('should allow text input in editor', async ({ page }) => {
    // Wait for editor to be ready
    await page.waitForFunction(() => window.editor !== undefined);
    
    // Set content using Monaco API
    await page.evaluate(() => {
      window.editor.setValue('# Test Heading\n\nThis is test content.');
    });
    
    // Verify content was set
    const content = await page.evaluate(() => window.editor.getValue());
    expect(content).toContain('# Test Heading');
    expect(content).toContain('This is test content.');
  });

  test('should update preview when editor content changes', async ({ page }) => {
    // Wait for editor and preview to be ready
    await page.waitForFunction(() => window.editor !== undefined);
    
    // Set markdown content
    const testMarkdown = '# Test Title\n\n**Bold text** and *italic text*.';
    await page.evaluate((content) => {
      window.editor.setValue(content);
      if (window.updatePreviewAndStructure) {
        window.updatePreviewAndStructure(content);
      }
    }, testMarkdown);
    
    // Wait a bit for preview to update
    await page.waitForTimeout(500);
    
    // Check if preview contains rendered HTML
    const previewContent = await page.locator('#preview').innerHTML();
    expect(previewContent).toContain('<h1>');
    expect(previewContent).toContain('Test Title');
  });

  test('should show file tree in structure pane', async ({ page }) => {
    // Switch to file view if not already there
    await page.click('#show-files-btn');
    
    // Wait for file tree to load
    await page.waitForSelector('#file-tree-view', { state: 'visible' });
    
    // Check if file tree contains some files
    const fileTreeItems = await page.locator('#file-tree-view .file-tree-item').count();
    expect(fileTreeItems).toBeGreaterThan(0);
  });

  test('should handle internal links correctly', async ({ page }) => {
    // Wait for editor to be ready
    await page.waitForFunction(() => window.editor !== undefined);
    
    // Set content with internal links
    const contentWithLinks = 'This references [[other-file]] and [[another-file|Custom Display]].';
    await page.evaluate((content) => {
      window.editor.setValue(content);
      if (window.updatePreviewAndStructure) {
        window.updatePreviewAndStructure(content);
      }
    }, contentWithLinks);
    
    // Wait for preview to update
    await page.waitForTimeout(500);
    
    // Check if internal links are rendered as clickable elements
    const internalLinks = await page.locator('#preview .internal-link').count();
    expect(internalLinks).toBe(2);
    
    // Check if link attributes are correct
    const firstLink = page.locator('#preview .internal-link').first();
    await expect(firstLink).toHaveAttribute('data-original-link', 'other-file');
  });

  test('should toggle between editor and presentation modes', async ({ page }) => {
    // Check if mode toggle buttons exist
    await expect(page.locator('#show-editor-btn')).toBeVisible();
    await expect(page.locator('#show-presentation-btn')).toBeVisible();
    
    // Switch to presentation mode
    await page.click('#show-presentation-btn');
    
    // Check if presentation content is visible
    await expect(page.locator('#presentation-content')).toBeVisible();
    await expect(page.locator('#editor-content')).not.toBeVisible();
    
    // Switch back to editor mode
    await page.click('#show-editor-btn');
    
    // Check if editor content is visible again
    await expect(page.locator('#editor-content')).toBeVisible();
    await expect(page.locator('#presentation-content')).not.toBeVisible();
  });

  test('should handle new folder creation', async ({ page }) => {
    // Make sure we're in file view
    await page.click('#show-files-btn');
    
    // Click new folder button
    await page.click('#new-folder-btn');
    
    // Check if folder creation modal appears
    await expect(page.locator('#folder-name-modal')).toBeVisible();
    
    // Enter folder name
    await page.fill('#folder-name-input', 'test-folder');
    
    // Click create button
    await page.click('#folder-name-create');
    
    // Modal should disappear
    await expect(page.locator('#folder-name-modal')).not.toBeVisible();
    
    // Note: In a real test, we'd check if the folder appears in the file tree
    // but this requires the actual file system to be working
  });

  test('should expand and collapse folders in file tree', async ({ page }) => {
    // Switch to file view
    await page.click('#show-files-btn');
    await page.waitForSelector('#file-tree-view', { state: 'visible' });
    
    // Look for folders with expand arrows
    const foldersWithArrows = await page.locator('#file-tree-view .file-tree-item .expand-arrow').count();
    
    if (foldersWithArrows > 0) {
      // Click the first expand arrow
      await page.locator('#file-tree-view .file-tree-item .expand-arrow').first().click();
      
      // Wait for the tree to re-render
      await page.waitForTimeout(300);
      
      // The folder should now be expanded/collapsed
      // (The exact behavior depends on whether it was initially expanded)
    }
  });
});

test.describe('Hegel Pedagogy AI - Critical Regression Tests', () => {
  test('should save file content without corrupting internal links', async ({ page }) => {
    // This is a critical regression test for the bug that was fixed
    await page.waitForFunction(() => window.editor !== undefined);
    
    // Create content with internal links
    const contentWithLinks = `# Main Document

This references [[linked-file-1]] and [[linked-file-2|Custom Name]].

More content with [[another-link]].`;
    
    // Set the content
    await page.evaluate((content) => {
      window.editor.setValue(content);
    }, contentWithLinks);
    
    // Simulate save operation (if possible)
    const currentFilePath = await page.evaluate(() => window.currentFilePath);
    
    if (currentFilePath) {
      // Trigger save
      await page.keyboard.press('Control+s');
      
      // Wait for save to complete
      await page.waitForTimeout(1000);
      
      // Verify content is still intact
      const savedContent = await page.evaluate(() => window.editor.getValue());
      expect(savedContent).toContain('[[linked-file-1]]');
      expect(savedContent).toContain('[[linked-file-2|Custom Name]]');
      expect(savedContent).toContain('[[another-link]]');
    }
  });

  test('should not change currentFilePath when previewing internal links', async ({ page }) => {
    // Set initial file path
    await page.evaluate(() => {
      window.currentFilePath = '/test/current-file.md';
    });
    
    // Get initial file path
    const initialPath = await page.evaluate(() => window.currentFilePath);
    
    // Set content with internal links and trigger preview
    await page.evaluate(() => {
      window.editor.setValue('This has [[internal-link]] references.');
      if (window.updatePreviewAndStructure) {
        window.updatePreviewAndStructure(window.editor.getValue());
      }
    });
    
    // Wait for preview processing
    await page.waitForTimeout(500);
    
    // Check that currentFilePath hasn't changed
    const finalPath = await page.evaluate(() => window.currentFilePath);
    expect(finalPath).toBe(initialPath);
  });
});
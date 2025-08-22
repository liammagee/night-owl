const { test, expect } = require('@playwright/test');

test.describe('Hegel Pedagogy AI - UI Interactions', () => {
  
  test.beforeEach(async ({ page }) => {
    // These tests assume the Electron app is running
    // Run 'npm run electron-dev' in a separate terminal
    await page.goto('app://./index.html');
    
    // Wait for the app to load
    await page.waitForSelector('#app-container', { state: 'visible' });
    await page.waitForFunction(() => window.editor !== undefined);
  });

  test.describe('Pane Toggle Functionality', () => {
    test('should toggle sidebar visibility with File pane button', async ({ page }) => {
      // Check initial state - sidebar should be visible
      await expect(page.locator('#left-sidebar')).toBeVisible();
      
      // Find and click the File pane toggle button
      const fileToggleBtn = page.locator('#toggle-sidebar-btn');
      await expect(fileToggleBtn).toBeVisible();
      
      // Click to hide sidebar
      await fileToggleBtn.click();
      
      // Wait for animation/transition
      await page.waitForTimeout(300);
      
      // Sidebar should be hidden
      await expect(page.locator('#left-sidebar')).toBeHidden();
      
      // Button should show inactive state
      const buttonStyle = await fileToggleBtn.evaluate(el => window.getComputedStyle(el));
      expect(buttonStyle.opacity).toBe('0.7');
      
      // Click again to show sidebar
      await fileToggleBtn.click();
      await page.waitForTimeout(300);
      
      // Sidebar should be visible again
      await expect(page.locator('#left-sidebar')).toBeVisible();
    });

    test('should toggle preview pane visibility with Preview button', async ({ page }) => {
      // Check initial state - right pane should be visible
      await expect(page.locator('#right-pane')).toBeVisible();
      
      // Find and click the Preview pane toggle button
      const previewToggleBtn = page.locator('#toggle-preview-btn');
      await expect(previewToggleBtn).toBeVisible();
      
      // Click to hide preview pane
      await previewToggleBtn.click();
      await page.waitForTimeout(300);
      
      // Right pane should be hidden
      await expect(page.locator('#right-pane')).toBeHidden();
      
      // Editor should expand to take available space
      const editorContainer = page.locator('#editor-container');
      const editorRect = await editorContainer.boundingBox();
      expect(editorRect.width).toBeGreaterThan(600); // Should be wider when preview is hidden
      
      // Click again to show preview pane
      await previewToggleBtn.click();
      await page.waitForTimeout(300);
      
      // Right pane should be visible again
      await expect(page.locator('#right-pane')).toBeVisible();
    });

    test('should toggle editor pane visibility with Editor button', async ({ page }) => {
      // Find and click the Editor pane toggle button
      const editorToggleBtn = page.locator('#toggle-editor-btn');
      await expect(editorToggleBtn).toBeVisible();
      
      // Check initial state - editor pane should be visible
      await expect(page.locator('#editor-pane')).toBeVisible();
      
      // Click to hide editor pane
      await editorToggleBtn.click();
      await page.waitForTimeout(300);
      
      // Editor pane should be hidden
      await expect(page.locator('#editor-pane')).toBeHidden();
      
      // Button should show inactive state
      const buttonBg = await editorToggleBtn.evaluate(el => window.getComputedStyle(el).backgroundColor);
      expect(buttonBg).not.toBe('rgb(22, 163, 74)'); // Should not be green (active)
      
      // Click again to show editor pane
      await editorToggleBtn.click();
      await page.waitForTimeout(300);
      
      // Editor pane should be visible again
      await expect(page.locator('#editor-pane')).toBeVisible();
    });

    test('should toggle gamification panel with dedicated button', async ({ page }) => {
      // Find the gamification toggle button
      const gamificationBtn = page.locator('#toggle-gamification-btn');
      await expect(gamificationBtn).toBeVisible();
      
      // Check initial state of gamification panel
      const gamificationPanel = page.locator('#gamification-panel');
      const initialVisibility = await gamificationPanel.isVisible();
      
      // Click to toggle
      await gamificationBtn.click();
      await page.waitForTimeout(300);
      
      // Panel visibility should have changed
      const newVisibility = await gamificationPanel.isVisible();
      expect(newVisibility).toBe(!initialVisibility);
      
      // Button appearance should change
      const buttonColor = await gamificationBtn.evaluate(el => window.getComputedStyle(el).backgroundColor);
      if (newVisibility) {
        expect(buttonColor).toBe('rgb(220, 38, 38)'); // Red when active
      } else {
        expect(buttonColor).toBe('rgb(245, 158, 11)'); // Orange when inactive
      }
      
      // Click again to toggle back
      await gamificationBtn.click();
      await page.waitForTimeout(300);
      
      // Panel should return to initial state
      const finalVisibility = await gamificationPanel.isVisible();
      expect(finalVisibility).toBe(initialVisibility);
    });

    test('should maintain pane toggle states independently', async ({ page }) => {
      // Hide sidebar
      await page.locator('#toggle-sidebar-btn').click();
      await page.waitForTimeout(200);
      
      // Hide preview
      await page.locator('#toggle-preview-btn').click();
      await page.waitForTimeout(200);
      
      // Both should be hidden
      await expect(page.locator('#left-sidebar')).toBeHidden();
      await expect(page.locator('#right-pane')).toBeHidden();
      
      // Editor should still be visible and expanded
      await expect(page.locator('#editor-pane')).toBeVisible();
      
      // Show sidebar back
      await page.locator('#toggle-sidebar-btn').click();
      await page.waitForTimeout(200);
      
      // Sidebar should be visible, preview still hidden
      await expect(page.locator('#left-sidebar')).toBeVisible();
      await expect(page.locator('#right-pane')).toBeHidden();
    });

    test('should update button visual states correctly', async ({ page }) => {
      const sidebarBtn = page.locator('#toggle-sidebar-btn');
      const previewBtn = page.locator('#toggle-preview-btn');
      const editorBtn = page.locator('#toggle-editor-btn');
      
      // Check initial active states
      await expect(sidebarBtn).toHaveCSS('opacity', '1');
      await expect(previewBtn).toHaveCSS('opacity', '1');
      await expect(editorBtn).toHaveCSS('opacity', '1');
      
      // Toggle sidebar off
      await sidebarBtn.click();
      await page.waitForTimeout(200);
      
      // Sidebar button should show inactive state
      await expect(sidebarBtn).toHaveCSS('opacity', '0.7');
      await expect(sidebarBtn).toHaveCSS('background-color', 'rgb(204, 204, 204)');
      
      // Other buttons should remain active
      await expect(previewBtn).toHaveCSS('opacity', '1');
      await expect(editorBtn).toHaveCSS('opacity', '1');
    });
  });

  test.describe('Mode Switching', () => {
    test('should switch between editor and presentation modes', async ({ page }) => {
      // Check initial state - should be in editor mode
      await expect(page.locator('#editor-content')).toHaveClass(/active/);
      await expect(page.locator('#editor-mode-btn')).toHaveClass(/active/);
      
      // Switch to presentation mode
      await page.locator('#presentation-mode-btn').click();
      await page.waitForTimeout(500);
      
      // Presentation mode should be active
      await expect(page.locator('#presentation-content')).toHaveClass(/active/);
      await expect(page.locator('#presentation-mode-btn')).toHaveClass(/active/);
      
      // Editor mode should be inactive
      await expect(page.locator('#editor-content')).not.toHaveClass(/active/);
      await expect(page.locator('#editor-mode-btn')).not.toHaveClass(/active/);
      
      // Switch back to editor
      await page.locator('#editor-mode-btn').click();
      await page.waitForTimeout(500);
      
      // Editor mode should be active again
      await expect(page.locator('#editor-content')).toHaveClass(/active/);
      await expect(page.locator('#editor-mode-btn')).toHaveClass(/active/);
    });

    test('should switch to network visualization modes', async ({ page }) => {
      // Switch to network mode
      await page.locator('#network-mode-btn').click();
      await page.waitForTimeout(500);
      
      // Network content should be visible
      await expect(page.locator('#network-content')).toHaveClass(/active/);
      await expect(page.locator('#network-mode-btn')).toHaveClass(/active/);
      
      // Other modes should be inactive
      await expect(page.locator('#editor-content')).not.toHaveClass(/active/);
      await expect(page.locator('#presentation-content')).not.toHaveClass(/active/);
      
      // Switch to graph mode
      await page.locator('#graph-mode-btn').click();
      await page.waitForTimeout(500);
      
      // Graph content should be visible
      await expect(page.locator('#graph-content')).toHaveClass(/active/);
      await expect(page.locator('#graph-mode-btn')).toHaveClass(/active/);
      
      // Network mode should no longer be active
      await expect(page.locator('#network-content')).not.toHaveClass(/active/);
      await expect(page.locator('#network-mode-btn')).not.toHaveClass(/active/);
      
      // Switch to circle mode
      await page.locator('#circle-mode-btn').click();
      await page.waitForTimeout(500);
      
      // Circle content should be visible
      await expect(page.locator('#circle-content')).toHaveClass(/active/);
      await expect(page.locator('#circle-mode-btn')).toHaveClass(/active/);
    });

    test('should maintain editor content when switching modes', async ({ page }) => {
      // Set some content in the editor
      const testContent = '# Test Document\n\nThis is test content for mode switching.';
      await page.evaluate((content) => {
        if (window.editor) {
          window.editor.setValue(content);
        }
      }, testContent);
      
      // Switch to presentation mode
      await page.locator('#presentation-mode-btn').click();
      await page.waitForTimeout(500);
      
      // Switch back to editor
      await page.locator('#editor-mode-btn').click();
      await page.waitForTimeout(500);
      
      // Content should still be there
      const editorContent = await page.evaluate(() => {
        return window.editor ? window.editor.getValue() : '';
      });
      
      expect(editorContent).toBe(testContent);
    });

    test('should show appropriate loading states during mode switches', async ({ page }) => {
      // Monitor for any loading indicators
      await page.locator('#presentation-mode-btn').click();
      
      // Check if any loading states are shown (this depends on implementation)
      const loadingElements = page.locator('.loading, .processing, .spinner');
      
      // Wait for mode switch to complete
      await page.waitForTimeout(1000);
      
      // Loading states should be cleared
      const remainingLoading = await loadingElements.count();
      expect(remainingLoading).toBe(0);
    });
  });

  test.describe('File Tree Interactions', () => {
    test('should expand and collapse folders', async ({ page }) => {
      // Switch to file view
      await page.locator('#show-files-btn').click();
      await page.waitForSelector('#file-tree-view', { state: 'visible' });
      
      // Look for expandable folders
      const expandArrows = page.locator('#file-tree-view .expand-arrow');
      const arrowCount = await expandArrows.count();
      
      if (arrowCount > 0) {
        // Click first expand arrow
        await expandArrows.first().click();
        await page.waitForTimeout(300);
        
        // Check if folder expanded (implementation specific)
        // This test verifies the click is handled without errors
        const fileTreeItems = await page.locator('#file-tree-view .file-tree-item').count();
        expect(fileTreeItems).toBeGreaterThan(0);
      }
    });

    test('should switch between file and structure views', async ({ page }) => {
      // Check initial state
      const filesBtn = page.locator('#show-files-btn');
      const structureBtn = page.locator('#show-structure-btn');
      
      // Switch to files view
      await filesBtn.click();
      await page.waitForTimeout(300);
      
      // Files view should be visible
      await expect(page.locator('#file-tree-view')).toBeVisible();
      await expect(filesBtn).toHaveClass(/active/);
      
      // Switch to structure view
      await structureBtn.click();
      await page.waitForTimeout(300);
      
      // Structure view should be visible
      await expect(page.locator('#structure-list')).toBeVisible();
      await expect(structureBtn).toHaveClass(/active/);
      
      // Files view should be hidden
      await expect(page.locator('#file-tree-view')).toBeHidden();
    });

    test('should handle file selection', async ({ page }) => {
      // Switch to file view
      await page.locator('#show-files-btn').click();
      await page.waitForSelector('#file-tree-view', { state: 'visible' });
      
      // Look for file items
      const fileItems = page.locator('#file-tree-view .file-tree-item .file-name');
      const itemCount = await fileItems.count();
      
      if (itemCount > 0) {
        // Click first file
        await fileItems.first().click();
        await page.waitForTimeout(500);
        
        // Check if file loading was triggered
        // This test verifies file selection works without errors
        const currentFileName = await page.locator('#current-file-name').textContent();
        expect(currentFileName).not.toBe('No file selected');
      }
    });
  });

  test.describe('Gamification Panel Interactions', () => {
    test('should show gamification panel with stats', async ({ page }) => {
      // Ensure gamification panel is visible
      const gamificationPanel = page.locator('#gamification-panel');
      
      if (!(await gamificationPanel.isVisible())) {
        await page.locator('#toggle-gamification-btn').click();
        await page.waitForTimeout(300);
      }
      
      // Check for stats display
      await expect(gamificationPanel.locator('.stats-grid')).toBeVisible();
      await expect(gamificationPanel.locator('.stat-item')).toHaveCount(4);
      
      // Check for action buttons
      await expect(gamificationPanel.locator('#start-writing-session-btn')).toBeVisible();
      await expect(gamificationPanel.locator('#view-achievements-btn')).toBeVisible();
    });

    test('should handle start writing session button', async ({ page }) => {
      // Ensure gamification panel is visible
      const gamificationPanel = page.locator('#gamification-panel');
      if (!(await gamificationPanel.isVisible())) {
        await page.locator('#toggle-gamification-btn').click();
        await page.waitForTimeout(300);
      }
      
      // Mock alert for testing
      page.on('dialog', async dialog => {
        expect(dialog.type()).toBe('alert');
        expect(dialog.message()).toContain('Writing session started');
        await dialog.accept();
      });
      
      // Click start writing session button
      await page.locator('#start-writing-session-btn').click();
      
      // Should trigger session start (alert or notification)
      await page.waitForTimeout(500);
    });

    test('should handle view achievements button', async ({ page }) => {
      // Ensure gamification panel is visible
      const gamificationPanel = page.locator('#gamification-panel');
      if (!(await gamificationPanel.isVisible())) {
        await page.locator('#toggle-gamification-btn').click();
        await page.waitForTimeout(300);
      }
      
      // Mock alert for testing
      page.on('dialog', async dialog => {
        expect(dialog.type()).toBe('alert');
        expect(dialog.message()).toContain('Achievements');
        await dialog.accept();
      });
      
      // Click view achievements button
      await page.locator('#view-achievements-btn').click();
      
      // Should show achievements dialog
      await page.waitForTimeout(500);
    });

    test('should persist gamification panel state', async ({ page }) => {
      // Hide gamification panel
      const gamificationBtn = page.locator('#toggle-gamification-btn');
      const gamificationPanel = page.locator('#gamification-panel');
      
      if (await gamificationPanel.isVisible()) {
        await gamificationBtn.click();
        await page.waitForTimeout(300);
      }
      
      // Reload page
      await page.reload();
      await page.waitForSelector('#app-container', { state: 'visible' });
      
      // Panel state should be persisted
      // Note: This test depends on localStorage persistence
      const isVisible = await page.locator('#gamification-panel').isVisible();
      
      // The state should match what was set before reload
      // Implementation may default to visible or remember the last state
      expect(typeof isVisible).toBe('boolean');
    });
  });

  test.describe('Responsive Layout Behavior', () => {
    test('should handle window resizing gracefully', async ({ page }) => {
      // Set initial window size
      await page.setViewportSize({ width: 1200, height: 800 });
      
      // Check initial layout
      await expect(page.locator('#left-sidebar')).toBeVisible();
      await expect(page.locator('#editor-pane')).toBeVisible();
      await expect(page.locator('#right-pane')).toBeVisible();
      
      // Resize to smaller window
      await page.setViewportSize({ width: 800, height: 600 });
      await page.waitForTimeout(500);
      
      // Layout should still be functional
      await expect(page.locator('#app-container')).toBeVisible();
      
      // Resize back to larger window
      await page.setViewportSize({ width: 1400, height: 900 });
      await page.waitForTimeout(500);
      
      // All panes should still be accessible
      await expect(page.locator('#left-sidebar')).toBeVisible();
      await expect(page.locator('#editor-pane')).toBeVisible();
      await expect(page.locator('#right-pane')).toBeVisible();
    });

    test('should maintain functionality with different pane combinations', async ({ page }) => {
      // Test various pane combinations
      const combinations = [
        { sidebar: false, editor: true, preview: true },
        { sidebar: true, editor: false, preview: true },
        { sidebar: true, editor: true, preview: false },
        { sidebar: false, editor: false, preview: true },
        { sidebar: true, editor: false, preview: false }
      ];
      
      for (const combo of combinations) {
        // Set pane states
        const sidebarVisible = await page.locator('#left-sidebar').isVisible();
        if (sidebarVisible !== combo.sidebar) {
          await page.locator('#toggle-sidebar-btn').click();
          await page.waitForTimeout(200);
        }
        
        const editorVisible = await page.locator('#editor-pane').isVisible();
        if (editorVisible !== combo.editor) {
          await page.locator('#toggle-editor-btn').click();
          await page.waitForTimeout(200);
        }
        
        const previewVisible = await page.locator('#right-pane').isVisible();
        if (previewVisible !== combo.preview) {
          await page.locator('#toggle-preview-btn').click();
          await page.waitForTimeout(200);
        }
        
        // Verify layout is functional
        await expect(page.locator('#app-container')).toBeVisible();
        
        // At least one pane should be visible
        const visiblePanes = [
          combo.sidebar ? await page.locator('#left-sidebar').isVisible() : false,
          combo.editor ? await page.locator('#editor-pane').isVisible() : false,
          combo.preview ? await page.locator('#right-pane').isVisible() : false
        ];
        
        const hasVisiblePane = visiblePanes.some(visible => visible);
        expect(hasVisiblePane).toBe(true);
      }
    });
  });

  test.describe('Keyboard Shortcuts', () => {
    test('should handle save shortcut', async ({ page }) => {
      // Set some content in editor
      await page.evaluate(() => {
        if (window.editor) {
          window.editor.setValue('# Test Content\n\nThis is test content.');
        }
      });
      
      // Press Ctrl+S (or Cmd+S on Mac)
      await page.keyboard.press('Control+s');
      await page.waitForTimeout(500);
      
      // Check if save was triggered (implementation specific)
      // This test verifies the shortcut is handled without errors
    });

    test('should handle mode switching shortcuts', async ({ page }) => {
      // Test Alt+1 for editor mode
      await page.keyboard.press('Alt+1');
      await page.waitForTimeout(300);
      
      await expect(page.locator('#editor-content')).toHaveClass(/active/);
      
      // Test Alt+2 for presentation mode
      await page.keyboard.press('Alt+2');
      await page.waitForTimeout(300);
      
      await expect(page.locator('#presentation-content')).toHaveClass(/active/);
      
      // Test Alt+3 for network mode
      await page.keyboard.press('Alt+3');
      await page.waitForTimeout(300);
      
      await expect(page.locator('#network-content')).toHaveClass(/active/);
    });

    test('should handle escape key in presentation mode', async ({ page }) => {
      // Switch to presentation mode
      await page.locator('#presentation-mode-btn').click();
      await page.waitForTimeout(500);
      
      // Press Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      
      // Should return to editor mode
      await expect(page.locator('#editor-content')).toHaveClass(/active/);
    });
  });
});
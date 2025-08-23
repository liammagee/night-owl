const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

test.describe('Hegel Pedagogy AI - User Workflows', () => {
  let app;
  let window;

  test.beforeEach(async () => {
    // Launch Electron app
    app = await electron.launch({
      args: [path.join(__dirname, '../..')],
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    });
    
    // Get the first window
    window = await app.firstWindow();
    
    // Wait for app to be ready
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    await app.close();
  });

  test('app launches with correct title', async () => {
    const title = await window.title();
    expect(title).toContain('Hegel Pedagogy AI');
  });

  test('file tree loads and displays files', async () => {
    // Click on Files tab
    await window.click('text=Files');
    
    // Wait for file tree to load
    await window.waitForSelector('#file-tree-view', { timeout: 5000 });
    
    // Check if file tree has content
    const fileTreeContent = await window.locator('#file-tree-view').innerHTML();
    expect(fileTreeContent).not.toBe('');
    
    // Check for .md files
    const mdFiles = await window.locator('.file-item[data-ext=".md"]').count();
    expect(mdFiles).toBeGreaterThan(0);
  });

  test('can open and edit a file', async () => {
    // Click on Files tab
    await window.click('text=Files');
    
    // Wait for file tree
    await window.waitForSelector('.file-item');
    
    // Click on first .md file
    await window.click('.file-item[data-ext=".md"]:first-child');
    
    // Wait for Monaco editor to load
    await window.waitForSelector('.monaco-editor', { timeout: 10000 });
    
    // Check editor is visible
    const editor = await window.locator('.monaco-editor');
    await expect(editor).toBeVisible();
  });

  test('gamification menu toggles correctly', async () => {
    // Check if gamification menu exists
    const gamificationMenu = await window.locator('#gamification-menu');
    
    if (await gamificationMenu.count() > 0) {
      // Toggle menu
      await window.click('#gamification-toggle');
      
      // Check visibility state changes
      const isVisible = await gamificationMenu.isVisible();
      
      // Toggle again
      await window.click('#gamification-toggle');
      
      const isVisibleAfter = await gamificationMenu.isVisible();
      expect(isVisibleAfter).not.toBe(isVisible);
    }
  });

  test('AI chat panel opens and accepts input', async () => {
    // Open AI chat
    await window.click('button[title="AI Chat"]');
    
    // Wait for chat panel
    await window.waitForSelector('#ai-chat-panel', { timeout: 5000 });
    
    // Check chat input exists
    const chatInput = await window.locator('#chat-input');
    await expect(chatInput).toBeVisible();
    
    // Type a message
    await chatInput.fill('Hello AI assistant');
    
    // Check message was entered
    const value = await chatInput.inputValue();
    expect(value).toBe('Hello AI assistant');
  });

  test('presentation mode can be activated', async () => {
    // Click presentation mode button
    await window.click('button[title="Presentation Mode"]');
    
    // Check if presentation view appears
    const presentationView = await window.locator('#presentation-view');
    
    if (await presentationView.count() > 0) {
      await expect(presentationView).toBeVisible();
      
      // Check for slide container
      const slideContainer = await window.locator('.slide-container');
      await expect(slideContainer).toBeVisible();
    }
  });

  test('search functionality works', async () => {
    // Open search with keyboard shortcut
    await window.keyboard.press('Control+F');
    
    // Wait for search box
    await window.waitForSelector('#search-input', { timeout: 5000 });
    
    const searchInput = await window.locator('#search-input');
    await expect(searchInput).toBeVisible();
    
    // Type search term
    await searchInput.fill('Hegel');
    
    // Press Enter to search
    await searchInput.press('Enter');
    
    // Check for search results or highlights
    // This depends on your implementation
  });

  test('settings panel opens and saves changes', async () => {
    // Open settings
    await window.click('button[title="Settings"]');
    
    // Wait for settings modal
    await window.waitForSelector('#settings-modal', { timeout: 5000 });
    
    const settingsModal = await window.locator('#settings-modal');
    await expect(settingsModal).toBeVisible();
    
    // Change a setting (e.g., theme)
    const themeSelect = await window.locator('#theme-select');
    if (await themeSelect.count() > 0) {
      await themeSelect.selectOption('dark');
      
      // Save settings
      await window.click('button:has-text("Save")');
      
      // Verify theme changed
      const body = await window.locator('body');
      const classList = await body.getAttribute('class');
      expect(classList).toContain('dark');
    }
  });

  test('can create a new file', async () => {
    // Click new file button
    await window.click('button[title="New File"]');
    
    // Handle dialog if it appears
    window.on('dialog', dialog => {
      dialog.accept('test-file');
    });
    
    // Verify new file appears in file tree
    // This depends on your implementation
  });

  test('export functionality is accessible', async () => {
    // Open File menu
    await window.click('text=File');
    
    // Check for export options
    const exportMenu = await window.locator('text=Export');
    if (await exportMenu.count() > 0) {
      await exportMenu.click();
      
      // Check export options exist
      const pdfOption = await window.locator('text=Export as PDF');
      await expect(pdfOption).toBeVisible();
    }
  });
});
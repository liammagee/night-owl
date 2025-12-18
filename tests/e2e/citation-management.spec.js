const { test, expect, _electron: electron } = require('@playwright/test');

test.describe('Citation Management System', () => {
  let electronApp;
  let window;

  test.beforeAll(async () => {
    // Launch the Electron app
    // Create clean environment without ELECTRON_RUN_AS_NODE (conflicts with Electron GUI mode)
    const { ELECTRON_RUN_AS_NODE, ...cleanEnv } = process.env;
    electronApp = await electron.launch({ args: ['.'], env: { ...cleanEnv, NODE_ENV: 'test' } });
    window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    // Close the app
    await electronApp.close();
  });

  test('should open the citation manager UI', async () => {
    // Replace with the actual button/menu item selector
    const citationButton = window.locator('#citation-manager-button');
    await citationButton.click();

    const citationPanel = window.locator('#citation-manager-panel');
    await expect(citationPanel).toBeVisible();
  });

  test('should allow adding a new citation', async () => {
    // Assuming the citation manager is already open from the previous test or we reopen it
    await window.locator('#citation-manager-button').click();

    // Fill out the form for a new citation
    await window.locator('#citation-form-author').fill('Hegel, G.W.F.');
    await window.locator('#citation-form-title').fill('Phenomenology of Spirit');
    await window.locator('#citation-form-year').fill('1807');
    await window.locator('#add-citation-button').click();

    // Verify the citation appears in the list
    const citationList = window.locator('#citation-list');
    await expect(citationList).toContainText('Hegel, G.W.F. (1807)');
  });

  test('should insert a citation into the editor', async () => {
    // This is a more complex test that might require mocking the editor
    // For now, we'll just check if the button exists and is clickable
    
    // Assuming a citation is selected
    await window.locator('.citation-item').first().click();
    
    const insertButton = window.locator('#insert-citation-button');
    await expect(insertButton).toBeEnabled();
    await insertButton.click();

    // In a full test, you would then assert that the editor content has been updated
    // e.g., expect(await getEditorContent()).toContain('[@Hegel1807]');
  });
});
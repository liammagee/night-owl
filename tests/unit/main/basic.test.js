// Basic test to verify test setup works
describe('Basic Test Setup', () => {
  test('should run basic assertions', () => {
    expect(1 + 1).toBe(2);
    expect('hello').toBe('hello');
    expect([1, 2, 3]).toHaveLength(3);
  });

  test('should have access to Node.js environment', () => {
    expect(typeof process).toBe('object');
    expect(process.env).toBeDefined();
  });

  test('should have mocked Electron APIs', () => {
    const { app, BrowserWindow, ipcMain } = require('electron');
    
    expect(app).toBeDefined();
    expect(app.getName).toBeDefined();
    expect(BrowserWindow).toBeDefined();
    expect(ipcMain).toBeDefined();
  });
});
// Basic test to verify renderer setup works
describe('Basic Renderer Test Setup', () => {
  test('should run basic assertions', () => {
    expect(1 + 1).toBe(2);
    expect('hello').toBe('hello');
  });

  test('should have access to DOM environment', () => {
    expect(typeof document).toBe('object');
    expect(typeof window).toBe('object');
    expect(document.createElement).toBeDefined();
  });

  test('should have mocked electronAPI', () => {
    expect(global.electronAPI).toBeDefined();
    expect(global.electronAPI.invoke).toBeDefined();
    expect(typeof global.electronAPI.invoke).toBe('function');
  });

  test('should have mocked Monaco editor', () => {
    expect(global.monaco).toBeDefined();
    expect(global.monaco.editor).toBeDefined();
    expect(global.monaco.editor.create).toBeDefined();
  });

  test('should have mocked DOM getElementById', () => {
    const element = document.getElementById('test-element');
    expect(element).toBeDefined();
    expect(element.style).toBeDefined();
  });
});
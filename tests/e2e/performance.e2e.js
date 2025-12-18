const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

test.describe('Performance Tests', () => {
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
    await window.waitForLoadState('networkidle');
  });

  test.afterEach(async () => {
    await app.close();
  });

  test('app launches within acceptable time', async () => {
    const startTime = Date.now();
    
    // Wait for main elements to be visible
    await window.waitForSelector('.monaco-editor', { timeout: 10000 });
    await window.waitForSelector('#file-tree-view', { timeout: 10000 });
    
    const loadTime = Date.now() - startTime;
    
    // App should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
    
    console.log(`App load time: ${loadTime}ms`);
  });

  test('file tree renders efficiently with many files', async () => {
    const startTime = Date.now();
    
    // Click Files tab
    await window.click('text=Files');
    
    // Wait for file tree to render
    await window.waitForSelector('.file-item');
    
    const renderTime = Date.now() - startTime;
    
    // File tree should render within 1 second
    expect(renderTime).toBeLessThan(1000);
    
    // Count rendered items
    const fileCount = await window.locator('.file-item').count();
    console.log(`Rendered ${fileCount} files in ${renderTime}ms`);
  });

  test('editor handles large files efficiently', async () => {
    // Create a large text content
    const largeContent = 'Lorem ipsum '.repeat(10000); // ~120KB of text
    
    // Measure time to set content
    const startTime = Date.now();
    
    // This would need to be adapted to your app's method of setting editor content
    await window.evaluate((content) => {
      if (window.editor && window.editor.setValue) {
        window.editor.setValue(content);
      }
    }, largeContent);
    
    const setContentTime = Date.now() - startTime;
    
    // Should handle large content within 2 seconds
    expect(setContentTime).toBeLessThan(2000);
    
    console.log(`Set large content in ${setContentTime}ms`);
  });

  test('search performs well with multiple results', async () => {
    // Open search
    await window.keyboard.press('Control+F');
    await window.waitForSelector('#search-input');
    
    const searchInput = await window.locator('#search-input');
    
    const startTime = Date.now();
    
    // Search for common term
    await searchInput.fill('the');
    await searchInput.press('Enter');
    
    // Wait for search to complete (adjust selector as needed)
    await window.waitForTimeout(500); // Give search time to complete
    
    const searchTime = Date.now() - startTime;
    
    // Search should complete within 1 second
    expect(searchTime).toBeLessThan(1000);
    
    console.log(`Search completed in ${searchTime}ms`);
  });

  test('memory usage stays within limits', async () => {
    // Get initial memory usage
    const initialMemory = await window.evaluate(() => {
      if (performance.memory) {
        return performance.memory.usedJSHeapSize;
      }
      return 0;
    });
    
    // Perform various operations
    await window.click('text=Files');
    await window.waitForSelector('.file-item');
    
    // Open multiple files
    const files = await window.locator('.file-item').all();
    for (let i = 0; i < Math.min(5, files.length); i++) {
      await files[i].click();
      await window.waitForTimeout(200);
    }
    
    // Get final memory usage
    const finalMemory = await window.evaluate(() => {
      if (performance.memory) {
        return performance.memory.usedJSHeapSize;
      }
      return 0;
    });
    
    const memoryIncrease = finalMemory - initialMemory;
    const memoryIncreaseMB = memoryIncrease / (1024 * 1024);
    
    // Memory increase should be less than 50MB for basic operations
    expect(memoryIncreaseMB).toBeLessThan(50);
    
    console.log(`Memory increased by ${memoryIncreaseMB.toFixed(2)}MB`);
  });

  test('rendering performance metrics', async () => {
    // Collect performance metrics
    const metrics = await window.evaluate(() => {
      const paintMetrics = performance.getEntriesByType('paint');
      const navigationMetrics = performance.getEntriesByType('navigation')[0];
      
      return {
        firstPaint: paintMetrics.find(m => m.name === 'first-paint')?.startTime,
        firstContentfulPaint: paintMetrics.find(m => m.name === 'first-contentful-paint')?.startTime,
        domContentLoaded: navigationMetrics?.domContentLoadedEventEnd - navigationMetrics?.domContentLoadedEventStart,
        loadComplete: navigationMetrics?.loadEventEnd - navigationMetrics?.loadEventStart
      };
    });
    
    console.log('Performance Metrics:', metrics);
    
    // First paint should happen within 1 second
    if (metrics.firstPaint) {
      expect(metrics.firstPaint).toBeLessThan(1000);
    }
    
    // First contentful paint should happen within 1.5 seconds
    if (metrics.firstContentfulPaint) {
      expect(metrics.firstContentfulPaint).toBeLessThan(1500);
    }
  });

  test('smooth scrolling performance', async () => {
    // Open a file with content
    await window.click('text=Files');
    await window.click('.file-item:first-child');
    
    // Wait for editor
    await window.waitForSelector('.monaco-editor');
    
    // Measure scroll performance
    const startTime = Date.now();
    
    // Scroll down
    for (let i = 0; i < 10; i++) {
      await window.keyboard.press('PageDown');
      await window.waitForTimeout(50);
    }
    
    const scrollTime = Date.now() - startTime;
    const avgScrollTime = scrollTime / 10;
    
    // Average scroll should be smooth (< 100ms per scroll)
    expect(avgScrollTime).toBeLessThan(100);
    
    console.log(`Average scroll time: ${avgScrollTime}ms`);
  });

  test('network requests are optimized', async () => {
    // Monitor network requests
    const requests = [];
    
    window.on('request', request => {
      requests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType()
      });
    });
    
    // Navigate through app
    await window.click('text=Files');
    await window.waitForTimeout(1000);
    
    // Check for duplicate requests
    const urlCounts = {};
    requests.forEach(req => {
      urlCounts[req.url] = (urlCounts[req.url] || 0) + 1;
    });
    
    // No URL should be requested more than once (except for legitimate polling)
    Object.entries(urlCounts).forEach(([url, count]) => {
      if (!url.includes('polling') && !url.includes('heartbeat')) {
        expect(count).toBeLessThanOrEqual(1);
      }
    });
    
    console.log(`Total network requests: ${requests.length}`);
  });

  test('animations run at 60fps', async () => {
    // Open settings modal (which might have animations)
    await window.click('button[title="Settings"]');
    await window.waitForSelector('#settings-modal');
    
    // Check animation frame rate
    const fps = await window.evaluate(() => {
      return new Promise(resolve => {
        let frameCount = 0;
        let lastTime = performance.now();
        const frameRates = [];
        
        function measureFrame() {
          frameCount++;
          const currentTime = performance.now();
          const delta = currentTime - lastTime;
          
          if (delta > 0) {
            frameRates.push(1000 / delta);
          }
          
          lastTime = currentTime;
          
          if (frameCount < 60) {
            requestAnimationFrame(measureFrame);
          } else {
            const avgFps = frameRates.reduce((a, b) => a + b, 0) / frameRates.length;
            resolve(avgFps);
          }
        }
        
        requestAnimationFrame(measureFrame);
      });
    });
    
    // Should maintain close to 60fps
    expect(fps).toBeGreaterThan(50);
    
    console.log(`Average FPS: ${fps.toFixed(2)}`);
  });
});
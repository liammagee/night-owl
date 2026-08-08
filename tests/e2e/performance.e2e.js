const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');

const isHeadlessLinux = process.platform === 'linux' && !process.env.DISPLAY;

async function waitForNightOwlReady(page) {
  await page.waitForSelector('#editor-container', { timeout: 15000 });
  await page.waitForSelector('#file-tree-view', { timeout: 15000 });
  await page.waitForFunction(() => (
    Boolean(window.editor?.setValue || document.querySelector('#editor-container textarea')) &&
    Boolean(document.querySelector('#file-tree-view'))
  ), undefined, { timeout: 15000 });
}

async function waitForFileTreeState(page) {
  await page.evaluate(() => {
    if (window.electronAPI?.files?.requestFileTree) {
      return window.renderFileTree?.();
    }
    return null;
  });
  await page.waitForFunction(() => {
    const tree = document.querySelector('#file-tree-view');
    if (!tree) return false;
    if (!window.electronAPI?.files?.requestFileTree) return true;
    return Boolean(window.fileTreeData) ||
      tree.querySelectorAll('.file-tree-item').length > 0 ||
      Boolean(tree.querySelector('.file-tree-state'));
  }, undefined, { timeout: 15000 });
}

async function collectAppDiagnostics(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] || null;
    const paints = performance.getEntriesByType('paint').map((entry) => ({
      name: entry.name,
      startTime: entry.startTime
    }));
    const model = window.editor?.getModel?.() || null;
    const editorValue = window.editor?.getValue?.() || '';
    const fileTree = document.querySelector('#file-tree-view');
    const fileTreeState = fileTree?.querySelector('.file-tree-state') || null;

    return {
      appSettingsLoaded: Boolean(window.appSettings),
      editorReady: Boolean(model || window.editor?.setValue),
      editorLineCount: model?.getLineCount?.() || editorValue.split(/\r?\n/).length,
      fileTreeReady: Boolean(fileTree),
      fileTreeItems: fileTree?.querySelectorAll('.file-tree-item').length || 0,
      fileTreeDataLoaded: Boolean(window.fileTreeData),
      fileTreeStateVisible: Boolean(fileTreeState),
      fileTreeStateText: fileTreeState?.textContent || '',
      featureLoaderReady: Boolean(window.NightOwlFeatures),
      electronBridgeReady: Boolean(window.electronAPI?.files?.requestFileTree),
      navigation: navigation ? {
        domInteractive: navigation.domInteractive,
        domContentLoadedEventEnd: navigation.domContentLoadedEventEnd,
        loadEventEnd: navigation.loadEventEnd
      } : null,
      paints
    };
  });
}

test.describe('Performance Tests', () => {
  let app;
  let window;

  test.skip(isHeadlessLinux || process.env.HEADLESS, 'Electron performance tests require a desktop display');

  test.beforeEach(async () => {
    const { ELECTRON_RUN_AS_NODE, ...cleanEnv } = process.env;
    app = await electron.launch({
      args: [path.join(__dirname, '../..')],
      env: { ...cleanEnv, NODE_ENV: 'test' }
    });

    window = await app.firstWindow();
    await waitForNightOwlReady(window);
  });

  test.afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  test('app reaches editor, file tree, and feature readiness', async () => {
    const diagnostics = await collectAppDiagnostics(window);

    expect(diagnostics.editorReady).toBe(true);
    expect(diagnostics.fileTreeReady).toBe(true);
    expect(diagnostics.featureLoaderReady).toBe(true);
    expect(diagnostics.navigation).toBeTruthy();
  });

  test('file tree exposes rendered app nodes after workspace load', async () => {
    await waitForFileTreeState(window);
    const diagnostics = await collectAppDiagnostics(window);

    expect(diagnostics.fileTreeReady).toBe(true);
    if (diagnostics.electronBridgeReady) {
      expect(
        diagnostics.fileTreeItems > 0 ||
        diagnostics.fileTreeDataLoaded ||
        diagnostics.fileTreeStateVisible
      ).toBe(true);
    }
  });

  test('editor large-document update is measured in the renderer', async () => {
    const largeContent = Array.from({ length: 1500 }, (_, index) =>
      `## Section ${index + 1}\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit.`
    ).join('\n\n');

    const measurement = await window.evaluate(async (content) => {
      performance.clearMarks('nightowl-large-set-start');
      performance.clearMarks('nightowl-large-set-end');
      performance.clearMeasures('nightowl-large-set');

      performance.mark('nightowl-large-set-start');
      window.editor.setValue(content);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      performance.mark('nightowl-large-set-end');
      performance.measure('nightowl-large-set', 'nightowl-large-set-start', 'nightowl-large-set-end');

      const measure = performance.getEntriesByName('nightowl-large-set').at(-1);
      const model = window.editor.getModel();
      const value = window.editor.getValue();
      return {
        duration: measure?.duration ?? null,
        valueLength: model?.getValueLength?.() || value.length,
        lineCount: model?.getLineCount?.() || value.split(/\r?\n/).length
      };
    }, largeContent);

    expect(measurement.valueLength).toBe(largeContent.length);
    expect(measurement.lineCount).toBeGreaterThan(1000);
    expect(Number.isFinite(measurement.duration)).toBe(true);
  });

  test('editor scroll workflow changes editor state without fixed sleeps', async () => {
    const scrollState = await window.evaluate(async () => {
      const content = Array.from({ length: 400 }, (_, index) => `Line ${index + 1}`).join('\n');
      window.editor.setValue(content);
      window.editor.setScrollTop?.(0);
      window.editor.setPosition?.({ lineNumber: 1, column: 1 });
      window.editor.focus();

      const fallbackTextarea = document.querySelector('#editor-container textarea');
      if (fallbackTextarea) {
        fallbackTextarea.value = content;
        fallbackTextarea.scrollTop = 0;
        fallbackTextarea.focus();
      }

      const initialScrollTop = window.editor.getScrollTop?.() || fallbackTextarea?.scrollTop || 0;

      if (typeof window.editor.revealLine === 'function') {
        window.editor.revealLine(350);
      } else if (typeof window.editor.setScrollTop === 'function') {
        window.editor.setScrollTop(10000);
      }

      if (fallbackTextarea) {
        fallbackTextarea.scrollTop = fallbackTextarea.scrollHeight;
      }

      await new Promise((resolve) => requestAnimationFrame(resolve));

      const finalScrollTop = window.editor.getScrollTop?.() || fallbackTextarea?.scrollTop || 0;
      return {
        initialScrollTop,
        finalScrollTop,
        lineNumber: window.editor.getPosition?.()?.lineNumber || 1
      };
    });

    expect(scrollState.finalScrollTop > scrollState.initialScrollTop || scrollState.lineNumber > 1).toBe(true);
  });

  test('renderer exposes navigation and paint metrics for trace comparison', async () => {
    const diagnostics = await collectAppDiagnostics(window);

    expect(diagnostics.navigation).toBeTruthy();
    expect(Number.isFinite(diagnostics.navigation.domInteractive)).toBe(true);
    expect(Array.isArray(diagnostics.paints)).toBe(true);
  });

  test('animation frame sampling runs inside the app window', async () => {
    const frameStats = await window.evaluate(() => new Promise((resolve) => {
      const samples = [];
      let previous = performance.now();

      function sample() {
        const current = performance.now();
        samples.push(current - previous);
        previous = current;

        if (samples.length < 12) {
          requestAnimationFrame(sample);
        } else {
          resolve({
            samples,
            averageDelta: samples.reduce((sum, value) => sum + value, 0) / samples.length
          });
        }
      }

      requestAnimationFrame(sample);
    }));

    expect(frameStats.samples).toHaveLength(12);
    expect(Number.isFinite(frameStats.averageDelta)).toBe(true);
  });
});

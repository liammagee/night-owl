/**
 * Lazy Loader
 * Defers loading of non-critical modules until after the editor is interactive.
 * Uses requestIdleCallback (with setTimeout fallback) to load scripts in batches
 * without blocking the main thread.
 *
 * @module lazy-loader
 */

(function () {
  'use strict';

  const BATCH_SIZE = 3;
  const BATCH_DELAY = 100; // ms between batches
  const startTime = performance.now();

  let loadedCount = 0;
  let totalDeferred = 0;

  /**
   * Load a script by creating a script element and waiting for it to load.
   */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => {
        loadedCount++;
        resolve();
      };
      script.onerror = () => {
        console.warn(`[LazyLoader] Failed to load: ${src}`);
        loadedCount++;
        resolve(); // Don't block other scripts
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Load an array of scripts in batches using idle callbacks.
   */
  function loadInBatches(scripts) {
    totalDeferred = scripts.length;
    let index = 0;

    function loadNextBatch() {
      if (index >= scripts.length) {
        const elapsed = (performance.now() - startTime).toFixed(0);
        console.log(`[LazyLoader] All ${totalDeferred} deferred modules loaded (${elapsed}ms since page start)`);
        return;
      }

      const batch = scripts.slice(index, index + BATCH_SIZE);
      index += BATCH_SIZE;

      Promise.all(batch.map(loadScript)).then(() => {
        // Use idle callback for next batch to avoid janking the UI
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => loadNextBatch(), { timeout: 2000 });
        } else {
          setTimeout(loadNextBatch, BATCH_DELAY);
        }
      });
    }

    // Start after a small delay to let the editor settle
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => loadNextBatch(), { timeout: 3000 });
    } else {
      setTimeout(loadNextBatch, 500);
    }
  }

  /**
   * Measure and log startup timing milestones.
   */
  function logStartupMetrics() {
    const timing = performance.timing || {};
    const navStart = timing.navigationStart || 0;

    if (performance.getEntriesByType) {
      const paintEntries = performance.getEntriesByType('paint');
      paintEntries.forEach(entry => {
        console.log(`[Startup] ${entry.name}: ${entry.startTime.toFixed(0)}ms`);
      });
    }

    // Log DOMContentLoaded and load times
    window.addEventListener('load', () => {
      const loadTime = (performance.now() - startTime).toFixed(0);
      console.log(`[Startup] window.load: ${loadTime}ms since module init`);
    });

    // Log when editor becomes interactive
    const checkEditor = setInterval(() => {
      if (window.editor && window.editor.getModel()) {
        clearInterval(checkEditor);
        const editorReady = (performance.now() - startTime).toFixed(0);
        console.log(`[Startup] Editor interactive: ${editorReady}ms`);
      }
    }, 100);
    setTimeout(() => clearInterval(checkEditor), 30000);
  }

  // Public API
  window.lazyLoader = {
    loadScript,
    loadInBatches,
    getStatus: () => ({
      loaded: loadedCount,
      total: totalDeferred,
      elapsed: (performance.now() - startTime).toFixed(0) + 'ms'
    })
  };

  logStartupMetrics();
})();

'use strict';

const fs = require('fs');
const path = require('path');
const { injectAxe, checkA11y } = require('axe-playwright');
const { test, expect } = require('../fixtures/electron-app');

const MALICIOUS_MARKDOWN = fs.readFileSync(
  path.resolve(__dirname, '../../fixtures/malicious-markdown.md'),
  'utf8'
);

const DECK = `# First slide

The complete first slide must remain visible.

---

# Second slide

The second slide proves that parsing completed.`;

async function openMarkdown(page, filePath, content) {
  return page.evaluate(
    ({ path, markdown }) => window.openFileInEditor(path, markdown, {
      source: 'required-e2e',
      refreshExistingTabContent: true
    }),
    { path: filePath, markdown: content }
  );
}

async function enterPresentation(page, content = DECK) {
  const expectedHeading = content.match(/^#\s+(.+)$/m)?.[1] || '';
  await page.evaluate(() => window.switchToMode('editor'));
  await openMarkdown(page, '/virtual-workspace/deck.md', content);
  await page.evaluate(() => window.switchToMode('presentation'));
  await expect(page.locator('#presentation-root')).toHaveAttribute('data-presentation-load-state', 'ready');
  await expect(page.locator('#presentation-root [data-slide-index]')).toHaveCount(2);
  if (expectedHeading) {
    await expect(page.locator('#presentation-root')).toContainText(expectedHeading);
  }
}

async function expectEveryVisibleControlNamed(page, scope) {
  const inventory = await page.locator(scope).evaluate(root => {
    const controls = Array.from(root.querySelectorAll([
      'button',
      'a[href]',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      '[role="button"]'
    ].join(', '))).filter(element => {
      if (typeof element.checkVisibility === 'function') {
        return element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
      }
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    });

    const accessibleName = element => {
      const labelledBy = element.getAttribute('aria-labelledby');
      const referenced = labelledBy
        ? labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ')
        : '';
      const labels = Array.from(element.labels || []).map(label => label.textContent || '').join(' ');
      return [
        element.getAttribute('aria-label'),
        referenced,
        labels,
        element.getAttribute('alt'),
        element.textContent,
        element.getAttribute('title'),
        element.getAttribute('placeholder'),
        element.value
      ].find(value => String(value || '').trim()) || '';
    };

    return {
      count: controls.length,
      unnamed: controls
        .filter(element => !accessibleName(element))
        .map(element => element.outerHTML.slice(0, 300))
    };
  });
  expect(inventory.count).toBeGreaterThan(0);
  expect(inventory.unnamed, `Unnamed visible controls: ${inventory.unnamed.join('\n')}`).toEqual([]);
  return inventory.count;
}

test.describe.configure({ mode: 'serial' });

test('@required @workflow-controllers renderer startup exposes the extracted workflow contracts', async ({ appPage }) => {
  const openResult = await openMarkdown(
    appPage,
    '/virtual-workspace/workflow-contracts.md',
    '# Workflow contracts\n\nThe extracted controllers are live.'
  );
  expect(openResult).toMatchObject({
    key: '/virtual-workspace/workflow-contracts.md',
    status: 'committed'
  });

  const snapshot = await appPage.evaluate(() => {
    const workflows = window.NightOwlWorkflows;
    if (!workflows) throw new Error('NightOwl workflow controllers are unavailable');
    return {
      frozen: Object.isFrozen(workflows),
      keys: Object.keys(workflows).sort(),
      activeFile: workflows.fileOpen.getActive(),
      markdownClassification: workflows.preview.classifyFilePath('/tmp/example.md'),
      fileTree: workflows.fileTree.getSnapshot(),
      panes: workflows.panes.getState().panes
    };
  });

  expect(snapshot).toMatchObject({
    frozen: true,
    keys: ['fileOpen', 'fileTree', 'panes', 'preview'],
    activeFile: null,
    markdownClassification: {
      kind: 'markdown',
      isEditable: true,
      isMarkdown: true
    },
    fileTree: {
      rendering: false,
      pendingRender: false
    }
  });
  expect(snapshot.panes).toEqual(expect.objectContaining({
    sidebar: expect.any(Boolean),
    editor: expect.any(Boolean),
    right: expect.any(Boolean)
  }));
});

test('@required @ipc-contract preload exposes fixed capabilities and rejects malformed privileged payloads', async ({ appPage }) => {
  const result = await appPage.evaluate(async () => {
    const api = window.electronAPI;
    const rejected = {};
    for (const [name, operation] of Object.entries({
      terminal: () => api.terminal.exec({ cwd: '/tmp' }),
      git: () => api.git.stage({ repoRoot: '/tmp', paths: 'all' }),
      file: () => api.files.saveFile({ filePath: '/tmp/missing-content.md' }),
      collaboration: () => api.collaboration.startServer({ port: 70000 })
    })) {
      try {
        await operation();
        rejected[name] = null;
      } catch (error) {
        rejected[name] = error.message;
      }
    }
    const settings = await api.settings.getSettings();
    return {
      generic: {
        invoke: typeof api.invoke,
        on: typeof api.on,
        send: typeof api.send
      },
      capabilities: ['files', 'git', 'terminal', 'settings', 'events', 'signals']
        .filter(name => typeof api[name] === 'object'),
      rejected,
      settingsLoaded: Boolean(settings && typeof settings === 'object')
    };
  });

  expect(result.generic).toEqual({ invoke: 'undefined', on: 'undefined', send: 'undefined' });
  expect(result.capabilities).toEqual(['files', 'git', 'terminal', 'settings', 'events', 'signals']);
  expect(result.settingsLoaded).toBe(true);
  for (const message of Object.values(result.rejected)) {
    expect(message).toMatch(/Invalid payload/);
  }
});

test('@required @resource-lifecycle repeated feature mounts return to the live resource baseline', async ({ appPage }) => {
  const result = await appPage.evaluate(async () => {
    const features = window.NightOwlFeatures;
    if (!features?.getLifecycleDiagnostics) throw new Error('Feature lifecycle diagnostics are unavailable');
    const aggregate = diagnostics => ({
      activeRegistries: diagnostics.activeRegistries,
      activeResources: diagnostics.activeResources,
      byType: diagnostics.byType
    });
    const baseline = aggregate(features.getLifecycleDiagnostics());
    window.__nightOwlLifecycleCloseCount = 0;
    window.__nightOwlLifecycleDestroyCount = 0;
    features.register({
      id: 'nightowl-required-lifecycle-stress',
      init(host) {
        host.interval(() => {}, 60 * 1000);
        host.listen(window, 'nightowl-required-lifecycle-event', () => {});
        host.on('nightowl:required-lifecycle-event', () => {});
        host.track({
          close() {
            window.__nightOwlLifecycleCloseCount += 1;
          }
        }, { type: 'watcher' });
      },
      destroy() {
        window.__nightOwlLifecycleDestroyCount += 1;
      }
    });

    for (let cycle = 0; cycle < 15; cycle += 1) {
      window.switchToMode('network');
      window.switchToMode('editor');
      const restored = aggregate(features.getLifecycleDiagnostics());
      if (JSON.stringify(restored) !== JSON.stringify(baseline)) {
        throw new Error(`Mode resource baseline was not restored on cycle ${cycle}`);
      }
    }

    for (let cycle = 0; cycle < 15; cycle += 1) {
      await features.enableFeature('nightowl-required-lifecycle-stress');
      const mounted = aggregate(features.getLifecycleDiagnostics());
      if (mounted.activeRegistries !== baseline.activeRegistries + 1) {
        throw new Error(`Feature registry growth mismatch on cycle ${cycle}`);
      }
      if (mounted.activeResources !== baseline.activeResources + 4) {
        throw new Error(`Feature resource growth mismatch on cycle ${cycle}`);
      }
      features.disableFeature('nightowl-required-lifecycle-stress');
      const restored = aggregate(features.getLifecycleDiagnostics());
      if (JSON.stringify(restored) !== JSON.stringify(baseline)) {
        throw new Error(`Resource baseline was not restored on cycle ${cycle}`);
      }
    }

    return {
      baseline,
      after: aggregate(features.getLifecycleDiagnostics()),
      closeCount: window.__nightOwlLifecycleCloseCount,
      destroyCount: window.__nightOwlLifecycleDestroyCount,
      diagnostics: await window.NightOwlPerformance.getResourceDiagnostics()
    };
  });

  expect(result.after).toEqual(result.baseline);
  expect(result.closeCount).toBe(15);
  expect(result.destroyCount).toBe(15);
  expect(result.diagnostics).toMatchObject({
    success: true,
    handlers: {
      feed: { active: expect.any(Number), byType: expect.any(Object) },
      file: { watcher: expect.any(Number), timers: expect.any(Number) },
      terminal: { activeProcesses: expect.any(Number), byBackend: expect.any(Object) }
    },
    renderer: {
      activeRegistries: result.baseline.activeRegistries,
      activeResources: result.baseline.activeResources
    }
  });
});

test('@required @file-switch rapid file switching keeps the newest editor and preview state', async ({ appPage }) => {
  await appPage.evaluate(() => {
    const renderer = window.TechneMarkdownRenderer;
    if (!renderer?.renderPreview) throw new Error('Techne markdown renderer is unavailable');
    const originalRender = renderer.renderPreview.bind(renderer);
    window.__nightOwlOriginalRenderPreview = originalRender;
    window.__nightOwlSlowPreviewStarted = false;
    window.__nightOwlSlowPreviewGate = new Promise(resolve => {
      window.__nightOwlReleaseSlowPreview = resolve;
    });
    renderer.renderPreview = async options => {
      if (options.markdownContent.includes('Slow document')) {
        window.__nightOwlSlowPreviewStarted = true;
        await window.__nightOwlSlowPreviewGate;
      }
      return originalRender(options);
    };
    window.__nightOwlSlowOpen = window.openFileInEditor(
      '/virtual-workspace/slow.md',
      '# Slow document\n\nThis render is intentionally delayed.',
      { source: 'required-e2e' }
    );
  });

  await expect.poll(() => appPage.evaluate(() => window.__nightOwlSlowPreviewStarted)).toBe(true);
  await openMarkdown(
    appPage,
    '/virtual-workspace/fast.md',
    '# Fast document\n\nThis content must win the transition.'
  );
  await appPage.evaluate(async () => {
    window.__nightOwlReleaseSlowPreview();
    await window.__nightOwlSlowOpen;
    window.TechneMarkdownRenderer.renderPreview = window.__nightOwlOriginalRenderPreview;
  });

  await expect.poll(() => appPage.evaluate(() => window.currentFilePath)).toBe('/virtual-workspace/fast.md');
  await expect.poll(() => appPage.evaluate(() => window.editor.getValue())).toContain('Fast document');
  await expect(appPage.locator('#preview-content')).toContainText('This content must win the transition.');
  await expect(appPage.locator('#preview-content')).not.toContainText('intentionally delayed');
});

test('@required @preview preview readiness exposes committed content rather than a blank pane', async ({ appPage }) => {
  const result = await openMarkdown(
    appPage,
    '/virtual-workspace/preview-ready.md',
    '# Preview ready\n\nA deterministic preview contract.'
  );

  expect(result).toMatchObject({ status: 'committed' });
  await expect(appPage.locator('#preview-content h1')).toContainText('Preview ready');
  await expect(appPage.locator('#preview-content')).toContainText('A deterministic preview contract.');
  await expect(appPage.locator('.preview-transition-error')).toHaveCount(0);
});

test('@required @error-recovery file and preview failures are correlated, redacted, and resettable', async ({ appPage }) => {
  const privatePath = '/Users/nightowl/Research/private-preview.md';
  const secret = 'PRIVATE_DIAGNOSTIC_SECRET';
  const fileFailure = await appPage.evaluate(async ({ path, credential }) => {
    const outcome = await window.openFilePathInEditor(path, {
      source: 'required-error-recovery',
      diagnosticCredential: credential
    });
    const status = document.getElementById('file-transition-status');
    const incidentId = status.dataset.correlationId;
    return {
      outcome,
      incidentId,
      report: JSON.stringify(await window.NightOwlDiagnostics.getReport({ incidentId }))
    };
  }, { path: privatePath, credential: secret });

  expect(fileFailure.outcome).toMatchObject({
    status: 'failed',
    correlationId: fileFailure.incidentId,
    requestId: fileFailure.incidentId
  });
  expect(fileFailure.incidentId).toMatch(/^NO-FILE-/);
  expect(fileFailure.report).not.toContain('/Users/nightowl');
  expect(fileFailure.report).not.toContain(secret);
  expect(fileFailure.report).toContain('<private-path>/private-preview.md');
  await expect(appPage.locator('#file-transition-status')).toHaveAttribute('data-view-state', 'failed');
  await expect(appPage.locator('#file-transition-status .view-error-retry')).toHaveCount(1);
  await expect(appPage.locator('#file-transition-status .view-error-reset')).toHaveCount(1);
  await expect(appPage.locator('#file-transition-status .view-error-copy')).toHaveCount(1);
  await appPage.locator('#file-transition-status .view-error-reset').click();
  await expect(appPage.locator('#file-transition-status')).toBeHidden();

  await openMarkdown(appPage, '/virtual-workspace/preview-recovery.md', '# Preview recovery baseline');
  const previewFailure = await appPage.evaluate(async ({ path, credential }) => {
    const preview = window.NightOwlPreviewMarkdown;
    const originalProcess = preview.processMarkdownContent;
    const renderer = window.TechneMarkdownRenderer;
    const originalRender = renderer.renderPreview;
    renderer.renderPreview = async () => {
      throw new Error('Injected primary preview renderer failure');
    };
    preview.processMarkdownContent = () => {
      throw new Error(`Injected preview failure at ${path} password=${credential}`);
    };
    try {
      const outcome = await window.updatePreviewAndStructure('# Failing preview', {
        filePath: window.currentFilePath
      });
      const failure = document.querySelector('.preview-transition-error');
      const incidentId = failure.dataset.correlationId;
      return {
        outcome,
        incidentId,
        report: JSON.stringify(await window.NightOwlDiagnostics.getReport({ incidentId }))
      };
    } finally {
      renderer.renderPreview = originalRender;
      preview.processMarkdownContent = originalProcess;
    }
  }, { path: privatePath, credential: secret });

  expect(previewFailure.outcome).toMatchObject({
    status: 'failed',
    correlationId: previewFailure.incidentId
  });
  expect(previewFailure.incidentId).toMatch(/^NO-PREVIEW-/);
  expect(previewFailure.report).not.toContain('/Users/nightowl');
  expect(previewFailure.report).not.toContain(secret);
  await expect(appPage.locator('.preview-transition-error')).toHaveAttribute('data-view-state', 'failed');
  await appPage.locator('.preview-transition-error .view-error-reset').click();
  await expect(appPage.locator('.preview-reset-state')).toContainText('Preview reset');

  const overlay = await appPage.evaluate(async () => {
    await window.NightOwlDiagnostics.open();
    return Boolean(document.getElementById('nightowl-diagnostics-overlay'));
  });
  expect(overlay).toBe(true);
  await expect(appPage.locator('#nightowl-diagnostics-overlay')).toContainText('Document contents, credentials, and full private paths are omitted');
  await appPage.locator('.nightowl-diagnostics-close').click();
});

test('@required @ui-state mode and record overlays preserve one deterministic pane arrangement', async ({ appPage }) => {
  await appPage.evaluate(() => window.switchToMode('editor'));
  await openMarkdown(appPage, '/virtual-workspace/ui-state.md', '# UI state\n\nBaseline pane state.');

  const modeSnapshots = await appPage.evaluate(() => {
    const store = window.NightOwlUIState;
    if (!store) throw new Error('NightOwlUIState is unavailable');
    store.dispatch({
      type: 'HYDRATE_PANES',
      panes: { sidebar: false, editor: true, right: true }
    });
    store.dispatch({ type: 'SHOW_RIGHT_PANE', pane: 'chat' });

    return ['network', 'circle', 'library', 'editor'].map(mode => {
      window.switchToMode(mode);
      const state = store.getState();
      return {
        requested: mode,
        currentMode: window.currentMode,
        storeMode: state.mode,
        panes: state.panes,
        rightPane: state.activeRightPane,
        activeViews: Array.from(document.querySelectorAll('.content-view.active'), element => element.id)
      };
    });
  });

  for (const snapshot of modeSnapshots) {
    expect(snapshot.currentMode).toBe(snapshot.requested);
    expect(snapshot.storeMode).toBe(snapshot.requested);
    expect(snapshot.panes).toEqual({ sidebar: false, editor: true, right: true });
    expect(snapshot.rightPane).toBe('chat');
    expect(snapshot.activeViews).toEqual([`${snapshot.requested}-content`]);
  }

  const records = [
    '{"item_id":"dev-001","notes":"First"}',
    '{"item_id":"dev-002","notes":"Second"}'
  ].join('\n');
  await openMarkdown(appPage, '/virtual-workspace/ui-state.jsonl', records);
  await expect.poll(() => appPage.evaluate(() => window.NightOwlUIState.getState().structuredRecord.active)).toBe(true);
  expect(await appPage.evaluate(() => ({
    panes: window.NightOwlUIState.getState().panes,
    rightPane: window.NightOwlUIState.getState().activeRightPane,
    editorHidden: document.getElementById('editor-pane').classList.contains('nightowl-ui-hidden'),
    recordVisible: !document.getElementById('jsonl-record-mode').classList.contains('nightowl-ui-hidden'),
    previewRendered: document.getElementById('preview-pane').classList.contains('ui-pane-active')
  }))).toEqual({
    panes: { sidebar: false, editor: true, right: true },
    rightPane: 'chat',
    editorHidden: true,
    recordVisible: true,
    previewRendered: true
  });

  await appPage.locator('#jsonl-source-toggle').click();
  await expect(appPage.locator('#editor-pane')).not.toHaveClass(/nightowl-ui-hidden/);
  await openMarkdown(appPage, '/virtual-workspace/ui-state-restored.md', '# Restored');
  await expect.poll(() => appPage.evaluate(() => window.NightOwlUIState.getState().structuredRecord.active)).toBe(false);
  expect(await appPage.evaluate(() => ({
    panes: window.NightOwlUIState.getState().panes,
    rightPane: window.NightOwlUIState.getState().activeRightPane,
    chatRendered: document.getElementById('chat-pane').classList.contains('ui-pane-active')
  }))).toEqual({
    panes: { sidebar: false, editor: true, right: true },
    rightPane: 'chat',
    chatRendered: true
  });
});

test('@required @content-security preview and presentation enforce the same HTML policy', async ({ appPage }) => {
  await appPage.evaluate(() => {
    window.__nightOwlMarkdownXssEvents = [];
    let value = null;
    Object.defineProperty(window, '__nightOwlMarkdownXss', {
      configurable: true,
      get: () => value,
      set: nextValue => {
        value = nextValue;
        window.__nightOwlMarkdownXssEvents.push({
          value: nextValue,
          stack: new Error('Markdown fixture handler executed').stack
        });
      }
    });
  });
  await openMarkdown(appPage, '/virtual-workspace/malicious.md', MALICIOUS_MARKDOWN);

  for (const root of ['#preview-content']) {
    await expect(appPage.locator(`${root} #event-handler`)).toContainText('Event handler target');
    await expect(appPage.locator(`${root} script`)).toHaveCount(0);
    await expect(appPage.locator(`${root} #event-handler`)).not.toHaveAttribute('onclick', /.+/);
    await expect(appPage.locator(`${root} #unsafe-link`)).not.toHaveAttribute('href', /.+/);
    await expect(appPage.locator(`${root} #unsafe-image`)).not.toHaveAttribute('src', /.+/);
    await expect(appPage.locator(`${root} #unsafe-frame`)).toHaveCount(0);
    await expect(appPage.locator(`${root} #allowed-frame`)).toHaveAttribute(
      'sandbox',
      'allow-same-origin allow-scripts allow-forms allow-popups'
    );
    await expect(appPage.locator(`${root} #local-image`)).toHaveCount(1);
  }
  await appPage.evaluate(() => window.updateSpeakerNotesDisplay());
  const speakerNotesRoot = appPage.locator('#speaker-notes-content');
  await expect(speakerNotesRoot).toContainText('Safe speaker-note text remains visible.');
  await expect(speakerNotesRoot.locator('[onclick], [onerror]')).toHaveCount(0);
  await expect(speakerNotesRoot.locator('img[src^="invalid:"]')).toHaveCount(0);
  expect(await appPage.evaluate(() => ({
    value: window.__nightOwlMarkdownXss,
    events: window.__nightOwlMarkdownXssEvents
  }))).toEqual({ value: null, events: [] });

  await enterPresentation(appPage, MALICIOUS_MARKDOWN);
  const presentationRoot = '#presentation-root';
  await expect(appPage.locator(`${presentationRoot} #event-handler`).first()).toContainText('Event handler target');
  await expect(appPage.locator(`${presentationRoot} script`)).toHaveCount(0);
  await expect(appPage.locator(`${presentationRoot} #event-handler`).first()).not.toHaveAttribute('onclick', /.+/);
  await expect(appPage.locator(`${presentationRoot} #unsafe-link`).first()).not.toHaveAttribute('href', /.+/);
  await expect(appPage.locator(`${presentationRoot} #unsafe-image`).first()).not.toHaveAttribute('src', /.+/);
  await expect(appPage.locator(`${presentationRoot} #unsafe-frame`)).toHaveCount(0);
  await expect(appPage.locator(`${presentationRoot} #allowed-frame`).first()).toHaveAttribute(
    'sandbox',
    'allow-same-origin allow-scripts allow-forms allow-popups'
  );
  await expect(appPage.locator(`${presentationRoot} #local-image`).first()).toHaveAttribute(
    'src',
    'file:///virtual-workspace/fixture-image.png'
  );
  expect(await appPage.evaluate(() => ({
    value: window.__nightOwlMarkdownXss,
    events: window.__nightOwlMarkdownXssEvents
  }))).toEqual({ value: null, events: [] });

  await appPage.evaluate(() => {
    delete window.__nightOwlMarkdownXss;
    delete window.__nightOwlMarkdownXssEvents;
    window.switchToMode('editor');
  });
  await openMarkdown(appPage, '/virtual-workspace/deck.md', DECK);
});

test('@required @accessibility editor and presentation expose named keyboard-operable controls', async ({ appPage }) => {
  await appPage.evaluate(() => window.switchToMode('editor'));
  await openMarkdown(appPage, '/virtual-workspace/accessibility-tab-one.md', '# Accessible tab one');
  await openMarkdown(appPage, '/virtual-workspace/accessibility-tab-two.md', '# Accessible tab two');
  await appPage.evaluate(() => window.techneThemeManager.applyTheme('techne-red-light'));
  await expect(appPage.locator('body')).toHaveAttribute('data-techne-theme', 'techne-red-light');
  await injectAxe(appPage);
  const editorControlCount = await expectEveryVisibleControlNamed(appPage, '#main-content');
  expect(editorControlCount).toBeGreaterThan(20);
  const tabsBarStyle = await appPage.locator('#editor-tabs-bar').evaluate(element => {
    const previous = element.getAttribute('style') || '';
    element.style.width = '48px';
    element.style.maxWidth = '48px';
    element.style.flex = '0 0 48px';
    return {
      previous,
      overflows: element.scrollWidth > element.clientWidth
    };
  });
  expect(tabsBarStyle.overflows).toBe(true);
  await checkA11y(appPage, '#main-content', {
    detailedReport: true,
    detailedReportOptions: { html: true }
  });
  await appPage.locator('#editor-tabs-bar').evaluate((element, previous) => {
    if (previous) element.setAttribute('style', previous);
    else element.removeAttribute('style');
  }, tabsBarStyle.previous);

  await enterPresentation(appPage);
  await expect(appPage.getByRole('region', { name: 'Presentation editor' })).toBeVisible();
  await expect(appPage.getByRole('toolbar', { name: 'Presentation editor controls' })).toBeVisible();
  await expect(appPage.getByRole('navigation', { name: 'Slide navigation' })).toBeVisible();
  await expect(appPage.locator('#presentation-root .presentation-connection-lines')).toHaveAttribute('aria-hidden', 'true');
  await expectEveryVisibleControlNamed(appPage, '#presentation-root');

  await appPage.getByRole('button', { name: 'Start presentation' }).click();
  await expect(appPage.getByRole('region', { name: 'Presentation delivery' })).toBeVisible();
  await expect(appPage.getByRole('toolbar', { name: 'Presentation delivery controls' })).toBeVisible();
  let currentSlide = appPage.locator('#presentation-root [aria-current="step"]');
  await expect(currentSlide).toHaveAttribute('data-slide-index', '0');
  await currentSlide.focus();
  await appPage.keyboard.press('End');
  currentSlide = appPage.locator('#presentation-root [aria-current="step"]');
  await expect(currentSlide).toHaveAttribute('data-slide-index', '1');
  await appPage.keyboard.press('ArrowLeft');
  currentSlide = appPage.locator('#presentation-root [aria-current="step"]');
  await expect(currentSlide).toHaveAttribute('data-slide-index', '0');

  const diagramDisplay = await appPage.evaluate(() => {
    const diagram = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    diagram.setAttribute('role', 'img');
    diagram.setAttribute('aria-label', 'Meaningful delivery diagram');
    diagram.setAttribute('width', '120');
    diagram.setAttribute('height', '60');
    diagram.innerHTML = '<circle cx="30" cy="30" r="20"></circle>';
    document.querySelector('[data-current-slide="true"] .slide-content').appendChild(diagram);
    return getComputedStyle(diagram).display;
  });
  expect(diagramDisplay).not.toBe('none');

  await currentSlide.focus();
  await appPage.keyboard.press('Tab');
  expect(await appPage.evaluate(() => document.activeElement?.tagName)).toMatch(/^(BUTTON|SELECT)$/);
  await expectEveryVisibleControlNamed(appPage, '#presentation-root');
  await checkA11y(appPage, '#presentation-root', {
    detailedReport: true,
    detailedReportOptions: { html: true }
  });

  await appPage.locator('#presentation-root [aria-current="step"]').focus();
  await appPage.keyboard.press('Escape');
  await expect(appPage.locator('body')).not.toHaveClass(/is-presenting/);
  await expect(appPage.getByRole('button', { name: 'Start presentation' })).toBeFocused();
  await appPage.evaluate(() => window.switchToMode('editor'));
});

test('@required @mode-recovery presentation failure offers recovery and retry remounts the deck', async ({ appPage }) => {
  await enterPresentation(appPage);
  await appPage.evaluate(() => {
    window.switchToMode('editor');
    window.__nightOwlWorkingPresentation = window.MarkdownPreziApp;
    window.MarkdownPreziApp = function BrokenPresentation() {
      throw new Error('required E2E injected presentation failure');
    };
    document.getElementById('presentation-root').dataset.presentationLoadState = 'cancelled';
    window.switchToMode('presentation');
  });

  await expect(appPage.locator('#presentation-root')).toHaveAttribute('data-presentation-load-state', 'failed');
  await expect(appPage.locator('#presentation-root')).toHaveAttribute('data-view-state', 'failed');
  await expect(appPage.locator('#presentation-root')).toHaveAttribute('data-correlation-id', /^NO-PRESENTATION-/);
  await expect(appPage.locator('.presentation-load-diagnostic')).toContainText('NO-PRES-RENDER');
  await expect(appPage.locator('.presentation-load-diagnostic')).toContainText('Incident: NO-PRESENTATION-');
  await expect(appPage.locator('.presentation-load-reset')).toHaveCount(1);
  await expect(appPage.locator('.presentation-load-copy')).toHaveCount(1);
  await expect(appPage.locator('.presentation-load-details')).toHaveCount(1);

  await appPage.evaluate(() => {
    window.MarkdownPreziApp = window.__nightOwlWorkingPresentation;
  });
  await appPage.locator('.presentation-load-retry').click();

  await expect(appPage.locator('#presentation-root')).toHaveAttribute('data-presentation-load-state', 'ready');
  await expect(appPage.locator('#presentation-root [data-slide-index]')).toHaveCount(2);
  await expect(appPage.locator('#presentation-root')).toContainText('First slide');
});

test('@required @slide-geometry delivery mode contains the complete current slide', async ({ appPage }) => {
  await enterPresentation(appPage);

  const presentationStyles = await appPage.evaluate(() => (
    Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map(link => ({ id: link.id, href: link.getAttribute('href') || '' }))
      .filter(link => link.href.includes('preview-presentation.css'))
  ));
  expect(presentationStyles).toEqual([{
    id: 'nightowl-presentations-preview-css',
    href: 'plugins/techne-presentations/preview-presentation.css'
  }]);

  await appPage.locator('.presentation-present-btn').click();
  await expect(appPage.locator('.presentation-shell')).toHaveAttribute('data-presentation-mode', 'delivery');
  await expect(appPage.locator('.presentation-stage')).toHaveAttribute('data-fit-mode', 'contain');
  await expect(appPage.locator('.presentation-current-slide')).toHaveCount(1);

  await expect.poll(async () => appPage.evaluate(() => {
    const root = document.getElementById('presentation-root').getBoundingClientRect();
    const stage = document.querySelector('.presentation-stage').getBoundingClientRect();
    const slide = document.querySelector('.presentation-current-slide').getBoundingClientRect();
    return {
      hasSize: slide.width > 0 && slide.height > 0,
      withinStage:
        slide.left >= stage.left - 1 &&
        slide.top >= stage.top - 1 &&
        slide.right <= stage.right + 1 &&
        slide.bottom <= stage.bottom + 1,
      stageWithinRoot:
        stage.left >= root.left - 1 &&
        stage.top >= root.top - 1 &&
        stage.right <= root.right + 1 &&
        stage.bottom <= root.bottom + 1,
      hasSlideRatio: Math.abs((slide.width / slide.height) - (16 / 9)) < 0.01
    };
  })).toEqual({
    hasSize: true,
    withinStage: true,
    stageWithinRoot: true,
    hasSlideRatio: true
  });

  const snapshot = await appPage.evaluate(() => {
    const rect = selector => {
      const value = document.querySelector(selector).getBoundingClientRect();
      return {
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height
      };
    };
    return {
      root: rect('#presentation-root'),
      stage: rect('.presentation-stage'),
      slide: rect('.presentation-current-slide')
    };
  });

  expect(snapshot.slide.width).toBeGreaterThan(0);
  expect(snapshot.slide.height).toBeGreaterThan(0);
  expect(snapshot.slide.left).toBeGreaterThanOrEqual(snapshot.stage.left - 1);
  expect(snapshot.slide.top).toBeGreaterThanOrEqual(snapshot.stage.top - 1);
  expect(snapshot.slide.right).toBeLessThanOrEqual(snapshot.stage.right + 1);
  expect(snapshot.slide.bottom).toBeLessThanOrEqual(snapshot.stage.bottom + 1);
  expect(snapshot.stage.left).toBeGreaterThanOrEqual(snapshot.root.left - 1);
  expect(snapshot.stage.top).toBeGreaterThanOrEqual(snapshot.root.top - 1);
  expect(snapshot.stage.right).toBeLessThanOrEqual(snapshot.root.right + 1);
  expect(snapshot.stage.bottom).toBeLessThanOrEqual(snapshot.root.bottom + 1);
  expect(snapshot.slide.width / snapshot.slide.height).toBeCloseTo(16 / 9, 2);
});

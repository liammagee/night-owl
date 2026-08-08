'use strict';

const fs = require('fs');
const path = require('path');
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
  await expect(appPage.locator('.presentation-load-diagnostic')).toContainText('NO-PRES-RENDER');

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

'use strict';

const fs = require('fs');
const path = require('path');
const { test, expect } = require('../fixtures/packaged-electron-app');

const MALICIOUS_MARKDOWN = fs.readFileSync(
  path.resolve(__dirname, '../../fixtures/malicious-markdown.md'),
  'utf8'
);

test('@packaged @content-security blocks active Markdown in preview and presentation', async ({ appPage }) => {
  await appPage.waitForFunction(() => (
    Boolean(window.editor?.getValue) &&
    typeof window.openFileInEditor === 'function' &&
    typeof window.switchToMode === 'function' &&
    typeof window.updateSpeakerNotesDisplay === 'function'
  ), undefined, { timeout: 30 * 1000 });

  await appPage.evaluate(() => {
    window.appSettings = {
      ...(window.appSettings || {}),
      workingDirectory: '/virtual-workspace'
    };
    window.__nightOwlMarkdownXssEvents = [];
    let value = null;
    Object.defineProperty(window, '__nightOwlMarkdownXss', {
      configurable: true,
      get: () => value,
      set: nextValue => {
        value = nextValue;
        window.__nightOwlMarkdownXssEvents.push(nextValue);
      }
    });
  });

  await appPage.evaluate(
    ({ markdown }) => window.openFileInEditor(
      '/virtual-workspace/malicious.md',
      markdown,
      { source: 'packaged-security-e2e' }
    ),
    { markdown: MALICIOUS_MARKDOWN }
  );

  await expect(appPage.locator('#preview-content #event-handler')).toContainText('Event handler target');
  await expect(appPage.locator('#preview-content script')).toHaveCount(0);
  await expect(appPage.locator('#preview-content #unsafe-link')).not.toHaveAttribute('href', /.+/);
  await expect(appPage.locator('#preview-content #unsafe-frame')).toHaveCount(0);
  await expect(appPage.locator('#preview-content #allowed-frame')).toHaveAttribute(
    'sandbox',
    'allow-same-origin allow-scripts allow-forms allow-popups'
  );
  await appPage.evaluate(() => window.updateSpeakerNotesDisplay());
  const speakerNotesRoot = appPage.locator('#speaker-notes-content');
  await expect(speakerNotesRoot).toContainText('Safe speaker-note text remains visible.');
  await expect(speakerNotesRoot.locator('[onclick], [onerror]')).toHaveCount(0);
  await expect(speakerNotesRoot.locator('img[src^="invalid:"]')).toHaveCount(0);

  await appPage.evaluate(() => window.switchToMode('presentation'));
  await expect(appPage.locator('#presentation-root')).toHaveAttribute('data-presentation-load-state', 'ready');
  await expect(appPage.locator('#presentation-root #event-handler').first()).toContainText('Event handler target');
  await expect(appPage.locator('#presentation-root script')).toHaveCount(0);
  await expect(appPage.locator('#presentation-root #unsafe-link').first()).not.toHaveAttribute('href', /.+/);
  await expect(appPage.locator('#presentation-root #unsafe-frame')).toHaveCount(0);
  await expect(appPage.locator('#presentation-root #allowed-frame').first()).toHaveAttribute(
    'sandbox',
    'allow-same-origin allow-scripts allow-forms allow-popups'
  );

  expect(await appPage.evaluate(() => ({
    value: window.__nightOwlMarkdownXss,
    events: window.__nightOwlMarkdownXssEvents
  }))).toEqual({ value: null, events: [] });
});

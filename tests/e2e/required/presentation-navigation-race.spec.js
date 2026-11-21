'use strict';
const { test, expect } = require('../fixtures/electron-app');
test.afterEach(async ({ appPage }) => {
  await appPage.evaluate(() => {
    window.__restoreNavigationTimeout?.();
    window.dispatchEvent(new CustomEvent('exitPresenting'));
    window.switchToMode('editor');
  });
});
const deck = Array.from({ length: 6 }, (_, index) => `# Slide ${index + 1}\n\nContent ${index + 1}`).join('\n\n---\n\n');

test('@required explicit navigation wins over a pending editor slide target', async ({ appPage }) => {
  await appPage.evaluate(async markdown => {
    await window.openFileInEditor('/virtual-workspace/navigation-race.md', markdown, { refreshExistingTabContent: true });
    window.switchToMode('presentation');
  }, deck);
  await expect(appPage.locator('#presentation-root .slide')).toHaveCount(6);
  // Hold only the legacy delayed editor-target callback. All other rendering,
  // input, and timing remains real; release it after a newer user action.
  await appPage.evaluate(markdown => {
    window.__heldSlideTargets = [];
    const nativeTimeout = window.setTimeout;
    window.__restoreNavigationTimeout = () => { window.setTimeout = nativeTimeout; };
    window.setTimeout = function(callback, delay, ...args) {
      if (delay === 300 && String(callback).includes('Executing goToSlide for target')) {
        window.__heldSlideTargets.push(() => callback(...args));
        return nativeTimeout(() => {}, 0);
      }
      return nativeTimeout(callback, delay, ...args);
    };
    window.targetPresentationSlide = 3;
    window.dispatchEvent(new CustomEvent('updatePresentationContent', { detail: { content: markdown + '\n' } }));
    window.NightOwlPresentationTools.startPresentation();
  }, deck);
  await expect(appPage.locator('.presentation-shell')).toHaveAttribute('data-presentation-mode', 'delivery');
  const before = Number(await appPage.locator('.presentation-current-slide').getAttribute('data-slide-index'));
  await appPage.evaluate(() => {
    const slide = document.querySelector('.presentation-current-slide');
    slide.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  await expect(appPage.locator('.presentation-current-slide')).toHaveAttribute('data-slide-index', String(before + 1));
  await appPage.evaluate(() => {
    window.__restoreNavigationTimeout();
    window.__heldSlideTargets.forEach(callback => callback());
    delete window.__heldSlideTargets;
    delete window.__restoreNavigationTimeout;
  });
  await expect(appPage.locator('.presentation-current-slide')).toHaveAttribute('data-slide-index', String(before + 1));
});

test('@required late narration completion cannot undo manual navigation', async ({ appPage }) => {
  const narrated = Array.from({ length: 5 }, (_, i) => `# Slide ${i + 1}\n\nContent\n\n\`\`\`notes\nNarration ${i + 1}\n\`\`\``).join('\n\n---\n\n');
  await appPage.evaluate(async markdown => {
    window.__narrations = [];
    window.ttsService = {
      isSpeaking: false,
      speak(text, options) { this.isSpeaking = true; window.__narrations.push(options); options.onStart(); return Promise.resolve(); },
      stop() { this.isSpeaking = false; this.stopCalls = (this.stopCalls || 0) + 1; }
    };
    await window.openFileInEditor('/virtual-workspace/narration-race.md', markdown, { refreshExistingTabContent: true });
    window.switchToMode('presentation');
  }, narrated);
  await expect(appPage.locator('#presentation-root .slide')).toHaveCount(5);
  await appPage.evaluate(() => window.NightOwlPresentationTools.startPresentation());
  await appPage.evaluate(() => document.querySelector('.presentation-current-slide').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
  await expect(appPage.locator('.presentation-current-slide')).toHaveAttribute('data-slide-index', '0');
  expect(await appPage.evaluate(() => window.ttsService.stopCalls || 0)).toBe(0);
  await appPage.getByRole('button', { name: 'Enable slide narration', exact: true }).click();
  await expect.poll(() => appPage.evaluate(() => window.__narrations.length)).toBeGreaterThan(0);
  await appPage.evaluate(() => {
    window.__oldNarration = window.__narrations[0];
    // Two keys in one browser turn must both count, before React rerenders.
    for (let i = 0; i < 2; i++) document.querySelector('.presentation-current-slide').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  await expect(appPage.locator('.presentation-current-slide')).toHaveAttribute('data-slide-index', '2');
  await appPage.evaluate(() => window.__oldNarration.onEnd());
  // The old completion formerly scheduled its slide + 1 after one second.
  await appPage.waitForTimeout(1200);
  await expect(appPage.locator('.presentation-current-slide')).toHaveAttribute('data-slide-index', '2');
});

test('@required authoring navigation wins over pending content reconciliation', async ({ appPage }) => {
  await appPage.evaluate(async markdown => {
    await window.openFileInEditor('/virtual-workspace/authoring-race.md', markdown, { refreshExistingTabContent: true });
    window.editor.setPosition({ lineNumber: 1, column: 1 });
    window.switchToMode('presentation');
  }, deck);
  await expect(appPage.locator('#presentation-root .slide')).toHaveCount(6);
  await appPage.evaluate(() => document.querySelector('[data-current-slide="true"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
  await expect(appPage.locator('[data-current-slide="true"]')).toHaveAttribute('data-slide-index', '0');
  await appPage.evaluate(markdown => {
    window.dispatchEvent(new CustomEvent('updatePresentationContent', { detail: { content: markdown + '\n' } }));
    document.querySelector('[data-current-slide="true"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  }, deck);
  await expect(appPage.locator('[data-current-slide="true"]')).toHaveAttribute('data-slide-index', '1');
});

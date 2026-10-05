'use strict';

const { injectAxe, checkA11y } = require('axe-playwright');
const { test, expect } = require('./fixtures/electron-app');

const ACCESSIBLE_DECK = `# Accessible first slide

Keyboard and semantic coverage.

---

# Accessible second slide

The second slide proves keyboard navigation.`;

async function ensureAxe(page) {
  if (!await page.evaluate(() => Boolean(window.axe))) await injectAxe(page);
}

async function expectNamedControls(page, scope = 'body') {
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

async function openPresentation(page) {
  await page.evaluate(({ markdown }) => window.openFileInEditor(
    '/virtual-workspace/accessibility-deck.md',
    markdown,
    { source: 'accessibility-e2e', refreshExistingTabContent: true }
  ), { markdown: ACCESSIBLE_DECK });
  await page.evaluate(() => window.switchToMode('presentation'));
  await expect(page.locator('#presentation-root')).toHaveAttribute('data-presentation-load-state', 'ready');
  await expect(page.locator('#presentation-root [data-slide-index]')).toHaveCount(2);
}

test.describe.configure({ mode: 'serial' });

test('editor surface passes Axe and names every visible control', async ({ appPage }) => {
  await appPage.evaluate(() => window.switchToMode('editor'));
  await ensureAxe(appPage);
  await checkA11y(appPage, '#main-content', {
    detailedReport: true,
    detailedReportOptions: { html: true }
  });

  const namedControlCount = await expectNamedControls(appPage, '#main-content');
  expect(namedControlCount).toBeGreaterThan(20);

  await appPage.locator('body').click({ position: { x: 8, y: 8 } });
  await appPage.keyboard.press('Tab');
  const keyboardFocusedControl = appPage.locator(':focus-visible');
  await expect(keyboardFocusedControl).toHaveCount(1);
  await expect(keyboardFocusedControl).toHaveAccessibleName(/\S/);
  const focusStyle = await keyboardFocusedControl.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow
    };
  });
  expect(
    (focusStyle.outlineStyle !== 'none' && parseFloat(focusStyle.outlineWidth) > 0) ||
    focusStyle.boxShadow !== 'none'
  ).toBe(true);
});

test('presentation controls, slides, graphics, and notes expose durable semantics', async ({ appPage }) => {
  await openPresentation(appPage);
  await ensureAxe(appPage);

  await expect(appPage.getByRole('region', { name: 'Presentation editor' })).toBeVisible();
  await expect(appPage.getByRole('toolbar', { name: 'Presentation editor controls' })).toBeVisible();
  await expect(appPage.getByRole('navigation', { name: 'Slide navigation' })).toBeVisible();
  await expect(appPage.locator('#speaker-notes-panel')).toHaveAttribute('aria-labelledby', 'speaker-notes-title');
  await expect(appPage.locator('#current-slide-notes')).toHaveAttribute('role', 'note');
  await expectNamedControls(appPage, '#presentation-root');

  const connectionLines = appPage.locator('#presentation-root .presentation-connection-lines');
  await expect(connectionLines).toHaveAttribute('aria-hidden', 'true');

  const authoringDiagramDisplay = await appPage.evaluate(() => {
    const diagram = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    diagram.id = 'meaningful-slide-diagram';
    diagram.setAttribute('role', 'img');
    diagram.setAttribute('aria-label', 'Meaningful slide diagram');
    diagram.setAttribute('width', '120');
    diagram.setAttribute('height', '60');
    diagram.innerHTML = '<circle cx="30" cy="30" r="20"></circle>';
    document.querySelector('[data-current-slide="true"] .slide-content').appendChild(diagram);
    return getComputedStyle(diagram).display;
  });
  expect(authoringDiagramDisplay).not.toBe('none');

  await checkA11y(appPage, '#presentation-root', {
    detailedReport: true,
    detailedReportOptions: { html: true }
  });
});

test('delivery mode supports keyboard navigation without trapping focus or hiding diagrams', async ({ appPage }) => {
  await appPage.getByRole('button', { name: 'Start presentation' }).click();
  await expect(appPage.locator('body')).toHaveClass(/is-presenting/);
  await expect(appPage.getByRole('region', { name: 'Presentation delivery' })).toBeVisible();
  await expect(appPage.getByRole('toolbar', { name: 'Presentation delivery controls' })).toBeVisible();
  await expectNamedControls(appPage, '#presentation-root');

  let currentSlide = appPage.locator('#presentation-root [aria-current="step"]');
  await expect(currentSlide).toHaveAttribute('data-slide-index', '0');
  await currentSlide.focus();
  await appPage.keyboard.press('End');
  currentSlide = appPage.locator('#presentation-root [aria-current="step"]');
  await expect(currentSlide).toHaveAttribute('data-slide-index', '1');
  await appPage.keyboard.press('ArrowLeft');
  await expect(appPage.locator('#presentation-root [aria-current="step"]')).toHaveAttribute('data-slide-index', '0');

  const deliveryDiagramDisplay = await appPage.evaluate(() => {
    const diagram = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    diagram.id = 'meaningful-delivery-diagram';
    diagram.setAttribute('role', 'img');
    diagram.setAttribute('aria-label', 'Meaningful delivery diagram');
    diagram.setAttribute('width', '120');
    diagram.setAttribute('height', '60');
    document.querySelector('[data-current-slide="true"] .slide-content').appendChild(diagram);
    return getComputedStyle(diagram).display;
  });
  expect(deliveryDiagramDisplay).not.toBe('none');

  await appPage.locator('#presentation-root [aria-current="step"]').focus();
  await appPage.keyboard.press('Tab');
  const focusedRole = await appPage.evaluate(() => ({
    tagName: document.activeElement?.tagName,
    name: document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim()
  }));
  expect(['BUTTON', 'SELECT']).toContain(focusedRole.tagName);
  expect(focusedRole.name).toBeTruthy();

  await ensureAxe(appPage);
  await checkA11y(appPage, '#presentation-root', {
    detailedReport: true,
    detailedReportOptions: { html: true }
  });

  await appPage.locator('#presentation-root [aria-current="step"]').focus();
  await appPage.keyboard.press('Escape');
  await expect(appPage.locator('body')).not.toHaveClass(/is-presenting/);
  await expect(appPage.getByRole('button', { name: 'Start presentation' })).toBeFocused();
});

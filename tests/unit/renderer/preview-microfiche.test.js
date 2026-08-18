const path = require('path');

const modulePath = path.resolve(__dirname, '../../../orchestrator/modules/previewMicrofiche.js');
const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);

function addLongDocument(container, prefix = 'Section') {
  for (let index = 0; index < 10; index += 1) {
    const heading = document.createElement('h2');
    heading.id = `heading-${index}`;
    heading.textContent = `${prefix} ${index + 1}`;
    const paragraph = document.createElement('p');
    paragraph.innerHTML = `<a href="https://example.com/${index}">Reference</a> ${'substantive text '.repeat(45)}`;
    container.append(heading, paragraph);
  }
}

describe('preview microfiche mode', () => {
  let PreviewMicrofiche;
  let wheelShouldZoom;
  let preview;
  let button;
  let scrollSync;

  beforeEach(() => {
    jest.resetModules();
    document.getElementById = nativeGetElementById;
    document.body.innerHTML = `
      <div id="preview-pane">
        <button id="preview-scroll-sync-btn"></button>
        <button id="preview-microfiche-btn" hidden></button>
        <div id="preview-content"></div>
        <div id="preview-zoom-controls"></div>
      </div>
    `;
    delete window.previewMicrofiche;
    ({ PreviewMicrofiche, wheelShouldZoom } = require(modulePath));
    preview = document.getElementById('preview-content');
    button = document.getElementById('preview-microfiche-btn');
    scrollSync = document.getElementById('preview-scroll-sync-btn');
  });

  function createController(options = {}) {
    const controller = new PreviewMicrofiche({
      document,
      window,
      minTextLength: 200,
      minBlockCount: 3,
      targetPageWeight: 700,
      ...options
    });
    expect(controller.initialize()).toBe(true);
    controller.prepareForFile({
      path: '/workspace/long.md',
      isMarkdown: true,
      isBinaryPreview: false,
      isHTML: false,
      isStructuredRecord: false,
      isBibTeX: false
    });
    return controller;
  }

  test('paginates rendered blocks into keyboard-accessible miniature frames', () => {
    addLongDocument(preview);
    const controller = createController();

    controller.handlePreviewCommit({ filePath: '/workspace/long.md', renderer: 'markdown' });
    expect(button.hidden).toBe(false);
    expect(controller.activate()).toBe(true);

    const frames = preview.querySelectorAll('.microfiche-frame');
    expect(frames.length).toBeGreaterThan(2);
    expect(frames[0].getAttribute('role')).toBe('button');
    expect(frames[0].getAttribute('aria-label')).toContain('Section 1');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(scrollSync.disabled).toBe(true);
    expect(document.getElementById('preview-zoom-controls').classList.contains('nightowl-ui-hidden')).toBe(true);
    expect(preview.querySelector('.microfiche-frame-content [id]')).toBeNull();
    expect(preview.querySelector('.microfiche-frame-content a[href]')).toBeNull();
  });

  test('selecting a frame restores the live preview at its source section', () => {
    addLongDocument(preview);
    const controller = createController();
    controller.handlePreviewCommit({ filePath: '/workspace/long.md', renderer: 'markdown' });
    controller.activate();
    const secondFrame = preview.querySelectorAll('.microfiche-frame')[1];

    secondFrame.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(controller.active).toBe(false);
    expect(preview.querySelector('.microfiche-shell')).toBeNull();
    expect(preview.querySelector('#heading-0')).not.toBeNull();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(scrollSync.disabled).toBe(false);
    expect(document.getElementById('preview-zoom-controls').classList.contains('nightowl-ui-hidden')).toBe(false);
  });

  test('fits, zooms, and pans the microfiche canvas without leaving overview mode', () => {
    addLongDocument(preview);
    const controller = createController();
    controller.handlePreviewCommit({ filePath: '/workspace/long.md', renderer: 'markdown' });
    controller.activate();

    Object.defineProperties(controller.viewport, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 }
    });
    Object.defineProperties(controller.grid, {
      scrollWidth: { configurable: true, value: 960 },
      scrollHeight: { configurable: true, value: 1200 }
    });

    expect(controller.fitToViewport()).toBe(true);
    const fitted = controller.getViewState();
    expect(fitted.scale).toBeCloseTo(544 / 1200, 3);
    expect(fitted.fitMode).toBe(true);
    expect(preview.querySelector('.microfiche-zoom-label').textContent).toBe('45%');

    controller.viewport.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      clientX: 400,
      clientY: 300
    }));
    window.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      buttons: 1,
      clientX: 330,
      clientY: 240
    }));
    window.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      button: 0,
      clientX: 330,
      clientY: 240
    }));
    const draggedFit = controller.getViewState();
    expect(draggedFit.translateX).toBeLessThan(fitted.translateX);
    expect(draggedFit.translateY).toBeLessThan(fitted.translateY);
    expect(draggedFit.fitMode).toBe(false);

    controller.fitToViewport();

    controller.zoomIn();
    expect(controller.getViewState().scale).toBeGreaterThan(fitted.scale);
    expect(controller.getViewState().fitMode).toBe(false);

    controller.setScale(1);
    const beforePan = controller.getViewState();
    controller.panBy(-48, -64);
    const afterPan = controller.getViewState();
    expect(afterPan.translateX).toBeLessThan(beforePan.translateX);
    expect(afterPan.translateY).toBeLessThan(beforePan.translateY);
    expect(afterPan.fitMode).toBe(false);
    expect(controller.active).toBe(true);

    controller.viewport.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
    expect(controller.getViewState().fitMode).toBe(true);
  });

  test('recognizes native pinch and mouse-wheel zoom input', () => {
    addLongDocument(preview);
    const controller = createController();
    controller.handlePreviewCommit({ filePath: '/workspace/long.md', renderer: 'markdown' });
    controller.activate();

    Object.defineProperties(controller.viewport, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 }
    });
    Object.defineProperties(controller.grid, {
      scrollWidth: { configurable: true, value: 960 },
      scrollHeight: { configurable: true, value: 1200 }
    });
    controller.fitToViewport();

    expect(wheelShouldZoom({ deltaY: -120, deltaX: 0, deltaMode: 0 })).toBe(true);
    expect(wheelShouldZoom({ deltaY: -8, deltaX: 2, deltaMode: 0 })).toBe(false);
    expect(wheelShouldZoom({ deltaY: -8 })).toBe(false);
    expect(wheelShouldZoom({ deltaY: -8, ctrlKey: true })).toBe(true);

    const beforeWheel = controller.getViewState().scale;
    controller.viewport.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -120,
      clientX: 400,
      clientY: 300
    }));
    expect(controller.getViewState().scale).toBeGreaterThan(beforeWheel);

    const gestureStart = new Event('gesturestart', { bubbles: true, cancelable: true });
    Object.defineProperties(gestureStart, {
      clientX: { value: 400 },
      clientY: { value: 300 },
      scale: { value: 1 }
    });
    controller.viewport.dispatchEvent(gestureStart);
    const beforePinch = controller.getViewState().scale;
    const gestureChange = new Event('gesturechange', { bubbles: true, cancelable: true });
    Object.defineProperties(gestureChange, {
      clientX: { value: 400 },
      clientY: { value: 300 },
      scale: { value: 1.25 }
    });
    controller.viewport.dispatchEvent(gestureChange);
    expect(controller.getViewState().scale).toBeGreaterThan(beforePinch);
  });

  test('keeps the selected mode while a long document is re-rendered', () => {
    addLongDocument(preview, 'First');
    const controller = createController();
    controller.handlePreviewCommit({ filePath: '/workspace/long.md', renderer: 'markdown' });
    controller.activate();

    preview.replaceChildren();
    addLongDocument(preview, 'Revised');
    controller.handlePreviewCommit({ filePath: '/workspace/long.md', renderer: 'markdown' });

    expect(controller.active).toBe(true);
    expect(preview.querySelector('.microfiche-frame').getAttribute('aria-label')).toContain('Revised 1');
  });

  test('suspends for source view and resumes the preferred grid', () => {
    addLongDocument(preview);
    const controller = createController();
    controller.handlePreviewCommit({ filePath: '/workspace/long.md', renderer: 'markdown' });
    controller.activate();

    controller.suspend();
    expect(controller.active).toBe(false);
    expect(preview.querySelector('#heading-0')).not.toBeNull();

    controller.resume();
    expect(controller.active).toBe(true);
  });

  test('stays unavailable for short and binary previews', () => {
    preview.innerHTML = '<p>Short note.</p>';
    const controller = createController({ minTextLength: 1000, minBlockCount: 8 });
    controller.handlePreviewCommit({ filePath: '/workspace/short.md', renderer: 'markdown' });
    expect(button.hidden).toBe(true);
    expect(controller.activate()).toBe(false);

    controller.prepareForFile({ path: '/workspace/deck.pptx', isPPTX: true, isBinaryPreview: true });
    expect(button.hidden).toBe(true);
    expect(controller.eligible).toBe(false);
  });
});

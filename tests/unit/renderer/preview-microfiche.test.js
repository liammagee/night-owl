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
    ({ PreviewMicrofiche } = require(modulePath));
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

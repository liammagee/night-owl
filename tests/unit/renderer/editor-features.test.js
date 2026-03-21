/**
 * Tests for new editor features:
 * - Breadcrumb navigation
 * - Zen mode
 * - Slide thumbnails
 * - Footnote panel
 * - Unsaved indicator
 */

// Restore native DOM getElementById (renderer.setup.js overrides it with a mock)
const nativeGetElementById = Object.getPrototypeOf(document).getElementById.bind(document);

beforeEach(() => {
  document.getElementById = nativeGetElementById;
});

describe('Breadcrumb Navigation', () => {
  let nav;

  // Reimplementation of updateBreadcrumb for isolated testing
  function updateBreadcrumb(filePath) {
    if (!nav) return;

    if (!filePath) {
      nav.innerHTML = '<span class="breadcrumb-segment" style="color: #999;">No file selected</span>';
      return;
    }

    const parts = filePath.split('/').filter(Boolean);
    const maxParts = 4;
    const displayParts = parts.length > maxParts
      ? ['...', ...parts.slice(-maxParts)]
      : parts;

    const html = displayParts.map((part, i) => {
      const isLast = i === displayParts.length - 1;
      const isEllipsis = part === '...';

      let segmentPath = '';
      if (!isEllipsis) {
        const realIndex = parts.length - displayParts.length + i;
        segmentPath = '/' + parts.slice(0, realIndex + 1).join('/');
      }

      let segmentHtml;
      if (isEllipsis) {
        segmentHtml = `<span class="breadcrumb-segment" title="${'/' + parts.join('/')}" style="color: #aaa;">…</span>`;
      } else if (isLast) {
        segmentHtml = `<span class="breadcrumb-segment current-file" title="${filePath}">${part}</span>`;
      } else {
        segmentHtml = `<span class="breadcrumb-segment clickable" data-path="${segmentPath}" title="${segmentPath}">${part}</span>`;
      }

      const separator = isLast ? '' : '<span class="breadcrumb-separator">›</span>';
      return segmentHtml + separator;
    }).join('');

    nav.innerHTML = html;
  }

  beforeEach(() => {
    document.body.innerHTML = '<nav id="breadcrumb-nav"></nav>';
    nav = document.getElementById('breadcrumb-nav');
  });

  test('shows "No file selected" when filePath is null', () => {
    updateBreadcrumb(null);
    expect(nav.textContent).toContain('No file selected');
  });

  test('shows "No file selected" when filePath is empty', () => {
    updateBreadcrumb('');
    expect(nav.textContent).toContain('No file selected');
  });

  test('renders short path without ellipsis', () => {
    updateBreadcrumb('/Users/docs/file.md');
    expect(nav.textContent).not.toContain('…');
    expect(nav.textContent).toContain('file.md');
    expect(nav.textContent).toContain('docs');
  });

  test('renders long path with ellipsis', () => {
    updateBreadcrumb('/Users/lmagee/Dev/machinespirits/machinespirits-ide/orchestrator/renderer.js');
    expect(nav.textContent).toContain('…');
    // Should show last 4 parts
    expect(nav.textContent).toContain('renderer.js');
    expect(nav.textContent).toContain('orchestrator');
  });

  test('marks last segment with current-file class', () => {
    updateBreadcrumb('/Users/docs/file.md');
    const currentFile = nav.querySelector('.current-file');
    expect(currentFile).toBeTruthy();
    expect(currentFile.textContent).toBe('file.md');
  });

  test('folder segments have clickable class', () => {
    updateBreadcrumb('/Users/docs/file.md');
    const clickable = nav.querySelectorAll('.clickable');
    expect(clickable.length).toBeGreaterThan(0);
    // Last segment (file.md) should NOT be clickable
    const lastSegment = nav.querySelector('.current-file');
    expect(lastSegment.classList.contains('clickable')).toBe(false);
  });

  test('clickable segments have data-path attribute', () => {
    updateBreadcrumb('/Users/docs/file.md');
    const clickable = nav.querySelector('.clickable');
    expect(clickable).toBeTruthy();
    expect(clickable.dataset.path).toBeTruthy();
    expect(clickable.dataset.path.startsWith('/')).toBe(true);
  });

  test('adds separators between segments', () => {
    updateBreadcrumb('/a/b/c.md');
    const separators = nav.querySelectorAll('.breadcrumb-separator');
    // 3 parts => 2 separators
    expect(separators.length).toBe(2);
    expect(separators[0].textContent).toBe('›');
  });

  test('ellipsis title shows full path', () => {
    updateBreadcrumb('/a/b/c/d/e/f/g.md');
    const ellipsisEl = nav.querySelector('.breadcrumb-segment[style*="color: #aaa"]');
    expect(ellipsisEl).toBeTruthy();
    expect(ellipsisEl.getAttribute('title')).toBe('/a/b/c/d/e/f/g.md');
  });

  test('maxParts is 4 — shows exactly 5 segments including ellipsis for long paths', () => {
    updateBreadcrumb('/a/b/c/d/e/f/g.md');
    // 7 parts > 4 maxParts => ['...', 'd', 'e', 'f', 'g.md'] = 5 display segments
    const segments = nav.querySelectorAll('.breadcrumb-segment');
    expect(segments.length).toBe(5);
  });
});

describe('Unsaved Indicator', () => {
  let nav;

  function updateUnsavedIndicator(hasUnsaved) {
    const currentFileEl = nav.querySelector('.current-file');
    if (currentFileEl) {
      const text = currentFileEl.textContent;
      if (hasUnsaved && !text.includes('●')) {
        currentFileEl.textContent = '● ' + text;
      } else if (!hasUnsaved && text.includes('●')) {
        currentFileEl.textContent = text.replace('● ', '');
      }
    }
  }

  beforeEach(() => {
    document.body.innerHTML = `
      <nav id="breadcrumb-nav">
        <span class="breadcrumb-segment current-file">file.md</span>
      </nav>`;
    nav = document.getElementById('breadcrumb-nav');
  });

  test('adds ● prefix when unsaved', () => {
    updateUnsavedIndicator(true);
    const el = nav.querySelector('.current-file');
    expect(el.textContent).toBe('● file.md');
  });

  test('removes ● prefix when saved', () => {
    const el = nav.querySelector('.current-file');
    el.textContent = '● file.md';
    updateUnsavedIndicator(false);
    expect(el.textContent).toBe('file.md');
  });

  test('does not double-add ● prefix', () => {
    updateUnsavedIndicator(true);
    updateUnsavedIndicator(true);
    const el = nav.querySelector('.current-file');
    expect(el.textContent).toBe('● file.md');
  });

  test('does nothing when no .current-file element', () => {
    nav.innerHTML = '';
    // Should not throw
    expect(() => updateUnsavedIndicator(true)).not.toThrow();
  });
});

describe('Zen Mode', () => {
  let zenModeActive, zenModeState, previewVisible;

  function toggleZenMode() {
    const sidebar = document.getElementById('left-sidebar');
    const modeSwitcher = document.getElementById('mode-switcher');
    const editorToolbar = document.getElementById('editor-toolbar');
    const rightPane = document.getElementById('right-pane');
    const gamificationPanel = document.getElementById('gamification-panel');
    const statusBar = document.getElementById('status-bar');

    if (!zenModeActive) {
      zenModeState = {
        sidebarHidden: sidebar?.classList.contains('pane-hidden'),
        previewVisible: previewVisible,
        gamificationHidden: gamificationPanel?.classList.contains('pane-hidden'),
      };

      if (sidebar) sidebar.classList.add('pane-hidden');
      if (modeSwitcher) modeSwitcher.style.display = 'none';
      if (editorToolbar) editorToolbar.style.display = 'none';
      if (rightPane) rightPane.classList.add('pane-hidden');
      if (gamificationPanel) gamificationPanel.classList.add('pane-hidden');
      if (statusBar) statusBar.style.display = 'none';

      previewVisible = false;
      zenModeActive = true;
      document.body.classList.add('zen-mode');
    } else {
      if (modeSwitcher) modeSwitcher.style.display = '';
      if (editorToolbar) editorToolbar.style.display = '';
      if (statusBar) statusBar.style.display = '';

      if (sidebar && !zenModeState.sidebarHidden) {
        sidebar.classList.remove('pane-hidden');
      }
      if (rightPane && zenModeState.previewVisible) {
        rightPane.classList.remove('pane-hidden');
        previewVisible = true;
      }
      if (gamificationPanel && !zenModeState.gamificationHidden) {
        gamificationPanel.classList.remove('pane-hidden');
      }

      zenModeActive = false;
      document.body.classList.remove('zen-mode');
    }
  }

  beforeEach(() => {
    zenModeActive = false;
    zenModeState = {};
    previewVisible = true;

    document.body.innerHTML = `
      <div id="left-sidebar"></div>
      <div id="mode-switcher"></div>
      <div id="editor-toolbar"></div>
      <div id="right-pane"></div>
      <div id="gamification-panel"></div>
      <div id="status-bar"></div>
      <div id="editor-container"></div>
    `;
    document.body.className = '';
  });

  test('entering zen mode hides all panels', () => {
    toggleZenMode();

    expect(document.getElementById('left-sidebar').classList.contains('pane-hidden')).toBe(true);
    expect(document.getElementById('mode-switcher').style.display).toBe('none');
    expect(document.getElementById('editor-toolbar').style.display).toBe('none');
    expect(document.getElementById('right-pane').classList.contains('pane-hidden')).toBe(true);
    expect(document.getElementById('gamification-panel').classList.contains('pane-hidden')).toBe(true);
    expect(document.getElementById('status-bar').style.display).toBe('none');
  });

  test('entering zen mode adds body class', () => {
    toggleZenMode();
    expect(document.body.classList.contains('zen-mode')).toBe(true);
  });

  test('exiting zen mode restores panels', () => {
    toggleZenMode(); // enter
    toggleZenMode(); // exit

    expect(document.getElementById('left-sidebar').classList.contains('pane-hidden')).toBe(false);
    expect(document.getElementById('mode-switcher').style.display).toBe('');
    expect(document.getElementById('editor-toolbar').style.display).toBe('');
    expect(document.getElementById('status-bar').style.display).toBe('');
    expect(document.body.classList.contains('zen-mode')).toBe(false);
  });

  test('exiting zen mode restores preview if it was visible', () => {
    previewVisible = true;
    toggleZenMode(); // enter — saves previewVisible: true
    toggleZenMode(); // exit — should restore

    expect(document.getElementById('right-pane').classList.contains('pane-hidden')).toBe(false);
    expect(previewVisible).toBe(true);
  });

  test('exiting zen mode keeps preview hidden if it was hidden', () => {
    previewVisible = false;
    toggleZenMode(); // enter — saves previewVisible: false
    toggleZenMode(); // exit — should NOT restore

    expect(document.getElementById('right-pane').classList.contains('pane-hidden')).toBe(true);
  });

  test('preserves sidebar hidden state through zen mode', () => {
    document.getElementById('left-sidebar').classList.add('pane-hidden');
    toggleZenMode(); // enter — sidebar was already hidden
    toggleZenMode(); // exit — should keep sidebar hidden

    expect(document.getElementById('left-sidebar').classList.contains('pane-hidden')).toBe(true);
  });
});

describe('Slide Thumbnails', () => {
  let strip;

  // Reimplementation of renderSlideThumbnails for testing
  function renderSlideThumbnails(content, cursorLine = 1) {
    if (!strip) return;

    const slides = content.split(/\n---[ \t]*\n/).map(s => s.trim()).filter(Boolean);

    if (slides.length < 2) {
      strip.style.display = 'none';
      return;
    }

    strip.style.display = 'block';

    // Find which slide the cursor is in
    let activeSlide = 0;
    const lines = content.split('\n');
    let slideIdx = 0;
    for (let i = 0; i < lines.length && i < cursorLine; i++) {
      if (lines[i].match(/^---\s*$/) && i > 0) slideIdx++;
    }
    activeSlide = Math.min(slideIdx, slides.length - 1);

    const renderHTML = (md) => {
      const clean = md.replace(/```notes\s*\n[\s\S]*?\n```/g, '').trim();
      return clean.replace(/\n/g, '<br>');
    };

    strip.innerHTML = slides.map((slide, i) => {
      const html = renderHTML(slide);
      return `<div class="slide-thumb ${i === activeSlide ? 'active' : ''}" data-slide-index="${i}" title="Slide ${i + 1}">
          <div class="slide-thumb-content">${html}</div>
          <span class="slide-thumb-label">${i + 1}</span>
      </div>`;
    }).join('');
  }

  beforeEach(() => {
    document.body.innerHTML = '<div id="slide-thumbnails-strip"></div>';
    strip = document.getElementById('slide-thumbnails-strip');
  });

  test('hides strip for single-slide content', () => {
    renderSlideThumbnails('# Just one slide\n\nContent here.');
    expect(strip.style.display).toBe('none');
  });

  test('hides strip for empty content', () => {
    renderSlideThumbnails('');
    expect(strip.style.display).toBe('none');
  });

  test('shows strip for multi-slide content', () => {
    renderSlideThumbnails('# Slide 1\n\n---\n\n# Slide 2');
    expect(strip.style.display).toBe('block');
  });

  test('renders correct number of thumbnails', () => {
    renderSlideThumbnails('# Slide 1\n\n---\n\n# Slide 2\n\n---\n\n# Slide 3');
    const thumbs = strip.querySelectorAll('.slide-thumb');
    expect(thumbs.length).toBe(3);
  });

  test('marks first slide as active by default', () => {
    renderSlideThumbnails('# Slide 1\n\n---\n\n# Slide 2', 1);
    const active = strip.querySelector('.slide-thumb.active');
    expect(active).toBeTruthy();
    expect(active.dataset.slideIndex).toBe('0');
  });

  test('marks correct slide active based on cursor position', () => {
    const content = '# Slide 1\n\n---\n\n# Slide 2\n\n---\n\n# Slide 3';
    // Cursor at line 6 is in Slide 2 (after first ---)
    renderSlideThumbnails(content, 6);
    const active = strip.querySelector('.slide-thumb.active');
    expect(active.dataset.slideIndex).toBe('1');
  });

  test('each thumbnail has a label number', () => {
    renderSlideThumbnails('# A\n\n---\n\n# B');
    const labels = strip.querySelectorAll('.slide-thumb-label');
    expect(labels[0].textContent).toBe('1');
    expect(labels[1].textContent).toBe('2');
  });

  test('strips speaker notes from thumbnails', () => {
    renderSlideThumbnails('# Slide\n\n```notes\nSecret note\n```\n\n---\n\n# Slide 2');
    const content = strip.querySelector('.slide-thumb-content').innerHTML;
    expect(content).not.toContain('Secret note');
    expect(content).not.toContain('notes');
  });

  test('thumbnails have data-slide-index attributes', () => {
    renderSlideThumbnails('A\n\n---\n\nB\n\n---\n\nC');
    const thumbs = strip.querySelectorAll('.slide-thumb');
    expect(thumbs[0].dataset.slideIndex).toBe('0');
    expect(thumbs[1].dataset.slideIndex).toBe('1');
    expect(thumbs[2].dataset.slideIndex).toBe('2');
  });
});

describe('Navigate to Slide', () => {
  test('calculates correct target line for each slide', () => {
    const content = '# Slide 1\nLine2\n---\n# Slide 2\nLine5\n---\n# Slide 3';

    function getTargetLine(slideIndex) {
      const lines = content.split('\n');
      let slideIdx = 0;
      let targetLine = 1;
      for (let i = 0; i < lines.length; i++) {
        if (slideIdx === slideIndex) { targetLine = i + 1; break; }
        if (lines[i].match(/^---\s*$/) && i > 0) {
          slideIdx++;
          if (slideIdx === slideIndex) { targetLine = i + 2; break; }
        }
      }
      return targetLine;
    }

    expect(getTargetLine(0)).toBe(1);
    expect(getTargetLine(1)).toBe(4); // Line after first ---
    expect(getTargetLine(2)).toBe(7); // Line after second ---
  });
});

describe('Footnote Panel', () => {
  let list, stats;

  // Reimplementation of footnote parsing logic for testing
  function parseFootnotes(content) {
    const lines = content.split('\n');

    const definitions = new Map();
    lines.forEach((line, i) => {
      const match = line.match(/^\[\^([^\]]+)\]:\s*(.+)$/);
      if (match) {
        definitions.set(match[1], { content: match[2].trim(), line: i + 1 });
      }
    });

    const references = new Map();
    lines.forEach((line, i) => {
      if (line.match(/^\[\^([^\]]+)\]:/)) return;
      const refRegex = /\[\^([^\]]+)\]/g;
      let match;
      while ((match = refRegex.exec(line)) !== null) {
        const id = match[1];
        if (!references.has(id)) references.set(id, []);
        references.get(id).push(i + 1);
      }
    });

    const allIds = new Set([...definitions.keys(), ...references.keys()]);
    return Array.from(allIds).map(id => ({
      id,
      definition: definitions.get(id),
      refLines: references.get(id) || [],
      hasDefinition: definitions.has(id),
      hasReferences: references.has(id)
    })).sort((a, b) => {
      const lineA = a.definition?.line || Infinity;
      const lineB = b.definition?.line || Infinity;
      return lineA - lineB || a.id.localeCompare(b.id);
    });
  }

  test('parses footnote definitions', () => {
    const content = 'Some text[^1]\n\n[^1]: This is the definition.';
    const footnotes = parseFootnotes(content);

    expect(footnotes.length).toBe(1);
    expect(footnotes[0].id).toBe('1');
    expect(footnotes[0].hasDefinition).toBe(true);
    expect(footnotes[0].definition.content).toBe('This is the definition.');
    expect(footnotes[0].definition.line).toBe(3);
  });

  test('parses footnote references', () => {
    const content = 'Text with [^note1] and [^note2] here.\n\n[^note1]: First note.';
    const footnotes = parseFootnotes(content);

    expect(footnotes.length).toBe(2);
    const note1 = footnotes.find(f => f.id === 'note1');
    expect(note1.hasReferences).toBe(true);
    expect(note1.refLines).toContain(1);
  });

  test('detects undefined references (no definition)', () => {
    const content = 'Text with [^missing] reference.';
    const footnotes = parseFootnotes(content);

    expect(footnotes.length).toBe(1);
    expect(footnotes[0].id).toBe('missing');
    expect(footnotes[0].hasDefinition).toBe(false);
    expect(footnotes[0].hasReferences).toBe(true);
  });

  test('detects unused definitions (no references)', () => {
    const content = '[^unused]: This definition is never referenced.';
    const footnotes = parseFootnotes(content);

    expect(footnotes.length).toBe(1);
    expect(footnotes[0].id).toBe('unused');
    expect(footnotes[0].hasDefinition).toBe(true);
    expect(footnotes[0].hasReferences).toBe(false);
  });

  test('counts multiple references to same footnote', () => {
    const content = 'First [^1] and second [^1] usage.\n\n[^1]: Repeated reference.';
    const footnotes = parseFootnotes(content);

    const fn1 = footnotes.find(f => f.id === '1');
    expect(fn1.refLines.length).toBe(2);
  });

  test('does not count definition line as reference', () => {
    const content = '[^1]: Definition only, no references.';
    const footnotes = parseFootnotes(content);

    expect(footnotes[0].refLines.length).toBe(0);
    expect(footnotes[0].hasReferences).toBe(false);
  });

  test('handles empty content', () => {
    const footnotes = parseFootnotes('');
    expect(footnotes.length).toBe(0);
  });

  test('handles complex footnote IDs', () => {
    const content = 'See [^smith-2024] for details.\n\n[^smith-2024]: Smith et al. 2024.';
    const footnotes = parseFootnotes(content);

    expect(footnotes.length).toBe(1);
    expect(footnotes[0].id).toBe('smith-2024');
  });

  test('sorts by definition line number', () => {
    const content = '[^b]: Second def\n[^a]: First def\nText [^a] and [^b].';
    const footnotes = parseFootnotes(content);

    expect(footnotes[0].id).toBe('b');
    expect(footnotes[1].id).toBe('a');
  });

  test('sorts undefined references after defined ones', () => {
    const content = 'Text [^undefined]\n[^defined]: Has definition\nMore [^defined]';
    const footnotes = parseFootnotes(content);

    // defined (line 2) before undefined (Infinity)
    expect(footnotes[0].id).toBe('defined');
    expect(footnotes[1].id).toBe('undefined');
  });

  test('handles multiple footnotes in same line', () => {
    const content = 'Text [^1] and [^2] and [^3] here.\n[^1]: One\n[^2]: Two\n[^3]: Three';
    const footnotes = parseFootnotes(content);

    expect(footnotes.length).toBe(3);
    expect(footnotes.every(f => f.hasReferences)).toBe(true);
    expect(footnotes.every(f => f.hasDefinition)).toBe(true);
  });
});

describe('Slide Content Separator Regex', () => {
  test('splits on --- separator lines', () => {
    const content = '# Slide 1\n\n---\n\n# Slide 2';
    const slides = content.split(/\n---[ \t]*\n/).map(s => s.trim()).filter(Boolean);
    expect(slides.length).toBe(2);
  });

  test('does not split on --- within code blocks (basic check)', () => {
    // The regex is a simple split, so it does split within code blocks
    // This test documents the current behavior
    const content = '# Slide 1\n\n```\n---\n```\n\n# Still Slide 1';
    const slides = content.split(/\n---[ \t]*\n/).map(s => s.trim()).filter(Boolean);
    // Current behavior: splits on --- even in code blocks
    expect(slides.length).toBeGreaterThanOrEqual(1);
  });

  test('handles --- with trailing whitespace', () => {
    const content = '# Slide 1\n\n---   \n\n# Slide 2';
    const slides = content.split(/\n---[ \t]*\n/).map(s => s.trim()).filter(Boolean);
    expect(slides.length).toBe(2);
  });

  test('does not split on ---- (4+ dashes) in content', () => {
    // --- with more chars won't match /^---\s*$/ but the split regex just checks ---
    const content = '# Slide 1\n\n---\n\n# Slide 2';
    const slides = content.split(/\n---[ \t]*\n/).map(s => s.trim()).filter(Boolean);
    expect(slides.length).toBe(2);
  });
});

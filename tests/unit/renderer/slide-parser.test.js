const fs = require('fs');
const path = require('path');
const vm = require('vm');
const slides = require('../../../orchestrator/modules/slide-parser');
const read = file => fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');

// Matches lecture-7.md: a hidden separator precedes a commented-out passage.
const hidden = '<!--\n---\n\nHidden draft slide\n\n-->';
const markdown = `# First\n\n${hidden}\n\n---\n\n# Second\n\n\`\`\`notes\nSecond slide notes\n\`\`\``;

test('a separator inside an HTML comment stays in its original slide', () => {
    const result = slides.parse(markdown);
    expect(result).toHaveLength(2);
    expect(result[0].content).toContain(hidden);
    expect(result[1].content).toContain('# Second');
    const secondLine = markdown.split('\n').indexOf('# Second') + 1;
    expect(slides.indexAtLine(markdown, secondLine)).toBe(1);
    expect(slides.indexAtLine(markdown, 6)).toBe(0);
    expect(result[1].startLine).toBe(secondLine - 1);
});

test.each([
    ['inline opening', '# One <!-- draft\n---\nhidden -->\n---\n# Two'],
    ['multiple comments per line', '# One <!-- a --> <!-- b\n---\n-->\n---\n# Two'],
    ['Windows line endings', '# One\r\n<!--\r\n---\r\n-->\r\n--- \t\r\n# Two'],
    ['fenced code', '# One\n```markdown\n<!--\n---\n```\n---\n# Two'],
    ['tilde fences', '# One\n~~~~\n---\n~~~\n---\n~~~~\n---\n# Two'],
    ['fence text in comments', '# One\n<!--\n```\n---\n-->\n---\n# Two'],
    ['speaker notes', '# One\n```notes\n---\nMore notes\n```\n---\n# Two']
])('%s does not introduce a spurious slide', (_, content) => {
    expect(slides.split(content)).toHaveLength(2);
    expect(slides.split(content)[1].trim()).toBe('# Two');
});

test('an unfinished comment hides subsequent separators while typing', () => {
    expect(slides.split('# One\n<!--\n---\nhidden\n---')).toHaveLength(1);
});

test('empty segments do not shift visible slide indices', () => {
    const content = '---\n# One\n---\n---\n# Two\n---';
    expect(slides.split(content)).toEqual(['# One', '# Two']);
    expect(slides.parse(content).map(slide => slide.startLine)).toEqual([2, 5]);
    expect(slides.indexAtLine(content, 5)).toBe(1);
    expect(slides.split('')).toEqual([]);
});

test.each(['***', '___', '- - -', '  ----', '* * *', '---\t'])('thematic break %s is shared with presentation rendering', marker => {
    expect(slides.split(`# One\n${marker}\n# Two`)).toEqual(['# One', '# Two']);
});

test.each([
    'Use `<!--` to open a comment.',
    'Use ``some ` <!-- code`` here.',
    'Use `a multiline\n<!-- span` here.',
    'Use `<!-- hidden -->` literally.'
])('inline code does not start a hidden comment: %s', example => {
    expect(slides.split(`# One\n${example}\n---\n# Two`)).toHaveLength(2);
});

test('a comment after an inline code span still hides separators', () => {
    expect(slides.split('# One\n`<!--` <!-- real\n---\n-->\n---\n# Two')).toHaveLength(2);
    expect(slides.split('# One\n`unclosed <!-- real\n---\nhidden')).toHaveLength(1);
    expect(slides.split('# One\n\\` <!-- real `\n---\nhidden')).toHaveLength(1);
});

test.each(['---', '...'])('frontmatter ending with %s is never counted or moved as a slide', closing => {
    const preamble = `---\ntitle: Demo\n${closing}\n`;
    const source = preamble + '# One\n***\n# Two';
    const parsed = slides.parse(source);
    expect(parsed.map(slide => slide.startLine)).toEqual([4, 6]);
    expect(slides.split(source)).toEqual(['# One', '# Two']);
    expect(slides.join(source, ['# Two', '# One'])).toBe(preamble + '# Two\n\n---\n\n# One');
    expect(slides.join(source, [])).toBe(preamble);
    expect(slides.indexAtLine(source, 6)).toBe(1);
});

test('frontmatter preserves BOM and Windows newlines', () => {
    const preamble = '\uFEFF---\r\ntitle: Demo\r\n---\r\n';
    expect(slides.parseDocument(preamble + '# One').preamble).toBe(preamble);
    expect(slides.join(preamble + '# One', ['# Replacement'])).toBe(preamble + '# Replacement');
});

test('mode switching uses the same boundaries and never jumps from a separator to the last slide', () => {
    let content = '# One\n---\n# Two\n---\n# Three';
    let lineNumber = 2;
    const context = { window: {
        NightOwlSlides: slides,
        editor: { getValue: () => content, getPosition: () => ({ lineNumber }) },
        goToLine: jest.fn()
    } };
    const source = read('js/mode-switcher.js');
    vm.runInNewContext(source.slice(source.indexOf('function jumpToSlideInEditor('), source.indexOf('function restoreUIElementsAfterPresentation(')), context);
    expect(context.calculateSlideFromCursor()).toBe(0);
    content = '---\ntitle: Demo\n---\n# One\n<!--\n---\n-->\n***\n# Two';
    lineNumber = 9;
    expect(context.calculateSlideFromCursor()).toBe(1);
    context.jumpToSlideInEditor(1);
    expect(context.window.goToLine).toHaveBeenCalledWith(9);
});

test.each([
    'plugins/techne-presentations/src/MarkdownPreziApp.jsx',
    'plugins/techne-presentations/MarkdownPreziApp.js'
])('presentation parser hides comments and preserves background directives: %s', file => {
    const source = read(file);
    const start = source.indexOf('  const extractSpeakerNotes =') >= 0
        ? source.indexOf('  const extractSpeakerNotes =') : source.indexOf('  var extractSpeakerNotes =');
    const context = {
        window: { NightOwlSlides: slides },
        calculateSlidePosition: () => ({}), parseMarkdownContent: content => content
    };
    vm.runInNewContext(source.slice(start, source.indexOf('  // Initialize - wait for content', start)) + '\nthis.parse = parseMarkdown;', context);
    const result = context.parse('<!-- bg: /background.png -->\n' + markdown);
    expect(result).toHaveLength(2);
    expect(result[0].cleanContent).toBe('# First');
    expect(result[0].backgroundImage).toBe('file:///background.png');
    expect(result[1].speakerNotes).toBe('Second slide notes');
});

test('speaker notes stay aligned with the visible slide numbers', () => {
    const source = read('plugins/techne-presentations/speaker-notes.js');
    const context = { window: { NightOwlSlides: slides } };
    vm.runInNewContext(source.slice(source.indexOf('function extractSpeakerNotes'), source.indexOf('async function showSpeakerNotesPanel')), context);
    expect(context.extractSpeakerNotes(markdown)).toEqual(['', 'Second slide notes']);
});

describe('editor slide actions', () => {
    let content;
    let context;
    beforeEach(() => {
        content = markdown;
        const model = {
            getFullModelRange: () => ({}),
            pushEditOperations: (_, edits) => { content = edits[0].text; }
        };
        context = {
            window: { NightOwlSlides: slides, editor: {
                getValue: () => content, getModel: () => model,
                revealLineInCenter: jest.fn(), setPosition: jest.fn(), focus: jest.fn()
            } }
        };
        const source = read('orchestrator/renderer.js');
        vm.runInNewContext(
            source.slice(source.indexOf('function navigateToSlide('), source.indexOf('function setupSlideDragAndDrop(')) +
            source.slice(source.indexOf('function deleteSlides('), source.indexOf('async function copyOrMoveSlidesToFile(')), context);
    });

    test('navigation skips the hidden separator', () => {
        context.navigateToSlide(1, content);
        expect(context.window.editor.setPosition).toHaveBeenCalledWith({
            lineNumber: slides.parse(markdown)[1].startLine, column: 1
        });
    });
    test('delete acts on the selected visible slide without breaking comments', () => {
        context.deleteSlides(new Set([1]));
        expect(content).toContain(hidden);
        expect(content).not.toContain('# Second');
        expect(slides.split(content)).toHaveLength(1);
    });
    test('reorder keeps a complete comment attached to its slide', () => {
        context.reorderSlides(new Set([0]), 2);
        expect(slides.split(content)[0]).toContain('# Second');
        expect(slides.split(content)[1]).toContain(hidden);
        expect(slides.split(content)).toHaveLength(2);
    });
    test('source edits keep frontmatter at the start of the document', () => {
        const preamble = '---\ntitle: Lecture\n---\n';
        content = preamble + markdown;
        context.reorderSlides(new Set([0]), 2);
        expect(content.startsWith(preamble)).toBe(true);
        expect(slides.split(content)[0]).toContain('# Second');
        context.deleteSlides(new Set([0]));
        expect(content.startsWith(preamble)).toBe(true);
        expect(slides.split(content)).toHaveLength(1);
    });
    test('duplicate and paste keep complete slides', () => {
        context.duplicateSlides(new Set([0]));
        expect(slides.split(content)).toHaveLength(3);
        expect(slides.split(content)[1]).toContain(hidden);
        context.pasteSlides(2, ['# Inserted']);
        expect(slides.split(content)).toHaveLength(4);
        expect(slides.split(content)[2]).toContain('# Inserted');
    });
});

test('commented-out notes never appear in the presenter notes', () => {
    const source = read('plugins/techne-presentations/speaker-notes.js');
    const context = { window: { NightOwlSlides: slides } };
    vm.runInNewContext(source.slice(source.indexOf('function extractSpeakerNotes'), source.indexOf('async function showSpeakerNotesPanel')), context);
    const content = '# One\n<!--\n```notes\nHidden draft notes\n```\n-->\n```notes\nVisible notes\n```';
    expect(context.extractSpeakerNotes(content)).toEqual(['Visible notes']);
});

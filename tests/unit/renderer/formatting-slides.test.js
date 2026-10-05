const fs = require('fs');
const path = require('path');
const vm = require('vm');
const slides = require('../../../orchestrator/modules/slide-parser');

describe('slide marker source edits', () => {
    let context, content, model, editor;
    const preamble = '---\ntitle: Demo\n---\n';
    const code = '```markdown\nExample\n\n---\n```';
    const comment = '<!--\nHidden\n\n---\n-->';
    beforeEach(() => {
        content = preamble + '# One\n\n' + code + '\n\n' + comment + '\n\n***\n\n# Two';
        model = { getValue: () => content, getFullModelRange: () => ({ full: true }) };
        editor = {
            getModel: () => model,
            pushUndoStop: jest.fn(),
            executeEdits: jest.fn((_, edits) => { content = edits[0].text; }),
            setValue: jest.fn()
        };
        context = { window: {
            editor, NightOwlSlides: slides,
            showAppConfirm: jest.fn().mockResolvedValue(true), showNotification: jest.fn()
        } };
        const source = fs.readFileSync(path.resolve(__dirname, '../../../orchestrator/modules/formatting.js'), 'utf8');
        vm.runInNewContext(source.slice(source.indexOf('// --- Slide Markers ---'), source.indexOf('// --- Speaker Notes ---')), context);
    });

    test('removes real separators and preserves metadata, examples and comments in one undoable edit', async () => {
        await context.removeAllSlideMarkers();
        expect(content.startsWith(preamble)).toBe(true);
        expect(content).toContain(code);
        expect(content).toContain(comment);
        expect(content).not.toContain('***');
        expect(editor.executeEdits).toHaveBeenCalledTimes(1);
        expect(editor.pushUndoStop).toHaveBeenCalledTimes(2);
        expect(editor.setValue).not.toHaveBeenCalled();
    });

    test('adds separators only between visible paragraphs, outside comments, notes and metadata', async () => {
        content = preamble + '# One\n\nParagraph one\n\nParagraph two\n\n' + code + '\n\n' + comment + '\n';
        await context.addSlideMarkersToParagraphs();
        expect(content.startsWith(preamble)).toBe(true);
        expect(content).toContain(code);
        expect(content).toContain(comment);
        expect(content).toContain('Paragraph one\n\n---\n\nParagraph two');
        expect(slides.parseDocument(content).separatorLines).toHaveLength(2);
        expect(editor.pushUndoStop).toHaveBeenCalledTimes(2);
    });

    test.each(['addSlideMarkersToParagraphs', 'removeAllSlideMarkers'])('%s does not overwrite an edit made during confirmation', async action => {
        content += '\n\nA paragraph\n\nAnother paragraph';
        const newer = content + '\nNew draft';
        context.window.showAppConfirm.mockImplementation(async () => { content = newer; return true; });
        await context[action]();
        expect(content).toBe(newer);
        expect(editor.executeEdits).not.toHaveBeenCalled();
    });

    test('switching tabs during confirmation does not apply the original content to a new model', async () => {
        context.window.showAppConfirm.mockImplementation(async () => {
            editor.getModel = () => ({ getValue: () => 'Another file' });
            return true;
        });
        await context.removeAllSlideMarkers();
        expect(editor.executeEdits).not.toHaveBeenCalled();
    });

    test('cancel leaves the document and undo history alone', async () => {
        context.window.showAppConfirm.mockResolvedValue(false);
        await context.removeAllSlideMarkers();
        expect(editor.executeEdits).not.toHaveBeenCalled();
        expect(editor.pushUndoStop).not.toHaveBeenCalled();
    });
});

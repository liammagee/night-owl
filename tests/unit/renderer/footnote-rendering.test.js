/**
 * Unit tests for footnote extraction and rendering in TechneMarkdownRenderer.
 * Tests the pre/post-processing approach: extract definitions before marked parsing,
 * then replace inline references and append footnotes section after parsing.
 */

// Minimal mock of TechneMarkdownRenderer's footnote functions
// (extracted logic matches the plugin implementation)

function extractFootnoteDefinitions(markdown) {
    const footnotes = new Map();
    if (!markdown) return { body: '', footnotes };

    const lines = String(markdown).split('\n');
    let body = '';
    let currentId = null;
    let currentContent = '';
    let skipLines = false;

    const flushFootnote = () => {
        if (currentId !== null) {
            footnotes.set(currentId, currentContent.trim());
            currentId = null;
            currentContent = '';
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const defMatch = line.match(/^\[\^([^\]]+)\]:\s*(.*)/);

        if (defMatch) {
            flushFootnote();
            currentId = defMatch[1];
            currentContent = defMatch[2];
            skipLines = true;
        } else if (skipLines && (line.startsWith('    ') || line.startsWith('\t') || line.trim() === '')) {
            if (currentId !== null) {
                currentContent += '\n' + (line.startsWith('    ') ? line.slice(4) : line.startsWith('\t') ? line.slice(1) : line);
            }
        } else {
            flushFootnote();
            skipLines = false;
            body += line + '\n';
        }
    }
    flushFootnote();

    return { body, footnotes };
}

function renderFootnotes(html, footnotes) {
    if (!footnotes || footnotes.size === 0) return html;

    const referencedOrder = [];
    const refNumberMap = new Map();

    const processed = html.replace(/\[\^([^\]]+)\]/g, (match, id) => {
        if (!footnotes.has(id)) return match;
        if (!refNumberMap.has(id)) {
            referencedOrder.push(id);
            refNumberMap.set(id, referencedOrder.length);
        }
        const num = refNumberMap.get(id);
        return `<sup class="footnote-ref"><a href="#fn-${id}" id="fnref-${id}" title="Footnote ${num}">${num}</a></sup>`;
    });

    if (referencedOrder.length === 0) return html;

    const items = referencedOrder.map(id => {
        const num = refNumberMap.get(id);
        const content = footnotes.get(id) || '';
        return `<li id="fn-${id}" class="footnote-item"><span class="footnote-content">${content}</span> <a href="#fnref-${id}" class="footnote-backref" title="Back to reference ${num}">↩</a></li>`;
    });

    const footnotesHtml = `\n<section class="footnotes-section" role="doc-endnotes">\n    <hr class="footnotes-separator">\n    <ol class="footnotes-list">\n        ${items.join('\n        ')}\n    </ol>\n</section>`;

    return processed + footnotesHtml;
}

describe('extractFootnoteDefinitions', () => {
    test('extracts single footnote definition', () => {
        const md = 'Some text[^1] here.\n\n[^1]: This is the footnote.';
        const { body, footnotes } = extractFootnoteDefinitions(md);

        expect(footnotes.size).toBe(1);
        expect(footnotes.get('1')).toBe('This is the footnote.');
        expect(body).toContain('Some text[^1] here.');
        expect(body).not.toContain('[^1]:');
    });

    test('extracts multiple footnote definitions', () => {
        const md = 'Text[^a] and more[^b].\n\n[^a]: First note.\n[^b]: Second note.';
        const { body, footnotes } = extractFootnoteDefinitions(md);

        expect(footnotes.size).toBe(2);
        expect(footnotes.get('a')).toBe('First note.');
        expect(footnotes.get('b')).toBe('Second note.');
    });

    test('handles multi-line footnote definitions (4-space indent)', () => {
        const md = 'Text[^1].\n\n[^1]: First line.\n    Second line.\n    Third line.';
        const { body, footnotes } = extractFootnoteDefinitions(md);

        expect(footnotes.size).toBe(1);
        const content = footnotes.get('1');
        expect(content).toContain('First line.');
        expect(content).toContain('Second line.');
        expect(content).toContain('Third line.');
    });

    test('handles multi-line footnote definitions (tab indent)', () => {
        const md = 'Text[^1].\n\n[^1]: First line.\n\tSecond line.';
        const { body, footnotes } = extractFootnoteDefinitions(md);

        expect(footnotes.size).toBe(1);
        const content = footnotes.get('1');
        expect(content).toContain('First line.');
        expect(content).toContain('Second line.');
    });

    test('handles alphanumeric footnote ids', () => {
        const md = 'Text[^hegel1807].\n\n[^hegel1807]: Phenomenology of Spirit.';
        const { body, footnotes } = extractFootnoteDefinitions(md);

        expect(footnotes.size).toBe(1);
        expect(footnotes.get('hegel1807')).toBe('Phenomenology of Spirit.');
    });

    test('returns empty footnotes for no definitions', () => {
        const md = 'Just regular text with no footnotes.';
        const { body, footnotes } = extractFootnoteDefinitions(md);

        expect(footnotes.size).toBe(0);
        expect(body).toContain('Just regular text');
    });

    test('handles null/empty input', () => {
        expect(extractFootnoteDefinitions(null).footnotes.size).toBe(0);
        expect(extractFootnoteDefinitions('').footnotes.size).toBe(0);
    });

    test('handles blank line continuation in multi-line footnotes', () => {
        const md = '[^1]: First paragraph.\n\n    Second paragraph after blank line.';
        const { footnotes } = extractFootnoteDefinitions(md);

        expect(footnotes.size).toBe(1);
        const content = footnotes.get('1');
        expect(content).toContain('First paragraph.');
        expect(content).toContain('Second paragraph after blank line.');
    });
});

describe('renderFootnotes', () => {
    test('replaces inline references with superscript links', () => {
        const footnotes = new Map([['1', 'A footnote.']]);
        const html = '<p>Some text[^1] here.</p>';

        const result = renderFootnotes(html, footnotes);

        expect(result).toContain('<sup class="footnote-ref">');
        expect(result).toContain('href="#fn-1"');
        expect(result).toContain('id="fnref-1"');
        expect(result).not.toContain('[^1]');
    });

    test('numbers footnotes in order of appearance', () => {
        const footnotes = new Map([
            ['b', 'Second defined.'],
            ['a', 'First defined.']
        ]);
        const html = '<p>First ref[^a] then[^b].</p>';

        const result = renderFootnotes(html, footnotes);

        // [^a] appears first in text, so it gets number 1
        expect(result).toContain('title="Footnote 1">1</a>');
        expect(result).toContain('title="Footnote 2">2</a>');
    });

    test('appends footnotes section at the end', () => {
        const footnotes = new Map([['1', 'Content here.']]);
        const html = '<p>Text[^1].</p>';

        const result = renderFootnotes(html, footnotes);

        expect(result).toContain('<section class="footnotes-section"');
        expect(result).toContain('role="doc-endnotes"');
        expect(result).toContain('<ol class="footnotes-list">');
        expect(result).toContain('class="footnote-item"');
        expect(result).toContain('Content here.');
    });

    test('includes backref links in footnote items', () => {
        const footnotes = new Map([['note1', 'A note.']]);
        const html = '<p>Text[^note1].</p>';

        const result = renderFootnotes(html, footnotes);

        expect(result).toContain('href="#fnref-note1"');
        expect(result).toContain('class="footnote-backref"');
        expect(result).toContain('↩');
    });

    test('ignores references without definitions', () => {
        const footnotes = new Map([['1', 'Defined.']]);
        const html = '<p>Has[^1] and missing[^2].</p>';

        const result = renderFootnotes(html, footnotes);

        expect(result).toContain('href="#fn-1"');
        // [^2] should remain as literal text since no definition
        expect(result).toContain('[^2]');
    });

    test('returns html unchanged when no footnotes', () => {
        const html = '<p>No footnotes here.</p>';

        expect(renderFootnotes(html, new Map())).toBe(html);
        expect(renderFootnotes(html, null)).toBe(html);
    });

    test('handles duplicate references to same footnote', () => {
        const footnotes = new Map([['1', 'Shared note.']]);
        const html = '<p>First[^1] and again[^1].</p>';

        const result = renderFootnotes(html, footnotes);

        // Both references should get number 1
        const matches = result.match(/title="Footnote 1">/g);
        expect(matches).toHaveLength(2);

        // Only one footnote item in the section
        const items = result.match(/class="footnote-item"/g);
        expect(items).toHaveLength(1);
    });
});

// Inline footnote extraction (matches plugin implementation)
function extractInlineFootnotes(markdown, footnotes) {
    let counter = footnotes.size;

    // 1. Pandoc-style inline footnotes: ^[content]
    let processed = markdown.replace(/\^\[([^\]]+)\]/g, (_match, content) => {
        counter++;
        const autoId = `_fn_${counter}`;
        footnotes.set(autoId, content.trim());
        return `[^${autoId}]`;
    });

    // 2. Prose-in-brackets: [^content with spaces] where no definition exists
    processed = processed.replace(/\[\^([^\]]+)\]/g, (match, id) => {
        if (footnotes.has(id)) return match;
        if (!id.includes(' ')) return match;
        counter++;
        const autoId = `_fn_${counter}`;
        footnotes.set(autoId, id.trim());
        return `[^${autoId}]`;
    });

    return processed;
}

describe('extractInlineFootnotes', () => {
    test('converts pandoc-style ^[content] to reference footnote', () => {
        const footnotes = new Map();
        const result = extractInlineFootnotes('Text ^[This is a note] here.', footnotes);

        expect(result).toMatch(/\[\^_fn_\d+\]/);
        expect(result).not.toContain('^[');
        expect(footnotes.size).toBe(1);
        const content = Array.from(footnotes.values())[0];
        expect(content).toBe('This is a note');
    });

    test('converts multiple pandoc inline footnotes', () => {
        const footnotes = new Map();
        const result = extractInlineFootnotes('First^[note one] and second^[note two].', footnotes);

        expect(footnotes.size).toBe(2);
        const values = Array.from(footnotes.values());
        expect(values).toContain('note one');
        expect(values).toContain('note two');
    });

    test('converts [^prose with spaces] to reference footnote', () => {
        const footnotes = new Map();
        const result = extractInlineFootnotes('Text [^For some commentators this is important] here.', footnotes);

        expect(result).toMatch(/\[\^_fn_\d+\]/);
        expect(result).not.toContain('[^For some');
        expect(footnotes.size).toBe(1);
        const content = Array.from(footnotes.values())[0];
        expect(content).toBe('For some commentators this is important');
    });

    test('does not convert [^shortId] without spaces', () => {
        const footnotes = new Map();
        const result = extractInlineFootnotes('Text [^hegel1807] here.', footnotes);

        expect(result).toContain('[^hegel1807]');
        expect(footnotes.size).toBe(0);
    });

    test('does not convert [^id] that already has a definition', () => {
        const footnotes = new Map([['my note', 'Existing definition']]);
        const result = extractInlineFootnotes('Text [^my note] here.', footnotes);

        // Should keep the reference as-is since a definition exists
        expect(result).toContain('[^my note]');
        expect(footnotes.size).toBe(1);
    });

    test('handles mix of pandoc inline and prose-in-brackets', () => {
        const footnotes = new Map();
        const result = extractInlineFootnotes(
            'First ^[pandoc style] then [^prose with spaces here].',
            footnotes
        );

        expect(footnotes.size).toBe(2);
        const values = Array.from(footnotes.values());
        expect(values).toContain('pandoc style');
        expect(values).toContain('prose with spaces here');
    });

    test('continues counter from existing footnotes', () => {
        const footnotes = new Map([['existing', 'Already defined.']]);
        extractInlineFootnotes('Text ^[new note] here.', footnotes);

        expect(footnotes.size).toBe(2);
        expect(footnotes.has('_fn_2')).toBe(true);
    });
});

describe('end-to-end footnote pipeline', () => {
    test('extract then render produces complete footnoted output', () => {
        const markdown = `Here is some text with a footnote[^1] and another[^2].

Regular paragraph in between.

[^1]: This is the first footnote with **bold** text.
[^2]: This is the second footnote.`;

        const { body, footnotes } = extractFootnoteDefinitions(markdown);

        // Definitions removed from body
        expect(body).not.toContain('[^1]:');
        expect(body).not.toContain('[^2]:');

        // Simulate marked parsing (just wrap in p tags for test)
        const html = `<p>${body.trim()}</p>`;

        const result = renderFootnotes(html, footnotes);

        // References replaced
        expect(result).toContain('href="#fn-1"');
        expect(result).toContain('href="#fn-2"');

        // Footnotes section present
        expect(result).toContain('class="footnotes-section"');
        expect(result).toContain('This is the first footnote');
        expect(result).toContain('This is the second footnote');
    });

    test('pandoc inline footnotes render as superscript with footnotes section', () => {
        const markdown = 'Hegel argues for absolute knowing^[See the final chapter of the Phenomenology].';

        const { body, footnotes } = extractFootnoteDefinitions(markdown);
        const processed = extractInlineFootnotes(body, footnotes);

        expect(footnotes.size).toBe(1);
        const html = `<p>${processed.trim()}</p>`;
        const result = renderFootnotes(html, footnotes);

        expect(result).toContain('<sup class="footnote-ref">');
        expect(result).toContain('See the final chapter of the Phenomenology');
        expect(result).toContain('class="footnotes-section"');
        expect(result).not.toContain('^[');
    });

    test('prose-in-brackets footnotes render correctly', () => {
        const markdown = 'For some commentators [^our recollection owes more to Kojeve] this is key.';

        const { body, footnotes } = extractFootnoteDefinitions(markdown);
        const processed = extractInlineFootnotes(body, footnotes);

        expect(footnotes.size).toBe(1);
        const html = `<p>${processed.trim()}</p>`;
        const result = renderFootnotes(html, footnotes);

        expect(result).toContain('<sup class="footnote-ref">');
        expect(result).toContain('our recollection owes more to Kojeve');
        expect(result).toContain('class="footnotes-section"');
    });

    test('mixed reference and inline footnotes render with correct numbering', () => {
        const markdown = `First reference[^1] then inline^[This is inline] then another reference[^2].

[^1]: First defined footnote.
[^2]: Second defined footnote.`;

        const { body, footnotes } = extractFootnoteDefinitions(markdown);
        const processed = extractInlineFootnotes(body, footnotes);

        expect(footnotes.size).toBe(3); // 2 defined + 1 inline

        const html = `<p>${processed.trim()}</p>`;
        const result = renderFootnotes(html, footnotes);

        expect(result).toContain('First defined footnote.');
        expect(result).toContain('This is inline');
        expect(result).toContain('Second defined footnote.');
        // All three should be numbered
        expect(result).toContain('title="Footnote 1">1</a>');
        expect(result).toContain('title="Footnote 2">2</a>');
        expect(result).toContain('title="Footnote 3">3</a>');
    });

    test('unreferenced definitions do not appear in output', () => {
        const markdown = `Text without any references.

[^unused]: This should not appear.`;

        const { body, footnotes } = extractFootnoteDefinitions(markdown);
        expect(footnotes.size).toBe(1);

        const html = `<p>${body.trim()}</p>`;
        const result = renderFootnotes(html, footnotes);

        // No footnotes section since nothing was referenced
        expect(result).not.toContain('class="footnotes-section"');
        expect(result).not.toContain('This should not appear.');
    });
});

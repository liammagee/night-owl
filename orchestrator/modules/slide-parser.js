// Shared slide boundaries for rendering, navigation, notes, and source edits.
(function (root) {
    const isSeparator = line => /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|(?:-[ \t]*){3,})\r?$/.test(line);

    function parseDocument(markdown) {
        markdown = String(markdown || '');
        const lines = markdown.split('\n');
        const slides = [];
        const separatorLines = [];
        const protectedLines = new Set();
        let start = 0;
        let inComment = false;
        let fence = null;
        let inlineEnd = null;
        let preamble = '';

        // A leading separator is metadata only when a closing delimiter and a
        // YAML key are present. Keep it outside slides so reordering cannot move it.
        if ((lines[0] || '').replace(/^\uFEFF/, '').trim() === '---') {
            for (let index = 1; index < lines.length; index++) {
                if (!/^(?:---|\.\.\.)[ \t]*\r?$/.test(lines[index])) continue;
                if (lines.slice(1, index).some(line => /^[A-Za-z0-9_-]+[ \t]*:/.test(line))) {
                    start = index + 1;
                    preamble = lines.slice(0, start).join('\n') + (start < lines.length ? '\n' : '');
                }
                break;
            }
        }

        // Only matched backtick runs are code spans. An unfinished backtick must
        // not hide a real HTML comment while the user is typing.
        function findInlineEnd(lineIndex, offset, length) {
            for (let index = lineIndex; index < lines.length; index++) {
                const line = lines[index];
                if (index > lineIndex && (!line.trim() || isSeparator(line) || /^ {0,3}(`{3,}|~{3,})/.test(line))) break;
                const runs = /`+/g;
                runs.lastIndex = index === lineIndex ? offset : 0;
                let match;
                while ((match = runs.exec(line))) {
                    if (match[0].length === length) return { line: index, offset: runs.lastIndex };
                }
            }
            return null;
        }

        const append = (end) => {
            const content = lines.slice(start, end).join('\n');
            if (content.trim()) slides.push({ content, startLine: start + 1 });
        };

        lines.forEach((line, index) => {
            if (index < start) {
                protectedLines.add(index + 1);
                return;
            }
            if (fence || inComment || inlineEnd) protectedLines.add(index + 1);
            if (fence) {
                const closing = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*\r?$/);
                if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length) {
                    fence = null;
                }
                return;
            }

            if (!inComment && !inlineEnd) {
                const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
                if (opening && (opening[1][0] !== '`' || !opening[2].includes('`'))) {
                    fence = opening[1];
                    protectedLines.add(index + 1);
                    return;
                }
                if (isSeparator(line)) {
                    separatorLines.push(index + 1);
                    append(index);
                    start = index + 1;
                    return;
                }
            }

            let offset = 0;
            if (inlineEnd) {
                if (index < inlineEnd.line) return;
                offset = inlineEnd.offset;
                inlineEnd = null;
            }
            // Ignore comment delimiters inside inline code as well as fences.
            while (offset < line.length) {
                const token = inComment ? '-->' : '<!--';
                const next = line.indexOf(token, offset);
                if (!inComment) {
                    const backtick = line.indexOf('`', offset);
                    if (backtick !== -1 && (next === -1 || backtick < next)) {
                        const length = line.slice(backtick).match(/^`+/)[0].length;
                        const escapeLength = line.slice(0, backtick).match(/\\*$/)[0].length;
                        if (escapeLength % 2) {
                            offset = backtick + length;
                            continue;
                        }
                        const end = findInlineEnd(index, backtick + length, length);
                        if (end && end.line > index) {
                            protectedLines.add(index + 1);
                            inlineEnd = end;
                            return;
                        }
                        offset = end ? end.offset : backtick + length;
                        continue;
                    }
                }
                if (next === -1) break;
                protectedLines.add(index + 1);
                inComment = !inComment;
                offset = next + token.length;
            }
        });
        append(lines.length);
        return { preamble, slides, separatorLines, protectedLines: [...protectedLines] };
    }

    function parse(markdown) {
        return parseDocument(markdown).slides;
    }

    function join(markdown, slideContents) {
        const { preamble } = parseDocument(markdown);
        const content = slideContents.join('\n\n---\n\n');
        return preamble + (preamble && content && !preamble.endsWith('\n') ? '\n' : '') + content;
    }

    function split(markdown) {
        return parse(markdown).map(slide => slide.content);
    }

    function indexAtLine(markdown, lineNumber) {
        const slides = parse(markdown);
        let index = 0;
        for (let i = 1; i < slides.length; i++) {
            if (slides[i].startLine > lineNumber) break;
            index = i;
        }
        return index;
    }

    const api = { parse, parseDocument, split, join, indexAtLine };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.NightOwlSlides = api;
})(typeof window !== 'undefined' ? window : null);

const fs = require('fs');
const path = require('path');

function findDuplicateTopLevelFunctions(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const seen = new Map();
  const duplicates = [];

  source.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (!match) return;

    const name = match[1];
    const lineNumber = index + 1;
    if (seen.has(name)) {
      duplicates.push({
        name,
        firstLine: seen.get(name),
        duplicateLine: lineNumber
      });
      return;
    }
    seen.set(name, lineNumber);
  });

  return duplicates;
}

describe('Code quality guardrails', () => {
  test('renderer has no duplicate top-level function declarations', () => {
    const rendererPath = path.join(__dirname, '../../../orchestrator/renderer.js');
    const duplicates = findDuplicateTopLevelFunctions(rendererPath);

    expect(duplicates).toEqual([]);
  });

  test('file tree rendering batches DOM writes and hydrates tags off the initial paint', () => {
    const rendererPath = path.join(__dirname, '../../../orchestrator/renderer.js');
    const source = fs.readFileSync(rendererPath, 'utf8');

    expect(source).toContain('function renderFileTreeNodes');
    expect(source).toContain('document.createDocumentFragment');
    expect(source).toContain('fileTreeView.replaceChildren(fragment)');
    expect(source).toContain('scheduleFileTreeTagHydration(fileTree)');
    expect(source).not.toContain('await preProcessMarkdownTags(fileTree)');
  });

  test('preview render path does not synchronously wait for bibliography refresh', () => {
    const rendererPath = path.join(__dirname, '../../../orchestrator/renderer.js');
    const source = fs.readFileSync(rendererPath, 'utf8');

    expect(source).toContain('scheduleBibliographyRefresh(window.currentFilePath, markdownContent)');
    expect(source).not.toContain('await refreshBibliographyFromContent(window.currentFilePath, markdownContent)');
  });
});

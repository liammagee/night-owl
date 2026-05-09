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
});

'use strict';

/** Plan edits against original lines, applying only the matches returned by search. */
function planReplacements(content, query, replacement, selected, options = {}) {
  const source = options.useRegex ? query
    : `${options.wholeWord ? '\\b' : ''}${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${options.wholeWord ? '\\b' : ''}`;
  const flags = options.caseSensitive ? 'gm' : 'gim';
  const expression = new RegExp(source, flags);
  const lines = content.split('\n');
  const groups = new Map();
  for (const result of selected) {
    if (!Number.isInteger(result.line) || !Number.isInteger(result.column) || result.line < 1 || result.column < 1) {
      throw new Error('Invalid search result position');
    }
    if (!groups.has(result.line)) groups.set(result.line, new Map());
    groups.get(result.line).set(result.column, result);
  }
  let count = 0;
  const results = [];
  for (const [lineNumber, positions] of groups) {
    const before = lines[lineNumber - 1];
    if (typeof before !== 'string') throw new Error('Search results are stale; search again');
    for (const result of positions.values()) {
      if (typeof result.text === 'string' && result.text !== before.trim()) {
        throw new Error('Search results are stale; search again');
      }
    }
    expression.lastIndex = 0;
    const matches = [];
    for (const match of before.matchAll(expression)) {
      if (positions.has(match.index + 1)) matches.push(match);
      if (matches.length === positions.size) break;
    }
    if (matches.length !== positions.size || matches.some(match => positions.get(match.index + 1).match !== match[0])) {
      throw new Error('Search results are stale; search again');
    }
    let after = before;
    // Expand captures using the native replacement rules against the ORIGINAL
    // line. Sticky matching preserves lookarounds, anchors, and prefix/suffix tokens.
    for (const match of matches.reverse()) {
      const exact = new RegExp(source, flags.replace('g', 'y'));
      exact.lastIndex = match.index;
      const replaced = before.replace(exact, options.useRegex ? replacement : () => replacement);
      const suffixLength = before.length - match.index - match[0].length;
      const inserted = replaced.slice(match.index, replaced.length - suffixLength);
      after = after.slice(0, match.index) + inserted + after.slice(match.index + match[0].length);
    }
    count += matches.length;
    lines[lineNumber - 1] = after;
    results.push({ line: lineNumber, before, after, originalLine: before, replacedLine: after, count: matches.length });
  }
  return { content: lines.join('\n'), count, results };
}

module.exports = { planReplacements };

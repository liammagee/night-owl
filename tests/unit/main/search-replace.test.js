const { planReplacements } = require('../../../services/searchReplace');
const hit = (column, match, text = 'cat cat') => ({ line: 1, column, match, text });

describe('replacement planning', () => {
  test('only replaces selected columns, even when search results are capped', () => {
    expect(planReplacements('cat cat', 'cat', 'dog', [hit(1, 'cat')]).content).toBe('dog cat');
  });
  test('deduplicates positions and never searches its own output', () => {
    const result = planReplacements('cat cat', 'cat', 'catcat', [hit(1, 'cat'), hit(1, 'cat'), hit(5, 'cat')]);
    expect(result).toMatchObject({ content: 'catcat catcat', count: 2 });
  });
  test('literal replacements preserve dollar signs', () => {
    expect(planReplacements('cat cat', 'cat', '$&', [hit(1, 'cat')]).content).toBe('$& cat');
  });
  test('regex replacements preserve captures and lookaround context', () => {
    expect(planReplacements('cat cat', '(?<=c)(at)', '$1s', [hit(2, 'at')], { useRegex: true }).content).toBe('cats cat');
  });
  test('regex replacements preserve native prefix/suffix expansion', () => {
    expect(planReplacements('cat cat', 'cat', "$`-$&-$'", [hit(5, 'cat')], { useRegex: true }).content).toBe('cat cat -cat-');
  });
  test('zero-width matches are bounded and applied once', () => {
    expect(planReplacements('cat cat', '(?=cat)', 'x', [hit(1, ''), hit(5, '')], { useRegex: true }).content).toBe('xcat xcat');
  });
  test('rejects stale positions', () => {
    expect(() => planReplacements('cat cat', 'cat', 'dog', [hit(2, 'cat')])).toThrow('stale');
  });
});

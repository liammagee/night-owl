const path = require('path');
const {
  isPathInsideRoot,
  resolvePathWithinRoots,
  validatePathSegment
} = require('../../../ipc/pathGuards');

describe('IPC path guards', () => {
  const workspaceRoot = path.join(path.sep, 'tmp', 'nightowl-workspace');
  const siblingRoot = path.join(path.sep, 'tmp', 'other-workspace');

  test('allows absolute and relative paths inside an allowed root', () => {
    const absoluteResult = resolvePathWithinRoots(
      path.join(workspaceRoot, 'notes', 'draft.md'),
      [workspaceRoot]
    );
    const relativeResult = resolvePathWithinRoots('notes/draft.md', [workspaceRoot], {
      baseDirectory: workspaceRoot
    });

    expect(absoluteResult).toEqual({
      success: true,
      path: path.join(workspaceRoot, 'notes', 'draft.md')
    });
    expect(relativeResult).toEqual(absoluteResult);
    expect(isPathInsideRoot(absoluteResult.path, workspaceRoot)).toBe(true);
  });

  test('blocks traversal and absolute paths outside workspace roots', () => {
    const traversalResult = resolvePathWithinRoots('../outside.md', [workspaceRoot], {
      baseDirectory: workspaceRoot
    });
    const absoluteResult = resolvePathWithinRoots(
      path.join(siblingRoot, 'outside.md'),
      [workspaceRoot]
    );

    expect(traversalResult.success).toBe(false);
    expect(traversalResult.error).toContain('must stay inside a workspace folder');
    expect(absoluteResult.success).toBe(false);
    expect(absoluteResult.error).toContain('must stay inside a workspace folder');
  });

  test('validates path segments before joining them into write targets', () => {
    expect(validatePathSegment('draft.md')).toEqual({ success: true, value: 'draft.md' });
    expect(validatePathSegment('../draft.md').success).toBe(false);
    expect(validatePathSegment('folder/draft.md').success).toBe(false);
    expect(validatePathSegment('..').success).toBe(false);
    expect(validatePathSegment('bad\0name').success).toBe(false);
  });
});

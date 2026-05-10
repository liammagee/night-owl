const path = require('path');

function normalizeRoot(rootPath) {
  if (typeof rootPath !== 'string' || rootPath.trim() === '') return null;
  return path.resolve(rootPath);
}

function isPathInsideRoot(candidatePath, rootPath) {
  const resolvedCandidate = path.resolve(candidatePath);
  const resolvedRoot = normalizeRoot(rootPath);
  if (!resolvedRoot) return false;

  const relativePath = path.relative(resolvedRoot, resolvedCandidate);
  return relativePath === '' || (
    relativePath &&
    !relativePath.startsWith('..') &&
    !path.isAbsolute(relativePath)
  );
}

function resolvePathWithinRoots(inputPath, rootPaths, options = {}) {
  const label = options.label || 'Path';
  const roots = (Array.isArray(rootPaths) ? rootPaths : [])
    .map(normalizeRoot)
    .filter(Boolean);

  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    return { success: false, error: `${label} is required` };
  }

  if (inputPath.includes('\0')) {
    return { success: false, error: `${label} contains invalid characters` };
  }

  if (roots.length === 0) {
    return { success: false, error: 'No workspace root is available for this operation' };
  }

  const baseDirectory = normalizeRoot(options.baseDirectory) || roots[0];
  const resolvedPath = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(baseDirectory, inputPath);

  if (!roots.some((rootPath) => isPathInsideRoot(resolvedPath, rootPath))) {
    return {
      success: false,
      error: `${label} must stay inside a workspace folder`,
      path: resolvedPath
    };
  }

  return { success: true, path: resolvedPath };
}

function validatePathSegment(segment, label = 'Name') {
  if (typeof segment !== 'string' || segment.trim() === '') {
    return { success: false, error: `${label} is required` };
  }

  if (segment.includes('\0')) {
    return { success: false, error: `${label} contains invalid characters` };
  }

  const trimmed = segment.trim();
  if (
    trimmed === '.' ||
    trimmed === '..' ||
    trimmed.includes('/') ||
    trimmed.includes('\\')
  ) {
    return { success: false, error: `${label} cannot contain path traversal or separators` };
  }

  return { success: true, value: trimmed };
}

module.exports = {
  isPathInsideRoot,
  resolvePathWithinRoots,
  validatePathSegment
};

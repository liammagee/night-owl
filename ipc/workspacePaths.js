const path = require('path');

function normalizeWorkspacePath(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  return path.resolve(trimmed);
}

function comparablePath(value) {
  const normalized = normalizeWorkspacePath(value);
  if (!normalized) return null;

  return process.platform === 'darwin' || process.platform === 'win32'
    ? normalized.toLowerCase()
    : normalized;
}

function pathsEqual(a, b) {
  const left = comparablePath(a);
  const right = comparablePath(b);
  return Boolean(left && right && left === right);
}

function pathContains(parentPath, childPath) {
  const parent = comparablePath(parentPath);
  const child = comparablePath(childPath);

  if (!parent || !child) return false;
  if (parent === child) return true;

  const relativePath = path.relative(parent, child);
  return Boolean(
    relativePath &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

function findWorkspaceOverlap(candidatePath, roots = []) {
  const normalizedCandidate = normalizeWorkspacePath(candidatePath);
  if (!normalizedCandidate) return null;

  for (const root of roots) {
    const rootPath = typeof root === 'string' ? root : root?.path;
    const normalizedRoot = normalizeWorkspacePath(rootPath);
    if (!normalizedRoot) continue;
    const rootInfo = typeof root === 'string'
      ? { path: normalizedRoot }
      : { ...root, path: normalizedRoot };

    if (pathsEqual(normalizedCandidate, normalizedRoot)) {
      return { type: 'same', root: rootInfo };
    }

    if (pathContains(normalizedRoot, normalizedCandidate)) {
      return { type: 'inside', root: rootInfo };
    }

    if (pathContains(normalizedCandidate, normalizedRoot)) {
      return { type: 'contains', root: rootInfo };
    }
  }

  return null;
}

function describeWorkspaceOverlap(overlap) {
  const label = overlap?.root?.label || 'another workspace folder';

  switch (overlap?.type) {
    case 'same':
      return `This folder is already in the workspace as ${label}`;
    case 'inside':
      return `This folder is already covered by ${label}`;
    case 'contains':
      return `This folder contains ${label}; remove the existing folder first`;
    default:
      return 'This folder overlaps an existing workspace folder';
  }
}

function sanitizeWorkspaceFolders(primaryFolder, workspaceFolders = []) {
  const inputFolders = Array.isArray(workspaceFolders) ? workspaceFolders : [];
  const normalizedPrimary = normalizeWorkspacePath(primaryFolder);
  const roots = normalizedPrimary
    ? [{ path: normalizedPrimary, label: 'the primary working directory', kind: 'primary' }]
    : [];
  const sanitized = [];
  const removed = [];

  for (const folderPath of inputFolders) {
    const normalizedFolder = normalizeWorkspacePath(folderPath);
    if (!normalizedFolder) {
      removed.push({ path: folderPath, reason: 'invalid' });
      continue;
    }

    const overlap = findWorkspaceOverlap(normalizedFolder, roots);
    if (overlap) {
      removed.push({
        path: folderPath,
        normalizedPath: normalizedFolder,
        reason: overlap.type,
        overlappingPath: overlap.root.path
      });
      continue;
    }

    sanitized.push(normalizedFolder);
    roots.push({
      path: normalizedFolder,
      label: normalizedFolder,
      kind: 'workspace'
    });
  }

  const changed = !Array.isArray(workspaceFolders) ||
    sanitized.length !== inputFolders.length ||
    sanitized.some((folderPath, index) => folderPath !== inputFolders[index]);

  return { workspaceFolders: sanitized, removed, changed };
}

module.exports = {
  normalizeWorkspacePath,
  pathsEqual,
  pathContains,
  findWorkspaceOverlap,
  describeWorkspaceOverlap,
  sanitizeWorkspaceFolders
};

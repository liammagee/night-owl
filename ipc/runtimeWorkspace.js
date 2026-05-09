const fs = require('fs');

function pathExists(folderPath) {
  try {
    return !!folderPath && fs.existsSync(folderPath);
  } catch (_error) {
    return false;
  }
}

function readLiveWorkingDirectory(dependencies = {}) {
  if (typeof dependencies.getCurrentWorkingDirectory === 'function') {
    return dependencies.getCurrentWorkingDirectory();
  }
  return dependencies.currentWorkingDirectory;
}

function resolveRuntimeWorkingDirectory(dependencies = {}, options = {}) {
  const appSettings = dependencies.appSettings || {};
  const saved = appSettings.workingDirectory;
  const live = readLiveWorkingDirectory(dependencies);
  const fallback = options.fallback || process.cwd();

  if (pathExists(saved)) return saved;
  if (pathExists(live)) return live;
  return live || saved || fallback;
}

function createRuntimeWorkspaceResolver(dependencies = {}, options = {}) {
  return () => resolveRuntimeWorkingDirectory(dependencies, options);
}

module.exports = {
  createRuntimeWorkspaceResolver,
  pathExists,
  resolveRuntimeWorkingDirectory
};

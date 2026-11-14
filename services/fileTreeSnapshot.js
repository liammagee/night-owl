'use strict';
const fs = require('fs');
const path = require('path');

// Cache only directory names/types. Never read file contents or follow symlinks.
// Successful native watches need no polling scan; unsupported watches expire.
function createFileTreeSnapshot(options = {}) {
  const fsApi = options.fs || fs.promises;
  const watch = options.watch || fs.watch;
  const now = options.now || Date.now;
  const cache = new Map();
  const watchers = new Map();
  let reads = 0;
  function dropWatch(dir) {
    watchers.get(dir)?.close(); watchers.delete(dir);
  }
  async function entries(dir) {
    const cached = cache.get(dir);
    if (cached && (watchers.has(dir) || now() - cached.at < 4000)) return cached.promise;
    if (!watchers.has(dir)) {
      try {
        const watcher = watch(dir, { persistent: false }, event => {
          cache.delete(dir);
          // A directory may have been replaced; reacquire its watch on next read.
          if (event === 'rename') dropWatch(dir);
        });
        watcher.on?.('error', () => { cache.delete(dir); dropWatch(dir); });
        watchers.set(dir, watcher);
      } catch (_) { /* Expiring cache provides a bounded fallback. */ }
    }
    reads++;
    const promise = fsApi.readdir(dir, { withFileTypes: true });
    const entry = { promise, at: now() }; cache.set(dir, entry);
    try { return await promise; } catch (error) {
      if (cache.get(dir) === entry) cache.delete(dir);
      throw error;
    }
  }
  async function build(root, options = {}) {
    const expanded = new Set((options.expandedPaths || []).map(p => path.resolve(p)));
    const recursive = options.recursive === true;
    const visible = new Set();
    let remaining = recursive ? 250000 : 50000;
    async function visit(dir, depth) {
      const node = { name: path.basename(dir) || 'Root', type: 'directory', path: dir, children: [] };
      if (depth > 0 && !recursive && !expanded.has(dir)) return { ...node, childrenLoaded: false };
      if (depth > 100 || remaining <= 0) return { ...node, childrenLoaded: false, truncated: true };
      visible.add(dir);
      try {
        // A one-off deep search must not create a native watcher for every
        // directory (or race a shallow refresh that closes those watchers).
        if (recursive) reads++;
        const listing = recursive
          ? await fsApi.readdir(dir, { withFileTypes: true })
          : await entries(dir);
        for (const entry of listing) {
          if (remaining-- <= 0) { node.truncated = true; break; }
          if (entry.isSymbolicLink() || options.shouldHide?.(entry.name)) continue;
          const filePath = path.join(dir, entry.name);
          if (entry.isDirectory()) node.children.push(await visit(filePath, depth + 1));
          else if (entry.isFile()) node.children.push({ name: entry.name, type: 'file', path: filePath });
        }
        node.children.sort((a,b) => (a.type === b.type ? 0 : a.type === 'directory' ? -1 : 1) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
        node.childrenLoaded = true;
      } catch (error) { node.type = 'error'; node.error = error.message; }
      return node;
    }
    const tree = await visit(path.resolve(root), 0);
    return { tree, visible };
  }
  function retain(directories) {
    for (const dir of cache.keys()) if (!directories.has(dir)) cache.delete(dir);
    for (const dir of watchers.keys()) if (!directories.has(dir)) dropWatch(dir);
  }
  function clear() { cache.clear(); }
  function dispose() { retain(new Set()); }
  return { build, retain, clear, dispose, getDiagnostics: () => ({ cachedDirectories: cache.size, directoryWatchers: watchers.size, directoryReads: reads }) };
}
module.exports = { createFileTreeSnapshot };
